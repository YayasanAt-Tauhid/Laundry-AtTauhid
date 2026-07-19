import { createFileRoute } from "@tanstack/react-router";
import ArrearsMessaging from "@/pages/ArrearsMessaging";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/arrears-messaging")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <ProtectedRoute allowedRoles={["admin", "staff"]}>
      <ArrearsMessaging />
    </ProtectedRoute>
  );
}
