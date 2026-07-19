import { createFileRoute } from "@tanstack/react-router";
import Students from "@/pages/Students";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/students")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <ProtectedRoute allowedRoles={["admin", "parent"]}>
      <Students />
    </ProtectedRoute>
  );
}
