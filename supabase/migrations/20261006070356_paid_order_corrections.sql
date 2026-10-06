-- Additive correction ledger. No historical orders or payments are rewritten.
create schema if not exists laundry_private;
revoke all on schema laundry_private from public, anon;
grant usage on schema laundry_private to authenticated;

create table public.order_corrections (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.laundry_orders(id),
  student_id uuid not null references public.students(id),
  kind text not null check (kind in ('price', 'cancel', 'wrong_student')),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  original_snapshot jsonb not null,
  original_total integer not null check (original_total > 0),
  corrected_total integer not null check (corrected_total >= 0),
  delta integer generated always as (corrected_total - original_total) stored,
  yayasan_delta integer not null,
  vendor_delta integer not null,
  replacement_student_id uuid references public.students(id),
  replacement_order_id uuid references public.laundry_orders(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  verification_reference text,
  recipient_reference text,
  settlement_due integer check (settlement_due >= 0),
  settlement_status text not null default 'not_ready' check (settlement_status in ('not_ready', 'pending', 'settled')),
  settlement_method text check (settlement_method in ('cash', 'bank_transfer', 'wadiah', 'midtrans_manual', 'no_due')),
  settlement_reference text,
  customer_consent boolean not null default false,
  settled_by uuid references auth.users(id),
  settled_at timestamptz,
  wadiah_transaction_id uuid references public.wadiah_transactions(id),
  check (corrected_total <> original_total),
  check (yayasan_delta + vendor_delta = corrected_total - original_total),
  check ((kind = 'price' and corrected_total > 0 and replacement_student_id is null)
    or (kind = 'cancel' and corrected_total = 0 and replacement_student_id is null)
    or (kind = 'wrong_student' and corrected_total = 0 and replacement_student_id is not null and replacement_student_id <> student_id))
);
create unique index order_corrections_one_active on public.order_corrections(order_id) where status <> 'rejected';
create index order_corrections_student on public.order_corrections(student_id, requested_at desc);
create index order_corrections_review on public.order_corrections(status, reviewed_at);
alter table public.order_corrections enable row level security;
revoke all on public.order_corrections from public, anon, authenticated;
grant select on public.order_corrections to authenticated;
create policy correction_read on public.order_corrections for select to authenticated using (
  public.has_role((select auth.uid()), 'admin') or public.has_role((select auth.uid()), 'staff')
  or public.has_role((select auth.uid()), 'cashier')
  or exists (select 1 from public.students s where s.id = student_id and s.parent_id = (select auth.uid()))
  or exists (select 1 from public.laundry_orders o join public.laundry_partners p on p.id = o.partner_id
    where o.id = order_id and p.user_id = (select auth.uid()))
);

-- Trigger functions are private, not callable through the Data API.
create function laundry_private.audit_correction() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(table_name, record_id, action, old_data, new_data, user_id)
  values ('order_corrections', new.id, tg_op,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new), auth.uid());
  return new;
end $$;
revoke all on function laundry_private.audit_correction() from public, anon, authenticated;
create trigger audit_order_corrections after insert or update on public.order_corrections
for each row execute function laundry_private.audit_correction();

create function laundry_private.guard_paid_order() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status in ('DIBAYAR', 'SELESAI') then
    if tg_op = 'DELETE' then raise exception 'Tagihan lunas harus dikoreksi, bukan dihapus.'; end if;
    if new.status not in ('DIBAYAR', 'SELESAI') or
      row(new.student_id,new.partner_id,new.category,new.weight_kg,new.item_count,new.price_per_unit,
        new.total_price,new.yayasan_share,new.vendor_share,new.laundry_date)
      is distinct from row(old.student_id,old.partner_id,old.category,old.weight_kg,old.item_count,old.price_per_unit,
        old.total_price,old.yayasan_share,old.vendor_share,old.laundry_date) then
      raise exception 'Data tagihan lunas dikunci. Gunakan pengajuan koreksi.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function laundry_private.guard_paid_order() from public, anon, authenticated;
-- Runs after the existing price validation trigger (alphabetical order).
create trigger zz_guard_paid_order before update or delete on public.laundry_orders
for each row execute function laundry_private.guard_paid_order();

