-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'parent', 'staff', 'partner');

-- Create enum for order status
CREATE TYPE public.order_status AS ENUM (
  'DRAFT',
  'MENUNGGU_APPROVAL_MITRA',
  'DITOLAK_MITRA',
  'DISETUJUI_MITRA',
  'MENUNGGU_PEMBAYARAN',
  'DIBAYAR',
  'SELESAI'
);

-- Create enum for laundry category
CREATE TYPE public.laundry_category AS ENUM (
  'kiloan',
  'handuk',
  'selimut',
  'sprei_kecil',
  'sprei_besar',
  'jaket_tebal',
  'bedcover'
);

-- Profiles table for user information
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'parent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Laundry partners (Mitra)
CREATE TABLE public.laundry_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Students table
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  class TEXT NOT NULL,
  nis TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Laundry category prices
CREATE TABLE public.laundry_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category laundry_category NOT NULL UNIQUE,
  price_per_unit INTEGER NOT NULL,
  unit_name TEXT NOT NULL DEFAULT 'kg',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Holiday settings
CREATE TABLE public.holiday_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_holiday BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Laundry orders
CREATE TABLE public.laundry_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  partner_id UUID REFERENCES public.laundry_partners(id) NOT NULL,
  staff_id UUID REFERENCES auth.users(id) NOT NULL,
  category laundry_category NOT NULL,
  weight_kg DECIMAL(10,2),
  item_count INTEGER,
  price_per_unit INTEGER NOT NULL,
  total_price INTEGER NOT NULL,
  yayasan_share INTEGER NOT NULL DEFAULT 0,
  vendor_share INTEGER NOT NULL DEFAULT 0,
  status order_status NOT NULL DEFAULT 'DRAFT',
  rejection_reason TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  paid_at TIMESTAMPTZ,
  midtrans_order_id TEXT,
  midtrans_snap_token TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holiday_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);
  
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admin can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for students
CREATE POLICY "Parents can manage own students" ON public.students
  FOR ALL USING (auth.uid() = parent_id);

CREATE POLICY "Staff can view all students" ON public.students
  FOR SELECT USING (public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Admin can manage all students" ON public.students
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for laundry_partners
CREATE POLICY "Everyone can view active partners" ON public.laundry_partners
  FOR SELECT USING (is_active = true);

CREATE POLICY "Partners can view own data" ON public.laundry_partners
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admin can manage partners" ON public.laundry_partners
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for laundry_prices
CREATE POLICY "Everyone can view prices" ON public.laundry_prices
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage prices" ON public.laundry_prices
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for holiday_settings
CREATE POLICY "Everyone can view holiday settings" ON public.holiday_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage holiday settings" ON public.holiday_settings
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for laundry_orders
CREATE POLICY "Staff can create orders" ON public.laundry_orders
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Staff can update pending orders" ON public.laundry_orders
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'staff') 
    AND status IN ('DRAFT', 'MENUNGGU_APPROVAL_MITRA', 'DITOLAK_MITRA')
  );

CREATE POLICY "Staff can view all orders" ON public.laundry_orders
  FOR SELECT USING (public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Partners can view and update assigned orders" ON public.laundry_orders
  FOR SELECT USING (
    public.has_role(auth.uid(), 'partner') 
    AND partner_id IN (SELECT id FROM public.laundry_partners WHERE user_id = auth.uid())
  );

CREATE POLICY "Partners can approve orders" ON public.laundry_orders
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'partner')
    AND partner_id IN (SELECT id FROM public.laundry_partners WHERE user_id = auth.uid())
    AND status = 'MENUNGGU_APPROVAL_MITRA'
  );

CREATE POLICY "Parents can view own children orders" ON public.laundry_orders
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
  );

CREATE POLICY "Admin can manage all orders" ON public.laundry_orders
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for audit_logs
CREATE POLICY "Admin can view audit logs" ON public.audit_logs
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'parent');
  
  RETURN NEW;
END;
$$;

-- Trigger for new user registration
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_laundry_partners_updated_at BEFORE UPDATE ON public.laundry_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_laundry_orders_updated_at BEFORE UPDATE ON public.laundry_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default laundry prices
INSERT INTO public.laundry_prices (category, price_per_unit, unit_name) VALUES
  ('kiloan', 7000, 'kg'),
  ('handuk', 5000, 'pcs'),
  ('selimut', 15000, 'pcs'),
  ('sprei_kecil', 8000, 'pcs'),
  ('sprei_besar', 15000, 'pcs'),
  ('jaket_tebal', 5000, 'pcs'),
  ('bedcover', 15000, 'pcs');

-- Insert default holiday setting
INSERT INTO public.holiday_settings (is_holiday) VALUES (false);