-- Add a dedicated correction path for wrong weight/item quantity on already-paid orders.
-- Historical order/payment rows remain immutable; only the correction ledger is extended.

alter table public.order_corrections
  add column if not exists corrected_quantity numeric;

alter table public.order_corrections
  drop constraint if exists order_corrections_kind_check,
  drop constraint if exists order_corrections_check2,
  drop constraint if exists order_corrections_kind_shape_check;

alter table public.order_corrections
  add constraint order_corrections_kind_check
    check (kind in ('price', 'quantity', 'cancel', 'wrong_student')),
  add constraint order_corrections_kind_shape_check check (
    (kind = 'price' and corrected_total > 0 and corrected_quantity is null and replacement_student_id is null)
    or (
      kind = 'quantity'
      and corrected_total > 0
      and corrected_quantity is not null
      and corrected_quantity > 0
      and corrected_quantity <= 100000
      and replacement_student_id is null
      and (
        original_snapshot->>'category' = 'kiloan'
        or corrected_quantity = trunc(corrected_quantity)
      )
    )
    or (kind = 'cancel' and corrected_total = 0 and corrected_quantity is null and replacement_student_id is null)
    or (
      kind = 'wrong_student'
      and corrected_total = 0
      and corrected_quantity is null
      and replacement_student_id is not null
      and replacement_student_id <> student_id
    )
  );

create function laundry_private.request_order_quantity_correction(
  p_order_id uuid,
  p_corrected_quantity numeric,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.laundry_orders;
  v_id uuid;
  v_yayasan integer;
  v_snapshot jsonb;
  v_original_quantity numeric;
  v_total_numeric numeric;
  v_corrected_total integer;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'staff')
    or public.has_role(auth.uid(),'cashier')
  ) then
    raise exception 'Tidak berwenang mengajukan koreksi.';
  end if;

  select * into o
  from public.laundry_orders
  where id = p_order_id
  for update;

  if not found or o.status not in ('DIBAYAR','SELESAI') or o.total_price <= 0 then
    raise exception 'Koreksi berat/jumlah hanya untuk tagihan yang sudah dibayar.';
  end if;

  if exists (
    select 1
    from public.order_corrections
    where order_id = o.id and status <> 'rejected'
  ) then
    raise exception 'Tagihan ini sudah memiliki pengajuan atau koreksi yang disetujui.';
  end if;

  if p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then
    raise exception 'Alasan koreksi minimal 10 dan maksimal 2000 karakter.';
  end if;

  if p_corrected_quantity is null
    or p_corrected_quantity::text in ('NaN','Infinity','-Infinity')
    or p_corrected_quantity <= 0
    or p_corrected_quantity > 100000
    or (o.category <> 'kiloan' and p_corrected_quantity <> trunc(p_corrected_quantity))
  then
    raise exception 'Berat/jumlah koreksi tidak valid.';
  end if;

  v_original_quantity := case
    when o.category = 'kiloan' then o.weight_kg
    else o.item_count::numeric
  end;

  if v_original_quantity is null then
    raise exception 'Berat/jumlah asli pada tagihan tidak tersedia.';
  end if;

  if p_corrected_quantity = v_original_quantity then
    raise exception 'Berat/jumlah koreksi sama dengan tagihan asli.';
  end if;

  -- Use the unit price stored on the paid order. This preserves the tariff that
  -- actually applied when the historical order was created, even if today's tariff changed.
  v_total_numeric := round(p_corrected_quantity * o.price_per_unit);
  if v_total_numeric <= 0 or v_total_numeric > 2147483647 then
    raise exception 'Nominal hasil koreksi berada di luar batas.';
  end if;
  v_corrected_total := v_total_numeric::integer;

  if v_corrected_total = o.total_price then
    raise exception 'Perubahan berat/jumlah tidak mengubah nominal tagihan.';
  end if;

  -- Preserve the historical revenue-share ratio, consistent with nominal corrections.
  v_yayasan := round(v_corrected_total::numeric * o.yayasan_share / o.total_price);

  v_snapshot := jsonb_build_object(
    'student_id',o.student_id,
    'partner_id',o.partner_id,
    'category',o.category,
    'weight_kg',o.weight_kg,
    'item_count',o.item_count,
    'price_per_unit',o.price_per_unit,
    'total_price',o.total_price,
    'yayasan_share',o.yayasan_share,
    'vendor_share',o.vendor_share,
    'laundry_date',o.laundry_date,
    'paid_at',o.paid_at,
    'payment_method',o.payment_method,
    'paid_amount',o.paid_amount,
    'admin_fee',o.admin_fee,
    'change_amount',o.change_amount,
    'wadiah_used',o.wadiah_used,
    'rounding_applied',o.rounding_applied,
    'midtrans_order_id',o.midtrans_order_id
  );

  insert into public.order_corrections(
    order_id,
    student_id,
    kind,
    reason,
    original_snapshot,
    original_total,
    corrected_total,
    corrected_quantity,
    yayasan_delta,
    vendor_delta,
    requested_by
  )
  values(
    o.id,
    o.student_id,
    'quantity',
    btrim(p_reason),
    v_snapshot,
    o.total_price,
    v_corrected_total,
    p_corrected_quantity,
    v_yayasan - o.yayasan_share,
    v_corrected_total - v_yayasan - o.vendor_share,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

revoke all on function laundry_private.request_order_quantity_correction(uuid,numeric,text)
  from public, anon;
grant execute on function laundry_private.request_order_quantity_correction(uuid,numeric,text)
  to authenticated;

create function public.request_order_quantity_correction(
  p_order_id uuid,
  p_corrected_quantity numeric,
  p_reason text
) returns uuid
language sql security invoker set search_path = '' as $$
  select laundry_private.request_order_quantity_correction(
    p_order_id,
    p_corrected_quantity,
    p_reason
  )
$$;

revoke all on function public.request_order_quantity_correction(uuid,numeric,text)
  from public, anon;
grant execute on function public.request_order_quantity_correction(uuid,numeric,text)
  to authenticated;

notify pgrst, 'reload schema';