create function laundry_private.request_order_correction(p_order_id uuid, p_kind text, p_corrected_total integer,
  p_reason text, p_replacement_student_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o public.laundry_orders; v_id uuid; v_yayasan integer; v_snapshot jsonb;
begin
  if auth.uid() is null or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'staff')
    or public.has_role(auth.uid(),'cashier')) then raise exception 'Tidak berwenang mengajukan koreksi.'; end if;
  select * into o from public.laundry_orders where id = p_order_id for update;
  if not found or o.status not in ('DIBAYAR','SELESAI') or o.total_price <= 0 then
    raise exception 'Koreksi hanya untuk tagihan yang sudah dibayar.';
  end if;
  if exists(select 1 from public.order_corrections where order_id=o.id and status <> 'rejected') then
    raise exception 'Tagihan ini sudah memiliki pengajuan atau koreksi yang disetujui.';
  end if;
  if p_kind is null or p_kind not in ('price','cancel','wrong_student') or p_corrected_total is null
    or p_corrected_total < 0 or p_corrected_total = o.total_price
    or p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then
    raise exception 'Jenis, nominal, atau alasan koreksi tidak valid.';
  end if;
  if p_kind <> 'price' and p_corrected_total <> 0 then raise exception 'Pembatalan harus bernilai nol.'; end if;
  if p_kind = 'wrong_student' and (p_replacement_student_id is null or p_replacement_student_id = o.student_id
    or not exists(select 1 from public.students where id=p_replacement_student_id and is_active)) then
    raise exception 'Pilih siswa pengganti yang aktif dan berbeda.';
  end if;
  -- Preserve the historical split; never apply today's tariff to the correction.
  v_yayasan := round(p_corrected_total::numeric * o.yayasan_share / o.total_price);
  v_snapshot := jsonb_build_object('student_id',o.student_id,'partner_id',o.partner_id,'category',o.category,
    'weight_kg',o.weight_kg,'item_count',o.item_count,'price_per_unit',o.price_per_unit,'total_price',o.total_price,
    'yayasan_share',o.yayasan_share,'vendor_share',o.vendor_share,'laundry_date',o.laundry_date,
    'paid_at',o.paid_at,'payment_method',o.payment_method,'paid_amount',o.paid_amount,'admin_fee',o.admin_fee,
    'change_amount',o.change_amount,'wadiah_used',o.wadiah_used,'rounding_applied',o.rounding_applied,
    'midtrans_order_id',o.midtrans_order_id);
  insert into public.order_corrections(order_id,student_id,kind,reason,original_snapshot,original_total,
    corrected_total,yayasan_delta,vendor_delta,replacement_student_id,requested_by)
  values(o.id,o.student_id,p_kind,btrim(p_reason),v_snapshot,o.total_price,p_corrected_total,
    v_yayasan-o.yayasan_share,p_corrected_total-v_yayasan-o.vendor_share,p_replacement_student_id,auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function laundry_private.review_order_correction(p_correction_id uuid, p_approve boolean,
  p_review_note text, p_verification_reference text default null, p_refund_amount integer default null,
  p_recipient_reference text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.order_corrections; o public.laundry_orders; v_due integer; v_replacement uuid;
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'admin') then raise exception 'Hanya admin dapat meninjau koreksi.'; end if;
  -- Lock the order first, matching request lock order, then the correction.
  select * into c from public.order_corrections where id=p_correction_id;
  if not found then raise exception 'Koreksi tidak ditemukan.'; end if;
  select * into o from public.laundry_orders where id=c.order_id for update;
  select * into c from public.order_corrections where id=p_correction_id for update;
  if c.status <> 'pending' then raise exception 'Pengajuan sudah ditinjau.'; end if;
  if p_approve is null or p_review_note is null or length(btrim(p_review_note)) < 10 then
    raise exception 'Catatan tinjauan minimal 10 karakter.';
  end if;
  if not p_approve then
    update public.order_corrections set status='rejected', reviewed_by=auth.uid(),reviewed_at=now(),review_note=btrim(p_review_note)
    where id=c.id;
    return c.id;
  end if;
  if o.status not in ('DIBAYAR','SELESAI') or o.total_price <> c.original_total
    or o.student_id <> c.student_id or o.yayasan_share <> (c.original_snapshot->>'yayasan_share')::integer
    or o.vendor_share <> (c.original_snapshot->>'vendor_share')::integer then
    raise exception 'Tagihan berubah. Tolak dan ajukan ulang setelah verifikasi.';
  end if;
  if p_verification_reference is null or length(btrim(p_verification_reference)) < 5 then
    raise exception 'Referensi verifikasi kuitansi/pembayaran wajib diisi.';
  end if;
  if c.delta < 0 then
    -- Cashier bulk receipts store cash/wadiah on one line only. Admin must verify the
    -- actual refundable service amount against the whole receipt, excluding fees,
    -- rounding discounts and change already returned. Do not infer it from paid_amount.
    if p_refund_amount is null or p_refund_amount < 0 or p_refund_amount > -c.delta
      or p_recipient_reference is null or length(btrim(p_recipient_reference)) < 5 then
      raise exception 'Verifikasi jumlah pengembalian dan penerimanya (maksimal selisih tagihan).';
    end if;
    v_due := p_refund_amount;
  else v_due := c.delta;
  end if;
  if c.kind = 'wrong_student' then
    if not exists(select 1 from public.students where id=c.replacement_student_id and is_active) then
      raise exception 'Siswa pengganti sudah tidak aktif.';
    end if;
    -- Refund the original payer separately. The replacement bill is unpaid and
    -- follows ordinary partner approval and current server-side tariff validation.
    insert into public.laundry_orders(student_id,partner_id,staff_id,category,weight_kg,item_count,price_per_unit,
      total_price,yayasan_share,vendor_share,status,laundry_date,notes)
    values(c.replacement_student_id,o.partner_id,auth.uid(),o.category,o.weight_kg,o.item_count,o.price_per_unit,
      o.total_price,o.yayasan_share,o.vendor_share,'MENUNGGU_APPROVAL_MITRA',o.laundry_date,
      'Pengganti koreksi '||c.id||' dari order '||o.id||'. Pembayaran lama tidak dipindahkan.')
    returning id into v_replacement;
  end if;
  update public.order_corrections set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),
    review_note=btrim(p_review_note),verification_reference=btrim(p_verification_reference),
    recipient_reference=btrim(p_recipient_reference),settlement_due=v_due,replacement_order_id=v_replacement,
    settlement_status=case when v_due=0 then 'settled' else 'pending' end,
    settlement_method=case when v_due=0 then 'no_due' else null end,
    settled_by=case when v_due=0 then auth.uid() else null end,settled_at=case when v_due=0 then now() else null end
  where id=c.id;
  return c.id;
