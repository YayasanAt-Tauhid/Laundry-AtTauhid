import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  ClipboardList,
  Loader2,
  CheckCircle,
  XCircle,
  Eye,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { LAUNDRY_CATEGORIES, type OrderStatus } from "@/lib/constants";

interface Order {
  id: string;
  category: string;
  weight_kg: number | null;
  item_count: number | null;
  price_per_unit: number;
  total_price: number;
  yayasan_share: number;
  vendor_share: number;
  status: OrderStatus;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  laundry_date: string;
  students: {
    name: string;
    class: string;
    nik: string;
  };
  laundry_partners: {
    name: string;
  };
}

const PAGE_SIZE = 20;

export default function Orders() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    fetchOrders();
  }, [user, userRole, currentPage]);

  // Reset to first page when search term changes
  useEffect(() => {
    setCurrentPage(0);
  }, [searchTerm]);

  const fetchOrders = async () => {
    try {
      setLoading(true);

      // Build base query
      let query = supabase.from("laundry_orders").select(
        `
          *,
          laundry_date,
          students (name, class, nik),
          laundry_partners (name)
        `,
        { count: "exact" },
      );

      // Apply search filter on server side if search term exists
      if (searchTerm.trim()) {
        // We'll filter on client side for complex joins, but limit server fetch
        query = query.order("created_at", { ascending: false });
      } else {
        // Paginate only when not searching
        const from = currentPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        query = query.order("created_at", { ascending: false }).range(from, to);
      }

      const { data, error, count } = await query;

      if (error) throw error;
      setOrders(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memuat data order",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (order: Order) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from("laundry_orders")
        .update({
          status: "DISETUJUI_MITRA",
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
        })
        .eq("id", order.id);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: "Order telah disetujui",
      });

      fetchOrders();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error ? error.message : "Gagal menyetujui order",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedOrder || !rejectionReason.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Alasan penolakan wajib diisi",
      });
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase
        .from("laundry_orders")
        .update({
          status: "DITOLAK_MITRA",
          rejection_reason: rejectionReason,
        })
        .eq("id", selectedOrder.id);

      if (error) throw error;

      toast({
        title: "Order Ditolak",
        description: "Order telah ditolak",
      });

      setRejectDialogOpen(false);
      setRejectionReason("");
      setSelectedOrder(null);
      fetchOrders();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error ? error.message : "Gagal menolak order",
      });
    } finally {
      setProcessing(false);
    }
  };

  const openRejectDialog = (order: Order) => {
    setSelectedOrder(order);
    setRejectDialogOpen(true);
  };

  const openDetailDialog = (order: Order) => {
    setSelectedOrder(order);
    setDetailDialogOpen(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatLaundryDate = (date: string) => {
    return new Date(date + "T00:00:00").toLocaleDateString("id-ID", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const filteredOrders = orders.filter((order) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      order.students?.name?.toLowerCase().includes(searchLower) ||
      order.students?.class?.toLowerCase().includes(searchLower) ||
      order.students?.nik?.toLowerCase().includes(searchLower) ||
      order.laundry_partners?.name?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Daftar Order</h1>
            <p className="text-muted-foreground mt-1">
              {userRole === "partner"
                ? "Order yang perlu Anda approve"
                : "Kelola semua order laundry"}
            </p>
          </div>

          {userRole === "staff" && (
            <Button asChild>
              <Link to="/orders/new">
                <Plus className="h-4 w-4 mr-2" />
                Input Order Baru
              </Link>
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari NIK, nama siswa, kelas, atau mitra..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Orders - Responsive Layout */}
        <Card className="dashboard-card">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <ClipboardList className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Belum ada order
                </h3>
                <p className="text-muted-foreground text-center mb-4">
                  {searchTerm
                    ? "Tidak ditemukan order yang sesuai"
                    : "Order laundry akan muncul di sini"}
                </p>
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="block lg:hidden divide-y divide-border">
                  {filteredOrders.map((order) => (
                    <div key={order.id} className="p-4 space-y-3">
                      {/* Header: Student Info & Status */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {order.students?.nik}
                            </span>
                            <h3 className="font-semibold text-foreground truncate">
                              {order.students?.name}
                            </h3>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Kelas {order.students?.class}
                          </p>
                        </div>
                        <StatusBadge status={order.status} />
                      </div>

                      {/* Order Details */}
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-muted/50 text-muted-foreground">
                          {LAUNDRY_CATEGORIES[
                            order.category as keyof typeof LAUNDRY_CATEGORIES
                          ]?.label || order.category}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">
                          {order.category === "kiloan"
                            ? `${order.weight_kg} kg`
                            : `${order.item_count} pcs`}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className="font-semibold text-primary">
                          {formatCurrency(order.total_price)}
                        </span>
                      </div>

                      {/* Partner & Date */}
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>Mitra: {order.laundry_partners?.name}</span>
                        <span>📅 {formatLaundryDate(order.laundry_date)}</span>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => openDetailDialog(order)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Detail
                        </Button>

                        {userRole === "partner" &&
                          order.status === "MENUNGGU_APPROVAL_MITRA" && (
                            <>
                              <Button
                                size="sm"
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => handleApprove(order)}
                                disabled={processing}
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Setujui
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="flex-1"
                                onClick={() => openRejectDialog(order)}
                                disabled={processing}
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Tolak
                              </Button>
                            </>
                          )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                          NIK / Siswa
                        </th>
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                          Kelas
                        </th>
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                          Mitra
                        </th>
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                          Kategori
                        </th>
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                          Jumlah
                        </th>
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                          Total
                        </th>
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                          Status
                        </th>
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                          Tgl Laundry
                        </th>
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                          Aksi
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order) => (
                        <tr
                          key={order.id}
                          className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                        >
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {order.students?.nik}
                              </span>
                              <span className="font-medium">
                                {order.students?.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-muted-foreground">
                            {order.students?.class}
                          </td>
                          <td className="py-4 px-6 text-muted-foreground">
                            {order.laundry_partners?.name}
                          </td>
                          <td className="py-4 px-6">
                            {LAUNDRY_CATEGORIES[
                              order.category as keyof typeof LAUNDRY_CATEGORIES
                            ]?.label || order.category}
                          </td>
                          <td className="py-4 px-6">
                            {order.category === "kiloan"
                              ? `${order.weight_kg} kg`
                              : `${order.item_count} pcs`}
                          </td>
                          <td className="py-4 px-6 font-medium">
                            {formatCurrency(order.total_price)}
                          </td>
                          <td className="py-4 px-6">
                            <StatusBadge status={order.status} />
                          </td>
                          <td className="py-4 px-6 text-muted-foreground">
                            {formatLaundryDate(order.laundry_date)}
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openDetailDialog(order)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>

                              {userRole === "partner" &&
                                order.status === "MENUNGGU_APPROVAL_MITRA" && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-success hover:text-success"
                                      onClick={() => handleApprove(order)}
                                      disabled={processing}
                                    >
                                      <CheckCircle className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-destructive hover:text-destructive"
                                      onClick={() => openRejectDialog(order)}
                                      disabled={processing}
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>

          {/* Pagination */}
          {!searchTerm.trim() && totalCount > PAGE_SIZE && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-border">
              <div className="text-sm text-muted-foreground">
                Menampilkan {currentPage * PAGE_SIZE + 1} -{" "}
                {Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} dari{" "}
                {totalCount} order
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0 || loading}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Sebelumnya
                </Button>
                <div className="flex items-center gap-1 px-3 py-1 rounded-md bg-muted text-sm font-medium">
                  Halaman {currentPage + 1} dari{" "}
                  {Math.ceil(totalCount / PAGE_SIZE)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={
                    (currentPage + 1) * PAGE_SIZE >= totalCount || loading
                  }
                >
                  Selanjutnya
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Detail Dialog */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Detail Order</DialogTitle>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Siswa</p>
                    <p className="font-medium">
                      {selectedOrder.students?.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Kelas</p>
                    <p className="font-medium">
                      {selectedOrder.students?.class}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Mitra Laundry
                    </p>
                    <p className="font-medium">
                      {selectedOrder.laundry_partners?.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Kategori</p>
                    <p className="font-medium">
                      {
                        LAUNDRY_CATEGORIES[
                          selectedOrder.category as keyof typeof LAUNDRY_CATEGORIES
                        ]?.label
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Jumlah</p>
                    <p className="font-medium">
                      {selectedOrder.category === "kiloan"
                        ? `${selectedOrder.weight_kg} kg`
                        : `${selectedOrder.item_count} pcs`}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Harga Satuan
                    </p>
                    <p className="font-medium">
                      {formatCurrency(selectedOrder.price_per_unit)}
                    </p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Total Harga
                      </p>
                      <p className="text-xl font-bold text-primary">
                        {formatCurrency(selectedOrder.total_price)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <StatusBadge status={selectedOrder.status} />
                    </div>
                  </div>
                </div>

                {userRole === "admin" && (
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium mb-2">Bagi Hasil</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-sm text-muted-foreground">Yayasan</p>
                        <p className="font-bold">
                          {formatCurrency(selectedOrder.yayasan_share)}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-sm text-muted-foreground">Vendor</p>
                        <p className="font-bold">
                          {formatCurrency(selectedOrder.vendor_share)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedOrder.rejection_reason && (
                  <div className="border-t pt-4">
                    <p className="text-sm text-muted-foreground">
                      Alasan Penolakan
                    </p>
                    <p className="text-destructive font-medium">
                      {selectedOrder.rejection_reason}
                    </p>
                  </div>
                )}

                {selectedOrder.notes && (
                  <div className="border-t pt-4">
                    <p className="text-sm text-muted-foreground">Catatan</p>
                    <p className="font-medium">{selectedOrder.notes}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tolak Order</DialogTitle>
              <DialogDescription>
                Berikan alasan penolakan untuk order ini
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reason">Alasan Penolakan</Label>
                <Textarea
                  id="reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Masukkan alasan penolakan..."
                  rows={3}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setRejectDialogOpen(false)}
                >
                  Batal
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={processing || !rejectionReason.trim()}
                >
                  {processing && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Tolak Order
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
