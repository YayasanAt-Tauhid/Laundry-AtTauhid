import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Settings as SettingsIcon,
  Loader2,
  DollarSign,
  Save,
  Percent,
  BookOpen,
  Wallet,
  ArrowDown,
  Calculator,
  Info,
  CreditCard,
} from "lucide-react";
import { LAUNDRY_CATEGORIES } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tables, Enums } from "@/integrations/supabase/types";

type RoundingPolicy = Enums<"rounding_policy">;
type RoundingSettings = Tables<"rounding_settings">;

interface RevenueConfig {
  kiloan_yayasan_per_kg: number;
  kiloan_vendor_per_kg: number;
  non_kiloan_yayasan_percent: number;
  non_kiloan_vendor_percent: number;
}

const ROUNDING_POLICY_OPTIONS: {
  value: RoundingPolicy;
  label: string;
  description: string;
}[] = [
  {
    value: "none",
    label: "Tidak Ada Pembulatan",
    description:
      "Tagihan tidak dibulatkan, pelanggan bayar sesuai nominal asli",
  },
  {
    value: "round_down",
    label: "Bulatkan Ke Bawah (Sedekah)",
    description:
      "Pembulatan ke bawah sebagai sedekah/diskon dari yayasan - DIANJURKAN (Sunnah)",
  },
  {
    value: "round_up_ask",
    label: "Bulatkan Ke Atas (Minta Izin)",
    description:
      "Pembulatan ke atas dengan meminta izin pelanggan terlebih dahulu",
  },
  {
    value: "to_wadiah",
    label: "Simpan ke Saldo Wadiah",
    description:
      "Sisa kembalian otomatis disimpan sebagai saldo wadiah untuk transaksi berikutnya",
  },
];

