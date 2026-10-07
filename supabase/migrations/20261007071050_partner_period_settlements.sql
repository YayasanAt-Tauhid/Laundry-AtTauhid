-- Laundry-service periods, with explicit verification of manual historical payouts.
-- No customer payments, wadiah balances, or existing payout records are changed.
alter table public.partner_settlements add column period_start date;
alter table public.partner_settlements add constraint partner_settlement_period_check
  check (period_start is null or period_start <= cutoff_date);
alter table public.partner_settlement_lines drop constraint partner_settlement_lines_source_type_check;
alter table public.partner_settlement_lines add constraint partner_settlement_lines_source_type_check
  check (source_type in ('order','correction','revision','revision_credit'));

create table public.partner_adjustment_verifications (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.laundry_partners(id),
  source_type text not null check(source_type in ('correction','revision','revision_credit')),
  source_id uuid not null,
  previously_paid boolean not null,
  verified_amount integer not null,
  reference text not null check(length(btrim(reference)) between 5 and 500),
  verified_by uuid not null references auth.users(id),
  verified_at timestamptz not null default now(),
  unique(source_type,source_id)
);
alter table public.partner_adjustment_verifications enable row level security;
revoke all on public.partner_adjustment_verifications from public,anon,authenticated;
grant select on public.partner_adjustment_verifications to authenticated;
create policy partner_adjustment_verification_read on public.partner_adjustment_verifications
for select to authenticated using (
  public.has_role((select auth.uid()),'admin') or public.has_role((select auth.uid()),'cashier')
  or exists(select 1 from public.laundry_partners p where p.id=partner_id and p.user_id=(select auth.uid()))
);

create function laundry_private.partner_period_candidates(p_partner_id uuid,p_start date,p_end date)
returns table(source_type text,source_id uuid,amount integer,event_at timestamptz,
  source_snapshot jsonb,historical boolean,decision text)
