import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function CorrectionNotice() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    void supabase.from("order_corrections").select("id", { count: "exact", head: true })
      .eq("status", "approved").eq("settlement_status", "pending").then(({ count, error }) => {
        if (active && !error) setCount(count ?? 0);
      });
    return () => { active = false; };
  }, []);
  if (!count) return null;
  return <div className="border rounded-lg bg-muted/40 p-4 flex flex-wrap justify-between items-center gap-3">
    <p className="text-sm">Ada <strong>{count} koreksi tagihan</strong> yang masih memerlukan pengembalian atau pembayaran tambahan melalui kasir.</p>
    <Button variant="outline" asChild><Link to="/order-corrections">Lihat penyelesaian koreksi</Link></Button>
  </div>;
}
