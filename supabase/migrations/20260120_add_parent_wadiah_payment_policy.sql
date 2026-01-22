-- =====================================================
-- ADD PARENT WADIAH PAYMENT POLICIES (SECURE VERSION)
-- =====================================================
-- Migration to allow parents to use wadiah balance for paying laundry bills
-- Uses SECURITY DEFINER function for safe balance manipulation
-- Parents CANNOT directly modify balance - only through validated function
-- =====================================================

-- =====================================================
-- DROP UNSAFE POLICIES IF THEY EXIST
-- =====================================================
DROP POLICY IF EXISTS "Parents can update own children wadiah balance for payment" ON public.student_wadiah_balance;
DROP POLICY IF EXISTS "Parents can create wadiah balance for own children" ON public.student_wadiah_balance;
DROP POLICY IF EXISTS "Parents can create wadiah transactions for own children" ON public.wadiah_transactions;

-- =====================================================
-- SELECT POLICIES (Safe - read only)
-- =====================================================

-- Ensure SELECT policy exists for parents on student_wadiah_balance
DROP POLICY IF EXISTS "Parents can view own children wadiah balance" ON public.student_wadiah_balance;

CREATE POLICY "Parents can view own children wadiah balance"
ON public.student_wadiah_balance
FOR SELECT
USING (
  student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
);

-- Ensure SELECT policy exists for parents on wadiah_transactions
DROP POLICY IF EXISTS "Parents can view own children wadiah transactions" ON public.wadiah_transactions;

CREATE POLICY "Parents can view own children wadiah transactions"
ON public.wadiah_transactions
FOR SELECT
USING (
  student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
);

-- =====================================================
-- SECURE FUNCTION: Parent Wadiah Payment
-- =====================================================
-- This function allows parents to use wadiah balance for payments
-- with proper validation and security checks
-- =====================================================

DROP FUNCTION IF EXISTS public.parent_use_wadiah_for_payment(UUID, UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.parent_use_wadiah_for_payment(
  p_student_id UUID,
  p_order_id UUID,
  p_amount INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID;
  v_student_parent_id UUID;
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_order_status TEXT;
  v_order_student_id UUID;
  v_order_total INTEGER;
  v_transaction_id UUID;
BEGIN
  -- Get current user (parent)
  v_parent_id := auth.uid();

  IF v_parent_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Unauthorized: User not authenticated'
    );
  END IF;

  -- Validate student belongs to parent
  SELECT parent_id INTO v_student_parent_id
  FROM public.students
  WHERE id = p_student_id;

  IF v_student_parent_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Student not found'
    );
  END IF;

  IF v_student_parent_id != v_parent_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Unauthorized: Student does not belong to this parent'
    );
  END IF;

  -- Validate amount is positive
  IF p_amount <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid amount: Must be greater than 0'
    );
  END IF;

  -- Validate order exists, belongs to student, and is in payable status
  SELECT status, student_id, total_price
  INTO v_order_status, v_order_student_id, v_order_total
  FROM public.laundry_orders
  WHERE id = p_order_id;

  IF v_order_status IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Order not found'
    );
  END IF;

  IF v_order_student_id != p_student_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Unauthorized: Order does not belong to this student'
    );
  END IF;

  IF v_order_status NOT IN ('DISETUJUI_MITRA', 'MENUNGGU_PEMBAYARAN') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Order is not in payable status'
    );
  END IF;

  -- Validate amount does not exceed order total
  IF p_amount > v_order_total THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Amount exceeds order total'
    );
  END IF;

  -- Get current wadiah balance with lock
  SELECT balance INTO v_current_balance
  FROM public.student_wadiah_balance
  WHERE student_id = p_student_id
  FOR UPDATE;

  -- If no balance record exists, balance is 0
  IF v_current_balance IS NULL THEN
    v_current_balance := 0;
  END IF;

  -- Validate sufficient balance
  IF v_current_balance < p_amount THEN
    RETURN json_build_object(
      'success', false,
      'error', format('Insufficient wadiah balance. Available: Rp %s, Required: Rp %s',
                      to_char(v_current_balance, 'FM999,999,999'),
                      to_char(p_amount, 'FM999,999,999'))
    );
  END IF;

  -- Calculate new balance (deduction only)
  v_new_balance := v_current_balance - p_amount;

  -- Insert transaction record
  INSERT INTO public.wadiah_transactions (
    student_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    order_id,
    notes,
    processed_by,
    customer_consent
  ) VALUES (
    p_student_id,
    'payment',
    p_amount,
    v_current_balance,
    v_new_balance,
    p_order_id,
    'Pembayaran tagihan laundry oleh parent via aplikasi',
    v_parent_id,
    true
  ) RETURNING id INTO v_transaction_id;

  -- Update or insert balance record
  INSERT INTO public.student_wadiah_balance (student_id, balance, total_used, last_transaction_at, updated_at)
  VALUES (p_student_id, v_new_balance, p_amount, now(), now())
  ON CONFLICT (student_id)
  DO UPDATE SET
    balance = v_new_balance,
    total_used = student_wadiah_balance.total_used + p_amount,
    last_transaction_at = now(),
    updated_at = now();

  -- Return success with transaction details
  RETURN json_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'amount_used', p_amount,
    'balance_before', v_current_balance,
    'balance_after', v_new_balance,
    'order_id', p_order_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', format('Database error: %s', SQLERRM)
    );
