-- Read-only snapshot of relevant production function definitions, 2026-10-06.
CREATE OR REPLACE FUNCTION public.get_or_create_wadiah_balance(p_student_id uuid)
 RETURNS student_wadiah_balance
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance public.student_wadiah_balance;
BEGIN
  -- Try to get existing balance
  SELECT * INTO v_balance
  FROM public.student_wadiah_balance
  WHERE student_id = p_student_id;

  -- If not exists, create new one
  IF NOT FOUND THEN
    INSERT INTO public.student_wadiah_balance (student_id, balance)
    VALUES (p_student_id, 0)
    RETURNING * INTO v_balance;
  END IF;

  RETURN v_balance;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$
;
CREATE OR REPLACE FUNCTION public.process_wadiah_transaction(p_student_id uuid, p_transaction_type wadiah_transaction_type, p_amount integer, p_order_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_processed_by uuid DEFAULT NULL::uuid, p_customer_consent boolean DEFAULT true, p_original_amount integer DEFAULT NULL::integer, p_rounded_amount integer DEFAULT NULL::integer)
 RETURNS wadiah_transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_transaction public.wadiah_transactions;
  v_rounding_diff INTEGER;
BEGIN
  -- Get or create balance record
  PERFORM public.get_or_create_wadiah_balance(p_student_id);

  -- Get current balance with lock
  SELECT balance INTO v_current_balance
  FROM public.student_wadiah_balance
  WHERE student_id = p_student_id
  FOR UPDATE;

  -- Calculate new balance based on transaction type
  IF p_transaction_type IN ('deposit', 'change_deposit', 'refund', 'adjustment') THEN
    v_new_balance := v_current_balance + p_amount;
  ELSIF p_transaction_type = 'payment' THEN
    IF v_current_balance < p_amount THEN
      RAISE EXCEPTION 'Saldo wadiah tidak mencukupi. Saldo: %, Dibutuhkan: %', v_current_balance, p_amount;
    END IF;
    v_new_balance := v_current_balance - p_amount;
  ELSIF p_transaction_type = 'sedekah' THEN
    -- Sedekah is just a record, doesn't affect balance
    v_new_balance := v_current_balance;
  END IF;

  -- Calculate rounding difference if applicable
  v_rounding_diff := COALESCE(p_original_amount, 0) - COALESCE(p_rounded_amount, 0);

  -- Insert transaction record
  INSERT INTO public.wadiah_transactions (
    student_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    order_id,
    original_amount,
    rounded_amount,
    rounding_difference,
    notes,
    processed_by,
    customer_consent
  ) VALUES (
    p_student_id,
    p_transaction_type,
    p_amount,
    v_current_balance,
    v_new_balance,
    p_order_id,
    p_original_amount,
    p_rounded_amount,
    v_rounding_diff,
    p_notes,
    COALESCE(p_processed_by, auth.uid()),
    p_customer_consent
  ) RETURNING * INTO v_transaction;

  -- Update balance
  UPDATE public.student_wadiah_balance
  SET
    balance = v_new_balance,
    total_deposited = CASE
      WHEN p_transaction_type IN ('deposit', 'change_deposit')
      THEN total_deposited + p_amount
      ELSE total_deposited
    END,
    total_used = CASE
      WHEN p_transaction_type = 'payment'
      THEN total_used + p_amount
      ELSE total_used
    END,
    total_sedekah = CASE
      WHEN p_transaction_type = 'sedekah'
      THEN total_sedekah + p_amount
      ELSE total_sedekah
    END,
    last_transaction_at = now(),
    updated_at = now()
  WHERE student_id = p_student_id;

  RETURN v_transaction;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_and_calculate_order_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
