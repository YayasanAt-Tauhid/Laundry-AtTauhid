-- =====================================================
-- MIGRATION: Backend Price Validation for Laundry Orders
-- File: 20260124_validate_order_price_backend.sql
-- =====================================================
--
-- SECURITY FIX:
-- Previously, all price calculations were done on the frontend,
-- which is a security vulnerability. Users could manipulate prices
-- by modifying requests in browser DevTools.
--
-- This migration adds a trigger that:
-- 1. Fetches the correct price from laundry_prices table
-- 2. Recalculates total_price based on quantity
-- 3. Recalculates yayasan_share and vendor_share from revenue config
-- 4. Overrides any values sent from frontend with server-calculated values
--
-- =====================================================

-- =====================================================
-- STEP 1: Create the price validation function
-- =====================================================

CREATE OR REPLACE FUNCTION public.validate_and_calculate_order_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price_per_unit INTEGER;
  v_quantity DECIMAL(10,2);
  v_total_price INTEGER;
  v_yayasan_share INTEGER;
  v_vendor_share INTEGER;
  v_kiloan_yayasan_per_kg INTEGER;
  v_kiloan_vendor_per_kg INTEGER;
  v_non_kiloan_yayasan_percent DECIMAL(5,2);
  v_non_kiloan_vendor_percent DECIMAL(5,2);
  v_is_kiloan BOOLEAN;
BEGIN
  -- =====================================================
  -- STEP 1A: Get the correct price from laundry_prices table
  -- =====================================================
  SELECT price_per_unit INTO v_price_per_unit
  FROM public.laundry_prices
  WHERE category = NEW.category;

  -- If price not found in database, raise error
  IF v_price_per_unit IS NULL THEN
    RAISE EXCEPTION 'Price not found for category: %', NEW.category;
  END IF;

  -- =====================================================
  -- STEP 1B: Determine quantity based on category
  -- =====================================================
  v_is_kiloan := (NEW.category = 'kiloan');

  IF v_is_kiloan THEN
    -- For kiloan, use weight_kg
    v_quantity := COALESCE(NEW.weight_kg, 0);

    -- Validate: weight must be positive for kiloan
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'weight_kg must be positive for kiloan category. Got: %', v_quantity;
    END IF;

    -- Clear item_count for kiloan (should be NULL)
    NEW.item_count := NULL;
  ELSE
    -- For non-kiloan, use item_count
    v_quantity := COALESCE(NEW.item_count, 0);

    -- Validate: item_count must be positive for non-kiloan
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'item_count must be positive for non-kiloan category. Got: %', v_quantity;
    END IF;

    -- Clear weight_kg for non-kiloan (should be NULL)
    NEW.weight_kg := NULL;
  END IF;

  -- =====================================================
  -- STEP 1C: Calculate total price
  -- =====================================================
  v_total_price := ROUND(v_price_per_unit * v_quantity);

  -- =====================================================
  -- STEP 1D: Get revenue sharing configuration
  -- =====================================================
  SELECT
    COALESCE(kiloan_yayasan_per_kg, 2000),
    COALESCE(kiloan_vendor_per_kg, 5000),
    COALESCE(non_kiloan_yayasan_percent, 20.00),
    COALESCE(non_kiloan_vendor_percent, 80.00)
  INTO
    v_kiloan_yayasan_per_kg,
    v_kiloan_vendor_per_kg,
    v_non_kiloan_yayasan_percent,
    v_non_kiloan_vendor_percent
  FROM public.holiday_settings
  LIMIT 1;

  -- If no config found, use defaults
  IF NOT FOUND THEN
    v_kiloan_yayasan_per_kg := 2000;
    v_kiloan_vendor_per_kg := 5000;
    v_non_kiloan_yayasan_percent := 20.00;
    v_non_kiloan_vendor_percent := 80.00;
  END IF;

  -- =====================================================
  -- STEP 1E: Calculate revenue sharing
  -- =====================================================
  IF v_is_kiloan THEN
    -- For kiloan: fixed amount per kg
    v_yayasan_share := ROUND(v_kiloan_yayasan_per_kg * v_quantity);
    v_vendor_share := ROUND(v_kiloan_vendor_per_kg * v_quantity);
  ELSE
    -- For non-kiloan: percentage of total
    v_yayasan_share := ROUND(v_total_price * (v_non_kiloan_yayasan_percent / 100));
    v_vendor_share := ROUND(v_total_price * (v_non_kiloan_vendor_percent / 100));
  END IF;

  -- =====================================================
  -- STEP 1F: Override frontend values with calculated values
  -- =====================================================
  NEW.price_per_unit := v_price_per_unit;
  NEW.total_price := v_total_price;
  NEW.yayasan_share := v_yayasan_share;
  NEW.vendor_share := v_vendor_share;

  -- =====================================================
  -- STEP 1G: Log for debugging (optional - can be removed in production)
  -- =====================================================
  RAISE NOTICE 'Order price validated: category=%, qty=%, price_per_unit=%, total=%, yayasan=%, vendor=%',
    NEW.category, v_quantity, v_price_per_unit, v_total_price, v_yayasan_share, v_vendor_share;

  RETURN NEW;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.validate_and_calculate_order_price() IS
