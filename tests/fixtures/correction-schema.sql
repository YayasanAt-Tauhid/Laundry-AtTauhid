-- Minimal Supabase-compatible schema for isolated PostgreSQL tests (no production data).
create role anon;
create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create type public.app_role as enum('admin','staff','cashier','parent','partner');
create type public.laundry_category as enum('kiloan','handuk','selimut','sprei_kecil','sprei_besar','jaket_tebal','bedcover');
create type public.order_status as enum('DRAFT','MENUNGGU_APPROVAL_MITRA','DITOLAK_MITRA','DISETUJUI_MITRA','MENUNGGU_PEMBAYARAN','DIBAYAR','SELESAI');
create type public.wadiah_transaction_type as enum('deposit','payment','change_deposit','refund','adjustment','sedekah');
create table public.user_roles(user_id uuid references auth.users(id),role public.app_role);
create table public.students(id uuid primary key default gen_random_uuid(),parent_id uuid references auth.users(id),
  name text,class text,nik text,is_active boolean default true);
create table public.laundry_partners(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),name text,is_active boolean default true);
create table public.laundry_prices(category public.laundry_category,price_per_unit integer);
create table public.holiday_settings(kiloan_yayasan_per_kg integer,kiloan_vendor_per_kg integer,
  non_kiloan_yayasan_percent numeric,non_kiloan_vendor_percent numeric);
create table public.laundry_orders(id uuid primary key default gen_random_uuid(),student_id uuid references public.students(id),
  partner_id uuid references public.laundry_partners(id),staff_id uuid references auth.users(id),category public.laundry_category,
  weight_kg numeric,item_count integer,price_per_unit integer,total_price integer,yayasan_share integer,vendor_share integer,
  status public.order_status default 'DRAFT',laundry_date date default current_date,notes text,
  paid_at timestamptz,paid_amount integer,change_amount integer default 0,admin_fee numeric default 0,
  wadiah_used integer default 0,rounding_applied integer default 0,payment_method text,midtrans_order_id text,
  midtrans_snap_token text,paid_by uuid,approved_by uuid,approved_at timestamptz,rejection_reason text,
  created_at timestamptz default now(),updated_at timestamptz default now());
create table public.student_wadiah_balance(id uuid primary key default gen_random_uuid(),student_id uuid unique references public.students(id),
  balance integer default 0,total_deposited integer default 0,total_used integer default 0,total_sedekah integer default 0,
  last_transaction_at timestamptz,updated_at timestamptz default now());
create table public.wadiah_transactions(id uuid primary key default gen_random_uuid(),student_id uuid references public.students(id),
  transaction_type public.wadiah_transaction_type,amount integer,balance_before integer,balance_after integer,
  order_id uuid references public.laundry_orders(id),original_amount integer,rounded_amount integer,
  rounding_difference integer,notes text,processed_by uuid references auth.users(id),customer_consent boolean default true,
  created_at timestamptz default now());
create table public.audit_logs(id uuid primary key default gen_random_uuid(),table_name text,record_id uuid,
  action text,old_data jsonb,new_data jsonb,user_id uuid references auth.users(id),created_at timestamptz default now());
grant select on public.students,public.laundry_orders,public.laundry_partners to authenticated;
alter table public.students enable row level security;
create policy student_read on public.students for select to authenticated using (
  parent_id=auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'staff')
  or public.has_role(auth.uid(),'cashier') or public.has_role(auth.uid(),'partner'));
