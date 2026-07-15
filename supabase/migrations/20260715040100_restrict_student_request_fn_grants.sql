-- Tighten grants: these functions should only be callable by logged-in users,
-- not the anonymous role (PUBLIC grants EXECUTE by default on function creation).
REVOKE EXECUTE ON FUNCTION public.check_nik_available(TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_student_registration_request(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.review_student_registration_request(UUID, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.check_nik_available(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_student_registration_request(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_student_registration_request(UUID, TEXT, TEXT) TO authenticated;
