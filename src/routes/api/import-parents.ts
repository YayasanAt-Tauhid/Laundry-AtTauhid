// Import parents + create their students (admin only).
// Port of the former `import-parents` Supabase edge function.
//
// CLOUDFLARE FREE PLAN NOTE: a Worker request may make at most 50 subrequests.
// Requests are therefore capped at MAX_PARENTS_PER_REQUEST and the frontend
// sends the import in chunks. listUsers is also fetched once per request
// instead of once per parent.
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/server/supabase-admin";
import { getAuthUser } from "@/server/auth";
import { errorResponse, json, toErrorMessage } from "@/server/http";
import { MAX_PARENTS_PER_REQUEST } from "@/lib/import-limits";

interface StudentData {
  name: string;
  class: string;
  nik?: string;
}

interface ParentData {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  students: StudentData[];
}

interface ImportResult {
  success: boolean;
  email: string;
  parent_name: string;
  user_id?: string;
  students_created: number;
  error?: string;
}

export const Route = createFileRoute("/api/import-parents")({
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

          const { parents } = (await request.json()) as {
            parents: ParentData[];
          };

          if (!parents || !Array.isArray(parents) || parents.length === 0) {
            throw new Error("Invalid request: parents array is required");
          }

          if (parents.length > MAX_PARENTS_PER_REQUEST) {
            throw new Error(
              `Maksimal ${MAX_PARENTS_PER_REQUEST} orang tua per request (limit Cloudflare Workers). Kirim data secara bertahap.`,
            );
          }

          // Fetch existing users ONCE for duplicate-email checks
          const { data: existingUsers } =
            await supabaseAdmin.auth.admin.listUsers({
              page: 1,
              perPage: 1000,
            });
          const existingEmails = new Set(
            existingUsers?.users
              ?.map((u) => u.email?.toLowerCase())
              .filter(Boolean) ?? [],
          );

          const results: ImportResult[] = [];

          for (const parent of parents) {
            const result: ImportResult = {
              success: false,
              email: parent.email,
              parent_name: parent.full_name,
              students_created: 0,
            };

            try {
              if (!parent.email || !parent.password || !parent.full_name) {
                throw new Error("Email, password, dan nama wajib diisi");
              }

              if (parent.password.length < 6) {
                throw new Error("Password minimal 6 karakter");
              }

              if (existingEmails.has(parent.email.toLowerCase())) {
                throw new Error(`Email ${parent.email} sudah terdaftar`);
              }

              // Create user in Supabase Auth
              const { data: authData, error: authError } =
                await supabaseAdmin.auth.admin.createUser({
                  email: parent.email,
                  password: parent.password,
                  email_confirm: true, // Auto-confirm email
                  user_metadata: {
                    full_name: parent.full_name,
                    phone: parent.phone || "",
                  },
                });

              if (authError || !authData.user) {
                throw new Error(authError?.message || "Gagal membuat user");
              }

              const newUserId = authData.user.id;
              result.user_id = newUserId;
              existingEmails.add(parent.email.toLowerCase());

              // Note: Profile and role are created by the `handle_new_user`
              // trigger; update the phone separately when provided.
              if (parent.phone) {
                await supabaseAdmin
                  .from("profiles")
                  .update({ phone: parent.phone })
                  .eq("user_id", newUserId);
              }

              // Create students for this parent
              if (parent.students && parent.students.length > 0) {
                for (const student of parent.students) {
                  if (!student.name || !student.class) {
                    console.warn(
                      `Skipping student with missing data for parent ${parent.email}`,
                    );
                    continue;
                  }

                  const { error: studentError } = await supabaseAdmin
                    .from("students")
                    .insert({
                      parent_id: newUserId,
                      name: student.name,
                      class: student.class,
                      nik: student.nik || null,
                      is_active: true,
                    });

                  if (studentError) {
                    console.error(
                      `Error creating student ${student.name}: ${studentError.message}`,
                    );
                  } else {
                    result.students_created++;
                  }
                }
              }

              result.success = true;
            } catch (error) {
              result.error = toErrorMessage(error);
              console.error(`Error processing parent ${parent.email}:`, error);
            }

            results.push(result);
          }

          const successCount = results.filter((r) => r.success).length;
          const failedCount = results.filter((r) => !r.success).length;
          const totalStudents = results.reduce(
            (sum, r) => sum + r.students_created,
            0,
          );

          return json({
            success: true,
            message: `Import selesai: ${successCount} parent berhasil, ${failedCount} gagal, ${totalStudents} siswa dibuat`,
            summary: {
              total: parents.length,
              success: successCount,
              failed: failedCount,
              students_created: totalStudents,
            },
            results,
          });
        } catch (error) {
          console.error("Import parents error:", error);
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
