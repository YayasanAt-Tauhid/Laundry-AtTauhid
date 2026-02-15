// Get Payment Info
// Retrieves payment information for public payment page
// Token is the midtrans_order_id stored in the order
//
// SECURITY NOTE: This is intentionally a public endpoint (no auth required)
// because payment links are shared with parents via WhatsApp/SMS.
// The midtrans_order_id acts as a bearer token - it's a unique, 
// unguessable identifier that grants read-only access to payment info.
// Sensitive data (student NIK, parent info) is NOT exposed.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const QRIS_MAX_AMOUNT = 628000;
const QRIS_FEE_PERCENT = 0.7;
const VA_FEE_FLAT = 4400;

function calculateAdminFee(baseAmount: number) {
  if (baseAmount <= QRIS_MAX_AMOUNT) {
    return {
      adminFee: Math.ceil(baseAmount * (QRIS_FEE_PERCENT / 100)),
      paymentType: "qris" as const,
    };
  }
  return {
    adminFee: VA_FEE_FLAT,
    paymentType: "va" as const,
  };
}

// Helper to map orders to SAFE item details (no sensitive data)
function mapOrderItems(orders: any[]) {
  return orders.map((o: any) => ({
    id: o.id,
    category: o.category || "-",
    weight_kg: o.weight_kg,
    item_count: o.item_count,
    total_price: o.total_price || 0,
    laundry_date: o.laundry_date,
  }));
}

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

    const { token } = await req.json();

    if (!token || typeof token !== "string" || token.length < 10) {
      return new Response(
        JSON.stringify({ error: "Token pembayaran tidak valid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Validate token format matches expected pattern
    if (!token.startsWith("LAUNDRY-ATTAUHID-")) {
      return new Response(
        JSON.stringify({ error: "Token pembayaran tidak valid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find orders with this midtrans_order_id
    // Only select non-sensitive fields
    const { data: orders, error: ordersError } = await supabase
      .from("laundry_orders")
      .select(`
        id,
        total_price,
        status,
        midtrans_order_id,
        midtrans_snap_token,
        category,
        weight_kg,
        item_count,
        laundry_date,
        student:students!laundry_orders_student_id_fkey (
          name,
          class
        )
      `)
      .eq("midtrans_order_id", token)
      .eq("status", "MENUNGGU_PEMBAYARAN");

    if (ordersError) {
      console.error("Error fetching orders:", ordersError);
      throw new Error("Gagal mengambil data pembayaran");
    }

    if (!orders || orders.length === 0) {
      // Check if orders exist in other states
      const { data: existingOrders } = await supabase
        .from("laundry_orders")
        .select(`
          id,
          total_price,
          status,
          midtrans_order_id,
          category,
          weight_kg,
          item_count,
          laundry_date,
          student:students!laundry_orders_student_id_fkey (
            name,
            class
          )
        `)
        .eq("midtrans_order_id", token);

      if (existingOrders && existingOrders.length > 0) {
        const firstStatus = existingOrders[0].status;
        const student = existingOrders[0].student as { name: string; class: string } | null;
        const totalAmount = existingOrders.reduce((sum, o) => sum + (o.total_price || 0), 0);
        const { adminFee, paymentType } = calculateAdminFee(totalAmount);
        
        if (firstStatus === "DIBAYAR" || firstStatus === "SELESAI") {
          return new Response(
            JSON.stringify({
              paid: true,
              studentName: student?.name || "Siswa",
              studentClass: student?.class || "",
              orderCount: existingOrders.length,
              totalAmount,
              adminFee,
              grandTotal: totalAmount + adminFee,
              paymentType,
              orderItems: mapOrderItems(existingOrders),
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Expired or other non-payable state
        return new Response(
          JSON.stringify({
            expired: true,
            studentName: student?.name || "Siswa",
            studentClass: student?.class || "",
            orderCount: existingOrders.length,
            totalAmount,
            adminFee,
            grandTotal: totalAmount + adminFee,
            paymentType,
            midtransOrderId: token,
            orderIds: existingOrders.map(o => o.id),
            orderItems: mapOrderItems(existingOrders),
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Link pembayaran tidak valid atau sudah kadaluarsa" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get student info (only name and class - no sensitive data)
    const firstOrder = orders[0];
    const student = firstOrder.student as { name: string; class: string } | null;

    if (!student) {
      throw new Error("Data siswa tidak ditemukan");
    }

    const totalAmount = orders.reduce((sum, o) => sum + (o.total_price || 0), 0);
    const { adminFee, paymentType } = calculateAdminFee(totalAmount);
    const grandTotal = totalAmount + adminFee;
    const snapToken = firstOrder.midtrans_snap_token;

    if (!snapToken) {
      throw new Error("Token pembayaran tidak tersedia");
    }

    // Check Midtrans transaction status
    const MIDTRANS_SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY");
    const MIDTRANS_IS_PRODUCTION = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";
    
    if (MIDTRANS_SERVER_KEY) {
      try {
        const statusUrl = MIDTRANS_IS_PRODUCTION
          ? `https://api.midtrans.com/v2/${token}/status`
          : `https://api.sandbox.midtrans.com/v2/${token}/status`;
        
        const authString = btoa(`${MIDTRANS_SERVER_KEY}:`);
        const statusResponse = await fetch(statusUrl, {
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${authString}`,
          },
        });
        
        const statusData = await statusResponse.json();
        
        const expiredStatuses = ["expire", "deny", "cancel"];
        if (statusResponse.ok && expiredStatuses.includes(statusData.transaction_status)) {
          return new Response(
            JSON.stringify({
              expired: true,
              studentName: student.name,
              studentClass: student.class,
              orderCount: orders.length,
              totalAmount,
              adminFee,
              grandTotal,
              paymentType,
              midtransOrderId: token,
              orderIds: orders.map(o => o.id),
              orderItems: mapOrderItems(orders),
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (err) {
        console.error("Failed to check Midtrans status:", err);
      }
    }

    return new Response(
      JSON.stringify({
        studentName: student.name,
        studentClass: student.class,
        orderCount: orders.length,
        totalAmount,
        adminFee,
        grandTotal,
        paymentType,
        token: snapToken,
        midtransOrderId: token,
        orderItems: mapOrderItems(orders),
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
