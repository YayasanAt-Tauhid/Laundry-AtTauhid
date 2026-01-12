-- Fix RLS policies for partners to approve/reject orders

-- Drop existing partner update policies
DROP POLICY IF EXISTS "Partners can approve orders" ON public.laundry_orders;

-- Create new policy that allows partners to update orders they're assigned to
-- USING: checks the OLD row (before update) - partner must be assigned and status must be pending approval
-- WITH CHECK: checks the NEW row (after update) - allows the new status values
CREATE POLICY "Partners can approve or reject orders" ON public.laundry_orders
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'partner')
    AND partner_id IN (SELECT id FROM public.laundry_partners WHERE user_id = auth.uid())
    AND status = 'MENUNGGU_APPROVAL_MITRA'
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'partner')
    AND partner_id IN (SELECT id FROM public.laundry_partners WHERE user_id = auth.uid())
    AND status IN ('DISETUJUI_MITRA', 'DITOLAK_MITRA')
  );

-- Also ensure partners can view their assigned orders properly
DROP POLICY IF EXISTS "Partners can view and update assigned orders" ON public.laundry_orders;

CREATE POLICY "Partners can view assigned orders" ON public.laundry_orders
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'partner')
    AND partner_id IN (SELECT id FROM public.laundry_partners WHERE user_id = auth.uid())
  );
