import { CostResponse, AlertSettings } from "./types";
import { config } from "./config";

const base = () => config.apiUrl;

const defaultHeaders: HeadersInit = {
  "ngrok-skip-browser-warning": "true",
};

export async function fetchCostData(
  endpoint: "last-7-days" | "month-to-date",
  startDate?: string,
  endDate?: string,
): Promise<CostResponse> {
  const url = new URL(`${base()}/cost/${endpoint}`);
  if (startDate) url.searchParams.set("start_date", startDate);
  if (endDate) url.searchParams.set("end_date", endDate);

  const res = await fetch(url.toString(), { headers: defaultHeaders });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);

  interface RawRecord {
    service_name: string;
    service_category: string;
    cost: number;
    currency: string;
    usage_date?: string;
    date?: string;
    billing_period_start?: string;
  }

  interface RawResponse {
    data?: RawRecord[];
    total_cost?: number;
    currency?: string;
  }

  const json = (await res.json()) as RawResponse;
  const data = (json.data ?? []).map((r) => ({
    service_name: r.service_name,
    service_category: r.service_category,
    cost: r.cost,
    currency: r.currency,
    date:
      r.usage_date ??
      r.date ??
      r.billing_period_start ??
      new Date().toISOString(),
  }));

  return {
    data,
    total_cost:
      json.total_cost ?? data.reduce((s, r) => s + r.cost, 0),
    currency: json.currency ?? data[0]?.currency ?? "INR",
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

export async function saveAlertSettings(
  settings: AlertSettings,
): Promise<void> {
  const res = await fetch(`${base()}/alerts/configure`, {
    method: "POST",
    headers: { ...defaultHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: settings.email,
      budget_threshold: settings.budgetThreshold,
      trigger: settings.trigger,
      enabled: settings.enabled,
    }),
  });
  if (!res.ok) throw new Error(`Failed to save alert settings: ${res.status}`);
}

export async function sendTestAlert(email: string): Promise<void> {
  const res = await fetch(`${base()}/alerts/test`, {
    method: "POST",
    headers: { ...defaultHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`Failed to send test alert: ${res.status}`);
}
