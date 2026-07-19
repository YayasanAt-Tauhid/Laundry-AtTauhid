import { createFileRoute } from "@tanstack/react-router";
import Orders from "@/pages/Orders";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/orders/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <ProtectedRoute allowedRoles={["admin", "partner"]}>
      <Orders />
    </ProtectedRoute>
  );
}
