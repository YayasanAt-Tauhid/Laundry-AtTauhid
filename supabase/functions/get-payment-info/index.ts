// Get Payment Info
// Retrieves payment information for public payment page
// Token is the midtrans_snap_token stored in the order

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GetPaymentInfoRequest {
  token: string; // This is a payment_token (UUID) we'll generate
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { token }: GetPaymentInfoRequest = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token pembayaran tidak valid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find orders with this payment_token
    // payment_token is stored in a way that links to the midtrans_order_id
    const { data: orders, error: ordersError } = await supabase
      .from("laundry_orders")
      .select(`
        id,
        total_price,
        status,
        midtrans_order_id,
        midtrans_snap_token,
        student:students!laundry_orders_student_id_fkey (
          id,
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
      // Check if the order exists but already paid
      const { data: paidOrders } = await supabase
        .from("laundry_orders")
        .select("status")
        .eq("midtrans_order_id", token)
        .limit(1);

      if (paidOrders && paidOrders.length > 0) {
        const status = paidOrders[0].status;
        if (status === "DIBAYAR" || status === "SELESAI") {
          return new Response(
            JSON.stringify({ error: "Pembayaran sudah dilakukan sebelumnya" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      return new Response(
        JSON.stringify({ error: "Link pembayaran tidak valid atau sudah kadaluarsa" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get student info from first order
    const firstOrder = orders[0];
    const student = firstOrder.student as { id: string; name: string; class: string } | null;

    if (!student) {
      throw new Error("Data siswa tidak ditemukan");
    }

    // Calculate total amount
    const totalAmount = orders.reduce((sum, o) => sum + (o.total_price || 0), 0);

    // Get snap token (should be same for all orders in this payment)
    const snapToken = firstOrder.midtrans_snap_token;

    if (!snapToken) {
      throw new Error("Token pembayaran tidak tersedia");
    }

    return new Response(
      JSON.stringify({
        studentName: student.name,
        studentClass: student.class,
        orderCount: orders.length,
        totalAmount,
        token: snapToken,
        midtransOrderId: token,
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
