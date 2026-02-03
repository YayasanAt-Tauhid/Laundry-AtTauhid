// Midtrans Config API
// Returns client-side Midtrans configuration (client key + environment)
// This allows frontend to dynamically load correct Snap.js

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const clientKey = Deno.env.get("MIDTRANS_CLIENT_KEY");
    const isProduction = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";

    if (!clientKey) {
      console.error("MIDTRANS_CLIENT_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Midtrans not configured" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    const config = {
      clientKey,
      isProduction,
      snapUrl: isProduction
        ? "https://app.midtrans.com/snap/snap.js"
        : "https://app.sandbox.midtrans.com/snap/snap.js",
    };

    console.log(`Midtrans config requested. Environment: ${isProduction ? "PRODUCTION" : "SANDBOX"}`);

    return new Response(JSON.stringify(config), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
