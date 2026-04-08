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

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0; // Ensure 32-bit integer
  }
  return Math.abs(hash);
}

function hashToHslColor(value: string): string {
  const hash = hashString(value);
  const hue = hash % 360;
  const saturation = 62;
  const lightness = 52;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function getServiceColor(name: string, _index?: number): string {
  return SERVICE_COLORS[name] ?? hashToHslColor(name);
}
