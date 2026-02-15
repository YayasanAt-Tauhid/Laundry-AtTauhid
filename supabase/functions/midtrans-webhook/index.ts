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

    if (isBulkPayment) {
      // ========== BULK PAYMENT ==========
      console.log(`Processing BULK payment: ${orderId}`);

      const { data: orders, error: fetchError } = await supabaseClient
        .from("laundry_orders")
        .select("id")
        .eq("midtrans_order_id", orderId);

      if (fetchError) {
        console.error("Error fetching orders for bulk payment:", fetchError);
        throw fetchError;
      }

      if (!orders || orders.length === 0) {
        console.log(`No orders found for bulk payment ${orderId}`);
        return new Response(
          JSON.stringify({
            success: true,
            message: "No orders found for this transaction",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      // Build update data
      const updateData: Record<string, any> = {
        status: orderStatus,
        payment_method: mapPaymentMethod(notification.payment_type),
      };

      if (orderStatus === "DIBAYAR") {
        updateData.paid_at =
          notification.settlement_time || notification.transaction_time;
        // Distribute paid amount across orders
        updateData.paid_amount = Math.floor(
          parseFloat(grossAmount) / orders.length,
        );
      }

      if (shouldClearSnapToken) {
        updateData.midtrans_order_id = null;
        updateData.midtrans_snap_token = null;
        updateData.notes =
          transactionStatus === "expire"
            ? "Pembayaran kedaluwarsa - silakan bayar ulang"
            : transactionStatus === "cancel"
              ? "Pembayaran dibatalkan - silakan bayar ulang"
              : "Pembayaran ditolak - silakan bayar ulang";
      }

      // Update all orders
      const orderIds = orders.map((o: any) => o.id);
      const { error: updateError } = await supabaseClient
        .from("laundry_orders")
        .update(updateData)
        .in("id", orderIds);

      if (updateError) {
        console.error("Failed to update bulk orders:", updateError);
        throw updateError;
      }

      console.log(
        `✓ Bulk payment ${orderId}: Updated ${orderIds.length} orders to status: ${orderStatus}`,
      );
      console.log("════════════════════════════════════════");

      return new Response(
        JSON.stringify({
          success: true,
          message: `Updated ${orderIds.length} orders`,
          order_id: orderId,
          status: orderStatus,
          orders_updated: orderIds.length,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } else if (isSinglePayment) {
      // ========== SINGLE PAYMENT ==========
      console.log(`Processing SINGLE payment: ${orderId}`);

      // Find order by midtrans_order_id
      const { data: existingOrder, error: fetchError } = await supabaseClient
        .from("laundry_orders")
        .select("id, status")
        .eq("midtrans_order_id", orderId)
        .maybeSingle();

      if (fetchError) {
        console.error("Error fetching order:", fetchError);
        throw fetchError;
      }

      if (!existingOrder) {
        console.log(`Order ${orderId} not found`);
        return new Response(
          JSON.stringify({
            success: true,
            message: "Order not found",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      // Build update data
      const updateData: Record<string, any> = {
        status: orderStatus,
        payment_method: mapPaymentMethod(notification.payment_type),
      };

      if (orderStatus === "DIBAYAR") {
        updateData.paid_at =
          notification.settlement_time || notification.transaction_time;
        updateData.paid_amount = parseFloat(grossAmount);
      }

      if (shouldClearSnapToken) {
        updateData.midtrans_order_id = null;
        updateData.midtrans_snap_token = null;
        updateData.notes =
          transactionStatus === "expire"
            ? "Pembayaran kedaluwarsa - silakan bayar ulang"
            : transactionStatus === "cancel"
              ? "Pembayaran dibatalkan - silakan bayar ulang"
              : "Pembayaran ditolak - silakan bayar ulang";
      }

      // Update order
      const { error: updateError } = await supabaseClient
        .from("laundry_orders")
        .update(updateData)
        .eq("id", existingOrder.id);

      if (updateError) {
        console.error("Failed to update order:", updateError);
        throw updateError;
      }

      console.log(`✓ Order ${orderId} updated to status: ${orderStatus}`);
      console.log("════════════════════════════════════════");

      return new Response(
        JSON.stringify({
          success: true,
          message: "Notification processed",
          order_id: orderId,
          status: orderStatus,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
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

    // Return 200 to prevent Midtrans retry on our errors
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        message: "Error processing notification, but acknowledged",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  }
});