'Security function: Validates and recalculates order prices server-side.
Prevents price manipulation from frontend by always using prices from laundry_prices table
and revenue config from holiday_settings table.';

-- =====================================================
-- STEP 2: Create the trigger
-- =====================================================

-- Drop existing trigger if exists (idempotent)
DROP TRIGGER IF EXISTS trg_validate_order_price ON public.laundry_orders;

-- Create trigger for INSERT and UPDATE
CREATE TRIGGER trg_validate_order_price
  BEFORE INSERT OR UPDATE OF category, weight_kg, item_count, price_per_unit, total_price, yayasan_share, vendor_share
  ON public.laundry_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_and_calculate_order_price();

-- =====================================================
-- STEP 3: Create helper function to recalculate existing orders
-- (Run manually if needed to fix historical data)
-- =====================================================

CREATE OR REPLACE FUNCTION public.recalculate_all_order_prices()
RETURNS TABLE(
  order_id UUID,
  old_total INTEGER,
  new_total INTEGER,
  old_yayasan INTEGER,
  new_yayasan INTEGER,
  old_vendor INTEGER,
  new_vendor INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_price_per_unit INTEGER;
  v_quantity DECIMAL(10,2);
  v_total_price INTEGER;
  v_yayasan_share INTEGER;
  v_vendor_share INTEGER;
  v_kiloan_yayasan_per_kg INTEGER;
  v_kiloan_vendor_per_kg INTEGER;
  v_non_kiloan_yayasan_percent DECIMAL(5,2);
  v_non_kiloan_vendor_percent DECIMAL(5,2);
BEGIN
  -- Get revenue config
  SELECT
    COALESCE(kiloan_yayasan_per_kg, 2000),
    COALESCE(kiloan_vendor_per_kg, 5000),
    COALESCE(non_kiloan_yayasan_percent, 20.00),
    COALESCE(non_kiloan_vendor_percent, 80.00)
  INTO
    v_kiloan_yayasan_per_kg,
    v_kiloan_vendor_per_kg,
    v_non_kiloan_yayasan_percent,
    v_non_kiloan_vendor_percent
  FROM public.holiday_settings
  LIMIT 1;

  -- Process each order
  FOR v_order IN
    SELECT o.id, o.category, o.weight_kg, o.item_count,
           o.price_per_unit AS old_price, o.total_price AS old_total,
           o.yayasan_share AS old_yayasan, o.vendor_share AS old_vendor,
           p.price_per_unit
    FROM public.laundry_orders o
    JOIN public.laundry_prices p ON p.category = o.category
  LOOP
    -- Calculate quantity
    IF v_order.category = 'kiloan' THEN
      v_quantity := COALESCE(v_order.weight_kg, 0);
      v_yayasan_share := ROUND(v_kiloan_yayasan_per_kg * v_quantity);
      v_vendor_share := ROUND(v_kiloan_vendor_per_kg * v_quantity);
    ELSE
      v_quantity := COALESCE(v_order.item_count, 0);
      v_total_price := ROUND(v_order.price_per_unit * v_quantity);
      v_yayasan_share := ROUND(v_total_price * (v_non_kiloan_yayasan_percent / 100));
      v_vendor_share := ROUND(v_total_price * (v_non_kiloan_vendor_percent / 100));
    END IF;

    v_total_price := ROUND(v_order.price_per_unit * v_quantity);

    -- Only update if values differ
    IF v_order.old_total != v_total_price OR
       v_order.old_yayasan != v_yayasan_share OR
       v_order.old_vendor != v_vendor_share THEN

      -- Return the differences
      order_id := v_order.id;
      old_total := v_order.old_total;
      new_total := v_total_price;
      old_yayasan := v_order.old_yayasan;
      new_yayasan := v_yayasan_share;
      old_vendor := v_order.old_vendor;
      new_vendor := v_vendor_share;
      RETURN NEXT;

      -- Temporarily disable trigger to avoid recursion
      -- Note: The actual update will use the trigger anyway
    END IF;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.recalculate_all_order_prices() IS
'Helper function to identify orders with incorrect prices.
Run SELECT * FROM recalculate_all_order_prices() to see discrepancies.
Does NOT automatically fix data - review results first.';

-- =====================================================
-- STEP 4: Create function to actually fix historical data
-- (Use with caution!)
-- =====================================================

CREATE OR REPLACE FUNCTION public.fix_all_order_prices()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_order RECORD;
  v_price_per_unit INTEGER;
  v_quantity DECIMAL(10,2);
  v_total_price INTEGER;
  v_yayasan_share INTEGER;
  v_vendor_share INTEGER;
  v_kiloan_yayasan_per_kg INTEGER;
  v_kiloan_vendor_per_kg INTEGER;
  v_non_kiloan_yayasan_percent DECIMAL(5,2);
  v_non_kiloan_vendor_percent DECIMAL(5,2);
BEGIN
  -- Get revenue config
  SELECT
    COALESCE(kiloan_yayasan_per_kg, 2000),
    COALESCE(kiloan_vendor_per_kg, 5000),
    COALESCE(non_kiloan_yayasan_percent, 20.00),
    COALESCE(non_kiloan_vendor_percent, 80.00)
  INTO
    v_kiloan_yayasan_per_kg,
    v_kiloan_vendor_per_kg,
    v_non_kiloan_yayasan_percent,
    v_non_kiloan_vendor_percent
  FROM public.holiday_settings
  LIMIT 1;

  -- Temporarily disable the trigger to avoid issues
  ALTER TABLE public.laundry_orders DISABLE TRIGGER trg_validate_order_price;

  -- Process each order
  FOR v_order IN
    SELECT o.id, o.category, o.weight_kg, o.item_count, p.price_per_unit
    FROM public.laundry_orders o
    JOIN public.laundry_prices p ON p.category = o.category
  LOOP
    -- Calculate quantity and prices
    IF v_order.category = 'kiloan' THEN
      v_quantity := COALESCE(v_order.weight_kg, 0);
      v_total_price := ROUND(v_order.price_per_unit * v_quantity);
      v_yayasan_share := ROUND(v_kiloan_yayasan_per_kg * v_quantity);
      v_vendor_share := ROUND(v_kiloan_vendor_per_kg * v_quantity);
    ELSE
      v_quantity := COALESCE(v_order.item_count, 0);
      v_total_price := ROUND(v_order.price_per_unit * v_quantity);
      v_yayasan_share := ROUND(v_total_price * (v_non_kiloan_yayasan_percent / 100));
      v_vendor_share := ROUND(v_total_price * (v_non_kiloan_vendor_percent / 100));
    END IF;

    -- Update the order
    UPDATE public.laundry_orders
    SET
      price_per_unit = v_order.price_per_unit,
      total_price = v_total_price,
      yayasan_share = v_yayasan_share,
      vendor_share = v_vendor_share
    WHERE id = v_order.id;

    v_count := v_count + 1;
  END LOOP;

  -- Re-enable the trigger
  ALTER TABLE public.laundry_orders ENABLE TRIGGER trg_validate_order_price;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.fix_all_order_prices() IS
'CAUTION: This function recalculates and updates ALL order prices.
Use only if you need to fix historical data after enabling backend validation.
Returns the number of orders updated.';

-- =====================================================
-- STEP 5: Grant necessary permissions
-- =====================================================

-- Ensure authenticated users can execute the validation (via trigger)
-- The trigger runs with SECURITY DEFINER so it has full access

-- Only admins should be able to run the fix functions
REVOKE ALL ON FUNCTION public.recalculate_all_order_prices() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fix_all_order_prices() FROM PUBLIC;

-- =====================================================
-- VERIFICATION QUERIES (run manually to verify)
-- =====================================================

-- Check if trigger is created:
-- SELECT tgname, tgtype, tgenabled FROM pg_trigger WHERE tgname = 'trg_validate_order_price';

-- Check function exists:
-- SELECT proname, prosrc FROM pg_proc WHERE proname = 'validate_and_calculate_order_price';

-- Test by inserting an order with wrong prices (should be corrected):
-- INSERT INTO laundry_orders (student_id, partner_id, staff_id, category, weight_kg, price_per_unit, total_price, yayasan_share, vendor_share)
-- VALUES ('...', '...', '...', 'kiloan', 5, 1, 1, 1, 1)
-- RETURNING price_per_unit, total_price, yayasan_share, vendor_share;
-- ^ Should return corrected values (7000, 35000, 10000, 25000) not (1, 1, 1, 1)

-- =====================================================
-- END OF MIGRATION
-- =====================================================
