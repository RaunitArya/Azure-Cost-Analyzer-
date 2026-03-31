import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { FilterSettings, CostRecord } from "@/lib/types";
import { getAlertThresholds, getAlertEvents } from "@/lib/api";
import { useCostData } from "@/hooks/use-cost-data";
import { ControlPanel } from "@/components/dashboard/ControlPanel";
import { MonthOverMonthChart } from "@/components/dashboard/Monthovermonthchart";
import { CumulativeSpendChart } from "@/components/dashboard/CumulativeSpendChart";
import { ServiceCostChangeChart } from "@/components/dashboard/Servicecostchangechart";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileText,
  Download,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  WifiOff,
  Calendar,
  Layers,
  IndianRupee,
} from "lucide-react";
import { getServiceColor } from "@/lib/colors";

const fmt = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

interface SummaryRowProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
}

function SummaryRow({ label, value, icon, highlight }: SummaryRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <span className={`text-sm font-semibold ${highlight ? "text-primary" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

interface ServiceStat {
  name: string;
  category: string;
  totalCost: number;
  records: number;
  avgCost: number;
  maxCost: number;
  pct: number;
  idx: number;
}

function buildStats(records: CostRecord[]): ServiceStat[] {
  const map = new Map<string, CostRecord[]>();
  records.forEach((r) => {
    if (!map.has(r.service_name)) map.set(r.service_name, []);
    map.get(r.service_name)!.push(r);
  });
  const total = records.reduce((s, r) => s + r.cost, 0);
  return [...map.entries()]
    .map(([name, recs], idx) => {
      const costs = recs.map((r) => r.cost);
      const sum = costs.reduce((a, b) => a + b, 0);
      return {
        name,
        category: recs[0].service_category ?? "—",
        totalCost: sum,
        records: recs.length,
        avgCost: sum / costs.length,
        maxCost: Math.max(...costs),
        pct: total > 0 ? (sum / total) * 100 : 0,
        idx,
      };
    })
    .sort((a, b) => b.totalCost - a.totalCost);
}

function exportCSV(records: CostRecord[], filename: string) {
  const headers = ["Service", "Category", "Cost", "Currency", "Date"];
  const rows = records.map((r) => [
    r.service_name,
    r.service_category,
    r.cost.toFixed(2),
    r.currency,
    r.date.slice(0, 10),
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJSON(records: CostRecord[], meta: Record<string, unknown>, filename: string) {
  const blob = new Blob([JSON.stringify({ meta, data: records }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const Reports = () => {
  // Blank dates by default — user must apply filters explicitly
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

  const { data: alertHistory = [] } = useQuery({
    queryKey: ["alert-events-history"],
    queryFn: () => getAlertEvents({ limit: 100 }),
    staleTime: 30_000,
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

    if (filters.granularity === "daily") {
      if (filters.startDate) items = items.filter((r) => r.date.slice(0, 10) >= filters.startDate);
      if (filters.endDate) items = items.filter((r) => r.date.slice(0, 10) <= filters.endDate);
    }
    return items;
  }, [data, filters.startDate, filters.endDate, filters.granularity]);

  const totalCost = useMemo(() => records.reduce((s, r) => s + r.cost, 0), [records]);

  const stats = useMemo(() => buildStats(records), [records]);

  const dateRange = useMemo(() => {
    if (!records.length) return "—";
    const dates = records.map((r) => r.date.slice(0, 10)).sort();
    if (filters.granularity === "monthly") {
      const fmtMonth = (d: string) =>
        new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
          month: "short",
          year: "numeric",
        });
      return `${fmtMonth(dates[0])} – ${fmtMonth(dates[dates.length - 1])}`;
    }
    return `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}`;
  }, [records, filters.granularity]);

  const uniqueDates = useMemo(
    () => new Set(records.map((r) => r.date.slice(0, 10))).size,
    [records],
  );

  const dataPointsLabel = useMemo(() => {
    const unit =
      filters.granularity === "monthly"
        ? `${uniqueDates} month${uniqueDates !== 1 ? "s" : ""}`
        : `${uniqueDates} day${uniqueDates !== 1 ? "s" : ""}`;
    return `${records.length} records · ${unit}`;
  }, [records.length, uniqueDates, filters.granularity]);

  const budgetPct = totalBudget > 0 ? Math.round((totalCost / totalBudget) * 100) : null;

  const openAlerts = alertHistory.filter((e) => e.status === "open").length;

  const trend = useMemo(() => {
    if (records.length < 2) return null;
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
    const mid = Math.floor(sorted.length / 2);
    const first = sorted.slice(0, mid).reduce((s, r) => s + r.cost, 0);
    const second = sorted.slice(mid).reduce((s, r) => s + r.cost, 0);
    if (first === 0) return null;
    return Math.round(((second - first) / first) * 100);
  }, [records]);

  const reportTitle = `Azure Cost Report – ${format(new Date(), "MMMM yyyy")}`;

  const handleExportCSV = () => {
    exportCSV(records, `azure-cost-report-${format(new Date(), "yyyy-MM")}.csv`);
  };

  const handleExportJSON = () => {
    exportJSON(
      records,
      {
        report: reportTitle,
        generated_at: new Date().toISOString(),
        granularity: filters.granularity,
        date_range: dateRange,
        total_cost: totalCost,
        total_budget: totalBudget,
        currency: data?.currency ?? "INR",
      },
      `azure-cost-report-${format(new Date(), "yyyy-MM")}.json`,
    );
  };

  return (
    <div className="min-h-full bg-background text-foreground">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary" strokeWidth={1.5} />
          <div>
            <h2 className="text-lg font-semibold leading-none">Reports</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Exportable cost summaries and period reports
            </p>
          </div>
        </div>
        {data && !isLoading && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleExportCSV}
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleExportJSON}
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
              Export JSON
            </Button>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-6 pb-6">
        <ControlPanel filters={filters} onApplyFilters={handleApplyFilters} />

        {isLoading && (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-3">
              <Skeleton className="h-[300px] rounded-lg" />
              <Skeleton className="h-[300px] rounded-lg lg:col-span-2" />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-[340px] rounded-lg" />
              <Skeleton className="h-[340px] rounded-lg" />
            </div>
            <Skeleton className="h-[280px] rounded-lg" />
            <Skeleton className="h-[340px] rounded-lg" />
          </div>
        )}

        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/40 py-16 text-center">
            <WifiOff className="h-10 w-10 text-destructive" strokeWidth={1.5} />
            <p className="text-sm text-destructive">
              Failed to fetch data. Ensure your FastAPI backend is running.
            </p>
          </div>
        )}

        {data && !isLoading && (
          <>
            {/* Row 1: Report Summary + Month-over-Month */}
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" strokeWidth={1.5} />
                    Report Summary
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground">
                    Generated {format(new Date(), "dd MMM yyyy, HH:mm")}
                  </p>
                </CardHeader>
                <CardContent className="pb-4">
                  <SummaryRow
                    label="Date Range"
                    icon={<Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />}
                    value={dateRange}
                  />
                  <SummaryRow
                    label="Granularity"
                    icon={<Layers className="h-3.5 w-3.5" strokeWidth={1.5} />}
                    value={
                      filters.granularity.charAt(0).toUpperCase() + filters.granularity.slice(1)
                    }
                  />
                  <SummaryRow
                    label="Total Cost"
                    icon={<IndianRupee className="h-3.5 w-3.5" strokeWidth={1.5} />}
                    value={fmt(totalCost)}
                    highlight
                  />
                  <SummaryRow
                    label="Data Points"
                    icon={<Layers className="h-3.5 w-3.5" strokeWidth={1.5} />}
                    value={dataPointsLabel}
                  />
                  <SummaryRow
                    label="Services"
                    icon={<Layers className="h-3.5 w-3.5" strokeWidth={1.5} />}
                    value={`${stats.length} active`}
                  />
                  {totalBudget > 0 && (
                    <SummaryRow
                      label="Budget Usage"
                      icon={<IndianRupee className="h-3.5 w-3.5" strokeWidth={1.5} />}
                      value={`${budgetPct}% of ${fmt(totalBudget)}`}
                      highlight={budgetPct != null && budgetPct > 80}
                    />
                  )}
                  {trend !== null && (
                    <SummaryRow
                      label="Period Trend"
                      icon={
                        trend > 0 ? (
                          <TrendingUp className="h-3.5 w-3.5 text-destructive" strokeWidth={1.5} />
                        ) : (
                          <TrendingDown
                            className="h-3.5 w-3.5 text-emerald-400"
                            strokeWidth={1.5}
                          />
                        )
                      }
                      value={`${trend > 0 ? "▲" : "▼"} ${Math.abs(trend)}%`}
                    />
                  )}
                  <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                    {openAlerts > 0 ? (
                      <>
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive" strokeWidth={1.5} />
                        <span className="text-xs text-destructive font-medium">
                          {openAlerts} active incident
                          {openAlerts !== 1 ? "s" : ""}
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" strokeWidth={1.5} />
                        <span className="text-xs text-emerald-400 font-medium">
                          No active incidents
                        </span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Month-over-Month spans 2 cols */}
              <div className="lg:col-span-2">
                <MonthOverMonthChart records={records} />
              </div>
            </div>

            {/* Row 2: Cumulative Spend + Service Cost % Change */}
            <div className="grid gap-4 lg:grid-cols-2">
              <CumulativeSpendChart records={records} budget={totalBudget} />
              <ServiceCostChangeChart records={records} />
            </div>

            {/* Service Cost Comparison Table */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium">Service Cost Comparison</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {stats.length} services
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[340px]">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead className="text-xs font-semibold w-8" />
                        <TableHead className="text-xs font-semibold">SERVICE</TableHead>
                        <TableHead className="text-xs font-semibold">CATEGORY</TableHead>
                        <TableHead className="text-xs font-semibold text-right">TOTAL</TableHead>
                        <TableHead className="text-xs font-semibold text-right">
                          AVG / RECORD
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-right">PEAK</TableHead>
                        <TableHead className="text-xs font-semibold text-right">RECORDS</TableHead>
                        <TableHead className="text-xs font-semibold">SHARE</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={8}
                            className="py-8 text-center text-sm text-muted-foreground"
                          >
                            No data for selected period
                          </TableCell>
                        </TableRow>
                      ) : (
                        stats.map((s) => {
                          const color = getServiceColor(s.name, s.idx);
                          return (
                            <TableRow key={s.name} className="transition-colors hover:bg-muted/30">
                              <TableCell className="w-8 px-3">
                                <span
                                  className="h-2.5 w-2.5 rounded-full block"
                                  style={{ backgroundColor: color }}
                                />
                              </TableCell>
                              <TableCell className="text-xs font-medium">{s.name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {s.category}
                              </TableCell>
                              <TableCell className="text-xs font-mono font-semibold text-right">
                                {fmt(s.totalCost)}
                              </TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground text-right">
                                {fmt(s.avgCost)}
                              </TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground text-right">
                                {fmt(s.maxCost)}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground text-right">
                                {s.records}
                              </TableCell>
                              <TableCell className="min-w-[100px]">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${Math.min(s.pct, 100)}%`,
                                        backgroundColor: color,
                                      }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground w-8 text-right">
                                    {Math.round(s.pct)}%
                                  </span>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Alert summary */}
            {alertHistory.length > 0 && (
              <Card className="border-border bg-card">
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-primary" strokeWidth={1.5} />
                    Alert Summary
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-xs">
                      {openAlerts} open
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {alertHistory.length} total
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[240px]">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card">
                        <TableRow>
                          <TableHead className="text-xs font-semibold">SERVICE</TableHead>
                          <TableHead className="text-xs font-semibold">PERIOD</TableHead>
                          <TableHead className="text-xs font-semibold text-right">COST</TableHead>
                          <TableHead className="text-xs font-semibold text-right">
                            THRESHOLD
                          </TableHead>
                          <TableHead className="text-xs font-semibold">RULE</TableHead>
                          <TableHead className="text-xs font-semibold text-center">
                            STATUS
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {alertHistory.slice(0, 20).map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="text-xs font-medium">{e.service_name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground capitalize">
                              {e.period_type}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-destructive text-right">
                              {fmt(e.current_cost)}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground text-right">
                              {fmt(e.computed_threshold)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {e.winning_component === "absolute"
                                ? "Budget"
                                : e.winning_component === "statistical"
                                  ? "Statistical"
                                  : "Percentage"}
                            </TableCell>
                            <TableCell className="text-center">
                              {e.status === "open" ? (
                                <Badge variant="destructive" className="text-[10px]">
                                  open
                                </Badge>
                              ) : e.status === "resolved" ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-emerald-500/15 text-emerald-400"
                                >
                                  resolved
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]">
                                  deactivated
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Reports;
