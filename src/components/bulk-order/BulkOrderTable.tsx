import { useRef, useCallback, KeyboardEvent } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import {
  Trash2,
  Copy,
  Check,
  ChevronsUpDown,
  CalendarIcon,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LAUNDRY_CATEGORIES, type LaundryCategory } from "@/lib/constants";
import type {
  BulkOrderRow,
  Student,
  Partner,
} from "@/hooks/useBulkOrder";

interface BulkOrderTableProps {
  rows: BulkOrderRow[];
  partners: Partner[];
  isLoading?: boolean;
  onUpdateRow: (rowId: string, updates: Partial<BulkOrderRow>) => void;
  onSetStudent: (rowId: string, student: Student | null) => void;
  onRemoveRow: (rowId: string) => void;
  onDuplicateRow: (rowId: string) => void;
  onAddRow: () => void;
  searchStudents: (query: string) => Student[];
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "decimal",
    minimumFractionDigits: 0,
  }).format(amount);
};

export function BulkOrderTable({
  rows,
  partners,
  isLoading,
  onUpdateRow,
  onSetStudent,
  onRemoveRow,
  onDuplicateRow,
  onAddRow,
  searchStudents,
}: BulkOrderTableProps) {
  const tableRef = useRef<HTMLTableElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, rowId: string, field: string) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        // Find next row and focus same field
        const currentRowIndex = rows.findIndex((r) => r.id === rowId);
        if (currentRowIndex < rows.length - 1) {
          const nextRowId = rows[currentRowIndex + 1].id;
          const nextInput = document.querySelector(
            `[data-row="${nextRowId}"][data-field="${field}"]`
          ) as HTMLElement;
          nextInput?.focus();
        } else {
          // Add new row if on last row
          onAddRow();
        }
      }
    },
    [rows, onAddRow]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Memuat data...</span>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <Table ref={tableRef}>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead className="w-28">NIK</TableHead>
              <TableHead className="w-44">Nama Siswa</TableHead>
              <TableHead className="w-20">Kelas</TableHead>
              <TableHead className="w-36">Mitra</TableHead>
              <TableHead className="w-32">Tanggal</TableHead>
              <TableHead className="w-32">Kategori</TableHead>
              <TableHead className="w-24">Qty</TableHead>
              <TableHead className="w-28 text-right">Harga</TableHead>
              <TableHead className="w-20 text-center">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <BulkOrderRowComponent
                key={row.id}
                row={row}
                partners={partners}
                onUpdateRow={onUpdateRow}
                onSetStudent={onSetStudent}
                onRemoveRow={onRemoveRow}
                onDuplicateRow={onDuplicateRow}
                onKeyDown={handleKeyDown}
                searchStudents={searchStudents}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add Row Button */}
      <div className="border-t p-2 bg-muted/30">
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddRow}
          className="w-full text-muted-foreground hover:text-foreground"
        >
          + Tambah baris
        </Button>
      </div>
    </div>
  );
}

// Individual Row Component
interface BulkOrderRowComponentProps {
  row: BulkOrderRow;
  partners: Partner[];
  onUpdateRow: (rowId: string, updates: Partial<BulkOrderRow>) => void;
  onSetStudent: (rowId: string, student: Student | null) => void;
  onRemoveRow: (rowId: string) => void;
  onDuplicateRow: (rowId: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>, rowId: string, field: string) => void;
  searchStudents: (query: string) => Student[];
}

