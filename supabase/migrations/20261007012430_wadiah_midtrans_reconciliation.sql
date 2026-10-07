-- Make partial Wadiah + Midtrans payments idempotent and auditable.
-- No historical rows are changed by this migration.

create or replace function laundry_private.attach_laundry_payment(p_orders jsonb,p_midtrans_order_id text,p_snap_token text)
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
     or o.student_id is distinct from (v_expected->>'student_id')::uuid
     or coalesce(o.wadiah_used,0) is distinct from coalesce((v_expected->>'wadiah_used')::integer,0) then
     raise exception 'Tagihan berubah saat pembayaran dibuat. Muat ulang dan coba kembali.';
   end if;
 end loop;
 if v_count<>v_size then raise exception 'Sebagian tagihan pembayaran tidak ditemukan.'; end if;
 update public.laundry_orders set midtrans_order_id=p_midtrans_order_id,midtrans_snap_token=p_snap_token,
 status='MENUNGGU_PEMBAYARAN' where id in (select (x->>'id')::uuid from jsonb_array_elements(p_orders) x);
end $$;
revoke all on function laundry_private.attach_laundry_payment(jsonb,text,text) from public,anon,authenticated;
grant execute on function laundry_private.attach_laundry_payment(jsonb,text,text) to service_role;

create or replace function public.parent_use_wadiah_for_payment(p_student_id uuid,p_order_id uuid,p_amount integer)
returns json language plpgsql security definer set search_path='' as $$
declare
 v_parent uuid:=auth.uid(); v_parent_of_student uuid; o public.laundry_orders;
 v_balance integer; v_new_balance integer; v_delta integer; v_tx uuid;
begin
 if v_parent is null then return json_build_object('success',false,'error','Unauthorized: User not authenticated'); end if;
 select parent_id into v_parent_of_student from public.students where id=p_student_id;
 if v_parent_of_student is null then return json_build_object('success',false,'error','Student not found'); end if;
 if v_parent_of_student<>v_parent then return json_build_object('success',false,'error','Unauthorized: Student does not belong to this parent'); end if;
 if p_amount<0 then return json_build_object('success',false,'error','Invalid amount'); end if;
 select * into o from public.laundry_orders where id=p_order_id for update;
 if not found then return json_build_object('success',false,'error','Order not found'); end if;
 if o.student_id<>p_student_id then return json_build_object('success',false,'error','Unauthorized: Order does not belong to this student'); end if;
 if o.status not in ('DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN') then return json_build_object('success',false,'error','Order is not in payable status'); end if;
 if p_amount>o.total_price then return json_build_object('success',false,'error','Amount exceeds order total'); end if;
 if p_amount<coalesce(o.wadiah_used,0) then
   return json_build_object('success',false,'error','Wadiah yang sudah digunakan tidak dapat dikurangi tanpa rekonsiliasi admin');
 end if;
 v_delta:=p_amount-coalesce(o.wadiah_used,0);
 if v_delta=0 then
   return json_build_object('success',true,'transaction_id',null,'amount_used',0,'wadiah_total',coalesce(o.wadiah_used,0),
     'balance_before',null,'balance_after',null,'order_id',o.id,'idempotent',true);
 end if;
 if coalesce(o.midtrans_order_id,'')<>'' or coalesce(o.midtrans_snap_token,'')<>'' then
   return json_build_object('success',false,'error','Pembayaran Midtrans masih terkait. Rekonsiliasi transaksi tersebut sebelum menambah penggunaan Wadiah.');
 end if;
 select balance into v_balance from public.student_wadiah_balance where student_id=p_student_id for update;
 v_balance:=coalesce(v_balance,0);
 if v_balance<v_delta then return json_build_object('success',false,'error',format('Saldo wadiah tidak mencukupi. Saldo: Rp %s, Dibutuhkan tambahan: Rp %s',to_char(v_balance,'FM999,999,999'),to_char(v_delta,'FM999,999,999'))); end if;
 v_new_balance:=v_balance-v_delta;
 insert into public.wadiah_transactions(student_id,transaction_type,amount,balance_before,balance_after,order_id,notes,processed_by,customer_consent)
 values(p_student_id,'payment',v_delta,v_balance,v_new_balance,o.id,'Pembayaran tagihan laundry oleh parent via aplikasi',v_parent,true)
 returning id into v_tx;
 insert into public.student_wadiah_balance(student_id,balance,total_used,last_transaction_at,updated_at)
 values(p_student_id,v_new_balance,v_delta,now(),now())
 on conflict(student_id) do update set balance=v_new_balance,total_used=public.student_wadiah_balance.total_used+v_delta,last_transaction_at=now(),updated_at=now();
 update public.laundry_orders set wadiah_used=p_amount where id=o.id;
 return json_build_object('success',true,'transaction_id',v_tx,'amount_used',v_delta,'wadiah_total',p_amount,
   'balance_before',v_balance,'balance_after',v_new_balance,'order_id',o.id,'idempotent',false);
