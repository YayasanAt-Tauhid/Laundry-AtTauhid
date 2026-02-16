
-- Security: Clear midtrans_snap_token from orders that are already paid/completed
-- These tokens are no longer needed and shouldn't be stored
UPDATE public.laundry_orders 
SET midtrans_snap_token = NULL 
WHERE status IN ('DIBAYAR', 'SELESAI') 
AND midtrans_snap_token IS NOT NULL;

-- Create a scheduled cleanup: auto-clear snap tokens on paid orders
CREATE OR REPLACE FUNCTION public.clear_paid_order_tokens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When order is marked as paid or completed, clear the snap token
  IF NEW.status IN ('DIBAYAR', 'SELESAI') AND OLD.status NOT IN ('DIBAYAR', 'SELESAI') THEN
    NEW.midtrans_snap_token := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to auto-clear tokens
DROP TRIGGER IF EXISTS trg_clear_paid_tokens ON public.laundry_orders;
CREATE TRIGGER trg_clear_paid_tokens
  BEFORE UPDATE ON public.laundry_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_paid_order_tokens();
