import { createFileRoute } from "@tanstack/react-router";
import PublicPayment from "@/pages/PublicPayment";

export const Route = createFileRoute("/pay")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: PublicPayment,
});
