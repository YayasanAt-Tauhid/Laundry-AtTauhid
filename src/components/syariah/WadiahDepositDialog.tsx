import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Wallet,
  Loader2,
  CheckCircle2,
  Banknote,
  User,
  Search,
  Printer,
  PiggyBank,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import { useWadiah } from "@/hooks/useWadiah";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface StudentOption {
  id: string;
  name: string;
  class: string;
}

interface WadiahDepositDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDepositSuccess?: () => void;
}

interface DepositReceipt {
  receiptNumber: string;
  date: string;
  time: string;
  studentName: string;
  studentClass: string;
  depositAmount: number;
  balanceBefore: number;
  balanceAfter: number;
  notes?: string;
  cashierName?: string;
}

const QUICK_AMOUNTS = [10000, 20000, 50000, 100000, 200000, 500000];

export function WadiahDepositDialog({
  open,
  onOpenChange,
  onDepositSuccess,
}: WadiahDepositDialogProps) {
  const { toast } = useToast();

  // State for student selection
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(
    null,
  );
  const [studentSearchOpen, setStudentSearchOpen] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [loadingStudents, setLoadingStudents] = useState(false);

  // State for deposit
  const [depositAmount, setDepositAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);

  // State for receipt
  const [receipt, setReceipt] = useState<DepositReceipt | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  // Wadiah hook
  const {
    balance: currentBalance,
    fetchBalance,
    processTransaction,
    formatCurrency,
  } = useWadiah({
    studentId: selectedStudent?.id,
    autoFetch: !!selectedStudent,
  });

  // Fetch students for autocomplete
  const fetchStudents = useCallback(
    async (query: string = "") => {
      setLoadingStudents(true);
      try {
        let studentQuery = supabase
          .from("students")
          .select("id, name, class")
          .order("name", { ascending: true })
          .limit(50);

        if (query.trim()) {
          studentQuery = studentQuery.or(
            `name.ilike.%${query}%,class.ilike.%${query}%`,
          );
        }

        const { data, error } = await studentQuery;

        if (error) throw error;
        setStudents(data || []);
      } catch (error: unknown) {
        console.error("Error fetching students:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Gagal memuat daftar siswa",
        });
      } finally {
        setLoadingStudents(false);
      }
    },
    [toast],
  );

  // Fetch students when search query changes
  useEffect(() => {
    if (studentSearchOpen) {
      const timer = setTimeout(() => {
        fetchStudents(studentSearchQuery);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [studentSearchQuery, studentSearchOpen, fetchStudents]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setSelectedStudent(null);
      setDepositAmount("");
      setNotes("");
      setReceipt(null);
      setShowReceipt(false);
      fetchStudents();
    }
  }, [open, fetchStudents]);

  // Fetch balance when student is selected
  useEffect(() => {
    if (selectedStudent?.id) {
      fetchBalance(selectedStudent.id);
    }
  }, [selectedStudent, fetchBalance]);

  // Computed values
  const depositAmountNum = parseInt(depositAmount) || 0;
  const availableBalance = currentBalance?.balance || 0;
  const isValid = selectedStudent !== null && depositAmountNum > 0;

  // Handle deposit submission
  const handleSubmitDeposit = async () => {
    if (!selectedStudent || depositAmountNum <= 0) {
      toast({
        variant: "destructive",
        title: "Validasi Gagal",
        description: selectedStudent
          ? "Nominal deposit harus lebih dari 0"
          : "Pilih siswa terlebih dahulu",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const result = await processTransaction({
        studentId: selectedStudent.id,
        transactionType: "deposit",
        amount: depositAmountNum,
        notes: notes.trim() || "Setoran wadiah manual",
        customerConsent: true,
      });

      if (result) {
        // Generate receipt
        const now = new Date();
        const receiptData: DepositReceipt = {
          receiptNumber: `DEP-${Date.now()}`,
          date: now.toLocaleDateString("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
          time: now.toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          studentName: selectedStudent.name,
          studentClass: selectedStudent.class,
          depositAmount: depositAmountNum,
          balanceBefore: result.balance_before,
          balanceAfter: result.balance_after,
          notes: notes.trim() || undefined,
        };

        setReceipt(receiptData);
        setShowReceipt(true);

        toast({
          title: "Setoran Berhasil",
          description: `${formatCurrency(depositAmountNum)} telah ditambahkan ke saldo wadiah ${selectedStudent.name}`,
        });

        onDepositSuccess?.();
      }
    } catch (error: unknown) {
      console.error("Error processing deposit:", error);
      toast({
        variant: "destructive",
        title: "Setoran Gagal",
        description:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat memproses setoran",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle print receipt
  const handlePrintReceipt = () => {
    if (!receipt) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Struk Setoran Wadiah</title>
          <style>
            body {
              font-family: 'Courier New', monospace;
              font-size: 12px;
              padding: 20px;
              max-width: 300px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              margin-bottom: 15px;
              border-bottom: 1px dashed #000;
              padding-bottom: 10px;
            }
            .header h1 {
              font-size: 16px;
              margin: 0;
            }
            .header p {
              margin: 5px 0;
              font-size: 11px;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              margin: 5px 0;
            }
            .divider {
              border-top: 1px dashed #000;
              margin: 10px 0;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              margin: 8px 0;
              font-weight: bold;
            }
            .deposit-amount {
              font-size: 18px;
              text-align: center;
              margin: 15px 0;
              padding: 10px;
              border: 1px dashed #000;
            }
            .footer {
              text-align: center;
              margin-top: 20px;
              padding-top: 10px;
              border-top: 1px dashed #000;
              font-size: 11px;
            }
            .notes {
              font-style: italic;
              margin-top: 10px;
              padding: 5px;
              background: #f5f5f5;
            }
            @media print {
              body { print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>LAUNDRY AT-TAUHID</h1>
            <p>Struk Setoran Wadiah</p>
            <p>${receipt.receiptNumber}</p>
          </div>

          <div class="info-row">
            <span>Tanggal:</span>
            <span>${receipt.date}</span>
          </div>
          <div class="info-row">
            <span>Waktu:</span>
            <span>${receipt.time}</span>
          </div>

          <div class="divider"></div>

          <div class="info-row">
            <span>Siswa:</span>
            <span>${receipt.studentName}</span>
          </div>
          <div class="info-row">
            <span>Kelas:</span>
            <span>${receipt.studentClass}</span>
          </div>

          <div class="deposit-amount">
            <div>SETORAN</div>
            <div style="font-size: 20px;">Rp ${receipt.depositAmount.toLocaleString("id-ID")}</div>
          </div>

          <div class="info-row">
            <span>Saldo Sebelum:</span>
            <span>Rp ${receipt.balanceBefore.toLocaleString("id-ID")}</span>
          </div>
          <div class="total-row">
            <span>Saldo Sekarang:</span>
            <span>Rp ${receipt.balanceAfter.toLocaleString("id-ID")}</span>
          </div>

          ${
            receipt.notes
              ? `
            <div class="divider"></div>
            <div class="notes">
              <strong>Catatan:</strong> ${receipt.notes}
            </div>
          `
              : ""
          }

          <div class="footer">
            <p>Terima kasih atas kepercayaan Anda</p>
            <p>Saldo wadiah dapat digunakan untuk pembayaran laundry</p>
            <p style="margin-top: 10px;">***</p>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  // Handle close and reset
  const handleClose = () => {
    if (!isProcessing) {
      setShowReceipt(false);
      setReceipt(null);
      onOpenChange(false);
    }
  };

  // Handle new deposit after receipt
  const handleNewDeposit = () => {
    setShowReceipt(false);
    setReceipt(null);
    setSelectedStudent(null);
    setDepositAmount("");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-primary" />
            {showReceipt ? "Struk Setoran Wadiah" : "Setoran Wadiah Manual"}
          </DialogTitle>
          <DialogDescription>
            {showReceipt
              ? "Setoran berhasil diproses"
              : "Tambah saldo wadiah untuk siswa"}
          </DialogDescription>
        </DialogHeader>

        {showReceipt && receipt ? (
          // Receipt View
          <div className="space-y-4">
            <div
              ref={receiptRef}
              className="bg-muted/50 rounded-lg p-4 space-y-3 font-mono text-sm"
            >
              <div className="text-center border-b border-dashed pb-3">
                <h3 className="font-bold text-lg">LAUNDRY AT-TAUHID</h3>
                <p className="text-muted-foreground text-xs">
                  Struk Setoran Wadiah
                </p>
                <p className="text-xs">{receipt.receiptNumber}</p>
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Tanggal:</span>
                  <span>{receipt.date}</span>
                </div>
                <div className="flex justify-between">
                  <span>Waktu:</span>
                  <span>{receipt.time}</span>
                </div>
              </div>

              <Separator className="border-dashed" />

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Siswa:</span>
                  <span className="font-medium">{receipt.studentName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kelas:</span>
                  <span>{receipt.studentClass}</span>
                </div>
              </div>

              <div className="bg-primary/10 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">SETORAN</p>
                <p className="text-2xl font-bold text-primary">
                  {formatCurrency(receipt.depositAmount)}
                </p>
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo Sebelum:</span>
                  <span>{formatCurrency(receipt.balanceBefore)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Saldo Sekarang:</span>
                  <span className="text-green-600">
                    {formatCurrency(receipt.balanceAfter)}
                  </span>
                </div>
              </div>

              {receipt.notes && (
                <>
                  <Separator className="border-dashed" />
                  <div className="text-xs">
                    <span className="text-muted-foreground">Catatan: </span>
                    <span className="italic">{receipt.notes}</span>
                  </div>
                </>
              )}

              <Separator className="border-dashed" />

              <div className="text-center text-xs text-muted-foreground">
                <p>Terima kasih atas kepercayaan Anda</p>
                <p>Saldo wadiah dapat digunakan untuk pembayaran laundry</p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleNewDeposit}>
                Setoran Baru
              </Button>
              <Button onClick={handlePrintReceipt}>
                <Printer className="h-4 w-4 mr-2" />
                Cetak Struk
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // Deposit Form
          <div className="space-y-4">
            {/* Student Selection */}
            <div className="space-y-2">
              <Label htmlFor="student">Pilih Siswa *</Label>
              <Popover
                open={studentSearchOpen}
                onOpenChange={setStudentSearchOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={studentSearchOpen}
                    className="w-full justify-between"
                  >
                    {selectedStudent ? (
                      <span className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {selectedStudent.name}
                        <Badge variant="secondary" className="ml-1">
                          {selectedStudent.class}
                        </Badge>
                      </span>
                    ) : (
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Search className="h-4 w-4" />
                        Cari siswa...
                      </span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Ketik nama atau kelas siswa..."
                      value={studentSearchQuery}
                      onValueChange={setStudentSearchQuery}
                    />
                    <CommandList>
                      {loadingStudents ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="ml-2 text-sm">Memuat...</span>
                        </div>
                      ) : (
                        <>
                          <CommandEmpty>Siswa tidak ditemukan</CommandEmpty>
                          <CommandGroup>
                            {students.map((student) => (
                              <CommandItem
                                key={student.id}
                                value={`${student.name} ${student.class}`}
                                onSelect={() => {
                                  setSelectedStudent(student);
                                  setStudentSearchOpen(false);
                                  setStudentSearchQuery("");
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedStudent?.id === student.id
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                <div className="flex items-center gap-2 flex-1">
                                  <User className="h-4 w-4 text-muted-foreground" />
                                  <span>{student.name}</span>
                                  <Badge variant="outline" className="ml-auto">
                                    {student.class}
                                  </Badge>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Show current balance if student selected */}
            {selectedStudent && (
              <Alert className="bg-primary/5 border-primary/20">
                <Wallet className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>Saldo Wadiah Saat Ini:</span>
                  <span className="font-bold text-lg">
                    {formatCurrency(availableBalance)}
                  </span>
                </AlertDescription>
              </Alert>
            )}

            {/* Deposit Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Nominal Setoran *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  Rp
                </span>
                <Input
                  id="amount"
                  type="number"
                  placeholder="0"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="pl-10 text-lg font-mono"
                  min={0}
                />
              </div>

              {/* Quick Amount Buttons */}
              <div className="flex flex-wrap gap-2 mt-2">
                {QUICK_AMOUNTS.map((amount) => (
                  <Button
                    key={amount}
                    type="button"
                    variant={
                      depositAmountNum === amount ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setDepositAmount(amount.toString())}
                    className="text-xs"
                  >
                    {formatCurrency(amount)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Catatan (Opsional)</Label>
              <Textarea
                id="notes"
                placeholder="Contoh: Setoran dari wali siswa, Titipan untuk semester depan, dll."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            {/* Summary */}
            {selectedStudent && depositAmountNum > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Ringkasan Setoran
                </h4>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Siswa:</span>
                    <span>
                      {selectedStudent.name} ({selectedStudent.class})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Saldo Sebelum:
                    </span>
                    <span>{formatCurrency(availableBalance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Setoran:</span>
                    <span className="text-green-600">
                      +{formatCurrency(depositAmountNum)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold">
                    <span>Saldo Setelah:</span>
                    <span className="text-primary">
                      {formatCurrency(availableBalance + depositAmountNum)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isProcessing}
              >
                Batal
              </Button>
              <Button
                onClick={handleSubmitDeposit}
                disabled={!isValid || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <Banknote className="h-4 w-4 mr-2" />
                    Proses Setoran
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default WadiahDepositDialog;
