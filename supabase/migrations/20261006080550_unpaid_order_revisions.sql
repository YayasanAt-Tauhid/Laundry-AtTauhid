-- No historical orders, payments or balances are updated by this migration.
create table public.unpaid_order_revisions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.laundry_orders(id),
  old_student_id uuid not null references public.students(id),
  new_student_id uuid not null references public.students(id),
  old_partner_id uuid not null references public.laundry_partners(id),
  new_partner_id uuid not null references public.laundry_partners(id),
  reason text not null check(length(btrim(reason)) between 10 and 2000),
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  corrected_by uuid not null references auth.users(id),
  corrected_at timestamptz not null default clock_timestamp()
);
create index unpaid_revisions_order on public.unpaid_order_revisions(order_id,corrected_at desc);
create index unpaid_revisions_old_student on public.unpaid_order_revisions(old_student_id);
create index unpaid_revisions_new_student on public.unpaid_order_revisions(new_student_id);
alter table public.unpaid_order_revisions enable row level security;
revoke all on public.unpaid_order_revisions from public,anon,authenticated;
grant select on public.unpaid_order_revisions to authenticated;
create policy unpaid_revision_read on public.unpaid_order_revisions for select to authenticated using (
 public.has_role((select auth.uid()),'admin') or public.has_role((select auth.uid()),'staff')
 or public.has_role((select auth.uid()),'cashier')
 or exists(select 1 from public.students s where s.id in (old_student_id,new_student_id) and s.parent_id=(select auth.uid()))
 or exists(select 1 from public.laundry_partners p where p.id in (old_partner_id,new_partner_id) and p.user_id=(select auth.uid()))
);

create function laundry_private.order_revision_snapshot(o public.laundry_orders) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('student_id',o.student_id,'partner_id',o.partner_id,'category',o.category,
 'weight_kg',o.weight_kg,'item_count',o.item_count,'price_per_unit',o.price_per_unit,
 'total_price',o.total_price,'yayasan_share',o.yayasan_share,'vendor_share',o.vendor_share,
 'laundry_date',o.laundry_date,'notes',o.notes,'status',o.status)
$$;
revoke all on function laundry_private.order_revision_snapshot(public.laundry_orders) from public,anon,authenticated;

create function laundry_private.guard_unpaid_revision() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_reason text := nullif(current_setting('laundry.unpaid_correction_reason',true),'');
 v_economic_change boolean;
begin
 if old.status in ('DIBAYAR','SELESAI') then return new; end if;
 if new.status in ('DIBAYAR','SELESAI') and old.status not in ('DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN')
   and exists(select 1 from public.unpaid_order_revisions where order_id=old.id) then
   raise exception 'Tagihan hasil koreksi harus disetujui mitra sebelum dibayar.';
 end if;
 v_economic_change := (laundry_private.order_revision_snapshot(new)-'notes'-'status')
   is distinct from (laundry_private.order_revision_snapshot(old)-'notes'-'status');
 if not v_economic_change and v_reason is null then return new; end if;
 if auth.uid() is null or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'staff')
   or public.has_role(auth.uid(),'cashier')) then raise exception 'Tidak berwenang mengoreksi tagihan.'; end if;
 if v_reason is null or length(btrim(v_reason)) not between 10 and 2000 then
   raise exception 'Gunakan menu Koreksi Tagihan dan isi alasan perubahan.'; end if;
 if old.status not in ('DRAFT','MENUNGGU_APPROVAL_MITRA','DITOLAK_MITRA','DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN')
   then raise exception 'Status tagihan tidak dapat dikoreksi.'; end if;
 if coalesce(old.midtrans_order_id,'')<>'' or coalesce(old.midtrans_snap_token,'')<>'' then
   raise exception 'Tautan Midtrans masih terkait. Tunggu pembayaran selesai atau notifikasi kedaluwarsa/pembatalan sebelum koreksi.';
 end if;
 if old.paid_at is not null or old.paid_by is not null or coalesce(old.paid_amount,0)<>0
   or coalesce(old.wadiah_used,0)<>0 or coalesce(old.change_amount,0)<>0
   or coalesce(old.rounding_applied,0)<>0
   or exists(select 1 from public.wadiah_transactions t where t.order_id=old.id
     and t.transaction_type in ('payment','refund','change_deposit','sedekah')) then
   raise exception 'Ada jejak pembayaran atau wadiah. Rekonsiliasi melalui admin sebelum koreksi.';
 end if;
 if not exists(select 1 from public.students where id=new.student_id and is_active)
   or not exists(select 1 from public.laundry_partners where id=new.partner_id and is_active) then
   raise exception 'Pilih siswa dan mitra yang aktif.'; end if;
 if new.laundry_date is null or new.total_price<=0 then raise exception 'Tanggal dan nominal tagihan harus valid.'; end if;
 if not v_economic_change and new.notes is not distinct from old.notes then
   raise exception 'Tidak ada perubahan rincian tagihan.'; end if;
 new.status := 'MENUNGGU_APPROVAL_MITRA';
 new.approved_at := null; new.approved_by := null; new.rejection_reason := null;
 return new;
