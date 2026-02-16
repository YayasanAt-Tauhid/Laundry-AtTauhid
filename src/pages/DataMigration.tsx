import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ImportData } from "@/components/import/ImportData";
import {
  Upload,
  Download,
  FileSpreadsheet,
  Users,
  Building2,
  Loader2,
  CheckCircle2,
  Info,
  ArrowRight,
  Receipt,
  AlertTriangle,
} from "lucide-react";

type ImportType = "students" | "partners" | "orders";

export default function DataMigration() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [defaultImportType, setDefaultImportType] =
    useState<ImportType>("students");
  const [exportingStudents, setExportingStudents] = useState(false);
  const [exportingPartners, setExportingPartners] = useState(false);
  const [exportingOrders, setExportingOrders] = useState(false);

  const downloadCSV = (
    data: Record<string, unknown>[],
    filename: string,
    headers: string[],
  ) => {
    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((header) => {
            const value = row[header] ?? "";
            // Escape quotes and wrap in quotes if contains comma
            const escaped = String(value).replace(/"/g, '""');
            return escaped.includes(",") ||
              escaped.includes('"') ||
              escaped.includes("\n")
              ? `"${escaped}"`
              : escaped;
          })
          .join(","),
      ),
    ];

    const csvContent = "\ufeff" + csvRows.join("\n"); // BOM for Excel compatibility
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportStudents = async () => {
    setExportingStudents(true);
    try {
      const { data, error } = await supabase
        .from("students")
        .select("name, class, nik, is_active, created_at")
        .order("name");

      if (error) throw error;

      if (!data || data.length === 0) {
        toast({
          variant: "destructive",
          title: "Tidak ada data",
          description: "Belum ada data siswa untuk diekspor",
        });
        return;
      }

      const exportData = data.map((s) => ({
        nama: s.name,
        kelas: s.class,
        nik: s.nik || "",
        status: s.is_active ? "Aktif" : "Tidak Aktif",
        tanggal_daftar: new Date(s.created_at).toLocaleDateString("id-ID"),
      }));

      downloadCSV(
        exportData,
        `data_siswa_${new Date().toISOString().split("T")[0]}.csv`,
        ["nama", "kelas", "nik", "status", "tanggal_daftar"],
      );

      toast({
        title: "Export berhasil",
        description: `${data.length} data siswa berhasil diekspor`,
      });
    } catch (error: unknown) {
      console.error("Export error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat export data";
      toast({
        variant: "destructive",
        title: "Export gagal",
        description: errorMessage,
      });
    } finally {
      setExportingStudents(false);
    }
  };

  const exportPartners = async () => {
    setExportingPartners(true);
    try {
      const { data, error } = await supabase
        .from("laundry_partners")
        .select("name, phone, address, is_active, created_at")
        .order("name");

      if (error) throw error;

      if (!data || data.length === 0) {
        toast({
          variant: "destructive",
          title: "Tidak ada data",
          description: "Belum ada data mitra untuk diekspor",
        });
        return;
      }

      const exportData = data.map((p) => ({
        nama: p.name,
        telepon: p.phone || "",
        alamat: p.address || "",
        status: p.is_active ? "Aktif" : "Tidak Aktif",
        tanggal_daftar: new Date(p.created_at).toLocaleDateString("id-ID"),
      }));

      downloadCSV(
        exportData,
        `data_mitra_${new Date().toISOString().split("T")[0]}.csv`,
        ["nama", "telepon", "alamat", "status", "tanggal_daftar"],
      );

      toast({
        title: "Export berhasil",
        description: `${data.length} data mitra berhasil diekspor`,
      });
    } catch (error: unknown) {
      console.error("Export error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat export data";
      toast({
        variant: "destructive",
        title: "Export gagal",
        description: errorMessage,
      });
    } finally {
      setExportingPartners(false);
    }
  };

  const exportOrders = async () => {
    setExportingOrders(true);
    try {
      const { data, error } = await supabase
        .from("laundry_orders")
        .select(
          `
          id,
          category,
          weight_kg,
          item_count,
          total_price,
          yayasan_share,
          vendor_share,
          status,
          laundry_date,
          paid_at,
          payment_method,
          notes,
          created_at,
          student:students(name, nik, class),
          partner:laundry_partners(name)
        `,
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        toast({
          variant: "destructive",
          title: "Tidak ada data",
          description: "Belum ada data order untuk diekspor",
        });
        return;
      }

      const formatCurrency = (amount: number) => amount.toLocaleString("id-ID");
      const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "";
        return new Date(dateStr).toLocaleDateString("id-ID");
      };

      const categoryLabels: Record<string, string> = {
        kiloan: "Kiloan",
        handuk: "Handuk",
        selimut: "Selimut",
        sprei_kecil: "Sprei Kecil",
        sprei_besar: "Sprei Besar",
        jaket_tebal: "Jaket Tebal",
        bedcover: "Bedcover",
      };

      const statusLabels: Record<string, string> = {
        DRAFT: "Draft",
        MENUNGGU_APPROVAL_MITRA: "Menunggu Approval",
        DITOLAK_MITRA: "Ditolak",
        DISETUJUI_MITRA: "Disetujui",
        MENUNGGU_PEMBAYARAN: "Belum Bayar",
        DIBAYAR: "Dibayar",
        SELESAI: "Selesai",
      };

      interface OrderExport {
        category: string;
        weight_kg: number | null;
        item_count: number | null;
        total_price: number;
        yayasan_share: number;
        vendor_share: number;
        status: string;
        laundry_date: string | null;
        paid_at: string | null;
        payment_method: string | null;
        notes: string | null;
        created_at: string;
        student: { name: string; nik: string | null; class: string } | null;
        partner: { name: string } | null;
      }

      const exportData = (data as OrderExport[]).map((o) => ({
        nama_siswa: o.student?.name || "",
        nik: o.student?.nik || "",
        kelas: o.student?.class || "",
        nama_mitra: o.partner?.name || "",
        kategori: categoryLabels[o.category] || o.category,
        berat_kg: o.weight_kg || "",
        jumlah: o.item_count || "",
        total_harga: formatCurrency(o.total_price),
        bagian_yayasan: formatCurrency(o.yayasan_share),
        bagian_vendor: formatCurrency(o.vendor_share),
        status: statusLabels[o.status] || o.status,
        tanggal_laundry: formatDate(o.laundry_date),
        tanggal_bayar: formatDate(o.paid_at),
        metode_pembayaran: o.payment_method || "",
        catatan: o.notes || "",
        tanggal_dibuat: formatDate(o.created_at),
      }));

      downloadCSV(
        exportData,
        `data_order_${new Date().toISOString().split("T")[0]}.csv`,
        [
          "nama_siswa",
          "nik",
          "kelas",
          "nama_mitra",
          "kategori",
          "berat_kg",
          "jumlah",
          "total_harga",
          "bagian_yayasan",
          "bagian_vendor",
          "status",
          "tanggal_laundry",
          "tanggal_bayar",
          "metode_pembayaran",
          "catatan",
          "tanggal_dibuat",
        ],
      );

      toast({
        title: "Export berhasil",
        description: `${data.length} data order berhasil diekspor`,
      });
    } catch (error: unknown) {
      console.error("Export error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat export data";
      toast({
        variant: "destructive",
        title: "Export gagal",
        description: errorMessage,
      });
    } finally {
      setExportingOrders(false);
    }
  };

  const downloadTemplate = (type: ImportType) => {
    const templates = {
      students: {
        headers: ["nama", "kelas", "nik"],
        example: [
          ["Ahmad Fauzi", "7A", "12345"],
          ["Siti Aminah", "8B", "12346"],
          ["Muhammad Rizki", "9C", ""],
        ],
        filename: "template_siswa.csv",
      },
      partners: {
        headers: ["nama", "telepon", "alamat"],
        example: [
          ["Laundry Berkah", "081234567890", "Jl. Mawar No. 10"],
          ["Laundry Bersih", "081234567891", "Jl. Melati No. 20"],
        ],
        filename: "template_mitra.csv",
      },
      orders: {
        headers: [
          "nama_siswa",
          "nik",
          "nama_mitra",
          "kategori",
          "berat_kg",
          "jumlah",
          "tanggal_laundry",
          "status",
          "tanggal_bayar",
          "metode_pembayaran",
          "catatan",
        ],
        example: [
          [
            "Ahmad Fauzi",
            "12345",
            "Laundry Berkah",
            "kiloan",
            "3.5",
            "",
            "2024-01-15",
            "SELESAI",
            "2024-01-16",
            "tunai",
            "Order migrasi",
          ],
          [
            "Siti Aminah",
            "12346",
            "Laundry Bersih",
            "handuk",
            "",
            "5",
            "2024-01-15",
            "DIBAYAR",
            "2024-01-15",
            "qris",
            "",
          ],
        ],
        filename: "template_order.csv",
      },
    };

    const template = templates[type];
    const csvContent = [
      template.headers.join(","),
      ...template.example.map((row) =>
        row.map((cell) => (cell.includes(",") ? `"${cell}"` : cell)).join(","),
      ),
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = template.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Template diunduh",
      description: "Silakan isi template dan upload kembali",
    });
  };

  const openImportDialog = (type: ImportType) => {
    setDefaultImportType(type);
    setImportDialogOpen(true);
  };

  if (userRole !== "admin") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <Info className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Akses Terbatas</h2>
              <p className="text-muted-foreground">
                Halaman ini hanya dapat diakses oleh Admin dan Staff.
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Migrasi Data</h1>
          <p className="text-muted-foreground mt-1">
            Import dan export data untuk migrasi ke sistem baru
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            className="dashboard-card hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => openImportDialog("students")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Users className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">
                    Import Siswa
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Upload data siswa/santri
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card
            className="dashboard-card hover:border-success/50 transition-colors cursor-pointer"
            onClick={() => openImportDialog("partners")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center text-success">
                  <Building2 className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">
                    Import Mitra
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Upload data mitra laundry
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card
            className="dashboard-card hover:border-orange-500/50 transition-colors cursor-pointer"
            onClick={() => openImportDialog("orders")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                  <Receipt className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">
                    Import Order
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Upload data tagihan/order
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="import" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="import" className="gap-2">
              <Upload className="h-4 w-4" />
              Import
            </TabsTrigger>
            <TabsTrigger value="export" className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </TabsTrigger>
          </TabsList>

          {/* Import Tab */}
          <TabsContent value="import" className="space-y-4">
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                  Panduan Import Data
                </CardTitle>
                <CardDescription>
                  Ikuti langkah-langkah berikut untuk mengimport data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Badge variant="outline" className="mt-0.5">
                      1
                    </Badge>
                    <div>
                      <p className="font-medium">Download Template</p>
                      <p className="text-sm text-muted-foreground">
                        Unduh template CSV sesuai jenis data yang ingin diimport
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Badge variant="outline" className="mt-0.5">
                      2
                    </Badge>
                    <div>
                      <p className="font-medium">Isi Data</p>
                      <p className="text-sm text-muted-foreground">
                        Buka file template menggunakan Excel atau Google Sheets,
                        lalu isi data sesuai kolom
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Badge variant="outline" className="mt-0.5">
                      3
                    </Badge>
                    <div>
                      <p className="font-medium">Upload File</p>
                      <p className="text-sm text-muted-foreground">
                        Klik tombol Import dan upload file yang sudah diisi
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3">Download Template:</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadTemplate("students")}
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Template Siswa
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadTemplate("partners")}
                    >
                      <Building2 className="h-4 w-4 mr-2" />
                      Template Mitra
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadTemplate("orders")}
                    >
                      <Receipt className="h-4 w-4 mr-2" />
                      Template Order
                    </Button>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <Button
                    onClick={() => openImportDialog("students")}
                    className="w-full sm:w-auto"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Mulai Import Data
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Import Format Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="dashboard-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Format Data Siswa
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1 border-b">
                      <span className="font-medium">nama</span>
                      <Badge variant="destructive" className="text-xs">
                        Wajib
                      </Badge>
                    </div>
                    <div className="flex justify-between py-1 border-b">
                      <span className="font-medium">kelas</span>
                      <Badge variant="destructive" className="text-xs">
                        Wajib
                      </Badge>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="font-medium">nik</span>
                      <Badge variant="secondary" className="text-xs">
                        Opsional
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="dashboard-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-success" />
                    Format Data Mitra
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1 border-b">
                      <span className="font-medium">nama</span>
                      <Badge variant="destructive" className="text-xs">
                        Wajib
                      </Badge>
                    </div>
                    <div className="flex justify-between py-1 border-b">
                      <span className="font-medium">telepon</span>
                      <Badge variant="secondary" className="text-xs">
                        Opsional
                      </Badge>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="font-medium">alamat</span>
                      <Badge variant="secondary" className="text-xs">
                        Opsional
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="dashboard-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-orange-500" />
                    Format Data Order
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1 border-b">
                      <span className="font-medium">nama_siswa/nik</span>
                      <Badge variant="destructive" className="text-xs">
                        Wajib
                      </Badge>
                    </div>
                    <div className="flex justify-between py-1 border-b">
                      <span className="font-medium">kategori</span>
                      <Badge variant="destructive" className="text-xs">
                        Wajib
                      </Badge>
                    </div>
                    <div className="flex justify-between py-1 border-b">
                      <span className="font-medium">berat/jumlah</span>
                      <Badge variant="destructive" className="text-xs">
                        Wajib
                      </Badge>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="font-medium">tanggal, status</span>
                      <Badge variant="secondary" className="text-xs">
                        Opsional
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Warning for Orders */}
            <Card className="dashboard-card border-orange-500/20 bg-orange-500/5">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-foreground">
                      Penting untuk Import Order
                    </h4>
                    <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                      <li>
                        • Import data <strong>Siswa</strong> dan{" "}
                        <strong>Mitra</strong> terlebih dahulu sebelum import
                        order
                      </li>
                      <li>
                        • Nama siswa atau NIK harus sama persis dengan data yang
                        sudah ada
                      </li>
                      <li>
                        • Kategori yang valid: kiloan, handuk, selimut,
                        sprei_kecil, sprei_besar, jaket_tebal, bedcover
                      </li>
                      <li>
                        • Status yang valid: SELESAI, DIBAYAR,
                        MENUNGGU_PEMBAYARAN, dll
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Export Tab */}
          <TabsContent value="export" className="space-y-4">
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-success" />
                  Export Data
                </CardTitle>
                <CardDescription>
                  Download data yang ada dalam sistem ke format CSV
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card className="border-dashed">
                    <CardContent className="pt-6">
                      <div className="text-center space-y-3">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mx-auto">
                          <Users className="h-6 w-6" />
                        </div>
                        <div>
                          <h4 className="font-semibold">Data Siswa</h4>
                          <p className="text-sm text-muted-foreground">
                            Export semua data siswa/santri
                          </p>
                        </div>
                        <Button
                          onClick={exportStudents}
                          disabled={exportingStudents}
                          className="w-full"
                        >
                          {exportingStudents ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Mengexport...
                            </>
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-2" />
                              Export Siswa
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-dashed">
                    <CardContent className="pt-6">
                      <div className="text-center space-y-3">
                        <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center text-success mx-auto">
                          <Building2 className="h-6 w-6" />
                        </div>
                        <div>
                          <h4 className="font-semibold">Data Mitra</h4>
                          <p className="text-sm text-muted-foreground">
                            Export semua data mitra laundry
                          </p>
                        </div>
                        <Button
                          onClick={exportPartners}
                          disabled={exportingPartners}
                          variant="outline"
                          className="w-full"
                        >
                          {exportingPartners ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Mengexport...
                            </>
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-2" />
                              Export Mitra
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-dashed">
                    <CardContent className="pt-6">
                      <div className="text-center space-y-3">
                        <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 mx-auto">
                          <Receipt className="h-6 w-6" />
                        </div>
                        <div>
                          <h4 className="font-semibold">Data Order</h4>
                          <p className="text-sm text-muted-foreground">
                            Export semua data tagihan/order
                          </p>
                        </div>
                        <Button
                          onClick={exportOrders}
                          disabled={exportingOrders}
                          variant="outline"
                          className="w-full"
                        >
                          {exportingOrders ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Mengexport...
                            </>
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-2" />
                              Export Order
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            {/* Tips */}
            <Card className="dashboard-card border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="font-medium text-foreground">Tips Export</h4>
                    <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                      <li>
                        • File CSV dapat dibuka dengan Microsoft Excel atau
                        Google Sheets
                      </li>
                      <li>
                        • Data yang diekspor sudah termasuk semua data aktif dan
                        tidak aktif
                      </li>
                      <li>
                        • Gunakan fitur export untuk backup data secara berkala
                      </li>
                      <li>
                        • Data order termasuk informasi siswa, mitra, dan
                        pembagian hasil
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Import Dialog */}
        <ImportData
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          defaultImportType={defaultImportType}
        />
      </div>
    </DashboardLayout>
  );
}
