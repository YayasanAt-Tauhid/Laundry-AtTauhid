import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('paid order correction lifecycle, financial integrity and access control', async t => {
  const db = new PGlite();
  const fixture = await readFile(new URL('./fixtures/correction-schema.sql', import.meta.url), 'utf8');
  const baseline = await readFile(new URL('./fixtures/production-payment-functions.sql', import.meta.url), 'utf8');
  // has_role must exist before fixture RLS policies are compiled.
  const [schema, policies] = fixture.split('grant select on public.students');
  await db.exec(schema);
  await db.exec(baseline);
  await db.exec('grant select on public.students' + policies);
  await db.exec(`create trigger trg_validate_order_price before insert or update of category,weight_kg,item_count,price_per_unit,total_price,yayasan_share,vendor_share
    on public.laundry_orders for each row execute function public.validate_and_calculate_order_price()`);
  const migration = await readFile(new URL('../supabase/migrations/20261006070356_paid_order_corrections.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  const quantityMigration = await readFile(new URL('../supabase/migrations/20261006104031_paid_order_quantity_correction.sql', import.meta.url), 'utf8');
  await db.exec(quantityMigration);
  const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  const admin = uid(1), staff = uid(2), cashier = uid(3), parent = uid(4), otherParent = uid(5), partner = uid(6);
  const student = uid(11), otherStudent = uid(12), inactiveStudent = uid(13), partnerId = uid(20);
  await db.query(`insert into auth.users(id) values ($1),($2),($3),($4),($5),($6)`,[admin,staff,cashier,parent,otherParent,partner]);
  await db.query(`insert into user_roles values ($1,'admin'),($2,'staff'),($3,'cashier'),($4,'parent'),($5,'parent'),($6,'partner')`,[admin,staff,cashier,parent,otherParent,partner]);
  await db.query(`insert into students(id,parent_id,name,class,nik,is_active) values ($1,$2,'A','7A','1001',true),($3,$4,'B','8B','1002',true),($5,$4,'C','8B','1003',false)`,[student,parent,otherStudent,otherParent,inactiveStudent]);
  await db.query(`insert into laundry_partners(id,user_id,name) values ($1,$2,'Mitra A')`,[partnerId,partner]);
  await db.exec(`insert into laundry_prices values ('kiloan',7000),('handuk',5000);
    insert into holiday_settings values (2000,5000,20,80)`);
  const actor = async (id, role='authenticated') => {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id ?? '']);
    if (role) await db.exec(`set role ${role}`);
  };
  const row = async (sql, args=[]) => (await db.query(sql,args)).rows[0];
  const asOwner = async fn => { await db.exec('reset role'); return fn(); };
  const newOrder = async (status='DIBAYAR') => asOwner(async () => (await row(`insert into laundry_orders(student_id,partner_id,staff_id,category,weight_kg,price_per_unit,total_price,yayasan_share,vendor_share,status,paid_at,payment_method,paid_amount,midtrans_snap_token)
    values ($1,$2,$3,'kiloan',10,7000,70000,20000,50000,$4,now(),'cash',70000,'PRIVATE_TOKEN') returning id`,[student,partnerId,staff,status])).id);
  const request = async (orderId,total=56000,kind='price',replacement=null) => (await row(`select request_order_correction($1,$2,$3,'Salah input berat laundry',$4) as id`,[orderId,kind,total,replacement])).id;
  const requestQuantity = async (orderId,quantity=8) => (await row(`select request_order_quantity_correction($1,$2,'Berat laundry yang tercatat salah') as id`,[orderId,quantity])).id;
  const approve = async (id,refund=14000) => row(`select review_order_correction($1,true,'Kuitansi sudah diverifikasi','KWT-2026-0001',$2,'Pembayar awal terverifikasi')`,[id,refund]);
  const settle = async (id,method='wadiah',consent=true) => row(`select settle_order_correction($1,$2,'BUKTI-2026-0001',$3)`,[id,method,consent]);
  const mustFail = (fn, message) => assert.rejects(fn, message);
  let originalOrder, correction;

  await t.test('unauthenticated and parent cannot request a correction',async () => {
    originalOrder = await newOrder();
    await actor(null); await mustFail(() => request(originalOrder), /Tidak berwenang/);
    await actor(parent); await mustFail(() => request(originalOrder), /Tidak berwenang/);
    await actor(null,'anon'); await mustFail(() => request(originalOrder), /permission denied/);
  });
  await t.test('paid order can be corrected without leaking its snap token',async () => {
    await actor(staff); correction = await request(originalOrder);
    const c = await row('select * from order_corrections where id=$1',[correction]);
    assert.equal(c.delta,-14000); assert.equal(c.yayasan_delta,-4000); assert.equal(c.vendor_delta,-10000);
    assert.equal(c.original_snapshot.midtrans_snap_token,undefined); assert.equal(c.status,'pending');
    assert.equal(c.settlement_status,'not_ready');
  });
  await t.test('quantity correction derives amount from the historical unit price and keeps the paid order immutable',async () => {
    const id=await newOrder();
    await asOwner(() => db.exec(`update laundry_prices set price_per_unit=9000 where category='kiloan'`));
    await actor(staff); const c=await requestQuantity(id,8);
    const correctionRow=await row('select * from order_corrections where id=$1',[c]);
    assert.equal(Number(correctionRow.corrected_quantity),8);
    assert.equal(correctionRow.corrected_total,56000);
    assert.equal(correctionRow.delta,-14000);
    assert.equal(correctionRow.yayasan_delta,-4000);
    assert.equal(correctionRow.vendor_delta,-10000);
    await asOwner(async () => {
      const order=await row('select * from laundry_orders where id=$1',[id]);
      assert.equal(Number(order.weight_kg),10);
      assert.equal(order.price_per_unit,7000);
      assert.equal(order.total_price,70000);
      assert.equal(order.paid_amount,70000);
      await db.exec(`update laundry_prices set price_per_unit=7000 where category='kiloan'`);
    });
  });
  await t.test('quantity correction rejects unchanged or invalid quantities and unauthorized callers',async () => {
    const id=await newOrder();
    await actor(parent); await mustFail(() => requestQuantity(id,8), /Tidak berwenang/);
    await actor(staff); await mustFail(() => requestQuantity(id,10), /sama dengan tagihan asli/);
    await mustFail(() => requestQuantity(id,0), /tidak valid/);
  });
  await t.test('direct financial writes and duplicate requests are blocked',async () => {
    await actor(admin); await mustFail(() => request(originalOrder), /sudah memiliki/);
    await mustFail(() => db.query(`update order_corrections set corrected_total=100 where id=$1`,[correction]), /permission denied/);
    await mustFail(() => db.exec(`insert into order_corrections default values`), /permission denied/);
  });
  await t.test('RLS only exposes a parent’s own corrections and assigned partner',async () => {
    await actor(parent); assert.equal((await db.query('select id from order_corrections')).rows.length,2);
    await actor(otherParent); assert.equal((await db.query('select id from order_corrections')).rows.length,0);
    await actor(partner); assert.equal((await db.query('select id from order_corrections')).rows.length,2);
  });
  await t.test('staff and cashier cannot approve; settlement before approval fails',async () => {
    await actor(staff); await mustFail(() => approve(correction), /Hanya admin/);
    await actor(cashier); await mustFail(() => approve(correction), /Hanya admin/);
    await mustFail(() => settle(correction), /belum siap/);
  });
  await t.test('approval requires payment verification and cannot refund more than correction',async () => {
    await actor(admin); await mustFail(() => approve(correction,14001), /Verifikasi jumlah/);
    await mustFail(() => db.query(`select review_order_correction($1,true,'Sudah diperiksa',null,14000,'Pembayar asli')`,[correction]), /Referensi verifikasi/);
    await approve(correction);
    const c=await row('select * from order_corrections where id=$1',[correction]);
    assert.equal(c.status,'approved'); assert.equal(c.settlement_status,'pending');
    await mustFail(() => approve(correction), /sudah ditinjau/);
  });
  await t.test('wadiah refund requires consent and credits exactly once',async () => {
    await actor(cashier); await mustFail(() => settle(correction,'wadiah',false), /Persetujuan pelanggan/);
    await settle(correction);
    await asOwner(async () => {
      assert.equal((await row('select balance from student_wadiah_balance where student_id=$1',[student])).balance,14000);
      assert.equal((await row('select count(*)::int as n from wadiah_transactions')).n,1);
      const order=await row('select * from laundry_orders where id=$1',[originalOrder]);
      assert.equal(order.total_price,70000); assert.equal(order.status,'DIBAYAR'); assert.equal(order.paid_amount,70000);
    });
    await actor(cashier); await mustFail(() => settle(correction), /sudah diselesaikan/);
  });
  await t.test('paid snapshot guard also protects against owner writes and deletes',async () => {
    await asOwner(async () => {
      await mustFail(() => db.query('update laundry_orders set weight_kg=11 where id=$1',[originalOrder]), /dikunci/);
      await mustFail(() => db.query('update laundry_orders set student_id=$1 where id=$2',[otherStudent,originalOrder]), /dikunci/);
      await mustFail(() => db.query(`update laundry_orders set status='MENUNGGU_PEMBAYARAN' where id=$1`,[originalOrder]), /dikunci/);
      await mustFail(() => db.query('delete from laundry_orders where id=$1',[originalOrder]), /bukan dihapus/);
      await db.query(`update laundry_orders set status='SELESAI',notes='Layanan selesai' where id=$1`,[originalOrder]);
    });
  });
  await t.test('underbilling creates a separate due and does not rewrite the paid bill',async () => {
    const id=await newOrder(); await actor(staff); const c=await request(id,91000);
    await actor(admin); await approve(c,null);
    assert.equal((await row('select settlement_due from order_corrections where id=$1',[c])).settlement_due,21000);
    await actor(cashier); await mustFail(() => settle(c,'midtrans_manual'), /Metode/);
    await mustFail(() => settle(c), /Saldo wadiah tidak mencukupi/);
    assert.equal((await row('select settlement_status from order_corrections where id=$1',[c])).settlement_status,'pending');
    await settle(c,'bank_transfer');
    await asOwner(async () => assert.equal((await row('select total_price from laundry_orders where id=$1',[id])).total_price,70000));
  });
  await t.test('a verified refund may exclude rounding discount and gateway fees',async () => {
    const id=await newOrder(); await asOwner(() => db.query('update laundry_orders set rounding_applied=490,admin_fee=491 where id=$1',[id]));
    await actor(staff); const c=await request(id,0,'cancel'); await actor(admin); await approve(c,69510);
    assert.equal((await row('select settlement_due from order_corrections where id=$1',[c])).settlement_due,69510);
    await settle(c,'cash');
  });
  await t.test('zero actual refund closes without crediting wadiah',async () => {
    const id=await newOrder(); await actor(staff); const c=await request(id,69900); await actor(admin); await approve(c,0);
    const result=await row('select * from order_corrections where id=$1',[c]);
    assert.equal(result.settlement_status,'settled'); assert.equal(result.settlement_method,'no_due');
  });
  await t.test('wrong student generates an unpaid replacement; payment is not transferred',async () => {
    const id=await newOrder(); await actor(staff); const c=await request(id,0,'wrong_student',otherStudent);
    await actor(admin); await approve(c,70000);
    const result=await row('select * from order_corrections where id=$1',[c]);
    await asOwner(async () => {
      const replacement=await row('select * from laundry_orders where id=$1',[result.replacement_order_id]);
      assert.equal(replacement.student_id,otherStudent); assert.equal(replacement.status,'MENUNGGU_APPROVAL_MITRA');
      assert.equal(replacement.total_price,70000); assert.equal(replacement.paid_amount,null);
      assert.equal((await row('select student_id from laundry_orders where id=$1',[id])).student_id,student);
    });
    await actor(admin); await settle(c,'midtrans_manual');
  });
  await t.test('wrong-student request rejects same or inactive replacement and malformed input',async () => {
    const id=await newOrder(); await actor(staff);
    await mustFail(() => request(id,0,'wrong_student',student), /siswa pengganti/);
    await mustFail(() => request(id,0,'wrong_student',inactiveStudent), /siswa pengganti/);
    await mustFail(() => request(id,null), /tidak valid/);
    await mustFail(() => request(id,70000), /tidak valid/);
    await mustFail(() => request(id,-1), /tidak valid/);
    await mustFail(() => request(id,56000,'unknown'), /tidak valid/);
    const unpaid=await newOrder('MENUNGGU_PEMBAYARAN'); await actor(staff);
    await mustFail(() => request(unpaid), /sudah dibayar/);
  });
  await t.test('rejected request permits a new corrected submission',async () => {
    const id=await newOrder(); await actor(staff); const c=await request(id);
    await actor(admin); await db.query(`select review_order_correction($1,false,'Bukti belum mencukupi')`,[c]);
    await actor(staff); assert.notEqual(await request(id),c);
  });
  await t.test('every request, approval, rejection and settlement has an audit record',async () => {
    await asOwner(async () => {
      const logs=(await db.query(`select * from audit_logs where table_name='order_corrections' and record_id=$1 order by created_at`,[correction])).rows;
      assert.equal(logs.length,3); assert.equal(logs[0].user_id,staff); assert.equal(logs[1].user_id,admin); assert.equal(logs[2].user_id,cashier);
      assert.equal(logs[0].action,'INSERT'); assert.equal(logs[1].old_data.status,'pending'); assert.equal(logs[2].new_data.settlement_status,'settled');
    });
  });
  await db.close();
});
