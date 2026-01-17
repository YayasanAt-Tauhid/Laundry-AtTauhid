import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
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
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  TrendingUp,
  Users,
  Package,
  DollarSign,
  Download,
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  PiggyBank,
  Calendar,
  Printer,
  Building2,
  FileText,
  ClipboardList,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LAUNDRY_CATEGORIES } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ReportData {
  totalOrders: number;
  totalRevenue: number;
  yayasanRevenue: number;
  vendorRevenue: number;
  ordersByCategory: Record<string, { count: number; revenue: number }>;
  ordersByClass: Record<string, { count: number; revenue: number }>;
  ordersByPartner: Record<string, { count: number; revenue: number }>;
}

interface WadiahData {
  totalBalance: number;
  totalUsed: number;
  totalTopUp: number;
  totalStudentsWithBalance: number;
  wadiahByClass: Record<
    string,
    { balance: number; used: number; topUp: number; students: number }
  >;
}

interface VendorShareData {
  partnerId: string;
  partnerName: string;
  totalOrders: number;
  totalRevenue: number;
  vendorShare: number;
  yayasanShare: number;
  orders: {
    id: string;
    laundry_date: string;
    category: string;
    weight_kg: number | null;
    item_count: number | null;
    total_price: number;
    vendor_share: number;
    yayasan_share: number;
    student_name: string;
    student_class: string;
  }[];
}

interface BillReportOrder {
  id: string;
  laundry_date: string;
  category: string;
  weight_kg: number | null;
  item_count: number | null;
  total_price: number;
  vendor_share: number;
  yayasan_share: number;
  status: string;
  student_nik: string;
  student_name: string;
  student_class: string;
  partner_name: string;
  partner_id: string;
}

interface BillReportData {
  totalOrders: number;
  totalAmount: number;
  totalVendorShare: number;
  totalYayasanShare: number;
  paidOrders: number;
  paidAmount: number;
  unpaidOrders: number;
  unpaidAmount: number;
  orders: BillReportOrder[];
}

interface Partner {
  id: string;
  name: string;
}