END;
$$;

-- =====================================================
-- SECURE FUNCTION: Parent Full Wadiah Payment
-- =====================================================
-- This function handles full payment with wadiah and updates order status
-- =====================================================

DROP FUNCTION IF EXISTS public.parent_pay_order_with_wadiah(UUID, UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.parent_pay_order_with_wadiah(
  p_student_id UUID,
  p_order_id UUID,
  p_wadiah_amount INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wadiah_result JSON;
  v_order_total INTEGER;
  v_remaining_amount INTEGER;
BEGIN
  -- First, use wadiah for payment
  v_wadiah_result := public.parent_use_wadiah_for_payment(p_student_id, p_order_id, p_wadiah_amount);

  -- If wadiah deduction failed, return error
  IF NOT (v_wadiah_result->>'success')::boolean THEN
    RETURN v_wadiah_result;
  END IF;

  -- Get order total
  SELECT total_price INTO v_order_total
  FROM public.laundry_orders
  WHERE id = p_order_id;

  v_remaining_amount := v_order_total - p_wadiah_amount;

  -- If wadiah covers full amount, mark order as paid
  IF v_remaining_amount <= 0 THEN
    UPDATE public.laundry_orders
    SET
      status = 'DIBAYAR',
      payment_method = 'wadiah',
      paid_at = now(),
      paid_amount = 0,
      wadiah_used = p_wadiah_amount,
      admin_fee = 0
    WHERE id = p_order_id;

    RETURN json_build_object(
      'success', true,
      'payment_complete', true,
      'wadiah_used', p_wadiah_amount,
      'remaining_amount', 0,
      'order_status', 'DIBAYAR',
      'message', 'Pembayaran berhasil dengan saldo wadiah'
    );
  ELSE
    -- Partial payment - just record wadiah used, order still needs remaining payment
    UPDATE public.laundry_orders
    SET
      wadiah_used = p_wadiah_amount
    WHERE id = p_order_id;

    RETURN json_build_object(
      'success', true,
      'payment_complete', false,
      'wadiah_used', p_wadiah_amount,
      'remaining_amount', v_remaining_amount,
      'order_status', 'MENUNGGU_PEMBAYARAN',
      'message', format('Saldo wadiah digunakan. Sisa tagihan: Rp %s', to_char(v_remaining_amount, 'FM999,999,999'))
    );
  END IF;
END;
$$;

-- =====================================================
-- Grant execute permissions on functions
-- =====================================================
GRANT EXECUTE ON FUNCTION public.parent_use_wadiah_for_payment(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_pay_order_with_wadiah(UUID, UUID, INTEGER) TO authenticated;

-- =====================================================
-- Ensure proper grants on tables (SELECT only for parents)
-- =====================================================
GRANT SELECT ON public.student_wadiah_balance TO authenticated;
GRANT SELECT ON public.wadiah_transactions TO authenticated;

-- =====================================================
-- Comments for documentation
-- =====================================================
COMMENT ON FUNCTION public.parent_use_wadiah_for_payment IS
'Secure function for parents to use wadiah balance for payments.
Validates: authentication, student ownership, order ownership, order status, sufficient balance.
Only allows balance DEDUCTIONS, never increases.';

COMMENT ON FUNCTION public.parent_pay_order_with_wadiah IS
'Secure function for parents to pay orders using wadiah balance.
Handles full payment (marks order as paid) or partial payment (records wadiah used).
Uses parent_use_wadiah_for_payment internally for balance validation.';

COMMENT ON POLICY "Parents can view own children wadiah balance"
ON public.student_wadiah_balance
IS 'Read-only access for parents to view their children wadiah balance';

COMMENT ON POLICY "Parents can view own children wadiah transactions"
ON public.wadiah_transactions
IS 'Read-only access for parents to view their children wadiah transaction history';
