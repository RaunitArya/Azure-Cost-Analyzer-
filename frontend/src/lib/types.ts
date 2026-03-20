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
  cache_hit?: boolean;
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

export type PeriodType = "daily" | "monthly";

export interface AzureService {
  id: number;
  name: string;
  service_category: string | null;
}

export interface AlertThreshold {
  id: number;
  service_id: number;
  service_name: string;
  period_type: PeriodType;
  absolute_threshold: number | null;
  cooldown_minutes: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertEvent {
  id: number;
  threshold_id: number;
  service_id: number;
  service_name: string;
  period_type: PeriodType;
  reference_date: string;
  current_cost: number;
  computed_threshold: number;
  absolute_component: number | null;
  statistical_component: number | null;
  percentage_component: number | null;
  winning_component: string;
  status: "open" | "resolved";
  breach_started_at: string;
  breach_resolved_at: string | null;
  last_notified_at: string;
  notification_count: number;
  cooldown_minutes: number;
}

export interface AnomalyLogEntry {
  id: number;
  service_id: number;
  service_name: string;
  period_type: PeriodType;
  reference_date: string;
  current_cost: number;
  absolute_component: number | null;
  statistical_component: number | null;
  percentage_component: number | null;
  computed_threshold: number;
  winning_component: string;
  is_alert_fired: boolean;
  alert_event_id: number | null;
  detected_at: string;
}

export interface AnomalySettings {
  id: number;
  k_value: number;
  percentage_buffer: number;
  alert_history_days: number;
  alert_history_months: number;
  cooldown_minutes: number;
  updated_at: string;
  receiver_email: string | null;
  email_enabled: boolean;
}
