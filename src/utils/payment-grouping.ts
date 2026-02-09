import type { PaymentRecord, PaymentGroup } from "@/types/cashier-reports";

/**
 * Groups payments by batch based on same student, payment method, and within 5 seconds
 */
export function groupPaymentsByBatch(payments: PaymentRecord[]): PaymentGroup[] {
  if (payments.length === 0) return [];

  // Sort by paid_at descending
  const sorted = [...payments].sort(
    (a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime()
  );

  const groups: PaymentGroup[] = [];
  let currentGroup: PaymentRecord[] = [];
  let lastPayment: PaymentRecord | null = null;

  for (const payment of sorted) {
    if (!lastPayment) {
      currentGroup = [payment];
      lastPayment = payment;
      continue;
    }

    const timeDiff = Math.abs(
      new Date(lastPayment.paid_at).getTime() - new Date(payment.paid_at).getTime()
    );
    const sameStudent = lastPayment.students?.id === payment.students?.id;
    const sameMethod = lastPayment.payment_method === payment.payment_method;

    // Group if same student, method, and within 5 seconds
    if (sameStudent && sameMethod && timeDiff <= 5000) {
      currentGroup.push(payment);
    } else {
      if (currentGroup.length > 0) {
        groups.push(createPaymentGroup(currentGroup));
      }
      currentGroup = [payment];
    }
    lastPayment = payment;
  }

  if (currentGroup.length > 0) {
    groups.push(createPaymentGroup(currentGroup));
  }

  return groups;
}

function createPaymentGroup(items: PaymentRecord[]): PaymentGroup {
  const firstItem = items[0];
  const totalBill = items.reduce((sum, item) => sum + item.total_price, 0);

  const paidAmount = Math.max(...items.map((item) => item.paid_amount || 0));
  const changeAmount = Math.max(...items.map((item) => item.change_amount || 0));
  const wadiahUsed = Math.max(...items.map((item) => item.wadiah_used || 0));
  const roundingApplied = Math.max(...items.map((item) => item.rounding_applied || 0));

  const primaryItem = items.find((item) => (item.paid_amount || 0) > 0) || items[items.length - 1];

  return {
    groupId: `${firstItem.students?.id}-${firstItem.paid_at}`,
    studentId: firstItem.students?.id || "",
    studentName: firstItem.students?.name || "-",
    studentClass: firstItem.students?.class || "-",
    studentNik: firstItem.students?.nik || "-",
    paidAt: firstItem.paid_at,
    paymentMethod: firstItem.payment_method,
    items,
    totalBill,
    paidAmount,
    changeAmount,
    wadiahUsed,
    roundingApplied,
    primaryItemId: primaryItem.id,
  };
}
