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
import { Loader2, RefreshCw } from "lucide-react";
import { PartnerPeriodPayment } from "@/components/reports/PartnerPeriodPayment";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  formatRupiah,
  partnerSettlementMethodLabels,
  type PartnerSettlement,
  type PartnerSettlementAccount,
  type PartnerSettlementLine,
} from "@/types/partner-settlements";

type Partner = { id: string; name: string; user_id: string | null; is_active: boolean };

const todayJakarta = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const timestamp = (value: string) => new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
const dateLabel = (value: string) => new Date(`${value}T00:00:00+07:00`).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" });

export default function PartnerSettlements() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const canActivate = userRole === "admin";
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [account, setAccount] = useState<PartnerSettlementAccount | null>(null);
  const [history, setHistory] = useState<PartnerSettlement[]>([]);
  const [cutoffDate, setCutoffDate] = useState(todayJakarta());
  const [startDate, setStartDate] = useState(todayJakarta());
  const [periodStart, setPeriodStart] = useState("");
  const [activationNote, setActivationNote] = useState("");
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
      setAccount(null); setHistory([]); setLoading(false); return;
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
      setPeriodStart(current => current && current >= (currentAccount?.start_date ?? "") ? current : currentAccount?.start_date ?? "");
    } catch (error) {
      toast({ variant: "destructive", title: "Gagal memuat settlement", description: errorText(error) });
    } finally {
      setLoading(false);
    }
  }, [partnerId, toast]);

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
          <p className="text-muted-foreground">Pembayaran mengikuti periode tanggal laundry, termasuk tagihan yang belum dibayar siswa dan penyesuaian lama terverifikasi.</p>
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
        <Card><CardHeader><CardTitle>Periode Laundry</CardTitle></CardHeader><CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2"><Label htmlFor="period-start">Dari tanggal</Label><Input id="period-start" type="date" min={account.start_date} max={cutoffDate} value={periodStart} onChange={e => setPeriodStart(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="cutoff-date">Sampai tanggal</Label><Input id="cutoff-date" type="date" min={periodStart || account.start_date} max={todayJakarta()} value={cutoffDate} onChange={e => setCutoffDate(e.target.value)} /></div>
          </div>
          <p className="text-sm text-muted-foreground mt-3">Batas awal ledger: {dateLabel(account.start_date)}. {account.activation_note}</p>
        </CardContent></Card>
        <PartnerPeriodPayment partnerId={partnerId} partnerName={selectedPartner?.name ?? "Mitra"} start={periodStart} end={cutoffDate} onRecorded={() => void loadPartnerData()} />

        <Card><CardHeader><CardTitle>Riwayat Settlement</CardTitle></CardHeader><CardContent className="space-y-3">
          {history.length === 0 ? <p className="text-muted-foreground">Belum ada pembayaran mitra yang dicatat di ledger baru.</p> : history.map(row => <div key={row.id} className="rounded-lg border p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{formatRupiah(row.net_amount)}</p><p className="text-sm text-muted-foreground">{timestamp(row.paid_at)} · {row.period_start ? `${dateLabel(row.period_start)}–` : "sampai "}{dateLabel(row.cutoff_date)}</p></div><Badge variant="outline">{partnerSettlementMethodLabels[row.payment_method]}</Badge></div>
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
