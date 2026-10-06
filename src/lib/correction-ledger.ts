import type { OrderCorrection } from "@/types/order-corrections";

export type CorrectionSource = OrderCorrection & { laundry_orders: {
    category: string; laundry_date: string; partner_id: string;
    students: { id: string; name: string; class: string; nik: string } | null;
    laundry_partners: { id: string; name: string } | null;
  } | null };

export type CorrectionReportOptions = {
  mode: "revenue" | "bills";
  dateType?: "laundry_date" | "paid_at";
  start?: string;
  end?: string;
  partnerId?: string;
};

export function correctionEntries(source: CorrectionSource[], options: CorrectionReportOptions) {
  return source.flatMap(c => {
    const order = c.laundry_orders;
    if (c.status !== "approved" || !order || (options.partnerId && order.partner_id !== options.partnerId)) return [];
    if (options.mode === "revenue" && c.delta > 0 && c.settlement_status !== "settled") return [];
    const paidAt = c.delta < 0 ? c.reviewed_at : c.settled_at;
    const date = options.dateType === "paid_at"
      ? paidAt ? new Date(paidAt).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) : null
      : order.laundry_date;
    if (!date || (options.start && date < options.start) || (options.end && date > options.end)) return [];
    return [{
      id: c.id, correction_of: c.order_id, student_id: c.student_id, partner_id: order.partner_id, category: order.category,
      laundry_date: order.laundry_date, weight_kg: null, item_count: 0, price_per_unit: 0,
      total_price: c.delta, yayasan_share: c.yayasan_delta, vendor_share: c.vendor_delta,
      status: c.delta < 0 || c.settlement_status === "settled" ? "DIBAYAR" as const : "MENUNGGU_PEMBAYARAN" as const,
      paid_at: paidAt, students: order.students ? { ...order.students, name: `[Koreksi] ${order.students.name}` } : null, laundry_partners: order.laundry_partners,
      notes: `Koreksi ${c.order_id}: ${c.reason}`, is_correction: true,
    }];
  });
}
