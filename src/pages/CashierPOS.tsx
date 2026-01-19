import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMidtrans } from "@/hooks/useMidtrans";
import { useWadiah } from "@/hooks/useWadiah";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CreditCard,
  Search,
  Loader2,
  CheckCircle2,
  Receipt,
  Printer,
  User,
  X,
  Banknote,
  AlertCircle,
  Calculator,
  Wallet,
  PiggyBank,
} from "lucide-react";
import { LAUNDRY_CATEGORIES, type OrderStatus } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SyariahPolicyInfo,
  SyariahPaymentDialog,
  WadiahBalanceCard,
  WadiahDepositDialog,
  type SyariahPaymentData,
} from "@/components/syariah";

interface Bill {
  id: string;
  category: string;
  weight_kg: number | null;
  item_count: number | null;
  total_price: number;
  admin_fee: number;
  payment_method: string | null;
  status: OrderStatus;
  created_at: string;
  laundry_date: string;
  students: {
    id: string;
    name: string;
    class: string;
    nik: string;
  };
  laundry_partners: {
    name: string;
  };
}

interface StudentBillGroup {
  studentId: string;
  studentName: string;
  studentClass: string;
  studentNik: string;
  bills: Bill[];
  totalAmount: number;
}

interface PaymentReceipt {
  receiptNumber: string;
  date: string;
  time: string;
  cashierName: string;
  studentName: string;
  studentClass: string;
  items: {
    category: string;
    quantity: string;
    price: number;
  }[];
  subtotal: number;
  paymentMethod: string;
  total: number;
  paidAmount: number;
  changeAmount: number;
  wadiahUsed?: number;
  roundingDiscount?: number;
  wadiahDeposited?: number;
}

interface StudentSuggestion {
  id: string;
  name: string;
  class: string;
  nik: string;
}

