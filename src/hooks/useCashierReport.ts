import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type {
  PaymentRecord,
  WadiahDepositRecord,
  SummaryData,
  CashierOption,
  ReportPeriod,
  PaymentMethodFilter,
} from "@/types/cashier-reports";

const PAGE_SIZE = 20;

const INITIAL_SUMMARY: SummaryData = {
  totalTransactions: 0,
  totalAmount: 0,
  cashTransactions: 0,
  cashAmount: 0,
  cashReceivedAmount: 0,
  transferTransactions: 0,
  transferAmount: 0,
  wadiahUsedTotal: 0,
  wadiahDepositTotal: 0,
  manualDepositTotal: 0,
  manualDepositCount: 0,
  byCategory: {},
  byClass: {},
};

interface UseCashierReportParams {
  userId: string | undefined;
  userRole: string | undefined;
  selectedCashier: string;
  period: ReportPeriod;
  customStartDate?: Date;
  customEndDate?: Date;
  paymentMethod: PaymentMethodFilter;
  searchQuery: string;
  currentPage: number;
}

export function useCashierReport({
  userId,
  userRole,
  selectedCashier,
  period,
  customStartDate,
  customEndDate,
  paymentMethod,
  searchQuery,
  currentPage,
}: UseCashierReportParams) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [wadiahDeposits, setWadiahDeposits] = useState<WadiahDepositRecord[]>([]);
  const [summary, setSummary] = useState<SummaryData>(INITIAL_SUMMARY);
  const [totalCount, setTotalCount] = useState(0);
  const [cashierList, setCashierList] = useState<CashierOption[]>([]);

  const isAdmin = userRole === "admin";

  // Get filter cashier ID
  const getFilterCashierId = useCallback((): string | null => {
    if (isAdmin) {
      if (selectedCashier === "all") return null;
      if (selectedCashier === "me") return userId || null;
      return selectedCashier;
    }
    return userId || null;
  }, [isAdmin, selectedCashier, userId]);

  // Get date range
  const getDateRange = useCallback(() => {
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
      default:
        startDate = new Date(0);
    }

    return { startDate, endDate };
  }, [period, customStartDate, customEndDate]);

  // Fetch cashier list (admin only)
  useEffect(() => {
    if (!isAdmin) return;

    const fetchCashierList = async () => {
      try {
        const { data: cashierRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "cashier");

        if (cashierRoles && cashierRoles.length > 0) {
          const userIds = cashierRoles.map((r) => r.user_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", userIds);

          if (profiles) {
            setCashierList(
              profiles
                .filter((p) => p.user_id !== userId)
                .map((p) => ({
                  id: p.user_id,
                  full_name: p.full_name || "Kasir",
                }))
            );
          }
        }
      } catch (error) {
        console.error("Error fetching cashier list:", error);
      }
    };

    fetchCashierList();
  }, [isAdmin, userId]);

  // Fetch payments
  const fetchPayments = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange();
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const filterCashierId = getFilterCashierId();

      // Main query
      let query = supabase
        .from("laundry_orders")
        .select(
          `
          id, category, weight_kg, item_count, total_price, admin_fee,
          payment_method, status, paid_at, created_at, laundry_date,
          wadiah_used, change_amount, paid_amount, rounding_applied, paid_by,
          students!inner (id, name, class, nik),
          laundry_partners (name)
        `,
          { count: "exact" }
        )
        .in("status", ["DIBAYAR", "SELESAI"])
        .not("paid_at", "is", null)
        .order("paid_at", { ascending: false });

      if (filterCashierId) {
        query = query.eq("paid_by", filterCashierId);
      }

      if (period !== "all") {
        query = query
          .gte("paid_at", startDate.toISOString())
          .lt("paid_at", endDate.toISOString());
      }

      if (paymentMethod !== "all") {
        query = query.eq("payment_method", paymentMethod);
      }

      if (searchQuery) {
        query = query.or(
          `name.ilike.%${searchQuery}%,class.ilike.%${searchQuery}%,nik.ilike.%${searchQuery}%`,
          { foreignTable: "students" }
        );
      }

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      setPayments((data || []) as PaymentRecord[]);
      setTotalCount(count || 0);

      // Summary query
      let summaryQuery = supabase
        .from("laundry_orders")
        .select(`total_price, paid_amount, payment_method, category, wadiah_used, students!inner (class)`)
        .in("status", ["DIBAYAR", "SELESAI"])
        .not("paid_at", "is", null);

      if (filterCashierId) {
        summaryQuery = summaryQuery.eq("paid_by", filterCashierId);
      }

      if (period !== "all") {
        summaryQuery = summaryQuery
          .gte("paid_at", startDate.toISOString())
          .lt("paid_at", endDate.toISOString());
      }

      if (paymentMethod !== "all") {
        summaryQuery = summaryQuery.eq("payment_method", paymentMethod);
      }

      const { data: summaryRows, error: summaryError } = await summaryQuery;

      if (!summaryError && summaryRows) {
        const currentSummary: SummaryData = { ...INITIAL_SUMMARY };
        currentSummary.totalTransactions = summaryRows.length;

        summaryRows.forEach((payment: Record<string, unknown>) => {
          const totalPrice = (payment.total_price as number) || 0;
          const paidAmount = (payment.paid_amount as number) || 0;
          const payMethod = payment.payment_method as string;
          const wadiahUsed = (payment.wadiah_used as number) || 0;
          const category = payment.category as string;
          const students = payment.students as { class?: string } | null;

          currentSummary.totalAmount += totalPrice;

          if (payMethod === "cash") {
            currentSummary.cashTransactions++;
            currentSummary.cashAmount += totalPrice;
            currentSummary.cashReceivedAmount += paidAmount > 0 ? paidAmount : totalPrice - wadiahUsed;
          } else {
            currentSummary.transferTransactions++;
            currentSummary.transferAmount += totalPrice;
          }

          if (wadiahUsed) {
            currentSummary.wadiahUsedTotal += wadiahUsed;
          }

          const cat = category;
          if (!currentSummary.byCategory[cat]) {
            currentSummary.byCategory[cat] = { count: 0, amount: 0 };
          }
          currentSummary.byCategory[cat].count++;
          currentSummary.byCategory[cat].amount += totalPrice;

          const cls = students?.class || "Unknown";
          if (!currentSummary.byClass[cls]) {
            currentSummary.byClass[cls] = { count: 0, amount: 0 };
          }
          currentSummary.byClass[cls].count++;
          currentSummary.byClass[cls].amount += totalPrice;
        });

        // Wadiah transactions
        let wadiahQuery = supabase
          .from("wadiah_transactions")
          .select(`id, amount, transaction_type, created_at, student_id, notes, balance_before, balance_after, students (id, name, class, nik)`)
          .in("transaction_type", ["change_deposit", "deposit"])
          .order("created_at", { ascending: false });

        if (period !== "all") {
          wadiahQuery = wadiahQuery
            .gte("created_at", startDate.toISOString())
            .lt("created_at", endDate.toISOString());
        }

        const { data: wadiahData, error: wadiahError } = await wadiahQuery;

        if (!wadiahError && wadiahData) {
          const manualDeposits: WadiahDepositRecord[] = [];

          wadiahData.forEach((tx) => {
            if (tx.transaction_type === "change_deposit") {
              currentSummary.wadiahDepositTotal += tx.amount || 0;
            } else if (tx.transaction_type === "deposit") {
              currentSummary.manualDepositTotal += tx.amount || 0;
              currentSummary.manualDepositCount++;
              manualDeposits.push(tx as WadiahDepositRecord);
            }
          });

          setWadiahDeposits(manualDeposits);
        }

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
  }, [userId, currentPage, period, paymentMethod, searchQuery, customStartDate, customEndDate, getDateRange, getFilterCashierId, toast]);

  // Fetch on dependencies change
  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  return {
    loading,
    payments,
    wadiahDeposits,
    summary,
    totalCount,
    cashierList,
    pageSize: PAGE_SIZE,
    refetch: fetchPayments,
    getDateRange,
  };
}
