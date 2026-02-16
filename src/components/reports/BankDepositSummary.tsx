import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Banknote, PiggyBank, CreditCard, Wallet } from "lucide-react";
import { formatCurrency } from "@/utils/format";
import type { SummaryData } from "@/types/cashier-reports";

interface BankDepositSummaryProps {
  summary: SummaryData;
}

export function BankDepositSummary({ summary }: BankDepositSummaryProps) {
  if (summary.cashAmount <= 0) return null;

  const netOperational = summary.cashReceivedAmount - summary.wadiahDepositTotal + summary.manualDepositTotal;
  const totalWadiahToDeposit = summary.wadiahDepositTotal + summary.manualDepositTotal;

  return (
    <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-emerald-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Banknote className="h-5 w-5 text-primary" />
          Ringkasan Setor Bank
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Cash Received */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-green-600" />
            <div>
              <p className="text-sm font-medium">Tunai Diterima</p>
              <p className="text-xs text-muted-foreground">{summary.cashTransactions} trx</p>
            </div>
          </div>
          <p className="font-bold text-green-600">{formatCurrency(summary.cashReceivedAmount)}</p>
        </div>

        {/* Manual Deposit */}
        {summary.manualDepositTotal > 0 && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10">
            <div className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-emerald-600" />
              <span className="text-sm">Setoran Wadiah ({summary.manualDepositCount}x)</span>
            </div>
            <p className="font-medium text-emerald-600">+ {formatCurrency(summary.manualDepositTotal)}</p>
          </div>
        )}

        {/* Wadiah Deposit */}
        {summary.wadiahDepositTotal > 0 && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-purple-500/10">
            <div className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-purple-600" />
              <span className="text-sm">Titipan Wadiah Siswa</span>
            </div>
            <p className="font-medium text-purple-600">- {formatCurrency(summary.wadiahDepositTotal)}</p>
          </div>
        )}

        {/* Divider and Totals */}
        <div className="border-t-2 border-dashed border-primary/20 pt-3 space-y-2">
          <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-bold">Setor Rek. Operasional</p>
              </div>
            </div>
            <p className="text-lg font-bold text-primary">{formatCurrency(netOperational)}</p>
          </div>

          {totalWadiahToDeposit > 0 && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-purple-500/10">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium">Setor Rek. Wadiah</span>
              </div>
              <p className="font-bold text-purple-600">{formatCurrency(totalWadiahToDeposit)}</p>
            </div>
          )}
        </div>

        {/* Transfer Info */}
        {summary.transferAmount > 0 && (
          <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
            Transfer Bank (sudah masuk rekening): <span className="font-medium text-blue-600">{formatCurrency(summary.transferAmount)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
