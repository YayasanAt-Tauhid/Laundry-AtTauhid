import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, MessageSquare, Loader2, FileDown } from "lucide-react";
import { useArrearsData, type StudentArrears } from "@/hooks/useArrearsData";
import { ArrearsMessageComposer } from "@/components/arrears/ArrearsMessageComposer";
import { formatCurrency } from "@/utils/format";
import * as XLSX from "xlsx-js-style";

export default function ArrearsMessaging() {
  const {
    data,
    loading,
    searchQuery,
    setSearchQuery,
    classFilter,
    setClassFilter,
    classes,
  } = useArrearsData();

  const [selectedStudent, setSelectedStudent] = useState<StudentArrears | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const handleOpenComposer = (student: StudentArrears) => {
    setSelectedStudent(student);
    setComposerOpen(true);
  };

  const totalArrears = data.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalStudents = data.length;

  const handleExport = () => {
    const rows = data.map((s) => ({
      NIK: s.nik,
      "Nama Siswa": s.studentName,
      Kelas: s.studentClass,
      "Nama Orang Tua": s.parentName || "-",
      "No HP": s.parentPhone || "-",
      "Jumlah Order": s.orderCount,
      "Total Tunggakan": s.totalAmount,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tunggakan");
    XLSX.writeFile(wb, `Tunggakan_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Pesan Tunggakan</h1>
          <p className="text-muted-foreground">
            Kirim pesan tunggakan ke orang tua beserta link pembayaran langsung
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Siswa Menunggak
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totalStudents}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Tunggakan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-destructive">{formatCurrency(totalArrears)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama atau NIK..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Semua Kelas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kelas</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExport} disabled={data.length === 0}>
            <FileDown className="h-4 w-4" />
            Export Excel
          </Button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : data.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Tidak ada siswa menunggak
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>NIK</TableHead>
                    <TableHead>Nama Siswa</TableHead>
                    <TableHead>Kelas</TableHead>
                    <TableHead>Orang Tua</TableHead>
                    <TableHead>No HP</TableHead>
                    <TableHead className="text-right">Order</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((student) => (
                    <TableRow key={student.studentId}>
                      <TableCell className="font-mono text-xs">{student.nik}</TableCell>
                      <TableCell className="font-medium">{student.studentName}</TableCell>
                      <TableCell>{student.studentClass}</TableCell>
                      <TableCell>{student.parentName || <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell>{student.parentPhone || <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="text-right">{student.orderCount}</TableCell>
                      <TableCell className="text-right font-medium text-destructive">
                        {formatCurrency(student.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => handleOpenComposer(student)}>
                          <MessageSquare className="h-4 w-4" />
                          <span className="hidden sm:inline ml-1">Kirim</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <ArrearsMessageComposer
        student={selectedStudent}
        open={composerOpen}
        onOpenChange={setComposerOpen}
      />
    </DashboardLayout>
  );
}
