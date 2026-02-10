# Keamanan: Validasi Harga di Backend

## Ringkasan

Dokumen ini menjelaskan implementasi keamanan untuk validasi harga order laundry di backend/database. Fitur ini mencegah manipulasi harga dari sisi frontend.

## Masalah Keamanan (Sebelumnya)

Sebelum implementasi ini, semua perhitungan harga dilakukan di **frontend**:

```javascript
// ❌ TIDAK AMAN - harga dari konstanta frontend
const pricePerUnit = LAUNDRY_CATEGORIES[category].price;
const totalPrice = pricePerUnit * quantity;
```

**Risiko:**
- User bisa memanipulasi request via browser DevTools
- User bisa mengubah `total_price` menjadi 0 atau nilai lain
- User bisa memanipulasi `yayasan_share` dan `vendor_share`
- Tidak ada validasi di server-side

## Solusi: Backend Trigger

Kami menambahkan **database trigger** yang:
1. Mengambil harga dari tabel `laundry_prices` (bukan frontend)
2. Menghitung ulang `total_price` berdasarkan quantity
3. Menghitung ulang `yayasan_share` dan `vendor_share` dari revenue config
4. **Menimpa** semua nilai yang dikirim dari frontend

### Alur Keamanan

```
┌──────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                  │
├──────────────────────────────────────────────────────────────────┤
│  1. User input: category, weight_kg/item_count                   │
│  2. Frontend hitung harga (untuk display)                        │
│  3. Kirim INSERT ke database                                     │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                    DATABASE TRIGGER                               │
│              trg_validate_order_price                            │
├──────────────────────────────────────────────────────────────────┤
│  1. Ambil harga dari tabel laundry_prices                        │
│  2. Validasi quantity (harus > 0)                                │
│  3. Hitung total_price = price_per_unit × quantity               │
│  4. Ambil revenue config dari holiday_settings                   │
│  5. Hitung yayasan_share dan vendor_share                        │
│  6. OVERRIDE semua nilai dengan hasil kalkulasi                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                         DATABASE                                  │
├──────────────────────────────────────────────────────────────────┤
│  Data tersimpan dengan harga yang BENAR                          │
│  (tidak peduli apa yang dikirim frontend)                        │
└──────────────────────────────────────────────────────────────────┘
```

## File yang Terlibat

### 1. Migration File
```
supabase/migrations/20260124_validate_order_price_backend.sql
```
Berisi:
- `validate_and_calculate_order_price()` - Fungsi trigger utama
- `trg_validate_order_price` - Trigger pada tabel `laundry_orders`
- `recalculate_all_order_prices()` - Helper untuk cek data historis
- `fix_all_order_prices()` - Helper untuk fix data historis

### 2. Frontend Hooks
```
src/hooks/useLaundryPrices.ts      # Hook untuk ambil harga dari DB
src/hooks/useBulkOrder.ts          # Updated: ambil harga dari DB
```

### 3. Frontend Pages/Components
```
src/pages/NewOrder.tsx             # Updated: ambil harga dari DB
src/components/import/ImportData.tsx  # Updated: komentar keamanan
src/lib/constants.ts               # Updated: komentar keamanan
```

## Cara Menerapkan Migration

### 1. Via Supabase Dashboard

1. Buka **Supabase Dashboard** > **SQL Editor**
2. Copy isi file `supabase/migrations/20260124_validate_order_price_backend.sql`
3. Jalankan query

### 2. Via Supabase CLI

```bash
cd supabase
supabase db push
```

### 3. Via Link ke Remote Database

```bash
supabase db push --linked
```

## Verifikasi Trigger Aktif

Jalankan query berikut di SQL Editor:

```sql
-- Cek trigger ada
SELECT tgname, tgenabled 
FROM pg_trigger 
WHERE tgname = 'trg_validate_order_price';

-- Cek function ada
SELECT proname 
FROM pg_proc 
WHERE proname = 'validate_and_calculate_order_price';
```

