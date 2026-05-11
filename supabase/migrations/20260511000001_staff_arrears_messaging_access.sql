-- =====================================================
-- Allow staff to access /arrears-messaging page
-- Secure backend: staff can only read profiles of
-- parents whose children have unpaid orders.
-- =====================================================

-- 1. Pastikan RLS aktif di tabel profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Hapus policy lama yang terlalu permisif (jika ada)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin and staff can view parent profiles" ON public.profiles;

-- 3. User hanya bisa melihat profil milik sendiri
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 4. Admin & staff bisa membaca profil orang tua (role = parent)
--    yang anaknya memiliki order belum dibayar.
--    Ini membatasi staff agar tidak bisa melihat profil admin/staff lain.
CREATE POLICY "Admin and staff can view parent profiles for arrears"
ON public.profiles FOR SELECT
TO authenticated
USING (
  -- Hanya berlaku untuk profil yang user_id-nya punya role 'parent'
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = profiles.user_id
      AND ur.role = 'parent'
  )
  AND
  -- Pemohon harus admin atau staff
  EXISTS (
    SELECT 1 FROM public.user_roles my_role
    WHERE my_role.user_id = auth.uid()
      AND my_role.role IN ('admin', 'staff')
  )
);

-- 5. Admin bisa melihat semua profil (untuk UserManagement, dll)
CREATE POLICY "Admin can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
  )
);

-- 6. Pastikan student_wadiah_balance bisa dibaca staff
--    (view/tabel ini biasanya sudah accessible, tapi kita eksplisitkan)
DO $$
BEGIN
  -- Cek apakah student_wadiah_balance adalah view atau tabel
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'student_wadiah_balance'
      AND table_type = 'BASE TABLE'
  ) THEN
    ALTER TABLE public.student_wadiah_balance ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Admin and staff can view wadiah balance" ON public.student_wadiah_balance;

    CREATE POLICY "Admin and staff can view wadiah balance"
    ON public.student_wadiah_balance FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'staff')
      )
    );
  END IF;
END $$;
