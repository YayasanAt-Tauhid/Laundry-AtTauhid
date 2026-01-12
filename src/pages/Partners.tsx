import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Building2, Loader2, Phone, MapPin } from 'lucide-react';

interface Partner {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  user_id: string | null;
  created_at: string;
}

type PartnerUserOption = {
  user_id: string;
  full_name: string;
  email: string | null;
};

export default function Partners() {
  const { toast } = useToast();
  const { userRole } = useAuth();

  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);

  const [userOptions, setUserOptions] = useState<PartnerUserOption[]>([]);
  const userOptionsById = useMemo(() => {
    return new Map(userOptions.map((u) => [u.user_id, u] as const));
  }, [userOptions]);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    is_active: true,
    user_id: '', // empty = not assigned
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPartners();
  }, []);

  useEffect(() => {
    if (userRole === 'admin') fetchUserOptions();
  }, [userRole]);

  const fetchPartners = async () => {
    try {
      const { data, error } = await supabase
        .from('laundry_partners')
        .select('*')
        .order('name');

      if (error) throw error;
      setPartners(data || []);
    } catch (error) {
      console.error('Error fetching partners:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Gagal memuat data mitra',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .order('full_name');

      if (error) throw error;
      setUserOptions((data || []).filter((u) => !!u.user_id) as PartnerUserOption[]);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const openAddDialog = () => {
    setSelectedPartner(null);
    setFormData({ name: '', phone: '', address: '', is_active: true, user_id: '' });
    setDialogOpen(true);
  };

  const handleEdit = (partner: Partner) => {
    setSelectedPartner(partner);
    setFormData({
      name: partner.name,
      phone: partner.phone || '',
      address: partner.address || '',
      is_active: partner.is_active,
      user_id: partner.user_id || '',
    });
    setDialogOpen(true);
  };

  const openDeleteDialog = (partner: Partner) => {
    setSelectedPartner(partner);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedPartner) return;

    try {
      const { error } = await supabase
        .from('laundry_partners')
        .delete()
        .eq('id', selectedPartner.id);

      if (error) throw error;

      toast({
        title: 'Berhasil',
        description: 'Mitra berhasil dihapus',
      });

      setDeleteDialogOpen(false);
      setSelectedPartner(null);
      fetchPartners();
    } catch (error: any) {
      console.error('Error deleting partner:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Gagal menghapus mitra',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const assignedUserId = formData.user_id?.trim() ? formData.user_id.trim() : null;

    try {
      if (selectedPartner) {
        const { error } = await supabase
          .from('laundry_partners')
          .update({
            name: formData.name,
            phone: formData.phone || null,
            address: formData.address || null,
            is_active: formData.is_active,
            user_id: assignedUserId,
          })
          .eq('id', selectedPartner.id);

        if (error) throw error;

        toast({
          title: 'Berhasil',
          description: 'Data mitra berhasil diperbarui',
        });
      } else {
        const { error } = await supabase
          .from('laundry_partners')
          .insert({
            name: formData.name,
            phone: formData.phone || null,
            address: formData.address || null,
            is_active: formData.is_active,
            user_id: assignedUserId,
          });

        if (error) throw error;

        toast({
          title: 'Berhasil',
          description: 'Mitra laundry berhasil ditambahkan',
        });
      }

      // Ensure assigned user can actually login as partner by adding partner role.
      if (assignedUserId) {
        await supabase
          .from('user_roles')
          .upsert({ user_id: assignedUserId, role: 'partner' }, { onConflict: 'user_id,role' });
      }

      setDialogOpen(false);
      setSelectedPartner(null);
      setFormData({ name: '', phone: '', address: '', is_active: true, user_id: '' });
      fetchPartners();
    } catch (error: any) {
      console.error('Error saving partner:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Gagal menyimpan data mitra',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Mitra Laundry</h1>
            <p className="text-muted-foreground mt-1">Kelola data mitra laundry & tetapkan akun login mitra</p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Tambah Mitra
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{selectedPartner ? 'Edit Mitra' : 'Tambah Mitra Baru'}</DialogTitle>
                <DialogDescription>
                  {selectedPartner ? 'Perbarui informasi mitra laundry' : 'Masukkan data mitra laundry baru'}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nama Mitra *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nama mitra laundry"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="partner_user">Akun Mitra (opsional)</Label>
                  <Select
                    value={formData.user_id || '__none__'}
                    onValueChange={(value) => setFormData({ ...formData, user_id: value === '__none__' ? '' : value })}
                  >
                    <SelectTrigger id="partner_user">
                      <SelectValue placeholder="Pilih akun untuk login mitra (opsional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Tidak ditetapkan</SelectItem>
                      {userOptions.map((u) => (
                        <SelectItem key={u.user_id} value={u.user_id}>
                          {u.full_name || u.email || u.user_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Jika dipilih, user tersebut otomatis diberi role <span className="font-medium">Mitra</span>.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Nomor Telepon</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="08xxxxxxxxxx"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Alamat</Label>
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Alamat lengkap mitra"
                    rows={3}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="active">Status Aktif</Label>
                  <Switch
                    id="active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>

                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Batal
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {selectedPartner ? 'Simpan Perubahan' : 'Tambah Mitra'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : partners.length === 0 ? (
          <Card className="dashboard-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h2 className="text-lg font-medium text-foreground mb-2">Belum ada mitra terdaftar</h2>
              <p className="text-muted-foreground text-center mb-4">
                Tambahkan mitra laundry untuk mulai menerima order
              </p>
              <Button onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Tambah Mitra Pertama
              </Button>
            </CardContent>
          </Card>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {partners.map((partner) => {
              const linkedUser = partner.user_id ? userOptionsById.get(partner.user_id) : undefined;

              return (
                <Card key={partner.id} className="dashboard-card">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center text-success">
                          <Building2 className="h-6 w-6" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{partner.name}</CardTitle>
                          <span
                            className={`text-xs font-medium ${partner.is_active ? 'text-success' : 'text-muted-foreground'}`}
                          >
                            {partner.is_active ? 'Aktif' : 'Tidak Aktif'}
                          </span>
                          {partner.user_id && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Akun: {linkedUser?.email || linkedUser?.full_name || partner.user_id}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(partner)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(partner)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div className="space-y-2 text-sm">
                      {partner.phone && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-4 w-4" />
                          <span>{partner.phone}</span>
                        </div>
                      )}
                      {partner.address && (
                        <div className="flex items-start gap-2 text-muted-foreground">
                          <MapPin className="h-4 w-4 mt-0.5" />
                          <span className="line-clamp-2">{partner.address}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </section>
        )}

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus Mitra?</AlertDialogTitle>
              <AlertDialogDescription>
                Apakah Anda yakin ingin menghapus {selectedPartner?.name}? Tindakan ini tidak dapat dibatalkan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Hapus
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
