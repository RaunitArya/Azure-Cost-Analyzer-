import { useMemo } from "react";
import { CostRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart } from "@mui/x-charts/BarChart";
import { getServiceColor } from "@/lib/colors";



const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function monthLabel(ym: string): string {
  const [year, month] = ym.split("-");
  return `${MONTHS[parseInt(month, 10) - 1]} '${year.slice(2)}`;
}



interface MonthOverMonthChartProps {
  records: CostRecord[];
}

export function MonthOverMonthChart({ records }: MonthOverMonthChartProps) {
  const { months, series, hasData } = useMemo(() => {
    if (records.length === 0) return { months: [], series: [], hasData: false };


    const monthServiceMap = new Map<string, Map<string, number>>();
    const allServices = new Set<string>();

    records.forEach((r) => {
      const ym = r.date.slice(0, 7); // "YYYY-MM"
      allServices.add(r.service_name);
      if (!monthServiceMap.has(ym)) monthServiceMap.set(ym, new Map());
      const sm = monthServiceMap.get(ym)!;
      sm.set(r.service_name, (sm.get(r.service_name) ?? 0) + r.cost);
    });

    const sortedMonths = [...monthServiceMap.keys()].sort();
    const services = [...allServices];

    const series = services.map((svc, i) => ({
      data: sortedMonths.map(
        (ym) => Math.round((monthServiceMap.get(ym)?.get(svc) ?? 0) * 100) / 100,
      ),
      label: svc,
      color: getServiceColor(svc, i),
      stack: "total",
      highlightScope: { fade: "global", highlight: "item" } as const,
    }));

    return {
      months: sortedMonths.map(monthLabel),
      series,
      hasData: sortedMonths.length > 0,
    };
  }, [records]);

  const legendServices = useMemo(
    () => [...new Set(records.map((r) => r.service_name))],
    [records],
  );

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Month-over-Month Comparison
          </CardTitle>
          <span className="text-[11px] text-muted-foreground">
            {months.length} month{months.length !== 1 ? "s" : ""}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Stacked spend per service across billing periods
        </p>
      </CardHeader>
      <CardContent className="h-[320px]">
        {!hasData ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No data
          </div>
        ) : (
          <>
            <BarChart
              xAxis={[
                {
                  data: months,
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
                ".MuiBarElement-root": { rx: 3 },
                ".MuiChartsAxis-line": { stroke: "hsl(217 33% 20%)" },
                ".MuiChartsAxis-tick": { stroke: "hsl(217 33% 20%)" },
                ".MuiChartsGrid-line": {
                  stroke: "hsl(217 33% 20%)",
                  strokeDasharray: "3 3",
                },
              }}
              grid={{ horizontal: true }}
              height={255}
              margin={{ left: 52, right: 16, top: 12, bottom: 30 }}
              hideLegend
            />
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 -mt-1">
              {legendServices.map((s, i) => (
                <div key={s} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: getServiceColor(s, i) }}
                  />
                  {s}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
