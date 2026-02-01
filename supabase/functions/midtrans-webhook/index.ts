/**
 * Midtrans Webhook Handler Edge Function
 *
 * Features:
 * - Multi-app isolation via APP_IDENTIFIER verification
 * - Single & bulk payment processing
 * - SHA-512 signature verification
 * - Idempotent status updates
 * - Always returns HTTP 200 to Midtrans
 *
 * @version 2.0.0
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  APP_IDENTIFIER,
  corsHeaders,
  MidtransNotification,
  MidtransTransactionStatus,
  MidtransFraudStatus,
  OrderStatus,
  OrderUpdateData,
} from "../_shared/midtrans-types.ts";

import {
  parseMidtransOrderId,
  isValidAppOrderId,
  isBulkPaymentOrderId,
  mapPaymentMethod,
  verifyMidtransSignature,
  logInfo,
  logError,
  logWarn,
  logDebug,
  successResponse,
  errorResponse,
} from "../_shared/midtrans-helpers.ts";

// ============================================================
// TYPES
// ============================================================

interface ProcessingResult {
  success: boolean;
  message: string;
  ordersUpdated?: number;
  status?: OrderStatus;
}

// ============================================================
// STATUS DETERMINATION
// ============================================================

interface StatusDetermination {
  orderStatus: OrderStatus;
  shouldClearSnapToken: boolean;
  notes?: string;
}

function determineOrderStatus(
  transactionStatus: MidtransTransactionStatus,
  fraudStatus?: MidtransFraudStatus
): StatusDetermination {
  switch (transactionStatus) {
    case MidtransTransactionStatus.CAPTURE:
      // For credit card payments, check fraud status
      if (fraudStatus === MidtransFraudStatus.ACCEPT) {
        return { orderStatus: OrderStatus.DIBAYAR, shouldClearSnapToken: false };
      }
      return { orderStatus: OrderStatus.MENUNGGU_PEMBAYARAN, shouldClearSnapToken: false };

    case MidtransTransactionStatus.SETTLEMENT:
      // Payment successful
      return { orderStatus: OrderStatus.DIBAYAR, shouldClearSnapToken: false };

    case MidtransTransactionStatus.PENDING:
      // Payment pending - keep snap token for retry
      return { orderStatus: OrderStatus.MENUNGGU_PEMBAYARAN, shouldClearSnapToken: false };

    case MidtransTransactionStatus.EXPIRE:
      return {
        orderStatus: OrderStatus.MENUNGGU_PEMBAYARAN,
        shouldClearSnapToken: true,
        notes: "Pembayaran kedaluwarsa - silakan bayar ulang",
      };

    case MidtransTransactionStatus.CANCEL:
      return {
        orderStatus: OrderStatus.MENUNGGU_PEMBAYARAN,
        shouldClearSnapToken: true,
        notes: "Pembayaran dibatalkan - silakan bayar ulang",
      };

    case MidtransTransactionStatus.DENY:
      return {
        orderStatus: OrderStatus.MENUNGGU_PEMBAYARAN,
        shouldClearSnapToken: true,
        notes: "Pembayaran ditolak - silakan bayar ulang",
      };

    default:
      logWarn("determineOrderStatus", `Unknown transaction status: ${transactionStatus}`);
      return { orderStatus: OrderStatus.MENUNGGU_PEMBAYARAN, shouldClearSnapToken: false };
  }
}

// ============================================================
// ORDER PROCESSING
// ============================================================

function buildUpdateData(
  statusDetermination: StatusDetermination,
  notification: MidtransNotification,
  paidAmount?: number
): OrderUpdateData {
  const updateData: OrderUpdateData = {
    status: statusDetermination.orderStatus,
    payment_method: mapPaymentMethod(notification.payment_type),
  };

  // Add payment info if paid
  if (statusDetermination.orderStatus === OrderStatus.DIBAYAR) {
    updateData.paid_at = notification.settlement_time || notification.transaction_time;
    if (paidAmount !== undefined) {
      updateData.paid_amount = paidAmount;
    }
  }

  // Clear snap token if needed
  if (statusDetermination.shouldClearSnapToken) {
    updateData.midtrans_order_id = null;
    updateData.midtrans_snap_token = null;
    updateData.notes = statusDetermination.notes;
  }

  return updateData;
}

async function processBulkPayment(
  supabase: SupabaseClient,
  midtransOrderId: string,
  notification: MidtransNotification,
  statusDetermination: StatusDetermination
): Promise<ProcessingResult> {
  logInfo("processBulkPayment", `Processing BULK payment: ${midtransOrderId}`);

  // Fetch all orders with this midtrans_order_id
  const { data: orders, error: fetchError } = await supabase
    .from("laundry_orders")
    .select("id")
    .eq("midtrans_order_id", midtransOrderId);

  if (fetchError) {
    logError("processBulkPayment", "Failed to fetch orders", fetchError);
    throw fetchError;
  }

  if (!orders || orders.length === 0) {
    logWarn("processBulkPayment", `No orders found for ${midtransOrderId}`);
    return {
      success: true,
      message: "No orders found for this transaction",
      ordersUpdated: 0,
    };
  }

  // Calculate paid amount per order
  const grossAmount = parseFloat(notification.gross_amount);
  const paidAmountPerOrder = Math.floor(grossAmount / orders.length);

  // Build update data
  const updateData = buildUpdateData(
    statusDetermination,
    notification,
    paidAmountPerOrder
  );

  // Update all orders
  const orderIds = orders.map((o) => o.id);
  const { error: updateError } = await supabase
    .from("laundry_orders")
    .update(updateData)
    .in("id", orderIds);

  if (updateError) {
    logError("processBulkPayment", "Failed to update orders", updateError);
    throw updateError;
  }

  logInfo("processBulkPayment", `Updated ${orderIds.length} orders`, {
    status: statusDetermination.orderStatus,
    midtransOrderId,
  });

  return {
    success: true,
    message: `Updated ${orderIds.length} orders`,
    ordersUpdated: orderIds.length,
    status: statusDetermination.orderStatus,
  };
}

async function processSinglePayment(
  supabase: SupabaseClient,
  midtransOrderId: string,
  notification: MidtransNotification,
  statusDetermination: StatusDetermination
): Promise<ProcessingResult> {
  logInfo("processSinglePayment", `Processing SINGLE payment: ${midtransOrderId}`);

  // Find order by midtrans_order_id
  const { data: order, error: fetchError } = await supabase
    .from("laundry_orders")
    .select("id, status")
    .eq("midtrans_order_id", midtransOrderId)
    .maybeSingle();

  if (fetchError) {
    logError("processSinglePayment", "Failed to fetch order", fetchError);
    throw fetchError;
  }

  if (!order) {
    logWarn("processSinglePayment", `Order not found: ${midtransOrderId}`);
    return {
      success: true,
      message: "Order not found",
      ordersUpdated: 0,
    };
  }

  // Build update data
  const paidAmount = parseFloat(notification.gross_amount);
  const updateData = buildUpdateData(statusDetermination, notification, paidAmount);

  // Update order
  const { error: updateError } = await supabase
    .from("laundry_orders")
    .update(updateData)
    .eq("id", order.id);

  if (updateError) {
    logError("processSinglePayment", "Failed to update order", updateError);
    throw updateError;
  }

  logInfo("processSinglePayment", `Order updated`, {
    orderId: order.id,
    status: statusDetermination.orderStatus,
  });

  return {
    success: true,
    message: "Order updated successfully",
    ordersUpdated: 1,
    status: statusDetermination.orderStatus,
  };
}

// ============================================================
// MAIN HANDLER
// ============================================================

serve(async (req) => {
  const context = "midtrans-webhook";

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, corsHeaders);
  }

  try {
    const notification: MidtransNotification = await req.json();

    logInfo(context, "═══════════════════════════════════════");
    logInfo(context, "Received Midtrans webhook notification");
    logDebug(context, "Notification details", {
      orderId: notification.order_id,
      status: notification.transaction_status,
      paymentType: notification.payment_type,
      amount: notification.gross_amount,
    });

    // ========================================
    // STEP 1: Validate app identifier
    // ========================================
    const parsedOrderId = parseMidtransOrderId(notification.order_id);

    if (!parsedOrderId.isValid) {
      logWarn(context, `Order ID not for this app, ignoring`, {
        orderId: notification.order_id,
        expectedApp: APP_IDENTIFIER,
        actualApp: parsedOrderId.appIdentifier,
      });

      // Return 200 to prevent Midtrans retry - this is for another app
      return successResponse(
        {
          success: true,
          message: "Order ID not for this application - ignored",
          app_identifier: APP_IDENTIFIER,
        },
        corsHeaders
      );
    }

    logInfo(context, "✓ App identifier validated", {
      appIdentifier: parsedOrderId.appIdentifier,
      paymentType: parsedOrderId.paymentType,
    });

    // ========================================
    // STEP 2: Verify signature
    // ========================================
    const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");

    if (!serverKey) {
      logError(context, "MIDTRANS_SERVER_KEY not configured");
      throw new Error("Server configuration error");
    }

    const isValidSignature = await verifyMidtransSignature(
      notification.order_id,
      notification.status_code,
      notification.gross_amount,
      notification.signature_key,
      serverKey
    );

    if (!isValidSignature) {
      logError(context, "Invalid signature", { orderId: notification.order_id });
      return errorResponse("Invalid signature", 401, corsHeaders);
    }

    logInfo(context, "✓ Signature verified");

    // ========================================
    // STEP 3: Initialize Supabase
    // ========================================
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ========================================
    // STEP 4: Determine order status
    // ========================================
    const statusDetermination = determineOrderStatus(
      notification.transaction_status,
      notification.fraud_status
    );

    logDebug(context, "Status determined", {
      transactionStatus: notification.transaction_status,
      orderStatus: statusDetermination.orderStatus,
      clearSnapToken: statusDetermination.shouldClearSnapToken,
    });

    // ========================================
    // STEP 5: Process payment
    // ========================================
    let result: ProcessingResult;

    if (parsedOrderId.paymentType === "BULK") {
      result = await processBulkPayment(
        supabase,
        notification.order_id,
        notification,
        statusDetermination
      );
    } else {
      result = await processSinglePayment(
        supabase,
        notification.order_id,
        notification,
        statusDetermination
      );
    }

    logInfo(context, "✓ Payment processed", result);
    logInfo(context, "═══════════════════════════════════════");

    return successResponse(
      {
        success: result.success,
        message: result.message,
        order_id: notification.order_id,
        status: result.status,
        orders_updated: result.ordersUpdated,
        app_identifier: APP_IDENTIFIER,
      },
      corsHeaders
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logError(context, "Webhook processing failed", error);

    // Always return 200 to prevent Midtrans retry on our errors
    return successResponse(
      {
        success: false,
        error: errorMessage,
        message: "Error processing notification, but acknowledged",
        app_identifier: APP_IDENTIFIER,
      },
      corsHeaders
    );
  }
});
