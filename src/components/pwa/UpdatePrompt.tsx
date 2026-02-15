import { useRegisterSW } from "virtual:pwa-register/react";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

export function UpdatePrompt() {
  const { toast } = useToast();

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      if (r) {
        setInterval(() => {
          r.update();
        }, 60 * 1000);
      }
    },
  });

  useEffect(() => {
    if (needRefresh) {
      toast({
        title: "🔄 Versi baru tersedia!",
        description: "Aplikasi telah diperbarui. Klik tombol di bawah untuk memuat versi terbaru.",
        duration: Infinity,
        action: (
          <button
            onClick={() => updateServiceWorker(true)}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            Update Sekarang
          </button>
        ),
      });
    }
  }, [needRefresh, updateServiceWorker, toast]);

  return null;
}
