# Deployment ke Cloudflare Workers (TanStack Start)

Versi 2.0 memigrasikan aplikasi dari **React + Vite SPA (react-router) + Supabase Edge Functions** menjadi **TanStack Start** yang di-deploy ke **Cloudflare Workers**. Supabase tetap dipakai untuk **Database + Auth** — hanya edge functions yang dipindah ke server routes TanStack.

## Arsitektur Baru

```
Browser (React SPA + PWA)
   │
   ├── Halaman (/, /dashboard, /pay, ...) ──► Static Assets Cloudflare (GRATIS, tidak kena kuota)
   │
   └── /api/* ──► Cloudflare Worker (TanStack Start server routes)
                     │
                     ├── Supabase (service role) — DB & Auth admin
                     └── Midtrans API — Snap token, status, webhook
```

- **SPA mode**: halaman dirender di browser (seperti sebelumnya). Shell HTML di-prerender saat build dan disajikan sebagai static asset.
- **Server routes** (`src/routes/api/*`): pengganti Supabase Edge Functions.
- **Cron Trigger**: keep-alive Supabase berjalan otomatis tiap hari jam 02:00 UTC (lihat `wrangler.jsonc` + `src/server.ts`).

## Pemetaan Edge Function → Endpoint Baru

| Edge Function (lama) | Endpoint baru | Method |
|---|---|---|
| `create-midtrans-token` | `/api/create-midtrans-token` | POST |
| `create-payment-link` | `/api/create-payment-link` | POST |
| `get-payment-info` | `/api/get-payment-info` | POST |
| `regenerate-payment` | `/api/regenerate-payment` | POST |
| `midtrans-config` | `/api/midtrans-config` | GET |
| `midtrans-webhook` | `/api/midtrans-webhook` | POST |
| `import-parents` | `/api/import-parents` | POST |
| `import-parents-link` | `/api/import-parents-link` | POST |
| `keep-alive` | `/api/keep-alive` (+ cron harian) | GET |

Frontend memanggil endpoint ini lewat helper `src/lib/serverApi.ts` (pengganti `supabase.functions.invoke`).

## Environment Variables

Ada **dua sisi** environment:

### 1. Client-side (`.env`, prefix `VITE_`, dibake saat build)

```
VITE_APP_ENV=production
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY_DEV=...
VITE_SUPABASE_ANON_KEY_PROD=...
```

### 2. Server-side (Worker vars & secrets)

| Nama | Jenis | Keterangan |
|---|---|---|
| `SUPABASE_URL` | var (`wrangler.jsonc`) | URL project Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | `wrangler secret put SUPABASE_SERVICE_ROLE_KEY` |
| `MIDTRANS_SERVER_KEY` | **secret** | `wrangler secret put MIDTRANS_SERVER_KEY` |
| `MIDTRANS_CLIENT_KEY` | var | Client key Midtrans (dikirim ke browser) |
| `MIDTRANS_IS_PRODUCTION` | var | `"true"` / `"false"` |
| `MIDTRANS_NOTIFICATION_URL` | var (opsional) | Lihat bagian webhook |

Untuk development lokal, salin `.dev.vars.example` → `.dev.vars`.

## Development Lokal

```sh
npm install
cp .env.example .env          # isi VITE_*
cp .dev.vars.example .dev.vars # isi env server
npm run dev                    # vite dev (server route jalan di workerd lokal)
```

## Build & Deploy

```sh
npx wrangler login             # sekali saja
npm run build                  # vite build (client + worker + prerender shell)
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put MIDTRANS_SERVER_KEY
npm run deploy                 # build + wrangler deploy
```

Isi dulu `vars` di `wrangler.jsonc` (`SUPABASE_URL`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION`) sebelum deploy.

Preview build production secara lokal: `npm run preview`.

## Webhook Midtrans

Akun Midtrans ini dipakai **2 aplikasi** (Laundry + Catering) dengan 1 unified webhook di dashboard. Ada dua opsi:

**Opsi A — akun hanya dipakai aplikasi ini:** ganti *Payment Notification URL* di Midtrans Dashboard (Settings → Configuration) menjadi:

```
https://<nama-worker>.<subdomain>.workers.dev/api/midtrans-webhook
```

**Opsi B — akun dipakai bersama (disarankan untuk setup saat ini):** JANGAN ganti URL dashboard. Set var `MIDTRANS_NOTIFICATION_URL` ke URL webhook Worker di atas. Setiap transaksi yang dibuat aplikasi ini akan mengirim header `X-Override-Notification`, sehingga notifikasi transaksi laundry masuk ke Worker, sementara transaksi catering tetap ke webhook lama.

## ⚠️ Limit Cloudflare Workers FREE Plan

Arsitektur ini sengaja didesain agar muat di free plan. Yang perlu diketahui:

| Limit | Free Plan | Dampak & mitigasi |
|---|---|---|
| **Request Worker** | **100.000/hari** (reset 00:00 UTC), burst 1.000/menit | Hanya `/api/*` yang kena kuota. Halaman & asset = static assets, **gratis & unlimited** (SPA mode + `not_found_handling: single-page-application`). |
| **CPU time** | **10 ms/request** | Handler API hanya JSON + fetch (I/O menunggu Midtrans/Supabase TIDAK dihitung CPU). Tidak ada SSR halaman berat. |
| **Subrequest** | **50/request** | Import orang tua dibatasi **10 parent per request** (`src/lib/import-limits.ts`) dan frontend mengirim bertahap (chunking). |
| **Ukuran Worker** | 3 MB (gzip) | Bundle worker saat ini jauh di bawah limit; cek ukuran saat `wrangler deploy`. |
| **Memory** | 128 MB | Aman untuk workload JSON. |
| **Cron Triggers** | ✔ tersedia di free plan | Keep-alive 1×/hari = 1 request/hari dari kuota. |
| **Kuota habis?** | Request `/api/*` gagal sampai reset harian | Halaman tetap tersaji (static). Jika trafik API > 100k/hari, upgrade ke Workers Paid ($5/bln: 10 juta request, 30 detik CPU). |

> Estimasi kasar: sekolah dengan ratusan transaksi/hari memakai < 1% kuota harian. Yang paling "boros" adalah import massal — sudah di-chunk otomatis.

## Keep-Alive Supabase

Supabase free tier akan pause database setelah ±7 hari tanpa aktivitas. Worker menjalankan cron `0 2 * * *` (02:00 UTC harian) yang menyentuh database (insert ke `_keep_alive_log`, fallback `select` ringan). Endpoint manual: `GET /api/keep-alive`. Cron eksternal (cron-job.org / GitHub Actions) tidak diperlukan lagi.

## PWA

`vite-plugin-pwa` diganti setup statis:

- `public/manifest.webmanifest` — manifest aplikasi
- `public/sw.js` — service worker sederhana (auto-update; `/api/*` tidak pernah di-cache)
- `src/components/pwa/UpdatePrompt.tsx` — registrasi + auto-reload saat ada versi baru

## Troubleshooting

- **500 "Environment variable X is not configured"** → var/secret belum di-set (`wrangler secret put ...` atau `vars` di `wrangler.jsonc`; lokal: `.dev.vars`).
- **401 di endpoint API** → user belum login / token Supabase expired; helper `serverApi` otomatis melampirkan access token bila ada sesi.
- **Webhook tidak masuk** → cek `npx wrangler tail` sambil test dari simulator Midtrans; pastikan opsi A/B di atas sudah dipilih.
- **Log produksi** → `npx wrangler tail` atau dashboard Cloudflare (observability sudah diaktifkan di `wrangler.jsonc`).
