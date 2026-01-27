-- Fix 1: Allow partners to view students data for orders they need to approve
CREATE POLICY "Partners can view students for their orders" 
ON public.students 
FOR SELECT 
USING (
  has_role(auth.uid(), 'partner'::app_role) AND 
  id IN (
    SELECT student_id FROM public.laundry_orders 
    WHERE partner_id IN (
      SELECT id FROM public.laundry_partners WHERE user_id = auth.uid()
    )
  )
);

-- Fix 2: Drop and recreate admin policy on laundry_partners to use PERMISSIVE
DROP POLICY IF EXISTS "Admin can manage partners" ON public.laundry_partners;

CREATE POLICY "Admin can manage partners" 
ON public.laundry_partners 
FOR ALL 
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));