-- Migration: Add RLS policy for parents to update payment info on children's orders
-- Created: 2026-01-19
-- Purpose: Allow parents to update midtrans payment fields when paying for their children's laundry

-- =====================================================
-- DROP EXISTING POLICY IF EXISTS (for idempotency)
-- =====================================================
DROP POLICY IF EXISTS "Parents can update payment info for children orders" ON public.laundry_orders;

-- =====================================================
-- CREATE POLICY: Parents can update payment info
-- =====================================================
-- This policy allows parents to update specific payment-related fields
-- on orders that belong to their children
--
-- Conditions:
-- 1. User must be the parent of the student (student.parent_id = auth.uid())
-- 2. Order must be in a payable status (DISETUJUI_MITRA or MENUNGGU_PEMBAYARAN)

CREATE POLICY "Parents can update payment info for children orders"
ON public.laundry_orders
FOR UPDATE
USING (
  -- Check if the order belongs to one of the parent's children
  student_id IN (
    SELECT id FROM public.students WHERE parent_id = auth.uid()
  )
  AND
  -- Only allow update on orders that are ready for payment
  status IN ('DISETUJUI_MITRA', 'MENUNGGU_PEMBAYARAN')
)
WITH CHECK (
  -- Ensure the student_id still belongs to parent after update
  student_id IN (
    SELECT id FROM public.students WHERE parent_id = auth.uid()
  )
  AND
  -- Only allow transitioning to payment-related statuses
  status IN ('DISETUJUI_MITRA', 'MENUNGGU_PEMBAYARAN', 'DIBAYAR')
);

-- =====================================================
-- COMMENT
-- =====================================================
COMMENT ON POLICY "Parents can update payment info for children orders" ON public.laundry_orders IS
'Allows parents to update payment information (midtrans_order_id, midtrans_snap_token, status, etc.)
on orders belonging to their children. Required for the payment flow to work when parents pay via frontend.';

-- =====================================================
-- VERIFICATION QUERY (run manually to verify)
-- =====================================================
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'laundry_orders' AND policyname LIKE '%parent%';
