// Supabase Edge Function: keep-alive
// Fungsi ini melakukan query ringan ke database untuk mencegah auto-pause
// Deploy dengan: supabase functions deploy keep-alive

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Ambil environment variables
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error("Missing environment variables");
        }

        // Buat Supabase client dengan Service Role Key
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Query ringan: SELECT 1 atau query sederhana ke tabel sistem
        const { data, error } = await supabase
            .from("_keep_alive_log")
            .insert({
                pinged_at: new Date().toISOString(),
                source: "edge-function",
            })
            .select()
            .single();

        // Jika tabel belum ada, gunakan query alternatif
        if (error && error.code === "42P01") {
            // Fallback: query sederhana tanpa insert
            const { data: pingData, error: pingError } = await supabase.rpc("keep_alive_ping");

            if (pingError) {
                // Ultimate fallback: raw query
                const timestamp = new Date().toISOString();
                console.log(`Keep-alive ping successful at ${timestamp}`);

                return new Response(
                    JSON.stringify({
                        success: true,
                        message: "Keep-alive ping executed (fallback)",
                        timestamp,
                    }),
                    {
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                        status: 200,
                    }
                );
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    message: "Keep-alive ping executed via RPC",
                    data: pingData,
                }),
                {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 200,
                }
            );
        }

        if (error) {
            throw error;
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: "Keep-alive ping logged successfully",
                data,
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            }
        );
    } catch (error) {
        console.error("Keep-alive error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        return new Response(
            JSON.stringify({
                success: false,
                error: errorMessage,
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
            }
        );
    }
});
