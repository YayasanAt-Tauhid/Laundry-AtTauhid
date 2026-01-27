import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Banknote, CreditCard, Printer, Eye, Loader2 } from "lucide-react";
import { formatCurrency, formatDate, formatTime } from "@/utils/format";
import { LAUNDRY_CATEGORIES } from "@/lib/constants";
import type { PaymentGroup } from "@/types/cashier-reports";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PaymentTableProps {
  paymentGroups: PaymentGroup[];
  loading: boolean;
  onViewDetail: (group: PaymentGroup) => void;
  onPrintReceipt: (group: PaymentGroup) => void;
}

export function PaymentTable({
  paymentGroups,
  loading,
  onViewDetail,
  onPrintReceipt,
}: PaymentTableProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (paymentGroups.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-4 rounded-full bg-muted mb-4">
            <Banknote className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Tidak ada transaksi ditemukan</p>
          <p className="text-xs text-muted-foreground mt-1">
            Coba ubah filter atau periode waktu
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Riwayat Transaksi</span>
          <Badge variant="outline">{paymentGroups.length} grup transaksi</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[50px]">No</TableHead>
                <TableHead>Waktu</TableHead>
                <TableHead>Siswa</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Tagihan</TableHead>
                <TableHead className="text-right">Dibayar</TableHead>
                <TableHead>Metode</TableHead>
                <TableHead className="text-center w-[100px]">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentGroups.map((group, idx) => (
                <TableRow key={group.groupId} className="hover:bg-muted/30">
                  <TableCell className="font-medium text-muted-foreground">
                    {idx + 1}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p className="font-medium">{formatDate(group.paidAt)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(group.paidAt)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{group.studentName}</p>
                      <p className="text-xs text-muted-foreground">
                        Kelas {group.studentClass}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {group.items.length === 1 ? (
                      <div className="text-sm">
                        <p>
                          {LAUNDRY_CATEGORIES[
                            group.items[0].category as keyof typeof LAUNDRY_CATEGORIES
                          ]?.label || group.items[0].category}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {group.items[0].category === "kiloan"
                            ? `${group.items[0].weight_kg} kg`
                            : `${group.items[0].item_count} pcs`}
                        </p>
                      </div>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        {group.items.length} item
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <p className="font-medium text-sm">
                      {formatCurrency(group.totalBill)}
                    </p>
                    {group.wadiahUsed > 0 && (
                      <p className="text-xs text-amber-600">
                        -{formatCurrency(group.wadiahUsed)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <p className="font-medium text-emerald-600 text-sm">
                      {formatCurrency(group.paidAmount)}
                    </p>
                    {group.changeAmount > 0 && (
                      <p className="text-xs text-purple-600">
                        +{formatCurrency(group.changeAmount)} wadiah
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        group.paymentMethod === "cash"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-blue-50 text-blue-700 border-blue-200"
                      }
                    >
                      {group.paymentMethod === "cash" ? (
                        <Banknote className="h-3 w-3 mr-1" />
                      ) : (
                        <CreditCard className="h-3 w-3 mr-1" />
                      )}
                      {group.paymentMethod === "cash" ? "Tunai" : "Transfer"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onViewDetail(group)}
                        title="Lihat Detail"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onPrintReceipt(group)}
                        title="Cetak Kwitansi"
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
