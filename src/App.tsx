import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import Orders from "./pages/Orders";
import NewOrder from "./pages/NewOrder";
import BulkOrderEntry from "./pages/BulkOrderEntry";
import Bills from "./pages/Bills";
import Partners from "./pages/Partners";
import Reports from "./pages/Reports";
import CashierReports from "./pages/CashierReports";
import CashierPOS from "./pages/CashierPOS";
import Settings from "./pages/Settings";
import DataMigration from "./pages/DataMigration";
import UserManagement from "./pages/UserManagement";
import StaffBills from "./pages/StaffBills";
import WadiahBalance from "./pages/WadiahBalance";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
}) {
  const { user, userRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && (!userRole || !allowedRoles.includes(userRole))) {
    // Staff diarahkan ke Input Bulk, role lain ke Dashboard
    const fallbackPath = userRole === "staff" ? "/orders/bulk" : "/dashboard";
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute
            allowedRoles={["admin", "parent", "partner", "cashier"]}
          >
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/students"
        element={
          <ProtectedRoute allowedRoles={["admin", "parent"]}>
            <Students />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders"
        element={
          <ProtectedRoute allowedRoles={["admin", "partner"]}>
            <Orders />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders/new"
        element={
          <ProtectedRoute allowedRoles={["staff"]}>
            <NewOrder />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders/bulk"
        element={
          <ProtectedRoute allowedRoles={["staff"]}>
            <BulkOrderEntry />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff-bills"
        element={
          <ProtectedRoute allowedRoles={["staff"]}>
            <StaffBills />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bills"
        element={
          <ProtectedRoute allowedRoles={["parent"]}>
            <Bills />
          </ProtectedRoute>
        }
      />
      <Route
        path="/partners"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Partners />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Reports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pos"
        element={
          <ProtectedRoute allowedRoles={["cashier"]}>
            <CashierPOS />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cashier-reports"
        element={
          <ProtectedRoute allowedRoles={["admin", "cashier"]}>
            <CashierReports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wadiah-balance"
        element={
          <ProtectedRoute allowedRoles={["admin", "staff"]}>
            <WadiahBalance />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/data-migration"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <DataMigration />
          </ProtectedRoute>
        }
      />
      <Route
        path="/user-management"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <UserManagement />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
