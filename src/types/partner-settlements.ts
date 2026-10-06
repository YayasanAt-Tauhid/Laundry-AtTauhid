export type PartnerSettlementAccount = {
  partner_id: string;
  start_date: string;
  activation_note: string;
  activated_by: string;
  created_at: string;
};

export type PartnerSettlement = {
  id: string;
  partner_id: string;
  cutoff_date: string;
  order_share_total: number;
  correction_adjustment: number;
  net_amount: number;
  order_count: number;
  correction_count: number;
  payment_method: "cash" | "bank_transfer" | "other";
  payment_reference: string;
  note: string | null;
  paid_by: string;
  paid_at: string;
  created_at: string;
};

export type PartnerSettlementLine = {
  id: string;
  settlement_id: string;
  partner_id: string;
  source_type: "order" | "correction";
  source_id: string;
  amount: number;
  event_at: string;
  source_snapshot: Record<string, string | number | boolean | null>;
  created_at: string;
};

export type PartnerSettlementPreview = {
  active: boolean;
  start_date: string | null;
  order_share_total: number;
  correction_adjustment: number;
  net_amount: number;
  order_count: number;
  correction_count: number;
};

export const partnerSettlementMethodLabels = {
  cash: "Tunai",
  bank_transfer: "Transfer bank",
  other: "Lainnya",
} as const;

export const formatRupiah = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
