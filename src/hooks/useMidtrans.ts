import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  calculateAdminFee,
  PAYMENT_METHODS,
  getEnabledPaymentMethods,
  QRIS_MAX_AMOUNT,
} from "@/lib/constants";

declare global {
  interface Window {
    snap: {
      pay: (
        token: string,
        options: {
          onSuccess?: (result: MidtransResult) => void;
          onPending?: (result: MidtransResult) => void;
          onError?: (result: MidtransResult) => void;
          onClose?: () => void;
        },
      ) => void;
    };
  }
}

interface MidtransResult {
  order_id: string;
  transaction_id: string;
  transaction_status: string;
  payment_type: string;
  status_code: string;
  status_message: string;
}

interface PaymentParams {
  orderId: string;
  grossAmount: number;
  studentName: string;
  category: string;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  adminFee?: number;
  isCashier?: boolean; // Flag for cashier - no admin fee
}

interface BulkPaymentParams {
  orderIds: string[];
  grossAmount: number;
  description: string;
  studentNames: string;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  adminFee?: number;
  isCashier?: boolean; // Flag for cashier - no admin fee
}

// NOTE: Server Key should NEVER be in frontend code for production!
// All Midtrans token creation should go through Edge Function
const MIDTRANS_IS_SANDBOX = true; // Set to false for production

