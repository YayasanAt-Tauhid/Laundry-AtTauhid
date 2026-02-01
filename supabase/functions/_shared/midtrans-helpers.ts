/**
 * Shared Helper Functions for Midtrans Integration
 * Used by: create-midtrans-token, midtrans-webhook
 */

import {
  APP_IDENTIFIER,
  PaymentMethodType,
  QRIS_MAX_AMOUNT,
  ParsedMidtransOrderId,
} from "./midtrans-types.ts";

// ============================================================
// ORDER ID GENERATION & PARSING
// ============================================================

/**
 * Generate Midtrans Order ID with app identifier
 * Format: {APP_IDENTIFIER}-{TYPE}-{timestamp}
 * Example: LAUNDRY-ATTAUHID-SINGLE-1706789123456
 */
export function generateMidtransOrderId(isBulk: boolean): string {
  const type = isBulk ? "BULK" : "SINGLE";
  return `${APP_IDENTIFIER}-${type}-${Date.now()}`;
}

/**
 * Parse Midtrans Order ID to extract components
 * Returns parsed components and validation status
 */
export function parseMidtransOrderId(orderId: string): ParsedMidtransOrderId {
  const parts = orderId.split("-");

  // Expected format: LAUNDRY-ATTAUHID-{TYPE}-{timestamp}
  if (parts.length < 4) {
    return {
      appIdentifier: "",
      paymentType: "SINGLE",
      timestamp: "",
      isValid: false,
    };
  }

  // Reconstruct app identifier (first two parts)
  const appIdentifier = `${parts[0]}-${parts[1]}`;
  const paymentType = parts[2] as "SINGLE" | "BULK";
  const timestamp = parts[3];

  return {
    appIdentifier,
    paymentType: paymentType === "BULK" ? "BULK" : "SINGLE",
    timestamp,
    isValid: appIdentifier === APP_IDENTIFIER,
  };
}

/**
 * Validate that order ID belongs to this application
 */
export function isValidAppOrderId(orderId: string): boolean {
  const parsed = parseMidtransOrderId(orderId);
  return parsed.isValid;
}

/**
 * Check if order ID is for bulk payment
 */
export function isBulkPaymentOrderId(orderId: string): boolean {
  const parsed = parseMidtransOrderId(orderId);
  return parsed.isValid && parsed.paymentType === "BULK";
}

// ============================================================
// PAYMENT METHOD MAPPING
// ============================================================

/**
 * Map Midtrans payment_type to internal payment method
 */
export function mapPaymentMethod(paymentType: string): string {
  const mapping: Record<string, string> = {
    qris: PaymentMethodType.QRIS,
    gopay: PaymentMethodType.QRIS, // GoPay uses QRIS
    shopeepay: PaymentMethodType.QRIS, // ShopeePay uses QRIS
    bank_transfer: PaymentMethodType.BANK_TRANSFER,
    echannel: PaymentMethodType.ECHANNEL,
    bca_va: PaymentMethodType.BCA_VA,
    bni_va: PaymentMethodType.BNI_VA,
    bri_va: PaymentMethodType.BRI_VA,
    permata_va: PaymentMethodType.PERMATA_VA,
    cimb_va: PaymentMethodType.CIMB_VA,
    other_va: PaymentMethodType.OTHER_VA,
    credit_card: PaymentMethodType.CREDIT_CARD,
    cstore: PaymentMethodType.CSTORE,
    akulaku: PaymentMethodType.AKULAKU,
    kredivo: PaymentMethodType.KREDIVO,
  };
  return mapping[paymentType] || paymentType;
}

/**
 * Get enabled payment methods based on amount
 * <= 628,000 → QRIS only
 * > 628,000 → Virtual Account only
 */
export function getEnabledPayments(amount: number): string[] {
  if (amount <= QRIS_MAX_AMOUNT) {
    return ["gopay", "shopeepay", "qris"];
  }
  return [
    "bank_transfer",
    "echannel",
    "permata_va",
    "bca_va",
    "bni_va",
    "bri_va",
    "cimb_va",
    "other_va",
  ];
}

// ============================================================
// SIGNATURE VERIFICATION
// ============================================================

/**
 * Verify Midtrans webhook signature
 * Signature = SHA512(order_id + status_code + gross_amount + server_key)
 */
export async function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  signatureKey: string,
  serverKey: string
): Promise<boolean> {
  const signatureInput = `${orderId}${statusCode}${grossAmount}${serverKey}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(signatureInput);
  const hashBuffer = await crypto.subtle.digest("SHA-512", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const calculatedSignature = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return calculatedSignature === signatureKey;
}

// ============================================================
// ADMIN FEE CALCULATION
// ============================================================

/**
 * Calculate admin fee per order for bulk payments
 */
export function calculateAdminFeePerOrder(
  totalAdminFee: number,
  orderCount: number
): number {
  if (orderCount <= 0) return 0;
  return Math.ceil(totalAdminFee / orderCount);
}

// ============================================================
// LOGGING UTILITIES
// ============================================================

const LOG_PREFIX = `[${APP_IDENTIFIER}]`;

export function logInfo(context: string, message: string, data?: unknown): void {
  console.log(`${LOG_PREFIX} [${context}] ${message}`, data ?? "");
}

export function logError(context: string, message: string, error?: unknown): void {
  console.error(`${LOG_PREFIX} [${context}] ERROR: ${message}`, error ?? "");
}

export function logWarn(context: string, message: string, data?: unknown): void {
  console.warn(`${LOG_PREFIX} [${context}] WARN: ${message}`, data ?? "");
}

export function logDebug(context: string, message: string, data?: unknown): void {
  console.log(`${LOG_PREFIX} [${context}] DEBUG: ${message}`, data ?? "");
}

// ============================================================
// RESPONSE BUILDERS
// ============================================================

export function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    status,
  });
}

export function successResponse(
  data: unknown,
  corsHeaders: Record<string, string>
): Response {
  return jsonResponse(data, 200, corsHeaders);
}

export function errorResponse(
  message: string,
  status: number,
  corsHeaders: Record<string, string>,
  code?: string
): Response {
  return jsonResponse(
    { error: message, code: code ?? "ERROR" },
    status,
    corsHeaders
  );
}
