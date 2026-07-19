import { createFileRoute } from "@tanstack/react-router";
import CashierPOS from "@/pages/CashierPOS";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/pos")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <ProtectedRoute allowedRoles={["cashier"]}>
      <CashierPOS />
    </ProtectedRoute>
  );
}
