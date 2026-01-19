import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Printer,
  FileText,
  AlertCircle,
  Settings2,
} from "lucide-react";
import { LAUNDRY_CATEGORIES } from "@/lib/constants";

interface StudentForForm {
  id: string;
  name: string;
  nik: string;
  class: string;
  hasOverdueBill: boolean;
}

interface PrintBillingFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrintBillingFormDialog({
  open,
  onOpenChange,
}: PrintBillingFormDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [allClasses, setAllClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [students, setStudents] = useState<StudentForForm[]>([]);
  const [excludeOverdue, setExcludeOverdue] = useState(true);
  const [overdueCount, setOverdueCount] = useState(0);
  const [overdueDays, setOverdueDays] = useState<number>(14); // Default 2 minggu

  // Fetch all unique classes
  useEffect(() => {
    const fetchClasses = async () => {
      const { data } = await supabase
        .from("students")
        .select("class")
        .eq("is_active", true);

      if (data) {
        const uniqueClasses = [...new Set(data.map((s) => s.class))].sort();
        setAllClasses(uniqueClasses);
      }
    };

    if (open) {
      fetchClasses();
    }
  }, [open]);

  // Fetch students with overdue status
  useEffect(() => {
    const fetchStudents = async () => {
      if (!open) return;

      setLoading(true);
      try {
        // Calculate date based on overdueDays setting
        const overdueDate = new Date();
        overdueDate.setDate(overdueDate.getDate() - overdueDays);
        const overdueDateStr = overdueDate.toISOString().split("T")[0];

        // Fetch all active students
        let studentQuery = supabase
          .from("students")
          .select("id, name, nik, class")
          .eq("is_active", true)
          .order("class")
          .order("name");

        if (selectedClass !== "all") {
          studentQuery = studentQuery.eq("class", selectedClass);
        }

        const { data: studentsData, error: studentsError } = await studentQuery;

        if (studentsError) throw studentsError;

        if (!studentsData || studentsData.length === 0) {
          setStudents([]);
          setOverdueCount(0);
          return;
        }

        // Fetch students with overdue unpaid bills (laundry_date > overdueDays ago)
        const { data: overdueOrders, error: overdueError } = await supabase
          .from("laundry_orders")
          .select("student_id")
          .in("status", [
            "MENUNGGU_PEMBAYARAN",
            "DISETUJUI_MITRA",
            "MENUNGGU_APPROVAL_MITRA",
          ])
          .lt("laundry_date", overdueDateStr);

        if (overdueError) throw overdueError;

        // Get unique student IDs with overdue bills
        const overdueStudentIds = new Set(
          (overdueOrders || []).map((o) => o.student_id),
        );

        // Map students with overdue status
        const studentsWithStatus: StudentForForm[] = studentsData.map((s) => ({
          id: s.id,
          name: s.name,
          nik: s.nik || "-",
          class: s.class,
          hasOverdueBill: overdueStudentIds.has(s.id),
        }));

        setStudents(studentsWithStatus);
        setOverdueCount(
          studentsWithStatus.filter((s) => s.hasOverdueBill).length,
        );
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

    fetchStudents();
  }, [open, selectedClass, overdueDays, toast]);

  // Filter students based on exclude overdue setting
  const filteredStudents = excludeOverdue
    ? students.filter((s) => !s.hasOverdueBill)
    : students;

  // Group students by class
  const studentsByClass = filteredStudents.reduce(
    (acc, student) => {
      if (!acc[student.class]) {
        acc[student.class] = [];
      }
      acc[student.class].push(student);
      return acc;
    },
    {} as Record<string, StudentForForm[]>,
  );

  // Get all category keys
  const categoryKeys = Object.keys(LAUNDRY_CATEGORIES) as Array<
    keyof typeof LAUNDRY_CATEGORIES
  >;

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          "Tidak dapat membuka jendela cetak. Periksa pop-up blocker.",
      });
      return;
    }

    const today = new Date().toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // Generate category headers
    const categoryHeaders = categoryKeys
      .map((key) => {
        const cat = LAUNDRY_CATEGORIES[key];
        return `<th style="width: 45px; font-size: 7px; padding: 3px;">${cat.label}<br/><span style="font-weight: normal; font-size: 6px;">(${cat.unit})</span></th>`;
      })
      .join("");

    // Generate empty cells for each category
    const emptyCategoryCells = categoryKeys
      .map(() => `<td style="padding: 3px;"></td>`)
      .join("");

    // Generate rows for each class
    let tableContent = "";
    const sortedClasses = Object.keys(studentsByClass).sort();

    sortedClasses.forEach((className) => {
      const classStudents = studentsByClass[className];

      tableContent += `
        <div class="class-section">
          <h2 class="class-title">Kelas: ${className} (${classStudents.length} siswa)</h2>
          <table>
            <thead>
              <tr>
                <th style="width: 25px;">No</th>
                <th style="width: 60px;">NIK</th>
                <th style="width: 120px;">Nama Siswa</th>
                <th style="width: 65px;">Tanggal</th>
                ${categoryHeaders}
                <th style="width: 70px;">Catatan</th>
              </tr>
            </thead>
            <tbody>
              ${classStudents
                .map(
                  (student, index) => `
                <tr>
                  <td class="center">${index + 1}</td>
                  <td class="center" style="font-size: 8px;">${student.nik}</td>
                  <td style="font-size: 8px;">${student.name}</td>
                  <td></td>
                  ${emptyCategoryCells}
                  <td></td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    });

    // Generate category legend
    const categoryLegend = categoryKeys
      .map((key) => {
        const cat = LAUNDRY_CATEGORIES[key];
        return `<span class="legend-item"><strong>${cat.label}</strong>: Rp ${cat.price.toLocaleString("id-ID")}/${cat.unit}</span>`;
      })
      .join(" • ");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Form Input Tagihan Laundry</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: Arial, sans-serif;
            font-size: 9px;
            line-height: 1.2;
          }
          .header {
            text-align: center;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 2px solid #000;
          }
          .header h1 {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 3px;
          }
          .header p {
            font-size: 10px;
            color: #333;
          }
          .meta-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 9px;
            flex-wrap: wrap;
            gap: 10px;
          }
          .meta-info > div {
            flex: 1;
            min-width: 150px;
          }
          .class-section {
            margin-bottom: 15px;
            page-break-inside: avoid;
          }
          .class-title {
            font-size: 11px;
            font-weight: bold;
            background: #f0f0f0;
            padding: 4px 8px;
            margin-bottom: 4px;
            border: 1px solid #ccc;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
          }
          th, td {
            border: 1px solid #000;
            padding: 2px 4px;
            text-align: left;
            font-size: 8px;
            vertical-align: middle;
          }
          th {
            background: #e0e0e0;
            font-weight: bold;
            text-align: center;
          }
          td.center {
            text-align: center;
          }
          tr:nth-child(even) {
            background: #fafafa;
          }
          .footer {
            margin-top: 15px;
            padding-top: 8px;
            border-top: 1px solid #ccc;
            font-size: 8px;
            color: #666;
          }
          .signature-section {
            margin-top: 20px;
            display: flex;
            justify-content: space-between;
          }
          .signature-box {
            width: 180px;
            text-align: center;
          }
          .signature-line {
            border-bottom: 1px solid #000;
            margin-top: 40px;
            margin-bottom: 4px;
          }
          .note-box {
            margin-top: 10px;
            padding: 8px;
            border: 1px dashed #999;
            background: #fffef0;
            font-size: 8px;
          }
          .legend-box {
            margin-top: 8px;
            padding: 6px 10px;
            border: 1px solid #ccc;
            background: #f9f9f9;
            font-size: 8px;
          }
          .legend-item {
            margin-right: 5px;
          }
          .excluded-info {
            color: #c00;
            font-style: italic;
            margin-bottom: 8px;
            font-size: 9px;
          }
          @media print {
            .class-section {
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>FORM INPUT TAGIHAN LAUNDRY</h1>
          <p>Laundry At-Tauhid - Pondok Pesantren At-Tauhid</p>
        </div>

        <div class="meta-info">
          <div>
            <strong>Tanggal Cetak:</strong> ${today}
          </div>
          <div>
            <strong>Tanggal Laundry:</strong> ____________________
          </div>
          <div>
            <strong>Filter Kelas:</strong> ${selectedClass === "all" ? "Semua Kelas" : selectedClass}
          </div>
          <div>
            <strong>Total Siswa:</strong> ${filteredStudents.length}
          </div>
        </div>

        ${
          excludeOverdue && overdueCount > 0
            ? `<p class="excluded-info">* ${overdueCount} siswa dikecualikan karena memiliki tagihan belum dibayar lebih dari ${overdueDays} hari</p>`
            : ""
        }

        <div class="legend-box">
          <strong>Tarif:</strong> ${categoryLegend}
        </div>

        ${tableContent}

        <div class="note-box">
          <strong>Petunjuk Pengisian:</strong><br>
          • Isi tanggal laundry dengan format DD/MM/YYYY<br>
          • Isi jumlah sesuai kolom kategori (Kg untuk kiloan, Pcs untuk satuan)<br>
          • Kosongkan kolom yang tidak digunakan<br>
          • Gunakan kolom catatan untuk keterangan tambahan
        </div>

        <div class="signature-section">
          <div class="signature-box">
            <div class="signature-line"></div>
            <p>Mitra Laundry</p>
          </div>
          <div class="signature-box">
            <div class="signature-line"></div>
            <p>Petugas Input</p>
          </div>
        </div>

        <div class="footer">
          <p>Dicetak dari Sistem Laundry At-Tauhid | ${new Date().toLocaleString("id-ID")}</p>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `);

    printWindow.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Cetak Form Input Tagihan
          </DialogTitle>
          <DialogDescription>
            Cetak formulir kosong untuk mencatat tagihan laundry secara manual
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1">
          {/* Class Filter */}
          <div className="space-y-2">
            <Label>Filter Kelas</Label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih kelas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kelas</SelectItem>
                {allClasses.map((cls) => (
                  <SelectItem key={cls} value={cls}>
                    {cls}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Overdue Settings */}
          <div className="space-y-3 p-3 rounded-lg bg-muted/30 border">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Settings2 className="h-4 w-4" />
              Pengaturan Jatuh Tempo
            </div>

            <div className="space-y-2">
              <Label htmlFor="overdueDays" className="text-sm">
                Batas jatuh tempo (hari)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="overdueDays"
                  type="number"
                  min={1}
                  max={90}
                  value={overdueDays}
                  onChange={(e) =>
                    setOverdueDays(Math.max(1, parseInt(e.target.value) || 14))
                  }
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">hari</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Siswa dengan tagihan lebih dari {overdueDays} hari akan dianggap
                overdue
              </p>
            </div>
          </div>

          {/* Exclude Overdue Option */}
          <div className="flex items-start space-x-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <Checkbox
              id="excludeOverdue"
              checked={excludeOverdue}
              onCheckedChange={(checked) => setExcludeOverdue(checked === true)}
            />
            <div className="space-y-1">
              <Label
                htmlFor="excludeOverdue"
                className="text-sm font-medium cursor-pointer"
              >
                Kecualikan siswa dengan tagihan overdue
              </Label>
              <p className="text-xs text-muted-foreground">
                Siswa yang memiliki tagihan belum dibayar lebih dari{" "}
                {overdueDays} hari tidak akan ditampilkan di formulir
              </p>
            </div>
          </div>

          {/* Summary Info */}
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">
                Memuat data siswa...
              </span>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-muted/50 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Total siswa aktif:</span>
                <span className="font-medium">{students.length}</span>
              </div>
              {overdueCount > 0 && (
                <div className="flex justify-between text-sm text-amber-600">
                  <span className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Siswa dengan tagihan overdue:
                  </span>
                  <span className="font-medium">{overdueCount}</span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t pt-2">
                <span>Siswa yang akan dicetak:</span>
                <span className="font-bold text-primary">
                  {filteredStudents.length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Jumlah kelas:</span>
                <span className="font-medium">
                  {Object.keys(studentsByClass).length}
                </span>
              </div>
            </div>
          )}

          {/* Category Info */}
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
            <p className="text-xs font-medium mb-2">
              Kategori yang akan dicetak:
            </p>
            <div className="flex flex-wrap gap-1">
              {categoryKeys.map((key) => (
                <span
                  key={key}
                  className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                >
                  {LAUNDRY_CATEGORIES[key].label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t mt-auto">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            className="flex-1"
            onClick={handlePrint}
            disabled={loading || filteredStudents.length === 0}
          >
            <Printer className="h-4 w-4 mr-2" />
            Cetak Formulir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
