import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { formatRupiah, partnerSettlementMethodLabels, type PartnerPeriodLine, type PartnerPeriodPreview, type PartnerSettlement } from "@/types/partner-settlements";

const errorText = (e: unknown) => e && typeof e === "object" && "message" in e ? String(e.message) : "Terjadi kesalahan";
const dateLabel = (value: unknown) => typeof value === "string" ? new Date(`${value}T00:00:00+07:00`).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" }) : "-";
const decisions = { included: "Periode ini", paid_in_ledger: "Sudah dibayar ke mitra (tercatat)", paid_manually: "Sudah dibayar ke mitra (manual)", not_paid: "Belum dibayar ke mitra — tidak dipotong", unverified: "Perlu verifikasi pembayaran lama" };

type Props = { partnerId: string; partnerName: string; start: string; end: string; onRecorded?: () => void };

export function PartnerPeriodPayment({ partnerId, partnerName, start, end, onRecorded }: Props) {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const canRecord = userRole === "admin" || userRole === "cashier";
  const [preview, setPreview] = useState<PartnerPeriodPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verification, setVerification] = useState<{ line: PartnerPeriodLine; paid: boolean } | null>(null);
  const [verificationReference, setVerificationReference] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [method, setMethod] = useState<PartnerSettlement["payment_method"]>("bank_transfer");
  const [reference, setReference] = useState("");
  const sequence = useRef(0);
  const valid = partnerId && partnerId !== "all" && start && end;

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setPreview(null); setError(""); setPaymentOpen(false); setVerification(null);
    if (!partnerId || partnerId === "all" || !start || !end) { setLoading(false); return; }
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("preview_partner_period", { p_partner_id: partnerId, p_start: start, p_end: end });
    if (current !== sequence.current) return;
    if (rpcError) setError(rpcError.message);
    else setPreview(data as PartnerPeriodPreview);
    setLoading(false);
  }, [partnerId, start, end]);
  useEffect(() => {
    void load();
    // Invalidate outstanding RPC responses after selection changes or unmount.
    const cancel = () => { sequence.current++; };
    return cancel;
  }, [load]);

  const verify = async () => {
    if (!verification || verificationReference.trim().length < 5 || busy) return;
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("verify_partner_adjustment", {
      p_partner_id: partnerId, p_start: start, p_end: end, p_source_type: verification.line.source_type,
      p_source_id: verification.line.source_id, p_previously_paid: verification.paid, p_reference: verificationReference.trim(),
    });
    setBusy(false);
    if (rpcError) { toast({ variant: "destructive", title: "Verifikasi gagal", description: rpcError.message }); return; }
    toast({ title: "Dasar pembayaran lama tersimpan" });
    setVerificationReference("");
    await load();
  };

  const record = async () => {
    if (!preview?.token || busy || !canRecord || reference.trim().length < 5) return;
    setBusy(true);
    try {
      const { error: rpcError } = await supabase.rpc("record_partner_period", {
        p_partner_id: partnerId, p_start: start, p_end: end, p_expected_token: preview.token,
        p_method: method, p_reference: reference.trim(),
      });
      if (rpcError) throw rpcError;
      toast({ title: "Pembayaran mitra tercatat", description: `${partnerName}: ${formatRupiah(preview.net_amount ?? 0)}. Sumber yang sama tidak dihitung ulang.` });
      setReference(""); await load(); onRecorded?.();
    } catch (e) {
      toast({ variant: "destructive", title: "Pembayaran belum dicatat", description: errorText(e) });
      await load();
    } finally { setBusy(false); }
  };

  const adjustments = preview?.lines?.filter(l => l.source_type !== "order") ?? [];
  return <Card className="border-emerald-500/40">
    <CardHeader><div className="flex justify-between items-center gap-2"><CardTitle className="text-lg">Pembayaran Mitra per Periode Laundry</CardTitle>
      {valid && <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || busy}><RefreshCw className="h-4 w-4" /><span className="sr-only">Muat ulang pembayaran mitra</span></Button>}
    </div></CardHeader>
    <CardContent className="space-y-4">
      {!valid ? <p className="text-sm text-muted-foreground">Pilih satu mitra serta tanggal awal dan akhir untuk melihat penyesuaian dan jumlah bersih pembayaran.</p>
        : loading ? <Loader2 className="h-5 w-5 animate-spin" />
        : error ? <p role="alert" className="text-sm text-destructive">{error}</p>
        : preview && !preview.active ? <p className="text-sm">Tentukan batas pembayaran manual sebelumnya di menu Settlement Mitra terlebih dahulu.</p>
        : preview && <>
          <p className="text-sm text-muted-foreground">{partnerName} · {dateLabel(start)}–{dateLabel(end)}. Bagian mitra mengikuti tanggal laundry, termasuk tagihan yang belum dibayar siswa. Order yang sudah tercatat dibayar ke mitra tidak dihitung lagi.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Bagian mitra belum dibayarkan</p><p className="text-xl font-bold">{formatRupiah(preview.order_share_total ?? 0)}</p></div>
            <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Penyesuaian terverifikasi</p><p className="text-xl font-bold">{formatRupiah(preview.correction_adjustment ?? 0)}</p></div>
            <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/5 p-4"><p className="text-sm text-muted-foreground">{preview.unverified_count ? "Bersih sementara" : "Bersih dibayarkan"}</p><p className="text-xl font-bold">{formatRupiah(preview.net_amount ?? 0)}</p></div>
          </div>
          {!!preview.unverified_count && <p role="alert" className="rounded-lg bg-amber-500/10 p-3 text-sm">Ada {preview.unverified_count} penyesuaian lama yang perlu diverifikasi. Jumlah bersih masih sementara dan pembayaran belum dapat dicatat.</p>}
          {adjustments.length > 0 && <div className="space-y-3"><h3 className="font-semibold">Rincian penyesuaian</h3>{adjustments.map(line => <div key={`${line.source_type}:${line.source_id}`} className="border rounded-lg p-3 space-y-2 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><strong>{String(line.source_snapshot.student_name ?? "Siswa")} · {dateLabel(line.source_snapshot.laundry_date)}</strong><strong className={line.amount < 0 ? "text-destructive" : ""}>{formatRupiah(line.amount)}</strong></div>
            <p>{String(line.source_snapshot.reason ?? "Koreksi tagihan")}</p>
            <p className="text-muted-foreground">{decisions[line.decision]}</p>
            {line.decision === "unverified" && canRecord && <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => { setVerification({ line, paid: true }); setVerificationReference(""); }}>Sudah dibayar ke mitra</Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => { setVerification({ line, paid: false }); setVerificationReference(""); }}>Belum dibayar ke mitra</Button>
            </div>}
          </div>)}</div>}
          <p className="text-sm text-muted-foreground">Penyesuaian lama yang sudah dibayarkan ke mitra diperhitungkan sekali pada pembayaran berikutnya. Jika belum pernah dibayarkan, tidak dipotong dari periode ini. Tambahan dari koreksi tagihan lunas baru diperhitungkan setelah selisihnya dibayar siswa.</p>
          {canRecord && <Button onClick={() => setPaymentOpen(true)} disabled={busy || !!preview.unverified_count || (preview.net_amount ?? 0) <= 0}>Catat Pembayaran Mitra {formatRupiah(Math.max(0, preview.net_amount ?? 0))}</Button>}
          {(preview.net_amount ?? 0) <= 0 && <p className="text-sm">Belum ada pembayaran bersih positif. Penyesuaian yang belum dipakai tetap tersedia untuk pembayaran berikutnya.</p>}
        </>}
    </CardContent>
    <Dialog open={!!verification} onOpenChange={open => { if (!busy && !open) setVerification(null); }}><DialogContent><DialogHeader>
      <DialogTitle>Verifikasi Pembayaran Mitra Lama</DialogTitle><DialogDescription>Verifikasi disimpan beserta dasar pemeriksaannya dan tidak dapat diubah dari aplikasi.</DialogDescription>
    </DialogHeader>{verification && <div className="space-y-4">
      <p className="text-sm">{String(verification.line.source_snapshot.student_name)} · {dateLabel(verification.line.source_snapshot.laundry_date)} · {formatRupiah(verification.line.amount)}</p>
      <p className="font-medium">{verification.paid ? "Bagian tagihan lama sudah dibayarkan ke mitra. Penyesuaian diperhitungkan pada pembayaran berikutnya." : "Bagian tagihan lama belum dibayarkan ke mitra. Penyesuaian tidak dipotong dari periode berikutnya."}</p>
      <Label htmlFor="verification-reference">Dasar pemeriksaan / bukti pembayaran lama</Label><Input id="verification-reference" maxLength={500} value={verificationReference} onChange={e => setVerificationReference(e.target.value)} placeholder="Nomor bukti transfer atau catatan pemeriksaan rekap" />
      <Button onClick={() => void verify()} disabled={busy || verificationReference.trim().length < 5}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Simpan Verifikasi</Button>
    </div>}</DialogContent></Dialog>
    <Dialog open={paymentOpen} onOpenChange={open => { if (!busy) setPaymentOpen(open); }}><DialogContent><DialogHeader>
      <DialogTitle>Catat Pembayaran ke {partnerName}</DialogTitle><DialogDescription>Catat setelah pembayaran benar-benar dilakukan. Pencatatan ini menyimpan sumber tagihan dan penyesuaian agar tidak dibayar ulang.</DialogDescription>
    </DialogHeader><div className="space-y-4">
      <p className="text-xl font-bold">{formatRupiah(preview?.net_amount ?? 0)}</p>
      <Label>Metode pembayaran</Label><Select value={method} onValueChange={v => setMethod(v as PartnerSettlement["payment_method"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(partnerSettlementMethodLabels).map(([key,label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
      <Label htmlFor="period-payment-reference">Referensi / bukti pembayaran</Label><Input id="period-payment-reference" maxLength={500} value={reference} onChange={e => setReference(e.target.value)} placeholder="Nomor transfer atau kuitansi pembayaran" />
      <Button onClick={() => void record()} disabled={busy || reference.trim().length < 5}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Pembayaran Sudah Dilakukan — Simpan</Button>
    </div></DialogContent></Dialog>
  </Card>;
}
