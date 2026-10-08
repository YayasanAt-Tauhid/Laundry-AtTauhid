// Parse only authenticated, server-fetched Midtrans status responses.
export function settlementAmounts(status: any) {
 const gross=Number(status.gross_amount);
 const info=status.metadata?.extra_info?.gross_amount_info ?? status.extra_info?.gross_amount_info;
 const original=info ? Number(info.original_amount) : gross;
 const fee=info ? Number(info.customer_imposed_payment_fee) : 0;
 if (![gross,original,fee].every(Number.isSafeInteger) || original<=0 || fee<0 ||
     gross!==original+fee || (info && Number(info.gross_amount)!==gross)) {
   throw new Error("Rincian nominal dan biaya admin Midtrans tidak valid");
 }
 return {grossAmount:gross,originalAmount:original,adminFee:fee};
}
export function midtransPaidAt(status: any) {
 const value=status.settlement_time || status.transaction_time;
 if (!value) throw new Error("Waktu pembayaran Midtrans tidak tersedia");
 const normalized=value.replace(" ","T");
 const date=new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : normalized+"+07:00");
 if (Number.isNaN(date.getTime())) throw new Error("Waktu pembayaran Midtrans tidak valid");
 return date.toISOString();
}
export function settled(status: any) {
 return status.transaction_status==="settlement" ||
 (status.transaction_status==="capture" && status.fraud_status==="accept");
}
