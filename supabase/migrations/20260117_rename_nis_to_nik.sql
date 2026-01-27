-- =====================================================
-- MIGRATION: Rename NIS to NIK
-- File: 20260117_rename_nis_to_nik.sql
-- =====================================================
--
-- Purpose:
-- Rename column 'nis' to 'nik' across all related objects
-- (column, constraints, indexes, functions)
--
-- =====================================================

-- =====================================================
-- STEP 1: Rename column
-- =====================================================

ALTER TABLE public.students
RENAME COLUMN nis TO nik;

-- =====================================================
-- STEP 2: Rename constraints
-- =====================================================

ALTER TABLE public.students
DROP CONSTRAINT IF EXISTS students_nis_unique;

ALTER TABLE public.students
ADD CONSTRAINT students_nik_unique UNIQUE (nik);

-- =====================================================
-- STEP 3: Rename indexes (if any standalone indexes exist)
-- =====================================================

DROP INDEX IF EXISTS idx_students_nis_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_nik_unique
ON public.students (nik);

-- =====================================================
-- STEP 4: Drop old functions and recreate with new names
-- =====================================================

-- Drop old check_nis_available function
DROP FUNCTION IF EXISTS public.check_nis_available(TEXT, UUID);

-- Create new check_nik_available function
CREATE OR REPLACE FUNCTION public.check_nik_available(
  p_nik TEXT,
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
  WHERE nik = TRIM(p_nik)
    AND (p_exclude_id IS NULL OR id != p_exclude_id)
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'available', false,
      'message', 'NIK sudah digunakan oleh siswa lain',
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
      'message', 'NIK tersedia'
    );
  END IF;
END;
$$;

-- =====================================================
-- STEP 5: Update find_potential_duplicate_students function
-- =====================================================

DROP FUNCTION IF EXISTS public.find_potential_duplicate_students(TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.find_potential_duplicate_students(
  p_name TEXT,
  p_class TEXT DEFAULT NULL,
  p_nik TEXT DEFAULT NULL,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  class TEXT,
  nik TEXT,
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
    s.nik,
    s.student_code,
    s.parent_id,
    s.is_active,
    CASE
      WHEN s.nik = TRIM(COALESCE(p_nik, '')) AND p_nik IS NOT NULL AND TRIM(p_nik) != '' THEN 'EXACT_NIK'
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
      -- Exact NIK match
      (p_nik IS NOT NULL AND TRIM(p_nik) != '' AND s.nik = TRIM(p_nik))
      -- Exact name match
      OR LOWER(TRIM(s.name)) = LOWER(TRIM(p_name))
      -- Similar name (using trigram similarity)
      OR similarity(LOWER(s.name), LOWER(TRIM(p_name))) > 0.6
    )
  ORDER BY
    CASE
      WHEN s.nik = TRIM(COALESCE(p_nik, '')) AND p_nik IS NOT NULL THEN 1
      WHEN LOWER(TRIM(s.name)) = LOWER(TRIM(p_name)) AND LOWER(TRIM(s.class)) = LOWER(TRIM(COALESCE(p_class, s.class))) THEN 2
      WHEN LOWER(TRIM(s.name)) = LOWER(TRIM(p_name)) THEN 3
      ELSE 4
    END,
    similarity_score DESC
  LIMIT 10;
$$;

-- =====================================================
-- STEP 6: Update generate_student_code function to normalize NIK
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

  -- Normalize NIK (trim whitespace)
  NEW.nik := TRIM(NEW.nik);

  -- Normalize name and class (trim whitespace)
  NEW.name := TRIM(NEW.name);
  NEW.class := TRIM(NEW.class);

  RETURN NEW;
END;
$$;

-- =====================================================
-- STEP 7: Update audit function for NIK changes
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

    IF OLD.nik IS DISTINCT FROM NEW.nik THEN
      v_changes := v_changes || jsonb_build_object('nik_change', jsonb_build_object('from', OLD.nik, 'to', NEW.nik));
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

-- =====================================================
-- STEP 8: Grant permissions for new function
-- =====================================================

GRANT EXECUTE ON FUNCTION public.check_nik_available(TEXT, UUID) TO authenticated;

-- =====================================================
-- STEP 9: Update comments
-- =====================================================

COMMENT ON COLUMN public.students.nik IS 'Nomor Induk Kependudukan/Siswa - wajib diisi dan unik untuk setiap siswa';
COMMENT ON CONSTRAINT students_nik_unique ON public.students IS 'Memastikan NIK unik untuk setiap siswa';
COMMENT ON FUNCTION public.check_nik_available IS 'Mengecek apakah NIK tersedia atau sudah digunakan';
COMMENT ON FUNCTION public.find_potential_duplicate_students IS 'Mencari siswa yang berpotensi duplikat berdasarkan nama, kelas, atau NIK';
