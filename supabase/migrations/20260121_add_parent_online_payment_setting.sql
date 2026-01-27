-- =====================================================
-- PENGATURAN PEMBAYARAN ONLINE UNTUK PARENT
-- =====================================================
-- Fitur ini memungkinkan admin untuk mengaktifkan/menonaktifkan
-- fitur pembayaran online (QRIS/E-Wallet) untuk akun parent.
-- Jika dinonaktifkan, parent harus membayar melalui kasir.
-- =====================================================

-- Add column to enable/disable online payment for parent role
ALTER TABLE public.rounding_settings
ADD COLUMN IF NOT EXISTS parent_online_payment_enabled BOOLEAN NOT NULL DEFAULT true;

-- Comment for documentation
COMMENT ON COLUMN public.rounding_settings.parent_online_payment_enabled
IS 'Enable/disable online payment feature (QRIS/E-Wallet) for parent accounts. If disabled, parents must pay through cashier.';

-- Update existing row to have this setting enabled by default
UPDATE public.rounding_settings
SET parent_online_payment_enabled = true
WHERE parent_online_payment_enabled IS NULL;
