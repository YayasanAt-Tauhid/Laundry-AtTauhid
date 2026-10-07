# Koreksi tagihan belum dibayar

Pada menu **Koreksi Tagihan → Belum dibayar**, admin, petugas, atau kasir dapat memperbaiki siswa, mitra, kategori, berat/jumlah, tanggal laundry, dan catatan. Alasan minimal 10 karakter wajib diisi. Rincian sebelum/sesudah, pelaku, waktu, dan alasan tersimpan dalam riwayat serta audit. Orang tua dan mitra terkait dapat membaca riwayat sesuai RLS.

Nominal dan bagi hasil dihitung oleh database menggunakan tarif terkini. Tidak ada input nominal bebas. Order tetap memakai ID yang sama, lalu kembali ke **Menunggu Persetujuan Mitra**; persetujuan lama dibersihkan. Mitra harus menyetujui rincian baru sebelum pembayaran. Koreksi ini tidak membuat refund, memindahkan pembayaran, atau mengubah saldo wadiah.

Tagihan dengan tautan/token Midtrans masih terkait diblokir sampai pembayaran selesai atau webhook kedaluwarsa/pembatalan membersihkan tautannya. Jangan menghapus tautan secara manual. Tagihan dengan jejak pembayaran, kembalian, pembulatan, atau transaksi wadiah terkait memerlukan rekonsiliasi admin. Tagihan yang telah lunas memakai tab **Sudah dibayar** dan ledger koreksi lunas.

Simpan memakai versi tagihan saat formulir dibuka. Jika tagihan berubah bersamaan, pengguna wajib memuat ulang. Pembuatan tautan gateway mengikat seluruh kelompok tagihan secara atomik hanya jika versi, nominal, siswa, dan status masih sesuai; token dari rincian yang berubah tidak dikirim kepada pelanggan. POS memeriksa ulang tagihan dan mencocokkan nominal/siswa saat pelunasan; alur POS lama tetap terdiri dari beberapa operasi.

## Aktivasi

1. Terapkan `supabase/migrations/20261006080550_unpaid_order_revisions.sql` pada project Laundry **sonnfclnzsasjifieuog**, sesudah migration koreksi lunas. Migration menambah struktur tanpa memperbarui transaksi historis.
2. Periksa kesamaan jumlah, nominal, dan checksum order serta saldo/transaksi wadiah sebelum/sesudah. Periksa RLS, grant, trigger, dan security advisors. Schema `laundry_private` tetap tidak diekspos.
3. Deploy `create-midtrans-token`, `create-payment-link`, dan `regenerate-payment` beserta `_shared/attach-payment.ts`. Pertahankan pengaturan `verify_jwt` masing-masing: false, true, false.
4. Rilis frontend sesudah migration dan edge functions aktif. Verifikasi deployment; jangan menjalankan koreksi/refund nyata untuk pengujian production.

Jalankan `npm run test:corrections`, `node --test tests/unpaid-corrections.test.mjs`, TypeScript, lint komponen baru, dan build production. Fixture lokal menggunakan PGlite dan fungsi harga/wadiah dari production; pengujian ini bukan integrasi penuh dengan Midtrans.

## Membatalkan tagihan yang salah

Jika tagihan memang tidak semestinya ada, admin, petugas, atau kasir memakai **Batalkan Tagihan**, bukan menghapus row. Alasan pembatalan minimal 10 karakter wajib diisi. Sistem hanya mengubah status menjadi **DIBATALKAN**; siswa, mitra, kategori, berat/jumlah, nominal, bagi hasil, dan data asli tetap tersimpan. Snapshot sebelum/sesudah, pelaku, waktu, dan alasan dicatat pada ledger `unpaid_order_revisions` serta audit log.

Pembatalan hanya berlaku untuk status belum dibayar: **DRAFT**, **MENUNGGU_APPROVAL_MITRA**, **DITOLAK_MITRA**, **DISETUJUI_MITRA**, atau **MENUNGGU_PEMBAYARAN**. Tagihan dengan token/Order ID Midtrans aktif atau jejak pembayaran, wadiah, kembalian, maupun pembulatan diblokir sampai direkonsiliasi. Setelah dibatalkan, order dikunci dari perubahan dan penghapusan permanen, tidak muncul sebagai tunggakan/pendapatan/tagihan aktif, tetapi tetap dapat dilihat sebagai histori dengan filter **Dibatalkan**.


## Pembayaran sebagian Wadiah + Midtrans

- `wadiah_used` adalah pembayaran sebagian yang sudah sah dan mengurangi sisa kewajiban.
- Nominal Midtrans selalu dihitung ulang di server sebagai `total_price - wadiah_used`; nilai nominal dari browser tidak dipercaya.
- Pemakaian Wadiah bersifat idempotent: retry dengan target Wadiah yang sama tidak memotong saldo untuk kedua kali.
- Settlement Midtrans diverifikasi terhadap total sisa seluruh tagihan dalam payment group sebelum status berubah menjadi `DIBAYAR`.
- Browser tidak boleh menandai tagihan `DIBAYAR`; hanya webhook Midtrans yang sudah lolos verifikasi signature dan nominal yang menyelesaikan pembayaran.

## Rekonsiliasi tautan Midtrans kedaluwarsa

Sebelum koreksi atau pembatalan, tautan Midtrans yang masih menempel harus diperiksa ke Midtrans. Hanya status terminal `expire`, `cancel`, atau `deny` yang boleh melepaskan `midtrans_order_id` dan `midtrans_snap_token`. Pelepasan dicatat ke `audit_logs`. Token baru tidak boleh menimpa transaksi lama yang masih aktif.

## Pembatalan tagihan yang sudah memakai Wadiah

Jika tagihan belum lunas tetapi sudah memakai Wadiah dan tautan Midtrans sudah direkonsiliasi, `cancel_unpaid_order` mengembalikan Wadiah secara atomik sebelum mengubah status menjadi `DIBATALKAN`. Jumlah payment dan refund harus cocok dengan `wadiah_used`; jika histori tidak konsisten, pembatalan ditolak dan harus direkonsiliasi manual.