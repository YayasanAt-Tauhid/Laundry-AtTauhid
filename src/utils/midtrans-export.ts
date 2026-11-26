// Pure helpers for the cashier "Midtrans" report: date range, query filters,
// and Excel export rows. Deliberately import-free so it can be unit-tested
// with `node --test` (see tests/midtrans-export.test.mjs).

export type MidtransPeriod = "today" | "yesterday" | "week" | "month" | "custom" | "all";
export type MidtransStatusFilter = "success" | "pending" | "all";

export interface MidtransDateRange {
  startDate: Date;
  /** Exclusive upper bound. */
  endDate: Date;
}

export interface MidtransExportPayment {
  id: string;
  midtrans_order_id: string | null;
  total_price: number;
  admin_fee: number | null;
  payment_method: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
  wadiah_used: number | null;
  category: string;
  weight_kg: number | null;
  item_count: number | null;
  students: { name: string; class: string; nik: string } | null;
  laundry_partners: { name: string } | null;
}

const SUCCESS_STATUSES = ["DIBAYAR", "SELESAI"];
const PENDING_STATUS = "MENUNGGU_PEMBAYARAN";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dmy = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const dmyHm = (iso: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${dmy(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Resolve the report period into [startDate, endDate). For "custom" the end
 * date is inclusive, so the upper bound is the start of the following day.
 * (Same semantics the on-screen report has always used.)
 */
export function resolveMidtransDateRange(
  period: MidtransPeriod,
  customStartDate?: Date,
  customEndDate?: Date,
  now: Date = new Date(),
): MidtransDateRange {
  let startDate: Date;
  let endDate = new Date(now);

  switch (period) {
    case "today":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "yesterday":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "week":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "custom":
      if (customStartDate && customEndDate) {
        startDate = new Date(customStartDate.getFullYear(), customStartDate.getMonth(), customStartDate.getDate());
        endDate = new Date(customEndDate.getFullYear(), customEndDate.getMonth(), customEndDate.getDate() + 1);
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }
      break;
    case "all":
    default:
      startDate = new Date(0);
  }

  return { startDate, endDate };
}

/** Returns an error message when a custom export range is incomplete/invalid, else null. */
export function validateMidtransExportRange(
  period: MidtransPeriod,
  customStartDate?: Date,
  customEndDate?: Date,
): string | null {
  if (period !== "custom") return null;
  if (!customStartDate || !customEndDate) {
    return "Pilih tanggal Dari dan Sampai terlebih dahulu untuk periode Kustom";
  }
  const start = new Date(customStartDate.getFullYear(), customStartDate.getMonth(), customStartDate.getDate());
  const end = new Date(customEndDate.getFullYear(), customEndDate.getMonth(), customEndDate.getDate());
  if (start.getTime() > end.getTime()) {
    return "Tanggal Dari tidak boleh setelah tanggal Sampai";
  }
  return null;
}

export type MidtransDateBasis = "paid_at" | "created_at";

/**
 * Column the date range applies to. Defaults to paid_at, except for pending
 * payments, which have no paid_at yet and are always dated by created_at.
 */
export function midtransDateField(status: MidtransStatusFilter, basis: MidtransDateBasis): MidtransDateBasis {
  return status === "pending" ? "created_at" : basis;
}

export function describeMidtransDateBasis(status: MidtransStatusFilter, basis: MidtransDateBasis): string {
  return midtransDateField(status, basis) === "paid_at" ? "Tanggal Bayar (paid_at)" : "Tanggal Dibuat (created_at)";
}

/**
 * Apply status / date range / payment method filters to a Supabase query
 * builder. Shared by the paged list and the export so both always agree.
 */
export function applyMidtransFilters<Q>(
  query: Q,
  filters: {
    status: MidtransStatusFilter;
    paymentMethod: string;
    period: MidtransPeriod;
    dateBasis: MidtransDateBasis;
    range: MidtransDateRange;
  },
): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = query;

  if (filters.status === "success") {
    q = q.in("status", SUCCESS_STATUSES);
  } else if (filters.status === "pending") {
    q = q.eq("status", PENDING_STATUS);
  }

  if (filters.period !== "all") {
    const field = midtransDateField(filters.status, filters.dateBasis);
    q = q.gte(field, filters.range.startDate.toISOString()).lt(field, filters.range.endDate.toISOString());
  }

  if (filters.paymentMethod !== "all") {
    q = q.eq("payment_method", filters.paymentMethod);
  }

  return q as Q;
}

/** In-memory search over student name, class and Midtrans order id. */
export function filterMidtransBySearch<T extends MidtransExportPayment>(payments: T[], searchQuery: string): T[] {
  const lowerQuery = searchQuery.trim().toLowerCase();
  if (!lowerQuery) return payments;
  return payments.filter(
    (p) =>
      p.students?.name?.toLowerCase().includes(lowerQuery) ||
      p.students?.class?.toLowerCase().includes(lowerQuery) ||
      p.midtrans_order_id?.toLowerCase().includes(lowerQuery),
  );
}

export const MIDTRANS_EXPORT_HEADERS = [
  "No",
  "Waktu Bayar",
  "Waktu Dibuat",
  "Order ID",
  "Siswa",
  "NIK",
  "Kelas",
  "Kategori",
  "Jumlah",
  "Mitra Laundry",
  "Total Tagihan",
  "Wadiah Dipakai",
  "Biaya Admin",
  "Total Dibayar",
  "Metode",
  "Status",
] as const;

function statusLabel(status: string): string {
  if (SUCCESS_STATUSES.includes(status)) return "Sukses";
  if (status === PENDING_STATUS) return "Pending";
  return status;
}

export function buildMidtransExportRows(
  payments: MidtransExportPayment[],
  labels: { categoryLabels: Record<string, string>; methodLabels: Record<string, string> },
): (string | number)[][] {
  return payments.map((p, i) => {
    const wadiah = p.wadiah_used || 0;
    const adminFee = p.admin_fee || 0;
    const quantity = p.category === "kiloan" ? `${p.weight_kg ?? 0} kg` : `${p.item_count ?? 0} pcs`;
    return [
      i + 1,
      dmyHm(p.paid_at),
      dmyHm(p.created_at),
      p.midtrans_order_id || "-",
      p.students?.name || "-",
      p.students?.nik || "-",
      p.students?.class || "-",
      labels.categoryLabels[p.category] || p.category,
      quantity,
      p.laundry_partners?.name || "-",
      p.total_price || 0,
      wadiah,
      adminFee,
      (p.total_price || 0) - wadiah + adminFee,
      labels.methodLabels[p.payment_method || ""] || p.payment_method || "-",
      statusLabel(p.status),
    ];
  });
}

export interface MidtransExportSummary {
  totalRows: number;
  successCount: number;
  successAmount: number;
  successAdminFee: number;
  successWadiah: number;
  successPaid: number;
  pendingCount: number;
  pendingAmount: number;
}

export function summarizeMidtransExport(payments: MidtransExportPayment[]): MidtransExportSummary {
  const s: MidtransExportSummary = {
    totalRows: payments.length,
    successCount: 0,
    successAmount: 0,
    successAdminFee: 0,
    successWadiah: 0,
    successPaid: 0,
    pendingCount: 0,
    pendingAmount: 0,
  };
  for (const p of payments) {
    const total = p.total_price || 0;
    if (SUCCESS_STATUSES.includes(p.status)) {
      const wadiah = p.wadiah_used || 0;
      const fee = p.admin_fee || 0;
      s.successCount++;
      s.successAmount += total;
      s.successAdminFee += fee;
      s.successWadiah += wadiah;
      s.successPaid += total - wadiah + fee;
    } else if (p.status === PENDING_STATUS) {
      s.pendingCount++;
      s.pendingAmount += total;
    }
  }
  return s;
}

/** Last day covered by the range (the upper bound is exclusive). */
function inclusiveEnd(range: MidtransDateRange): Date {
  return new Date(range.endDate.getTime() - 1);
}

export function describeMidtransPeriod(period: MidtransPeriod, range: MidtransDateRange): string {
  if (period === "all") return "Semua Waktu";
  const start = dmy(range.startDate);
  const end = dmy(inclusiveEnd(range));
  return start === end ? start : `${start} - ${end}`;
}

export function buildMidtransExportFilename(
  period: MidtransPeriod,
  range: MidtransDateRange,
  now: Date = new Date(),
): string {
  if (period === "all") return `laporan-midtrans_semua-waktu_${ymd(now)}.xlsx`;
  const start = ymd(range.startDate);
  const end = ymd(inclusiveEnd(range));
  return start === end ? `laporan-midtrans_${start}.xlsx` : `laporan-midtrans_${start}_sd_${end}.xlsx`;
}
