export interface CostRecord {
  service_name: string;
  service_category: string;
  cost: number;
  currency: string;
  date: string;
}

export interface CostResponse {
  data: CostRecord[];
  total_cost: number;
  currency: string;
}

export type Granularity = "daily" | "monthly";
export type GroupBy = "service" | "total";

export interface FilterSettings {
  granularity: Granularity;
  groupBy: GroupBy;
  budget: number;
  startDate: string;
  endDate: string;
}

export type AlertTrigger = "exceeded" | "at_80" | "at_90" | "at_100";

export interface AlertSettings {
  email: string;
  budgetThreshold: number;
  trigger: AlertTrigger;
  enabled: boolean;
}
