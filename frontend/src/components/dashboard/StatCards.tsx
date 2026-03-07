import { CostResponse, AlertSettings } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import {
  IndianRupee,
  Zap,
  Layers,
  CircleDollarSign,
  TrendingUp,
  TrendingDown,
  MailCheck,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StatCardsProps {
  data: CostResponse | undefined;
  budget: number;
  alertSettings?: AlertSettings | null;
  alertSent?: boolean;
}

function getAlertSettings(): AlertSettings | null {
  try {
    const raw = localStorage.getItem("azure-alert-settings");
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function StatCards({ data, budget, alertSent }: StatCardsProps) {
  const totalCost = data?.total_cost ?? 0;
  const records = data?.data ?? [];
  const alertSettings = getAlertSettings();

  const serviceMap = new Map<string, number>();
  records.forEach((r) =>
    serviceMap.set(
      r.service_name,
      (serviceMap.get(r.service_name) ?? 0) + r.cost,
    ),
  );
  const topService = [...serviceMap.entries()].sort((a, b) => b[1] - a[1])[0];
  const activeServices = serviceMap.size;
  const budgetPct = budget > 0 ? Math.round((totalCost / budget) * 100) : 0;

  const pctChange = records.length > 0 ? 12 : 0;
  const isUp = pctChange > 0;

  const budgetBarColor =
    budgetPct > 100
      ? "bg-destructive"
      : budgetPct > 80
        ? "bg-warning"
        : "bg-primary";

  const alertsActive = alertSettings?.enabled && alertSettings?.email;

  const budgetBadge = (
    <span className="inline-flex items-center gap-1">
      {alertsActive && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Email alerts active
          </TooltipContent>
        </Tooltip>
      )}
      {alertSent && budgetPct > 100 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <MailCheck className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Alert email sent
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );

  const stats = [
    {
      label: "Total Cost",
      value: `₹${totalCost.toLocaleString("en-IN", {
        maximumFractionDigits: 2,
      })}`,
      icon: IndianRupee,
      iconBg: "bg-primary/15 text-primary",
      badge:
        pctChange !== 0 ? (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              isUp
                ? "bg-destructive/15 text-destructive"
                : "bg-success/15 text-success"
            }`}
          >
            {isUp ? (
              <TrendingUp className="h-3 w-3" strokeWidth={1.5} />
            ) : (
              <TrendingDown className="h-3 w-3" strokeWidth={1.5} />
            )}
            {Math.abs(pctChange)}%
          </span>
        ) : null,
      extra: null,
    },
    {
      label: "Top Service",
      value: topService?.[0] ?? "—",
      icon: Zap,
      iconBg: "bg-success/15 text-success",
      badge: null,
      extra: null,
    },
    {
      label: "Active Services",
      value: String(activeServices),
      icon: Layers,
      iconBg: "bg-chart-4/15 text-chart-4",
      badge: null,
      extra: null,
    },
    {
      label: "Budget Used",
      value: budget > 0 ? `${budgetPct}%` : "Not set",
      icon: CircleDollarSign,
      iconBg: "bg-warning/15 text-warning",
      badge: budgetBadge,
      extra:
        budget > 0 ? (
          <div className="mt-1.5 w-full">
            <Progress
              value={Math.min(budgetPct, 100)}
              className="h-1.5"
              indicatorClassName={budgetBarColor}
            />
          </div>
        ) : null,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <Card
          key={s.label}
          className="border-border bg-card transition-shadow hover:shadow-md"
        >
          <CardContent className="flex items-center gap-4 p-4">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${s.iconBg}`}
            >
              <s.icon className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <div className="flex items-center gap-2">
                <p className="truncate text-lg font-semibold">{s.value}</p>
                {s.badge}
              </div>
              {s.extra}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
