import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilterSettings } from "@/lib/types";
import { getAlertThresholds } from "@/lib/api";
import { useCostData } from "@/hooks/use-cost-data";
import { ControlPanel } from "@/components/dashboard/ControlPanel";
import { CostAreaChart } from "@/components/dashboard/CostAreaChart";
import { CostBarChart } from "@/components/dashboard/CostBarChart";
import { CostDonutChart } from "@/components/dashboard/CostDonutChart";
import { CostTable } from "@/components/dashboard/CostTable";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { WifiOff, TrendingUp, TrendingDown, ArrowRight, Layers, Zap } from "lucide-react";
import { getServiceColor } from "@/lib/colors";

// ─── helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// ─── mini Insight Card ─────────────────────────────────────────────────────────

interface InsightCardProps {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  color?: string;
}

function InsightCard({ label, value, sub, trend, color }: InsightCardProps) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p
          className="text-xl font-bold truncate"
          style={color ? { color } : undefined}
        >
          {value}
        </p>
        {(sub || trend) && (
          <div className="flex items-center gap-1 mt-1">
            {trend === "up" && (
              <TrendingUp className="h-3 w-3 text-destructive" strokeWidth={1.5} />
            )}
            {trend === "down" && (
              <TrendingDown className="h-3 w-3 text-emerald-400" strokeWidth={1.5} />
            )}
            {sub && (
              <span
                className={`text-[11px] ${
                  trend === "up"
                    ? "text-destructive"
                    : trend === "down"
                    ? "text-emerald-400"
                    : "text-muted-foreground"
                }`}
              >
                {sub}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Service breakdown row ────────────────────────────────────────────────────

interface ServiceRowProps {
  name: string;
  cost: number;
  pct: number;
  idx: number;
  prevCost?: number;
}

function ServiceRow({ name, cost, pct, idx, prevCost }: ServiceRowProps) {
  const color = getServiceColor(name, idx);
  const delta =
    prevCost != null && prevCost > 0
      ? ((cost - prevCost) / prevCost) * 100
      : null;

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <span
        className="h-2.5 w-2.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="flex-1 text-sm truncate">{name}</span>
      {delta !== null && (
        <span
          className={`text-[10px] font-medium ${
            delta > 0 ? "text-destructive" : "text-emerald-400"
          }`}
        >
          {delta > 0 ? "▲" : "▼"} {Math.abs(Math.round(delta))}%
        </span>
      )}
      <div className="w-24 text-right">
        <span className="text-xs font-mono font-medium">{fmt(cost)}</span>
        <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const CostAnalysis = () => {
  const [filters, setFilters] = useState<FilterSettings>({
    granularity: "daily",
    groupBy: "service",
    budget: 0,
    startDate: "",
    endDate: "",
  });

  const { data, isLoading, isError } = useCostData(
    filters.granularity,
    filters.startDate || undefined,
    filters.endDate || undefined,
  );

  const { data: thresholds = [] } = useQuery({
    queryKey: ["alert-thresholds"],
    queryFn: () => getAlertThresholds({ active_only: true }),
    staleTime: 60_000,
  });

  const totalBudget = useMemo(
    () =>
      thresholds
        .filter((t) => t.period_type === filters.granularity)
        .reduce((sum, t) => sum + (t.absolute_threshold ?? 0), 0),
    [thresholds, filters.granularity],
  );

  const handleApplyFilters = useCallback((f: FilterSettings) => {
    setFilters(f);
  }, []);

  const records = useMemo(() => {
    let items = data?.data ?? [];
    if (filters.startDate)
      items = items.filter((r) => r.date.slice(0, 10) >= filters.startDate);
    if (filters.endDate)
      items = items.filter((r) => r.date.slice(0, 10) <= filters.endDate);
    return items;
  }, [data, filters.startDate, filters.endDate]);

  // ── derived metrics ──────────────────────────────────────────────────────

  const { serviceMap, totalCost, topService, activeServices } = useMemo(() => {
    const sMap = new Map<string, number>();
    records.forEach((r) =>
      sMap.set(r.service_name, (sMap.get(r.service_name) ?? 0) + r.cost),
    );
    const total = [...sMap.values()].reduce((a, b) => a + b, 0);
    const top = [...sMap.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      serviceMap: sMap,
      totalCost: total,
      topService: top,
      activeServices: sMap.size,
    };
  }, [records]);

  // half-period comparison for trend
  const { periodDelta, periodLabel } = useMemo(() => {
    if (records.length < 2) return { periodDelta: 0, periodLabel: "" };
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
    const mid = Math.floor(sorted.length / 2);
    const first = sorted.slice(0, mid).reduce((s, r) => s + r.cost, 0);
    const second = sorted.slice(mid).reduce((s, r) => s + r.cost, 0);
    if (first === 0) return { periodDelta: 0, periodLabel: "" };
    const pct = Math.round(((second - first) / first) * 100);
    return {
      periodDelta: pct,
      periodLabel: `${Math.abs(pct)}% vs prior half`,
    };
  }, [records]);

  // daily average
  const dailyAvg = useMemo(() => {
    const dates = new Set(records.map((r) => r.date.slice(0, 10)));
    return dates.size > 0 ? totalCost / dates.size : 0;
  }, [records, totalCost]);

  // sorted services for breakdown panel
  const sortedServices = useMemo(
    () => [...serviceMap.entries()].sort((a, b) => b[1] - a[1]),
    [serviceMap],
  );

  return (
    <div className="min-h-full bg-background text-foreground">
      {/* Page header */}
      <div className="flex items-center gap-3 px-6 py-4">
        <TrendingUp className="h-5 w-5 text-primary" strokeWidth={1.5} />
        <div>
          <h2 className="text-lg font-semibold leading-none">Cost Analysis</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Deep-dive into your Azure spending
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-6 pb-6">
        <ControlPanel filters={filters} onApplyFilters={handleApplyFilters} />

        {/* ── Loading ── */}
        {isLoading && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <Skeleton className="h-[340px] rounded-lg lg:col-span-2" />
              <Skeleton className="h-[340px] rounded-lg" />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-[300px] rounded-lg" />
              <Skeleton className="h-[300px] rounded-lg" />
            </div>
            <Skeleton className="h-[400px] rounded-lg" />
          </div>
        )}

        {/* ── Error ── */}
        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/40 py-16 text-center">
            <WifiOff
              className="h-10 w-10 text-destructive"
              strokeWidth={1.5}
            />
            <p className="text-sm text-destructive">
              Failed to fetch data. Ensure your FastAPI backend is running.
            </p>
          </div>
        )}

        {/* ── Data ── */}
        {data && !isLoading && (
          <>
            {/* KPI row */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <InsightCard
                label="Total Spend"
                value={fmt(totalCost)}
                sub={periodLabel}
                trend={
                  periodDelta > 0
                    ? "up"
                    : periodDelta < 0
                    ? "down"
                    : "neutral"
                }
              />
              <InsightCard
                label="Daily Average"
                value={fmt(dailyAvg)}
                sub="per calendar day"
                trend="neutral"
              />
              <InsightCard
                label="Top Service"
                value={topService?.[0] ?? "—"}
                sub={topService ? fmt(topService[1]) : undefined}
                color={topService ? getServiceColor(topService[0], 0) : undefined}
              />
              <InsightCard
                label="Active Services"
                value={String(activeServices)}
                sub={`${records.length} records`}
                trend="neutral"
              />
            </div>

            {/* Main charts row */}
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Area chart spans 2 cols */}
              <div className="lg:col-span-2">
                <CostAreaChart records={records} />
              </div>

              {/* Service breakdown panel */}
              <Card className="border-border bg-card">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <p className="text-sm font-medium">Service Breakdown</p>
                  <Layers
                    className="h-4 w-4 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                </div>
                <CardContent className="px-4 pb-4 pt-0 overflow-auto max-h-[260px]">
                  {sortedServices.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No data
                    </p>
                  ) : (
                    sortedServices.map(([name, cost], idx) => (
                      <ServiceRow
                        key={name}
                        name={name}
                        cost={cost}
                        pct={totalCost > 0 ? (cost / totalCost) * 100 : 0}
                        idx={idx}
                      />
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Bar + Donut row */}
            <div className="grid gap-4 lg:grid-cols-2">
              <CostBarChart records={records} />
              <CostDonutChart records={records} budget={totalBudget} />
            </div>

            {/* Efficiency insights */}
            {sortedServices.length > 1 && (
              <div className="grid gap-4 sm:grid-cols-3">
                {/* Highest spend */}
                <Card className="border-border bg-card">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/15">
                      <Zap
                        className="h-4 w-4 text-destructive"
                        strokeWidth={1.5}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Highest Spend
                      </p>
                      <p className="text-sm font-semibold truncate">
                        {sortedServices[0][0]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmt(sortedServices[0][1])} —{" "}
                        {Math.round(
                          (sortedServices[0][1] / totalCost) * 100,
                        )}
                        % of total
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Lowest spend */}
                <Card className="border-border bg-card">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                      <TrendingDown
                        className="h-4 w-4 text-emerald-400"
                        strokeWidth={1.5}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Lowest Spend
                      </p>
                      <p className="text-sm font-semibold truncate">
                        {sortedServices[sortedServices.length - 1][0]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmt(sortedServices[sortedServices.length - 1][1])}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Cost concentration */}
                <Card className="border-border bg-card">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
                      <ArrowRight
                        className="h-4 w-4 text-primary"
                        strokeWidth={1.5}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Cost Concentration
                      </p>
                      <p className="text-sm font-semibold">
                        Top service:{" "}
                        {Math.round(
                          (sortedServices[0][1] / totalCost) * 100,
                        )}
                        %
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Across {activeServices} service
                        {activeServices !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Full data table */}
            <CostTable records={records} />
          </>
        )}
      </div>
    </div>
  );
};

export default CostAnalysis;