## Testing Keamanan

### Test 1: Insert dengan Harga Salah

```sql
-- Insert order dengan harga yang sengaja salah
INSERT INTO laundry_orders (
  student_id, partner_id, staff_id, category, 
  weight_kg, price_per_unit, total_price, 
  yayasan_share, vendor_share
) VALUES (
  'student-uuid', 'partner-uuid', 'staff-uuid', 'kiloan',
  5,    -- 5 kg
  1,    -- ❌ Harga salah (seharusnya 7000)
  1,    -- ❌ Total salah (seharusnya 35000)
  1,    -- ❌ Yayasan salah
  1     -- ❌ Vendor salah
)
RETURNING price_per_unit, total_price, yayasan_share, vendor_share;

-- HASIL YANG DIHARAPKAN:
-- price_per_unit = 7000 (dari database)
-- total_price = 35000 (7000 × 5)
-- yayasan_share = 10000 (2000 × 5)
-- vendor_share = 25000 (5000 × 5)
```

### Test 2: Update dengan Harga Salah

```sql
-- Update order dengan harga yang sengaja salah
UPDATE laundry_orders
SET total_price = 0, yayasan_share = 0, vendor_share = 0
WHERE id = 'order-uuid'
RETURNING total_price, yayasan_share, vendor_share;

-- HASIL: nilai akan tetap ter-recalculate dengan benar
```

## Cara Update Harga

### ⚠️ PENTING: Harga harus diupdate di DATABASE, bukan di constants!

```sql
-- Update harga kiloan menjadi 8000
UPDATE laundry_prices
SET price_per_unit = 8000
WHERE category = 'kiloan';

-- Update harga selimut menjadi 20000
UPDATE laundry_prices
SET price_per_unit = 20000
WHERE category = 'selimut';
```

Setelah update database, frontend akan otomatis mengambil harga baru (via hook `useLaundryPrices`).

Opsional: Update juga `src/lib/constants.ts` agar fallback value sesuai.

## Memperbaiki Data Historis

Jika ada data historis yang perlu di-recalculate:

### 1. Cek Perbedaan (Dry Run)

```sql
-- Lihat order mana saja yang harganya berbeda
SELECT * FROM recalculate_all_order_prices();
```

Output:
| order_id | old_total | new_total | old_yayasan | new_yayasan | old_vendor | new_vendor |
|----------|-----------|-----------|-------------|-------------|------------|------------|
| uuid-1   | 30000     | 35000     | 8000        | 10000       | 20000      | 25000      |

### 2. Fix Semua Data (Hati-hati!)

```sql
-- ⚠️ CAUTION: Ini akan update SEMUA order
SELECT fix_all_order_prices();
-- Returns: jumlah order yang di-update
```

## FAQ

### Q: Apakah frontend masih perlu menghitung harga?
**A:** Ya, untuk **display purpose** saja. Backend akan selalu override dengan nilai yang benar.

### Q: Bagaimana jika harga di database berbeda dengan constants?
**A:** Frontend akan mengambil harga dari database (via `useLaundryPrices` hook). Constants hanya sebagai fallback jika database tidak bisa diakses.

### Q: Apakah trigger ini memperlambat insert/update?
**A:** Tidak signifikan. Trigger hanya melakukan 2 query (ambil harga + ambil config) dan kalkulasi sederhana.

### Q: Bagaimana dengan pembayaran online (Midtrans)?
**A:** `grossAmount` yang dikirim ke Midtrans tetap dari frontend, tapi nilai `total_price` di database sudah pasti benar karena trigger. Webhook Midtrans akan update status berdasarkan `total_price` yang valid.

## Referensi

- Migration: `supabase/migrations/20260124_validate_order_price_backend.sql`
- Hook: `src/hooks/useLaundryPrices.ts`
- Constants: `src/lib/constants.ts` (dengan komentar keamanan)