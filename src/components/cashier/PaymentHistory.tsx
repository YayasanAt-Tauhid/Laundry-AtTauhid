import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { History, Loader2, Receipt, ChevronLeft, ChevronRight } from "lucide-react";
import { LAUNDRY_CATEGORIES } from "@/lib/constants";
import type { OrderStatus } from "@/lib/constants";

interface PaymentHistoryItem {
  id: string;
  category: string;
  weight_kg: number | null;
  item_count: number | null;
  total_price: number;
  payment_method: string | null;
  status: OrderStatus;
  paid_at: string | null;
  laundry_date: string;
  wadiah_used: number | null;
  students: {
    name: string;
    class: string;
    nik: string;
  };
  laundry_partners: {
    name: string;
  };
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);

const formatDateTime = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
};

const formatPaymentMethod = (method: string | null) => {
  switch (method) {
    case "cash":
      return "Tunai";
    case "bank_transfer":
      return "Transfer";
    case "midtrans":
      return "Midtrans";
    default:
      return method || "-";
  }
};

interface PaymentHistoryProps {
  studentId?: string;
}

export function PaymentHistory({ studentId }: PaymentHistoryProps) {
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 10;

  // Reset page when student changes
  useEffect(() => { setCurrentPage(0); }, [studentId]);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!studentId) {
        setPayments([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("laundry_orders")
          .select(
            `id, category, weight_kg, item_count, total_price, payment_method, status, paid_at, laundry_date, wadiah_used,
             students (name, class, nik),
             laundry_partners (name)`
          )
          .eq("student_id", studentId)
          .in("status", ["DIBAYAR", "SELESAI"])
          .order("paid_at", { ascending: false })
          .limit(50);

        if (error) {
          console.error("PaymentHistory query error:", error);
          throw error;
        }
        setPayments(data || []);
      } catch (err) {
        console.error("Error fetching payment history:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();

    const channel = supabase
      .channel("cashier-payment-history")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "laundry_orders" },
        () => fetchHistory()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [studentId]);

  const totalPaid = payments.reduce((sum, p) => sum + p.total_price, 0);
  const totalWadiah = payments.reduce((sum, p) => sum + (p.wadiah_used || 0), 0);
  const totalPages = Math.ceil(payments.length / pageSize);
  const paginatedPayments = useMemo(
    () => payments.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
    [payments, currentPage, pageSize]
  );

  if (!studentId) return null;

  return (
    <Card className="dashboard-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Riwayat Pembayaran
          </CardTitle>
          <div className="flex items-center gap-2">
            {totalWadiah > 0 && (
              <Badge variant="outline" className="text-xs">
                Wadiah: {formatCurrency(totalWadiah)}
              </Badge>
            )}
            <Badge variant="secondary" className="font-mono">
              {payments.length} transaksi • {formatCurrency(totalPaid)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Memuat riwayat...</span>
          </div>
        ) : payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Receipt className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Belum ada riwayat pembayaran untuk siswa ini</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Mitra</TableHead>
                    <TableHead>Metode</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Wadiah</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPayments.map((p, idx) => {
                    const isKiloan = p.category === "kiloan";
                    return (
                      <TableRow key={p.id} className="hover:bg-muted/30">
                        <TableCell className="text-center text-muted-foreground font-mono text-sm">
                          {currentPage * pageSize + idx + 1}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {p.paid_at ? formatDateTime(p.paid_at) : "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {LAUNDRY_CATEGORIES[p.category as keyof typeof LAUNDRY_CATEGORIES]?.label || p.category}
                        </TableCell>
                        <TableCell className="text-sm">
                          {isKiloan ? `${p.weight_kg} kg` : `${p.item_count} pcs`}
                        </TableCell>
                        <TableCell className="text-sm">
                          {p.laundry_partners?.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {formatPaymentMethod(p.payment_method)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          {formatCurrency(p.total_price)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {p.wadiah_used ? formatCurrency(p.wadiah_used) : "-"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={p.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  {currentPage * pageSize + 1} - {Math.min((currentPage + 1) * pageSize, payments.length)} dari {payments.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Sebelumnya
                  </Button>
                  <span className="px-3 py-1 rounded-md bg-muted text-sm font-medium">{currentPage + 1} / {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage + 1 >= totalPages}>
                    Selanjutnya <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
