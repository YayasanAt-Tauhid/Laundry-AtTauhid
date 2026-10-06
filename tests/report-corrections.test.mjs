import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/correction-ledger.ts',import.meta.url),'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { correctionEntries } = await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const correction = changes => ({
  id:'COR-1', order_id:'ORDER-1', student_id:'STU-1', status:'approved', delta:-14000, yayasan_delta:-4000, vendor_delta:-10000,
  reviewed_at:'2026-10-06T05:00:00Z',settled_at:null,settlement_status:'pending',reason:'Berat seharusnya 8 kg',
  laundry_orders:{category:'kiloan',laundry_date:'2026-09-27',partner_id:'MITRA-1',students:{id:'STU-1',name:'Siswa A',class:'7A',nik:'1001'},laundry_partners:{id:'MITRA-1',name:'Mitra A'}},
  ...changes,
});
test('approved reduction adjusts revenue and shares while refund is still pending',() => {
  const [entry]=correctionEntries([correction()],{mode:'revenue'});
  assert.equal(70000+entry.total_price,56000);
  assert.equal(20000+entry.yayasan_share,16000); assert.equal(50000+entry.vendor_share,40000);
  assert.equal(entry.yayasan_share+entry.vendor_share,entry.total_price);
  assert.equal(entry.weight_kg,null);assert.equal(entry.item_count,0);assert.equal(entry.correction_of,'ORDER-1');
});
test('unpaid addition is a receivable and excluded from collected revenue',() => {
  const c=correction({delta:21000,yayasan_delta:6000,vendor_delta:15000});
  assert.equal(correctionEntries([c],{mode:'revenue'}).length,0);
  const [bill]=correctionEntries([c],{mode:'bills'});
  assert.equal(bill.total_price,21000);assert.equal(bill.status,'MENUNGGU_PEMBAYARAN');
});
test('collected addition enters revenue on its collection date',() => {
  const c=correction({delta:21000,yayasan_delta:6000,vendor_delta:15000,settlement_status:'settled',settled_at:'2026-10-07T06:00:00Z'});
  assert.equal(correctionEntries([c],{mode:'revenue',dateType:'paid_at',start:'2026-10-06',end:'2026-10-06'}).length,0);
  assert.equal(correctionEntries([c],{mode:'revenue',dateType:'paid_at',start:'2026-10-07',end:'2026-10-07'})[0].status,'DIBAYAR');
});
test('refund completion does not apply the reduction again',() => {
  const c=correction({settlement_status:'settled',settled_at:'2026-10-08T03:00:00Z'});
  assert.equal(correctionEntries([c],{mode:'revenue',dateType:'paid_at',start:'2026-10-08',end:'2026-10-08'}).length,0);
  assert.equal(correctionEntries([c],{mode:'revenue'})[0].total_price,-14000);
});
test('service-date report attributes correction to original laundry date',() => {
  assert.equal(correctionEntries([correction()],{mode:'revenue',dateType:'laundry_date',start:'2026-09-27',end:'2026-09-27'}).length,1);
  assert.equal(correctionEntries([correction()],{mode:'revenue',dateType:'laundry_date',start:'2026-10-01'}).length,0);
});
test('Jakarta midnight boundary and partner filters are respected',() => {
  const c=correction({reviewed_at:'2026-10-05T17:00:00Z'});
  assert.equal(correctionEntries([c],{mode:'revenue',dateType:'paid_at',start:'2026-10-06',end:'2026-10-06'}).length,1);
  assert.equal(correctionEntries([c],{mode:'revenue',partnerId:'MITRA-2'}).length,0);
  assert.equal(correctionEntries([c],{mode:'revenue',partnerId:'MITRA-1'}).length,1);
});
test('pending, rejected, and inaccessible original orders cannot alter financial reports',() => {
  const rows=[correction({status:'pending'}),correction({status:'rejected'}),correction({laundry_orders:null})];
  assert.equal(correctionEntries(rows,{mode:'bills'}).length,0);
});
test('full cancellation reverses original service revenue without reversing gateway fee',() => {
  const [entry]=correctionEntries([correction({delta:-70000,yayasan_delta:-20000,vendor_delta:-50000})],{mode:'revenue'});
  assert.equal(70000+entry.total_price,0); assert.equal(entry.vendor_share+entry.yayasan_share,-70000);
});
