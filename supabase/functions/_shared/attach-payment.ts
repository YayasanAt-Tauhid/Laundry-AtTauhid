type PaymentSnapshot = { id: string; updated_at: string; total_price: number; student_id: string };
type PaymentClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
};

/** Refuse to hand out a gateway token if any order changed while it was generated.
 * The database locks and binds the entire payment group atomically.
 */
export async function attachPaymentSnapshot(
  client: PaymentClient,
  orders: PaymentSnapshot[],
  midtransOrderId: string,
  token: string,
) {
  const { error } = await client.rpc("attach_laundry_payment", {
    p_orders: orders.map(o => ({ id: o.id, updated_at: o.updated_at, total_price: o.total_price, student_id: o.student_id })),
    p_midtrans_order_id: midtransOrderId,
    p_snap_token: token,
  });
  if (error) throw new Error(error.message);
}
