-- =====================================================
-- SISTEM WADIAH (TITIPAN/DEPOSIT) DAN PEMBULATAN SYARIAH
-- =====================================================
-- Prinsip Syariah:
-- 1. Antaradin (kerelaan kedua pihak)
-- 2. Transparansi (tidak ada gharar/ketidakjelasan)
-- 3. Pembulatan ke bawah = sedekah/diskon (dianjurkan)
-- 4. Pembulatan ke atas = wajib izin pelanggan
-- 5. Sisa kembalian bisa jadi titipan (wadiah)
-- =====================================================

-- Enum for rounding policy
CREATE TYPE public.rounding_policy AS ENUM (
  'none',           -- Tidak ada pembulatan
  'round_down',     -- Pembulatan ke bawah (sedekah/diskon)
  'round_up_ask',   -- Pembulatan ke atas dengan izin
  'to_wadiah'       -- Sisa kembalian jadi saldo wadiah
);

-- Enum for wadiah transaction type
CREATE TYPE public.wadiah_transaction_type AS ENUM (
  'deposit',        -- Setoran langsung
  'change_deposit', -- Sisa kembalian dimasukkan ke saldo
  'payment',        -- Penggunaan saldo untuk pembayaran
  'refund',         -- Pengembalian saldo (tarik tunai)
  'adjustment',     -- Penyesuaian admin
  'sedekah'         -- Diskon dari pembulatan ke bawah (catatan)
);

-- =====================================================
-- TABLE: student_wadiah_balance (Saldo Wadiah per Siswa)
-- =====================================================
CREATE TABLE public.student_wadiah_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0,  -- Saldo dalam Rupiah
  total_deposited INTEGER NOT NULL DEFAULT 0,  -- Total pernah disetor
  total_used INTEGER NOT NULL DEFAULT 0,  -- Total pernah digunakan
  total_sedekah INTEGER NOT NULL DEFAULT 0,  -- Total diskon dari pembulatan
  last_transaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraint: saldo tidak boleh negatif
  CONSTRAINT balance_non_negative CHECK (balance >= 0)
);

-- =====================================================
-- TABLE: wadiah_transactions (Riwayat Transaksi Wadiah)
-- =====================================================
CREATE TABLE public.wadiah_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  transaction_type wadiah_transaction_type NOT NULL,
  amount INTEGER NOT NULL,  -- Jumlah transaksi (positif)
  balance_before INTEGER NOT NULL,  -- Saldo sebelum transaksi
  balance_after INTEGER NOT NULL,  -- Saldo setelah transaksi

  -- Referensi ke order jika terkait pembayaran
  order_id UUID REFERENCES public.laundry_orders(id) ON DELETE SET NULL,

  -- Informasi pembulatan (jika ada)
  original_amount INTEGER,  -- Jumlah asli sebelum pembulatan
  rounded_amount INTEGER,   -- Jumlah setelah pembulatan
  rounding_difference INTEGER,  -- Selisih pembulatan

  -- Metadata
  notes TEXT,
  processed_by UUID REFERENCES auth.users(id),  -- Kasir/Admin yang memproses
  customer_consent BOOLEAN DEFAULT true,  -- Persetujuan pelanggan (antaradin)

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- TABLE: rounding_settings (Pengaturan Pembulatan)
-- =====================================================
CREATE TABLE public.rounding_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Kebijakan pembulatan default
  default_policy rounding_policy NOT NULL DEFAULT 'round_down',

  -- Kelipatan pembulatan (misal: 500, 1000, 5000)
  rounding_multiple INTEGER NOT NULL DEFAULT 500,

  -- Aktifkan sistem wadiah
  wadiah_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Minimum saldo untuk bisa digunakan
  minimum_usage_balance INTEGER NOT NULL DEFAULT 0,

  -- Informasi kebijakan yang ditampilkan ke pelanggan
  policy_info_text TEXT NOT NULL DEFAULT 'Pembulatan ke bawah dianggap sebagai sedekah/diskon. Sisa kembalian dapat disimpan sebagai saldo untuk transaksi berikutnya.',

  -- Tampilkan info kebijakan di awal transaksi
  show_policy_at_start BOOLEAN NOT NULL DEFAULT true,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- =====================================================
-- Add payment_method and rounding info to laundry_orders
-- =====================================================
ALTER TABLE public.laundry_orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS paid_amount INTEGER,  -- Jumlah yang dibayarkan pelanggan
  ADD COLUMN IF NOT EXISTS change_amount INTEGER DEFAULT 0,  -- Kembalian
  ADD COLUMN IF NOT EXISTS wadiah_used INTEGER DEFAULT 0,  -- Saldo wadiah yang digunakan
  ADD COLUMN IF NOT EXISTS rounding_applied INTEGER DEFAULT 0,  -- Pembulatan yang diterapkan
  ADD COLUMN IF NOT EXISTS rounding_type rounding_policy;  -- Jenis pembulatan

-- =====================================================
-- Enable RLS
-- =====================================================
ALTER TABLE public.student_wadiah_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wadiah_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounding_settings ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS Policies for student_wadiah_balance
-- =====================================================

-- Parents can view their own children's balance
CREATE POLICY "Parents can view own children wadiah balance"
ON public.student_wadiah_balance
FOR SELECT
USING (
  student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
);

-- Staff can view all balances
CREATE POLICY "Staff can view all wadiah balances"
ON public.student_wadiah_balance
FOR SELECT
USING (public.has_role(auth.uid(), 'staff'));