export default function Reports() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportData>({
    totalOrders: 0,
    totalRevenue: 0,
    yayasanRevenue: 0,
    vendorRevenue: 0,
    ordersByCategory: {},
    ordersByClass: {},
    ordersByPartner: {},
  });
  const [wadiahData, setWadiahData] = useState<WadiahData>({
    totalBalance: 0,
    totalUsed: 0,
    totalTopUp: 0,
    totalStudentsWithBalance: 0,
    wadiahByClass: {},
  });
  const [vendorShareData, setVendorShareData] = useState<VendorShareData[]>([]);
  const [period, setPeriod] = useState("all");
  const [dateFilterType, setDateFilterType] = useState<
    "laundry_date" | "paid_at"
  >("laundry_date");

  // Custom date range
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Vendor detail modal
  const [selectedVendor, setSelectedVendor] = useState<VendorShareData | null>(
    null,
  );
  const [showVendorDetail, setShowVendorDetail] = useState(false);

  // Bill report states
  const [billReportData, setBillReportData] = useState<BillReportData>({
    totalOrders: 0,
    totalAmount: 0,
    totalVendorShare: 0,
    totalYayasanShare: 0,
    paidOrders: 0,
    paidAmount: 0,
    unpaidOrders: 0,
    unpaidAmount: 0,
    orders: [],
  });
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("all");
  const [billStartDate, setBillStartDate] = useState("");
  const [billEndDate, setBillEndDate] = useState("");
  const [loadingBillReport, setLoadingBillReport] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");

  useEffect(() => {
    fetchPartners();
  }, []);

  useEffect(() => {
    fetchReportData();
    fetchWadiahData();
  }, [period, dateFilterType, useCustomRange, startDate, endDate]);

  useEffect(() => {
    if (activeTab === "bills") {
      fetchBillReport();
    }
  }, [activeTab, billStartDate, billEndDate, selectedPartnerId]);

  const fetchPartners = async () => {
    try {
      const { data, error } = await supabase
        .from("laundry_partners")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setPartners(data || []);
    } catch (error) {
      console.error("Error fetching partners:", error);
    }
  };

  const fetchBillReport = async () => {
    setLoadingBillReport(true);
    try {
      let query = supabase
        .from("laundry_orders")
        .select(
          `
          id,
          laundry_date,
          category,
          weight_kg,
          item_count,
          total_price,
          vendor_share,
          yayasan_share,
          status,
          students (nik, name, class),
          laundry_partners (id, name)
        `,
        )
        .not("status", "eq", "DITOLAK_MITRA");

      // Apply date filter
      if (billStartDate) {
        query = query.gte("laundry_date", billStartDate);
      }
      if (billEndDate) {
        query = query.lte("laundry_date", billEndDate);
      }

      // Apply partner filter
      if (selectedPartnerId !== "all") {
        query = query.eq("partner_id", selectedPartnerId);
      }

      query = query.order("laundry_date", { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orders: BillReportOrder[] = (data || []).map((order: any) => ({
        id: order.id,
        laundry_date: order.laundry_date,
        category: order.category,
        weight_kg: order.weight_kg,
        item_count: order.item_count,
        total_price: order.total_price || 0,
        vendor_share: order.vendor_share || 0,
        yayasan_share: order.yayasan_share || 0,
        status: order.status,
        student_nik: order.students?.nik || "-",
        student_name: order.students?.name || "-",
        student_class: order.students?.class || "-",
        partner_name: order.laundry_partners?.name || "-",
        partner_id: order.laundry_partners?.id || "",
      }));

      const paidStatuses = ["DIBAYAR", "SELESAI"];
      const paidOrders = orders.filter((o) => paidStatuses.includes(o.status));
      const unpaidOrders = orders.filter(
        (o) => !paidStatuses.includes(o.status),
      );

      setBillReportData({
        totalOrders: orders.length,
        totalAmount: orders.reduce((sum, o) => sum + o.total_price, 0),
        totalVendorShare: orders.reduce((sum, o) => sum + o.vendor_share, 0),
        totalYayasanShare: orders.reduce((sum, o) => sum + o.yayasan_share, 0),
        paidOrders: paidOrders.length,
        paidAmount: paidOrders.reduce((sum, o) => sum + o.total_price, 0),
        unpaidOrders: unpaidOrders.length,
        unpaidAmount: unpaidOrders.reduce((sum, o) => sum + o.total_price, 0),
        orders,
      });
    } catch (error) {
      console.error("Error fetching bill report:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memuat laporan tagihan",
      });
    } finally {
      setLoadingBillReport(false);
    }
  };

  const getDateRange = () => {
    if (useCustomRange && startDate && endDate) {
      return {
        start: startDate,
        end: endDate,
      };
    }

    if (period === "all") return null;

    const now = new Date();
    let start: Date;
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    switch (period) {
      case "today":
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        start = new Date(now);
        start.setDate(start.getDate() - 7);
        break;
      case "month":
        start = new Date(now);
        start.setMonth(start.getMonth() - 1);
        break;
      default:
        return null;
    }

    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    };
  };

  const fetchReportData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("laundry_orders")
        .select(
          `
          *,
          laundry_date,
          students (id, name, class),
          laundry_partners (id, name)
        `,
        )
        .in("status", ["DIBAYAR", "SELESAI"]);

      // Apply date filter
      const dateRange = getDateRange();
      if (dateRange) {
        if (dateFilterType === "laundry_date") {
          query = query
            .gte("laundry_date", dateRange.start)
            .lte("laundry_date", dateRange.end);
        } else {
          query = query
            .gte("paid_at", dateRange.start + "T00:00:00")
            .lte("paid_at", dateRange.end + "T23:59:59");
        }
      }

      const { data, error } = await query;

      if (error) throw error;

      const orders = data || [];

      // Calculate totals
      const totalOrders = orders.length;
      const totalRevenue = orders.reduce(
        (sum, o) => sum + (o.total_price || 0),
        0,
      );
      const yayasanRevenue = orders.reduce(
        (sum, o) => sum + (o.yayasan_share || 0),
        0,
      );
      const vendorRevenue = orders.reduce(
        (sum, o) => sum + (o.vendor_share || 0),
        0,
      );

      // Group by category
      const ordersByCategory: Record<
        string,
        { count: number; revenue: number }
      > = {};
      orders.forEach((order) => {
        const cat = order.category;
        if (!ordersByCategory[cat]) {
          ordersByCategory[cat] = { count: 0, revenue: 0 };
        }
        ordersByCategory[cat].count++;
        ordersByCategory[cat].revenue += order.total_price || 0;
      });

      // Group by class
      const ordersByClass: Record<string, { count: number; revenue: number }> =
        {};
      orders.forEach((order) => {
        const cls = order.students?.class || "Unknown";
        if (!ordersByClass[cls]) {
          ordersByClass[cls] = { count: 0, revenue: 0 };
        }
        ordersByClass[cls].count++;
        ordersByClass[cls].revenue += order.total_price || 0;
      });

      // Group by partner
      const ordersByPartner: Record<
        string,
        { count: number; revenue: number }
      > = {};
      orders.forEach((order) => {
        const partner = order.laundry_partners?.name || "Unknown";
        if (!ordersByPartner[partner]) {
          ordersByPartner[partner] = { count: 0, revenue: 0 };
        }
        ordersByPartner[partner].count++;
        ordersByPartner[partner].revenue += order.total_price || 0;
      });

      // Calculate vendor share data
      const vendorMap = new Map<string, VendorShareData>();
      orders.forEach((order) => {
        const partnerId = order.laundry_partners?.id || "unknown";
        const partnerName = order.laundry_partners?.name || "Unknown";

        if (!vendorMap.has(partnerId)) {
          vendorMap.set(partnerId, {
            partnerId,
            partnerName,
            totalOrders: 0,
            totalRevenue: 0,
            vendorShare: 0,
            yayasanShare: 0,
            orders: [],
          });
        }

        const vendor = vendorMap.get(partnerId)!;
        vendor.totalOrders++;
        vendor.totalRevenue += order.total_price || 0;
        vendor.vendorShare += order.vendor_share || 0;
        vendor.yayasanShare += order.yayasan_share || 0;
        vendor.orders.push({
          id: order.id,
          laundry_date: order.laundry_date,
          category: order.category,
          weight_kg: order.weight_kg,
          item_count: order.item_count,
          total_price: order.total_price,
          vendor_share: order.vendor_share,
          yayasan_share: order.yayasan_share,
          student_name: order.students?.name || "-",
          student_class: order.students?.class || "-",
        });
      });

      setVendorShareData(
        Array.from(vendorMap.values()).sort(
          (a, b) => b.vendorShare - a.vendorShare,
        ),
      );

      setReportData({
        totalOrders,
        totalRevenue,
        yayasanRevenue,
        vendorRevenue,
        ordersByCategory,
        ordersByClass,
        ordersByPartner,
      });
    } catch (error) {
      console.error("Error fetching report data:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memuat data laporan",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchWadiahData = async () => {
    try {
      // Fetch all students with their class info
      const { data: students, error: studentsError } = await supabase
        .from("students")
        .select("id, name, class");

      if (studentsError) throw studentsError;

      // Fetch wadiah balances from student_wadiah_balance table
      const { data: wadiahBalances, error: balanceError } = await supabase
        .from("student_wadiah_balance")
        .select("student_id, balance, total_deposited, total_used");

      if (balanceError) throw balanceError;

      // Fetch wadiah transactions
      let transactionQuery = supabase.from("wadiah_transactions").select("*");

      const dateRange = getDateRange();
      if (dateRange) {
        transactionQuery = transactionQuery
          .gte("created_at", dateRange.start + "T00:00:00")
          .lte("created_at", dateRange.end + "T23:59:59");
      }

      const { data: transactions, error: transactionsError } =
        await transactionQuery;

      if (transactionsError) throw transactionsError;

      // Calculate totals from wadiah balances
      const totalBalance = (wadiahBalances || []).reduce(
        (sum, wb) => sum + (wb.balance || 0),
        0,
      );

      const totalStudentsWithBalance = (wadiahBalances || []).filter(
        (wb) => (wb.balance || 0) > 0,
      ).length;

      // Calculate from transactions based on transaction_type
      const totalTopUp = (transactions || [])
        .filter(
          (t) =>
            t.transaction_type === "deposit" ||
            t.transaction_type === "change_deposit",
        )
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const totalUsed = (transactions || [])
        .filter((t) => t.transaction_type === "payment")
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

      // Create a map of student_id to wadiah balance
      const balanceMap = new Map(
        (wadiahBalances || []).map((wb) => [wb.student_id, wb]),
      );

      // Group wadiah by class
      const wadiahByClass: Record<
        string,
        { balance: number; used: number; topUp: number; students: number }
      > = {};

      (students || []).forEach((student) => {
        const cls = student.class || "Unknown";
        const wadiahBalance = balanceMap.get(student.id);

        if (!wadiahByClass[cls]) {
          wadiahByClass[cls] = { balance: 0, used: 0, topUp: 0, students: 0 };
        }

        if (wadiahBalance) {
          wadiahByClass[cls].balance += wadiahBalance.balance || 0;
          if ((wadiahBalance.balance || 0) > 0) {
            wadiahByClass[cls].students++;
          }
        }
      });

      // Add transaction data to class grouping
      (transactions || []).forEach((tx) => {
        const student = (students || []).find((s) => s.id === tx.student_id);
        if (student) {
          const cls = student.class || "Unknown";
          if (!wadiahByClass[cls]) {
            wadiahByClass[cls] = { balance: 0, used: 0, topUp: 0, students: 0 };
          }
          if (
            tx.transaction_type === "deposit" ||
            tx.transaction_type === "change_deposit"
          ) {
            wadiahByClass[cls].topUp += tx.amount || 0;
          } else if (tx.transaction_type === "payment") {
            wadiahByClass[cls].used += Math.abs(tx.amount || 0);
          }
        }
      });

      setWadiahData({
        totalBalance,
        totalUsed,
        totalTopUp,
        totalStudentsWithBalance,
        wadiahByClass,
      });
    } catch (error) {
      console.error("Error fetching wadiah data:", error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatLaundryDate = (date: string) => {
    return new Date(date + "T00:00:00").toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const getDateRangeLabel = () => {
    if (useCustomRange && startDate && endDate) {
      return `${formatLaundryDate(startDate)} - ${formatLaundryDate(endDate)}`;
    }
    switch (period) {
      case "today":
        return "Hari Ini";
      case "week":
        return "7 Hari Terakhir";
      case "month":
        return "30 Hari Terakhir";
      default:
        return "Semua Waktu";
    }
  };

  const handleExport = () => {
    toast({
      title: "Info",
      description: "Fitur export laporan akan segera tersedia",
    });
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      MENUNGGU_APPROVAL_MITRA: "Menunggu Approval",
      DISETUJUI_MITRA: "Disetujui Mitra",
      MENUNGGU_PEMBAYARAN: "Menunggu Pembayaran",
      DIBAYAR: "Dibayar",
      SELESAI: "Selesai",
      DITOLAK_MITRA: "Ditolak",
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    if (status === "DIBAYAR" || status === "SELESAI") {
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    }
    if (status === "DITOLAK_MITRA") {
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    }
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  };

  const getBillDateRangeLabel = () => {
    if (billStartDate && billEndDate) {
      return `${formatLaundryDate(billStartDate)} - ${formatLaundryDate(billEndDate)}`;
    }
    if (billStartDate) {
      return `Dari ${formatLaundryDate(billStartDate)}`;
    }
    if (billEndDate) {
      return `Sampai ${formatLaundryDate(billEndDate)}`;
    }
    return "Semua Waktu";
  };

  const handlePrintBillReport = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          "Tidak dapat membuka jendela cetak. Periksa pop-up blocker.",
      });
      return;
    }

    const selectedPartner = partners.find((p) => p.id === selectedPartnerId);
    const partnerLabel =
      selectedPartnerId === "all"
        ? "Semua Mitra"
        : selectedPartner?.name || "-";

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Laporan Tagihan Laundry</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; font-size: 11px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 15px; }
          .header h1 { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
          .header p { font-size: 10px; color: #666; }
          .filter-info { margin-bottom: 15px; padding: 10px; background: #f5f5f5; border-radius: 4px; }
          .filter-info p { margin: 3px 0; font-size: 10px; }
          .summary-cards { display: flex; gap: 10px; margin-bottom: 15px; }
          .summary-card { flex: 1; border: 1px solid #ddd; padding: 10px; border-radius: 4px; text-align: center; }
          .summary-card .label { font-size: 9px; color: #666; }
          .summary-card .value { font-size: 14px; font-weight: bold; margin-top: 2px; }
          .summary-card.paid .value { color: #059669; }
          .summary-card.unpaid .value { color: #dc2626; }
          .summary-card.vendor .value { color: #059669; }
          .summary-card.yayasan .value { color: #2563eb; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 9px; }
          th { background: #f5f5f5; font-weight: bold; }
          tr:nth-child(even) { background: #fafafa; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .total-row { font-weight: bold; background: #e5e5e5 !important; }
          .status-paid { color: #059669; }
          .status-unpaid { color: #dc2626; }
          .footer { margin-top: 20px; display: flex; justify-content: space-between; }
          .signature-box { width: 180px; text-align: center; }
          .signature-box .line { border-top: 1px solid #000; margin-top: 50px; padding-top: 5px; }
          @media print {
            body { padding: 10px; }
            @page { margin: 8mm; size: landscape; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LAPORAN TAGIHAN LAUNDRY</h1>
          <p>Pondok Pesantren At-Tauhid</p>
        </div>

        <div class="filter-info">
          <p><strong>Periode:</strong> ${getBillDateRangeLabel()}</p>
          <p><strong>Mitra:</strong> ${partnerLabel}</p>
          <p><strong>Dicetak:</strong> ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
        </div>

        <div class="summary-cards">
          <div class="summary-card">
            <div class="label">Total Tagihan</div>
            <div class="value">${billReportData.totalOrders}</div>
          </div>
          <div class="summary-card">
            <div class="label">Total Nilai</div>
            <div class="value">${formatCurrency(billReportData.totalAmount)}</div>
          </div>
          <div class="summary-card paid">
            <div class="label">Sudah Dibayar</div>
            <div class="value">${formatCurrency(billReportData.paidAmount)} (${billReportData.paidOrders})</div>
          </div>
          <div class="summary-card unpaid">
            <div class="label">Belum Dibayar</div>
            <div class="value">${formatCurrency(billReportData.unpaidAmount)} (${billReportData.unpaidOrders})</div>
          </div>
        </div>

        <div class="summary-cards">
          <div class="summary-card vendor">
            <div class="label">Total Bagian Vendor</div>
            <div class="value">${formatCurrency(billReportData.totalVendorShare)}</div>
          </div>
          <div class="summary-card yayasan">
            <div class="label">Total Bagian Yayasan</div>
            <div class="value">${formatCurrency(billReportData.totalYayasanShare)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="text-center">No</th>
              <th>Tgl Laundry</th>
              <th>Siswa</th>
              <th>Kelas</th>
              <th>Mitra</th>
              <th>Kategori</th>
              <th class="text-center">Jumlah</th>
              <th class="text-right">Total</th>
              <th class="text-right">Vendor</th>
              <th class="text-right">Yayasan</th>
              <th class="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            ${billReportData.orders
              .map(
                (order, idx) => `
              <tr>
                <td class="text-center">${idx + 1}</td>
                <td>${formatLaundryDate(order.laundry_date)}</td>
                <td>${order.student_name}</td>
                <td>${order.student_class}</td>
                <td>${order.partner_name}</td>
                <td>${LAUNDRY_CATEGORIES[order.category as keyof typeof LAUNDRY_CATEGORIES]?.label || order.category}</td>
                <td class="text-center">${order.category === "kiloan" ? `${order.weight_kg} kg` : `${order.item_count} pcs`}</td>
                <td class="text-right">${formatCurrency(order.total_price)}</td>
                <td class="text-right">${formatCurrency(order.vendor_share)}</td>
                <td class="text-right">${formatCurrency(order.yayasan_share)}</td>
                <td class="text-center ${["DIBAYAR", "SELESAI"].includes(order.status) ? "status-paid" : "status-unpaid"}">${getStatusLabel(order.status)}</td>
              </tr>
            `,
              )
              .join("")}
            <tr class="total-row">
              <td colspan="7" class="text-right">TOTAL</td>
              <td class="text-right">${formatCurrency(billReportData.totalAmount)}</td>
              <td class="text-right">${formatCurrency(billReportData.totalVendorShare)}</td>
              <td class="text-right">${formatCurrency(billReportData.totalYayasanShare)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <div class="signature-box">
            <p>Mengetahui,</p>
            <div class="line">Penanggung Jawab</div>
          </div>
          <div class="signature-box">
            <p>Dibuat oleh,</p>
            <div class="line">Admin</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handlePrintVendorReport = (vendor: VendorShareData) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          "Tidak dapat membuka jendela cetak. Periksa pop-up blocker.",
      });
      return;
    }

    const dateRange = getDateRange();
    const periodLabel = getDateRangeLabel();

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Laporan Bagi Hasil - ${vendor.partnerName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 15px; }
          .header h1 { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
          .header h2 { font-size: 14px; font-weight: normal; margin-bottom: 10px; }
          .header p { font-size: 11px; color: #666; }
          .info-section { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .info-box { flex: 1; }
          .info-box h3 { font-size: 12px; font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
          .info-row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 11px; }
          .summary-cards { display: flex; gap: 15px; margin-bottom: 20px; }
          .summary-card { flex: 1; border: 1px solid #ddd; padding: 12px; border-radius: 4px; text-align: center; }
          .summary-card .label { font-size: 10px; color: #666; }
          .summary-card .value { font-size: 16px; font-weight: bold; margin-top: 4px; }
          .summary-card.vendor .value { color: #059669; }
          .summary-card.yayasan .value { color: #2563eb; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 10px; }
          th { background: #f5f5f5; font-weight: bold; }
          tr:nth-child(even) { background: #fafafa; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .total-row { font-weight: bold; background: #e5e5e5 !important; }
          .footer { margin-top: 30px; display: flex; justify-content: space-between; }
          .signature-box { width: 200px; text-align: center; }
          .signature-box .line { border-top: 1px solid #000; margin-top: 60px; padding-top: 5px; }
          @media print {
            body { padding: 10px; }
            @page { margin: 10mm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LAPORAN BAGI HASIL MITRA LAUNDRY</h1>
          <h2>${vendor.partnerName}</h2>
          <p>Periode: ${periodLabel}</p>
          <p>Dicetak: ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
        </div>

        <div class="summary-cards">
          <div class="summary-card">
            <div class="label">Total Order</div>
            <div class="value">${vendor.totalOrders}</div>
          </div>
          <div class="summary-card">
            <div class="label">Total Pendapatan</div>
            <div class="value">${formatCurrency(vendor.totalRevenue)}</div>
          </div>
          <div class="summary-card vendor">
            <div class="label">Bagian Vendor</div>
            <div class="value">${formatCurrency(vendor.vendorShare)}</div>
          </div>
          <div class="summary-card yayasan">
            <div class="label">Bagian Yayasan</div>
            <div class="value">${formatCurrency(vendor.yayasanShare)}</div>
          </div>
        </div>

        <h3 style="margin-bottom: 10px; font-size: 13px;">Rincian Transaksi</h3>
        <table>
          <thead>
            <tr>
              <th class="text-center">No</th>
              <th>Tgl Laundry</th>
              <th>Siswa</th>
              <th>Kelas</th>
              <th>Kategori</th>
              <th class="text-center">Jumlah</th>
              <th class="text-right">Total</th>
              <th class="text-right">Bag. Vendor</th>
              <th class="text-right">Bag. Yayasan</th>
            </tr>
          </thead>
          <tbody>
            ${vendor.orders
              .sort((a, b) => a.laundry_date.localeCompare(b.laundry_date))
              .map(
                (order, idx) => `
              <tr>
                <td class="text-center">${idx + 1}</td>
                <td>${formatLaundryDate(order.laundry_date)}</td>
                <td>${order.student_name}</td>
                <td>${order.student_class}</td>
                <td>${LAUNDRY_CATEGORIES[order.category as keyof typeof LAUNDRY_CATEGORIES]?.label || order.category}</td>
                <td class="text-center">${order.category === "kiloan" ? `${order.weight_kg} kg` : `${order.item_count} pcs`}</td>
                <td class="text-right">${formatCurrency(order.total_price)}</td>
                <td class="text-right">${formatCurrency(order.vendor_share)}</td>
                <td class="text-right">${formatCurrency(order.yayasan_share)}</td>
              </tr>
            `,
              )
              .join("")}
            <tr class="total-row">
              <td colspan="6" class="text-right">TOTAL</td>
              <td class="text-right">${formatCurrency(vendor.totalRevenue)}</td>
              <td class="text-right">${formatCurrency(vendor.vendorShare)}</td>
              <td class="text-right">${formatCurrency(vendor.yayasanShare)}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <div class="signature-box">
            <p>Mitra Laundry</p>
            <div class="line">${vendor.partnerName}</div>
          </div>
          <div class="signature-box">
            <p>Penanggung Jawab</p>
            <div class="line">(.......................)</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handlePrintAllVendorReport = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          "Tidak dapat membuka jendela cetak. Periksa pop-up blocker.",
      });
      return;
    }

    const periodLabel = getDateRangeLabel();

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Laporan Bagi Hasil Semua Mitra</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 15px; }
          .header h1 { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
          .header p { font-size: 11px; color: #666; }
          .summary-cards { display: flex; gap: 15px; margin-bottom: 20px; }
          .summary-card { flex: 1; border: 1px solid #ddd; padding: 12px; border-radius: 4px; text-align: center; }
          .summary-card .label { font-size: 10px; color: #666; }
          .summary-card .value { font-size: 16px; font-weight: bold; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 11px; }
          th { background: #f5f5f5; font-weight: bold; }
          tr:nth-child(even) { background: #fafafa; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .total-row { font-weight: bold; background: #e5e5e5 !important; }
          .footer { margin-top: 30px; display: flex; justify-content: flex-end; }
          .signature-box { width: 200px; text-align: center; }
          .signature-box .line { border-top: 1px solid #000; margin-top: 60px; padding-top: 5px; }
          @media print {
            body { padding: 10px; }
            @page { margin: 10mm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LAPORAN REKAPITULASI BAGI HASIL</h1>
          <h1>MITRA LAUNDRY</h1>
          <p>Periode: ${periodLabel}</p>
          <p>Dicetak: ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
        </div>

        <div class="summary-cards">
          <div class="summary-card">
            <div class="label">Total Order</div>
            <div class="value">${reportData.totalOrders}</div>
          </div>
          <div class="summary-card">
            <div class="label">Total Pendapatan</div>
            <div class="value">${formatCurrency(reportData.totalRevenue)}</div>
          </div>
          <div class="summary-card" style="background: #ecfdf5;">
            <div class="label">Total Bagian Vendor</div>
            <div class="value" style="color: #059669;">${formatCurrency(reportData.vendorRevenue)}</div>
          </div>
          <div class="summary-card" style="background: #eff6ff;">
            <div class="label">Total Bagian Yayasan</div>
            <div class="value" style="color: #2563eb;">${formatCurrency(reportData.yayasanRevenue)}</div>
          </div>
        </div>

        <h3 style="margin-bottom: 10px; font-size: 13px;">Rincian Per Mitra</h3>
        <table>
          <thead>
            <tr>
              <th class="text-center">No</th>
              <th>Nama Mitra</th>
              <th class="text-center">Jumlah Order</th>
              <th class="text-right">Total Pendapatan</th>
              <th class="text-right">Bagian Vendor</th>
              <th class="text-right">Bagian Yayasan</th>
            </tr>
          </thead>
          <tbody>
            ${vendorShareData
              .map(
                (vendor, idx) => `
              <tr>
                <td class="text-center">${idx + 1}</td>
                <td>${vendor.partnerName}</td>
                <td class="text-center">${vendor.totalOrders}</td>
                <td class="text-right">${formatCurrency(vendor.totalRevenue)}</td>
                <td class="text-right">${formatCurrency(vendor.vendorShare)}</td>
                <td class="text-right">${formatCurrency(vendor.yayasanShare)}</td>
              </tr>
            `,
              )
              .join("")}
            <tr class="total-row">
              <td colspan="2" class="text-right">TOTAL</td>
              <td class="text-center">${reportData.totalOrders}</td>
              <td class="text-right">${formatCurrency(reportData.totalRevenue)}</td>
              <td class="text-right">${formatCurrency(reportData.vendorRevenue)}</td>
              <td class="text-right">${formatCurrency(reportData.yayasanRevenue)}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <div class="signature-box">
            <p>Penanggung Jawab</p>
            <div class="line">(.......................)</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleViewVendorDetail = (vendor: VendorShareData) => {
    setSelectedVendor(vendor);
    setShowVendorDetail(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Laporan</h1>
            <p className="text-muted-foreground mt-1">
              Ringkasan data laundry, bagi hasil, dan tagihan
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
            <TabsTrigger value="summary" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Ringkasan & Bagi Hasil
            </TabsTrigger>
            <TabsTrigger value="bills" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Laporan Tagihan
            </TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-6 mt-6">
            {/* Filter Section */}
            <Card className="dashboard-card">
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Select
                      value={dateFilterType}
                      onValueChange={(v) =>
                        setDateFilterType(v as "laundry_date" | "paid_at")
                      }
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder="Filter Berdasarkan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="laundry_date">
                          Tanggal Laundry
                        </SelectItem>
                        <SelectItem value="paid_at">Tanggal Bayar</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={useCustomRange ? "custom" : period}
                      onValueChange={(v) => {
                        if (v === "custom") {
                          setUseCustomRange(true);
                        } else {
                          setUseCustomRange(false);
                          setPeriod(v);
                        }
                      }}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder="Periode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="today">Hari Ini</SelectItem>
                        <SelectItem value="week">7 Hari Terakhir</SelectItem>
                        <SelectItem value="month">30 Hari Terakhir</SelectItem>
                        <SelectItem value="all">Semua Waktu</SelectItem>
                        <SelectItem value="custom">
                          Rentang Tanggal...
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {useCustomRange && (
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor="startDate"
                          className="text-sm whitespace-nowrap"
                        >
                          Dari:
                        </Label>
                        <Input
                          id="startDate"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-40"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor="endDate"
                          className="text-sm whitespace-nowrap"
                        >
                          Sampai:
                        </Label>
                        <Input
                          id="endDate"
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-40"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 ml-auto">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {getDateRangeLabel()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* Order Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="dashboard-card">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Total Order
                          </p>
                          <p className="text-2xl font-bold mt-1">
                            {reportData.totalOrders}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-primary/10 text-primary">
                          <Package className="h-6 w-6" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="dashboard-card">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Total Pendapatan
                          </p>
                          <p className="text-2xl font-bold mt-1">
                            {formatCurrency(reportData.totalRevenue)}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-success/10 text-success">
                          <TrendingUp className="h-6 w-6" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="dashboard-card border-l-4 border-l-emerald-500">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Bagian Vendor
                          </p>
                          <p className="text-2xl font-bold mt-1 text-emerald-600">
                            {formatCurrency(reportData.vendorRevenue)}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
                          <Building2 className="h-6 w-6" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="dashboard-card border-l-4 border-l-blue-500">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Bagian Yayasan
                          </p>
                          <p className="text-2xl font-bold mt-1 text-blue-600">
                            {formatCurrency(reportData.yayasanRevenue)}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
                          <DollarSign className="h-6 w-6" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Vendor Share Report */}
                <Card className="dashboard-card">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Laporan Bagi Hasil Per Mitra
                      </CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrintAllVendorReport}
                        disabled={vendorShareData.length === 0}
                      >
                        <Printer className="h-4 w-4 mr-2" />
                        Cetak Rekap
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {vendorShareData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12">
                        <Building2 className="h-16 w-16 text-muted-foreground/30 mb-4" />
                        <h3 className="text-lg font-medium text-foreground mb-2">
                          Belum ada data
                        </h3>
                        <p className="text-muted-foreground text-center">
                          Data bagi hasil akan muncul setelah ada transaksi
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                                Mitra
                              </th>
                              <th className="text-center py-3 px-4 font-medium text-muted-foreground">
                                Order
                              </th>
                              <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                                Pendapatan
                              </th>
                              <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                                Bag. Vendor
                              </th>
                              <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                                Bag. Yayasan
                              </th>
                              <th className="text-center py-3 px-4 font-medium text-muted-foreground">
                                Aksi
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {vendorShareData.map((vendor) => (
                              <tr
                                key={vendor.partnerId}
                                className="border-b hover:bg-muted/50"
                              >
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2">
                                    <Building2 className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium">
                                      {vendor.partnerName}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  {vendor.totalOrders}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  {formatCurrency(vendor.totalRevenue)}
                                </td>
                                <td className="py-3 px-4 text-right font-semibold text-emerald-600">
                                  {formatCurrency(vendor.vendorShare)}
                                </td>
                                <td className="py-3 px-4 text-right text-blue-600">
                                  {formatCurrency(vendor.yayasanShare)}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        handleViewVendorDetail(vendor)
                                      }
                                    >
                                      <FileText className="h-4 w-4 mr-1" />
                                      Detail
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        handlePrintVendorReport(vendor)
                                      }
                                    >
                                      <Printer className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-muted/50 font-semibold">
                              <td className="py-3 px-4">TOTAL</td>
                              <td className="py-3 px-4 text-center">
                                {reportData.totalOrders}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {formatCurrency(reportData.totalRevenue)}
                              </td>
                              <td className="py-3 px-4 text-right text-emerald-600">
                                {formatCurrency(reportData.vendorRevenue)}
                              </td>
                              <td className="py-3 px-4 text-right text-blue-600">
                                {formatCurrency(reportData.yayasanRevenue)}
                              </td>
                              <td className="py-3 px-4"></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Wadiah Summary */}
                <div>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Wallet className="h-5 w-5" />
                    Ringkasan Wadiah (Saldo Siswa)
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="dashboard-card border-l-4 border-l-blue-500">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Total Saldo Wadiah
                            </p>
                            <p className="text-2xl font-bold mt-1 text-blue-600">
                              {formatCurrency(wadiahData.totalBalance)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {wadiahData.totalStudentsWithBalance} siswa
                              memiliki saldo
                            </p>
                          </div>
                          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
                            <PiggyBank className="h-6 w-6" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="dashboard-card border-l-4 border-l-green-500">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Total Top-Up
                            </p>
                            <p className="text-2xl font-bold mt-1 text-green-600">
                              {formatCurrency(wadiahData.totalTopUp)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {useCustomRange
                                ? "Periode terpilih"
                                : period === "all"
                                  ? "Sepanjang waktu"
                                  : "Periode terpilih"}
                            </p>
                          </div>
                          <div className="p-3 rounded-xl bg-green-500/10 text-green-500">
                            <ArrowUpCircle className="h-6 w-6" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="dashboard-card border-l-4 border-l-orange-500">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Wadiah Digunakan
                            </p>
                            <p className="text-2xl font-bold mt-1 text-orange-600">
                              {formatCurrency(wadiahData.totalUsed)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Untuk pembayaran laundry
                            </p>
                          </div>
                          <div className="p-3 rounded-xl bg-orange-500/10 text-orange-500">
                            <ArrowDownCircle className="h-6 w-6" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="dashboard-card border-l-4 border-l-purple-500">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Net Flow
                            </p>
                            <p
                              className={`text-2xl font-bold mt-1 ${wadiahData.totalTopUp - wadiahData.totalUsed >= 0 ? "text-green-600" : "text-red-600"}`}
                            >
                              {formatCurrency(
                                wadiahData.totalTopUp - wadiahData.totalUsed,
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Top-up - Penggunaan
                            </p>
                          </div>
                          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-500">
                            <Wallet className="h-6 w-6" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Reports Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* By Category */}
                  <Card className="dashboard-card">
                    <CardHeader>
                      <CardTitle className="text-lg">Per Kategori</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {Object.keys(reportData.ordersByCategory).length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">
                          Tidak ada data
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {Object.entries(reportData.ordersByCategory).map(
                            ([category, data]) => (
                              <div
                                key={category}
                                className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                              >
                                <div>
                                  <p className="font-medium">
                                    {LAUNDRY_CATEGORIES[
                                      category as keyof typeof LAUNDRY_CATEGORIES
                                    ]?.label || category}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {data.count} order
                                  </p>
                                </div>
                                <p className="font-bold">
                                  {formatCurrency(data.revenue)}
                                </p>
                              </div>
                            ),
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* By Class */}
                  <Card className="dashboard-card">
                    <CardHeader>
                      <CardTitle className="text-lg">Per Kelas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {Object.keys(reportData.ordersByClass).length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">
                          Tidak ada data
                        </p>
                      ) : (
                        <div className="space-y-4 max-h-80 overflow-y-auto">
                          {Object.entries(reportData.ordersByClass)
                            .sort((a, b) => b[1].revenue - a[1].revenue)
                            .map(([cls, data]) => (
                              <div
                                key={cls}
                                className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                              >
                                <div>
                                  <p className="font-medium">Kelas {cls}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {data.count} order
                                  </p>
                                </div>
                                <p className="font-bold">
                                  {formatCurrency(data.revenue)}
                                </p>
                              </div>
                            ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          {/* Bills Tab */}
          <TabsContent value="bills" className="space-y-6 mt-6">
            {/* Bill Report Filter */}
            <Card className="dashboard-card">
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor="billStartDate"
                        className="text-sm whitespace-nowrap"
                      >
                        Dari:
                      </Label>
                      <Input
                        id="billStartDate"
                        type="date"
                        value={billStartDate}
                        onChange={(e) => setBillStartDate(e.target.value)}
                        className="w-40"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor="billEndDate"
                        className="text-sm whitespace-nowrap"
                      >
                        Sampai:
                      </Label>
                      <Input
                        id="billEndDate"
                        type="date"
                        value={billEndDate}
                        onChange={(e) => setBillEndDate(e.target.value)}
                        className="w-40"
                      />
                    </div>

                    <Select
                      value={selectedPartnerId}
                      onValueChange={setSelectedPartnerId}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Pilih Mitra" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Mitra</SelectItem>
                        {partners.map((partner) => (
                          <SelectItem key={partner.id} value={partner.id}>
                            {partner.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    <Button
                      variant="outline"
                      onClick={handlePrintBillReport}
                      disabled={
                        loadingBillReport || billReportData.orders.length === 0
                      }
                    >
                      <Printer className="h-4 w-4 mr-2" />
                      Cetak Laporan
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Periode: {getBillDateRangeLabel()}
                  </span>
                  {selectedPartnerId !== "all" && (
                    <>
                      <span className="text-muted-foreground">•</span>
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {partners.find((p) => p.id === selectedPartnerId)?.name}
                      </span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {loadingBillReport ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* Bill Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="dashboard-card">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Total Tagihan
                          </p>
                          <p className="text-2xl font-bold mt-1">
                            {billReportData.totalOrders}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatCurrency(billReportData.totalAmount)}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-primary/10 text-primary">
                          <ClipboardList className="h-6 w-6" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="dashboard-card border-l-4 border-l-green-500">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Sudah Dibayar
                          </p>
                          <p className="text-2xl font-bold mt-1 text-green-600">
                            {billReportData.paidOrders}
                          </p>
                          <p className="text-sm text-green-600 mt-1">
                            {formatCurrency(billReportData.paidAmount)}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-green-500/10 text-green-500">
                          <CheckCircle2 className="h-6 w-6" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="dashboard-card border-l-4 border-l-orange-500">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Belum Dibayar
                          </p>
                          <p className="text-2xl font-bold mt-1 text-orange-600">
                            {billReportData.unpaidOrders}
                          </p>
                          <p className="text-sm text-orange-600 mt-1">
                            {formatCurrency(billReportData.unpaidAmount)}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-orange-500/10 text-orange-500">
                          <Clock className="h-6 w-6" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="dashboard-card">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            % Terbayar
                          </p>
                          <p className="text-2xl font-bold mt-1">
                            {billReportData.totalOrders > 0
                              ? Math.round(
                                  (billReportData.paidOrders /
                                    billReportData.totalOrders) *
                                    100,
                                )
                              : 0}
                            %
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            dari total tagihan
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
                          <TrendingUp className="h-6 w-6" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Vendor/Yayasan Share Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="dashboard-card border-l-4 border-l-emerald-500">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Total Bagian Vendor
                          </p>
                          <p className="text-2xl font-bold mt-1 text-emerald-600">
                            {formatCurrency(billReportData.totalVendorShare)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Dari semua tagihan (termasuk belum bayar)
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
                          <Building2 className="h-6 w-6" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="dashboard-card border-l-4 border-l-blue-500">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Total Bagian Yayasan
                          </p>
                          <p className="text-2xl font-bold mt-1 text-blue-600">
                            {formatCurrency(billReportData.totalYayasanShare)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Dari semua tagihan (termasuk belum bayar)
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
                          <DollarSign className="h-6 w-6" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Bill List Table */}
                <Card className="dashboard-card">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Daftar Tagihan ({billReportData.orders.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {billReportData.orders.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12">
                        <ClipboardList className="h-16 w-16 text-muted-foreground/30 mb-4" />
                        <h3 className="text-lg font-medium text-foreground mb-2">
                          Belum ada data
                        </h3>
                        <p className="text-muted-foreground text-center">
                          Pilih rentang tanggal untuk melihat tagihan
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                                Tgl Laundry
                              </th>
                              <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                                Siswa
                              </th>
                              <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                                Kelas
                              </th>
                              <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                                Mitra
                              </th>
                              <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                                Kategori
                              </th>
                              <th className="text-right py-3 px-3 font-medium text-muted-foreground">
                                Total
                              </th>
                              <th className="text-right py-3 px-3 font-medium text-muted-foreground">
                                Vendor
                              </th>
                              <th className="text-right py-3 px-3 font-medium text-muted-foreground">
                                Yayasan
                              </th>
                              <th className="text-center py-3 px-3 font-medium text-muted-foreground">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {billReportData.orders.map((order) => (
                              <tr
                                key={order.id}
                                className="border-b hover:bg-muted/50"
                              >
                                <td className="py-3 px-3">
                                  {formatLaundryDate(order.laundry_date)}
                                </td>
                                <td className="py-3 px-3 font-medium">
                                  {order.student_name}
                                </td>
                                <td className="py-3 px-3">
                                  {order.student_class}
                                </td>
                                <td className="py-3 px-3">
                                  {order.partner_name}
                                </td>
                                <td className="py-3 px-3">
                                  {LAUNDRY_CATEGORIES[
                                    order.category as keyof typeof LAUNDRY_CATEGORIES
                                  ]?.label || order.category}
                                </td>
                                <td className="py-3 px-3 text-right">
                                  {formatCurrency(order.total_price)}
                                </td>
                                <td className="py-3 px-3 text-right text-emerald-600">
                                  {formatCurrency(order.vendor_share)}
                                </td>
                                <td className="py-3 px-3 text-right text-blue-600">
                                  {formatCurrency(order.yayasan_share)}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}
                                  >
                                    {["DIBAYAR", "SELESAI"].includes(
                                      order.status,
                                    ) ? (
                                      <CheckCircle2 className="h-3 w-3" />
                                    ) : (
                                      <AlertCircle className="h-3 w-3" />
                                    )}
                                    {getStatusLabel(order.status)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-muted/50 font-semibold">
                              <td colSpan={5} className="py-3 px-3 text-right">
                                TOTAL
                              </td>
                              <td className="py-3 px-3 text-right">
                                {formatCurrency(billReportData.totalAmount)}
                              </td>
                              <td className="py-3 px-3 text-right text-emerald-600">
                                {formatCurrency(
                                  billReportData.totalVendorShare,
                                )}
                              </td>
                              <td className="py-3 px-3 text-right text-blue-600">
                                {formatCurrency(
                                  billReportData.totalYayasanShare,
                                )}
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Vendor Detail Modal */}
        <Dialog open={showVendorDetail} onOpenChange={setShowVendorDetail}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Detail Bagi Hasil - {selectedVendor?.partnerName}
              </DialogTitle>
            </DialogHeader>

            {selectedVendor && (
              <div className="space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-sm text-muted-foreground">Total Order</p>
                    <p className="text-xl font-bold">
                      {selectedVendor.totalOrders}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-sm text-muted-foreground">Pendapatan</p>
                    <p className="text-xl font-bold">
                      {formatCurrency(selectedVendor.totalRevenue)}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-center">
                    <p className="text-sm text-muted-foreground">Bag. Vendor</p>
                    <p className="text-xl font-bold text-emerald-600">
                      {formatCurrency(selectedVendor.vendorShare)}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-center">
                    <p className="text-sm text-muted-foreground">
                      Bag. Yayasan
                    </p>
                    <p className="text-xl font-bold text-blue-600">
                      {formatCurrency(selectedVendor.yayasanShare)}
                    </p>
                  </div>
                </div>

                {/* Order List */}
                <div>
                  <h4 className="font-semibold mb-3">Rincian Transaksi</h4>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left py-2 px-3">Tgl Laundry</th>
                          <th className="text-left py-2 px-3">Siswa</th>
                          <th className="text-left py-2 px-3">Kelas</th>
                          <th className="text-left py-2 px-3">Kategori</th>
                          <th className="text-center py-2 px-3">Jumlah</th>
                          <th className="text-right py-2 px-3">Total</th>
                          <th className="text-right py-2 px-3">Vendor</th>
                          <th className="text-right py-2 px-3">Yayasan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedVendor.orders
                          .sort((a, b) =>
                            a.laundry_date.localeCompare(b.laundry_date),
                          )
                          .map((order) => (
                            <tr key={order.id} className="border-t">
                              <td className="py-2 px-3">
                                {formatLaundryDate(order.laundry_date)}
                              </td>
                              <td className="py-2 px-3">
                                {order.student_name}
                              </td>
                              <td className="py-2 px-3">
                                {order.student_class}
                              </td>
                              <td className="py-2 px-3">
                                {LAUNDRY_CATEGORIES[
                                  order.category as keyof typeof LAUNDRY_CATEGORIES
                                ]?.label || order.category}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {order.category === "kiloan"
                                  ? `${order.weight_kg} kg`
                                  : `${order.item_count} pcs`}
                              </td>
                              <td className="py-2 px-3 text-right">
                                {formatCurrency(order.total_price)}
                              </td>
                              <td className="py-2 px-3 text-right text-emerald-600">
                                {formatCurrency(order.vendor_share)}
                              </td>
                              <td className="py-2 px-3 text-right text-blue-600">
                                {formatCurrency(order.yayasan_share)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Print Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={() => handlePrintVendorReport(selectedVendor)}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Cetak Laporan
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
