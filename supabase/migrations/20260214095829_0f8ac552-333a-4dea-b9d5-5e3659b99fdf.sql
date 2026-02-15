-- Remove the policy that allows parents to delete students
DROP POLICY IF EXISTS "Parents can delete own students" ON public.students;