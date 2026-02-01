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
  PiggyBank,
  ArrowUpCircle,
  ArrowDownCircle,
  Wallet,
  ChevronLeft,
  ChevronRight,
  User,
  TrendingUp,
  Heart,
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
import { cn } from "@/lib/utils";

// Types
interface WadiahTransaction {
  id: string;
  student_id: string;
  transaction_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  notes: string | null;
  order_id: string | null;
  processed_by: string | null;
  created_at: string;
  students: {
    id: string;
    name: string;
    class: string;
    nik: string;
  } | null;
}

interface WadiahBalance {
  id: string;
  student_id: string;
  balance: number;
  total_deposited: number;
  total_used: number;
  total_sedekah: number;
  last_transaction_at: string | null;
  students: {
    id: string;
    name: string;
    class: string;
    nik: string;
  } | null;
}

interface SummaryData {
  totalDeposits: number;
  totalDepositAmount: number;
  totalPayments: number;
  totalPaymentAmount: number;
  totalSedekah: number;
  totalSedekahAmount: number;
  activeBalances: number;
  totalBalance: number;
}

const PAGE_SIZE = 15;

// Transaction type labels and colors
const TRANSACTION_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof ArrowUpCircle }> = {
  deposit: { label: "Deposit Manual", color: "text-green-600 bg-green-50 border-green-200", icon: ArrowUpCircle },
  change_deposit: { label: "Simpan Kembalian", color: "text-blue-600 bg-blue-50 border-blue-200", icon: PiggyBank },
  payment: { label: "Pembayaran", color: "text-red-600 bg-red-50 border-red-200", icon: ArrowDownCircle },
  refund: { label: "Refund", color: "text-orange-600 bg-orange-50 border-orange-200", icon: ArrowUpCircle },
  adjustment: { label: "Penyesuaian", color: "text-purple-600 bg-purple-50 border-purple-200", icon: Wallet },
  sedekah: { label: "Sedekah", color: "text-pink-600 bg-pink-50 border-pink-200", icon: Heart },
};

// Format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

// Transaction type badge
const TransactionTypeBadge = ({ type }: { type: string }) => {
  const config = TRANSACTION_TYPE_CONFIG[type] || { label: type, color: "text-gray-600 bg-gray-50 border-gray-200", icon: Wallet };
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={config.color}>
      <Icon className="h-3 w-3 mr-1" /> {config.label}
    </Badge>
  );
};

interface CashierOption {
  id: string;
  full_name: string;
}

interface CashierWadiahReportProps {
  isAdmin?: boolean;
  cashierList?: CashierOption[];
  currentUserName?: string;
}

