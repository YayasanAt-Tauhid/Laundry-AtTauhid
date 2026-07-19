// Regenerate Payment — creates a new Midtrans Snap token for expired links.
// Port of the former `regenerate-payment` Supabase edge function.
//
// SECURITY: Validates order ownership - orders must belong to same student
// and the requesting parent must own that student.
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/server/supabase-admin";
import { getAuthUser, getUserRole } from "@/server/auth";
import { APP_IDENTIFIER, createSnapTransaction } from "@/server/midtrans";
import { errorResponse, json, toErrorMessage } from "@/server/http";

interface RegeneratePaymentRequest {
  oldMidtransOrderId?: string;
  orderIds: string[];
  studentName?: string;
}

export const Route = createFileRoute("/api/regenerate-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const supabase = createAdminClient();

          const { oldMidtransOrderId, orderIds, studentName } =
            (await request.json()) as RegeneratePaymentRequest;

          if (!orderIds || orderIds.length === 0) {
            throw new Error("Missing required fields");
          }

          // SECURITY: Verify orders exist and validate ownership
          const { data: orders, error: ordersError } = await supabase
            .from("laundry_orders")
            .select("id, status, midtrans_order_id, total_price, student_id")
            .in("id", orderIds);

          if (ordersError || !orders || orders.length === 0) {
            throw new Error("Orders not found");
          }

          // SECURITY: All orders must belong to the same student
          const studentIds = [...new Set(orders.map((o) => o.student_id))];
          if (studentIds.length > 1) {
            return errorResponse("Orders harus milik siswa yang sama", 400);
          }

          // SECURITY: If auth header present, validate parent ownership
          const { userId } = await getAuthUser(supabase, request);
          if (userId) {
            const role = await getUserRole(supabase, userId);
            if (role === "parent") {
              const { data: student } = await supabase
                .from("students")
                .select("id, parent_id")
                .eq("id", studentIds[0])
                .single();

              if (!student || student.parent_id !== userId) {
                return errorResponse(
                  "Anda tidak memiliki akses ke order ini",
                  403,
                );
              }
            }
          }

          // SECURITY: Validate oldMidtransOrderId matches if provided
          if (oldMidtransOrderId) {
            const mismatch = orders.some(
              (o) =>
                o.midtrans_order_id &&
                o.midtrans_order_id !== oldMidtransOrderId,
            );
            if (mismatch) {
              return errorResponse("Order ID mismatch", 400);
            }
          }

          // Check none are already paid
          const paidOrders = orders.filter(
            (o) => o.status === "DIBAYAR" || o.status === "SELESAI",
          );
          if (paidOrders.length > 0) {
            return errorResponse("Beberapa order sudah dibayar", 400);
          }

          // SECURITY: Calculate amount from DB
          const grossAmount = orders.reduce(
            (sum, o) => sum + o.total_price,
            0,
          );

          const isBulk = orderIds.length > 1;
          const newMidtransOrderId = isBulk
            ? `${APP_IDENTIFIER}-BULK-${Date.now()}`
            : `${APP_IDENTIFIER}-SINGLE-${Date.now()}`;

          const itemName = isBulk
            ? `Tunggakan Laundry (${orderIds.length} order) - ${studentName || "Siswa"}`.substring(0, 50)
            : `Tunggakan Laundry - ${studentName || "Siswa"}`.substring(0, 50);

          const midtransResult = await createSnapTransaction({
            transaction_details: {
              order_id: newMidtransOrderId,
              gross_amount: grossAmount,
            },
            item_details: [
              {
                id: isBulk ? "BULK_ARREARS" : orderIds[0],
                price: grossAmount,
                quantity: 1,
                name: itemName,
              },
            ],
            custom_field1: APP_IDENTIFIER,
            custom_field2: isBulk
              ? `ARREARS_BULK:${orderIds.length}`
              : "ARREARS_SINGLE",
            custom_field3: `STUDENT:${studentName || "Unknown"}`,
          });

          // Update orders with new midtrans info
          for (const oid of orderIds) {
            const { error: updateError } = await supabase
              .from("laundry_orders")
              .update({
                midtrans_order_id: newMidtransOrderId,
                midtrans_snap_token: midtransResult.token,
                status: "MENUNGGU_PEMBAYARAN",
              })
              .eq("id", oid);

            if (updateError) {
              console.error(`Failed to update order ${oid}:`, updateError);
            }
          }

          console.log(
            `Regenerated payment: ${oldMidtransOrderId} -> ${newMidtransOrderId}, student=${studentIds[0]}`,
          );

          return json({
            token: midtransResult.token,
            redirect_url: midtransResult.redirect_url,
            order_id: newMidtransOrderId,
          });
        } catch (error) {
          console.error("Error:", error);
          return errorResponse(toErrorMessage(error), 500);
        }
      },
    },
  },
});