language sql security definer set search_path='' as $$
with base as (
  select 'order'::text source_type,o.id source_id,o.vendor_share amount,o.created_at event_at,
    jsonb_build_object('order_id',o.id,'student_name',s.name,'laundry_date',o.laundry_date,
      'total_price',o.total_price,'vendor_share',o.vendor_share,'status',o.status) source_snapshot,
    false historical,'included'::text decision
  from public.laundry_orders o join public.students s on s.id=o.student_id
  join public.partner_settlement_accounts a on a.partner_id=o.partner_id
  where o.partner_id=p_partner_id and o.laundry_date between greatest(p_start,a.start_date) and p_end
    and o.status not in ('DITOLAK_MITRA','DIBATALKAN') and o.vendor_share>0
    and not exists(select 1 from public.partner_settlement_lines l where l.source_type='order' and l.source_id=o.id)
), adjustments as (
  select 'correction'::text source_type,c.id source_id,c.order_id,c.vendor_delta amount,
    case when c.vendor_delta<0 then c.reviewed_at else c.settled_at end event_at,o.laundry_date service_date,
    jsonb_build_object('order_id',o.id,'student_name',s.name,'laundry_date',o.laundry_date,
      'reason',c.reason,'kind',c.kind,'vendor_delta',c.vendor_delta) source_snapshot,
    (o.laundry_date < p_start or exists(select 1 from public.partner_settlement_lines l
      where l.source_type='order' and l.source_id=o.id)) historical
  from public.order_corrections c join public.laundry_orders o on o.id=c.order_id
  join public.students s on s.id=c.student_id
  where o.partner_id=p_partner_id and c.status='approved' and c.vendor_delta<>0
    and c.reviewed_at<=now() and o.laundry_date<=p_end
    and (c.vendor_delta<0 or (c.settlement_status='settled' and c.settled_at<=now()))
  union all
  select x.source_type,r.id,r.order_id,x.amount,r.corrected_at,
    (case when x.source_type='revision_credit' then r.after_snapshot->>'laundry_date'
      else r.before_snapshot->>'laundry_date' end)::date,
    jsonb_build_object('order_id',r.order_id,'student_name',s.name,
      'laundry_date',r.before_snapshot->>'laundry_date','reason',r.reason,'kind','revisi tagihan belum dibayar siswa',
      'vendor_delta',x.amount),true
  from public.unpaid_order_revisions r join public.students s on s.id=r.old_student_id
  cross join lateral (
    select 'revision'::text source_type,
      (case when r.after_snapshot->>'status' in ('DIBATALKAN','DITOLAK_MITRA') or r.new_partner_id<>r.old_partner_id
        then 0 else (r.after_snapshot->>'vendor_share')::int end
        - (r.before_snapshot->>'vendor_share')::int)::int amount
    where r.old_partner_id=p_partner_id
    union all
    select 'revision_credit'::text,(r.after_snapshot->>'vendor_share')::int
    where r.new_partner_id=p_partner_id and r.old_partner_id<>r.new_partner_id
      and r.after_snapshot->>'status' not in ('DIBATALKAN','DITOLAK_MITRA')
  ) x
  where x.amount<>0 and r.corrected_at<=now()
    and (x.source_type<>'revision_credit' or (r.after_snapshot->>'laundry_date')::date<=p_end)
    and ((r.before_snapshot->>'laundry_date')::date < p_start or exists(
      select 1 from public.partner_settlement_lines l where l.source_type='order'
      and l.source_id=r.order_id and l.created_at<r.corrected_at))
    -- Revisions made before an order's recorded payout are already reflected in that payout.
    and not exists(select 1 from public.partner_settlement_lines l where l.source_type='order'
      and l.source_id=r.order_id and l.partner_id=p_partner_id and l.created_at>=r.corrected_at)
), resolved as (
  select x.source_type,x.source_id,x.amount,x.event_at,x.source_snapshot,x.historical,
    case when not x.historical then 'included'
      when exists(select 1 from public.partner_settlement_lines l where l.source_type='order'
        and l.source_id=x.order_id and (l.partner_id=p_partner_id or x.source_type='revision_credit')) then 'paid_in_ledger'
      when x.source_type='revision_credit' and exists(select 1 from public.partner_adjustment_verifications old_v
        where old_v.source_type='revision' and old_v.source_id=x.source_id and old_v.previously_paid) then 'paid_manually'
      when v.previously_paid then 'paid_manually'
      when v.previously_paid=false then 'not_paid'
      when x.service_date >= (select a.start_date from public.partner_settlement_accounts a where a.partner_id=p_partner_id) then 'not_paid'
      else 'unverified' end decision
  from adjustments x left join public.partner_adjustment_verifications v
    on v.source_type=x.source_type and v.source_id=x.source_id and v.partner_id=p_partner_id
    and v.verified_amount=x.amount
  where not exists(select 1 from public.partner_settlement_lines l
    where l.source_type=x.source_type and l.source_id=x.source_id)
    and (x.historical or exists(select 1 from base b where b.source_id=x.order_id))
    and (x.source_type<>'revision_credit' or not exists(select 1 from base b where b.source_id=x.order_id))
)
select * from base union all select * from resolved
$$;
revoke all on function laundry_private.partner_period_candidates(uuid,date,date) from public,anon,authenticated;

create function laundry_private.preview_partner_period(p_partner_id uuid,p_start date,p_end date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_start date; v_rows jsonb; v_orders bigint; v_adjustments bigint; v_pending integer;
begin
  if auth.uid() is null or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'cashier')
    or exists(select 1 from public.laundry_partners p where p.id=p_partner_id and p.user_id=auth.uid())) then
    raise exception 'Tidak berwenang melihat pembayaran mitra.';
  end if;
  if p_start is null or p_end is null or p_start>p_end or p_end>(now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Periode laundry tidak valid.';
  end if;
  select a.start_date into v_start from public.partner_settlement_accounts a where a.partner_id=p_partner_id;
  if v_start is null then return jsonb_build_object('active',false); end if;
  if p_start<v_start then raise exception 'Awal periode sebelum batas ledger. Periksa tanggal aktivasi mitra.'; end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.source_type,c.source_id),'[]'::jsonb),
    coalesce(sum(c.amount) filter(where c.source_type='order'),0),
    coalesce(sum(c.amount) filter(where c.source_type<>'order' and c.decision not in ('unverified','not_paid')),0),
    count(*) filter(where c.decision='unverified')
  into v_rows,v_orders,v_adjustments,v_pending
  from laundry_private.partner_period_candidates(p_partner_id,p_start,p_end) c;
  return jsonb_build_object('active',true,'start_date',v_start,'period_start',p_start,'period_end',p_end,
    'order_share_total',v_orders,'correction_adjustment',v_adjustments,'net_amount',v_orders+v_adjustments,
    'unverified_count',v_pending,'lines',v_rows,
    'token',md5(p_partner_id::text||p_start::text||p_end::text||v_rows::text));
