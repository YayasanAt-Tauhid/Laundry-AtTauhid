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

Proyek ini dibangun dengan (v2.0 — migrasi ke TanStack Start + Cloudflare Workers):

- 🚀 **TanStack Start** - Full-stack React framework (routing + server routes)
- ☁️ **Cloudflare Workers** - Hosting & API (menggantikan Supabase Edge Functions)
- ⚡ **Vite** - Build tool yang cepat
- 📘 **TypeScript** - Type-safe JavaScript
- ⚛️ **React** - UI Library
- 🎨 **shadcn/ui** - Komponen UI modern
- 🎯 **Tailwind CSS** - Utility-first CSS framework
- 🗄️ **Supabase** - Database & Auth (edge functions sudah dipindah ke server routes)

📖 Panduan deploy + limit free plan Cloudflare: [docs/CLOUDFLARE_DEPLOYMENT.md](docs/CLOUDFLARE_DEPLOYMENT.md)

## Memulai Pengembangan

Pastikan Anda sudah menginstall Node.js & npm - [install dengan nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

```sh
# Clone repository
git clone https://github.com/YayasanAt-Tauhid/Laundry-AtTauhid.git

# Masuk ke direktori proyek
cd Laundry-AtTauhid

# Install dependencies
npm install

# Siapkan environment
cp .env.example .env            # variabel client (VITE_*)
cp .dev.vars.example .dev.vars  # variabel server (Supabase service key, Midtrans)

# Jalankan development server
npm run dev
```

Deploy ke Cloudflare Workers:

```sh
npm run deploy
```

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
├── pages/          # Halaman aplikasi
├── routes/         # Route TanStack (halaman + /api server routes)
├── server/         # Utilitas server (Supabase admin, Midtrans, auth)
└── server.ts       # Entry Cloudflare Worker (fetch + cron keep-alive)
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