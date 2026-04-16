"use client";

import type { DashboardData } from "@/lib/types";
import { formatTime } from "@/lib/format";

function InsightStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border-b border-[#e8e8e8] py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#999]">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-semibold text-[#1a1a1a]">{value}</div>
      {sub && <div className="text-xs text-[#999]">{sub}</div>}
    </div>
  );
}

export function InsightRail({ data }: { data: DashboardData }) {
  const { weekly, progress } = data;
  const latest = weekly[weekly.length - 1];
  const totalMinutes = weekly.reduce((s, w) => s + w.minutes, 0);
  const avgMinutes =
    weekly.length > 0 ? Math.round(totalMinutes / weekly.length) : 0;
  const peakWeek =
    weekly.length > 0
      ? weekly.reduce((best, w) => (w.minutes > best.minutes ? w : best), weekly[0])
      : null;
  const totalArticles = Object.values(progress).reduce((s, v) => s + v, 0);
  const completedPct =
    totalArticles > 0
      ? Math.round(((progress["100%"] ?? 0) / totalArticles) * 100)
      : 0;

  const formatWeek = (w: string) => {
    const d = new Date(w + "T00:00:00");
    if (Number.isNaN(d.getTime())) return w;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex flex-col gap-4">
      <InsightStat
        label="Last week"
        value={latest ? formatTime(latest.minutes) : "—"}
        sub={latest ? `${latest.sessions} sessions` : ""}
      />
      <InsightStat label="Weekly average" value={formatTime(avgMinutes)} />
      <InsightStat
        label="Peak week"
        value={peakWeek ? formatTime(peakWeek.minutes) : "—"}
        sub={peakWeek ? formatWeek(peakWeek.week) : ""}
      />
      <InsightStat
        label="Completion rate"
        value={`${completedPct}%`}
        sub={`${progress["100%"] ?? 0} of ${totalArticles}`}
      />
    </div>
  );
}