end $$;
revoke all on function public.parent_use_wadiah_for_payment(uuid,uuid,integer) from public,anon;
grant execute on function public.parent_use_wadiah_for_payment(uuid,uuid,integer) to authenticated;

create or replace function public.parent_pay_order_with_wadiah(p_student_id uuid,p_order_id uuid,p_wadiah_amount integer)
returns json language plpgsql security definer set search_path='' as $$
declare v_result json; o public.laundry_orders; v_remaining integer;
begin
 v_result:=public.parent_use_wadiah_for_payment(p_student_id,p_order_id,p_wadiah_amount);
 if not coalesce((v_result->>'success')::boolean,false) then return v_result; end if;
 select * into o from public.laundry_orders where id=p_order_id for update;
 v_remaining:=o.total_price-coalesce(o.wadiah_used,0);
 if v_remaining<=0 then
   update public.laundry_orders set status='DIBAYAR',payment_method='wadiah',paid_at=now(),paid_amount=0,admin_fee=0 where id=o.id;
   return json_build_object('success',true,'payment_complete',true,'wadiah_used',coalesce(o.wadiah_used,0),'amount_used',coalesce((v_result->>'amount_used')::integer,0),'remaining_amount',0,'order_status','DIBAYAR','message','Pembayaran berhasil dengan saldo wadiah');
 end if;
 return json_build_object('success',true,'payment_complete',false,'wadiah_used',coalesce(o.wadiah_used,0),'amount_used',coalesce((v_result->>'amount_used')::integer,0),'remaining_amount',v_remaining,'order_status',o.status,
   'message',format('Saldo wadiah digunakan. Sisa tagihan: Rp %s',to_char(v_remaining,'FM999,999,999')));
end $$;
revoke all on function public.parent_pay_order_with_wadiah(uuid,uuid,integer) from public,anon;
grant execute on function public.parent_pay_order_with_wadiah(uuid,uuid,integer) to authenticated;

