import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Calendar as CalendarIcon,
  Search,
  Download,
  Printer,
  User,
  CalendarRange,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { ReportPeriod, PaymentMethodFilter, CashierOption } from "@/types/cashier-reports";

interface ReportFiltersProps {
  // Period
  period: ReportPeriod;
  onPeriodChange: (period: ReportPeriod) => void;
  // Custom dates
  customStartDate?: Date;
  customEndDate?: Date;
  onCustomStartDateChange: (date: Date | undefined) => void;
  onCustomEndDateChange: (date: Date | undefined) => void;
  // Payment method
  paymentMethod: PaymentMethodFilter;
  onPaymentMethodChange: (method: PaymentMethodFilter) => void;
  // Search
  searchQuery: string;
  onSearchChange: (query: string) => void;
  // Cashier (admin only)
  isAdmin?: boolean;
  cashierList?: CashierOption[];
  selectedCashier?: string;
  onCashierChange?: (cashierId: string) => void;
  currentUserName?: string;
  // Actions
  onRefresh?: () => void;
  onPrint?: () => void;
  onExport?: () => void;
  loading?: boolean;
}

export function ReportFilters({
  period,
  onPeriodChange,
  customStartDate,
  customEndDate,
  onCustomStartDateChange,
  onCustomEndDateChange,
  paymentMethod,
  onPaymentMethodChange,
  searchQuery,
  onSearchChange,
  isAdmin,
  cashierList = [],
  selectedCashier,
  onCashierChange,
  currentUserName,
  onRefresh,
  onPrint,
  onExport,
  loading,
}: ReportFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Primary Filters Row */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Cashier Filter (Admin Only) */}
        {isAdmin && onCashierChange && (
          <Select value={selectedCashier} onValueChange={onCashierChange}>
            <SelectTrigger className="w-44">
              <User className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Pilih Kasir" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="me">Saya ({currentUserName || "Kasir"})</SelectItem>
              <SelectItem value="all">Semua Kasir</SelectItem>
              {cashierList.map((cashier) => (
                <SelectItem key={cashier.id} value={cashier.id}>
                  {cashier.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Period Filter */}
        <Select value={period} onValueChange={(v) => onPeriodChange(v as ReportPeriod)}>
          <SelectTrigger className="w-40">
            <CalendarIcon className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Periode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hari Ini</SelectItem>
            <SelectItem value="yesterday">Kemarin</SelectItem>
            <SelectItem value="week">7 Hari</SelectItem>
            <SelectItem value="month">Bulan Ini</SelectItem>
            <SelectItem value="custom">Kustom</SelectItem>
            <SelectItem value="all">Semua</SelectItem>
          </SelectContent>
        </Select>

        {/* Custom Date Pickers */}
        {period === "custom" && (
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-32 justify-start text-left font-normal text-sm",
                    !customStartDate && "text-muted-foreground"
                  )}
                >
                  <CalendarRange className="h-4 w-4 mr-1" />
                  {customStartDate ? format(customStartDate, "dd/MM/yy") : "Dari"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50" align="start">
                <Calendar
                  mode="single"
                  selected={customStartDate}
                  onSelect={onCustomStartDateChange}
                  disabled={(date) => (customEndDate ? date > customEndDate : false)}
                  initialFocus
                  className="pointer-events-auto"
                  locale={localeId}
                />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground text-sm">-</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-32 justify-start text-left font-normal text-sm",
                    !customEndDate && "text-muted-foreground"
                  )}
                >
                  <CalendarRange className="h-4 w-4 mr-1" />
                  {customEndDate ? format(customEndDate, "dd/MM/yy") : "Sampai"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50" align="start">
                <Calendar
                  mode="single"
                  selected={customEndDate}
                  onSelect={onCustomEndDateChange}
                  disabled={(date) => (customStartDate ? date < customStartDate : false)}
                  initialFocus
                  className="pointer-events-auto"
                  locale={localeId}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Payment Method Filter */}
        <Select value={paymentMethod} onValueChange={(v) => onPaymentMethodChange(v as PaymentMethodFilter)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Metode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua</SelectItem>
            <SelectItem value="cash">Tunai</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button variant="outline" size="icon" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          )}
          {onPrint && (
            <Button variant="outline" size="sm" onClick={onPrint}>
              <Printer className="h-4 w-4 mr-1" />
              Cetak
            </Button>
          )}
          {onExport && (
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          )}
        </div>
      </div>

      {/* Search Row */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cari NIK, nama, atau kelas..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
    </div>
  );
}
