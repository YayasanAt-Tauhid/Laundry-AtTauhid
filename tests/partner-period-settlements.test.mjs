import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('period payouts reconcile billed laundry and historical cancellations without duplicate deductions', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const fixture = await readFile(new URL('./fixtures/correction-schema.sql', import.meta.url),'utf8');
  const [schema,policies] = fixture.split('grant select on public.students');
  await db.exec(schema);
  await db.exec("create role service_role;");
  await db.exec(await readFile(new URL('./fixtures/production-payment-functions.sql', import.meta.url),'utf8'));
  await db.exec('grant select on public.students'+policies);
  for (const file of ['20261006070356_paid_order_corrections.sql','20261006080550_unpaid_order_revisions.sql',
    '20261006104031_paid_order_quantity_correction.sql','20261006113044_partner_settlement_ledger.sql',
    '20261007001900_cancel_unpaid_orders.sql','20261007071050_partner_period_settlements.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
  }
  const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  const admin=uid(1),cashier=uid(2),parent=uid(3),partnerUser=uid(4),otherPartnerUser=uid(5);
  const student=uid(10),adan=uid(20),jasmin=uid(21),other=uid(22);
  const owner=async fn=>{await db.exec('reset role');return fn();};
  const row=async (sql,args=[]) => (await db.query(sql,args)).rows[0];
  const actor=async id=>{await db.exec('reset role');await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id]);await db.exec('set role authenticated');};
  const dates=await row(`select (current_date-9)::text start,(current_date-3)::text finish,(current_date-60)::text old,current_date::text today`);
  await db.query('insert into auth.users(id) values ($1),($2),($3),($4),($5)',[admin,cashier,parent,partnerUser,otherPartnerUser]);
  await db.query(`insert into user_roles values ($1,'admin'),($2,'cashier'),($3,'parent'),($4,'partner'),($5,'partner')`,[admin,cashier,parent,partnerUser,otherPartnerUser]);
  await db.query(`insert into students(id,parent_id,name,class,nik) values ($1,$2,'NAUFAL ARIFIN','7A','1001')`,[student,parent]);
  await db.query(`insert into laundry_partners(id,user_id,name) values ($1,$2,'Adan Laundry'),($3,null,'Jasmin Laundry'),($4,$5,'Other')`,[adan,partnerUser,jasmin,other,otherPartnerUser]);
  const order=async (partner,date,share,status='MENUNGGU_APPROVAL_MITRA')=>owner(async()=>
    (await row(`insert into laundry_orders(student_id,partner_id,staff_id,category,weight_kg,price_per_unit,total_price,yayasan_share,vendor_share,status,laundry_date,paid_at,paid_amount,payment_method)
      values($1,$2,$3,'kiloan',$4::numeric/5000,7000,$4*14/10,$4*4/10,$4,$5::order_status,$6,case when $5='DIBAYAR' then now() else null end,case when $5='DIBAYAR' then $4*14/10 else 0 end,'cash') returning id`,[student,partner,admin,share,status,date])).id);
  for (const [p,total,n] of [[adan,512600,40],[jasmin,786450,63]]) {
    for(let i=0;i<n;i++) await order(p,dates.finish,i===n-1?total-(n-1)*10000:10000);
    await actor(admin);await db.query(`select activate_partner_settlement($1,$2,'Batas pertama laundry belum dibayar mitra')`,[p,dates.start]);
  }
  const cancelledPaid=async(p,share)=>{
    const id=await order(p,dates.old,share,'DIBAYAR');await actor(admin);
    const c=(await row(`select request_order_correction($1,'cancel',0,'Salah tagihan siswa Naufal Arifin',null) id`,[id])).id;
    await db.query(`select review_order_correction($1,true,'Sudah diperiksa benar','BUKTI-001',$2,'Pembayar sesuai')`,[c,share*14/10]);
    return c;
  };
  const cancelledUnpaid=async(p,share,date=dates.old)=>{
    const id=await order(p,date,share,'MENUNGGU_PEMBAYARAN');await actor(admin);
    const updated=(await owner(()=>row('select updated_at from laundry_orders where id=$1',[id]))).updated_at;
    await actor(admin);await db.query(`select cancel_unpaid_order($1,$2,'Tagihan salah untuk Naufal Arifin')`,[id,updated]);
    return id;
  };
  await cancelledPaid(adan,11250);await cancelledPaid(jasmin,18550);
  await cancelledUnpaid(adan,12300);await cancelledUnpaid(adan,12250);await cancelledUnpaid(jasmin,4650);
  await cancelledUnpaid(adan,7000,dates.finish); // Current-period cancellation must not reduce unrelated bills.
  await order(adan,dates.old,99999,'DIBAYAR'); // Old service paid by customer today must never enter current payout.
  const preview=async(p=adan,start=dates.start,end=dates.finish)=>(await row(`select preview_partner_period($1,$2,$3) p`,[p,start,end])).p;
  const verifyAll=async(p,paid)=>{
    const data=await preview(p);
    for(const line of data.lines.filter(l=>l.decision==='unverified'))
      await db.query(`select verify_partner_adjustment($1,$2,$3,$4,$5,$6,'Rekap pembayaran lama diperiksa')`,[p,dates.start,dates.finish,line.source_type,line.source_id,paid]);
  };
  const record=async(p,token)=>db.query(`select record_partner_period($1,$2,$3,$4,'bank_transfer','TRF-2026-001',null) id`,[p,dates.start,dates.finish,token]);

  await t.test('all customer-unpaid bills are counted by service period, not recent paid_at',async()=>{
    await actor(admin);
    const a=await preview();assert.equal(a.order_share_total,512600);assert.equal(a.unverified_count,3);
    assert.equal(a.net_amount,512600);assert.equal(a.lines.filter(l=>l.source_type==='order').length,40);
    const j=await preview(jasmin);assert.equal(j.order_share_total,786450);assert.equal(j.unverified_count,2);
    await assert.rejects(()=>record(adan,a.token),/Verifikasi/);
  });
  await t.test('Adan and Jasmin amounts match Naufal manual-paid corrections made after period end',async()=>{
    const stale=(await preview()).token;
    await verifyAll(adan,true);await verifyAll(jasmin,true);
    const a=await preview();assert.equal(a.correction_adjustment,-35800);assert.equal(a.net_amount,476800);
    const j=await preview(jasmin);assert.equal(j.correction_adjustment,-23200);assert.equal(j.net_amount,763250);
    await assert.rejects(()=>record(adan,stale),/berubah/);
  });
  await t.test('no duplicate payout, including overlapping periods, and legacy paid_at record is blocked',async()=>{
    await actor(cashier);const a=await preview();await record(adan,a.token);
    const paid=await owner(()=>row('select * from partner_settlements where partner_id=$1',[adan]));
    assert.equal(paid.net_amount,476800);assert.equal(new Date(paid.period_start).toISOString().slice(0,10),dates.start);assert.equal(paid.order_count,40);assert.equal(paid.correction_count,3);
    assert.equal((await preview()).net_amount,0);
    assert.equal((await preview(adan,dates.start,dates.today)).net_amount,0);
    await assert.rejects(()=>record(adan,a.token),/berubah/);
    await assert.rejects(()=>db.query(`select record_partner_settlement($1,$2,'cash','OLD-001',null)`,[adan,dates.finish]),/periode laundry/);
  });
  await t.test('historical bills never paid to partner are excluded without a second deduction',async()=>{
    const id=await cancelledUnpaid(jasmin,5000);
    await actor(admin);const j=await preview(jasmin);const line=j.lines.find(l=>l.source_snapshot.order_id===id);
    assert.equal(line.decision,'unverified');
    await db.query(`select verify_partner_adjustment($1,$2,$3,$4,$5,false,'Belum pernah dibayar dalam rekap lama')`,[jasmin,dates.start,dates.finish,line.source_type,line.source_id]);
    assert.equal((await preview(jasmin)).net_amount,763250);
    assert.equal((await preview(jasmin)).unverified_count,0);
    await assert.rejects(()=>db.query(`select verify_partner_adjustment($1,$2,$3,$4,$5,true,'Ubah hasil verifikasi')`,[jasmin,dates.start,dates.finish,line.source_type,line.source_id]),/sudah diverifikasi/);
  });
  await t.test('cancellation after a recorded customer-unpaid payout is carried automatically and consumed once',async()=>{
    const source=await owner(()=>row(`select source_id from partner_settlement_lines where partner_id=$1 and source_type='order' and amount=10000 limit 1`,[adan]));
    const updated=await owner(()=>row(`select updated_at from laundry_orders where id=$1`,[source.source_id]));
    await actor(admin);await db.query(`select cancel_unpaid_order($1,$2,'Salah tagihan setelah pembayaran mitra')`,[source.source_id,updated.updated_at]);
    let a=await preview();assert.equal(a.correction_adjustment,-10000);assert.equal(a.unverified_count,0);assert.equal(a.net_amount,-10000);
    await assert.rejects(()=>record(adan,a.token),/belum positif/);
    await order(adan,dates.today,15000);await actor(admin);
    a=await preview(adan,dates.today,dates.today);assert.equal(a.net_amount,5000);
    await db.query(`select record_partner_period($1,$2,$2,$3,'cash','CARRY-PAID-001',null)`,[adan,dates.today,a.token]);
    assert.equal((await preview(adan,dates.start,dates.today)).net_amount,0);
  });
  await t.test('parent, other vendor and direct financial writes cannot bypass authorization',async()=>{
    await actor(parent);await assert.rejects(()=>preview(),/Tidak berwenang/);
    await actor(otherPartnerUser);await assert.rejects(()=>preview(),/Tidak berwenang/);
    await actor(partnerUser);assert.equal((await preview()).net_amount,0);
    await assert.rejects(()=>db.query(`select verify_partner_adjustment($1,$2,$3,'revision',$4,true,'fake-001')`,[adan,dates.start,dates.finish,uid(99)]),/Hanya admin/);
    await actor(admin);await assert.rejects(()=>db.query(`insert into partner_adjustment_verifications(partner_id,source_type,source_id,previously_paid,verified_amount,reference,verified_by) values($1,'revision',$2,true,-100,'fake-001',$3)`,[adan,uid(99),admin]),/permission denied/);
    const audit=await owner(()=>row(`select count(*)::int n from audit_logs where table_name='partner_adjustment_verifications'`));assert.equal(audit.n,6);
  });
  await t.test('moving an already vendor-paid order reverses old vendor and credits new vendor once',async()=>{
    const source=await owner(()=>row(`select l.source_id from partner_settlement_lines l join laundry_orders o on o.id=l.source_id
      where l.partner_id=$1 and l.source_type='order' and o.status<>'DIBATALKAN' and l.amount=10000 limit 1`,[adan]));
    const updated=await owner(()=>row(`select updated_at from laundry_orders where id=$1`,[source.source_id]));
    await actor(admin);await db.query(`select correct_unpaid_order($1,$2,$3,$4,'kiloan',2,$5,null,'Salah mitra setelah pembayaran lama')`,[source.source_id,updated.updated_at,student,jasmin,dates.finish]);
    const a=await preview();const j=await preview(jasmin);
    const debit=a.lines.find(l=>l.source_snapshot.order_id===source.source_id);
    const credit=j.lines.find(l=>l.source_snapshot.order_id===source.source_id);
    assert.equal(debit.amount,-10000);assert.equal(debit.decision,'paid_in_ledger');
    assert.equal(credit.amount,10000);assert.equal(credit.decision,'paid_in_ledger');
    assert.equal(j.lines.some(l=>l.source_id===source.source_id && l.source_type==='order'),false);
  });
  await t.test('positive paid-order corrections remain unavailable until the customer pays the difference',async()=>{
    const id=await order(adan,dates.old,50000,'DIBAYAR');await actor(admin);
    const c=(await row(`select request_order_correction($1,'price',77000,'Tambahan berat sudah terverifikasi',null) id`,[id])).id;
    await db.query(`select review_order_correction($1,true,'Sudah diperiksa benar','KWT-ADD-001',null,'Pembayar sesuai')`,[c]);
    assert.equal((await preview()).lines.some(l=>l.source_id===c),false);
    await actor(cashier);await db.query(`select settle_order_correction($1,'cash','ADD-PAY-001',false)`,[c]);
    const line=(await preview()).lines.find(l=>l.source_id===c);assert.equal(line.amount,5000);assert.equal(line.decision,'unverified');
  });
});
