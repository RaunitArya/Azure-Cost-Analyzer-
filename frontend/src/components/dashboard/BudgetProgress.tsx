import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface BudgetProgressProps {
  totalCost: number;
  budget: number;
}

export function BudgetProgress({ totalCost, budget }: BudgetProgressProps) {
  if (budget <= 0) return null;

  const pct = Math.min((totalCost / budget) * 100, 100);
  const overBudget = totalCost > budget;
  const barColor = overBudget
    ? "bg-destructive"
    : pct > 80
      ? "bg-warning"
      : "bg-success";

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          Budget Status
          {overBudget && <AlertTriangle className="h-4 w-4 text-destructive" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {overBudget && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            ⚠ You have exceeded your budget by ₹
            {(totalCost - budget).toLocaleString("en-IN", {
              maximumFractionDigits: 2,
            })}
          </div>
        )}
        <Progress
          value={pct}
          className="h-3 [&>div]:transition-all"
          style={{ ["--progress-color" as string]: "currentColor" }}
        >
          <div
            className={`h-full ${barColor} rounded-full`}
            style={{ width: `${pct}%` }}
          />
        </Progress>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            ₹{totalCost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </span>
          <span>
            ₹{budget.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
