-- Audited partner settlement ledger.
-- Historical partner payments remain outside the system until an admin activates
-- each partner with the first date that should be counted by this ledger.

create schema if not exists laundry_private;
revoke all on schema laundry_private from public, anon;
grant usage on schema laundry_private to authenticated;

create table public.partner_settlement_accounts (
  partner_id uuid primary key references public.laundry_partners(id) on delete restrict,
  start_date date not null,
  activation_note text not null check (length(btrim(activation_note)) between 10 and 2000),
  activated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.partner_settlements (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.laundry_partners(id) on delete restrict,
  cutoff_date date not null,
  order_share_total integer not null default 0 check (order_share_total >= 0),
  correction_adjustment integer not null default 0,
  net_amount integer generated always as (order_share_total + correction_adjustment) stored,
  order_count integer not null default 0 check (order_count >= 0),
  correction_count integer not null default 0 check (correction_count >= 0),
  payment_method text not null check (payment_method in ('cash','bank_transfer','other')),
  payment_reference text not null check (length(btrim(payment_reference)) between 5 and 500),
  note text check (note is null or length(btrim(note)) between 1 and 2000),
  paid_by uuid not null references auth.users(id),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (net_amount > 0)
);

create table public.partner_settlement_lines (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.partner_settlements(id) on delete restrict,
  partner_id uuid not null references public.laundry_partners(id) on delete restrict,
  source_type text not null check (source_type in ('order','correction')),
  source_id uuid not null,
  amount integer not null check (amount <> 0),
  event_at timestamptz not null,
  source_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index partner_settlements_partner_paid_idx
  on public.partner_settlements(partner_id, paid_at desc);
create index partner_settlement_lines_settlement_idx
  on public.partner_settlement_lines(settlement_id);
create index partner_settlement_lines_partner_event_idx
  on public.partner_settlement_lines(partner_id, event_at);

alter table public.partner_settlement_accounts enable row level security;
alter table public.partner_settlements enable row level security;
alter table public.partner_settlement_lines enable row level security;

revoke all on public.partner_settlement_accounts from public, anon, authenticated;
revoke all on public.partner_settlements from public, anon, authenticated;
revoke all on public.partner_settlement_lines from public, anon, authenticated;
grant select on public.partner_settlement_accounts to authenticated;
grant select on public.partner_settlements to authenticated;
grant select on public.partner_settlement_lines to authenticated;

create policy partner_settlement_account_read
on public.partner_settlement_accounts for select to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.has_role((select auth.uid()), 'cashier')
  or exists (
    select 1 from public.laundry_partners p
    where p.id = partner_id and p.user_id = (select auth.uid())
  )
);

create policy partner_settlement_read
on public.partner_settlements for select to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.has_role((select auth.uid()), 'cashier')
  or exists (
    select 1 from public.laundry_partners p
    where p.id = partner_id and p.user_id = (select auth.uid())
  )
);

create policy partner_settlement_line_read
on public.partner_settlement_lines for select to authenticated
using (
  public.has_role((select auth.uid()), 'admin')
  or public.has_role((select auth.uid()), 'cashier')
  or exists (
    select 1 from public.laundry_partners p
    where p.id = partner_id and p.user_id = (select auth.uid())
  )
);

create function laundry_private.partner_settlement_candidates(
  p_partner_id uuid,
  p_cutoff_date date
) returns table(
  source_type text,
  source_id uuid,
  amount integer,
  event_at timestamptz,
  source_snapshot jsonb
)
language sql
security definer
set search_path = ''
as $$
  with account as (
    select a.start_date
    from public.partner_settlement_accounts a
    where a.partner_id = p_partner_id
  ),
  order_lines as (
    select
      'order'::text as source_type,
      o.id as source_id,
      o.vendor_share::integer as amount,
      o.paid_at as event_at,
      jsonb_build_object(
        'order_id', o.id,
        'student_id', o.student_id,
        'category', o.category,
        'laundry_date', o.laundry_date,
        'weight_kg', o.weight_kg,
        'item_count', o.item_count,
        'total_price', o.total_price,
        'vendor_share', o.vendor_share,
        'paid_at', o.paid_at
      ) as source_snapshot
    from public.laundry_orders o
    join account a on true
    where o.partner_id = p_partner_id
      and o.status in ('DIBAYAR','SELESAI')
      and o.paid_at is not null
      and o.vendor_share <> 0
      and (o.paid_at at time zone 'Asia/Jakarta')::date >= a.start_date
      and (o.paid_at at time zone 'Asia/Jakarta')::date <= p_cutoff_date
      and not exists (
        select 1 from public.partner_settlement_lines l
        where l.source_type = 'order' and l.source_id = o.id
      )
  ),
  correction_lines as (
    select
      'correction'::text as source_type,
      c.id as source_id,
      c.vendor_delta::integer as amount,
      case when c.vendor_delta < 0 then c.reviewed_at else c.settled_at end as event_at,
      jsonb_build_object(
        'correction_id', c.id,
        'order_id', c.order_id,
        'kind', c.kind,
        'reason', c.reason,
        'original_total', c.original_total,
        'corrected_total', c.corrected_total,
        'vendor_delta', c.vendor_delta,
        'reviewed_at', c.reviewed_at,
        'settled_at', c.settled_at
      ) as source_snapshot
    from public.order_corrections c
    join public.laundry_orders o on o.id = c.order_id
    join account a on true
    where o.partner_id = p_partner_id
      and c.status = 'approved'
      and c.vendor_delta <> 0
      and (
        (
          c.vendor_delta < 0
          and c.reviewed_at is not null
          and (c.reviewed_at at time zone 'Asia/Jakarta')::date >= a.start_date
          and (c.reviewed_at at time zone 'Asia/Jakarta')::date <= p_cutoff_date
        )
        or
        (
          c.vendor_delta > 0
          and c.settlement_status = 'settled'
          and c.settled_at is not null
          and (c.settled_at at time zone 'Asia/Jakarta')::date >= a.start_date
          and (c.settled_at at time zone 'Asia/Jakarta')::date <= p_cutoff_date
        )
      )
      and not exists (
        select 1 from public.partner_settlement_lines l
        where l.source_type = 'correction' and l.source_id = c.id
      )
  )
  select * from order_lines
  union all
  select * from correction_lines
