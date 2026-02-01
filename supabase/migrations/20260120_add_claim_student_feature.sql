-- =====================================================
-- Migration: Add Claim Student Feature
-- Description: Update check_nik_available to include parent_id info
--              so parents can claim existing students
-- =====================================================

-- =====================================================
-- STEP 1: Update check_nik_available function to include parent_id
-- =====================================================

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
  SELECT id, name, class, student_code, is_active, parent_id
  INTO v_existing
  FROM public.students
  WHERE nik = TRIM(p_nik)
    AND (p_exclude_id IS NULL OR id != p_exclude_id)
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'available', false,
      'message', CASE
        WHEN v_existing.parent_id IS NULL THEN 'NIK sudah terdaftar tetapi belum memiliki orang tua. Anda dapat mengklaim siswa ini.'
        ELSE 'NIK sudah digunakan oleh siswa lain'
      END,
      'can_claim', v_existing.parent_id IS NULL,
      'existing_student', jsonb_build_object(
        'id', v_existing.id,
        'name', v_existing.name,
        'class', v_existing.class,
        'student_code', v_existing.student_code,
        'is_active', v_existing.is_active,
        'parent_id', v_existing.parent_id
      )
    );
  ELSE
    RETURN jsonb_build_object(
      'available', true,
      'message', 'NIK tersedia',
      'can_claim', false
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_nik_available(TEXT, UUID) TO authenticated;

-- =====================================================
-- STEP 2: Create function to claim student
-- =====================================================

DROP FUNCTION IF EXISTS public.claim_student(UUID, UUID);

CREATE OR REPLACE FUNCTION public.claim_student(
  p_student_id UUID,
  p_parent_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student RECORD;
BEGIN
  -- Check if student exists
  SELECT id, name, class, nik, parent_id
  INTO v_student
  FROM public.students
  WHERE id = p_student_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Siswa tidak ditemukan'
    );
  END IF;

  -- Check if student already has a parent
  IF v_student.parent_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Siswa sudah terhubung dengan orang tua lain'
    );
  END IF;

  -- Update student's parent_id
  UPDATE public.students
  SET parent_id = p_parent_id
  WHERE id = p_student_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Berhasil mengklaim siswa',
    'student', jsonb_build_object(
      'id', v_student.id,
      'name', v_student.name,
      'class', v_student.class,
      'nik', v_student.nik
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_student(UUID, UUID) TO authenticated;

-- =====================================================
-- STEP 3: Add comments
-- =====================================================

COMMENT ON FUNCTION public.check_nik_available IS 'Mengecek apakah NIK tersedia, sudah digunakan, atau dapat diklaim oleh orang tua';
COMMENT ON FUNCTION public.claim_student IS 'Mengklaim siswa yang sudah ada dan menghubungkannya dengan akun orang tua';
