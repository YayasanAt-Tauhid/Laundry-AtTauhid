// Midtrans Token Creator for Laundry At-Tauhid
// Creates Snap tokens for single and bulk payments.
// Port of the former `create-midtrans-token` Supabase edge function.
//
// SECURITY: grossAmount is fetched from database, NOT from frontend
// SECURITY: Auth required - validates user via getClaims
// SECURITY: Parent role checked via user_roles table (NOT profiles)
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/server/supabase-admin";
import { getAuthUser, getUserRole } from "@/server/auth";
import { APP_IDENTIFIER, createSnapTransaction } from "@/server/midtrans";
import { errorResponse, json, toErrorMessage } from "@/server/http";

interface PaymentRequest {
  orderId: string;
  orderIds?: string[];
  studentName: string;
  category: string;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  isBulk?: boolean;
}

export const Route = createFileRoute("/api/create-midtrans-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const supabase = createAdminClient();

          const { userId } = await getAuthUser(supabase, request);
          if (!userId) {
            return errorResponse("Unauthorized", 401);
          }

          const userRole = await getUserRole(supabase, userId);

          // Check parent online payment setting
          if (userRole === "parent") {
            const { data: settings } = await supabase
              .from("rounding_settings")
              .select("parent_online_payment_enabled")
              .single();

            if (settings && settings.parent_online_payment_enabled === false) {
              return json(
                {
                  error:
                    "Pembayaran online untuk parent sedang dinonaktifkan. Silakan bayar melalui kasir.",
                  code: "ONLINE_PAYMENT_DISABLED",
                },
                403,
              );
            }
          }

          const {
            orderId,
            orderIds,
            studentName,
            category,
            customerEmail,
            customerPhone,
            customerName,
            isBulk = false,
          } = (await request.json()) as PaymentRequest;

          const orderIdsToUpdate = isBulk && orderIds ? orderIds : [orderId];

          // SECURITY: Fetch total_price from DATABASE, not frontend
          const { data: orders, error: ordersError } = await supabase
            .from("laundry_orders")
            .select("id, total_price, category, status, student_id")
            .in("id", orderIdsToUpdate);

          if (ordersError || !orders || orders.length === 0) {
            throw new Error("Order tidak ditemukan di database");
          }

          if (orders.length !== orderIdsToUpdate.length) {
            const foundIds = orders.map((o) => o.id);
            const missingIds = orderIdsToUpdate.filter(
              (id) => !foundIds.includes(id),
            );
            throw new Error(`Order tidak ditemukan: ${missingIds.join(", ")}`);
          }

          // SECURITY: Parents can only pay for their own children's orders
          if (userRole === "parent") {
            const studentIds = [...new Set(orders.map((o) => o.student_id))];
            const { data: students } = await supabase
              .from("students")
              .select("id, parent_id")
              .in("id", studentIds);

            if (!students || students.some((s) => s.parent_id !== userId)) {
              return errorResponse("Anda tidak memiliki akses ke order ini", 403);
            }
          }

          // Validate order status - only allow payment for approved orders
          for (const order of orders) {
            if (
              !["DISETUJUI_MITRA", "MENUNGGU_PEMBAYARAN"].includes(order.status)
            ) {
              throw new Error(
                `Order ${order.id} tidak dalam status yang bisa dibayar (status: ${order.status})`,
              );
            }
          }

          // Calculate grossAmount from database values
          const grossAmount = orders.reduce(
            (sum, order) => sum + order.total_price,
            0,
          );

          console.log(
            `SECURITY: grossAmount calculated from DB = ${grossAmount} (${orders.length} orders), user=${userId}, role=${userRole}`,
          );

          const midtransOrderId = isBulk
            ? `${APP_IDENTIFIER}-BULK-${Date.now()}`
            : `${APP_IDENTIFIER}-SINGLE-${orderId.substring(0, 8)}-${Date.now()}`;

          const itemName = isBulk
            ? `Bulk Payment (${orderIdsToUpdate.length} orders) - ${studentName}`.substring(0, 50)
            : `Laundry ${category} - ${studentName}`.substring(0, 50);

          const midtransResult = await createSnapTransaction({
            transaction_details: {
              order_id: midtransOrderId,
              gross_amount: grossAmount,
            },
            item_details: [
              {
                id: isBulk ? "BULK_PAYMENT" : orderId,
                price: grossAmount,
                quantity: 1,
                name: itemName,
              },
            ],
            customer_details: {
              first_name: customerName || "Customer",
              email: customerEmail || "customer@example.com",
              phone: customerPhone || "",
            },
            custom_field1: APP_IDENTIFIER,
            custom_field2: isBulk ? `BULK:${orderIdsToUpdate.length}` : "SINGLE",
            custom_field3: category,
          });

          // Update orders with midtrans info
          for (const oid of orderIdsToUpdate) {
            const { error: updateError } = await supabase
              .from("laundry_orders")
              .update({
                midtrans_order_id: midtransOrderId,
                midtrans_snap_token: midtransResult.token,
                status: "MENUNGGU_PEMBAYARAN",
              })
              .eq("id", oid);

            if (updateError) {
              console.error(`Failed to update order ${oid}:`, updateError);
            }
          }

          return json({
            token: midtransResult.token,
            redirect_url: midtransResult.redirect_url,
            order_id: midtransOrderId,
          });
        } catch (error) {
          console.error("Error:", error);
          return errorResponse(toErrorMessage(error), 400);
        }
      },
    },
  },
});
