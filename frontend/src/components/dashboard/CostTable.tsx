import { useState, useMemo } from "react";
import { CostRecord } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  ChevronsUpDown,
  Search,
  Download,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { getServiceColor } from "@/lib/colors";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CostTableProps {
  records: CostRecord[];
}

type SortKey = "service_name" | "service_category" | "cost" | "date";
type GroupKey = "service_name" | "service_category" | "none";

// Mini sparkline component
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length === 0) return null;
  const h = 24;
  const w = 80;

  if (values.length === 1) {
    return (
      <svg width={w} height={h} className="shrink-0">
        <circle cx={w / 2} cy={h / 2} r={3} fill={color} />
      </svg>
    );
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const points = values
    .map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`)
    .join(" ");

  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface ServiceSummary {
  service_name: string;
  service_category: string;
  totalCost: number;
  avgCost: number;
  maxCost: number;
  minCost: number;
  count: number;
  currency: string;
  dailyCosts: number[];
  records: CostRecord[];
}

function buildSummaries(records: CostRecord[]): ServiceSummary[] {
  const map = new Map<string, CostRecord[]>();
  records.forEach((r) => {
    const key = r.service_name;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  });

  return [...map.entries()].map(([name, recs]) => {
    const sorted = [...recs].sort((a, b) => a.date.localeCompare(b.date));
    const costs = sorted.map((r) => r.cost);
    const total = costs.reduce((a, b) => a + b, 0);
    return {
      service_name: name,
      service_category: recs[0].service_category,
      totalCost: total,
      avgCost: total / costs.length,
      maxCost: Math.max(...costs),
      minCost: Math.min(...costs),
      count: costs.length,
      currency: recs[0].currency,
      dailyCosts: costs,
      records: sorted,
    };
  });
}

export function CostTable({ records }: CostTableProps) {
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("cost");
  const [sortAsc, setSortAsc] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupKey>("service_name");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const currencies = useMemo(
    () => new Set(records.map((r) => r.currency)),
    [records],
  );
  const showCurrency = currencies.size > 1;

  const summaries = useMemo(() => {
    let data = buildSummaries(records);
    if (filter)
      data = data.filter((s) =>
        s.service_name.toLowerCase().includes(filter.toLowerCase()),
      );
    return [...data].sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      if (sortKey === "cost") return (a.totalCost - b.totalCost) * dir;
      if (sortKey === "service_name")
        return a.service_name.localeCompare(b.service_name) * dir;
      if (sortKey === "service_category")
        return a.service_category.localeCompare(b.service_category) * dir;
      return (a.totalCost - b.totalCost) * dir;
    });
  }, [records, filter, sortKey, sortAsc]);

  const grandTotal = useMemo(
    () => summaries.reduce((a, b) => a + b.totalCost, 0),
    [summaries],
  );

  const handleExportCSV = () => {
    const headers = ["Service", "Category", "Cost", "Currency", "Date"];
    const rows = records.map((r) => [
      r.service_name,
      r.service_category,
      r.cost,
      r.currency,
      r.date.slice(0, 10),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cost-records.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortHeader = ({
    label,
    field,
    className,
  }: {
    label: string;
    field: SortKey;
    className?: string;
  }) => (
    <TableHead
      className={`cursor-pointer select-none transition-colors hover:text-foreground ${
        className ?? ""
      }`}
      onClick={() => toggleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ChevronsUpDown
          className={`h-3 w-3 ${
            sortKey === field ? "text-foreground" : "text-muted-foreground"
          }`}
          strokeWidth={1.5}
        />
      </span>
    </TableHead>
  );

  const fmt = (v: number) =>
    `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Cost Analysis</CardTitle>
        <div className="flex items-center gap-2">
          <Select
            value={groupBy}
            onValueChange={(v) => setGroupBy(v as GroupKey)}
          >
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="service_name">By Service</SelectItem>
              <SelectItem value="service_category">By Category</SelectItem>
              <SelectItem value="none">Flat View</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative w-44">
            <Search
              className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.5}
            />
            <Input
              placeholder="Filter service..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8 pl-7 text-xs"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs transition-colors"
            onClick={handleExportCSV}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="max-h-[460px] overflow-auto p-0">
        {groupBy !== "none" ? (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-8" />
                <SortHeader label="Service" field="service_name" />
                <SortHeader label="Category" field="service_category" />
                <SortHeader label="Total Cost" field="cost" />
                <TableHead className="text-xs">Avg</TableHead>
                <TableHead className="text-xs">Min / Max</TableHead>
                <TableHead className="text-xs">Records</TableHead>
                <TableHead className="text-xs">Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No records found
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {summaries.map((s, idx) => {
                    const isExpanded = expandedRows.has(s.service_name);
                    const color = getServiceColor(s.service_name, idx);
                    const pct =
                      grandTotal > 0 ? (s.totalCost / grandTotal) * 100 : 0;
                    return (
                      <>
                        <TableRow
                          key={s.service_name}
                          className="cursor-pointer transition-colors hover:bg-muted/30"
                          onClick={() => toggleExpand(s.service_name)}
                        >
                          <TableCell className="w-8 px-2">
                            {isExpanded ? (
                              <ChevronDown
                                className="h-3.5 w-3.5 text-muted-foreground"
                                strokeWidth={1.5}
                              />
                            ) : (
                              <ChevronRight
                                className="h-3.5 w-3.5 text-muted-foreground"
                                strokeWidth={1.5}
                              />
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              {s.service_name}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {s.service_category}
                          </TableCell>
                          <TableCell className="text-xs font-mono font-medium">
                            <div className="flex flex-col gap-1">
                              <span>{fmt(s.totalCost)}</span>
                              <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(pct, 100)}%`,
                                    backgroundColor: color,
                                  }}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {s.count > 1 ? fmt(s.avgCost) : "—"}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {s.count > 1
                              ? `${fmt(s.minCost)} / ${fmt(s.maxCost)}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {s.count}
                          </TableCell>
                          <TableCell>
                            <Sparkline values={s.dailyCosts} color={color} />
                          </TableCell>
                        </TableRow>
                        {/* Expanded detail rows */}
                        {isExpanded &&
                          s.records.map((r, ri) => (
                            <TableRow
                              key={`${s.service_name}-${ri}`}
                              className="bg-muted/10"
                            >
                              <TableCell />
                              <TableCell className="text-[11px] text-muted-foreground pl-10">
                                {r.date.slice(0, 10)}
                              </TableCell>
                              <TableCell className="text-[11px] text-muted-foreground">
                                {r.service_category}
                              </TableCell>
                              <TableCell className="text-[11px] font-mono text-muted-foreground">
                                {fmt(r.cost)}
                              </TableCell>
                              <TableCell />
                              <TableCell />
                              {showCurrency && (
                                <TableCell className="text-[11px] text-muted-foreground">
                                  {r.currency}
                                </TableCell>
                              )}
                              <TableCell />
                            </TableRow>
                          ))}
                      </>
                    );
                  })}
                  {/* Summary footer */}
                  <TableRow className="border-t-2 border-border bg-muted/20 font-medium">
                    <TableCell />
                    <TableCell className="text-xs font-semibold">
                      Total
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {summaries.length} services
                    </TableCell>
                    <TableCell className="text-xs font-mono font-bold">
                      {fmt(grandTotal)}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {fmt(
                        grandTotal /
                          Math.max(
                            summaries.reduce((a, b) => a + b.count, 0),
                            1,
                          ),
                      )}
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-xs text-muted-foreground">
                      {summaries.reduce((a, b) => a + b.count, 0)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        ) : (
          /* Flat view - original table */
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <SortHeader label="Service" field="service_name" />
                <SortHeader label="Category" field="service_category" />
                <SortHeader label="Cost" field="cost" />
                {showCurrency && <TableHead>Currency</TableHead>}
                <SortHeader label="Date" field="date" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={showCurrency ? 5 : 4}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No records found
                  </TableCell>
                </TableRow>
              ) : (
                records
                  .filter(
                    (r) =>
                      !filter ||
                      r.service_name
                        .toLowerCase()
                        .includes(filter.toLowerCase()),
                  )
                  .sort((a, b) => {
                    const dir = sortAsc ? 1 : -1;
                    if (sortKey === "cost") return (a.cost - b.cost) * dir;
                    return (
                      String(a[sortKey]).localeCompare(String(b[sortKey])) * dir
                    );
                  })
                  .map((r, i) => (
                    <TableRow key={i} className="transition-colors">
                      <TableCell className="text-xs font-medium">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{
                              backgroundColor: getServiceColor(
                                r.service_name,
                                i,
                              ),
                            }}
                          />
                          {r.service_name}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.service_category}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {fmt(r.cost)}
                      </TableCell>
                      {showCurrency && (
                        <TableCell className="text-xs">{r.currency}</TableCell>
                      )}
                      <TableCell className="text-xs">
                        {r.date.slice(0, 10)}
                      </TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
