-- =====================================================
-- MIGRATION: Enforce Student Uniqueness with Mandatory NIS
-- File: 20260116_enforce_student_uniqueness.sql
-- =====================================================
--
-- Purpose:
-- 1. Make NIS (Nomor Induk Siswa) mandatory and unique
-- 2. Add auto-generated student_code as backup identifier
-- 3. Prevent exact duplicate entries
-- 4. Add audit trail for student data changes
-- 5. Add helper functions for duplicate detection
--
-- =====================================================

-- Enable pg_trgm extension for similarity search (if not exists)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =====================================================
-- STEP 1: Modify students table structure
-- =====================================================

-- 1a. Add student_code column
ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS student_code TEXT;

-- 1b. Make NIS required (NOT NULL) and ensure it's trimmed
-- First, update any existing NULL/empty NIS values if any exist
UPDATE public.students
SET nis = 'TEMP-' || UPPER(SUBSTRING(id::TEXT, 1, 8))
WHERE nis IS NULL OR TRIM(nis) = '';

-- Now alter the column to NOT NULL
ALTER TABLE public.students
ALTER COLUMN nis SET NOT NULL;

-- =====================================================
-- STEP 2: Add unique constraints and indexes
-- =====================================================

-- 2a. Unique constraint on NIS (primary business identifier)
ALTER TABLE public.students
DROP CONSTRAINT IF EXISTS students_nis_unique;

ALTER TABLE public.students
ADD CONSTRAINT students_nis_unique UNIQUE (nis);

-- 2b. Unique constraint on student_code
ALTER TABLE public.students
DROP CONSTRAINT IF EXISTS students_code_unique;

-- 2c. Index for faster name/class lookups
CREATE INDEX IF NOT EXISTS idx_students_name_class
ON public.students (LOWER(TRIM(name)), LOWER(TRIM(class)));

-- 2d. Index for parent lookups
CREATE INDEX IF NOT EXISTS idx_students_parent_active
ON public.students (parent_id, is_active);

-- =====================================================
-- STEP 3: Function to generate student code
-- =====================================================

CREATE OR REPLACE FUNCTION public.generate_student_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT := 'STU';
  v_date_part TEXT;
  v_random_part TEXT;
BEGIN
  -- Generate code if not provided
  IF NEW.student_code IS NULL OR TRIM(NEW.student_code) = '' THEN
    v_date_part := TO_CHAR(NOW(), 'YYMMDD');
    v_random_part := UPPER(SUBSTRING(REPLACE(NEW.id::TEXT, '-', ''), 1, 6));
    NEW.student_code := v_prefix || '-' || v_date_part || '-' || v_random_part;
  END IF;

  -- Normalize NIS (trim whitespace)
  NEW.nis := TRIM(NEW.nis);

  -- Normalize name and class (trim whitespace)
  NEW.name := TRIM(NEW.name);
  NEW.class := TRIM(NEW.class);

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists, then create
DROP TRIGGER IF EXISTS trigger_generate_student_code ON public.students;

CREATE TRIGGER trigger_generate_student_code
BEFORE INSERT ON public.students
FOR EACH ROW EXECUTE FUNCTION public.generate_student_code();

-- =====================================================
-- STEP 4: Populate existing students with codes
-- =====================================================

UPDATE public.students
SET student_code = 'STU-' || TO_CHAR(created_at, 'YYMMDD') || '-' || UPPER(SUBSTRING(REPLACE(id::TEXT, '-', ''), 1, 6))
WHERE student_code IS NULL;

-- Now make student_code NOT NULL and UNIQUE
ALTER TABLE public.students
ALTER COLUMN student_code SET NOT NULL;

ALTER TABLE public.students
ADD CONSTRAINT students_code_unique UNIQUE (student_code);

-- =====================================================
-- STEP 5: Audit trigger for student data changes
-- =====================================================

CREATE OR REPLACE FUNCTION public.audit_student_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_old_data JSONB := NULL;
  v_new_data JSONB := NULL;
  v_changes JSONB := '{}';
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT';
    v_new_data := to_jsonb(NEW);

    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id)
    VALUES ('students', NEW.id, v_action, v_old_data, v_new_data, auth.uid());

    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Track specific important changes
    IF OLD.class IS DISTINCT FROM NEW.class THEN
      v_changes := v_changes || jsonb_build_object('class_change', jsonb_build_object('from', OLD.class, 'to', NEW.class));
    END IF;

    IF OLD.name IS DISTINCT FROM NEW.name THEN
      v_changes := v_changes || jsonb_build_object('name_change', jsonb_build_object('from', OLD.name, 'to', NEW.name));
    END IF;

    IF OLD.nis IS DISTINCT FROM NEW.nis THEN
      v_changes := v_changes || jsonb_build_object('nis_change', jsonb_build_object('from', OLD.nis, 'to', NEW.nis));
    END IF;

    IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
      v_changes := v_changes || jsonb_build_object('status_change', jsonb_build_object('from', OLD.is_active, 'to', NEW.is_active));
    END IF;

    IF OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
      v_changes := v_changes || jsonb_build_object('parent_change', jsonb_build_object('from', OLD.parent_id, 'to', NEW.parent_id));
    END IF;

    -- Only log if there are actual changes to important fields
    IF v_changes != '{}' THEN
      v_action := 'UPDATE';
      v_old_data := to_jsonb(OLD);
      v_new_data := to_jsonb(NEW);
      v_new_data := v_new_data || jsonb_build_object('_changes', v_changes);

      INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id)
      VALUES ('students', NEW.id, v_action, v_old_data, v_new_data, auth.uid());
    END IF;

    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_old_data := to_jsonb(OLD);

    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id)
    VALUES ('students', OLD.id, v_action, v_old_data, v_new_data, auth.uid());

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- Drop existing trigger if exists, then create
DROP TRIGGER IF EXISTS trigger_audit_student_changes ON public.students;

