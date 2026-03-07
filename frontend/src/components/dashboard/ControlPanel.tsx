import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, subDays, startOfMonth } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Granularity, GroupBy, FilterSettings } from "@/lib/types";
import { CalendarIcon, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ControlPanelProps {
  filters: FilterSettings;
  onApplyFilters: (f: FilterSettings) => void;
}

export function ControlPanel({ filters, onApplyFilters }: ControlPanelProps) {
  const navigate = useNavigate();

  const [granularity, setGranularity] = useState<Granularity>(
    filters.granularity,
  );
  const [groupBy, setGroupBy] = useState<GroupBy>(filters.groupBy);
  const [budget, setBudget] = useState(filters.budget);
  const [startDate, setStartDate] = useState<Date | undefined>(
    filters.startDate ? new Date(filters.startDate) : undefined,
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    filters.endDate ? new Date(filters.endDate) : undefined,
  );

  const handleReset = () => {
    setGranularity("daily");
    setGroupBy("service");
    setBudget(0);
    setStartDate(undefined);
    setEndDate(undefined);
    onApplyFilters({
      granularity: "daily",
      groupBy: "service",
      budget: 0,
      startDate: "",
      endDate: "",
    });
  };

  const handleApply = () => {
    onApplyFilters({
      granularity,
      groupBy,
      budget,
      startDate: startDate ? format(startDate, "yyyy-MM-dd") : "",
      endDate: endDate ? format(endDate, "yyyy-MM-dd") : "",
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7 items-end">
        {/* Quick Range */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Quick Range
          </label>
          <Select
            value=""
            onValueChange={(v) => {
              const today = new Date();
              let s: Date | undefined;
              const e: Date = today;
              if (v === "7d") s = subDays(today, 7);
              else if (v === "30d") s = subDays(today, 30);
              else if (v === "month") s = startOfMonth(today);
              if (s) {
                setStartDate(s);
                setEndDate(e);
                onApplyFilters({
                  granularity,
                  groupBy,
                  budget,
                  startDate: format(s, "yyyy-MM-dd"),
                  endDate: format(e, "yyyy-MM-dd"),
                });
              }
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="month">This month</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Granularity */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Granularity
          </label>
          <Select
            value={granularity}
            onValueChange={(v) => setGranularity(v as Granularity)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Group By */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Group By
          </label>
          <Select
            value={groupBy}
            onValueChange={(v) => setGroupBy(v as GroupBy)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="service">Service Name</SelectItem>
              <SelectItem value="total">Total Aggregate</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Start Date */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Start Date
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-9 justify-start text-xs font-normal transition-colors",
                  !startDate && "text-muted-foreground",
                )}
              >
                <CalendarIcon
                  className="mr-1.5 h-3.5 w-3.5"
                  strokeWidth={1.5}
                />
                {startDate ? format(startDate, "dd MMM yyyy") : "Select"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={setStartDate}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* End Date */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            End Date
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-9 justify-start text-xs font-normal transition-colors",
                  !endDate && "text-muted-foreground",
                )}
              >
                <CalendarIcon
                  className="mr-1.5 h-3.5 w-3.5"
                  strokeWidth={1.5}
                />
                {endDate ? format(endDate, "dd MMM yyyy") : "Select"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={setEndDate}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Budget */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Budget (INR)
          </label>
          <Input
            type="number"
            placeholder="10000"
            value={budget || ""}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="h-9 text-xs"
          />
          <button
            onClick={() => navigate("/settings")}
            className="mt-1 text-[10px] text-primary hover:underline cursor-pointer text-left"
          >
            Configure Alerts →
          </button>
        </div>

        {/* Apply & Reset */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground invisible">
            Actions
          </label>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-9 flex-1 gap-1.5 transition-colors"
              onClick={handleApply}
            >
              <Play className="h-3.5 w-3.5" strokeWidth={1.5} />
              Apply
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 shrink-0 transition-colors"
              onClick={handleReset}
              title="Reset filters"
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
