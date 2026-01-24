import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LAUNDRY_CATEGORIES, type LaundryCategory } from "@/lib/constants";
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Info,
} from "lucide-react";

type ImportType = "students" | "students_wadiah" | "partners" | "orders";

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

interface ParsedRow {
  [key: string]: string;
}

interface ImportDataProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
  defaultImportType?: ImportType;
}

interface StudentLookup {
  id: string;
  name: string;
  nik: string | null;
  class: string;
}

interface PartnerLookup {
  id: string;
  name: string;
}

const IMPORT_TEMPLATES: Record<
  ImportType,
  { headers: string[]; example: string[][]; description: string }
> = {
  students: {
    headers: ["nik", "nama", "kelas"],
    example: [
      ["12345", "Ahmad Fauzi", "7A"],
      ["12346", "Siti Aminah", "8B"],
      ["12347", "Muhammad Rizki", "9C"],
    ],
    description: "nik (wajib, unik), nama, kelas",
  },
  students_wadiah: {
    headers: ["nik", "nama", "kelas", "saldo_wadiah"],
    example: [
      ["12345", "Ahmad Fauzi", "7A", "50000"],
      ["12346", "Siti Aminah", "8B", "125000"],
      ["12347", "Muhammad Rizki", "9C", "0"],
    ],
    description:
      "nik (wajib), nama, kelas, saldo_wadiah - Siswa yg sudah ada akan di-update saldonya",
  },
  partners: {
    headers: ["nama", "telepon", "alamat"],
    example: [
      ["Laundry Berkah", "081234567890", "Jl. Mawar No. 10"],
      ["Laundry Bersih", "081234567891", "Jl. Melati No. 20"],
    ],
    description: "nama, telepon (opsional), alamat (opsional)",
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
      [
        "Muhammad Rizki",
        "",
        "Laundry Berkah",
        "selimut",
        "",
        "2",
        "2024-01-16",
        "SELESAI",
        "2024-01-17",
        "transfer",
        "Selimut tebal",
      ],
    ],
    description:
      "nama_siswa/nik, nama_mitra, kategori, berat/jumlah, tanggal, status",
  },
};

const CATEGORY_MAP: Record<string, LaundryCategory> = {
  kiloan: "kiloan",
  kg: "kiloan",
  handuk: "handuk",
  towel: "handuk",
  selimut: "selimut",
  blanket: "selimut",
  sprei_kecil: "sprei_kecil",
  "sprei kecil": "sprei_kecil",
  sprei_besar: "sprei_besar",
  "sprei besar": "sprei_besar",
  jaket_tebal: "jaket_tebal",
  "jaket tebal": "jaket_tebal",
  jaket: "jaket_tebal",
  bedcover: "bedcover",
  "bed cover": "bedcover",
};

const STATUS_MAP: Record<string, string> = {
  draft: "DRAFT",
  menunggu_approval: "MENUNGGU_APPROVAL_MITRA",
  "menunggu approval": "MENUNGGU_APPROVAL_MITRA",
  pending: "MENUNGGU_APPROVAL_MITRA",
  ditolak: "DITOLAK_MITRA",
  rejected: "DITOLAK_MITRA",
  disetujui: "DISETUJUI_MITRA",
  approved: "DISETUJUI_MITRA",
  menunggu_pembayaran: "MENUNGGU_PEMBAYARAN",
  "menunggu pembayaran": "MENUNGGU_PEMBAYARAN",
  unpaid: "MENUNGGU_PEMBAYARAN",
  "belum bayar": "MENUNGGU_PEMBAYARAN",
  dibayar: "DIBAYAR",
  paid: "DIBAYAR",
  lunas: "DIBAYAR",
  selesai: "SELESAI",
  done: "SELESAI",
  completed: "SELESAI",
};

