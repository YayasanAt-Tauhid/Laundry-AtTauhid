// Midtrans Webhook Handler — handles single and bulk payment notifications.
// Port of the former `midtrans-webhook` Supabase edge function.
//
// IMPORTANT: After deploying, update the Payment Notification URL in the
// Midtrans dashboard to: https://<your-worker-domain>/api/midtrans-webhook
//
// MULTI-APP ISOLATION: only processes orders whose midtrans_order_id starts
// with APP_IDENTIFIER.
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/server/supabase-admin";
import { APP_IDENTIFIER, verifyWebhookSignature } from "@/server/midtrans";
import { errorResponse, json, toErrorMessage } from "@/server/http";

interface MidtransNotification {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  fraud_status?: string;
  payment_type: string;
  settlement_time?: string;
  transaction_time?: string;
  custom_field1?: string;
  custom_field2?: string;
  custom_field3?: string;
}

// Map Midtrans payment type to our payment method
function mapPaymentMethod(paymentType: string): string {
  const mapping: Record<string, string> = {
    qris: "qris",
    gopay: "qris",
    shopeepay: "qris",
    bank_transfer: "bank_transfer",
    echannel: "echannel",
    bca_va: "bca_va",
    bni_va: "bni_va",
    bri_va: "bri_va",
    permata_va: "permata_va",
    cimb_va: "cimb_va",
    other_va: "other_va",
    credit_card: "credit_card",
    cstore: "cstore",
    akulaku: "akulaku",
    kredivo: "kredivo",
  };
  return mapping[paymentType] || paymentType;
}