const ROUNDING_MULTIPLE_OPTIONS = [
  { value: 100, label: "Rp 100" },
  { value: 500, label: "Rp 500" },
  { value: 1000, label: "Rp 1.000" },
  { value: 5000, label: "Rp 5.000" },
];

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingRounding, setSavingRounding] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  // Revenue sharing config
  const [revenueConfig, setRevenueConfig] = useState<RevenueConfig>({
    kiloan_yayasan_per_kg: 2000,
    kiloan_vendor_per_kg: 5000,
    non_kiloan_yayasan_percent: 20,
    non_kiloan_vendor_percent: 80,
  });

  // Syariah Rounding settings
  const [roundingSettings, setRoundingSettings] = useState<
    Partial<RoundingSettings>
  >({
    default_policy: "round_down",
    rounding_multiple: 500,
    wadiah_enabled: true,
    minimum_usage_balance: 0,
    policy_info_text:
      "Sesuai prinsip syariah, pembulatan ke bawah dianggap sebagai sedekah/diskon dari kami untuk Anda. Sisa kembalian dapat disimpan sebagai saldo (wadiah) untuk transaksi berikutnya. Semua transaksi didasarkan atas kerelaan kedua belah pihak (antaradin).",
    show_policy_at_start: true,
    parent_online_payment_enabled: true,
  });
  const [roundingSettingsId, setRoundingSettingsId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    fetchSettings();
    fetchRoundingSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("holiday_settings")
        .select("*")
        .single();

      if (error && error.code !== "PGRST116") throw error;

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
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoundingSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("rounding_settings")
        .select("*")
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setRoundingSettingsId(data.id);
        setRoundingSettings({
          default_policy: data.default_policy,
          rounding_multiple: data.rounding_multiple,
          wadiah_enabled: data.wadiah_enabled,
          minimum_usage_balance: data.minimum_usage_balance,
          policy_info_text: data.policy_info_text,
          show_policy_at_start: data.show_policy_at_start,
          parent_online_payment_enabled:
            data.parent_online_payment_enabled ?? true,
        });
      }
    } catch (error) {
      console.error("Error fetching rounding settings:", error);
    }
  };

  const handleSaveRevenueConfig = async () => {
    // Validate percentages
    if (
      revenueConfig.non_kiloan_yayasan_percent +
        revenueConfig.non_kiloan_vendor_percent !==
      100
    ) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Total persentase Yayasan dan Vendor harus 100%",
      });
      return;
    }

    setSavingConfig(true);
    try {
      const { error } = await supabase
        .from("holiday_settings")
        .update({
          kiloan_yayasan_per_kg: revenueConfig.kiloan_yayasan_per_kg,
          kiloan_vendor_per_kg: revenueConfig.kiloan_vendor_per_kg,
          non_kiloan_yayasan_percent: revenueConfig.non_kiloan_yayasan_percent,
          non_kiloan_vendor_percent: revenueConfig.non_kiloan_vendor_percent,
          updated_by: user?.id,
        })
        .eq("id", settingsId);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: "Pengaturan bagi hasil berhasil disimpan",
      });
    } catch (error: any) {
      console.error("Error saving revenue config:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Gagal menyimpan pengaturan",
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveRoundingSettings = async () => {
    setSavingRounding(true);
    try {
      if (roundingSettingsId) {
        // Update existing
        const { error } = await supabase
          .from("rounding_settings")
          .update({
            default_policy: roundingSettings.default_policy,
            rounding_multiple: roundingSettings.rounding_multiple,
            wadiah_enabled: roundingSettings.wadiah_enabled,
            minimum_usage_balance: roundingSettings.minimum_usage_balance,
            policy_info_text: roundingSettings.policy_info_text,
            show_policy_at_start: roundingSettings.show_policy_at_start,
            parent_online_payment_enabled:
              roundingSettings.parent_online_payment_enabled,
            updated_at: new Date().toISOString(),
            updated_by: user?.id,
          })
          .eq("id", roundingSettingsId);

        if (error) throw error;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from("rounding_settings")
          .insert({
            default_policy: roundingSettings.default_policy,
            rounding_multiple: roundingSettings.rounding_multiple,
            wadiah_enabled: roundingSettings.wadiah_enabled,
            minimum_usage_balance: roundingSettings.minimum_usage_balance,
            policy_info_text: roundingSettings.policy_info_text,
            show_policy_at_start: roundingSettings.show_policy_at_start,
            parent_online_payment_enabled:
              roundingSettings.parent_online_payment_enabled,
            updated_by: user?.id,
          })
          .select()
          .single();

        if (error) throw error;
        if (data) setRoundingSettingsId(data.id);
      }

      toast({
        title: "Berhasil",
        description: "Pengaturan pembulatan syariah berhasil disimpan",
      });
    } catch (error: any) {
      console.error("Error saving rounding settings:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Gagal menyimpan pengaturan pembulatan",
      });
    } finally {
      setSavingRounding(false);
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
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pengaturan</h1>
          <p className="text-muted-foreground mt-1">
            Kelola pengaturan aplikasi dan kebijakan syariah
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Syariah Rounding Settings */}
            <Card className="dashboard-card border-emerald-200 dark:border-emerald-800">
              <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 rounded-t-lg">
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-emerald-600" />
                  Pengaturan Pembulatan Syariah
                  <Badge
                    variant="secondary"
                    className="ml-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                  >
                    Syariah
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Konfigurasi kebijakan pembulatan dan sistem wadiah sesuai
                  prinsip syariah
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                {/* Default Rounding Policy */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="rounding-policy" className="font-medium">
                      Kebijakan Pembulatan Default
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>
                            Pembulatan ke bawah dianjurkan (sunnah) karena
                            dianggap sebagai sedekah. Pembulatan ke atas wajib
                            minta izin pelanggan.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Select
                    value={roundingSettings.default_policy}
                    onValueChange={(value) =>
                      setRoundingSettings({
                        ...roundingSettings,
                        default_policy: value as RoundingPolicy,
                      })
                    }
                  >
                    <SelectTrigger id="rounding-policy">
                      <SelectValue placeholder="Pilih kebijakan pembulatan" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROUNDING_POLICY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex flex-col">
                            <span className="font-medium">{option.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {roundingSettings.default_policy === "round_down" && (
                    <p className="text-sm text-emerald-600 flex items-center gap-1">
                      <ArrowDown className="h-4 w-4" />
                      Pembulatan ke bawah = sedekah dari yayasan untuk pelanggan
                      ❤️
                    </p>
                  )}
                </div>

                {/* Rounding Multiple */}
                <div className="space-y-3">
                  <Label htmlFor="rounding-multiple" className="font-medium">
                    Kelipatan Pembulatan
                  </Label>
                  <Select
                    value={roundingSettings.rounding_multiple?.toString()}
                    onValueChange={(value) =>
                      setRoundingSettings({
                        ...roundingSettings,
                        rounding_multiple: parseInt(value),
                      })
                    }
                  >
                    <SelectTrigger id="rounding-multiple">
                      <SelectValue placeholder="Pilih kelipatan" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROUNDING_MULTIPLE_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value.toString()}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Contoh: Tagihan Rp 7.300 dibulatkan menjadi Rp 7.000 (hemat
                    Rp 300)
                  </p>
                </div>

                <Separator />

                {/* Wadiah Settings */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-amber-600" />
                    <h4 className="font-medium">Sistem Wadiah (Titipan)</h4>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                    <div>
                      <Label htmlFor="wadiah-enabled" className="font-medium">
                        Aktifkan Sistem Wadiah
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Pelanggan dapat menyimpan sisa kembalian sebagai saldo
                        untuk transaksi berikutnya
                      </p>
                    </div>
                    <Switch
                      id="wadiah-enabled"
                      checked={roundingSettings.wadiah_enabled}
                      onCheckedChange={(checked) =>
                        setRoundingSettings({
                          ...roundingSettings,
                          wadiah_enabled: checked,
                        })
                      }
                    />
                  </div>

                  {roundingSettings.wadiah_enabled && (
                    <div className="space-y-2">
                      <Label htmlFor="min-balance">
                        Minimum Saldo untuk Penggunaan
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          Rp
                        </span>
                        <Input
                          id="min-balance"
                          type="number"
                          min="0"
                          value={roundingSettings.minimum_usage_balance}
                          onChange={(e) =>
                            setRoundingSettings({
                              ...roundingSettings,
                              minimum_usage_balance:
                                parseInt(e.target.value) || 0,
                            })
                          }
                          className="pl-10"
                          placeholder="0"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Saldo minimum yang harus dimiliki sebelum bisa digunakan
                        untuk pembayaran (0 = tanpa minimum)
                      </p>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Parent Online Payment Settings */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-blue-600" />
                    <h4 className="font-medium">Pembayaran Online Parent</h4>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                    <div>
                      <Label
                        htmlFor="parent-online-payment"
                        className="font-medium"
                      >
                        Aktifkan Pembayaran Online untuk Parent
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Jika dinonaktifkan, parent tidak bisa bayar online
                        (QRIS/E-Wallet) dan harus bayar melalui kasir
                      </p>
                    </div>
                    <Switch
                      id="parent-online-payment"
                      checked={roundingSettings.parent_online_payment_enabled}
                      onCheckedChange={(checked) =>
                        setRoundingSettings({
                          ...roundingSettings,
                          parent_online_payment_enabled: checked,
                        })
                      }
                    />
                  </div>

                  {!roundingSettings.parent_online_payment_enabled && (
                    <p className="text-sm text-amber-600 flex items-center gap-1">
                      <Info className="h-4 w-4" />
                      Parent hanya bisa melihat tagihan, pembayaran dilakukan
                      melalui kasir
                    </p>
                  )}
                </div>

                <Separator />

                {/* Policy Display Settings */}
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-primary" />
                    Tampilan Kebijakan
                  </h4>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                    <div>
                      <Label htmlFor="show-policy" className="font-medium">
                        Tampilkan Info Kebijakan
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Tampilkan banner informasi kebijakan syariah di halaman
                        kasir
                      </p>
                    </div>
                    <Switch
                      id="show-policy"
                      checked={roundingSettings.show_policy_at_start}
                      onCheckedChange={(checked) =>
                        setRoundingSettings({
                          ...roundingSettings,
                          show_policy_at_start: checked,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="policy-text">Teks Kebijakan Syariah</Label>
                    <Textarea
                      id="policy-text"
                      value={roundingSettings.policy_info_text}
                      onChange={(e) =>
                        setRoundingSettings({
                          ...roundingSettings,
                          policy_info_text: e.target.value,
                        })
                      }
                      rows={4}
                      placeholder="Masukkan teks kebijakan yang akan ditampilkan..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Teks ini akan ditampilkan kepada pelanggan sebagai
                      informasi transparansi
                    </p>
                  </div>
                </div>

                {/* Save Button */}
                <Button
                  onClick={handleSaveRoundingSettings}
                  disabled={savingRounding}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {savingRounding ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Simpan Pengaturan Syariah
                </Button>
              </CardContent>
            </Card>

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
                  <h4 className="font-medium text-foreground">
                    Kategori Kiloan
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="kiloan-yayasan">Yayasan (per kg)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          Rp
                        </span>
                        <Input
                          id="kiloan-yayasan"
                          type="number"
                          min="0"
                          value={revenueConfig.kiloan_yayasan_per_kg}
                          onChange={(e) =>
                            setRevenueConfig({
                              ...revenueConfig,
                              kiloan_yayasan_per_kg:
                                parseInt(e.target.value) || 0,
                            })
                          }
                          className="pl-10"
                          placeholder="2000"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="kiloan-vendor">Vendor (per kg)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          Rp
                        </span>
                        <Input
                          id="kiloan-vendor"
                          type="number"
                          min="0"
                          value={revenueConfig.kiloan_vendor_per_kg}
                          onChange={(e) =>
                            setRevenueConfig({
                              ...revenueConfig,
                              kiloan_vendor_per_kg:
                                parseInt(e.target.value) || 0,
                            })
                          }
                          className="pl-10"
                          placeholder="5000"
                        />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Total:{" "}
                    {formatCurrency(
                      revenueConfig.kiloan_yayasan_per_kg +
                        revenueConfig.kiloan_vendor_per_kg,
                    )}{" "}
                    per kg
                  </p>
                </div>

                {/* Non-Kiloan Section */}
                <div className="p-4 rounded-lg bg-muted/30 space-y-4">
                  <h4 className="font-medium text-foreground">
                    Selain Kiloan (Persentase)
                  </h4>
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
                          onChange={(e) =>
                            handleYayasanPercentChange(
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="pr-8"
                          placeholder="20"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          %
                        </span>
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
                          onChange={(e) =>
                            setRevenueConfig({
                              ...revenueConfig,
                              non_kiloan_vendor_percent:
                                parseFloat(e.target.value) || 0,
                              non_kiloan_yayasan_percent:
                                100 - (parseFloat(e.target.value) || 0),
                            })
                          }
                          className="pr-8"
                          placeholder="80"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                  <p
                    className={`text-xs ${revenueConfig.non_kiloan_yayasan_percent + revenueConfig.non_kiloan_vendor_percent !== 100 ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    Total:{" "}
                    {revenueConfig.non_kiloan_yayasan_percent +
                      revenueConfig.non_kiloan_vendor_percent}
                    %
                    {revenueConfig.non_kiloan_yayasan_percent +
                      revenueConfig.non_kiloan_vendor_percent !==
                      100 && " (harus 100%)"}
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
                    <div
                      key={key}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                    >
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
                <CardDescription>Pembagian hasil saat ini</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <h4 className="font-medium mb-3 text-primary">
                    Pembagian Hasil Aktif
                  </h4>
                  <ul className="text-sm space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-primary font-bold">•</span>
                      <div>
                        <span className="font-medium">Kiloan:</span>
                        <span className="text-muted-foreground ml-1">
                          Yayasan{" "}
                          {formatCurrency(revenueConfig.kiloan_yayasan_per_kg)}{" "}
                          × berat, Vendor{" "}
                          {formatCurrency(revenueConfig.kiloan_vendor_per_kg)} ×
                          berat
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

                {/* Syariah Summary */}
                <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                  <h4 className="font-medium mb-3 text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Kebijakan Syariah Aktif
                  </h4>
                  <ul className="text-sm space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">•</span>
                      <div>
                        <span className="font-medium">Pembulatan:</span>
                        <span className="text-muted-foreground ml-1">
                          {ROUNDING_POLICY_OPTIONS.find(
                            (o) => o.value === roundingSettings.default_policy,
                          )?.label || "Tidak diatur"}
                        </span>
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">•</span>
                      <div>
                        <span className="font-medium">Kelipatan:</span>
                        <span className="text-muted-foreground ml-1">
                          {formatCurrency(
                            roundingSettings.rounding_multiple || 500,
                          )}
                        </span>
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">•</span>
                      <div>
                        <span className="font-medium">Wadiah:</span>
                        <span className="text-muted-foreground ml-1">
                          {roundingSettings.wadiah_enabled
                            ? "Aktif"
                            : "Tidak Aktif"}
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
