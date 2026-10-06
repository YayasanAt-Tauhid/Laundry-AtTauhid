export type OrderCorrection = {
  id: string;
  order_id: string;
  student_id: string;
  kind: "price" | "quantity" | "cancel" | "wrong_student";
  reason: string;
  original_snapshot: Record<string, string | number | null>;
  original_total: number;
  corrected_total: number;
  corrected_quantity: number | null;
  delta: number;
  yayasan_delta: number;
  vendor_delta: number;
  replacement_student_id: string | null;
  replacement_order_id: string | null;
  status: "pending" | "approved" | "rejected";
  requested_by: string;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  verification_reference: string | null;
  recipient_reference: string | null;
  settlement_due: number | null;
  settlement_status: "not_ready" | "pending" | "settled";
  settlement_method: string | null;
  settlement_reference: string | null;
  customer_consent: boolean;
  settled_by: string | null;
  settled_at: string | null;
  wadiah_transaction_id: string | null;
}

export const correctionKindLabels = {
  price: "Koreksi nominal",
  quantity: "Koreksi berat / jumlah",
  cancel: "Tagihan duplikat / tidak semestinya",
  wrong_student: "Salah siswa",
} as const;

export const correctionStatusLabels = {
  pending: "Menunggu tinjauan admin",
  approved: "Disetujui",
  rejected: "Ditolak",
} as const;

export const rupiah = (amount: number) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
}).format(amount);