end $$;
revoke all on function laundry_private.guard_unpaid_revision() from public,anon,authenticated;
create trigger zy_guard_unpaid_revision before update on public.laundry_orders
for each row execute function laundry_private.guard_unpaid_revision();

create function laundry_private.record_unpaid_revision() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_reason text := nullif(current_setting('laundry.unpaid_correction_reason',true),'');
begin
 if v_reason is null or old.status in ('DIBAYAR','SELESAI') then return new; end if;
 insert into public.unpaid_order_revisions(order_id,old_student_id,new_student_id,old_partner_id,new_partner_id,
 reason,before_snapshot,after_snapshot,corrected_by)
 values(old.id,old.student_id,new.student_id,old.partner_id,new.partner_id,btrim(v_reason),
 laundry_private.order_revision_snapshot(old),laundry_private.order_revision_snapshot(new),auth.uid())
 returning id into v_id;
 insert into public.audit_logs(table_name,record_id,action,old_data,new_data,user_id)
 values('unpaid_order_revisions',v_id,'INSERT',laundry_private.order_revision_snapshot(old),
 jsonb_build_object('order',laundry_private.order_revision_snapshot(new),'reason',btrim(v_reason)),auth.uid());
 perform set_config('laundry.unpaid_revision_id',v_id::text,true);
 return new;
end $$;
revoke all on function laundry_private.record_unpaid_revision() from public,anon,authenticated;
create trigger record_unpaid_revision after update on public.laundry_orders
for each row execute function laundry_private.record_unpaid_revision();

create function laundry_private.correct_unpaid_order(p_order_id uuid,p_expected_updated_at timestamptz,
 p_student_id uuid,p_partner_id uuid,p_category public.laundry_category,p_quantity numeric,
 p_laundry_date date,p_notes text,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.laundry_orders; v_id uuid;
begin
 if auth.uid() is null or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'staff')
   or public.has_role(auth.uid(),'cashier')) then raise exception 'Tidak berwenang mengoreksi tagihan.'; end if;
 select * into o from public.laundry_orders where id=p_order_id for update;
 if not found or o.status in ('DIBAYAR','SELESAI') then
   raise exception 'Koreksi ini hanya untuk tagihan yang belum dibayar.'; end if;
 if p_expected_updated_at is null or o.updated_at is distinct from p_expected_updated_at then
   raise exception 'Tagihan berubah sejak dibuka. Muat ulang sebelum koreksi.'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 10 and 2000
   or p_notes is not null and length(p_notes)>2000 then raise exception 'Alasan dan catatan tidak valid.'; end if;
 if p_category is null or p_quantity is null or p_quantity<=0 or p_quantity>100000
   or p_quantity::text in ('NaN','Infinity','-Infinity')
   or p_category<>'kiloan' and p_quantity<>trunc(p_quantity) then
   raise exception 'Berat/jumlah harus positif; satuan pcs harus bilangan bulat.'; end if;
 perform set_config('laundry.unpaid_correction_reason',btrim(p_reason),true);
 perform set_config('laundry.unpaid_revision_id','',true);
 -- The existing server-side price trigger calculates tariff and revenue shares.
 update public.laundry_orders set student_id=p_student_id,partner_id=p_partner_id,category=p_category,
 weight_kg=case when p_category='kiloan' then p_quantity else null end,
 item_count=case when p_category<>'kiloan' then p_quantity::integer else null end,
 laundry_date=p_laundry_date,notes=nullif(btrim(p_notes),'') where id=o.id;
 v_id := nullif(current_setting('laundry.unpaid_revision_id',true),'')::uuid;
 perform set_config('laundry.unpaid_correction_reason','',true);
 perform set_config('laundry.unpaid_revision_id','',true);
 return v_id;
end $$;
revoke all on function laundry_private.correct_unpaid_order(uuid,timestamptz,uuid,uuid,public.laundry_category,numeric,date,text,text)
 from public,anon;
