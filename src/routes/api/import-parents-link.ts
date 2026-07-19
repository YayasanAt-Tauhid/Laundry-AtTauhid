// Import parents and LINK them to EXISTING students by NIK (admin only).
// Does NOT create new students — only updates parent_id on existing ones.
// Port of the former `import-parents-link` Supabase edge function.
//
// CLOUDFLARE FREE PLAN NOTE: a Worker request may make at most 50 subrequests.
// Requests are capped at MAX_PARENTS_PER_REQUEST and the frontend sends the
// import in chunks. listUsers and the NIK lookup are done once per request.
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/server/supabase-admin";
import { getAuthUser } from "@/server/auth";
import { errorResponse, json, toErrorMessage } from "@/server/http";
import { MAX_PARENTS_PER_REQUEST } from "@/lib/import-limits";

interface StudentLink {
  nik: string;
  name?: string; // Optional, for verification only
  class?: string; // Optional, for verification only
}

interface ParentData {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  students: StudentLink[];
}

interface StudentLinkResult {
  nik: string;
  found: boolean;
  linked: boolean;
  student_name?: string;
  student_class?: string;
  error?: string;
  already_has_parent?: boolean;
  previous_parent_id?: string;
}

interface ImportResult {
  success: boolean;
  email: string;
  parent_name: string;
  user_id?: string;
  students_linked: number;
  students_not_found: number;
  students_already_linked: number;
  student_details: StudentLinkResult[];
  error?: string;
}

interface ImportSummary {
  total_parents: number;
  parents_success: number;
  parents_failed: number;
  students_linked: number;
  students_not_found: number;
  students_already_linked: number;
}

interface ExistingStudent {
  id: string;
  nik: string | null;
  name: string;
  class: string;
  parent_id: string | null;
  is_active: boolean;
}

