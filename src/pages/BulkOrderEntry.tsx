import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  Send,
  Package,
  Loader2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RotateCcw,
  FileText,
  PiggyBank,
} from "lucide-react";
import { useBulkOrder } from "@/hooks/useBulkOrder";
import { BulkOrderTable } from "@/components/bulk-order/BulkOrderTable";
import { PrintBillingFormDialog } from "@/components/staff/PrintBillingFormDialog";
import { CheckBalanceDialog } from "@/components/staff/CheckBalanceDialog";
import { LAUNDRY_CATEGORIES } from "@/lib/constants";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

export default function BulkOrderEntry() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const {
    rows,
    partners,
    validRows,
    summary,
    isLoadingData,
    isSubmitting,
    submitProgress,
    fetchInitialData,
    updateRow,
    setRowStudent,
    addRow,
    removeRow,
    duplicateRow,
    clearEmptyRows,
    clearAllRows,
    submitOrders,
    searchStudents,
  } = useBulkOrder(user?.id);

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [printFormDialogOpen, setPrintFormDialogOpen] = useState(false);
  const [checkBalanceDialogOpen, setCheckBalanceDialogOpen] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleSubmit = async () => {
    setConfirmDialogOpen(false);
    const result = await submitOrders();
    setSubmitResult(result);

    if (result.success > 0) {
      toast({
        title: "Berhasil",
        description: `${result.success} tagihan berhasil dibuat`,
      });
    }

    if (result.failed > 0) {
      toast({
        variant: "destructive",
        title: "Sebagian Gagal",
        description: `${result.failed} tagihan gagal dibuat`,
      });
    }
  };

  const handleClearAll = () => {
    clearAllRows();
    setClearDialogOpen(false);
    setSubmitResult(null);
    toast({
      title: "Berhasil",
      description: "Semua data telah dihapus",
    });
  };

  const handleAddRows = (count: number) => {
    addRow(count);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Package className="h-6 w-6" />
              Input Tagihan Bulk
            </h1>
            <p className="text-muted-foreground mt-1">
              Input banyak tagihan laundry sekaligus seperti spreadsheet
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPrintFormDialogOpen(true)}
            >
              <FileText className="h-4 w-4 mr-1" />
              Cetak Form
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCheckBalanceDialogOpen(true)}
            >
              <PiggyBank className="h-4 w-4 mr-1" />
              Cek Saldo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                toast({
                  title: "Panduan Penggunaan",
                  description:
                    "Ketik NIK untuk mencari siswa, Tab untuk pindah kolom, Enter untuk pindah baris. Klik Submit untuk menyimpan semua tagihan valid.",
                });
              }}
            >
              <HelpCircle className="h-4 w-4 mr-1" />
              Bantuan
            </Button>
          </div>
        </div>

        {/* Main Table Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Data Tagihan</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddRows(5)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  +5 Baris
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearEmptyRows}
                  disabled={summary.emptyCount === 0}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Hapus Kosong
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setClearDialogOpen(true)}
                  className="text-destructive hover:text-destructive"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <BulkOrderTable
              rows={rows}
              partners={partners}
              isLoading={isLoadingData}
              onUpdateRow={updateRow}
              onSetStudent={setRowStudent}
              onRemoveRow={removeRow}
              onDuplicateRow={duplicateRow}
              onAddRow={() => addRow(1)}
              searchStudents={searchStudents}
            />
          </CardContent>
        </Card>

        {/* Summary Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Status Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ringkasan Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm">Valid & Siap Submit</span>
                  </div>
                  <Badge variant="default" className="bg-green-600">
                    {summary.validCount}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm">Belum Lengkap</span>
                  </div>
                  <Badge variant="secondary">{summary.invalidCount}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full border-2 border-dashed border-muted-foreground" />
                    <span className="text-sm">Kosong</span>
                  </div>
                  <Badge variant="outline">{summary.emptyCount}</Badge>
                </div>
                {summary.submittedCount > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-blue-600" />
                      <span className="text-sm">Sudah Disubmit</span>
                    </div>
                    <Badge variant="secondary" className="bg-blue-100">
                      {summary.submittedCount}
                    </Badge>
                  </div>
                )}

                {/* Category breakdown */}
                {Object.keys(summary.byCategory).length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-2">
                      Per Kategori:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(summary.byCategory).map(
                        ([cat, count]) => (
                          <Badge
                            key={cat}
                            variant="outline"
                            className="text-xs"
                          >
                            {
                              LAUNDRY_CATEGORIES[
                                cat as keyof typeof LAUNDRY_CATEGORIES
                              ]?.label
                            }
                            : {count}
                          </Badge>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Financial Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ringkasan Keuangan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Total Tagihan
                  </span>
                  <span className="font-bold text-lg">
                    {formatCurrency(summary.totalPrice)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Bagian Yayasan
                  </span>
                  <span className="font-medium text-green-600">
                    {formatCurrency(summary.totalYayasan)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Bagian Vendor
                  </span>
                  <span className="font-medium text-blue-600">
                    {formatCurrency(summary.totalVendor)}
                  </span>
                </div>

                {summary.validCount > 0 && (
                  <div className="pt-3 border-t">
                    <p className="text-xs text-muted-foreground">
                      Rata-rata per tagihan:{" "}
                      <span className="font-medium text-foreground">
                        {formatCurrency(
                          Math.round(summary.totalPrice / summary.validCount),
                        )}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Submit Progress */}
        {isSubmitting && (
          <Card>
            <CardContent className="py-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Menyimpan tagihan...</span>
                  <span>
                    {submitProgress.completed + submitProgress.failed} /{" "}
                    {submitProgress.total}
                  </span>
                </div>
                <Progress
                  value={
                    ((submitProgress.completed + submitProgress.failed) /
                      submitProgress.total) *
                    100
                  }
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit Result */}
        {submitResult && !isSubmitting && (
          <Card
            className={
              submitResult.failed > 0 ? "border-amber-500" : "border-green-500"
            }
          >
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                {submitResult.failed > 0 ? (
                  <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-medium">
                    {submitResult.success} tagihan berhasil dibuat
                    {submitResult.failed > 0 &&
                      `, ${submitResult.failed} gagal`}
                  </p>
                  {submitResult.errors.length > 0 && (
                    <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside">
                      {submitResult.errors.slice(0, 3).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {submitResult.errors.length > 3 && (
                        <li>
                          ...dan {submitResult.errors.length - 3} error lainnya
                        </li>
                      )}
                    </ul>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSubmitResult(null)}
                >
                  Tutup
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-4 pb-6">
          <Button variant="outline" onClick={() => navigate("/orders")}>
            Kembali ke Daftar Order
          </Button>

          <Button
            onClick={() => setConfirmDialogOpen(true)}
            disabled={isSubmitting || summary.validCount === 0}
            className="min-w-[200px]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit {summary.validCount} Tagihan
              </>
            )}
          </Button>
        </div>

        {/* Confirm Submit Dialog */}
        <AlertDialog
          open={confirmDialogOpen}
          onOpenChange={setConfirmDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Konfirmasi Submit Tagihan</AlertDialogTitle>
              <AlertDialogDescription>
                Anda akan membuat {summary.validCount} tagihan laundry dengan
                total {formatCurrency(summary.totalPrice)}.
                <br />
                <br />
                Tagihan akan dikirim ke mitra untuk approval. Pastikan data
                sudah benar sebelum melanjutkan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction onClick={handleSubmit}>
                Ya, Submit Sekarang
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Confirm Clear Dialog */}
        <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset Semua Data?</AlertDialogTitle>
              <AlertDialogDescription>
                Semua data yang belum disubmit akan dihapus. Tindakan ini tidak
                dapat dibatalkan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClearAll}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Ya, Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Print Billing Form Dialog */}
        <PrintBillingFormDialog
          open={printFormDialogOpen}
          onOpenChange={setPrintFormDialogOpen}
        />

        {/* Check Balance Dialog */}
        <CheckBalanceDialog
          open={checkBalanceDialogOpen}
          onOpenChange={setCheckBalanceDialogOpen}
        />
      </div>
    </DashboardLayout>
  );
}
