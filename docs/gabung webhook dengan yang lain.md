project id : nxegugfgzayjnyqagcge
payment-webhook (aplikasi order katering) :
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts'

serve(async (req) => {
    try {
        const notification = await req.json()

        console.log('Received webhook notification:', notification)

        // Verify signature from Midtrans
        const serverKey = Deno.env.get('MIDTRANS_SERVER_KEY')
        const orderId = notification.order_id
        const statusCode = notification.status_code
        const grossAmount = notification.gross_amount

        const signatureKey = `${orderId}${statusCode}${grossAmount}${serverKey}`
        const encoder = new TextEncoder()
        const data = encoder.encode(signatureKey)
        const hashBuffer = await crypto.subtle.digest('SHA-512', data)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const calculatedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

        if (calculatedSignature !== notification.signature_key) {
            console.error('Invalid signature')
            return new Response(JSON.stringify({ error: 'Invalid signature' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            })
        }

        // Create Supabase admin client (using service role key for webhook)
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Determine order status based on transaction status
        let orderStatus = 'pending'
        const transactionStatus = notification.transaction_status
        const fraudStatus = notification.fraud_status

        if (transactionStatus === 'capture') {
            if (fraudStatus === 'accept') {
                orderStatus = 'paid'
            }
        } else if (transactionStatus === 'settlement') {
            orderStatus = 'paid'
        } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire') {
            orderStatus = transactionStatus === 'expire' ? 'expired' : 'failed'
        } else if (transactionStatus === 'pending') {
            orderStatus = 'pending'
        }

        // Check if this is a BULK payment (multiple orders)
        const isBulkPayment = orderId.startsWith('BULK-')
        
        if (isBulkPayment) {
            // For bulk payments, find all orders with this transaction_id
            console.log(`Processing bulk payment: ${orderId}`)
            
            const { data: orders, error: fetchError } = await supabaseClient
                .from('orders')
                .select('id')
                .eq('transaction_id', orderId)

            if (fetchError) {
                console.error('Error fetching orders for bulk payment:', fetchError)
                throw fetchError
            }

            if (!orders || orders.length === 0) {
                console.log(`No orders found for bulk payment ${orderId}`)
                return new Response(
                    JSON.stringify({ success: true, message: 'No orders found for this transaction' }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    }
                )
            }

            // Update all orders with this transaction_id
            const orderIds = orders.map(o => o.id)
            const { error: updateError } = await supabaseClient
                .from('orders')
                .update({
                    status: orderStatus,
                    updated_at: new Date().toISOString(),
                })
                .in('id', orderIds)

            if (updateError) {
                console.error('Failed to update bulk orders:', updateError)
                throw updateError
            }

            console.log(`Bulk payment ${orderId}: Updated ${orderIds.length} orders to status: ${orderStatus}`)
            console.log('Updated order IDs:', orderIds)

            return new Response(
                JSON.stringify({ success: true, message: `Updated ${orderIds.length} orders` }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        }

        // Single order payment - validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

        if (!uuidRegex.test(orderId)) {
            console.log(`Invalid UUID format for order_id: ${orderId} - likely a test notification`)
            return new Response(
                JSON.stringify({ success: true, message: 'Test notification received (invalid UUID)' }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        }

        const { data: existingOrder, error: fetchError } = await supabaseClient
            .from('orders')
            .select('id')
            .eq('id', orderId)
            .maybeSingle()

        if (fetchError) {
            console.error('Error fetching order:', fetchError)
            throw fetchError
        }

        // If order doesn't exist (e.g., test notification), return success anyway
        if (!existingOrder) {
            console.log(`Order ${orderId} not found - likely a test notification`)
            return new Response(
                JSON.stringify({ success: true, message: 'Test notification received' }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        }

        // Update order status in database
        const { error: updateError } = await supabaseClient
            .from('orders')
            .update({
                status: orderStatus,
                updated_at: new Date().toISOString(),
            })
            .eq('id', orderId)

        if (updateError) {
            console.error('Failed to update order:', updateError)
            throw updateError
        }

        console.log(`Order ${orderId} updated to status: ${orderStatus}`)

        return new Response(
            JSON.stringify({ success: true, message: 'Notification processed' }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('Webhook error:', error)
        return new Response(
            JSON.stringify({ error: errorMessage }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        )
    }
})

project id : sonnfclnzsasjifieuog
midtrans-webhook (aplikasi sekarang) :
// Midtrans Webhook Handler for Payment Notifications
// This endpoint receives payment status updates from Midtrans

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHash } from "https://deno.land/std@0.168.0/crypto/mod.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MidtransNotification {
    transaction_time: string;
    transaction_status: string;
    transaction_id: string;
    status_message: string;
    status_code: string;
    signature_key: string;
    settlement_time?: string;
    payment_type: string;
    order_id: string;
    merchant_id: string;
    gross_amount: string;
    fraud_status?: string;
    currency: string;
}

// Map Midtrans payment_type to our payment_method
function mapPaymentMethod(paymentType: string): string {
    const mapping: Record<string, string> = {
        'qris': 'qris',
        'gopay': 'qris',
        'shopeepay': 'qris',
        'bank_transfer': 'bank_transfer',
        'echannel': 'echannel',
        'bca_va': 'bca_va',
        'bni_va': 'bni_va',
        'bri_va': 'bri_va',
        'permata_va': 'permata_va',
        'cimb_va': 'cimb_va',
        'other_va': 'other_va',
        'credit_card': 'credit_card',
        'cstore': 'cstore',
        'akulaku': 'akulaku',
        'kredivo': 'kredivo',
    }
    return mapping[paymentType] || paymentType
}

// Verify Midtrans signature
async function verifySignature(
    orderId: string,
    statusCode: string,
    grossAmount: string,
    serverKey: string,
    signatureKey: string
): Promise<boolean> {
    const payload = orderId + statusCode + grossAmount + serverKey
    const encoder = new TextEncoder()
    const data = encoder.encode(payload)
    const hashBuffer = await crypto.subtle.digest('SHA-512', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    return hashHex === signatureKey
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    // Only accept POST requests
    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
        )
    }

    try {
        const MIDTRANS_SERVER_KEY = Deno.env.get('MIDTRANS_SERVER_KEY')

        if (!MIDTRANS_SERVER_KEY) {
            console.error('Midtrans Server Key not configured')
            throw new Error('Server configuration error')
        }

        // Parse notification payload
        const notification: MidtransNotification = await req.json()

        console.log('Received Midtrans notification:', JSON.stringify({
            order_id: notification.order_id,
            transaction_status: notification.transaction_status,
            payment_type: notification.payment_type,
            gross_amount: notification.gross_amount,
        }))

        // Verify signature for security
        const isValidSignature = await verifySignature(
            notification.order_id,
            notification.status_code,
            notification.gross_amount,
            MIDTRANS_SERVER_KEY,
            notification.signature_key
        )

        if (!isValidSignature) {
            console.error('Invalid signature for order:', notification.order_id)
            return new Response(
                JSON.stringify({ error: 'Invalid signature' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
            )
        }

        // Initialize Supabase client with service role
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Extract original order ID from Midtrans order ID
        // Format: LAUNDRY-{orderId}-{timestamp} or BULK-{timestamp}
        const midtransOrderId = notification.order_id
        let orderIds: string[] = []
        let isBulkPayment = false

        if (midtransOrderId.startsWith('BULK-')) {
            // Bulk payment - find all orders with this midtrans_order_id
            isBulkPayment = true
            const { data: bulkOrders, error: bulkError } = await supabase
                .from('laundry_orders')
                .select('id')
                .eq('midtrans_order_id', midtransOrderId)

            if (bulkError) {
                console.error('Error finding bulk orders:', bulkError)
                throw bulkError
            }

            if (bulkOrders && bulkOrders.length > 0) {
                orderIds = bulkOrders.map(o => o.id)
            }
        } else if (midtransOrderId.startsWith('LAUNDRY-')) {
            // Single payment - extract order ID
            // Format: LAUNDRY-{first8chars}-{timestamp}
            const parts = midtransOrderId.split('-')
            if (parts.length >= 2) {
                // Find order by midtrans_order_id
                const { data: singleOrder, error: singleError } = await supabase
                    .from('laundry_orders')
                    .select('id')
                    .eq('midtrans_order_id', midtransOrderId)
                    .single()

                if (singleError && singleError.code !== 'PGRST116') {
                    console.error('Error finding order:', singleError)
                    throw singleError
                }

                if (singleOrder) {
                    orderIds = [singleOrder.id]
                }
            }
        } else {
            // Try to find by midtrans_order_id directly
            const { data: directOrder, error: directError } = await supabase
                .from('laundry_orders')
                .select('id')
                .eq('midtrans_order_id', midtransOrderId)

            if (!directError && directOrder && directOrder.length > 0) {
                orderIds = directOrder.map(o => o.id)
                isBulkPayment = directOrder.length > 1
            }
        }

        if (orderIds.length === 0) {
            console.error('No orders found for midtrans_order_id:', midtransOrderId)
            // Return 200 OK anyway to acknowledge receipt (Midtrans requirement)
            return new Response(
                JSON.stringify({ message: 'Order not found, notification acknowledged' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            )
        }

        console.log(`Found ${orderIds.length} order(s) to update`)

        // Determine new status based on transaction_status
        let newStatus: string | null = null
        let updateData: Record<string, any> = {
            payment_method: mapPaymentMethod(notification.payment_type),
        }

        const transactionStatus = notification.transaction_status
        const fraudStatus = notification.fraud_status

        switch (transactionStatus) {
            case 'capture':
                // For credit card transactions
                if (fraudStatus === 'accept') {
                    newStatus = 'DIBAYAR'
                    updateData.paid_at = notification.settlement_time || notification.transaction_time
                } else if (fraudStatus === 'challenge') {
                    // Payment needs manual review
                    newStatus = 'MENUNGGU_PEMBAYARAN'
                    updateData.notes = 'Pembayaran memerlukan review manual (fraud challenge)'
                }
                break

            case 'settlement':
                // Payment successfully settled
                newStatus = 'DIBAYAR'
                updateData.paid_at = notification.settlement_time || notification.transaction_time
                break

            case 'pending':
                // Payment pending (waiting for customer to complete)
                newStatus = 'MENUNGGU_PEMBAYARAN'
                break

            case 'deny':
                // Payment denied
                newStatus = 'MENUNGGU_PEMBAYARAN'
                updateData.notes = 'Pembayaran ditolak oleh sistem'
                break

            case 'cancel':
                // Payment cancelled
                newStatus = 'MENUNGGU_PEMBAYARAN'
                updateData.notes = 'Pembayaran dibatalkan'
                // Clear midtrans data so user can retry
                updateData.midtrans_order_id = null
                updateData.midtrans_snap_token = null
                break

            case 'expire':
                // Payment expired
                newStatus = 'MENUNGGU_PEMBAYARAN'
                updateData.notes = 'Pembayaran kedaluwarsa'
                // Clear midtrans data so user can retry
                updateData.midtrans_order_id = null
                updateData.midtrans_snap_token = null
                break

            case 'refund':
                // Payment refunded
                newStatus = 'MENUNGGU_PEMBAYARAN'
                updateData.notes = `Pembayaran di-refund pada ${notification.transaction_time}`
                updateData.paid_at = null
                break

            case 'partial_refund':
                // Partial refund
                updateData.notes = `Partial refund pada ${notification.transaction_time}`
                break

            default:
                console.log('Unknown transaction status:', transactionStatus)
        }

        // Update orders if we have a new status
        if (newStatus) {
            updateData.status = newStatus

            // Calculate paid_amount for successful payments
            if (newStatus === 'DIBAYAR') {
                const grossAmount = parseFloat(notification.gross_amount)

                if (isBulkPayment && orderIds.length > 1) {
                    // For bulk payments, distribute the amount
                    const amountPerOrder = Math.floor(grossAmount / orderIds.length)
                    updateData.paid_amount = amountPerOrder
                } else {
                    updateData.paid_amount = grossAmount
                }
            }

            // Update all orders
            const { error: updateError } = await supabase
                .from('laundry_orders')
                .update(updateData)
                .in('id', orderIds)

            if (updateError) {
                console.error('Error updating orders:', updateError)
                throw updateError
            }

            console.log(`Successfully updated ${orderIds.length} order(s) to status: ${newStatus}`)
        }

        // Return success response (Midtrans expects 200 OK)
        return new Response(
            JSON.stringify({
                success: true,
                message: `Processed notification for ${orderIds.length} order(s)`,
                status: newStatus,
                order_ids: orderIds,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )

    } catch (error) {
        console.error('Webhook error:', error)

        // Return 200 OK anyway to prevent Midtrans from retrying
        // Log the error for debugging
        return new Response(
            JSON.stringify({
                success: false,
                error: error.message,
                message: 'Error processing notification, but acknowledged'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    }
})
