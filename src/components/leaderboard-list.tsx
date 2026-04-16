"use client";

export function LeaderboardList({
  data,
  label,
}: {
  data: Record<string, number>;
  label: string;
}) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const max = entries.length > 0 ? entries[0][1] : 1;

  return (
    <div className="flex flex-col">
      {entries.slice(0, 10).map(([name, count], i) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const barWidth = (count / max) * 100;
        return (
          <div
            key={name}
            className="group relative flex items-center gap-3 px-3 py-2.5"
          >
            <div
              className="absolute inset-0 bg-[#f0f0f0] transition-all"
              style={{ width: `${barWidth}%` }}
            />
            <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center text-xs font-semibold text-[#999]">
              {i + 1}
            </span>
            <span className="relative z-10 min-w-0 flex-1 truncate text-sm font-medium text-[#1a1a1a]">
              {name}
            </span>
            <span className="relative z-10 shrink-0 text-sm font-semibold text-[#1a1a1a]">
              {count}
            </span>
            <span className="relative z-10 shrink-0 w-10 text-right text-xs text-[#999]">
              {pct}%
            </span>
          </div>
        );
      })}
      {entries.length === 0 && (
        <p className="py-4 text-center text-sm text-[#999]">
          No {label.toLowerCase()} found
        </p>
      )}
    </div>
  );
}