export function CashierWadiahReport({ 
  isAdmin = false, 
  cashierList = [],
  currentUserName 
}: CashierWadiahReportProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<WadiahTransaction[]>([]);
  const [balances, setBalances] = useState<WadiahBalance[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  
  // Filters
  const [period, setPeriod] = useState("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"transactions" | "balances">("transactions");
  const [selectedCashier, setSelectedCashier] = useState("me");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  
  // Detail modal
  const [selectedTransaction, setSelectedTransaction] = useState<WadiahTransaction | null>(null);
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange();
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      if (viewMode === "transactions") {
        // Fetch transactions
        let query = supabase
          .from("wadiah_transactions")
          .select(
            `
            id,
            student_id,
            transaction_type,
            amount,
            balance_before,
            balance_after,
            notes,
            order_id,
            processed_by,
            created_at,
            students (id, name, class, nik)
          `,
            { count: "exact" }
          )
          .order("created_at", { ascending: false });

        // Apply date filter
        if (period !== "all") {
          query = query
            .gte("created_at", startDate.toISOString())
            .lt("created_at", endDate.toISOString());
        }

        // Apply type filter
        if (filterType !== "all") {
          query = query.eq("transaction_type", filterType as "deposit" | "change_deposit" | "payment" | "refund" | "adjustment" | "sedekah");
        }

        // Filter by cashier (processed_by)
        if (isAdmin) {
          // Admin can filter by selected cashier
          if (selectedCashier === "me" && user?.id) {
            query = query.eq("processed_by", user.id);
          } else if (selectedCashier !== "all" && selectedCashier !== "me") {
            query = query.eq("processed_by", selectedCashier);
          }
          // "all" means no filter
        } else if (user?.id) {
          // Non-admin only sees their own transactions
          query = query.eq("processed_by", user.id);
        }

        const { data, error, count } = await query.range(from, to);

        if (error) throw error;

        // Filter by search query in memory
        let filteredData = (data || []) as WadiahTransaction[];
        if (searchQuery) {
          const lowerQuery = searchQuery.toLowerCase();
          filteredData = filteredData.filter(
            (t) =>
              t.students?.name?.toLowerCase().includes(lowerQuery) ||
              t.students?.class?.toLowerCase().includes(lowerQuery) ||
              t.students?.nik?.toLowerCase().includes(lowerQuery)
          );
        }

        setTransactions(filteredData);
        setTotalCount(count || 0);
      } else {
        // Fetch balances
        let query = supabase
          .from("student_wadiah_balance")
          .select(
            `
            id,
            student_id,
            balance,
            total_deposited,
            total_used,
            total_sedekah,
            last_transaction_at,
            students (id, name, class, nik)
          `,
            { count: "exact" }
          )
          .gt("balance", 0)
          .order("balance", { ascending: false });

        const { data, error, count } = await query.range(from, to);

        if (error) throw error;

        // Filter by search query in memory
        let filteredData = (data || []) as WadiahBalance[];
        if (searchQuery) {
          const lowerQuery = searchQuery.toLowerCase();
          filteredData = filteredData.filter(
            (b) =>
              b.students?.name?.toLowerCase().includes(lowerQuery) ||
              b.students?.class?.toLowerCase().includes(lowerQuery) ||
              b.students?.nik?.toLowerCase().includes(lowerQuery)
          );
        }

        setBalances(filteredData);
        setTotalCount(count || 0);
      }

      // Fetch summary
      await fetchSummary(startDate, endDate);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memuat data wadiah",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async (startDate: Date, endDate: Date) => {
    try {
      // Fetch transactions for summary
      let txQuery = supabase
        .from("wadiah_transactions")
        .select("transaction_type, amount");

      if (period !== "all") {
        txQuery = txQuery
          .gte("created_at", startDate.toISOString())
          .lt("created_at", endDate.toISOString());
      }

      // Filter by cashier (processed_by)
      if (isAdmin) {
        if (selectedCashier === "me" && user?.id) {
          txQuery = txQuery.eq("processed_by", user.id);
        } else if (selectedCashier !== "all" && selectedCashier !== "me") {
          txQuery = txQuery.eq("processed_by", selectedCashier);
        }
      } else if (user?.id) {
        txQuery = txQuery.eq("processed_by", user.id);
      }

      const { data: txData, error: txError } = await txQuery;

      if (txError) throw txError;

      // Fetch active balances
      const { data: balanceData, error: balanceError } = await supabase
        .from("student_wadiah_balance")
        .select("balance")
        .gt("balance", 0);

      if (balanceError) throw balanceError;

      // Calculate summary
      let totalDeposits = 0, totalDepositAmount = 0;
      let totalPayments = 0, totalPaymentAmount = 0;
      let totalSedekah = 0, totalSedekahAmount = 0;

      (txData || []).forEach((tx) => {
        const type = tx.transaction_type;
        const amount = tx.amount || 0;

        if (type === "deposit" || type === "change_deposit" || type === "refund") {
          totalDeposits++;
          totalDepositAmount += amount;
        } else if (type === "payment") {
          totalPayments++;
          totalPaymentAmount += amount;
        } else if (type === "sedekah") {
          totalSedekah++;
          totalSedekahAmount += amount;
        }
      });

      const activeBalances = (balanceData || []).length;
      const totalBalance = (balanceData || []).reduce((sum, b) => sum + (b.balance || 0), 0);

      setSummary({
        totalDeposits,
        totalDepositAmount,
        totalPayments,
        totalPaymentAmount,
        totalSedekah,
        totalSedekahAmount,
        activeBalances,
        totalBalance,
      });
    } catch (error) {
      console.error("Error fetching summary:", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period, currentPage, filterType, searchQuery, viewMode, selectedCashier, customStartDate, customEndDate]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleExportCSV = () => {
    if (viewMode === "transactions") {
      if (transactions.length === 0) {
        toast({ variant: "destructive", title: "Error", description: "Tidak ada data untuk diekspor" });
        return;
      }

      const headers = ["Tanggal", "Siswa", "Kelas", "Tipe", "Jumlah", "Saldo Sebelum", "Saldo Sesudah", "Catatan"];
      const rows = transactions.map((t) => [
        format(new Date(t.created_at), "dd/MM/yyyy HH:mm", { locale: localeId }),
        t.students?.name || "-",
        t.students?.class || "-",
        TRANSACTION_TYPE_CONFIG[t.transaction_type as keyof typeof TRANSACTION_TYPE_CONFIG]?.label || t.transaction_type,
        t.amount,
        t.balance_before,
        t.balance_after,
        t.notes || "-",
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `laporan-wadiah-transaksi-${format(new Date(), "yyyyMMdd")}.csv`;
      link.click();
    } else {
      if (balances.length === 0) {
        toast({ variant: "destructive", title: "Error", description: "Tidak ada data untuk diekspor" });
        return;
      }

      const headers = ["Siswa", "Kelas", "NIK", "Saldo", "Total Deposit", "Total Digunakan", "Total Sedekah"];
      const rows = balances.map((b) => [
        b.students?.name || "-",
        b.students?.class || "-",
        b.students?.nik || "-",
        b.balance,
        b.total_deposited,
        b.total_used,
        b.total_sedekah,
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `laporan-wadiah-saldo-${format(new Date(), "yyyyMMdd")}.csv`;
      link.click();
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Saldo Aktif</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.activeBalances || 0} siswa</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(summary?.totalBalance || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Deposit</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalDeposits || 0}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(summary?.totalDepositAmount || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Penggunaan</CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalPayments || 0}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(summary?.totalPaymentAmount || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sedekah</CardTitle>
            <Heart className="h-4 w-4 text-pink-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalSedekah || 0}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(summary?.totalSedekahAmount || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            {/* Cashier Filter (Admin Only) */}
            {isAdmin && viewMode === "transactions" && (
              <div className="flex-1 min-w-[180px]">
                <Select value={selectedCashier} onValueChange={(v) => { setSelectedCashier(v); setCurrentPage(0); }}>
                  <SelectTrigger>
                    <User className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Pilih Kasir" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="me">Saya ({currentUserName || "Admin"})</SelectItem>
                    <SelectItem value="all">Semua Kasir</SelectItem>
                    {cashierList.map((cashier) => (
                      <SelectItem key={cashier.id} value={cashier.id}>
                        {cashier.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex-1 min-w-[150px]">
              <Select value={viewMode} onValueChange={(v) => { setViewMode(v as "transactions" | "balances"); setCurrentPage(0); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Tampilan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transactions">Riwayat Transaksi</SelectItem>
                  <SelectItem value="balances">Daftar Saldo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {viewMode === "transactions" && (
              <>
                <div className="flex-1 min-w-[150px]">
                  <Select value={period} onValueChange={(v) => { setPeriod(v); setCurrentPage(0); if (v !== "custom") { setCustomStartDate(undefined); setCustomEndDate(undefined); } }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Periode" />
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
                  <Select value={filterType} onValueChange={(v) => { setFilterType(v); setCurrentPage(0); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tipe Transaksi" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Tipe</SelectItem>
                      <SelectItem value="deposit">Deposit Manual</SelectItem>
                      <SelectItem value="change_deposit">Simpan Kembalian</SelectItem>
                      <SelectItem value="payment">Pembayaran</SelectItem>
                      <SelectItem value="sedekah">Sedekah</SelectItem>
                      <SelectItem value="refund">Refund</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari siswa..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <Button variant="outline" onClick={handleExportCSV}>
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
          ) : viewMode === "transactions" ? (
            transactions.length === 0 ? (
              <div className="text-center py-12">
                <PiggyBank className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium">Belum Ada Transaksi</h3>
                <p className="text-muted-foreground">Tidak ada transaksi wadiah pada periode ini</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Siswa</TableHead>
                        <TableHead>Tipe</TableHead>
                        <TableHead className="text-right">Jumlah</TableHead>
                        <TableHead className="text-right">Saldo Sebelum</TableHead>
                        <TableHead className="text-right">Saldo Sesudah</TableHead>
                        <TableHead>Catatan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx) => (
                        <TableRow
                          key={tx.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            setSelectedTransaction(tx);
                            setShowDetailModal(true);
                          }}
                        >
                          <TableCell>
                            <div className="text-sm">
                              {format(new Date(tx.created_at), "dd MMM yyyy", { locale: localeId })}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(tx.created_at), "HH:mm", { locale: localeId })}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{tx.students?.name || "-"}</div>
                            <div className="text-xs text-muted-foreground">
                              {tx.students?.class || "-"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <TransactionTypeBadge type={tx.transaction_type} />
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            <span className={
                              tx.transaction_type === "payment" ? "text-red-600" : "text-green-600"
                            }>
                              {tx.transaction_type === "payment" ? "-" : "+"}{formatCurrency(tx.amount)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatCurrency(tx.balance_before)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(tx.balance_after)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                            {tx.notes || "-"}
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
            )
          ) : (
            balances.length === 0 ? (
              <div className="text-center py-12">
                <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium">Tidak Ada Saldo Aktif</h3>
                <p className="text-muted-foreground">Tidak ada siswa dengan saldo wadiah aktif</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Siswa</TableHead>
                        <TableHead>Kelas</TableHead>
                        <TableHead>NIK</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead className="text-right">Total Deposit</TableHead>
                        <TableHead className="text-right">Total Digunakan</TableHead>
                        <TableHead className="text-right">Total Sedekah</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {balances.map((balance) => (
                        <TableRow key={balance.id}>
                          <TableCell className="font-medium">{balance.students?.name || "-"}</TableCell>
                          <TableCell>{balance.students?.class || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{balance.students?.nik || "-"}</TableCell>
                          <TableCell className="text-right font-bold text-primary">
                            {formatCurrency(balance.balance)}
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            {formatCurrency(balance.total_deposited)}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {formatCurrency(balance.total_used)}
                          </TableCell>
                          <TableCell className="text-right text-pink-600">
                            {formatCurrency(balance.total_sedekah)}
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
            )
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detail Transaksi Wadiah</DialogTitle>
          </DialogHeader>
          {selectedTransaction && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Siswa</p>
                  <p className="font-medium">{selectedTransaction.students?.name || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Kelas</p>
                  <p className="font-medium">{selectedTransaction.students?.class || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tipe Transaksi</p>
                  <TransactionTypeBadge type={selectedTransaction.transaction_type} />
                </div>
                <div>
                  <p className="text-muted-foreground">Waktu</p>
                  <p className="font-medium">
                    {format(new Date(selectedTransaction.created_at), "dd MMM yyyy HH:mm", { locale: localeId })}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo Sebelum</span>
                  <span>{formatCurrency(selectedTransaction.balance_before)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Jumlah</span>
                  <span className={
                    selectedTransaction.transaction_type === "payment" ? "text-red-600 font-medium" : "text-green-600 font-medium"
                  }>
                    {selectedTransaction.transaction_type === "payment" ? "-" : "+"}{formatCurrency(selectedTransaction.amount)}
                  </span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Saldo Sesudah</span>
                  <span className="text-primary">{formatCurrency(selectedTransaction.balance_after)}</span>
                </div>
              </div>

              {selectedTransaction.notes && (
                <div className="border-t pt-4">
                  <p className="text-muted-foreground text-sm">Catatan</p>
                  <p className="text-sm mt-1">{selectedTransaction.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
