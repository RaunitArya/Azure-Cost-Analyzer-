import { CostRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart } from "@mui/x-charts/BarChart";
import { getServiceColor } from "@/lib/colors";

interface CostBarChartProps {
  records: CostRecord[];
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

export function CostBarChart({ records }: CostBarChartProps) {
  // Group by date then service
  const dateServiceMap = new Map<string, Map<string, number>>();
  const allServices = new Set<string>();

  records.forEach((r) => {
    const d = r.date.slice(0, 10);
    allServices.add(r.service_name);
    if (!dateServiceMap.has(d)) dateServiceMap.set(d, new Map());
    const sm = dateServiceMap.get(d)!;
    sm.set(r.service_name, (sm.get(r.service_name) ?? 0) + r.cost);
  });

  const sortedDates = [...dateServiceMap.keys()].sort();
  const services = [...allServices];
  const xLabels = sortedDates.map(formatDateLabel);

  const series = services.map((service, i) => ({
    data: sortedDates.map(
      (date) =>
        Math.round((dateServiceMap.get(date)?.get(service) ?? 0) * 100) / 100,
    ),
    label: service,
    color: getServiceColor(service, i),
    stack: "total",
    stackOrder: "appearance" as const,
  }));

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          Daily Cost by Service
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[300px]">
        {sortedDates.length > 0 ? (
          <>
            <BarChart
              xAxis={[
                {
                  data: xLabels,
                  scaleType: "band",
                  tickLabelStyle: { fontSize: 10, fill: "hsl(215 20% 65%)" },
                },
              ]}
              yAxis={[
                {
                  tickLabelStyle: { fontSize: 10, fill: "hsl(215 20% 65%)" },
                },
              ]}
              series={series}
              sx={{
                ".MuiBarElement-root": { rx: 2 },
                ".MuiChartsAxis-line": { stroke: "hsl(217 33% 20%)" },
                ".MuiChartsAxis-tick": { stroke: "hsl(217 33% 20%)" },
                ".MuiChartsGrid-line": {
                  stroke: "hsl(217 33% 20%)",
                  strokeDasharray: "3 3",
                },
              }}
              grid={{ horizontal: true }}
              height={240}
              margin={{ left: 50, right: 20, top: 20, bottom: 30 }}
              hideLegend
            />
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-1">
              {services.map((s, i) => (
                <div
                  key={s}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: getServiceColor(s, i) }}
                  />
                  {s}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No data
          </div>
        )}
      </CardContent>
    </Card>
  );
}
