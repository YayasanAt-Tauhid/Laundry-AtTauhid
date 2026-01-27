import { useEffect, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Loader2,
  PiggyBank,
  Wallet,
  TrendingUp,
  TrendingDown,
  Users,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  History,
  ArrowUpCircle,
  ArrowDownCircle,
  Download,
} from "lucide-react";

interface StudentWadiah {
  id: string;
  student_id: string;
  balance: number;
  total_deposited: number;
  total_used: number;
  total_sedekah: number;
  student: {
    id: string;
    name: string;
    class: string;
    nik: string;
    is_active: boolean;
  };
}

interface WadiahTransaction {
  id: string;
  student_id: string;
  transaction_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  notes: string | null;
  created_at: string;
}

interface SummaryStats {
  totalStudentsWithBalance: number;
  totalBalance: number;
  totalDeposited: number;
  totalUsed: number;
}

interface WadiahBalanceRow {
  id: string;
  student_id: string;
  balance: number;
  total_deposited: number;
  total_used: number;
  total_sedekah: number;
  students: {
    id: string;
    name: string;
    class: string;
    nik: string | null;
    is_active: boolean;
  };
}

const PAGE_SIZE = 20;

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getTransactionTypeLabel = (type: string) => {
  switch (type) {
    case "deposit":
      return {
        label: "Top Up",
        color:
          "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
      };
    case "change_deposit":
      return {
        label: "Kembalian",
        color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      };
    case "payment":
      return {
        label: "Pembayaran",
        color:
          "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
      };
    case "sedekah":
      return {
        label: "Sedekah",
        color:
          "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
      };
    case "refund":
      return {
        label: "Refund",
        color:
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
      };
    default:
      return {
        label: type,
        color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
      };
  }
};

