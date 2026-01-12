-- Fix RLS policies for laundry_orders to ensure admin can perform all operations

-- Drop existing admin policy
DROP POLICY IF EXISTS "Admin can manage all orders" ON public.laundry_orders;

-- Recreate admin policy with explicit USING and WITH CHECK clauses
CREATE POLICY "Admin can manage all orders" ON public.laundry_orders
  FOR ALL 
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Also add a more explicit UPDATE policy for admin
CREATE POLICY "Admin can update any order" ON public.laundry_orders
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Fix partners policies as well
DROP POLICY IF EXISTS "Admin can manage partners" ON public.laundry_partners;

CREATE POLICY "Admin can manage partners" ON public.laundry_partners
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Ensure admin can manage user_roles properly
DROP POLICY IF EXISTS "Admin can manage roles" ON public.user_roles;

CREATE POLICY "Admin can manage roles" ON public.user_roles
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Fix admin policy for profiles to allow viewing all
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;

CREATE POLICY "Admin can view all profiles" ON public.profiles
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can manage all profiles" ON public.profiles
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
