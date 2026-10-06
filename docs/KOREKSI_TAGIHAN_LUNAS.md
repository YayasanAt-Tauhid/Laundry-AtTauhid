# Koreksi tagihan laundry yang sudah dibayar

Menu **Koreksi Tagihan** (`/order-corrections`) mempertahankan tagihan, kuitansi dan pembayaran asli. Petugas atau kasir mengajukan koreksi; admin memeriksa dan menyetujui; admin/kasir menyelesaikan selisih. Orang tua melihat koreksi milik anaknya, mitra melihat koreksi order yang ditugaskan kepadanya.

## Operasional

1. Pilih siswa dan tagihan lunas, jenis koreksi, nominal yang benar tanpa biaya pembayaran, serta alasan minimal 10 karakter. Koreksi berat/jumlah ditulis jelas dalam alasan; jumlah pada tagihan/kuitansi asli tetap tersimpan sebagai histori.
2. Admin mencocokkan kuitansi, pembayar, dan nominal. Referensi verifikasi dan catatan wajib diisi. Untuk pengurangan, jumlah pengembalian dan penerima asli wajib diverifikasi.
3. Jangan menghitung pengembalian dari `paid_amount` satu baris: POS menyimpan rincian uang/wadiah/kembalian pada satu order ketika beberapa order dibayar bersama. Periksa kuitansi gabungan, diskon pembulatan, biaya gateway dan kembalian yang sudah dikembalikan. Batas pengembalian adalah selisih nominal; nominal sebenarnya bisa lebih rendah, termasuk nol jika tidak ada uang yang perlu dikembalikan. Penyesuaian bagi hasil mengikuti rasio pada tagihan historis, dengan pembulatan rupiah; sisa menjadi bagian mitra sehingga jumlah bagian tetap sama dengan nilai koreksi.
4. Jika selisih berupa tagihan tambahan, selesaikan melalui kasir di menu Koreksi Tagihan. Penyesuaian ini memiliki nominal dan status sendiri; tagihan lunas asli tidak kembali menjadi belum dibayar. Pembayaran online untuk selisih pada menu ini belum tersedia.
5. Wadiah diproses secara atomik di database, hanya ke/dari siswa pada tagihan asli, dengan persetujuan pelanggan dan referensi bukti. Untuk tunai/transfer/refund dashboard Midtrans, lakukan penyelesaian dahulu lalu catat referensinya. Tombol pencatatan **tidak mengirim uang atau mengajukan refund Midtrans**.
6. Salah siswa: koreksi membalik nominal order asli, admin memverifikasi pengembalian kepada pembayar awal, dan membuat order pengganti belum dibayar untuk siswa yang benar. Order pengganti menggunakan tarif terkini dan menunggu persetujuan mitra. Pembayaran awal tidak dialihkan otomatis ke siswa lain.
7. Cetak bukti koreksi sebagai pendamping kuitansi lama. Status persetujuan dan status penyelesaian terpisah.

Satu order dapat memiliki satu koreksi aktif/disetujui. Pengajuan yang ditolak boleh diajukan ulang. Koreksi yang sudah disetujui tidak dapat diedit/dihapus lewat aplikasi; koreksi lanjutan terhadap koreksi memerlukan penanganan admin tersendiri.

## Laporan

- Laporan pendapatan/bagi hasil dan laporan tagihan menambahkan baris bertanda `[Koreksi]`; pembayaran dan kuitansi lama tetap utuh.
- Pengurangan pendapatan/bagi hasil diakui saat koreksi disetujui; jumlah pengembalian yang masih tertunda terlihat pada menu Koreksi Tagihan.
- Tambahan pendapatan diakui saat selisih dibayar; sebelum itu nilainya masuk tagihan tambahan pada laporan tagihan.
- Filter tanggal laundry mengaitkan penyesuaian ke tanggal layanan asli. Filter tanggal pembayaran memakai tanggal persetujuan untuk pengurangan dan tanggal pelunasan selisih untuk tambahan. Menyelesaikan refund tidak mengurangi pendapatan untuk kedua kalinya.
- Jumlah order layanan tidak bertambah karena baris koreksi. Jumlah tagihan bisa bertambah karena tagihan tambahan.
- Laporan kasir/Midtrans tetap menampilkan uang masuk dan pembayaran asli. Catatan pengembalian/pembayaran tambahan ada di ledger koreksi; jangan menyamakan penerimaan bruto pada laporan gateway dengan pendapatan setelah koreksi.
- Penyelesaian pembayaran mitra yang sudah dilakukan tidak dibatalkan otomatis; gunakan penyesuaian bagi hasil di laporan untuk rekonsiliasi dengan mitra.

## Aktivasi production

SQL lengkap: `supabase/migrations/20261006070356_paid_order_corrections.sql`.

Migration ini menambah tabel ledger dengan RLS, fungsi pengajuan/tinjauan/penyelesaian, audit, dan guard yang mencegah penghapusan atau perubahan data ekonomi pada order lunas. Tidak memperbarui nominal, status, saldo, maupun pembayaran historis. Guard tetap mengizinkan penyimpanan rincian pembayaran POS dan transisi lunas ke selesai.

1. Tinjau SQL dan terapkan migration pada project Laundry **sonnfclnzsasjifieuog** sebelum merilis frontend yang bergantung padanya.
2. Periksa RLS/grant dan Supabase security advisors. API wrappers memakai security invoker; fungsi privileged berada pada schema `laundry_private` yang tidak boleh dimasukkan ke daftar exposed schemas. Jangan berikan hak tulis langsung pada tabel ledger kepada klien.
3. Verifikasi jumlah/sum order dan saldo historis sebelum/sesudah migration; keduanya harus sama. Pastikan ledger awal kosong, fungsi terdaftar dan trigger guard aktif.
4. Rilis frontend, lalu verifikasi menu dan hak akses dengan akun admin, petugas, kasir dan orang tua. Jangan gunakan transaksi production untuk pengujian refund.

Pengujian lokal memakai PostgreSQL WASM (PGlite), schema fixture minimal, serta definisi fungsi harga/wadiah yang dibaca dari production pada 6 Oktober 2026. Ini bukan salinan lengkap production. Jalankan `npm ci`, `npm run test:corrections`, `npx tsc --noEmit -p tsconfig.app.json`, dan `npm run build`.
