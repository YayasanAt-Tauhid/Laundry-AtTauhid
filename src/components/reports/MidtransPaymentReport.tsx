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
import { Label } from "@/components/ui/label";
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
  ArrowUpDown,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

interface PaymentMethodStats {
  method: string;
  count: number;
  totalAmount: number;
  totalAdminFee: number;
  averageAmount: number;
}

interface DailyStats {
  date: string;
  transactions: number;
  totalAmount: number;
  totalAdminFee: number;
}

interface SummaryData {
  totalOnlinePayments: number;
  totalOnlineAmount: number;
  totalAdminFees: number;
  averageTransactionAmount: number;
  qrisPayments: number;
  qrisAmount: number;
  qrisAdminFee: number;
  vaPayments: number;
  vaAmount: number;
  vaAdminFee: number;
  ewalletPayments: number;
  ewalletAmount: number;
  ewalletAdminFee: number;
  pendingPayments: number;
  pendingAmount: number;
  successRate: number;
  byPaymentMethod: PaymentMethodStats[];
  dailyStats: DailyStats[];
}

const PAGE_SIZE = 20;

// Payment method labels
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  qris: "QRIS",
  bank_transfer: "Virtual Account (Bank Transfer)",
  gopay: "GoPay",
  shopeepay: "ShopeePay",
  echannel: "Mandiri Bill",
  bca_va: "BCA Virtual Account",
  bni_va: "BNI Virtual Account",
  bri_va: "BRI Virtual Account",
  permata_va: "Permata Virtual Account",
  cimb_va: "CIMB Virtual Account",
  other_va: "Virtual Account Lainnya",
  credit_card: "Kartu Kredit",
  debit_online: "Debit Online",
};

