export function formatTime(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatWeekLabel(w: string): string {
  const d = new Date(w + "T00:00:00");
  if (Number.isNaN(d.getTime())) return w;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