export default function CashierPOS() {
  const { toast } = useToast();
  const { profile, user } = useAuth();
  const { confirmPaymentManually, isProcessing } = useMidtrans();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [selectedBills, setSelectedBills] = useState<Set<string>>(new Set());
  const [processingPayment, setProcessingPayment] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [allClasses, setAllClasses] = useState<string[]>([]);

  // Autocomplete states
  const [suggestions, setSuggestions] = useState<StudentSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Payment modal states - Syariah
  const [showSyariahPaymentDialog, setShowSyariahPaymentDialog] =
    useState(false);
  const [showWadiahDepositDialog, setShowWadiahDepositDialog] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">(
    "cash",
  );
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const receiptRef = useRef<HTMLDivElement>(null);

  // Wadiah hook for syariah transactions
  const {
    depositChange,
    applyBalanceForPayment,
    recordSedekah,
    formatCurrency: formatWadiahCurrency,
  } = useWadiah();

  // Fetch available classes on mount (lightweight query)
  useEffect(() => {
    const fetchClasses = async () => {
      const { data } = await supabase
        .from("students")
        .select("class")
        .order("class");
      if (data) {
        const uniqueClasses = [
          ...new Set(data.map((s) => s.class).filter(Boolean)),
        ];
        setAllClasses(uniqueClasses as string[]);
      }
    };
    fetchClasses();
  }, []);

  // Fetch student suggestions for autocomplete
  const fetchSuggestions = useCallback(
    async (query: string) => {
      if (!query.trim() || query.trim().length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      setLoadingSuggestions(true);
      try {
        // Search by name OR NIK
        let studentQuery = supabase
          .from("students")
          .select("id, name, class, nik")
          .or(`name.ilike.%${query.trim()}%,nik.ilike.%${query.trim()}%`)
          .limit(10);

        // Apply class filter if selected
        if (filterClass !== "all") {
          studentQuery = studentQuery.eq("class", filterClass);
        }

        const { data, error } = await studentQuery.order("name");

        if (error) throw error;

        setSuggestions(data || []);
        setShowSuggestions((data?.length || 0) > 0);
      } catch (error) {
        console.error("Error fetching suggestions:", error);
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    },
    [filterClass],
  );

  // Handle input change with debounce
  const handleInputChange = (value: string) => {
    setSearchQuery(value);

    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer (300ms delay)
    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 300);
  };

  // Handle selection of a suggestion
  const handleSelectSuggestion = (student: StudentSuggestion) => {
    setSearchQuery(student.name);
    setShowSuggestions(false);
    setSuggestions([]);
    // Trigger search immediately with selected student name
    searchBills(student.name, filterClass);
  };

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const searchBills = async (query: string, classFilter: string) => {
    // Require at least search query or class filter
    if (!query.trim() && classFilter === "all") {
      toast({
        variant: "destructive",
        title: "Masukkan pencarian",
        description: "Cari nama/NIK siswa atau pilih kelas terlebih dahulu",
      });
      return;
    }

    setLoading(true);
    setHasSearched(true);
    setSelectedBills(new Set());

    try {
      // First, find matching students by name OR NIK
      let studentQuery = supabase.from("students").select("id");

      if (query.trim()) {
        // Search by name OR NIK
        studentQuery = studentQuery.or(
          `name.ilike.%${query.trim()}%,nik.ilike.%${query.trim()}%`,
        );
      }
      if (classFilter !== "all") {
        studentQuery = studentQuery.eq("class", classFilter);
      }

      const { data: students, error: studentError } = await studentQuery;
      if (studentError) throw studentError;

      if (!students || students.length === 0) {
        setBills([]);
        setLoading(false);
        return;
      }

      const studentIds = students.map((s) => s.id);

      // Then fetch bills for those students
      const { data, error } = await supabase
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
                    created_at,
                    laundry_date,
                    students (id, name, class, nik),
                    laundry_partners (name)
                `,
        )
        .in("student_id", studentIds)
        .in("status", ["DISETUJUI_MITRA", "MENUNGGU_PEMBAYARAN"])
        .order("laundry_date", { ascending: false });

      if (error) throw error;
      setBills(data || []);
    } catch (error) {
      console.error("Error fetching bills:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memuat data tagihan",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    searchBills(searchQuery, filterClass);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setShowSuggestions(false);
      setSuggestions([]);
      handleSearch();
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  // Refresh bills after payment (re-search with current filters)
  const refreshBills = () => {
    if (hasSearched) {
      searchBills(searchQuery, filterClass);
    }
  };

  // Group bills by student
  const groupBillsByStudent = (billList: Bill[]): StudentBillGroup[] => {
    const groups: { [key: string]: StudentBillGroup } = {};

    billList.forEach((bill) => {
      const studentId = bill.students?.id || "unknown";
      if (!groups[studentId]) {
        groups[studentId] = {
          studentId,
          studentName: bill.students?.name || "Unknown",
          studentClass: bill.students?.class || "-",
          studentNik: bill.students?.nik || "-",
          bills: [],
          totalAmount: 0,
        };
      }
      groups[studentId].bills.push(bill);
      groups[studentId].totalAmount += bill.total_price;
    });

    return Object.values(groups);
  };

  // Bills are already filtered from the search, just group them
  const studentGroups = groupBillsByStudent(bills);

  // Calculate selected totals
  const selectedBillsList = bills.filter((b) => selectedBills.has(b.id));
  const selectedTotal = selectedBillsList.reduce(
    (sum, b) => sum + b.total_price,
    0,
  );

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

  const formatLaundryDate = (date: string) => {
    return new Date(date + "T00:00:00").toLocaleDateString("id-ID", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const toggleBillSelection = (billId: string) => {
    const newSelected = new Set(selectedBills);
    if (newSelected.has(billId)) {
      newSelected.delete(billId);
    } else {
      newSelected.add(billId);
    }
    setSelectedBills(newSelected);
  };

  const selectAllStudentBills = (studentBills: Bill[]) => {
    const newSelected = new Set(selectedBills);
    const allSelected = studentBills.every((b) => newSelected.has(b.id));

    if (allSelected) {
      studentBills.forEach((b) => newSelected.delete(b.id));
    } else {
      studentBills.forEach((b) => newSelected.add(b.id));
    }
    setSelectedBills(newSelected);
  };

  const handleOpenPaymentModal = () => {
    if (selectedBills.size === 0) {
      toast({
        variant: "destructive",
        title: "Pilih tagihan",
        description: "Pilih minimal satu tagihan untuk diproses",
      });
      return;
    }
    setPaidAmount("");
    setPaymentMethod("cash");
    // Use Syariah Payment Dialog
    setShowSyariahPaymentDialog(true);
  };

  // Handle Syariah Payment with wadiah and rounding
  const handleSyariahPayment = async (
    paymentData: SyariahPaymentData,
  ): Promise<boolean> => {
    setProcessingPayment(true);

    try {
      const studentId = selectedBillsList[0]?.students?.id;
      if (!studentId) {
        throw new Error("Student ID tidak ditemukan");
      }

      // 1. Use wadiah balance if applicable
      if (paymentData.wadiahUsed > 0) {
        for (const bill of selectedBillsList) {
          const wadiahPortion = Math.round(
            (bill.total_price / paymentData.totalAmount) *
              paymentData.wadiahUsed,
          );
          if (wadiahPortion > 0) {
            await applyBalanceForPayment(studentId, wadiahPortion, bill.id);
          }
        }
      }

      // 2. Record sedekah (rounding discount) if applicable
      if (paymentData.roundingApplied > 0) {
        await recordSedekah(
          studentId,
          paymentData.roundingApplied,
          selectedBillsList[0]?.id,
          paymentData.totalAmount - paymentData.wadiahUsed,
          paymentData.finalAmount,
        );
      }

      // 3. Process each selected bill payment
      const paymentPromises = selectedBillsList.map((bill) =>
        confirmPaymentManually(
          bill.id,
          paymentData.paymentMethod === "cash" ? "cash" : "bank_transfer",
          paymentData.paymentMethod === "cash",
          user?.id,
        ),
      );

      const results = await Promise.all(paymentPromises);
      const allSuccess = results.every((r) => r === true);

      // 4. Update order with syariah payment details
      for (const bill of selectedBillsList) {
        await supabase
          .from("laundry_orders")
          .update({
            paid_amount: paymentData.paidAmount,
            change_amount: paymentData.changeAmount,
            wadiah_used: paymentData.wadiahUsed,
            rounding_applied: paymentData.roundingApplied,
            rounding_type: paymentData.roundingType,
          })
          .eq("id", bill.id);
      }

      // 5. Deposit change to wadiah if requested
      if (
        paymentData.changeAction === "wadiah" &&
        paymentData.changeAmount > 0
      ) {
        await depositChange(
          studentId,
          paymentData.changeAmount,
          selectedBillsList[0]?.id,
          "Sisa kembalian dari pembayaran laundry",
        );
      }

      if (allSuccess) {
        // Generate receipt with syariah details
        const receiptData: PaymentReceipt = {
          receiptNumber: `RCP-${Date.now().toString().slice(-8)}`,
          date: new Date().toLocaleDateString("id-ID"),
          time: new Date().toLocaleTimeString("id-ID"),
          cashierName: profile?.full_name || "Kasir",
          studentName: selectedBillsList[0]?.students?.name || "-",
          studentClass: selectedBillsList[0]?.students?.class || "-",
          items: selectedBillsList.map((bill) => ({
            category:
              LAUNDRY_CATEGORIES[
                bill.category as keyof typeof LAUNDRY_CATEGORIES
              ]?.label || bill.category,
            quantity:
              bill.category === "kiloan"
                ? `${bill.weight_kg} kg`
                : `${bill.item_count} pcs`,
            price: bill.total_price,
          })),
          subtotal: paymentData.totalAmount,
          paymentMethod:
            paymentData.paymentMethod === "cash" ? "Tunai" : "Transfer",
          total: paymentData.finalAmount,
          paidAmount: paymentData.paidAmount,
          changeAmount: paymentData.changeAmount,
          wadiahUsed: paymentData.wadiahUsed,
          roundingDiscount: paymentData.roundingApplied,
          wadiahDeposited:
            paymentData.changeAction === "wadiah"
              ? paymentData.changeAmount
              : 0,
        };

        setReceipt(receiptData);
        setShowSyariahPaymentDialog(false);
        setShowReceiptModal(true);

        toast({
          title: "Pembayaran Berhasil",
          description: `${selectedBills.size} tagihan telah dikonfirmasi sesuai prinsip syariah`,
        });

        // Refresh data and clear selection
        refreshBills();
        setSelectedBills(new Set());
        return true;
      } else {
        toast({
          variant: "destructive",
          title: "Sebagian gagal",
          description: "Beberapa pembayaran gagal diproses",
        });
        return false;
      }
    } catch (error) {
      console.error("Syariah payment error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memproses pembayaran syariah",
      });
      return false;
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleConfirmPayment = async () => {
    setProcessingPayment(true);

    try {
      const paidAmountNum = parseFloat(paidAmount) || 0;
      if (paidAmountNum < selectedTotal) {
        toast({
          variant: "destructive",
          title: "Jumlah tidak cukup",
          description: "Jumlah pembayaran kurang dari total tagihan",
        });
        setProcessingPayment(false);
        return;
      }

      // Process each selected bill
      const paymentPromises = selectedBillsList.map((bill) =>
        confirmPaymentManually(
          bill.id,
          paymentMethod === "cash" ? "cash" : "bank_transfer",
          paymentMethod === "cash",
          user?.id,
        ),
      );

      const results = await Promise.all(paymentPromises);
      const allSuccess = results.every((r) => r === true);

      if (allSuccess) {
        // Save paid_amount and change_amount to database
        const paidAmountValue = paidAmountNum;
        const changeAmountValue = paidAmountNum - selectedTotal;

        for (const bill of selectedBillsList) {
          await supabase
            .from("laundry_orders")
            .update({
              paid_amount: paidAmountValue,
              change_amount: changeAmountValue,
            })
            .eq("id", bill.id);
        }

        // Generate receipt
        const receiptData: PaymentReceipt = {
          receiptNumber: `RCP-${Date.now().toString().slice(-8)}`,
          date: new Date().toLocaleDateString("id-ID"),
          time: new Date().toLocaleTimeString("id-ID"),
          cashierName: profile?.full_name || "Kasir",
          studentName: selectedBillsList[0]?.students?.name || "-",
          studentClass: selectedBillsList[0]?.students?.class || "-",
          items: selectedBillsList.map((bill) => ({
            category:
              LAUNDRY_CATEGORIES[
                bill.category as keyof typeof LAUNDRY_CATEGORIES
              ]?.label || bill.category,
            quantity:
              bill.category === "kiloan"
                ? `${bill.weight_kg} kg`
                : `${bill.item_count} pcs`,
            price: bill.total_price,
          })),
          subtotal: selectedTotal,
          paymentMethod: paymentMethod === "cash" ? "Tunai" : "Transfer",
          total: selectedTotal,
          paidAmount: paidAmountNum,
          changeAmount: paidAmountNum - selectedTotal,
        };

        setReceipt(receiptData);
        setShowPaymentModal(false);
        setShowReceiptModal(true);

        toast({
          title: "Pembayaran berhasil",
          description: `${selectedBills.size} tagihan telah dikonfirmasi`,
        });

        // Refresh data and clear selection
        refreshBills();
        setSelectedBills(new Set());
      } else {
        toast({
          variant: "destructive",
          title: "Sebagian gagal",
          description: "Beberapa pembayaran gagal diproses",
        });
      }
    } catch (error) {
      console.error("Payment error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memproses pembayaran",
      });
    } finally {
      setProcessingPayment(false);
    }
  };

  const handlePrintReceipt = () => {
    const printContent = receiptRef.current;
    if (!printContent || !receipt) return;

    // Build syariah-compliant receipt content
    const syariahDetails = [];
    if (receipt.wadiahUsed && receipt.wadiahUsed > 0) {
      syariahDetails.push(
        `Saldo Wadiah Digunakan: -${formatWadiahCurrency(receipt.wadiahUsed)}`,
      );
    }
    if (receipt.roundingDiscount && receipt.roundingDiscount > 0) {
      syariahDetails.push(
        `Diskon Pembulatan (Sedekah): -${formatWadiahCurrency(receipt.roundingDiscount)}`,
      );
    }
    if (receipt.wadiahDeposited && receipt.wadiahDeposited > 0) {
      syariahDetails.push(
        `Disimpan ke Saldo Wadiah: +${formatWadiahCurrency(receipt.wadiahDeposited)}`,
      );
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Struk Pembayaran</title>
          <style>
            body {
              font-family: 'Courier New', monospace;
              font-size: 12px;
              padding: 20px;
              max-width: 300px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              margin-bottom: 15px;
              border-bottom: 1px dashed #000;
              padding-bottom: 10px;
            }
            .header h1 {
              font-size: 16px;
              margin: 0;
            }
            .header p {
              margin: 5px 0;
              font-size: 11px;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              margin: 3px 0;
            }
            .divider {
              border-top: 1px dashed #000;
              margin: 10px 0;
            }
            .items-table {
              width: 100%;
              margin: 10px 0;
            }
            .items-table td {
              padding: 3px 0;
            }
            .items-table .price {
              text-align: right;
            }
            .total-section {
              border-top: 1px dashed #000;
              padding-top: 10px;
              margin-top: 10px;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              margin: 5px 0;
            }
            .total-row.grand-total {
              font-weight: bold;
              font-size: 14px;
            }
            .footer {
              text-align: center;
              margin-top: 20px;
              padding-top: 10px;
              border-top: 1px dashed #000;
              font-size: 11px;
            }
            @media print {
              body { print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const quickAmounts = [50000, 100000, 150000, 200000, 500000];

  // Get first selected student for wadiah display
  const firstSelectedStudentId = selectedBillsList[0]?.students?.id;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <CreditCard className="h-7 w-7 text-primary" />
              POS Kasir
            </h1>
            <p className="text-muted-foreground mt-1">
              Proses pembayaran tagihan laundry dengan cepat dan sesuai syariah
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowWadiahDepositDialog(true)}
              className="bg-gradient-to-r from-emerald-500/10 to-green-500/10 border-emerald-500/30 hover:bg-emerald-500/20"
            >
              <PiggyBank className="h-4 w-4 mr-2 text-emerald-600" />
              Setor Wadiah
            </Button>
          </div>

          {/* Quick Stats - only show when searched */}
          {hasSearched && bills.length > 0 && (
            <div className="flex gap-4">
              <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    Hasil Pencarian
                  </p>
                  <p className="text-2xl font-bold text-primary">
                    {bills.length}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 border-amber-500/20">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Total Tagihan</p>
                  <p className="text-2xl font-bold text-amber-600">
                    {formatCurrency(
                      bills.reduce((s, b) => s + b.total_price, 0),
                    )}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Syariah Policy Info Banner */}
        <SyariahPolicyInfo variant="banner" showOnlyOnce className="mb-2" />

        {/* Search and Filter Bar with Autocomplete */}
        <Card className="dashboard-card">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Autocomplete Search Input */}
              <Popover open={showSuggestions} onOpenChange={setShowSuggestions}>
                <PopoverTrigger asChild>
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                    {loadingSuggestions && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin z-10" />
                    )}
                    <Input
                      ref={inputRef}
                      placeholder="Ketik nama atau NIK siswa..."
                      value={searchQuery}
                      onChange={(e) => handleInputChange(e.target.value)}
                      onKeyDown={handleKeyPress}
                      onFocus={() => {
                        if (suggestions.length > 0) {
                          setShowSuggestions(true);
                        }
                      }}
                      className="pl-10 pr-10"
                      autoComplete="off"
                    />
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  className="p-0 w-[var(--radix-popover-trigger-width)]"
                  align="start"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <Command>
                    <CommandList>
                      <CommandEmpty className="py-4 text-center text-sm">
                        {loadingSuggestions ? (
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Mencari siswa...</span>
                          </div>
                        ) : (
                          "Tidak ada siswa ditemukan"
                        )}
                      </CommandEmpty>
                      <CommandGroup heading="Saran Siswa">
                        {suggestions.map((student) => (
                          <CommandItem
                            key={student.id}
                            value={student.name}
                            onSelect={() => handleSelectSuggestion(student)}
                            className="cursor-pointer hover:bg-primary/10 transition-colors"
                          >
                            <div className="flex items-center gap-3 w-full">
                              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                                <User className="h-4 w-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground truncate">
                                  {student.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {student.nik && (
                                    <span className="font-mono mr-2">
                                      [{student.nik}]
                                    </span>
                                  )}
                                  Kelas {student.class}
                                </p>
                              </div>
                              <CheckCircle2 className="h-4 w-4 text-primary/50" />
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              <Select
                value={filterClass}
                onValueChange={(value) => {
                  setFilterClass(value);
                  // Re-fetch suggestions with new class filter
                  if (searchQuery.trim().length >= 2) {
                    fetchSuggestions(searchQuery);
                  }
                }}
              >
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Pilih Kelas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kelas</SelectItem>
                  {allClasses.map((cls) => (
                    <SelectItem key={cls} value={cls}>
                      {cls}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleSearch}
                disabled={loading}
                className="bg-gradient-to-r from-primary to-primary/80"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Cari
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              💡 Ketik minimal 2 huruf untuk melihat saran nama siswa, atau
              pilih kelas lalu tekan Cari
            </p>
          </CardContent>
        </Card>

        {/* Selected Bills Summary & Payment Action */}
        {selectedBills.size > 0 && (
          <Card className="dashboard-card bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/30 sticky top-16 lg:top-0 z-40">
            <CardContent className="p-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/20 rounded-xl">
                    <Calculator className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {selectedBills.size} tagihan dipilih
                    </p>
                    <p className="text-2xl font-bold text-primary">
                      {formatCurrency(selectedTotal)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedBills(new Set())}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Batal
                  </Button>
                  <Button
                    onClick={handleOpenPaymentModal}
                    disabled={isProcessing || processingPayment}
                    className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                  >
                    <Banknote className="h-4 w-4 mr-2" />
                    Proses Pembayaran
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bills List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !hasSearched ? (
          <Card className="dashboard-card bg-gradient-to-br from-muted/50 to-muted/30">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="p-4 bg-primary/10 rounded-full mb-4">
                <Search className="h-12 w-12 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                Cari Siswa untuk Memulai
              </h3>
              <p className="text-muted-foreground text-center max-w-md">
                Masukkan nama siswa atau pilih kelas di atas untuk menampilkan
                tagihan yang perlu dibayar
              </p>
            </CardContent>
          </Card>
        ) : studentGroups.length === 0 ? (
          <Card className="dashboard-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Receipt className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Tidak ada tagihan yang cocok
              </h3>
              <p className="text-muted-foreground text-center">
                Tidak ditemukan tagihan untuk pencarian ini. Coba cari nama
                siswa lain atau pilih kelas yang berbeda.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {studentGroups.map((group) => {
              const allSelected = group.bills.every((b) =>
                selectedBills.has(b.id),
              );
              const someSelected = group.bills.some((b) =>
                selectedBills.has(b.id),
              );

              return (
                <Card
                  key={group.studentId}
                  className={`dashboard-card transition-all duration-200 ${
                    someSelected ? "ring-2 ring-primary/50 bg-primary/5" : ""
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={() =>
                            selectAllStudentBills(group.bills)
                          }
                        />
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/10 rounded-full">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {group.studentNik}
                              </span>
                              <CardTitle className="text-lg">
                                {group.studentName}
                              </CardTitle>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Kelas {group.studentClass} • {group.bills.length}{" "}
                              tagihan
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Total</p>
                        <p className="text-xl font-bold text-primary">
                          {formatCurrency(group.totalAmount)}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {group.bills.map((bill) => (
                        <div
                          key={bill.id}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                            selectedBills.has(bill.id)
                              ? "bg-primary/10 border-primary/30"
                              : "bg-muted/30 border-transparent hover:border-muted"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={selectedBills.has(bill.id)}
                              onCheckedChange={() =>
                                toggleBillSelection(bill.id)
                              }
                            />
                            <div>
                              <p className="font-medium">
                                {LAUNDRY_CATEGORIES[
                                  bill.category as keyof typeof LAUNDRY_CATEGORIES
                                ]?.label || bill.category}
                              </p>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>
                                  {bill.category === "kiloan"
                                    ? `${bill.weight_kg} kg`
                                    : `${bill.item_count} pcs`}
                                </span>
                                <span>•</span>
                                <span>{bill.laundry_partners?.name}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                📅 {formatLaundryDate(bill.laundry_date)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <StatusBadge status={bill.status} />
                            <p className="font-semibold">
                              {formatCurrency(bill.total_price)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Payment Modal */}
        <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Banknote className="h-5 w-5 text-primary" />
                Proses Pembayaran
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Payment Summary */}
              <div className="bg-muted/50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Jumlah Tagihan</span>
                  <span>{selectedBills.size} tagihan</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Total Pembayaran
                  </span>
                  <span className="text-xl font-bold text-primary">
                    {formatCurrency(selectedTotal)}
                  </span>
                </div>
              </div>

              {/* Payment Method */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Metode Pembayaran</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPaymentMethod("cash")}
                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                      paymentMethod === "cash"
                        ? "border-primary bg-primary/10"
                        : "border-muted hover:border-muted-foreground/30"
                    }`}
                  >
                    <Banknote className="h-6 w-6" />
                    <span className="font-medium">Tunai</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod("transfer")}
                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                      paymentMethod === "transfer"
                        ? "border-primary bg-primary/10"
                        : "border-muted hover:border-muted-foreground/30"
                    }`}
                  >
                    <CreditCard className="h-6 w-6" />
                    <span className="font-medium">Transfer</span>
                  </button>
                </div>
              </div>

              {/* Amount Input (for cash) */}
              {paymentMethod === "cash" && (
                <div className="space-y-3">
                  <label className="text-sm font-medium">
                    Uang yang Diterima
                  </label>
                  <Input
                    type="number"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    className="text-xl font-bold text-center"
                    placeholder="Rp"
                  />
                  <div className="flex flex-wrap gap-2">
                    {quickAmounts.map((amount) => (
                      <Button
                        key={amount}
                        variant="outline"
                        size="sm"
                        onClick={() => setPaidAmount(amount.toString())}
                      >
                        {formatCurrency(amount)}
                      </Button>
                    ))}
                  </div>

                  {/* Change Calculation */}
                  {parseFloat(paidAmount) >= selectedTotal && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                      <div className="flex justify-between items-center">
                        <span className="text-green-700 dark:text-green-400">
                          Kembalian
                        </span>
                        <span className="text-2xl font-bold text-green-700 dark:text-green-400">
                          {formatCurrency(
                            parseFloat(paidAmount) - selectedTotal,
                          )}
                        </span>
                      </div>
                    </div>
                  )}

                  {parseFloat(paidAmount) < selectedTotal &&
                    paidAmount !== "" && (
                      <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 text-destructive">
                          <AlertCircle className="h-4 w-4" />
                          <span>Jumlah pembayaran kurang</span>
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowPaymentModal(false)}
              >
                Batal
              </Button>
              <Button
                onClick={handleConfirmPayment}
                disabled={
                  processingPayment ||
                  (paymentMethod === "cash" &&
                    parseFloat(paidAmount) < selectedTotal)
                }
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
              >
                {processingPayment ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Konfirmasi Pembayaran
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Receipt Modal */}
        <Dialog open={showReceiptModal} onOpenChange={setShowReceiptModal}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                Struk Pembayaran
              </DialogTitle>
            </DialogHeader>

            {receipt && (
              <div ref={receiptRef} className="font-mono text-sm space-y-3">
                <div className="header text-center pb-3 border-b border-dashed">
                  <h1 className="text-lg font-bold">🧺 At-Tauhid Laundry</h1>
                  <p className="text-xs text-muted-foreground">
                    Sistem Laundry Sekolah
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {receipt.receiptNumber}
                  </p>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>Tanggal</span>
                    <span>{receipt.date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Waktu</span>
                    <span>{receipt.time}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Kasir</span>
                    <span>{receipt.cashierName}</span>
                  </div>
                </div>

                <div className="border-t border-dashed pt-3 space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>Siswa</span>
                    <span>{receipt.studentName}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Kelas</span>
                    <span>{receipt.studentClass}</span>
                  </div>
                </div>

                <div className="border-t border-dashed pt-3">
                  <p className="text-xs font-semibold mb-2">Items:</p>
                  {receipt.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs">
                      <span>
                        {item.category} ({item.quantity})
                      </span>
                      <span>{formatCurrency(item.price)}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-dashed pt-3 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Subtotal</span>
                    <span>{formatCurrency(receipt.subtotal)}</span>
                  </div>
                  {/* Syariah Details */}
                  {receipt.wadiahUsed && receipt.wadiahUsed > 0 && (
                    <div className="flex justify-between text-xs text-amber-600">
                      <span className="flex items-center gap-1">
                        <Wallet className="h-3 w-3" />
                        Saldo Wadiah
                      </span>
                      <span>-{formatCurrency(receipt.wadiahUsed)}</span>
                    </div>
                  )}
                  {receipt.roundingDiscount && receipt.roundingDiscount > 0 && (
                    <div className="flex justify-between text-xs text-emerald-600">
                      <span>Diskon Pembulatan ❤️</span>
                      <span>-{formatCurrency(receipt.roundingDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold">
                    <span>TOTAL</span>
                    <span>{formatCurrency(receipt.total)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Metode</span>
                    <span>{receipt.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Dibayar</span>
                    <span>{formatCurrency(receipt.paidAmount)}</span>
                  </div>
                  {receipt.changeAmount > 0 && (
                    <div className="flex justify-between font-bold text-green-600">
                      <span>Kembalian</span>
                      <span>{formatCurrency(receipt.changeAmount)}</span>
                    </div>
                  )}
                  {receipt.wadiahDeposited && receipt.wadiahDeposited > 0 && (
                    <div className="flex justify-between text-xs text-amber-600">
                      <span className="flex items-center gap-1">
                        <Wallet className="h-3 w-3" />
                        Disimpan ke Wadiah
                      </span>
                      <span>+{formatCurrency(receipt.wadiahDeposited)}</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-dashed pt-3 text-center text-xs text-muted-foreground">
                  <p>Terima kasih atas pembayaran Anda!</p>
                  <p className="mt-1">🌙 Transaksi Sesuai Syariah</p>
                  <p className="mt-1">At-Tauhid Laundry</p>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setShowReceiptModal(false)}
              >
                Tutup
              </Button>
              <Button onClick={handlePrintReceipt}>
                <Printer className="h-4 w-4 mr-2" />
                Cetak Struk
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Syariah Payment Dialog */}
        <SyariahPaymentDialog
          open={showSyariahPaymentDialog}
          onOpenChange={setShowSyariahPaymentDialog}
          bills={selectedBillsList.map((bill) => ({
            id: bill.id,
            student_id: bill.students?.id || "",
            total_price: bill.total_price,
            category: bill.category,
            students: bill.students,
          }))}
          onConfirmPayment={handleSyariahPayment}
          isProcessing={processingPayment}
        />

        {/* Wadiah Deposit Dialog */}
        <WadiahDepositDialog
          open={showWadiahDepositDialog}
          onOpenChange={setShowWadiahDepositDialog}
          onDepositSuccess={() => {
            // Optionally refresh data after deposit
            if (hasSearched && searchQuery) {
              searchBills(searchQuery, filterClass);
            }
          }}
        />

        {/* Wadiah Balance Card (shown when bills are selected) */}
        {firstSelectedStudentId && selectedBills.size > 0 && (
          <div className="fixed bottom-4 right-4 z-40 w-80 hidden lg:block">
            <WadiahBalanceCard
              studentId={firstSelectedStudentId}
              studentName={selectedBillsList[0]?.students?.name}
              compact={false}
              showTransactions={false}
              className="shadow-lg"
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
