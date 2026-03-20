import {
  CostResponse,
  AnomalySettings,
  AlertEvent,
  AnomalyLogEntry,
  AlertThreshold,
  AzureService,
} from "./types";
import { config } from "./config";

const base = () => config.apiUrl;

const defaultHeaders: HeadersInit = {
  "ngrok-skip-browser-warning": "true",
};

const jsonHeaders: HeadersInit = {
  ...defaultHeaders,
  "Content-Type": "application/json",
};

export async function fetchCostFromDb(
  granularity: "daily" | "monthly",
  startDate?: string,
  endDate?: string,
): Promise<CostResponse> {
  const url = new URL(`${base()}/cost/db`);
  url.searchParams.set("granularity", granularity);
  if (startDate) url.searchParams.set("start_date", startDate);
  if (endDate) url.searchParams.set("end_date", endDate);

  const res = await fetch(url.toString(), { headers: defaultHeaders });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);

  interface DbRecord {
    service_name: string;
    service_category: string | null;
    cost: number;
    currency: string;
    date: string;
  }
  interface DbResponse {
    data?: DbRecord[];
    total_cost?: number;
    currency?: string;
    cache_hit?: boolean;
  }

  const json = (await res.json()) as DbResponse;
  const data = (json.data ?? []).map((r) => ({
    service_name: r.service_name,
    service_category: r.service_category ?? "",
    cost: r.cost,
    currency: r.currency,
    date: r.date,
  }));
  return {
    data,
    total_cost: json.total_cost ?? data.reduce((s, r) => s + r.cost, 0),
    currency: json.currency ?? data[0]?.currency ?? "INR",
    cache_hit: json.cache_hit ?? false,
  };
}

export async function testConnection(): Promise<boolean> {
  try {
    const res = await fetch(`${base()}/`, {
      signal: AbortSignal.timeout(5000),
      headers: defaultHeaders,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getAlertSettings(): Promise<AnomalySettings> {
  const res = await fetch(`${base()}/alerts/settings`, {
    headers: defaultHeaders,
  });
  if (!res.ok) throw new Error(`Failed to fetch alert settings: ${res.status}`);
  const json = (await res.json()) as { data: AnomalySettings };
  return json.data;
}

export async function updateAlertSettings(
  patch: Partial<
    Pick<
      AnomalySettings,
      | "k_value"
      | "percentage_buffer"
      | "alert_history_days"
      | "alert_history_months"
      | "cooldown_minutes"
      | "receiver_email"
      | "email_enabled"
    >
  >,
): Promise<AnomalySettings> {
  const res = await fetch(`${base()}/alerts/settings`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(patch),
  });
  if (!res.ok)
    throw new Error(`Failed to update alert settings: ${res.status}`);
  const json = (await res.json()) as { data: AnomalySettings };
  return json.data;
}

export async function getAlertServices(): Promise<AzureService[]> {
  const res = await fetch(`${base()}/alerts/services`, {
    headers: defaultHeaders,
  });
  if (!res.ok) throw new Error(`Failed to fetch services: ${res.status}`);
  const json = (await res.json()) as { data: AzureService[] };
  return json.data;
}

export async function getAlertThresholds(params?: {
  service_id?: number;
  period_type?: string;
  active_only?: boolean;
}): Promise<AlertThreshold[]> {
  const url = new URL(`${base()}/alerts/thresholds`);
  if (params?.service_id != null)
    url.searchParams.set("service_id", String(params.service_id));
  if (params?.period_type)
    url.searchParams.set("period_type", params.period_type);
  if (params?.active_only != null)
    url.searchParams.set("active_only", String(params.active_only));
  const res = await fetch(url.toString(), { headers: defaultHeaders });
  if (!res.ok) throw new Error(`Failed to fetch thresholds: ${res.status}`);
  const json = (await res.json()) as { data: AlertThreshold[] };
  return json.data;
}

export async function createAlertThreshold(payload: {
  service_id: number;
  period_type: string;
  absolute_threshold?: number | null;
  cooldown_minutes?: number | null;
}): Promise<AlertThreshold> {
  const res = await fetch(`${base()}/alerts/thresholds`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create threshold: ${res.status}`);
  const json = (await res.json()) as { data: AlertThreshold };
  return json.data;
}

export async function updateAlertThreshold(
  id: number,
  patch: {
    absolute_threshold?: number | null;
    is_active?: boolean;
    cooldown_minutes?: number | null;
  },
): Promise<AlertThreshold> {
  const res = await fetch(`${base()}/alerts/thresholds/${id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update threshold: ${res.status}`);
  const json = (await res.json()) as { data: AlertThreshold };
  return json.data;
}

export async function deactivateAlertThreshold(
  id: number,
): Promise<AlertThreshold> {
  const res = await fetch(`${base()}/alerts/thresholds/${id}`, {
    method: "DELETE",
    headers: defaultHeaders,
  });
  if (!res.ok) throw new Error(`Failed to deactivate threshold: ${res.status}`);
  const json = (await res.json()) as { data: AlertThreshold };
  return json.data;
}

export async function evaluateAlerts(
  periodType: "daily" | "monthly",
): Promise<void> {
  const url = new URL(`${base()}/alerts/evaluate`);
  url.searchParams.set("period_type", periodType);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: defaultHeaders,
  });
  if (!res.ok) throw new Error(`Alert evaluation failed: ${res.status}`);
}

export async function getAlertEvents(params?: {
  status?: string;
  service_id?: number;
  period_type?: string;
  limit?: number;
  offset?: number;
}): Promise<AlertEvent[]> {
  const url = new URL(`${base()}/alerts/events`);
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.service_id != null)
    url.searchParams.set("service_id", String(params.service_id));
  if (params?.period_type)
    url.searchParams.set("period_type", params.period_type);
  if (params?.limit != null)
    url.searchParams.set("limit", String(params.limit));
  if (params?.offset != null)
    url.searchParams.set("offset", String(params.offset));
  const res = await fetch(url.toString(), { headers: defaultHeaders });
  if (!res.ok) throw new Error(`Failed to fetch alert events: ${res.status}`);
  const json = (await res.json()) as { data: AlertEvent[] };
  return json.data;
}

export async function getAnomalyLogs(params?: {
  service_id?: number;
  period_type?: string;
  is_alert_fired?: boolean;
  limit?: number;
  offset?: number;
}): Promise<AnomalyLogEntry[]> {
  const url = new URL(`${base()}/alerts/anomaly-logs`);
  if (params?.service_id != null)
    url.searchParams.set("service_id", String(params.service_id));
  if (params?.period_type)
    url.searchParams.set("period_type", params.period_type);
  if (params?.is_alert_fired != null)
    url.searchParams.set("is_alert_fired", String(params.is_alert_fired));
  if (params?.limit != null)
    url.searchParams.set("limit", String(params.limit));
  if (params?.offset != null)
    url.searchParams.set("offset", String(params.offset));
  const res = await fetch(url.toString(), { headers: defaultHeaders });
  if (!res.ok) throw new Error(`Failed to fetch anomaly logs: ${res.status}`);
  const json = (await res.json()) as { data: AnomalyLogEntry[] };
  return json.data;
}
