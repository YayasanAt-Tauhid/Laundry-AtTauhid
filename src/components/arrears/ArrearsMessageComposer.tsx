import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, MessageSquare, Copy, Check, ExternalLink } from "lucide-react";
import { invokeApi } from "@/lib/serverApi";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatLaundryDate } from "@/utils/format";
import type { StudentArrears } from "@/hooks/useArrearsData";

const CATEGORY_LABELS: Record<string, string> = {
  kiloan: "Kiloan",
  handuk: "Handuk",
  selimut: "Selimut",
  sprei_kecil: "Sprei Kecil",
  sprei_besar: "Sprei Besar",
  jaket_tebal: "Jaket Tebal",
  bedcover: "Bedcover",
};

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("08")) {
    cleaned = "62" + cleaned.substring(1);
  } else if (cleaned.startsWith("8")) {
    cleaned = "62" + cleaned;
  }
  return cleaned;
}

interface Props {
  student: StudentArrears | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ArrearsMessageComposer({ student, open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  if (!student) return null;

  const generateMessage = (url?: string) => {
    const lines = [
      "Assalamualaikum Bapak/Ibu,",
      "",
      "Informasi tunggakan laundry putra/putri:",
      `Nama: ${student.studentName}`,
      `Kelas: ${student.studentClass}`,
      "",
      "Rincian:",
      ...student.orders.map(
        (o) =>
          `- ${formatLaundryDate(o.laundry_date)} - ${CATEGORY_LABELS[o.category] || o.category} - ${formatCurrency(o.total_price)}`
      ),
      "",
      `Total: ${formatCurrency(student.totalAmount)}`,
    ];

    if (url) {
      lines.push("", "Bayar langsung via link berikut:", url);
    }

    lines.push("", "Terima kasih.", "Wassalamualaikum.");

    return lines.join("\n");
  };

  const handleGenerateLink = async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeApi<{
        order_id: string;
        error?: string;
      }>("create-payment-link", {
        studentId: student.studentId,
        studentName: student.studentName,
        studentClass: student.studentClass,
        orderIds: student.orders.map((o) => o.id),
        totalAmount: student.totalAmount,
        parentName: student.parentName,
        parentPhone: student.parentPhone,
      });

      if (data?.error) throw new Error(data.error);
      if (error) throw error;
      if (!data) throw new Error("Respons kosong dari server");

      // Generate in-app payment URL
      const paymentUrl = `${window.location.origin}/pay?token=${data.order_id}`;
      setPaymentUrl(paymentUrl);
      toast({ title: "Link pembayaran berhasil dibuat!" });
    } catch (err) {
      console.error("Failed to generate payment link:", err);
      toast({
        title: "Gagal membuat link pembayaran",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const message = generateMessage(paymentUrl || undefined);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    toast({ title: "Pesan disalin ke clipboard!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendWA = () => {
    const phone = normalizePhone(student.parentPhone);
    const encoded = encodeURIComponent(message);
    const url = phone
      ? `https://wa.me/${phone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, "_blank");
  };

  const handleClose = () => {
    setPaymentUrl(null);
    setCopied(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pesan Tunggakan - {student.studentName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Generate link */}
          {!paymentUrl && (
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Generate link pembayaran Midtrans agar orang tua bisa langsung bayar tanpa login.
              </p>
              <Button onClick={handleGenerateLink} disabled={loading} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Membuat link...
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-4 w-4" />
                    Generate Link Pembayaran
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Preview message */}
          <div className="rounded-lg bg-muted p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Preview Pesan:</p>
            <pre className="text-sm whitespace-pre-wrap font-sans">{message}</pre>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCopy} className="flex-1">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Tersalin!" : "Salin Pesan"}
            </Button>
            <Button
              onClick={handleSendWA}
              className="flex-1"
              disabled={!paymentUrl}
            >
              <MessageSquare className="h-4 w-4" />
              Kirim via WA
            </Button>
          </div>

          {!student.parentPhone && (
            <p className="text-xs text-destructive/80">
              ⚠️ Nomor HP orang tua belum terdaftar. Link WhatsApp akan dibuka tanpa nomor tujuan.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
