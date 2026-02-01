import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LAUNDRY_CATEGORIES } from "@/lib/constants";
import { formatCurrency } from "@/utils/format";
import type { SummaryData } from "@/types/cashier-reports";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface CategoryBreakdownProps {
  summary: SummaryData;
}

const COLORS = [
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#3b82f6", // blue
];

export function CategoryBreakdown({ summary }: CategoryBreakdownProps) {
  const categoryData = Object.entries(summary.byCategory)
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([category, data], index) => ({
      name: LAUNDRY_CATEGORIES[category as keyof typeof LAUNDRY_CATEGORIES]?.label || category,
      value: data.amount,
      count: data.count,
      color: COLORS[index % COLORS.length],
    }));

  const hasData = categoryData.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Per Kategori</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-muted-foreground text-center py-8 text-sm">Tidak ada data</p>
        ) : (
          <div className="space-y-4">
            {/* Simple Chart */}
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={60}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ 
                      borderRadius: '8px', 
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--background))'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend List */}
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {categoryData.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-muted-foreground">{item.name}</span>
                    <span className="text-xs text-muted-foreground/60">({item.count})</span>
                  </div>
                  <span className="font-medium">{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
