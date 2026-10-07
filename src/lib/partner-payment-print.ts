import { formatRupiah, type PartnerPeriodPreview, type PartnerSettlement, type PartnerSettlementLine } from "../types/partner-settlements";

export type PrintedPartnerSettlement = PartnerSettlement & { partner_settlement_lines: PartnerSettlementLine[] };
export const escapePrintHtml = (value: unknown) => String(value ?? "-").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (value: number) => escapePrintHtml(formatRupiah(value));
const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? escapePrintHtml(value.split("-").reverse().join("/")) : "-";
const decisions = { included: "Diperhitungkan", paid_in_ledger: "Diperhitungkan — pembayaran lama tercatat", paid_manually: "Diperhitungkan — pembayaran lama terverifikasi", not_paid: "Tidak dipotong — belum dibayar ke mitra", unverified: "Belum diperhitungkan — perlu verifikasi" };

/** Payment reconciliation is separate from student bills and preserves recorded payout snapshots. */
export function partnerPaymentPrintHtml(preview: PartnerPeriodPreview | null, settlements: PrintedPartnerSettlement[] = []) {
  if (!preview) return '<section><h2>Pembayaran Mitra</h2><p>Pilih satu mitra dan tanggal awal serta akhir untuk mencetak penyesuaian dan pembayaran bersih mitra.</p></section>';
  if (!preview.active) return '<section><h2>Pembayaran Mitra</h2><p>Belum tersedia. Tentukan batas pembayaran manual sebelumnya di menu Settlement Mitra.</p></section>';
  const rows = (lines: { source_snapshot: Record<string, unknown>; amount: number; status: string; applied: number }[]) => lines.length ? `
    <table><thead><tr><th>Siswa</th><th>Tanggal laundry asal</th><th>Alasan koreksi</th><th>Status</th><th class="text-right">Nilai koreksi mitra</th><th class="text-right">Diperhitungkan</th></tr></thead><tbody>${lines.map(l => `<tr>
      <td>${escapePrintHtml(l.source_snapshot.student_name)}</td><td>${date(l.source_snapshot.laundry_date)}</td>
      <td>${escapePrintHtml(l.source_snapshot.reason)}</td><td>${escapePrintHtml(l.status)}</td>
      <td class="text-right">${money(l.amount)}</td><td class="text-right">${money(l.applied)}</td></tr>`).join("")}</tbody></table>` : "";
  const summary = (base: number, adjustment: number, net: number, label: string) => `<div class="summary-cards">
    <div class="summary-card"><div class="label">Bagian mitra sebelum penyesuaian</div><div class="value">${money(base)}</div></div>
    <div class="summary-card"><div class="label">Penyesuaian mitra</div><div class="value">${money(adjustment)}</div></div>
    <div class="summary-card vendor"><div class="label">${label}</div><div class="value">${money(net)}</div></div></div>`;
  const recorded = settlements.map(s => `<div><h3>Pembayaran mitra sudah tercatat</h3>
    <p>Periode: ${date(s.period_start)}–${date(s.cutoff_date)} · Referensi: ${escapePrintHtml(s.payment_reference)}</p>
    ${summary(s.order_share_total, s.correction_adjustment, s.net_amount, "Bersih pembayaran tercatat")}
    ${rows(s.partner_settlement_lines.filter(l => l.source_type !== "order").map(l => ({ ...l, status: "Sudah diperhitungkan dalam pembayaran ini", applied: l.amount })))}</div>`).join("");
  const pending = preview.lines?.filter(l => l.source_type !== "order") ?? [];
  const remaining = !settlements.length || !!preview.lines?.length ? `<div><h3>${settlements.length ? "Sisa yang belum tercatat dibayar ke mitra" : "Perhitungan pembayaran mitra"}</h3>
    ${summary(preview.order_share_total ?? 0, preview.correction_adjustment ?? 0, preview.net_amount ?? 0, preview.unverified_count ? "Bersih sementara — belum final" : "Bersih belum dibayarkan")}
    ${preview.unverified_count ? `<p><strong>Belum final: ${preview.unverified_count} penyesuaian lama masih perlu verifikasi pembayaran ke mitra. Jangan gunakan jumlah sementara sebagai dasar transfer.</strong></p>` : ""}
    ${rows(pending.map(l => ({ ...l, status: decisions[l.decision], applied: ["unverified", "not_paid"].includes(l.decision) ? 0 : l.amount })))}</div>` : '<p>Tidak ada sisa pembayaran mitra untuk periode ini.</p>';
  return `<section class="partner-payment"><h2>Rekonsiliasi Pembayaran Mitra</h2>
    <p>Bagian mitra berdasarkan tanggal laundry. Koreksi periode lama hanya dipotong jika bagian mitranya sudah pernah dibayarkan. Pembayaran tercatat tidak dihitung ulang.</p>
    ${recorded}${remaining}</section>`;
}
