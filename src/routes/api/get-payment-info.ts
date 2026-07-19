// Get Payment Info — public payment page data.
// Port of the former `get-payment-info` Supabase edge function.
//
// SECURITY NOTE: This is intentionally a public endpoint (no auth required)
// because payment links are shared with parents via WhatsApp/SMS.
// The midtrans_order_id acts as a bearer token - it's a unique,
// unguessable identifier that grants read-only access to payment info.
// Sensitive data (student NIK, parent info) is NOT exposed.
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/server/supabase-admin";
import { APP_IDENTIFIER, getTransactionStatus } from "@/server/midtrans";
import { errorResponse, json, toErrorMessage } from "@/server/http";

interface OrderRow {
  id: string;
  total_price: number | null;
  status: string;
  category: string | null;
  weight_kg: number | null;
  item_count: number | null;
  laundry_date: string | null;
  midtrans_snap_token?: string | null;
  student: { name: string; class: string } | null;
}

// Helper to map orders to SAFE item details (no sensitive data)
function mapOrderItems(orders: OrderRow[]) {
  return orders.map((o) => ({
    id: o.id,
    category: o.category || "-",
    weight_kg: o.weight_kg,
    item_count: o.item_count,
    total_price: o.total_price || 0,
    laundry_date: o.laundry_date,
  }));
}

export const Route = createFileRoute("/api/get-payment-info")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const supabase = createAdminClient();

          const { token } = (await request.json()) as { token?: string };

          if (!token || typeof token !== "string" || token.length < 10) {
            return errorResponse("Token pembayaran tidak valid", 400);
          }

          // SECURITY: Validate token format matches expected pattern
          if (!token.startsWith(`${APP_IDENTIFIER}-`)) {
            return errorResponse("Token pembayaran tidak valid", 400);
          }

          // Find orders with this midtrans_order_id (non-sensitive fields only)
          const { data: orders, error: ordersError } = await supabase
            .from("laundry_orders")
            .select(
              `
              id,
              total_price,
              status,
              midtrans_order_id,
              midtrans_snap_token,
              category,
              weight_kg,
              item_count,
              laundry_date,
              student:students!laundry_orders_student_id_fkey (
                name,
                class
              )
            `,
            )
            .eq("midtrans_order_id", token)
            .eq("status", "MENUNGGU_PEMBAYARAN");

          if (ordersError) {
            console.error("Error fetching orders:", ordersError);
            throw new Error("Gagal mengambil data pembayaran");
          }

          if (!orders || orders.length === 0) {
            // Check if orders exist in other states
            const { data: existingOrders } = await supabase
              .from("laundry_orders")
              .select(
                `
                id,
                total_price,
                status,
                midtrans_order_id,
                category,
                weight_kg,
                item_count,
                laundry_date,
                student:students!laundry_orders_student_id_fkey (
                  name,
                  class
                )
              `,
              )
              .eq("midtrans_order_id", token);

            if (existingOrders && existingOrders.length > 0) {
              const rows = existingOrders as unknown as OrderRow[];
              const firstStatus = rows[0].status;
              const student = rows[0].student;
              const totalAmount = rows.reduce(
                (sum, o) => sum + (o.total_price || 0),
                0,
              );

              if (firstStatus === "DIBAYAR" || firstStatus === "SELESAI") {
                return json({
                  paid: true,
                  studentName: student?.name || "Siswa",
                  studentClass: student?.class || "",
                  orderCount: rows.length,
                  totalAmount,
                  orderItems: mapOrderItems(rows),
                });
              }

              // Expired or other non-payable state
              return json({
                expired: true,
                studentName: student?.name || "Siswa",
                studentClass: student?.class || "",
                orderCount: rows.length,
                totalAmount,
                midtransOrderId: token,
                orderIds: rows.map((o) => o.id),
                orderItems: mapOrderItems(rows),
              });
            }

            return errorResponse(
              "Link pembayaran tidak valid atau sudah kadaluarsa",
              404,
            );
          }

          const rows = orders as unknown as OrderRow[];
          const firstOrder = rows[0];
          const student = firstOrder.student;

          if (!student) {
            throw new Error("Data siswa tidak ditemukan");
          }

          const totalAmount = rows.reduce(
            (sum, o) => sum + (o.total_price || 0),
            0,
          );
          const snapToken = firstOrder.midtrans_snap_token;

          if (!snapToken) {
            throw new Error("Token pembayaran tidak tersedia");
          }

          // Check Midtrans transaction status
          try {
            const status = await getTransactionStatus(token);
            const expiredStatuses = ["expire", "deny", "cancel"];
            if (
              status.ok &&
              status.transaction_status &&
              expiredStatuses.includes(status.transaction_status)
            ) {
              return json({
                expired: true,
                studentName: student.name,
                studentClass: student.class,
                orderCount: rows.length,
                totalAmount,
                midtransOrderId: token,
                orderIds: rows.map((o) => o.id),
                orderItems: mapOrderItems(rows),
              });
            }
          } catch (err) {
            console.error("Failed to check Midtrans status:", err);
          }

          return json({
            studentName: student.name,
            studentClass: student.class,
            orderCount: rows.length,
            totalAmount,
            token: snapToken,
            midtransOrderId: token,
            orderItems: mapOrderItems(rows),
          });
        } catch (error) {
          console.error("Error:", error);
          return errorResponse(toErrorMessage(error), 500);
        }
      },
    },
  },
});
