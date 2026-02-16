import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Download, Smartphone, CheckCircle2, Share, MoreVertical, RefreshCw, Apple, Chrome } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import iosStep1 from "@/assets/install-step-ios-1.png";
import iosStep2 from "@/assets/install-step-ios-2.png";
import iosStep3 from "@/assets/install-step-ios-3.png";
import androidStep1 from "@/assets/install-step-android-1.png";
import androidStep2 from "@/assets/install-step-android-2.png";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const StepCard = ({ step, title, description, image }: { step: number; title: string; description: string; image: string }) => (
  <div className="flex flex-col items-center text-center space-y-3 p-4 rounded-2xl bg-muted/50">
    <div className="bg-primary text-primary-foreground rounded-full w-10 h-10 flex items-center justify-center text-lg font-bold shrink-0">
      {step}
    </div>
    <img src={image} alt={title} className="w-40 h-40 object-contain rounded-xl border border-border shadow-sm" />
    <div>
      <p className="font-semibold text-foreground text-base">{title}</p>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </div>
  </div>
);

const InstallApp = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [defaultTab, setDefaultTab] = useState("android");

  useEffect(() => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);
    setDefaultTab(isIOSDevice ? "iphone" : "android");

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const installedHandler = () => setIsInstalled(true);

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);

    const mq = window.matchMedia("(display-mode: standalone)");
    setIsInstalled(mq.matches);
    const mqHandler = (e: MediaQueryListEvent) => setIsInstalled(e.matches);
    mq.addEventListener("change", mqHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
      mq.removeEventListener("change", mqHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
            <h2 className="text-2xl font-bold text-foreground">Sudah Ditambahkan! ✅</h2>
            <p className="text-muted-foreground">
              Aplikasi At-Tauhid Laundry sudah ada di layar utama HP Anda. Tinggal ketuk ikonnya untuk membuka!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-8">
      <div className="w-full max-w-lg mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader className="text-center space-y-3">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <img src="/logo.png" alt="Logo" className="w-14 h-14 object-contain" />
            </div>
            <CardTitle className="text-2xl">Tambahkan Aplikasi Laundry</CardTitle>
            <CardDescription className="text-base">
              Tidak perlu download dari Play Store / App Store. 
              <br />
              <strong>Cukup ikuti langkah mudah di bawah ini!</strong>
            </CardDescription>
          </CardHeader>

          {/* Quick install button - always visible */}
          <CardContent>
            <Button onClick={handleInstall} className="w-full gap-2" size="lg" disabled={!deferredPrompt}>
              <Download className="h-5 w-5" />
              Tambahkan ke Layar Utama
            </Button>
            {!deferredPrompt && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Jika tombol tidak berfungsi, ikuti panduan bergambar di bawah
              </p>
            )}
          </CardContent>
        </Card>

        {/* Visual Step-by-Step Guide */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              Panduan Bergambar
            </CardTitle>
            <CardDescription>Pilih jenis HP Anda:</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={defaultTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="android" className="gap-2">
                  <Chrome className="h-4 w-4" />
                  Android
                </TabsTrigger>
                <TabsTrigger value="iphone" className="gap-2">
                  <Apple className="h-4 w-4" />
                  iPhone
                </TabsTrigger>
              </TabsList>

              <TabsContent value="android" className="space-y-4">
                <div className="bg-primary/5 rounded-xl p-3 text-center">
                  <p className="text-sm font-medium text-primary">📱 Buka halaman ini pakai Chrome di HP Android</p>
                </div>
                <StepCard
                  step={1}
                  title='Ketuk Tombol ⋮ (Titik Tiga)'
                  description="Di pojok kanan atas browser Chrome, ada titik tiga. Ketuk itu."
                  image={androidStep1}
                />
                <StepCard
                  step={2}
                  title='Pilih "Tambahkan ke Layar Utama"'
                  description='Akan muncul menu. Cari dan ketuk tulisan "Tambahkan ke layar utama" atau "Add to Home Screen".'
                  image={androidStep2}
                />
                <StepCard
                  step={3}
                  title="Selesai! 🎉"
                  description="Ikon aplikasi akan muncul di layar utama HP Anda. Ketuk untuk membuka!"
                  image={iosStep3}
                />

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => window.location.reload()}
                >
                  <RefreshCw className="h-4 w-4" />
                  Muat ulang halaman
                </Button>
              </TabsContent>

              <TabsContent value="iphone" className="space-y-4">
                <div className="bg-primary/5 rounded-xl p-3 text-center">
                  <p className="text-sm font-medium text-primary">📱 Buka halaman ini pakai Safari di iPhone</p>
                </div>
                <StepCard
                  step={1}
                  title="Ketuk Tombol Share ⬆️"
                  description="Di bagian bawah layar Safari, ada ikon kotak dengan panah ke atas. Ketuk itu."
                  image={iosStep1}
                />
                <StepCard
                  step={2}
                  title='"Tambahkan ke Layar Utama"'
                  description='Geser ke bawah di menu yang muncul, cari tulisan "Tambahkan ke Layar Utama" lalu ketuk.'
                  image={iosStep2}
                />
                <StepCard
                  step={3}
                  title="Ketuk Tambah ✅"
                  description='Ketuk tombol "Tambah" di pojok kanan atas. Selesai!'
                  image={iosStep3}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="font-semibold text-foreground">❓ Pertanyaan Umum</p>
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-foreground">Apakah ini aman?</p>
                <p className="text-muted-foreground">Ya! Ini bukan download aplikasi biasa. Ini hanya membuat shortcut ke website kami di layar HP Anda.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Apakah memakan ruang HP?</p>
                <p className="text-muted-foreground">Sangat kecil, kurang dari 1 MB. Jauh lebih kecil dari aplikasi biasa.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Bagaimana cara hapusnya?</p>
                <p className="text-muted-foreground">Sama seperti hapus aplikasi biasa. Tekan lama ikonnya, lalu pilih hapus.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default InstallApp;
