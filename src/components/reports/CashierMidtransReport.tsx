import { useEffect, useState, useMemo } from "react";
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
import { useAuth } from "@/hooks/useAuth";
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
  Loader2,
  Download,
  Search,
  CreditCard,
  QrCode,
  Wallet,
  Building2,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  CalendarRange,
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

// Types
interface MidtransPayment {
  id: string;
  midtrans_order_id: string | null;
  midtrans_snap_token: string | null;
  total_price: number;
  admin_fee: number | null;
  payment_method: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
  laundry_date: string;
  wadiah_used: number | null;
  category: string;
  weight_kg: number | null;
  item_count: number | null;
  students: {
    id: string;
    name: string;
    class: string;
    nik: string;
  } | null;
  laundry_partners: {
    name: string;
  } | null;
}

interface SummaryData {
  totalOnlinePayments: number;
  totalOnlineAmount: number;
  totalAdminFees: number;
  qrisPayments: number;
  qrisAmount: number;
  vaPayments: number;
  vaAmount: number;
  ewalletPayments: number;
  ewalletAmount: number;
  pendingPayments: number;
  pendingAmount: number;
}

const PAGE_SIZE = 15;

// Payment method labels
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  qris: "QRIS",
  bank_transfer: "Virtual Account",
  gopay: "GoPay",
  shopeepay: "ShopeePay",
  echannel: "Mandiri Bill",
  bca_va: "BCA VA",
  bni_va: "BNI VA",
  bri_va: "BRI VA",
  permata_va: "Permata VA",
  cimb_va: "CIMB VA",
};

// Format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

// Get status badge
const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case "DIBAYAR":
    case "SELESAI":
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle2 className="h-3 w-3 mr-1" /> Sukses
        </Badge>
      );
    case "MENUNGGU_PEMBAYARAN":
      return (
        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
          <Clock className="h-3 w-3 mr-1" /> Pending
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
          <AlertCircle className="h-3 w-3 mr-1" /> {status}
        </Badge>
      );
  }
};

// Get payment method icon
const PaymentMethodIcon = ({ method }: { method: string | null }) => {
  if (!method) return <CreditCard className="h-4 w-4 text-muted-foreground" />;
  
  const lowerMethod = method.toLowerCase();
  if (lowerMethod === "qris") {
    return <QrCode className="h-4 w-4 text-purple-600" />;
  }
  if (lowerMethod.includes("va") || lowerMethod === "bank_transfer" || lowerMethod === "echannel") {
    return <Building2 className="h-4 w-4 text-blue-600" />;
  }
  if (lowerMethod === "gopay" || lowerMethod === "shopeepay") {
    return <Wallet className="h-4 w-4 text-green-600" />;
  }
  return <CreditCard className="h-4 w-4 text-muted-foreground" />;
};