end $$;

create function laundry_private.verify_partner_adjustment(p_partner_id uuid,p_start date,p_end date,
  p_source_type text,p_source_id uuid,p_previously_paid boolean,p_reference text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r record; v_id uuid;
begin
  if auth.uid() is null or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'cashier')) then
    raise exception 'Hanya admin atau kasir dapat memverifikasi pembayaran lama.';
  end if;
  perform 1 from public.partner_settlement_accounts where partner_id=p_partner_id for update;
  perform laundry_private.preview_partner_period(p_partner_id,p_start,p_end);
  if p_previously_paid is null or p_reference is null or length(btrim(p_reference)) not between 5 and 500 then
    raise exception 'Isi dasar verifikasi pembayaran lama minimal 5 karakter.';
  end if;
  select * into r from laundry_private.partner_period_candidates(p_partner_id,p_start,p_end) c
    where c.source_type=p_source_type and c.source_id=p_source_id and c.decision='unverified';
  if not found then raise exception 'Penyesuaian sudah diverifikasi atau tidak tersedia. Muat ulang laporan.'; end if;
  insert into public.partner_adjustment_verifications(partner_id,source_type,source_id,
    previously_paid,verified_amount,reference,verified_by)
  values(p_partner_id,p_source_type,p_source_id,p_previously_paid,r.amount,btrim(p_reference),auth.uid()) returning id into v_id;
  insert into public.audit_logs(table_name,record_id,action,new_data,user_id)
  values('partner_adjustment_verifications',v_id,'INSERT',jsonb_build_object(
    'partner_id',p_partner_id,'source_type',p_source_type,'source_id',p_source_id,
    'previously_paid',p_previously_paid,'amount',r.amount,'reference',btrim(p_reference)),auth.uid());
  return v_id;
end $$;

create function laundry_private.record_partner_period(p_partner_id uuid,p_start date,p_end date,
  p_expected_token text,p_method text,p_reference text,p_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_preview jsonb; v_id uuid:=gen_random_uuid(); r record;
  v_orders integer; v_adjustments integer; v_order_count integer; v_adjustment_count integer;
begin
  if auth.uid() is null or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'cashier')) then
    raise exception 'Hanya admin atau kasir dapat mencatat pembayaran mitra.';
  end if;
  perform 1 from public.partner_settlement_accounts where partner_id=p_partner_id for update;
  -- Freeze the source orders/corrections while validating the reviewed preview.
  perform 1 from public.laundry_orders o where o.partner_id=p_partner_id for update;
  perform 1 from public.order_corrections c join public.laundry_orders o on o.id=c.order_id
    where o.partner_id=p_partner_id for share of c;
  v_preview:=laundry_private.preview_partner_period(p_partner_id,p_start,p_end);
  if not coalesce((v_preview->>'active')::boolean,false) then raise exception 'Settlement mitra belum diaktifkan.'; end if;
  if p_expected_token is distinct from v_preview->>'token' then
    raise exception 'Data pembayaran berubah. Muat ulang dan periksa jumlah bersih terbaru.';
  end if;
  if (v_preview->>'unverified_count')::int>0 then raise exception 'Verifikasi pembayaran mitra lama terlebih dahulu.'; end if;
  if (v_preview->>'net_amount')::bigint<=0 then raise exception 'Saldo bersih belum positif; penyesuaian dibawa ke pembayaran berikutnya.'; end if;
  if p_method is null or p_method not in ('cash','bank_transfer','other') or p_reference is null
    or length(btrim(p_reference)) not between 5 and 500
    or (p_note is not null and length(btrim(p_note)) not between 1 and 2000) then
    raise exception 'Metode atau referensi pembayaran tidak valid.';
  end if;
  v_orders:=(v_preview->>'order_share_total')::int;
  v_adjustments:=(v_preview->>'correction_adjustment')::int;
  select count(*) filter(where x->>'source_type'='order'),count(*) filter(where x->>'source_type'<>'order')
    into v_order_count,v_adjustment_count from jsonb_array_elements(v_preview->'lines') x
    where x->>'decision' not in ('unverified','not_paid');
  insert into public.partner_settlements(id,partner_id,period_start,cutoff_date,order_share_total,
    correction_adjustment,order_count,correction_count,payment_method,payment_reference,note,paid_by)
  values(v_id,p_partner_id,p_start,p_end,v_orders,v_adjustments,v_order_count,v_adjustment_count,
    p_method,btrim(p_reference),nullif(btrim(coalesce(p_note,'')),''),auth.uid());
  for r in select * from jsonb_to_recordset(v_preview->'lines') as x(
    source_type text,source_id uuid,amount integer,event_at timestamptz,source_snapshot jsonb,decision text)
    where x.decision not in ('unverified','not_paid')
  loop
    insert into public.partner_settlement_lines(settlement_id,partner_id,source_type,source_id,amount,event_at,source_snapshot)
    values(v_id,p_partner_id,r.source_type,r.source_id,r.amount,r.event_at,r.source_snapshot);
  end loop;
  insert into public.audit_logs(table_name,record_id,action,new_data,user_id)
  values('partner_settlements',v_id,'INSERT',v_preview||jsonb_build_object('payment_reference',btrim(p_reference)),auth.uid());
  return v_id;
