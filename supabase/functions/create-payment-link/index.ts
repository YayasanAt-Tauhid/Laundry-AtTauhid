import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_IDENTIFIER = "LAUNDRY-ATTAUHID";

const PAYMENT_CONFIG = {
  QRIS_MAX_AMOUNT: 628000,
  QRIS_FEE_PERCENTAGE: 0.7,
  VA_FEE_FLAT: 4400,
} as const;

function calculatePaymentMethod(baseAmount: number) {
  if (baseAmount <= PAYMENT_CONFIG.QRIS_MAX_AMOUNT) {
    return {
      adminFee: Math.ceil((baseAmount * PAYMENT_CONFIG.QRIS_FEE_PERCENTAGE) / 100),
      enabledPayments: ["other_qris"],
      feeType: `${PAYMENT_CONFIG.QRIS_FEE_PERCENTAGE}%`,
    };
  }
  return {
    adminFee: PAYMENT_CONFIG.VA_FEE_FLAT,
    enabledPayments: ["bank_transfer"],
    feeType: `Rp ${PAYMENT_CONFIG.VA_FEE_FLAT.toLocaleString("id-ID")}`,
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CreatePaymentLinkRequest {
  studentId: string;
  studentName: string;
  studentClass: string;
  orderIds: string[];
  totalAmount: number;
  parentName?: string;
  parentPhone?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const MIDTRANS_SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY");
    const MIDTRANS_IS_PRODUCTION = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";

    if (!MIDTRANS_SERVER_KEY) {
      throw new Error("Midtrans Server Key not configured");
    }

    const body: CreatePaymentLinkRequest = await req.json();
    const { studentName, orderIds, totalAmount, parentName, parentPhone } = body;

    if (!orderIds || orderIds.length === 0) {
      throw new Error("Missing required fields: orderIds");
    }

    // SECURITY: Fetch total from DB
    const { data: orders, error: ordersError } = await supabase
      .from("laundry_orders")
      .select("id, total_price, status")
      .in("id", orderIds);

    if (ordersError || !orders || orders.length === 0) {
      throw new Error("Orders tidak ditemukan");
    }

    for (const order of orders) {
      if (!["DISETUJUI_MITRA", "MENUNGGU_PEMBAYARAN"].includes(order.status)) {
        throw new Error(`Order ${order.id} tidak bisa dibayar (status: ${order.status})`);
      }
    }

    const grossAmount = orders.reduce((sum: number, o: any) => sum + o.total_price, 0);
    const { adminFee, enabledPayments, feeType } = calculatePaymentMethod(grossAmount);
    const totalWithFee = grossAmount + adminFee;

    const isBulk = orderIds.length > 1;
    const midtransOrderId = isBulk 
      ? `${APP_IDENTIFIER}-BULK-${Date.now()}`
      : `${APP_IDENTIFIER}-SINGLE-${Date.now()}`;
    const itemName = isBulk
      ? `Tunggakan Laundry (${orderIds.length} order) - ${studentName}`.substring(0, 50)
      : `Tunggakan Laundry - ${studentName}`.substring(0, 50);

    const transactionData: Record<string, any> = {
      transaction_details: {
        order_id: midtransOrderId,
        gross_amount: totalWithFee,
      },
      item_details: [
        {
          id: isBulk ? "BULK_ARREARS" : orderIds[0],
          price: grossAmount,
          quantity: 1,
          name: itemName,
        },
        ...(adminFee > 0 ? [{
          id: "ADMIN_FEE",
          price: adminFee,
          quantity: 1,
          name: `Biaya Admin (${feeType})`,
        }] : []),
      ],
      customer_details: {
        first_name: parentName || "Orang Tua",
        phone: parentPhone || "",
      },
      enabled_payments: enabledPayments,
      custom_field1: APP_IDENTIFIER,
      custom_field2: isBulk ? `ARREARS_BULK:${orderIds.length}` : "ARREARS_SINGLE",
      custom_field3: `STUDENT:${studentName}`,
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
        midtransResult.error_messages?.join(", ") || "Failed to create payment link"
      );
    }

    // Update orders with midtrans info
    for (const oid of orderIds) {
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
      }
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
