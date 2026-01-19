// Unified Midtrans Webhook Handler for MULTIPLE Applications
// Scalable architecture - supports unlimited Supabase projects
//
// ENVIRONMENT VARIABLES:
// - MIDTRANS_SERVER_KEY (required)
// - SUPABASE_URL (auto - for default/laundry project)
// - SUPABASE_SERVICE_ROLE_KEY (auto - for default/laundry project)
//
// For additional projects, add pairs of:
// - {APP_NAME}_SUPABASE_URL
// - {APP_NAME}_SERVICE_ROLE_KEY
//
// Example for 5 apps:
// - CATERING_SUPABASE_URL + CATERING_SERVICE_ROLE_KEY
// - SCHOOL_SUPABASE_URL + SCHOOL_SERVICE_ROLE_KEY
// - TOKO_SUPABASE_URL + TOKO_SERVICE_ROLE_KEY
// - etc...

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createClient,
  SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ============================================
// TYPES
// ============================================

interface MidtransNotification {
  transaction_time: string;
  transaction_status: string;
  transaction_id: string;
  status_message: string;
  status_code: string;
  signature_key: string;
  settlement_time?: string;
  payment_type: string;
  order_id: string;
  merchant_id: string;
  gross_amount: string;
  fraud_status?: string;
  currency: string;
}

interface AppConfig {
  name: string;
  prefix: string; // Order ID prefix (e.g., "LAUNDRY-", "CATERING-", "SCHOOL-")
  tableName: string; // Database table name
  orderIdColumn: string; // Column to match order_id (e.g., "midtrans_order_id", "transaction_id")
  statusMapping: Record<string, string>; // Midtrans status -> App status
  updateFields: (
    notification: MidtransNotification,
    status: string,
  ) => Record<string, any>;
  supabaseUrlEnv: string; // Env var name for Supabase URL
  serviceKeyEnv: string; // Env var name for Service Role Key
  useDefaultCredentials?: boolean; // Use SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY
}

interface ProcessResult {
  success: boolean;
  message: string;
  orderCount: number;
  appName: string;
}

// ============================================
// APP CONFIGURATIONS - ADD YOUR APPS HERE!
// ============================================

