import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';
const source=await readFile(new URL('../supabase/functions/_shared/midtrans-settlement.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {settlementAmounts,midtransPaidAt,settled}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('authoritative Midtrans amounts validate explicit fees and preserve no-fee payments',()=>{
 assert.deepEqual(settlementAmounts({gross_amount:'225439.00',extra_info:{gross_amount_info:{original_amount:'223860',gross_amount:225439,customer_imposed_payment_fee:'1579'}}}),{grossAmount:225439,originalAmount:223860,adminFee:1579});
 assert.deepEqual(settlementAmounts({gross_amount:'225439.00',metadata:{extra_info:{gross_amount_info:{original_amount:'223860',gross_amount:'225439',customer_imposed_payment_fee:'1579'}}}}),{grossAmount:225439,originalAmount:223860,adminFee:1579});
 assert.deepEqual(settlementAmounts({gross_amount:'70000.00'}),{grossAmount:70000,originalAmount:70000,adminFee:0});
 for(const status of [{gross_amount:'NaN'},{gross_amount:'10.50'},{gross_amount:'225439',extra_info:{gross_amount_info:{original_amount:'223860',gross_amount:225439,customer_imposed_payment_fee:'1'}}}]) assert.throws(()=>settlementAmounts(status));
 assert.equal(midtransPaidAt({settlement_time:'2026-10-08 14:21:31'}),'2026-10-08T07:21:31.000Z');
 assert.equal(settled({transaction_status:'pending'}),false);
 assert.equal(settled({transaction_status:'capture',fraud_status:'challenge'}),false);
 assert.equal(settled({transaction_status:'settlement'}),true);
});
test('settlement allocates fees exactly, preserves shares and wadiah, rejects mismatch and is idempotent',async()=>{
 const db=new PGlite();
 const fixture=await readFile(new URL('./fixtures/correction-schema.sql',import.meta.url),'utf8');
 await db.exec(fixture.split('grant select on public.students')[0]);
 await db.exec('create role service_role; create schema laundry_private; grant usage on schema laundry_private to service_role;');
 await db.exec(await readFile(new URL('../supabase/migrations/20261008223409_midtrans_imposed_admin_fee.sql',import.meta.url),'utf8'));
 const amounts=[20650,9520,9520,16660,20650,9520,9590,17150,11130,9450,22330,22050,22820,22820];
 for(const amount of amounts) await db.query("insert into laundry_orders(total_price,vendor_share,yayasan_share,status,midtrans_order_id) values($1,$1*5/7,$1*2/7,'MENUNGGU_PEMBAYARAN','LAUNDRY-ATTAUHID-BULK-TEST')",[amount]);
 await assert.rejects(()=>db.query("select public.settle_laundry_payment_group('LAUNDRY-ATTAUHID-BULK-TEST','qris',now(),225439,0)"),/tidak cocok/);
 const before=(await db.query('select sum(vendor_share)::int vendor,sum(yayasan_share)::int yayasan from laundry_orders')).rows[0];
 assert.equal((await db.query("select public.settle_laundry_payment_group('LAUNDRY-ATTAUHID-BULK-TEST','qris',now(),225439,1579) n")).rows[0].n,14);
 const after=(await db.query("select count(*)::int n,sum(total_price)::int total,sum(paid_amount)::int paid,sum(admin_fee)::int fee,sum(vendor_share)::int vendor,sum(yayasan_share)::int yayasan from laundry_orders where status='DIBAYAR'")).rows[0];
 assert.deepEqual(after,{n:14,total:223860,paid:225439,fee:1579,...before});
 assert.equal((await db.query("select public.settle_laundry_payment_group('LAUNDRY-ATTAUHID-BULK-TEST','qris',now(),225439,1579) n")).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from audit_logs')).rows[0].n,14);
 await db.exec("insert into laundry_orders(total_price,wadiah_used,status,midtrans_order_id) values(10000,3000,'MENUNGGU_PEMBAYARAN','LAUNDRY-ATTAUHID-SINGLE-WADIAH')");
 await db.exec("select public.settle_laundry_payment_group('LAUNDRY-ATTAUHID-SINGLE-WADIAH','qris',now(),7050,50)");
 assert.deepEqual((await db.query("select total_price,wadiah_used,paid_amount,admin_fee::int from laundry_orders where midtrans_order_id='LAUNDRY-ATTAUHID-SINGLE-WADIAH'")).rows[0],{total_price:10000,wadiah_used:3000,paid_amount:7050,admin_fee:50});
 await db.exec("insert into laundry_orders(total_price,status,midtrans_order_id) values(70000,'MENUNGGU_PEMBAYARAN','LAUNDRY-ATTAUHID-SINGLE-NOFEE')");
 await db.exec("select public.settle_laundry_payment_group('LAUNDRY-ATTAUHID-SINGLE-NOFEE','qris',now(),70000)");
 for(const role of ['anon','authenticated']) {
  await db.exec('set role '+role);
  await assert.rejects(()=>db.exec("select public.settle_laundry_payment_group('LAUNDRY-ATTAUHID-SINGLE-NOFEE','qris',now(),70000,0)"),/permission denied/);
  await db.exec('reset role');
 }
 await db.close();
});
