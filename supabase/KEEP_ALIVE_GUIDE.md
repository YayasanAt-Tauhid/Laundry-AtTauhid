# 🔄 Supabase Keep-Alive System

Sistem untuk mencegah database Supabase di-pause secara otomatis dengan melakukan query ringan setiap 3 hari.

## 📋 Daftar Isi

1. [Pendahuluan](#pendahuluan)
2. [Komponen Sistem](#komponen-sistem)
3. [Langkah Instalasi](#langkah-instalasi)
4. [Keamanan Service Role Key](#keamanan-service-role-key)
5. [Monitoring](#monitoring)
6. [Troubleshooting](#troubleshooting)

---

## 📖 Pendahuluan

Supabase Free Tier akan mem-pause database yang tidak aktif selama 7 hari. Sistem keep-alive ini mencegah hal tersebut dengan:

- Menjadwalkan ping otomatis setiap 3 hari
- Mencatat aktivitas ke tabel log
- Membersihkan log lama secara otomatis

---

## 🧩 Komponen Sistem

### 1. Edge Function (`keep-alive`)
- Lokasi: `supabase/functions/keep-alive/index.ts`
- Fungsi: Menerima HTTP request dan melakukan query ke database
- Mencatat waktu ping ke tabel `_keep_alive_log`

### 2. SQL Migration
- Lokasi: `supabase/migrations/20260112_keep_alive_system.sql`
- Berisi:
  - Tabel `_keep_alive_log` untuk logging
  - Fungsi `keep_alive_ping()` untuk RPC
  - Ekstensi `pg_cron` dan `pg_net`
  - Cron job terjadwal

---

## 🚀 Langkah Instalasi

### Langkah 1: Aktifkan Ekstensi

1. Buka **Supabase Dashboard** → **Database** → **Extensions**
2. Cari dan aktifkan:
   - ✅ `pg_cron` - untuk scheduling
   - ✅ `pg_net` - untuk HTTP requests

### Langkah 2: Jalankan SQL Migration

Buka **SQL Editor** di Supabase Dashboard dan jalankan:

```sql
-- Buat tabel log
CREATE TABLE IF NOT EXISTS _keep_alive_log (
    id BIGSERIAL PRIMARY KEY,
    pinged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    source TEXT DEFAULT 'cron',
    response_status INTEGER,
    response_body TEXT
);

-- Index untuk performa
CREATE INDEX IF NOT EXISTS idx_keep_alive_log_pinged_at 
ON _keep_alive_log (pinged_at DESC);

-- Fungsi RPC
CREATE OR REPLACE FUNCTION keep_alive_ping()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    INSERT INTO _keep_alive_log (pinged_at, source)
    VALUES (NOW(), 'rpc')
    RETURNING jsonb_build_object(
        'id', id,
        'pinged_at', pinged_at,
        'source', source
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Langkah 3: Deploy Edge Function

```bash
# Login ke Supabase CLI
supabase login

# Link ke project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy function
supabase functions deploy keep-alive
```

### Langkah 4: Setup Cron Job

Ganti placeholder dan jalankan di SQL Editor:

```sql
SELECT cron.schedule(
    'keep-alive-ping',
    '0 3 */3 * *',  -- Setiap 3 hari jam 03:00 UTC
    $$
    SELECT net.http_post(
        url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/keep-alive',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
        ),
        body := jsonb_build_object(
            'source', 'pg_cron',
            'timestamp', NOW()::TEXT
        )
    );
    $$
);
```

**Ganti:**
- `YOUR_PROJECT_REF` → Project reference Anda (contoh: `xyzabc123`)
- `YOUR_SERVICE_ROLE_KEY` → Service Role Key dari Settings > API

---

## 🔐 Keamanan Service Role Key

### ⚠️ PENTING: Service Role Key memberikan akses PENUH ke database!

### Metode 1: Vault Secret (Direkomendasikan)

```sql
-- Simpan key ke Vault
SELECT vault.create_secret(
    'supabase_service_key',
    'YOUR_SERVICE_ROLE_KEY',
    'Service role key for keep-alive cron'
);

-- Gunakan dalam cron job
SELECT cron.schedule(
    'keep-alive-ping-secure',
    '0 3 */3 * *',
    $$
    SELECT net.http_post(
        url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/keep-alive',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                SELECT decrypted_secret 
                FROM vault.decrypted_secrets 
                WHERE name = 'supabase_service_key'
            )
        ),
        body := jsonb_build_object('source', 'pg_cron')
    );
    $$
);
```

### Metode 2: Direct Query (Tanpa Edge Function)

Lebih aman karena tidak membutuhkan Service Role Key:

```sql
SELECT cron.schedule(
    'keep-alive-direct',
    '0 3 */3 * *',
    $$
    INSERT INTO _keep_alive_log (pinged_at, source)
    VALUES (NOW(), 'pg_cron_direct');
    
    -- Cleanup
    DELETE FROM _keep_alive_log 
    WHERE pinged_at < NOW() - INTERVAL '30 days';
    $$
);
```

### Metode 3: Environment Variables di Edge Function

Service Role Key sudah otomatis tersedia di Edge Function sebagai:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Anda **tidak perlu** menambahkan key secara manual. Supabase otomatis meng-inject environment variables ini.

---

## 📊 Monitoring

### Cek Cron Jobs Aktif

```sql
SELECT jobid, jobname, schedule, command 
FROM cron.job;
```

### Cek History Eksekusi

```sql
SELECT 
    jobid,
    runid,
    job_pid,
    status,
    start_time,
    end_time
FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 20;
```

### Cek Log Keep-Alive

```sql
SELECT * FROM _keep_alive_log 
ORDER BY pinged_at DESC 
LIMIT 10;
```

---

## 🔧 Troubleshooting

### Error: Extension not available

Pastikan ekstensi sudah diaktifkan dari Dashboard:
- Database → Extensions → Cari `pg_cron` dan `pg_net`

### Error: Permission denied

```sql
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;
```

### Cron job tidak berjalan

1. Periksa schedule format: `menit jam hari bulan hari-minggu`
2. Cek `cron.job_run_details` untuk error messages
3. Pastikan `pg_cron` extension aktif

### Test Manual Edge Function

```bash
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/keep-alive' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"source": "manual_test"}'
```

---

## 📅 Schedule Reference

| Schedule | Penjelasan |
|----------|------------|
| `0 3 */3 * *` | Setiap 3 hari jam 03:00 UTC |
| `0 0 */2 * *` | Setiap 2 hari jam 00:00 UTC |
| `0 12 * * 0` | Setiap Minggu jam 12:00 UTC |
| `0 0 1 * *` | Setiap tanggal 1 jam 00:00 UTC |

---

## ✅ Checklist Instalasi

- [ ] Aktifkan ekstensi `pg_cron`
- [ ] Aktifkan ekstensi `pg_net`
- [ ] Buat tabel `_keep_alive_log`
- [ ] Deploy Edge Function
- [ ] Setup cron job
- [ ] Test manual ping
- [ ] Verifikasi cron job terjadwal

---

*Dokumentasi ini dibuat pada: 12 Januari 2026*
