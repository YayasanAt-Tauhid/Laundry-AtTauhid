import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface MidtransConfig {
  clientKey: string;
  isProduction: boolean;
  snapUrl: string;
}

interface UseMidtransConfigResult {
  config: MidtransConfig | null;
  isLoading: boolean;
  error: string | null;
  isReady: boolean;
}

// Cache config to avoid repeated calls
let cachedConfig: MidtransConfig | null = null;
let loadPromise: Promise<MidtransConfig> | null = null;

async function loadMidtransConfig(): Promise<MidtransConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const { data, error } = await supabase.functions.invoke("midtrans-config");

    if (error) {
      throw new Error(error.message || "Failed to load Midtrans config");
    }

    cachedConfig = data as MidtransConfig;
    return cachedConfig;
  })();

  return loadPromise;
}

function loadSnapScript(snapUrl: string, clientKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    const existingScript = document.querySelector(
      'script[src*="snap.js"]'
    ) as HTMLScriptElement;

    if (existingScript) {
      // If script exists but different URL, remove and reload
      const currentUrl = existingScript.src;
      if (currentUrl !== snapUrl) {
        console.log("Switching Midtrans environment, reloading Snap.js");
        existingScript.remove();
        // Clear existing window.snap
        if ((window as any).snap) {
          delete (window as any).snap;
        }
      } else {
        // Same script, already loaded
        resolve();
        return;
      }
    }

    const script = document.createElement("script");
    script.src = snapUrl;
    script.setAttribute("data-client-key", clientKey);
    script.async = true;

    script.onload = () => {
      console.log(
        `Midtrans Snap.js loaded (${snapUrl.includes("sandbox") ? "SANDBOX" : "PRODUCTION"})`
      );
      resolve();
    };

    script.onerror = () => {
      reject(new Error("Failed to load Midtrans Snap.js"));
    };

    document.head.appendChild(script);
  });
}

export function useMidtransConfig(): UseMidtransConfigResult {
  const [config, setConfig] = useState<MidtransConfig | null>(cachedConfig);
  const [isLoading, setIsLoading] = useState(!cachedConfig);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setIsLoading(true);
        setError(null);

        // Load config from edge function
        const midtransConfig = await loadMidtransConfig();

        if (!mounted) return;

        setConfig(midtransConfig);

        // Dynamically load Snap.js
        await loadSnapScript(midtransConfig.snapUrl, midtransConfig.clientKey);

        if (!mounted) return;

        setIsReady(true);
      } catch (err) {
        console.error("Failed to initialize Midtrans:", err);
        if (mounted) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  return { config, isLoading, error, isReady };
}

// Helper to check if Midtrans is ready
export function isMidtransReady(): boolean {
  return !!(window as any).snap;
}

// Get current environment label
export function getMidtransEnvironment(): "PRODUCTION" | "SANDBOX" | "UNKNOWN" {
  if (!cachedConfig) return "UNKNOWN";
  return cachedConfig.isProduction ? "PRODUCTION" : "SANDBOX";
}
