
-- =====================================================
-- FIX 1: Restrict laundry_partners visibility
-- Remove public access, allow only authenticated users
-- =====================================================

DROP POLICY IF EXISTS "Everyone can view active partners" ON public.laundry_partners;

CREATE POLICY "Authenticated users can view active partners"
ON public.laundry_partners FOR SELECT
TO authenticated
USING (is_active = true);

-- =====================================================
-- FIX 2: Add student_code verification to claim_student
-- Parent must provide correct student_code to claim
-- =====================================================

DROP FUNCTION IF EXISTS public.claim_student(UUID, UUID);

CREATE OR REPLACE FUNCTION public.claim_student(
  p_student_id UUID,
  p_parent_id UUID,
  p_student_code TEXT DEFAULT NULL
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
  SELECT id, name, class, nik, parent_id, student_code
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

  -- Verify student_code for security
  IF p_student_code IS NULL OR TRIM(p_student_code) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kode siswa wajib diisi untuk verifikasi'
    );
  END IF;

  IF UPPER(TRIM(p_student_code)) != UPPER(v_student.student_code) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kode siswa tidak cocok. Hubungi admin untuk mendapatkan kode siswa yang benar.'
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

GRANT EXECUTE ON FUNCTION public.claim_student(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.claim_student IS 'Mengklaim siswa yang sudah ada (tanpa parent_id). Memerlukan student_code yang benar sebagai verifikasi keamanan.';
