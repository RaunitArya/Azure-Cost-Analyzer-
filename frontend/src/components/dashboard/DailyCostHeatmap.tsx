import { useMemo } from "react";
import { CostRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

interface DayCell {
  date: string;
  cost: number;
  dayOfWeek: number;
  weekIndex: number;
  month: number;
}

function costToColor(norm: number): string {
  if (norm === 0) return "hsl(217 33% 13%)";
  const hue = Math.round(220 - norm * 180);
  const sat = Math.round(60 + norm * 30);
  const light = Math.round(25 + norm * 35);
  return `hsl(${hue} ${sat}% ${light}%)`;
}

interface DailyCostHeatmapProps {
  records: CostRecord[];
}

export function DailyCostHeatmap({ records }: DailyCostHeatmapProps) {
  const { weeks, maxCost, monthLabels, totalDays } = useMemo(() => {
    const dayMap = new Map<string, number>();
    records.forEach((r) => {
      const d = r.date.slice(0, 10);
      dayMap.set(d, (dayMap.get(d) ?? 0) + r.cost);
    });

    if (dayMap.size === 0) {
      return { weeks: [], maxCost: 0, monthLabels: [], totalDays: 0 };
    }

    const sortedDates = [...dayMap.keys()].sort();
    const firstDate = new Date(sortedDates[0] + "T00:00:00");
    const lastDate = new Date(sortedDates[sortedDates.length - 1] + "T00:00:00");

    // full week boundaries (Sun–Sat)
    const start = new Date(firstDate);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(lastDate);
    end.setDate(end.getDate() + (6 - end.getDay()));

    const cells: DayCell[] = [];
    const cur = new Date(start);
    let weekIdx = 0;
    let prevDow = -1;

    while (cur <= end) {
      const ymd = cur.toISOString().slice(0, 10);
      const dow = cur.getDay();
      if (dow < prevDow) weekIdx++;
      prevDow = dow;
      cells.push({
        date: ymd,
        cost: dayMap.get(ymd) ?? 0,
        dayOfWeek: dow,
        weekIndex: weekIdx,
        month: cur.getMonth(),
      });
      cur.setDate(cur.getDate() + 1);
    }

    const max = Math.max(...cells.map((c) => c.cost), 0);

    // First cell of each month → label position
    const seen = new Set<number>();
    const labels: { weekIndex: number; label: string }[] = [];
    cells.forEach((c) => {
      if (!seen.has(c.month)) {
        seen.add(c.month);
        labels.push({ weekIndex: c.weekIndex, label: MONTHS[c.month] });
      }
    });

    // Group into week columns
    const numWeeks = weekIdx + 1;
    const weekCols: (DayCell | null)[][] = Array.from({ length: numWeeks }, () =>
      Array(7).fill(null),
    );
    cells.forEach((c) => {
      weekCols[c.weekIndex][c.dayOfWeek] = c;
    });

    return { weeks: weekCols, maxCost: max, monthLabels: labels, totalDays: dayMap.size };
  }, [records]);

  const fmt = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  const CELL = 14;
  const GAP = 2;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Cost Heatmap</CardTitle>
          <span className="text-[11px] text-muted-foreground">{totalDays} days tracked</span>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {weeks.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No data
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div
              className="relative"
              style={{
                minWidth: weeks.length * (CELL + GAP),
                paddingTop: 22,
                paddingLeft: 28,
              }}
            >
              {/* Month labels */}
              <div className="absolute top-0 left-7">
                {monthLabels.map((ml) => (
                  <span
                    key={ml.label + ml.weekIndex}
                    className="text-[10px] text-muted-foreground absolute whitespace-nowrap"
                    style={{ left: ml.weekIndex * (CELL + GAP) }}
                  >
                    {ml.label}
                  </span>
                ))}
              </div>

              {/* Day-of-week labels (odd rows only: Mon, Wed, Fri) */}
              <div className="absolute left-0 top-[22px] flex flex-col" style={{ gap: GAP }}>
                {DAYS.map((d, i) =>
                  i % 2 === 1 ? (
                    <span
                      key={d}
                      className="text-[9px] text-muted-foreground leading-none flex items-center"
                      style={{ height: CELL }}
                    >
                      {d.slice(0, 1)}
                    </span>
                  ) : (
                    <span key={d} style={{ height: CELL, display: "block" }} />
                  ),
                )}
              </div>

              {/* Cell grid */}
              <div className="flex" style={{ gap: GAP }}>
                {weeks.map((col, wi) => (
                  <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                    {col.map((cell, di) => {
                      const norm = cell && maxCost > 0 ? cell.cost / maxCost : 0;
                      const isToday = cell?.date === new Date().toISOString().slice(0, 10);
                      return (
                        <div
                          key={di}
                          title={
                            cell && cell.cost > 0
                              ? `${cell.date}: ${fmt(cell.cost)}`
                              : (cell?.date ?? undefined)
                          }
                          style={{
                            width: CELL,
                            height: CELL,
                            borderRadius: 3,
                            backgroundColor: costToColor(cell ? norm : 0),
                            outline: isToday ? "1.5px solid hsl(215 80% 65%)" : undefined,
                            cursor: cell && cell.cost > 0 ? "pointer" : "default",
                            flexShrink: 0,
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Gradient legend */}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">Less</span>
                {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => (
                  <div
                    key={v}
                    style={{
                      width: CELL,
                      height: CELL,
                      borderRadius: 3,
                      backgroundColor: costToColor(v),
                    }}
                  />
                ))}
                <span className="text-[10px] text-muted-foreground">More</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  Peak: {fmt(maxCost)}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