CREATE TRIGGER trigger_audit_student_changes
AFTER INSERT OR UPDATE OR DELETE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.audit_student_changes();

-- =====================================================
-- STEP 6: Helper function to find potential duplicates
-- =====================================================

CREATE OR REPLACE FUNCTION public.find_potential_duplicate_students(
  p_name TEXT,
  p_class TEXT DEFAULT NULL,
  p_nis TEXT DEFAULT NULL,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  class TEXT,
  nis TEXT,
  student_code TEXT,
  parent_id UUID,
  is_active BOOLEAN,
  match_type TEXT,
  similarity_score NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.name,
    s.class,
    s.nis,
    s.student_code,
    s.parent_id,
    s.is_active,
    CASE
      WHEN s.nis = TRIM(COALESCE(p_nis, '')) AND p_nis IS NOT NULL AND TRIM(p_nis) != '' THEN 'EXACT_NIS'
      WHEN LOWER(TRIM(s.name)) = LOWER(TRIM(p_name)) AND LOWER(TRIM(s.class)) = LOWER(TRIM(COALESCE(p_class, s.class))) THEN 'EXACT_NAME_CLASS'
      WHEN LOWER(TRIM(s.name)) = LOWER(TRIM(p_name)) THEN 'EXACT_NAME'
      ELSE 'SIMILAR_NAME'
    END as match_type,
    GREATEST(
      similarity(LOWER(s.name), LOWER(TRIM(p_name))),
      CASE WHEN p_class IS NOT NULL THEN similarity(LOWER(s.class), LOWER(TRIM(p_class))) ELSE 0 END
    ) as similarity_score
  FROM public.students s
  WHERE
    (p_exclude_id IS NULL OR s.id != p_exclude_id)
    AND (
      -- Exact NIS match
      (p_nis IS NOT NULL AND TRIM(p_nis) != '' AND s.nis = TRIM(p_nis))
      -- Exact name match
      OR LOWER(TRIM(s.name)) = LOWER(TRIM(p_name))
      -- Similar name (using trigram similarity)
      OR similarity(LOWER(s.name), LOWER(TRIM(p_name))) > 0.6
    )
  ORDER BY
    CASE
      WHEN s.nis = TRIM(COALESCE(p_nis, '')) AND p_nis IS NOT NULL THEN 1
      WHEN LOWER(TRIM(s.name)) = LOWER(TRIM(p_name)) AND LOWER(TRIM(s.class)) = LOWER(TRIM(COALESCE(p_class, s.class))) THEN 2
      WHEN LOWER(TRIM(s.name)) = LOWER(TRIM(p_name)) THEN 3
      ELSE 4
    END,
    similarity_score DESC
  LIMIT 10;
$$;

-- =====================================================
-- STEP 7: Function to check NIS availability
-- =====================================================

CREATE OR REPLACE FUNCTION public.check_nis_available(
  p_nis TEXT,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
BEGIN
  SELECT id, name, class, student_code, is_active
  INTO v_existing
  FROM public.students
  WHERE nis = TRIM(p_nis)
    AND (p_exclude_id IS NULL OR id != p_exclude_id)
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'available', false,
      'message', 'NIS sudah digunakan oleh siswa lain',
      'existing_student', jsonb_build_object(
        'id', v_existing.id,
        'name', v_existing.name,
        'class', v_existing.class,
        'student_code', v_existing.student_code,
        'is_active', v_existing.is_active
      )
    );
  ELSE
    RETURN jsonb_build_object(
      'available', true,
      'message', 'NIS tersedia'
    );
  END IF;
END;
$$;

-- =====================================================
-- STEP 8: Function to merge duplicate students (for admin use)
-- =====================================================

CREATE OR REPLACE FUNCTION public.merge_duplicate_students(
  p_keep_id UUID,
  p_merge_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orders_updated INTEGER := 0;
  v_wadiah_merged INTEGER := 0;
  v_students_deactivated INTEGER := 0;
  v_total_wadiah_balance INTEGER := 0;
  v_keep_student RECORD;
  v_merge_id UUID;
BEGIN
  -- Validate keep_id exists and is active
  SELECT * INTO v_keep_student
  FROM public.students
  WHERE id = p_keep_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Siswa utama (keep_id) tidak ditemukan atau tidak aktif'
    );
  END IF;

  -- Validate all merge_ids exist
  FOREACH v_merge_id IN ARRAY p_merge_ids
  LOOP
    IF v_merge_id = p_keep_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'ID siswa utama tidak boleh ada dalam daftar merge'
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = v_merge_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Siswa dengan ID ' || v_merge_id || ' tidak ditemukan'
      );
    END IF;
  END LOOP;

  -- 1. Update all laundry_orders to point to keep_id
  UPDATE public.laundry_orders
  SET student_id = p_keep_id,
      notes = COALESCE(notes, '') || ' [Merged from student ' || student_id || ']'
  WHERE student_id = ANY(p_merge_ids);

  GET DIAGNOSTICS v_orders_updated = ROW_COUNT;

  -- 2. Sum up wadiah balances from merged students
  SELECT COALESCE(SUM(balance), 0) INTO v_total_wadiah_balance
  FROM public.student_wadiah_balance
  WHERE student_id = ANY(p_merge_ids);

  -- 3. Add merged balance to keep_id (or create if not exists)
  IF v_total_wadiah_balance > 0 THEN
    INSERT INTO public.student_wadiah_balance (student_id, balance, total_deposited)
    VALUES (p_keep_id, v_total_wadiah_balance, v_total_wadiah_balance)
    ON CONFLICT (student_id) DO UPDATE
    SET balance = student_wadiah_balance.balance + EXCLUDED.balance,
        total_deposited = student_wadiah_balance.total_deposited + EXCLUDED.total_deposited,
        updated_at = NOW();
  END IF;

  -- 4. Update wadiah_transactions to point to keep_id
  UPDATE public.wadiah_transactions
  SET student_id = p_keep_id,
      notes = COALESCE(notes, '') || ' [Merged]'
  WHERE student_id = ANY(p_merge_ids);

  -- 5. Delete wadiah balances from merged students
  DELETE FROM public.student_wadiah_balance
  WHERE student_id = ANY(p_merge_ids);

  GET DIAGNOSTICS v_wadiah_merged = ROW_COUNT;

  -- 6. Soft-delete merged students (mark as inactive with merge note)
  UPDATE public.students
  SET is_active = false,
      name = name || ' [MERGED→' || v_keep_student.student_code || ']',
      updated_at = NOW()
  WHERE id = ANY(p_merge_ids);

  GET DIAGNOSTICS v_students_deactivated = ROW_COUNT;

  -- 7. Log the merge action
  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id)
  VALUES (
    'students',
    p_keep_id,
    'MERGE',
    jsonb_build_object('merged_student_ids', p_merge_ids),
    jsonb_build_object(
      'keep_student_id', p_keep_id,
      'orders_updated', v_orders_updated,
      'wadiah_balance_transferred', v_total_wadiah_balance,
      'students_deactivated', v_students_deactivated
    ),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Berhasil menggabungkan data siswa',
    'details', jsonb_build_object(
      'keep_student', jsonb_build_object(
        'id', v_keep_student.id,
        'name', v_keep_student.name,
        'student_code', v_keep_student.student_code
      ),
      'orders_updated', v_orders_updated,
      'wadiah_balance_transferred', v_total_wadiah_balance,
      'students_deactivated', v_students_deactivated
    )
  );