export function CashierMidtransReport() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<MidtransPayment[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  
  // Filters
  const [period, setPeriod] = useState("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("success");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  
  // Detail modal
  const [selectedPayment, setSelectedPayment] = useState<MidtransPayment | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const getDateRange = () => {
    const now = new Date();
    let startDate: Date;
    let endDate = new Date(now);

    switch (period) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "yesterday":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "custom":
        if (customStartDate && customEndDate) {
          startDate = new Date(customStartDate.getFullYear(), customStartDate.getMonth(), customStartDate.getDate());
          endDate = new Date(customEndDate.getFullYear(), customEndDate.getMonth(), customEndDate.getDate() + 1);
        } else {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }
        break;
      case "all":
      default:
        startDate = new Date(0);
    }

    return { startDate, endDate };
  };

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange();
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // Build query for online payments (paid by parents via Midtrans)
      let query = supabase
        .from("laundry_orders")
        .select(
          `
          id,
          midtrans_order_id,
          midtrans_snap_token,
          total_price,
          admin_fee,
          payment_method,
          status,
          paid_at,
          created_at,
          laundry_date,
          wadiah_used,
          category,
          weight_kg,
          item_count,
          students (id, name, class, nik),
          laundry_partners (name)
        `,
          { count: "exact" }
        )
        .not("midtrans_order_id", "is", null);
      
      // Apply status filter
      if (filterStatus === "success") {
        query = query.in("status", ["DIBAYAR", "SELESAI"]);
      } else if (filterStatus === "pending") {
        query = query.eq("status", "MENUNGGU_PEMBAYARAN");
      }

      // Apply date filter
      if (period !== "all") {
        if (filterStatus === "success") {
          query = query
            .gte("paid_at", startDate.toISOString())
            .lt("paid_at", endDate.toISOString());
        } else {
          query = query
            .gte("created_at", startDate.toISOString())
            .lt("created_at", endDate.toISOString());
        }
      }

      // Apply payment method filter
      if (filterPaymentMethod !== "all") {
        query = query.eq("payment_method", filterPaymentMethod);
      }

      // Sorting
      query = query.order("paid_at", { ascending: false, nullsFirst: false });

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      // Filter by search query in memory
      let filteredData = (data || []) as MidtransPayment[];
      if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        filteredData = filteredData.filter(
          (p) =>
            p.students?.name?.toLowerCase().includes(lowerQuery) ||
            p.students?.class?.toLowerCase().includes(lowerQuery) ||
            p.midtrans_order_id?.toLowerCase().includes(lowerQuery)
        );
      }

      setPayments(filteredData);
      setTotalCount(count || 0);

      // Fetch summary data
      await fetchSummary(startDate, endDate);
    } catch (error) {
      console.error("Error fetching payments:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memuat data pembayaran Midtrans",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async (startDate: Date, endDate: Date) => {
    try {
      // Query for successful online payments
      let successQuery = supabase
        .from("laundry_orders")
        .select("total_price, admin_fee, payment_method")
        .in("status", ["DIBAYAR", "SELESAI"])
        .not("midtrans_order_id", "is", null);

      // Query for pending payments
      let pendingQuery = supabase
        .from("laundry_orders")
        .select("total_price")
        .eq("status", "MENUNGGU_PEMBAYARAN")
        .not("midtrans_order_id", "is", null);

      if (period !== "all") {
        successQuery = successQuery
          .gte("paid_at", startDate.toISOString())
          .lt("paid_at", endDate.toISOString());
        pendingQuery = pendingQuery
          .gte("created_at", startDate.toISOString())
          .lt("created_at", endDate.toISOString());
      }

      const [successResult, pendingResult] = await Promise.all([
        successQuery,
        pendingQuery,
      ]);

      if (successResult.error) throw successResult.error;
      if (pendingResult.error) throw pendingResult.error;

      const successPayments = successResult.data || [];
      const pendingPayments = pendingResult.data || [];

      let totalOnlineAmount = 0;
      let totalAdminFees = 0;
      let qrisPayments = 0, qrisAmount = 0;
      let vaPayments = 0, vaAmount = 0;
      let ewalletPayments = 0, ewalletAmount = 0;

      successPayments.forEach((p) => {
        const method = p.payment_method?.toLowerCase() || "";
        const amount = p.total_price || 0;
        const adminFee = p.admin_fee || 0;

        totalOnlineAmount += amount;
        totalAdminFees += adminFee;

        if (method === "qris") {
          qrisPayments++;
          qrisAmount += amount;
        } else if (method.includes("va") || method === "bank_transfer" || method === "echannel") {
          vaPayments++;
          vaAmount += amount;
        } else if (method === "gopay" || method === "shopeepay") {
          ewalletPayments++;
          ewalletAmount += amount;
        }
      });

      const pendingAmount = pendingPayments.reduce((sum, p) => sum + (p.total_price || 0), 0);

      setSummary({
        totalOnlinePayments: successPayments.length,
        totalOnlineAmount,
        totalAdminFees,
        qrisPayments,
        qrisAmount,
        vaPayments,
        vaAmount,
        ewalletPayments,
        ewalletAmount,
        pendingPayments: pendingPayments.length,
        pendingAmount,
      });
    } catch (error) {
      console.error("Error fetching summary:", error);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [period, currentPage, filterPaymentMethod, filterStatus, searchQuery, customStartDate, customEndDate]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleExportCSV = () => {
    if (payments.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Tidak ada data untuk diekspor",
      });
      return;
    }

    const headers = ["Tanggal", "Order ID", "Siswa", "Kelas", "Total", "Biaya Admin", "Metode", "Status"];
    const rows = payments.map((p) => [
      p.paid_at ? format(new Date(p.paid_at), "dd/MM/yyyy HH:mm", { locale: localeId }) : "-",
      p.midtrans_order_id || "-",
      p.students?.name || "-",
      p.students?.class || "-",
      p.total_price,
      p.admin_fee || 0,
      PAYMENT_METHOD_LABELS[p.payment_method || ""] || p.payment_method || "-",
      p.status,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `laporan-midtrans-kasir-${format(new Date(), "yyyyMMdd")}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transaksi Online</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalOnlinePayments || 0}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(summary?.totalOnlineAmount || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">QRIS</CardTitle>
            <QrCode className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.qrisPayments || 0}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(summary?.qrisAmount || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Virtual Account</CardTitle>
            <Building2 className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.vaPayments || 0}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(summary?.vaAmount || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.pendingPayments || 0}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(summary?.pendingAmount || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Select value={period} onValueChange={(v) => { setPeriod(v); setCurrentPage(0); if (v !== "custom") { setCustomStartDate(undefined); setCustomEndDate(undefined); } }}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Periode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Hari Ini</SelectItem>
                  <SelectItem value="yesterday">Kemarin</SelectItem>
                  <SelectItem value="week">7 Hari Terakhir</SelectItem>
                  <SelectItem value="month">Bulan Ini</SelectItem>
                  <SelectItem value="custom">Kustom</SelectItem>
                  <SelectItem value="all">Semua</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Date Pickers */}
            {period === "custom" && (
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-32 justify-start text-left font-normal text-sm",
                        !customStartDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarRange className="h-4 w-4 mr-1" />
                      {customStartDate ? format(customStartDate, "dd/MM/yy") : "Dari"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-50" align="start">
                    <Calendar
                      mode="single"
                      selected={customStartDate}
                      onSelect={(d) => { setCustomStartDate(d); setCurrentPage(0); }}
                      disabled={(date) => (customEndDate ? date > customEndDate : false)}
                      initialFocus
                      className="p-3 pointer-events-auto"
                      locale={localeId}
                    />
                  </PopoverContent>
                </Popover>
                <span className="text-muted-foreground text-sm">-</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-32 justify-start text-left font-normal text-sm",
                        !customEndDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarRange className="h-4 w-4 mr-1" />
                      {customEndDate ? format(customEndDate, "dd/MM/yy") : "Sampai"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-50" align="start">
                    <Calendar
                      mode="single"
                      selected={customEndDate}
                      onSelect={(d) => { setCustomEndDate(d); setCurrentPage(0); }}
                      disabled={(date) => (customStartDate ? date < customStartDate : false)}
                      initialFocus
                      className="p-3 pointer-events-auto"
                      locale={localeId}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div className="flex-1 min-w-[150px]">
              <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setCurrentPage(0); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="success">Sukses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="all">Semua</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[150px]">
              <Select value={filterPaymentMethod} onValueChange={(v) => { setFilterPaymentMethod(v); setCurrentPage(0); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Metode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Metode</SelectItem>
                  <SelectItem value="qris">QRIS</SelectItem>
                  <SelectItem value="bank_transfer">Virtual Account</SelectItem>
                  <SelectItem value="gopay">GoPay</SelectItem>
                  <SelectItem value="shopeepay">ShopeePay</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari siswa atau order ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <Button variant="outline" onClick={handleExportCSV} disabled={payments.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">Belum Ada Transaksi</h3>
              <p className="text-muted-foreground">Tidak ada pembayaran Midtrans pada periode ini</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Waktu</TableHead>
                      <TableHead>Siswa</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Biaya Admin</TableHead>
                      <TableHead>Metode</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow
                        key={payment.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          setSelectedPayment(payment);
                          setShowDetailModal(true);
                        }}
                      >
                        <TableCell>
                          <div className="text-sm">
                            {payment.paid_at
                              ? format(new Date(payment.paid_at), "dd MMM yyyy", { locale: localeId })
                              : "-"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {payment.paid_at
                              ? format(new Date(payment.paid_at), "HH:mm", { locale: localeId })
                              : "-"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{payment.students?.name || "-"}</div>
                          <div className="text-xs text-muted-foreground">
                            {payment.students?.class || "-"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {LAUNDRY_CATEGORIES[payment.category as keyof typeof LAUNDRY_CATEGORIES]?.label || payment.category}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(payment.total_price)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(payment.admin_fee || 0)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <PaymentMethodIcon method={payment.payment_method} />
                            <span className="text-sm">
                              {PAYMENT_METHOD_LABELS[payment.payment_method || ""] || payment.payment_method || "-"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={payment.status} />
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
                    Menampilkan {currentPage * PAGE_SIZE + 1} -{" "}
                    {Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} dari {totalCount}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                      disabled={currentPage === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detail Pembayaran Midtrans</DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Order ID</p>
                  <p className="font-medium">{selectedPayment.midtrans_order_id || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <StatusBadge status={selectedPayment.status} />
                </div>
                <div>
                  <p className="text-muted-foreground">Siswa</p>
                  <p className="font-medium">{selectedPayment.students?.name || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Kelas</p>
                  <p className="font-medium">{selectedPayment.students?.class || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Kategori</p>
                  <p className="font-medium">
                    {LAUNDRY_CATEGORIES[selectedPayment.category as keyof typeof LAUNDRY_CATEGORIES]?.label || selectedPayment.category}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Jumlah</p>
                  <p className="font-medium">
                    {selectedPayment.category === "kiloan"
                      ? `${selectedPayment.weight_kg} kg`
                      : `${selectedPayment.item_count} pcs`}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Metode Pembayaran</p>
                  <div className="flex items-center gap-2">
                    <PaymentMethodIcon method={selectedPayment.payment_method} />
                    <span className="font-medium">
                      {PAYMENT_METHOD_LABELS[selectedPayment.payment_method || ""] || selectedPayment.payment_method || "-"}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground">Waktu Bayar</p>
                  <p className="font-medium">
                    {selectedPayment.paid_at
                      ? format(new Date(selectedPayment.paid_at), "dd MMM yyyy HH:mm", { locale: localeId })
                      : "-"}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Tagihan</span>
                  <span className="font-medium">{formatCurrency(selectedPayment.total_price)}</span>
                </div>
                {(selectedPayment.wadiah_used || 0) > 0 && (
                  <div className="flex justify-between text-purple-600">
                    <span>Wadiah Digunakan</span>
                    <span>- {formatCurrency(selectedPayment.wadiah_used || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between text-orange-600">
                  <span>Biaya Admin Midtrans</span>
                  <span>{formatCurrency(selectedPayment.admin_fee || 0)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total Dibayar</span>
                  <span className="text-primary">
                    {formatCurrency(
                      selectedPayment.total_price -
                        (selectedPayment.wadiah_used || 0) +
                        (selectedPayment.admin_fee || 0)
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