export const Route = createFileRoute("/api/import-parents-link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const supabaseAdmin = createAdminClient();

          const { userId } = await getAuthUser(supabaseAdmin, request);
          if (!userId) {
            return errorResponse("Unauthorized: Invalid token", 403);
          }

          // Check if requesting user is admin
          const { data: roleData } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .eq("role", "admin")
            .maybeSingle();

          if (!roleData) {
            return errorResponse("Unauthorized: Admin access required", 403);
          }

          const { parents, overwrite_parent = false } =
            (await request.json()) as {
              parents: ParentData[];
              overwrite_parent?: boolean;
            };

          if (!parents || !Array.isArray(parents) || parents.length === 0) {
            throw new Error("Invalid request: parents array is required");
          }

          if (parents.length > MAX_PARENTS_PER_REQUEST) {
            throw new Error(
              `Maksimal ${MAX_PARENTS_PER_REQUEST} orang tua per request (limit Cloudflare Workers). Kirim data secara bertahap.`,
            );
          }

          // Fetch existing users ONCE for duplicate-email lookups
          const { data: existingUsersData } =
            await supabaseAdmin.auth.admin.listUsers({
              page: 1,
              perPage: 1000,
            });
          const allUsers: Array<{ id: string; email?: string | null }> =
            existingUsersData?.users ?? [];
          const usersByEmail = new Map(
            allUsers
              .filter((u) => u.email)
              .map((u) => [u.email!.toLowerCase(), u]),
          );

          // Look up ALL requested NIKs in one query
          const allNiks = [
            ...new Set(
              parents
                .flatMap((p) => p.students ?? [])
                .map((s) => s.nik?.trim())
                .filter(Boolean) as string[],
            ),
          ];

          const { data: allStudents, error: allStudentsError } =
            allNiks.length > 0
              ? await supabaseAdmin
                  .from("students")
                  .select("id, nik, name, class, parent_id, is_active")
                  .in("nik", allNiks)
              : { data: [] as ExistingStudent[], error: null };

          if (allStudentsError) {
            throw new Error(
              `Gagal mengecek siswa: ${allStudentsError.message}`,
            );
          }

          const studentsByNik = new Map(
            ((allStudents ?? []) as ExistingStudent[]).map((s) => [s.nik, s]),
          );

          const results: ImportResult[] = [];
          const summary: ImportSummary = {
            total_parents: parents.length,
            parents_success: 0,
            parents_failed: 0,
            students_linked: 0,
            students_not_found: 0,
            students_already_linked: 0,
          };

          for (const parent of parents) {
            const result: ImportResult = {
              success: false,
              email: parent.email,
              parent_name: parent.full_name,
              students_linked: 0,
              students_not_found: 0,
              students_already_linked: 0,
              student_details: [],
            };

            try {
              if (!parent.email || !parent.password || !parent.full_name) {
                throw new Error("Email, password, dan nama wajib diisi");
              }

              if (parent.password.length < 6) {
                throw new Error("Password minimal 6 karakter");
              }

              if (!parent.students || parent.students.length === 0) {
                throw new Error("Minimal harus ada 1 NIK siswa");
              }

              const nikList = parent.students
                .map((s) => s.nik?.trim())
                .filter(Boolean) as string[];

              if (nikList.length === 0) {
                throw new Error("Tidak ada NIK siswa yang valid");
              }

              const missingNiks = nikList.filter(
                (nik) => !studentsByNik.has(nik),
              );

              if (missingNiks.length === nikList.length) {
                throw new Error(
                  `Tidak ada siswa ditemukan dengan NIK: ${missingNiks.join(", ")}`,
                );
              }

              const existingUser = usersByEmail.get(
                parent.email.toLowerCase(),
              );

              let parentUserId: string;

              if (existingUser) {
                // Email sudah ada, gunakan user yang sudah ada
                parentUserId = existingUser.id;
                result.user_id = parentUserId;
                console.log(
                  `Using existing user for ${parent.email}: ${parentUserId}`,
                );
              } else {
                // Create new user in Supabase Auth
                const { data: authData, error: authError } =
                  await supabaseAdmin.auth.admin.createUser({
                    email: parent.email,
                    password: parent.password,
                    email_confirm: true,
                    user_metadata: {
                      full_name: parent.full_name,
                      phone: parent.phone || "",
                    },
                  });

                if (authError || !authData.user) {
                  throw new Error(authError?.message || "Gagal membuat user");
                }

                parentUserId = authData.user.id;
                result.user_id = parentUserId;
                usersByEmail.set(parent.email.toLowerCase(), authData.user);

                // Update profile with phone if provided
                if (parent.phone) {
                  await supabaseAdmin
                    .from("profiles")
                    .update({ phone: parent.phone })
                    .eq("user_id", parentUserId);
                }
              }

              // Link existing students to this parent
              for (const studentLink of parent.students) {
                const nik = studentLink.nik?.trim();

                if (!nik) {
                  result.student_details.push({
                    nik: "(kosong)",
                    found: false,
                    linked: false,
                    error: "NIK kosong",
                  });
                  result.students_not_found++;
                  continue;
                }

                const existingStudent = studentsByNik.get(nik);

                if (!existingStudent) {
                  result.student_details.push({
                    nik,
                    found: false,
                    linked: false,
                    error: "Siswa tidak ditemukan",
                  });
                  result.students_not_found++;
                  summary.students_not_found++;
                  continue;
                }

                // Check if student already has a different parent
                if (
                  existingStudent.parent_id &&
                  existingStudent.parent_id !== parentUserId &&
                  !overwrite_parent
                ) {
                  result.student_details.push({
                    nik,
                    found: true,
                    linked: false,
                    student_name: existingStudent.name,
                    student_class: existingStudent.class,
                    already_has_parent: true,
                    previous_parent_id: existingStudent.parent_id,
                    error: "Siswa sudah terhubung ke orang tua lain",
                  });
                  result.students_already_linked++;
                  summary.students_already_linked++;
                  continue;
                }

                // Update student's parent_id
                const { error: updateError } = await supabaseAdmin
                  .from("students")
                  .update({ parent_id: parentUserId })
                  .eq("id", existingStudent.id);

                if (updateError) {
                  result.student_details.push({
                    nik,
                    found: true,
                    linked: false,
                    student_name: existingStudent.name,
                    student_class: existingStudent.class,
                    error: `Gagal update: ${updateError.message}`,
                  });
                  continue;
                }

                existingStudent.parent_id = parentUserId;

                result.student_details.push({
                  nik,
                  found: true,
                  linked: true,
                  student_name: existingStudent.name,
                  student_class: existingStudent.class,
                });
                result.students_linked++;
                summary.students_linked++;
              }

              // Mark as success if at least one student was linked
              if (result.students_linked > 0) {
                result.success = true;
                summary.parents_success++;
              } else {
                result.success = false;
                result.error = "Tidak ada siswa yang berhasil dihubungkan";
                summary.parents_failed++;
              }
            } catch (error) {
              result.error = toErrorMessage(error);
              summary.parents_failed++;
              console.error(`Error processing parent ${parent.email}:`, error);
            }

            results.push(result);
          }

          return json({
            success: summary.parents_success > 0,
            message: `Import selesai: ${summary.parents_success} orang tua berhasil, ${summary.parents_failed} gagal, ${summary.students_linked} siswa dihubungkan`,
            summary,
            results,
          });
        } catch (error) {
          console.error("Import parents link error:", error);
          const errorMessage = toErrorMessage(error);
          return json(
            { success: false, error: errorMessage },
            errorMessage.includes("Unauthorized") ? 403 : 500,
          );
        }
      },
    },
  },
});