// Check if a payment method is online (Midtrans)
const isOnlinePayment = (method: string | null): boolean => {
  if (!method) return false;
  const cashMethods = ["cash", "manual", "wadiah"];
  return !cashMethods.includes(method.toLowerCase());
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
    case "DITOLAK_MITRA":
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
          <XCircle className="h-3 w-3 mr-1" /> Ditolak
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

export function MidtransPaymentReport() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<MidtransPayment[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  
  // Filters
  const [period, setPeriod] = useState("month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("success");
  const [sortField, setSortField] = useState<string>("paid_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
  // Detail modal
  const [selectedPayment, setSelectedPayment] = useState<MidtransPayment | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const getDateRange = () => {
    const now = new Date();
    let startDate: Date;
    let endDate = new Date(now);

    if (period === "custom" && customStartDate && customEndDate) {
      return {
        startDate: new Date(customStartDate),
        endDate: new Date(customEndDate + "T23:59:59"),
      };
    }

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
      case "quarter":
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1);
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

      // Build base query for online payments
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
        );

      // Filter for online payments only (exclude cash, manual, wadiah)
      query = query.not("payment_method", "in", "(cash,manual,wadiah)");
      
      // Apply status filter
      if (filterStatus === "success") {
        query = query.in("status", ["DIBAYAR", "SELESAI"]);
      } else if (filterStatus === "pending") {
        query = query.eq("status", "MENUNGGU_PEMBAYARAN");
      } else if (filterStatus === "all") {
        // No status filter
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

      // Apply sorting
      const orderColumn = sortField === "paid_at" ? "paid_at" : sortField;
      query = query.order(orderColumn, { ascending: sortDirection === "asc", nullsFirst: false });

      // Execute with pagination
      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      // Filter by search query in memory (Supabase doesn't support cross-table text search well)
      let filteredData = (data || []) as MidtransPayment[];
      if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        filteredData = filteredData.filter(
          (p) =>
            p.students?.name?.toLowerCase().includes(lowerQuery) ||
            p.students?.class?.toLowerCase().includes(lowerQuery) ||
            p.students?.nik?.toLowerCase().includes(lowerQuery) ||
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
        .select("total_price, admin_fee, payment_method, paid_at")
        .in("status", ["DIBAYAR", "SELESAI"])
        .not("payment_method", "in", "(cash,manual,wadiah)")
        .not("paid_at", "is", null);

      // Query for pending payments
      let pendingQuery = supabase
        .from("laundry_orders")
        .select("total_price, admin_fee")
        .eq("status", "MENUNGGU_PEMBAYARAN")
        .not("payment_method", "in", "(cash,manual,wadiah)");

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

      // Calculate by payment method
      const methodStats = new Map<string, PaymentMethodStats>();
      let totalOnlineAmount = 0;
      let totalAdminFees = 0;

      successPayments.forEach((p) => {
        const method = p.payment_method || "unknown";
        const amount = p.total_price || 0;
        const adminFee = p.admin_fee || 0;

        totalOnlineAmount += amount;
        totalAdminFees += adminFee;

        if (!methodStats.has(method)) {
          methodStats.set(method, {
            method,
            count: 0,
            totalAmount: 0,
            totalAdminFee: 0,
            averageAmount: 0,
          });
        }

        const stats = methodStats.get(method)!;
        stats.count++;
        stats.totalAmount += amount;
        stats.totalAdminFee += adminFee;
      });

      // Calculate averages
      methodStats.forEach((stats) => {
        stats.averageAmount = stats.count > 0 ? stats.totalAmount / stats.count : 0;
      });

      // Group by category (QRIS, VA, E-wallet)
      let qrisPayments = 0, qrisAmount = 0, qrisAdminFee = 0;
      let vaPayments = 0, vaAmount = 0, vaAdminFee = 0;
      let ewalletPayments = 0, ewalletAmount = 0, ewalletAdminFee = 0;

      methodStats.forEach((stats, method) => {
        const lowerMethod = method.toLowerCase();
        if (lowerMethod === "qris") {
          qrisPayments = stats.count;
          qrisAmount = stats.totalAmount;
          qrisAdminFee = stats.totalAdminFee;
        } else if (
          lowerMethod.includes("va") ||
          lowerMethod === "bank_transfer" ||
          lowerMethod === "echannel"
        ) {
          vaPayments += stats.count;
          vaAmount += stats.totalAmount;
          vaAdminFee += stats.totalAdminFee;
        } else if (lowerMethod === "gopay" || lowerMethod === "shopeepay") {
          ewalletPayments += stats.count;
          ewalletAmount += stats.totalAmount;
          ewalletAdminFee += stats.totalAdminFee;
        }
      });

      // Calculate daily stats
      const dailyMap = new Map<string, DailyStats>();
      successPayments.forEach((p) => {
        if (!p.paid_at) return;
        const date = p.paid_at.split("T")[0];
        if (!dailyMap.has(date)) {
          dailyMap.set(date, {
            date,
            transactions: 0,
            totalAmount: 0,
            totalAdminFee: 0,
          });
        }
        const stats = dailyMap.get(date)!;
        stats.transactions++;
        stats.totalAmount += p.total_price || 0;
        stats.totalAdminFee += p.admin_fee || 0;
      });

      // Pending totals
      const pendingAmount = pendingPayments.reduce((sum, p) => sum + (p.total_price || 0), 0);

      // Calculate success rate
      const totalAttempts = successPayments.length + pendingPayments.length;
      const successRate = totalAttempts > 0 ? (successPayments.length / totalAttempts) * 100 : 0;

      setSummary({
        totalOnlinePayments: successPayments.length,
        totalOnlineAmount,
        totalAdminFees,
        averageTransactionAmount:
          successPayments.length > 0 ? totalOnlineAmount / successPayments.length : 0,
        qrisPayments,
        qrisAmount,
        qrisAdminFee,
        vaPayments,
        vaAmount,
        vaAdminFee,
        ewalletPayments,
        ewalletAmount,
        ewalletAdminFee,
        pendingPayments: pendingPayments.length,
        pendingAmount,
        successRate,
        byPaymentMethod: Array.from(methodStats.values()).sort(
          (a, b) => b.totalAmount - a.totalAmount
        ),
        dailyStats: Array.from(dailyMap.values()).sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        ),
      });
    } catch (error) {
      console.error("Error fetching summary:", error);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [period, customStartDate, customEndDate, filterPaymentMethod, filterStatus, currentPage, sortField, sortDirection]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [period, filterPaymentMethod, filterStatus, searchQuery]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Export to CSV
  const exportToCSV = () => {
    if (payments.length === 0) {
      toast({
        variant: "destructive",
        title: "Tidak ada data",
        description: "Tidak ada data untuk diexport",
      });
      return;
    }

    const headers = [
      "Midtrans Order ID",
      "Tanggal Bayar",
      "Siswa",
      "Kelas",
      "NIK",
      "Kategori",
      "Total Tagihan",
      "Biaya Admin",
      "Total Dibayar",
      "Metode Pembayaran",
      "Status",
      "Mitra",
    ];

    const rows = payments.map((p) => [
      p.midtrans_order_id || "-",
      p.paid_at ? format(new Date(p.paid_at), "dd/MM/yyyy HH:mm") : "-",
      p.students?.name || "-",
      p.students?.class || "-",
      p.students?.nik || "-",
      p.category,
      p.total_price,
      p.admin_fee || 0,
      (p.total_price || 0) + (p.admin_fee || 0),
      PAYMENT_METHOD_LABELS[p.payment_method || ""] || p.payment_method || "-",
      p.status,
      p.laundry_partners?.name || "-",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => (typeof cell === "string" && cell.includes(",") ? `"${cell}"` : cell)).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `laporan-midtrans-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
    link.click();

    toast({
      title: "Export Berhasil",
      description: "File CSV telah didownload",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Laporan Pembayaran Midtrans</h2>
          <p className="text-sm text-muted-foreground">
            Laporan lengkap transaksi pembayaran online melalui Midtrans
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchPayments} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportToCSV} disabled={loading || payments.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Period Filter */}
            <div className="space-y-2">
              <Label>Periode</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih periode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Hari Ini</SelectItem>
                  <SelectItem value="yesterday">Kemarin</SelectItem>
                  <SelectItem value="week">7 Hari Terakhir</SelectItem>
                  <SelectItem value="month">Bulan Ini</SelectItem>
                  <SelectItem value="quarter">3 Bulan Terakhir</SelectItem>
                  <SelectItem value="year">Tahun Ini</SelectItem>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Date Range */}
            {period === "custom" && (
              <>
                <div className="space-y-2">
                  <Label>Dari Tanggal</Label>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sampai Tanggal</Label>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Payment Method Filter */}
            <div className="space-y-2">
              <Label>Metode Pembayaran</Label>
              <Select value={filterPaymentMethod} onValueChange={setFilterPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua metode" />
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

            {/* Status Filter */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="success">Sukses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="all">Semua Status</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="space-y-2">
              <Label>Cari</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nama, NIK, Order ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Transaksi */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Total Transaksi Online
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalOnlinePayments}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Success rate: {summary.successRate.toFixed(1)}%
              </p>
            </CardContent>
          </Card>

          {/* Total Pendapatan */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Total Pendapatan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(summary.totalOnlineAmount)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Rata-rata: {formatCurrency(summary.averageTransactionAmount)}
              </p>
            </CardContent>
          </Card>

          {/* Total Admin Fee */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Total Biaya Admin
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {formatCurrency(summary.totalAdminFees)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {summary.totalOnlineAmount > 0
                  ? `${((summary.totalAdminFees / summary.totalOnlineAmount) * 100).toFixed(2)}% dari pendapatan`
                  : "0% dari pendapatan"}
              </p>
            </CardContent>
          </Card>

          {/* Pending */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {summary.pendingPayments}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatCurrency(summary.pendingAmount)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payment Method Breakdown */}
      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* QRIS */}
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <QrCode className="h-4 w-4 text-purple-600" />
                QRIS
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transaksi:</span>
                <span className="font-medium">{summary.qrisPayments}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total:</span>
                <span className="font-medium">{formatCurrency(summary.qrisAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Admin Fee:</span>
                <span className="font-medium text-orange-600">{formatCurrency(summary.qrisAdminFee)}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Fee: 0.7% per transaksi
              </div>
            </CardContent>
          </Card>

          {/* Virtual Account */}
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                Virtual Account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transaksi:</span>
                <span className="font-medium">{summary.vaPayments}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total:</span>
                <span className="font-medium">{formatCurrency(summary.vaAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Admin Fee:</span>
                <span className="font-medium text-orange-600">{formatCurrency(summary.vaAdminFee)}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Fee: Rp 4.400 per transaksi
              </div>
            </CardContent>
          </Card>

          {/* E-Wallet */}
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Wallet className="h-4 w-4 text-green-600" />
                E-Wallet
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transaksi:</span>
                <span className="font-medium">{summary.ewalletPayments}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total:</span>
                <span className="font-medium">{formatCurrency(summary.ewalletAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Admin Fee:</span>
                <span className="font-medium text-orange-600">{formatCurrency(summary.ewalletAdminFee)}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                GoPay, ShopeePay, dll
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Detail Transaksi ({totalCount} transaksi)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Tidak ada transaksi online ditemukan
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal Bayar</TableHead>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Siswa</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Admin Fee</TableHead>
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
                        <TableCell className="whitespace-nowrap">
                          {payment.paid_at
                            ? format(new Date(payment.paid_at), "dd MMM yyyy HH:mm", { locale: localeId })
                            : "-"}
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[120px] truncate">
                          {payment.midtrans_order_id || "-"}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{payment.students?.name || "-"}</div>
                            <div className="text-xs text-muted-foreground">
                              {payment.students?.class || "-"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="capitalize">{payment.category.replace("_", " ")}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(payment.total_price)}
                        </TableCell>
                        <TableCell className="text-right text-orange-600">
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
                  <div className="text-sm text-muted-foreground">
                    Halaman {currentPage + 1} dari {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage === 0}
                      onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages - 1}
                      onClick={() => setCurrentPage((p) => p + 1)}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detail Transaksi Midtrans</DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4">
              {/* Order Info */}
              <div className="space-y-2">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Midtrans Order ID</span>
                  <span className="font-mono text-sm">{selectedPayment.midtrans_order_id || "-"}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Status</span>
                  <StatusBadge status={selectedPayment.status} />
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Tanggal Bayar</span>
                  <span>
                    {selectedPayment.paid_at
                      ? format(new Date(selectedPayment.paid_at), "dd MMM yyyy HH:mm:ss", { locale: localeId })
                      : "-"}
                  </span>
                </div>
              </div>

              {/* Student Info */}
              <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                <h4 className="font-medium">Info Siswa</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Nama:</span>
                  <span>{selectedPayment.students?.name || "-"}</span>
                  <span className="text-muted-foreground">Kelas:</span>
                  <span>{selectedPayment.students?.class || "-"}</span>
                  <span className="text-muted-foreground">NIK:</span>
                  <span>{selectedPayment.students?.nik || "-"}</span>
                </div>
              </div>

              {/* Payment Info */}
              <div className="space-y-2">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Kategori</span>
                  <span className="capitalize">{selectedPayment.category.replace("_", " ")}</span>
                </div>
                {selectedPayment.weight_kg && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Berat</span>
                    <span>{selectedPayment.weight_kg} kg</span>
                  </div>
                )}
                {selectedPayment.item_count && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Jumlah Item</span>
                    <span>{selectedPayment.item_count} item</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Metode Pembayaran</span>
                  <div className="flex items-center gap-2">
                    <PaymentMethodIcon method={selectedPayment.payment_method} />
                    <span>
                      {PAYMENT_METHOD_LABELS[selectedPayment.payment_method || ""] ||
                        selectedPayment.payment_method ||
                        "-"}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Mitra Laundry</span>
                  <span>{selectedPayment.laundry_partners?.name || "-"}</span>
                </div>
              </div>

              {/* Amount Breakdown */}
              <div className="bg-primary/5 p-3 rounded-lg space-y-2">
                <h4 className="font-medium">Rincian Pembayaran</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Tagihan Laundry</span>
                    <span>{formatCurrency(selectedPayment.total_price)}</span>
                  </div>
                  {(selectedPayment.wadiah_used || 0) > 0 && (
                    <div className="flex justify-between text-blue-600">
                      <span>Wadiah Digunakan</span>
                      <span>-{formatCurrency(selectedPayment.wadiah_used || 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-orange-600">
                    <span>Biaya Admin Midtrans</span>
                    <span>{formatCurrency(selectedPayment.admin_fee || 0)}</span>
                  </div>
                  <div className="flex justify-between font-bold pt-2 border-t">
                    <span>Total Dibayar</span>
                    <span>
                      {formatCurrency(
                        selectedPayment.total_price -
                          (selectedPayment.wadiah_used || 0) +
                          (selectedPayment.admin_fee || 0)
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
