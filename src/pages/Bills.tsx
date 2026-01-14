import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMidtrans } from "@/hooks/useMidtrans";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
  students: {
    name: string;
    class: string;
  };
  laundry_partners: {
    name: string;
  };
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
  const [unpaidBills, setUnpaidBills] = useState<Bill[]>([]);
  const [paidBills, setPaidBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingBillId, setPayingBillId] = useState<string | null>(null);
  const [selectedBills, setSelectedBills] = useState<Set<string>>(new Set());
  const [isPayingAll, setIsPayingAll] = useState(false);
  const [paidPage, setPaidPage] = useState(0);
  const [paidBillsCount, setPaidBillsCount] = useState(0);

  useEffect(() => {
    fetchBills();
  }, [paidPage]);

  const fetchBills = async () => {
    try {
      setLoading(true);

      // Fetch all unpaid bills (no pagination - users need to see all)
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
          students (name, class),
          laundry_partners (name)
        `,
        )
        .in("status", ["DISETUJUI_MITRA", "MENUNGGU_PEMBAYARAN"])
        .order("laundry_date", { ascending: false });

      if (unpaidError) throw unpaidError;
      setUnpaidBills(unpaidData || []);

      // Fetch paginated paid bills
      const from = paidPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

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
          students (name, class),
          laundry_partners (name)
        `,
          { count: "exact" },
        )
        .in("status", ["DIBAYAR", "SELESAI"])
        .order("laundry_date", { ascending: false })
        .range(from, to);

      if (paidError) throw paidError;
      setPaidBills(paidData || []);
      setPaidBillsCount(count || 0);
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

  // Handle bulk payment for selected bills
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

  // Select/Deselect all unpaid bills
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
      month: "short",
      year: "numeric",
    });
  };

  const formatLaundryDate = (date: string) => {
    return new Date(date + "T00:00:00").toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const totalUnpaid = unpaidBills.reduce((sum, b) => sum + b.total_price, 0);
  const selectedTotal = unpaidBills
    .filter((b) => selectedBills.has(b.id))
    .reduce((sum, b) => sum + b.total_price, 0);
  const allBills = [...unpaidBills, ...paidBills];

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
                  <div className="flex gap-2">
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
                    <Button
                      onClick={handleBulkPayment}
                      disabled={
                        selectedBills.size === 0 || isPayingAll || isProcessing
                      }
                    >
                      {isPayingAll ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CreditCard className="h-4 w-4 mr-2" />
                      )}
                      {isPayingAll
                        ? "Memproses..."
                        : `Bayar Sekaligus (${selectedBills.size})`}
                    </Button>
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
        ) : allBills.length === 0 ? (
          <Card className="dashboard-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Receipt className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Belum ada tagihan
              </h3>
              <p className="text-muted-foreground text-center">
                Tagihan akan muncul setelah order laundry disetujui mitra
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
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold">
                                    {bill.students?.name}
                                  </h3>
                                  <span className="text-sm text-muted-foreground">
                                    Kelas {bill.students?.class}
                                  </span>
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
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
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
                                <Button
                                  variant="outline"
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
                                    : "Bayar"}
                                </Button>
                                {userRole === "cashier" && (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={async () => {
                                      setPayingBillId(bill.id);
                                      const success =
                                        await confirmPaymentManually(
                                          bill.id,
                                          "bank_transfer",
                                        );
                                      if (success) fetchBills();
                                      setPayingBillId(null);
                                    }}
                                    disabled={
                                      payingBillId === bill.id || isProcessing
                                    }
                                  >
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                    Konfirmasi Manual
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
                <h2 className="text-lg font-semibold">
                  Riwayat Pembayaran ({paidBillsCount} transaksi)
                </h2>
                <Card className="dashboard-card">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-muted/30">
                          <tr>
                            <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                              Siswa
                            </th>
                            <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                              Kategori
                            </th>
                            <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                              Laundry
                            </th>
                            <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                              Admin
                            </th>
                            <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                              Total
                            </th>
                            <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                              Metode
                            </th>
                            <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                              Status
                            </th>
                            <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                              Tgl Laundry
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {paidBills.map((bill) => (
                            <tr
                              key={bill.id}
                              className="border-b border-border/50"
                            >
                              <td className="py-4 px-6">
                                <p className="font-medium">
                                  {bill.students?.name}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Kelas {bill.students?.class}
                                </p>
                              </td>
                              <td className="py-4 px-6">
                                {
                                  LAUNDRY_CATEGORIES[
                                    bill.category as keyof typeof LAUNDRY_CATEGORIES
                                  ]?.label
                                }
                              </td>
                              <td className="py-4 px-6">
                                {formatCurrency(bill.total_price)}
                              </td>
                              <td className="py-4 px-6 text-muted-foreground">
                                {formatCurrency(bill.admin_fee || 0)}
                              </td>
                              <td className="py-4 px-6 font-medium">
                                {formatCurrency(
                                  bill.total_price + (bill.admin_fee || 0),
                                )}
                              </td>
                              <td className="py-4 px-6">
                                <span className="text-xs px-2 py-1 bg-muted rounded-full">
                                  {bill.payment_method === "qris"
                                    ? "QRIS"
                                    : bill.payment_method?.includes("va") ||
                                        bill.payment_method ===
                                          "bank_transfer" ||
                                        bill.payment_method === "echannel"
                                      ? "VA"
                                      : bill.payment_method || "-"}
                                </span>
                              </td>
                              <td className="py-4 px-6">
                                <StatusBadge status={bill.status} />
                              </td>
                              <td className="py-4 px-6 text-muted-foreground">
                                {formatDate(bill.created_at)}
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
      </div>
    </DashboardLayout>
  );
}
