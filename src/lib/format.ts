const formatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export function formatUtc(iso: string): string {
  return `${formatter.format(new Date(iso))} UTC`;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

export function slugLabel(value: string): string {
  return value.replace(/_/g, " ");
}
