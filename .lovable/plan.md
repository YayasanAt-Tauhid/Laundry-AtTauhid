
# Halaman Admin: Pesan Tunggakan dengan Link Pembayaran Langsung

## Ringkasan
Membuat halaman admin untuk mengirim pesan tunggakan ke orang tua siswa. Berbeda dari rencana sebelumnya, **admin akan men-generate link pembayaran Midtrans langsung (redirect URL)** sehingga orang tua **tidak perlu login** ke aplikasi. Orang tua cukup klik link di WhatsApp dan langsung masuk ke halaman pembayaran Midtrans.

## Alur Kerja

```text
Admin buka halaman "Pesan Tunggakan"
       |
       v
Lihat daftar siswa menunggak (tabel + filter)
       |
       +---> Klik "Generate Link & Kirim WA" per siswa
       |         |
       |         v
       |     Edge function buat Midtrans Snap token
       |     dan dapatkan redirect_url (link pembayaran langsung)
       |         |
       |         v
       |     Compose pesan otomatis berisi:
       |     - Nama siswa, kelas, rincian tunggakan
       |     - Link pembayaran Midtrans (redirect_url)
       |         |
       |         v
       |     Buka WhatsApp dengan pesan siap kirim
       |
       +---> Export massal ke Excel (pesan + kontak)
```

## Fitur Utama

1. **Tabel daftar siswa menunggak** - Dengan filter kelas, pencarian nama/NIK, dan sorting
2. **Generate link pembayaran per siswa** - Admin klik tombol, sistem buat Midtrans token dan dapat redirect URL
3. **Pesan otomatis via WhatsApp** - Pesan berisi rincian tunggakan + link pembayaran langsung
4. **Copy pesan** - Tombol salin pesan ke clipboard
5. **Export massal** - Export Excel berisi kontak + pesan personal untuk broadcast WA

## Keuntungan redirect_url Midtrans

- Orang tua **tidak perlu login** ke aplikasi
- Orang tua **tidak perlu install** apapun
- Link langsung ke halaman pembayaran Midtrans yang aman
- Mendukung semua metode pembayaran (QRIS, VA, dll)
- Webhook tetap memproses pembayaran dan update status order otomatis

## Detail Teknis

### 1. Edge Function Baru: `create-payment-link`
- Khusus untuk admin (validasi role admin)
- Menerima order ID atau array order IDs (untuk bulk per siswa)
- Memanggil Midtrans Snap API dan mengembalikan `redirect_url`
- Tidak butuh parent login - admin yang generate
- Menggunakan `SUPABASE_SERVICE_ROLE_KEY` untuk bypass RLS

### 2. Halaman Baru: `src/pages/ArrearsMessaging.tsx`
- Route: `/arrears-messaging` (admin only)
- Layout menggunakan `DashboardLayout`
- Fetch data tunggakan dari `laundry_orders` + `students` + `profiles`
- Tabel kolom: NIK, Nama Siswa, Kelas, Nama Ortu, No HP, Jml Order, Total Tunggakan, Aksi
- Filter: kelas, pencarian, sorting (jumlah/tanggal/nominal)
- Tombol aksi per baris: "Generate Link & Kirim WA", "Salin Pesan"

### 3. Komponen: `src/components/arrears/ArrearsMessageComposer.tsx`
- Dialog/modal untuk preview pesan sebelum kirim
- Menampilkan pesan yang sudah di-compose dengan rincian tunggakan
- Tombol "Kirim via WhatsApp" dan "Salin Pesan"
- Loading state saat generate Midtrans token

### 4. Template Pesan
```
Assalamualaikum Bapak/Ibu,

Informasi tunggakan laundry putra/putri:
Nama: {nama_siswa}
Kelas: {kelas}

Rincian:
- {tanggal} - {kategori} - Rp {harga}
- ...

Total: Rp {total}

Bayar langsung via link berikut:
{midtrans_redirect_url}

Terima kasih.
Wassalamualaikum.
```

### 5. Update File Existing
- **`src/App.tsx`** - Tambah route `/arrears-messaging` (admin only)
- **`src/components/layout/DashboardLayout.tsx`** - Tambah menu "Pesan Tunggakan" di sidebar admin
- **`supabase/config.toml`** - Tambah config untuk edge function `create-payment-link` dengan `verify_jwt = false`

### File yang akan dibuat:
- `supabase/functions/create-payment-link/index.ts` - Edge function generate Midtrans payment link
- `src/pages/ArrearsMessaging.tsx` - Halaman utama
- `src/components/arrears/ArrearsMessageComposer.tsx` - Komponen compose & preview pesan

### File yang akan diedit:
- `src/App.tsx` - Tambah route
- `src/components/layout/DashboardLayout.tsx` - Tambah menu navigasi
