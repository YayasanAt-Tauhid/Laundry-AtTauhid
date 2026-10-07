import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('unpaid corrections preserve history, reset approval and prevent stale payment links', async t => {
  const db = new PGlite();
  const fixture = await readFile(new URL('./fixtures/correction-schema.sql', import.meta.url), 'utf8');
  const [schema, policies] = fixture.split('grant select on public.students');
  await db.exec(schema);
  await db.exec(await readFile(new URL('./fixtures/production-payment-functions.sql', import.meta.url), 'utf8'));
  await db.exec('grant select on public.students' + policies);
  await db.exec(`create role service_role bypassrls;
    create trigger trg_validate_order_price before insert or update of category,weight_kg,item_count,price_per_unit,total_price,yayasan_share,vendor_share
    on laundry_orders for each row execute function validate_and_calculate_order_price();
    create function touch_order() returns trigger language plpgsql as $$ begin new.updated_at:=clock_timestamp(); return new; end $$;
    create trigger update_laundry_orders_updated_at before update on laundry_orders for each row execute function touch_order();
    grant update on laundry_orders to authenticated;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261006070356_paid_order_corrections.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261006080550_unpaid_order_revisions.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261007001900_cancel_unpaid_orders.sql', import.meta.url), 'utf8'));
  const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  const [admin,staff,cashier,parent,newParent,partner,otherPartner,outsider] = [1,2,3,4,5,6,7,8].map(uid);
  const [student,otherStudent,inactiveStudent,partnerId,newPartnerId] = [11,12,13,20,21].map(uid);
  await db.query('insert into auth.users select unnest($1::uuid[])',[[admin,staff,cashier,parent,newParent,partner,otherPartner,outsider]]);
  await db.query(`insert into user_roles values ($1,'admin'),($2,'staff'),($3,'cashier'),($4,'parent'),($5,'parent'),($6,'partner'),($7,'partner')`,[admin,staff,cashier,parent,newParent,partner,otherPartner]);
  await db.query(`insert into students(id,parent_id,name,is_active) values ($1,$2,'A',true),($3,$4,'B',true),($5,$4,'C',false)`,[student,parent,otherStudent,newParent,inactiveStudent]);
  await db.query(`insert into laundry_partners(id,user_id,name) values ($1,$2,'Mitra A'),($3,$4,'Mitra B')`,[partnerId,partner,newPartnerId,otherPartner]);
  await db.exec(`insert into laundry_prices values ('kiloan',7000),('handuk',5000);
    insert into holiday_settings values (2000,5000,20,80)`);
  const row = async (q,args=[]) => (await db.query(q,args)).rows[0];
  const owner = async fn => { await db.exec('reset role'); return fn(); };
  const actor = async (id,role='authenticated') => {
    await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);
    await db.exec(`set role ${role}`);
  };
  const newOrder = (status='DISETUJUI_MITRA') => owner(async () => row(`insert into laundry_orders(student_id,partner_id,staff_id,category,weight_kg,price_per_unit,total_price,yayasan_share,vendor_share,status,approved_by,approved_at,rejection_reason)
    values ($1,$2,$3,'kiloan',10,7000,70000,20000,50000,$4,$5,now(),'Catatan lama') returning *`,[student,partnerId,staff,status,partner]));
  const correct = (o,patch={}) => {
    const p={student,partnerId,category:'kiloan',quantity:6,date:'2026-10-06',notes:'Catatan yang benar',reason:'Salah input rincian cucian',...patch};
    return row('select correct_unpaid_order($1,$2,$3,$4,$5,$6,$7,$8,$9) as id',
      [o.id,o.updated_at,p.student,p.partnerId,p.category,p.quantity,p.date,p.notes,p.reason]);
  };
  const cancel = (o,reason='Tagihan salah input dan harus dibatalkan') =>
    row('select cancel_unpaid_order($1,$2,$3) as id',[o.id,o.updated_at,reason]);
  const snapshot = o => ({id:o.id,updated_at:o.updated_at,total_price:o.total_price,student_id:o.student_id});
  const attach = orders => db.query("select attach_laundry_payment($1::jsonb,'LAUNDRY-ATTAUHID-BULK-TEST','UNSHARED_TOKEN')",[JSON.stringify(orders.map(snapshot))]);
  let revisedOrder;

  await t.test('only admin, staff and cashier can correct; anonymous and parents cannot', async () => {
    const o=await newOrder();
    for(const id of [null,parent,partner,outsider]) { await actor(id); await assert.rejects(()=>correct(o),/Tidak berwenang/); }
    await actor(null,'anon'); await assert.rejects(()=>correct(o),/permission denied/);
  });
  await t.test('only admin, staff and cashier can cancel; all unpaid states keep original economics and audit history', async () => {
    const denied=await newOrder(); await actor(parent); await assert.rejects(()=>cancel(denied),/Tidak berwenang/);
    for(const [i,status] of ['DRAFT','MENUNGGU_APPROVAL_MITRA','DITOLAK_MITRA','DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN'].entries()) {
      const o=await newOrder(status); await actor([admin,staff,cashier][i%3]); const r=await cancel(o);
      await owner(async()=>{
        const n=await row('select * from laundry_orders where id=$1',[o.id]);
        assert.equal(n.status,'DIBATALKAN'); assert.equal(n.student_id,o.student_id); assert.equal(n.partner_id,o.partner_id);
        assert.equal(n.total_price,70000); assert.equal(n.yayasan_share,20000); assert.equal(n.vendor_share,50000);
        assert.equal(n.paid_at,null); assert.equal(n.paid_amount,null); assert.equal(n.wadiah_used,0);
        const h=await row('select * from unpaid_order_revisions where id=$1',[r.id]);
        assert.equal(h.before_snapshot.status,status); assert.equal(h.after_snapshot.status,'DIBATALKAN');
        assert.equal(h.before_snapshot.total_price,70000); assert.equal(h.after_snapshot.total_price,70000);
        assert.equal(h.reason,'Tagihan salah input dan harus dibatalkan');
        assert.equal((await row("select count(*)::int n from audit_logs where table_name='unpaid_order_revisions' and record_id=$1",[r.id])).n,1);
      });
    }
  });
  await t.test('cancel rejects stale, paid, gateway-linked or funded bills; cancelled rows cannot revive or be deleted', async () => {
    const short=await newOrder(); await actor(admin); await assert.rejects(()=>cancel(short,'Salah'),/10 sampai 2000/);
    const stale=await newOrder(); await owner(()=>db.query("update laundry_orders set notes='berubah' where id=$1",[stale.id]));
    await actor(admin); await assert.rejects(()=>cancel(stale),/berubah sejak dibuka/);
    const gateway=await newOrder(); const g=await owner(()=>row("update laundry_orders set midtrans_order_id='LINK' where id=$1 returning *",[gateway.id]));
    await actor(admin); await assert.rejects(()=>cancel(g),/Midtrans/);
    const funded=await newOrder(); const p=await owner(()=>row('update laundry_orders set paid_amount=1 where id=$1 returning *',[funded.id]));
    await actor(admin); await assert.rejects(()=>cancel(p),/jejak pembayaran/);
    for(const status of ['DIBAYAR','SELESAI']) { const o=await newOrder(status); await actor(admin); await assert.rejects(()=>cancel(o),/belum dibayar/); }
    const direct=await newOrder(); await actor(admin);
    await assert.rejects(()=>db.query("update laundry_orders set status='DIBATALKAN' where id=$1",[direct.id]),/Batalkan Tagihan/);
    const cancelled=await newOrder(); await actor(admin); await cancel(cancelled);
    await assert.rejects(()=>db.query("update laundry_orders set notes='hidup lagi' where id=$1",[cancelled.id]),/dikunci/);
    await assert.rejects(()=>db.query('delete from laundry_orders where id=$1',[cancelled.id]),/tidak boleh dihapus permanen/);
    await actor(null,'service_role'); await assert.rejects(()=>attach([cancelled]),/Tagihan berubah/);
  });
  await t.test('all unpaid states recalculate tariffs and reset approval without touching funds', async () => {
    for(const [i,status] of ['DRAFT','MENUNGGU_APPROVAL_MITRA','DITOLAK_MITRA','DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN'].entries()) {
      const o=await newOrder(status); await actor([admin,staff,cashier][i%3]); const r=await correct(o);
      await owner(async()=>{
        const n=await row('select * from laundry_orders where id=$1',[o.id]);
        assert.equal(n.status,'MENUNGGU_APPROVAL_MITRA'); assert.equal(n.total_price,42000);
        assert.equal(n.yayasan_share,12000); assert.equal(n.vendor_share,30000);
        assert.equal(n.approved_at,null); assert.equal(n.approved_by,null); assert.equal(n.rejection_reason,null);
        assert.equal(n.paid_at,null); assert.equal(n.paid_amount,null);
        const h=await row('select * from unpaid_order_revisions where id=$1',[r.id]);
        assert.equal(h.before_snapshot.total_price,70000); assert.equal(h.after_snapshot.total_price,42000);
        assert.equal(h.before_snapshot.midtrans_snap_token,undefined);
        assert.equal((await row("select count(*)::int n from audit_logs where table_name='unpaid_order_revisions' and record_id=$1",[r.id])).n,1);
        assert.equal((await row('select count(*)::int n from wadiah_transactions')).n,0);
      });
      revisedOrder=o;
    }
  });
  await t.test('correct student, partner, category and date; both affected parents and partners see history', async () => {
    const o=await newOrder(); await actor(staff);
    const r=await correct(o,{student:otherStudent,partnerId:newPartnerId,category:'handuk',quantity:3,date:'2026-09-25'});
    await owner(async()=>{
      const n=await row('select * from laundry_orders where id=$1',[o.id]);
      assert.equal(n.student_id,otherStudent); assert.equal(n.partner_id,newPartnerId);
      assert.equal(n.weight_kg,null); assert.equal(n.item_count,3); assert.equal(n.total_price,15000);
      assert.equal(n.yayasan_share,3000); assert.equal(n.vendor_share,12000);
      assert.equal(new Date(n.laundry_date).toISOString().slice(0,10),'2026-09-25');
    });
    for(const id of [parent,newParent,partner,otherPartner]) {
      await actor(id); assert.equal((await row('select count(*)::int n from unpaid_order_revisions where id=$1',[r.id])).n,1);
    }
    await actor(outsider); assert.equal((await row('select count(*)::int n from unpaid_order_revisions where id=$1',[r.id])).n,0);
    await actor(admin); await assert.rejects(()=>db.query('delete from unpaid_order_revisions where id=$1',[r.id]),/permission denied/);
  });
  await t.test('paid orders, inactive students, invalid quantity, missing reason and no-op are rejected', async () => {
    for(const status of ['DIBAYAR','SELESAI']) { const o=await newOrder(status); await actor(admin); await assert.rejects(()=>correct(o),/belum dibayar/); }
    const o=await newOrder(); await actor(staff);
    await assert.rejects(()=>correct(o,{student:inactiveStudent}),/aktif/);
    await assert.rejects(()=>correct(o,{category:'handuk',quantity:1.5}),/bilangan bulat/);
    await assert.rejects(()=>correct(o,{quantity:0}),/positif/);
    await assert.rejects(()=>correct(o,{reason:'Salah'}),/Alasan/);
    await assert.rejects(()=>correct(o,{quantity:10,date:o.laundry_date,notes:null}),/Tidak ada perubahan/);
  });
  await t.test('stale edit snapshot and payment that wins first cannot be overwritten',async()=>{
    const o=await newOrder();
    await owner(()=>db.query("update laundry_orders set notes='Diubah bersamaan' where id=$1",[o.id]));
    await actor(admin); await assert.rejects(()=>correct(o),/berubah sejak dibuka/);
    const paid=await newOrder(); await owner(()=>db.query("update laundry_orders set status='DIBAYAR' where id=$1",[paid.id]));
    await actor(admin); await assert.rejects(()=>correct(paid),/belum dibayar/);
  });
  await t.test('active gateway links and existing payment or wadiah traces block correction',async()=>{
    for(const column of ['midtrans_order_id','midtrans_snap_token','paid_amount','wadiah_used','paid_by']) {
      const o=await newOrder(); const value=column==='paid_by'?cashier:column.includes('midtrans')?'LINK':1;
      const current=await owner(()=>row(`update laundry_orders set ${column}=$1 where id=$2 returning *`,[value,o.id]));
      await actor(admin); await assert.rejects(()=>correct(current),/Midtrans|jejak pembayaran/);
    }
    const o=await newOrder(); await owner(()=>db.query("insert into wadiah_transactions(student_id,order_id,transaction_type,amount) values($1,$2,'payment',1)",[student,o.id]));
    await actor(admin); await assert.rejects(()=>correct(o),/jejak pembayaran/);
  });
  await t.test('economic writes outside correction menu are blocked; unpaid payment metadata remains writable',async()=>{
    const o=await newOrder(); await actor(admin);
    await assert.rejects(()=>db.query('update laundry_orders set weight_kg=4 where id=$1',[o.id]),/Gunakan menu/);
    await db.query("update laundry_orders set payment_method='bank_transfer' where id=$1",[o.id]);
  });
  await t.test('terminal gateway notification allows correction; notes-only revision is audited',async()=>{
    const o=await newOrder();
    await actor(null,'service_role'); await attach([o]);
    const current=await owner(()=>row("update laundry_orders set midtrans_order_id=null,midtrans_snap_token=null,status='DISETUJUI_MITRA' where id=$1 returning *",[o.id]));
    await actor(staff); const r=await correct(current,{quantity:10,date:current.laundry_date,notes:'Catatan baru setelah tautan kedaluwarsa'});
    await owner(async()=>{
      const h=await row('select * from unpaid_order_revisions where id=$1',[r.id]);
      assert.equal(h.before_snapshot.total_price,h.after_snapshot.total_price);
      assert.equal(h.after_snapshot.notes,'Catatan baru setelah tautan kedaluwarsa');
      assert.equal(h.after_snapshot.status,'MENUNGGU_APPROVAL_MITRA');
    });
  });
  await t.test('revised order cannot be paid or use wadiah before partner reapproval',async()=>{
    await actor(cashier); await assert.rejects(()=>db.query("update laundry_orders set status='DIBAYAR' where id=$1",[revisedOrder.id]),/disetujui mitra/);
    await owner(async()=>assert.rejects(()=>db.query("insert into wadiah_transactions(student_id,order_id,transaction_type,amount) values($1,$2,'payment',1)",[student,revisedOrder.id]),/disetujui mitra/));
  });
  await t.test('gateway binding is service-only and refuses a token generated from pre-correction data',async()=>{
    const o=await newOrder(); await actor(staff); await correct(o);
    await actor(admin); await assert.rejects(()=>attach([o]),/permission denied/);
    await actor(null,'service_role'); await assert.rejects(()=>attach([o]),/Tagihan berubah/);
    await owner(()=>db.query("update laundry_orders set status='DISETUJUI_MITRA' where id=$1",[o.id]));
    await actor(null,'service_role'); await assert.rejects(()=>attach([o]),/Tagihan berubah/);
  });
  await t.test('group binding is atomic: one stale or missing order leaves all orders untouched',async()=>{
    const a=await newOrder(), b=await newOrder();
    await actor(admin); await correct(b);
    await actor(null,'service_role'); await assert.rejects(()=>attach([a,b]),/Tagihan berubah/);
    await assert.rejects(()=>attach([a,{...a,id:uid(999)}]),/tidak ditemukan/);
    await assert.rejects(()=>attach([a,a]),/Snapshot pembayaran/);
    await owner(async()=>assert.equal((await row('select midtrans_order_id from laundry_orders where id=$1',[a.id])).midtrans_order_id,null));
  });
  await t.test('current payment group binds successfully and remains protected from later correction',async()=>{
    const a=await newOrder(), b=await newOrder();
    await actor(null,'service_role'); await attach([a,b]);
    const current=await owner(()=>row('select * from laundry_orders where id=$1',[a.id]));
    assert.equal(current.status,'MENUNGGU_PEMBAYARAN'); assert.equal(current.midtrans_snap_token,'UNSHARED_TOKEN');
    await actor(admin); await assert.rejects(()=>correct(current),/Midtrans/);
  });
  await db.close();
});
