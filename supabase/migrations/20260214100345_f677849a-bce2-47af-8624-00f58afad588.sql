-- Remove the policy that allows parents to insert new students
DROP POLICY IF EXISTS "Parents can insert own students" ON public.students;