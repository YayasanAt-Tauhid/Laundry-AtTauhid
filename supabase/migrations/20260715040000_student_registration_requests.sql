-- =====================================================
-- Student Registration Requests
-- Replaces the "admin bulk-imports students first" flow
-- with: parent registers -> submits child's NIK -> admin validates.
--
-- Covers two cases:
-- 1. Claim: NIK matches an existing student that has no parent_id yet
--    (must also provide the correct student_code).
-- 2. New: NIK does not exist yet, parent supplies name/class/nik.
-- Either way, nothing changes on `students` until an admin approves.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.student_registration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  nik TEXT NOT NULL,
  name TEXT NOT NULL,
  class TEXT NOT NULL,
  student_code_submitted TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_reg_requests_parent ON public.student_registration_requests(parent_id);
CREATE INDEX IF NOT EXISTS idx_student_reg_requests_status ON public.student_registration_requests(status);
CREATE INDEX IF NOT EXISTS idx_student_reg_requests_nik ON public.student_registration_requests(nik);

ALTER TABLE public.student_registration_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parents can view own requests" ON public.student_registration_requests;
CREATE POLICY "Parents can view own requests"
ON public.student_registration_requests FOR SELECT
TO authenticated
USING (parent_id = auth.uid());

DROP POLICY IF EXISTS "Admin can manage all requests" ON public.student_registration_requests;
CREATE POLICY "Admin can manage all requests"
ON public.student_registration_requests FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

COMMENT ON TABLE public.student_registration_requests IS
  'Pengajuan orang tua untuk mengklaim/mendaftarkan siswa. Menunggu validasi admin sebelum data students berubah.';

-- =====================================================
-- check_nik_available: also flag NIKs with a pending request
-- =====================================================

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
  v_pending RECORD;
