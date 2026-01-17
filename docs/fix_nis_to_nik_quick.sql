-- =====================================================
-- QUICK FIX: NIS to NIK Trigger Issue
-- File: fix_nis_to_nik_quick.sql
-- =====================================================
--
-- Problem: Error "record 'new' has no field 'nis'" saat import data
-- Cause: Database trigger masih menggunakan kolom 'nis' padahal sudah di-rename ke 'nik'
--
-- Jalankan script ini di Supabase Dashboard > SQL Editor
-- =====================================================

-- Step 1: Pastikan kolom sudah bernama 'nik'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'students'
    AND column_name = 'nis'
  ) THEN
    ALTER TABLE public.students RENAME COLUMN nis TO nik;
    RAISE NOTICE 'Column renamed from nis to nik';
  ELSE
    RAISE NOTICE 'Column already named nik - OK';
  END IF;
END $$;

-- Step 2: Drop dan recreate trigger generate_student_code
DROP FUNCTION IF EXISTS public.generate_student_code() CASCADE;

CREATE OR REPLACE FUNCTION public.generate_student_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT := 'STU';
  v_date_part TEXT;
  v_random_part TEXT;
BEGIN
  -- Generate student_code if not provided
  IF NEW.student_code IS NULL OR TRIM(NEW.student_code) = '' THEN
    v_date_part := TO_CHAR(NOW(), 'YYMMDD');
    v_random_part := UPPER(SUBSTRING(REPLACE(NEW.id::TEXT, '-', ''), 1, 6));
    NEW.student_code := v_prefix || '-' || v_date_part || '-' || v_random_part;
  END IF;

  -- Normalize NIK (FIXED: was NEW.nis)
  IF NEW.nik IS NOT NULL THEN
    NEW.nik := TRIM(NEW.nik);
  END IF;

  -- Normalize name and class
  NEW.name := TRIM(NEW.name);
  NEW.class := TRIM(NEW.class);

  RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trg_generate_student_code ON public.students;
CREATE TRIGGER trg_generate_student_code
  BEFORE INSERT ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_student_code();

-- Step 3: Drop dan recreate audit_student_changes function
DROP FUNCTION IF EXISTS public.audit_student_changes() CASCADE;

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
    IF OLD.class IS DISTINCT FROM NEW.class THEN
      v_changes := v_changes || jsonb_build_object('class_change', jsonb_build_object('from', OLD.class, 'to', NEW.class));
    END IF;

    IF OLD.name IS DISTINCT FROM NEW.name THEN
      v_changes := v_changes || jsonb_build_object('name_change', jsonb_build_object('from', OLD.name, 'to', NEW.name));
    END IF;

    -- FIXED: was OLD.nis/NEW.nis
    IF OLD.nik IS DISTINCT FROM NEW.nik THEN
      v_changes := v_changes || jsonb_build_object('nik_change', jsonb_build_object('from', OLD.nik, 'to', NEW.nik));
    END IF;

    IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
      v_changes := v_changes || jsonb_build_object('status_change', jsonb_build_object('from', OLD.is_active, 'to', NEW.is_active));
    END IF;

    IF OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
      v_changes := v_changes || jsonb_build_object('parent_change', jsonb_build_object('from', OLD.parent_id, 'to', NEW.parent_id));
    END IF;

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

-- Recreate audit trigger
DROP TRIGGER IF EXISTS trg_audit_student_changes ON public.students;
CREATE TRIGGER trg_audit_student_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_student_changes();

-- Step 4: Fix constraints
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_nis_unique;
DROP INDEX IF EXISTS idx_students_nis_unique;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'students_nik_unique'
    AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students ADD CONSTRAINT students_nik_unique UNIQUE (nik);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_students_nik ON public.students (nik);

-- Step 5: Fix helper functions
DROP FUNCTION IF EXISTS public.check_nis_available(TEXT, UUID);
DROP FUNCTION IF EXISTS public.check_nik_available(TEXT, UUID);

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

GRANT EXECUTE ON FUNCTION public.check_nik_available(TEXT, UUID) TO authenticated;

-- Done!
SELECT 'Migration completed successfully! NIS -> NIK fix applied.' AS result;