end $$;

create function public.preview_partner_period(p_partner_id uuid,p_start date,p_end date)
returns jsonb language sql set search_path='' as $$select laundry_private.preview_partner_period(p_partner_id,p_start,p_end)$$;
create function public.verify_partner_adjustment(p_partner_id uuid,p_start date,p_end date,p_source_type text,
  p_source_id uuid,p_previously_paid boolean,p_reference text)
returns uuid language sql set search_path='' as $$select laundry_private.verify_partner_adjustment(
  p_partner_id,p_start,p_end,p_source_type,p_source_id,p_previously_paid,p_reference)$$;
create function public.record_partner_period(p_partner_id uuid,p_start date,p_end date,p_expected_token text,
  p_method text,p_reference text,p_note text default null)
returns uuid language sql set search_path='' as $$select laundry_private.record_partner_period(
  p_partner_id,p_start,p_end,p_expected_token,p_method,p_reference,p_note)$$;

revoke all on function laundry_private.preview_partner_period(uuid,date,date) from public,anon;
revoke all on function laundry_private.verify_partner_adjustment(uuid,date,date,text,uuid,boolean,text) from public,anon;
revoke all on function laundry_private.record_partner_period(uuid,date,date,text,text,text,text) from public,anon;
revoke all on function public.preview_partner_period(uuid,date,date) from public,anon;
revoke all on function public.verify_partner_adjustment(uuid,date,date,text,uuid,boolean,text) from public,anon;
revoke all on function public.record_partner_period(uuid,date,date,text,text,text,text) from public,anon;
grant execute on function laundry_private.preview_partner_period(uuid,date,date) to authenticated;
grant execute on function laundry_private.verify_partner_adjustment(uuid,date,date,text,uuid,boolean,text) to authenticated;
grant execute on function laundry_private.record_partner_period(uuid,date,date,text,text,text,text) to authenticated;
grant execute on function public.preview_partner_period(uuid,date,date) to authenticated;
grant execute on function public.verify_partner_adjustment(uuid,date,date,text,uuid,boolean,text) to authenticated;
grant execute on function public.record_partner_period(uuid,date,date,text,text,text,text) to authenticated;

-- Old browser tabs must not record a paid_at-based payout after the transition.
create or replace function public.record_partner_settlement(p_partner_id uuid,p_cutoff_date date,
 p_method text,p_reference text,p_note text default null)
returns uuid language plpgsql set search_path='' as $$begin
 raise exception 'Gunakan pembayaran mitra berdasarkan periode laundry. Muat ulang aplikasi.';
end$$;
revoke all on function laundry_private.record_partner_settlement(uuid,date,text,text,text) from authenticated;