const APP_CONFIGS: AppConfig[] = [
  // ========== APP 1: LAUNDRY AT-TAUHID ==========
  {
    name: "Laundry",
    prefix: "LAUNDRY-",
    tableName: "laundry_orders",
    orderIdColumn: "midtrans_order_id",
    useDefaultCredentials: true, // Uses SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY
    supabaseUrlEnv: "SUPABASE_URL",
    serviceKeyEnv: "SUPABASE_SERVICE_ROLE_KEY",
    statusMapping: {
      settlement: "DIBAYAR",
      capture: "DIBAYAR",
      pending: "MENUNGGU_PEMBAYARAN",
      deny: "MENUNGGU_PEMBAYARAN",
      cancel: "MENUNGGU_PEMBAYARAN",
      expire: "MENUNGGU_PEMBAYARAN",
      refund: "MENUNGGU_PEMBAYARAN",
    },
    updateFields: (notification, status) => {
      const fields: Record<string, any> = {
        status: status,
        payment_method: mapPaymentMethod(notification.payment_type),
      };

      if (status === "DIBAYAR") {
        fields.paid_at =
          notification.settlement_time || notification.transaction_time;
        fields.paid_amount = parseFloat(notification.gross_amount);
      }

      // Clear midtrans data on cancel/expire for retry
      if (["cancel", "expire"].includes(notification.transaction_status)) {
        fields.midtrans_order_id = null;
        fields.midtrans_snap_token = null;
        fields.notes = `Pembayaran ${notification.transaction_status === "cancel" ? "dibatalkan" : "kedaluwarsa"}`;
      }

      return fields;
    },
  },

  // ========== APP 2: CATERING ORDER ==========
  {
    name: "Catering",
    prefix: "", // Empty = matches UUID format directly
    tableName: "orders",
    orderIdColumn: "id", // For single order, use 'id'. For bulk, use 'transaction_id'
    useDefaultCredentials: false,
    supabaseUrlEnv: "CATERING_SUPABASE_URL",
    serviceKeyEnv: "CATERING_SERVICE_ROLE_KEY",
    statusMapping: {
      settlement: "paid",
      capture: "paid",
      pending: "pending",
      deny: "failed",
      cancel: "failed",
      expire: "expired",
      refund: "refunded",
    },
    updateFields: (notification, status) => ({
      status: status,
      updated_at: new Date().toISOString(),
    }),
  },

  // ========== ADD MORE APPS BELOW ==========
  // Example: APP 3: SCHOOL PAYMENT
  // {
  //   name: "School",
  //   prefix: "SCHOOL-",
  //   tableName: "payments",
  //   orderIdColumn: "midtrans_order_id",
  //   useDefaultCredentials: false,
  //   supabaseUrlEnv: "SCHOOL_SUPABASE_URL",
  //   serviceKeyEnv: "SCHOOL_SERVICE_ROLE_KEY",
  //   statusMapping: {
  //     settlement: "LUNAS",
  //     pending: "PENDING",
  //     ...
  //   },
  //   updateFields: (notification, status) => ({
  //     status: status,
  //     paid_at: status === "LUNAS" ? notification.settlement_time : null,
  //   }),
  // },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

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

async function verifySignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
  signatureKey: string,
): Promise<boolean> {
  const payload = orderId + statusCode + grossAmount + serverKey;
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest("SHA-512", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex === signatureKey;
}

function isValidUUID(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// ============================================
// SUPABASE CLIENT FACTORY
// ============================================

const clientCache: Map<string, SupabaseClient> = new Map();

function getSupabaseClient(config: AppConfig): SupabaseClient | null {
  const cacheKey = config.name;

  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey)!;
  }

  const url = Deno.env.get(config.supabaseUrlEnv);
  const key = Deno.env.get(config.serviceKeyEnv);

  if (!url || !key) {
    console.warn(
      `[${config.name}] Missing credentials: ${config.supabaseUrlEnv} or ${config.serviceKeyEnv}`,
    );
    return null;
  }

  const client = createClient(url, key);
  clientCache.set(cacheKey, client);
  return client;
}

// ============================================
// APP DETECTION
// ============================================

function detectApp(orderId: string): AppConfig | null {
  // First, check apps with specific prefixes
  for (const config of APP_CONFIGS) {
    if (config.prefix && orderId.startsWith(config.prefix)) {
      return config;
    }
  }

  // For BULK- prefix, return null (will try all apps)
  if (orderId.startsWith("BULK-")) {
    return null;
  }

  // For UUID format, find app without prefix (usually catering)
  if (isValidUUID(orderId)) {
    const uuidApp = APP_CONFIGS.find((c) => c.prefix === "");
    return uuidApp || null;
  }

  return null;
}

// ============================================
// ORDER PROCESSING
// ============================================

async function processOrderForApp(
  config: AppConfig,
  notification: MidtransNotification,
  isBulkLookup: boolean = false,
): Promise<ProcessResult> {
  const client = getSupabaseClient(config);

  if (!client) {
    return {
      success: false,
      message: `${config.name} database credentials not configured`,
      orderCount: 0,
      appName: config.name,
    };
  }

  const orderId = notification.order_id;
  const transactionStatus = notification.transaction_status;
  const newStatus =
    config.statusMapping[transactionStatus] || transactionStatus;

  // Determine which column to search
  let searchColumn = config.orderIdColumn;
  let searchValue = orderId;

  // For BULK payments in catering, search by transaction_id
  if (orderId.startsWith("BULK-") && config.name === "Catering") {
    searchColumn = "transaction_id";
  }

  // For single UUID orders in catering, search by id
  if (isValidUUID(orderId) && config.name === "Catering") {
    searchColumn = "id";
  }

  try {
    // Find orders
    const { data: orders, error: fetchError } = await client
      .from(config.tableName)
      .select("id")
      .eq(searchColumn, searchValue);

    if (fetchError) {
      console.error(`[${config.name}] Error finding orders:`, fetchError);
      throw fetchError;
    }

    if (!orders || orders.length === 0) {
      if (!isBulkLookup) {
        console.log(
          `[${config.name}] No orders found for ${searchColumn}=${searchValue}`,
        );
      }
      return {
        success: true,
        message: `No ${config.name} orders found`,
        orderCount: 0,
        appName: config.name,
      };
    }

    const orderIds = orders.map((o: any) => o.id);
    console.log(`[${config.name}] Found ${orderIds.length} order(s) to update`);

    // Build update data
    const updateData = config.updateFields(notification, newStatus);

    // For bulk payments, distribute paid_amount if applicable
    if (orderIds.length > 1 && updateData.paid_amount) {
      updateData.paid_amount = Math.floor(
        updateData.paid_amount / orderIds.length,
      );
    }

    // Update orders
    const { error: updateError } = await client
      .from(config.tableName)
      .update(updateData)
      .in("id", orderIds);

    if (updateError) {
      console.error(`[${config.name}] Error updating orders:`, updateError);
      throw updateError;
    }

    console.log(
      `[${config.name}] Updated ${orderIds.length} order(s) to status: ${newStatus}`,
    );

    return {
      success: true,
      message: `Updated ${orderIds.length} ${config.name} order(s)`,
      orderCount: orderIds.length,
      appName: config.name,
    };
  } catch (error) {
    console.error(`[${config.name}] Processing error:`, error);
    return {
      success: false,
      message: `Error processing ${config.name} order: ${error}`,
      orderCount: 0,
      appName: config.name,
    };
  }
}

