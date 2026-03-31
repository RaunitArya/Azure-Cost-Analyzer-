import { useMemo } from "react";
import { CostRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart } from "@mui/x-charts/LineChart";

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

const fmt = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

interface CumulativeSpendChartProps {
  records: CostRecord[];

  budget?: number;
}

export function CumulativeSpendChart({ records, budget }: CumulativeSpendChartProps) {
  const { xLabels, cumData, projData, totalSpend, hasData, onTrack } = useMemo(() => {
    if (records.length === 0) {
      return {
        xLabels: [],
        cumData: [],
        projData: [],
        totalSpend: 0,
        hasData: false,
        onTrack: true,
      };
    }

    // Daily totals
    const dayMap = new Map<string, number>();
    records.forEach((r) => {
      const d = r.date.slice(0, 10);
      dayMap.set(d, (dayMap.get(d) ?? 0) + r.cost);
    });

    const sorted = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const xLabels = sorted.map(([d]) => formatDateLabel(d));

    let running = 0;
    const cumData = sorted.map(([, v]) => {
      running += v;
      return Math.round(running * 100) / 100;
    });

    const lastDate = new Date(sorted[sorted.length - 1][0] + "T00:00:00");
    const daysElapsed = sorted.length;
    const dailyAvg = running / daysElapsed;
    const daysInMonth = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - lastDate.getDate();

    const projData: (number | null)[] = sorted.map(() => null);

    projData[projData.length - 1] = running;

    const projLabels = [...xLabels];
    for (let i = 1; i <= daysRemaining; i++) {
      const d = new Date(lastDate);
      d.setDate(d.getDate() + i);
      projLabels.push(formatDateLabel(d.toISOString().slice(0, 10)));
      projData.push(Math.round((running + dailyAvg * i) * 100) / 100);
    }

    while (cumData.length < projLabels.length) cumData.push(null as unknown as number);

    const projectedMonthEnd = running + dailyAvg * daysRemaining;
    const onTrack = budget ? projectedMonthEnd <= budget : true;

    return {
      xLabels: projLabels,
      cumData,
      projData,
      totalSpend: running,
      hasData: true,
      onTrack,
    };
  }, [records, budget]);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Cumulative Spend</CardTitle>
          {budget && budget > 0 && (
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                onTrack
                  ? "text-emerald-400 bg-emerald-400/10"
                  : "text-destructive bg-destructive/10"
              }`}
            >
              {onTrack ? "On track" : "Over budget pace"}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Running total · Dashed = projected to month-end
        </p>
      </CardHeader>
      <CardContent className="h-[300px]">
        {!hasData ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No data
          </div>
        ) : (
          <>
            <LineChart
              xAxis={[
                {
                  data: xLabels,
                  scaleType: "point",
                  tickLabelStyle: { fontSize: 10, fill: "hsl(215 20% 65%)" },

                  tickInterval: (_: unknown, i: number) => i % Math.ceil(xLabels.length / 10) === 0,
                },
              ]}
              yAxis={[
                {
                  tickLabelStyle: { fontSize: 10, fill: "hsl(215 20% 65%)" },
                },
              ]}
              series={[
                {
                  data: cumData,
                  label: "Actual",
                  color: "#3B82F6",
                  area: true,
                  showMark: false,
                  connectNulls: false,
                },
                {
                  data: projData,
                  label: "Projected",
                  color: "#F59E0B",
                  area: false,
                  showMark: false,
                  connectNulls: false,
                },
              ]}
              sx={{
                ".MuiLineElement-series-auto-generated-id-0": {
                  strokeWidth: 2,
                },

                ".MuiLineElement-series-auto-generated-id-1": {
                  strokeWidth: 1.5,
                  strokeDasharray: "6 3",
                },
                ".MuiAreaElement-root": { fillOpacity: 0.1 },
                ".MuiChartsAxis-line": { stroke: "hsl(217 33% 20%)" },
                ".MuiChartsAxis-tick": { stroke: "hsl(217 33% 20%)" },
                ".MuiChartsGrid-line": {
                  stroke: "hsl(217 33% 20%)",
                  strokeDasharray: "3 3",
                },
              }}
              grid={{ horizontal: true }}
              height={228}
              margin={{ left: 56, right: 16, top: 12, bottom: 30 }}
              hideLegend
            />

            {/* Manual legend + summary */}
            <div className="flex items-center justify-between px-1 -mt-1">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-5 rounded bg-[#3B82F6]" />
                  <span className="text-[10px] text-muted-foreground">Actual</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-0.5 w-5 rounded"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(90deg,#F59E0B 0,#F59E0B 5px,transparent 5px,transparent 8px)",
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground">Projected</span>
                </div>
                {budget && budget > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-0.5 w-5"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(90deg,#EF4444 0,#EF4444 3px,transparent 3px,transparent 6px)",
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground">Budget</span>
                  </div>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground font-medium">
                So far: {fmt(totalSpend)}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
