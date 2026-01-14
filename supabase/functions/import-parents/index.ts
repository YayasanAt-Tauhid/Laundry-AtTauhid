// Supabase Edge Function: import-parents
// Fungsi untuk import data parent beserta anak/siswanya
// Deploy dengan: supabase functions deploy import-parents

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface StudentData {
  name: string;
  class: string;
  nis?: string;
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

    // Create client with user's token to verify admin role
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get requesting user and verify admin role
    const {
      data: { user: requestingUser },
      error: userError,
    } = await supabaseUser.auth.getUser(authHeader.replace("Bearer ", ""));

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
    const { parents }: { parents: ParentData[] } = await req.json();

    if (!parents || !Array.isArray(parents) || parents.length === 0) {
      throw new Error("Invalid request: parents array is required");
    }

    const results: ImportResult[] = [];

    // Process each parent
    for (const parent of parents) {
      const result: ImportResult = {
        success: false,
        email: parent.email,
        parent_name: parent.full_name,
        students_created: 0,
      };

      try {
        // Validate required fields
        if (!parent.email || !parent.password || !parent.full_name) {
          throw new Error("Email, password, dan nama wajib diisi");
        }

        if (parent.password.length < 6) {
          throw new Error("Password minimal 6 karakter");
        }

        // Check if email already exists
        const { data: existingUsers } =
          await supabaseAdmin.auth.admin.listUsers();
        const emailExists = existingUsers?.users?.some(
          (u) => u.email?.toLowerCase() === parent.email.toLowerCase()
        );

        if (emailExists) {
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

        const userId = authData.user.id;
        result.user_id = userId;

        // Note: Profile and role will be created by the trigger `handle_new_user`
        // But we need to update the profile with phone if provided
        if (parent.phone) {
          await supabaseAdmin
            .from("profiles")
            .update({ phone: parent.phone })
            .eq("user_id", userId);
        }

        // Create students for this parent
        if (parent.students && parent.students.length > 0) {
          for (const student of parent.students) {
            if (!student.name || !student.class) {
              console.warn(
                `Skipping student with missing data for parent ${parent.email}`
              );
              continue;
            }

            const { error: studentError } = await supabaseAdmin
              .from("students")
              .insert({
                parent_id: userId,
                name: student.name,
                class: student.class,
                nis: student.nis || null,
                is_active: true,
              });

            if (studentError) {
              console.error(
                `Error creating student ${student.name}: ${studentError.message}`
              );
            } else {
              result.students_created++;
            }
          }
        }

        result.success = true;
      } catch (error) {
        result.error = error.message;
        console.error(`Error processing parent ${parent.email}:`, error);
      }

      results.push(result);
    }

    // Calculate summary
    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;
    const totalStudents = results.reduce((sum, r) => sum + r.students_created, 0);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Import selesai: ${successCount} parent berhasil, ${failedCount} gagal, ${totalStudents} siswa dibuat`,
        summary: {
          total: parents.length,
          success: successCount,
          failed: failedCount,
          students_created: totalStudents,
        },
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Import parents error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: error.message.includes("Unauthorized") ? 403 : 500,
      }
    );
  }
});
