// Midtrans Webhook Handler for Laundry At-Tauhid
// Handles single and bulk payment notifications
//
// MULTI-APP ISOLATION:
// Only processes orders with APP_IDENTIFIER in midtrans_order_id
// Custom fields are logged for debugging
//
// ENVIRONMENT VARIABLES:
// - MIDTRANS_SERVER_KEY (required)
// - SUPABASE_URL (auto)
// - SUPABASE_SERVICE_ROLE_KEY (auto)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// App identifier for multi-app Midtrans isolation
import { settlementAmounts, settled, midtransPaidAt } from "../_shared/midtrans-settlement.ts";

const APP_IDENTIFIER = "LAUNDRY-ATTAUHID";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Map Midtrans payment type to our payment method
function mapPaymentMethod(paymentType: string): string {
  const mapping: Record<string, string> = {
    qris: "qris",
    gopay: "qris",
    shopeepay: "qris",
    bank_transfer: "bank_transfer",
    echannel: "echannel",
    bca_va: "bca_va",
    bni_va: "bni_va",
    bri_va: "bri_va",
    permata_va: "permata_va",
    cimb_va: "cimb_va",
    other_va: "other_va",
    credit_card: "credit_card",
    cstore: "cstore",
    akulaku: "akulaku",
    kredivo: "kredivo",
  };
  return mapping[paymentType] || paymentType;
}


