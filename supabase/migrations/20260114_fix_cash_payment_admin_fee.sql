-- Migration: Fix admin fee for cash/manual payments
-- Description: Cash payments at cashier should have no admin fee (0)
--              Only Midtrans payments (QRIS, VA) should have admin fees
-- Date: 2026-01-14

-- Fix admin fee for existing cash payments (should be 0, no admin fee for cash at cashier)
UPDATE laundry_orders
SET admin_fee = 0
WHERE payment_method = 'cash'
  AND admin_fee > 0;

-- Fix admin fee for existing manual payments (should be 0, confirmed by cashier)
UPDATE laundry_orders
SET admin_fee = 0
WHERE payment_method = 'manual'
  AND admin_fee > 0;

-- Add comment to document the business rule
COMMENT ON COLUMN laundry_orders.admin_fee IS 'Admin fee charged for payment gateway (Midtrans). 0 for cash/manual payments at cashier. QRIS: 0.7%, VA: Rp 4,400';