$$;

revoke all on function laundry_private.partner_settlement_candidates(uuid,date)
  from public, anon, authenticated;

create function laundry_private.activate_partner_settlement(
  p_partner_id uuid,
  p_start_date date,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Hanya admin dapat mengaktifkan settlement mitra.';
  end if;

  if not exists (
    select 1 from public.laundry_partners
    where id = p_partner_id and is_active
  ) then
    raise exception 'Mitra tidak ditemukan atau tidak aktif.';
  end if;

  if p_start_date is null or p_start_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal mulai settlement tidak valid.';
  end if;

  if p_note is null or length(btrim(p_note)) not between 10 and 2000 then
    raise exception 'Catatan aktivasi minimal 10 dan maksimal 2000 karakter.';
  end if;

  if exists (
    select 1 from public.partner_settlement_accounts
    where partner_id = p_partner_id
  ) then
    raise exception 'Settlement mitra ini sudah diaktifkan.';
  end if;

  insert into public.partner_settlement_accounts(
    partner_id, start_date, activation_note, activated_by
  )
  values (p_partner_id, p_start_date, btrim(p_note), auth.uid());

  insert into public.audit_logs(
    table_name, record_id, action, old_data, new_data, user_id
  )
  values (
    'partner_settlement_accounts',
    p_partner_id,
    'INSERT',
    null,
    jsonb_build_object(
      'partner_id', p_partner_id,
      'start_date', p_start_date,
      'activation_note', btrim(p_note)
    ),
    auth.uid()
  );

  return p_partner_id;
end
$$;

create function laundry_private.preview_partner_settlement(
  p_partner_id uuid,
  p_cutoff_date date
) returns table(
  active boolean,
  start_date date,
  order_share_total bigint,
  correction_adjustment bigint,
  net_amount bigint,
  order_count bigint,
  correction_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start_date date;
begin
  if auth.uid() is null then
    raise exception 'Autentikasi diperlukan.';
  end if;

  if not (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'cashier')
    or exists (
      select 1 from public.laundry_partners p
      where p.id = p_partner_id and p.user_id = auth.uid()
    )
  ) then
    raise exception 'Tidak berwenang melihat settlement mitra ini.';
  end if;

  select a.start_date into v_start_date
  from public.partner_settlement_accounts a
  where a.partner_id = p_partner_id;

  if v_start_date is null then
    return query
    select false, null::date, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  if p_cutoff_date is null or p_cutoff_date < v_start_date then
    raise exception 'Tanggal cutoff tidak boleh sebelum tanggal mulai settlement.';
  end if;

  return query
  select
    true,
    v_start_date,
    coalesce(sum(c.amount) filter (where c.source_type = 'order'), 0)::bigint,
    coalesce(sum(c.amount) filter (where c.source_type = 'correction'), 0)::bigint,
    coalesce(sum(c.amount), 0)::bigint,
    count(*) filter (where c.source_type = 'order')::bigint,
    count(*) filter (where c.source_type = 'correction')::bigint
  from laundry_private.partner_settlement_candidates(p_partner_id, p_cutoff_date) c;
end
$$;

create function laundry_private.record_partner_settlement(
  p_partner_id uuid,
  p_cutoff_date date,
  p_method text,
  p_reference text,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start_date date;
  v_settlement_id uuid := gen_random_uuid();
  v_order_total integer := 0;
  v_correction_total integer := 0;
  v_order_count integer := 0;
  v_correction_count integer := 0;
  v_net integer := 0;
  r record;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'cashier')
  ) then
    raise exception 'Hanya admin atau kasir dapat mencatat pembayaran mitra.';
  end if;

  select a.start_date into v_start_date
  from public.partner_settlement_accounts a
  where a.partner_id = p_partner_id
  for update;

  if v_start_date is null then
    raise exception 'Settlement mitra belum diaktifkan.';
  end if;

  if p_cutoff_date is null or p_cutoff_date < v_start_date
    or p_cutoff_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal cutoff settlement tidak valid.';
  end if;

  if p_method is null or p_method not in ('cash','bank_transfer','other')
    or p_reference is null or length(btrim(p_reference)) not between 5 and 500
    or (p_note is not null and length(btrim(p_note)) not between 1 and 2000)
  then
    raise exception 'Metode, referensi, atau catatan pembayaran tidak valid.';
  end if;

  -- Placeholder header. If the final net is zero/negative an exception below
  -- rolls back this row and every line, leaving the carry-forward untouched.
  insert into public.partner_settlements(
    id, partner_id, cutoff_date, order_share_total, correction_adjustment,
    order_count, correction_count, payment_method, payment_reference,
    note, paid_by
  )
  values (
    v_settlement_id, p_partner_id, p_cutoff_date, 0, 1,
    0, 1, p_method, btrim(p_reference),
    nullif(btrim(coalesce(p_note,'')), ''), auth.uid()
  );

  for r in
    select *
    from laundry_private.partner_settlement_candidates(p_partner_id, p_cutoff_date)
    order by event_at, source_type, source_id
  loop
    insert into public.partner_settlement_lines(
      settlement_id, partner_id, source_type, source_id,
      amount, event_at, source_snapshot
    )
    values (
      v_settlement_id, p_partner_id, r.source_type, r.source_id,
      r.amount, r.event_at, r.source_snapshot
    );

    if r.source_type = 'order' then
      v_order_total := v_order_total + r.amount;
      v_order_count := v_order_count + 1;
    else
      v_correction_total := v_correction_total + r.amount;
      v_correction_count := v_correction_count + 1;
    end if;
  end loop;

  v_net := v_order_total + v_correction_total;
  if v_net <= 0 then
    raise exception 'Saldo bersih mitra belum positif. Penyesuaian dibawa ke settlement berikutnya.';
  end if;

  update public.partner_settlements
  set order_share_total = v_order_total,
      correction_adjustment = v_correction_total,
      order_count = v_order_count,
      correction_count = v_correction_count
  where id = v_settlement_id;

  insert into public.audit_logs(
    table_name, record_id, action, old_data, new_data, user_id
  )
  values (
    'partner_settlements',
    v_settlement_id,
    'INSERT',
    null,
    jsonb_build_object(
      'partner_id', p_partner_id,
      'cutoff_date', p_cutoff_date,
      'order_share_total', v_order_total,
      'correction_adjustment', v_correction_total,
      'net_amount', v_net,
      'order_count', v_order_count,
      'correction_count', v_correction_count,
      'payment_method', p_method,
      'payment_reference', btrim(p_reference)
    ),
    auth.uid()
  );

  return v_settlement_id;
