import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Search,
  PiggyBank,
  User,
  Wallet,
  TrendingUp,
  TrendingDown,
  History,
  X,
} from "lucide-react";

interface StudentBalance {
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
  };
}

interface Transaction {
  id: string;
  transaction_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  notes: string | null;
  created_at: string;
}

interface CheckBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getTransactionTypeLabel = (type: string) => {
  switch (type) {
    case "deposit":
      return { label: "Setoran", color: "text-green-600", icon: "+" };
    case "change_deposit":
      return { label: "Kembalian", color: "text-emerald-600", icon: "+" };
    case "payment":
      return { label: "Pembayaran", color: "text-red-600", icon: "-" };
    case "sedekah":
      return { label: "Sedekah", color: "text-purple-600", icon: "-" };
    case "withdrawal":
      return { label: "Penarikan", color: "text-orange-600", icon: "-" };
    default:
      return { label: type, color: "text-muted-foreground", icon: "" };
  }
};

export function CheckBalanceDialog({
  open,
  onOpenChange,
}: CheckBalanceDialogProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<StudentBalance[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentBalance | null>(
    null
  );
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSearchResults([]);
      setSelectedStudent(null);
      setTransactions([]);
      setHasSearched(false);
    }
  }, [open]);

  const searchStudents = useCallback(async () => {
    if (!searchQuery.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Masukkan NIK atau nama siswa untuk mencari",
      });
      return;
    }

    setLoading(true);
    setHasSearched(true);
    setSelectedStudent(null);
    setTransactions([]);

    try {
      // Search students first
      const { data: students, error: studentError } = await supabase
        .from("students")
        .select("id, name, class, nik")
        .eq("is_active", true)
        .or(
          `name.ilike.%${searchQuery.trim()}%,nik.ilike.%${searchQuery.trim()}%`
        )
        .limit(10);

      if (studentError) throw studentError;

      if (!students || students.length === 0) {
        setSearchResults([]);
        return;
      }

      // Get wadiah balance for found students
      const studentIds = students.map((s) => s.id);
      const { data: balances, error: balanceError } = await supabase
        .from("student_wadiah_balance")
        .select("*")
        .in("student_id", studentIds);

      if (balanceError) throw balanceError;

      // Map students with their balance
      const results: StudentBalance[] = students.map((student) => {
        const balance = balances?.find((b) => b.student_id === student.id);
        return {
          id: balance?.id || student.id,
          student_id: student.id,
          balance: balance?.balance || 0,
          total_deposited: balance?.total_deposited || 0,
          total_used: balance?.total_used || 0,
          total_sedekah: balance?.total_sedekah || 0,
          student: {
            id: student.id,
            name: student.name,
            class: student.class,
            nik: student.nik || "-",
          },
        };
      });

      setSearchResults(results);
    } catch (error) {
      console.error("Error searching students:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal mencari data siswa",
      });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, toast]);

  const fetchTransactions = useCallback(
    async (studentId: string) => {
      setLoadingTransactions(true);
      try {
        const { data, error } = await supabase
          .from("wadiah_transactions")
          .select("*")
          .eq("student_id", studentId)
          .order("created_at", { ascending: false })
          .limit(10);

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
    },
    [toast]
  );

  const handleSelectStudent = (student: StudentBalance) => {
    setSelectedStudent(student);
    fetchTransactions(student.student_id);
  };

  const handleBack = () => {
    setSelectedStudent(null);
    setTransactions([]);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      searchStudents();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-primary" />
            Cek Saldo Wadiah Siswa
          </DialogTitle>
          <DialogDescription>
            Cari siswa berdasarkan NIK atau nama untuk melihat saldo wadiah
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {!selectedStudent ? (
            <>
              {/* Search Input */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Masukkan NIK atau nama siswa..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="pl-10"
                    autoFocus
                  />
                </div>
                <Button onClick={searchStudents} disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Cari"
                  )}
                </Button>
              </div>

              {/* Search Results */}
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : hasSearched && searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <User className="h-12 w-12 text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">Siswa tidak ditemukan</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Coba cari dengan NIK atau nama yang berbeda
                  </p>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {searchResults.length} siswa ditemukan
                  </p>
                  {searchResults.map((result) => (
                    <div
                      key={result.student_id}
                      className="p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => handleSelectStudent(result)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-primary/10">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{result.student.name}</p>
                            <p className="text-xs text-muted-foreground">
                              NIK: {result.student.nik} • Kelas:{" "}
                              {result.student.class}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p
                            className={`font-bold ${
                              result.balance > 0
                                ? "text-green-600"
                                : "text-muted-foreground"
                            }`}
                          >
                            {formatCurrency(result.balance)}
                          </p>
                          <p className="text-xs text-muted-foreground">Saldo</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Search className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground">
                    Masukkan NIK atau nama siswa
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tekan Enter atau klik Cari untuk mencari
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Student Detail View */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="mb-2"
              >
                <X className="h-4 w-4 mr-1" />
                Kembali ke pencarian
              </Button>

              {/* Student Info Card */}
              <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-emerald-500/10 border border-primary/20">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-full bg-primary/20">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">
                      {selectedStudent.student.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      NIK: {selectedStudent.student.nik} • Kelas:{" "}
                      {selectedStudent.student.class}
                    </p>
                  </div>
                </div>

                {/* Balance Display */}
                <div className="text-center py-4 border-t border-b border-dashed border-primary/30 my-4">
                  <p className="text-sm text-muted-foreground mb-1">
                    Saldo Wadiah Saat Ini
                  </p>
                  <p
                    className={`text-3xl font-bold ${
                      selectedStudent.balance > 0
                        ? "text-green-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    {formatCurrency(selectedStudent.balance)}
                  </p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-background/50">
                    <TrendingUp className="h-4 w-4 text-emerald-600 mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Total Masuk</p>
                    <p className="font-semibold text-emerald-600 text-sm">
                      {formatCurrency(selectedStudent.total_deposited)}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-background/50">
                    <TrendingDown className="h-4 w-4 text-orange-600 mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">
                      Total Terpakai
                    </p>
                    <p className="font-semibold text-orange-600 text-sm">
                      {formatCurrency(selectedStudent.total_used)}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-background/50">
                    <Wallet className="h-4 w-4 text-purple-600 mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Sedekah</p>
                    <p className="font-semibold text-purple-600 text-sm">
                      {formatCurrency(selectedStudent.total_sedekah)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Transaction History */}
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Riwayat Transaksi Terakhir
                </h4>

                {loadingTransactions ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    Belum ada riwayat transaksi
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {transactions.map((tx) => {
                      const typeInfo = getTransactionTypeLabel(
                        tx.transaction_type
                      );
                      return (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-sm"
                        >
                          <div>
                            <Badge variant="outline" className="text-xs">
                              {typeInfo.label}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDate(tx.created_at)}
                            </p>
                            {tx.notes && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {tx.notes}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className={`font-semibold ${typeInfo.color}`}>
                              {typeInfo.icon}
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
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t mt-auto">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
