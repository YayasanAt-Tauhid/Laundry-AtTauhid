import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/midtrans-export.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  resolveMidtransDateRange,
  validateMidtransExportRange,
  midtransDateField,
  applyMidtransFilters,
  filterMidtransBySearch,
  buildMidtransExportRows,
  summarizeMidtransExport,
  buildMidtransExportFilename,
  describeMidtransPeriod,
  describeMidtransDateBasis,
  MIDTRANS_EXPORT_HEADERS,
} = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

// Fake chainable query builder: records every filter call.
function fakeQuery() {
  const calls = [];
  const q = {};
  for (const m of ['in', 'eq', 'gte', 'lt']) {
    q[m] = (...args) => { calls.push([m, ...args]); return q; };
  }
  q.calls = calls;
  return q;
}

const NOW = new Date(2026, 10, 26, 16, 10, 0); // 26 Nov 2026 16:10 local

test('custom range is inclusive of the end date (end + 1 day, exclusive upper bound)', () => {
  const { startDate, endDate } = resolveMidtransDateRange(
    'custom', new Date(2026, 10, 1, 15, 30), new Date(2026, 10, 26, 9, 0), NOW,
  );
  assert.equal(startDate.getTime(), new Date(2026, 10, 1, 0, 0, 0).getTime());
  assert.equal(endDate.getTime(), new Date(2026, 10, 27, 0, 0, 0).getTime());
});

test('preset ranges match the on-screen report semantics', () => {
  const today = resolveMidtransDateRange('today', undefined, undefined, NOW);
  assert.equal(today.startDate.getTime(), new Date(2026, 10, 26).getTime());
  assert.equal(today.endDate.getTime(), NOW.getTime());

  const yesterday = resolveMidtransDateRange('yesterday', undefined, undefined, NOW);
  assert.equal(yesterday.startDate.getTime(), new Date(2026, 10, 25).getTime());
  assert.equal(yesterday.endDate.getTime(), new Date(2026, 10, 26).getTime());

  const month = resolveMidtransDateRange('month', undefined, undefined, NOW);
  assert.equal(month.startDate.getTime(), new Date(2026, 10, 1).getTime());

  const week = resolveMidtransDateRange('week', undefined, undefined, NOW);
  assert.equal(week.startDate.getTime(), NOW.getTime() - 7 * 24 * 60 * 60 * 1000);

  const all = resolveMidtransDateRange('all', undefined, undefined, NOW);
  assert.equal(all.startDate.getTime(), 0);
});

test('custom export requires both dates and from <= to', () => {
  assert.match(validateMidtransExportRange('custom', undefined, undefined), /Dari.*Sampai/);
  assert.match(validateMidtransExportRange('custom', new Date(2026, 10, 1), undefined), /Dari.*Sampai/);
  assert.match(validateMidtransExportRange('custom', undefined, new Date(2026, 10, 1)), /Dari.*Sampai/);
  assert.match(
    validateMidtransExportRange('custom', new Date(2026, 10, 10), new Date(2026, 10, 1)),
    /tidak boleh/,
  );
  assert.equal(validateMidtransExportRange('custom', new Date(2026, 10, 1), new Date(2026, 10, 1)), null);
  assert.equal(validateMidtransExportRange('today', undefined, undefined), null);
  assert.equal(validateMidtransExportRange('all', undefined, undefined), null);
});

test('date filter basis: paid_at by default, pending always falls back to created_at', () => {
  assert.equal(midtransDateField('success', 'paid_at'), 'paid_at');
  assert.equal(midtransDateField('all', 'paid_at'), 'paid_at');
  assert.equal(midtransDateField('success', 'created_at'), 'created_at');
  assert.equal(midtransDateField('all', 'created_at'), 'created_at');
  // pending payments have no paid_at yet
  assert.equal(midtransDateField('pending', 'paid_at'), 'created_at');
  assert.equal(midtransDateField('pending', 'created_at'), 'created_at');
});

