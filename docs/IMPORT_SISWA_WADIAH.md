# Import Siswa dengan Saldo Wadiah

Dokumentasi untuk fitur import data siswa yang sudah memiliki saldo wadiah (untuk migrasi data dari sistem lama).

## Deskripsi

Fitur ini memungkinkan admin untuk melakukan migrasi data siswa dari sistem lama yang sudah memiliki saldo tabungan/wadiah. Fitur ini mendukung **dua skenario**:

1. **Siswa Baru** - Membuat data siswa baru sekaligus dengan saldo wadiah
2. **Siswa Sudah Ada** - Menambahkan saldo wadiah ke siswa yang sudah terdaftar (berdasarkan NIK)

## Cara Menggunakan

### 1. Akses Menu Import

1. Login sebagai **Admin**
2. Pergi ke menu **Migrasi Data** atau **Settings > Import Data**
3. Pilih jenis data: **💰 Data Siswa + Saldo Wadiah**

### 2. Download Template

Klik tombol **Download Template** untuk mendapatkan file CSV contoh dengan format yang benar.

### 3. Isi Data

Format file CSV yang dibutuhkan:

| Kolom | Keterangan | Siswa Baru | Siswa Sudah Ada |
|-------|------------|------------|-----------------|
| `nik` | Nomor Induk Kependudukan/Siswa | ✅ Wajib | ✅ Wajib |
| `nama` | Nama lengkap siswa | ✅ Wajib | ⚪ Opsional (diabaikan) |
| `kelas` | Kelas siswa (contoh: 7A, 8B, 9C) | ✅ Wajib | ⚪ Opsional (diabaikan) |
| `saldo_wadiah` | Saldo wadiah dalam rupiah | ⚪ Opsional (default: 0) | ⚪ Opsional |

### 4. Contoh Data

```csv
nik,nama,kelas,saldo_wadiah
1901012209110001,Ahmad Fauzi,7A,50000
1971053008110001,Siti Aminah,8B,125000
1901040505110002,Muhammad Rizki,9C,75000
3201370803110003,Fatimah Az-Zahra,7B,200000
1971013110080001,Abdullah Rahman,8A,30000
```

### 5. Upload dan Import

1. Klik **Choose File** dan pilih file CSV yang sudah diisi
2. Sistem akan menampilkan preview data
3. Periksa apakah ada error validasi (NIK duplikat dalam file, saldo tidak valid)
4. Jika sudah benar, klik **Import**
5. Tunggu proses selesai

## Perilaku Import (Upsert)

### Jika NIK Sudah Terdaftar (Siswa Sudah Ada):

- ✅ Saldo wadiah akan **DITAMBAHKAN** ke saldo yang sudah ada
- ✅ Transaksi akan tercatat di audit log
- ⚪ Nama dan kelas dari file akan **DIABAIKAN** (tidak di-update)
- ⚪ Data siswa lainnya tidak berubah

**Contoh:**
- Saldo saat ini: Rp 50.000
- Saldo dari import: Rp 75.000
- Saldo setelah import: Rp 125.000

### Jika NIK Belum Terdaftar (Siswa Baru):

- ✅ Data siswa baru akan dibuat (nama, kelas, NIK wajib diisi)
- ✅ Saldo wadiah akan di-set sesuai file
- ✅ Transaksi awal akan tercatat di audit log

## Catatan Penting

### Format Saldo Wadiah

- Gunakan angka bulat tanpa titik pemisah ribuan
- Contoh benar: `50000`, `125000`, `200000`
- Contoh salah: `50.000`, `Rp 50.000`, `50,000`
- Jika siswa tidak memiliki saldo, isi dengan `0` atau kosongkan

### NIK Harus Unik dalam File

- Setiap baris harus memiliki NIK yang berbeda
- Jika ada NIK duplikat dalam satu file, import akan gagal
- NIK yang sudah ada di database **TIDAK AKAN** menyebabkan error (akan di-update)

### Nama Kolom Alternatif

Sistem juga mendukung nama kolom alternatif:

| Kolom Utama | Alternatif yang Diterima |
|-------------|--------------------------|
| `nik` | `nis`, `nomor_induk` |
| `nama` | `name` |
| `kelas` | `class` |
| `saldo_wadiah` | `saldo`, `wadiah`, `balance` |

## Proses di Belakang Layar

Saat import dilakukan, sistem akan untuk setiap baris:

1. **Cek NIK di database**
2. **Jika siswa sudah ada:**
   - Ambil ID siswa
   - Update saldo wadiah (tambahkan ke saldo existing)
   - Catat transaksi deposit di `wadiah_transactions`
3. **Jika siswa belum ada:**
   - Buat data siswa baru di tabel `students`
   - Buat saldo wadiah di tabel `student_wadiah_balance`
   - Catat transaksi awal di `wadiah_transactions`

## Troubleshooting

### Error: "NIK duplikat dalam file"

File CSV Anda memiliki NIK yang sama di lebih dari satu baris. Solusi:
- Periksa dan hapus baris duplikat
- Pastikan setiap baris memiliki NIK unik

### Error: "Siswa baru harus memiliki nama dan kelas"

NIK tidak ditemukan di database dan kolom nama/kelas kosong. Solusi:
- Isi nama dan kelas untuk siswa baru
- Atau pastikan NIK sudah benar (mungkin typo)

### Error: "NIK tidak boleh kosong"

Ada baris dengan kolom NIK yang kosong. Solusi:
- Isi NIK untuk setiap baris
- Hapus baris yang tidak memiliki data

### Error: "Saldo wadiah tidak valid"

Saldo harus berupa angka positif atau nol. Solusi:
- Pastikan tidak ada karakter selain angka
- Hapus simbol mata uang (Rp), titik, atau koma

### Sukses tapi saldo tidak bertambah

Pastikan nilai saldo_wadiah di file CSV lebih dari 0. Jika nilainya 0 atau kosong, sistem tidak akan membuat/mengupdate saldo.

## Contoh Skenario Migrasi

### Skenario 1: Migrasi Awal (Semua Siswa Baru)

1. Export data siswa dari sistem lama ke CSV
2. Pastikan format sesuai template
3. Import menggunakan fitur ini
4. Semua siswa akan dibuat baru dengan saldo wadiah

### Skenario 2: Update Saldo Existing

1. Siswa sudah ada di sistem (dari import sebelumnya)
2. Perlu menambahkan saldo wadiah dari sistem lama
3. Siapkan CSV dengan NIK dan saldo saja
4. Import - saldo akan ditambahkan ke saldo yang ada

### Skenario 3: Campuran (Ada yang Baru, Ada yang Update)

1. Siapkan CSV dengan semua data
2. Untuk siswa baru: isi lengkap (NIK, nama, kelas, saldo)
3. Untuk siswa existing: minimal isi NIK dan saldo
4. Sistem otomatis mendeteksi mana yang baru/existing

## Contoh File

File contoh tersedia di: `docs/contoh_import_siswa_wadiah.csv`

## Keamanan

- Hanya role **Admin** yang dapat mengakses fitur ini
- Semua transaksi wadiah tercatat di audit log (`wadiah_transactions`)
- Data siswa baru terhubung dengan `parent_id` admin yang melakukan import
- Perubahan saldo dapat dilacak melalui history transaksi