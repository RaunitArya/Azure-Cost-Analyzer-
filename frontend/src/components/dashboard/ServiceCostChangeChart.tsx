import { useMemo } from "react";
import { CostRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart } from "@mui/x-charts/BarChart";
import { getServiceColor } from "@/lib/colors";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const fmt = (v: number) => `₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

interface ServiceChange {
  name: string;
  prev: number;
  curr: number;

  delta: number;

  pct: number;
  color: string;
}

function computeChanges(records: CostRecord[]): {
  changes: ServiceChange[];
  periodA: string;
  periodB: string;
} {
  if (records.length === 0) return { changes: [], periodA: "", periodB: "" };

  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const dates = [...new Set(sorted.map((r) => r.date.slice(0, 10)))].sort();

  if (dates.length < 2) return { changes: [], periodA: "", periodB: "" };

  const mid = Math.floor(dates.length / 2);
  const halfA = new Set(dates.slice(0, mid));
  const halfB = new Set(dates.slice(mid));

  const sumA = new Map<string, number>();
  const sumB = new Map<string, number>();

  sorted.forEach((r) => {
    const d = r.date.slice(0, 10);
    if (halfA.has(d)) sumA.set(r.service_name, (sumA.get(r.service_name) ?? 0) + r.cost);
    else if (halfB.has(d)) sumB.set(r.service_name, (sumB.get(r.service_name) ?? 0) + r.cost);
  });

  const allServices = new Set([...sumA.keys(), ...sumB.keys()]);

  const changes: ServiceChange[] = [...allServices].map((name, idx) => {
    const prev = sumA.get(name) ?? 0;
    const curr = sumB.get(name) ?? 0;
    const delta = curr - prev;
    const pct = prev > 0 ? Math.round((delta / prev) * 100) : curr > 0 ? 100 : 0;
    return { name, prev, curr, delta, pct, color: getServiceColor(name, idx) };
  });

  changes.sort((a, b) => b.pct - a.pct);

  const fmtPeriod = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });

  return {
    changes,
    periodA: `${fmtPeriod(dates[0])} – ${fmtPeriod(dates[mid - 1])}`,
    periodB: `${fmtPeriod(dates[mid])} – ${fmtPeriod(dates[dates.length - 1])}`,
  };
}

interface ServiceCostChangeChartProps {
  records: CostRecord[];
}

export function ServiceCostChangeChart({ records }: ServiceCostChangeChartProps) {
  const { changes, periodA, periodB, hasData } = useMemo(() => {
    const result = computeChanges(records);
    return { ...result, hasData: result.changes.length > 0 };
  }, [records]);

  const serviceNames = changes.map((c) => c.name);

  const growthData = changes.map((c) => (c.pct > 0 ? c.pct : 0));
  const savingsData = changes.map((c) => (c.pct < 0 ? c.pct : 0));

  const increased = changes.filter((c) => c.pct > 0).length;
  const decreased = changes.filter((c) => c.pct < 0).length;
  const unchanged = changes.filter((c) => c.pct === 0).length;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Service Cost % Change</CardTitle>
          <div className="flex items-center gap-2">
            {increased > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-destructive">
                <TrendingUp className="h-3 w-3" strokeWidth={1.5} />
                {increased} up
              </span>
            )}
            {decreased > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-emerald-400">
                <TrendingDown className="h-3 w-3" strokeWidth={1.5} />
                {decreased} down
              </span>
            )}
            {unchanged > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Minus className="h-3 w-3" strokeWidth={1.5} />
                {unchanged}
              </span>
            )}
          </div>
        </div>
        {periodA && (
          <p className="text-[11px] text-muted-foreground">
            {periodA} vs {periodB}
          </p>
        )}
      </CardHeader>
      <CardContent className="h-[300px]">
        {!hasData ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Not enough data — select a range spanning at least 2 days
          </div>
        ) : (
          <>
            <BarChart
              layout="horizontal"
              xAxis={[
                {
                  tickLabelStyle: { fontSize: 10, fill: "hsl(215 20% 65%)" },
                  valueFormatter: (v: number) => `${v > 0 ? "+" : ""}${v}%`,
                },
              ]}
              yAxis={[
                {
                  data: serviceNames,
                  scaleType: "band",
                  tickLabelStyle: { fontSize: 10, fill: "hsl(215 20% 65%)" },
                },
              ]}
              series={[
                {
                  data: growthData,
                  label: "Increased",
                  color: "#EF4444",
                  valueFormatter: (v: number) =>
                    v > 0 ? `+${v}% (${fmt(changes.find((c) => c.pct === v)?.delta ?? 0)})` : "",
                },
                {
                  data: savingsData,
                  label: "Decreased",
                  color: "#10B981",
                  valueFormatter: (v: number) =>
                    v < 0
                      ? `${v}% (saved ${fmt(Math.abs(changes.find((c) => c.pct === v)?.delta ?? 0))})`
                      : "",
                },
              ]}
              sx={{
                ".MuiBarElement-root": { rx: 3 },
                ".MuiChartsAxis-line": { stroke: "hsl(217 33% 20%)" },
                ".MuiChartsAxis-tick": { stroke: "hsl(217 33% 20%)" },
                ".MuiChartsGrid-line": {
                  stroke: "hsl(217 33% 20%)",
                  strokeDasharray: "3 3",
                },
              }}
              grid={{ vertical: true }}
              height={228}
              margin={{ left: 110, right: 20, top: 10, bottom: 30 }}
              hideLegend
            />

            {/* Summary row */}
            <div className="flex items-center justify-center gap-5 -mt-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#EF4444]" />
                <span className="text-[10px] text-muted-foreground">Cost increase</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#10B981]" />
                <span className="text-[10px] text-muted-foreground">Cost saving</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
