import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { calculateAdminFee, PAYMENT_METHODS, getEnabledPaymentMethods, QRIS_MAX_AMOUNT } from '@/lib/constants';

declare global {
    interface Window {
        snap: {
            pay: (
                token: string,
                options: {
                    onSuccess?: (result: MidtransResult) => void;
                    onPending?: (result: MidtransResult) => void;
                    onError?: (result: MidtransResult) => void;
                    onClose?: () => void;
                }
            ) => void;
        };
    }
}

interface MidtransResult {
    order_id: string;
    transaction_id: string;
    transaction_status: string;
    payment_type: string;
    status_code: string;
    status_message: string;
}

interface PaymentParams {
    orderId: string;
    grossAmount: number;
    studentName: string;
    category: string;
    customerEmail?: string;
    customerPhone?: string;
    customerName?: string;
    adminFee?: number;
    isCashier?: boolean; // Flag for cashier - no admin fee
}

interface BulkPaymentParams {
    orderIds: string[];
    grossAmount: number;
    description: string;
    studentNames: string;
    customerEmail?: string;
    customerPhone?: string;
    customerName?: string;
    adminFee?: number;
    isCashier?: boolean; // Flag for cashier - no admin fee
}

// Midtrans Server Key - In production, this should ONLY be used in Edge Function
// For demo/sandbox purposes, we're using it here
const MIDTRANS_SERVER_KEY = import.meta.env.VITE_MIDTRANS_SERVER_KEY || '';
const MIDTRANS_IS_SANDBOX = true; // Set to false for production

