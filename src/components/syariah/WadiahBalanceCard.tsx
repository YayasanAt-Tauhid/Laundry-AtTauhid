import { useState, useEffect } from 'react';
import {
  Wallet,
  History,
  Plus,
  Minus,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Loader2,
  ChevronDown,
  ChevronUp,
  Gift,
  RefreshCw,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useWadiah } from '@/hooks/useWadiah';
import { Enums } from '@/integrations/supabase/types';

type WadiahTransactionType = Enums<"wadiah_transaction_type">;

interface WadiahBalanceCardProps {
  studentId: string;
  studentName?: string;
  className?: string;
  compact?: boolean;
  showTransactions?: boolean;
  maxTransactions?: number;
  onUseBalance?: (amount: number) => void;
}

export function WadiahBalanceCard({
  studentId,
  studentName,
  className = '',
  compact = false,
  showTransactions = true,
  maxTransactions = 5,
  onUseBalance,
}: WadiahBalanceCardProps) {
  const {
    balance,
    transactions,
    loading,
    fetchBalance,
    fetchTransactions,
    formatCurrency,
    getTransactionTypeLabel,
  } = useWadiah({ studentId, autoFetch: true });

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchBalance(), fetchTransactions()]);
    setRefreshing(false);
  };

  const getTransactionIcon = (type: WadiahTransactionType) => {
    const iconMap: Record<WadiahTransactionType, React.ReactNode> = {
      deposit: <Plus className="h-3 w-3 text-green-500" />,
      change_deposit: <TrendingUp className="h-3 w-3 text-green-500" />,
      payment: <Minus className="h-3 w-3 text-red-500" />,
      refund: <TrendingDown className="h-3 w-3 text-orange-500" />,
      adjustment: <ArrowRightLeft className="h-3 w-3 text-blue-500" />,
      sedekah: <Gift className="h-3 w-3 text-emerald-500" />,
    };
    return iconMap[type] || <ArrowRightLeft className="h-3 w-3" />;
  };

  const getTransactionColor = (type: WadiahTransactionType): string => {
    if (['deposit', 'change_deposit'].includes(type)) return 'text-green-600';
    if (['payment', 'refund'].includes(type)) return 'text-red-600';
    if (type === 'sedekah') return 'text-emerald-600';
    return 'text-blue-600';
  };

  const isCredit = (type: WadiahTransactionType): boolean => {
    return ['deposit', 'change_deposit', 'adjustment'].includes(type);
  };

  if (loading && !balance) {
    return (
      <Card className={`${className}`}>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  // Compact version for inline display
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 ${className}`}>
              <Wallet className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="font-semibold text-amber-700 dark:text-amber-300">
                {formatCurrency(balance?.balance || 0)}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Saldo Wadiah {studentName ? `- ${studentName}` : ''}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full card version
  return (
    <Card className={`overflow-hidden ${className}`}>
      <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-lg">Saldo Wadiah</CardTitle>
              {studentName && (
                <CardDescription>{studentName}</CardDescription>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8 w-8"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Balance Display */}
        <div className="mt-4">
          <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">
            {formatCurrency(balance?.balance || 0)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Saldo tersedia untuk pembayaran
          </p>
        </div>

        {/* Stats */}
        {balance && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="text-center p-2 rounded-lg bg-white/50 dark:bg-white/5">
              <p className="text-xs text-muted-foreground">Total Masuk</p>
              <p className="font-semibold text-green-600 text-sm">
                {formatCurrency(balance.total_deposited)}
              </p>
            </div>
            <div className="text-center p-2 rounded-lg bg-white/50 dark:bg-white/5">
              <p className="text-xs text-muted-foreground">Digunakan</p>
              <p className="font-semibold text-red-600 text-sm">
                {formatCurrency(balance.total_used)}
              </p>
            </div>
            <div className="text-center p-2 rounded-lg bg-white/50 dark:bg-white/5">
              <p className="text-xs text-muted-foreground">Sedekah</p>
              <p className="font-semibold text-emerald-600 text-sm">
                {formatCurrency(balance.total_sedekah)}
              </p>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-4">
        {/* Use Balance Button */}
        {onUseBalance && balance && balance.balance > 0 && (
          <Button
            variant="outline"
            className="w-full mb-4 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30"
            onClick={() => onUseBalance(balance.balance)}
          >
            <Wallet className="h-4 w-4 mr-2" />
            Gunakan Saldo untuk Pembayaran
          </Button>
        )}

        {/* Transaction History */}
        {showTransactions && (
          <Collapsible open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <History className="h-4 w-4" />
                  Riwayat Transaksi
                </span>
                {isHistoryOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              {transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Belum ada transaksi
                </p>
              ) : (
                <div className="space-y-2">
                  {transactions.slice(0, maxTransactions).map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-background flex items-center justify-center">
                          {getTransactionIcon(tx.transaction_type)}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {getTransactionTypeLabel(tx.transaction_type)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold text-sm ${getTransactionColor(tx.transaction_type)}`}>
                          {isCredit(tx.transaction_type) ? '+' : '-'}
                          {formatCurrency(tx.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Saldo: {formatCurrency(tx.balance_after)}
                        </p>
                      </div>
                    </div>
                  ))}

                  {transactions.length > maxTransactions && (
                    <p className="text-xs text-center text-muted-foreground pt-2">
                      +{transactions.length - maxTransactions} transaksi lainnya
                    </p>
                  )}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

export default WadiahBalanceCard;
