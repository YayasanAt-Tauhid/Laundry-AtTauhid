create or replace function laundry_private.settle_laundry_payment_group(
 p_midtrans_order_id text,p_payment_method text,p_paid_at timestamptz,p_gross_amount integer,p_admin_fee integer)
returns integer language plpgsql security definer set search_path='' as $$
declare o public.laundry_orders; v_expected bigint:=0; v_count integer:=0;
 v_due integer; v_cumulative bigint:=0; v_allocated integer:=0; v_fee integer;
begin
 if p_midtrans_order_id is null or p_midtrans_order_id not like 'LAUNDRY-ATTAUHID-%'
 or coalesce(p_payment_method,'')='' or p_paid_at is null or p_gross_amount is null
 or p_admin_fee is null or p_admin_fee<0 or p_gross_amount<p_admin_fee then
 raise exception 'Data settlement Midtrans tidak valid.'; end if;
 for o in select * from public.laundry_orders where midtrans_order_id=p_midtrans_order_id
 and status in ('DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN') order by id for update loop
 v_expected:=v_expected+greatest(o.total_price-coalesce(o.wadiah_used,0),0); v_count:=v_count+1;
 end loop;
 if v_count=0 then return 0; end if;
 if v_expected<=0 or v_expected<>p_gross_amount::bigint-p_admin_fee then
 raise exception 'Nominal Midtrans tidak cocok dengan sisa tagihan setelah biaya admin. Diharapkan %, diterima %, biaya admin %.',v_expected,p_gross_amount,p_admin_fee; end if;
 for o in select * from public.laundry_orders where midtrans_order_id=p_midtrans_order_id
 and status in ('DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN') order by id loop
 v_due:=greatest(o.total_price-coalesce(o.wadiah_used,0),0);
 v_cumulative:=v_cumulative+v_due;
 v_fee:=floor(p_admin_fee::numeric*v_cumulative/v_expected)::integer-v_allocated;
 v_allocated:=v_allocated+v_fee;
 update public.laundry_orders set status='DIBAYAR',payment_method=p_payment_method,paid_at=p_paid_at,
 paid_amount=v_due+v_fee,admin_fee=v_fee where id=o.id;
 insert into public.audit_logs(table_name,record_id,action,old_data,new_data,user_id)
 values('laundry_orders',o.id,'UPDATE',
 jsonb_build_object('status',o.status,'paid_amount',o.paid_amount,'admin_fee',o.admin_fee),
 jsonb_build_object('status','DIBAYAR','paid_amount',v_due+v_fee,'admin_fee',v_fee,
 'midtrans_order_id',p_midtrans_order_id,'gateway_gross_amount',p_gross_amount,
 'gateway_admin_fee',p_admin_fee,'settlement_source','verified_midtrans'),null);
 end loop;
 return v_count;
end $$;
revoke all on function laundry_private.settle_laundry_payment_group(text,text,timestamptz,integer,integer) from public,anon,authenticated;
grant execute on function laundry_private.settle_laundry_payment_group(text,text,timestamptz,integer,integer) to service_role;
create or replace function public.settle_laundry_payment_group(
 p_midtrans_order_id text,p_payment_method text,p_paid_at timestamptz,p_gross_amount integer,p_admin_fee integer)
returns integer language sql security invoker set search_path='' as $$
 select laundry_private.settle_laundry_payment_group(p_midtrans_order_id,p_payment_method,p_paid_at,p_gross_amount,p_admin_fee)
$$;
revoke all on function public.settle_laundry_payment_group(text,text,timestamptz,integer,integer) from public,anon,authenticated;
grant execute on function public.settle_laundry_payment_group(text,text,timestamptz,integer,integer) to service_role;
create or replace function laundry_private.settle_laundry_payment_group(
 p_midtrans_order_id text,p_payment_method text,p_paid_at timestamptz,p_gross_amount integer)
returns integer language sql security definer set search_path='' as $$
 select laundry_private.settle_laundry_payment_group(p_midtrans_order_id,p_payment_method,p_paid_at,p_gross_amount,0)
$$;
create or replace function public.settle_laundry_payment_group(
 p_midtrans_order_id text,p_payment_method text,p_paid_at timestamptz,p_gross_amount integer)
returns integer language sql security invoker set search_path='' as $$
 select laundry_private.settle_laundry_payment_group(p_midtrans_order_id,p_payment_method,p_paid_at,p_gross_amount,0)
$$;
revoke all on function public.settle_laundry_payment_group(text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.settle_laundry_payment_group(text,text,timestamptz,integer) to service_role;
notify pgrst,'reload schema';