export function useMidtrans() {
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);

    // Calculate estimated admin fee based on amount
    // QRIS (0.7%) for < 628,000, VA (Rp 4,400) for >= 628,000
    const getEstimatedAdminFee = (baseAmount: number): number => {
        return calculateAdminFee(baseAmount);
    };

    // Get actual admin fee based on payment method used
    const getActualAdminFee = (baseAmount: number, paymentType: string): number => {
        return calculateAdminFee(baseAmount, paymentType);
    };

    // Get payment method label
    const getPaymentMethodLabel = (amount: number): string => {
        return amount < QRIS_MAX_AMOUNT ? 'QRIS (0.7%)' : 'VA (Rp 4.400)';
    };

    const createSnapTokenDirect = async (params: PaymentParams & { adminFee: number }): Promise<string | null> => {
        // Generate unique order ID for Midtrans
        const midtransOrderId = `LAUNDRY-${params.orderId.substring(0, 8)}-${Date.now()}`;

        // Calculate total with admin fee
        const totalWithFee = params.grossAmount + params.adminFee;

        // Get enabled payments based on amount
        const paymentMethods = getEnabledPaymentMethods(totalWithFee);

        // Prepare item details - only add admin fee if > 0
        const itemDetails: any[] = [
            {
                id: params.orderId,
                price: params.grossAmount,
                quantity: 1,
                name: `Laundry ${params.category} - ${params.studentName}`.substring(0, 50),
            },
        ];

        if (params.adminFee > 0) {
            itemDetails.push({
                id: 'ADMIN_FEE',
                price: params.adminFee,
                quantity: 1,
                name: 'Biaya Admin',
            });
        }

        // Prepare Midtrans transaction data
        const transactionData = {
            transaction_details: {
                order_id: midtransOrderId,
                gross_amount: totalWithFee,
            },
            item_details: itemDetails,
            customer_details: {
                first_name: params.customerName || 'Customer',
                email: params.customerEmail || 'customer@example.com',
                phone: params.customerPhone || '',
            },
            // Enable payment methods based on amount
            ...paymentMethods,
        };

        try {
            // Use Vite proxy to avoid CORS issues in development
            // In production, this should go through an Edge Function
            const midtransUrl = MIDTRANS_IS_SANDBOX
                ? '/midtrans-api/snap/v1/transactions'  // Proxied through Vite
                : '/midtrans-api/snap/v1/transactions';

            const authString = btoa(`${MIDTRANS_SERVER_KEY}:`);

            const response = await fetch(midtransUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Basic ${authString}`,
                },
                body: JSON.stringify(transactionData),
            });

            const result = await response.json();

            if (!response.ok) {
                console.error('Midtrans error:', result);
                throw new Error(result.error_messages?.join(', ') || 'Failed to create payment');
            }

            // Update the order with midtrans info and admin fee
            await supabase
                .from('laundry_orders')
                .update({
                    midtrans_order_id: midtransOrderId,
                    midtrans_snap_token: result.token,
                    status: 'MENUNGGU_PEMBAYARAN',
                    admin_fee: params.adminFee,
                })
                .eq('id', params.orderId);

            return result.token;
        } catch (error: any) {
            console.error('Error creating snap token:', error);
            throw error;
        }
    };

    const createSnapToken = async (params: PaymentParams & { adminFee: number }): Promise<string | null> => {
        try {
            // First, try to call Supabase Edge Function (recommended for production)
            const totalWithFee = params.grossAmount + params.adminFee;
            const { data, error } = await supabase.functions.invoke('create-midtrans-token', {
                body: { ...params, enabledPayments: getEnabledPaymentMethods(totalWithFee).enabled_payments }
            });

            if (!error && data?.token) {
                return data.token;
            }

            console.log('Edge function not available, trying direct API call...');

            // Fallback: Call Midtrans directly (for demo/sandbox only)
            // WARNING: This exposes server key in frontend - only use for development!
            if (MIDTRANS_SERVER_KEY) {
                return await createSnapTokenDirect(params);
            }

            throw new Error('Midtrans Server Key tidak dikonfigurasi');
        } catch (error: any) {
            console.error('Error creating snap token:', error);
            throw error;
        }
    };

    const processPayment = async (
        params: PaymentParams,
        onSuccess?: () => void,
        onPending?: () => void
    ) => {
        setIsProcessing(true);

        // Calculate admin fee
        const adminFee = params.adminFee ?? getEstimatedAdminFee(params.grossAmount);

        try {
            // Check if Midtrans Snap is loaded
            if (!window.snap) {
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: 'Midtrans Snap tidak tersedia. Refresh halaman dan coba lagi.',
                });
                return;
            }

            // Check if server key is configured
            if (!MIDTRANS_SERVER_KEY) {
                // Fallback: update status manually
                const midtransOrderId = `ORDER-${params.orderId}-${Date.now()}`;

                const { error } = await supabase
                    .from('laundry_orders')
                    .update({
                        status: 'MENUNGGU_PEMBAYARAN',
                        midtrans_order_id: midtransOrderId,
                        admin_fee: adminFee,
                    })
                    .eq('id', params.orderId);

                if (error) throw error;

                toast({
                    title: 'Status Diperbarui',
                    description: 'Order telah diubah ke status Menunggu Pembayaran. Admin akan mengirimkan link pembayaran.',
                });

                onPending?.();
                return;
            }

            const snapToken = await createSnapToken({ ...params, adminFee });

            if (!snapToken) {
                throw new Error('Gagal membuat token pembayaran');
            }

            // Open Midtrans Snap payment popup
            window.snap.pay(snapToken, {
                onSuccess: async (result: MidtransResult) => {
                    console.log('Payment success:', result);

                    // Calculate actual admin fee based on payment method used
                    const actualAdminFee = getActualAdminFee(params.grossAmount, result.payment_type);

                    // Update order status to DIBAYAR with payment method
                    await supabase
                        .from('laundry_orders')
                        .update({
                            status: 'DIBAYAR',
                            paid_at: new Date().toISOString(),
                            payment_method: result.payment_type,
                            admin_fee: actualAdminFee,
                        })
                        .eq('id', params.orderId);

                    toast({
                        title: 'Pembayaran Berhasil',
                        description: 'Terima kasih! Pembayaran Anda telah berhasil.',
                    });

                    onSuccess?.();
                },
                onPending: (result: MidtransResult) => {
                    console.log('Payment pending:', result);

                    toast({
                        title: 'Pembayaran Tertunda',
                        description: 'Silakan selesaikan pembayaran Anda.',
                    });

                    onPending?.();
                },
                onError: (result: MidtransResult) => {
                    console.error('Payment error:', result);

                    toast({
                        variant: 'destructive',
                        title: 'Pembayaran Gagal',
                        description: result.status_message || 'Terjadi kesalahan saat memproses pembayaran.',
                    });
                },
                onClose: () => {
                    console.log('Payment popup closed');

                    toast({
                        title: 'Pembayaran Dibatalkan',
                        description: 'Anda menutup jendela pembayaran.',
                    });
                },
            });
        } catch (error: any) {
            console.error('Payment error:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error.message || 'Gagal memproses pembayaran',
            });
        } finally {
            setIsProcessing(false);
        }
    };

    // Manual payment confirmation (for admin/cashier/testing)
    const confirmPaymentManually = async (orderId: string, paymentMethod?: string) => {
        try {
            // Get order to calculate admin fee
            const { data: order } = await supabase
                .from('laundry_orders')
                .select('total_price')
                .eq('id', orderId)
                .single();

            const adminFee = paymentMethod
                ? getActualAdminFee(order?.total_price || 0, paymentMethod)
                : PAYMENT_METHODS.bank_transfer.feeValue;

            const { error } = await supabase
                .from('laundry_orders')
                .update({
                    status: 'DIBAYAR',
                    paid_at: new Date().toISOString(),
                    payment_method: paymentMethod || 'manual',
                    admin_fee: adminFee,
                })
                .eq('id', orderId);

            if (error) throw error;

            toast({
                title: 'Berhasil',
                description: 'Pembayaran telah dikonfirmasi.',
            });

            return true;
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error.message || 'Gagal mengkonfirmasi pembayaran',
            });
            return false;
        }
    };

    // Create bulk snap token for multiple orders
    const createBulkSnapToken = async (params: BulkPaymentParams & { adminFee: number }): Promise<string | null> => {
        const midtransOrderId = `BULK-${Date.now()}`;
        const totalWithFee = params.grossAmount + params.adminFee;

        const transactionData = {
            transaction_details: {
                order_id: midtransOrderId,
                gross_amount: totalWithFee,
            },
            item_details: [
                {
                    id: midtransOrderId,
                    price: params.grossAmount,
                    quantity: 1,
                    name: `${params.description} - ${params.studentNames}`.substring(0, 50),
                },
                {
                    id: 'ADMIN_FEE',
                    price: params.adminFee,
                    quantity: 1,
                    name: 'Biaya Admin',
                },
            ],
            customer_details: {
                first_name: params.customerName || 'Customer',
                email: params.customerEmail || 'customer@example.com',
                phone: params.customerPhone || '',
            },
            // Only enable QRIS and Virtual Account based on amount
            ...getEnabledPaymentMethods(totalWithFee),
        };

        try {
            const midtransUrl = '/midtrans-api/snap/v1/transactions';
            const authString = btoa(`${MIDTRANS_SERVER_KEY}:`);

            const response = await fetch(midtransUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Basic ${authString}`,
                },
                body: JSON.stringify(transactionData),
            });

            const result = await response.json();

            if (!response.ok) {
                console.error('Midtrans error:', result);
                throw new Error(result.error_messages?.join(', ') || 'Failed to create payment');
            }

            // Calculate admin fee per order
            const adminFeePerOrder = Math.ceil(params.adminFee / params.orderIds.length);

            // Update all orders with midtrans info
            for (const orderId of params.orderIds) {
                await supabase
                    .from('laundry_orders')
                    .update({
                        midtrans_order_id: midtransOrderId,
                        midtrans_snap_token: result.token,
                        status: 'MENUNGGU_PEMBAYARAN',
                        admin_fee: adminFeePerOrder,
                    })
                    .eq('id', orderId);
            }

            return result.token;
        } catch (error: any) {
            console.error('Error creating bulk snap token:', error);
            throw error;
        }
    };

    // Process bulk payment for multiple orders
    const processBulkPayment = async (
        params: BulkPaymentParams,
        onSuccess?: () => void,
        onPending?: () => void
    ) => {
        setIsProcessing(true);

        // Calculate admin fee for bulk payment
        const adminFee = params.adminFee ?? getEstimatedAdminFee(params.grossAmount);

        try {
            if (!window.snap) {
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: 'Midtrans Snap tidak tersedia. Refresh halaman dan coba lagi.',
                });
                return;
            }

            if (!MIDTRANS_SERVER_KEY) {
                // Fallback: update status manually for all orders
                const midtransOrderId = `BULK-${Date.now()}`;
                const adminFeePerOrder = Math.ceil(adminFee / params.orderIds.length);

                for (const orderId of params.orderIds) {
                    await supabase
                        .from('laundry_orders')
                        .update({
                            status: 'MENUNGGU_PEMBAYARAN',
                            midtrans_order_id: midtransOrderId,
                            admin_fee: adminFeePerOrder,
                        })
                        .eq('id', orderId);
                }

                toast({
                    title: 'Status Diperbarui',
                    description: `${params.orderIds.length} order telah diubah ke status Menunggu Pembayaran.`,
                });

                onPending?.();
                return;
            }

            const snapToken = await createBulkSnapToken({ ...params, adminFee });

            if (!snapToken) {
                throw new Error('Gagal membuat token pembayaran');
            }

            window.snap.pay(snapToken, {
                onSuccess: async (result: MidtransResult) => {
                    console.log('Bulk payment success:', result);

                    // Calculate actual admin fee based on payment method used
                    const actualAdminFee = getActualAdminFee(params.grossAmount, result.payment_type);
                    const adminFeePerOrder = Math.ceil(actualAdminFee / params.orderIds.length);

                    // Update all orders status to DIBAYAR
                    for (const orderId of params.orderIds) {
                        await supabase
                            .from('laundry_orders')
                            .update({
                                status: 'DIBAYAR',
                                paid_at: new Date().toISOString(),
                                payment_method: result.payment_type,
                                admin_fee: adminFeePerOrder,
                            })
                            .eq('id', orderId);
                    }

                    toast({
                        title: 'Pembayaran Berhasil',
                        description: `${params.orderIds.length} tagihan berhasil dibayar. Terima kasih!`,
                    });

                    onSuccess?.();
                },
                onPending: (result: MidtransResult) => {
                    console.log('Bulk payment pending:', result);

                    toast({
                        title: 'Pembayaran Tertunda',
                        description: 'Silakan selesaikan pembayaran Anda.',
                    });

                    onPending?.();
                },
                onError: (result: MidtransResult) => {
                    console.error('Bulk payment error:', result);

                    toast({
                        variant: 'destructive',
                        title: 'Pembayaran Gagal',
                        description: result.status_message || 'Terjadi kesalahan saat memproses pembayaran.',
                    });
                },
                onClose: () => {
                    console.log('Bulk payment popup closed');

                    toast({
                        title: 'Pembayaran Dibatalkan',
                        description: 'Anda menutup jendela pembayaran.',
                    });
                },
            });
        } catch (error: any) {
            console.error('Bulk payment error:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error.message || 'Gagal memproses pembayaran',
            });
        } finally {
            setIsProcessing(false);
        }
    };

    return {
        processPayment,
        processBulkPayment,
        confirmPaymentManually,
        isProcessing,
        getEstimatedAdminFee,
        calculateAdminFee: getActualAdminFee,
    };
}