create or replace function laundry_private.reconcile_expired_laundry_payment(p_midtrans_order_id text,p_terminal_status text,p_actor_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare o public.laundry_orders; v_count integer:=0;
begin
 if p_midtrans_order_id is null or p_midtrans_order_id not like 'LAUNDRY-ATTAUHID-%' or p_terminal_status not in ('expire','cancel','deny') then
   raise exception 'Status atau transaksi Midtrans tidak valid.'; end if;
 if p_actor_id is not null and not (public.has_role(p_actor_id,'admin') or public.has_role(p_actor_id,'staff') or public.has_role(p_actor_id,'cashier')) then
   raise exception 'Tidak berwenang merekonsiliasi pembayaran.'; end if;
 for o in select * from public.laundry_orders where midtrans_order_id=p_midtrans_order_id order by id for update loop
   if o.status in ('DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN') then
     update public.laundry_orders set midtrans_order_id=null,midtrans_snap_token=null where id=o.id;
     insert into public.audit_logs(table_name,record_id,action,old_data,new_data,user_id)
     values('laundry_orders',o.id,'UPDATE',jsonb_build_object('midtrans_order_id',o.midtrans_order_id,'midtrans_snap_token',o.midtrans_snap_token,'status',o.status),
       jsonb_build_object('midtrans_order_id',null,'midtrans_snap_token',null,'status',o.status,'gateway_terminal_status',p_terminal_status),p_actor_id);
     v_count:=v_count+1;
   end if;
 end loop;
 return v_count;
end $$;
revoke all on function laundry_private.reconcile_expired_laundry_payment(text,text,uuid) from public,anon,authenticated;
grant execute on function laundry_private.reconcile_expired_laundry_payment(text,text,uuid) to service_role;
create or replace function public.reconcile_expired_laundry_payment(p_midtrans_order_id text,p_terminal_status text,p_actor_id uuid)
returns integer language sql security invoker set search_path='' as $$
 select laundry_private.reconcile_expired_laundry_payment(p_midtrans_order_id,p_terminal_status,p_actor_id)
$$;
revoke all on function public.reconcile_expired_laundry_payment(text,text,uuid) from public,anon,authenticated;
grant execute on function public.reconcile_expired_laundry_payment(text,text,uuid) to service_role;

create or replace function laundry_private.settle_laundry_payment_group(p_midtrans_order_id text,p_payment_method text,p_paid_at timestamptz,p_gross_amount integer)
returns integer language plpgsql security definer set search_path='' as $$
declare o public.laundry_orders; v_expected integer:=0; v_count integer:=0;
begin
 if p_midtrans_order_id is null or p_midtrans_order_id not like 'LAUNDRY-ATTAUHID-%' or coalesce(p_payment_method,'')='' or p_paid_at is null or p_gross_amount<0 then
   raise exception 'Data settlement Midtrans tidak valid.'; end if;
 for o in select * from public.laundry_orders where midtrans_order_id=p_midtrans_order_id and status in ('DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN') order by id for update loop
   v_expected:=v_expected+greatest(o.total_price-coalesce(o.wadiah_used,0),0); v_count:=v_count+1;
 end loop;
 if v_count=0 then return 0; end if;
 if v_expected<>p_gross_amount then raise exception 'Nominal Midtrans tidak cocok dengan sisa tagihan. Diharapkan %, diterima %.',v_expected,p_gross_amount; end if;
 update public.laundry_orders set status='DIBAYAR',payment_method=p_payment_method,paid_at=p_paid_at,
   paid_amount=greatest(total_price-coalesce(wadiah_used,0),0)
 where midtrans_order_id=p_midtrans_order_id and status in ('DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN');
 return v_count;
end $$;
revoke all on function laundry_private.settle_laundry_payment_group(text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function laundry_private.settle_laundry_payment_group(text,text,timestamptz,integer) to service_role;
create or replace function public.settle_laundry_payment_group(p_midtrans_order_id text,p_payment_method text,p_paid_at timestamptz,p_gross_amount integer)
returns integer language sql security invoker set search_path='' as $$
 select laundry_private.settle_laundry_payment_group(p_midtrans_order_id,p_payment_method,p_paid_at,p_gross_amount)
$$;
revoke all on function public.settle_laundry_payment_group(text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.settle_laundry_payment_group(text,text,timestamptz,integer) to service_role;

create or replace function laundry_private.guard_unpaid_revision() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 v_reason text:=nullif(current_setting('laundry.unpaid_correction_reason',true),'');
 v_cancel_reason text:=nullif(current_setting('laundry.unpaid_cancellation_reason',true),'');
 v_refund integer:=coalesce(nullif(current_setting('laundry.unpaid_cancellation_refund',true),'')::integer,0);
 v_economic_change boolean;
begin
 if old.status='DIBATALKAN' then raise exception 'Tagihan yang sudah dibatalkan dikunci dan tidak dapat diubah.'; end if;
 if old.status in ('DIBAYAR','SELESAI') then return new; end if;
 if new.status='DIBATALKAN' then
   if auth.uid() is null or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'cashier')) then raise exception 'Tidak berwenang membatalkan tagihan.'; end if;
   if v_cancel_reason is null or length(btrim(v_cancel_reason)) not between 10 and 2000 then raise exception 'Gunakan menu Batalkan Tagihan dan isi alasan pembatalan.'; end if;
   if v_reason is not null then raise exception 'Koreksi dan pembatalan tidak dapat dilakukan bersamaan.'; end if;
   if old.status not in ('DRAFT','MENUNGGU_APPROVAL_MITRA','DITOLAK_MITRA','DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN') then raise exception 'Hanya tagihan yang belum dibayar yang dapat dibatalkan.'; end if;
   if coalesce(old.midtrans_order_id,'')<>'' or coalesce(old.midtrans_snap_token,'')<>'' then raise exception 'Tautan Midtrans masih terkait. Rekonsiliasi transaksi terlebih dahulu.'; end if;
   if old.paid_at is not null or old.paid_by is not null or coalesce(old.paid_amount,0)<>0 or coalesce(old.change_amount,0)<>0 or coalesce(old.rounding_applied,0)<>0 then
     raise exception 'Ada jejak pembayaran non-Wadiah. Rekonsiliasi melalui admin sebelum pembatalan.'; end if;
   if coalesce(old.wadiah_used,0)>0 then
     if v_refund<>coalesce(old.wadiah_used,0) or coalesce(new.wadiah_used,0)<>0 then raise exception 'Pengembalian Wadiah pembatalan belum lengkap.'; end if;
   elsif exists(select 1 from public.wadiah_transactions t where t.order_id=old.id and t.transaction_type in ('payment','refund','change_deposit','sedekah')) then
     raise exception 'Ada jejak Wadiah yang tidak dapat direkonsiliasi otomatis.';
   end if;
   v_economic_change:=(laundry_private.order_revision_snapshot(new)-'notes'-'status') is distinct from (laundry_private.order_revision_snapshot(old)-'notes'-'status');
   if v_economic_change or new.notes is distinct from old.notes then raise exception 'Pembatalan tidak boleh mengubah rincian tagihan.'; end if;
   return new;
 end if;
 if v_cancel_reason is not null then raise exception 'Pembatalan hanya boleh menghasilkan status DIBATALKAN.'; end if;
 if new.status in ('DIBAYAR','SELESAI') and old.status not in ('DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN') and exists(select 1 from public.unpaid_order_revisions where order_id=old.id) then raise exception 'Tagihan hasil koreksi harus disetujui mitra sebelum dibayar.'; end if;
 v_economic_change:=(laundry_private.order_revision_snapshot(new)-'notes'-'status') is distinct from (laundry_private.order_revision_snapshot(old)-'notes'-'status');
 if not v_economic_change and v_reason is null then return new; end if;
 if auth.uid() is null or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'cashier')) then raise exception 'Tidak berwenang mengoreksi tagihan.'; end if;
 if v_reason is null or length(btrim(v_reason)) not between 10 and 2000 then raise exception 'Gunakan menu Koreksi Tagihan dan isi alasan perubahan.'; end if;
 if old.status not in ('DRAFT','MENUNGGU_APPROVAL_MITRA','DITOLAK_MITRA','DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN') then raise exception 'Status tagihan tidak dapat dikoreksi.'; end if;
 if coalesce(old.midtrans_order_id,'')<>'' or coalesce(old.midtrans_snap_token,'')<>'' then raise exception 'Tautan Midtrans masih terkait. Tunggu pembayaran selesai atau notifikasi kedaluwarsa/pembatalan sebelum koreksi.'; end if;
 if old.paid_at is not null or old.paid_by is not null or coalesce(old.paid_amount,0)<>0 or coalesce(old.wadiah_used,0)<>0 or coalesce(old.change_amount,0)<>0 or coalesce(old.rounding_applied,0)<>0
   or exists(select 1 from public.wadiah_transactions t where t.order_id=old.id and t.transaction_type in ('payment','refund','change_deposit','sedekah')) then raise exception 'Ada jejak pembayaran atau wadiah. Rekonsiliasi melalui admin sebelum koreksi.'; end if;
 if not exists(select 1 from public.students where id=new.student_id and is_active) or not exists(select 1 from public.laundry_partners where id=new.partner_id and is_active) then raise exception 'Pilih siswa dan mitra yang aktif.'; end if;
 if new.laundry_date is null or new.total_price<=0 then raise exception 'Tanggal dan nominal tagihan harus valid.'; end if;
 if not v_economic_change and new.notes is not distinct from old.notes then raise exception 'Tidak ada perubahan rincian tagihan.'; end if;
 new.status:='MENUNGGU_APPROVAL_MITRA'; new.approved_at:=null; new.approved_by:=null; new.rejection_reason:=null; return new;