function midtransTimeToIso(value?: string): string | null {
  if (!value) return null;

  // Midtrans transaction timestamps are GMT+7 (WIB) and may arrive without
  // an explicit offset. Attach +07:00 before converting to ISO/UTC.
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized);
  const date = new Date(hasTimezone ? normalized : `${normalized}+07:00`);

  if (Number.isNaN(date.getTime())) {
    console.error("Invalid Midtrans timestamp:", value);
    return null;
  }

  return date.toISOString();
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    const notification = await req.json();

    console.log("════════════════════════════════════════");
    console.log("Received Midtrans webhook notification:");
    console.log(`  Order ID: ${notification.order_id}`);
    console.log(`  Status: ${notification.transaction_status}`);
    console.log(`  Payment: ${notification.payment_type}`);
    console.log(`  Amount: ${notification.gross_amount}`);
    // Log custom fields for debugging (app identification)
    if (notification.custom_field1) {
      console.log(`  Custom Field 1 (App): ${notification.custom_field1}`);
    }
    if (notification.custom_field2) {
      console.log(`  Custom Field 2 (Type): ${notification.custom_field2}`);
    }
    if (notification.custom_field3) {
      console.log(`  Custom Field 3 (Category): ${notification.custom_field3}`);
    }

    // Verify signature from Midtrans
    const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");

    if (!serverKey) {
      console.error("MIDTRANS_SERVER_KEY not configured");
      throw new Error("Server configuration error");
    }

    const orderId = notification.order_id;
    const statusCode = notification.status_code;
    const grossAmount = notification.gross_amount;

    const signatureKey = `${orderId}${statusCode}${grossAmount}${serverKey}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(signatureKey);
    const hashBuffer = await crypto.subtle.digest("SHA-512", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const calculatedSignature = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (calculatedSignature !== notification.signature_key) {
      console.error("Invalid signature for order:", orderId);
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    console.log("✓ Signature verified");

    // Create Supabase admin client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Determine order status based on transaction status
    const transactionStatus = notification.transaction_status;
    const fraudStatus = notification.fraud_status;

    let orderStatus = "MENUNGGU_PEMBAYARAN";
    let shouldClearSnapToken = false;

    if (transactionStatus === "capture") {
      // For credit card payments
      if (fraudStatus === "accept") {
        orderStatus = "DIBAYAR";
      }
    } else if (transactionStatus === "settlement") {
      // Payment successful
      orderStatus = "DIBAYAR";
    } else if (transactionStatus === "pending") {
      // Payment pending - keep existing snap_token so user can continue payment
      orderStatus = "MENUNGGU_PEMBAYARAN";
    } else if (
      transactionStatus === "cancel" ||
      transactionStatus === "deny" ||
      transactionStatus === "expire"
    ) {
      // Payment failed/expired/cancelled - clear snap_token so new one can be created
      orderStatus = "MENUNGGU_PEMBAYARAN";
      shouldClearSnapToken = true;
    }

    // ===== MULTI-APP ISOLATION CHECK =====
    // Only process orders that belong to THIS application
    if (!orderId.startsWith(APP_IDENTIFIER)) {
      console.log(`⚠ Order ${orderId} does not belong to ${APP_IDENTIFIER} - ignoring`);
      console.log("════════════════════════════════════════");
      return new Response(
        JSON.stringify({
          success: true,
          message: `Order does not belong to ${APP_IDENTIFIER} - ignored`,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // Check if this is a BULK payment (multiple orders) or SINGLE payment
    const isBulkPayment = orderId.includes("-BULK-");
    const isSinglePayment = orderId.includes("-SINGLE-");

    if (isBulkPayment || isSinglePayment) {
      console.log(`Processing ${isBulkPayment ? "BULK" : "SINGLE"} payment: ${orderId}`);

      let affected = 0;
      if (orderStatus === "DIBAYAR") {
        const baseUrl = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true"
          ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
        const statusResponse = await fetch(baseUrl + "/v2/" + encodeURIComponent(orderId) + "/status", {
          headers: { Accept: "application/json", Authorization: "Basic " + btoa(serverKey + ":") },
        });
        const verifiedStatus = await statusResponse.json();
        if (!statusResponse.ok || verifiedStatus.order_id !== orderId ||
            !settled(verifiedStatus) || Number(verifiedStatus.gross_amount) !== Number(grossAmount)) {
          throw new Error("Status pembayaran belum terverifikasi di Midtrans");
        }
        const amounts = settlementAmounts(verifiedStatus);
        const paidAt = midtransPaidAt(verifiedStatus);
        const parsedGrossAmount = amounts.grossAmount;
        const { data, error } = await supabaseClient.rpc(
          "settle_laundry_payment_group",
          {
            p_midtrans_order_id: orderId,
            p_payment_method: mapPaymentMethod(notification.payment_type),
            p_paid_at: paidAt,
            p_gross_amount: parsedGrossAmount,
            p_admin_fee: amounts.adminFee,
          },
        );
        if (error) {
          console.error("Failed to settle payment group:", error);
          throw error;
        }
        affected = data || 0;
      } else if (shouldClearSnapToken) {
        const { data, error } = await supabaseClient.rpc(
          "reconcile_expired_laundry_payment",
          {
            p_midtrans_order_id: orderId,
            p_terminal_status: transactionStatus,
            p_actor_id: null,
          },
        );
        if (error) {
          console.error("Failed to reconcile terminal payment:", error);
          throw error;
        }
        affected = data || 0;
      } else {
        const { data, error } = await supabaseClient
          .from("laundry_orders")
          .update({ payment_method: mapPaymentMethod(notification.payment_type) })
          .eq("midtrans_order_id", orderId)
          .neq("status", "DIBAYAR")
          .neq("status", "SELESAI")
          .select("id");
        if (error) throw error;
        affected = data?.length || 0;
      }

      console.log(`✓ Payment ${orderId}: affected ${affected} orders, status=${orderStatus}`);
      console.log("════════════════════════════════════════");
      return new Response(
        JSON.stringify({
          success: true,
          message: `Processed ${affected} orders`,
          order_id: orderId,
          status: orderStatus,
          orders_updated: affected,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    } else {
      // ========== UNKNOWN FORMAT ==========
      console.log(`Unknown order_id format: ${orderId} - ignoring`);
      console.log("════════════════════════════════════════");

      return new Response(
        JSON.stringify({
          success: true,
          message: "Unknown order format - ignored",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Webhook error:", error);

    // Return a retryable error; settlement is idempotent.
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        message: "Error processing notification; retry required",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
