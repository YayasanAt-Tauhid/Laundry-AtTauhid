import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { Eye, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LAUNDRY_CATEGORIES } from "@/lib/constants";
import type { OrderStatus } from "@/lib/constants";

export interface BillRow {
  id: string;
  rowNumber: number;
  studentNik: string;
  studentName: string;
  studentClass: string;
  partnerName: string;
  laundryDate: string;
  category: string;
  weightKg: number | null;
  itemCount: number | null;
  pricePerUnit: number;
  totalPrice: number;
  yayasanShare: number;
  vendorShare: number;
  status: OrderStatus;
  notes: string | null;
  createdAt: string;
}

interface StaffBillsTableProps {
  bills: BillRow[];
  isLoading?: boolean;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "decimal",
    minimumFractionDigits: 0,
  }).format(amount);
};

const formatLaundryDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr + "T00:00:00");
    return format(date, "dd/MM/yy", { locale: id });
  } catch {
    return dateStr;
  }
};

const formatFullDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr + "T00:00:00");
    return format(date, "EEEE, dd MMMM yyyy", { locale: id });
  } catch {
    return dateStr;
  }
};

export function StaffBillsTable({ bills, isLoading }: StaffBillsTableProps) {
  const [selectedBill, setSelectedBill] = useState<BillRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const openDetail = (bill: BillRow) => {
    setSelectedBill(bill);
    setDetailOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Memuat data...</span>
      </div>
    );
  }

  if (bills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-4xl mb-3">📋</div>
        <h3 className="text-lg font-medium text-foreground mb-2">
          Belum ada tagihan
        </h3>
        <p className="text-muted-foreground">
          Tagihan laundry yang telah diinput akan muncul di sini
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
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
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-20 text-center">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map((bill) => (
                <BillRowComponent
                  key={bill.id}
                  bill={bill}
                  onOpenDetail={openDetail}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detail Tagihan</DialogTitle>
          </DialogHeader>
          {selectedBill && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">NIK</p>
                  <p className="font-mono font-medium">{selectedBill.studentNik}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Siswa</p>
                  <p className="font-medium">{selectedBill.studentName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Kelas</p>
                  <p className="font-medium">{selectedBill.studentClass}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Mitra Laundry</p>
                  <p className="font-medium">{selectedBill.partnerName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tanggal Laundry</p>
                  <p className="font-medium">{formatFullDate(selectedBill.laundryDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Kategori</p>
                  <p className="font-medium">
                    {LAUNDRY_CATEGORIES[selectedBill.category as keyof typeof LAUNDRY_CATEGORIES]?.label || selectedBill.category}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Jumlah</p>
                  <p className="font-medium">
                    {selectedBill.category === "kiloan"
                      ? `${selectedBill.weightKg} kg`
                      : `${selectedBill.itemCount} pcs`}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Harga Satuan</p>
                  <p className="font-medium">
                    Rp{formatCurrency(selectedBill.pricePerUnit)}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Harga</p>
                    <p className="text-xl font-bold text-primary">
                      Rp{formatCurrency(selectedBill.totalPrice)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <StatusBadge status={selectedBill.status} />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">Bagi Hasil</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
                    <p className="text-sm text-muted-foreground">Yayasan</p>
                    <p className="font-bold text-green-600">
                      Rp{formatCurrency(selectedBill.yayasanShare)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                    <p className="text-sm text-muted-foreground">Vendor</p>
                    <p className="font-bold text-blue-600">
                      Rp{formatCurrency(selectedBill.vendorShare)}
                    </p>
                  </div>
                </div>
              </div>

              {selectedBill.notes && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground">Catatan</p>
                  <p className="font-medium">{selectedBill.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Individual Row Component
interface BillRowComponentProps {
  bill: BillRow;
  onOpenDetail: (bill: BillRow) => void;
}

function BillRowComponent({ bill, onOpenDetail }: BillRowComponentProps) {
  const isKiloan = bill.category === "kiloan";

  const getRowClassName = () => {
    switch (bill.status) {
      case "DIBAYAR":
      case "SELESAI":
        return "bg-green-50/50 dark:bg-green-950/20";
      case "DITOLAK_MITRA":
        return "bg-red-50/50 dark:bg-red-950/20";
      case "MENUNGGU_APPROVAL_MITRA":
        return "bg-amber-50/50 dark:bg-amber-950/20";
      case "MENUNGGU_PEMBAYARAN":
        return "bg-blue-50/50 dark:bg-blue-950/20";
      default:
        return "";
    }
  };

  return (
    <TableRow className={cn("transition-colors hover:bg-muted/30", getRowClassName())}>
      {/* Row Number */}
      <TableCell className="text-center text-muted-foreground font-mono text-sm">
        {bill.rowNumber}
      </TableCell>

      {/* NIK */}
      <TableCell>
        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
          {bill.studentNik}
        </span>
      </TableCell>

      {/* Nama Siswa */}
      <TableCell>
        <span className="font-medium text-sm">{bill.studentName}</span>
      </TableCell>

      {/* Kelas */}
      <TableCell>
        <Badge variant="secondary" className="font-mono">
          {bill.studentClass}
        </Badge>
      </TableCell>

      {/* Mitra */}
      <TableCell>
        <span className="text-sm">{bill.partnerName}</span>
      </TableCell>

      {/* Tanggal */}
      <TableCell>
        <span className="text-sm">{formatLaundryDate(bill.laundryDate)}</span>
      </TableCell>

      {/* Kategori */}
      <TableCell>
        <span className="text-sm">
          {LAUNDRY_CATEGORIES[bill.category as keyof typeof LAUNDRY_CATEGORIES]?.label || bill.category}
        </span>
      </TableCell>

      {/* Qty */}
      <TableCell>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium">
            {isKiloan ? bill.weightKg : bill.itemCount}
          </span>
          <span className="text-xs text-muted-foreground">
            {isKiloan ? "kg" : "pcs"}
          </span>
        </div>
      </TableCell>

      {/* Harga */}
      <TableCell className="text-right">
        <span className="font-medium text-sm">
          Rp{formatCurrency(bill.totalPrice)}
        </span>
      </TableCell>

      {/* Status */}
      <TableCell>
        <StatusBadge status={bill.status} />
      </TableCell>

      {/* Aksi */}
      <TableCell>
        <div className="flex items-center justify-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onOpenDetail(bill)}
            title="Lihat Detail"
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
