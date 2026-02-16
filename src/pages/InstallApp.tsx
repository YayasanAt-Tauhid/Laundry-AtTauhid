import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Download, Smartphone, CheckCircle2, Share, MoreVertical, RefreshCw } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const InstallApp = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const installedHandler = () => setIsInstalled(true);

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);

    // Check standalone mode and listen for changes (e.g. after uninstall)
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
            <h2 className="text-2xl font-bold text-foreground">Sudah Terinstal!</h2>
            <p className="text-muted-foreground">
              Aplikasi At-Tauhid Laundry sudah terinstal di perangkat Anda.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
            <img src="/logo.png" alt="Logo" className="w-14 h-14 object-contain" />
          </div>
          <CardTitle className="text-2xl">Instal At-Tauhid Laundry</CardTitle>
          <CardDescription>
            Instal aplikasi ke layar utama untuk akses cepat tanpa membuka browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {deferredPrompt ? (
            <Button onClick={handleInstall} className="w-full gap-2" size="lg">
              <Download className="h-5 w-5" />
              Instal Sekarang
            </Button>
          ) : isIOS ? (
            <div className="space-y-4 rounded-xl bg-muted p-4">
              <p className="font-medium text-foreground text-center">Cara Instal di iPhone/iPad:</p>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">1</div>
                  <p className="flex items-center gap-1">Ketuk ikon <Share className="h-4 w-4 inline" /> <strong>Share</strong> di Safari</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">2</div>
                  <p>Gulir ke bawah dan pilih <strong>"Add to Home Screen"</strong></p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">3</div>
                  <p>Ketuk <strong>"Add"</strong></p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 rounded-xl bg-muted p-4">
              <p className="font-medium text-foreground text-center">Cara Instal:</p>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">1</div>
                  <p className="flex items-center gap-1">Ketuk ikon <MoreVertical className="h-4 w-4 inline" /> menu browser</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">2</div>
                  <p>Pilih <strong>"Install app"</strong> atau <strong>"Add to Home Screen"</strong></p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 mt-3"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="h-4 w-4" />
                Muat ulang halaman untuk coba lagi
              </Button>
            </div>
          )}

          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Smartphone className="h-5 w-5 shrink-0" />
            <p>Aplikasi akan terinstal seperti aplikasi biasa, bisa dibuka langsung dari layar utama.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InstallApp;
