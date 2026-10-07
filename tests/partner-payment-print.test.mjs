import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const moduleUrl = async path => {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  return 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText).toString('base64');
};
const typesUrl = await moduleUrl('../src/types/partner-settlements.ts');
const source = await readFile(new URL('../src/lib/partner-payment-print.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText.replace('"../types/partner-settlements"', JSON.stringify(typesUrl));
const { partnerPaymentPrintHtml } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const line = (amount, day, decision = 'paid_manually') => ({ source_type: 'revision', source_id: day, amount, decision,
  source_snapshot: { student_name: 'NAUFAL ARIFIN', laundry_date: day, reason: 'Salah input tagihan' } });
const lines = [line(-11250, '2026-08-02'), line(-12300, '2026-08-08'), line(-12250, '2026-08-12')];
const preview = changes => ({ active: true, order_share_total: 512600, correction_adjustment: -35800,
  net_amount: 476800, unverified_count: 0, lines, ...changes });
const recorded = changes => ({ period_start: '2026-09-28', cutoff_date: '2026-10-04', order_share_total: 512600,
  correction_adjustment: -35800, net_amount: 476800, payment_reference: 'TRANSFER-ADAN',
  partner_settlement_lines: [{ source_type: 'order', amount: 512600, source_snapshot: {} }, ...lines], ...changes });

test('unpaid period print includes verified historical reductions and net payable', () => {
  const html = partnerPaymentPrintHtml(preview());
  assert.match(html, /512\.600/); assert.match(html, /35\.800/); assert.match(html, /476\.800/);
  assert.match(html, /Bersih belum dibayarkan/); assert.match(html, /02\/08\/2026/);
  assert.equal((html.match(/NAUFAL ARIFIN/g) ?? []).length, 3);
});
test('reprinting after payout preserves recorded reductions when pending preview is zero', () => {
  const html = partnerPaymentPrintHtml(preview({ order_share_total: 0, correction_adjustment: 0, net_amount: 0, lines: [] }), [recorded()]);
  assert.match(html, /Bersih pembayaran tercatat/); assert.match(html, /476\.800/);
  assert.match(html, /35\.800/); assert.match(html, /TRANSFER-ADAN/);
  assert.match(html, /Tidak ada sisa pembayaran/); assert.doesNotMatch(html, /Bersih belum dibayarkan/);
  assert.equal((html.match(/NAUFAL ARIFIN/g) ?? []).length, 3);
});
test('unverified and unpaid historical sources are displayed without deducting their amounts', () => {
  const html = partnerPaymentPrintHtml(preview({ correction_adjustment: 0, net_amount: 512600, unverified_count: 1,
    lines: [line(-11250, '2026-08-02', 'unverified'), line(-12300, '2026-08-08', 'not_paid')] }));
  assert.match(html, /Bersih sementara — belum final/); assert.match(html, /Belum final: 1/);
  assert.match(html, /Belum diperhitungkan — perlu verifikasi/); assert.match(html, /Tidak dipotong — belum dibayar/);
  assert.doesNotMatch(html, /476\.800/);
  assert.equal((html.match(/class="text-right">Rp\s*0<\/td>/g) ?? []).length, 2);
});
test('recorded payment and subsequent outstanding correction remain separate', () => {
  const html = partnerPaymentPrintHtml(preview({ order_share_total: 0, correction_adjustment: -1000, net_amount: -1000,
    lines: [line(-1000, '2026-08-20', 'paid_in_ledger')] }), [recorded()]);
  assert.match(html, /476\.800/); assert.match(html, /Sisa yang belum tercatat/);
  assert.match(html, /1\.000/); assert.equal((html.match(/NAUFAL ARIFIN/g) ?? []).length, 4);
});
test('printed notes and references escape HTML and cannot inject markup', () => {
  const html = partnerPaymentPrintHtml(preview({ lines: [{ ...lines[0], source_snapshot: { student_name: '<img onerror=alert(1)>',
    reason: '<script>bad()</script>', laundry_date: '2026-08-02' } }] }), [recorded({ payment_reference: '"<script>bad()</script>' })]);
  assert.doesNotMatch(html, /<script>|<img/); assert.match(html, /&lt;script&gt;/); assert.match(html, /&quot;/);
});
test('all-partner, open-date and inactive reports do not invent a net payout', () => {
  assert.match(partnerPaymentPrintHtml(null), /Pilih satu mitra/);
  assert.match(partnerPaymentPrintHtml({ active: false }), /Tentukan batas pembayaran manual/);
});
