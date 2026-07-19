import { createFileRoute } from "@tanstack/react-router";
import Bills from "@/pages/Bills";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/bills")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <ProtectedRoute allowedRoles={["parent"]}>
      <Bills />
    </ProtectedRoute>
  );
}
