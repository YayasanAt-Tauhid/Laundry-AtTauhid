# Pembatalan Setoran Wadiah Manual

Fitur ini membatalkan setoran manual yang salah input dengan transaksi kompensasi, bukan menghapus transaksi sumber.

## Batas penggunaan

- Hanya admin yang dapat menjalankan pembatalan.
- Hanya transaksi bertipe `deposit`, tanpa `order_id`, bernilai positif, dan memiliki catatan persis `Setoran wadiah manual` yang dapat dipilih.
- Alasan wajib 10–500 karakter.
- Satu transaksi sumber hanya dapat dibatalkan satu kali.
- Saldo saat ini harus cukup untuk mengimbangi seluruh nilai setoran. Jika tidak cukup, transaksi ditolak dan perlu rekonsiliasi admin; saldo tidak boleh menjadi negatif.
- Pembatalan tidak memproses penerimaan atau pengembalian uang. Ini hanya koreksi catatan saldo karena setoran awal dinyatakan tidak benar-benar diterima.

## Pencatatan

Transaksi sumber tetap tersimpan. Fungsi database memanggil `process_wadiah_transaction` untuk menambahkan transaksi `adjustment` bernilai negatif, lalu menyimpan hubungan transaksi sumber dan pembalik di `wadiah_deposit_reversals` serta mencatat audit pada `audit_logs`. Semua perubahan terjadi dalam satu transaksi database.

`total_deposited` dan saldo berjalan sama-sama dikurangi sebesar setoran yang tidak pernah diterima. Dengan demikian ringkasan setoran bersih tidak menghitung setoran salah tersebut. Riwayat tetap memperlihatkan transaksi setoran awal dan penyesuaian negatifnya.

## Pengujian

Jalankan:

```sh
node --test tests/wadiah-deposit-reversal.test.mjs
npm run test:corrections
npm run test:settlements
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

Tes Wadiah memakai PGlite dengan schema fixture terisolasi, bukan data produksi.

## Aktivasi

Migration: `supabase/migrations/20261102024139_reverse_manual_wadiah_deposit.sql`.

## Status penerapan (2 November 2026)

SQL migration telah dijalankan melalui Supabase SQL Editor. Verifikasi produksi memastikan tabel `public.wadiah_deposit_reversals`, fungsi privat dan RPC publik tersedia; RLS aktif; role `anon` tidak dapat menjalankan fungsi; dan `authenticated` tidak memiliki hak tulis langsung ke tabel reversal.

Transaksi Abdur Razzaq Khawarizmi Khatami masih belum dibatalkan: transaksi sumber Rp145.000 tetap ada, saldo Rp316.930, total_deposited Rp345.000.

**Penting untuk sinkronisasi migration:** versi `20261102024139` belum tercatat pada `supabase_migrations.schema_migrations`, karena perintah resmi `supabase migration repair 20261102024139 --status applied` gagal dengan HTTP 403 (hak akses akun CLI tidak cukup). Jangan menjalankan ulang file SQL ini pada database produksi. Sebelum memakai `supabase db push` di masa mendatang, tandai versi ini sebagai applied memakai akun yang memiliki hak database yang sesuai.

Frontend belum dirilis ke production. Uji build lokal lulus; deployment preview harus diverifikasi sebelum rilis production.
