import { createFileRoute } from "@tanstack/react-router";
import Partners from "@/pages/Partners";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/partners")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <Partners />
    </ProtectedRoute>
  );
}
