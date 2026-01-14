import { useState, useRef, useCallback } from "react";
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
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Info,
  Users,
  GraduationCap,
} from "lucide-react";

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

interface ParsedRow {
  [key: string]: string;
}

interface ImportResult {
  success: boolean;
  email: string;
  parent_name: string;
  user_id?: string;
  students_created: number;
  error?: string;
}

interface ImportSummary {
  total: number;
  success: number;
  failed: number;
  students_created: number;
}

interface ImportParentDataProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

const TEMPLATE_HEADERS = [
  "email",
  "password",
  "nama_orangtua",
  "telepon",
  "nama_siswa",
  "kelas",
  "nis",
];

const TEMPLATE_EXAMPLE = [
  [
    "orangtua1@email.com",
    "password123",
    "Budi Santoso",
    "081234567890",
    "Ahmad Budi",
    "7A",
    "12345",
  ],
  [
    "orangtua1@email.com",
    "password123",
    "Budi Santoso",
    "081234567890",
    "Siti Budi",
    "5B",
    "12346",
  ],
  [
    "orangtua2@email.com",
    "rahasia456",
    "Ani Wijaya",
    "082345678901",
    "Rizki Wijaya",
    "8C",
    "12347",
  ],
];

export function ImportParentData({
  open,
  onOpenChange,
  onImportComplete,
}: ImportParentDataProps) {
  const { session } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const resetState = useCallback(() => {
    setFile(null);
    setParsedData([]);
    setHeaders([]);
    setProgress(0);
    setResults(null);
    setSummary(null);
    setValidationErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const parseCSV = (text: string): { headers: string[]; rows: ParsedRow[] } => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    // Detect delimiter
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
      h.toLowerCase().trim().replace(/\s+/g, "_")
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

  const validateData = (rows: ParsedRow[]): string[] => {
    const errors: string[] = [];
    const emails = new Set<string>();

    rows.forEach((row, index) => {
      const rowNum = index + 2; // +2 because of header and 0-index
      const email = (row["email"] || "").trim().toLowerCase();
      const password = (row["password"] || row["kata_sandi"] || "").trim();
      const parentName = (
        row["nama_orangtua"] ||
        row["nama_parent"] ||
        row["nama_ortu"] ||
        ""
      ).trim();
      const studentName = (
        row["nama_siswa"] ||
        row["nama_anak"] ||
        row["siswa"] ||
        ""
      ).trim();
      const studentClass = (row["kelas"] || row["class"] || "").trim();

      if (!email) {
        errors.push(`Baris ${rowNum}: Email wajib diisi`);
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push(`Baris ${rowNum}: Format email tidak valid`);
      }

      // Only check password for first occurrence of email
      if (!emails.has(email)) {
        if (!password) {
          errors.push(`Baris ${rowNum}: Password wajib diisi untuk ${email}`);
        } else if (password.length < 6) {
          errors.push(
            `Baris ${rowNum}: Password minimal 6 karakter untuk ${email}`
          );
        }

        if (!parentName) {
          errors.push(
            `Baris ${rowNum}: Nama orang tua wajib diisi untuk ${email}`
          );
        }

        emails.add(email);
      }

      if (!studentName) {
        errors.push(`Baris ${rowNum}: Nama siswa wajib diisi`);
      }

      if (!studentClass) {
        errors.push(`Baris ${rowNum}: Kelas siswa wajib diisi`);
      }
    });

    return errors;
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
    setResults(null);
    setSummary(null);
    setValidationErrors([]);

    try {
      if (extension === "csv") {
        const text = await selectedFile.text();
        const { headers: parsedHeaders, rows } = parseCSV(text);
        setHeaders(parsedHeaders);
        setParsedData(rows);
        const errors = validateData(rows);
        setValidationErrors(errors);
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
            const errors = validateData(rows);
            setValidationErrors(errors);
          } else {
            throw new Error("Cannot read Excel file");
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

  const groupDataByParent = (rows: ParsedRow[]): ParentData[] => {
    const parentMap = new Map<string, ParentData>();

    rows.forEach((row) => {
      const email = (row["email"] || "").trim().toLowerCase();
      const password = (row["password"] || row["kata_sandi"] || "").trim();
      const parentName = (
        row["nama_orangtua"] ||
        row["nama_parent"] ||
        row["nama_ortu"] ||
        ""
      ).trim();
      const phone = (row["telepon"] || row["phone"] || row["hp"] || "").trim();
      const studentName = (
        row["nama_siswa"] ||
        row["nama_anak"] ||
        row["siswa"] ||
        ""
      ).trim();
      const studentClass = (row["kelas"] || row["class"] || "").trim();
      const studentNis = (row["nis"] || row["nomor_induk"] || "").trim();

      if (!email || !studentName || !studentClass) return;

      const student: StudentData = {
        name: studentName,
        class: studentClass,
        nis: studentNis || undefined,
      };

      if (parentMap.has(email)) {
        parentMap.get(email)!.students.push(student);
      } else {
        parentMap.set(email, {
          email,
          password,
          full_name: parentName,
          phone: phone || undefined,
          students: [student],
        });
      }
    });

    return Array.from(parentMap.values());
  };

  const handleImport = async () => {
    if (!session?.access_token) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Sesi tidak valid. Silakan login ulang.",
      });
      return;
    }

    setImporting(true);
    setProgress(10);

    try {
      const parentData = groupDataByParent(parsedData);

      if (parentData.length === 0) {
        throw new Error("Tidak ada data valid untuk diimport");
      }

      setProgress(30);

      // Call the edge function
      const { data, error } = await supabase.functions.invoke("import-parents", {
        body: { parents: parentData },
      });

      setProgress(90);

      if (error) {
        throw new Error(error.message || "Gagal memanggil fungsi import");
      }

      if (!data.success && data.error) {
        throw new Error(data.error);
      }

      setResults(data.results);
      setSummary(data.summary);
      setProgress(100);

      toast({
        title: "Import Selesai",
        description: data.message,
      });

      if (onImportComplete) {
        onImportComplete();
      }
    } catch (error: unknown) {
      console.error("Import error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Gagal mengimport data";
      toast({
        variant: "destructive",
        title: "Import Gagal",
        description: errorMessage,
      });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = [
      TEMPLATE_HEADERS.join(","),
      ...TEMPLATE_EXAMPLE.map((row) =>
        row.map((cell) => (cell.includes(",") ? `"${cell}"` : cell)).join(",")
      ),
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "template_import_orangtua.csv";
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

  // Count unique parents and students
  const uniqueParents = new Set(
    parsedData.map((row) => (row["email"] || "").trim().toLowerCase())
  ).size;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Import Data Orang Tua & Siswa
          </DialogTitle>
          <DialogDescription>
            Import data orang tua beserta anak/siswa untuk login ke sistem.
            Setiap orang tua dapat memiliki beberapa anak.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Info Card */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-primary mt-0.5" />
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-foreground">
                    Petunjuk Import:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>
                      Jika satu orang tua memiliki beberapa anak, gunakan email
                      yang sama untuk setiap baris anak
                    </li>
                    <li>
                      Password hanya perlu diisi pada baris pertama setiap orang
                      tua
                    </li>
                    <li>Email akan otomatis dikonfirmasi tanpa verifikasi</li>
                    <li>
                      Format kolom: email, password, nama_orangtua, telepon,
                      nama_siswa, kelas, nis
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 1: Download Template */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium">
                1. Download Template
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <Button
                variant="outline"
                onClick={downloadTemplate}
                disabled={importing}
              >
                <Download className="h-4 w-4 mr-2" />
                Download Template CSV
              </Button>
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
                    disabled={importing}
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
                    {validationErrors.slice(0, 20).map((error, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{error}</span>
                      </li>
                    ))}
                    {validationErrors.length > 20 && (
                      <li className="text-muted-foreground">
                        ... dan {validationErrors.length - 20} error lainnya
                      </li>
                    )}
                  </ul>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Preview Data */}
          {parsedData.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  3. Preview Data
                </CardTitle>
                <CardDescription className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {uniqueParents} Orang Tua
                  </span>
                  <span className="flex items-center gap-1">
                    <GraduationCap className="h-4 w-4" />
                    {parsedData.length} Siswa
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-3">
                <ScrollArea className="h-[200px] rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        {headers.slice(0, 7).map((header) => (
                          <TableHead
                            key={header}
                            className="capitalize whitespace-nowrap"
                          >
                            {header.replace(/_/g, " ")}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedData.slice(0, 50).map((row, index) => (
                        <TableRow key={index}>
                          <TableCell className="text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          {headers.slice(0, 7).map((header) => (
                            <TableCell
                              key={header}
                              className="max-w-[150px] truncate"
                            >
                              {header === "password" ? "••••••" : row[header] || "-"}
                            </TableCell>
                          ))}
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
                      Mengimport data orang tua dan siswa...
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Import Result */}
          {summary && results && (
            <Card
              className={
                summary.success > 0
                  ? "border-green-500/50"
                  : "border-destructive/50"
              }
            >
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  {summary.success > 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  Hasil Import
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex flex-wrap items-center gap-2 text-sm mb-3">
                  <Badge variant="default" className="bg-green-500">
                    Orang Tua Berhasil: {summary.success}
                  </Badge>
                  {summary.failed > 0 && (
                    <Badge variant="destructive">
                      Orang Tua Gagal: {summary.failed}
                    </Badge>
                  )}
                  <Badge variant="secondary">
                    Siswa Dibuat: {summary.students_created}
                  </Badge>
                </div>

                {/* Detailed Results */}
                <ScrollArea className="max-h-[200px]">
                  <div className="space-y-2">
                    {results.map((result, index) => (
                      <div
                        key={index}
                        className={`p-2 rounded-md text-sm ${
                          result.success
                            ? "bg-green-500/10 border border-green-500/20"
                            : "bg-destructive/10 border border-destructive/20"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {result.success ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive shrink-0" />
                          )}
                          <span className="font-medium">
                            {result.parent_name}
                          </span>
                          <span className="text-muted-foreground">
                            ({result.email})
                          </span>
                        </div>
                        {result.success ? (
                          <p className="text-xs text-muted-foreground ml-6">
                            {result.students_created} siswa berhasil dibuat
                          </p>
                        ) : (
                          <p className="text-xs text-destructive ml-6">
                            {result.error}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={importing}>
            {summary ? "Tutup" : "Batal"}
          </Button>
          {!summary && (
            <Button
              onClick={handleImport}
              disabled={
                importing ||
                parsedData.length === 0 ||
                validationErrors.length > 0
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
                  Import {uniqueParents} Orang Tua & {parsedData.length} Siswa
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
