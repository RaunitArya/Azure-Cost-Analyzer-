// Consistent color map for all charts
export const SERVICE_COLORS: Record<string, string> = {
  "Virtual Network": "#3B82F6",
  Storage: "#10B981",
  Bandwidth: "#F59E0B",
  "Virtual Machines": "#8B5CF6",
};

export const DEFAULT_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EF4444",
  "#06B6D4",
];

export function getServiceColor(name: string, index: number): string {
  return SERVICE_COLORS[name] ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}
