import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  RoundingPolicy,
  WadiahTransactionType,
  StudentWadiahBalance,
  WadiahTransaction,
  RoundingSettings,
} from "@/integrations/supabase/types";

interface UseWadiahOptions {
  studentId?: string;
  autoFetch?: boolean;
}

interface WadiahState {
  balance: StudentWadiahBalance | null;
  transactions: WadiahTransaction[];
  settings: RoundingSettings | null;
  loading: boolean;
  error: string | null;
}

interface ProcessTransactionParams {
  studentId: string;
  transactionType: WadiahTransactionType;
  amount: number;
  orderId?: string | null;
  notes?: string | null;
  customerConsent?: boolean;
  originalAmount?: number | null;
  roundedAmount?: number | null;
}

export function useWadiah(options: UseWadiahOptions = {}) {
  const { studentId, autoFetch = true } = options;
  const { toast } = useToast();

  const [state, setState] = useState<WadiahState>({
    balance: null,
    transactions: [],
    settings: null,
    loading: false,
    error: null,
  });

  // Fetch rounding settings
  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("rounding_settings")
        .select("*")
        .single();

      if (error && error.code !== "PGRST116") throw error;

      setState((prev) => ({ ...prev, settings: data }));
      return data;
    } catch (error: any) {
      console.error("Error fetching rounding settings:", error);
      return null;
    }
  }, []);

  // Fetch student's wadiah balance
  const fetchBalance = useCallback(
    async (sid?: string) => {
      const targetStudentId = sid || studentId;
      if (!targetStudentId) return null;

      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const { data, error } = await supabase
          .from("student_wadiah_balance")
          .select("*")
          .eq("student_id", targetStudentId)
          .single();

        if (error && error.code !== "PGRST116") throw error;

        setState((prev) => ({ ...prev, balance: data, loading: false }));
        return data;
      } catch (error: any) {
        console.error("Error fetching wadiah balance:", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error.message,
        }));
        return null;
      }
    },
    [studentId],
  );

  // Fetch student's wadiah transactions
  const fetchTransactions = useCallback(
    async (sid?: string, limit = 50) => {
      const targetStudentId = sid || studentId;
      if (!targetStudentId) return [];

      try {
        const { data, error } = await supabase
          .from("wadiah_transactions")
          .select("*")
          .eq("student_id", targetStudentId)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (error) throw error;

        setState((prev) => ({ ...prev, transactions: data || [] }));
        return data || [];
      } catch (error: any) {
        console.error("Error fetching wadiah transactions:", error);
        return [];
      }
    },
    [studentId],
  );

  // Get or create wadiah balance for a student
  const getOrCreateBalance = useCallback(
    async (sid: string): Promise<StudentWadiahBalance | null> => {
      try {
        // First try to get existing balance
        const { data: existing, error: fetchError } = await supabase
          .from("student_wadiah_balance")
          .select("*")
          .eq("student_id", sid)
          .single();

        if (existing) return existing;

        // If not exists, create new one
        if (fetchError && fetchError.code === "PGRST116") {
          const { data: created, error: createError } = await supabase
            .from("student_wadiah_balance")
            .insert({ student_id: sid, balance: 0 })
            .select()
            .single();

          if (createError) throw createError;
          return created;
        }

        if (fetchError) throw fetchError;
        return null;
      } catch (error: any) {
        console.error("Error getting/creating wadiah balance:", error);
        return null;
      }
    },
    [],
  );

  // Process a wadiah transaction
  const processTransaction = useCallback(
    async (
      params: ProcessTransactionParams,
    ): Promise<WadiahTransaction | null> => {
      try {
        // Ensure balance record exists
        const balanceRecord = await getOrCreateBalance(params.studentId);
        if (!balanceRecord) {
          throw new Error("Gagal membuat/mendapatkan saldo wadiah");
        }

        const currentBalance = balanceRecord.balance;
        let newBalance = currentBalance;

        // Calculate new balance based on transaction type
        if (
          ["deposit", "change_deposit", "adjustment"].includes(
            params.transactionType,
          )
        ) {
          newBalance = currentBalance + params.amount;
        } else if (params.transactionType === "payment") {
          if (currentBalance < params.amount) {
            throw new Error(
              `Saldo wadiah tidak mencukupi. Saldo: Rp ${currentBalance.toLocaleString("id-ID")}, Dibutuhkan: Rp ${params.amount.toLocaleString("id-ID")}`,
            );
          }
          newBalance = currentBalance - params.amount;
        } else if (params.transactionType === "refund") {
          if (currentBalance < params.amount) {
            throw new Error("Saldo tidak mencukupi untuk pengembalian");
          }
          newBalance = currentBalance - params.amount;
        }
        // 'sedekah' type doesn't affect balance

        // Calculate rounding difference
        const roundingDiff =
          (params.originalAmount || 0) - (params.roundedAmount || 0);

        // Insert transaction record
        const { data: transaction, error: txError } = await supabase
          .from("wadiah_transactions")
          .insert({
            student_id: params.studentId,
            transaction_type: params.transactionType,
            amount: params.amount,
            balance_before: currentBalance,
            balance_after: newBalance,
            order_id: params.orderId || null,
            original_amount: params.originalAmount || null,
            rounded_amount: params.roundedAmount || null,
            rounding_difference: roundingDiff || null,
            notes: params.notes || null,
            customer_consent: params.customerConsent ?? true,
          })
          .select()
          .single();

        if (txError) throw txError;

        // Update balance
        const updateData: any = {
          balance: newBalance,
          last_transaction_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (["deposit", "change_deposit"].includes(params.transactionType)) {
          updateData.total_deposited =
            balanceRecord.total_deposited + params.amount;
        } else if (params.transactionType === "payment") {
          updateData.total_used = balanceRecord.total_used + params.amount;
        } else if (params.transactionType === "sedekah") {
          updateData.total_sedekah =
            balanceRecord.total_sedekah + params.amount;
        }

        const { error: updateError } = await supabase
          .from("student_wadiah_balance")
          .update(updateData)
          .eq("student_id", params.studentId);

        if (updateError) throw updateError;

        // Refresh balance
        await fetchBalance(params.studentId);

        return transaction;
      } catch (error: any) {
        console.error("Error processing wadiah transaction:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message || "Gagal memproses transaksi wadiah",
        });
        return null;
      }
    },
    [getOrCreateBalance, fetchBalance, toast],
  );

  // Deposit change to wadiah (for cashier)
  const depositChange = useCallback(
    async (
      studentId: string,
      changeAmount: number,
      orderId?: string,
      notes?: string,
    ): Promise<boolean> => {
      const result = await processTransaction({
        studentId,
        transactionType: "change_deposit",
        amount: changeAmount,
        orderId,
        notes: notes || "Sisa kembalian disimpan sebagai saldo wadiah",
        customerConsent: true,
      });

      if (result) {
        toast({
          title: "Saldo Wadiah Bertambah",
          description: `Rp ${changeAmount.toLocaleString("id-ID")} ditambahkan ke saldo`,
        });
        return true;
      }
      return false;
    },
    [processTransaction, toast],
  );

  // Apply wadiah balance for payment
  const applyBalanceForPayment = useCallback(
    async (
      studentId: string,
      amount: number,
      orderId: string,
    ): Promise<boolean> => {
      const result = await processTransaction({
        studentId,
        transactionType: "payment",
        amount,
        orderId,
        notes: "Penggunaan saldo wadiah untuk pembayaran",
      });

      if (result) {
        toast({
          title: "Saldo Digunakan",
          description: `Rp ${amount.toLocaleString("id-ID")} dipotong dari saldo wadiah`,
        });
        return true;
      }
      return false;
    },
    [processTransaction, toast],
  );

  // Record sedekah (rounding down discount)
  const recordSedekah = useCallback(
    async (
      studentId: string,
      amount: number,
      orderId?: string,
      originalAmount?: number,
      roundedAmount?: number,
    ): Promise<boolean> => {
      const result = await processTransaction({
        studentId,
        transactionType: "sedekah",
        amount,
        orderId,
        notes: "Pembulatan ke bawah (sedekah/diskon)",
        originalAmount,
        roundedAmount,
      });

      return result !== null;
    },
    [processTransaction],
  );

  // Calculate rounded amount based on settings
  const calculateRoundedAmount = useCallback(
    (
      amount: number,
      roundingMultiple?: number,
      roundDown: boolean = true,
    ): number => {
      const multiple =
        roundingMultiple || state.settings?.rounding_multiple || 500;

      if (roundDown) {
        return Math.floor(amount / multiple) * multiple;
      } else {
        return Math.ceil(amount / multiple) * multiple;
      }
    },
    [state.settings],
  );

  // Get rounding difference
  const getRoundingDifference = useCallback(
    (
      originalAmount: number,
      roundingMultiple?: number,
      roundDown: boolean = true,
    ): number => {
      const rounded = calculateRoundedAmount(
        originalAmount,
        roundingMultiple,
        roundDown,
      );
      return originalAmount - rounded;
    },
    [calculateRoundedAmount],
  );

  // Check if amount needs rounding
  const needsRounding = useCallback(
    (amount: number, roundingMultiple?: number): boolean => {
      const multiple =
        roundingMultiple || state.settings?.rounding_multiple || 500;
      return amount % multiple !== 0;
    },
    [state.settings],
  );

  // Fetch balances for multiple students
  const fetchMultipleBalances = useCallback(
    async (
      studentIds: string[],
    ): Promise<Map<string, StudentWadiahBalance>> => {
      const balanceMap = new Map<string, StudentWadiahBalance>();

      if (studentIds.length === 0) return balanceMap;

      try {
        const { data, error } = await supabase
          .from("student_wadiah_balance")
          .select("*")
          .in("student_id", studentIds);

        if (error) throw error;

        (data || []).forEach((balance) => {
          balanceMap.set(balance.student_id, balance);
        });

        return balanceMap;
      } catch (error: any) {
        console.error("Error fetching multiple balances:", error);
        return balanceMap;
      }
    },
    [],
  );

  // Get transaction type label
  const getTransactionTypeLabel = useCallback(
    (type: WadiahTransactionType): string => {
      const labels: Record<WadiahTransactionType, string> = {
        deposit: "Setoran",
        change_deposit: "Simpan Kembalian",
        payment: "Pembayaran",
        refund: "Pengembalian",
        adjustment: "Penyesuaian",
        sedekah: "Sedekah/Diskon",
      };
      return labels[type] || type;
    },
    [],
  );

  // Get rounding policy label
  const getRoundingPolicyLabel = useCallback(
    (policy: RoundingPolicy): string => {
      const labels: Record<RoundingPolicy, string> = {
        none: "Tidak Ada Pembulatan",
        round_down: "Bulatkan Ke Bawah (Sedekah)",
        round_up_ask: "Bulatkan Ke Atas (Minta Izin)",
        to_wadiah: "Simpan ke Saldo Wadiah",
      };
      return labels[policy] || policy;
    },
    [],
  );

  // Format currency
  const formatCurrency = useCallback((amount: number): string => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchSettings();
      if (studentId) {
        fetchBalance();
        fetchTransactions();
      }
    }
  }, [autoFetch, studentId, fetchSettings, fetchBalance, fetchTransactions]);

  return {
    // State
    balance: state.balance,
    transactions: state.transactions,
    settings: state.settings,
    loading: state.loading,
    error: state.error,

    // Actions
    fetchSettings,
    fetchBalance,
    fetchTransactions,
    getOrCreateBalance,
    processTransaction,
    depositChange,
    applyBalanceForPayment,
    recordSedekah,
    fetchMultipleBalances,

    // Calculations
    calculateRoundedAmount,
    getRoundingDifference,
    needsRounding,

    // Utilities
    getTransactionTypeLabel,
    getRoundingPolicyLabel,
    formatCurrency,

    // Online Payment Setting for Parent
    isOnlinePaymentEnabled:
      state.settings?.parent_online_payment_enabled ?? true,
  };
}

export default useWadiah;
