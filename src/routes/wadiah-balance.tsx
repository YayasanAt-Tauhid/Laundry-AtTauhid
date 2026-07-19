import { createFileRoute } from "@tanstack/react-router";
import WadiahBalance from "@/pages/WadiahBalance";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/wadiah-balance")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <ProtectedRoute allowedRoles={["admin", "staff"]}>
      <WadiahBalance />
    </ProtectedRoute>
  );
}
