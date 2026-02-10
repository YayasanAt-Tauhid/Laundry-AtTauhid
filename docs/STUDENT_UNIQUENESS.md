# Dokumentasi: Sistem Identifikasi Unik Siswa

## Ringkasan

Sistem ini memastikan integritas data siswa dengan mewajibkan NIK (Nomor Induk Kependudukan/Siswa) sebagai identifier unik, ditambah dengan auto-generated `student_code` sebagai backup identifier.

## Perubahan Database

### Migration File
`supabase/migrations/20260116_enforce_student_uniqueness.sql`
`supabase/migrations/20260117_rename_nis_to_nik.sql`

### Perubahan Struktur Tabel `students`

| Kolom | Tipe | Constraint | Deskripsi |
|-------|------|------------|-----------|
| `nik` | TEXT | NOT NULL, UNIQUE | Nomor Induk Kependudukan/Siswa (wajib dan unik) |
| `student_code` | TEXT | NOT NULL, UNIQUE | Auto-generated code (format: STU-YYMMDD-XXXXXX) |

### Index yang Ditambahkan

1. `students_nik_unique` - Unique constraint pada NIK
2. `students_code_unique` - Unique constraint pada student_code
3. `idx_students_name_class` - Index untuk pencarian nama dan kelas
4. `idx_students_parent_active` - Index untuk pencarian berdasarkan parent dan status

## Fungsi RPC Baru

### 1. `check_nik_available(p_nik, p_exclude_id)`

Mengecek ketersediaan NIK.

**Parameter:**
- `p_nik` (TEXT) - NIK yang akan dicek
- `p_exclude_id` (UUID, optional) - ID siswa yang dikecualikan (untuk edit)

**Return:**
```json
{
  "available": true/false,
  "message": "string",
  "existing_student": {
    "id": "uuid",
    "name": "string",
    "class": "string",
    "student_code": "string",
    "is_active": true/false
  }
}
```

**Contoh Penggunaan:**
```typescript
const { data } = await supabase.rpc('check_nik_available', {
  p_nik: '12345',
  p_exclude_id: null
});

if (!data.available) {
  console.log('NIK sudah digunakan oleh:', data.existing_student.name);
}
```

### 2. `find_potential_duplicate_students(p_name, p_class, p_nik, p_exclude_id)`

Mencari siswa yang berpotensi duplikat berdasarkan kesamaan nama, kelas, atau NIK.

**Parameter:**
- `p_name` (TEXT) - Nama siswa
- `p_class` (TEXT, optional) - Kelas siswa
- `p_nik` (TEXT, optional) - NIK siswa
- `p_exclude_id` (UUID, optional) - ID siswa yang dikecualikan

**Return:**
Array of:
```json
{
  "id": "uuid",
  "name": "string",
  "class": "string",
  "nik": "string",
  "student_code": "string",
  "parent_id": "uuid",
  "is_active": true/false,
  "match_type": "EXACT_NIK|EXACT_NAME_CLASS|EXACT_NAME|SIMILAR_NAME",
  "similarity_score": 0.0-1.0
}
```

**Match Types:**
- `EXACT_NIK` - NIK sama persis
- `EXACT_NAME_CLASS` - Nama dan kelas sama persis
- `EXACT_NAME` - Nama sama persis
- `SIMILAR_NAME` - Nama mirip (similarity > 0.6)

**Contoh Penggunaan:**
```typescript
const { data: duplicates } = await supabase.rpc('find_potential_duplicate_students', {
  p_name: 'Ahmad Fauzi',
  p_class: '7A',
  p_nik: '12345',
  p_exclude_id: null
});

if (duplicates.length > 0) {
  // Show warning dialog to user
}
```

### 3. `merge_duplicate_students(p_keep_id, p_merge_ids)`

Menggabungkan data siswa duplikat ke satu record utama. **Hanya untuk Admin.**

**Parameter:**
- `p_keep_id` (UUID) - ID siswa yang dipertahankan
- `p_merge_ids` (UUID[]) - Array ID siswa yang akan di-merge

**Return:**
```json
{
  "success": true/false,
  "message": "string",
  "error": "string (jika gagal)",
  "details": {
    "keep_student": {
      "id": "uuid",
      "name": "string",
      "student_code": "string"
    },
    "orders_updated": 5,
    "wadiah_balance_transferred": 50000,
    "students_deactivated": 2
  }
}
```

**Yang Dilakukan Saat Merge:**
1. Update semua `laundry_orders` ke `keep_id`
2. Transfer saldo wadiah ke `keep_id`
3. Update semua `wadiah_transactions` ke `keep_id`
4. Soft-delete siswa yang di-merge (mark `is_active = false`)
5. Catat ke `audit_logs`

