-- Add customizable revenue sharing columns to holiday_settings table
ALTER TABLE public.holiday_settings 
ADD COLUMN IF NOT EXISTS kiloan_yayasan_per_kg INTEGER NOT NULL DEFAULT 2000,
ADD COLUMN IF NOT EXISTS kiloan_vendor_per_kg INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN IF NOT EXISTS non_kiloan_yayasan_percent DECIMAL(5,2) NOT NULL DEFAULT 20.00,
ADD COLUMN IF NOT EXISTS non_kiloan_vendor_percent DECIMAL(5,2) NOT NULL DEFAULT 80.00;

-- Add comment for clarity
COMMENT ON COLUMN public.holiday_settings.kiloan_yayasan_per_kg IS 'Harga per kg untuk Yayasan pada kategori kiloan';
COMMENT ON COLUMN public.holiday_settings.kiloan_vendor_per_kg IS 'Harga per kg untuk Vendor pada kategori kiloan';
COMMENT ON COLUMN public.holiday_settings.non_kiloan_yayasan_percent IS 'Persentase bagi hasil Yayasan untuk non-kiloan (0-100)';
COMMENT ON COLUMN public.holiday_settings.non_kiloan_vendor_percent IS 'Persentase bagi hasil Vendor untuk non-kiloan (0-100)';
