-- Add cashier role to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'cashier';

-- Add admin_fee and payment_method columns to laundry_orders table
ALTER TABLE laundry_orders 
ADD COLUMN IF NOT EXISTS admin_fee DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Add comment to columns for documentation
COMMENT ON COLUMN laundry_orders.admin_fee IS 'Payment processing admin fee charged to customer';
COMMENT ON COLUMN laundry_orders.payment_method IS 'Midtrans payment method used (qris, bank_transfer, etc)';

-- Update RLS policies to include cashier role (similar permissions to staff)
-- Allow cashier to view all orders
DROP POLICY IF EXISTS "Cashier can view all orders" ON laundry_orders;
CREATE POLICY "Cashier can view all orders"
ON laundry_orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'cashier'
  )
);

-- Allow cashier to update order payment status
DROP POLICY IF EXISTS "Cashier can update payment status" ON laundry_orders;
CREATE POLICY "Cashier can update payment status"
ON laundry_orders
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'cashier'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'cashier'
  )
);
