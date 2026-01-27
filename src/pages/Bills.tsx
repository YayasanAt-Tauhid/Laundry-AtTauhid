import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMidtrans } from "@/hooks/useMidtrans";
import { useWadiah } from "@/hooks/useWadiah";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Receipt,
  Loader2,
  CreditCard,
  AlertCircle,
  CheckSquare,
  Info,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  Wallet,
  Calendar,
  FileText,
  Banknote,
  ArrowRight,
} from "lucide-react";
import {
  LAUNDRY_CATEGORIES,
  QRIS_MAX_AMOUNT,
  type OrderStatus,
} from "@/lib/constants";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  paid_at: string | null;
  paid_amount: number | null;
  change_amount: number | null;
  wadiah_used: number | null;
  rounding_applied: number | null;
  notes: string | null;
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

interface StudentWadiahBalance {
  student_id: string;
  balance: number;
  student_name: string;
  student_class: string;
}

const PAGE_SIZE = 20;

export default function Bills() {
  const { toast } = useToast();
  const { profile, userRole } = useAuth();
  const {
    processPayment,
    processBulkPayment,
    confirmPaymentManually,
    isProcessing,
    getEstimatedAdminFee,
  } = useMidtrans();

  // Wadiah hook (for formatting and settings check)
  const {
    formatCurrency: formatWadiahCurrency,
    isOnlinePaymentEnabled,
    settings: wadiahSettings,
  } = useWadiah({ autoFetch: true });

  const [unpaidBills, setUnpaidBills] = useState<Bill[]>([]);
  const [paidBills, setPaidBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingBillId, setPayingBillId] = useState<string | null>(null);
  const [selectedBills, setSelectedBills] = useState<Set<string>>(new Set());
  const [isPayingAll, setIsPayingAll] = useState(false);
  const [paidPage, setPaidPage] = useState(0);
  const [paidBillsCount, setPaidBillsCount] = useState(0);
  const [studentBalances, setStudentBalances] = useState<
    StudentWadiahBalance[]
  >([]);

  // Wadiah Payment Dialog State
  const [showWadiahPaymentDialog, setShowWadiahPaymentDialog] = useState(false);
  const [selectedBillForWadiah, setSelectedBillForWadiah] =
    useState<Bill | null>(null);
  const [useWadiahBalance, setUseWadiahBalance] = useState(true);
  const [wadiahAmountToUse, setWadiahAmountToUse] = useState<number>(0);
  const [isProcessingWadiah, setIsProcessingWadiah] = useState(false);

  // Bulk Wadiah Payment Dialog State
  const [showBulkWadiahDialog, setShowBulkWadiahDialog] = useState(false);
  const [bulkUseWadiah, setBulkUseWadiah] = useState(true);
  const [bulkWadiahAmount, setBulkWadiahAmount] = useState<number>(0);

  useEffect(() => {
    fetchBills();
  }, [paidPage]);

  const fetchBills = async () => {
    try {
      setLoading(true);
      // Fetch unpaid bills (no pagination for unpaid)
      // Use !inner join on students to ensure RLS policies are enforced
      // This ensures parents only see orders for their own children
      const { data: unpaidData, error: unpaidError } = await supabase
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
          paid_at,
          paid_amount,
          change_amount,
          wadiah_used,
          rounding_applied,
          notes,
          students!inner (id, name, class, nik),
          laundry_partners (name)
        `,
        )
        .in("status", ["DISETUJUI_MITRA", "MENUNGGU_PEMBAYARAN"])
        .order("created_at", { ascending: false });

      if (unpaidError) throw unpaidError;

      setUnpaidBills(unpaidData || []);

      // Fetch paid bills with pagination
      const from = paidPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // Use !inner join on students to ensure RLS policies are enforced
      // This ensures parents only see paid orders for their own children
      const {
        data: paidData,
        error: paidError,
        count,
      } = await supabase
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
          paid_at,
          paid_amount,
          change_amount,
          wadiah_used,
          rounding_applied,
          notes,
          students!inner (id, name, class, nik),
          laundry_partners (name)
        `,
          { count: "exact" },
        )
        .in("status", ["DIBAYAR", "SELESAI"])
        .order("paid_at", { ascending: false })
        .range(from, to);

      if (paidError) throw paidError;

      setPaidBills(paidData || []);
      setPaidBillsCount(count || 0);

      // Fetch wadiah balances for students
      const allBillsData = [...(unpaidData || []), ...(paidData || [])];
      const studentIds = [
        ...new Set(allBillsData.map((b) => b.students?.id).filter(Boolean)),
      ];

      if (studentIds.length > 0) {
        const { data: balanceData } = await supabase
          .from("student_wadiah_balance")
          .select(
            `
            student_id,
            balance,
            students (name, class)
          `,
          )
          .in("student_id", studentIds);

        if (balanceData) {
          const balances: StudentWadiahBalance[] = balanceData.map((b) => {
            const studentData = b.students as {
              name?: string;
              class?: string;
            } | null;
            return {
              student_id: b.student_id,
              balance: b.balance || 0,
              student_name: studentData?.name || "",
              student_class: studentData?.class || "",
            };
          });
          setStudentBalances(balances);
        }
      }
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

  // Open Wadiah Payment Dialog
  const openWadiahPaymentDialog = (bill: Bill) => {
    setSelectedBillForWadiah(bill);
    const studentBalance = getStudentBalance(bill.students?.id);
    const maxUsable = Math.min(studentBalance, bill.total_price);
    setWadiahAmountToUse(maxUsable);
    setUseWadiahBalance(maxUsable > 0);
    setShowWadiahPaymentDialog(true);
  };

  // Handle Wadiah Payment for single bill using secure database function
  const handleWadiahPayment = async () => {
    if (!selectedBillForWadiah) return;

    const bill = selectedBillForWadiah;
    const studentId = bill.students?.id;

    if (!studentId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Data siswa tidak ditemukan",
      });
      return;
    }

    setIsProcessingWadiah(true);

    try {
      const wadiahToUse = useWadiahBalance ? wadiahAmountToUse : 0;
      const remainingAmount = bill.total_price - wadiahToUse;

      if (wadiahToUse <= 0) {
        // No wadiah to use, just go to Midtrans
        setShowWadiahPaymentDialog(false);
        setSelectedBillForWadiah(null);
        handlePayment(bill);
        return;
      }

      // Use secure database function for wadiah payment
      const { data, error } = await supabase.rpc(
        "parent_pay_order_with_wadiah",
        {
          p_student_id: studentId,
          p_order_id: bill.id,
          p_wadiah_amount: wadiahToUse,
        },
      );

      if (error) {
        throw new Error(error.message);
      }

      const result = data as {
        success: boolean;
        error?: string;
        payment_complete?: boolean;
        wadiah_used?: number;
        remaining_amount?: number;
        message?: string;
      };

      if (!result.success) {
        throw new Error(result.error || "Gagal menggunakan saldo wadiah");
      }

      // If payment is complete (wadiah covers full amount)
      if (result.payment_complete) {
        toast({
          title: "Pembayaran Berhasil",
          description: `Tagihan ${formatCurrency(bill.total_price)} dibayar penuh dengan saldo wadiah`,
        });

        setShowWadiahPaymentDialog(false);
        setSelectedBillForWadiah(null);
        fetchBills();
      } else {
        // Partial payment - need to pay remaining via Midtrans
        toast({
          title: "Saldo Wadiah Digunakan",
          description:
            result.message ||
            `Wadiah ${formatCurrency(wadiahToUse)} digunakan. Lanjutkan pembayaran sisa.`,
        });

        setShowWadiahPaymentDialog(false);
        setSelectedBillForWadiah(null);

        // Process remaining amount via Midtrans
        setPayingBillId(bill.id);

        await processPayment(
          {
            orderId: bill.id,
            grossAmount: remainingAmount,
            studentName: bill.students?.name || "Unknown",
            category:
              LAUNDRY_CATEGORIES[
                bill.category as keyof typeof LAUNDRY_CATEGORIES
              ]?.label || bill.category,
            customerEmail: profile?.email || undefined,
            customerPhone: profile?.phone || undefined,
            customerName: profile?.full_name || undefined,
          },
          () => {
            // onSuccess
            fetchBills();
            setPayingBillId(null);
          },
          () => {
            // onPending
            fetchBills();
            setPayingBillId(null);
          },
        );

        setPayingBillId(null);
      }
    } catch (error: unknown) {
      console.error("Error processing wadiah payment:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error ? error.message : "Gagal memproses pembayaran",
      });
    } finally {
      setIsProcessingWadiah(false);
    }
  };

  // Open Bulk Wadiah Dialog
  const openBulkWadiahDialog = () => {
    if (selectedBills.size === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Pilih minimal satu tagihan untuk dibayar",
      });
      return;
    }

    const totalWadiahAvailable = getTotalWadiahForSelectedBills();
    const maxUsable = Math.min(totalWadiahAvailable, selectedTotal);
    setBulkWadiahAmount(maxUsable);
    setBulkUseWadiah(maxUsable > 0);
    setShowBulkWadiahDialog(true);
  };

  // Handle Bulk Wadiah Payment using secure database function
  const handleBulkWadiahPayment = async () => {
    if (selectedBills.size === 0) return;

    setIsProcessingWadiah(true);

    try {
      const selectedBillsList = unpaidBills.filter((b) =>
        selectedBills.has(b.id),
      );
      const totalAmount = selectedBillsList.reduce(
        (sum, b) => sum + b.total_price,
        0,
      );
      const wadiahToUse = bulkUseWadiah ? bulkWadiahAmount : 0;
      const remainingAmount = totalAmount - wadiahToUse;

      if (wadiahToUse <= 0) {
        // No wadiah to use, just go to bulk Midtrans payment
        setShowBulkWadiahDialog(false);
        handleBulkPayment();
        return;
      }

      // Group bills by student for wadiah deduction
      const billsByStudent = new Map<string, Bill[]>();
      selectedBillsList.forEach((bill) => {
        const studentId = bill.students?.id;
        if (studentId) {
          if (!billsByStudent.has(studentId)) {
            billsByStudent.set(studentId, []);
          }
          billsByStudent.get(studentId)!.push(bill);
        }
      });

      // Process wadiah for each student using secure function
      let totalWadiahUsed = 0;
      let allFullyPaid = true;
      const processedBills: string[] = [];

      for (const [studentId, bills] of billsByStudent) {
        const studentBalance = getStudentBalance(studentId);
        const studentTotal = bills.reduce((sum, b) => sum + b.total_price, 0);
        const wadiahForStudent = Math.min(
          studentBalance,
          studentTotal,
          wadiahToUse - totalWadiahUsed,
        );

        if (wadiahForStudent > 0) {
          // Process each bill for this student
          for (const bill of bills) {
            const billWadiahPortion = Math.min(
              Math.round((bill.total_price / studentTotal) * wadiahForStudent),
              bill.total_price,
            );

            if (billWadiahPortion > 0) {
              // Use secure database function
              const { data, error } = await supabase.rpc(
                "parent_pay_order_with_wadiah",
                {
                  p_student_id: studentId,
                  p_order_id: bill.id,
                  p_wadiah_amount: billWadiahPortion,
                },
              );

              if (error) {
                console.error(
                  `Error processing wadiah for bill ${bill.id}:`,
                  error,
                );
                continue;
              }

              const result = data as {
                success: boolean;
                error?: string;
                payment_complete?: boolean;
                wadiah_used?: number;
              };

              if (result.success) {
                totalWadiahUsed += result.wadiah_used || billWadiahPortion;
                processedBills.push(bill.id);

                if (!result.payment_complete) {
                  allFullyPaid = false;
                }
              }
            }
          }
        }
      }

      // If all bills are fully paid with wadiah
      if (allFullyPaid && totalWadiahUsed >= totalAmount) {
        toast({
          title: "Pembayaran Berhasil",
          description: `${selectedBillsList.length} tagihan (${formatCurrency(totalAmount)}) dibayar dengan saldo wadiah`,
        });

        setShowBulkWadiahDialog(false);
        setSelectedBills(new Set());
        fetchBills();
      } else {
        // Partial payment - need to pay remaining via Midtrans
        toast({
          title: "Saldo Wadiah Digunakan",
          description: `Wadiah ${formatCurrency(totalWadiahUsed)} digunakan. Lanjutkan pembayaran sisa.`,
        });

        setShowBulkWadiahDialog(false);

        // Filter out fully paid bills from Midtrans payment
        const unpaidOrderIds = selectedBillsList
          .filter((b) => !processedBills.includes(b.id) || remainingAmount > 0)
          .map((b) => b.id);

        if (unpaidOrderIds.length > 0 && remainingAmount > 0) {
          setIsPayingAll(true);

          const studentNames = [
            ...new Set(selectedBillsList.map((b) => b.students?.name)),
          ].join(", ");

          await processBulkPayment(
            {
              orderIds: unpaidOrderIds,
              grossAmount: remainingAmount,
              description: `Pembayaran ${selectedBillsList.length} tagihan laundry (setelah potongan wadiah ${formatCurrency(totalWadiahUsed)})`,
              studentNames: studentNames,
              customerEmail: profile?.email || undefined,
              customerPhone: profile?.phone || undefined,
              customerName: profile?.full_name || undefined,
            },
            () => {
              fetchBills();
              setSelectedBills(new Set());
              setIsPayingAll(false);
            },
            () => {
              fetchBills();
              setIsPayingAll(false);
            },
          );

          setIsPayingAll(false);
        } else {
          setSelectedBills(new Set());
          fetchBills();
        }
      }
    } catch (error: unknown) {
      console.error("Error processing bulk wadiah payment:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error ? error.message : "Gagal memproses pembayaran",
      });
    } finally {
      setIsProcessingWadiah(false);
    }
  };

  const handlePayment = async (bill: Bill) => {
    setPayingBillId(bill.id);

    await processPayment(
      {
        orderId: bill.id,
        grossAmount: bill.total_price,
        studentName: bill.students?.name || "Unknown",
        category:
          LAUNDRY_CATEGORIES[bill.category as keyof typeof LAUNDRY_CATEGORIES]
            ?.label || bill.category,
        customerEmail: profile?.email || undefined,
        customerPhone: profile?.phone || undefined,
        customerName: profile?.full_name || undefined,
      },
      () => {
        // onSuccess
        fetchBills();
        setPayingBillId(null);
      },
      () => {
        // onPending
        fetchBills();
        setPayingBillId(null);
      },
    );

    setPayingBillId(null);
  };

  // Handle bulk payment for selected bills (without wadiah)
  const handleBulkPayment = async () => {
    if (selectedBills.size === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Pilih minimal satu tagihan untuk dibayar",
      });
      return;
    }

    setIsPayingAll(true);

    const selectedBillsList = unpaidBills.filter((b) =>
      selectedBills.has(b.id),
    );
    const totalAmount = selectedBillsList.reduce(
      (sum, b) => sum + b.total_price,
      0,
    );
    const orderIds = selectedBillsList.map((b) => b.id);

    // Create description for bulk payment
    const studentNames = [
      ...new Set(selectedBillsList.map((b) => b.students?.name)),
    ].join(", ");

    await processBulkPayment(
      {
        orderIds: orderIds,
        grossAmount: totalAmount,
        description: `Pembayaran ${selectedBillsList.length} tagihan laundry`,
        studentNames: studentNames,
        customerEmail: profile?.email || undefined,
        customerPhone: profile?.phone || undefined,
        customerName: profile?.full_name || undefined,
      },
      () => {
        // onSuccess
        fetchBills();
        setSelectedBills(new Set());
        setIsPayingAll(false);
      },
      () => {
        // onPending
        fetchBills();
        setIsPayingAll(false);
      },
    );

    setIsPayingAll(false);
  };

  // Toggle single bill selection
  const toggleBillSelection = (billId: string) => {
    const newSelected = new Set(selectedBills);
    if (newSelected.has(billId)) {
      newSelected.delete(billId);
    } else {
      newSelected.add(billId);
    }
    setSelectedBills(newSelected);
  };

  // Toggle select all bills
  const toggleSelectAll = () => {
    if (selectedBills.size === unpaidBills.length) {
      setSelectedBills(new Set());
    } else {
      setSelectedBills(new Set(unpaidBills.map((b) => b.id)));
    }
  };

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
      month: "long",
      year: "numeric",
    });
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStudentBalance = (studentId: string | undefined): number => {
    if (!studentId) return 0;
    const balance = studentBalances.find((b) => b.student_id === studentId);
    return balance?.balance || 0;
  };

  const formatLaundryDate = (date: string) => {
    return new Date(date + "T00:00:00").toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  // Calculate total wadiah available for selected bills
  const getTotalWadiahForSelectedBills = (): number => {
    const selectedBillsList = unpaidBills.filter((b) =>
      selectedBills.has(b.id),
    );
    const studentIds = [
      ...new Set(selectedBillsList.map((b) => b.students?.id).filter(Boolean)),
    ];
    return studentIds.reduce((sum, id) => sum + getStudentBalance(id), 0);
  };

  const totalUnpaid = unpaidBills.reduce((sum, b) => sum + b.total_price, 0);
  const selectedTotal = unpaidBills
    .filter((b) => selectedBills.has(b.id))
    .reduce((sum, b) => sum + b.total_price, 0);

  // Cashier doesn't pay admin fee
  const isCashier = userRole === "cashier";

  // Calculate estimated admin fee for display (0 for cashier)
  const estimatedAdminFee = isCashier
    ? 0
    : getEstimatedAdminFee(selectedTotal || totalUnpaid);
  const selectedAdminFee = isCashier ? 0 : getEstimatedAdminFee(selectedTotal);

  // Get payment method label based on amount
  const getPaymentMethodLabel = (amount: number) => {
    if (isCashier) return "Tanpa biaya admin";
    return amount < QRIS_MAX_AMOUNT ? "QRIS (0.7%)" : "VA (Rp 4.400)";
  };

  // Calculate amounts for single bill wadiah dialog
  const singleBillWadiahInfo = useMemo(() => {
    if (!selectedBillForWadiah) return null;
    const studentBalance = getStudentBalance(
      selectedBillForWadiah.students?.id,
    );
    const totalAmount = selectedBillForWadiah.total_price;
    const wadiahToUse = useWadiahBalance ? wadiahAmountToUse : 0;
    const remainingAmount = Math.max(0, totalAmount - wadiahToUse);
    const canPayFullWithWadiah = studentBalance >= totalAmount;
    const adminFee = isCashier
      ? 0
      : remainingAmount > 0
        ? getEstimatedAdminFee(remainingAmount)
        : 0;

    return {
      studentBalance,
      totalAmount,
      wadiahToUse,
      remainingAmount,
      canPayFullWithWadiah,
      adminFee,
      finalTotal: remainingAmount + adminFee,
    };
  }, [selectedBillForWadiah, useWadiahBalance, wadiahAmountToUse, isCashier]);

  // Calculate amounts for bulk wadiah dialog
  const bulkWadiahInfo = useMemo(() => {
    const totalAmount = selectedTotal;
    const totalWadiahAvailable = getTotalWadiahForSelectedBills();
    const wadiahToUse = bulkUseWadiah ? bulkWadiahAmount : 0;
    const remainingAmount = Math.max(0, totalAmount - wadiahToUse);
    const canPayFullWithWadiah = totalWadiahAvailable >= totalAmount;
    const adminFee = isCashier
      ? 0
      : remainingAmount > 0
        ? getEstimatedAdminFee(remainingAmount)
        : 0;

    return {
      totalWadiahAvailable,
      totalAmount,
      wadiahToUse,
      remainingAmount,
      canPayFullWithWadiah,
      adminFee,
      finalTotal: remainingAmount + adminFee,
    };
  }, [
    selectedTotal,
    bulkUseWadiah,
    bulkWadiahAmount,
    isCashier,
    selectedBills,
  ]);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tagihan</h1>
          <p className="text-muted-foreground mt-1">
            Kelola dan bayar tagihan laundry Anda
          </p>
        </div>

        {/* Student Wadiah Balances */}
        {studentBalances.length > 0 &&
          studentBalances.some((b) => b.balance > 0) && (
            <Card className="bg-gradient-to-br from-emerald-500/10 to-green-500/5 border-emerald-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <PiggyBank className="h-5 w-5 text-emerald-600" />
                  Saldo Wadiah Siswa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {studentBalances
                    .filter((b) => b.balance > 0)
                    .map((balance) => (
                      <div
                        key={balance.student_id}
                        className="flex items-center justify-between p-3 rounded-lg bg-background/50 border"
                      >
                        <div>
                          <p className="font-medium text-sm">
                            {balance.student_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Kelas {balance.student_class}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-emerald-600">
                            {formatCurrency(balance.balance)}
                          </p>
                          <p className="text-xs text-muted-foreground">Saldo</p>
                        </div>
                      </div>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  💡 Saldo wadiah dapat digunakan untuk membayar tagihan dengan
                  klik tombol "Bayar dengan Wadiah"
                </p>
              </CardContent>
            </Card>
          )}

        {/* Summary Card */}
        {unpaidBills.length > 0 && (
          <Card className="dashboard-card bg-primary/5 border-primary/20">
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-6">
                  <Receipt className="h-12 w-12 text-primary/30" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Total Tagihan Belum Dibayar
                    </p>
                    <p className="text-3xl font-bold text-primary mt-1">
                      {formatCurrency(totalUnpaid)}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {unpaidBills.length} tagihan
                    </p>
                  </div>
                </div>

                {/* Bulk Payment Section */}
                <div className="flex flex-col items-end gap-2">
                  {selectedBills.size > 0 && (
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        {selectedBills.size} tagihan dipilih:{" "}
                        <span className="font-bold text-primary">
                          {formatCurrency(selectedTotal)}
                        </span>
                      </p>
                      {getTotalWadiahForSelectedBills() > 0 && (
                        <p className="text-xs text-amber-600 flex items-center justify-end gap-1">
                          <PiggyBank className="h-3 w-3" />
                          Saldo wadiah tersedia:{" "}
                          {formatCurrency(getTotalWadiahForSelectedBills())}
                        </p>
                      )}
                      {!isCashier && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>
                            + Biaya Admin: {formatCurrency(selectedAdminFee)}
                          </span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="h-3 w-3" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">
                                  {getPaymentMethodLabel(selectedTotal)}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      )}
                      {isCashier && (
                        <p className="text-xs text-green-600 font-medium">
                          Tanpa biaya admin (Kasir)
                        </p>
                      )}
                      <p className="text-sm font-semibold text-primary mt-1">
                        Total:{" "}
                        {formatCurrency(selectedTotal + selectedAdminFee)}
                      </p>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleSelectAll}
                    >
                      <CheckSquare className="h-4 w-4 mr-2" />
                      {selectedBills.size === unpaidBills.length
                        ? "Batal Pilih"
                        : "Pilih Semua"}
                    </Button>
                    {getTotalWadiahForSelectedBills() > 0 &&
                      selectedBills.size > 0 && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={openBulkWadiahDialog}
                          disabled={
                            isPayingAll || isProcessing || isProcessingWadiah
                          }
                          className="bg-amber-600 hover:bg-amber-700"
                        >
                          <PiggyBank className="h-4 w-4 mr-2" />
                          Bayar dengan Wadiah
                        </Button>
                      )}
                    {isOnlinePaymentEnabled ? (
                      <Button
                        onClick={handleBulkPayment}
                        disabled={
                          selectedBills.size === 0 ||
                          isPayingAll ||
                          isProcessing
                        }
                      >
                        {isPayingAll ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CreditCard className="h-4 w-4 mr-2" />
                        )}
                        {isPayingAll
                          ? "Memproses..."
                          : `Bayar Online (${selectedBills.size})`}
                      </Button>
                    ) : (
                      <p className="text-sm text-muted-foreground px-3 py-2 bg-muted rounded">
                        Pembayaran online dinonaktifkan
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : unpaidBills.length === 0 && paidBills.length === 0 ? (
          <Card className="dashboard-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Receipt className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Belum ada tagihan
              </h3>
              <p className="text-muted-foreground text-center">
                Tagihan akan muncul setelah order laundry dibuat
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Unpaid Bills */}
            {unpaidBills.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-warning" />
                  Menunggu Pembayaran
                </h2>
                <div className="grid gap-4">
                  {unpaidBills.map((bill) => {
                    const adminFee = isCashier
                      ? 0
                      : getEstimatedAdminFee(bill.total_price);
                    const studentBalance = getStudentBalance(bill.students?.id);
                    const hasWadiah = studentBalance > 0;

                    return (
                      <Card
                        key={bill.id}
                        className={`dashboard-card transition-all ${
                          selectedBills.has(bill.id)
                            ? "ring-2 ring-primary bg-primary/5"
                            : ""
                        }`}
                      >
                        <CardContent className="p-6">
                          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                            <div className="flex items-start gap-4">
                              {/* Checkbox */}
                              <Checkbox
                                id={`bill-${bill.id}`}
                                checked={selectedBills.has(bill.id)}
                                onCheckedChange={() =>
                                  toggleBillSelection(bill.id)
                                }
                                className="mt-1"
                              />
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                    {bill.students?.nik}
                                  </span>
                                  <h3 className="font-semibold">
                                    {bill.students?.name}
                                  </h3>
                                  <span className="text-sm text-muted-foreground">
                                    Kelas {bill.students?.class}
                                  </span>
                                  {hasWadiah && (
                                    <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                                      <PiggyBank className="h-3 w-3" />
                                      {formatCurrency(studentBalance)}
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-4 text-sm">
                                  <span className="text-muted-foreground">
                                    {
                                      LAUNDRY_CATEGORIES[
                                        bill.category as keyof typeof LAUNDRY_CATEGORIES
                                      ]?.label
                                    }
                                  </span>
                                  <span className="text-muted-foreground">
                                    {bill.category === "kiloan"
                                      ? `${bill.weight_kg} kg`
                                      : `${bill.item_count} pcs`}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {bill.laundry_partners?.name}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  📅 Tanggal Laundry:{" "}
                                  {formatLaundryDate(bill.laundry_date)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-lg font-semibold">
                                  {formatCurrency(bill.total_price)}
                                </p>
                                {!isCashier && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                                    <span>
                                      + Admin: {formatCurrency(adminFee)}
                                    </span>
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <Info className="h-3 w-3" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs">
                                            {getPaymentMethodLabel(
                                              bill.total_price,
                                            )}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                )}
                                {isCashier && (
                                  <p className="text-xs text-green-600 font-medium">
                                    Tanpa biaya admin
                                  </p>
                                )}
                                <p className="text-xl font-bold text-primary mt-1">
                                  {formatCurrency(bill.total_price + adminFee)}
                                </p>
                                <StatusBadge status={bill.status} />
                              </div>
                              <div className="flex flex-col gap-2">
                                {hasWadiah && (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() =>
                                      openWadiahPaymentDialog(bill)
                                    }
                                    disabled={
                                      payingBillId === bill.id ||
                                      isProcessing ||
                                      isProcessingWadiah
                                    }
                                    className="bg-amber-600 hover:bg-amber-700"
                                  >
                                    <PiggyBank className="h-4 w-4 mr-2" />
                                    Pakai Wadiah
                                  </Button>
                                )}
                                {isOnlinePaymentEnabled ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePayment(bill)}
                                    disabled={
                                      payingBillId === bill.id || isProcessing
                                    }
                                  >
                                    {payingBillId === bill.id ? (
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                      <CreditCard className="h-4 w-4 mr-2" />
                                    )}
                                    {payingBillId === bill.id
                                      ? "Memproses..."
                                      : "Bayar Online"}
                                  </Button>
                                ) : (
                                  <p className="text-xs text-muted-foreground text-center px-2 py-1 bg-muted rounded">
                                    Bayar via Kasir
                                  </p>
                                )}
                                {userRole === "cashier" && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={async () => {
                                      setPayingBillId(bill.id);
                                      const success =
                                        await confirmPaymentManually(
                                          bill.id,
                                          "cash",
                                          true,
                                        );
                                      if (success) fetchBills();
                                      setPayingBillId(null);
                                    }}
                                    disabled={
                                      payingBillId === bill.id || isProcessing
                                    }
                                  >
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                    Tunai
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Paid Bills */}
            {(paidBills.length > 0 || paidBillsCount > 0) && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Riwayat Pembayaran ({paidBillsCount} transaksi)
                </h2>
                <Card className="dashboard-card">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-muted/30">
                          <tr>
                            <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                              Siswa
                            </th>
                            <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                              Laundry
                            </th>
                            <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                              Tagihan
                            </th>
                            <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                              Pembayaran
                            </th>
                            <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                              Metode
                            </th>
                            <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                              Tanggal Bayar
                            </th>
                            <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                              Catatan
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {paidBills.map((bill) => (
                            <tr
                              key={bill.id}
                              className="border-b border-border/50 hover:bg-muted/30"
                            >
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                    {bill.students?.nik}
                                  </span>
                                </div>
                                <p className="font-medium text-sm mt-1">
                                  {bill.students?.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Kelas {bill.students?.class}
                                </p>
                              </td>
                              <td className="py-4 px-4">
                                <p className="font-medium text-sm">
                                  {
                                    LAUNDRY_CATEGORIES[
                                      bill.category as keyof typeof LAUNDRY_CATEGORIES
                                    ]?.label
                                  }
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {bill.category === "kiloan"
                                    ? `${bill.weight_kg} kg`
                                    : `${bill.item_count} pcs`}
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                  <Calendar className="h-3 w-3" />
                                  {formatLaundryDate(bill.laundry_date)}
                                </p>
                              </td>
                              <td className="py-4 px-4">
                                <p className="font-medium">
                                  {formatCurrency(bill.total_price)}
                                </p>
                                {bill.admin_fee > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    + Admin {formatCurrency(bill.admin_fee)}
                                  </p>
                                )}
                              </td>
                              <td className="py-4 px-4">
                                <div className="space-y-1">
                                  {/* Show total amount paid (calculated) */}
                                  {(() => {
                                    const totalWithAdmin =
                                      bill.total_price + (bill.admin_fee || 0);
                                    const wadiahUsed = bill.wadiah_used || 0;
                                    const rounding = bill.rounding_applied || 0;
                                    const actualPaid =
                                      bill.paid_amount && bill.paid_amount > 0
                                        ? bill.paid_amount
                                        : totalWithAdmin -
                                          wadiahUsed -
                                          rounding;

                                    return (
                                      <>
                                        {/* Total yang dibayar */}
                                        {actualPaid > 0 ? (
                                          <p className="font-medium text-sm">
                                            {formatCurrency(actualPaid)}
                                          </p>
                                        ) : wadiahUsed > 0 ? (
                                          /* Jika full wadiah, tampilkan label */
                                          <p className="font-medium text-sm text-amber-600">
                                            Full Wadiah
                                          </p>
                                        ) : (
                                          /* Fallback: tampilkan total tagihan */
                                          <p className="font-medium text-sm">
                                            {formatCurrency(totalWithAdmin)}
                                          </p>
                                        )}

                                        {/* Wadiah digunakan */}
                                        {wadiahUsed > 0 && (
                                          <p className="text-xs text-amber-600 flex items-center gap-1">
                                            <PiggyBank className="h-3 w-3" />
                                            Wadiah: -
                                            {formatCurrency(wadiahUsed)}
                                          </p>
                                        )}

                                        {/* Diskon/pembulatan */}
                                        {rounding > 0 && (
                                          <p className="text-xs text-green-600">
                                            Diskon: -{formatCurrency(rounding)}
                                          </p>
                                        )}

                                        {/* Kembalian */}
                                        {bill.change_amount > 0 && (
                                          <p className="text-xs text-blue-600">
                                            Kembalian:{" "}
                                            {formatCurrency(bill.change_amount)}
                                          </p>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <span
                                  className={`text-xs px-2 py-1 rounded-full font-medium ${
                                    bill.payment_method === "cash" ||
                                    bill.payment_method === "manual"
                                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                      : bill.payment_method === "wadiah"
                                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                  }`}
                                >
                                  {bill.payment_method === "cash"
                                    ? "💵 Tunai"
                                    : bill.payment_method === "manual"
                                      ? "✋ Manual"
                                      : bill.payment_method === "wadiah"
                                        ? "🏦 Wadiah"
                                        : bill.payment_method === "qris"
                                          ? "📱 QRIS"
                                          : bill.payment_method?.includes(
                                                "va",
                                              ) ||
                                              bill.payment_method ===
                                                "bank_transfer" ||
                                              bill.payment_method === "echannel"
                                            ? "🏦 Transfer"
                                            : bill.payment_method || "-"}
                                </span>
                                <div className="mt-1">
                                  <StatusBadge status={bill.status} />
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                {bill.paid_at ? (
                                  <p className="text-sm">
                                    {formatDateTime(bill.paid_at)}
                                  </p>
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    {formatDate(bill.created_at)}
                                  </p>
                                )}
                              </td>
                              <td className="py-4 px-4">
                                {bill.notes ? (
                                  <div className="flex items-start gap-1.5 max-w-[200px]">
                                    <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                                    <p className="text-sm text-muted-foreground break-words">
                                      {bill.notes}
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    -
                                  </p>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination for Paid Bills */}
                    {paidBillsCount > PAGE_SIZE && (
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-border">
                        <div className="text-sm text-muted-foreground">
                          Menampilkan {paidPage * PAGE_SIZE + 1} -{" "}
                          {Math.min((paidPage + 1) * PAGE_SIZE, paidBillsCount)}{" "}
                          dari {paidBillsCount} riwayat
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setPaidPage((p) => Math.max(0, p - 1))
                            }
                            disabled={paidPage === 0 || loading}
                          >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Sebelumnya
                          </Button>
                          <div className="flex items-center gap-1 px-3 py-1 rounded-md bg-muted text-sm font-medium">
                            Halaman {paidPage + 1} dari{" "}
                            {Math.ceil(paidBillsCount / PAGE_SIZE)}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPaidPage((p) => p + 1)}
                            disabled={
                              (paidPage + 1) * PAGE_SIZE >= paidBillsCount ||
                              loading
                            }
                          >
                            Selanjutnya
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Single Bill Wadiah Payment Dialog */}
        <Dialog
          open={showWadiahPaymentDialog}
          onOpenChange={setShowWadiahPaymentDialog}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PiggyBank className="h-5 w-5 text-amber-600" />
                Bayar dengan Wadiah
              </DialogTitle>
              <DialogDescription>
                Gunakan saldo wadiah untuk membayar tagihan
              </DialogDescription>
            </DialogHeader>

            {selectedBillForWadiah && singleBillWadiahInfo && (
              <div className="space-y-4">
                {/* Bill Info */}
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Siswa</span>
                    <span className="font-medium">
                      {selectedBillForWadiah.students?.name}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Kelas</span>
                    <span>{selectedBillForWadiah.students?.class}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Kategori</span>
                    <span>
                      {
                        LAUNDRY_CATEGORIES[
                          selectedBillForWadiah.category as keyof typeof LAUNDRY_CATEGORIES
                        ]?.label
                      }
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-medium border-t pt-2">
                    <span>Total Tagihan</span>
                    <span className="text-primary">
                      {formatCurrency(singleBillWadiahInfo.totalAmount)}
                    </span>
                  </div>
                </div>

                {/* Wadiah Balance */}
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-medium">Saldo Wadiah</span>
                    </div>
                    <span className="font-bold text-amber-600">
                      {formatCurrency(singleBillWadiahInfo.studentBalance)}
                    </span>
                  </div>
                  {singleBillWadiahInfo.canPayFullWithWadiah && (
                    <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Saldo mencukupi untuk bayar penuh!
                    </p>
                  )}
                </div>

                {/* Use Wadiah Toggle */}
                <div className="flex items-start gap-3 p-3 rounded-lg border">
                  <Checkbox
                    id="use-wadiah-single"
                    checked={useWadiahBalance}
                    onCheckedChange={(checked) =>
                      setUseWadiahBalance(checked as boolean)
                    }
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor="use-wadiah-single"
                      className="cursor-pointer"
                    >
                      Gunakan Saldo Wadiah
                    </Label>
                    {useWadiahBalance && (
                      <div className="mt-2">
                        <Label
                          htmlFor="wadiah-amount-single"
                          className="text-xs text-muted-foreground"
                        >
                          Jumlah yang digunakan
                        </Label>
                        <Input
                          id="wadiah-amount-single"
                          type="number"
                          value={wadiahAmountToUse}
                          onChange={(e) => {
                            const val = Math.min(
                              Math.max(0, Number(e.target.value)),
                              Math.min(
                                singleBillWadiahInfo.studentBalance,
                                singleBillWadiahInfo.totalAmount,
                              ),
                            );
                            setWadiahAmountToUse(val);
                          }}
                          max={Math.min(
                            singleBillWadiahInfo.studentBalance,
                            singleBillWadiahInfo.totalAmount,
                          )}
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Maks:{" "}
                          {formatCurrency(
                            Math.min(
                              singleBillWadiahInfo.studentBalance,
                              singleBillWadiahInfo.totalAmount,
                            ),
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Payment Summary */}
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Tagihan</span>
                    <span>
                      {formatCurrency(singleBillWadiahInfo.totalAmount)}
                    </span>
                  </div>
                  {singleBillWadiahInfo.wadiahToUse > 0 && (
                    <div className="flex justify-between text-sm text-amber-600">
                      <span>Wadiah Digunakan</span>
                      <span>
                        - {formatCurrency(singleBillWadiahInfo.wadiahToUse)}
                      </span>
                    </div>
                  )}
                  {singleBillWadiahInfo.remainingAmount > 0 && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Sisa Tagihan
                        </span>
                        <span>
                          {formatCurrency(singleBillWadiahInfo.remainingAmount)}
                        </span>
                      </div>
                      {!isCashier && singleBillWadiahInfo.adminFee > 0 && (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Biaya Admin</span>
                          <span>
                            + {formatCurrency(singleBillWadiahInfo.adminFee)}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span>Total Bayar</span>
                    <span className="text-primary">
                      {singleBillWadiahInfo.remainingAmount > 0
                        ? formatCurrency(singleBillWadiahInfo.finalTotal)
                        : "Rp 0 (Lunas dengan Wadiah)"}
                    </span>
                  </div>
                  {singleBillWadiahInfo.remainingAmount > 0 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" />
                      Sisa akan dibayar via{" "}
                      {!isCashier ? "QRIS/Transfer" : "Tunai/Online"}
                    </p>
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowWadiahPaymentDialog(false);
                  setSelectedBillForWadiah(null);
                }}
                disabled={isProcessingWadiah}
              >
                Batal
              </Button>
              <Button
                onClick={handleWadiahPayment}
                disabled={isProcessingWadiah}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {isProcessingWadiah ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Banknote className="h-4 w-4 mr-2" />
                )}
                {isProcessingWadiah
                  ? "Memproses..."
                  : singleBillWadiahInfo?.remainingAmount === 0
                    ? "Bayar Penuh dengan Wadiah"
                    : "Lanjutkan Pembayaran"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Wadiah Payment Dialog */}
        <Dialog
          open={showBulkWadiahDialog}
          onOpenChange={setShowBulkWadiahDialog}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PiggyBank className="h-5 w-5 text-amber-600" />
                Bayar {selectedBills.size} Tagihan dengan Wadiah
              </DialogTitle>
              <DialogDescription>
                Gunakan saldo wadiah untuk membayar beberapa tagihan sekaligus
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Summary Info */}
              <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Jumlah Tagihan</span>
                  <span className="font-medium">
                    {selectedBills.size} tagihan
                  </span>
                </div>
                <div className="flex justify-between text-sm font-medium border-t pt-2">
                  <span>Total Tagihan</span>
                  <span className="text-primary">
                    {formatCurrency(bulkWadiahInfo.totalAmount)}
                  </span>
                </div>
              </div>

              {/* Wadiah Balance */}
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium">
                      Total Saldo Wadiah
                    </span>
                  </div>
                  <span className="font-bold text-amber-600">
                    {formatCurrency(bulkWadiahInfo.totalWadiahAvailable)}
                  </span>
                </div>
                {bulkWadiahInfo.canPayFullWithWadiah && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Saldo mencukupi untuk bayar semua tagihan!
                  </p>
                )}
              </div>

              {/* Use Wadiah Toggle */}
              <div className="flex items-start gap-3 p-3 rounded-lg border">
                <Checkbox
                  id="use-wadiah-bulk"
                  checked={bulkUseWadiah}
                  onCheckedChange={(checked) =>
                    setBulkUseWadiah(checked as boolean)
                  }
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="use-wadiah-bulk" className="cursor-pointer">
                    Gunakan Saldo Wadiah
                  </Label>
                  {bulkUseWadiah && (
                    <div className="mt-2">
                      <Label
                        htmlFor="wadiah-amount-bulk"
                        className="text-xs text-muted-foreground"
                      >
                        Jumlah yang digunakan
                      </Label>
                      <Input
                        id="wadiah-amount-bulk"
                        type="number"
                        value={bulkWadiahAmount}
                        onChange={(e) => {
                          const val = Math.min(
                            Math.max(0, Number(e.target.value)),
                            Math.min(
                              bulkWadiahInfo.totalWadiahAvailable,
                              bulkWadiahInfo.totalAmount,
                            ),
                          );
                          setBulkWadiahAmount(val);
                        }}
                        max={Math.min(
                          bulkWadiahInfo.totalWadiahAvailable,
                          bulkWadiahInfo.totalAmount,
                        )}
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Maks:{" "}
                        {formatCurrency(
                          Math.min(
                            bulkWadiahInfo.totalWadiahAvailable,
                            bulkWadiahInfo.totalAmount,
                          ),
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Summary */}
              <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Tagihan</span>
                  <span>{formatCurrency(bulkWadiahInfo.totalAmount)}</span>
                </div>
                {bulkWadiahInfo.wadiahToUse > 0 && (
                  <div className="flex justify-between text-sm text-amber-600">
                    <span>Wadiah Digunakan</span>
                    <span>- {formatCurrency(bulkWadiahInfo.wadiahToUse)}</span>
                  </div>
                )}
                {bulkWadiahInfo.remainingAmount > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Sisa Tagihan
                      </span>
                      <span>
                        {formatCurrency(bulkWadiahInfo.remainingAmount)}
                      </span>
                    </div>
                    {!isCashier && bulkWadiahInfo.adminFee > 0 && (
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Biaya Admin</span>
                        <span>+ {formatCurrency(bulkWadiahInfo.adminFee)}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total Bayar</span>
                  <span className="text-primary">
                    {bulkWadiahInfo.remainingAmount > 0
                      ? formatCurrency(bulkWadiahInfo.finalTotal)
                      : "Rp 0 (Lunas dengan Wadiah)"}
                  </span>
                </div>
                {bulkWadiahInfo.remainingAmount > 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <ArrowRight className="h-3 w-3" />
                    Sisa akan dibayar via{" "}
                    {!isCashier ? "QRIS/Transfer" : "Tunai/Online"}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setShowBulkWadiahDialog(false)}
                disabled={isProcessingWadiah}
              >
                Batal
              </Button>
              <Button
                onClick={handleBulkWadiahPayment}
                disabled={isProcessingWadiah}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {isProcessingWadiah ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Banknote className="h-4 w-4 mr-2" />
                )}
                {isProcessingWadiah
                  ? "Memproses..."
                  : bulkWadiahInfo.remainingAmount === 0
                    ? "Bayar Semua dengan Wadiah"
                    : "Lanjutkan Pembayaran"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
