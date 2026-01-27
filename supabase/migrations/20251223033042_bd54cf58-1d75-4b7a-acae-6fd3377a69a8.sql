-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Partners can view students for their orders" ON public.students;

-- Create a SECURITY DEFINER function to get student IDs for partner orders
-- This breaks the recursion cycle
CREATE OR REPLACE FUNCTION public.get_partner_student_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT lo.student_id 
  FROM laundry_orders lo
  INNER JOIN laundry_partners lp ON lo.partner_id = lp.id
  WHERE lp.user_id = _user_id
$$;

-- Create the fixed policy using the function
CREATE POLICY "Partners can view students for their orders" 
ON public.students 
FOR SELECT 
TO authenticated
USING (
  has_role(auth.uid(), 'partner'::app_role) AND 
  id IN (SELECT get_partner_student_ids(auth.uid()))
);