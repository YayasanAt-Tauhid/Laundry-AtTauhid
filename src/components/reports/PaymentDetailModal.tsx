import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Wallet, PiggyBank, Printer } from "lucide-react";
import { formatCurrency, formatDateTime, formatLaundryDate } from "@/utils/format";
import { LAUNDRY_CATEGORIES } from "@/lib/constants";
import type { PaymentGroup } from "@/types/cashier-reports";

interface PaymentDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentGroup | null;
  onPrint: (payment: PaymentGroup) => void;
}

export function PaymentDetailModal({
  open,
  onOpenChange,
  payment,
  onPrint,
}: PaymentDetailModalProps) {
  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Detail Pembayaran
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Status & Info */}
          <div className="bg-muted/50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                ✓ Dibayar
              </Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tanggal</span>
              <span>{formatDateTime(payment.paidAt)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Metode</span>
              <span>{payment.paymentMethod === "cash" ? "Tunai" : "Transfer"}</span>
            </div>
          </div>

          {/* Student Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Informasi Siswa</h4>
            <div className="bg-muted/30 rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nama</span>
                <span className="font-medium">{payment.studentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kelas</span>
                <span>{payment.studentClass}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">NIK</span>
                <span className="font-mono text-xs">{payment.studentNik}</span>
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">
              Detail Laundry ({payment.items.length} item)
            </h4>
            <div className="bg-muted/30 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
              {payment.items.map((item, idx) => (
                <div
                  key={item.id}
                  className="border-b border-muted last:border-0 pb-2 last:pb-0 text-sm"
                >
                  <div className="flex justify-between">
                    <div>
                      <span className="text-muted-foreground">{idx + 1}. </span>
                      <span>
                        {LAUNDRY_CATEGORIES[item.category as keyof typeof LAUNDRY_CATEGORIES]?.label ||
                          item.category}
                      </span>
                      <span className="text-muted-foreground ml-1">
                        ({item.category === "kiloan" ? `${item.weight_kg} kg` : `${item.item_count} pcs`})
                      </span>
                    </div>
                    <span className="font-medium">{formatCurrency(item.total_price)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-4">
                    {formatLaundryDate(item.laundry_date)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Payment Details */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Rincian Pembayaran
            </h4>
            <div className="bg-gradient-to-br from-primary/5 to-emerald-500/5 border border-primary/20 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(payment.totalBill)}</span>
              </div>

              {payment.wadiahUsed > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Wallet className="h-3 w-3" /> Wadiah
                  </span>
                  <span className="text-amber-600">-{formatCurrency(payment.wadiahUsed)}</span>
                </div>
              )}

              {payment.roundingApplied > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Diskon Pembulatan</span>
                  <span className="text-green-600">-{formatCurrency(payment.roundingApplied)}</span>
                </div>
              )}

              <div className="flex justify-between border-t pt-2">
                <span className="font-medium">Dibayar</span>
                <span className="font-bold text-emerald-600">
                  {formatCurrency(payment.paidAmount)}
                </span>
              </div>

              {payment.changeAmount > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Kembalian</span>
                    <span className="text-blue-600">{formatCurrency(payment.changeAmount)}</span>
                  </div>
                  <div className="flex justify-between bg-purple-500/10 rounded px-2 py-1 -mx-1">
                    <span className="text-purple-600 flex items-center gap-1">
                      <PiggyBank className="h-3 w-3" /> Disimpan ke Wadiah
                    </span>
                    <span className="text-purple-600 font-medium">
                      {formatCurrency(payment.changeAmount)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Print Button */}
          <Button className="w-full" onClick={() => onPrint(payment)}>
            <Printer className="h-4 w-4 mr-2" />
            Cetak Kwitansi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
