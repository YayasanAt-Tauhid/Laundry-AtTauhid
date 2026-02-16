import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Package,
  TrendingUp,
  Banknote,
  CreditCard,
  Wallet,
  PiggyBank,
} from "lucide-react";
import { formatCurrency, formatCompactNumber } from "@/utils/format";
import type { SummaryData } from "@/types/cashier-reports";

interface ReportSummaryCardsProps {
  summary: SummaryData;
  showWadiahCards?: boolean;
}

export function ReportSummaryCards({ summary, showWadiahCards = true }: ReportSummaryCardsProps) {
  return (
    <div className="space-y-4">
      {/* Primary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Transaksi
                </p>
                <p className="text-2xl font-bold mt-1">{summary.totalTransactions}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-primary/20 text-primary">
                <Package className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/10 to-green-500/5 border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total
                </p>
                <p className="text-xl font-bold mt-1 text-emerald-600">
                  {formatCurrency(summary.totalAmount)}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-600">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Tunai
                </p>
                <p className="text-lg font-bold mt-1 text-green-600">
                  {formatCurrency(summary.cashAmount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {summary.cashTransactions} trx
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-green-500/20 text-green-600">
                <Banknote className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-indigo-500/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Transfer
                </p>
                <p className="text-lg font-bold mt-1 text-blue-600">
                  {formatCurrency(summary.transferAmount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {summary.transferTransactions} trx
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-600">
                <CreditCard className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Wadiah Stats */}
      {showWadiahCards && (summary.wadiahUsedTotal > 0 || summary.wadiahDepositTotal > 0 || summary.manualDepositTotal > 0) && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {summary.wadiahUsedTotal > 0 && (
            <Card className="border-amber-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/20">
                    <Wallet className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Wadiah Terpakai</p>
                    <p className="font-bold text-amber-600">
                      {formatCurrency(summary.wadiahUsedTotal)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {summary.wadiahDepositTotal > 0 && (
            <Card className="border-purple-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <PiggyBank className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Titipan Kembalian</p>
                    <p className="font-bold text-purple-600">
                      {formatCurrency(summary.wadiahDepositTotal)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {summary.manualDepositTotal > 0 && (
            <Card className="border-emerald-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/20">
                    <PiggyBank className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Setoran Manual ({summary.manualDepositCount}x)
                    </p>
                    <p className="font-bold text-emerald-600">
                      {formatCurrency(summary.manualDepositTotal)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
