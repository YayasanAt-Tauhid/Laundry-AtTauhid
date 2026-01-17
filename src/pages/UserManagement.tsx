import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Search,
  Upload,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  GraduationCap,
  Mail,
  Phone,
  Calendar,
  UserCircle,
} from "lucide-react";
import { ImportParentData } from "@/components/import/ImportParentData";

const PAGE_SIZE = 20;

interface ParentUser {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  students: {
    id: string;
    name: string;
    class: string;
    nik: string | null;
    is_active: boolean;
  }[];
}

export default function UserManagement() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [parents, setParents] = useState<ParentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedParent, setSelectedParent] = useState<ParentUser | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  useEffect(() => {
    if (userRole === "admin") {
      fetchParents();
    }
  }, [userRole, currentPage, searchTerm]);

  const fetchParents = async () => {
    try {
      setLoading(true);
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // First, get profiles with parent role
      let query = supabase
        .from("profiles")
        .select(
          `
          id,
          user_id,
          full_name,
          email,
          phone,
          created_at
        `,
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(from, to);

      if (searchTerm) {
        query = query.or(
          `full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`,
        );
      }

      const { data: profilesData, error: profilesError, count } = await query;

      if (profilesError) throw profilesError;

      // Get user roles to filter only parents
      const userIds = profilesData?.map((p) => p.user_id) || [];
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds)
        .eq("role", "parent");

      const parentUserIds = new Set(rolesData?.map((r) => r.user_id) || []);
      const parentProfiles = profilesData?.filter((p) =>
        parentUserIds.has(p.user_id),
      );

      // Fetch students for each parent
      const parentsWithStudents: ParentUser[] = [];

      for (const profile of parentProfiles || []) {
        const { data: studentsData } = await supabase
          .from("students")
          .select("id, name, class, nik, is_active")
          .eq("parent_id", profile.user_id)
          .order("name");

        parentsWithStudents.push({
          ...profile,
          students: studentsData || [],
        });
      }

      setParents(parentsWithStudents);
      setTotalCount(parentsWithStudents.length);
    } catch (error) {
      console.error("Error fetching parents:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memuat data orang tua",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = (parent: ParentUser) => {
    setSelectedParent(parent);
    setDetailDialogOpen(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Redirect if not admin
  if (userRole !== "admin") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Users className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Akses Ditolak
            </h2>
            <p className="text-muted-foreground">
              Halaman ini hanya dapat diakses oleh Administrator
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Manajemen Orang Tua
            </h1>
            <p className="text-muted-foreground mt-1">
              Kelola akun orang tua/wali siswa
            </p>
          </div>

          <Button onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import Orang Tua
          </Button>
        </div>

        {/* Search */}
        <Card className="dashboard-card">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari berdasarkan nama, email, atau telepon..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(0);
                }}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Parents Table */}
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Daftar Orang Tua ({totalCount})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : parents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Users className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Belum ada orang tua terdaftar
                </h3>
                <p className="text-muted-foreground text-center mb-4">
                  Import data orang tua untuk memulai
                </p>
                <Button onClick={() => setImportDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Orang Tua
                </Button>
              </div>
            ) : (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Telepon</TableHead>
                        <TableHead>Jumlah Anak</TableHead>
                        <TableHead>Terdaftar</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parents.map((parent) => (
                        <TableRow key={parent.id}>
                          <TableCell className="font-medium">
                            {parent.full_name || "-"}
                          </TableCell>
                          <TableCell>{parent.email || "-"}</TableCell>
                          <TableCell>{parent.phone || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {parent.students.length} Anak
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(parent.created_at)}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => handleViewDetail(parent)}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  Lihat Detail
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalCount > PAGE_SIZE && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t">
                    <div className="text-sm text-muted-foreground">
                      Menampilkan {currentPage * PAGE_SIZE + 1} -{" "}
                      {Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} dari{" "}
                      {totalCount} orang tua
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCurrentPage((p) => Math.max(0, p - 1))
                        }
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
              </>
            )}
          </CardContent>
        </Card>

        {/* Parent Detail Dialog */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCircle className="h-5 w-5" />
                Detail Orang Tua
              </DialogTitle>
              <DialogDescription>
                Informasi lengkap orang tua dan daftar anak
              </DialogDescription>
            </DialogHeader>

            {selectedParent && (
              <div className="space-y-6">
                {/* Parent Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <UserCircle className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Nama</p>
                      <p className="font-medium">
                        {selectedParent.full_name || "-"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Mail className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium">
                        {selectedParent.email || "-"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Phone className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Telepon</p>
                      <p className="font-medium">
                        {selectedParent.phone || "-"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Calendar className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Terdaftar</p>
                      <p className="font-medium">
                        {formatDate(selectedParent.created_at)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Students List */}
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <GraduationCap className="h-5 w-5" />
                    Daftar Anak ({selectedParent.students.length})
                  </h4>
                  {selectedParent.students.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Belum ada anak terdaftar
                    </p>
                  ) : (
                    <ScrollArea className="max-h-[200px]">
                      <div className="space-y-2">
                        {selectedParent.students.map((student) => (
                          <div
                            key={student.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <GraduationCap className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium">{student.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  Kelas {student.class}
                                  {student.nik && ` • NIK: ${student.nik}`}
                                </p>
                              </div>
                            </div>
                            <Badge
                              variant={
                                student.is_active ? "default" : "secondary"
                              }
                            >
                              {student.is_active ? "Aktif" : "Tidak Aktif"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Import Dialog */}
        <ImportParentData
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          onImportComplete={() => {
            fetchParents();
          }}
        />
      </div>
    </DashboardLayout>
  );
}
