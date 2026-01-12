import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  FileText,
  Loader2,
  TrendingUp,
  Users,
  Package,
  DollarSign,
  Download,
} from 'lucide-react';
import { LAUNDRY_CATEGORIES } from '@/lib/constants';

interface ReportData {
  totalOrders: number;
  totalRevenue: number;
  yayasanRevenue: number;
  vendorRevenue: number;
  ordersByCategory: Record<string, { count: number; revenue: number }>;
  ordersByClass: Record<string, { count: number; revenue: number }>;
  ordersByPartner: Record<string, { count: number; revenue: number }>;
}

export default function Reports() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportData>({
    totalOrders: 0,
    totalRevenue: 0,
    yayasanRevenue: 0,
    vendorRevenue: 0,
    ordersByCategory: {},
    ordersByClass: {},
    ordersByPartner: {},
  });
  const [period, setPeriod] = useState('all');

  useEffect(() => {
    fetchReportData();
  }, [period]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('laundry_orders')
        .select(`
          *,
          students (name, class),
          laundry_partners (name)
        `)
        .in('status', ['DIBAYAR', 'SELESAI']);

      // Apply date filter based on period
      if (period !== 'all') {
        const now = new Date();
        let startDate: Date;
        
        switch (period) {
          case 'today':
            startDate = new Date(now.setHours(0, 0, 0, 0));
            break;
          case 'week':
            startDate = new Date(now.setDate(now.getDate() - 7));
            break;
          case 'month':
            startDate = new Date(now.setMonth(now.getMonth() - 1));
            break;
          default:
            startDate = new Date(0);
        }
        
        query = query.gte('paid_at', startDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      const orders = data || [];

      // Calculate totals
      const totalOrders = orders.length;
      const totalRevenue = orders.reduce((sum, o) => sum + (o.total_price || 0), 0);
      const yayasanRevenue = orders.reduce((sum, o) => sum + (o.yayasan_share || 0), 0);
      const vendorRevenue = orders.reduce((sum, o) => sum + (o.vendor_share || 0), 0);

      // Group by category
      const ordersByCategory: Record<string, { count: number; revenue: number }> = {};
      orders.forEach(order => {
        const cat = order.category;
        if (!ordersByCategory[cat]) {
          ordersByCategory[cat] = { count: 0, revenue: 0 };
        }
        ordersByCategory[cat].count++;
        ordersByCategory[cat].revenue += order.total_price || 0;
      });

      // Group by class
      const ordersByClass: Record<string, { count: number; revenue: number }> = {};
      orders.forEach(order => {
        const cls = order.students?.class || 'Unknown';
        if (!ordersByClass[cls]) {
          ordersByClass[cls] = { count: 0, revenue: 0 };
        }
        ordersByClass[cls].count++;
        ordersByClass[cls].revenue += order.total_price || 0;
      });

      // Group by partner
      const ordersByPartner: Record<string, { count: number; revenue: number }> = {};
      orders.forEach(order => {
        const partner = order.laundry_partners?.name || 'Unknown';
        if (!ordersByPartner[partner]) {
          ordersByPartner[partner] = { count: 0, revenue: 0 };
        }
        ordersByPartner[partner].count++;
        ordersByPartner[partner].revenue += order.total_price || 0;
      });

      setReportData({
        totalOrders,
        totalRevenue,
        yayasanRevenue,
        vendorRevenue,
        ordersByCategory,
        ordersByClass,
        ordersByPartner,
      });
    } catch (error) {
      console.error('Error fetching report data:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Gagal memuat data laporan',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleExport = () => {
    toast({
      title: 'Info',
      description: 'Fitur export laporan akan segera tersedia',
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Laporan</h1>
            <p className="text-muted-foreground mt-1">
              Ringkasan data laundry
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Periode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hari Ini</SelectItem>
                <SelectItem value="week">7 Hari Terakhir</SelectItem>
                <SelectItem value="month">30 Hari Terakhir</SelectItem>
                <SelectItem value="all">Semua Waktu</SelectItem>
              </SelectContent>
            </Select>
            
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="dashboard-card">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Order</p>
                      <p className="text-2xl font-bold mt-1">{reportData.totalOrders}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-primary/10 text-primary">
                      <Package className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="dashboard-card">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Pendapatan</p>
                      <p className="text-2xl font-bold mt-1">{formatCurrency(reportData.totalRevenue)}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-success/10 text-success">
                      <TrendingUp className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="dashboard-card">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Bagian Yayasan</p>
                      <p className="text-2xl font-bold mt-1">{formatCurrency(reportData.yayasanRevenue)}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-primary/10 text-primary">
                      <DollarSign className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="dashboard-card">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Bagian Vendor</p>
                      <p className="text-2xl font-bold mt-1">{formatCurrency(reportData.vendorRevenue)}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-warning/10 text-warning">
                      <Users className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Reports Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* By Category */}
              <Card className="dashboard-card">
                <CardHeader>
                  <CardTitle className="text-lg">Per Kategori</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(reportData.ordersByCategory).length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Tidak ada data</p>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(reportData.ordersByCategory).map(([category, data]) => (
                        <div key={category} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                          <div>
                            <p className="font-medium">
                              {LAUNDRY_CATEGORIES[category as keyof typeof LAUNDRY_CATEGORIES]?.label || category}
                            </p>
                            <p className="text-sm text-muted-foreground">{data.count} order</p>
                          </div>
                          <p className="font-bold">{formatCurrency(data.revenue)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* By Class */}
              <Card className="dashboard-card">
                <CardHeader>
                  <CardTitle className="text-lg">Per Kelas</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(reportData.ordersByClass).length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Tidak ada data</p>
                  ) : (
                    <div className="space-y-4 max-h-80 overflow-y-auto">
                      {Object.entries(reportData.ordersByClass)
                        .sort((a, b) => b[1].revenue - a[1].revenue)
                        .map(([cls, data]) => (
                          <div key={cls} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                            <div>
                              <p className="font-medium">Kelas {cls}</p>
                              <p className="text-sm text-muted-foreground">{data.count} order</p>
                            </div>
                            <p className="font-bold">{formatCurrency(data.revenue)}</p>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* By Partner */}
              <Card className="dashboard-card lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg">Per Mitra Laundry</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(reportData.ordersByPartner).length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Tidak ada data</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Object.entries(reportData.ordersByPartner)
                        .sort((a, b) => b[1].revenue - a[1].revenue)
                        .map(([partner, data]) => (
                          <div key={partner} className="p-4 rounded-lg bg-muted/30">
                            <p className="font-medium">{partner}</p>
                            <p className="text-sm text-muted-foreground">{data.count} order</p>
                            <p className="text-xl font-bold text-primary mt-2">{formatCurrency(data.revenue)}</p>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
