import { createFileRoute } from "@tanstack/react-router";
import BulkOrderEntry from "@/pages/BulkOrderEntry";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/orders/bulk")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <ProtectedRoute allowedRoles={["staff"]}>
      <BulkOrderEntry />
    </ProtectedRoute>
  );
}
