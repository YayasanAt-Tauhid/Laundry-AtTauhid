import { supabase } from "@/integrations/supabase/client";

// Same-origin replacement for `supabase.functions.invoke()`. The former
// Supabase edge functions now live as TanStack Start server routes under
// /api/* on the Cloudflare Worker.
//
// Mirrors the invoke() contract the app already relies on:
// - returns { data, error }
// - non-2xx responses still expose the parsed body via `data` (callers check
//   fields like data.code === "ONLINE_PAYMENT_DISABLED")
// - the Supabase access token is forwarded as a Bearer token when available

interface InvokeResult<T> {
  data: T | null;
  error: Error | null;
}

export async function invokeApi<T = unknown>(
  name: string,
  body?: unknown,
): Promise<InvokeResult<T>> {
  try {
    const headers: Record<string, string> = {};

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`/api/${name}`, {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined
          ? headers
          : { ...headers, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const data = (await response.json().catch(() => null)) as T | null;

    if (!response.ok) {
      const record = data as Record<string, unknown> | null;
      const message =
        (record &&
          ((record.error as string) || (record.message as string))) ||
        `HTTP error ${response.status}`;
      return { data, error: new Error(message) };
    }

    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Network error"),
    };
  }
}
