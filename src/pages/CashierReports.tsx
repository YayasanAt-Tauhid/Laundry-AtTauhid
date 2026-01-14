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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Loader2,
  TrendingUp,
  Package,
  DollarSign,
  Download,
  Search,
  Calendar,
  CreditCard,
  Banknote,
  User,
  Clock,
  CheckCircle2,
  Printer,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { LAUNDRY_CATEGORIES } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PaymentRecord {
  id: string;
  category: string;
  weight_kg: number | null;
  item_count: number | null;
  total_price: number;
  admin_fee: number;
  payment_method: string;
  status: string;
  paid_at: string;
  created_at: string;
  laundry_date: string;
  wadiah_used: number | null;
  change_amount: number | null;
  paid_amount: number | null;
  students: {
    id: string;
    name: string;
    class: string;
  };
  laundry_partners: {
    name: string;
  };
}

interface DailyStats {
  date: string;
  totalTransactions: number;
  totalAmount: number;
  cashAmount: number;
  transferAmount: number;
}

interface SummaryData {
  totalTransactions: number;
  totalAmount: number;
  cashTransactions: number;
  cashAmount: number;
  transferTransactions: number;
  transferAmount: number;
  byCategory: Record<string, { count: number; amount: number }>;
  byClass: Record<string, { count: number; amount: number }>;
}

const PAGE_SIZE = 20;

