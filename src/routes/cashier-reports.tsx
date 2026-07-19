import { createFileRoute } from "@tanstack/react-router";
import CashierReports from "@/pages/CashierReports";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/cashier-reports")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <ProtectedRoute allowedRoles={["admin", "cashier"]}>
      <CashierReports />
    </ProtectedRoute>
  );
}