end $$;

create function laundry_private.settle_order_correction(p_correction_id uuid, p_method text,
  p_reference text, p_customer_consent boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.order_corrections; v_tx public.wadiah_transactions;
begin
  if auth.uid() is null or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'cashier')) then
    raise exception 'Hanya admin atau kasir dapat menyelesaikan selisih.';
  end if;
  select * into c from public.order_corrections where id=p_correction_id for update;
  if not found or c.status <> 'approved' or c.settlement_status <> 'pending' or c.settlement_due <= 0 then
    raise exception 'Selisih belum siap atau sudah diselesaikan.';
  end if;
  if p_method is null or p_method not in ('cash','bank_transfer','wadiah','midtrans_manual')
    or (c.delta > 0 and p_method='midtrans_manual') or p_reference is null or length(btrim(p_reference)) < 5 then
    raise exception 'Metode dan referensi bukti penyelesaian wajib valid.';
  end if;
  if p_method='wadiah' then
    if p_customer_consent is distinct from true then raise exception 'Persetujuan pelanggan wajib untuk wadiah.'; end if;
    v_tx := public.process_wadiah_transaction(c.student_id,
      case when c.delta < 0 then 'refund'::public.wadiah_transaction_type else 'payment'::public.wadiah_transaction_type end,
      c.settlement_due,c.order_id,'Koreksi '||c.id||': '||btrim(p_reference),auth.uid(),true);
  end if;
  update public.order_corrections set settlement_status='settled',settlement_method=p_method,
    settlement_reference=btrim(p_reference),customer_consent=coalesce(p_customer_consent,false),
    settled_by=auth.uid(),settled_at=now(),wadiah_transaction_id=v_tx.id where id=c.id;
  return c.id;
end $$;

-- Public API wrappers are invokers; privileged bodies live in an unexposed schema,
-- enforce auth.uid()/trusted user_roles and are not granted to anon/PUBLIC.
revoke all on function laundry_private.request_order_correction(uuid,text,integer,text,uuid) from public,anon;
revoke all on function laundry_private.review_order_correction(uuid,boolean,text,text,integer,text) from public,anon;
revoke all on function laundry_private.settle_order_correction(uuid,text,text,boolean) from public,anon;
grant execute on function laundry_private.request_order_correction(uuid,text,integer,text,uuid) to authenticated;
grant execute on function laundry_private.review_order_correction(uuid,boolean,text,text,integer,text) to authenticated;
grant execute on function laundry_private.settle_order_correction(uuid,text,text,boolean) to authenticated;
create function public.request_order_correction(p_order_id uuid,p_kind text,p_corrected_total integer,p_reason text,
  p_replacement_student_id uuid default null) returns uuid language sql security invoker set search_path='' as $$
  select laundry_private.request_order_correction(p_order_id,p_kind,p_corrected_total,p_reason,p_replacement_student_id) $$;
create function public.review_order_correction(p_correction_id uuid,p_approve boolean,p_review_note text,
  p_verification_reference text default null,p_refund_amount integer default null,p_recipient_reference text default null)
returns uuid language sql security invoker set search_path='' as $$
  select laundry_private.review_order_correction(p_correction_id,p_approve,p_review_note,p_verification_reference,p_refund_amount,p_recipient_reference) $$;
create function public.settle_order_correction(p_correction_id uuid,p_method text,p_reference text,p_customer_consent boolean default false)
returns uuid language sql security invoker set search_path='' as $$
  select laundry_private.settle_order_correction(p_correction_id,p_method,p_reference,p_customer_consent) $$;
revoke all on function public.request_order_correction(uuid,text,integer,text,uuid) from public,anon;
revoke all on function public.review_order_correction(uuid,boolean,text,text,integer,text) from public,anon;
revoke all on function public.settle_order_correction(uuid,text,text,boolean) from public,anon;
grant execute on function public.request_order_correction(uuid,text,integer,text,uuid) to authenticated;
grant execute on function public.review_order_correction(uuid,boolean,text,text,integer,text) to authenticated;
grant execute on function public.settle_order_correction(uuid,text,text,boolean) to authenticated;
notify pgrst, 'reload schema';
