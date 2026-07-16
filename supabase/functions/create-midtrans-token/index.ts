// Midtrans Token Creator for Laundry At-Tauhid
// Creates Snap tokens for single and bulk payments
//
// SECURITY: grossAmount is fetched from database, NOT from frontend
// SECURITY: Auth required - validates user via getClaims
// SECURITY: Parent role checked via user_roles table (NOT profiles)
//
// CUSTOM FIELDS (for multi-app Midtrans account):
// - custom_field1: App identifier (LAUNDRY-ATTAUHID)
// - custom_field2: Payment type (SINGLE / BULK:n)
// - custom_field3: Laundry category

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_IDENTIFIER = "LAUNDRY-ATTAUHID";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PaymentRequest {
  orderId: string;
  orderIds?: string[];
  studentName: string;
  category: string;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  isBulk?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // =====================================================
    // SECURITY: Authenticate user via getClaims
    // =====================================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;

    // =====================================================
    // SECURITY: Check role via user_roles table (NOT profiles)
    // =====================================================
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    const userRole = roleData?.role;

    // Check parent online payment setting
    if (userRole === "parent") {
      const { data: settings } = await supabase
        .from("rounding_settings")
        .select("parent_online_payment_enabled")
        .single();

      if (settings && settings.parent_online_payment_enabled === false) {
        return new Response(
          JSON.stringify({
            error: "Pembayaran online untuk parent sedang dinonaktifkan. Silakan bayar melalui kasir.",
            code: "ONLINE_PAYMENT_DISABLED",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          },
        );
      }
    }

    const MIDTRANS_SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY");
    const MIDTRANS_IS_PRODUCTION = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";

    if (!MIDTRANS_SERVER_KEY) {
      throw new Error("Midtrans Server Key not configured");
    }

    const {
      orderId,
      orderIds,
      studentName,
      category,
      customerEmail,
      customerPhone,
      customerName,
      isBulk = false,
    }: PaymentRequest = await req.json();

    // Determine which order IDs to process
    const orderIdsToUpdate = isBulk && orderIds ? orderIds : [orderId];

    // =====================================================
    // SECURITY: Fetch total_price from DATABASE, not frontend
    // =====================================================
    const { data: orders, error: ordersError } = await supabase
      .from("laundry_orders")
      .select("id, total_price, category, status, student_id")
      .in("id", orderIdsToUpdate);

    if (ordersError || !orders || orders.length === 0) {
      throw new Error("Order tidak ditemukan di database");
    }

    // Validate all orders exist
    if (orders.length !== orderIdsToUpdate.length) {
      const foundIds = orders.map((o: any) => o.id);
      const missingIds = orderIdsToUpdate.filter((id) => !foundIds.includes(id));
      throw new Error(`Order tidak ditemukan: ${missingIds.join(", ")}`);
    }

    // =====================================================
    // SECURITY: Parents can only pay for their own children's orders
    // =====================================================
    if (userRole === "parent") {
      const studentIds = [...new Set(orders.map((o: any) => o.student_id))];
      const { data: students } = await supabase
        .from("students")
        .select("id, parent_id")
        .in("id", studentIds);

      if (!students || students.some((s: any) => s.parent_id !== userId)) {
        return new Response(
          JSON.stringify({ error: "Anda tidak memiliki akses ke order ini" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate order status - only allow payment for approved orders
    for (const order of orders) {
      if (!["DISETUJUI_MITRA", "MENUNGGU_PEMBAYARAN"].includes(order.status)) {
        throw new Error(
          `Order ${order.id} tidak dalam status yang bisa dibayar (status: ${order.status})`
        );
      }
    }

    // Calculate grossAmount from database values
    const grossAmount = orders.reduce(
      (sum: number, order: any) => sum + order.total_price,
      0
    );

    console.log(
      `SECURITY: grossAmount calculated from DB = ${grossAmount} (${orders.length} orders), user=${userId}, role=${userRole}`
    );

    // Generate unique order ID for Midtrans
    const midtransOrderId = isBulk
      ? `${APP_IDENTIFIER}-BULK-${Date.now()}`
      : `${APP_IDENTIFIER}-SINGLE-${orderId.substring(0, 8)}-${Date.now()}`;

    // Prepare item details
    const itemName = isBulk
      ? `Bulk Payment (${orderIdsToUpdate.length} orders) - ${studentName}`.substring(0, 50)
      : `Laundry ${category} - ${studentName}`.substring(0, 50);

    const itemDetails: any[] = [
      {
        id: isBulk ? "BULK_PAYMENT" : orderId,
        price: grossAmount,
        quantity: 1,
        name: itemName,
      },
    ];

    // Prepare Midtrans transaction data
    const transactionData: Record<string, any> = {
      transaction_details: {
        order_id: midtransOrderId,
        gross_amount: grossAmount,
      },
      item_details: itemDetails,
      customer_details: {
        first_name: customerName || "Customer",
        email: customerEmail || "customer@example.com",
        phone: customerPhone || "",
      },
      custom_field1: APP_IDENTIFIER,
      custom_field2: isBulk ? `BULK:${orderIdsToUpdate.length}` : "SINGLE",
      custom_field3: category,
    };

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

    // Update orders with midtrans info
    for (const oid of orderIdsToUpdate) {
      const { error: updateError } = await supabase
        .from("laundry_orders")
        .update({
          midtrans_order_id: midtransOrderId,
          midtrans_snap_token: midtransResult.token,
          status: "MENUNGGU_PEMBAYARAN",
        })
        .eq("id", oid);

      if (updateError) {
        console.error(`Failed to update order ${oid}:`, updateError);
      }
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