end
$$;

-- Public wrappers remain security invokers. Privileged bodies are private and
-- re-check auth.uid()/trusted roles before reading or writing financial data.
revoke all on function laundry_private.activate_partner_settlement(uuid,date,text)
  from public, anon;
revoke all on function laundry_private.preview_partner_settlement(uuid,date)
  from public, anon;
revoke all on function laundry_private.record_partner_settlement(uuid,date,text,text,text)
  from public, anon;
grant execute on function laundry_private.activate_partner_settlement(uuid,date,text)
  to authenticated;
grant execute on function laundry_private.preview_partner_settlement(uuid,date)
  to authenticated;
grant execute on function laundry_private.record_partner_settlement(uuid,date,text,text,text)
  to authenticated;

create function public.activate_partner_settlement(
  p_partner_id uuid,
  p_start_date date,
  p_note text
) returns uuid
language sql
security invoker
set search_path = ''
as $$
  select laundry_private.activate_partner_settlement(
    p_partner_id, p_start_date, p_note
  )
$$;

create function public.preview_partner_settlement(
  p_partner_id uuid,
  p_cutoff_date date
) returns table(
  active boolean,
  start_date date,
  order_share_total bigint,
  correction_adjustment bigint,
  net_amount bigint,
  order_count bigint,
  correction_count bigint
)
language sql
security invoker
set search_path = ''
as $$
  select * from laundry_private.preview_partner_settlement(
    p_partner_id, p_cutoff_date
  )
$$;

create function public.record_partner_settlement(
  p_partner_id uuid,
  p_cutoff_date date,
  p_method text,
  p_reference text,
  p_note text default null
) returns uuid
language sql
security invoker
set search_path = ''
as $$
  select laundry_private.record_partner_settlement(
    p_partner_id, p_cutoff_date, p_method, p_reference, p_note
  )
$$;

revoke all on function public.activate_partner_settlement(uuid,date,text)
  from public, anon;
revoke all on function public.preview_partner_settlement(uuid,date)
  from public, anon;
revoke all on function public.record_partner_settlement(uuid,date,text,text,text)
  from public, anon;
grant execute on function public.activate_partner_settlement(uuid,date,text)
  to authenticated;
grant execute on function public.preview_partner_settlement(uuid,date)
  to authenticated;
grant execute on function public.record_partner_settlement(uuid,date,text,text,text)
  to authenticated;

notify pgrst, 'reload schema';
