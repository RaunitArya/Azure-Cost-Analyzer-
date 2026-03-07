import { useQuery } from "@tanstack/react-query";
import { fetchCostData } from "@/lib/api";
import { Granularity } from "@/lib/types";

export function useCostData(
  granularity: Granularity,
  startDate?: string,
  endDate?: string,
) {
  // When custom date range is provided, always use "last-7-days" endpoint
  // (it supports arbitrary date ranges via query params) so we get full range data.
  // Only default to "month-to-date" for monthly without custom dates.
  const hasCustomRange = !!(startDate && endDate);
  const endpoint = hasCustomRange
    ? "last-7-days"
    : granularity === "daily"
      ? "last-7-days"
      : "month-to-date";

  return useQuery({
    queryKey: ["cost-data", endpoint, startDate, endDate],
    queryFn: () => fetchCostData(endpoint, startDate, endDate),
    retry: 1,
    staleTime: 60_000,
  });
}