grant execute on function laundry_private.correct_unpaid_order(uuid,timestamptz,uuid,uuid,public.laundry_category,numeric,date,text,text) to authenticated;
create function public.correct_unpaid_order(p_order_id uuid,p_expected_updated_at timestamptz,p_student_id uuid,
 p_partner_id uuid,p_category public.laundry_category,p_quantity numeric,p_laundry_date date,p_notes text,p_reason text)
 returns uuid language sql security invoker set search_path='' as $$
 select laundry_private.correct_unpaid_order(p_order_id,p_expected_updated_at,p_student_id,p_partner_id,p_category,
 p_quantity,p_laundry_date,p_notes,p_reason)
$$;
revoke all on function public.correct_unpaid_order(uuid,timestamptz,uuid,uuid,public.laundry_category,numeric,date,text,text)
 from public,anon;
grant execute on function public.correct_unpaid_order(uuid,timestamptz,uuid,uuid,public.laundry_category,numeric,date,text,text) to authenticated;

-- Bind all gateway rows in one transaction only if their fetched snapshots remain current.
-- A token generated from stale order data is never returned to a customer.
create function laundry_private.attach_laundry_payment(p_orders jsonb,p_midtrans_order_id text,p_snap_token text)
 returns void language plpgsql security definer set search_path='' as $$
declare o public.laundry_orders; v_expected jsonb; v_count integer:=0; v_size integer;
begin
 if jsonb_typeof(p_orders) is distinct from 'array' then raise exception 'Snapshot pembayaran tidak valid.'; end if;
 v_size:=jsonb_array_length(p_orders);
 if v_size=0 or v_size>500 or p_midtrans_order_id is null or p_midtrans_order_id not like 'LAUNDRY-ATTAUHID-%'
   or coalesce(p_snap_token,'')='' or (select count(distinct x->>'id') from jsonb_array_elements(p_orders) x)<>v_size then
   raise exception 'Snapshot pembayaran tidak valid.'; end if;
 for o in select * from public.laundry_orders where id in
   (select (x->>'id')::uuid from jsonb_array_elements(p_orders) x) order by id for update loop
   v_count:=v_count+1;
   select x into v_expected from jsonb_array_elements(p_orders) x where (x->>'id')::uuid=o.id;
   if o.status not in ('DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN') or o.updated_at is null
     or o.updated_at is distinct from (v_expected->>'updated_at')::timestamptz
     or o.total_price is distinct from (v_expected->>'total_price')::integer
     or o.student_id is distinct from (v_expected->>'student_id')::uuid then
     raise exception 'Tagihan berubah saat pembayaran dibuat. Muat ulang dan coba kembali.';
   end if;
 end loop;
 if v_count<>v_size then raise exception 'Sebagian tagihan pembayaran tidak ditemukan.'; end if;
 update public.laundry_orders set midtrans_order_id=p_midtrans_order_id,midtrans_snap_token=p_snap_token,
 status='MENUNGGU_PEMBAYARAN' where id in (select (x->>'id')::uuid from jsonb_array_elements(p_orders) x);
end $$;
revoke all on function laundry_private.attach_laundry_payment(jsonb,text,text) from public,anon,authenticated;
grant usage on schema laundry_private to service_role;
grant execute on function laundry_private.attach_laundry_payment(jsonb,text,text) to service_role;
create function public.attach_laundry_payment(p_orders jsonb,p_midtrans_order_id text,p_snap_token text)
 returns void language sql security invoker set search_path='' as $$
 select laundry_private.attach_laundry_payment(p_orders,p_midtrans_order_id,p_snap_token)
$$;
revoke all on function public.attach_laundry_payment(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.attach_laundry_payment(jsonb,text,text) to service_role;
-- Serialize linked wadiah inserts against order corrections before any balance is used.
create function laundry_private.guard_revision_wadiah() returns trigger
language plpgsql security definer set search_path='' as $$
declare o public.laundry_orders;
begin
 if new.order_id is null or new.transaction_type not in ('payment','refund','change_deposit','sedekah') then return new; end if;
 select * into o from public.laundry_orders where id=new.order_id for update;
 if exists(select 1 from public.unpaid_order_revisions where order_id=new.order_id)
   and o.status not in ('DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN','DIBAYAR','SELESAI') then
   raise exception 'Tagihan hasil koreksi harus disetujui mitra sebelum transaksi wadiah.';
 end if;
 return new;
end $$;
revoke all on function laundry_private.guard_revision_wadiah() from public,anon,authenticated;
create trigger guard_revision_wadiah before insert on public.wadiah_transactions
for each row execute function laundry_private.guard_revision_wadiah();
notify pgrst,'reload schema';
