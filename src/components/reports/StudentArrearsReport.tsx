import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Download,
  Search,
  AlertTriangle,
  Users,
  DollarSign,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Printer,
  RefreshCw,
  Clock,
  Eye,
  FileSpreadsheet,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LAUNDRY_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx-js-style";

// Types
interface StudentArrear {
  student_id: string;
  student_name: string;
  student_class: string;
  student_nik: string;
  parent_name: string | null;
  parent_phone: string | null;
  total_unpaid_orders: number;
  total_unpaid_amount: number;
  oldest_order_date: string;
  orders: UnpaidOrder[];
}

interface UnpaidOrder {
  id: string;
  laundry_date: string;
  category: string;
  weight_kg: number | null;
  item_count: number | null;
  total_price: number;
  status: string;
  partner_name: string;
  created_at: string;
}

const PAGE_SIZE = 20;

// Format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

// Format date
const formatDate = (date: string) => {
  return new Date(date + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export function StudentArrearsReport() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [arrears, setArrears] = useState<StudentArrear[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"amount" | "date" | "count">("amount");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();

  // Detail modal
  const [selectedStudent, setSelectedStudent] = useState<StudentArrear | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Summary
  const [summary, setSummary] = useState({
    totalStudents: 0,
    totalOrders: 0,
    totalAmount: 0,
    averagePerStudent: 0,
  });

  // Available classes
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);

  const fetchArrears = async () => {
    setLoading(true);
    try {
      // Get all unpaid orders with student info
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = supabase
        .from("laundry_orders")
        .select(`
          id,
          laundry_date,
          category,
          weight_kg,
          item_count,
          total_price,
          status,
          created_at,
          student_id,
          students (id, name, class, nik, parent_id),
          laundry_partners (name)
        `)
        .not("status", "in", '("DIBAYAR","SELESAI","DITOLAK_MITRA")')
        .order("laundry_date", { ascending: false });

      // Date filter
      if (customStartDate) {
        query = query.gte("laundry_date", format(customStartDate, "yyyy-MM-dd"));
      }
      if (customEndDate) {
        query = query.lte("laundry_date", format(customEndDate, "yyyy-MM-dd"));
      }

      const { data, error } = await query;

      if (error) throw error;

      // Get all parent_ids from students
      const parentIds = [...new Set(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data || []).map((order: any) => order.students?.parent_id).filter(Boolean)
      )];

      // Fetch parent profiles
      let parentProfiles: Record<string, { full_name: string; phone: string | null }> = {};
      if (parentIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, phone")
          .in("user_id", parentIds);
        
        if (profiles) {
          parentProfiles = profiles.reduce((acc, p) => {
            acc[p.user_id] = { full_name: p.full_name, phone: p.phone };
            return acc;
          }, {} as Record<string, { full_name: string; phone: string | null }>);
        }
      }

      if (error) throw error;

      // Group by student
      const studentMap = new Map<string, StudentArrear>();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data || []).forEach((order: any) => {
        if (!order.students) return;

        const studentId = order.student_id;
        const studentName = order.students.name || "-";
        const studentClass = order.students.class || "-";
        const studentNik = order.students.nik || "-";
        const parentId = order.students.parent_id;
        const parentData = parentId ? parentProfiles[parentId] : null;

        // Filter by class
        if (filterClass !== "all" && studentClass !== filterClass) return;

        // Filter by search
        if (searchQuery) {
          const lowerQuery = searchQuery.toLowerCase();
          if (
            !studentName.toLowerCase().includes(lowerQuery) &&
            !studentNik.toLowerCase().includes(lowerQuery) &&
            !studentClass.toLowerCase().includes(lowerQuery)
          ) {
            return;
          }
        }

        const unpaidOrder: UnpaidOrder = {
          id: order.id,
          laundry_date: order.laundry_date,
          category: order.category,
          weight_kg: order.weight_kg,
          item_count: order.item_count,
          total_price: order.total_price || 0,
          status: order.status,
          partner_name: order.laundry_partners?.name || "-",
          created_at: order.created_at,
        };

        if (!studentMap.has(studentId)) {
          studentMap.set(studentId, {
            student_id: studentId,
            student_name: studentName,
            student_class: studentClass,
            student_nik: studentNik,
            parent_name: parentData?.full_name || null,
            parent_phone: parentData?.phone || null,
            total_unpaid_orders: 0,
            total_unpaid_amount: 0,
            oldest_order_date: order.laundry_date,
            orders: [],
          });
        }

        const student = studentMap.get(studentId)!;
        student.total_unpaid_orders++;
        student.total_unpaid_amount += order.total_price || 0;
        student.orders.push(unpaidOrder);

        // Track oldest order
        if (order.laundry_date < student.oldest_order_date) {
          student.oldest_order_date = order.laundry_date;
        }
      });

      // Convert to array and sort
      let arrearsArray = Array.from(studentMap.values());

      switch (sortBy) {
        case "amount":
          arrearsArray.sort((a, b) => b.total_unpaid_amount - a.total_unpaid_amount);
          break;
        case "date":
          arrearsArray.sort((a, b) => a.oldest_order_date.localeCompare(b.oldest_order_date));
          break;
        case "count":
          arrearsArray.sort((a, b) => b.total_unpaid_orders - a.total_unpaid_orders);
          break;
      }

      // Calculate summary
      const totalStudents = arrearsArray.length;
      const totalOrders = arrearsArray.reduce((sum, s) => sum + s.total_unpaid_orders, 0);
      const totalAmount = arrearsArray.reduce((sum, s) => sum + s.total_unpaid_amount, 0);

      setSummary({
        totalStudents,
        totalOrders,
        totalAmount,
        averagePerStudent: totalStudents > 0 ? Math.round(totalAmount / totalStudents) : 0,
      });

      // Extract unique classes
      const classes = [...new Set(arrearsArray.map((s) => s.student_class))].sort();
      setAvailableClasses(classes);

      setTotalCount(arrearsArray.length);
      
      // Paginate
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE;
      setArrears(arrearsArray.slice(from, to));
    } catch (error) {
      console.error("Error fetching arrears:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memuat data tunggakan",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArrears();
  }, [currentPage, searchQuery, filterClass, sortBy, customStartDate, customEndDate]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Helper: normalize phone number to +62 format
  const normalizePhoneNumber = (phone: string | null): string => {
    if (!phone) return "";
    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.startsWith("0")) {
      cleaned = "62" + cleaned.substring(1);
    }
    if (!cleaned.startsWith("62")) {
      cleaned = "62" + cleaned;
    }
    return "+" + cleaned;
  };

  // Helper: get category label in Indonesian
  const getCategoryLabel = (category: string): string => {
    return LAUNDRY_CATEGORIES[category as keyof typeof LAUNDRY_CATEGORIES]?.label || category;
  };

  // Export contact list for WhatsApp import
  const handleExportContactExcel = () => {
    // Filter students who have parent phone
    const studentsWithParent = arrears.filter((s) => s.parent_phone);
    
    if (studentsWithParent.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Tidak ada data orang tua untuk diekspor",
      });
      return;
    }

    // Show warning if some students don't have parent data
    if (studentsWithParent.length < arrears.length) {
      toast({
        variant: "default",
        title: "Peringatan",
        description: `${arrears.length - studentsWithParent.length} siswa tidak memiliki data orang tua dan tidak ikut diexport.`,
      });
    }

    // Create data rows (no header)
    const data = studentsWithParent.map((s) => [
      `${s.student_name}#${s.student_nik}`,
      normalizePhoneNumber(s.parent_phone),
    ]);

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    ws["!cols"] = [{ wch: 40 }, { wch: 20 }];

    XLSX.utils.book_append_sheet(wb, ws, "Kontak");
    XLSX.writeFile(wb, `excel_import_contact_${format(new Date(), "yyyyMMdd")}.xlsx`);

    toast({
      title: "Berhasil",
      description: `File kontak berhasil diunduh (${studentsWithParent.length} kontak)`,
    });
  };

  // Export personalized messages for broadcast
  const handleExportPersonalizedMessages = () => {
    // Filter students who have parent phone
    const studentsWithParent = arrears.filter((s) => s.parent_phone);
    
    if (studentsWithParent.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Tidak ada data orang tua untuk diekspor",
      });
      return;
    }

    // Show warning if some students don't have parent data
    if (studentsWithParent.length < arrears.length) {
      toast({
        variant: "default",
        title: "Peringatan",
        description: `${arrears.length - studentsWithParent.length} siswa tidak memiliki data orang tua dan tidak ikut diexport.`,
      });
    }

    // Get app URL for payment link
    const appUrl = window.location.origin;
    const paymentUrl = `${appUrl}/bills`;

    // Create header row with yellow background
    const headerStyle = {
      fill: { fgColor: { rgb: "FFFF00" } },
      font: { bold: true },
      alignment: { horizontal: "center" as const },
    };

    // Create data rows
    const data = studentsWithParent.map((s, index) => {
      // Build order details string
      const orderDetails = s.orders
        .map((o) => `${formatDate(o.laundry_date)} – ${getCategoryLabel(o.category)} – ${formatCurrency(o.total_price)}`)
        .join(",\n");

      // Build personalized message with payment link
      const message = `Assalamualaikum warahmatullahi wabarakatuh.

Bapak/Ibu yang kami hormati,

Kami ingin menyampaikan informasi bahwa putra/putri Bapak/Ibu ${s.student_name} kelas ${s.student_class} saat ini masih memiliki tunggakan uang laundry sebesar ${formatCurrency(s.total_unpaid_amount)} dari ${s.total_unpaid_orders} transaksi.

Rincian tunggakan:
${orderDetails}.

Untuk kemudahan pembayaran, Bapak/Ibu dapat melakukan pembayaran secara online melalui link berikut:
${paymentUrl}

Kami mohon kesediaan Bapak/Ibu untuk melakukan pelunasan pada kesempatan terdekat. Apabila sudah melakukan pembayaran atau terdapat hal yang ingin dikonfirmasi, silakan menghubungi kami.

Atas perhatian dan kerja sama Bapak/Ibu, kami ucapkan terima kasih.

Wassalamualaikum warahmatullahi wabarakatuh.`;

      return [
        index + 1,
        `${s.student_name}#${s.student_nik}`,
        normalizePhoneNumber(s.parent_phone),
        message,
      ];
    });

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["SI", "Contact Name", "Phone No", "Message"],
      ...data,
    ]);

    // Apply header styling
    ["A1", "B1", "C1", "D1"].forEach((cell) => {
      if (ws[cell]) {
        ws[cell].s = headerStyle;
      }
    });

    // Set column widths
    ws["!cols"] = [{ wch: 5 }, { wch: 40 }, { wch: 20 }, { wch: 100 }];

    // Set row heights for message column
    ws["!rows"] = [{ hpt: 20 }]; // Header row
    data.forEach((_, index) => {
      if (!ws["!rows"]) ws["!rows"] = [];
      ws["!rows"][index + 1] = { hpt: 150 }; // Data rows with taller height for messages
    });

    XLSX.utils.book_append_sheet(wb, ws, "Pesan Personal");
    XLSX.writeFile(wb, `personalized_messages_${format(new Date(), "yyyyMMdd")}.xlsx`);

    toast({
      title: "Berhasil",
      description: `File pesan personal berhasil diunduh (${studentsWithParent.length} pesan)`,
    });
  };

  const handleExportCSV = () => {
    if (arrears.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Tidak ada data untuk diekspor",
      });
      return;
    }

    const headers = ["NIK", "Nama Siswa", "Kelas", "Jumlah Order", "Total Tunggakan", "Tgl Order Tertua"];
    const rows = arrears.map((s) => [
      s.student_nik,
      s.student_name,
      s.student_class,
      s.total_unpaid_orders,
      s.total_unpaid_amount,
      formatDate(s.oldest_order_date),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `laporan-tunggakan-siswa-${format(new Date(), "yyyyMMdd")}.csv`;
    link.click();
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Tidak dapat membuka jendela cetak. Periksa pop-up blocker.",
      });
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Laporan Tunggakan Siswa</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; font-size: 11px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 15px; }
          .header h1 { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
          .header p { font-size: 10px; color: #666; }
          .summary { display: flex; gap: 20px; margin-bottom: 20px; }
          .summary-item { flex: 1; text-align: center; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
          .summary-item h3 { font-size: 18px; margin-bottom: 5px; }
          .summary-item p { font-size: 10px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f5f5f5; font-weight: bold; }
          .text-right { text-align: right; }
          .warning { color: #e65100; font-weight: bold; }
          .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #666; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LAPORAN TUNGGAKAN SISWA</h1>
          <p>Laundry At-Tauhid</p>
          <p>Dicetak: ${format(new Date(), "dd MMMM yyyy HH:mm", { locale: localeId })}</p>
        </div>
        
        <div class="summary">
          <div class="summary-item">
            <h3>${summary.totalStudents}</h3>
            <p>Total Siswa</p>
          </div>
          <div class="summary-item">
            <h3>${summary.totalOrders}</h3>
            <p>Total Order</p>
          </div>
          <div class="summary-item">
            <h3>${formatCurrency(summary.totalAmount)}</h3>
            <p>Total Tunggakan</p>
          </div>
          <div class="summary-item">
            <h3>${formatCurrency(summary.averagePerStudent)}</h3>
            <p>Rata-rata / Siswa</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>NIK</th>
              <th>Nama Siswa</th>
              <th>Kelas</th>
              <th class="text-right">Jml Order</th>
              <th class="text-right">Total Tunggakan</th>
              <th>Tgl Tertua</th>
            </tr>
          </thead>
          <tbody>
            ${arrears
              .map(
                (s, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${s.student_nik}</td>
                <td>${s.student_name}</td>
                <td>${s.student_class}</td>
                <td class="text-right">${s.total_unpaid_orders}</td>
                <td class="text-right warning">${formatCurrency(s.total_unpaid_amount)}</td>
                <td>${formatDate(s.oldest_order_date)}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="text-align: right; font-weight: bold;">TOTAL</td>
              <td class="text-right" style="font-weight: bold;">${summary.totalOrders}</td>
              <td class="text-right warning" style="font-weight: bold;">${formatCurrency(summary.totalAmount)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        
        <div class="footer">
          <p>Dokumen ini dicetak secara otomatis oleh sistem</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: "Draft",
      MENUNGGU_APPROVAL_MITRA: "Menunggu Approval",
      DISETUJUI_MITRA: "Disetujui Mitra",
      MENUNGGU_PEMBAYARAN: "Menunggu Pembayaran",
    };
    return labels[status] || status;
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Siswa Menunggak</CardTitle>
            <Users className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{summary.totalStudents}</div>
            <p className="text-xs text-muted-foreground">
              siswa dengan tagihan belum dibayar
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tunggakan</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(summary.totalAmount)}</div>
            <p className="text-xs text-muted-foreground">
              dari {summary.totalOrders} order belum dibayar
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rata-rata / Siswa</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.averagePerStudent)}</div>
            <p className="text-xs text-muted-foreground">
              rata-rata tunggakan per siswa
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Order per Siswa</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.totalStudents > 0 ? (summary.totalOrders / summary.totalStudents).toFixed(1) : 0}
            </div>
            <p className="text-xs text-muted-foreground">
              rata-rata order belum dibayar
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari NIK, nama, atau kelas..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(0);
                  }}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Class Filter */}
            <Select value={filterClass} onValueChange={(v) => { setFilterClass(v); setCurrentPage(0); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Semua Kelas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kelas</SelectItem>
                {availableClasses.map((cls) => (
                  <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort By */}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as "amount" | "date" | "count")}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Urutkan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="amount">Tunggakan Terbesar</SelectItem>
                <SelectItem value="count">Order Terbanyak</SelectItem>
                <SelectItem value="date">Terlama Menunggak</SelectItem>
              </SelectContent>
            </Select>

            {/* Date Range */}
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[120px] justify-start text-left font-normal",
                      !customStartDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarRange className="h-4 w-4 mr-2" />
                    {customStartDate ? format(customStartDate, "dd/MM/yy") : "Dari"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customStartDate}
                    onSelect={(d) => { setCustomStartDate(d); setCurrentPage(0); }}
                    disabled={(date) => (customEndDate ? date > customEndDate : false)}
                    initialFocus
                    locale={localeId}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground">-</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[120px] justify-start text-left font-normal",
                      !customEndDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarRange className="h-4 w-4 mr-2" />
                    {customEndDate ? format(customEndDate, "dd/MM/yy") : "Sampai"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customEndDate}
                    onSelect={(d) => { setCustomEndDate(d); setCurrentPage(0); }}
                    disabled={(date) => (customStartDate ? date < customStartDate : false)}
                    initialFocus
                    locale={localeId}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={fetchArrears} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" />
                Cetak
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-1" />
                CSV
              </Button>
              
              {/* Excel Export Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <FileSpreadsheet className="h-4 w-4 mr-1" />
                    Excel
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportContactExcel}>
                    <Users className="h-4 w-4 mr-2" />
                    Download Kontak WA
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPersonalizedMessages}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Download Pesan Personal
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Daftar Tunggakan Siswa ({totalCount})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : arrears.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Users className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Tidak ada tunggakan
              </h3>
              <p className="text-muted-foreground text-center">
                Semua siswa tidak memiliki tagihan yang belum dibayar
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NIK</TableHead>
                      <TableHead>Nama Siswa</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead className="text-center">Jml Order</TableHead>
                      <TableHead className="text-right">Total Tunggakan</TableHead>
                      <TableHead>Tgl Tertua</TableHead>
                      <TableHead className="text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {arrears.map((student) => (
                      <TableRow key={student.student_id}>
                        <TableCell className="font-mono text-sm">{student.student_nik}</TableCell>
                        <TableCell className="font-medium">{student.student_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{student.student_class}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{student.total_unpaid_orders}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-semibold text-red-600">
                            {formatCurrency(student.total_unpaid_amount)}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(student.oldest_order_date)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedStudent(student);
                              setShowDetailModal(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Detail
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Menampilkan {currentPage * PAGE_SIZE + 1}-
                    {Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} dari {totalCount} siswa
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => p - 1)}
                      disabled={currentPage === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      {currentPage + 1} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => p + 1)}
                      disabled={currentPage >= totalPages - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Detail Tunggakan - {selectedStudent?.student_name}
            </DialogTitle>
          </DialogHeader>

          {selectedStudent && (
            <div className="space-y-6">
              {/* Student Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">NIK</p>
                  <p className="font-semibold">{selectedStudent.student_nik}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Kelas</p>
                  <p className="font-semibold">{selectedStudent.student_class}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Jumlah Order</p>
                  <p className="font-semibold">{selectedStudent.total_unpaid_orders}</p>
                </div>
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20">
                  <p className="text-sm text-muted-foreground">Total Tunggakan</p>
                  <p className="font-semibold text-red-600">
                    {formatCurrency(selectedStudent.total_unpaid_amount)}
                  </p>
                </div>
              </div>

              {/* Orders List */}
              <div>
                <h4 className="font-semibold mb-3">Rincian Order</h4>
                <div className="overflow-x-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tgl Laundry</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead>Jumlah</TableHead>
                        <TableHead>Mitra</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedStudent.orders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell>{formatDate(order.laundry_date)}</TableCell>
                          <TableCell>
                            {LAUNDRY_CATEGORIES[order.category as keyof typeof LAUNDRY_CATEGORIES]?.label || order.category}
                          </TableCell>
                          <TableCell>
                            {order.category === "kiloan"
                              ? `${order.weight_kg} kg`
                              : `${order.item_count} pcs`}
                          </TableCell>
                          <TableCell>{order.partner_name}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(order.total_price)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                              <Clock className="h-3 w-3 mr-1" />
                              {getStatusLabel(order.status)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