END;
$$;

-- =====================================================
-- STEP 9: Grant permissions
-- =====================================================

GRANT EXECUTE ON FUNCTION public.find_potential_duplicate_students(TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_nis_available(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_students(UUID, UUID[]) TO authenticated;

-- =====================================================
-- STEP 10: Add comments for documentation
-- =====================================================

COMMENT ON COLUMN public.students.nis IS 'Nomor Induk Siswa - wajib diisi dan unik untuk setiap siswa';
COMMENT ON COLUMN public.students.student_code IS 'Kode siswa auto-generated untuk identifikasi cepat (format: STU-YYMMDD-XXXXXX)';
COMMENT ON CONSTRAINT students_nis_unique ON public.students IS 'Memastikan NIS unik untuk setiap siswa';
COMMENT ON CONSTRAINT students_code_unique ON public.students IS 'Memastikan student_code unik untuk setiap siswa';

COMMENT ON FUNCTION public.find_potential_duplicate_students IS 'Mencari siswa yang berpotensi duplikat berdasarkan nama, kelas, atau NIS';
COMMENT ON FUNCTION public.check_nis_available IS 'Mengecek apakah NIS tersedia atau sudah digunakan';
COMMENT ON FUNCTION public.merge_duplicate_students IS 'Menggabungkan data siswa duplikat ke satu record utama (admin only)';
COMMENT ON FUNCTION public.audit_student_changes IS 'Mencatat semua perubahan data siswa ke audit_logs';
COMMENT ON FUNCTION public.generate_student_code IS 'Auto-generate student_code saat insert';
