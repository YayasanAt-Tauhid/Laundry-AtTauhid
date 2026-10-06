import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('partner settlement ledger carries paid-order corrections forward exactly once', async t => {
  const db = new PGlite();
  const fixture = await readFile(new URL('./fixtures/correction-schema.sql', import.meta.url), 'utf8');
  const baseline = await readFile(new URL('./fixtures/production-payment-functions.sql', import.meta.url), 'utf8');
  const [schema, policies] = fixture.split('grant select on public.students');
  await db.exec(schema);
  await db.exec(baseline);
  await db.exec('grant select on public.students' + policies);

  const paidMigration = await readFile(new URL('../supabase/migrations/20261006070356_paid_order_corrections.sql', import.meta.url), 'utf8');
  const quantityMigration = await readFile(new URL('../supabase/migrations/20261006104031_paid_order_quantity_correction.sql', import.meta.url), 'utf8');
  const settlementMigration = await readFile(new URL('../supabase/migrations/20261006113044_partner_settlement_ledger.sql', import.meta.url), 'utf8');
  await db.exec(paidMigration);
  await db.exec(quantityMigration);
  await db.exec(settlementMigration);

  const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  const admin=uid(1), staff=uid(2), cashier=uid(3), parent=uid(4), partnerUser=uid(5), otherPartnerUser=uid(6);
  const student=uid(11), partnerId=uid(20), otherPartnerId=uid(21);
  await db.query(`insert into auth.users(id) values ($1),($2),($3),($4),($5),($6)`,[admin,staff,cashier,parent,partnerUser,otherPartnerUser]);
  await db.query(`insert into user_roles values ($1,'admin'),($2,'staff'),($3,'cashier'),($4,'parent'),($5,'partner'),($6,'partner')`,[admin,staff,cashier,parent,partnerUser,otherPartnerUser]);
  await db.query(`insert into students(id,parent_id,name,class,nik,is_active) values ($1,$2,'A','7A','1001',true)`,[student,parent]);
  await db.query(`insert into laundry_partners(id,user_id,name,is_active) values ($1,$2,'Mitra A',true),($3,$4,'Mitra B',true)`,[partnerId,partnerUser,otherPartnerId,otherPartnerUser]);

  const actor = async (id, role='authenticated') => {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id ?? '']);
    if (role) await db.exec(`set role ${role}`);
  };
  const owner = async fn => { await db.exec('reset role'); return fn(); };
  const row = async (sql,args=[]) => (await db.query(sql,args)).rows[0];
  const mustFail = (fn,re) => assert.rejects(fn,re);
  const today = (await row(`select (now() at time zone 'Asia/Jakarta')::date::text as d`)).d;

  const newPaidOrder = async (daysOffset=0) => owner(async () => {
    const result = await row(`
      insert into laundry_orders(
        student_id,partner_id,staff_id,category,weight_kg,price_per_unit,total_price,
        yayasan_share,vendor_share,status,paid_at,payment_method,paid_amount
      ) values (
        $1,$2,$3,'kiloan',10,7000,70000,20000,50000,'DIBAYAR',
        now() + ($4 || ' days')::interval,'cash',70000
      ) returning id
    `,[student,partnerId,staff,String(daysOffset)]);
    return result.id;
  });
  const requestCorrection = async (orderId,total,kind='price') =>
    (await row(`select request_order_correction($1,$2,$3,'Koreksi settlement mitra yang valid',null) as id`,[orderId,kind,total])).id;
  const approveCorrection = async (id,refund=null) =>
    row(`select review_order_correction($1,true,'Sudah diverifikasi oleh admin','KWT-SETTLE-001',$2,'Pembayar terverifikasi')`,[id,refund]);

  let historical, currentA, currentB, negativeCorrection, positiveCorrection;

  await t.test('only admin may activate and historical paid orders before start date are excluded', async () => {
    historical = await newPaidOrder(-2);
    currentA = await newPaidOrder(0);

    await actor(cashier);
    await mustFail(() => db.query(`select activate_partner_settlement($1,$2,'Mulai setelah settlement manual terakhir')`,[partnerId,today]), /Hanya admin/);

    await actor(admin);
    await db.query(`select activate_partner_settlement($1,$2,'Mulai setelah settlement manual terakhir')`,[partnerId,today]);

    const p = await row(`select * from preview_partner_settlement($1,$2)`,[partnerId,today]);
    assert.equal(Number(p.order_share_total),50000);
    assert.equal(Number(p.order_count),1);
    assert.equal(Number(p.correction_adjustment),0);
    assert.equal(Number(p.net_amount),50000);
  });

  await t.test('negative correction on a historical order reduces the next settlement even when original order was pre-cutover', async () => {
    await actor(staff);
    negativeCorrection = await requestCorrection(historical,56000);
    await actor(admin);
    await approveCorrection(negativeCorrection,14000);

    const p = await row(`select * from preview_partner_settlement($1,$2)`,[partnerId,today]);
    assert.equal(Number(p.order_share_total),50000);
    assert.equal(Number(p.correction_adjustment),-10000);
    assert.equal(Number(p.net_amount),40000);
    assert.equal(Number(p.correction_count),1);
  });

  await t.test('positive correction is excluded until the customer additional amount is settled', async () => {
    currentB = await newPaidOrder(0);
    await actor(staff);
    positiveCorrection = await requestCorrection(currentB,91000);
    await actor(admin);
    await approveCorrection(positiveCorrection,null);

    let p = await row(`select * from preview_partner_settlement($1,$2)`,[partnerId,today]);
    assert.equal(Number(p.order_share_total),100000);
    assert.equal(Number(p.correction_adjustment),-10000);
    assert.equal(Number(p.net_amount),90000);

    await actor(cashier);
    await db.query(`select settle_order_correction($1,'bank_transfer','ADD-PAY-001',false)`,[positiveCorrection]);

    p = await row(`select * from preview_partner_settlement($1,$2)`,[partnerId,today]);
    assert.equal(Number(p.correction_adjustment),5000);
    assert.equal(Number(p.net_amount),105000);
    assert.equal(Number(p.correction_count),2);
  });

  await t.test('cashier records exact net once; partner sees own settlement but other partner does not', async () => {
    await actor(cashier);
    const settlement = (await row(`select record_partner_settlement($1,$2,'bank_transfer','TRF-MITRA-001','Pembayaran settlement harian') as id`,[partnerId,today])).id;

    await owner(async () => {
      const s=await row('select * from partner_settlements where id=$1',[settlement]);
      assert.equal(s.order_share_total,100000);
      assert.equal(s.correction_adjustment,5000);
      assert.equal(s.net_amount,105000);
      assert.equal(s.order_count,2);
      assert.equal(s.correction_count,2);
      assert.equal((await row('select count(*)::int as n from partner_settlement_lines where settlement_id=$1',[settlement])).n,4);
    });

    let p=await row(`select * from preview_partner_settlement($1,$2)`,[partnerId,today]);
    assert.equal(Number(p.net_amount),0);

    await mustFail(() => db.query(`select record_partner_settlement($1,$2,'cash','CASH-002',null)`,[partnerId,today]), /belum positif/);

    await actor(partnerUser);
    assert.equal((await db.query('select id from partner_settlements')).rows.length,1);
    assert.equal((await db.query('select id from partner_settlement_lines')).rows.length,4);

    await actor(otherPartnerUser);
    assert.equal((await db.query('select id from partner_settlements')).rows.length,0);
    assert.equal((await db.query('select id from partner_settlement_lines')).rows.length,0);
  });

  await t.test('negative carry cannot be paid and remains until future earnings make the balance positive', async () => {
    const oldDuplicate=await newPaidOrder(-2);
    await actor(staff);
    const cancelCorrection=await requestCorrection(oldDuplicate,0,'cancel');
    await actor(admin);
    await approveCorrection(cancelCorrection,70000);

    let p=await row(`select * from preview_partner_settlement($1,$2)`,[partnerId,today]);
    assert.equal(Number(p.net_amount),-50000);

    await actor(cashier);
    await mustFail(() => db.query(`select record_partner_settlement($1,$2,'cash','CARRY-001',null)`,[partnerId,today]), /belum positif/);

    await newPaidOrder(0);
    await actor(cashier);
    p=await row(`select * from preview_partner_settlement($1,$2)`,[partnerId,today]);
    assert.equal(Number(p.net_amount),0);
    await mustFail(() => db.query(`select record_partner_settlement($1,$2,'cash','CARRY-002',null)`,[partnerId,today]), /belum positif/);

    await newPaidOrder(0);
    await actor(cashier);
    p=await row(`select * from preview_partner_settlement($1,$2)`,[partnerId,today]);
    assert.equal(Number(p.net_amount),50000);
    await db.query(`select record_partner_settlement($1,$2,'cash','CARRY-003','Saldo koreksi dibawa ke pembayaran berikutnya')`,[partnerId,today]);

    p=await row(`select * from preview_partner_settlement($1,$2)`,[partnerId,today]);
    assert.equal(Number(p.net_amount),0);
  });

  await t.test('direct financial writes are blocked and activations/payments are audited', async () => {
    await actor(admin);
    await mustFail(() => db.query(`insert into partner_settlements(partner_id,cutoff_date,payment_method,payment_reference,paid_by) values ($1,$2,'cash','ILLEGAL',$3)`,[partnerId,today,admin]), /permission denied/);

    await owner(async () => {
      const accountAudit=await row(`select count(*)::int as n from audit_logs where table_name='partner_settlement_accounts' and record_id=$1`,[partnerId]);
      const settlementAudit=await row(`select count(*)::int as n from audit_logs where table_name='partner_settlements'`);
      assert.equal(accountAudit.n,1);
      assert.equal(settlementAudit.n,2);
      const duplicates=await row(`select count(*)::int as n from (
        select source_type,source_id,count(*) from partner_settlement_lines group by source_type,source_id having count(*)>1
      ) d`);
      assert.equal(duplicates.n,0);
    });
  });

  await db.close();
});
