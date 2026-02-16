// Types for Cashier Reports

export interface PaymentRecord {
  id: string;
  category: string;
  weight_kg: number | null;
  item_count: number | null;
  total_price: number;
  admin_fee: number;
  payment_method: string;
  status: string;
  paid_at: string;
  created_at: string;
  laundry_date: string;
  wadiah_used: number | null;
  change_amount: number | null;
  paid_amount: number | null;
  rounding_applied: number | null;
  students: {
    id: string;
    name: string;
    class: string;
    nik: string;
  };
  laundry_partners: {
    name: string;
  };
}

export interface WadiahDepositRecord {
  id: string;
  student_id: string;
  transaction_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  notes: string | null;
  created_at: string;
  students?: {
    id: string;
    name: string;
    class: string;
    nik?: string;
  };
}

export interface DailyStats {
  date: string;
  totalTransactions: number;
  totalAmount: number;
  cashAmount: number;
  transferAmount: number;
}

export interface SummaryData {
  totalTransactions: number;
  totalAmount: number;
  cashTransactions: number;
  cashAmount: number;
  cashReceivedAmount: number;
  transferTransactions: number;
  transferAmount: number;
  wadiahUsedTotal: number;
  wadiahDepositTotal: number;
  manualDepositTotal: number;
  manualDepositCount: number;
  byCategory: Record<string, { count: number; amount: number }>;
  byClass: Record<string, { count: number; amount: number }>;
}

export interface CashierOption {
  id: string;
  full_name: string;
}

export interface PaymentGroup {
  groupId: string;
  studentId: string;
  studentName: string;
  studentClass: string;
  studentNik: string;
  paidAt: string;
  paymentMethod: string;
  items: PaymentRecord[];
  totalBill: number;
  paidAmount: number;
  changeAmount: number;
  wadiahUsed: number;
  roundingApplied: number;
  primaryItemId: string;
}

export type ReportPeriod = "today" | "yesterday" | "week" | "month" | "custom" | "all";
export type PaymentMethodFilter = "all" | "cash" | "transfer";
export type ReportTab = "pembayaran" | "midtrans" | "wadiah";
