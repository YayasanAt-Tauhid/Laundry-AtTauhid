/**
 * Create Midtrans Snap Token Edge Function
 *
 * Features:
 * - Multi-app isolation via APP_IDENTIFIER
 * - Single & bulk payment support
 * - Admin fee distribution for bulk payments
 * - Parent role online payment blocking
 * - Amount-based payment method selection (QRIS/VA)
 *
 * @version 2.0.0
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  APP_IDENTIFIER,
  corsHeaders,
  CreateTokenRequest,
  CreateTokenResponse,
  MidtransSnapResponse,
  MIDTRANS_URLS,
  OrderStatus,
} from "../_shared/midtrans-types.ts";

import {
  generateMidtransOrderId,
  getEnabledPayments,
  calculateAdminFeePerOrder,
  logInfo,
  logError,
  logDebug,
  successResponse,
  errorResponse,
} from "../_shared/midtrans-helpers.ts";

// ============================================================
// TYPES
// ============================================================

interface MidtransItemDetail {
  id: string;
  price: number;
  quantity: number;
  name: string;
}

interface MidtransTransactionData {
  transaction_details: {
    order_id: string;
    gross_amount: number;
  };
  item_details: MidtransItemDetail[];
  customer_details: {
    first_name: string;
    email: string;
    phone: string;
  };
  enabled_payments?: string[];
}

// ============================================================
// VALIDATION
// ============================================================

async function validateParentOnlinePayment(
  supabase: SupabaseClient,
  authHeader: string | null
): Promise<{ allowed: boolean; error?: string }> {
  if (!authHeader) {
    return { allowed: true }; // No auth = not a parent
  }

  try {
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      return { allowed: true };
    }

    // Check user role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "parent") {
      return { allowed: true };
    }

    // Check if online payment is enabled for parents
    const { data: settings } = await supabase
      .from("rounding_settings")
      .select("parent_online_payment_enabled")
      .single();

    if (settings?.parent_online_payment_enabled === false) {
      return {
        allowed: false,
        error: "Pembayaran online untuk parent sedang dinonaktifkan. Silakan bayar melalui kasir.",
      };
    }

    return { allowed: true };
  } catch (error) {
    logError("validateParentOnlinePayment", "Error checking parent access", error);
    return { allowed: true }; // Allow on error to not block legitimate users
  }
}

function validateRequest(body: CreateTokenRequest): { valid: boolean; error?: string } {
  if (!body.orderId && !body.orderIds?.length) {
    return { valid: false, error: "orderId or orderIds is required" };
  }

  if (!body.grossAmount || body.grossAmount <= 0) {
    return { valid: false, error: "grossAmount must be positive" };
  }

  if (!body.studentName?.trim()) {
    return { valid: false, error: "studentName is required" };
  }

  if (!body.category?.trim()) {
    return { valid: false, error: "category is required" };
  }

  return { valid: true };
}

// ============================================================
// MIDTRANS API
// ============================================================

function buildTransactionData(
  midtransOrderId: string,
  request: CreateTokenRequest,
  orderCount: number
): MidtransTransactionData {
  const { grossAmount, adminFee = 0, studentName, category, isBulk } = request;
  const totalWithFee = grossAmount + adminFee;

  // Build item name
  const itemName = isBulk
    ? `Bulk Payment (${orderCount} orders) - ${studentName}`.substring(0, 50)
    : `Laundry ${category} - ${studentName}`.substring(0, 50);

  // Build item details
  const itemDetails: MidtransItemDetail[] = [
    {
      id: isBulk ? "BULK_PAYMENT" : request.orderId,
      price: grossAmount,
      quantity: 1,
      name: itemName,
    },
  ];

  // Add admin fee if > 0
  if (adminFee > 0) {
    itemDetails.push({
      id: "ADMIN_FEE",
      price: adminFee,
      quantity: 1,
      name: "Biaya Admin",
    });
  }

  // Build transaction data
  const transactionData: MidtransTransactionData = {
    transaction_details: {
      order_id: midtransOrderId,
      gross_amount: totalWithFee,
    },
    item_details: itemDetails,
    customer_details: {
      first_name: request.customerName || "Customer",
      email: request.customerEmail || "customer@example.com",
      phone: request.customerPhone || "",
    },
  };

  // Add enabled payment methods
  const enabledPayments = request.enabledPayments?.length
    ? request.enabledPayments
    : getEnabledPayments(grossAmount);

  transactionData.enabled_payments = enabledPayments;

  return transactionData;
}

async function createMidtransSnapToken(
  transactionData: MidtransTransactionData,
  serverKey: string,
  isProduction: boolean
): Promise<MidtransSnapResponse> {
  const url = isProduction ? MIDTRANS_URLS.production : MIDTRANS_URLS.sandbox;
  const authString = btoa(`${serverKey}:`);

  logDebug("createMidtransSnapToken", "Calling Midtrans API", {
    url,
    orderId: transactionData.transaction_details.order_id,
    amount: transactionData.transaction_details.gross_amount,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${authString}`,
    },
    body: JSON.stringify(transactionData),
  });

  const result = await response.json();

  if (!response.ok) {
    logError("createMidtransSnapToken", "Midtrans API error", result);
    throw new Error(result.error_messages?.join(", ") || "Failed to create payment token");
  }

  return result as MidtransSnapResponse;
}

// ============================================================
// DATABASE OPERATIONS
// ============================================================

async function updateOrdersWithMidtransInfo(
  supabase: SupabaseClient,
  orderIds: string[],
  midtransOrderId: string,
  snapToken: string,
  adminFeePerOrder: number
): Promise<{ success: boolean; failedCount: number }> {
  let failedCount = 0;

  for (const orderId of orderIds) {
    const { error } = await supabase
      .from("laundry_orders")
      .update({
        midtrans_order_id: midtransOrderId,
        midtrans_snap_token: snapToken,
        status: OrderStatus.MENUNGGU_PEMBAYARAN,
        admin_fee: adminFeePerOrder,
      })
      .eq("id", orderId);

    if (error) {
      logError("updateOrdersWithMidtransInfo", `Failed to update order ${orderId}`, error);
      failedCount++;
    }
  }

  return {
    success: failedCount === 0,
    failedCount,
  };
}

async function verifyOrderUpdate(
  supabase: SupabaseClient,
  orderId: string,
  expectedMidtransOrderId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("laundry_orders")
    .select("id, midtrans_order_id, status")
    .eq("id", orderId)
    .single();

  if (!data) {
    logError("verifyOrderUpdate", `Order not found: ${orderId}`);
    return false;
  }

  if (data.midtrans_order_id !== expectedMidtransOrderId) {
    logError("verifyOrderUpdate", "midtrans_order_id mismatch", {
      expected: expectedMidtransOrderId,
      actual: data.midtrans_order_id,
    });
    return false;
  }

  logDebug("verifyOrderUpdate", "Order verified", data);
  return true;
}

// ============================================================
// MAIN HANDLER
// ============================================================

serve(async (req) => {
  const context = "create-midtrans-token";

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    logInfo(context, "═══════════════════════════════════════");
    logInfo(context, "Processing create-midtrans-token request");

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate parent online payment access
    const authHeader = req.headers.get("Authorization");
    const parentValidation = await validateParentOnlinePayment(supabase, authHeader);
    if (!parentValidation.allowed) {
      return errorResponse(
        parentValidation.error!,
        403,
        corsHeaders,
        "ONLINE_PAYMENT_DISABLED"
      );
    }

    // Get Midtrans config
    const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
    const isProduction = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";

    if (!serverKey) {
      throw new Error("MIDTRANS_SERVER_KEY not configured");
    }

    // Parse and validate request
    const body: CreateTokenRequest = await req.json();
    const validation = validateRequest(body);
    if (!validation.valid) {
      return errorResponse(validation.error!, 400, corsHeaders, "VALIDATION_ERROR");
    }

    const {
      orderId,
      orderIds,
      grossAmount,
      adminFee = 0,
      isBulk = false,
    } = body;

    // Determine order IDs to process
    const orderIdsToUpdate = isBulk && orderIds?.length ? orderIds : [orderId];
    const orderCount = orderIdsToUpdate.length;

    // Generate Midtrans order ID with app identifier
    const midtransOrderId = generateMidtransOrderId(isBulk);

    logInfo(context, `Processing ${isBulk ? "BULK" : "SINGLE"} payment`, {
      midtransOrderId,
      orderCount,
      grossAmount,
      adminFee,
      appIdentifier: APP_IDENTIFIER,
    });

    // Build transaction data
    const transactionData = buildTransactionData(midtransOrderId, body, orderCount);

    // Create Midtrans snap token
    const midtransResult = await createMidtransSnapToken(
      transactionData,
      serverKey,
      isProduction
    );

    logInfo(context, "Midtrans token created successfully", {
      midtransOrderId,
      hasToken: !!midtransResult.token,
    });

    // Calculate admin fee per order
    const adminFeePerOrder = calculateAdminFeePerOrder(adminFee, orderCount);

    // Update orders in database
    const updateResult = await updateOrdersWithMidtransInfo(
      supabase,
      orderIdsToUpdate,
      midtransOrderId,
      midtransResult.token,
      adminFeePerOrder
    );

    if (updateResult.failedCount > 0) {
      logError(context, `${updateResult.failedCount} orders failed to update`);
    }

    // Verify first order update
    await verifyOrderUpdate(supabase, orderIdsToUpdate[0], midtransOrderId);

    // Build response
    const response: CreateTokenResponse = {
      token: midtransResult.token,
      redirect_url: midtransResult.redirect_url,
      order_id: midtransOrderId,
    };

    logInfo(context, "Request completed successfully");
    logInfo(context, "═══════════════════════════════════════");

    return successResponse(response, corsHeaders);

  } catch (error) {
    logError(context, "Request failed", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(errorMessage, 400, corsHeaders);
  }
});
