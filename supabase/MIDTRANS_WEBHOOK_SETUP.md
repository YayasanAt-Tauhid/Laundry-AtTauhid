# Setup Unified Midtrans Webhook

Dokumentasi untuk mengkonfigurasi **1 webhook** yang mendukung **2 aplikasi**:
- 🧺 **Laundry At-Tauhid** - Aplikasi laundry pesantren
- 🍱 **Catering Order System** - Aplikasi pemesanan katering

---

## 📋 Daftar Isi

1. [Pendahuluan](#pendahuluan)
2. [Cara Kerja Unified Webhook](#cara-kerja-unified-webhook)
3. [Deploy Edge Function](#deploy-edge-function)
4. [Konfigurasi Midtrans Dashboard](#konfigurasi-midtrans-dashboard)
5. [Environment Variables](#environment-variables)
6. [Format Order ID](#format-order-id)
7. [Status Mapping](#status-mapping)
8. [Testing Webhook](#testing-webhook)
9. [Troubleshooting](#troubleshooting)

---

## Pendahuluan

### Mengapa 1 Webhook untuk 2 Aplikasi?

✅ **Keuntungan:**
- Hanya perlu manage 1 endpoint
- Satu konfigurasi di Midtrans Dashboard
- Shared server key untuk kedua aplikasi
- Logging terpusat untuk debugging

### Bagaimana Ini Bisa Bekerja?

Webhook membedakan aplikasi berdasarkan **format `order_id`**:

| App | Order ID Format | Contoh |
|-----|-----------------|--------|
| Laundry | `LAUNDRY-{uuid8}-{timestamp}` | `LAUNDRY-a1b2c3d4-1705312800000` |
| Laundry Bulk | Di-lookup di `laundry_orders` | - |
| Catering | UUID langsung | `550e8400-e29b-41d4-a716-446655440000` |
| Catering Bulk | `BULK-{timestamp}` | `BULK-1705312800000` |

---

## Cara Kerja Unified Webhook

```
┌─────────────────────────────────────────────────────────────────┐
│                     MIDTRANS SERVER                              │
│                          │                                       │
│                    POST notification                             │
│                          ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              UNIFIED WEBHOOK                                 │ │
│  │     (supabase/functions/midtrans-webhook)                   │ │
│  │                                                              │ │
│  │  1. Verify Signature (SHA-512)                              │ │
│  │  2. Parse order_id                                          │ │
│  │  3. Detect App Type                                         │ │
│  │                          │                                   │ │
│  │         ┌────────────────┼────────────────┐                 │ │
│  │         ▼                ▼                ▼                 │ │
│  │   ┌──────────┐    ┌──────────┐    ┌──────────┐             │ │
│  │   │ LAUNDRY  │    │ CATERING │    │  BULK    │             │ │
│  │   │ Handler  │    │ Handler  │    │ Handler  │             │ │
│  │   └────┬─────┘    └────┬─────┘    └────┬─────┘             │ │
│  │        │               │               │                    │ │
│  │        ▼               ▼               ▼                    │ │
│  │  ┌───────────┐   ┌───────────┐   ┌───────────┐            │ │
│  │  │ laundry_  │   │  orders   │   │ Try Both  │            │ │
│  │  │  orders   │   │ (catering)│   │   Tables  │            │ │
│  │  └───────────┘   └───────────┘   └───────────┘            │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Deploy Edge Function

### 1. Deploy Webhook Function

```bash
# Masuk ke direktori project
cd Laundry-AtTauhid

# Deploy edge function webhook (TANPA JWT verification)
npx supabase functions deploy midtrans-webhook --no-verify-jwt
```

> ⚠️ **Penting:** Flag `--no-verify-jwt` **WAJIB** karena Midtrans tidak mengirim JWT token. Keamanan dijamin melalui signature verification (SHA-512) di dalam function.

### 2. Verifikasi Deployment

```bash
# Cek status function
npx supabase functions list

# Lihat logs
npx supabase functions logs midtrans-webhook
```

### 3. URL Webhook

Setelah deploy, URL webhook adalah:
```
https://<PROJECT_REF>.supabase.co/functions/v1/midtrans-webhook
```

Untuk project ini (Project ID: `nxegugfgzayjnyqagcge`):
```
https://nxegugfgzayjnyqagcge.supabase.co/functions/v1/midtrans-webhook
```

---

## Konfigurasi Midtrans Dashboard

### Langkah-langkah:

1. **Login ke Midtrans Dashboard**
   - Sandbox: https://dashboard.sandbox.midtrans.com
   - Production: https://dashboard.midtrans.com

2. **Buka Settings → Configuration**

3. **Set Payment Notification URL:**
   ```
   https://nxegugfgzayjnyqagcge.supabase.co/functions/v1/midtrans-webhook
   ```

4. **Aktifkan Notification Events:**
   - ✅ HTTP(s) notification
   - Centang semua status:
     - ✅ settlement
     - ✅ pending
     - ✅ capture
     - ✅ deny
     - ✅ cancel
     - ✅ expire
     - ✅ refund

5. **Klik Save**

### Screenshot Referensi:
```
┌─────────────────────────────────────────────────────┐
│ SETTINGS > CONFIGURATION                            │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Environment: [Sandbox ▼]                            │
│                                                     │
│ Payment Notification URL:                           │
│ ┌─────────────────────────────────────────────────┐│
│ │ https://nxegugfgzayjnyqagcge.supabase.co/func...││
│ └─────────────────────────────────────────────────┘│
│                                                     │
│ ☑ Enable HTTP(s) notification                      │
│                                                     │
│ Notification:                                       │
│ ☑ settlement  ☑ pending  ☑ capture                │
│ ☑ deny        ☑ cancel   ☑ expire                 │
│ ☑ refund                                           │
│                                                     │
│                          [Save Changes]             │
└─────────────────────────────────────────────────────┘
```

---

## Environment Variables

Pastikan environment variables berikut sudah di-set di Supabase:

### Via CLI:

```bash
# Set Midtrans Server Key (SAMA untuk kedua aplikasi)
npx supabase secrets set MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxxx

# Set Production Mode (false untuk sandbox)
npx supabase secrets set MIDTRANS_IS_PRODUCTION=false

# ============================================
# UNTUK 2 SUPABASE PROJECT BERBEDA
# ============================================
# Set credentials untuk project Catering (project BERBEDA)
npx supabase secrets set CATERING_SUPABASE_URL=https://yyy.supabase.co
npx supabase secrets set CATERING_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

### Via Dashboard:

1. Buka https://app.supabase.com
2. Pilih project **Laundry** (tempat webhook di-deploy)
3. **Settings → Edge Functions → Secrets**
4. Tambahkan:

| Secret Name | Value | Keterangan |
|-------------|-------|------------|
| `MIDTRANS_SERVER_KEY` | Server Key dari Midtrans | Wajib |
| `MIDTRANS_IS_PRODUCTION` | `true` atau `false` | Wajib |
| `CATERING_SUPABASE_URL` | `https://yyy.supabase.co` | Untuk project Catering |
| `CATERING_SERVICE_ROLE_KEY` | Service Role Key project Catering | Untuk project Catering |

> 💡 **Catatan:** 
> - `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` sudah otomatis tersedia (untuk project Laundry).
> - `CATERING_SUPABASE_URL` dan `CATERING_SERVICE_ROLE_KEY` perlu di-set manual jika aplikasi Catering di project Supabase **berbeda**.

### Cara Mendapatkan Service Role Key Project Catering:

1. Buka https://app.supabase.com
2. Pilih project **Catering**
3. **Settings → API**
4. Copy **service_role** key (bukan anon key!)

```
┌─────────────────────────────────────────────────────────────┐
│ API Settings                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Project URL:                                                 │
│ https://yyy.supabase.co  ← CATERING_SUPABASE_URL            │
│                                                              │
│ API Keys:                                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ anon (public)                                           │ │
│ │ eyJhbGciOiJIUzI1NiIsInR5cCI6Ikp... ← JANGAN pakai ini  │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ service_role (secret)                                   │ │
│ │ eyJhbGciOiJIUzI1NiIsInR5cCI6Ikp... ← PAKAI ini        │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Arsitektur 2 Project Berbeda

```
┌────────────────────────────────────────────────────────────────────┐
│                         MIDTRANS                                    │
│                    (1 Merchant Account)                            │
│                            │                                        │
│                     POST notification                               │
│                            ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              UNIFIED WEBHOOK                                  │  │
│  │    (Deploy di Supabase Project LAUNDRY)                      │  │
│  │                                                               │  │
│  │  Environment Variables:                                       │  │
│  │  • SUPABASE_URL (auto - Laundry)                             │  │
│  │  • SUPABASE_SERVICE_ROLE_KEY (auto - Laundry)                │  │
│  │  • CATERING_SUPABASE_URL (manual)                            │  │
│  │  • CATERING_SERVICE_ROLE_KEY (manual)                        │  │
│  │  • MIDTRANS_SERVER_KEY                                       │  │
│  │                                                               │  │
│  │         Detect by order_id format                            │  │
│  │                     │                                         │  │
│  │         ┌───────────┴───────────┐                            │  │
│  │         ▼                       ▼                            │  │
│  │  ┌─────────────┐         ┌─────────────┐                     │  │
│  │  │  LAUNDRY-*  │         │    UUID     │                     │  │
│  │  │   format    │         │   format    │                     │  │
│  │  └──────┬──────┘         └──────┬──────┘                     │  │
│  └─────────│───────────────────────│────────────────────────────┘  │
│            │                       │                                │
│            ▼                       ▼                                │
│  ┌─────────────────┐     ┌─────────────────┐                       │
│  │ SUPABASE PROJ A │     │ SUPABASE PROJ B │                       │
│  │    (Laundry)    │     │   (Catering)    │                       │
│  │                 │     │                 │                       │
│  │ laundry_orders  │     │     orders      │                       │
│  └─────────────────┘     └─────────────────┘                       │
└────────────────────────────────────────────────────────────────────┘
```

---

## Format Order ID

### Laundry At-Tauhid

```javascript
// Single payment
const midtransOrderId = `LAUNDRY-${orderId.substring(0, 8)}-${Date.now()}`
// Contoh: LAUNDRY-a1b2c3d4-1705312800000

// Bulk payment (disimpan di midtrans_order_id column)
// Ditemukan via: SELECT * FROM laundry_orders WHERE midtrans_order_id = ?
```

### Catering Order System

```javascript
// Single payment - langsung pakai UUID order
const orderId = "550e8400-e29b-41d4-a716-446655440000"

// Bulk payment
const orderId = `BULK-${Date.now()}`
// Contoh: BULK-1705312800000
// Orders ditemukan via: SELECT * FROM orders WHERE transaction_id = ?
```

---

## Status Mapping

### Laundry App Status

| Midtrans Status | Laundry Status | Keterangan |
|-----------------|----------------|------------|
| `settlement` | `DIBAYAR` | Pembayaran berhasil |
| `capture` (accept) | `DIBAYAR` | Credit card berhasil |
| `capture` (challenge) | `MENUNGGU_PEMBAYARAN` | Perlu review |
| `pending` | `MENUNGGU_PEMBAYARAN` | Menunggu pembayaran |
| `deny` | `MENUNGGU_PEMBAYARAN` | Ditolak, bisa retry |
| `cancel` | `MENUNGGU_PEMBAYARAN` | Dibatalkan, bisa retry |
| `expire` | `MENUNGGU_PEMBAYARAN` | Kedaluwarsa, bisa retry |
| `refund` | `MENUNGGU_PEMBAYARAN` | Di-refund |

### Catering App Status

| Midtrans Status | Catering Status | Keterangan |
|-----------------|-----------------|------------|
| `settlement` | `paid` | Pembayaran berhasil |
| `capture` (accept) | `paid` | Credit card berhasil |
| `pending` | `pending` | Menunggu pembayaran |
| `deny` | `failed` | Pembayaran gagal |
| `cancel` | `failed` | Pembayaran dibatalkan |
| `expire` | `expired` | Pembayaran kedaluwarsa |

### Payment Method Mapping (Laundry)

| Midtrans Type | App Method |
|---------------|------------|
| `qris` | `qris` |
| `gopay` | `qris` |
| `shopeepay` | `qris` |
| `bank_transfer` | `bank_transfer` |
| `bca_va` | `bca_va` |
| `bni_va` | `bni_va` |
| `bri_va` | `bri_va` |
| `echannel` | `echannel` |
| `credit_card` | `credit_card` |

---

## Testing Webhook

### 1. Test Manual dengan cURL

```bash
# Generate signature dulu (lihat section di bawah)
# Lalu test:

curl -X POST https://nxegugfgzayjnyqagcge.supabase.co/functions/v1/midtrans-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "LAUNDRY-test1234-1705312800000",
    "transaction_status": "settlement",
    "status_code": "200",
    "gross_amount": "50000",
    "payment_type": "qris",
    "signature_key": "<CALCULATED_SIGNATURE>",
    "transaction_id": "test-123",
    "transaction_time": "2024-01-15 10:00:00",
    "merchant_id": "G123456789",
    "currency": "IDR"
  }'
```

### 2. Generate Signature

```javascript
// Node.js
const crypto = require('crypto');

const orderId = 'LAUNDRY-test1234-1705312800000';
const statusCode = '200';
const grossAmount = '50000';
const serverKey = 'YOUR_SERVER_KEY';

const payload = orderId + statusCode + grossAmount + serverKey;
const signature = crypto.createHash('sha512').update(payload).digest('hex');

console.log('Signature:', signature);
```

### 3. Test via Midtrans Dashboard

1. Buka Midtrans Dashboard (Sandbox)
2. **Settings → Configuration**
3. Klik **"Send Test Notification"**
4. Cek logs: `npx supabase functions logs midtrans-webhook`

### 4. Test End-to-End

1. Buat order di salah satu aplikasi
2. Lakukan pembayaran via Midtrans Snap
3. Verifikasi webhook diterima di logs
4. Cek status order di database

---

## Troubleshooting

### ❌ Error: Invalid Signature (403)

**Penyebab:**
- Server Key salah
- Menggunakan key Sandbox di Production atau sebaliknya

**Solusi:**
```bash
# Cek server key
npx supabase secrets list

# Update jika salah
npx supabase secrets set MIDTRANS_SERVER_KEY=<correct-key>
```

### ❌ Error: Order Not Found

**Penyebab:**
- Order belum dibuat sebelum pembayaran
- Format order_id tidak sesuai

**Solusi:**
- Cek logs untuk melihat order_id yang diterima
- Verifikasi data di database
- Pastikan `midtrans_order_id` tersimpan saat create snap token

### ❌ Webhook Tidak Terpanggil

**Penyebab:**
- URL webhook salah di Midtrans Dashboard
- Function tidak ter-deploy

**Solusi:**
```bash
# Cek function sudah deployed
npx supabase functions list

# Re-deploy jika perlu
npx supabase functions deploy midtrans-webhook --no-verify-jwt
```

### ❌ Status Tidak Update

**Penyebab:**
- RLS blocking update
- Column tidak ada

**Solusi:**
- Edge function menggunakan service role, jadi RLS harusnya bypass
- Cek error di logs
- Verifikasi schema database

### 📋 Melihat Logs

```bash
# Via CLI (real-time)
npx supabase functions logs midtrans-webhook --follow

# Atau via Dashboard
# Supabase Dashboard → Edge Functions → midtrans-webhook → Logs
```

---

## Database Tables Reference

### Laundry App: `laundry_orders`

```sql
-- Kolom yang di-update oleh webhook:
- status: 'DIBAYAR' | 'MENUNGGU_PEMBAYARAN' | etc
- paid_at: timestamp
- paid_amount: integer
- payment_method: string
- notes: string (untuk error messages)
- midtrans_order_id: string (di-clear saat cancel/expire)
- midtrans_snap_token: string (di-clear saat cancel/expire)
```

### Catering App: `orders`

```sql
-- Kolom yang di-update oleh webhook:
- status: 'paid' | 'pending' | 'failed' | 'expired'
- updated_at: timestamp
- transaction_id: string (untuk bulk payment lookup)
```

---

## Checklist Deployment

### Setup Awal:
- [ ] Deploy edge function: `npx supabase functions deploy midtrans-webhook --no-verify-jwt`
- [ ] Set secret: `MIDTRANS_SERVER_KEY`
- [ ] Set secret: `MIDTRANS_IS_PRODUCTION=false` (untuk sandbox)

### Untuk 2 Project Berbeda (Laundry + Catering):
- [ ] Dapatkan `SUPABASE_URL` dari project Catering
- [ ] Dapatkan `service_role` key dari project Catering
- [ ] Set secret: `CATERING_SUPABASE_URL`
- [ ] Set secret: `CATERING_SERVICE_ROLE_KEY`

### Konfigurasi Midtrans:
- [ ] Konfigurasi Notification URL di Midtrans Dashboard Sandbox
- [ ] Test dengan "Send Test Notification"
- [ ] Verifikasi logs berjalan normal

### Testing:
- [ ] Test pembayaran Laundry app → cek status update di `laundry_orders`
- [ ] Test pembayaran Catering app → cek status update di `orders`

### Production:
- [ ] Konfigurasi Notification URL di Midtrans Dashboard Production
- [ ] Update `MIDTRANS_IS_PRODUCTION=true`

---

## Security Notes

1. **Signature Verification** - Semua notifikasi diverifikasi dengan SHA-512
2. **No JWT Required** - Midtrans tidak support JWT, keamanan via signature
3. **Service Role** - Edge function menggunakan service role untuk bypass RLS
4. **HTTPS Only** - Midtrans hanya mengirim ke endpoint HTTPS
5. **Idempotent** - Webhook bisa dipanggil multiple kali untuk order yang sama

---

## Support

- 📚 Midtrans Docs: https://docs.midtrans.com/
- 📚 Supabase Edge Functions: https://supabase.com/docs/guides/functions
- 🐛 Issues: Cek logs di Supabase Dashboard