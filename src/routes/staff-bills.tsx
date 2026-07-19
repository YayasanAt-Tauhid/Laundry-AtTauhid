import { createFileRoute } from "@tanstack/react-router";
import StaffBills from "@/pages/StaffBills";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/staff-bills")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <ProtectedRoute allowedRoles={["staff"]}>
      <StaffBills />
    </ProtectedRoute>
  );
}
