## At-Tauhid Laundry

🧺 **Sistem Manajemen Laundry Sekolah**

Aplikasi manajemen laundry untuk sekolah yang dikembangkan oleh Yayasan At-Tauhid. Aplikasi ini membantu mengelola layanan laundry siswa secara efisien, mulai dari input order, tracking status, hingga pembayaran.

## Fitur Utama

- 📋 **Manajemen Order** - Input dan tracking order laundry siswa
- 👨‍🎓 **Data Siswa** - Kelola data siswa dan kelas
- 🏢 **Mitra Laundry** - Kelola mitra vendor laundry
- 💰 **POS Kasir** - Sistem kasir untuk pembayaran
- 📊 **Laporan** - Laporan pembayaran dan statistik
- 📥 **Import/Export Data** - Migrasi data dari sistem lain
- 👥 **Multi-Role** - Admin, Staff, Kasir, Orang Tua, Mitra

## Teknologi

Proyek ini dibangun dengan:

- ⚡ **Vite** - Build tool yang cepat
- 📘 **TypeScript** - Type-safe JavaScript
- ⚛️ **React** - UI Library
- 🎨 **shadcn/ui** - Komponen UI modern
- 🎯 **Tailwind CSS** - Utility-first CSS framework
- 🗄️ **Supabase** - Backend as a Service (Database, Auth, Storage)

## Memulai Pengembangan

Pastikan Anda sudah menginstall Node.js & npm - [install dengan nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

```sh
# Clone repository
git clone https://github.com/YayasanAt-Tauhid/Laundry-AtTauhid.git

# Masuk ke direktori proyek
cd Laundry-AtTauhid

# Install dependencies
npm install

# Jalankan development server
npm run dev
```

Aplikasi akan berjalan di `http://localhost:5173`

## Struktur Proyek

```
src/
├── components/     # Komponen React
│   ├── auth/       # Komponen autentikasi
│   ├── dashboard/  # Komponen dashboard
│   ├── import/     # Komponen import data
│   ├── layout/     # Layout komponen
│   └── ui/         # UI komponen (shadcn)
├── hooks/          # Custom React hooks
├── integrations/   # Integrasi Supabase
├── lib/            # Utilitas dan konstanta
└── pages/          # Halaman aplikasi
```

## Role Pengguna

| Role | Deskripsi |
|------|-----------|
| Admin | Akses penuh ke semua fitur |
| Staff | Input order dan kelola data laundry |
| Kasir | Proses pembayaran dan laporan kasir |
| Orang Tua | Lihat tagihan dan data anak |
| Mitra | Kelola order yang diterima |

## Kontribusi

Kontribusi selalu diterima! Silakan buat issue atau pull request untuk perbaikan dan fitur baru.

## Lisensi

© 2024 Yayasan At-Tauhid. All rights reserved.