BEGIN
  SELECT id, name, class, student_code, is_active, parent_id
  INTO v_existing
  FROM public.students
  WHERE nik = TRIM(p_nik)
    AND (p_exclude_id IS NULL OR id != p_exclude_id)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.parent_id IS NULL THEN
      SELECT id INTO v_pending
      FROM public.student_registration_requests
      WHERE nik = TRIM(p_nik) AND status = 'pending'
      LIMIT 1;

      IF FOUND THEN
        RETURN jsonb_build_object(
          'available', false,
          'message', 'NIK ini sudah diajukan dan sedang menunggu validasi admin.',
          'can_claim', false,
          'existing_student', jsonb_build_object(
            'id', v_existing.id,
            'name', v_existing.name,
            'class', v_existing.class,
            'student_code', v_existing.student_code,
            'is_active', v_existing.is_active,
            'parent_id', v_existing.parent_id
          )
        );
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'available', false,
      'message', CASE
        WHEN v_existing.parent_id IS NULL THEN 'NIK sudah terdaftar tetapi belum memiliki orang tua. Anda dapat mengajukan klaim siswa ini.'
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
  END IF;

  -- No existing student. Check for a pending new-student request on this NIK.
  SELECT id INTO v_pending
  FROM public.student_registration_requests
  WHERE nik = TRIM(p_nik) AND status = 'pending' AND student_id IS NULL
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'available', false,
      'message', 'NIK ini sudah diajukan dan sedang menunggu validasi admin.',
      'can_claim', false
    );
  END IF;

  RETURN jsonb_build_object(
    'available', true,
    'message', 'NIK tersedia',
    'can_claim', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_nik_available(TEXT, UUID) TO authenticated;

-- =====================================================
-- submit_student_registration_request: parent-facing entry point.
-- Never touches `students` directly - only creates a pending request.
-- =====================================================

CREATE OR REPLACE FUNCTION public.submit_student_registration_request(
  p_nik TEXT,
  p_name TEXT,
  p_class TEXT,
  p_student_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID := auth.uid();
  v_nik TEXT := TRIM(p_nik);
  v_name TEXT := TRIM(p_name);
  v_class TEXT := TRIM(p_class);
  v_student RECORD;
  v_request_id UUID;
BEGIN
  IF v_parent_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Anda harus login untuk mengajukan siswa');
  END IF;

  IF v_nik = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'NIK wajib diisi');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_registration_requests
    WHERE nik = v_nik AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'NIK ini sudah diajukan dan sedang menunggu validasi admin');
  END IF;

  SELECT id, name, class, nik, parent_id, student_code
  INTO v_student
  FROM public.students
  WHERE nik = v_nik;

  IF FOUND THEN
    IF v_student.parent_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'NIK sudah digunakan oleh siswa lain');
    END IF;

    IF p_student_code IS NULL OR TRIM(p_student_code) = '' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Kode siswa wajib diisi untuk verifikasi');
    END IF;

    IF UPPER(TRIM(p_student_code)) != UPPER(v_student.student_code) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Kode siswa tidak cocok. Hubungi admin untuk mendapatkan kode siswa yang benar.');
    END IF;

    INSERT INTO public.student_registration_requests
      (parent_id, student_id, nik, name, class, student_code_submitted, status)
    VALUES
      (v_parent_id, v_student.id, v_student.nik, v_student.name, v_student.class, TRIM(p_student_code), 'pending')
    RETURNING id INTO v_request_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'pending',
      'message', 'Pengajuan klaim siswa terkirim. Menunggu validasi admin.',
      'request_id', v_request_id
    );
  END IF;

  IF v_name = '' OR v_class = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Nama dan kelas siswa wajib diisi untuk siswa baru');
  END IF;

  INSERT INTO public.student_registration_requests
    (parent_id, student_id, nik, name, class, status)
  VALUES
    (v_parent_id, NULL, v_nik, v_name, v_class, 'pending')
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'pending',
    'message', 'Pengajuan siswa baru terkirim. Menunggu validasi admin.',
    'request_id', v_request_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_student_registration_request(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- =====================================================
-- review_student_registration_request: admin-only approve/reject.
-- Approving is the only path that ever creates/updates `students`
-- rows on behalf of a parent submission.
-- =====================================================

CREATE OR REPLACE FUNCTION public.review_student_registration_request(
  p_request_id UUID,
  p_decision TEXT,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req RECORD;
  v_current_parent UUID;
  v_new_student_id UUID;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Hanya admin yang dapat memvalidasi pengajuan');
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Keputusan tidak valid');
  END IF;

  SELECT * INTO v_req
  FROM public.student_registration_requests
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pengajuan tidak ditemukan atau sudah diproses');
  END IF;

  IF p_decision = 'rejected' THEN
    UPDATE public.student_registration_requests
    SET status = 'rejected',
        rejection_reason = p_rejection_reason,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Pengajuan ditolak');
  END IF;

  -- p_decision = 'approved'
  IF v_req.student_id IS NOT NULL THEN
    SELECT parent_id INTO v_current_parent FROM public.students WHERE id = v_req.student_id;

    IF v_current_parent IS NOT NULL THEN
      UPDATE public.student_registration_requests
      SET status = 'rejected',
          rejection_reason = 'Siswa sudah diklaim oleh orang tua lain',
          reviewed_by = auth.uid(),
          reviewed_at = now(),
          updated_at = now()
      WHERE id = p_request_id;

      RETURN jsonb_build_object('success', false, 'message', 'Siswa sudah diklaim oleh orang tua lain, pengajuan otomatis ditolak');
    END IF;

    UPDATE public.students SET parent_id = v_req.parent_id WHERE id = v_req.student_id;
  ELSE
    INSERT INTO public.students (parent_id, name, class, nik)
    VALUES (v_req.parent_id, v_req.name, v_req.class, v_req.nik)
    RETURNING id INTO v_new_student_id;

    UPDATE public.student_registration_requests SET student_id = v_new_student_id WHERE id = p_request_id;
  END IF;

  UPDATE public.student_registration_requests
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true, 'message', 'Pengajuan disetujui, siswa telah terhubung dengan orang tua');
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_student_registration_request(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.submit_student_registration_request IS 'Parent mengajukan klaim/pendaftaran siswa via NIK. Hanya membuat baris pending, tidak mengubah tabel students.';
COMMENT ON FUNCTION public.review_student_registration_request IS 'Admin menyetujui/menolak pengajuan siswa. Persetujuan adalah satu-satunya jalur yang membuat/mengubah baris students dari pengajuan parent.';
