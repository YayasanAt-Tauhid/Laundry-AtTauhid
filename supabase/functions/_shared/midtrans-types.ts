/**
 * Shared Types & Enums for Midtrans Integration
 * Used by: create-midtrans-token, midtrans-webhook
 */

// ============================================================
// APP CONFIGURATION
// ============================================================

/**
 * Application identifier for multi-app Midtrans account isolation
 * Format: midtrans_order_id = {APP_ID}-{TYPE}-{timestamp}
 */
export const APP_IDENTIFIER = "LAUNDRY-ATTAUHID";

// ============================================================
// ENUMS
// ============================================================

export enum OrderStatus {
  DRAFT = "DRAFT",
  MENUNGGU_APPROVAL_MITRA = "MENUNGGU_APPROVAL_MITRA",
  DITOLAK_MITRA = "DITOLAK_MITRA",
  DISETUJUI_MITRA = "DISETUJUI_MITRA",
  MENUNGGU_PEMBAYARAN = "MENUNGGU_PEMBAYARAN",
  DIBAYAR = "DIBAYAR",
  SELESAI = "SELESAI",
}

export enum MidtransTransactionStatus {
  CAPTURE = "capture",
  SETTLEMENT = "settlement",
  PENDING = "pending",
  DENY = "deny",
  CANCEL = "cancel",
  EXPIRE = "expire",
  REFUND = "refund",
  PARTIAL_REFUND = "partial_refund",
}

export enum MidtransFraudStatus {
  ACCEPT = "accept",
  CHALLENGE = "challenge",
  DENY = "deny",
}

export enum PaymentMethodType {
  QRIS = "qris",
  GOPAY = "gopay",
  SHOPEEPAY = "shopeepay",
  BANK_TRANSFER = "bank_transfer",
  ECHANNEL = "echannel",
  BCA_VA = "bca_va",
  BNI_VA = "bni_va",
  BRI_VA = "bri_va",
  PERMATA_VA = "permata_va",
  CIMB_VA = "cimb_va",
  OTHER_VA = "other_va",
  CREDIT_CARD = "credit_card",
  CSTORE = "cstore",
  AKULAKU = "akulaku",
  KREDIVO = "kredivo",
}

// ============================================================
// CONSTANTS
// ============================================================

export const QRIS_MAX_AMOUNT = 628000;

export const MIDTRANS_URLS = {
  sandbox: "https://app.sandbox.midtrans.com/snap/v1/transactions",
  production: "https://app.midtrans.com/snap/v1/transactions",
} as const;

// ============================================================
// TYPES - Request/Response
// ============================================================

export interface CreateTokenRequest {
  orderId: string;
  orderIds?: string[]; // For bulk payments
  grossAmount: number;
  studentName: string;
  category: string;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  adminFee?: number;
  enabledPayments?: string[];
  isBulk?: boolean;
}

export interface CreateTokenResponse {
  token: string;
  redirect_url: string;
  order_id: string;
}

export interface MidtransNotification {
  order_id: string;
  transaction_status: MidtransTransactionStatus;
  fraud_status?: MidtransFraudStatus;
  payment_type: string;
  gross_amount: string;
  status_code: string;
  signature_key: string;
  transaction_time?: string;
  settlement_time?: string;
}

export interface MidtransSnapResponse {
  token: string;
  redirect_url: string;
  error_messages?: string[];
}

// ============================================================
// TYPES - Internal
// ============================================================

export interface OrderUpdateData {
  status: OrderStatus;
  payment_method: string;
  paid_at?: string;
  paid_amount?: number;
  midtrans_order_id?: string | null;
  midtrans_snap_token?: string | null;
  notes?: string;
}

export interface ParsedMidtransOrderId {
  appIdentifier: string;
  paymentType: "SINGLE" | "BULK";
  timestamp: string;
  isValid: boolean;
}

// ============================================================
// CORS HEADERS
// ============================================================

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
