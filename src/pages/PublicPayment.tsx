import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useMidtransConfig } from "@/hooks/useMidtransConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, CreditCard, ShieldCheck, School } from "lucide-react";
import { formatCurrency } from "@/utils/format";

declare global {
  interface Window {
    snap: {
      pay: (
        token: string,
        options: {
          onSuccess?: (result: MidtransResult) => void;
          onPending?: (result: MidtransResult) => void;
          onError?: (result: MidtransResult) => void;
          onClose?: () => void;
        }
      ) => void;
    };
  }
}

interface MidtransResult {
  order_id: string;
  transaction_id: string;
  transaction_status: string;
  payment_type: string;
  status_code: string;
  status_message: string;
}

interface PaymentData {
  studentName: string;
  studentClass: string;
  orderCount: number;
  totalAmount: number;
  token: string;
  midtransOrderId: string;
}

export default function PublicPayment() {
  const [searchParams] = useSearchParams();
  const { isReady: isMidtransReady, isLoading: isMidtransLoading } = useMidtransConfig();
  
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "processing" | "success" | "pending" | "failed">("idle");
  const [paymentMessage, setPaymentMessage] = useState("");

  // Get payment token from URL
  const paymentToken = searchParams.get("token");

  useEffect(() => {
    async function loadPaymentData() {
      if (!paymentToken) {
        setError("Link pembayaran tidak valid. Token tidak ditemukan.");
        setLoading(false);
        return;
      }

      try {
        // Fetch payment data from edge function
        const { data, error } = await supabase.functions.invoke("get-payment-info", {
          body: { token: paymentToken },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        setPaymentData(data);
      } catch (err) {
        console.error("Failed to load payment data:", err);
        setError(err instanceof Error ? err.message : "Gagal memuat data pembayaran");
      } finally {
        setLoading(false);
      }
    }

    loadPaymentData();
  }, [paymentToken]);

  const handlePayNow = () => {
    if (!paymentData?.token || !window.snap) {
      setError("Sistem pembayaran belum siap. Silakan refresh halaman.");
      return;
    }

    setPaymentStatus("processing");

    window.snap.pay(paymentData.token, {
      onSuccess: (result: MidtransResult) => {
        console.log("Payment success:", result);
        setPaymentStatus("success");
        setPaymentMessage("Pembayaran berhasil! Terima kasih atas pembayaran Anda.");
      },
      onPending: (result: MidtransResult) => {
        console.log("Payment pending:", result);
        setPaymentStatus("pending");
        setPaymentMessage("Pembayaran sedang diproses. Silakan selesaikan pembayaran sesuai instruksi.");
      },
      onError: (result: MidtransResult) => {
        console.error("Payment error:", result);
        setPaymentStatus("failed");
        setPaymentMessage(result.status_message || "Pembayaran gagal. Silakan coba lagi.");
      },
      onClose: () => {
        console.log("Payment popup closed");
        if (paymentStatus === "processing") {
          setPaymentStatus("idle");
        }
      },
    });
  };

  // Loading state
  if (loading || isMidtransLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Memuat halaman pembayaran...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error || !paymentData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-destructive/5 to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Link Tidak Valid</h2>
            <p className="text-muted-foreground">{error || "Data pembayaran tidak ditemukan"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (paymentStatus === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-accent/30 to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center border-accent">
          <CardContent className="pt-8 pb-8">
            <CheckCircle className="h-20 w-20 text-accent-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-accent-foreground mb-2">Pembayaran Berhasil!</h2>
            <p className="text-muted-foreground mb-4">{paymentMessage}</p>
            <Badge variant="secondary">
              {paymentData.studentName} - {paymentData.studentClass}
            </Badge>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pending state
  if (paymentStatus === "pending") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-secondary/30 to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <Loader2 className="h-20 w-20 text-secondary-foreground mx-auto mb-4 animate-spin" />
            <h2 className="text-2xl font-bold text-secondary-foreground mb-2">Menunggu Pembayaran</h2>
            <p className="text-muted-foreground mb-4">{paymentMessage}</p>
            <Badge variant="secondary">
              Silakan selesaikan pembayaran
            </Badge>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Failed state
  if (paymentStatus === "failed") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-destructive/5 to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <XCircle className="h-20 w-20 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-destructive mb-2">Pembayaran Gagal</h2>
            <p className="text-muted-foreground mb-4">{paymentMessage}</p>
            <Button onClick={handlePayNow} className="w-full">
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main payment page
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background py-8 px-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header with branding */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <School className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold text-primary">At-Tauhid</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Portal Pembayaran Laundry Resmi
          </p>
        </div>

        {/* Security badge */}
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-accent-foreground" />
          <span>Pembayaran Aman & Terverifikasi</span>
        </div>

        {/* Payment details card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Detail Pembayaran</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Student info */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nama Siswa</span>
                <span className="font-medium">{paymentData.studentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kelas</span>
                <span className="font-medium">{paymentData.studentClass}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Jumlah Order</span>
                <span className="font-medium">{paymentData.orderCount} order</span>
              </div>
            </div>

            {/* Total amount */}
            <div className="border-t pt-4">
              <div className="flex justify-between items-center">
                <span className="text-lg font-medium">Total Pembayaran</span>
                <span className="text-2xl font-bold text-primary">
                  {formatCurrency(paymentData.totalAmount)}
                </span>
              </div>
            </div>

            {/* Pay button */}
            <Button
              onClick={handlePayNow}
              disabled={!isMidtransReady || paymentStatus === "processing"}
              className="w-full h-12 text-lg"
              size="lg"
            >
              {paymentStatus === "processing" ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Memproses...
                </>
              ) : (
                <>
                  <CreditCard className="h-5 w-5 mr-2" />
                  Bayar Sekarang
                </>
              )}
            </Button>

            {/* Payment methods info */}
            <p className="text-xs text-center text-muted-foreground">
              Pembayaran melalui QRIS, Transfer Bank, atau E-Wallet
            </p>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground space-y-1">
          <p>Powered by Midtrans Payment Gateway</p>
          <p>© {new Date().getFullYear()} At-Tauhid Laundry</p>
        </div>
      </div>
    </div>
  );
}
