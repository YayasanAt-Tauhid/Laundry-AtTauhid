// Regenerate Payment
// Creates a new Midtrans Snap token for expired payment links
// No auth required - public endpoint for parents

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_IDENTIFIER = "LAUNDRY-ATTAUHID";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const MIDTRANS_SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY");
    const MIDTRANS_IS_PRODUCTION = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";

    if (!MIDTRANS_SERVER_KEY) {
      throw new Error("Midtrans Server Key not configured");
    }

    const { oldMidtransOrderId, orderIds, totalAmount, studentName } = await req.json();

    if (!orderIds || orderIds.length === 0 || !totalAmount) {
      throw new Error("Missing required fields");
    }

    // Verify orders exist and are not already paid
    const { data: orders, error: ordersError } = await supabase
      .from("laundry_orders")
      .select("id, status, midtrans_order_id")
      .in("id", orderIds);

    if (ordersError || !orders || orders.length === 0) {
      throw new Error("Orders not found");
    }

    // Check none are already paid
    const paidOrders = orders.filter(o => o.status === "DIBAYAR" || o.status === "SELESAI");
    if (paidOrders.length > 0) {
      return new Response(
        JSON.stringify({ error: "Beberapa order sudah dibayar" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate new Midtrans order ID
    const isBulk = orderIds.length > 1;
    const newMidtransOrderId = isBulk
      ? `${APP_IDENTIFIER}-BULK-${Date.now()}`
      : `${APP_IDENTIFIER}-SINGLE-${Date.now()}`;

    const itemName = isBulk
      ? `Tunggakan Laundry (${orderIds.length} order) - ${studentName || "Siswa"}`.substring(0, 50)
      : `Tunggakan Laundry - ${studentName || "Siswa"}`.substring(0, 50);

    const transactionData: Record<string, any> = {
      transaction_details: {
        order_id: newMidtransOrderId,
        gross_amount: totalAmount,
      },
      item_details: [
        {
          id: isBulk ? "BULK_ARREARS" : orderIds[0],
          price: totalAmount,
          quantity: 1,
          name: itemName,
        },
      ],
      custom_field1: APP_IDENTIFIER,
      custom_field2: isBulk ? `ARREARS_BULK:${orderIds.length}` : "ARREARS_SINGLE",
      custom_field3: `STUDENT:${studentName || "Unknown"}`,
    };

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
        midtransResult.error_messages?.join(", ") || "Failed to create payment"
      );
    }

    // Update orders with new midtrans info
    for (const oid of orderIds) {
      const { error: updateError } = await supabase
        .from("laundry_orders")
        .update({
          midtrans_order_id: newMidtransOrderId,
          midtrans_snap_token: midtransResult.token,
          status: "MENUNGGU_PEMBAYARAN",
        })
        .eq("id", oid);

      if (updateError) {
        console.error(`Failed to update order ${oid}:`, updateError);
      }
    }

    console.log(`Regenerated payment: ${oldMidtransOrderId} -> ${newMidtransOrderId}`);

    return new Response(
      JSON.stringify({
        token: midtransResult.token,
        redirect_url: midtransResult.redirect_url,
        order_id: newMidtransOrderId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
