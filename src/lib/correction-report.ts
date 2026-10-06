import { supabase } from "@/integrations/supabase/client";
import { correctionEntries, type CorrectionSource, type CorrectionReportOptions } from "@/lib/correction-ledger";

/** Signed adjustment rows, never substitutes for original payment/receipt rows.
 * Revenue: reductions on approval, additions on collection. Laundry-date reports
 * attribute the adjustment to the service date; paid-at reports use its own event.
 */
export async function correctionReportEntries(options: CorrectionReportOptions) {
  const all: CorrectionSource[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("order_corrections")
      .select("*, laundry_orders!order_corrections_order_id_fkey(category,laundry_date,partner_id,students(id,name,class,nik),laundry_partners(id,name))")
      .eq("status", "approved").order("id").range(offset, offset + 499);
    if (error) throw error;
    all.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) break;
  }
  return correctionEntries(all, options);
}
