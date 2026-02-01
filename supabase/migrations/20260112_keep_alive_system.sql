-- ============================================
-- SUPABASE KEEP-ALIVE SYSTEM
-- Sistem untuk mencegah database auto-pause
-- ============================================

-- ============================================
-- LANGKAH 1: Buat Tabel Log (Opsional tapi direkomendasikan)
-- ============================================
CREATE TABLE IF NOT EXISTS _keep_alive_log (
    id BIGSERIAL PRIMARY KEY,
    pinged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    source TEXT DEFAULT 'cron',
    response_status INTEGER,
    response_body TEXT
);

-- Index untuk query berdasarkan waktu
CREATE INDEX IF NOT EXISTS idx_keep_alive_log_pinged_at 
ON _keep_alive_log (pinged_at DESC);

-- Fungsi untuk membersihkan log lama (simpan hanya 30 hari terakhir)
CREATE OR REPLACE FUNCTION cleanup_keep_alive_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM _keep_alive_log 
    WHERE pinged_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fungsi RPC sederhana untuk keep-alive (alternatif)
CREATE OR REPLACE FUNCTION keep_alive_ping()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    -- Insert log
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

-- ============================================
-- LANGKAH 2: Aktifkan Ekstensi pg_cron dan pg_net
-- ============================================
-- CATATAN: Ekstensi ini harus diaktifkan dari Supabase Dashboard
-- Pergi ke: Database > Extensions
-- Cari dan aktifkan: pg_cron dan pg_net

-- Atau jalankan SQL berikut (membutuhkan superuser permissions):
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Berikan akses ke postgres user
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- ============================================
-- LANGKAH 3: Jadwalkan Cron Job
-- Panggil Edge Function setiap 3 hari sekali
-- ============================================

-- Hapus job lama jika ada
SELECT cron.unschedule('keep-alive-ping') 
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'keep-alive-ping'
);

-- Buat cron job baru
-- Schedule: setiap 3 hari pada jam 03:00 UTC
-- Format cron: menit jam hari bulan hari-minggu
-- '0 3 */3 * *' = jam 03:00 setiap 3 hari

SELECT cron.schedule(
    'keep-alive-ping',           -- nama job
    '0 3 */3 * *',               -- schedule: setiap 3 hari jam 03:00 UTC
    $$
    SELECT net.http_post(
        url := 'https://ipjupfgkfqpxvcxaiupg.supabase.co/functions/v1/keep-alive',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwanVwZmdrZnFweHZjeGFpdXBnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjQ1MzI5MCwiZXhwIjoyMDgyMDI5MjkwfQ.ALBoM49Jx0jg4bRNMSlLYTJ1HKQChx7oFHQsJ19IK74'
        ),
        body := jsonb_build_object(
            'source', 'pg_cron',
            'timestamp', NOW()::TEXT
        )
    );
    $$
);

-- ============================================
-- LANGKAH 4: Alternatif - Direct Database Query (Lebih Sederhana)
-- Jika tidak ingin menggunakan Edge Function
-- ============================================

-- Cron job yang langsung query database tanpa Edge Function
SELECT cron.schedule(
    'keep-alive-direct',         -- nama job
    '0 3 */3 * *',               -- schedule: setiap 3 hari jam 03:00 UTC
    $$
    INSERT INTO _keep_alive_log (pinged_at, source)
    VALUES (NOW(), 'pg_cron_direct');
    
    -- Cleanup log lama
    DELETE FROM _keep_alive_log 
    WHERE pinged_at < NOW() - INTERVAL '30 days';
    $$
);

-- ============================================
-- QUERY UNTUK VERIFIKASI
-- ============================================

-- Lihat semua cron jobs yang terjadwal
SELECT * FROM cron.job;

-- Lihat history eksekusi cron
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 10;

-- Lihat log keep-alive
SELECT * FROM _keep_alive_log 
ORDER BY pinged_at DESC 
LIMIT 10;

-- ============================================
-- CATATAN PENTING
-- ============================================
-- 1. Ganti YOUR_PROJECT_REF dengan project reference Anda
--    Contoh: xyzabc123
--    URL menjadi: https://xyzabc123.supabase.co/functions/v1/keep-alive
--
-- 2. Ganti YOUR_SUPABASE_SERVICE_ROLE_KEY dengan Service Role Key Anda
--    Dapatkan dari: Settings > API > service_role key
--
-- 3. JANGAN gunakan anon key untuk cron job karena RLS akan aktif
--
-- 4. Untuk keamanan lebih baik, simpan Service Role Key sebagai
--    Vault Secret (lihat instruksi di bawah)
