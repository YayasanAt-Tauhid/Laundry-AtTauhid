-- =====================================================
-- MIGRATION: Add paid_by column to track cashier
-- =====================================================
-- This column stores the user ID of the cashier who processed the payment
-- Allows filtering reports by individual cashier
-- =====================================================

-- Add paid_by column to laundry_orders table
ALTER TABLE public.laundry_orders
ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES auth.users(id);

-- Add comment for documentation
COMMENT ON COLUMN public.laundry_orders.paid_by IS 'ID kasir yang memproses pembayaran';

-- Create index for better query performance when filtering by cashier
CREATE INDEX IF NOT EXISTS idx_laundry_orders_paid_by
ON public.laundry_orders(paid_by)
WHERE paid_by IS NOT NULL;

-- Create index for combined filter (paid_by + paid_at) for cashier reports
CREATE INDEX IF NOT EXISTS idx_laundry_orders_paid_by_paid_at
ON public.laundry_orders(paid_by, paid_at DESC)
WHERE paid_by IS NOT NULL AND paid_at IS NOT NULL;
