import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/utils/format";
import type { SummaryData } from "@/types/cashier-reports";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";

interface ClassBreakdownProps {
  summary: SummaryData;
}

const COLORS = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#3b82f6"];

export function ClassBreakdown({ summary }: ClassBreakdownProps) {
  const classData = Object.entries(summary.byClass)
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 7)
    .map(([cls, data], index) => ({
      name: cls,
      amount: data.amount,
      count: data.count,
      color: COLORS[index % COLORS.length],
    }));

  const hasData = classData.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Per Kelas (Top 7)</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-muted-foreground text-center py-8 text-sm">Tidak ada data</p>
        ) : (
          <div className="space-y-4">
            {/* Bar Chart */}
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classData} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    width={60}
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ 
                      borderRadius: '8px', 
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--background))'
                    }}
                  />
                  <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                    {classData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Data List */}
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {classData.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Kelas {item.name} <span className="text-muted-foreground/60">({item.count}x)</span>
                  </span>
                  <span className="font-medium">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
