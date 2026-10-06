import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, RefreshCw, WalletCards } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  formatRupiah,
  partnerSettlementMethodLabels,
  type PartnerSettlement,
  type PartnerSettlementAccount,
  type PartnerSettlementLine,
  type PartnerSettlementPreview,
} from "@/types/partner-settlements";

type Partner = { id: string; name: string; user_id: string | null; is_active: boolean };

const todayJakarta = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const timestamp = (value: string) => new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
const dateLabel = (value: string) => new Date(`${value}T00:00:00+07:00`).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" });

export default function PartnerSettlements() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const canRecord = userRole === "admin" || userRole === "cashier";
  const canActivate = userRole === "admin";
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [account, setAccount] = useState<PartnerSettlementAccount | null>(null);
  const [preview, setPreview] = useState<PartnerSettlementPreview | null>(null);
  const [history, setHistory] = useState<PartnerSettlement[]>([]);
  const [cutoffDate, setCutoffDate] = useState(todayJakarta());
  const [startDate, setStartDate] = useState(todayJakarta());
  const [activationNote, setActivationNote] = useState("");
  const [method, setMethod] = useState<PartnerSettlement["payment_method"]>("bank_transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<PartnerSettlement | null>(null);
  const [detailLines, setDetailLines] = useState<PartnerSettlementLine[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const selectedPartner = useMemo(() => partners.find(p => p.id === partnerId) ?? null, [partners, partnerId]);
  const errorText = (error: unknown) => error instanceof Error ? error.message
    : typeof error === "object" && error && "message" in error ? String(error.message) : "Terjadi kesalahan";

  const loadPartners = useCallback(async () => {
    if (!user) return;
    let query = supabase.from("laundry_partners").select("id,name,user_id,is_active").order("name");
    if (userRole === "partner") query = query.eq("user_id", user.id);
    const { data, error } = await query;
    if (error) {
      toast({ variant: "destructive", title: "Gagal memuat mitra", description: error.message });
      return;
    }
    const rows = (data ?? []) as Partner[];
    setPartners(rows);
    setPartnerId(current => current || rows[0]?.id || "");
  }, [user, userRole, toast]);

  const loadPartnerData = useCallback(async () => {
    if (!partnerId) {
      setAccount(null); setPreview(null); setHistory([]); setLoading(false); return;
    }
    setLoading(true);
    try {
      const [{ data: accountData, error: accountError }, { data: historyData, error: historyError }] = await Promise.all([
        supabase.from("partner_settlement_accounts").select("*").eq("partner_id", partnerId).maybeSingle(),
        supabase.from("partner_settlements").select("*").eq("partner_id", partnerId).order("paid_at", { ascending: false }).limit(50),
      ]);
      if (accountError) throw accountError;
      if (historyError) throw historyError;
      const currentAccount = (accountData ?? null) as PartnerSettlementAccount | null;
      setAccount(currentAccount);
      setHistory((historyData ?? []) as PartnerSettlement[]);
      if (!currentAccount) {
        setPreview(null);
        return;
      }
      if (cutoffDate < currentAccount.start_date) setCutoffDate(currentAccount.start_date);
      const effectiveCutoff = cutoffDate < currentAccount.start_date ? currentAccount.start_date : cutoffDate;
      const { data: previewData, error: previewError } = await supabase.rpc("preview_partner_settlement", {
        p_partner_id: partnerId,
        p_cutoff_date: effectiveCutoff,
      });
      if (previewError) throw previewError;
      const row = previewData?.[0];
      setPreview(row ? {
        active: row.active,
        start_date: row.start_date,
        order_share_total: Number(row.order_share_total),
        correction_adjustment: Number(row.correction_adjustment),
        net_amount: Number(row.net_amount),
        order_count: Number(row.order_count),
        correction_count: Number(row.correction_count),
      } : null);
    } catch (error) {
      toast({ variant: "destructive", title: "Gagal memuat settlement", description: errorText(error) });
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [partnerId, cutoffDate, toast]);

  useEffect(() => { void loadPartners(); }, [loadPartners]);
  useEffect(() => { void loadPartnerData(); }, [loadPartnerData]);

  const activate = async () => {
    if (!canActivate || !partnerId || activationNote.trim().length < 10) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("activate_partner_settlement", {
        p_partner_id: partnerId,
        p_start_date: startDate,
        p_note: activationNote.trim(),
      });
      if (error) throw error;
      toast({ title: "Settlement mitra diaktifkan", description: `Transaksi mulai ${dateLabel(startDate)} akan dihitung.` });
      setActivationNote("");
      setCutoffDate(startDate);
      await loadPartnerData();
    } catch (error) {
      toast({ variant: "destructive", title: "Aktivasi gagal", description: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const record = async () => {
    if (!canRecord || !partnerId || !preview || preview.net_amount <= 0 || reference.trim().length < 5) return;
    const confirmed = window.confirm(
      `Catat pembayaran ke ${selectedPartner?.name ?? "mitra"} sebesar ${formatRupiah(preview.net_amount)}? Transaksi settlement yang sudah tercatat tidak dapat dihapus dari aplikasi.`,
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("record_partner_settlement", {
        p_partner_id: partnerId,
        p_cutoff_date: cutoffDate,
        p_method: method,
        p_reference: reference.trim(),
        p_note: note.trim() || null,
      });
      if (error) throw error;
      toast({ title: "Pembayaran mitra tercatat", description: `Nilai bersih ${formatRupiah(preview.net_amount)} sudah masuk histori settlement.` });
      setReference(""); setNote("");
      await loadPartnerData();
    } catch (error) {
      toast({ variant: "destructive", title: "Pencatatan gagal", description: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (row: PartnerSettlement) => {
    setDetail(row);
    setDetailLines([]);
    setDetailLoading(true);
    const { data, error } = await supabase.from("partner_settlement_lines").select("*")
      .eq("settlement_id", row.id).order("event_at", { ascending: true });
    setDetailLoading(false);
    if (error) {
      toast({ variant: "destructive", title: "Gagal memuat rincian", description: error.message });
      return;
    }
    setDetailLines((data ?? []) as PartnerSettlementLine[]);
  };

  return <DashboardLayout>
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Settlement Mitra</h1>
          <p className="text-muted-foreground">Bagian mitra dibayar berdasarkan order lunas ditambah atau dikurangi koreksi yang belum pernah direkonsiliasi.</p>
        </div>
        <Button variant="outline" onClick={() => void loadPartnerData()} disabled={loading}><RefreshCw className="h-4 w-4" /><span className="sr-only">Muat ulang</span></Button>
      </div>

      <Card><CardHeader><CardTitle>Pilih Mitra</CardTitle></CardHeader><CardContent className="space-y-3">
        <Select value={partnerId} onValueChange={setPartnerId}><SelectTrigger className="max-w-md"><SelectValue placeholder="Pilih mitra" /></SelectTrigger>
          <SelectContent>{partners.map(p => <SelectItem key={p.id} value={p.id}>{p.name}{!p.is_active ? " (nonaktif)" : ""}</SelectItem>)}</SelectContent>
        </Select>
        {userRole === "partner" && <p className="text-sm text-muted-foreground">Anda hanya dapat melihat settlement mitra yang terhubung ke akun ini.</p>}
      </CardContent></Card>

      {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : !partnerId ? <p className="text-muted-foreground">Tidak ada mitra yang dapat ditampilkan.</p> : !account ? (
        <Card><CardHeader><CardTitle>Belum Diaktifkan</CardTitle></CardHeader><CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Agar pembayaran lama tidak dihitung ulang, settlement baru harus memiliki batas awal. Pilih <strong>tanggal pertama transaksi yang belum pernah dibayar ke mitra secara manual</strong>.</p>
          {canActivate ? <>
            <div className="space-y-2 max-w-sm"><Label htmlFor="partner-start-date">Mulai hitung sejak tanggal</Label><Input id="partner-start-date" type="date" max={todayJakarta()} value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="activation-note">Catatan dasar aktivasi (minimal 10 karakter)</Label><Textarea id="activation-note" maxLength={2000} value={activationNote} onChange={e => setActivationNote(e.target.value)} placeholder="Contoh: Settlement manual terakhir sudah dibayar sampai 5 Oktober 2026." /></div>
            <Button onClick={() => void activate()} disabled={busy || !startDate || activationNote.trim().length < 10}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Aktifkan Settlement Mitra</Button>
          </> : <p className="text-sm">Aktivasi hanya dapat dilakukan admin.</p>}
        </CardContent></Card>
      ) : <>
        <Card><CardHeader><CardTitle>Saldo Belum Direkonsiliasi</CardTitle></CardHeader><CardContent className="space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2"><Label htmlFor="cutoff-date">Hitung sampai tanggal</Label><Input id="cutoff-date" type="date" min={account.start_date} max={todayJakarta()} value={cutoffDate} onChange={e => setCutoffDate(e.target.value)} /></div>
            <p className="text-sm text-muted-foreground pb-2">Ledger aktif sejak {dateLabel(account.start_date)}.</p>
          </div>
          {preview && <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Bagian order lunas</p><p className="text-xl font-bold">{formatRupiah(preview.order_share_total)}</p><p className="text-xs text-muted-foreground">{preview.order_count} order belum disettlement</p></div>
            <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Penyesuaian koreksi</p><p className="text-xl font-bold">{formatRupiah(preview.correction_adjustment)}</p><p className="text-xs text-muted-foreground">{preview.correction_count} koreksi belum direkonsiliasi</p></div>
            <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Saldo bersih mitra</p><p className="text-xl font-bold">{formatRupiah(preview.net_amount)}</p>
              <p className="text-xs text-muted-foreground">{preview.net_amount > 0 ? "Nilai maksimal yang dapat dibayar sekarang." : "Tidak ada pembayaran; saldo minus/nihil dibawa ke settlement berikutnya."}</p></div>
          </div>}
          <p className="text-sm text-muted-foreground">Koreksi negatif mengurangi hak mitra segera setelah disetujui admin. Koreksi positif baru menambah hak mitra setelah pembayaran tambahan pelanggan benar-benar selesai.</p>
        </CardContent></Card>

        {canRecord && <Card><CardHeader><CardTitle>Catat Pembayaran Mitra</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="space-y-2 max-w-sm"><Label>Metode pembayaran</Label><Select value={method} onValueChange={v => setMethod(v as PartnerSettlement["payment_method"])}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(partnerSettlementMethodLabels).map(([key,label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="partner-payment-reference">Referensi/bukti pembayaran</Label><Input id="partner-payment-reference" maxLength={500} value={reference} onChange={e => setReference(e.target.value)} placeholder="No. transfer / kuitansi / bukti kas" /></div>
          <div className="space-y-2"><Label htmlFor="partner-payment-note">Catatan (opsional)</Label><Textarea id="partner-payment-note" maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></div>
          <Button onClick={() => void record()} disabled={busy || !preview || preview.net_amount <= 0 || reference.trim().length < 5}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <WalletCards className="h-4 w-4 mr-2" />}
            Catat Pembayaran {preview ? formatRupiah(Math.max(0, preview.net_amount)) : ""}
          </Button>
        </CardContent></Card>}

        <Card><CardHeader><CardTitle>Riwayat Settlement</CardTitle></CardHeader><CardContent className="space-y-3">
          {history.length === 0 ? <p className="text-muted-foreground">Belum ada pembayaran mitra yang dicatat di ledger baru.</p> : history.map(row => <div key={row.id} className="rounded-lg border p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{formatRupiah(row.net_amount)}</p><p className="text-sm text-muted-foreground">{timestamp(row.paid_at)} · sampai {dateLabel(row.cutoff_date)}</p></div><Badge variant="outline">{partnerSettlementMethodLabels[row.payment_method]}</Badge></div>
            <p className="text-sm">Order {formatRupiah(row.order_share_total)} + koreksi {formatRupiah(row.correction_adjustment)} · {row.order_count} order · {row.correction_count} koreksi</p>
            <p className="text-sm text-muted-foreground">Referensi: {row.payment_reference}</p>
            <Button variant="outline" size="sm" onClick={() => void openDetail(row)}>Lihat rincian sumber</Button>
          </div>)}
        </CardContent></Card>
      </>}
    </div>

    <Dialog open={!!detail} onOpenChange={open => { if (!open) setDetail(null); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Rincian Settlement</DialogTitle><DialogDescription>Setiap order atau koreksi hanya boleh masuk satu settlement.</DialogDescription></DialogHeader>
        {detail && <div className="space-y-4">
          <div className="rounded-lg bg-muted p-3 text-sm"><p><strong>Total dibayar:</strong> {formatRupiah(detail.net_amount)}</p><p><strong>Referensi:</strong> {detail.payment_reference}</p><p><strong>Waktu:</strong> {timestamp(detail.paid_at)}</p></div>
          {detailLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : detailLines.map(line => {
            const snapshot = line.source_snapshot ?? {};
            return <div key={line.id} className="border rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between gap-2"><strong>{line.source_type === "order" ? "Order" : "Koreksi"} · {line.source_id.slice(0, 8)}</strong><span className={line.amount < 0 ? "text-destructive font-semibold" : "font-semibold"}>{formatRupiah(line.amount)}</span></div>
              <p className="text-muted-foreground">{timestamp(line.event_at)}</p>
              {line.source_type === "order" ? <p>Tagihan {formatRupiah(Number(snapshot.total_price ?? 0))} · bagian mitra {formatRupiah(Number(snapshot.vendor_share ?? line.amount))}</p>
                : <p>{String(snapshot.kind ?? "Koreksi")} · {String(snapshot.reason ?? "")}</p>}
            </div>;
          })}
        </div>}
      </DialogContent>
    </Dialog>
  </DashboardLayout>;
}
