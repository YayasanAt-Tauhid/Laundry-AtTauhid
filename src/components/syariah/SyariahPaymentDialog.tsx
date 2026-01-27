import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Alert,
  AlertDescription,
} from '@/components/ui/alert';
import {
  Wallet,
  ArrowDown,
  Loader2,
  Info,
  CheckCircle2,
  Banknote,
  Calculator,
  Gift,
  PiggyBank,
} from 'lucide-react';
import { useWadiah } from '@/hooks/useWadiah';
import { Enums } from '@/integrations/supabase/types';

type RoundingPolicy = Enums<"rounding_policy">;

interface Bill {
  id: string;
  student_id: string;
  total_price: number;
  category: string;
  students?: {
    name: string;
    class: string;
  };
}

interface SyariahPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bills: Bill[];
  onConfirmPayment: (paymentData: SyariahPaymentData) => Promise<boolean>;
  isProcessing?: boolean;
}

export interface SyariahPaymentData {
  totalAmount: number;
  paidAmount: number;
  changeAmount: number;
  roundingApplied: number;
  roundingType: RoundingPolicy | null;
  wadiahUsed: number;
  finalAmount: number; // Amount actually due after wadiah
  changeAction: 'cash' | 'wadiah'; // What to do with change
  customerConsent: boolean;
  paymentMethod: 'cash' | 'transfer';
}

const QUICK_AMOUNTS = [10000, 20000, 50000, 100000, 150000, 200000];