test('applyMidtransFilters applies status, method and exact date bounds', () => {
  const range = resolveMidtransDateRange('custom', new Date(2026, 10, 1), new Date(2026, 10, 26), NOW);
  const q = fakeQuery();
  const out = applyMidtransFilters(q, { status: 'success', paymentMethod: 'qris', period: 'custom', dateBasis: 'paid_at', range });
  assert.equal(out, q);
  assert.deepEqual(q.calls, [
    ['in', 'status', ['DIBAYAR', 'SELESAI']],
    ['gte', 'paid_at', range.startDate.toISOString()],
    ['lt', 'paid_at', range.endDate.toISOString()],
    ['eq', 'payment_method', 'qris'],
  ]);

  const pending = fakeQuery();
  applyMidtransFilters(pending, { status: 'pending', paymentMethod: 'all', period: 'custom', dateBasis: 'paid_at', range });
  assert.deepEqual(pending.calls, [
    ['eq', 'status', 'MENUNGGU_PEMBAYARAN'],
    ['gte', 'created_at', range.startDate.toISOString()],
    ['lt', 'created_at', range.endDate.toISOString()],
  ]);

  // status "all" + paid_at basis filters strictly on paid_at
  const allPaidAt = fakeQuery();
  applyMidtransFilters(allPaidAt, { status: 'all', paymentMethod: 'all', period: 'custom', dateBasis: 'paid_at', range });
  assert.deepEqual(allPaidAt.calls, [
    ['gte', 'paid_at', range.startDate.toISOString()],
    ['lt', 'paid_at', range.endDate.toISOString()],
  ]);

  const createdBasis = fakeQuery();
  applyMidtransFilters(createdBasis, { status: 'success', paymentMethod: 'all', period: 'custom', dateBasis: 'created_at', range });
  assert.deepEqual(createdBasis.calls, [
    ['in', 'status', ['DIBAYAR', 'SELESAI']],
    ['gte', 'created_at', range.startDate.toISOString()],
    ['lt', 'created_at', range.endDate.toISOString()],
  ]);

  const everything = fakeQuery();
  applyMidtransFilters(everything, { status: 'all', paymentMethod: 'all', period: 'all', dateBasis: 'paid_at', range });
  assert.deepEqual(everything.calls, []);
});

const sample = [
  {
    id: 'a', midtrans_order_id: 'LAUNDRY-ATTAUHID-001', total_price: 50000, admin_fee: 1000,
    payment_method: 'qris', status: 'DIBAYAR', paid_at: new Date(2026, 10, 20, 9, 5).toISOString(),
    created_at: new Date(2026, 10, 19, 20, 0).toISOString(), wadiah_used: 5000, category: 'kiloan',
    weight_kg: 3.5, item_count: null,
    students: { id: 's1', name: 'Ahmad', class: '7A', nik: '123' }, laundry_partners: { name: 'Mitra Satu' },
  },
  {
    id: 'b', midtrans_order_id: 'LAUNDRY-ATTAUHID-002', total_price: 20000, admin_fee: null,
    payment_method: 'bank_transfer', status: 'SELESAI', paid_at: new Date(2026, 10, 21, 23, 59).toISOString(),
    created_at: new Date(2026, 10, 21, 8, 0).toISOString(), wadiah_used: null, category: 'satuan',
    weight_kg: null, item_count: 4,
    students: { id: 's2', name: 'Budi', class: '8B', nik: '456' }, laundry_partners: null,
  },
  {
    id: 'c', midtrans_order_id: 'LAUNDRY-ATTAUHID-003', total_price: 15000, admin_fee: 0,
    payment_method: null, status: 'MENUNGGU_PEMBAYARAN', paid_at: null,
    created_at: new Date(2026, 10, 22, 7, 30).toISOString(), wadiah_used: 0, category: 'kiloan',
    weight_kg: 1, item_count: null, students: null, laundry_partners: null,
  },
];
const labels = {
  categoryLabels: { kiloan: 'Kiloan', satuan: 'Satuan' },
  methodLabels: { qris: 'QRIS', bank_transfer: 'Virtual Account' },
};

test('search filters by student name, class or order id (case-insensitive)', () => {
  assert.deepEqual(filterMidtransBySearch(sample, 'ahmad').map((p) => p.id), ['a']);
  assert.deepEqual(filterMidtransBySearch(sample, '8b').map((p) => p.id), ['b']);
  assert.deepEqual(filterMidtransBySearch(sample, 'attauhid-003').map((p) => p.id), ['c']);
  assert.equal(filterMidtransBySearch(sample, '').length, 3);
  assert.equal(filterMidtransBySearch(sample, '   ').length, 3);
});

