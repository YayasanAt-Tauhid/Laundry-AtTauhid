import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLaundryPrices } from "@/hooks/useLaundryPrices";
import { LAUNDRY_CATEGORIES, ORDER_STATUS, type LaundryCategory } from "@/lib/constants";
import { rupiah } from "@/types/order-corrections";
import type { UnpaidOrderRevision } from "@/types/unpaid-order-revisions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StudentAutocomplete } from "@/components/ui/StudentAutocomplete";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";

type Student = { id: string; name: string; class: string; nik: string; parent_id: string | null; is_active: boolean };
type Partner = { id: string; name: string };
type Order = Database["public"]["Tables"]["laundry_orders"]["Row"];
type History = UnpaidOrderRevision & { before_student: { name: string; class: string } | null; after_student: { name: string; class: string } | null };
const UNPAID = ["DRAFT", "MENUNGGU_APPROVAL_MITRA", "DITOLAK_MITRA", "DISETUJUI_MITRA", "MENUNGGU_PEMBAYARAN"] as const;
const timestamp = (s: string) => new Date(s).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

export function UnpaidOrderCorrections() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const { getPrice, isLoading: priceLoading, isFromDatabase } = useLaundryPrices();
  const canEdit = ["admin", "staff", "cashier"].includes(userRole ?? "");
  const [students, setStudents] = useState<Student[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [filterStudent, setFilterStudent] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [student, setStudent] = useState("");
  const [partner, setPartner] = useState("");
  const [category, setCategory] = useState<LaundryCategory>("kiloan");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [history, setHistory] = useState<History[]>([]);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const choose = useCallback((o: Order) => {
    setSelected(o); setStudent(o.student_id); setPartner(o.partner_id); setCategory(o.category);
    setQuantity(String(o.category === "kiloan" ? o.weight_kg ?? "" : o.item_count ?? ""));
    setDate(o.laundry_date); setNotes(o.notes ?? ""); setReason(""); setCancelReason(""); setCancelOpen(false);
  }, []);
  const showError = useCallback((message: string) => toast({ variant: "destructive", title: "Tagihan belum dibayar", description: message }), [toast]);

  useEffect(() => {
    if (!canEdit) return;
    let active = true;
    void (async () => {
      const all: Student[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from("students").select("id,name,class,nik,parent_id,is_active").order("id").range(offset, offset + 499);
        if (error) { if (active) showError(error.message); return; }
        all.push(...(data ?? []));
        if ((data?.length ?? 0) < 500) break;
      }
      if (active) setStudents(all.sort((a, b) => a.name.localeCompare(b.name)));
      const { data, error } = await supabase.from("laundry_partners").select("id,name").eq("is_active", true).order("name");
      if (active) { if (error) showError(error.message); else setPartners(data ?? []); }
    })();
    return () => { active = false; };
  }, [canEdit, showError]);

  const loadOrders = useCallback(async () => {
    if (!canEdit || !filterStudent) { setOrders([]); return; }
    const { data, error } = await supabase.from("laundry_orders").select("*").eq("student_id", filterStudent)
      .in("status", [...UNPAID]).order("laundry_date", { ascending: false });
    if (error) showError(error.message); else setOrders(data ?? []);
  }, [canEdit, filterStudent, showError]);
  useEffect(() => { void loadOrders(); }, [loadOrders]);
  useEffect(() => {
    const id = params.get("order");
    if (!canEdit || !id || params.get("mode") !== "unpaid") return;
    let active = true;
    void supabase.from("laundry_orders").select("*").eq("id", id).in("status", [...UNPAID]).single().then(({ data, error }) => {
      if (!active) return;
      if (error) showError("Tagihan tidak ditemukan atau sudah dibayar.");
      else { setFilterStudent(data.student_id); choose(data); }
    });
    return () => { active = false; };
  }, [canEdit, params, choose, showError]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const { data, error, count: total } = await supabase.from("unpaid_order_revisions")
      .select("*,before_student:students!unpaid_order_revisions_old_student_id_fkey(name,class),after_student:students!unpaid_order_revisions_new_student_id_fkey(name,class)", { count: "exact" })
      .order("corrected_at", { ascending: false }).range(page * 25, page * 25 + 24);
    setLoading(false);
    if (error) { showError(error.message); setHistory([]); setCount(0); }
    else { setHistory((data ?? []) as History[]); setCount(total ?? 0); }
  }, [page, showError]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const q = Number(quantity);
  const estimate = Math.round(q * getPrice(category));
  const gatewayBlocked = !!(selected?.midtrans_order_id || selected?.midtrans_snap_token);
  const fundsBlocked = !!selected && (selected.paid_at !== null || selected.paid_by !== null ||
    (selected.paid_amount ?? 0) !== 0 || (selected.wadiah_used ?? 0) !== 0 || (selected.change_amount ?? 0) !== 0 || (selected.rounding_applied ?? 0) !== 0);
  const valid = !!selected && !!student && !!partner && !!date && Number.isFinite(q) && q > 0 && q <= 100000
    && (category === "kiloan" || Number.isInteger(q)) && reason.trim().length >= 10 && !gatewayBlocked && !fundsBlocked && isFromDatabase;
  const cancelValid = !!selected && cancelReason.trim().length >= 10 && !gatewayBlocked && !fundsBlocked;
  const save = async () => {
    if (!selected || !valid) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("correct_unpaid_order", {
        p_order_id: selected.id, p_expected_updated_at: selected.updated_at, p_student_id: student,
        p_partner_id: partner, p_category: category, p_quantity: q, p_laundry_date: date,
        p_notes: notes.trim() || null, p_reason: reason.trim(),
      });
      if (error) throw error;
      toast({ title: "Koreksi tersimpan", description: "Tagihan menunggu persetujuan mitra. Riwayat sebelum dan sesudah tersimpan." });
      setSelected(null); setReason(""); await Promise.all([loadOrders(), loadHistory()]);
    } catch (error) {
      showError(typeof error === "object" && error && "message" in error ? String(error.message) : "Gagal menyimpan koreksi.");
    } finally { setBusy(false); }
  };
  const cancelOrder = async () => {
    if (!selected || !cancelValid) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("cancel_unpaid_order", {
        p_order_id: selected.id,
        p_expected_updated_at: selected.updated_at,
        p_reason: cancelReason.trim(),
      });
      if (error) throw error;
      toast({ title: "Tagihan dibatalkan", description: "Tagihan tidak lagi aktif. Data asli dan alasan pembatalan tetap tersimpan dalam riwayat." });
      setCancelOpen(false); setSelected(null); setCancelReason(""); setReason("");
      await Promise.all([loadOrders(), loadHistory()]);
    } catch (error) {
      showError(typeof error === "object" && error && "message" in error ? String(error.message) : "Gagal membatalkan tagihan.");
    } finally { setBusy(false); }
  };
  const pickerStudents = students.map(s => ({ ...s, parent_id: s.parent_id ?? "" }));
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Koreksi / Batalkan Tagihan Belum Dibayar</h1>
      <p className="text-muted-foreground">Perbaiki rincian laundry atau batalkan tagihan yang memang salah input. Pembatalan menyimpan data asli sebagai histori, bukan menghapus permanen.</p></div>
    {canEdit && <Card><CardHeader><CardTitle>Pilih dan perbaiki tagihan</CardTitle></CardHeader><CardContent className="space-y-4">
      <Label>Siswa pada tagihan saat ini</Label><StudentAutocomplete students={pickerStudents} value={filterStudent}
        onValueChange={value => { setFilterStudent(value); setSelected(null); }} />
      <Label>Tagihan belum dibayar</Label><Select value={selected?.id ?? ""} onValueChange={id => { const o = orders.find(x => x.id === id); if (o) choose(o); }}>
        <SelectTrigger><SelectValue placeholder="Pilih tagihan" /></SelectTrigger><SelectContent>{orders.map(o =>
          <SelectItem key={o.id} value={o.id}>{o.laundry_date} · {LAUNDRY_CATEGORIES[o.category].label} · {rupiah(o.total_price)} · {o.id.slice(0, 8)}</SelectItem>)}</SelectContent></Select>
      {filterStudent && orders.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada tagihan belum dibayar.</p>}
      {selected && <>
        <div className="bg-muted rounded-lg p-3 text-sm">Status saat ini: {ORDER_STATUS[selected.status].label} · Nominal lama: {rupiah(selected.total_price)}</div>
        {gatewayBlocked && <p className="text-sm text-destructive">Tautan Midtrans masih terkait. Tunggu pembayaran selesai atau notifikasi kedaluwarsa/pembatalan. Jangan mengubah nominal saat pembayaran masih berjalan.</p>}
        {fundsBlocked && <p className="text-sm text-destructive">Tagihan memiliki jejak pembayaran atau penggunaan wadiah. Minta admin melakukan rekonsiliasi terlebih dahulu.</p>}
        <Label>Siswa yang benar</Label><StudentAutocomplete students={pickerStudents.filter(s => s.is_active)} value={student} onValueChange={setStudent} />
        <Label>Mitra laundry</Label><Select value={partner} onValueChange={setPartner}><SelectTrigger><SelectValue placeholder="Pilih mitra aktif" /></SelectTrigger>
          <SelectContent>{partners.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
        <Label>Kategori</Label><Select value={category} onValueChange={value => setCategory(value as LaundryCategory)}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(LAUNDRY_CATEGORIES).map(([key, v]) => <SelectItem key={key} value={key}>{v.label}</SelectItem>)}</SelectContent></Select>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="revision-quantity">{category === "kiloan" ? "Berat (kg)" : "Jumlah (pcs)"}</Label>
          <Input id="revision-quantity" type="number" min={category === "kiloan" ? 0.01 : 1} step={category === "kiloan" ? "any" : 1} value={quantity} onChange={e => setQuantity(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="revision-date">Tanggal laundry</Label><Input id="revision-date" type="date" value={date} onChange={e => setDate(e.target.value)} /></div></div>
        <Label htmlFor="revision-notes">Catatan laundry</Label><Textarea id="revision-notes" maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} />
        <Label htmlFor="revision-reason">Alasan koreksi (minimal 10 karakter)</Label><Textarea id="revision-reason" maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} />
        <p className="text-sm">Perkiraan nominal baru: <strong>{isFromDatabase && Number.isFinite(estimate) ? rupiah(estimate) : "Tarif belum tersedia"}</strong>.
          Nominal akhir dan bagi hasil dihitung oleh sistem. Setelah disimpan, mitra perlu menyetujui rincian baru sebelum pembayaran.</p>
        <Button disabled={busy || priceLoading || !valid} onClick={() => void save()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan koreksi dan ajukan ke mitra</Button>
        <div className="border-t pt-4 space-y-3">
          <div><p className="font-medium">Tagihan ini seharusnya tidak ada?</p>
            <p className="text-sm text-muted-foreground">Batalkan tagihan agar tidak lagi menjadi kewajiban siswa. Data asli tetap tersimpan untuk audit.</p></div>
          <Label htmlFor="cancel-reason">Alasan pembatalan (minimal 10 karakter)</Label>
          <Textarea id="cancel-reason" maxLength={2000} value={cancelReason} onChange={e => setCancelReason(e.target.value)}
            placeholder="Contoh: tagihan terinput dua kali untuk cucian yang sama" />
          <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={busy || !cancelValid}>Batalkan tagihan</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Batalkan tagihan ini?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tagihan akan berstatus Dibatalkan dan tidak lagi masuk tunggakan atau tagihan aktif. Data asli, nominal, pelaku, waktu, dan alasan tetap disimpan sebagai histori.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Kembali</AlertDialogCancel>
                <AlertDialogAction
                  disabled={busy || !cancelValid}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={e => { e.preventDefault(); void cancelOrder(); }}
                >
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ya, batalkan tagihan
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </>}
    </CardContent></Card>}
    <Card><CardHeader><CardTitle>Riwayat perubahan tagihan</CardTitle></CardHeader><CardContent className="space-y-4">
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : history.length === 0 ? <p className="text-muted-foreground">Belum ada koreksi tagihan belum dibayar.</p> : history.map(r =>
        <div key={r.id} className="border rounded-lg p-4 text-sm space-y-2">
          <p className="font-semibold">{String(r.after_snapshot.status) === "DIBATALKAN"
            ? `Pembatalan · ${r.before_student?.name ?? "Siswa"}`
            : `${r.before_student?.name ?? "Siswa pada tagihan lama"} → ${r.after_student?.name ?? "Siswa pada tagihan baru"}`}</p>
          <p>{timestamp(r.corrected_at)} · Tagihan {r.order_id.slice(0, 8)}</p>
          <p>{String(r.after_snapshot.status) === "DIBATALKAN"
            ? `Nominal dibatalkan: ${rupiah(Number(r.before_snapshot.total_price))}`
            : `${rupiah(Number(r.before_snapshot.total_price))} → ${rupiah(Number(r.after_snapshot.total_price))}`}</p>
          <p>{String(r.before_snapshot.category)} · {String(r.before_snapshot.weight_kg ?? r.before_snapshot.item_count)} → {String(r.after_snapshot.category)} · {String(r.after_snapshot.weight_kg ?? r.after_snapshot.item_count)}</p>
          <p>Tanggal laundry: {String(r.before_snapshot.laundry_date)} → {String(r.after_snapshot.laundry_date)}</p>
          <p className="whitespace-pre-wrap">Alasan: {r.reason}</p>
          <p>{String(r.after_snapshot.status) === "DIBATALKAN"
            ? "Status: Dibatalkan. Data asli tetap tersimpan dan tagihan tidak aktif."
            : "Setelah koreksi: Menunggu Persetujuan Mitra."}</p>
        </div>)}
      <div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)}>Sebelumnya</Button>
        <span className="text-sm">Halaman {page + 1} · {count} koreksi</span><Button variant="outline" disabled={(page + 1) * 25 >= count || loading} onClick={() => setPage(p => p + 1)}>Berikutnya</Button></div>
    </CardContent></Card>
  </div>;
}
