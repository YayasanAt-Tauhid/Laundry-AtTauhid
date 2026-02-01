-- =====================================================
-- MIGRATION: Fix paid_amount Data for Historical Orders
-- File: 20260125_fix_paid_amount_data.sql
-- =====================================================
--
-- Problem: Many orders have paid_amount = 0 or NULL even though
-- they are marked as DIBAYAR/SELESAI. This causes the payment
-- history to display incorrect amounts (showing "000").
--
-- Solution: Update paid_amount to the correct calculated value:
-- paid_amount = total_price + admin_fee - wadiah_used - rounding_applied
--
-- For orders paid fully with wadiah, paid_amount should be 0 (correct).
-- For orders paid via QRIS/transfer/cash, paid_amount should be > 0.
-- =====================================================

-- =====================================================
-- STEP 1: Create backup of current data (for rollback if needed)
-- =====================================================

-- Create a backup table (uncomment if needed)
-- CREATE TABLE IF NOT EXISTS public.laundry_orders_backup_20260125 AS
-- SELECT * FROM public.laundry_orders WHERE status IN ('DIBAYAR', 'SELESAI');

-- =====================================================
-- STEP 2: Fix paid_amount for orders paid via online payment
-- These orders have payment_method = 'qris' or bank transfer variants
-- but paid_amount is 0 or null
-- =====================================================

UPDATE public.laundry_orders
SET paid_amount = (
  COALESCE(total_price, 0) +
  COALESCE(admin_fee, 0) -
  COALESCE(wadiah_used, 0) -
  COALESCE(rounding_applied, 0)
)
WHERE
  status IN ('DIBAYAR', 'SELESAI')
  AND (paid_amount IS NULL OR paid_amount = 0)
  AND payment_method IS NOT NULL
  AND payment_method != 'wadiah'  -- Don't update wadiah-only payments
  AND payment_method != ''
  AND (
    COALESCE(total_price, 0) +
    COALESCE(admin_fee, 0) -
    COALESCE(wadiah_used, 0) -
    COALESCE(rounding_applied, 0)
  ) > 0;

-- =====================================================
-- STEP 3: Fix paid_amount for cash payments
-- Cash payments should have paid_amount set
-- =====================================================

UPDATE public.laundry_orders
SET paid_amount = (
  COALESCE(total_price, 0) +
  COALESCE(admin_fee, 0) -
  COALESCE(wadiah_used, 0) -
  COALESCE(rounding_applied, 0)
)
WHERE
  status IN ('DIBAYAR', 'SELESAI')
  AND (paid_amount IS NULL OR paid_amount = 0)
  AND (payment_method = 'cash' OR payment_method = 'manual' OR payment_method = 'tunai')
  AND (
    COALESCE(total_price, 0) +
    COALESCE(admin_fee, 0) -
    COALESCE(wadiah_used, 0) -
    COALESCE(rounding_applied, 0)
  ) > 0;

-- =====================================================
-- STEP 4: Fix paid_amount for mixed wadiah + online payments
-- If wadiah was used but payment_method is online (qris, etc),
-- paid_amount should be the remaining after wadiah
-- =====================================================

UPDATE public.laundry_orders
SET paid_amount = (
  COALESCE(total_price, 0) +
  COALESCE(admin_fee, 0) -
  COALESCE(wadiah_used, 0) -
  COALESCE(rounding_applied, 0)
)
WHERE
  status IN ('DIBAYAR', 'SELESAI')
  AND (paid_amount IS NULL OR paid_amount = 0)
  AND COALESCE(wadiah_used, 0) > 0
  AND payment_method IS NOT NULL
  AND payment_method NOT IN ('wadiah', '')
  AND (
    COALESCE(total_price, 0) +
    COALESCE(admin_fee, 0) -
    COALESCE(wadiah_used, 0) -
    COALESCE(rounding_applied, 0)
  ) > 0;

-- =====================================================
-- STEP 5: For orders with no payment_method but status DIBAYAR
-- Set a default calculated value
-- =====================================================

UPDATE public.laundry_orders
SET paid_amount = (
  COALESCE(total_price, 0) +
  COALESCE(admin_fee, 0) -
  COALESCE(wadiah_used, 0) -
  COALESCE(rounding_applied, 0)
)
WHERE
  status IN ('DIBAYAR', 'SELESAI')
  AND (paid_amount IS NULL OR paid_amount = 0)
  AND (payment_method IS NULL OR payment_method = '')
  AND paid_at IS NOT NULL
  AND (
    COALESCE(total_price, 0) +
    COALESCE(admin_fee, 0) -
    COALESCE(wadiah_used, 0) -
    COALESCE(rounding_applied, 0)
  ) > 0;

-- =====================================================
-- STEP 6: Ensure paid_amount is never negative
-- =====================================================

UPDATE public.laundry_orders
SET paid_amount = 0
WHERE paid_amount < 0;

-- =====================================================
-- STEP 7: Log summary of changes
-- =====================================================

-- Count orders fixed (uncomment to check)
-- SELECT
--   payment_method,
--   COUNT(*) as count,
--   SUM(paid_amount) as total_paid_amount
-- FROM public.laundry_orders
-- WHERE status IN ('DIBAYAR', 'SELESAI')
-- GROUP BY payment_method
-- ORDER BY count DESC;

-- =====================================================
-- VERIFICATION QUERIES (run manually to verify)
-- =====================================================

-- Check if any paid orders still have paid_amount = 0
-- (should only be wadiah-only payments)
-- SELECT id, total_price, admin_fee, wadiah_used, paid_amount, payment_method, status
-- FROM public.laundry_orders
-- WHERE status IN ('DIBAYAR', 'SELESAI')
-- AND (paid_amount IS NULL OR paid_amount = 0)
-- AND payment_method != 'wadiah'
-- LIMIT 20;

-- Summary of all paid orders
-- SELECT
--   CASE
--     WHEN paid_amount > 0 THEN 'Has paid_amount'
--     WHEN paid_amount = 0 AND payment_method = 'wadiah' THEN 'Wadiah only (correct)'
--     WHEN paid_amount = 0 THEN 'Missing paid_amount'
--     ELSE 'NULL paid_amount'
--   END as status,
--   COUNT(*) as count
-- FROM public.laundry_orders
-- WHERE status IN ('DIBAYAR', 'SELESAI')
-- GROUP BY 1;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
