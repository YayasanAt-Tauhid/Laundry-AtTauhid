-- Cancel unpaid orders without deleting historical data or touching balances/payments.
alter type public.order_status add value if not exists 'DIBATALKAN';

create or replace function laundry_private.guard_unpaid_revision() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 v_reason text := nullif(current_setting('laundry.unpaid_correction_reason',true),'');
 v_cancel_reason text := nullif(current_setting('laundry.unpaid_cancellation_reason',true),'');
 v_economic_change boolean;
begin
 if old.status='DIBATALKAN' then
   raise exception 'Tagihan yang sudah dibatalkan dikunci dan tidak dapat diubah.';
 end if;
 if old.status in ('DIBAYAR','SELESAI') then return new; end if;

 if new.status='DIBATALKAN' then
   if auth.uid() is null or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'staff')
     or public.has_role(auth.uid(),'cashier')) then raise exception 'Tidak berwenang membatalkan tagihan.'; end if;
   if v_cancel_reason is null or length(btrim(v_cancel_reason)) not between 10 and 2000 then
     raise exception 'Gunakan menu Batalkan Tagihan dan isi alasan pembatalan.'; end if;
   if v_reason is not null then raise exception 'Koreksi dan pembatalan tidak dapat dilakukan bersamaan.'; end if;
   if old.status not in ('DRAFT','MENUNGGU_APPROVAL_MITRA','DITOLAK_MITRA','DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN') then
     raise exception 'Hanya tagihan yang belum dibayar yang dapat dibatalkan.'; end if;
   if coalesce(old.midtrans_order_id,'')<>'' or coalesce(old.midtrans_snap_token,'')<>'' then
     raise exception 'Tautan Midtrans masih terkait. Tunggu pembayaran selesai atau notifikasi kedaluwarsa/pembatalan sebelum membatalkan tagihan.';
   end if;
   if old.paid_at is not null or old.paid_by is not null or coalesce(old.paid_amount,0)<>0
     or coalesce(old.wadiah_used,0)<>0 or coalesce(old.change_amount,0)<>0
     or coalesce(old.rounding_applied,0)<>0
     or exists(select 1 from public.wadiah_transactions t where t.order_id=old.id
       and t.transaction_type in ('payment','refund','change_deposit','sedekah')) then
     raise exception 'Ada jejak pembayaran atau wadiah. Rekonsiliasi melalui admin sebelum pembatalan.';
   end if;
   v_economic_change := (laundry_private.order_revision_snapshot(new)-'notes'-'status')
     is distinct from (laundry_private.order_revision_snapshot(old)-'notes'-'status');
   if v_economic_change or new.notes is distinct from old.notes then
     raise exception 'Pembatalan tidak boleh mengubah rincian tagihan.';
   end if;
   return new;
 end if;

 if v_cancel_reason is not null then
   raise exception 'Pembatalan hanya boleh menghasilkan status DIBATALKAN.';
 end if;
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

create or replace function laundry_private.record_unpaid_revision() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 v_id uuid;
 v_reason text := coalesce(
   nullif(current_setting('laundry.unpaid_correction_reason',true),''),
   nullif(current_setting('laundry.unpaid_cancellation_reason',true),'')
 );
begin
 if v_reason is null or old.status in ('DIBAYAR','SELESAI','DIBATALKAN') then return new; end if;
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

create function laundry_private.cancel_unpaid_order(
 p_order_id uuid,p_expected_updated_at timestamptz,p_reason text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.laundry_orders; v_id uuid;
begin
 if auth.uid() is null or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'staff')
   or public.has_role(auth.uid(),'cashier')) then raise exception 'Tidak berwenang membatalkan tagihan.'; end if;
 select * into o from public.laundry_orders where id=p_order_id for update;
 if not found or o.status not in ('DRAFT','MENUNGGU_APPROVAL_MITRA','DITOLAK_MITRA','DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN') then
   raise exception 'Pembatalan hanya untuk tagihan yang belum dibayar.'; end if;
 if p_expected_updated_at is null or o.updated_at is distinct from p_expected_updated_at then
   raise exception 'Tagihan berubah sejak dibuka. Muat ulang sebelum pembatalan.'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then
   raise exception 'Alasan pembatalan harus 10 sampai 2000 karakter.'; end if;
 if coalesce(o.midtrans_order_id,'')<>'' or coalesce(o.midtrans_snap_token,'')<>'' then
   raise exception 'Tautan Midtrans masih terkait. Tunggu pembayaran selesai atau notifikasi kedaluwarsa/pembatalan sebelum membatalkan tagihan.';
 end if;
 if o.paid_at is not null or o.paid_by is not null or coalesce(o.paid_amount,0)<>0
   or coalesce(o.wadiah_used,0)<>0 or coalesce(o.change_amount,0)<>0
   or coalesce(o.rounding_applied,0)<>0
   or exists(select 1 from public.wadiah_transactions t where t.order_id=o.id
     and t.transaction_type in ('payment','refund','change_deposit','sedekah')) then
   raise exception 'Ada jejak pembayaran atau wadiah. Rekonsiliasi melalui admin sebelum pembatalan.';
 end if;
 perform set_config('laundry.unpaid_cancellation_reason',btrim(p_reason),true);
 perform set_config('laundry.unpaid_revision_id','',true);
 update public.laundry_orders set status='DIBATALKAN' where id=o.id;
 v_id := nullif(current_setting('laundry.unpaid_revision_id',true),'')::uuid;
 if v_id is null then raise exception 'Riwayat pembatalan gagal dicatat.'; end if;
 perform set_config('laundry.unpaid_cancellation_reason','',true);
 perform set_config('laundry.unpaid_revision_id','',true);
 return v_id;
end $$;
revoke all on function laundry_private.cancel_unpaid_order(uuid,timestamptz,text) from public,anon;
grant execute on function laundry_private.cancel_unpaid_order(uuid,timestamptz,text) to authenticated;

create function public.cancel_unpaid_order(
 p_order_id uuid,p_expected_updated_at timestamptz,p_reason text
) returns uuid language sql security invoker set search_path='' as $$
 select laundry_private.cancel_unpaid_order(p_order_id,p_expected_updated_at,p_reason)
$$;
revoke all on function public.cancel_unpaid_order(uuid,timestamptz,text) from public,anon;
grant execute on function public.cancel_unpaid_order(uuid,timestamptz,text) to authenticated;

create function laundry_private.guard_cancelled_order_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.status='DIBATALKAN' then
   raise exception 'Tagihan yang dibatalkan disimpan sebagai histori dan tidak boleh dihapus permanen.';
 end if;
 return old;
end $$;
revoke all on function laundry_private.guard_cancelled_order_delete() from public,anon,authenticated;
create trigger zz_guard_cancelled_order_delete before delete on public.laundry_orders
for each row execute function laundry_private.guard_cancelled_order_delete();

notify pgrst,'reload schema';
