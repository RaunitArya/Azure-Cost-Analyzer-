import { CostRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart } from "@mui/x-charts/LineChart";

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

interface CostAreaChartProps {
  records: CostRecord[];
}

export function CostAreaChart({ records }: CostAreaChartProps) {
  const dateMap = new Map<string, number>();
  const serviceMap = new Map<string, Map<string, number>>();
  records.forEach((r) => {
    const d = r.date.slice(0, 10);
    dateMap.set(d, (dateMap.get(d) ?? 0) + r.cost);
    if (!serviceMap.has(r.service_name))
      serviceMap.set(r.service_name, new Map());
    const sm = serviceMap.get(r.service_name)!;
    sm.set(d, (sm.get(d) ?? 0) + r.cost);
  });
  const sorted = [...dateMap.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const xData = sorted.map(([date]) => formatDateLabel(date));
  const yData = sorted.map(([, cost]) => Math.round(cost * 100) / 100);

  const isSinglePoint = sorted.length === 1;
  const serviceNames = [...serviceMap.keys()];

  // Spike detection: mark days where cost > 2x average
  const avg =
    yData.length > 0 ? yData.reduce((a, b) => a + b, 0) / yData.length : 0;
  const spikeIndices = new Set(
    yData.map((v, i) => (v > avg * 2 ? i : -1)).filter((i) => i >= 0),
  );
  const showMark =
    yData.length > 1
      ? (_value: number, params?: { dataIndex: number }) =>
          params ? spikeIndices.has(params.dataIndex) : false
      : false;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Cost Trend</CardTitle>
      </CardHeader>
      <CardContent className="h-[280px]">
        {sorted.length > 0 ? (
          isSinglePoint ? (
            <LineChart
              xAxis={[
                {
                  data: serviceNames,
                  scaleType: "band",
                  tickLabelStyle: { fontSize: 10, fill: "hsl(215 20% 65%)" },
                },
              ]}
              yAxis={[
                {
                  tickLabelStyle: { fontSize: 10, fill: "hsl(215 20% 65%)" },
                },
              ]}
              series={[
                {
                  data: serviceNames.map(
                    (s) =>
                      Math.round(
                        (serviceMap.get(s)!.get(sorted[0][0]) ?? 0) * 100,
                      ) / 100,
                  ),
                  color: "#3B82F6",
                  area: true,
                  showMark: true,
                },
              ]}
              sx={{
                ".MuiLineElement-root": { strokeWidth: 2 },
                ".MuiAreaElement-root": { fillOpacity: 0.15 },
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
          ) : (
            <LineChart
              xAxis={[
                {
                  data: xData,
                  scaleType: "point",
                  tickLabelStyle: { fontSize: 10, fill: "hsl(215 20% 65%)" },
                },
              ]}
              yAxis={[
                {
                  tickLabelStyle: { fontSize: 10, fill: "hsl(215 20% 65%)" },
                },
              ]}
              series={[
                {
                  data: yData,
                  area: true,
                  color: "#3B82F6",
                  showMark: showMark as any,
                },
              ]}
              sx={{
                ".MuiLineElement-root": { strokeWidth: 2 },
                ".MuiAreaElement-root": { fillOpacity: 0.15 },
                ".MuiChartsAxis-line": { stroke: "hsl(217 33% 20%)" },
                ".MuiChartsAxis-tick": { stroke: "hsl(217 33% 20%)" },
                ".MuiChartsGrid-line": {
                  stroke: "hsl(217 33% 20%)",
                  strokeDasharray: "3 3",
                },
                ".MuiMarkElement-root": { fill: "#EF4444", stroke: "#EF4444" },
              }}
              grid={{ horizontal: true }}
              height={240}
              margin={{ left: 50, right: 20, top: 20, bottom: 30 }}
              hideLegend
            />
          )
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No data
          </div>
        )}
      </CardContent>
    </Card>
  );
}