test('export rows have one cell per header with numeric money columns', () => {
  const rows = buildMidtransExportRows(sample, labels);
  assert.equal(rows.length, 3);
  for (const r of rows) assert.equal(r.length, MIDTRANS_EXPORT_HEADERS.length);

  const col = (name) => MIDTRANS_EXPORT_HEADERS.indexOf(name);
  const [a, b, c] = rows;

  assert.equal(a[col('No')], 1);
  assert.equal(a[col('Order ID')], 'LAUNDRY-ATTAUHID-001');
  assert.equal(a[col('Siswa')], 'Ahmad');
  assert.equal(a[col('NIK')], '123');
  assert.equal(a[col('Kelas')], '7A');
  assert.equal(a[col('Kategori')], 'Kiloan');
  assert.equal(a[col('Jumlah')], '3.5 kg');
  assert.equal(a[col('Mitra Laundry')], 'Mitra Satu');
  assert.equal(a[col('Total Tagihan')], 50000);
  assert.equal(a[col('Wadiah Dipakai')], 5000);
  assert.equal(a[col('Biaya Admin')], 1000);
  assert.equal(a[col('Total Dibayar')], 50000 - 5000 + 1000);
  assert.equal(a[col('Metode')], 'QRIS');
  assert.equal(a[col('Status')], 'Sukses');
  assert.equal(a[col('Waktu Bayar')], '20/11/2026 09:05');
  assert.equal(a[col('Waktu Dibuat')], '19/11/2026 20:00');

  assert.equal(b[col('Jumlah')], '4 pcs');
  assert.equal(b[col('Mitra Laundry')], '-');
  assert.equal(b[col('Biaya Admin')], 0);
  assert.equal(b[col('Wadiah Dipakai')], 0);
  assert.equal(b[col('Total Dibayar')], 20000);
  assert.equal(b[col('Metode')], 'Virtual Account');
  assert.equal(b[col('Waktu Bayar')], '21/11/2026 23:59');

  assert.equal(c[col('Siswa')], '-');
  assert.equal(c[col('Kelas')], '-');
  assert.equal(c[col('Metode')], '-');
  assert.equal(c[col('Status')], 'Pending');
  assert.equal(c[col('Waktu Bayar')], '-');
});

test('summary separates successful and pending payments', () => {
  const s = summarizeMidtransExport(sample);
  assert.equal(s.totalRows, 3);
  assert.equal(s.successCount, 2);
  assert.equal(s.successAmount, 70000);
  assert.equal(s.successAdminFee, 1000);
  assert.equal(s.successWadiah, 5000);
  assert.equal(s.successPaid, 70000 - 5000 + 1000);
  assert.equal(s.pendingCount, 1);
  assert.equal(s.pendingAmount, 15000);
  assert.deepEqual(summarizeMidtransExport([]).totalRows, 0);
});

test('file name carries the exact date range', () => {
  const custom = buildMidtransExportFilename(
    'custom', resolveMidtransDateRange('custom', new Date(2026, 10, 1), new Date(2026, 10, 26), NOW), NOW,
  );
  assert.equal(custom, 'laporan-midtrans_2026-11-01_sd_2026-11-26.xlsx');

  const sameDay = buildMidtransExportFilename(
    'custom', resolveMidtransDateRange('custom', new Date(2026, 10, 5), new Date(2026, 10, 5), NOW), NOW,
  );
  assert.equal(sameDay, 'laporan-midtrans_2026-11-05.xlsx');

  const yesterday = buildMidtransExportFilename(
    'yesterday', resolveMidtransDateRange('yesterday', undefined, undefined, NOW), NOW,
  );
  assert.equal(yesterday, 'laporan-midtrans_2026-11-25.xlsx');

  const all = buildMidtransExportFilename(
    'all', resolveMidtransDateRange('all', undefined, undefined, NOW), NOW,
  );
  assert.equal(all, 'laporan-midtrans_semua-waktu_2026-11-26.xlsx');
});

test('date basis description shown on the Ringkasan sheet', () => {
  assert.equal(describeMidtransDateBasis('success', 'paid_at'), 'Tanggal Bayar (paid_at)');
  assert.equal(describeMidtransDateBasis('all', 'created_at'), 'Tanggal Dibuat (created_at)');
  assert.equal(describeMidtransDateBasis('pending', 'paid_at'), 'Tanggal Dibuat (created_at)');
});

test('period description shown on the Ringkasan sheet', () => {
  const r = resolveMidtransDateRange('custom', new Date(2026, 10, 1), new Date(2026, 10, 26), NOW);
  assert.equal(describeMidtransPeriod('custom', r), '01/11/2026 - 26/11/2026');
  assert.equal(describeMidtransPeriod('all', resolveMidtransDateRange('all', undefined, undefined, NOW)), 'Semua Waktu');
  assert.equal(describeMidtransPeriod('today', resolveMidtransDateRange('today', undefined, undefined, NOW)), '26/11/2026');
});
