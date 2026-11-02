create schema if not exists laundry_private;

-- Reverse an accidental manual Wadiah deposit without deleting the original ledger row.
-- Only admins may reverse a manual deposit; the balance adjustment and audit link are atomic.

create table public.wadiah_deposit_reversals (
  id uuid primary key default gen_random_uuid(),
  original_transaction_id uuid not null unique
    references public.wadiah_transactions(id) on delete restrict,
  reversal_transaction_id uuid not null unique
    references public.wadiah_transactions(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  amount integer not null check (amount > 0),
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint wadiah_deposit_reversals_distinct_transactions
    check (original_transaction_id <> reversal_transaction_id)
);

create index wadiah_deposit_reversals_student_created_idx
  on public.wadiah_deposit_reversals(student_id, created_at desc);

alter table public.wadiah_deposit_reversals enable row level security;
revoke all on table public.wadiah_deposit_reversals from public, anon, authenticated;
grant select on table public.wadiah_deposit_reversals to authenticated;

create policy "Admins can view Wadiah deposit reversals"
  on public.wadiah_deposit_reversals
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

grant usage on schema laundry_private to authenticated;

create function laundry_private.reverse_manual_wadiah_deposit(
  p_transaction_id uuid,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.wadiah_transactions;
  v_balance public.student_wadiah_balance;
  v_reversal public.wadiah_transactions;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Hanya admin yang dapat membatalkan setoran Wadiah manual.';
  end if;

  if p_transaction_id is null then
    raise exception 'Transaksi setoran wajib dipilih.';
  end if;

  if p_reason is null
     or char_length(btrim(p_reason)) < 10
     or char_length(btrim(p_reason)) > 500 then
    raise exception 'Alasan pembatalan wajib 10 sampai 500 karakter.';
  end if;

  select *
    into v_original
    from public.wadiah_transactions
   where id = p_transaction_id
   for update;

  if not found then
    raise exception 'Transaksi setoran tidak ditemukan.';
  end if;

  if v_original.transaction_type is distinct from 'deposit'::public.wadiah_transaction_type
     or v_original.order_id is not null
     or v_original.amount is null
     or v_original.amount <= 0
     or v_original.notes is distinct from 'Setoran wadiah manual' then
    raise exception 'Hanya transaksi Setoran wadiah manual yang dapat dibatalkan melalui fitur ini.';
  end if;

  if exists (
    select 1
      from public.wadiah_deposit_reversals r
     where r.original_transaction_id = v_original.id
  ) then
    raise exception 'Setoran Wadiah ini sudah dibatalkan.';
  end if;

  select *
    into v_balance
    from public.student_wadiah_balance
   where student_id = v_original.student_id
   for update;

  if not found then
    raise exception 'Saldo Wadiah siswa tidak ditemukan.';
  end if;

  if v_balance.balance < v_original.amount then
    raise exception 'Saldo Wadiah saat ini tidak cukup untuk membatalkan setoran penuh. Perlu rekonsiliasi admin.';
  end if;

  if v_balance.total_deposited < v_original.amount then
    raise exception 'Total setoran tercatat tidak cukup untuk membatalkan setoran ini. Perlu rekonsiliasi admin.';
  end if;

  -- The existing processor writes the compensating ledger row and adjusts balance.
  -- This is a correction of an invalid deposit, so the cumulative deposited total
  -- must also exclude the amount that was never actually received.
  v_reversal := public.process_wadiah_transaction(
    v_original.student_id,
    'adjustment'::public.wadiah_transaction_type,
    -v_original.amount,
    null,
    'Pembatalan setoran Wadiah manual. Transaksi asal: ' || v_original.id::text
      || '. Alasan: ' || btrim(p_reason),
    auth.uid(),
    false,
    null,
    null
  );

  update public.student_wadiah_balance
     set total_deposited = total_deposited - v_original.amount,
         updated_at = now()
   where student_id = v_original.student_id;

  insert into public.wadiah_deposit_reversals (
    original_transaction_id,
    reversal_transaction_id,
    student_id,
    amount,
    reason,
    created_by
  ) values (
    v_original.id,
    v_reversal.id,
    v_original.student_id,
    v_original.amount,
    btrim(p_reason),
    auth.uid()
  );

  insert into public.audit_logs (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    user_id
  ) values (
    'wadiah_transactions',
    v_original.id,
    'REVERSE_MANUAL_DEPOSIT',
    to_jsonb(v_original),
    jsonb_build_object(
      'reversal_transaction_id', v_reversal.id,
      'student_id', v_original.student_id,
      'amount_reversed', v_original.amount,
      'balance_before', v_reversal.balance_before,
      'balance_after', v_reversal.balance_after,
      'total_deposited_before', v_balance.total_deposited,
      'total_deposited_after', v_balance.total_deposited - v_original.amount,
      'reason', btrim(p_reason)
    ),
    auth.uid()
  );

  return v_reversal.id;
end;
$$;

revoke all on function laundry_private.reverse_manual_wadiah_deposit(uuid, text)
  from public, anon;
grant execute on function laundry_private.reverse_manual_wadiah_deposit(uuid, text)
  to authenticated;

create function public.reverse_manual_wadiah_deposit(
  p_transaction_id uuid,
  p_reason text
) returns uuid
language sql
security invoker
set search_path = ''
as $$
  select laundry_private.reverse_manual_wadiah_deposit(p_transaction_id, p_reason);
$$;

revoke all on function public.reverse_manual_wadiah_deposit(uuid, text)
  from public, anon;
grant execute on function public.reverse_manual_wadiah_deposit(uuid, text)
  to authenticated;

notify pgrst, 'reload schema';
