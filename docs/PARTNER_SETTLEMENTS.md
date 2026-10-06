# Settlement Mitra Laundry

Menu **Settlement Mitra** (`/partner-settlements`) digunakan untuk membayar bagian mitra berdasarkan saldo bersih yang belum pernah direkonsiliasi.

## Prinsip

- Order biasa baru menjadi hak mitra setelah statusnya **DIBAYAR** atau **SELESAI**.
- Setiap order hanya boleh masuk satu settlement.
- Koreksi negatif (misalnya double input, tagihan tidak semestinya, atau berat terlalu besar) mengurangi hak mitra setelah koreksi disetujui admin.
- Koreksi positif baru menambah hak mitra setelah pembayaran tambahan pelanggan selesai.
- Jika koreksi terjadi setelah mitra sudah dibayar, koreksi tersebut otomatis menjadi penyesuaian pada settlement berikutnya.
- Saldo bersih nol atau negatif tidak boleh dibayar. Nilainya tetap terbuka dan dibawa ke settlement berikutnya.
- Settlement yang sudah dicatat tidak menghapus atau mengubah order, pembayaran pelanggan, maupun koreksi lama.

## Aktivasi awal

Sebelum memakai ledger baru, admin harus mengaktifkan settlement untuk setiap mitra dengan **tanggal pertama transaksi yang belum pernah dibayar kepada mitra secara manual**.

Contoh:
- Settlement manual terakhir sudah mencakup transaksi sampai 5 Oktober 2026.
- Maka tanggal mulai ledger baru adalah 6 Oktober 2026.

Tanggal awal ini sengaja tidak dibuat otomatis supaya transaksi historis yang sudah pernah dibayar tidak ikut dibayar ulang.

Koreksi terhadap order lama tetap dapat masuk ke settlement baru apabila koreksinya terjadi setelah tanggal aktivasi. Dengan begitu, jika order lama sudah dibayar ke mitra lalu kemudian ditemukan salah berat/double input, bagian mitra yang berlebih tetap dikurangkan pada pembayaran berikutnya.

## Rumus pembayaran

```
Saldo bersih mitra
= bagian order lunas yang belum disettlement
+ koreksi positif yang sudah lunas
- koreksi negatif yang belum direkonsiliasi
```

Contoh:
- Order baru: bagian mitra Rp500.000
- Koreksi salah berat: -Rp40.000
- Koreksi tambahan yang sudah dibayar pelanggan: +Rp15.000

Maka pembayaran mitra yang dicatat adalah Rp475.000.

## Hak akses

- **Admin**: mengaktifkan tanggal awal, melihat saldo, dan mencatat pembayaran.
- **Kasir**: melihat saldo dan mencatat pembayaran setelah ledger diaktifkan admin.
- **Mitra**: hanya melihat saldo dan histori miliknya sendiri.

Setiap settlement menyimpan referensi pembayaran, waktu, pelaku, jumlah order, jumlah koreksi, dan baris sumber order/koreksi. Aktivasi dan pembayaran settlement juga ditulis ke `audit_logs`.

## Keamanan data

Tabel ledger hanya dapat dibaca langsung oleh role yang berhak. Penulisan dilakukan melalui RPC yang memeriksa role dan menghitung ulang sumber yang belum pernah disettlement. Constraint unik `(source_type, source_id)` mencegah order/koreksi yang sama dibayar dua kali.

Migration:
`supabase/migrations/20261006113044_partner_settlement_ledger.sql`.

Pengujian:
```
npm run test:settlements
npm run test:corrections
npx tsc --noEmit -p tsconfig.app.json
npm run build
```
