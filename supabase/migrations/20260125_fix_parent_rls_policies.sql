-- =====================================================
-- MIGRATION: Fix Parent RLS Policies
-- File: 20260125_fix_parent_rls_policies.sql
-- =====================================================
--
-- This migration fixes RLS policies for parent role to ensure:
-- 1. Parents can ONLY see orders for their own children
-- 2. Parents can ONLY see their own children's data
-- 3. No policy conflicts with other roles
--
-- Issue: Parents were seeing orders from students that don't belong to them
-- Root cause: RLS policies might conflict or not be enforced properly
-- =====================================================

-- =====================================================
-- STEP 1: Drop existing parent policies on laundry_orders
-- =====================================================

DROP POLICY IF EXISTS "Parents can view own children orders" ON public.laundry_orders;
DROP POLICY IF EXISTS "Parents can update payment info for children orders" ON public.laundry_orders;

-- =====================================================
-- STEP 2: Recreate parent SELECT policy for laundry_orders
-- This policy ensures parents can ONLY view orders where:
-- - The student_id belongs to a student whose parent_id = auth.uid()
-- =====================================================

CREATE POLICY "Parents can view own children orders"
ON public.laundry_orders
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = laundry_orders.student_id
    AND s.parent_id = auth.uid()
  )
);

COMMENT ON POLICY "Parents can view own children orders" ON public.laundry_orders IS
'Allows parents to view laundry orders only for students where parent_id matches the current user.
Uses EXISTS subquery for better performance and clearer intent.';

-- =====================================================
-- STEP 3: Recreate parent UPDATE policy for laundry_orders
-- Parents need to update payment info (Midtrans flow)
-- =====================================================

CREATE POLICY "Parents can update payment info for children orders"
ON public.laundry_orders
FOR UPDATE
USING (
  -- Can only update their own children's orders
  EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = laundry_orders.student_id
    AND s.parent_id = auth.uid()
  )
  -- Only orders in payable status
  AND status IN ('DISETUJUI_MITRA', 'MENUNGGU_PEMBAYARAN')
)
WITH CHECK (
  -- After update, still must be their children's orders
  EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = laundry_orders.student_id
    AND s.parent_id = auth.uid()
  )
  -- Only allow specific status transitions
  AND status IN ('MENUNGGU_PEMBAYARAN', 'DIBAYAR')
);

COMMENT ON POLICY "Parents can update payment info for children orders" ON public.laundry_orders IS
'Allows parents to update payment information (midtrans_order_id, snap_token, status)
for their children orders. Required for online payment flow.';

-- =====================================================
-- STEP 4: Ensure students table has correct parent policy
-- =====================================================

-- Drop existing parent policy if any issues
DROP POLICY IF EXISTS "Parents can manage own students" ON public.students;
DROP POLICY IF EXISTS "Parents can view own students" ON public.students;

-- Recreate with explicit permissions
CREATE POLICY "Parents can view own students"
ON public.students
FOR SELECT
USING (parent_id = auth.uid());

CREATE POLICY "Parents can insert own students"
ON public.students
FOR INSERT
WITH CHECK (parent_id = auth.uid());

CREATE POLICY "Parents can update own students"
ON public.students
FOR UPDATE
USING (parent_id = auth.uid())
WITH CHECK (parent_id = auth.uid());

CREATE POLICY "Parents can delete own students"
ON public.students
FOR DELETE
USING (parent_id = auth.uid());

-- =====================================================
-- STEP 5: Ensure student_wadiah_balance has correct policy for parents
-- =====================================================

DROP POLICY IF EXISTS "Parents can view own children wadiah balance" ON public.student_wadiah_balance;

CREATE POLICY "Parents can view own children wadiah balance"
ON public.student_wadiah_balance
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = student_wadiah_balance.student_id
    AND s.parent_id = auth.uid()
  )
);

-- =====================================================
-- STEP 6: Create index for better performance
-- =====================================================

-- Index for faster parent lookup on students
CREATE INDEX IF NOT EXISTS idx_students_parent_id
ON public.students(parent_id);

-- Index for faster student lookup on orders
CREATE INDEX IF NOT EXISTS idx_laundry_orders_student_id
ON public.laundry_orders(student_id);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_laundry_orders_student_status
ON public.laundry_orders(student_id, status);

-- =====================================================
-- STEP 7: Create helper function to check parent access
-- This can be used in policies and queries
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_parent_of_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students
    WHERE id = p_student_id
    AND parent_id = auth.uid()
  )
$$;

COMMENT ON FUNCTION public.is_parent_of_student(UUID) IS
'Returns true if the current authenticated user is the parent of the given student.
Used for RLS policies and access control.';

-- =====================================================
-- STEP 8: Verify RLS is enabled on all relevant tables
-- =====================================================

ALTER TABLE public.laundry_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_wadiah_balance ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- VERIFICATION QUERIES (run manually)
-- =====================================================

-- Check all policies on laundry_orders:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'laundry_orders';

-- Check all policies on students:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'students';

-- Test as a parent (replace with actual user id):
-- SET request.jwt.claim.sub = 'parent-user-uuid-here';
-- SELECT * FROM laundry_orders; -- Should only show orders for parent's children
-- SELECT * FROM students; -- Should only show parent's children

-- =====================================================
-- END OF MIGRATION
-- =====================================================
