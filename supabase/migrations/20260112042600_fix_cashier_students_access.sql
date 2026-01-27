-- Fix: Allow cashier to view all students data for POS operations
-- This is needed because the CashierPOS page joins laundry_orders with students table

-- Drop existing policy if exists
DROP POLICY IF EXISTS "Cashier can view all students" ON public.students;

-- Create policy to allow cashier to view all students
CREATE POLICY "Cashier can view all students" 
ON public.students 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'cashier'
  )
);

-- Also ensure cashier can view laundry_partners for order details
DROP POLICY IF EXISTS "Cashier can view all partners" ON public.laundry_partners;

CREATE POLICY "Cashier can view all partners" 
ON public.laundry_partners 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'cashier'
  )
);
