// Follow this setup guide to integrate the Deno runtime into your application:
// https://deno.land/manual/getting_started/setup_your_environment

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PaymentRequest {
  orderId: string;
  grossAmount: number;
  studentName: string;
  category: string;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  adminFee?: number;
  enabledPayments?: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const MIDTRANS_SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY");
    const MIDTRANS_IS_PRODUCTION =
      Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";

    if (!MIDTRANS_SERVER_KEY) {
      throw new Error("Midtrans Server Key not configured");
    }

    const {
      orderId,
      grossAmount,
      studentName,
      category,
      customerEmail,
      customerPhone,
      customerName,
      adminFee = 0,
      enabledPayments,
    }: PaymentRequest = await req.json();

    // Generate unique order ID for Midtrans
    const midtransOrderId = `LAUNDRY-${orderId.substring(0, 8)}-${Date.now()}`;

    // Calculate total with admin fee
    const totalWithFee = grossAmount + adminFee;

    // Prepare item details - only add admin fee if > 0
    const itemDetails: any[] = [
      {
        id: orderId,
        price: grossAmount,
        quantity: 1,
        name: `Laundry ${category} - ${studentName}`.substring(0, 50),
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

    // Prepare Midtrans transaction data
    const transactionData: any = {
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(
      `Updating order ${orderId} with midtrans_order_id: ${midtransOrderId}`,
    );

    const { data: updateData, error: updateError } = await supabase
      .from("laundry_orders")
      .update({
        midtrans_order_id: midtransOrderId,
        midtrans_snap_token: midtransResult.token,
        status: "MENUNGGU_PEMBAYARAN",
        admin_fee: adminFee,
      })
      .eq("id", orderId)
      .select("id, midtrans_order_id");

    if (updateError) {
      console.error("Failed to update order in database:", updateError);
      console.error("Order ID:", orderId);
      console.error("Midtrans Order ID:", midtransOrderId);
      // Don't throw - still return token so payment can proceed
      // Webhook will handle the update if this fails
    } else {
      console.log("Successfully updated order:", updateData);
    }

    // Verify the update actually happened
    const { data: verifyData } = await supabase
      .from("laundry_orders")
      .select("id, midtrans_order_id, status")
      .eq("id", orderId)
      .single();

    if (verifyData) {
      console.log("Verified order state:", verifyData);
      if (verifyData.midtrans_order_id !== midtransOrderId) {
        console.warn("WARNING: midtrans_order_id mismatch after update!");
        console.warn("Expected:", midtransOrderId);
        console.warn("Got:", verifyData.midtrans_order_id);
      }
    } else {
      console.warn("Could not verify order update - order not found:", orderId);
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
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
