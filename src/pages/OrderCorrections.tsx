import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { UnpaidOrderCorrections } from "@/components/UnpaidOrderCorrections";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { StudentAutocomplete } from "@/components/ui/StudentAutocomplete";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Printer, RefreshCw } from "lucide-react";
import { LAUNDRY_CATEGORIES } from "@/lib/constants";
import { correctionKindLabels, correctionStatusLabels, rupiah, type OrderCorrection } from "@/types/order-corrections";

type Student = { id: string; name: string; class: string; nik: string; parent_id: string | null };
type PaidOrder = { id: string; student_id: string; total_price: number; category: string; laundry_date: string };
type CorrectionRow = OrderCorrection & { students: { name: string; class: string; nik: string } | null };
const PAGE_SIZE = 25;
const timestamp = (value: string | null) => value ? new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "—";

export default function OrderCorrections() {
  const [params] = useSearchParams();
  return <DashboardLayout><Tabs defaultValue={params.get("mode") === "unpaid" ? "unpaid" : "paid"} className="space-y-6">
    <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="paid">Sudah dibayar</TabsTrigger><TabsTrigger value="unpaid">Belum dibayar</TabsTrigger></TabsList>
    <TabsContent value="paid"><PaidOrderCorrections /></TabsContent>
    <TabsContent value="unpaid"><UnpaidOrderCorrections /></TabsContent>
  </Tabs></DashboardLayout>;
}