-- Cashier can view all balances
CREATE POLICY "Cashier can view all wadiah balances"
ON public.student_wadiah_balance
FOR SELECT
USING (public.has_role(auth.uid(), 'cashier'));

-- Cashier can manage balances
CREATE POLICY "Cashier can manage wadiah balances"
ON public.student_wadiah_balance
FOR ALL
USING (public.has_role(auth.uid(), 'cashier'))
WITH CHECK (public.has_role(auth.uid(), 'cashier'));

-- Admin can manage all balances
CREATE POLICY "Admin can manage all wadiah balances"
ON public.student_wadiah_balance
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- RLS Policies for wadiah_transactions
-- =====================================================

-- Parents can view their own children's transactions
CREATE POLICY "Parents can view own children wadiah transactions"
ON public.wadiah_transactions
FOR SELECT
USING (
  student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
);

-- Staff can view all transactions
CREATE POLICY "Staff can view all wadiah transactions"
ON public.wadiah_transactions
FOR SELECT
USING (public.has_role(auth.uid(), 'staff'));

-- Cashier can view and create transactions
CREATE POLICY "Cashier can view wadiah transactions"
ON public.wadiah_transactions
FOR SELECT
USING (public.has_role(auth.uid(), 'cashier'));

CREATE POLICY "Cashier can create wadiah transactions"
ON public.wadiah_transactions
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'cashier'));

-- Admin can manage all transactions
CREATE POLICY "Admin can manage all wadiah transactions"
ON public.wadiah_transactions
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- RLS Policies for rounding_settings
-- =====================================================

-- Everyone authenticated can view settings
CREATE POLICY "Everyone can view rounding settings"
ON public.rounding_settings
FOR SELECT
TO authenticated
USING (true);

-- Only admin can manage settings
CREATE POLICY "Admin can manage rounding settings"
ON public.rounding_settings
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to get or create wadiah balance for a student
CREATE OR REPLACE FUNCTION public.get_or_create_wadiah_balance(p_student_id UUID)
RETURNS public.student_wadiah_balance
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Function to add wadiah transaction and update balance
CREATE OR REPLACE FUNCTION public.process_wadiah_transaction(
  p_student_id UUID,
  p_transaction_type wadiah_transaction_type,
  p_amount INTEGER,
  p_order_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_processed_by UUID DEFAULT NULL,
  p_customer_consent BOOLEAN DEFAULT true,
  p_original_amount INTEGER DEFAULT NULL,
  p_rounded_amount INTEGER DEFAULT NULL
)
RETURNS public.wadiah_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Function to calculate rounded amount
CREATE OR REPLACE FUNCTION public.calculate_rounded_amount(
  p_amount INTEGER,
  p_rounding_multiple INTEGER DEFAULT 500,
  p_round_down BOOLEAN DEFAULT true
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_round_down THEN
    -- Pembulatan ke bawah (floor)
    RETURN FLOOR(p_amount::DECIMAL / p_rounding_multiple) * p_rounding_multiple;
  ELSE
    -- Pembulatan ke atas (ceiling)
    RETURN CEILING(p_amount::DECIMAL / p_rounding_multiple) * p_rounding_multiple;
  END IF;
END;
$$;

-- =====================================================
-- Insert default settings
-- =====================================================
INSERT INTO public.rounding_settings (
  default_policy,
  rounding_multiple,
  wadiah_enabled,
  minimum_usage_balance,
  policy_info_text,
  show_policy_at_start
) VALUES (
  'round_down',
  500,
  true,
  0,
  'Sesuai prinsip syariah, pembulatan ke bawah dianggap sebagai sedekah/diskon dari kami untuk Anda. Sisa kembalian dapat disimpan sebagai saldo (wadiah) untuk transaksi berikutnya. Semua transaksi didasarkan atas kerelaan kedua belah pihak (antaradin).',
  true
) ON CONFLICT DO NOTHING;

-- =====================================================
-- Create indexes for performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_wadiah_transactions_student_id
ON public.wadiah_transactions(student_id);

CREATE INDEX IF NOT EXISTS idx_wadiah_transactions_created_at
ON public.wadiah_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wadiah_transactions_order_id
ON public.wadiah_transactions(order_id)
WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_wadiah_balance_student_id
ON public.student_wadiah_balance(student_id);

-- =====================================================
-- Grant permissions
-- =====================================================
GRANT EXECUTE ON FUNCTION public.get_or_create_wadiah_balance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_wadiah_transaction(UUID, wadiah_transaction_type, INTEGER, UUID, TEXT, UUID, BOOLEAN, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_rounded_amount(INTEGER, INTEGER, BOOLEAN) TO authenticated;

-- =====================================================
-- Comments for documentation
-- =====================================================
COMMENT ON TABLE public.student_wadiah_balance IS 'Saldo wadiah (titipan) per siswa sesuai prinsip syariah';
COMMENT ON TABLE public.wadiah_transactions IS 'Riwayat transaksi wadiah untuk transparansi dan audit';
COMMENT ON TABLE public.rounding_settings IS 'Pengaturan kebijakan pembulatan sesuai syariah';
COMMENT ON FUNCTION public.process_wadiah_transaction IS 'Memproses transaksi wadiah dengan validasi dan update saldo otomatis';
COMMENT ON FUNCTION public.calculate_rounded_amount IS 'Menghitung pembulatan sesuai kelipatan yang ditentukan';
