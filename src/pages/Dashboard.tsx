import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import {
  Package,
  Users,
  Receipt,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
} from "lucide-react";
import { LAUNDRY_CATEGORIES, type OrderStatus } from "@/lib/constants";

interface DashboardStats {
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  totalRevenue: number;
  studentsCount: number;
}

interface RecentOrder {
  id: string;
  student_name: string;
  student_class: string;
  category: string;
  total_price: number;
  status: OrderStatus;
  laundry_date: string;
}

export default function Dashboard() {
  const { userRole, profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalOrders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    totalRevenue: 0,
    studentsCount: 0,
  });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [userRole]);

  const fetchDashboardData = async () => {
    try {
      // Fetch orders based on role
      const { data: ordersData, error: ordersError } = await supabase
        .from("laundry_orders")
        .select(
          `
          id,
          category,
          total_price,
          status,
          laundry_date,
          students (
            name,
            class
          )
        `,
        )
        .order("laundry_date", { ascending: false })
        .limit(10);

      if (ordersError) throw ordersError;

      const orders = ordersData || [];

      // Calculate stats
      const totalOrders = orders.length;
      const pendingOrders = orders.filter((o) =>
        ["MENUNGGU_APPROVAL_MITRA", "MENUNGGU_PEMBAYARAN"].includes(o.status),
      ).length;
      const completedOrders = orders.filter((o) =>
        ["DIBAYAR", "SELESAI"].includes(o.status),
      ).length;
      const totalRevenue = orders
        .filter((o) => ["DIBAYAR", "SELESAI"].includes(o.status))
        .reduce((sum, o) => sum + (o.total_price || 0), 0);

      // Fetch students count for parent
      let studentsCount = 0;
      if (userRole === "parent") {
        const { count } = await supabase
          .from("students")
          .select("*", { count: "exact", head: true });
        studentsCount = count || 0;
      }

      setStats({
        totalOrders,
        pendingOrders,
        completedOrders,
        totalRevenue,
        studentsCount,
      });

      // Format recent orders
      const formattedOrders: RecentOrder[] = orders
        .slice(0, 5)
        .map((order) => ({
          id: order.id,
          student_name: order.students?.name || "-",
          student_class: order.students?.class || "-",
          category: order.category,
          total_price: order.total_price,
          status: order.status as OrderStatus,
          laundry_date: order.laundry_date,
        }));

      setRecentOrders(formattedOrders);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
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

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Selamat Datang, {profile?.full_name?.split(" ")[0] || "Pengguna"}!
              👋
            </h1>
            <p className="text-muted-foreground mt-1">
              Berikut ringkasan aktivitas laundry hari ini
            </p>
          </div>

          {userRole === "parent" && (
            <Button asChild>
              <Link to="/students">
                <Plus className="h-4 w-4 mr-2" />
                Tambah Siswa
              </Link>
            </Button>
          )}

          {userRole === "staff" && (
            <Button asChild>
              <Link to="/orders/new">
                <Plus className="h-4 w-4 mr-2" />
                Input Laundry
              </Link>
            </Button>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {userRole === "parent" && (
            <StatsCard
              title="Jumlah Siswa"
              value={stats.studentsCount}
              icon={<Users className="h-6 w-6" />}
              subtitle="siswa terdaftar"
            />
          )}

          <StatsCard
            title="Total Order"
            value={stats.totalOrders}
            icon={<Package className="h-6 w-6" />}
            subtitle="semua order"
          />

          <StatsCard
            title="Menunggu Proses"
            value={stats.pendingOrders}
            icon={<Clock className="h-6 w-6" />}
            subtitle="perlu tindakan"
          />

          <StatsCard
            title="Selesai"
            value={stats.completedOrders}
            icon={<CheckCircle className="h-6 w-6" />}
            subtitle="sudah dibayar"
          />

          {(userRole === "admin" || userRole === "parent") && (
            <StatsCard
              title="Total Pendapatan"
              value={formatCurrency(stats.totalRevenue)}
              icon={<TrendingUp className="h-6 w-6" />}
              subtitle="dari order selesai"
            />
          )}
        </div>

        {/* Recent Orders */}
        <Card className="dashboard-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold">
              Order Terbaru
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/orders">Lihat Semua</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-pulse text-muted-foreground">
                  Memuat data...
                </div>
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">Belum ada order</p>
                {userRole === "staff" && (
                  <Button asChild className="mt-4" variant="outline">
                    <Link to="/orders/new">Input Order Pertama</Link>
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Siswa
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Kelas
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Kategori
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Total
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Tanggal
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3 px-4 font-medium">
                          {order.student_name}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {order.student_class}
                        </td>
                        <td className="py-3 px-4">
                          {LAUNDRY_CATEGORIES[
                            order.category as keyof typeof LAUNDRY_CATEGORIES
                          ]?.label || order.category}
                        </td>
                        <td className="py-3 px-4 font-medium">
                          {formatCurrency(order.total_price)}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={order.status} />
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {formatDate(order.laundry_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
