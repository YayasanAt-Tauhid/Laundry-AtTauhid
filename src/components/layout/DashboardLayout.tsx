import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  ClipboardList,
  Receipt,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Building2,
  FileText,
  Package,
  Wallet,
  Upload,
} from "lucide-react";
import { USER_ROLES, type UserRole } from "@/lib/constants";

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  roles: UserRole[];
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard className="h-5 w-5" />,
    roles: ["admin", "parent", "staff", "partner", "cashier"],
  },
  {
    label: "Data Siswa",
    href: "/students",
    icon: <GraduationCap className="h-5 w-5" />,
    roles: ["admin", "parent"],
  },
  {
    label: "Input Laundry",
    href: "/orders/new",
    icon: <Package className="h-5 w-5" />,
    roles: ["staff"],
  },
  {
    label: "Daftar Order",
    href: "/orders",
    icon: <ClipboardList className="h-5 w-5" />,
    roles: ["admin", "staff", "partner"],
  },
  {
    label: "Tagihan",
    href: "/bills",
    icon: <Receipt className="h-5 w-5" />,
    roles: ["parent"],
  },
  {
    label: "POS Kasir",
    href: "/pos",
    icon: <Wallet className="h-5 w-5" />,
    roles: ["cashier"],
  },
  {
    label: "Mitra Laundry",
    href: "/partners",
    icon: <Building2 className="h-5 w-5" />,
    roles: ["admin"],
  },
  {
    label: "Manajemen Orang Tua",
    href: "/user-management",
    icon: <Users className="h-5 w-5" />,
    roles: ["admin"],
  },
  {
    label: "Laporan",
    href: "/reports",
    icon: <FileText className="h-5 w-5" />,
    roles: ["admin"],
  },
  {
    label: "Laporan Pembayaran",
    href: "/cashier-reports",
    icon: <FileText className="h-5 w-5" />,
    roles: ["cashier"],
  },
  {
    label: "Migrasi Data",
    href: "/data-migration",
    icon: <Upload className="h-5 w-5" />,
    roles: ["admin"],
  },
  {
    label: "Pengaturan",
    href: "/settings",
    icon: <Settings className="h-5 w-5" />,
    roles: ["admin"],
  },
];

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { profile, userRole, signOut } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filteredNavItems = navItems.filter(
    (item) => userRole && item.roles.includes(userRole),
  );

  const roleInfo = userRole ? USER_ROLES[userRole] : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-secondary"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xl">🧺</span>
            <span className="font-semibold">At-Tauhid Laundry</span>
          </div>
          <div className="w-9" />
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-72 bg-sidebar transform transition-transform duration-200 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-6 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sidebar-primary/20 flex items-center justify-center">
                <span className="text-xl">🧺</span>
              </div>
              <div>
                <h1 className="font-bold text-sidebar-foreground">
                  At-Tauhid Laundry
                </h1>
                <p className="text-xs text-sidebar-foreground/60">
                  Sistem Laundry Sekolah
                </p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* User info */}
          <div className="p-4 border-b border-sidebar-border">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-sidebar-accent">
              <div className="w-10 h-10 rounded-full bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-semibold">
                {profile?.full_name?.charAt(0) || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sidebar-foreground truncate">
                  {profile?.full_name || "Pengguna"}
                </p>
                {roleInfo && (
                  <p className="text-xs text-sidebar-foreground/60">
                    {roleInfo.label}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {filteredNavItems.map((item) => {
              const isActive =
                location.pathname === item.href ||
                (item.href !== "/dashboard" &&
                  location.pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )}
                >
                  {item.icon}
                  <span className="flex-1 font-medium">{item.label}</span>
                  {isActive && <ChevronRight className="h-4 w-4" />}
                </Link>
              );
            })}
          </nav>

          {/* Logout */}
          <div className="p-4 border-t border-sidebar-border">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={signOut}
            >
              <LogOut className="h-5 w-5" />
              <span>Keluar</span>
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-72 pt-16 lg:pt-0 min-h-screen">
        <div className="p-4 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
