import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Settings as SettingsIcon, Loader2, DollarSign, Save, Percent } from 'lucide-react';
import { LAUNDRY_CATEGORIES } from '@/lib/constants';

interface RevenueConfig {
  kiloan_yayasan_per_kg: number;
  kiloan_vendor_per_kg: number;
  non_kiloan_yayasan_percent: number;
  non_kiloan_vendor_percent: number;
}

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  // Revenue sharing config
  const [revenueConfig, setRevenueConfig] = useState<RevenueConfig>({
    kiloan_yayasan_per_kg: 2000,
    kiloan_vendor_per_kg: 5000,
    non_kiloan_yayasan_percent: 20,
    non_kiloan_vendor_percent: 80,
  });

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
        setSettingsId(data.id);
        setRevenueConfig({
          kiloan_yayasan_per_kg: data.kiloan_yayasan_per_kg ?? 2000,
          kiloan_vendor_per_kg: data.kiloan_vendor_per_kg ?? 5000,
          non_kiloan_yayasan_percent: data.non_kiloan_yayasan_percent ?? 20,
          non_kiloan_vendor_percent: data.non_kiloan_vendor_percent ?? 80,
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRevenueConfig = async () => {
    // Validate percentages
    if (revenueConfig.non_kiloan_yayasan_percent + revenueConfig.non_kiloan_vendor_percent !== 100) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Total persentase Yayasan dan Vendor harus 100%',
      });
      return;
    }

    setSavingConfig(true);
    try {
      const { error } = await supabase
        .from('holiday_settings')
        .update({
          kiloan_yayasan_per_kg: revenueConfig.kiloan_yayasan_per_kg,
          kiloan_vendor_per_kg: revenueConfig.kiloan_vendor_per_kg,
          non_kiloan_yayasan_percent: revenueConfig.non_kiloan_yayasan_percent,
          non_kiloan_vendor_percent: revenueConfig.non_kiloan_vendor_percent,
          updated_by: user?.id,
        })
        .eq('id', settingsId);

      if (error) throw error;

      toast({
        title: 'Berhasil',
        description: 'Pengaturan bagi hasil berhasil disimpan',
      });
    } catch (error: any) {
      console.error('Error saving revenue config:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Gagal menyimpan pengaturan',
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleYayasanPercentChange = (value: number) => {
    setRevenueConfig({
      ...revenueConfig,
      non_kiloan_yayasan_percent: value,
      non_kiloan_vendor_percent: 100 - value,
    });
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
            {/* Revenue Sharing Config */}
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-5 w-5 text-primary" />
                  Konfigurasi Bagi Hasil
                </CardTitle>
                <CardDescription>
                  Atur pembagian hasil antara Yayasan dan Vendor
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Kiloan Section */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-4">
                  <h4 className="font-medium text-foreground">Kategori Kiloan</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="kiloan-yayasan">Yayasan (per kg)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Rp</span>
                        <Input
                          id="kiloan-yayasan"
                          type="number"
                          min="0"
                          value={revenueConfig.kiloan_yayasan_per_kg}
                          onChange={(e) => setRevenueConfig({
                            ...revenueConfig,
                            kiloan_yayasan_per_kg: parseInt(e.target.value) || 0,
                          })}
                          className="pl-10"
                          placeholder="2000"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="kiloan-vendor">Vendor (per kg)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Rp</span>
                        <Input
                          id="kiloan-vendor"
                          type="number"
                          min="0"
                          value={revenueConfig.kiloan_vendor_per_kg}
                          onChange={(e) => setRevenueConfig({
                            ...revenueConfig,
                            kiloan_vendor_per_kg: parseInt(e.target.value) || 0,
                          })}
                          className="pl-10"
                          placeholder="5000"
                        />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Total: {formatCurrency(revenueConfig.kiloan_yayasan_per_kg + revenueConfig.kiloan_vendor_per_kg)} per kg
                  </p>
                </div>

                {/* Non-Kiloan Section */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-4">
                  <h4 className="font-medium text-foreground">Selain Kiloan (Persentase)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="non-kiloan-yayasan">Yayasan (%)</Label>
                      <div className="relative">
                        <Input
                          id="non-kiloan-yayasan"
                          type="number"
                          min="0"
                          max="100"
                          value={revenueConfig.non_kiloan_yayasan_percent}
                          onChange={(e) => handleYayasanPercentChange(parseFloat(e.target.value) || 0)}
                          className="pr-8"
                          placeholder="20"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="non-kiloan-vendor">Vendor (%)</Label>
                      <div className="relative">
                        <Input
                          id="non-kiloan-vendor"
                          type="number"
                          min="0"
                          max="100"
                          value={revenueConfig.non_kiloan_vendor_percent}
                          onChange={(e) => setRevenueConfig({
                            ...revenueConfig,
                            non_kiloan_vendor_percent: parseFloat(e.target.value) || 0,
                            non_kiloan_yayasan_percent: 100 - (parseFloat(e.target.value) || 0),
                          })}
                          className="pr-8"
                          placeholder="80"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                      </div>
                    </div>
                  </div>
                  <p className={`text-xs ${revenueConfig.non_kiloan_yayasan_percent + revenueConfig.non_kiloan_vendor_percent !== 100 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    Total: {revenueConfig.non_kiloan_yayasan_percent + revenueConfig.non_kiloan_vendor_percent}%
                    {revenueConfig.non_kiloan_yayasan_percent + revenueConfig.non_kiloan_vendor_percent !== 100 && ' (harus 100%)'}
                  </p>
                </div>

                {/* Save Button */}
                <Button
                  onClick={handleSaveRevenueConfig}
                  disabled={savingConfig}
                  className="w-full"
                >
                  {savingConfig ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Simpan Pengaturan Bagi Hasil
                </Button>
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
                  Ringkasan Bagi Hasil
                </CardTitle>
                <CardDescription>
                  Pembagian hasil saat ini
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <h4 className="font-medium mb-3 text-primary">Pembagian Hasil Aktif</h4>
                  <ul className="text-sm space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-primary font-bold">•</span>
                      <div>
                        <span className="font-medium">Kiloan:</span>
                        <span className="text-muted-foreground ml-1">
                          Yayasan {formatCurrency(revenueConfig.kiloan_yayasan_per_kg)} × berat,
                          Vendor {formatCurrency(revenueConfig.kiloan_vendor_per_kg)} × berat
                        </span>
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary font-bold">•</span>
                      <div>
                        <span className="font-medium">Selain Kiloan:</span>
                        <span className="text-muted-foreground ml-1">
                          Yayasan {revenueConfig.non_kiloan_yayasan_percent}%,
                          Vendor {revenueConfig.non_kiloan_vendor_percent}%
                        </span>
                      </div>
                    </li>
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
