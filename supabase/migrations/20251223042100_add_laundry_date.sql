-- Add laundry_date column to laundry_orders table
ALTER TABLE public.laundry_orders 
ADD COLUMN laundry_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Add comment to describe the column
COMMENT ON COLUMN public.laundry_orders.laundry_date IS 'Tanggal siswa mengikuti laundry';
