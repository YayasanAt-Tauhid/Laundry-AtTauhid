import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Shirt,
  Shield,
  CreditCard,
  BarChart3,
  Users,
  Wallet,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";

const features = [
  {
    icon: Shirt,
    title: "Manajemen Order",
    desc: "Input order kiloan & satuan, approval mitra, tracking status real-time dari DRAFT hingga SELESAI.",
  },
  {
    icon: CreditCard,
    title: "Pembayaran Online",
    desc: "Pembayaran via QRIS & Bank Transfer melalui Midtrans. Otomatis pilih metode terbaik berdasarkan nominal.",
  },
  {
    icon: Wallet,
    title: "Saldo Wadiah",
    desc: "Simpan kembalian sebagai saldo untuk transaksi berikutnya. Sistem syariah yang transparan.",
  },
  {
    icon: Users,
    title: "Multi-Role",
    desc: "Admin, Staff, Kasir, Mitra, dan Orang Tua — masing-masing punya akses dan dashboard sendiri.",
  },
  {
    icon: BarChart3,
    title: "Laporan Lengkap",
    desc: "Rekap harian, laporan setoran bank, breakdown per kategori & kelas, export ke Excel.",
  },
  {
    icon: Shield,
    title: "Keamanan Terjamin",
    desc: "Row Level Security, validasi harga server-side, audit trail, dan enkripsi data sensitif.",
  },
];

const stats = [
  { value: "7+", label: "Kategori Laundry" },
  { value: "5", label: "Role Pengguna" },
  { value: "24/7", label: "Akses Online" },
  { value: "100%", label: "Transparan" },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto flex items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <img src="/logo.png" alt="Logo" className="h-7 w-7 object-contain" />
            </div>
            <span className="text-lg font-bold text-foreground">At-Tauhid Laundry</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/login" })}>
              Masuk
            </Button>
            <Button size="sm" onClick={() => navigate({ to: "/login" })}>
              Daftar <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative">
        {/* Background decoration */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 right-0 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-[400px] w-[400px] rounded-full bg-accent/5 blur-3xl" />
        </div>

        <div className="container relative mx-auto px-4 py-20 sm:px-6 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              <Shirt className="h-4 w-4" />
              Sistem Manajemen Laundry Pesantren
            </div>

            <h1 className="mb-6 text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Kelola Laundry{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Lebih Mudah
              </span>{" "}
              & Transparan
            </h1>

            <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              Solusi lengkap untuk manajemen laundry pesantren — dari pencatatan order, 
              pembayaran online, hingga laporan keuangan. Semua dalam satu aplikasi.
            </p>

            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button size="lg" className="px-8 text-base" onClick={() => navigate({ to: "/login" })}>
                Mulai Sekarang <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button variant="outline" size="lg" className="px-8 text-base" onClick={() => {
                document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
              }}>
                Pelajari Fitur
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="mx-auto mt-16 grid max-w-2xl grid-cols-2 gap-6 sm:grid-cols-4 lg:mt-20">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-extrabold text-primary sm:text-4xl">{stat.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/50 bg-muted/30 py-20 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl">
              Fitur Unggulan
            </h2>
            <p className="text-lg text-muted-foreground">
              Dirancang khusus untuk kebutuhan manajemen laundry di lingkungan pesantren & sekolah.
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border/50 bg-card p-6 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-md"
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl">
              Cara Kerja
            </h2>
            <p className="text-lg text-muted-foreground">
              Proses sederhana dari pencucian hingga pembayaran selesai.
            </p>
          </div>

          <div className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { step: "1", title: "Staff Input Order", desc: "Staff mencatat order laundry siswa per kelas." },
              { step: "2", title: "Mitra Approve", desc: "Mitra laundry menyetujui dan memproses cucian." },
              { step: "3", title: "Orang Tua Bayar", desc: "Pembayaran online via QRIS atau transfer bank." },
              { step: "4", title: "Laporan Otomatis", desc: "Admin melihat rekap & laporan keuangan lengkap." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
                  {item.step}
                </div>
                <h3 className="mb-2 font-semibold text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="border-t border-border/50 bg-muted/30 py-20 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold text-foreground sm:text-4xl">
              Untuk Semua Peran
            </h2>
          </div>

          <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { role: "Admin", items: ["Dashboard lengkap", "Manajemen pengguna", "Laporan keuangan", "Pengaturan sistem"] },
              { role: "Staff", items: ["Input order harian", "Bulk input per kelas", "Cek tagihan siswa", "Saldo wadiah"] },
              { role: "Kasir", items: ["POS pembayaran", "Terima tunai & QRIS", "Proses wadiah", "Rekap setoran"] },
              { role: "Mitra", items: ["Approval order", "Lihat order masuk", "Status pengerjaan", "Dashboard mitra"] },
              { role: "Orang Tua", items: ["Lihat tagihan anak", "Bayar online", "Riwayat pembayaran", "Saldo wadiah"] },
            ].map((r) => (
              <div key={r.role} className="rounded-2xl border border-border/50 bg-card p-6">
                <h3 className="mb-3 text-lg font-bold text-foreground">{r.role}</h3>
                <ul className="space-y-2">
                  {r.items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="mx-auto max-w-3xl rounded-3xl bg-gradient-to-br from-primary to-primary/80 p-10 text-center text-primary-foreground shadow-xl sm:p-14">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">
              Siap Mengelola Laundry Lebih Efisien?
            </h2>
            <p className="mb-8 text-lg opacity-90">
              Daftar sekarang dan mulai gunakan sistem manajemen laundry terlengkap untuk pesantren Anda.
            </p>
            <Button
              size="lg"
              variant="secondary"
              className="px-8 text-base font-semibold"
              onClick={() => navigate({ to: "/login" })}
            >
              Daftar Gratis <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-muted/30 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground sm:px-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img src="/logo.png" alt="Logo" className="h-5 w-5 object-contain" />
            <span className="font-semibold text-foreground">At-Tauhid Laundry</span>
          </div>
          <p>&copy; {new Date().getFullYear()} Pesantren At-Tauhid. Semua hak dilindungi.</p>
        </div>
      </footer>
    </div>
  );
}
