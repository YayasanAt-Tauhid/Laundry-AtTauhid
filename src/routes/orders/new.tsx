import { createFileRoute } from "@tanstack/react-router";
import NewOrder from "@/pages/NewOrder";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/orders/new")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <ProtectedRoute allowedRoles={["staff"]}>
      <NewOrder />
    </ProtectedRoute>
  );
}