export function SyariahPaymentDialog({
  open,
  onOpenChange,
  bills,
  onConfirmPayment,
  isProcessing = false,
}: SyariahPaymentDialogProps) {
  const studentId = bills[0]?.student_id || '';
  const studentName = bills[0]?.students?.name || '';

  const {
    balance: wadiahBalance,
    settings: roundingSettings,
    fetchBalance,
    calculateRoundedAmount,
    getRoundingDifference,
    needsRounding,
    formatCurrency,
  } = useWadiah({ studentId, autoFetch: true });

  // State
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [useWadiahBalance, setUseWadiahBalance] = useState(false);
  const [wadiahAmountToUse, setWadiahAmountToUse] = useState<number>(0);
  const [roundingOption, setRoundingOption] = useState<'none' | 'round_down' | 'to_wadiah'>('none');
  const [changeAction, setChangeAction] = useState<'cash' | 'wadiah'>('cash');
  const [customerConsent, setCustomerConsent] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');

  // Calculations
  const totalAmount = useMemo(() => {
    return bills.reduce((sum, bill) => sum + bill.total_price, 0);
  }, [bills]);

  const availableWadiah = wadiahBalance?.balance || 0;

  const amountAfterWadiah = useMemo(() => {
    if (useWadiahBalance && wadiahAmountToUse > 0) {
      return Math.max(0, totalAmount - wadiahAmountToUse);
    }
    return totalAmount;
  }, [totalAmount, useWadiahBalance, wadiahAmountToUse]);

  const roundingMultiple = roundingSettings?.rounding_multiple || 500;

  const roundedAmount = useMemo(() => {
    if (roundingOption === 'round_down') {
      return calculateRoundedAmount(amountAfterWadiah, roundingMultiple, true);
    }
    return amountAfterWadiah;
  }, [amountAfterWadiah, roundingOption, roundingMultiple, calculateRoundedAmount]);

  const roundingDiscount = useMemo(() => {
    if (roundingOption === 'round_down') {
      return amountAfterWadiah - roundedAmount;
    }
    return 0;
  }, [amountAfterWadiah, roundedAmount, roundingOption]);

  const finalDueAmount = roundedAmount;

  const paidAmountNum = parseFloat(paidAmount) || 0;
  const changeAmount = Math.max(0, paidAmountNum - finalDueAmount);

  const isPaymentSufficient = paidAmountNum >= finalDueAmount;
  const showRoundingOptions = needsRounding(amountAfterWadiah, roundingMultiple) && paymentMethod === 'cash';
  const showChangeOptions = changeAmount > 0 && paymentMethod === 'cash';

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setPaidAmount('');
      setUseWadiahBalance(false);
      setWadiahAmountToUse(0);
      setRoundingOption('none');
      setChangeAction('cash');
      setCustomerConsent(true);
      setPaymentMethod('cash');
      fetchBalance();
    }
  }, [open, fetchBalance]);

  // Auto-set wadiah amount when toggled
  useEffect(() => {
    if (useWadiahBalance) {
      const maxUsable = Math.min(availableWadiah, totalAmount);
      setWadiahAmountToUse(maxUsable);
    } else {
      setWadiahAmountToUse(0);
    }
  }, [useWadiahBalance, availableWadiah, totalAmount]);

  // Auto-set paid amount to final due when using transfer
  useEffect(() => {
    if (paymentMethod === 'transfer') {
      setPaidAmount(finalDueAmount.toString());
      setRoundingOption('none');
    }
  }, [paymentMethod, finalDueAmount]);

  const handleConfirm = async () => {
    if (!isPaymentSufficient && paymentMethod === 'cash') return;

    const paymentData: SyariahPaymentData = {
      totalAmount,
      paidAmount: paidAmountNum,
      changeAmount,
      roundingApplied: roundingDiscount,
      roundingType: roundingOption !== 'none' ? roundingOption as RoundingPolicy : null,
      wadiahUsed: wadiahAmountToUse,
      finalAmount: finalDueAmount,
      changeAction,
      customerConsent,
      paymentMethod,
    };

    const success = await onConfirmPayment(paymentData);
    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            Pembayaran Syariah
          </DialogTitle>
          <DialogDescription>
            {studentName && `Pembayaran untuk ${studentName} - `}
            {bills.length} tagihan
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Order Summary */}
          <div className="p-4 rounded-lg bg-muted/30">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Tagihan</span>
              <span className="text-xl font-bold">{formatCurrency(totalAmount)}</span>
            </div>
          </div>

          {/* Wadiah Balance Option */}
          {availableWadiah > 0 && (
            <div className="p-4 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="use-wadiah"
                  checked={useWadiahBalance}
                  onCheckedChange={(checked) => setUseWadiahBalance(checked as boolean)}
                />
                <div className="flex-1">
                  <Label htmlFor="use-wadiah" className="flex items-center gap-2 cursor-pointer">
                    <Wallet className="h-4 w-4 text-amber-600" />
                    Gunakan Saldo Wadiah
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Saldo tersedia: <span className="font-semibold text-amber-600">{formatCurrency(availableWadiah)}</span>
                  </p>
                  {useWadiahBalance && (
                    <div className="mt-3">
                      <Label htmlFor="wadiah-amount" className="text-xs">Jumlah yang digunakan</Label>
                      <Input
                        id="wadiah-amount"
                        type="number"
                        value={wadiahAmountToUse}
                        onChange={(e) => {
                          const val = Math.min(
                            Math.max(0, parseInt(e.target.value) || 0),
                            Math.min(availableWadiah, totalAmount)
                          );
                          setWadiahAmountToUse(val);
                        }}
                        className="mt-1"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Amount After Wadiah */}
          {useWadiahBalance && wadiahAmountToUse > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Sisa yang harus dibayar</span>
              <span className="font-semibold">{formatCurrency(amountAfterWadiah)}</span>
            </div>
          )}

          {/* Payment Method */}
          <div className="space-y-3">
            <Label>Metode Pembayaran</Label>
            <RadioGroup
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as 'cash' | 'transfer')}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="cash" id="cash" />
                <Label htmlFor="cash" className="cursor-pointer">Tunai</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="transfer" id="transfer" />
                <Label htmlFor="transfer" className="cursor-pointer">Transfer</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Rounding Options (Cash Only) */}
          {showRoundingOptions && (
            <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20">
              <div className="flex items-center gap-2 mb-3">
                <Calculator className="h-4 w-4 text-emerald-600" />
                <Label className="font-medium">Opsi Pembulatan</Label>
                <Badge variant="secondary" className="text-xs">Syariah</Badge>
              </div>
              <RadioGroup
                value={roundingOption}
                onValueChange={(v) => setRoundingOption(v as 'none' | 'round_down' | 'to_wadiah')}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="round-none" />
                  <Label htmlFor="round-none" className="cursor-pointer text-sm">
                    Tanpa pembulatan ({formatCurrency(amountAfterWadiah)})
                  </Label>
                </div>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="round_down" id="round-down" className="mt-1" />
                  <div>
                    <Label htmlFor="round-down" className="cursor-pointer text-sm flex items-center gap-2">
                      <ArrowDown className="h-3 w-3 text-emerald-600" />
                      Bulatkan ke bawah ({formatCurrency(calculateRoundedAmount(amountAfterWadiah, roundingMultiple, true))})
                    </Label>
                    <p className="text-xs text-emerald-600 mt-0.5">
                      <Gift className="h-3 w-3 inline mr-1" />
                      Hemat {formatCurrency(getRoundingDifference(amountAfterWadiah, roundingMultiple, true))} (sedekah dari kami)
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Rounding Discount Applied */}
          {roundingDiscount > 0 && (
            <div className="flex justify-between items-center text-sm p-2 rounded bg-emerald-100 dark:bg-emerald-900/30">
              <span className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <Gift className="h-4 w-4" />
                Diskon Pembulatan (Sedekah)
              </span>
              <span className="font-semibold text-emerald-600">-{formatCurrency(roundingDiscount)}</span>
            </div>
          )}

          {/* Final Amount Due */}
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex justify-between items-center">
              <span className="font-medium">Total yang Harus Dibayar</span>
              <span className="text-2xl font-bold text-primary">{formatCurrency(finalDueAmount)}</span>
            </div>
          </div>

          {/* Paid Amount Input (Cash Only) */}
          {paymentMethod === 'cash' && (
            <div className="space-y-3">
              <Label htmlFor="paid-amount">Jumlah Dibayar</Label>
              <Input
                id="paid-amount"
                type="number"
                placeholder="Masukkan jumlah uang"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="text-lg"
              />
              {/* Quick Amount Buttons */}
              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.filter(amt => amt >= finalDueAmount).slice(0, 4).map((amt) => (
                  <Button
                    key={amt}
                    variant="outline"
                    size="sm"
                    onClick={() => setPaidAmount(amt.toString())}
                    className="text-xs"
                  >
                    {formatCurrency(amt)}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPaidAmount(finalDueAmount.toString())}
                  className="text-xs"
                >
                  Uang Pas
                </Button>
              </div>
            </div>
          )}

          {/* Change Amount & Options */}
          {showChangeOptions && (
            <div className="p-4 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
              <div className="flex justify-between items-center mb-3">
                <span className="font-medium">Kembalian</span>
                <span className="text-xl font-bold text-blue-600">{formatCurrency(changeAmount)}</span>
              </div>
              <Separator className="my-3" />
              <Label className="text-sm mb-2 block">Kembalian ingin:</Label>
              <RadioGroup
                value={changeAction}
                onValueChange={(v) => setChangeAction(v as 'cash' | 'wadiah')}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="cash" id="change-cash" />
                  <Label htmlFor="change-cash" className="cursor-pointer text-sm">
                    Dikembalikan tunai
                  </Label>
                </div>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="wadiah" id="change-wadiah" className="mt-1" />
                  <div>
                    <Label htmlFor="change-wadiah" className="cursor-pointer text-sm flex items-center gap-2">
                      <PiggyBank className="h-3 w-3 text-amber-600" />
                      Simpan sebagai saldo wadiah
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Bisa digunakan untuk pembayaran berikutnya
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Consent Checkbox */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <Checkbox
              id="consent"
              checked={customerConsent}
              onCheckedChange={(checked) => setCustomerConsent(checked as boolean)}
            />
            <Label htmlFor="consent" className="text-sm cursor-pointer leading-relaxed">
              Saya menyetujui transaksi ini dengan penuh kerelaan (antaradin) sesuai prinsip syariah.
              {roundingDiscount > 0 && ' Pembulatan ke bawah saya terima sebagai sedekah/diskon.'}
              {changeAction === 'wadiah' && changeAmount > 0 && ' Kembalian akan disimpan sebagai saldo wadiah.'}
            </Label>
          </div>

          {/* Validation Warning */}
          {paymentMethod === 'cash' && paidAmount && !isPaymentSufficient && (
            <Alert variant="destructive">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Jumlah pembayaran kurang. Minimal {formatCurrency(finalDueAmount)}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Batal
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              isProcessing ||
              !customerConsent ||
              (paymentMethod === 'cash' && !isPaymentSufficient)
            }
            className="min-w-[120px]"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Konfirmasi
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SyariahPaymentDialog;
