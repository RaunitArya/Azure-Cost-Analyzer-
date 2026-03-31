import { useMemo } from "react";
import { CostRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart } from "@mui/x-charts/LineChart";
import { getServiceColor } from "@/lib/colors";

interface CostUsageCorrelationProps {
  records: CostRecord[];
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

const UNIT_RATE: Record<string, number> = {
  "Virtual Machines": 0.048,
  Storage: 0.018,
  Bandwidth: 0.083,
  "App Services": 0.073,
  Databases: 0.065,
};
const DEFAULT_RATE = 0.05;

function estimateUsage(service: string, cost: number, dateStr: string): number {
  const rate = UNIT_RATE[service] ?? DEFAULT_RATE;

  const dow = new Date(dateStr + "T00:00:00").getDay();
  const weekendFactor = dow === 0 || dow === 6 ? 0.75 : 1.0;
  return Math.round((cost / rate) * weekendFactor * 10) / 10;
}

export function CostUsageCorrelation({ records }: CostUsageCorrelationProps) {
  const { xLabels, costSeries, usageSeries, hasData } = useMemo(() => {
    if (records.length === 0) {
      return { xLabels: [], costSeries: [], usageSeries: [], hasData: false };
    }

    // Aggregate per day
    type DayData = { cost: number; usage: number };
    const dayMap = new Map<string, DayData>();

    records.forEach((r) => {
      const d = r.date.slice(0, 10);
      const prev = dayMap.get(d) ?? { cost: 0, usage: 0 };
      dayMap.set(d, {
        cost: prev.cost + r.cost,
        usage: prev.usage + estimateUsage(r.service_name, r.cost, d),
      });
    });

    const sorted = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    const xLabels = sorted.map(([date]) => formatDateLabel(date));
    const costSeries = sorted.map(([, v]) => Math.round(v.cost * 100) / 100);
    const usageSeries = sorted.map(([, v]) => Math.round(v.usage * 10) / 10);

    return { xLabels, costSeries, usageSeries, hasData: sorted.length > 0 };
  }, [records]);

  const divergenceDays = useMemo(() => {
    if (costSeries.length < 2) return new Set<number>();
    const result = new Set<number>();
    for (let i = 1; i < costSeries.length; i++) {
      const costDelta = costSeries[i] - costSeries[i - 1];
      const usageDelta = usageSeries[i] - usageSeries[i - 1];
      const costPct = costSeries[i - 1] > 0 ? costDelta / costSeries[i - 1] : 0;
      const usagePct = usageSeries[i - 1] > 0 ? usageDelta / usageSeries[i - 1] : 0;
      if (costPct > 0.1 && usagePct < costPct * 0.5) {
        result.add(i);
      }
    }
    return result;
  }, [costSeries, usageSeries]);

  const maxCost = Math.max(...costSeries, 0);
  const maxUsage = Math.max(...usageSeries, 1);
  const scaledUsage = usageSeries.map((u) => (u / maxUsage) * maxCost);

  const primaryColor = getServiceColor("Virtual Machines", 0); // #3B82F6

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Cost vs Usage Correlation</CardTitle>
          {divergenceDays.size > 0 && (
            <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
              {divergenceDays.size} divergence day
              {divergenceDays.size > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Solid = cost · Dashed = estimated usage (normalised)
        </p>
      </CardHeader>
      <CardContent className="h-[300px]">
        {!hasData ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No data
          </div>
        ) : (
          <LineChart
            xAxis={[
              {
                data: xLabels,
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
                data: costSeries,
                label: "Cost (₹)",
                color: primaryColor,
                area: true,
                showMark: (p) => divergenceDays.has(p.index),
              },
              {
                data: scaledUsage,
                label: "Usage (est.)",
                color: "#10B981",
                area: false,
                showMark: false,
              },
            ]}
            sx={{
              ".MuiLineElement-series-auto-generated-id-0": {
                strokeWidth: 2,
                strokeDasharray: "none",
              },
              ".MuiLineElement-series-auto-generated-id-1": {
                strokeWidth: 1.5,
                strokeDasharray: "5 3",
              },
              ".MuiAreaElement-root": { fillOpacity: 0.12 },
              ".MuiChartsAxis-line": { stroke: "hsl(217 33% 20%)" },
              ".MuiChartsAxis-tick": { stroke: "hsl(217 33% 20%)" },
              ".MuiChartsGrid-line": {
                stroke: "hsl(217 33% 20%)",
                strokeDasharray: "3 3",
              },

              ".MuiMarkElement-root": {
                fill: "#F59E0B",
                stroke: "#F59E0B",
                r: 4,
              },
            }}
            grid={{ horizontal: true }}
            height={250}
            margin={{ left: 52, right: 20, top: 16, bottom: 30 }}
            hideLegend
          />
        )}

        {/* Manual legend */}
        {hasData && (
          <div className="flex items-center justify-center gap-5 -mt-1">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-5 rounded"
                style={{ backgroundColor: primaryColor }}
              />
              <span className="text-[10px] text-muted-foreground">Cost (₹)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-5 rounded"
                style={{
                  backgroundColor: "#10B981",
                  backgroundImage:
                    "repeating-linear-gradient(90deg,#10B981 0,#10B981 4px,transparent 4px,transparent 7px)",
                }}
              />
              <span className="text-[10px] text-muted-foreground">Usage (est.)</span>
            </div>
            {divergenceDays.size > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                <span className="text-[10px] text-amber-400">Cost↑ Usage↔</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
