# Settlement Mitra Laundry

Menu **Settlement Mitra** (`/partner-settlements`) dan panel **Pembayaran Mitra per Periode Laundry** di `/reports` → **Tagihan** menggunakan periode tanggal laundry. Pilih satu mitra, tanggal awal, dan tanggal akhir.

## Prinsip

- Bagian order pada periode laundry dihitung termasuk yang belum dibayar siswa, sesuai rekap Tagihan. Order **DITOLAK_MITRA** dan **DIBATALKAN** dikeluarkan.
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

Koreksi yang dibuat setelah akhir periode tetap dapat menjadi penyesuaian pada pembayaran periode tersebut. Untuk order sebelum batas ledger, admin/kasir harus memverifikasi apakah bagian mitranya dahulu sudah dibayar manual, beserta bukti/dasar pemeriksaan. Jika sudah dibayar, selisih dipakai sekali. Jika belum dibayar, selisih tidak dipotong lagi dari periode berikutnya. Order setelah batas ledger yang belum memiliki pembayaran tercatat tidak dianggap sudah dibayar.

Pembatalan tagihan yang belum dibayar **siswa** juga dapat memerlukan pengurangan pembayaran **mitra** apabila bagian mitra sudah dibayarkan. Revisi yang terjadi sebelum pencatatan pembayaran mitra sudah tercermin dalam nominal order dan tidak dipotong ulang.

## Rumus pembayaran

```
Saldo bersih mitra
= bagian order periode laundry yang belum dibayar ke mitra
+ koreksi positif yang sudah lunas
- pengurangan terverifikasi yang belum direkonsiliasi
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

Tabel ledger hanya dapat dibaca langsung oleh role yang berhak. Penulisan dilakukan melalui RPC yang memeriksa role dan menghitung ulang sumber yang belum pernah disettlement. Constraint unik `(source_type, source_id)` mencegah order/koreksi/revisi yang sama dibayar dua kali, termasuk periode yang tumpang tindih. Token preview mencegah pencatatan dengan angka lama; transaksi dikunci dan dihitung ulang saat disimpan. Verifikasi lama yang masih belum selesai menghalangi pencatatan.

RPC lama berbasis `paid_at` menolak pencatatan setelah migration baru, agar tab browser lama tidak memakai rumus yang berbeda.

Migration:
`supabase/migrations/20261006113044_partner_settlement_ledger.sql` dan
`supabase/migrations/20261007071050_partner_period_settlements.sql`.

Pengujian:
```
npm run test:settlements
npm run test:corrections
npx tsc --noEmit -p tsconfig.app.json
npm run build
```
# Cetak dari laporan Tagihan

Tombol **Cetak Laporan** di `/reports` → Tagihan mengambil ulang perhitungan pembayaran mitra saat dicetak untuk satu mitra dan rentang tanggal lengkap. Bagian rekonsiliasi memuat nilai sebelum penyesuaian, rincian koreksi dengan tanggal laundry asal, dan bersih pembayaran. Penyesuaian yang belum diverifikasi ditandai belum final; keputusan belum pernah dibayar ke mitra ditampilkan dengan nilai yang diperhitungkan nol.

Cetak ulang untuk periode yang sudah dibayar memuat snapshot pembayaran dan rincian penyesuaiannya dari ledger, walaupun preview sisa pembayaran sudah nol. Pembayaran baru yang masih tersisa ditampilkan terpisah. Total daftar tagihan siswa tetap mengacu pada periode laundry asal. Cetak untuk semua mitra atau tanggal yang belum lengkap meminta pemilihan satu mitra dan periode untuk menampilkan rekonsiliasi.
