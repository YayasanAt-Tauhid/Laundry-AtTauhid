-- Full cancellation of a paid laundry bill must return the verified refundable
-- amount to the original student's Wadiah balance. Historical payment/order
-- rows remain untouched; this only constrains settlement method for kind=cancel.

create or replace function laundry_private.settle_order_correction(
  p_correction_id uuid,
  p_method text,
  p_reference text,
  p_customer_consent boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c public.order_corrections;
  v_tx public.wadiah_transactions;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'cashier')
  ) then
    raise exception 'Hanya admin atau kasir dapat menyelesaikan selisih.';
  end if;

  select * into c
  from public.order_corrections
  where id = p_correction_id
  for update;

  if not found or c.status <> 'approved' or c.settlement_status <> 'pending'
     or c.settlement_due <= 0 then
    raise exception 'Selisih belum siap atau sudah diselesaikan.';
  end if;

  if p_method is null
     or p_method not in ('cash','bank_transfer','wadiah','midtrans_manual')
     or (c.delta > 0 and p_method='midtrans_manual')
     or p_reference is null
     or length(btrim(p_reference)) < 5 then
    raise exception 'Metode dan referensi bukti penyelesaian wajib valid.';
  end if;

  -- Standard Laundry At-Tauhid: cancelling a bill that was already paid does
  -- not delete/rewrite the original payment. The verified refundable amount is
  -- returned as a new Wadiah refund transaction for the original student.
  if c.kind = 'cancel' and p_method <> 'wadiah' then
    raise exception 'Pembatalan tagihan lunas harus dikembalikan ke saldo Wadiah.';
  end if;

  if p_method='wadiah' then
    if p_customer_consent is distinct from true then
      raise exception 'Persetujuan pelanggan wajib untuk wadiah.';
    end if;
    v_tx := public.process_wadiah_transaction(
      c.student_id,
      case when c.delta < 0
        then 'refund'::public.wadiah_transaction_type
        else 'payment'::public.wadiah_transaction_type
      end,
      c.settlement_due,
      c.order_id,
      'Koreksi '||c.id||': '||btrim(p_reference),
      auth.uid(),
      true
    );
  end if;

  update public.order_corrections
  set settlement_status='settled',
      settlement_method=p_method,
      settlement_reference=btrim(p_reference),
      customer_consent=coalesce(p_customer_consent,false),
      settled_by=auth.uid(),
      settled_at=now(),
      wadiah_transaction_id=v_tx.id
  where id=c.id;

  return c.id;
end $$;

revoke all on function laundry_private.settle_order_correction(uuid,text,text,boolean)
  from public, anon;
grant execute on function laundry_private.settle_order_correction(uuid,text,text,boolean)
  to authenticated;

notify pgrst, 'reload schema';