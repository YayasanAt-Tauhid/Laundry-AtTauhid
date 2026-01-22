import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Edit,
  Trash2,
  GraduationCap,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Upload,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
} from "lucide-react";
import { ImportData } from "@/components/import/ImportData";
import { ImportParentData } from "@/components/import/ImportParentData";

const PAGE_SIZE = 20;

interface Student {
  id: string;
  name: string;
  class: string;
  nik: string;
  student_code: string;
  is_active: boolean;
  created_at: string;
}

interface PotentialDuplicate {
  id: string;
  name: string;
  class: string;
  nik: string;
  student_code: string;
  match_type: string;
  similarity_score: number;
}

interface NikCheckResult {
  available: boolean;
  message: string;
  can_claim?: boolean;
  existing_student?: {
    id: string;
    name: string;
    class: string;
    student_code: string;
    is_active: boolean;
    parent_id: string | null;
  };
}

export default function Students() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    class: "",
    nik: "",
  });
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importParentDialogOpen, setImportParentDialogOpen] = useState(false);

  // NIK validation states
  const [nikChecking, setNikChecking] = useState(false);
  const [nikAvailable, setNikAvailable] = useState<boolean | null>(null);
  const [nikError, setNikError] = useState<string | null>(null);
  const [existingNikStudent, setExistingNikStudent] = useState<
    NikCheckResult["existing_student"] | null
  >(null);
  const [canClaimStudent, setCanClaimStudent] = useState(false);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);

  // Duplicate detection states
  const [duplicateWarningOpen, setDuplicateWarningOpen] = useState(false);
  const [potentialDuplicates, setPotentialDuplicates] = useState<
    PotentialDuplicate[]
  >([]);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  // Track if component is mounted
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (user) {
      fetchStudents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentPage]);

  // Check NIK availability with debounce
  const checkNikAvailability = useCallback(
    async (nik: string, excludeId?: string) => {
      if (!nik || nik.trim().length < 3) {
        setNikAvailable(null);
        setNikError(null);
        setExistingNikStudent(null);
        setCanClaimStudent(false);
        return;
      }

      setNikChecking(true);
      try {
        // Use type assertion since RPC types may not be generated yet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.rpc as any)(
          "check_nik_available",
          {
            p_nik: nik.trim(),
            p_exclude_id: excludeId || null,
          },
        );

        if (error) throw error;

        const result = data as unknown as NikCheckResult;
        setNikAvailable(result.available);
        setNikError(result.available ? null : result.message);
        setExistingNikStudent(result.existing_student || null);
        setCanClaimStudent(result.can_claim || false);
      } catch (error) {
        console.error("Error checking NIK:", error);
        // Fallback to simple query if RPC not available yet
        const { data: existing } = await supabase
          .from("students")
          .select("id, name, class, student_code, is_active, parent_id")
          .eq("nik", nik.trim())
          .neq("id", excludeId || "")
          .maybeSingle();

        if (existing) {
          const canClaim = existing.parent_id === null;
          setNikAvailable(false);
          setCanClaimStudent(canClaim);
          setExistingNikStudent({
            id: existing.id,
            name: existing.name,
            class: existing.class,
            student_code: existing.student_code,
            is_active: existing.is_active,
            parent_id: existing.parent_id,
          });
          setNikError(
            canClaim
              ? `NIK sudah terdaftar untuk ${existing.name} (${existing.class}). Anda dapat mengklaim siswa ini.`
              : `NIK sudah digunakan oleh ${existing.name} (${existing.class})`,
          );
        } else {
          setNikAvailable(true);
          setNikError(null);
          setCanClaimStudent(false);
          setExistingNikStudent(null);
        }
      } finally {
        setNikChecking(false);
      }
    },
    [],
  );

  // Debounced NIK check
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.nik) {
        checkNikAvailability(formData.nik, selectedStudent?.id);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.nik, selectedStudent?.id, checkNikAvailability]);

  // Check for potential duplicates
  const checkDuplicates = async (): Promise<PotentialDuplicate[]> => {
    if (!formData.name || formData.name.trim().length < 2) return [];

    try {
      // Use type assertion since RPC types may not be generated yet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)(
        "find_potential_duplicate_students",
        {
          p_name: formData.name.trim(),
          p_class: formData.class.trim() || null,
          p_nik: formData.nik.trim() || null,
          p_exclude_id: selectedStudent?.id || null,
        },
      );

      if (error) {
        console.error("Error checking duplicates:", error);
        // Fallback to simple query
        const { data: similar } = await supabase
          .from("students")
          .select("id, name, class, nik, student_code")
          .ilike("name", `%${formData.name.trim()}%`)
          .neq("id", selectedStudent?.id || "")
          .limit(5);

        return (similar || []).map((s: Record<string, unknown>) => ({
          ...s,
          match_type: "SIMILAR_NAME",
          similarity_score: 0.7,
        })) as PotentialDuplicate[];
      }

      return (data || []) as unknown as PotentialDuplicate[];
    } catch (error) {
      console.error("Error in duplicate check:", error);
      return [];
    }
  };

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await supabase
        .from("students")
        .select("*", { count: "exact" })
        .order("name")
        .range(from, to);

      if (error) throw error;
      setStudents(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error("Error fetching students:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memuat data siswa",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validate NIK is provided
    if (!formData.nik || formData.nik.trim() === "") {
      toast({
        variant: "destructive",
        title: "NIK Wajib Diisi",
        description: "NIK harus diisi untuk setiap siswa",
      });
      return;
    }

    // Check if NIK is available
    if (nikAvailable === false) {
      toast({
        variant: "destructive",
        title: "NIK Tidak Tersedia",
        description: nikError || "NIK sudah digunakan oleh siswa lain",
      });
      return;
    }

    // Check for duplicates only on new student (not during confirmed submit)
    if (!selectedStudent && !pendingSubmit) {
      const duplicates = await checkDuplicates();
      if (duplicates.length > 0) {
        setPotentialDuplicates(duplicates);
        setDuplicateWarningOpen(true);
        return;
      }
    }

    setSaving(true);
    setPendingSubmit(false);

    try {
      if (selectedStudent) {
        // Update existing student
        const { error } = await supabase
          .from("students")
          .update({
            name: formData.name.trim(),
            class: formData.class.trim(),
            nik: formData.nik.trim(),
          })
          .eq("id", selectedStudent.id);

        if (error) throw error;

        toast({
          title: "Berhasil",
          description: "Data siswa berhasil diperbarui",
        });
      } else {
        // Create new student
        const { error } = await supabase.from("students").insert({
          parent_id: user.id,
          name: formData.name.trim(),
          class: formData.class.trim(),
          nik: formData.nik.trim(),
        });

        if (error) {
          // Handle unique constraint violation
          if (error.code === "23505") {
            if (error.message.includes("nik")) {
              toast({
                variant: "destructive",
                title: "NIK Sudah Terdaftar",
                description: "NIK ini sudah digunakan oleh siswa lain",
              });
              return;
            }
          }
          throw error;
        }

        toast({
          title: "Berhasil",
          description: "Siswa berhasil ditambahkan",
        });
      }

      setDialogOpen(false);
      setSelectedStudent(null);
      setFormData({ name: "", class: "", nik: "" });
      setNikAvailable(null);
      setNikError(null);
      fetchStudents();
    } catch (error: unknown) {
      console.error("Error saving student:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Gagal menyimpan data siswa";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle confirm add despite duplicates
  const handleConfirmAddDespiteDuplicates = () => {
    setDuplicateWarningOpen(false);
    setPendingSubmit(true);
    // Trigger form submit programmatically
    const form = document.getElementById("student-form") as HTMLFormElement;
    if (form) {
      form.requestSubmit();
    }
  };

  // Handle selecting existing student from duplicates
  const handleSelectExisting = (studentId: string) => {
    setDuplicateWarningOpen(false);
    setPotentialDuplicates([]);
    toast({
      title: "Info",
      description:
        "Anda memilih siswa yang sudah ada. Silakan edit data siswa tersebut jika diperlukan.",
    });
    setDialogOpen(false);
  };

  const handleEdit = (student: Student) => {
    setSelectedStudent(student);
    setFormData({
      name: student.name,
      class: student.class,
      nik: student.nik,
    });
    setNikAvailable(true); // Current NIK is valid for this student
    setNikError(null);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedStudent) return;

    try {
      const { error } = await supabase
        .from("students")
        .delete()
        .eq("id", selectedStudent.id);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: "Siswa berhasil dihapus",
      });

      setDeleteDialogOpen(false);
      setSelectedStudent(null);
      fetchStudents();
    } catch (error: unknown) {
      console.error("Error deleting student:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Gagal menghapus siswa";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    }
  };

  const openDeleteDialog = (student: Student) => {
    setSelectedStudent(student);
    setDeleteDialogOpen(true);
  };

  const openAddDialog = () => {
    setSelectedStudent(null);
    setFormData({ name: "", class: "", nik: "" });
    setNikAvailable(null);
    setNikError(null);
    setExistingNikStudent(null);
    setCanClaimStudent(false);
    setPendingSubmit(false);
    setDialogOpen(true);
  };

  // Handle claim existing student
  const handleClaimStudent = async () => {
    if (!user || !existingNikStudent) return;

    setClaiming(true);
    try {
      // Try using RPC function first
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("claim_student", {
        p_student_id: existingNikStudent.id,
        p_parent_id: user.id,
      });

      if (error) {
        // Fallback to direct update if RPC not available
        const { error: updateError } = await supabase
          .from("students")
          .update({ parent_id: user.id })
          .eq("id", existingNikStudent.id)
          .is("parent_id", null);

        if (updateError) throw updateError;

        toast({
          title: "Berhasil",
          description: `Siswa ${existingNikStudent.name} berhasil diklaim dan ditambahkan ke daftar anak Anda.`,
        });
      } else {
        const result = data as { success: boolean; message: string };
        if (result.success) {
          toast({
            title: "Berhasil",
            description: `Siswa ${existingNikStudent.name} berhasil diklaim dan ditambahkan ke daftar anak Anda.`,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Gagal",
            description: result.message,
          });
          return;
        }
      }

      setClaimDialogOpen(false);
      setDialogOpen(false);
      setFormData({ name: "", class: "", nik: "" });
      setNikAvailable(null);
      setNikError(null);
      setExistingNikStudent(null);
      setCanClaimStudent(false);
      fetchStudents();
    } catch (error: unknown) {
      console.error("Error claiming student:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Gagal mengklaim siswa";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    } finally {
      setClaiming(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Data Siswa</h1>
            <p className="text-muted-foreground mt-1">
              Kelola data siswa yang terdaftar
            </p>
          </div>

          {(userRole === "parent" ||
            userRole === "admin" ||
            userRole === "staff") && (
            <div className="flex gap-2">
              {userRole === "admin" && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setImportParentDialogOpen(true)}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Import Orang Tua
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setImportDialogOpen(true)}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Import Siswa
                  </Button>
                </>
              )}
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={openAddDialog}>
                    <Plus className="h-4 w-4 mr-2" />
                    Tambah Siswa
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {selectedStudent ? "Edit Siswa" : "Tambah Siswa Baru"}
                    </DialogTitle>
                    <DialogDescription>
                      {selectedStudent
                        ? "Perbarui informasi siswa"
                        : "Masukkan data siswa yang akan didaftarkan"}
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    id="student-form"
                    onSubmit={handleSubmit}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="nik">
                        NIK <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="nik"
                          value={formData.nik}
                          onChange={(e) =>
                            setFormData({ ...formData, nik: e.target.value })
                          }
                          placeholder="Masukkan NIK siswa"
                          required
                          className={
                            nikAvailable === false && canClaimStudent
                              ? "border-amber-500 pr-10"
                              : nikAvailable === false
                                ? "border-destructive pr-10"
                                : nikAvailable === true
                                  ? "border-green-500 pr-10"
                                  : ""
                          }
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {nikChecking && (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                          {!nikChecking && nikAvailable === true && (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                          {!nikChecking &&
                            nikAvailable === false &&
                            !canClaimStudent && (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                          {!nikChecking &&
                            nikAvailable === false &&
                            canClaimStudent && (
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                            )}
                        </div>
                      </div>
                      {nikError && !canClaimStudent && (
                        <p className="text-sm text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {nikError}
                        </p>
                      )}
                      {nikAvailable === true && formData.nik && (
                        <p className="text-sm text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          NIK tersedia
                        </p>
                      )}
                      {/* Claim Student Card */}
                      {canClaimStudent &&
                        existingNikStudent &&
                        userRole === "parent" && (
                          <div className="mt-3 p-4 border border-amber-300 rounded-lg bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center flex-shrink-0">
                                <GraduationCap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                  Siswa Ditemukan!
                                </p>
                                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                  <span className="font-semibold">
                                    {existingNikStudent.name}
                                  </span>
                                  <span className="mx-1">•</span>
                                  <span>Kelas {existingNikStudent.class}</span>
                                </p>
                                {existingNikStudent.student_code && (
                                  <Badge
                                    variant="outline"
                                    className="mt-1 text-xs font-mono bg-white dark:bg-amber-900"
                                  >
                                    {existingNikStudent.student_code}
                                  </Badge>
                                )}
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                                  Siswa ini sudah terdaftar oleh admin tetapi
                                  belum terhubung dengan akun orang tua.
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                className="bg-amber-600 hover:bg-amber-700 text-white"
                                onClick={() => setClaimDialogOpen(true)}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Klaim Sebagai Anak Saya
                              </Button>
                            </div>
                          </div>
                        )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="name">
                        Nama Siswa <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        placeholder="Nama lengkap siswa"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="class">
                        Kelas <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="class"
                        value={formData.class}
                        onChange={(e) =>
                          setFormData({ ...formData, class: e.target.value })
                        }
                        placeholder="Contoh: 7A, X IPA 1, 5B"
                        required
                      />
                    </div>
                    <div className="flex gap-3 justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDialogOpen(false)}
                      >
                        Batal
                      </Button>
                      <Button
                        type="submit"
                        disabled={
                          saving ||
                          nikChecking ||
                          (nikAvailable === false && !canClaimStudent)
                        }
                        className={canClaimStudent ? "hidden" : ""}
                      >
                        {saving && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        {selectedStudent ? "Simpan Perubahan" : "Tambah Siswa"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>

        {/* Students Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : students.length === 0 ? (
          <Card className="dashboard-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <GraduationCap className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Belum ada siswa terdaftar
              </h3>
              <p className="text-muted-foreground text-center mb-4">
                Tambahkan data siswa untuk mulai menggunakan layanan laundry
              </p>
              {userRole === "parent" && (
                <Button onClick={openAddDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Siswa Pertama
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {students.map((student) => (
              <Card key={student.id} className="dashboard-card">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <GraduationCap className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          {student.name}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Kelas {student.class}
                        </p>
                      </div>
                    </div>
                    {userRole === "parent" && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(student)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(student)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">NIK</span>
                      <span className="font-medium font-mono">
                        {student.nik}
                      </span>
                    </div>
                    {student.student_code && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Kode</span>
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs"
                        >
                          {student.student_code}
                        </Badge>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <span
                        className={`font-medium ${student.is_active ? "text-success" : "text-muted-foreground"}`}
                      >
                        {student.is_active ? "Aktif" : "Tidak Aktif"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalCount > PAGE_SIZE && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border rounded-lg bg-card">
            <div className="text-sm text-muted-foreground">
              Menampilkan {currentPage * PAGE_SIZE + 1} -{" "}
              {Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} dari{" "}
              {totalCount} siswa
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0 || loading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Sebelumnya
              </Button>
              <div className="flex items-center gap-1 px-3 py-1 rounded-md bg-muted text-sm font-medium">
                Halaman {currentPage + 1} dari{" "}
                {Math.ceil(totalCount / PAGE_SIZE)}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={
                  (currentPage + 1) * PAGE_SIZE >= totalCount || loading
                }
              >
                Selanjutnya
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus Siswa?</AlertDialogTitle>
              <AlertDialogDescription>
                Apakah Anda yakin ingin menghapus {selectedStudent?.name}?
                Tindakan ini tidak dapat dibatalkan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Hapus
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Import Dialog */}
        <ImportData
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          onImportComplete={() => {
            fetchStudents();
          }}
        />

        {/* Import Parent Dialog */}
        <ImportParentData
          open={importParentDialogOpen}
          onOpenChange={setImportParentDialogOpen}
          onImportComplete={() => {
            fetchStudents();
          }}
        />

        {/* Claim Student Confirmation Dialog */}
        <AlertDialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                Konfirmasi Klaim Siswa
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>Anda akan mengklaim siswa berikut sebagai anak Anda:</p>
                  {existingNikStudent && (
                    <div className="p-3 border rounded-lg bg-muted/50">
                      <p className="font-semibold">{existingNikStudent.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Kelas: {existingNikStudent.class}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        NIK: {formData.nik}
                      </p>
                      {existingNikStudent.student_code && (
                        <Badge
                          variant="outline"
                          className="mt-1 text-xs font-mono"
                        >
                          {existingNikStudent.student_code}
                        </Badge>
                      )}
                    </div>
                  )}
                  <p className="text-sm">
                    Setelah diklaim, siswa ini akan muncul di daftar anak Anda
                    dan Anda dapat melihat tagihan serta riwayat transaksinya.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={claiming}>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClaimStudent}
                disabled={claiming}
                className="bg-primary"
              >
                {claiming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Ya, Klaim Siswa Ini
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Duplicate Warning Dialog */}
        <AlertDialog
          open={duplicateWarningOpen}
          onOpenChange={setDuplicateWarningOpen}
        >
          <AlertDialogContent className="max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
                Siswa Serupa Ditemukan
              </AlertDialogTitle>
              <AlertDialogDescription>
                Sistem menemukan data siswa yang mirip. Pastikan ini bukan
                duplikat sebelum menambahkan.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="my-4 space-y-2 max-h-60 overflow-y-auto">
              {potentialDuplicates.map((dup) => (
                <div
                  key={dup.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-muted/50"
                >
                  <div className="flex-1">
                    <p className="font-medium">{dup.name}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Kelas: {dup.class}</span>
                      <span>•</span>
                      <span>NIK: {dup.nik}</span>
                    </div>
                    {dup.student_code && (
                      <Badge
                        variant="outline"
                        className="mt-1 text-xs font-mono"
                      >
                        {dup.student_code}
                      </Badge>
                    )}
                    <Badge
                      variant={
                        dup.match_type === "EXACT_NIK"
                          ? "destructive"
                          : "secondary"
                      }
                      className="ml-2 mt-1 text-xs"
                    >
                      {dup.match_type === "EXACT_NIK" && "NIK Sama"}
                      {dup.match_type === "EXACT_NAME_CLASS" &&
                        "Nama & Kelas Sama"}
                      {dup.match_type === "EXACT_NAME" && "Nama Sama"}
                      {dup.match_type === "SIMILAR_NAME" && "Nama Mirip"}
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectExisting(dup.id)}
                  >
                    Gunakan Ini
                  </Button>
                </div>
              ))}
            </div>

            <Alert className="bg-amber-50 border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                Jika Anda yakin ini adalah siswa berbeda (misal: kembar), klik
                "Tetap Tambah Baru".
              </AlertDescription>
            </Alert>

            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDuplicateWarningOpen(false)}>
                Batal
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmAddDespiteDuplicates}
                className="bg-amber-600 hover:bg-amber-700"
              >
                Tetap Tambah Baru
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