end $$;
revoke all on function laundry_private.guard_unpaid_revision() from public,anon,authenticated;

create or replace function laundry_private.record_unpaid_revision() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_reason text:=coalesce(nullif(current_setting('laundry.unpaid_correction_reason',true),''),nullif(current_setting('laundry.unpaid_cancellation_reason',true),''));
 v_refund integer:=coalesce(nullif(current_setting('laundry.unpaid_cancellation_refund',true),'')::integer,0);
begin
 if v_reason is null or old.status in ('DIBAYAR','SELESAI','DIBATALKAN') then return new; end if;
 insert into public.unpaid_order_revisions(order_id,old_student_id,new_student_id,old_partner_id,new_partner_id,reason,before_snapshot,after_snapshot,corrected_by)
 values(old.id,old.student_id,new.student_id,old.partner_id,new.partner_id,btrim(v_reason),laundry_private.order_revision_snapshot(old),laundry_private.order_revision_snapshot(new),auth.uid()) returning id into v_id;
 insert into public.audit_logs(table_name,record_id,action,old_data,new_data,user_id)
 values('unpaid_order_revisions',v_id,'INSERT',laundry_private.order_revision_snapshot(old),
   jsonb_build_object('order',laundry_private.order_revision_snapshot(new),'reason',btrim(v_reason),'wadiah_refund',v_refund),auth.uid());
 perform set_config('laundry.unpaid_revision_id',v_id::text,true); return new;