export default function WadiahBalance() {
  const { toast } = useToast();
  const [wadiahData, setWadiahData] = useState<StudentWadiah[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [classes, setClasses] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [summaryStats, setSummaryStats] = useState<SummaryStats>({
    totalStudentsWithBalance: 0,
    totalBalance: 0,
    totalDeposited: 0,
    totalUsed: 0,
  });

  // Transaction history dialog
  const [selectedStudent, setSelectedStudent] = useState<StudentWadiah | null>(
    null,
  );
  const [transactions, setTransactions] = useState<WadiahTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);

  const fetchClasses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("students")
        .select("class")
        .eq("is_active", true)
        .order("class");

      if (error) throw error;

      const uniqueClasses = [
        ...new Set((data || []).map((s) => s.class).filter(Boolean)),
      ];
      setClasses(uniqueClasses as string[]);
    } catch (error) {
      console.error("Error fetching classes:", error);
    }
  }, []);

  const fetchSummaryStats = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("student_wadiah_balance")
        .select("balance, total_deposited, total_used");

      if (error) throw error;

      const stats = (data || []).reduce(
        (acc, item) => ({
          totalStudentsWithBalance:
            acc.totalStudentsWithBalance + (item.balance > 0 ? 1 : 0),
          totalBalance: acc.totalBalance + (item.balance || 0),
          totalDeposited: acc.totalDeposited + (item.total_deposited || 0),
          totalUsed: acc.totalUsed + (item.total_used || 0),
        }),
        {
          totalStudentsWithBalance: 0,
          totalBalance: 0,
          totalDeposited: 0,
          totalUsed: 0,
        },
      );

      setSummaryStats(stats);
    } catch (error) {
      console.error("Error fetching summary stats:", error);
    }
  }, []);

  const fetchWadiahData = useCallback(async () => {
    try {
      setLoading(true);

      // First, get students with wadiah balance
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
          students!inner (
            id,
            name,
            class,
            nik,
            is_active
          )
        `,
          { count: "exact" },
        )
        .eq("students.is_active", true)
        .order("balance", { ascending: false });

      // Apply class filter
      if (classFilter !== "all") {
        query = query.eq("students.class", classFilter);
      }

      // Apply pagination
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      // Transform data
      const transformedData: StudentWadiah[] = (
        (data as WadiahBalanceRow[]) || []
      ).map((item) => ({
        id: item.id,
        student_id: item.student_id,
        balance: item.balance || 0,
        total_deposited: item.total_deposited || 0,
        total_used: item.total_used || 0,
        total_sedekah: item.total_sedekah || 0,
        student: {
          id: item.students.id,
          name: item.students.name,
          class: item.students.class,
          nik: item.students.nik || "-",
          is_active: item.students.is_active,
        },
      }));

      setWadiahData(transformedData);
      setTotalCount(count || 0);
    } catch (error) {
      console.error("Error fetching wadiah data:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memuat data saldo wadiah",
      });
    } finally {
      setLoading(false);
    }
  }, [currentPage, classFilter, toast]);

  const fetchTransactions = async (studentId: string) => {
    try {
      setLoadingTransactions(true);

      const { data, error } = await supabase
        .from("wadiah_transactions")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      setTransactions(data || []);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memuat riwayat transaksi",
      });
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    fetchClasses();
    fetchSummaryStats();
  }, [fetchClasses, fetchSummaryStats]);

  useEffect(() => {
    fetchWadiahData();
  }, [fetchWadiahData]);

  useEffect(() => {
    setCurrentPage(0);
  }, [classFilter]);

  const handleViewTransactions = (student: StudentWadiah) => {
    setSelectedStudent(student);
    setTransactionDialogOpen(true);
    fetchTransactions(student.student_id);
  };

  const handleExportCSV = () => {
    if (wadiahData.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Tidak ada data untuk di-export",
      });
      return;
    }

    const headers = [
      "NIK",
      "Nama Siswa",
      "Kelas",
      "Saldo",
      "Total Top Up",
      "Total Terpakai",
    ];
    const rows = wadiahData.map((item) => [
      item.student.nik,
      item.student.name,
      item.student.class,
      item.balance,
      item.total_deposited,
      item.total_used,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `saldo_wadiah_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    toast({
      title: "Export Berhasil",
      description: "File CSV berhasil di-download",
    });
  };

  // Filter by search term (client-side)
  const filteredData = wadiahData.filter((item) => {
    if (!searchTerm.trim()) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      item.student.name.toLowerCase().includes(searchLower) ||
      item.student.nik.toLowerCase().includes(searchLower) ||
      item.student.class.toLowerCase().includes(searchLower)
    );
  });

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <PiggyBank className="h-6 w-6" />
              Cek Saldo Wadiah
            </h1>
            <p className="text-muted-foreground mt-1">
              Lihat saldo wadiah siswa dan riwayat transaksi
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchWadiahData();
                fetchSummaryStats();
              }}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-950">
                  <Users className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Siswa Bersaldo
                  </p>
                  <p className="text-xl font-bold">
                    {summaryStats.totalStudentsWithBalance}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950">
                  <Wallet className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Saldo</p>
                  <p className="text-lg font-bold text-blue-600">
                    {formatCurrency(summaryStats.totalBalance)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Top Up</p>
                  <p className="text-lg font-bold text-emerald-600">
                    {formatCurrency(summaryStats.totalDeposited)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-950">
                  <TrendingDown className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total Terpakai
                  </p>
                  <p className="text-lg font-bold text-orange-600">
                    {formatCurrency(summaryStats.totalUsed)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama, NIK, atau kelas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter Kelas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kelas</SelectItem>
              {classes.map((cls) => (
                <SelectItem key={cls} value={cls}>
                  {cls}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Data Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Data Saldo Wadiah</CardTitle>
              <Badge variant="outline">{totalCount} siswa ditemukan</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <PiggyBank className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">
                  Tidak ada data saldo wadiah
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">No</TableHead>
                      <TableHead>NIK</TableHead>
                      <TableHead>Nama Siswa</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="text-right">Total Top Up</TableHead>
                      <TableHead className="text-right">
                        Total Terpakai
                      </TableHead>
                      <TableHead className="text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {currentPage * PAGE_SIZE + index + 1}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {item.student.nik}
                        </TableCell>
                        <TableCell className="font-medium">
                          {item.student.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.student.class}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`font-semibold ${
                              item.balance > 0
                                ? "text-green-600"
                                : "text-muted-foreground"
                            }`}
                          >
                            {formatCurrency(item.balance)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-emerald-600">
                          {formatCurrency(item.total_deposited)}
                        </TableCell>
                        <TableCell className="text-right text-orange-600">
                          {formatCurrency(item.total_used)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewTransactions(item)}
                          >
                            <History className="h-4 w-4 mr-1" />
                            Riwayat
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>

          {/* Pagination */}
          {totalCount > PAGE_SIZE && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-border">
              <div className="text-sm text-muted-foreground">
                Menampilkan {currentPage * PAGE_SIZE + 1} -{" "}
                {Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} dari{" "}
                {totalCount} siswa
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0 || loading}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Sebelumnya
                </Button>
                <div className="flex items-center gap-1 px-3 py-1 rounded-md bg-muted text-sm font-medium">
                  Halaman {currentPage + 1} dari {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={
                    (currentPage + 1) * PAGE_SIZE >= totalCount || loading
                  }
                >
                  Selanjutnya
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Transaction History Dialog */}
      <Dialog
        open={transactionDialogOpen}
        onOpenChange={setTransactionDialogOpen}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Riwayat Transaksi Wadiah
            </DialogTitle>
          </DialogHeader>

          {selectedStudent && (
            <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
              {/* Student Info */}
              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-lg">
                        {selectedStudent.student.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        NIK: {selectedStudent.student.nik} • Kelas:{" "}
                        {selectedStudent.student.class}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        Saldo Saat Ini
                      </p>
                      <p className="text-xl font-bold text-green-600">
                        {formatCurrency(selectedStudent.balance)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Transactions List */}
              <div className="flex-1 overflow-y-auto">
                {loadingTransactions ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <History className="h-10 w-10 text-muted-foreground/50 mb-2" />
                    <p className="text-muted-foreground">
                      Belum ada riwayat transaksi
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {transactions.map((tx) => {
                      const typeInfo = getTransactionTypeLabel(
                        tx.transaction_type,
                      );
                      const isPositive = tx.amount > 0;

                      return (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`p-2 rounded-full ${
                                isPositive
                                  ? "bg-green-100 dark:bg-green-950"
                                  : "bg-orange-100 dark:bg-orange-950"
                              }`}
                            >
                              {isPositive ? (
                                <ArrowUpCircle className="h-4 w-4 text-green-600" />
                              ) : (
                                <ArrowDownCircle className="h-4 w-4 text-orange-600" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <Badge
                                  className={typeInfo.color}
                                  variant="secondary"
                                >
                                  {typeInfo.label}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(tx.created_at)}
                                </span>
                              </div>
                              {tx.notes && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                                  {tx.notes}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p
                              className={`font-semibold ${
                                isPositive
                                  ? "text-green-600"
                                  : "text-orange-600"
                              }`}
                            >
                              {isPositive ? "+" : ""}
                              {formatCurrency(tx.amount)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Saldo: {formatCurrency(tx.balance_after)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
