// Supabase Edge Function: import-parents-link
// Fungsi untuk import data parent dan MENGHUBUNGKAN ke siswa yang SUDAH ADA berdasarkan NIK
// TIDAK membuat siswa baru - hanya mengupdate parent_id pada siswa yang sudah ada
// Deploy dengan: supabase functions deploy import-parents-link

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing environment variables");
    }

    // Create Supabase admin client with Service Role Key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify requesting user and check admin role
    const {
      data: { user: requestingUser },
      error: userError,
    } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));

    if (userError || !requestingUser) {
      throw new Error("Unauthorized: Invalid token");
    }

    // Check if requesting user is admin
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id)
      .eq("role", "admin")
      .single();

    if (roleError || !roleData) {
      throw new Error("Unauthorized: Admin access required");
    }

    // Parse request body
    const {
      parents,
      overwrite_parent = false,
    }: { parents: ParentData[]; overwrite_parent?: boolean } = await req.json();

    if (!parents || !Array.isArray(parents) || parents.length === 0) {
      throw new Error("Invalid request: parents array is required");
    }

    const results: ImportResult[] = [];
    const summary: ImportSummary = {
      total_parents: parents.length,
      parents_success: 0,
      parents_failed: 0,
      students_linked: 0,
      students_not_found: 0,
      students_already_linked: 0,
    };

    // Process each parent
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
        // Validate required fields
        if (!parent.email || !parent.password || !parent.full_name) {
          throw new Error("Email, password, dan nama wajib diisi");
        }

        if (parent.password.length < 6) {
          throw new Error("Password minimal 6 karakter");
        }

        if (!parent.students || parent.students.length === 0) {
          throw new Error("Minimal harus ada 1 NIK siswa");
        }

        // Check if any student NIK exists before creating parent account
        const nikList = parent.students
          .map((s) => s.nik?.trim())
          .filter(Boolean);

        if (nikList.length === 0) {
          throw new Error("Tidak ada NIK siswa yang valid");
        }

        // Check existing students by NIK
        const { data: existingStudents, error: checkError } =
          await supabaseAdmin
            .from("students")
            .select("id, nik, name, class, parent_id, is_active")
            .in("nik", nikList);

        if (checkError) {
          throw new Error(`Gagal mengecek siswa: ${checkError.message}`);
        }

        const foundNiks = new Set(existingStudents?.map((s) => s.nik) || []);
        const missingNiks = nikList.filter((nik) => !foundNiks.has(nik));

        if (missingNiks.length === nikList.length) {
          throw new Error(
            `Tidak ada siswa ditemukan dengan NIK: ${missingNiks.join(", ")}`,
          );
        }

        // Check if email already exists
        const { data: existingUsers } =
          await supabaseAdmin.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(
          (u) => u.email?.toLowerCase() === parent.email.toLowerCase(),
        );

        let userId: string;

        if (existingUser) {
          // Email sudah ada, gunakan user yang sudah ada
          userId = existingUser.id;
          result.user_id = userId;
          console.log(`Using existing user for ${parent.email}: ${userId}`);
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

          userId = authData.user.id;
          result.user_id = userId;

          // Update profile with phone if provided
          if (parent.phone) {
            await supabaseAdmin
              .from("profiles")
              .update({ phone: parent.phone })
              .eq("user_id", userId);
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

          const existingStudent = existingStudents?.find((s) => s.nik === nik);

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
            existingStudent.parent_id !== userId
          ) {
            if (!overwrite_parent) {
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
          }

          // Update student's parent_id
          const { error: updateError } = await supabaseAdmin
            .from("students")
            .update({ parent_id: userId })
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
        result.error = error.message;
        summary.parents_failed++;
        console.error(`Error processing parent ${parent.email}:`, error);
      }

      results.push(result);
    }

    return new Response(
      JSON.stringify({
        success: summary.parents_success > 0,
        message: `Import selesai: ${summary.parents_success} orang tua berhasil, ${summary.parents_failed} gagal, ${summary.students_linked} siswa dihubungkan`,
        summary,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Import parents link error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: error.message.includes("Unauthorized") ? 403 : 500,
      },
    );
  }
});
