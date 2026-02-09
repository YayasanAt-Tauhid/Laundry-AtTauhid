
# Perbaikan Format Order ID untuk Arrears Payment

## Masalah

Webhook Midtrans tidak memproses pembayaran yang dibuat dari fitur **Pesan Tunggakan** karena format Order ID tidak sesuai:

| Source | Format | Dikenali Webhook? |
|--------|--------|-------------------|
| `create-payment-link` | `LAUNDRY-ATTAUHID-MSG-xxx` | ❌ Tidak |
| Webhook expects | `LAUNDRY-ATTAUHID-SINGLE-xxx` atau `LAUNDRY-ATTAUHID-BULK-xxx` | ✅ Ya |

## Solusi

Perbarui `create-payment-link/index.ts` untuk menggunakan format yang sudah dikenali webhook:

```text
┌─────────────────────────────────────────────────────────────┐
│ create-payment-link (SEBELUM)                               │
│ ─────────────────────────────                               │
│ const midtransOrderId = `${APP_IDENTIFIER}-MSG-${timestamp}`│
│ Output: LAUNDRY-ATTAUHID-MSG-1770611978799                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ create-payment-link (SESUDAH)                               │
│ ─────────────────────────────                               │
│ Single order:                                               │
│   `${APP_IDENTIFIER}-SINGLE-${timestamp}`                   │
│   Output: LAUNDRY-ATTAUHID-SINGLE-1770611978799             │
│                                                             │
│ Multiple orders (bulk):                                     │
│   `${APP_IDENTIFIER}-BULK-${timestamp}`                     │
│   Output: LAUNDRY-ATTAUHID-BULK-1770611978799               │
└─────────────────────────────────────────────────────────────┘
```

## Perubahan File

### `supabase/functions/create-payment-link/index.ts`

Ganti baris:
```typescript
// SEBELUM
const midtransOrderId = `${APP_IDENTIFIER}-MSG-${Date.now()}`;

// SESUDAH  
const isBulk = orderIds.length > 1;
const midtransOrderId = isBulk 
  ? `${APP_IDENTIFIER}-BULK-${Date.now()}`
  : `${APP_IDENTIFIER}-SINGLE-${Date.now()}`;
```

## Hasil

Setelah perbaikan:
- ✅ Payment link dari Pesan Tunggakan akan diproses webhook dengan benar
- ✅ Status order akan otomatis berubah ke `DIBAYAR` saat pembayaran selesai
- ✅ Realtime subscription akan memperbarui tampilan secara otomatis

## Catatan Teknis

- Perubahan ini hanya mempengaruhi **pembayaran baru** yang dibuat setelah deploy
- Pembayaran lama dengan format `-MSG-` yang masih pending perlu di-generate ulang link-nya
