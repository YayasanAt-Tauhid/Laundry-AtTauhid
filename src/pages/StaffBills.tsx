import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  Receipt,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Package,
} from "lucide-react";
import {
  StaffBillsTable,
  type BillRow,
} from "@/components/staff/StaffBillsTable";
import { LAUNDRY_CATEGORIES, type OrderStatus } from "@/lib/constants";

const PAGE_SIZE = 50;

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

export default function StaffBills() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [bills, setBills] = useState<BillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const fetchBills = useCallback(async () => {
    try {
      setLoading(true);

      let query = supabase.from("laundry_orders").select(
        `
          id,
          category,
          weight_kg,
          item_count,
          price_per_unit,
          total_price,
          yayasan_share,
          vendor_share,
          status,
          notes,
          created_at,
          laundry_date,
          students (name, class, nik),
          laundry_partners (name)
        `,
        { count: "exact" },
      );

      // Apply status filter
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as OrderStatus);
      }

      // Apply category filter
      if (categoryFilter !== "all") {
        query = query.eq(
          "category",
          categoryFilter as keyof typeof LAUNDRY_CATEGORIES,
        );
      }

      // Order by laundry_date descending (newest first)
      query = query.order("laundry_date", { ascending: false });
      query = query.order("created_at", { ascending: false });

      // Apply pagination
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      // Transform data to BillRow format
      const transformedBills: BillRow[] = (data || []).map((order, index) => ({
        id: order.id,
        rowNumber: from + index + 1,
        studentNik: order.students?.nik || "-",
        studentName: order.students?.name || "-",
        studentClass: order.students?.class || "-",
        partnerName: order.laundry_partners?.name || "-",
        laundryDate: order.laundry_date,
        category: order.category,
        weightKg: order.weight_kg,
        itemCount: order.item_count,
        pricePerUnit: order.price_per_unit,
        totalPrice: order.total_price,
        yayasanShare: order.yayasan_share,
        vendorShare: order.vendor_share,
        status: order.status as OrderStatus,
        notes: order.notes,
        createdAt: order.created_at,
      }));

      setBills(transformedBills);
      setTotalCount(count || 0);
    } catch (error) {
      console.error("Error fetching bills:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal memuat data tagihan",
      });
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, categoryFilter, toast]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [statusFilter, categoryFilter]);

  // Filter bills by search term (client-side)
  const filteredBills = bills.filter((bill) => {
    if (!searchTerm.trim()) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      bill.studentNik.toLowerCase().includes(searchLower) ||
      bill.studentName.toLowerCase().includes(searchLower) ||
      bill.studentClass.toLowerCase().includes(searchLower) ||
      bill.partnerName.toLowerCase().includes(searchLower)
    );
  });

  // Calculate summary stats
  const summaryStats = {
    totalBills: filteredBills.length,
    totalAmount: filteredBills.reduce((sum, b) => sum + b.totalPrice, 0),
    totalYayasan: filteredBills.reduce((sum, b) => sum + b.yayasanShare, 0),
    totalVendor: filteredBills.reduce((sum, b) => sum + b.vendorShare, 0),
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Receipt className="h-6 w-6" />
              Daftar Tagihan
            </h1>
            <p className="text-muted-foreground mt-1">
              Lihat semua tagihan laundry yang telah diinput
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchBills}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button asChild>
              <Link to="/orders/bulk">
                <Plus className="h-4 w-4 mr-2" />
                Input Bulk
              </Link>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari NIK, nama siswa, kelas, atau mitra..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="MENUNGGU_APPROVAL_MITRA">
                Menunggu Approval
              </SelectItem>
              <SelectItem value="DISETUJUI_MITRA">Disetujui Mitra</SelectItem>
              <SelectItem value="MENUNGGU_PEMBAYARAN">
                Menunggu Pembayaran
              </SelectItem>
              <SelectItem value="DIBAYAR">Dibayar</SelectItem>
              <SelectItem value="SELESAI">Selesai</SelectItem>
              <SelectItem value="DITOLAK_MITRA">Ditolak</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kategori</SelectItem>
              {Object.entries(LAUNDRY_CATEGORIES).map(([key, cat]) => (
                <SelectItem key={key} value={key}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Tagihan</p>
                  <p className="text-xl font-bold">{summaryStats.totalBills}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-950">
                  <Receipt className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Nilai</p>
                  <p className="text-lg font-bold">
                    {formatCurrency(summaryStats.totalAmount)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div>
                <p className="text-sm text-muted-foreground">Bagian Yayasan</p>
                <p className="text-lg font-bold text-green-600">
                  {formatCurrency(summaryStats.totalYayasan)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div>
                <p className="text-sm text-muted-foreground">Bagian Vendor</p>
                <p className="text-lg font-bold text-blue-600">
                  {formatCurrency(summaryStats.totalVendor)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Data Tagihan</CardTitle>
              <Badge variant="outline">{totalCount} tagihan ditemukan</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <StaffBillsTable bills={filteredBills} isLoading={loading} />
          </CardContent>

          {/* Pagination */}
          {totalCount > PAGE_SIZE && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-border">
              <div className="text-sm text-muted-foreground">
                Menampilkan {currentPage * PAGE_SIZE + 1} -{" "}
                {Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} dari{" "}
                {totalCount} tagihan
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
                  Halaman {currentPage + 1} dari {totalPages}
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
      </div>
    </DashboardLayout>
  );
}
