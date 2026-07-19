// Creates a Midtrans payment link for arrears (admin/staff only).
// Port of the former `create-payment-link` Supabase edge function.
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/server/supabase-admin";
import { getAuthUser } from "@/server/auth";
import { APP_IDENTIFIER, createSnapTransaction } from "@/server/midtrans";
import { errorResponse, json, toErrorMessage } from "@/server/http";

interface CreatePaymentLinkRequest {
  studentId: string;
  studentName: string;
  studentClass: string;
  orderIds: string[];
  totalAmount: number;
  parentName?: string;
  parentPhone?: string;
}

export const Route = createFileRoute("/api/create-payment-link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const supabase = createAdminClient();

          const { userId } = await getAuthUser(supabase, request);
          if (!userId) {
            return errorResponse("Unauthorized", 401);
          }

          // Check admin or staff role
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .in("role", ["admin", "staff"])
            .maybeSingle();

          if (!roleData) {
            return errorResponse("Forbidden: Admin or Staff only", 403);
          }

          const body = (await request.json()) as CreatePaymentLinkRequest;
          const { studentName, orderIds, parentName, parentPhone } = body;

          if (!orderIds || orderIds.length === 0) {
            throw new Error("Missing required fields: orderIds");
          }

          // SECURITY: Fetch total from DB
          const { data: orders, error: ordersError } = await supabase
            .from("laundry_orders")
            .select("id, total_price, status")
            .in("id", orderIds);

          if (ordersError || !orders || orders.length === 0) {
            throw new Error("Orders tidak ditemukan");
          }

          for (const order of orders) {
            if (
              !["DISETUJUI_MITRA", "MENUNGGU_PEMBAYARAN"].includes(order.status)
            ) {
              throw new Error(
                `Order ${order.id} tidak bisa dibayar (status: ${order.status})`,
              );
            }
          }

          const grossAmount = orders.reduce(
            (sum, o) => sum + o.total_price,
            0,
          );

          const isBulk = orderIds.length > 1;
          const midtransOrderId = isBulk
            ? `${APP_IDENTIFIER}-BULK-${Date.now()}`
            : `${APP_IDENTIFIER}-SINGLE-${Date.now()}`;
          const itemName = isBulk
            ? `Tunggakan Laundry (${orderIds.length} order) - ${studentName}`.substring(0, 50)
            : `Tunggakan Laundry - ${studentName}`.substring(0, 50);

          const midtransResult = await createSnapTransaction({
            transaction_details: {
              order_id: midtransOrderId,
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
            customer_details: {
              first_name: parentName || "Orang Tua",
              phone: parentPhone || "",
            },
            custom_field1: APP_IDENTIFIER,
            custom_field2: isBulk
              ? `ARREARS_BULK:${orderIds.length}`
              : "ARREARS_SINGLE",
            custom_field3: `STUDENT:${studentName}`,
          });

          // Update orders with midtrans info
          for (const oid of orderIds) {
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
