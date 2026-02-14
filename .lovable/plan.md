

# Perbaikan: Parent Tidak Bisa Mengklaim Siswa yang Sudah Ada

## Masalah

Ketika parent memasukkan NIK yang sudah ada di database dan siswa tersebut belum memiliki parent (bisa diklaim), sistem menampilkan pesan bahwa siswa bisa diklaim. Namun, ketika parent mencoba submit form atau mengklik tombol klaim, fungsi `handleSubmit` memblokir aksi tersebut karena ada pengecekan:

```text
if (nikAvailable === false) {
    // LANGSUNG DITOLAK - tidak peduli apakah bisa diklaim atau tidak
    toast({ title: "NIK Tidak Tersedia" });
    return;
}
```

Ini berarti fitur klaim tidak akan pernah bisa berjalan karena submit form selalu diblokir lebih dulu.

## Solusi

Mengubah logika validasi di `handleSubmit` agar mengizinkan proses ketika siswa bisa diklaim (`canClaimStudent === true`), dan langsung menjalankan proses klaim alih-alih membuat siswa baru.

## Langkah Implementasi

### 1. Ubah validasi NIK di `handleSubmit`

Pada file `src/pages/Students.tsx`, ubah pengecekan NIK availability agar membolehkan klaim:

- Jika `nikAvailable === false` DAN `canClaimStudent === true`: langsung panggil `handleClaimStudent()` dan return (jangan blokir)
- Jika `nikAvailable === false` DAN `canClaimStudent === false`: tetap blokir seperti sekarang (NIK memang tidak tersedia)

### 2. Pastikan flow klaim berjalan mulus

- Setelah klaim berhasil, tutup dialog form
- Refresh daftar siswa
- Tampilkan pesan sukses

## Detail Teknis

Perubahan hanya pada satu file: `src/pages/Students.tsx`

Bagian yang diubah (sekitar baris 309-317):

**Sebelum:**
```typescript
// Check if NIK is available
if (nikAvailable === false) {
  toast({
    variant: "destructive",
    title: "NIK Tidak Tersedia",
    description: nikError || "NIK sudah digunakan oleh siswa lain",
  });
  return;
}
```

**Sesudah:**
```typescript
// Check if NIK is available
if (nikAvailable === false) {
  if (canClaimStudent && existingNikStudent) {
    // NIK exists but student has no parent - proceed with claim
    await handleClaimStudent();
    return;
  }
  toast({
    variant: "destructive",
    title: "NIK Tidak Tersedia",
    description: nikError || "NIK sudah digunakan oleh siswa lain",
  });
  return;
}
```

Perubahan ini sangat kecil dan terfokus - hanya menambahkan pengecekan `canClaimStudent` sebelum memblokir submit form.