async function tryAllApps(
  notification: MidtransNotification,
): Promise<ProcessResult> {
  console.log("[Router] Trying all configured apps...");

  for (const config of APP_CONFIGS) {
    const result = await processOrderForApp(config, notification, true);
    if (result.orderCount > 0) {
      return result;
    }
  }

  return {
    success: true,
    message: "No orders found in any application",
    orderCount: 0,
    appName: "unknown",
  };
}

// ============================================
// MAIN WEBHOOK HANDLER
// ============================================

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
    const MIDTRANS_SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY");

    if (!MIDTRANS_SERVER_KEY) {
      console.error("MIDTRANS_SERVER_KEY not configured");
      throw new Error("Server configuration error");
    }

    // Parse notification
    const notification: MidtransNotification = await req.json();

    console.log("════════════════════════════════════════");
    console.log("Received Midtrans notification:");
    console.log(`  Order ID: ${notification.order_id}`);
    console.log(`  Status: ${notification.transaction_status}`);
    console.log(`  Payment: ${notification.payment_type}`);
    console.log(`  Amount: ${notification.gross_amount}`);

    // Verify signature
    const isValidSignature = await verifySignature(
      notification.order_id,
      notification.status_code,
      notification.gross_amount,
      MIDTRANS_SERVER_KEY,
      notification.signature_key,
    );

    if (!isValidSignature) {
      console.error("Invalid signature for order:", notification.order_id);
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    console.log("✓ Signature verified");

    // Detect which app this order belongs to
    const detectedApp = detectApp(notification.order_id);
    let result: ProcessResult;

    if (detectedApp) {
      console.log(`→ Routing to: ${detectedApp.name}`);
      result = await processOrderForApp(detectedApp, notification);

      // Only try other apps if:
      // 1. Order not found AND
      // 2. Detected app has NO specific prefix (e.g., UUID format that could belong to multiple apps)
      // If order has a prefix like LAUNDRY-, it clearly belongs to that app only
      if (result.orderCount === 0 && !detectedApp.prefix) {
        console.log(`→ Not found in ${detectedApp.name}, trying other apps...`);
        result = await tryAllApps(notification);
      } else if (result.orderCount === 0 && detectedApp.prefix) {
        console.log(
          `→ Order not found in ${detectedApp.name}, but has specific prefix - not trying other apps`,
        );
      }
    } else {
      // Unknown format or BULK - try all apps
      console.log("→ Unknown format, trying all apps...");
      result = await tryAllApps(notification);
    }

    console.log(`✓ Result: ${result.message}`);
    console.log("════════════════════════════════════════");

    return new Response(
      JSON.stringify({
        success: result.success,
        message: result.message,
        app: result.appName,
        order_id: notification.order_id,
        transaction_status: notification.transaction_status,
        orders_updated: result.orderCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Webhook error:", error);

    // Return 200 to prevent Midtrans retry
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
