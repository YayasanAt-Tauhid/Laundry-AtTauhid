import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Package, Calendar } from 'lucide-react';
import { LAUNDRY_CATEGORIES, type LaundryCategory } from '@/lib/constants';

interface Student {
  id: string;
  name: string;
  class: string;
  parent_id: string;
}

interface Partner {
  id: string;
  name: string;
}

interface HolidaySetting {
  is_holiday: boolean;
}

export default function NewOrder() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [students, setStudents] = useState<Student[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [holidaySetting, setHolidaySetting] = useState<HolidaySetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    studentId: '',
    partnerId: '',
    category: '' as LaundryCategory | '',
    weightKg: '',
    itemCount: '',
    notes: '',
    laundryDate: new Date().toISOString().split('T')[0], // Default to today
  });

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch students
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('id, name, class, parent_id')
        .eq('is_active', true)
        .order('name');

      if (studentsError) throw studentsError;
      setStudents(studentsData || []);

      // Fetch partners
      const { data: partnersData, error: partnersError } = await supabase
        .from('laundry_partners')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (partnersError) throw partnersError;
      setPartners(partnersData || []);

      // Fetch holiday setting
      const { data: holidayData, error: holidayError } = await supabase
        .from('holiday_settings')
        .select('is_holiday')
        .single();

      if (holidayError && holidayError.code !== 'PGRST116') throw holidayError;
      setHolidaySetting(holidayData);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Gagal memuat data',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStudentChange = (studentId: string) => {
    setFormData({ ...formData, studentId });
    const student = students.find(s => s.id === studentId);
    setSelectedStudent(student || null);
  };

  const calculatePrices = () => {
    if (!formData.category) return { total: 0, yayasan: 0, vendor: 0 };

    const pricePerUnit = LAUNDRY_CATEGORIES[formData.category].price;
    const isKiloan = formData.category === 'kiloan';
    const quantity = isKiloan ? parseFloat(formData.weightKg) || 0 : parseInt(formData.itemCount) || 0;

    const total = isKiloan ? quantity * pricePerUnit : quantity * pricePerUnit;

    // Calculate shares based on holiday setting
    const isHoliday = holidaySetting?.is_holiday || false;
    let yayasan = 0;
    let vendor = 0;

    if (!isHoliday) {
      // Before holiday: Yayasan gets all
      if (isKiloan) {
        yayasan = 7000 * quantity;
      } else {
        yayasan = total;
      }
      vendor = 0;
    } else {
      // After holiday: Split
      if (isKiloan) {
        yayasan = 2000 * quantity;
        vendor = 5000 * quantity;
      } else {
        yayasan = Math.round(total * 0.2);
        vendor = Math.round(total * 0.8);
      }
    }

    return { total, yayasan, vendor };
  };

  const prices = calculatePrices();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.studentId || !formData.partnerId || !formData.category) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Lengkapi semua field yang wajib diisi',
      });
      return;
    }

    const isKiloan = formData.category === 'kiloan';
    if (isKiloan && !formData.weightKg) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Masukkan berat dalam kg',
      });
      return;
    }
    if (!isKiloan && !formData.itemCount) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Masukkan jumlah pakaian',
      });
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from('laundry_orders')
        .insert({
          student_id: formData.studentId,
          partner_id: formData.partnerId,
          staff_id: user.id,
          category: formData.category,
          weight_kg: isKiloan ? parseFloat(formData.weightKg) : null,
          item_count: !isKiloan ? parseInt(formData.itemCount) : null,
          price_per_unit: LAUNDRY_CATEGORIES[formData.category].price,
          total_price: prices.total,
          yayasan_share: prices.yayasan,
          vendor_share: prices.vendor,
          status: 'MENUNGGU_APPROVAL_MITRA',
          notes: formData.notes || null,
          laundry_date: formData.laundryDate,
        });

      if (error) throw error;

      toast({
        title: 'Berhasil',
        description: 'Order laundry berhasil dibuat',
      });

      navigate('/orders');
    } catch (error: any) {
      console.error('Error creating order:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Gagal membuat order',
      });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Input Laundry Baru</h1>
            <p className="text-muted-foreground mt-1">
              Masukkan data laundry siswa
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="dashboard-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Data Laundry
              </CardTitle>
              <CardDescription>
                Pilih siswa dan masukkan detail laundry
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Student Selection */}
              <div className="space-y-2">
                <Label htmlFor="student">Pilih Siswa *</Label>
                <Select value={formData.studentId} onValueChange={handleStudentChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih siswa..." />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.name} - Kelas {student.class}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Display selected student info */}
              {selectedStudent && (
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Nama Siswa</span>
                    <span className="font-medium">{selectedStudent.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Kelas</span>
                    <span className="font-medium">{selectedStudent.class}</span>
                  </div>
                </div>
              )}

              {/* Partner Selection */}
              <div className="space-y-2">
                <Label htmlFor="partner">Mitra Laundry *</Label>
                <Select
                  value={formData.partnerId}
                  onValueChange={(value) => setFormData({ ...formData, partnerId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih mitra laundry..." />
                  </SelectTrigger>
                  <SelectContent>
                    {partners.map((partner) => (
                      <SelectItem key={partner.id} value={partner.id}>
                        {partner.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {partners.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Belum ada mitra laundry. Hubungi admin untuk menambahkan.
                  </p>
                )}
              </div>

              {/* Laundry Date */}
              <div className="space-y-2">
                <Label htmlFor="laundryDate" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Tanggal Ikut Laundry *
                </Label>
                <Input
                  id="laundryDate"
                  type="date"
                  value={formData.laundryDate}
                  onChange={(e) => setFormData({ ...formData, laundryDate: e.target.value })}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Pilih tanggal siswa mengikuti layanan laundry
                </p>
              </div>

              {/* Category Selection */}
              <div className="space-y-2">
                <Label htmlFor="category">Kategori Laundry *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({
                    ...formData,
                    category: value as LaundryCategory,
                    weightKg: '',
                    itemCount: '',
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kategori..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LAUNDRY_CATEGORIES).map(([key, category]) => (
                      <SelectItem key={key} value={key}>
                        {category.label} - {formatCurrency(category.price)}/{category.unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quantity Input */}
              {formData.category && (
                <div className="space-y-2">
                  {formData.category === 'kiloan' ? (
                    <>
                      <Label htmlFor="weight">Berat (kg) *</Label>
                      <Input
                        id="weight"
                        type="number"
                        step="0.1"
                        min="0"
                        value={formData.weightKg}
                        onChange={(e) => setFormData({ ...formData, weightKg: e.target.value })}
                        placeholder="Masukkan berat dalam kg"
                      />
                    </>
                  ) : (
                    <>
                      <Label htmlFor="count">Jumlah Pakaian *</Label>
                      <Input
                        id="count"
                        type="number"
                        min="1"
                        value={formData.itemCount}
                        onChange={(e) => setFormData({ ...formData, itemCount: e.target.value })}
                        placeholder="Masukkan jumlah pakaian"
                      />
                    </>
                  )}
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Catatan (Opsional)</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Catatan tambahan..."
                  rows={3}
                />
              </div>

              {/* Price Summary */}
              {formData.category && (formData.weightKg || formData.itemCount) && (
                <div className="border-t pt-6 space-y-4">
                  <h3 className="font-semibold">Ringkasan Harga</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Harga Satuan</span>
                      <span className="font-medium">
                        {formatCurrency(LAUNDRY_CATEGORIES[formData.category].price)}/{LAUNDRY_CATEGORIES[formData.category].unit}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Jumlah</span>
                      <span className="font-medium">
                        {formData.category === 'kiloan'
                          ? `${formData.weightKg} kg`
                          : `${formData.itemCount} pcs`}
                      </span>
                    </div>
                    <div className="flex justify-between text-lg font-bold border-t pt-3">
                      <span>Total</span>
                      <span className="text-primary">{formatCurrency(prices.total)}</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm font-medium mb-2">Bagi Hasil</p>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Yayasan</p>
                        <p className="font-bold">{formatCurrency(prices.yayasan)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Vendor</p>
                        <p className="font-bold">{formatCurrency(prices.vendor)}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      * {holidaySetting?.is_holiday ? 'Mode Liburan' : 'Mode Normal'}
                    </p>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate(-1)}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={saving || !formData.studentId || !formData.partnerId || !formData.category}
                >
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Simpan Order
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </DashboardLayout>
  );
}
