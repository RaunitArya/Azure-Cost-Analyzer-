import { useState, useEffect, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FilterSettings, AlertSettings } from "@/lib/types";
import { useCostData } from "@/hooks/use-cost-data";
import { ControlPanel } from "@/components/dashboard/ControlPanel";
import { StatCards } from "@/components/dashboard/StatCards";
import { CostAreaChart } from "@/components/dashboard/CostAreaChart";
import { CostBarChart } from "@/components/dashboard/CostBarChart";
import { CostDonutChart } from "@/components/dashboard/CostDonutChart";
import { CostTable } from "@/components/dashboard/CostTable";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [alertSent, setAlertSent] = useState(false);

  const [filters, setFilters] = useState<FilterSettings>({
    granularity: "daily",
    groupBy: "service",
    budget: Number(localStorage.getItem("azure-budget")) || 0,
    startDate: "",
    endDate: "",
  });

  const { data, isLoading, isError, refetch } = useCostData(
    filters.granularity,
    filters.startDate || undefined,
    filters.endDate || undefined,
  );

  useEffect(() => {
    localStorage.setItem("azure-budget", String(filters.budget));
  }, [filters.budget]);

  const alertSettings: AlertSettings | null = useMemo(() => {
    try {
      const raw = localStorage.getItem("azure-alert-settings");
      if (raw) return JSON.parse(raw) as AlertSettings;
    } catch (_err) {
      // localStorage unavailable or JSON malformed — return null
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    if (data && filters.budget > 0 && data.total_cost > filters.budget) {
      toast({
        title: "⚠ Budget Exceeded",
        description: `Total cost ₹${data.total_cost.toLocaleString(
          "en-IN",
        )} exceeds budget ₹${filters.budget.toLocaleString("en-IN")}`,
        variant: "destructive",
      });
      if (alertSettings?.enabled && alertSettings?.email) {
        setAlertSent(true);
        setTimeout(() => {
          toast({
            title: "Alert email sent",
            description: `Notification sent to ${alertSettings.email}`,
          });
        }, 500);
      }
    }
  }, [data, filters.budget, alertSettings]);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["cost-data"] });
    refetch();
  }, [queryClient, refetch]);

  const handleApplyFilters = useCallback((f: FilterSettings) => {
    setFilters(f);
  }, []);

  const records = useMemo(() => {
    let items = data?.data ?? [];
    if (filters.startDate) {
      items = items.filter((r) => r.date.slice(0, 10) >= filters.startDate);
    }
    if (filters.endDate) {
      items = items.filter((r) => r.date.slice(0, 10) <= filters.endDate);
    }
    return items;
  }, [data, filters.startDate, filters.endDate]);

  return (
    <div className="min-h-full bg-background text-foreground">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <h2 className="text-lg font-semibold">Dashboard</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
          className="gap-1.5 transition-colors"
        >
          <RefreshCw
            className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            strokeWidth={1.5}
          />
          Refresh
        </Button>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-6 pb-6">
        <ControlPanel filters={filters} onApplyFilters={handleApplyFilters} />

        {isLoading && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-[340px] rounded-lg" />
              <Skeleton className="h-[340px] rounded-lg" />
            </div>
            <Skeleton className="h-[320px] rounded-lg" />
            <Skeleton className="h-[400px] rounded-lg" />
          </div>
        )}

        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/40 py-16 text-center">
            <WifiOff className="h-10 w-10 text-destructive" strokeWidth={1.5} />
            <p className="text-sm text-destructive">
              Failed to fetch data. Ensure your FastAPI backend is running at
              the configured URL.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/settings")}
            >
              Check Settings
            </Button>
          </div>
        )}

        {data && !isLoading && (
          <>
            <StatCards
              data={data}
              budget={filters.budget}
              alertSent={alertSent}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <CostBarChart records={records} />
              <CostDonutChart records={records} budget={filters.budget} />
            </div>
            <CostAreaChart records={records} />
            <CostTable records={records} />
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
