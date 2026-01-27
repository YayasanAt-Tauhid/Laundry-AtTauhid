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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  Link2,
  AlertTriangle,
} from "lucide-react";

interface StudentLink {
  nik: string;
  name?: string;
  class?: string;
}

interface ParentData {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  students: StudentLink[];
}

interface ParsedRow {
  [key: string]: string;
}

interface StudentLinkResult {
  nik: string;
  found: boolean;
  linked: boolean;
  student_name?: string;
  student_class?: string;
  error?: string;
  already_has_parent?: boolean;
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

interface ImportParentLinkProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

const TEMPLATE_HEADERS = [
  "email",
  "password",
  "nama_orangtua",
  "telepon",
  "nik_siswa",
];

const TEMPLATE_EXAMPLE = [
  [
    "orangtua1@email.com",
    "password123",
    "Budi Santoso",
    "081234567890",
    "12345",
  ],
  [
    "orangtua1@email.com",
    "password123",
    "Budi Santoso",
    "081234567890",
    "12346",
  ],
  ["orangtua2@email.com", "rahasia456", "Ani Wijaya", "082345678901", "12347"],
];

export function ImportParentLink({
  open,
  onOpenChange,
  onImportComplete,
}: ImportParentLinkProps) {
  const { session } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [overwriteParent, setOverwriteParent] = useState(false);

  const resetState = useCallback(() => {
    setFile(null);
    setParsedData([]);
    setHeaders([]);
    setProgress(0);
    setResults([]);
    setSummary(null);
    setValidationErrors([]);
    setOverwriteParent(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const parseCSV = (text: string): { headers: string[]; rows: ParsedRow[] } => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    let headers: string[] = [];
    const rows: ParsedRow[] = [];

    if (lines.length === 0) return { headers, rows };

    const firstLine = lines[0];
    let delimiter = ",";
    if (firstLine.includes(";") && !firstLine.includes(",")) {
      delimiter = ";";
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
      h.toLowerCase().replace(/['"]/g, "").trim(),
    );
    headers = headerRow;

    for (let i = 1; i < lines.length; i++) {
      const values = parseRow(lines[i]);
      if (values.some((v) => v.trim())) {
        const row: ParsedRow = {};
        headerRow.forEach((header, index) => {
          row[header] = (values[index] || "").replace(/['"]/g, "").trim();
        });
        rows.push(row);
      }
    }

    return { headers, rows };
  };

  const validateData = (rows: ParsedRow[]) => {
    const errors: string[] = [];
    const emails = new Set<string>();

    rows.forEach((row, index) => {
      const rowNum = index + 2;
      const email = (row["email"] || "").trim().toLowerCase();
      const password = (row["password"] || row["kata_sandi"] || "").trim();
      const parentName = (
        row["nama_orangtua"] ||
        row["nama_parent"] ||
        row["nama_ortu"] ||
        row["nama"] ||
        ""
      ).trim();
      const nik = (row["nik_siswa"] || row["nik"] || row["nis"] || "").trim();

      if (!email) {
        errors.push(`Baris ${rowNum}: Email wajib diisi`);
        return;
      }

      if (!emails.has(email)) {
        if (!password) {
          errors.push(`Baris ${rowNum}: Password wajib diisi untuk ${email}`);
        } else if (password.length < 6) {
          errors.push(
            `Baris ${rowNum}: Password minimal 6 karakter untuk ${email}`,
          );
        }

        if (!parentName) {
          errors.push(
            `Baris ${rowNum}: Nama orang tua wajib diisi untuk ${email}`,
          );
        }
      }

      if (!nik) {
        errors.push(`Baris ${rowNum}: NIK siswa wajib diisi`);
      }

      emails.add(email);
    });

    return errors;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const extension = selectedFile.name.split(".").pop()?.toLowerCase();
    if (extension !== "csv") {
      toast({
        variant: "destructive",
        title: "Format tidak didukung",
        description: "Silakan upload file CSV",
      });
      return;
    }

    setFile(selectedFile);

    try {
      const text = await selectedFile.text();
      const { headers: parsedHeaders, rows } = parseCSV(text);

      setHeaders(parsedHeaders);
      setParsedData(rows);

      const errors = validateData(rows);
      setValidationErrors(errors);

      if (errors.length > 0) {
        toast({
          variant: "destructive",
          title: "Data tidak valid",
          description: `Ditemukan ${errors.length} kesalahan. Periksa detail di bawah.`,
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal membaca file",
        description: "Pastikan file CSV valid",
      });
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
        row["nama"] ||
        ""
      ).trim();
      const phone = (row["telepon"] || row["phone"] || row["hp"] || "").trim();
      const nik = (row["nik_siswa"] || row["nik"] || row["nis"] || "").trim();

      if (!email || !nik) return;

      const student: StudentLink = {
        nik,
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

      // Use fetch directly to call edge function with proper headers
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/import-parents-link`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: supabaseAnonKey,
          },
          body: JSON.stringify({
            parents: parentData,
            overwrite_parent: overwriteParent,
          }),
        },
      );

      setProgress(90);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();

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
        row.map((cell) => (cell.includes(",") ? `"${cell}"` : cell)).join(","),
      ),
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "template_import_orangtua_link.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Template diunduh",
      description: "Silakan isi template dengan NIK siswa yang sudah ada",
    });
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const uniqueParents = new Set(
    parsedData.map((row) => (row["email"] || "").trim().toLowerCase()),
  ).size;

  const uniqueNiks = new Set(
    parsedData.map((row) =>
      (row["nik_siswa"] || row["nik"] || row["nis"] || "").trim(),
    ),
  ).size;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Import Orang Tua & Hubungkan Siswa
          </DialogTitle>
          <DialogDescription>
            Import data orang tua dan hubungkan ke siswa yang{" "}
            <strong>sudah ada</strong> berdasarkan NIK. Siswa baru tidak akan
            dibuat.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Warning Alert */}
          <Alert
            variant="default"
            className="border-amber-500 bg-amber-50 dark:bg-amber-950/30"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">
              Penting!
            </AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>
                  Pastikan{" "}
                  <strong>data siswa sudah diimport terlebih dahulu</strong>
                </li>
                <li>
                  Siswa akan dihubungkan berdasarkan <strong>NIK</strong>
                </li>
                <li>Jika NIK tidak ditemukan, siswa tidak akan dihubungkan</li>
                <li>
                  Fungsi ini <strong>tidak membuat siswa baru</strong>
                </li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* Step 1: Download Template */}
          {!file && !summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Step 1: Download Template
                </CardTitle>
                <CardDescription>
                  Download template CSV, isi dengan data, lalu upload
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <Button variant="outline" onClick={downloadTemplate}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Download Template CSV
                  </Button>
                </div>

                <div className="text-sm text-muted-foreground">
                  <p className="font-medium mb-2">Format kolom:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>
                      <code className="bg-muted px-1 rounded">email</code> -
                      Email orang tua (untuk login)
                    </li>
                    <li>
                      <code className="bg-muted px-1 rounded">password</code> -
                      Password (min 6 karakter)
                    </li>
                    <li>
                      <code className="bg-muted px-1 rounded">
                        nama_orangtua
                      </code>{" "}
                      - Nama lengkap orang tua
                    </li>
                    <li>
                      <code className="bg-muted px-1 rounded">telepon</code> -
                      Nomor telepon (opsional)
                    </li>
                    <li>
                      <code className="bg-muted px-1 rounded">nik_siswa</code> -
                      NIK siswa yang sudah ada
                    </li>
                  </ul>
                  <p className="mt-3 text-xs">
                    💡 Untuk orang tua dengan beberapa anak, ulangi baris dengan
                    email yang sama tapi NIK berbeda
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Upload File */}
          {!summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  {file ? "Step 2: Preview Data" : "Step 2: Upload File"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  disabled={importing}
                />

                {/* Validation Errors */}
                {validationErrors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Data tidak valid</AlertTitle>
                    <AlertDescription>
                      <ScrollArea className="h-32 mt-2">
                        <ul className="list-disc list-inside space-y-1">
                          {validationErrors.map((error, index) => (
                            <li key={index} className="text-sm">
                              {error}
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Data Preview */}
                {parsedData.length > 0 && validationErrors.length === 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {uniqueParents} Orang Tua
                      </span>
                      <span className="flex items-center gap-1">
                        <GraduationCap className="h-4 w-4" />
                        {uniqueNiks} NIK Siswa
                      </span>
                    </div>

                    <ScrollArea className="h-48 rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Email</TableHead>
                            <TableHead>Nama Orang Tua</TableHead>
                            <TableHead>Telepon</TableHead>
                            <TableHead>NIK Siswa</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parsedData.slice(0, 20).map((row, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-mono text-xs">
                                {row["email"]}
                              </TableCell>
                              <TableCell>
                                {row["nama_orangtua"] ||
                                  row["nama_parent"] ||
                                  row["nama"]}
                              </TableCell>
                              <TableCell>
                                {row["telepon"] || row["phone"] || "-"}
                              </TableCell>
                              <TableCell className="font-mono">
                                {row["nik_siswa"] || row["nik"] || row["nis"]}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                    {parsedData.length > 20 && (
                      <p className="text-xs text-muted-foreground text-center">
                        Menampilkan 20 dari {parsedData.length} baris
                      </p>
                    )}

                    {/* Overwrite Option */}
                    <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
                      <Checkbox
                        id="overwrite"
                        checked={overwriteParent}
                        onCheckedChange={(checked) =>
                          setOverwriteParent(checked === true)
                        }
                      />
                      <Label
                        htmlFor="overwrite"
                        className="text-sm cursor-pointer"
                      >
                        Timpa orang tua sebelumnya jika siswa sudah terhubung ke
                        orang tua lain
                      </Label>
                    </div>
                  </div>
                )}

                {/* Progress */}
                {importing && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Mengimport data...</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Hasil Import
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      Orang Tua Berhasil
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {summary.parents_success}
                    </p>
                  </div>
                  <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      Orang Tua Gagal
                    </p>
                    <p className="text-2xl font-bold text-red-600">
                      {summary.parents_failed}
                    </p>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      Siswa Terhubung
                    </p>
                    <p className="text-2xl font-bold text-blue-600">
                      {summary.students_linked}
                    </p>
                  </div>
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      NIK Tidak Ditemukan
                    </p>
                    <p className="text-2xl font-bold text-amber-600">
                      {summary.students_not_found}
                    </p>
                  </div>
                  <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      Sudah Ada Orang Tua
                    </p>
                    <p className="text-2xl font-bold text-purple-600">
                      {summary.students_already_linked}
                    </p>
                  </div>
                </div>

                {/* Detail Results */}
                <ScrollArea className="h-64 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Nama Orang Tua</TableHead>
                        <TableHead>Siswa Terhubung</TableHead>
                        <TableHead>Detail</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((result, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            {result.success ? (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Berhasil
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                <XCircle className="h-3 w-3 mr-1" />
                                Gagal
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {result.email}
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">
                              {result.parent_name}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {result.students_linked} /{" "}
                              {result.student_details.length}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {result.error ? (
                              <span className="text-red-600">
                                {result.error}
                              </span>
                            ) : (
                              <div className="space-y-1">
                                {result.student_details.map((s, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-1"
                                  >
                                    {s.linked ? (
                                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                                    ) : (
                                      <XCircle className="h-3 w-3 text-red-500" />
                                    )}
                                    <span className="font-mono">{s.nik}</span>
                                    {s.student_name && (
                                      <span className="text-muted-foreground">
                                        ({s.student_name})
                                      </span>
                                    )}
                                    {s.error && (
                                      <span className="text-red-500">
                                        - {s.error}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={importing}>
            {summary ? "Tutup" : "Batal"}
          </Button>

          {!summary &&
            parsedData.length > 0 &&
            validationErrors.length === 0 && (
              <Button onClick={handleImport} disabled={importing}>
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Mengimport...
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4 mr-2" />
                    Import & Hubungkan {uniqueParents} Orang Tua
                  </>
                )}
              </Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