export const Route = createFileRoute("/api/midtrans-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const notification =
            (await request.json()) as MidtransNotification;

          console.log("Received Midtrans webhook notification:");
          console.log(`  Order ID: ${notification.order_id}`);
          console.log(`  Status: ${notification.transaction_status}`);
          console.log(`  Payment: ${notification.payment_type}`);
          console.log(`  Amount: ${notification.gross_amount}`);
          if (notification.custom_field1) {
            console.log(`  Custom Field 1 (App): ${notification.custom_field1}`);
          }
          if (notification.custom_field2) {
            console.log(`  Custom Field 2 (Type): ${notification.custom_field2}`);
          }
          if (notification.custom_field3) {
            console.log(
              `  Custom Field 3 (Category): ${notification.custom_field3}`,
            );
          }

          // Verify signature from Midtrans
          const validSignature = await verifyWebhookSignature(notification);
          if (!validSignature) {
            console.error("Invalid signature for order:", notification.order_id);
            return errorResponse("Invalid signature", 401);
          }

          console.log("✓ Signature verified");

          const supabaseClient = createAdminClient();

          const orderId = notification.order_id;
          const grossAmount = notification.gross_amount;
          const transactionStatus = notification.transaction_status;
          const fraudStatus = notification.fraud_status;

          let orderStatus = "MENUNGGU_PEMBAYARAN";
          let shouldClearSnapToken = false;

          if (transactionStatus === "capture") {
            // For credit card payments
            if (fraudStatus === "accept") {
              orderStatus = "DIBAYAR";
            }
          } else if (transactionStatus === "settlement") {
            // Payment successful
            orderStatus = "DIBAYAR";
          } else if (transactionStatus === "pending") {
            // Payment pending - keep existing snap_token so user can continue
            orderStatus = "MENUNGGU_PEMBAYARAN";
          } else if (
            transactionStatus === "cancel" ||
            transactionStatus === "deny" ||
            transactionStatus === "expire"
          ) {
            // Payment failed/expired/cancelled - clear snap_token so a new
            // one can be created
            orderStatus = "MENUNGGU_PEMBAYARAN";
            shouldClearSnapToken = true;
          }

          // ===== MULTI-APP ISOLATION CHECK =====
          if (!orderId.startsWith(APP_IDENTIFIER)) {
            console.log(
              `⚠ Order ${orderId} does not belong to ${APP_IDENTIFIER} - ignoring`,
            );
            return json({
              success: true,
              message: `Order does not belong to ${APP_IDENTIFIER} - ignored`,
            });
          }

          const isBulkPayment = orderId.includes("-BULK-");
          const isSinglePayment = orderId.includes("-SINGLE-");

          const failureNote =
            transactionStatus === "expire"
              ? "Pembayaran kedaluwarsa - silakan bayar ulang"
              : transactionStatus === "cancel"
                ? "Pembayaran dibatalkan - silakan bayar ulang"
                : "Pembayaran ditolak - silakan bayar ulang";

          if (isBulkPayment) {
            // ========== BULK PAYMENT ==========
            console.log(`Processing BULK payment: ${orderId}`);

            const { data: orders, error: fetchError } = await supabaseClient
              .from("laundry_orders")
              .select("id")
              .eq("midtrans_order_id", orderId);

            if (fetchError) {
              console.error(
                "Error fetching orders for bulk payment:",
                fetchError,
              );
              throw fetchError;
            }

            if (!orders || orders.length === 0) {
              console.log(`No orders found for bulk payment ${orderId}`);
              return json({
                success: true,
                message: "No orders found for this transaction",
              });
            }

            const updateData: Record<string, unknown> = {
              status: orderStatus,
              payment_method: mapPaymentMethod(notification.payment_type),
            };

            if (orderStatus === "DIBAYAR") {
              updateData.paid_at =
                notification.settlement_time || notification.transaction_time;
              // Distribute paid amount across orders
              updateData.paid_amount = Math.floor(
                parseFloat(grossAmount) / orders.length,
              );
            }

            if (shouldClearSnapToken) {
              updateData.midtrans_order_id = null;
              updateData.midtrans_snap_token = null;
              updateData.notes = failureNote;
            }

            const orderIds = orders.map((o) => o.id);
            const { error: updateError } = await supabaseClient
              .from("laundry_orders")
              .update(updateData)
              .in("id", orderIds);

            if (updateError) {
              console.error("Failed to update bulk orders:", updateError);
              throw updateError;
            }

            console.log(
              `✓ Bulk payment ${orderId}: Updated ${orderIds.length} orders to status: ${orderStatus}`,
            );

            return json({
              success: true,
              message: `Updated ${orderIds.length} orders`,
              order_id: orderId,
              status: orderStatus,
              orders_updated: orderIds.length,
            });
          } else if (isSinglePayment) {
            // ========== SINGLE PAYMENT ==========
            console.log(`Processing SINGLE payment: ${orderId}`);

            const { data: existingOrder, error: fetchError } =
              await supabaseClient
                .from("laundry_orders")
                .select("id, status")
                .eq("midtrans_order_id", orderId)
                .maybeSingle();

            if (fetchError) {
              console.error("Error fetching order:", fetchError);
              throw fetchError;
            }

            if (!existingOrder) {
              console.log(`Order ${orderId} not found`);
              return json({
                success: true,
                message: "Order not found",
              });
            }

            const updateData: Record<string, unknown> = {
              status: orderStatus,
              payment_method: mapPaymentMethod(notification.payment_type),
            };

            if (orderStatus === "DIBAYAR") {
              updateData.paid_at =
                notification.settlement_time || notification.transaction_time;
              updateData.paid_amount = parseFloat(grossAmount);
            }

            if (shouldClearSnapToken) {
              updateData.midtrans_order_id = null;
              updateData.midtrans_snap_token = null;
              updateData.notes = failureNote;
            }

            const { error: updateError } = await supabaseClient
              .from("laundry_orders")
              .update(updateData)
              .eq("id", existingOrder.id);

            if (updateError) {
              console.error("Failed to update order:", updateError);
              throw updateError;
            }

            console.log(`✓ Order ${orderId} updated to status: ${orderStatus}`);

            return json({
              success: true,
              message: "Notification processed",
              order_id: orderId,
              status: orderStatus,
            });
          } else {
            // ========== UNKNOWN FORMAT ==========
            console.log(`Unknown order_id format: ${orderId} - ignoring`);
            return json({
              success: true,
              message: "Unknown order format - ignored",
            });
          }
        } catch (error) {
          console.error("Webhook error:", error);
          // Return 200 to prevent Midtrans retry on our errors
          return json({
            success: false,
            error: toErrorMessage(error),
            message: "Error processing notification, but acknowledged",
          });
        }
      },
    },
  },
});