## Audit Trail

Semua perubahan pada data siswa tercatat di tabel `audit_logs`:

| Action | Deskripsi |
|--------|-----------|
| `INSERT` | Siswa baru ditambahkan |
| `UPDATE` | Data siswa diubah (nama, kelas, NIK, status, parent) |
| `DELETE` | Siswa dihapus |
| `MERGE` | Siswa digabungkan |
| `CLASS_CHANGE` | Perubahan kelas (tercatat di `_changes`) |

## Penggunaan di Aplikasi

### Halaman Students.tsx

Form tambah/edit siswa sekarang:
1. **NIK Wajib** - Field NIK harus diisi
2. **Real-time NIK Check** - Validasi ketersediaan NIK saat mengetik (debounced 500ms)
3. **Duplicate Warning** - Dialog peringatan jika ditemukan siswa serupa
4. **Visual Feedback** - Icon ✓/✗ untuk status ketersediaan NIK

### Import Data

File import CSV untuk siswa sekarang memerlukan kolom:
1. `nik` (wajib, unik)
2. `nama` (wajib)
3. `kelas` (wajib)

**Validasi Import:**
- NIK tidak boleh kosong
- NIK tidak boleh duplikat dalam file
- NIK tidak boleh sudah ada di database

## Format Student Code

Student code di-generate otomatis saat siswa ditambahkan:

```
STU-YYMMDD-XXXXXX

STU     = Prefix tetap
YYMMDD  = Tanggal pembuatan (Year-Month-Day)
XXXXXX  = 6 karakter pertama dari UUID
```

**Contoh:** `STU-250116-A1B2C3`

## Menangani Kasus Khusus

### Siswa Kembar

Jika ada siswa kembar dengan nama dan kelas sama:
1. Sistem akan menampilkan warning "Siswa Serupa Ditemukan"
2. User bisa klik "Tetap Tambah Baru" jika yakin ini siswa berbeda
3. NIK pasti berbeda untuk setiap siswa (unique constraint)

### Siswa Pindah Kelas

- Perubahan kelas dicatat di `audit_logs` dengan action `UPDATE`
- Detail perubahan ada di field `_changes` pada `new_data`
- Histori transaksi laundry tetap merujuk ke `student_id` yang sama

### Data Duplikat yang Ditemukan Belakangan

Gunakan fungsi `merge_duplicate_students` melalui admin panel:
1. Identifikasi siswa utama (keep)
2. Pilih siswa yang akan di-merge
3. Jalankan merge (semua order dan saldo akan dipindahkan)

## Menjalankan Migrasi

```bash
# Via Supabase CLI
supabase db push

# Atau via SQL Editor di Supabase Dashboard
# Copy-paste isi file migration
```

## Rollback (Jika Diperlukan)

```sql
-- Hapus constraint
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_nik_unique;
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_code_unique;

-- Hapus kolom student_code
ALTER TABLE public.students DROP COLUMN IF EXISTS student_code;

-- Kembalikan NIK ke nullable
ALTER TABLE public.students ALTER COLUMN nik DROP NOT NULL;

-- Hapus functions
DROP FUNCTION IF EXISTS public.check_nik_available;
DROP FUNCTION IF EXISTS public.find_potential_duplicate_students;
DROP FUNCTION IF EXISTS public.merge_duplicate_students;
DROP FUNCTION IF EXISTS public.generate_student_code;
DROP FUNCTION IF EXISTS public.audit_student_changes;

-- Hapus triggers
DROP TRIGGER IF EXISTS trigger_generate_student_code ON public.students;
DROP TRIGGER IF EXISTS trigger_audit_student_changes ON public.students;
```

## FAQ

**Q: Bagaimana jika sekolah tidak menggunakan NIK?**
A: Gunakan nomor identitas lain yang unik per siswa. Sistem ini dirancang dengan asumsi NIK wajib.

**Q: Apakah student_code bisa diubah?**
A: Tidak disarankan. Student code adalah identifier internal yang di-generate otomatis.

**Q: Apa yang terjadi jika siswa dihapus?**
A: Karena ada `ON DELETE CASCADE`, semua data terkait (orders, wadiah) akan ikut terhapus. Lebih baik gunakan soft-delete dengan mengubah `is_active = false`.

**Q: Bagaimana cara melihat audit trail?**
A: Query tabel `audit_logs` dengan filter `table_name = 'students'`.

```sql
SELECT * FROM audit_logs 
WHERE table_name = 'students' 
ORDER BY created_at DESC;
```