end $$;
revoke all on function laundry_private.record_unpaid_revision() from public,anon,authenticated;

create or replace function laundry_private.cancel_unpaid_order(p_order_id uuid,p_expected_updated_at timestamptz,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare o public.laundry_orders; v_id uuid; v_payment integer:=0; v_refund integer:=0; v_other integer:=0; v_tx public.wadiah_transactions;
begin
 if auth.uid() is null or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'staff') or public.has_role(auth.uid(),'cashier')) then raise exception 'Tidak berwenang membatalkan tagihan.'; end if;
 select * into o from public.laundry_orders where id=p_order_id for update;
 if not found or o.status not in ('DRAFT','MENUNGGU_APPROVAL_MITRA','DITOLAK_MITRA','DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN') then raise exception 'Pembatalan hanya untuk tagihan yang belum dibayar.'; end if;
 if p_expected_updated_at is null or o.updated_at is distinct from p_expected_updated_at then raise exception 'Tagihan berubah sejak dibuka. Muat ulang sebelum pembatalan.'; end if;
 if p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then raise exception 'Alasan pembatalan harus 10 sampai 2000 karakter.'; end if;
 if coalesce(o.midtrans_order_id,'')<>'' or coalesce(o.midtrans_snap_token,'')<>'' then raise exception 'Tautan Midtrans masih terkait. Rekonsiliasi transaksi terlebih dahulu.'; end if;
 if o.paid_at is not null or o.paid_by is not null or coalesce(o.paid_amount,0)<>0 or coalesce(o.change_amount,0)<>0 or coalesce(o.rounding_applied,0)<>0 then raise exception 'Ada jejak pembayaran non-Wadiah. Rekonsiliasi melalui admin sebelum pembatalan.'; end if;
 select coalesce(sum(case when transaction_type='payment' then amount else 0 end),0),
        coalesce(sum(case when transaction_type='refund' then amount else 0 end),0),
        count(*) filter(where transaction_type in ('change_deposit','sedekah'))
 into v_payment,v_refund,v_other from public.wadiah_transactions where order_id=o.id;
 if coalesce(o.wadiah_used,0)>0 then
   if v_other>0 or v_payment-v_refund<>o.wadiah_used then raise exception 'Jejak Wadiah tidak cocok dengan tagihan. Rekonsiliasi manual diperlukan.'; end if;
   select * into v_tx from public.process_wadiah_transaction(o.student_id,'refund',o.wadiah_used,o.id,
     'Pengembalian Wadiah karena pembatalan tagihan: '||btrim(p_reason),auth.uid(),true,null,null);
   perform set_config('laundry.unpaid_cancellation_refund',o.wadiah_used::text,true);
 elsif v_payment<>0 or v_refund<>0 or v_other<>0 then
   raise exception 'Ada jejak Wadiah yang tidak dapat direkonsiliasi otomatis.';
 else perform set_config('laundry.unpaid_cancellation_refund','0',true);
 end if;
 perform set_config('laundry.unpaid_cancellation_reason',btrim(p_reason),true);
 perform set_config('laundry.unpaid_revision_id','',true);
 update public.laundry_orders set status='DIBATALKAN',wadiah_used=0 where id=o.id;
 v_id:=nullif(current_setting('laundry.unpaid_revision_id',true),'')::uuid;
 if v_id is null then raise exception 'Riwayat pembatalan gagal dicatat.'; end if;
 perform set_config('laundry.unpaid_cancellation_reason','',true); perform set_config('laundry.unpaid_cancellation_refund','',true); perform set_config('laundry.unpaid_revision_id','',true);
 return v_id;
end $$;
revoke all on function laundry_private.cancel_unpaid_order(uuid,timestamptz,text) from public,anon;
grant execute on function laundry_private.cancel_unpaid_order(uuid,timestamptz,text) to authenticated;

notify pgrst,'reload schema';