export default function CashierReports() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [summary, setSummary] = useState<SummaryData>({
    totalTransactions: 0,
    totalAmount: 0,
    cashTransactions: 0,
    cashAmount: 0,
    transferTransactions: 0,
    transferAmount: 0,
    byCategory: {},
    byClass: {},
  });
  const [totalCount, setTotalCount] = useState(0);
  const [period, setPeriod] = useState("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("all");
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(
    null,
  );
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  const getDateRange = () => {
    const now = new Date();
    let startDate: Date;
    let endDate = new Date(now);

    switch (period) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "yesterday":
        startDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - 1,
        );
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
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

      // 1. Fetch Paginated Data
      let query = supabase
        .from("laundry_orders")
        .select(
          `
                  id,
                  category,
                  weight_kg,
                  item_count,
                  total_price,
                  admin_fee,
                  payment_method,
                  status,
                  paid_at,
                  created_at,
                  laundry_date,
                  wadiah_used,
                  change_amount,
                  paid_amount,
                  students!inner (id, name, class),
                  laundry_partners (name)
                `,
          { count: "exact" },
        )
        .in("status", ["DIBAYAR", "SELESAI"])
        .not("paid_at", "is", null)
        .order("paid_at", { ascending: false });

      // Apply filters to main query
      if (period !== "all") {
        query = query
          .gte("paid_at", startDate.toISOString())
          .lt("paid_at", endDate.toISOString());
      }

      if (filterPaymentMethod !== "all") {
        query = query.eq("payment_method", filterPaymentMethod);
      }

      if (searchQuery) {
        query = query.or(
          `name.ilike.%${searchQuery}%,class.ilike.%${searchQuery}%`,
          { foreignTable: "students" },
        );
      }

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      const paymentsData = (data || []) as any[];
      setPayments(paymentsData);
      setTotalCount(count || 0);

      // 2. Calculate Summary (Need specific fields from ALL matching rows)
      // We create a separate query with the same filters but no range/pagination
      let summaryQuery = supabase
        .from("laundry_orders")
        .select(
          `
                    total_price,
                    payment_method,
                    category,
                    students!inner (class)
                `,
        )
        .in("status", ["DIBAYAR", "SELESAI"])
        .not("paid_at", "is", null);

      if (period !== "all") {
        summaryQuery = summaryQuery
          .gte("paid_at", startDate.toISOString())
          .lt("paid_at", endDate.toISOString());
      }

      if (filterPaymentMethod !== "all") {
        summaryQuery = summaryQuery.eq("payment_method", filterPaymentMethod);
      }

      if (searchQuery) {
        summaryQuery = summaryQuery.or(
          `name.ilike.%${searchQuery}%,class.ilike.%${searchQuery}%`,
          { foreignTable: "students" },
        );
      }

      const { data: summaryRows, error: summaryError } = await summaryQuery;

      if (summaryError) {
        console.error("Error fetching summary:", summaryError);
      } else {
        const currentSummary: SummaryData = {
          totalTransactions: summaryRows?.length || 0,
          totalAmount: 0,
          cashTransactions: 0,
          cashAmount: 0,
          transferTransactions: 0,
          transferAmount: 0,
          byCategory: {},
          byClass: {},
        };

        (summaryRows || []).forEach((payment: any) => {
          currentSummary.totalAmount += payment.total_price;

          // By payment method
          if (payment.payment_method === "cash") {
            currentSummary.cashTransactions++;
            currentSummary.cashAmount += payment.total_price;
          } else {
            currentSummary.transferTransactions++;
            currentSummary.transferAmount += payment.total_price;
          }

          // By category
          const cat = payment.category;
          if (!currentSummary.byCategory[cat]) {
            currentSummary.byCategory[cat] = { count: 0, amount: 0 };
          }
          currentSummary.byCategory[cat].count++;
          currentSummary.byCategory[cat].amount += payment.total_price;

          // By class
          const cls = payment.students?.class || "Unknown";
          if (!currentSummary.byClass[cls]) {
            currentSummary.byClass[cls] = { count: 0, amount: 0 };
          }
          currentSummary.byClass[cls].count++;
          currentSummary.byClass[cls].amount += payment.total_price;
        });

        setSummary(currentSummary);
      }
    } catch (error) {
      console.error("Error fetching payments:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memuat data pembayaran",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [period, currentPage, filterPaymentMethod, searchQuery]); // Re-fetch on any filter change

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatLaundryDate = (date: string) => {
    return new Date(date + "T00:00:00").toLocaleDateString("id-ID", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const handlePrintReceipt = (payment: PaymentRecord) => {
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

    const receiptNumber = `RCP-${payment.id.slice(0, 8).toUpperCase()}`;
    const paidDate = new Date(payment.paid_at);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Kwitansi - ${receiptNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Courier New', monospace;
            padding: 10mm;
            max-width: 80mm;
            margin: 0 auto;
          }
          .receipt { width: 100%; }
          .header { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
          .header h1 { font-size: 16px; font-weight: bold; }
          .header p { font-size: 11px; margin-top: 4px; }
          .info { margin: 10px 0; font-size: 11px; }
          .info-row { display: flex; justify-content: space-between; margin: 3px 0; }
          .divider { border-top: 1px dashed #000; margin: 10px 0; }
          .items { margin: 10px 0; }
          .item { font-size: 11px; margin: 5px 0; }
          .item-name { font-weight: bold; }
          .item-detail { display: flex; justify-content: space-between; }
          .total-section { border-top: 1px dashed #000; padding-top: 10px; margin-top: 10px; }
          .total-row { display: flex; justify-content: space-between; font-size: 12px; margin: 3px 0; }
          .total-row.grand { font-size: 14px; font-weight: bold; margin-top: 5px; }
          .footer { text-align: center; margin-top: 15px; font-size: 10px; border-top: 1px dashed #000; padding-top: 10px; }
          @media print {
            body { padding: 0; }
            @page { margin: 5mm; size: 80mm auto; }
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <h1>LAUNDRY AT-TAUHID</h1>
            <p>Pondok Pesantren At-Tauhid</p>
            <p>Kwitansi Pembayaran</p>
          </div>

          <div class="info">
            <div class="info-row">
              <span>No. Kwitansi:</span>
              <span>${receiptNumber}</span>
            </div>
            <div class="info-row">
              <span>Tanggal Bayar:</span>
              <span>${paidDate.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
            </div>
            <div class="info-row">
              <span>Waktu:</span>
              <span>${paidDate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div class="info-row">
              <span>Kasir:</span>
              <span>${profile?.full_name || "-"}</span>
            </div>
          </div>

          <div class="divider"></div>

          <div class="info">
            <div class="info-row">
              <span>Siswa:</span>
              <span>${payment.students?.name || "-"}</span>
            </div>
            <div class="info-row">
              <span>Kelas:</span>
              <span>${payment.students?.class || "-"}</span>
            </div>
            <div class="info-row">
              <span>Tgl Laundry:</span>
              <span>${formatLaundryDate(payment.laundry_date)}</span>
            </div>
          </div>

          <div class="divider"></div>

          <div class="items">
            <div class="item">
              <div class="item-name">${LAUNDRY_CATEGORIES[payment.category as keyof typeof LAUNDRY_CATEGORIES]?.label || payment.category}</div>
              <div class="item-detail">
                <span>${payment.category === "kiloan" ? `${payment.weight_kg} kg` : `${payment.item_count} pcs`}</span>
                <span>${formatCurrency(payment.total_price)}</span>
              </div>
              <div style="font-size: 10px; color: #666;">Mitra: ${payment.laundry_partners?.name || "-"}</div>
            </div>
          </div>

          <div class="total-section">
            <div class="total-row">
              <span>Subtotal:</span>
              <span>${formatCurrency(payment.total_price)}</span>
            </div>
            ${
              payment.wadiah_used && payment.wadiah_used > 0
                ? `
            <div class="total-row">
              <span>Wadiah Digunakan:</span>
              <span>- ${formatCurrency(payment.wadiah_used)}</span>
            </div>
            `
                : ""
            }
            <div class="total-row grand">
              <span>TOTAL:</span>
              <span>${formatCurrency(payment.total_price - (payment.wadiah_used || 0))}</span>
            </div>
            ${
              payment.paid_amount
                ? `
            <div class="total-row">
              <span>Dibayar:</span>
              <span>${formatCurrency(payment.paid_amount)}</span>
            </div>
            `
                : ""
            }
            ${
              payment.change_amount && payment.change_amount > 0
                ? `
            <div class="total-row">
              <span>Kembalian:</span>
              <span>${formatCurrency(payment.change_amount)}</span>
            </div>
            `
                : ""
            }
            <div class="total-row">
              <span>Metode:</span>
              <span>${payment.payment_method === "cash" ? "TUNAI" : "TRANSFER"}</span>
            </div>
          </div>

          <div class="footer">
            <p>Terima kasih atas kepercayaan Anda</p>
            <p>Semoga berkah & bermanfaat</p>
            <p style="margin-top: 8px;">--- LUNAS ---</p>
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() {
              window.close();
            };
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  /* Client-side filter removed in favor of Server-side filter */

  const handleViewDetail = (payment: PaymentRecord) => {
    setSelectedPayment(payment);
    setShowDetailModal(true);
  };

  const handleExportCSV = () => {
    const headers = [
      "Tanggal",
      "Jam",
      "Siswa",
      "Kelas",
      "Kategori",
      "Jumlah",
      "Total",
      "Metode",
    ];
    // NOTE: Currently exports only visible page. Should be enhanced to fetch all.
    const rows = payments.map((p) => [
      formatDate(p.paid_at),
      formatTime(p.paid_at),
      p.students?.name || "-",
      p.students?.class || "-",
      LAUNDRY_CATEGORIES[p.category as keyof typeof LAUNDRY_CATEGORIES]
        ?.label || p.category,
      p.category === "kiloan" ? `${p.weight_kg} kg` : `${p.item_count} pcs`,
      p.total_price,
      p.payment_method === "cash" ? "Tunai" : "Transfer",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `laporan-pembayaran-${period}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    toast({
      title: "Export berhasil",
      description: "Laporan telah diunduh dalam format CSV",
    });
  };

  const handlePrintReport = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const { startDate, endDate } = getDateRange();
    const periodLabel =
      period === "today"
        ? "Hari Ini"
        : period === "yesterday"
          ? "Kemarin"
          : period === "week"
            ? "7 Hari Terakhir"
            : period === "month"
              ? "Bulan Ini"
              : "Semua Waktu";

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Laporan Pembayaran - ${periodLabel}</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              padding: 30px;
              font-size: 12px;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 2px solid #333;
              padding-bottom: 20px;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
            }
            .header p {
              margin: 5px 0;
              color: #666;
            }
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 15px;
              margin-bottom: 30px;
            }
            .summary-card {
              background: #f5f5f5;
              padding: 15px;
              border-radius: 8px;
              text-align: center;
            }
            .summary-card h3 {
              margin: 0;
              font-size: 11px;
              color: #666;
              text-transform: uppercase;
            }
            .summary-card p {
              margin: 5px 0 0;
              font-size: 18px;
              font-weight: bold;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
            }
            th {
              background: #f5f5f5;
              font-weight: 600;
            }
            tr:nth-child(even) {
              background: #fafafa;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #ddd;
              display: flex;
              justify-content: space-between;
              font-size: 11px;
              color: #666;
            }
            .method-cash { color: #16a34a; }
            .method-transfer { color: #2563eb; }
            @media print {
              body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🧺 At-Tauhid Laundry</h1>
            <p>Laporan Pembayaran Kasir</p>
            <p><strong>Periode: ${periodLabel}</strong></p>
            <p>Dicetak: ${formatDateTime(new Date().toISOString())}</p>
            <p>Kasir: ${profile?.full_name || "-"}</p>
          </div>

          <div class="summary-grid">
            <div class="summary-card">
              <h3>Total Transaksi</h3>
              <p>${summary.totalTransactions}</p>
            </div>
            <div class="summary-card">
              <h3>Total Pembayaran</h3>
              <p>${formatCurrency(summary.totalAmount)}</p>
            </div>
            <div class="summary-card">
              <h3>Pembayaran Tunai</h3>
              <p class="method-cash">${formatCurrency(summary.cashAmount)}</p>
            </div>
          </div>

          <h3>Detail Transaksi ({totalCount} transaksi - Halaman ini)</h3>
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Tanggal/Jam</th>
                <th>Siswa</th>
                <th>Kelas</th>
                <th>Kategori</th>
                <th>Jumlah</th>
                <th>Total</th>
                <th>Metode</th>
              </tr>
            </thead>
            <tbody>
              ${payments
                .map(
                  (p, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${formatDate(p.paid_at)} ${formatTime(p.paid_at)}</td>
                  <td>${p.students?.name || "-"}</td>
                  <td>${p.students?.class || "-"}</td>
                  <td>${LAUNDRY_CATEGORIES[p.category as keyof typeof LAUNDRY_CATEGORIES]?.label || p.category}</td>
                  <td>${p.category === "kiloan" ? `${p.weight_kg} kg` : `${p.item_count} pcs`}</td>
                  <td>${formatCurrency(p.total_price)}</td>
                  <td class="${p.payment_method === "cash" ? "method-cash" : "method-transfer"}">
                    ${p.payment_method === "cash" ? "Tunai" : "Transfer"}
                  </td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>

          <div class="footer">
            <span>At-Tauhid Laundry - Sistem Laundry Sekolah</span>
            <span>Halaman 1</span>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-7 w-7 text-primary" />
              Laporan Pembayaran
            </h1>
            <p className="text-muted-foreground mt-1">
              Riwayat dan ringkasan pembayaran yang telah diproses
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Select
              value={period}
              onValueChange={(val) => {
                setPeriod(val);
                setCurrentPage(0);
              }}
            >
              <SelectTrigger className="w-44">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Periode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hari Ini</SelectItem>
                <SelectItem value="yesterday">Kemarin</SelectItem>
                <SelectItem value="week">7 Hari Terakhir</SelectItem>
                <SelectItem value="month">Bulan Ini</SelectItem>
                <SelectItem value="all">Semua Waktu</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={handlePrintReport}>
              <Printer className="h-4 w-4 mr-2" />
              Cetak
            </Button>
            <Button variant="outline" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="dashboard-card bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Total Transaksi
                      </p>
                      <p className="text-2xl font-bold mt-1">
                        {summary.totalTransactions}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-primary/20 text-primary">
                      <Package className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="dashboard-card bg-gradient-to-br from-emerald-500/10 to-green-500/5 border-emerald-500/20">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Total Pembayaran
                      </p>
                      <p className="text-2xl font-bold mt-1 text-emerald-600">
                        {formatCurrency(summary.totalAmount)}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-600">
                      <TrendingUp className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="dashboard-card bg-gradient-to-br from-green-500/10 to-lime-500/5 border-green-500/20">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Pembayaran Tunai
                      </p>
                      <p className="text-2xl font-bold mt-1 text-green-600">
                        {formatCurrency(summary.cashAmount)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {summary.cashTransactions} transaksi
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-green-500/20 text-green-600">
                      <Banknote className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="dashboard-card bg-gradient-to-br from-blue-500/10 to-indigo-500/5 border-blue-500/20">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Pembayaran Transfer
                      </p>
                      <p className="text-2xl font-bold mt-1 text-blue-600">
                        {formatCurrency(summary.transferAmount)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {summary.transferTransactions} transaksi
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-500/20 text-blue-600">
                      <CreditCard className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Statistics Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* By Category */}
              <Card className="dashboard-card">
                <CardHeader>
                  <CardTitle className="text-lg">
                    Per Kategori Laundry
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(summary.byCategory).length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      Tidak ada data
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(summary.byCategory)
                        .sort((a, b) => b[1].amount - a[1].amount)
                        .map(([category, data]) => (
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
                                {data.count} transaksi
                              </p>
                            </div>
                            <p className="font-bold text-primary">
                              {formatCurrency(data.amount)}
                            </p>
                          </div>
                        ))}
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
                  {Object.keys(summary.byClass).length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      Tidak ada data
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {Object.entries(summary.byClass)
                        .sort((a, b) => b[1].amount - a[1].amount)
                        .map(([cls, data]) => (
                          <div
                            key={cls}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                          >
                            <div>
                              <p className="font-medium">Kelas {cls}</p>
                              <p className="text-sm text-muted-foreground">
                                {data.count} transaksi
                              </p>
                            </div>
                            <p className="font-bold text-primary">
                              {formatCurrency(data.amount)}
                            </p>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Search and Filter */}
            <Card className="dashboard-card">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Cari nama siswa atau kelas..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(0);
                      }}
                      className="pl-10"
                    />
                  </div>
                  <Select
                    value={filterPaymentMethod}
                    onValueChange={(val) => {
                      setFilterPaymentMethod(val);
                      setCurrentPage(0);
                    }}
                  >
                    <SelectTrigger className="w-full md:w-48">
                      <SelectValue placeholder="Metode Pembayaran" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Metode</SelectItem>
                      <SelectItem value="cash">Tunai</SelectItem>
                      <SelectItem value="bank_transfer">Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Transactions Table */}
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  Riwayat Transaksi ({totalCount})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {payments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <DollarSign className="h-16 w-16 text-muted-foreground/30 mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">
                      Belum ada transaksi
                    </h3>
                    <p className="text-muted-foreground text-center">
                      Transaksi pembayaran akan muncul di sini
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                              Waktu Bayar
                            </th>
                            <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                              Tgl Laundry
                            </th>
                            <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                              Siswa
                            </th>
                            <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                              Kategori
                            </th>
                            <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                              Jumlah
                            </th>
                            <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                              Total
                            </th>
                            <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                              Metode
                            </th>
                            <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                              Aksi
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((payment) => (
                            <tr
                              key={payment.id}
                              className="border-b hover:bg-muted/50 transition-colors"
                            >
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <Clock className="h-4 w-4 text-muted-foreground" />
                                  <div>
                                    <p className="text-sm font-medium">
                                      {formatDate(payment.paid_at)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatTime(payment.paid_at)}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <p className="text-sm">
                                  {formatLaundryDate(payment.laundry_date)}
                                </p>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <User className="h-4 w-4 text-muted-foreground" />
                                  <div>
                                    <p className="font-medium">
                                      {payment.students?.name || "-"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Kelas {payment.students?.class || "-"}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <span className="px-2 py-1 bg-primary/10 text-primary rounded-md text-sm">
                                  {LAUNDRY_CATEGORIES[
                                    payment.category as keyof typeof LAUNDRY_CATEGORIES
                                  ]?.label || payment.category}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-sm">
                                {payment.category === "kiloan"
                                  ? `${payment.weight_kg} kg`
                                  : `${payment.item_count} pcs`}
                              </td>
                              <td className="py-3 px-4">
                                <p className="font-bold text-emerald-600">
                                  {formatCurrency(payment.total_price)}
                                </p>
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                                    payment.payment_method === "cash"
                                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                  }`}
                                >
                                  {payment.payment_method === "cash" ? (
                                    <>
                                      <Banknote className="h-3 w-3" />
                                      Tunai
                                    </>
                                  ) : (
                                    <>
                                      <CreditCard className="h-3 w-3" />
                                      Transfer
                                    </>
                                  )}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleViewDetail(payment)}
                                  >
                                    Detail
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handlePrintReceipt(payment)}
                                    title="Cetak Kwitansi"
                                  >
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Pagination */}
                    {totalCount > PAGE_SIZE && (
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-4 border-t border-border">
                        <div className="text-sm text-muted-foreground">
                          Menampilkan {currentPage * PAGE_SIZE + 1} -{" "}
                          {Math.min((currentPage + 1) * PAGE_SIZE, totalCount)}{" "}
                          dari {totalCount} transaksi
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setCurrentPage((p) => Math.max(0, p - 1))
                            }
                            disabled={currentPage === 0}
                          >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Sebelumnya
                          </Button>
                          <div className="flex items-center gap-1 px-3 py-1 rounded-md bg-muted text-sm font-medium">
                            Halaman {currentPage + 1} dari{" "}
                            {Math.ceil(totalCount / PAGE_SIZE)}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((p) => p + 1)}
                            disabled={
                              (currentPage + 1) * PAGE_SIZE >= totalCount
                            }
                          >
                            Selanjutnya
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Detail Modal */}
        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Detail Pembayaran
              </DialogTitle>
            </DialogHeader>

            {selectedPayment && (
              <div className="space-y-4 py-4">
                <div className="bg-muted/50 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span className="text-emerald-600 font-medium">
                      ✓ Dibayar
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Tanggal Laundry
                    </span>
                    <span className="font-medium">
                      {formatLaundryDate(selectedPayment.laundry_date)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tanggal Bayar</span>
                    <span>{formatDateTime(selectedPayment.paid_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Metode</span>
                    <span>
                      {selectedPayment.payment_method === "cash"
                        ? "Tunai"
                        : "Transfer"}
                    </span>
                  </div>
                  {selectedPayment.wadiah_used &&
                    selectedPayment.wadiah_used > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Wadiah Digunakan
                        </span>
                        <span className="text-blue-600 font-medium">
                          {formatCurrency(selectedPayment.wadiah_used)}
                        </span>
                      </div>
                    )}
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Informasi Siswa</h4>
                  <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Nama</span>
                      <span>{selectedPayment.students?.name || "-"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Kelas</span>
                      <span>{selectedPayment.students?.class || "-"}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Detail Laundry</h4>
                  <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Kategori</span>
                      <span>
                        {LAUNDRY_CATEGORIES[
                          selectedPayment.category as keyof typeof LAUNDRY_CATEGORIES
                        ]?.label || selectedPayment.category}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Jumlah</span>
                      <span>
                        {selectedPayment.category === "kiloan"
                          ? `${selectedPayment.weight_kg} kg`
                          : `${selectedPayment.item_count} pcs`}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Mitra</span>
                      <span>
                        {selectedPayment.laundry_partners?.name || "-"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-medium">
                      Total Pembayaran
                    </span>
                    <span className="text-2xl font-bold text-emerald-600">
                      {formatCurrency(selectedPayment.total_price)}
                    </span>
                  </div>
                </div>

                <div className="pt-4">
                  <Button
                    className="w-full"
                    onClick={() => handlePrintReceipt(selectedPayment)}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Cetak Kwitansi
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
