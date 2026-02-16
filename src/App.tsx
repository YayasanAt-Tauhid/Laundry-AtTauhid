import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { UpdatePrompt } from "@/components/pwa/UpdatePrompt";

// Lazy-loaded pages for code splitting
const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Students = lazy(() => import("./pages/Students"));
const Orders = lazy(() => import("./pages/Orders"));
const NewOrder = lazy(() => import("./pages/NewOrder"));
const BulkOrderEntry = lazy(() => import("./pages/BulkOrderEntry"));
const Bills = lazy(() => import("./pages/Bills"));
const Partners = lazy(() => import("./pages/Partners"));
const Reports = lazy(() => import("./pages/Reports"));
const CashierReports = lazy(() => import("./pages/CashierReports"));
const CashierPOS = lazy(() => import("./pages/CashierPOS"));
const Settings = lazy(() => import("./pages/Settings"));
const DataMigration = lazy(() => import("./pages/DataMigration"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const StaffBills = lazy(() => import("./pages/StaffBills"));
const WadiahBalance = lazy(() => import("./pages/WadiahBalance"));
const ArrearsMessaging = lazy(() => import("./pages/ArrearsMessaging"));
const PublicPayment = lazy(() => import("./pages/PublicPayment"));
const NotFound = lazy(() => import("./pages/NotFound"));
const InstallApp = lazy(() => import("./pages/InstallApp"));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

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
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/login" element={<Login />} />
      {/* Public payment page - no auth required */}
      <Route path="/pay" element={<PublicPayment />} />
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
      <Route
        path="/arrears-messaging"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <ArrearsMessaging />
          </ProtectedRoute>
        }
      />
      <Route path="/tambahkan" element={<InstallApp />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <UpdatePrompt />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