export function useMidtrans() {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  // Calculate estimated admin fee based on amount
  // QRIS (0.7%) for < 628,000, VA (Rp 4,400) for >= 628,000
  const getEstimatedAdminFee = (baseAmount: number): number => {
    return calculateAdminFee(baseAmount);
  };

  // Get actual admin fee based on payment method used
  const getActualAdminFee = (
    baseAmount: number,
    paymentType: string,
  ): number => {
    return calculateAdminFee(baseAmount, paymentType);
  };

  // Get payment method label
  const getPaymentMethodLabel = (amount: number): string => {
    return amount < QRIS_MAX_AMOUNT ? "QRIS (0.7%)" : "VA (Rp 4.400)";
  };

  // NOTE: createSnapTokenDirect has been removed for security.
  // All Midtrans token creation now goes through Edge Function only.

  const createSnapToken = async (
    params: PaymentParams & { adminFee: number },
  ): Promise<string | null> => {
    try {
      // Call Supabase Edge Function (secure - server key stays on server)
      const totalWithFee = params.grossAmount + params.adminFee;
      const { data, error } = await supabase.functions.invoke(
        "create-midtrans-token",
        {
          body: {
            ...params,
            enabledPayments:
              getEnabledPaymentMethods(totalWithFee).enabled_payments,
          },
        },
      );

      if (error) {
        console.error("Edge function error:", error);
        throw new Error(
          "Gagal membuat token pembayaran. Pastikan Edge Function 'create-midtrans-token' sudah di-deploy dan MIDTRANS_SERVER_KEY sudah di-set di Supabase Secrets.",
        );
      }

      if (!data?.token) {
        throw new Error("Token tidak diterima dari server");
      }

      return data.token;
    } catch (error: any) {
      console.error("Error creating snap token:", error);
      throw error;
    }
  };

  const processPayment = async (
    params: PaymentParams,
    onSuccess?: () => void,
    onPending?: () => void,
  ) => {
    setIsProcessing(true);

    // Calculate admin fee
    const adminFee =
      params.adminFee ?? getEstimatedAdminFee(params.grossAmount);

    try {
      // Check if Midtrans Snap is loaded
      if (!window.snap) {
        toast({
          variant: "destructive",
          title: "Error",
          description:
            "Midtrans Snap tidak tersedia. Refresh halaman dan coba lagi.",
        });
        return;
      }

      // Try to get snap token via Edge Function (or fallback to direct API if server key is configured)
      const snapToken = await createSnapToken({ ...params, adminFee });

      if (!snapToken) {
        throw new Error("Gagal membuat token pembayaran");
      }

      // Open Midtrans Snap payment popup
      window.snap.pay(snapToken, {
        onSuccess: async (result: MidtransResult) => {
          console.log("Payment success:", result);

          // Calculate actual admin fee based on payment method used
          const actualAdminFee = getActualAdminFee(
            params.grossAmount,
            result.payment_type,
          );

          // Update order status to DIBAYAR with payment method
          await supabase
            .from("laundry_orders")
            .update({
              status: "DIBAYAR",
              paid_at: new Date().toISOString(),
              payment_method: result.payment_type,
              admin_fee: actualAdminFee,
            })
            .eq("id", params.orderId);

          toast({
            title: "Pembayaran Berhasil",
            description: "Terima kasih! Pembayaran Anda telah berhasil.",
          });

          onSuccess?.();
        },
        onPending: (result: MidtransResult) => {
          console.log("Payment pending:", result);

          toast({
            title: "Pembayaran Tertunda",
            description: "Silakan selesaikan pembayaran Anda.",
          });

          onPending?.();
        },
        onError: (result: MidtransResult) => {
          console.error("Payment error:", result);

          toast({
            variant: "destructive",
            title: "Pembayaran Gagal",
            description:
              result.status_message ||
              "Terjadi kesalahan saat memproses pembayaran.",
          });
        },
        onClose: () => {
          console.log("Payment popup closed");

          toast({
            title: "Pembayaran Dibatalkan",
            description: "Anda menutup jendela pembayaran.",
          });
        },
      });
    } catch (error: any) {
      console.error("Payment error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Gagal memproses pembayaran",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Manual payment confirmation (for admin/cashier/testing)
  // isCashPayment: true for cash payments at cashier (no admin fee)
  // paidBy: UUID of the cashier who processed the payment
  const confirmPaymentManually = async (
    orderId: string,
    paymentMethod?: string,
    isCashPayment?: boolean,
    paidBy?: string,
  ) => {
    try {
      // Get order to calculate admin fee
      const { data: order } = await supabase
        .from("laundry_orders")
        .select("total_price")
        .eq("id", orderId)
        .single();

      // Cash payments at cashier have no admin fee
      const adminFee = isCashPayment
        ? 0
        : paymentMethod
          ? getActualAdminFee(order?.total_price || 0, paymentMethod)
          : PAYMENT_METHODS.bank_transfer.feeValue;

      const { error } = await supabase
        .from("laundry_orders")
        .update({
          status: "DIBAYAR",
          paid_at: new Date().toISOString(),
          payment_method: isCashPayment ? "cash" : paymentMethod || "manual",
          admin_fee: adminFee,
          paid_by: paidBy || null,
        })
        .eq("id", orderId);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: "Pembayaran telah dikonfirmasi.",
      });

      return true;
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Gagal mengkonfirmasi pembayaran",
      });
      return false;
    }
  };

  // Create bulk snap token for multiple orders
  const createBulkSnapToken = async (
    params: BulkPaymentParams & { adminFee: number },
  ): Promise<string | null> => {
    try {
      // Call Edge Function for bulk payment (secure)
      const totalWithFee = params.grossAmount + params.adminFee;
      const { data, error } = await supabase.functions.invoke(
        "create-midtrans-token",
        {
          body: {
            orderId: params.orderIds[0], // Primary order ID
            orderIds: params.orderIds, // All order IDs for bulk
            grossAmount: params.grossAmount,
            studentName: params.studentNames,
            category: "Bulk Payment",
            customerEmail: params.customerEmail,
            customerPhone: params.customerPhone,
            customerName: params.customerName,
            adminFee: params.adminFee,
            isBulk: true,
            enabledPayments:
              getEnabledPaymentMethods(totalWithFee).enabled_payments,
          },
        },
      );

      if (error) {
        console.error("Edge function error:", error);
        throw new Error(
          "Gagal membuat token pembayaran bulk. Pastikan Edge Function sudah di-deploy.",
        );
      }

      if (!data?.token) {
        throw new Error("Token tidak diterima dari server");
      }

      return data.token;
    } catch (error: any) {
      console.error("Error creating bulk snap token:", error);
      throw error;
    }
  };

  // Process bulk payment for multiple orders
  const processBulkPayment = async (
    params: BulkPaymentParams,
    onSuccess?: () => void,
    onPending?: () => void,
  ) => {
    setIsProcessing(true);

    // Calculate admin fee for bulk payment
    const adminFee =
      params.adminFee ?? getEstimatedAdminFee(params.grossAmount);

    try {
      if (!window.snap) {
        toast({
          variant: "destructive",
          title: "Error",
          description:
            "Midtrans Snap tidak tersedia. Refresh halaman dan coba lagi.",
        });
        return;
      }

      // Try to get snap token via Edge Function (or fallback to direct API if server key is configured)
      const snapToken = await createBulkSnapToken({ ...params, adminFee });

      if (!snapToken) {
        throw new Error("Gagal membuat token pembayaran");
      }

      window.snap.pay(snapToken, {
        onSuccess: async (result: MidtransResult) => {
          console.log("Bulk payment success:", result);

          // Calculate actual admin fee based on payment method used
          const actualAdminFee = getActualAdminFee(
            params.grossAmount,
            result.payment_type,
          );
          const adminFeePerOrder = Math.ceil(
            actualAdminFee / params.orderIds.length,
          );

          // Update all orders status to DIBAYAR
          for (const orderId of params.orderIds) {
            await supabase
              .from("laundry_orders")
              .update({
                status: "DIBAYAR",
                paid_at: new Date().toISOString(),
                payment_method: result.payment_type,
                admin_fee: adminFeePerOrder,
              })
              .eq("id", orderId);
          }

          toast({
            title: "Pembayaran Berhasil",
            description: `${params.orderIds.length} tagihan berhasil dibayar. Terima kasih!`,
          });

          onSuccess?.();
        },
        onPending: (result: MidtransResult) => {
          console.log("Bulk payment pending:", result);

          toast({
            title: "Pembayaran Tertunda",
            description: "Silakan selesaikan pembayaran Anda.",
          });

          onPending?.();
        },
        onError: (result: MidtransResult) => {
          console.error("Bulk payment error:", result);

          toast({
            variant: "destructive",
            title: "Pembayaran Gagal",
            description:
              result.status_message ||
              "Terjadi kesalahan saat memproses pembayaran.",
          });
        },
        onClose: () => {
          console.log("Bulk payment popup closed");

          toast({
            title: "Pembayaran Dibatalkan",
            description: "Anda menutup jendela pembayaran.",
          });
        },
      });
    } catch (error: any) {
      console.error("Bulk payment error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Gagal memproses pembayaran",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    processPayment,
    processBulkPayment,
    confirmPaymentManually,
    isProcessing,
    getEstimatedAdminFee,
    calculateAdminFee: getActualAdminFee,
  };
}
