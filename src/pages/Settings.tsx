import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Settings as SettingsIcon, Loader2, Sun, DollarSign } from 'lucide-react';
import { LAUNDRY_CATEGORIES } from '@/lib/constants';

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isHoliday, setIsHoliday] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('holiday_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setIsHoliday(data.is_holiday);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleHolidayToggle = async (checked: boolean) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('holiday_settings')
        .update({
          is_holiday: checked,
          updated_by: user?.id,
        })
        .eq('id', (await supabase.from('holiday_settings').select('id').single()).data?.id);

      if (error) throw error;

      setIsHoliday(checked);
      toast({
        title: 'Berhasil',
        description: `Mode ${checked ? 'Liburan' : 'Normal'} diaktifkan`,
      });
    } catch (error: any) {
      console.error('Error updating settings:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Gagal menyimpan pengaturan',
      });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pengaturan</h1>
          <p className="text-muted-foreground mt-1">
            Kelola pengaturan aplikasi
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Holiday Mode */}
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sun className="h-5 w-5 text-warning" />
                  Mode Liburan
                </CardTitle>
                <CardDescription>
                  Aktifkan mode liburan untuk mengubah perhitungan bagi hasil
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                  <div>
                    <Label htmlFor="holiday-mode" className="font-medium">
                      Mode Liburan
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {isHoliday 
                        ? 'Bagi hasil: Yayasan 20%, Vendor 80%' 
                        : 'Bagi hasil: Yayasan 100%, Vendor 0%'}
                    </p>
                  </div>
                  <Switch
                    id="holiday-mode"
                    checked={isHoliday}
                    onCheckedChange={handleHolidayToggle}
                    disabled={saving}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Price List */}
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-success" />
                  Daftar Harga
                </CardTitle>
                <CardDescription>
                  Harga satuan per kategori laundry
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(LAUNDRY_CATEGORIES).map(([key, category]) => (
                    <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <span className="font-medium">{category.label}</span>
                      <span className="text-muted-foreground">
                        {formatCurrency(category.price)} / {category.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Revenue Sharing Info */}
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SettingsIcon className="h-5 w-5 text-primary" />
                  Aturan Bagi Hasil
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/30">
                  <h4 className="font-medium mb-2">Mode Normal (Sebelum Liburan)</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Kiloan: Yayasan Rp 7.000 × berat</li>
                    <li>• Selain Kiloan: Yayasan 100%</li>
                    <li>• Vendor: 0%</li>
                  </ul>
                </div>
                <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
                  <h4 className="font-medium mb-2 text-warning">Mode Liburan</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Kiloan: Yayasan Rp 2.000 × berat, Vendor Rp 5.000 × berat</li>
                    <li>• Selain Kiloan: Yayasan 20%, Vendor 80%</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
