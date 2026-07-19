import { createFileRoute } from "@tanstack/react-router";
import DataMigration from "@/pages/DataMigration";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/data-migration")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <DataMigration />
    </ProtectedRoute>
  );
}
