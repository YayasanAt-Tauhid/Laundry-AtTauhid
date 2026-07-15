/**
 * LAUNDRY CATEGORIES - FALLBACK VALUES ONLY
 *
 * ⚠️ SECURITY WARNING:
 * These prices are FALLBACK values only. The actual prices are stored
 * in the database table `laundry_prices` and enforced by the backend
 * trigger `trg_validate_order_price`.
 *
 * The backend trigger will ALWAYS recalculate prices using database values,
 * regardless of what the frontend sends. This prevents price manipulation.
 *
 * If you need to update prices:
 * 1. Update the `laundry_prices` table in the database (source of truth)
 * 2. Optionally update these constants to match (for UI display before DB loads)
 *
 * @see useLaundryPrices hook - fetches prices from database
 * @see validate_and_calculate_order_price() - backend trigger
 */
export const LAUNDRY_CATEGORIES = {
  kiloan: { label: "Kiloan", price: 7000, unit: "kg" },
  handuk: { label: "Handuk", price: 5000, unit: "pcs" },
  selimut: { label: "Selimut", price: 15000, unit: "pcs" },
  sprei_kecil: { label: "Sprei Kecil", price: 8000, unit: "pcs" },
  sprei_besar: { label: "Sprei Besar", price: 15000, unit: "pcs" },
  jaket_tebal: { label: "Jaket Tebal", price: 5000, unit: "pcs" },
  bedcover: { label: "Bedcover", price: 15000, unit: "pcs" },
} as const;

export const ORDER_STATUS = {
  DRAFT: { label: "Draft", color: "status-draft" },
  MENUNGGU_APPROVAL_MITRA: {
    label: "Menunggu Approval Mitra",
    color: "status-pending",
  },
  DITOLAK_MITRA: { label: "Ditolak Mitra", color: "status-rejected" },
  DISETUJUI_MITRA: { label: "Disetujui Mitra", color: "status-approved" },
  MENUNGGU_PEMBAYARAN: {
    label: "Menunggu Pembayaran",
    color: "status-pending",
  },
  DIBAYAR: { label: "Dibayar", color: "status-paid" },
  SELESAI: { label: "Selesai", color: "status-paid" },
} as const;

export const USER_ROLES = {
  admin: { label: "Admin / Yayasan", color: "role-admin" },
  parent: { label: "Orang Tua", color: "role-parent" },
  staff: { label: "Petugas", color: "role-staff" },
  cashier: { label: "Kasir", color: "role-staff" },
  partner: { label: "Mitra Laundry", color: "role-partner" },
} as const;

// Threshold amount for choosing QRIS vs Virtual Account payment channels
// (Midtrans split payment now handles any processing fees automatically)
const QRIS_CHANNEL_MAX_AMOUNT = 628000;

// Get enabled payment methods for Midtrans based on amount
export const getEnabledPaymentMethods = (amount: number) => {
  if (amount < QRIS_CHANNEL_MAX_AMOUNT) {
    // QRIS payment channels - gopay and shopeepay support QRIS
    // Also include 'qris' for Midtrans QRIS feature
    return {
      enabled_payments: ["gopay", "shopeepay", "qris"],
    };
  } else {
    // VA and other payment methods for larger amounts
    return {
      enabled_payments: [
        "bank_transfer",
        "echannel",
        "permata_va",
        "bca_va",
        "bni_va",
        "bri_va",
        "cimb_va",
        "other_va",
      ],
    };
  }
};

export type LaundryCategory = keyof typeof LAUNDRY_CATEGORIES;
export type OrderStatus = keyof typeof ORDER_STATUS;
export type UserRole = keyof typeof USER_ROLES;
