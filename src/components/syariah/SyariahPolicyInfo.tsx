import { useState, useEffect } from 'react';
import { Info, BookOpen, Wallet, ArrowDown, CheckCircle2 } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWadiah } from '@/hooks/useWadiah';

interface SyariahPolicyInfoProps {
  variant?: 'banner' | 'compact' | 'dialog';
  showOnlyOnce?: boolean;
  className?: string;
}

const POLICY_SEEN_KEY = 'syariah_policy_seen';

export function SyariahPolicyInfo({
  variant = 'banner',
  showOnlyOnce = false,
  className = '',
}: SyariahPolicyInfoProps) {
  const { settings } = useWadiah({ autoFetch: true });
  const [dismissed, setDismissed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (showOnlyOnce) {
      const seen = localStorage.getItem(POLICY_SEEN_KEY);
      if (seen) {
        setDismissed(true);
      }
    }
  }, [showOnlyOnce]);

  const handleDismiss = () => {
    setDismissed(true);
    if (showOnlyOnce) {
      localStorage.setItem(POLICY_SEEN_KEY, 'true');
    }
  };

  const policyText = settings?.policy_info_text ||
    'Sesuai prinsip syariah, pembulatan ke bawah dianggap sebagai sedekah/diskon dari kami untuk Anda. Sisa kembalian dapat disimpan sebagai saldo (wadiah) untuk transaksi berikutnya. Semua transaksi didasarkan atas kerelaan kedua belah pihak (antaradin).';

  const PolicyContent = () => (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
          <BookOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h4 className="font-semibold text-foreground">Prinsip Antaradin (Kerelaan)</h4>
          <p className="text-sm text-muted-foreground">
            Semua transaksi didasarkan atas kerelaan kedua belah pihak. Tidak ada pemaksaan dalam pembulatan atau penggunaan saldo.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
          <ArrowDown className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h4 className="font-semibold text-foreground">Pembulatan Ke Bawah</h4>
          <p className="text-sm text-muted-foreground">
            Pembulatan ke bawah dianggap sebagai sedekah/diskon dari kami. Anda mendapat keringanan, kami mendapat pahala. <Badge variant="secondary" className="ml-1">Dianjurkan (Sunnah)</Badge>
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
          <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h4 className="font-semibold text-foreground">Saldo Wadiah (Titipan)</h4>
          <p className="text-sm text-muted-foreground">
            Sisa kembalian dapat disimpan sebagai saldo wadiah untuk transaksi berikutnya. Akad ini sesuai dengan prinsip wadiah yad amanah.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h4 className="font-semibold text-foreground">Transparansi</h4>
          <p className="text-sm text-muted-foreground">
            Tidak ada gharar (ketidakjelasan). Semua informasi harga, pembulatan, dan saldo ditampilkan dengan jelas.
          </p>
        </div>
      </div>
    </div>
  );

  // Dialog variant
  if (variant === 'dialog') {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className={className}>
            <Info className="h-4 w-4 mr-2" />
            Info Kebijakan Syariah
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Kebijakan Transaksi Syariah
            </DialogTitle>
            <DialogDescription>
              Prinsip-prinsip syariah yang kami terapkan dalam transaksi laundry
            </DialogDescription>
          </DialogHeader>
          <PolicyContent />
        </DialogContent>
      </Dialog>
    );
  }

  // Compact variant
  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
        <Info className="h-4 w-4 text-emerald-600" />
        <span>Pembulatan ke bawah = sedekah/diskon</span>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="link" size="sm" className="h-auto p-0 text-primary">
              Pelajari lebih lanjut
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Kebijakan Transaksi Syariah
              </DialogTitle>
              <DialogDescription>
                Prinsip-prinsip syariah yang kami terapkan dalam transaksi laundry
              </DialogDescription>
            </DialogHeader>
            <PolicyContent />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Banner variant (default)
  if (dismissed || (showOnlyOnce && !settings?.show_policy_at_start)) {
    return null;
  }

  return (
    <Alert className={`border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 dark:border-emerald-800 ${className}`}>
      <Info className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
      <AlertTitle className="text-emerald-800 dark:text-emerald-200 font-semibold">
        Kebijakan Transaksi Syariah
      </AlertTitle>
      <AlertDescription className="text-emerald-700 dark:text-emerald-300">
        <p className="mb-3">{policyText}</p>
        <div className="flex flex-wrap gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30">
                <BookOpen className="h-4 w-4 mr-2" />
                Pelajari Lebih Lanjut
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  Kebijakan Transaksi Syariah
                </DialogTitle>
                <DialogDescription>
                  Prinsip-prinsip syariah yang kami terapkan dalam transaksi laundry
                </DialogDescription>
              </DialogHeader>
              <PolicyContent />
            </DialogContent>
          </Dialog>
          {showOnlyOnce && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
            >
              Mengerti, jangan tampilkan lagi
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

export default SyariahPolicyInfo;
