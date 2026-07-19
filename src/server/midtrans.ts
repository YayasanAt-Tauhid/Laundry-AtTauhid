import { getServerEnv } from "./env";

export const APP_IDENTIFIER = "LAUNDRY-ATTAUHID";

export function snapApiUrl(): string {
  const { MIDTRANS_IS_PRODUCTION } = getServerEnv();
  return MIDTRANS_IS_PRODUCTION
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";
}

export function statusApiUrl(orderId: string): string {
  const { MIDTRANS_IS_PRODUCTION } = getServerEnv();
  return MIDTRANS_IS_PRODUCTION
    ? `https://api.midtrans.com/v2/${orderId}/status`
    : `https://api.sandbox.midtrans.com/v2/${orderId}/status`;
}

function basicAuthHeader(): string {
  const { MIDTRANS_SERVER_KEY } = getServerEnv();
  return `Basic ${btoa(`${MIDTRANS_SERVER_KEY}:`)}`;
}

export interface SnapResult {
  token: string;
  redirect_url: string;
}

// Creates a Snap transaction. Throws with Midtrans' error messages on failure.
export async function createSnapTransaction(
  transactionData: Record<string, unknown>,
): Promise<SnapResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: basicAuthHeader(),
  };

  // The Midtrans account is shared with another app (catering), so the
  // dashboard-level Payment Notification URL may stay pointed at the old
  // unified webhook. When MIDTRANS_NOTIFICATION_URL is set (e.g.
  // https://<worker-domain>/api/midtrans-webhook), notifications for THIS
  // app's transactions are routed to our Worker instead — without touching
  // the shared dashboard config.
  const notificationUrl = process.env.MIDTRANS_NOTIFICATION_URL;
  if (notificationUrl) {
    headers["X-Override-Notification"] = notificationUrl;
  }

  const response = await fetch(snapApiUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify(transactionData),
  });

  const result = (await response.json()) as SnapResult & {
    error_messages?: string[];
  };

  if (!response.ok) {
    console.error("Midtrans error:", result);
    throw new Error(
      result.error_messages?.join(", ") || "Failed to create payment",
    );
  }

  return result;
}

export async function getTransactionStatus(
  orderId: string,
): Promise<{ ok: boolean; transaction_status?: string }> {
  const response = await fetch(statusApiUrl(orderId), {
    headers: {
      Accept: "application/json",
      Authorization: basicAuthHeader(),
    },
  });

  const data = (await response.json()) as { transaction_status?: string };
  return { ok: response.ok, transaction_status: data.transaction_status };
}

// Verifies the SHA-512 signature Midtrans sends with webhook notifications.
export async function verifyWebhookSignature(notification: {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
}): Promise<boolean> {
  const { MIDTRANS_SERVER_KEY } = getServerEnv();
  const signaturePayload = `${notification.order_id}${notification.status_code}${notification.gross_amount}${MIDTRANS_SERVER_KEY}`;
  const data = new TextEncoder().encode(signaturePayload);
  const hashBuffer = await crypto.subtle.digest("SHA-512", data);
  const calculated = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return calculated === notification.signature_key;
}