function BulkOrderRowComponent({
  row,
  partners,
  onUpdateRow,
  onSetStudent,
  onRemoveRow,
  onDuplicateRow,
  onKeyDown,
  searchStudents,
}: BulkOrderRowComponentProps) {
  const [studentSearchOpen, setStudentSearchOpen] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [dateOpen, setDateOpen] = useState(false);

  const isKiloan = row.category === "kiloan";
  const hasError = row.errors.length > 0 && row.isDirty;
  const isEmpty = !row.studentId && !row.partnerId && !row.category;

  const filteredStudents = searchStudents(studentSearchQuery);

  const getRowClassName = () => {
    if (row.isSubmitted) return "bg-gray-100 opacity-60";
    if (hasError) return "bg-red-50";
    if (row.isValid) return "bg-green-50";
    if (isEmpty) return "bg-white";
    return "bg-amber-50";
  };

  const getFieldError = (field: string) => {
    return row.errors.find((e) => e.field === field);
  };

  return (
    <TableRow className={cn("transition-colors", getRowClassName())}>
      {/* Row Number */}
      <TableCell className="text-center text-muted-foreground font-mono text-sm">
        <div className="flex items-center justify-center gap-1">
          {row.isSubmitted && <CheckCircle2 className="h-3 w-3 text-green-600" />}
          {hasError && <AlertCircle className="h-3 w-3 text-red-500" />}
          {!row.isSubmitted && !hasError && row.isValid && (
            <Check className="h-3 w-3 text-green-600" />
          )}
          {row.rowNumber}
        </div>
      </TableCell>

      {/* NIK - Student Search */}
      <TableCell>
        <Popover open={studentSearchOpen} onOpenChange={setStudentSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={studentSearchOpen}
              disabled={row.isSubmitted}
              className={cn(
                "w-full justify-between font-mono text-sm h-9",
                getFieldError("student") && "border-red-500",
                row.studentNik && "font-medium"
              )}
            >
              {row.studentNik || "NIK..."}
              <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Cari NIK atau nama..."
                value={studentSearchQuery}
                onValueChange={setStudentSearchQuery}
              />
              <CommandList>
                <CommandEmpty>Siswa tidak ditemukan</CommandEmpty>
                <CommandGroup>
                  {filteredStudents.map((student) => (
                    <CommandItem
                      key={student.id}
                      value={`${student.nik}-${student.name}`}
                      onSelect={() => {
                        onSetStudent(row.id, student);
                        setStudentSearchOpen(false);
                        setStudentSearchQuery("");
                      }}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{student.name}</span>
                        <span className="text-xs text-muted-foreground">
                          NIK: {student.nik} • Kelas {student.class}
                        </span>
                      </div>
                      <Check
                        className={cn(
                          "ml-auto h-4 w-4",
                          row.studentId === student.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </TableCell>

      {/* Nama (Read-only) */}
      <TableCell>
        <span className={cn("text-sm", !row.studentName && "text-muted-foreground")}>
          {row.studentName || "-"}
        </span>
      </TableCell>

      {/* Kelas (Read-only) */}
      <TableCell>
        {row.studentClass && (
          <Badge variant="secondary" className="font-mono">
            {row.studentClass}
          </Badge>
        )}
      </TableCell>

      {/* Mitra */}
      <TableCell>
        <Select
          value={row.partnerId}
          onValueChange={(value) => onUpdateRow(row.id, { partnerId: value })}
          disabled={row.isSubmitted}
        >
          <SelectTrigger
            className={cn("h-9", getFieldError("partner") && "border-red-500")}
          >
            <SelectValue placeholder="Pilih..." />
          </SelectTrigger>
          <SelectContent>
            {partners.map((partner) => (
              <SelectItem key={partner.id} value={partner.id}>
                {partner.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      {/* Tanggal */}
      <TableCell>
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              disabled={row.isSubmitted}
              className={cn(
                "w-full justify-start text-left font-normal h-9 text-sm",
                !row.laundryDate && "text-muted-foreground",
                getFieldError("date") && "border-red-500"
              )}
            >
              <CalendarIcon className="mr-2 h-3 w-3" />
              {row.laundryDate
                ? format(new Date(row.laundryDate), "dd/MM/yy", { locale: id })
                : "Pilih..."}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={row.laundryDate ? new Date(row.laundryDate) : undefined}
              onSelect={(date) => {
                if (date) {
                  onUpdateRow(row.id, {
                    laundryDate: format(date, "yyyy-MM-dd"),
                  });
                }
                setDateOpen(false);
              }}
              disabled={(date) => {
                const today = new Date();
                today.setHours(23, 59, 59, 999);
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                return date > today || date < thirtyDaysAgo;
              }}
              initialFocus
              locale={id}
            />
          </PopoverContent>
        </Popover>
      </TableCell>

      {/* Kategori */}
      <TableCell>
        <Select
          value={row.category}
          onValueChange={(value) =>
            onUpdateRow(row.id, {
              category: value as LaundryCategory,
              weightKg: "",
              itemCount: "",
            })
          }
          disabled={row.isSubmitted}
        >
          <SelectTrigger
            className={cn("h-9", getFieldError("category") && "border-red-500")}
          >
            <SelectValue placeholder="Pilih..." />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(LAUNDRY_CATEGORIES).map(([key, cat]) => (
              <SelectItem key={key} value={key}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      {/* Qty */}
      <TableCell>
        {row.category && (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              step={isKiloan ? "0.1" : "1"}
              min="0"
              max={isKiloan ? "50" : "100"}
              value={isKiloan ? row.weightKg : row.itemCount}
              onChange={(e) =>
                onUpdateRow(row.id, {
                  [isKiloan ? "weightKg" : "itemCount"]: e.target.value,
                })
              }
              onKeyDown={(e) => onKeyDown(e, row.id, "quantity")}
              disabled={row.isSubmitted}
              data-row={row.id}
              data-field="quantity"
              className={cn(
                "h-9 w-16 text-right",
                getFieldError("quantity") && "border-red-500"
              )}
            />
            <span className="text-xs text-muted-foreground w-6">
              {isKiloan ? "kg" : "pcs"}
            </span>
          </div>
        )}
      </TableCell>

      {/* Harga */}
      <TableCell className="text-right">
        {row.totalPrice > 0 ? (
          <span className="font-medium text-sm">
            Rp{formatCurrency(row.totalPrice)}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>

      {/* Aksi */}
      <TableCell>
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onDuplicateRow(row.id)}
            disabled={row.isSubmitted || isEmpty}
            title="Duplikat"
          >
            <Copy className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onRemoveRow(row.id)}
            disabled={row.isSubmitted}
            title="Hapus"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// Need to import useState for the row component
import { useState } from "react";