function PaidOrderCorrections() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const canRequest = ["admin", "staff", "cashier"].includes(userRole ?? "");
  const canSettle = ["admin", "cashier"].includes(userRole ?? "");
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState("");
  const [orders, setOrders] = useState<PaidOrder[]>([]);
  const [orderId, setOrderId] = useState(params.get("order") ?? "");
  const [kind, setKind] = useState<OrderCorrection["kind"]>("price");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [replacementStudent, setReplacementStudent] = useState("");
  const [rows, setRows] = useState<CorrectionRow[]>([]);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<CorrectionRow | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [verification, setVerification] = useState("");
  const [refund, setRefund] = useState("");
  const [recipient, setRecipient] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [consent, setConsent] = useState(false);
  const selectedOrder = orders.find(o => o.id === orderId);
  const correctedTotal = kind === "price" ? Number(amount) : 0;
  const delta = selectedOrder ? correctedTotal - selectedOrder.total_price : 0;
  const errorMessage = (error: unknown) => error instanceof Error ? error.message
    : typeof error === "object" && error && "message" in error ? String(error.message) : "Terjadi kesalahan";

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("order_corrections").select("*, students!order_corrections_student_id_fkey(name,class,nik)", { count: "exact" });
    if (status !== "all") query = query.eq("status", status as OrderCorrection["status"]);
    if (studentId) query = query.eq("student_id", studentId);
    const { data, error, count: total } = await query.order("requested_at", { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    setLoading(false);
    if (error) {
      toast({ variant: "destructive", title: "Gagal memuat koreksi", description: error.message });
      setRows([]); setCount(0); return;
    }
    setRows((data ?? []) as CorrectionRow[]); setCount(total ?? 0);
  }, [page, status, studentId, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!canRequest) return;
    void supabase.from("students").select("id,name,class,nik,parent_id").order("name").then(({ data, error }) => {
      if (error) toast({ variant: "destructive", title: "Gagal memuat siswa", description: error.message });
      else setStudents(data ?? []);
    });
  }, [canRequest, toast]);
  useEffect(() => {
    const initialOrder = params.get("order");
    if (!initialOrder || !canRequest) return;
    void supabase.from("laundry_orders").select("student_id").eq("id", initialOrder).single().then(({ data, error }) => {
      if (error) toast({ variant: "destructive", title: "Tagihan tidak dapat dibuka", description: error.message });
      else if (data) { setStudentId(data.student_id); setOrderId(initialOrder); }
    });
  }, [params, canRequest, toast]);
  useEffect(() => {
    setOrders([]);
    if (!studentId || !canRequest) return;
    void supabase.from("laundry_orders").select("id,student_id,total_price,category,laundry_date")
      .eq("student_id", studentId).in("status", ["DIBAYAR", "SELESAI"]).order("laundry_date", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast({ variant: "destructive", title: "Gagal memuat tagihan lunas", description: error.message });
        else setOrders(data ?? []);
      });
  }, [studentId, canRequest, toast]);

  const act = async (action: () => PromiseLike<{ error: unknown }>, message: string) => {
    setBusy(true);
    try {
      const { error } = await action();
      if (error) throw error;
      toast({ title: message }); setDetail(null); await load();
      return true;
    } catch (error) {
      toast({ variant: "destructive", title: "Tindakan gagal", description: errorMessage(error) }); return false;
    } finally { setBusy(false); }
  };
  const request = async () => {
    const success = await act(() => supabase.rpc("request_order_correction", {
      p_order_id: orderId, p_kind: kind, p_corrected_total: correctedTotal, p_reason: reason.trim(),
      p_replacement_student_id: kind === "wrong_student" ? replacementStudent : null,
    }), "Pengajuan tersimpan. Menunggu tinjauan admin.");
    if (success) { setReason(""); setAmount(""); setOrderId(""); }
  };
  const openDetail = (row: CorrectionRow) => {
    setDetail(row); setReviewNote(""); setVerification(""); setRefund(String(Math.max(0, -row.delta)));
    setRecipient(""); setMethod("cash"); setReference(""); setConsent(false);
  };
  const review = (approve: boolean) => act(() => supabase.rpc("review_order_correction", {
    p_correction_id: detail!.id, p_approve: approve, p_review_note: reviewNote,
    p_verification_reference: verification, p_refund_amount: detail!.delta < 0 ? Number(refund) : null,
    p_recipient_reference: recipient,
  }), approve ? "Koreksi disetujui. Periksa penyelesaian selisih." : "Pengajuan ditolak.");
  const settle = () => act(() => supabase.rpc("settle_order_correction", {
    p_correction_id: detail!.id, p_method: method, p_reference: reference, p_customer_consent: consent,
  }), "Penyelesaian selisih tercatat.");
  const validRequest = !!selectedOrder && reason.trim().length >= 10 && correctedTotal !== selectedOrder.total_price
    && (kind !== "price" || (amount.trim() !== "" && Number.isSafeInteger(correctedTotal) && correctedTotal > 0 && correctedTotal <= 2147483647))
    && (kind !== "wrong_student" || (!!replacementStudent && replacementStudent !== studentId));
  const validReview = reviewNote.trim().length >= 10 && verification.trim().length >= 5
    && (!detail || detail.delta >= 0 || (refund.trim() !== "" && Number.isSafeInteger(Number(refund))
      && Number(refund) >= 0 && Number(refund) <= -detail.delta && recipient.trim().length >= 5));
  const printProof = () => {
    const proof = document.getElementById("correction-proof");
    const printWindow = window.open("", "_blank", "width=800,height=900");
    if (!printWindow || !proof) {
      toast({ variant: "destructive", title: "Jendela cetak tidak terbuka", description: "Izinkan popup untuk mencetak bukti koreksi." });
      return;
    }
    printWindow.opener = null;
    // React escaped all dynamic text before it became this DOM fragment.
    printWindow.document.write(`<html lang="id"><head><title>Bukti Koreksi Laundry</title><style>body{font:14px Arial,sans-serif;line-height:1.6;color:#000;margin:24px}p{white-space:pre-wrap;overflow-wrap:anywhere}h2{font-size:20px}@page{margin:15mm}</style></head><body>${proof.innerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return <>
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Koreksi Tagihan Lunas</h1>
        <p className="text-muted-foreground">Riwayat pembayaran asli tetap tersimpan. Pengembalian dan pembayaran tambahan dicatat terpisah.</p></div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" /><span className="sr-only">Muat ulang</span></Button></div>
      {canRequest && <Card><CardHeader><CardTitle>Ajukan koreksi</CardTitle></CardHeader><CardContent className="space-y-4">
        <Label>Siswa pada tagihan asli</Label><StudentAutocomplete students={students.map(s => ({ ...s, parent_id: s.parent_id ?? "" }))} value={studentId}
          onValueChange={value => { setStudentId(value); setOrderId(""); setPage(0); }} />
        <Label>Tagihan yang sudah dibayar</Label><Select value={orderId} onValueChange={setOrderId}><SelectTrigger><SelectValue placeholder="Pilih tagihan lunas" /></SelectTrigger>
          <SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>{o.laundry_date} · {LAUNDRY_CATEGORIES[o.category as keyof typeof LAUNDRY_CATEGORIES]?.label} · {rupiah(o.total_price)} · {o.id.slice(0, 8)}</SelectItem>)}</SelectContent></Select>
        {studentId && !orders.length && <p className="text-sm text-muted-foreground">Tidak ada tagihan lunas yang dapat dipilih.</p>}
        <Label>Jenis koreksi</Label><Select value={kind} onValueChange={value => setKind(value as OrderCorrection["kind"])}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(correctionKindLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
        {kind === "price" && <div className="space-y-2"><Label htmlFor="corrected-total">Nominal laundry yang benar (tanpa biaya pembayaran)</Label>
          <Input id="corrected-total" type="number" min={1} step={1} value={amount} onChange={e => setAmount(e.target.value)} /></div>}
        {kind === "wrong_student" && <div className="space-y-2"><Label>Siswa yang seharusnya ditagih</Label>
          <StudentAutocomplete students={students.filter(s => s.id !== studentId).map(s => ({ ...s, parent_id: s.parent_id ?? "" }))} value={replacementStudent} onValueChange={setReplacementStudent} />
          <p className="text-sm text-muted-foreground">Setelah disetujui, tagihan pengganti mengikuti tarif saat ini dan persetujuan mitra. Uang pembayar awal diselesaikan terpisah.</p></div>}
        <Label htmlFor="correction-reason">Alasan dan rincian kesalahan (minimal 10 karakter)</Label><Textarea id="correction-reason" maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} />
        {selectedOrder && <div className="rounded-lg bg-muted p-3 text-sm space-y-1"><p>Nominal asli: <strong>{rupiah(selectedOrder.total_price)}</strong></p>
          <p>Setelah koreksi: <strong>{rupiah(correctedTotal)}</strong></p><p>{delta < 0 ? "Kelebihan nominal" : "Tagihan tambahan"}: <strong>{rupiah(Math.abs(delta))}</strong></p>
          {delta < 0 && <p>Jumlah uang yang dikembalikan ditentukan admin setelah memeriksa kuitansi, pembulatan, biaya pembayaran, dan kembalian.</p>}</div>}
        <Button onClick={() => void request()} disabled={busy || !validRequest}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Ajukan koreksi</Button>
      </CardContent></Card>}

      <Card><CardHeader><CardTitle>Riwayat dan penyelesaian koreksi</CardTitle></CardHeader><CardContent className="space-y-4">
        <Select value={status} onValueChange={value => { setStatus(value); setPage(0); }}><SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="all">Semua status</SelectItem>{Object.entries(correctionStatusLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
        </SelectContent></Select>
        {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : rows.length === 0 ? <p className="text-muted-foreground">Belum ada koreksi untuk pilihan ini.</p> :
          rows.map(row => <div key={row.id} className="border rounded-lg p-4 space-y-2">
            <div className="flex flex-wrap justify-between gap-2"><strong>{row.students?.name ?? "Siswa"} · {row.students?.class}</strong><Badge variant="outline">{correctionStatusLabels[row.status]}</Badge></div>
            <p className="text-sm">{correctionKindLabels[row.kind]} · {timestamp(row.requested_at)} · {row.id.slice(0, 8)}</p>
            <p>{rupiah(row.original_total)} → {rupiah(row.corrected_total)}</p>
            {row.status === "approved" && <p className="text-sm font-medium">{row.delta < 0 ? "Pengembalian" : "Pembayaran tambahan"}: {rupiah(row.settlement_due ?? 0)} · {row.settlement_status === "settled" ? "Selesai" : "Belum diselesaikan"}</p>}
            {userRole === "parent" && row.status === "approved" && row.settlement_status === "pending" && <p className="text-sm text-muted-foreground">Hubungi kasir untuk penyelesaian selisih. Pembayaran tambahan pada halaman ini diproses melalui kasir.</p>}
            <Button variant="outline" size="sm" onClick={() => openDetail(row)}>Detail / tindak lanjut</Button>
          </div>)}
        <div className="flex justify-between items-center gap-3"><Button variant="outline" disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)}>Sebelumnya</Button>
          <span className="text-sm">Halaman {page + 1} · {count} koreksi</span><Button variant="outline" disabled={(page + 1) * PAGE_SIZE >= count || loading} onClick={() => setPage(p => p + 1)}>Berikutnya</Button></div>
      </CardContent></Card>
    </div>
    <Dialog open={!!detail} onOpenChange={open => { if (!open && !busy) setDetail(null); }}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Detail Koreksi</DialogTitle><DialogDescription>Periksa tagihan dan bukti pembayaran sebelum menyetujui atau menyelesaikan selisih.</DialogDescription></DialogHeader>
      {detail && <div className="space-y-4">
        <div id="correction-proof" className="space-y-2 text-sm">
          <h2 className="font-bold text-lg">Laundry At-Tauhid · Bukti Koreksi</h2><p>Nomor koreksi: {detail.id}</p><p>Tagihan asli: {detail.order_id}</p>
          <p>Siswa: {detail.students?.name} · {detail.students?.nik} · {detail.students?.class}</p>
          <p>{correctionKindLabels[detail.kind]} · {correctionStatusLabels[detail.status]}</p><p className="whitespace-pre-wrap">Alasan: {detail.reason}</p>
          <p>Nominal asli {rupiah(detail.original_total)} → {rupiah(detail.corrected_total)} (selisih {rupiah(detail.delta)})</p>
          <p>Penyesuaian yayasan: {rupiah(detail.yayasan_delta)} · Mitra: {rupiah(detail.vendor_delta)}</p>
          <p>Pembayaran asli: {String(detail.original_snapshot.payment_method ?? "—")} · {String(detail.original_snapshot.midtrans_order_id ?? "—")}</p>
          <p>Diajukan {timestamp(detail.requested_at)} · Ditinjau {timestamp(detail.reviewed_at)}</p>
          <p className="whitespace-pre-wrap">Catatan admin: {detail.review_note ?? "—"}</p>
          {canRequest && <><p>Verifikasi pembayaran: {detail.verification_reference ?? "—"}</p><p>Penerima pengembalian: {detail.recipient_reference ?? "—"}</p></>}
          {detail.status === "approved" && <><p>{detail.delta < 0 ? "Pengembalian" : "Pembayaran tambahan"}: {rupiah(detail.settlement_due ?? 0)} · {detail.settlement_status === "settled" ? "Selesai" : "Belum selesai"}</p>
            <p>Metode: {detail.settlement_method ?? "—"} · Bukti: {detail.settlement_reference ?? "—"} · {timestamp(detail.settled_at)}</p></>}
          {detail.replacement_order_id && <p>Tagihan pengganti: {detail.replacement_order_id}. Pembayaran awal tidak dipindahkan.</p>}
        </div>
        <Button variant="outline" onClick={printProof}><Printer className="h-4 w-4 mr-2" />Cetak bukti koreksi</Button>
        {userRole === "admin" && detail.status === "pending" && <div className="border-t pt-4 space-y-3">
          <Label htmlFor="review-note">Catatan admin (minimal 10 karakter)</Label><Textarea id="review-note" value={reviewNote} onChange={e => setReviewNote(e.target.value)} />
          <Label htmlFor="verification">Referensi kuitansi / hasil verifikasi pembayaran</Label><Input id="verification" value={verification} onChange={e => setVerification(e.target.value)} />
          {detail.delta < 0 && <><p className="text-sm text-muted-foreground">Periksa kuitansi gabungan jika beberapa tagihan dibayar sekaligus. Nominal pengembalian hanya uang jasa yang benar-benar diterima; biaya pembayaran, diskon pembulatan, dan kembalian tidak otomatis ikut dikembalikan.</p>
            <Label htmlFor="refund">Jumlah pengembalian yang telah diverifikasi</Label><Input id="refund" type="number" min={0} max={-detail.delta} step={1} value={refund} onChange={e => setRefund(e.target.value)} />
            <Label htmlFor="recipient">Pembayar awal / penerima pengembalian yang telah diverifikasi</Label><Input id="recipient" value={recipient} onChange={e => setRecipient(e.target.value)} /></>}
          <div className="flex gap-2"><Button disabled={busy || !validReview} onClick={() => void review(true)}>Setujui koreksi</Button>
            <Button variant="destructive" disabled={busy || reviewNote.trim().length < 10} onClick={() => void review(false)}>Tolak pengajuan</Button></div>
        </div>}
        {canSettle && detail.status === "approved" && detail.settlement_status === "pending" && <div className="border-t pt-4 space-y-3">
          <h3 className="font-semibold">{detail.delta < 0 ? "Selesaikan pengembalian" : "Terima pembayaran tambahan"} · {rupiah(detail.settlement_due ?? 0)}</h3>
          <Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="cash">Tunai</SelectItem><SelectItem value="bank_transfer">Transfer bank</SelectItem><SelectItem value="wadiah">Saldo wadiah</SelectItem>
            {detail.delta < 0 && <SelectItem value="midtrans_manual">Refund melalui dashboard Midtrans</SelectItem>}
          </SelectContent></Select>
          {method !== "wadiah" && <p className="text-sm text-muted-foreground">Tombol ini mencatat uang yang sudah diterima atau dikembalikan. Pastikan penyelesaian berhasil dan masukkan nomor bukti. Tombol ini tidak mengirim uang atau memanggil refund Midtrans.</p>}
          <Label htmlFor="settlement-reference">Nomor bukti / referensi penyelesaian</Label><Input id="settlement-reference" value={reference} onChange={e => setReference(e.target.value)} />
          {method === "wadiah" && <label className="flex items-start gap-2 text-sm"><Checkbox checked={consent} onCheckedChange={value => setConsent(value === true)} />
            Pelanggan menyetujui {detail.delta < 0 ? "pengembalian ke" : "penggunaan"} saldo wadiah siswa pada tagihan asli; bukti persetujuan tercantum pada referensi.</label>}
          <Button disabled={busy || reference.trim().length < 5 || (method === "wadiah" && !consent)} onClick={() => void settle()}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{method === "wadiah" ? "Proses saldo wadiah dan catat" : "Catat penyelesaian yang sudah berhasil"}</Button>
        </div>}
      </div>}
    </DialogContent></Dialog>
  </>;
}