export function ImportData({
  open,
  onOpenChange,
  onImportComplete,
  defaultImportType,
}: ImportDataProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importType, setImportType] = useState<ImportType>(
    defaultImportType || "students",
  );
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Lookup data for orders import
  const [students, setStudents] = useState<StudentLookup[]>([]);
  const [partners, setPartners] = useState<PartnerLookup[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);

  // Fetch students and partners for order import or students_wadiah
  useEffect(() => {
    if (open && (importType === "orders" || importType === "students_wadiah")) {
      fetchLookupData();
    }
  }, [open, importType]);

  const fetchLookupData = async () => {
    setLoadingLookups(true);
    try {
      const [studentsRes, partnersRes] = await Promise.all([
        supabase
          .from("students")
          .select("id, name, nik, class")
          .eq("is_active", true),
        supabase
          .from("laundry_partners")
          .select("id, name")
          .eq("is_active", true),
      ]);

      if (studentsRes.data) setStudents(studentsRes.data);
      if (partnersRes.data) setPartners(partnersRes.data);
    } catch (error) {
      console.error("Error fetching lookup data:", error);
    } finally {
      setLoadingLookups(false);
    }
  };

  const resetState = useCallback(() => {
    setFile(null);
    setParsedData([]);
    setHeaders([]);
    setProgress(0);
    setResult(null);
    setValidationErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const parseCSV = (text: string): { headers: string[]; rows: ParsedRow[] } => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    // Detect delimiter (comma, semicolon, or tab)
    const firstLine = lines[0];
    let delimiter = ",";
    if (firstLine.includes(";") && !firstLine.includes(",")) {
      delimiter = ";";
    } else if (firstLine.includes("\t") && !firstLine.includes(",")) {
      delimiter = "\t";
    }

    const parseRow = (line: string): string[] => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headerRow = parseRow(lines[0]).map((h) =>
      h.toLowerCase().trim().replace(/\s+/g, "_"),
    );
    const rows: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseRow(lines[i]);
      if (values.some((v) => v.trim())) {
        const row: ParsedRow = {};
        headerRow.forEach((header, index) => {
          row[header] = values[index] || "";
        });
        rows.push(row);
      }
    }

    return { headers: headerRow, rows };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const extension = selectedFile.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(extension || "")) {
      toast({
        variant: "destructive",
        title: "Format tidak didukung",
        description: "Silakan unggah file CSV atau Excel (.xlsx, .xls)",
      });
      return;
    }

    setFile(selectedFile);
    setResult(null);
    setValidationErrors([]);

    try {
      if (extension === "csv") {
        const text = await selectedFile.text();
        const { headers: parsedHeaders, rows } = parseCSV(text);
        setHeaders(parsedHeaders);
        setParsedData(rows);
        validateData(rows, parsedHeaders);
      } else {
        toast({
          variant: "default",
          title: "File Excel terdeteksi",
          description:
            "Untuk hasil terbaik, konversi file Excel ke CSV terlebih dahulu.",
        });

        try {
          const text = await selectedFile.text();
          const { headers: parsedHeaders, rows } = parseCSV(text);
          if (rows.length > 0) {
            setHeaders(parsedHeaders);
            setParsedData(rows);
            validateData(rows, parsedHeaders);
          } else {
            throw new Error("Tidak dapat membaca file Excel");
          }
        } catch {
          toast({
            variant: "destructive",
            title: "Gagal membaca file",
            description:
              "Silakan konversi file Excel ke format CSV terlebih dahulu.",
          });
          resetState();
        }
      }
    } catch (error) {
      console.error("Error parsing file:", error);
      toast({
        variant: "destructive",
        title: "Gagal membaca file",
        description: "Pastikan format file sudah benar",
      });
      resetState();
    }
  };

  const findStudent = (row: ParsedRow): StudentLookup | null => {
    const nama = (
      row["nama_siswa"] ||
      row["nama"] ||
      row["student_name"] ||
      row["name"] ||
      ""
    )
      .trim()
      .toLowerCase();
    const nik = (row["nik"] || row["nis"] || row["nomor_induk"] || "").trim();

    // Try to find by NIK first (more accurate)
    if (nik) {
      const byNik = students.find((s) => s.nik === nik);
      if (byNik) return byNik;
    }

    // Then try by name (case-insensitive)
    if (nama) {
      const byName = students.find((s) => s.name.toLowerCase() === nama);
      if (byName) return byName;

      // Partial match
      const byPartial = students.find(
        (s) =>
          s.name.toLowerCase().includes(nama) ||
          nama.includes(s.name.toLowerCase()),
      );
      if (byPartial) return byPartial;
    }

    return null;
  };

  const findPartner = (row: ParsedRow): PartnerLookup | null => {
    const nama = (
      row["nama_mitra"] ||
      row["mitra"] ||
      row["partner"] ||
      row["laundry"] ||
      ""
    )
      .trim()
      .toLowerCase();

    if (!nama) return partners[0] || null; // Default to first partner if not specified

    const byName = partners.find((p) => p.name.toLowerCase() === nama);
    if (byName) return byName;

    // Partial match
    const byPartial = partners.find(
      (p) =>
        p.name.toLowerCase().includes(nama) ||
        nama.includes(p.name.toLowerCase()),
    );
    if (byPartial) return byPartial;

    return partners[0] || null; // Default to first partner
  };

  // Helper function to parse decimal numbers with comma or dot as decimal separator
  const parseDecimal = (value: string): number => {
    if (!value) return 0;
    // Remove quotes if present
    let cleaned = value.replace(/"/g, "").trim();
    // Replace comma with dot for decimal separator
    // But first check if it's a thousand separator (e.g., 1,000.50)
    // If there's both comma and dot, assume dot is decimal separator
    if (cleaned.includes(",") && cleaned.includes(".")) {
      // Format: 1,000.50 - comma is thousand separator
      cleaned = cleaned.replace(/,/g, "");
    } else if (cleaned.includes(",")) {
      // Format: 1,5 or 1,065 - comma is decimal separator
      cleaned = cleaned.replace(",", ".");
    }
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const parseCategory = (row: ParsedRow): LaundryCategory | null => {
    const kategori = (
      row["kategori"] ||
      row["category"] ||
      row["jenis"] ||
      row["type"] ||
      ""
    )
      .trim()
      .toLowerCase();
    return CATEGORY_MAP[kategori] || null;
  };

  type OrderStatus =
    | "DRAFT"
    | "MENUNGGU_APPROVAL_MITRA"
    | "DITOLAK_MITRA"
    | "DISETUJUI_MITRA"
    | "MENUNGGU_PEMBAYARAN"
    | "DIBAYAR"
    | "SELESAI";

  const parseStatus = (row: ParsedRow): OrderStatus => {
    const status = (row["status"] || "").trim().toLowerCase();
    return (STATUS_MAP[status] as OrderStatus) || "SELESAI"; // Default to SELESAI for historical data
  };

  const parseDate = (dateStr: string): string => {
    if (!dateStr) return new Date().toISOString().split("T")[0];

    // Try various date formats
    const cleaned = dateStr.trim();

    // DD/MM/YYYY or DD-MM-YYYY
    const ddmmyyyy = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (ddmmyyyy) {
      const [, day, month, year] = ddmmyyyy;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    // YYYY-MM-DD (already correct format)
    const yyyymmdd = cleaned.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (yyyymmdd) {
      const [, year, month, day] = yyyymmdd;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    // Try parsing with Date
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }

    return new Date().toISOString().split("T")[0];
  };

  const validateData = (rows: ParsedRow[], fileHeaders: string[]) => {
    const errors: string[] = [];

    if (importType === "students") {
      // For regular students import, all fields are required
      const nikSet = new Set<string>();
      rows.forEach((row, index) => {
        const nama = row["nama"] || row["name"] || "";
        const kelas = row["kelas"] || row["class"] || "";
        const nik = (
          row["nik"] ||
          row["nis"] ||
          row["nomor_induk"] ||
          ""
        ).trim();

        if (!nik) {
          errors.push(`Baris ${index + 2}: NIK wajib diisi`);
        } else if (nikSet.has(nik)) {
          errors.push(`Baris ${index + 2}: NIK "${nik}" duplikat dalam file`);
        } else {
          nikSet.add(nik);
        }
        if (!nama.trim()) {
          errors.push(`Baris ${index + 2}: Nama siswa tidak boleh kosong`);
        }
        if (!kelas.trim()) {
          errors.push(`Baris ${index + 2}: Kelas tidak boleh kosong`);
        }
      });
    } else if (importType === "students_wadiah") {
      // For students_wadiah import, only NIK is required
      // nama/kelas only required for NEW students (checked during import)
      const nikSet = new Set<string>();
      rows.forEach((row, index) => {
        const nik = (
          row["nik"] ||
          row["nis"] ||
          row["nomor_induk"] ||
          ""
        ).trim();

        if (!nik) {
          errors.push(`Baris ${index + 2}: NIK wajib diisi`);
        } else if (nikSet.has(nik)) {
          errors.push(`Baris ${index + 2}: NIK "${nik}" duplikat dalam file`);
        } else {
          nikSet.add(nik);
        }

        // Validate wadiah balance
        const saldoStr = (
          row["saldo_wadiah"] ||
          row["saldo"] ||
          row["wadiah"] ||
          row["balance"] ||
          "0"
        ).trim();
        const saldo = parseFloat(saldoStr.replace(/[^0-9.-]/g, ""));
        if (isNaN(saldo) || saldo < 0) {
          errors.push(
            `Baris ${index + 2}: Saldo wadiah tidak valid (harus angka >= 0)`,
          );
        }
      });
    } else if (importType === "partners") {
      rows.forEach((row, index) => {
        const nama = row["nama"] || row["name"] || "";
        if (!nama.trim()) {
          errors.push(`Baris ${index + 2}: Nama mitra tidak boleh kosong`);
        }
      });
    } else if (importType === "orders") {
      if (students.length === 0) {
        errors.push("Tidak ada data siswa. Import data siswa terlebih dahulu.");
      }
      if (partners.length === 0) {
        errors.push("Tidak ada data mitra. Import data mitra terlebih dahulu.");
      }

      rows.forEach((row, index) => {
        const student = findStudent(row);
        const partner = findPartner(row);
        const category = parseCategory(row);

        if (!student) {
          const nama = row["nama_siswa"] || row["nama"] || row["nik"] || "";
          errors.push(
            `Baris ${index + 2}: Siswa "${nama}" tidak ditemukan di database`,
          );
        }
        if (!partner) {
          const mitra = row["nama_mitra"] || row["mitra"] || "";
          errors.push(`Baris ${index + 2}: Mitra "${mitra}" tidak ditemukan`);
        }
        if (!category) {
          const kat = row["kategori"] || row["category"] || "";
          errors.push(`Baris ${index + 2}: Kategori "${kat}" tidak valid`);
        }

        // Validate quantity
        const beratKg = parseDecimal(
          row["berat_kg"] || row["berat"] || row["weight"] || "0",
        );
        const jumlah = parseInt(
          row["jumlah"] ||
            row["qty"] ||
            row["quantity"] ||
            row["item_count"] ||
            "0",
          10,
        );

        if (category === "kiloan" && beratKg <= 0) {
          errors.push(
            `Baris ${index + 2}: Berat harus diisi untuk kategori kiloan`,
          );
        }
        if (category && category !== "kiloan" && jumlah <= 0) {
          errors.push(
            `Baris ${index + 2}: Jumlah harus diisi untuk kategori ${category}`,
          );
        }
      });
    }

    setValidationErrors(errors.slice(0, 15));
    if (errors.length > 15) {
      setValidationErrors([
        ...errors.slice(0, 15),
        `... dan ${errors.length - 15} error lainnya`,
      ]);
    }
  };

  const handleImport = async () => {
    if (!user || parsedData.length === 0) return;

    setImporting(true);
    setProgress(0);
    setResult(null);

    const results: ImportResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    const batchSize = 50;
    const totalRows = parsedData.length;

    try {
      if (importType === "students") {
        const studentsToInsert = parsedData.map((row, index) => ({
          parent_id: user.id,
          name: (row["nama"] || row["name"] || "").trim(),
          class: (row["kelas"] || row["class"] || "").trim(),
          nik: (row["nik"] || row["nis"] || row["nomor_induk"] || "").trim(),
          is_active: true,
          _rowIndex: index + 1, // Track row for error reporting
        }));

        // Validate NIK uniqueness within the import batch
        const nikSet = new Set<string>();
        const duplicateNik: string[] = [];
        studentsToInsert.forEach((s) => {
          if (s.nik) {
            if (nikSet.has(s.nik)) {
              duplicateNik.push(s.nik);
            }
            nikSet.add(s.nik);
          }
        });

        if (duplicateNik.length > 0) {
          results.failed = studentsToInsert.length;
          results.errors.push(
            `NIK duplikat dalam file: ${duplicateNik.slice(0, 5).join(", ")}${duplicateNik.length > 5 ? ` dan ${duplicateNik.length - 5} lainnya` : ""}`,
          );
          setResult(results);
          setImporting(false);
          return;
        }

        for (let i = 0; i < studentsToInsert.length; i += batchSize) {
          const batch = studentsToInsert.slice(i, i + batchSize);
          // NIK is now required - filter for name, class, AND nik
          const validBatch = batch
            .filter((s) => s.name && s.class && s.nik)
            .map(({ _rowIndex, ...student }) => student); // Remove _rowIndex before insert
          const invalidCount = batch.filter(
            (s) => !s.name || !s.class || !s.nik,
          ).length;

          if (validBatch.length > 0) {
            const { error, data } = await supabase
              .from("students")
              .insert(validBatch)
              .select();

            if (error) {
              results.failed += validBatch.length;
              // Handle unique constraint violation for NIK
              if (error.code === "23505" && error.message.includes("nik")) {
                results.errors.push(
                  `Batch ${Math.floor(i / batchSize) + 1}: NIK sudah terdaftar di database`,
                );
              } else {
                results.errors.push(
                  `Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`,
                );
              }
            } else {
              results.success += data?.length || 0;
            }
          }

          // Track invalid rows (missing name, class, or nik)
          if (invalidCount > 0) {
            results.errors.push(
              `${invalidCount} baris dilewati karena nama, kelas, atau NIK kosong`,
            );
          }
          results.failed += invalidCount;
          setProgress(Math.round(((i + batch.length) / totalRows) * 100));
        }
      } else if (importType === "students_wadiah") {
        // Import/Update students with wadiah balance (for data migration)
        // This supports UPSERT - will update existing students' wadiah balance
        const studentsData = parsedData.map((row, index) => {
          const saldoStr = (
            row["saldo_wadiah"] ||
            row["saldo"] ||
            row["wadiah"] ||
            row["balance"] ||
            "0"
          ).trim();
          const saldoWadiah =
            parseFloat(saldoStr.replace(/[^0-9.-]/g, "")) || 0;

          return {
            parent_id: user.id,
            name: (row["nama"] || row["name"] || "").trim(),
            class: (row["kelas"] || row["class"] || "").trim(),
            nik: (row["nik"] || row["nis"] || row["nomor_induk"] || "").trim(),
            is_active: true,
            _rowIndex: index + 1,
            _saldoWadiah: saldoWadiah,
          };
        });

        // Validate NIK uniqueness within the import batch
        const nikSet = new Set<string>();
        const duplicateNik: string[] = [];
        studentsData.forEach((s) => {
          if (s.nik) {
            if (nikSet.has(s.nik)) {
              duplicateNik.push(s.nik);
            }
            nikSet.add(s.nik);
          }
        });

        if (duplicateNik.length > 0) {
          results.failed = studentsData.length;
          results.errors.push(
            `NIK duplikat dalam file: ${duplicateNik.slice(0, 5).join(", ")}${duplicateNik.length > 5 ? ` dan ${duplicateNik.length - 5} lainnya` : ""}`,
          );
          setResult(results);
          setImporting(false);
          return;
        }

        // Process one by one to handle wadiah balance (supports existing students)
        for (let i = 0; i < studentsData.length; i++) {
          const studentData = studentsData[i];

          if (!studentData.nik) {
            results.failed++;
            results.errors.push(
              `Baris ${studentData._rowIndex + 1}: NIK tidak boleh kosong`,
            );
            setProgress(Math.round(((i + 1) / totalRows) * 100));
            continue;
          }

          try {
            let studentId: string | null = null;
            let isNewStudent = false;

            // Check if student already exists by NIK
            const { data: existingStudent } = await supabase
              .from("students")
              .select("id, name, class")
              .eq("nik", studentData.nik)
              .single();

            if (existingStudent) {
              // Student exists - use existing ID
              studentId = existingStudent.id;
              isNewStudent = false;
            } else {
              // Student doesn't exist - create new
              if (!studentData.name || !studentData.class) {
                results.failed++;
                results.errors.push(
                  `Baris ${studentData._rowIndex + 1}: Siswa baru harus memiliki nama dan kelas`,
                );
                setProgress(Math.round(((i + 1) / totalRows) * 100));
                continue;
              }

              const { data: insertedStudent, error: studentError } =
                await supabase
                  .from("students")
                  .insert({
                    parent_id: studentData.parent_id,
                    name: studentData.name,
                    class: studentData.class,
                    nik: studentData.nik,
                    is_active: studentData.is_active,
                  })
                  .select("id")
                  .single();

              if (studentError) {
                results.failed++;
                results.errors.push(
                  `Baris ${studentData._rowIndex + 1}: ${studentError.message}`,
                );
                setProgress(Math.round(((i + 1) / totalRows) * 100));
                continue;
              }

              studentId = insertedStudent?.id || null;
              isNewStudent = true;
            }

            if (!studentId) {
              results.failed++;
              results.errors.push(
                `Baris ${studentData._rowIndex + 1}: Gagal mendapatkan ID siswa`,
              );
              setProgress(Math.round(((i + 1) / totalRows) * 100));
              continue;
            }

            // Handle wadiah balance
            if (studentData._saldoWadiah > 0) {
              // Check if wadiah balance record exists
              const { data: existingBalance } = await supabase
                .from("student_wadiah_balance")
                .select("id, balance, total_deposited")
                .eq("student_id", studentId)
                .single();

              if (existingBalance) {
                // Update existing balance - ADD to current balance
                const newBalance =
                  existingBalance.balance + studentData._saldoWadiah;
                const newTotalDeposited =
                  existingBalance.total_deposited + studentData._saldoWadiah;

                const { error: updateError } = await supabase
                  .from("student_wadiah_balance")
                  .update({
                    balance: newBalance,
                    total_deposited: newTotalDeposited,
                    last_transaction_at: new Date().toISOString(),
                  })
                  .eq("student_id", studentId);

                if (updateError) {
                  results.errors.push(
                    `Baris ${studentData._rowIndex + 1}: Gagal update saldo: ${updateError.message}`,
                  );
                } else {
                  // Record transaction for audit
                  await supabase.from("wadiah_transactions").insert({
                    student_id: studentId,
                    transaction_type: "deposit",
                    amount: studentData._saldoWadiah,
                    balance_before: existingBalance.balance,
                    balance_after: newBalance,
                    notes: `Migrasi data - tambahan saldo (${new Date().toLocaleDateString("id-ID")})`,
                    customer_consent: true,
                  });
                }
              } else {
                // Create new wadiah balance record
                const { error: wadiahBalanceError } = await supabase
                  .from("student_wadiah_balance")
                  .insert({
                    student_id: studentId,
                    balance: studentData._saldoWadiah,
                    total_deposited: studentData._saldoWadiah,
                    total_used: 0,
                    total_sedekah: 0,
                  });

                if (wadiahBalanceError) {
                  console.error("Wadiah balance error:", wadiahBalanceError);
                  results.errors.push(
                    `Baris ${studentData._rowIndex + 1}: ${isNewStudent ? "Siswa berhasil dibuat" : "Siswa ditemukan"}, tapi gagal set saldo: ${wadiahBalanceError.message}`,
                  );
                } else {
                  // Record initial transaction for audit
                  await supabase.from("wadiah_transactions").insert({
                    student_id: studentId,
                    transaction_type: "deposit",
                    amount: studentData._saldoWadiah,
                    balance_before: 0,
                    balance_after: studentData._saldoWadiah,
                    notes: `Saldo awal migrasi data (${new Date().toLocaleDateString("id-ID")})`,
                    customer_consent: true,
                  });
                }
              }
            }

            results.success++;
          } catch (err: unknown) {
            results.failed++;
            const errorMessage =
              err instanceof Error ? err.message : "Unknown error";
            results.errors.push(
              `Baris ${studentData._rowIndex + 1}: ${errorMessage}`,
            );
          }

          setProgress(Math.round(((i + 1) / totalRows) * 100));
        }
      } else if (importType === "partners") {
        const partnersToInsert = parsedData.map((row) => ({
          name: (row["nama"] || row["name"] || "").trim(),
          phone:
            (row["telepon"] || row["phone"] || row["hp"] || "").trim() || null,
          address: (row["alamat"] || row["address"] || "").trim() || null,
          is_active: true,
        }));

        for (let i = 0; i < partnersToInsert.length; i += batchSize) {
          const batch = partnersToInsert.slice(i, i + batchSize);
          const validBatch = batch.filter((p) => p.name);

          if (validBatch.length > 0) {
            const { error, data } = await supabase
              .from("laundry_partners")
              .insert(validBatch)
              .select();

            if (error) {
              results.failed += validBatch.length;
              results.errors.push(
                `Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`,
              );
            } else {
              results.success += data?.length || 0;
            }
          }

          results.failed += batch.length - validBatch.length;
          setProgress(Math.round(((i + batch.length) / totalRows) * 100));
        }
      } else if (importType === "orders") {
        // Fetch revenue config for calculating shares
        const { data: configData } = await supabase
          .from("holiday_settings")
          .select(
            "kiloan_yayasan_per_kg, kiloan_vendor_per_kg, non_kiloan_yayasan_percent, non_kiloan_vendor_percent",
          )
          .single();

        const config = configData || {
          kiloan_yayasan_per_kg: 2000,
          kiloan_vendor_per_kg: 5000,
          non_kiloan_yayasan_percent: 20,
          non_kiloan_vendor_percent: 80,
        };

        for (let i = 0; i < parsedData.length; i++) {
          const row = parsedData[i];

          try {
            const student = findStudent(row);
            const partner = findPartner(row);
            const category = parseCategory(row);

            if (!student || !partner || !category) {
              results.failed++;
              continue;
            }

            const categoryInfo = LAUNDRY_CATEGORIES[category];
            const beratKg = parseDecimal(
              row["berat_kg"] || row["berat"] || row["weight"] || "0",
            );
            const jumlah = parseInt(
              row["jumlah"] ||
                row["qty"] ||
                row["quantity"] ||
                row["item_count"] ||
                "0",
              10,
            );

            let totalPrice: number;
            let yayasanShare: number;
            let vendorShare: number;
            let weightKg: number | null = null;
            let itemCount: number | null = null;

            if (category === "kiloan") {
              weightKg = beratKg > 0 ? beratKg : 1;
              totalPrice = Math.round(weightKg * categoryInfo.price);
              yayasanShare = Math.round(
                weightKg * config.kiloan_yayasan_per_kg,
              );
              vendorShare = Math.round(weightKg * config.kiloan_vendor_per_kg);
            } else {
              itemCount = jumlah > 0 ? jumlah : 1;
              totalPrice = Math.round(itemCount * categoryInfo.price);
              yayasanShare = Math.round(
                totalPrice * (config.non_kiloan_yayasan_percent / 100),
              );
              vendorShare = Math.round(
                totalPrice * (config.non_kiloan_vendor_percent / 100),
              );
            }

            const status = parseStatus(row);
            const laundryDate = parseDate(
              row["tanggal_laundry"] || row["tanggal"] || row["date"] || "",
            );
            const paidAt =
              status === "DIBAYAR" || status === "SELESAI"
                ? parseDate(
                    row["tanggal_bayar"] ||
                      row["paid_at"] ||
                      row["tanggal_laundry"] ||
                      "",
                  )
                : null;

            const paymentMethod = (
              row["metode_pembayaran"] ||
              row["payment_method"] ||
              row["metode"] ||
              "tunai"
            )
              .trim()
              .toLowerCase();
            const notes = (
              row["catatan"] ||
              row["notes"] ||
              row["keterangan"] ||
              ""
            ).trim();

            // SECURITY: These price values are calculated from frontend constants,
            // but the backend trigger `trg_validate_order_price` will ALWAYS
            // recalculate and override them with correct values from the database.
            // This ensures price manipulation is not possible.
            const orderData = {
              student_id: student.id,
              partner_id: partner.id,
              staff_id: user.id,
              category: category,
              weight_kg: weightKg,
              item_count: itemCount,
              price_per_unit: categoryInfo.price, // Will be overridden by backend
              total_price: totalPrice, // Will be overridden by backend
              yayasan_share: yayasanShare, // Will be overridden by backend
              vendor_share: vendorShare, // Will be overridden by backend
              admin_fee: 0,
              status: status,
              laundry_date: laundryDate,
              paid_at: paidAt,
              payment_method: paymentMethod || null,
              notes:
                notes ||
                `Data migrasi - ${new Date().toLocaleDateString("id-ID")}`,
            };

            const { error } = await supabase
              .from("laundry_orders")
              .insert(orderData);

            if (error) {
              results.failed++;
              results.errors.push(`Baris ${i + 2}: ${error.message}`);
            } else {
              results.success++;
            }
          } catch (err: unknown) {
            results.failed++;
            const errorMessage =
              err instanceof Error ? err.message : "Unknown error";
            results.errors.push(`Baris ${i + 2}: ${errorMessage}`);
          }

          setProgress(Math.round(((i + 1) / totalRows) * 100));
        }
      }

      setResult(results);

      if (results.success > 0) {
        toast({
          title: "Import selesai",
          description: `${results.success} data berhasil diimport${results.failed > 0 ? `, ${results.failed} gagal` : ""}`,
        });
        onImportComplete?.();
      } else {
        toast({
          variant: "destructive",
          title: "Import gagal",
          description: "Tidak ada data yang berhasil diimport",
        });
      }
    } catch (error: unknown) {
      console.error("Import error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat import";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const template = IMPORT_TEMPLATES[importType];
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
    link.download = `template_${importType}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Template diunduh",
      description: "Silakan isi template dan upload kembali",
    });
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleTypeChange = (value: ImportType) => {
    setImportType(value);
    resetState();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Data
          </DialogTitle>
          <DialogDescription>
            Import data dari file Excel atau CSV untuk migrasi ke sistem
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Step 1: Select Import Type */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium">
                1. Pilih Jenis Data
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Select
                    value={importType}
                    onValueChange={handleTypeChange}
                    disabled={importing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih jenis data" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="students">
                        <span className="flex items-center gap-2">
                          👨‍🎓 Data Siswa/Santri
                        </span>
                      </SelectItem>
                      <SelectItem value="students_wadiah">
                        <span className="flex items-center gap-2">
                          💰 Data Siswa + Saldo Wadiah
                        </span>
                      </SelectItem>
                      <SelectItem value="partners">
                        <span className="flex items-center gap-2">
                          🏪 Data Mitra Laundry
                        </span>
                      </SelectItem>
                      <SelectItem value="orders">
                        <span className="flex items-center gap-2">
                          📋 Data Tagihan/Order
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  onClick={downloadTemplate}
                  disabled={importing}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>

              <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-start gap-2 text-sm">
                  <Info className="h-4 w-4 mt-0.5 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">
                      Kolom yang dibutuhkan:
                    </p>
                    <p className="text-muted-foreground">
                      {IMPORT_TEMPLATES[importType].description}
                    </p>
                    {importType === "orders" && loadingLookups && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Memuat data siswa dan mitra...
                      </p>
                    )}
                    {importType === "orders" && !loadingLookups && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Data tersedia: {students.length} siswa,{" "}
                        {partners.length} mitra
                      </p>
                    )}
                    {importType === "students_wadiah" && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                        ⚠️ Siswa yang sudah ada akan ditambahkan saldo
                        wadiah-nya. Siswa baru akan dibuat dengan saldo wadiah.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Upload File */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium">
                2. Upload File
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileChange}
                    disabled={
                      importing || (importType === "orders" && loadingLookups)
                    }
                    className="cursor-pointer"
                  />
                </div>
                {file && (
                  <Badge
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    <FileSpreadsheet className="h-3 w-3" />
                    {file.name}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Format yang didukung: CSV, Excel (.xlsx, .xls)
              </p>
            </CardContent>
          </Card>

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <Card className="border-destructive/50">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Peringatan Validasi ({validationErrors.length} masalah)
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <ScrollArea className="max-h-[150px]">
                  <ul className="space-y-1 text-sm text-destructive">
                    {validationErrors.map((error, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{error}</span>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Preview Data */}
          {parsedData.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium">
                  3. Preview Data ({parsedData.length} baris)
                </CardTitle>
                <CardDescription>
                  Periksa data sebelum mengimport
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-3">
                <ScrollArea className="h-[200px] rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        {headers.slice(0, 6).map((header) => (
                          <TableHead
                            key={header}
                            className="capitalize whitespace-nowrap"
                          >
                            {header.replace(/_/g, " ")}
                          </TableHead>
                        ))}
                        {headers.length > 6 && <TableHead>...</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedData.slice(0, 50).map((row, index) => (
                        <TableRow key={index}>
                          <TableCell className="text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          {headers.slice(0, 6).map((header) => (
                            <TableCell
                              key={header}
                              className="max-w-[150px] truncate"
                            >
                              {row[header] || "-"}
                            </TableCell>
                          ))}
                          {headers.length > 6 && <TableCell>...</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
                {parsedData.length > 50 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Menampilkan 50 dari {parsedData.length} baris
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Import Progress */}
          {importing && (
            <Card>
              <CardContent className="py-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Mengimport data...
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Import Result */}
          {result && (
            <Card
              className={
                result.success > 0
                  ? "border-green-500/50"
                  : "border-destructive/50"
              }
            >
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  {result.success > 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  Hasil Import
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex items-center gap-4 text-sm">
                  <Badge variant="default" className="bg-green-500">
                    Berhasil: {result.success}
                  </Badge>
                  {result.failed > 0 && (
                    <Badge variant="destructive">Gagal: {result.failed}</Badge>
                  )}
                </div>
                {result.errors.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-sm font-medium text-destructive">
                      Errors:
                    </p>
                    <ScrollArea className="max-h-[100px]">
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {result.errors.slice(0, 10).map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                        {result.errors.length > 10 && (
                          <li>
                            ... dan {result.errors.length - 10} error lainnya
                          </li>
                        )}
                      </ul>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={importing}>
            {result ? "Tutup" : "Batal"}
          </Button>
          {!result && (
            <Button
              onClick={handleImport}
              disabled={
                importing ||
                parsedData.length === 0 ||
                validationErrors.length > 0 ||
                (importType === "orders" && loadingLookups)
              }
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Mengimport...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import {parsedData.length} Data
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
