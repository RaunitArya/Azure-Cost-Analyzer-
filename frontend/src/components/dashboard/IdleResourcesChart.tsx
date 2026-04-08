import { useMemo } from "react";
import { CostRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart } from "@mui/x-charts/BarChart";
import { getServiceColor } from "@/lib/colors";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface IdleResourcesChartProps {
  records: CostRecord[];
}

interface ServiceUtilisation {
  name: string;
  totalCost: number;
  activeDays: number;
  totalDays: number;
  utilisation: number;
  wastedCost: number;
  isIdle: boolean;
  color: string;
}

const IDLE_THRESHOLD = 40;

export function IdleResourcesChart({ records }: IdleResourcesChartProps) {
  const { services, totalDays, idleCount, totalWasted } = useMemo(() => {
    if (records.length === 0) {
      return { services: [], totalDays: 0, idleCount: 0, totalWasted: 0 };
    }

    // Calendar days in the window
    const allDates = new Set(records.map((r) => r.date.slice(0, 10)));
    const totalDays = allDates.size;

    // Per-service: cost per day
    type SvcData = { costMap: Map<string, number>; totalCost: number };
    const svcMap = new Map<string, SvcData>();

    records.forEach((r) => {
      const d = r.date.slice(0, 10);
      if (!svcMap.has(r.service_name)) {
        svcMap.set(r.service_name, { costMap: new Map(), totalCost: 0 });
      }
      const sd = svcMap.get(r.service_name)!;
      sd.costMap.set(d, (sd.costMap.get(d) ?? 0) + r.cost);
      sd.totalCost += r.cost;
    });

    const result: ServiceUtilisation[] = [...svcMap.entries()].map(([name, sd], idx) => {
      const activeDays = sd.costMap.size;
      const utilisation = totalDays > 0 ? Math.round((activeDays / totalDays) * 100) : 0;
      const isIdle = utilisation < IDLE_THRESHOLD;

      // Wasted cost = average daily cost × idle days
      const avgDailyCost = activeDays > 0 ? sd.totalCost / activeDays : 0;
      const idleDays = totalDays - activeDays;

      const wastedCost = isIdle ? Math.round(avgDailyCost * idleDays * 100) / 100 : 0;

      return {
        name,
        totalCost: Math.round(sd.totalCost * 100) / 100,
        activeDays,
        totalDays,
        utilisation,
        wastedCost,
        isIdle,
        color: getServiceColor(name, idx),
      };
    });

    // Sort: idle first, then by total cost desc
    result.sort((a, b) => {
      if (a.isIdle !== b.isIdle) return a.isIdle ? -1 : 1;
      return b.totalCost - a.totalCost;
    });

    const idleCount = result.filter((s) => s.isIdle).length;
    const totalWasted = result.reduce((sum, s) => sum + s.wastedCost, 0);

    return { services: result, totalDays, idleCount, totalWasted };
  }, [records]);

  const fmt = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  const serviceNames = services.map((s) => s.name);
  const utilisationData = services.map((s) => s.utilisation);
  const inactiveData = services.map((s) => (s.utilisation < 100 ? 100 - s.utilisation : 0));
  const wastedData = services.map((s) =>
    services.find((x) => x.name === s.name)?.totalCost
      ? Math.round((s.wastedCost / s.totalCost) * 100)
      : 0,
  );

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Idle / Underutilised Resources</CardTitle>
          <div className="flex items-center gap-2">
            {idleCount > 0 ? (
              <span className="flex items-center gap-1 text-[10px] font-medium text-white bg-[#EF4444] px-2 py-0.5 rounded-full">
                <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />
                {idleCount} idle service{idleCount > 1 ? "s" : ""}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="h-3 w-3" strokeWidth={1.5} />
                All active
              </span>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Blue = days active % · Gray = inactive days % — over {totalDays} day window
        </p>
      </CardHeader>
      <CardContent className="h-[300px]">
        {services.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No data
          </div>
        ) : (
          <>
            <BarChart
              layout="horizontal"
              xAxis={[
                {
                  min: 0,
                  max: 100,
                  tickLabelStyle: { fontSize: 10, fill: "hsl(215 20% 65%)" },
                  valueFormatter: (v) => `${v}%`,
                },
              ]}
              yAxis={[
                {
                  data: serviceNames,
                  scaleType: "band",
                  tickLabelStyle: {
                    fontSize: 10,
                    fill: "hsl(215 20% 65%)",
                  },
                },
              ]}
              series={[
                {
                  data: utilisationData,
                  label: "Active days %",
                  color: "#3B82F6",
                  valueFormatter: (v) => `${v}% active`,
                },
                {
                  data: inactiveData,
                  label: "Inactive days %",
                  color: "#EF4444",
                  valueFormatter: (v) => `${v}% inactive`,
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
              height={220}
              margin={{ left: 110, right: 20, top: 10, bottom: 30 }}
              hideLegend
            />

            {/* Summary row */}
            <div className="flex items-center justify-between px-1 -mt-1">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#3B82F6]" />
                  <span className="text-[10px] text-muted-foreground">Active days %</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#EF4444]" />
                  <span className="text-[10px] text-muted-foreground">Inactive days %</span>
                </div>
              </div>
              {totalWasted > 0 && (
                <span className="text-[11px]  text-[#EF4444] font-medium">
                  Est. waste: {fmt(totalWasted)}
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
