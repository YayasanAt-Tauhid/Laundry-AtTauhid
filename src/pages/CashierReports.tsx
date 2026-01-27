import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCashierReport } from "@/hooks/useCashierReport";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { FileText, Banknote, CreditCard, PiggyBank } from "lucide-react";
import { format } from "date-fns";

import {
  ReportSummaryCards,
  BankDepositSummary,
  CategoryBreakdown,
  ClassBreakdown,
  PaymentTable,
  PaymentDetailModal,
  ReportFilters,
  Pagination,
  CashierMidtransReport,
  CashierWadiahReport,
} from "@/components/reports";

import { groupPaymentsByBatch } from "@/utils/payment-grouping";
import { formatCurrency, formatDate, formatTime, formatDateTime, formatLaundryDate } from "@/utils/format";
import { LAUNDRY_CATEGORIES } from "@/lib/constants";
import type { ReportPeriod, PaymentMethodFilter, ReportTab, PaymentGroup } from "@/types/cashier-reports";

export default function CashierReports() {
  const { toast } = useToast();
  const { profile, user, userRole } = useAuth();

  // State
  const [activeTab, setActiveTab] = useState<ReportTab>("pembayaran");
  const [period, setPeriod] = useState<ReportPeriod>("today");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCashier, setSelectedCashier] = useState("me");
  const [currentPage, setCurrentPage] = useState(0);
  
  // Modal state
  const [selectedPayment, setSelectedPayment] = useState<PaymentGroup | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Data hook
  const {
    loading,
    payments,
    wadiahDeposits,
    summary,
    totalCount,
    cashierList,
    pageSize,
    refetch,
    getDateRange,
  } = useCashierReport({
    userId: user?.id,
    userRole,
    selectedCashier,
    period,
    customStartDate,
    customEndDate,
    paymentMethod,
    searchQuery,
    currentPage,
  });

  // Grouped payments
  const paymentGroups = useMemo(() => groupPaymentsByBatch(payments), [payments]);

  // Handlers
  const handlePeriodChange = (newPeriod: ReportPeriod) => {
    setPeriod(newPeriod);
    setCurrentPage(0);
    if (newPeriod !== "custom") {
      setCustomStartDate(undefined);
      setCustomEndDate(undefined);
    }
  };

  const handleViewDetail = (group: PaymentGroup) => {
    setSelectedPayment(group);
    setShowDetailModal(true);
  };

  const handlePrintReceipt = (group: PaymentGroup) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Tidak dapat membuka jendela cetak. Pastikan popup tidak diblokir.",
      });
      return;
    }

    const receiptNumber = `RCP-${group.primaryItemId.slice(-8).toUpperCase()}`;
    const paidDate = new Date(group.paidAt);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Kwitansi - ${receiptNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Courier New', monospace; padding: 10mm; max-width: 80mm; margin: 0 auto; }
          .receipt { width: 100%; }
          .header { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
          .header h1 { font-size: 14px; font-weight: bold; }
          .header p { font-size: 10px; margin-top: 4px; }
          .info { margin: 10px 0; font-size: 10px; }
          .info-row { display: flex; justify-content: space-between; margin: 3px 0; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .items { margin: 8px 0; }
          .item { font-size: 10px; margin: 4px 0; }
          .item-name { font-weight: bold; }
          .item-detail { display: flex; justify-content: space-between; }
          .total-section { border-top: 1px dashed #000; padding-top: 8px; margin-top: 8px; }
          .total-row { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
          .total-row.grand { font-size: 13px; font-weight: bold; margin-top: 4px; }
          .footer { text-align: center; margin-top: 12px; font-size: 9px; border-top: 1px dashed #000; padding-top: 8px; }
          @media print { body { padding: 0; } @page { margin: 5mm; size: 80mm auto; } }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <h1>LAUNDRY AT-TAUHID</h1>
            <p>Kwitansi Pembayaran</p>
          </div>
          <div class="info">
            <div class="info-row"><span>No:</span><span>${receiptNumber}</span></div>
            <div class="info-row"><span>Tanggal:</span><span>${paidDate.toLocaleDateString("id-ID")}</span></div>
            <div class="info-row"><span>Waktu:</span><span>${paidDate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span></div>
            <div class="info-row"><span>Kasir:</span><span>${profile?.full_name || "-"}</span></div>
          </div>
          <div class="divider"></div>
          <div class="info">
            <div class="info-row"><span>Siswa:</span><span>${group.studentName}</span></div>
            <div class="info-row"><span>Kelas:</span><span>${group.studentClass}</span></div>
          </div>
          <div class="divider"></div>
          <div class="items">
            ${group.items.map((item) => `
              <div class="item">
                <div class="item-name">${LAUNDRY_CATEGORIES[item.category as keyof typeof LAUNDRY_CATEGORIES]?.label || item.category}</div>
                <div class="item-detail">
                  <span>${item.category === "kiloan" ? `${item.weight_kg} kg` : `${item.item_count} pcs`}</span>
                  <span>${formatCurrency(item.total_price)}</span>
                </div>
              </div>
            `).join("")}
          </div>
          <div class="total-section">
            <div class="total-row"><span>Subtotal:</span><span>${formatCurrency(group.totalBill)}</span></div>
            ${group.wadiahUsed > 0 ? `<div class="total-row"><span>Wadiah:</span><span>- ${formatCurrency(group.wadiahUsed)}</span></div>` : ""}
            ${group.roundingApplied > 0 ? `<div class="total-row"><span>Diskon:</span><span>- ${formatCurrency(group.roundingApplied)}</span></div>` : ""}
            <div class="total-row grand"><span>TOTAL:</span><span>${formatCurrency(group.totalBill - group.wadiahUsed - group.roundingApplied)}</span></div>
            <div class="total-row"><span>Dibayar:</span><span>${formatCurrency(group.paidAmount)}</span></div>
            ${group.changeAmount > 0 ? `<div class="total-row"><span>Kembalian:</span><span>${formatCurrency(group.changeAmount)}</span></div>` : ""}
            <div class="total-row"><span>Metode:</span><span>${group.paymentMethod === "cash" ? "TUNAI" : "TRANSFER"}</span></div>
          </div>
          <div class="footer">
            <p>Terima kasih!</p>
            <p>--- LUNAS ---</p>
          </div>
        </div>
        <script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleExportCSV = () => {
    const headers = ["Tanggal", "Jam", "Siswa", "Kelas", "Item", "Tagihan", "Wadiah", "Dibayar", "Kembalian", "Metode"];
    const rows = paymentGroups.map((group) => [
      formatDate(group.paidAt),
      formatTime(group.paidAt),
      `"${group.studentName}"`,
      group.studentClass,
      group.items.length,
      group.totalBill,
      group.wadiahUsed,
      group.paidAmount,
      group.changeAmount,
      group.paymentMethod === "cash" ? "Tunai" : "Transfer",
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `laporan-kasir-${format(new Date(), "yyyyMMdd")}.csv`;
    link.click();

    toast({ title: "Export berhasil", description: "Laporan telah diunduh" });
  };

  const handlePrintReport = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const { startDate, endDate } = getDateRange();
    const periodLabel =
      period === "today" ? "Hari Ini"
        : period === "yesterday" ? "Kemarin"
        : period === "week" ? "7 Hari Terakhir"
        : period === "month" ? "Bulan Ini"
        : period === "custom" && customStartDate && customEndDate
          ? `${format(customStartDate, "dd/MM/yyyy")} - ${format(customEndDate, "dd/MM/yyyy")}`
          : "Semua Waktu";

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Laporan Kasir - ${periodLabel}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; font-size: 11px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px; }
          .header h1 { margin: 0; font-size: 18px; }
          .header p { margin: 4px 0; color: #666; }
          .summary { display: flex; gap: 10px; margin-bottom: 20px; }
          .summary-item { flex: 1; background: #f5f5f5; padding: 10px; border-radius: 6px; text-align: center; }
          .summary-item h3 { margin: 0; font-size: 10px; color: #666; }
          .summary-item p { margin: 4px 0 0; font-size: 14px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
          th { background: #f5f5f5; }
          .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #666; }
          @media print { body { print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Laporan Kasir At-Tauhid Laundry</h1>
          <p>Periode: ${periodLabel}</p>
          <p>Dicetak: ${formatDateTime(new Date().toISOString())} | Kasir: ${profile?.full_name || "-"}</p>
        </div>
        <div class="summary">
          <div class="summary-item"><h3>TRANSAKSI</h3><p>${summary.totalTransactions}</p></div>
          <div class="summary-item"><h3>TOTAL</h3><p>${formatCurrency(summary.totalAmount)}</p></div>
          <div class="summary-item"><h3>TUNAI</h3><p>${formatCurrency(summary.cashAmount)}</p></div>
          <div class="summary-item"><h3>TRANSFER</h3><p>${formatCurrency(summary.transferAmount)}</p></div>
        </div>
        <table>
          <thead>
            <tr><th>No</th><th>Waktu</th><th>Siswa</th><th>Kelas</th><th>Tagihan</th><th>Dibayar</th><th>Metode</th></tr>
          </thead>
          <tbody>
            ${paymentGroups.map((g, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${formatDate(g.paidAt)} ${formatTime(g.paidAt)}</td>
                <td>${g.studentName}</td>
                <td>${g.studentClass}</td>
                <td>${formatCurrency(g.totalBill)}</td>
                <td>${formatCurrency(g.paidAmount)}</td>
                <td>${g.paymentMethod === "cash" ? "Tunai" : "Transfer"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <div class="footer"><p>At-Tauhid Laundry - Sistem Laundry Sekolah</p></div>
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Laporan Kasir</h1>
            <p className="text-sm text-muted-foreground">
              Transaksi pembayaran, Midtrans, dan Wadiah
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReportTab)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 lg:w-[450px]">
            <TabsTrigger value="pembayaran" className="flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              <span className="hidden sm:inline">Pembayaran</span>
            </TabsTrigger>
            <TabsTrigger value="midtrans" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Midtrans</span>
            </TabsTrigger>
            <TabsTrigger value="wadiah" className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4" />
              <span className="hidden sm:inline">Wadiah</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab: Pembayaran */}
          <TabsContent value="pembayaran" className="mt-6 space-y-6">
            {/* Filters */}
            <ReportFilters
              period={period}
              onPeriodChange={handlePeriodChange}
              customStartDate={customStartDate}
              customEndDate={customEndDate}
              onCustomStartDateChange={(d) => { setCustomStartDate(d); setCurrentPage(0); }}
              onCustomEndDateChange={(d) => { setCustomEndDate(d); setCurrentPage(0); }}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={(m) => { setPaymentMethod(m); setCurrentPage(0); }}
              searchQuery={searchQuery}
              onSearchChange={(q) => { setSearchQuery(q); setCurrentPage(0); }}
              isAdmin={userRole === "admin"}
              cashierList={cashierList}
              selectedCashier={selectedCashier}
              onCashierChange={(c) => { setSelectedCashier(c); setCurrentPage(0); }}
              currentUserName={profile?.full_name}
              onRefresh={refetch}
              onPrint={handlePrintReport}
              onExport={handleExportCSV}
              loading={loading}
            />

            {/* Summary Cards */}
            <ReportSummaryCards summary={summary} />

            {/* Bank Deposit Summary */}
            <BankDepositSummary summary={summary} />

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CategoryBreakdown summary={summary} />
              <ClassBreakdown summary={summary} />
            </div>

            {/* Payment Table */}
            <PaymentTable
              paymentGroups={paymentGroups}
              loading={loading}
              onViewDetail={handleViewDetail}
              onPrintReceipt={handlePrintReceipt}
            />

            {/* Pagination */}
            <Pagination
              currentPage={currentPage}
              totalCount={totalCount}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
            />
          </TabsContent>

          {/* Tab: Midtrans */}
          <TabsContent value="midtrans" className="mt-6">
            <CashierMidtransReport />
          </TabsContent>

          {/* Tab: Wadiah */}
          <TabsContent value="wadiah" className="mt-6">
            <CashierWadiahReport 
              isAdmin={userRole === "admin"}
              cashierList={cashierList}
              currentUserName={profile?.full_name}
            />
          </TabsContent>
        </Tabs>

        {/* Detail Modal */}
        <PaymentDetailModal
          open={showDetailModal}
          onOpenChange={setShowDetailModal}
          payment={selectedPayment}
          onPrint={handlePrintReceipt}
        />
      </div>
    </DashboardLayout>
  );
}
