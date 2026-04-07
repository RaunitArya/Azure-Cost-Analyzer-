import { CostRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart } from "@mui/x-charts/PieChart";
import { getServiceColor } from "@/lib/colors";

interface CostDonutChartProps {
  records: CostRecord[];
  budget?: number;
}

export function CostDonutChart({ records, budget }: CostDonutChartProps) {
  const serviceMap = new Map<string, number>();
  records.forEach((r) =>
    serviceMap.set(
      r.service_name,
      (serviceMap.get(r.service_name) ?? 0) + r.cost,
    ),
  );
  // Filter out services with zero cost
  const filteredServiceMap = [...serviceMap.entries()]
    .filter(([_, cost]) => cost > 0);

  // Create stable color mapping based on unique service names
  const allServiceNames = [...new Set(records.map((r) => r.service_name))].sort();
  const serviceColorMap = new Map(
    allServiceNames.map((name, idx) => [name, getServiceColor(name, idx)])
  );

  const totalCost = filteredServiceMap.reduce((a, [_, b]) => a + b, 0);
  const pieData = filteredServiceMap
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({
      id: label,
      value: Math.round(value * 100) / 100,
      label,
      color: serviceColorMap.get(label) || getServiceColor(label, 0),
    }));

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Spend Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="h-[300px]">
        {pieData.length > 0 ? (
          <div className="relative h-full flex items-center">
            {/* Chart on the left */}
            <div className="relative" style={{ width: 220, height: 220 }}>
              <PieChart
                series={[
                  {
                    data: pieData,
                    innerRadius: 55,
                    outerRadius: 100,
                    paddingAngle: 2,
                    cornerRadius: 4,
                    highlightScope: { fade: "global", highlight: "item" },
                  },
                ]}
                height={220}
                width={220}
                margin={{ top: 10, bottom: 10, left: 10, right: 10 }}
                sx={{ ".MuiChartsLegend-root": { display: "none" } }}
              />
              {/* Center label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg font-bold text-foreground">
                  ₹{Math.round(totalCost).toLocaleString("en-IN")}
                </span>
                {budget && budget > 0 ? (
                  <span
                    className={`text-[10px] font-medium ${
                      totalCost > budget
                        ? "text-destructive"
                        : "text-emerald-400"
                    }`}
                  >
                    {Math.round((totalCost / budget) * 100)}% of budget
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    Total spend
                  </span>
                )}
              </div>
            </div>

            {/* Custom legend on the right */}
            <div className="ml-8 flex flex-col gap-3">
              {pieData.map((item) => (
                <div key={item.label} className="flex items-center gap-2.5">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-foreground">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No data
          </div>
        )}
      </CardContent>
    </Card>
  );
}
