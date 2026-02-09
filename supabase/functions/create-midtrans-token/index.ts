// Midtrans Token Creator for Laundry At-Tauhid
// Creates Snap tokens for single and bulk payments
//
// CUSTOM FIELDS (for multi-app Midtrans account):
// - custom_field1: App identifier (LAUNDRY-ATTAUHID)
// - custom_field2: Payment type (SINGLE / BULK:n)
// - custom_field3: Laundry category

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// App identifier for multi-app Midtrans isolation
const APP_IDENTIFIER = "LAUNDRY-ATTAUHID";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PaymentRequest {
  orderId: string;
  orderIds?: string[]; // For bulk payments
  grossAmount: number;
  studentName: string;
  category: string;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  adminFee?: number;
  enabledPayments?: string[];
  isBulk?: boolean; // Flag for bulk payment
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client for user validation
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header to identify user
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user },
      } = await supabase.auth.getUser(token);

      if (user) {
        // Check user's role
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        // If user is parent, check if online payment is enabled
        if (profile?.role === "parent") {
          const { data: settings } = await supabase
            .from("rounding_settings")
            .select("parent_online_payment_enabled")
            .single();

          if (settings && settings.parent_online_payment_enabled === false) {
            return new Response(
              JSON.stringify({
                error:
                  "Pembayaran online untuk parent sedang dinonaktifkan. Silakan bayar melalui kasir.",
                code: "ONLINE_PAYMENT_DISABLED",
              }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 403,
              },
            );
          }
        }
      }
    }

    const MIDTRANS_SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY");
    const MIDTRANS_IS_PRODUCTION =
      Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";

    if (!MIDTRANS_SERVER_KEY) {
      throw new Error("Midtrans Server Key not configured");
    }

    const {
      orderId,
      orderIds,
      grossAmount,
      studentName,
      category,
      customerEmail,
      customerPhone,
      customerName,
      adminFee = 0,
      enabledPayments,
      isBulk = false,
    }: PaymentRequest = await req.json();

    // Generate unique order ID for Midtrans with APP_IDENTIFIER
    // Format: {APP_IDENTIFIER}-{TYPE}-{timestamp}
    const midtransOrderId = isBulk
      ? `${APP_IDENTIFIER}-BULK-${Date.now()}`
      : `${APP_IDENTIFIER}-SINGLE-${orderId.substring(0, 8)}-${Date.now()}`;

    // Determine which order IDs to update
    const orderIdsToUpdate = isBulk && orderIds ? orderIds : [orderId];

    // Calculate total with admin fee
    const totalWithFee = grossAmount + adminFee;

    // Prepare item details - only add admin fee if > 0
    const itemName = isBulk
      ? `Bulk Payment (${orderIdsToUpdate.length} orders) - ${studentName}`.substring(
          0,
          50,
        )
      : `Laundry ${category} - ${studentName}`.substring(0, 50);

    const itemDetails: any[] = [
      {
        id: isBulk ? "BULK_PAYMENT" : orderId,
        price: grossAmount,
        quantity: 1,
        name: itemName,
      },
    ];

    if (adminFee > 0) {
      itemDetails.push({
        id: "ADMIN_FEE",
        price: adminFee,
        quantity: 1,
        name: "Biaya Admin",
      });
    }

    // Prepare Midtrans transaction data with custom fields for app identification
    const transactionData: Record<string, any> = {
      transaction_details: {
        order_id: midtransOrderId,
        gross_amount: totalWithFee,
      },
      item_details: itemDetails,
      customer_details: {
        first_name: customerName || "Customer",
        email: customerEmail || "customer@example.com",
        phone: customerPhone || "",
      },
      // Custom fields for LAUNDRY app identification (visible in Midtrans dashboard)
      custom_field1: APP_IDENTIFIER,
      custom_field2: isBulk ? `BULK:${orderIdsToUpdate.length}` : "SINGLE",
      custom_field3: category,
    };

    // Add enabled payment methods if provided
    if (enabledPayments && enabledPayments.length > 0) {
      transactionData.enabled_payments = enabledPayments;
    }

    // Call Midtrans Snap API
    const midtransUrl = MIDTRANS_IS_PRODUCTION
      ? "https://app.midtrans.com/snap/v1/transactions"
      : "https://app.sandbox.midtrans.com/snap/v1/transactions";

    const authString = btoa(`${MIDTRANS_SERVER_KEY}:`);

    const midtransResponse = await fetch(midtransUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${authString}`,
      },
      body: JSON.stringify(transactionData),
    });

    const midtransResult = await midtransResponse.json();

    if (!midtransResponse.ok) {
      console.error("Midtrans error:", midtransResult);
      throw new Error(
        midtransResult.error_messages?.join(", ") || "Failed to create payment",
      );
    }

    // Update the order with midtrans info and admin fee
    // (supabase client already initialized above)

    // Calculate admin fee per order for bulk payments
    const adminFeePerOrder = isBulk
      ? Math.ceil(adminFee / orderIdsToUpdate.length)
      : adminFee;

    console.log(
      `Updating ${orderIdsToUpdate.length} order(s) with midtrans_order_id: ${midtransOrderId}`,
    );
    console.log("Order IDs to update:", orderIdsToUpdate);

    // Update all orders
    let updateSuccess = true;
    for (const oid of orderIdsToUpdate) {
      const { data: updateData, error: updateError } = await supabase
        .from("laundry_orders")
        .update({
          midtrans_order_id: midtransOrderId,
          midtrans_snap_token: midtransResult.token,
          status: "MENUNGGU_PEMBAYARAN",
          admin_fee: adminFeePerOrder,
        })
        .eq("id", oid)
        .select("id, midtrans_order_id");

      if (updateError) {
        console.error(`Failed to update order ${oid}:`, updateError);
        updateSuccess = false;
      } else {
        console.log(`Successfully updated order ${oid}:`, updateData);
      }
    }

    if (!updateSuccess) {
      console.warn("Some orders failed to update. Webhook will handle retry.");
    }

    // Verify updates for the first order (spot check)
    const { data: verifyData } = await supabase
      .from("laundry_orders")
      .select("id, midtrans_order_id, status")
      .eq("id", orderIdsToUpdate[0])
      .single();

    if (verifyData) {
      console.log("Verified first order state:", verifyData);
      if (verifyData.midtrans_order_id !== midtransOrderId) {
        console.warn("WARNING: midtrans_order_id mismatch after update!");
        console.warn("Expected:", midtransOrderId);
        console.warn("Got:", verifyData.midtrans_order_id);
      }
    } else {
      console.warn(
        "Could not verify order update - order not found:",
        orderIdsToUpdate[0],
      );
    }

    return new Response(
      JSON.stringify({
        token: midtransResult.token,
        redirect_url: midtransResult.redirect_url,
        order_id: midtransOrderId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
