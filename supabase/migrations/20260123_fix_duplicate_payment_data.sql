-- =============================================
-- Migration: Fix Duplicate Payment Data
-- Date: 2026-01-23
-- Description: Fix historical data where payment details (paid_amount, change_amount,
--              wadiah_used, rounding_applied) were duplicated across all items in a
--              bulk payment transaction instead of being stored only on the last item.
-- =============================================

-- Step 1: Create a backup table (optional, uncomment if needed)
-- CREATE TABLE IF NOT EXISTS laundry_orders_backup_20260123 AS SELECT * FROM laundry_orders;

-- Step 2: Fix the duplicate payment data
-- This CTE identifies batches of payments (same student, same cashier, paid within 5 seconds)
-- and keeps payment details only on the last item in each batch

WITH payment_batches AS (
  SELECT
    id,
    student_id,
    paid_by,
    paid_at,
    paid_amount,
    change_amount,
    wadiah_used,
    rounding_applied,
    -- Group payments by student, cashier, and 5-second time window
    FIRST_VALUE(paid_at) OVER (
      PARTITION BY
        student_id,
        paid_by,
        DATE_TRUNC('minute', paid_at),
        FLOOR(EXTRACT(SECOND FROM paid_at) / 5)
      ORDER BY paid_at
    ) AS batch_start_time
  FROM laundry_orders
  WHERE status IN ('DIBAYAR', 'SELESAI')
    AND paid_at IS NOT NULL
    AND paid_by IS NOT NULL
    AND (
      COALESCE(paid_amount, 0) > 0
      OR COALESCE(change_amount, 0) > 0
      OR COALESCE(wadiah_used, 0) > 0
      OR COALESCE(rounding_applied, 0) > 0
    )
),

-- Rank orders within each batch, keeping the last one (by paid_at) as rn = 1
ranked_orders AS (
  SELECT
    id,
    student_id,
    paid_by,
    batch_start_time,
    paid_amount,
    change_amount,
    wadiah_used,
    rounding_applied,
    ROW_NUMBER() OVER (
      PARTITION BY student_id, paid_by, batch_start_time
      ORDER BY paid_at DESC
    ) AS rn,
    COUNT(*) OVER (
      PARTITION BY student_id, paid_by, batch_start_time
    ) AS batch_size
  FROM payment_batches
)

-- Update all items except the last one (rn > 1) in batches with multiple items
UPDATE laundry_orders lo
SET
  paid_amount = 0,
  change_amount = 0,
  wadiah_used = 0,
  rounding_applied = 0
FROM ranked_orders ro
WHERE lo.id = ro.id
  AND ro.rn > 1          -- Not the last item in the batch
  AND ro.batch_size > 1; -- Only batches with more than 1 order

-- Step 3: Log the migration result
DO $$
DECLARE
  affected_rows INTEGER;
BEGIN
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RAISE NOTICE 'Migration completed. Updated % rows to fix duplicate payment data.', affected_rows;
END $$;

-- =============================================
-- Verification Query (run separately to check results)
-- =============================================
--
-- To verify the fix worked correctly, run this query:
--
-- WITH payment_batches AS (
--   SELECT
--     id,
--     student_id,
--     paid_by,
--     paid_at,
--     paid_amount,
--     change_amount,
--     wadiah_used,
--     total_price,
--     students.name as student_name,
--     FIRST_VALUE(paid_at) OVER (
--       PARTITION BY student_id, paid_by,
--         DATE_TRUNC('minute', paid_at),
--         FLOOR(EXTRACT(SECOND FROM paid_at) / 5)
--       ORDER BY paid_at
--     ) AS batch_start_time
--   FROM laundry_orders
--   LEFT JOIN students ON laundry_orders.student_id = students.id
--   WHERE status IN ('DIBAYAR', 'SELESAI')
--     AND paid_at IS NOT NULL
-- )
-- SELECT
--   student_name,
--   batch_start_time,
--   COUNT(*) as items_in_batch,
--   SUM(total_price) as total_bill,
--   MAX(paid_amount) as paid_amount,
--   MAX(change_amount) as change_amount,
--   MAX(wadiah_used) as wadiah_used,
--   SUM(CASE WHEN paid_amount > 0 THEN 1 ELSE 0 END) as items_with_payment_data
-- FROM payment_batches
-- GROUP BY student_name, batch_start_time
-- HAVING COUNT(*) > 1
-- ORDER BY batch_start_time DESC;
--
-- Expected: items_with_payment_data should be 1 for each batch (only last item has payment data)
-- =============================================
