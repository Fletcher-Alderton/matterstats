"use client";

import type { DashboardData } from "@/lib/types";

function MetricCard({
  value,
  label,
}: {
  value: string | number;
  label: string;
}) {
  return (
    <div className="border-b border-[#e0e0e0] px-5 py-5 text-center">
      <div className="text-2xl font-semibold text-[#1a1a1a]">{value}</div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[#999]">
        {label}
      </div>
    </div>
  );
}

export function HeroOverview({ data }: { data: DashboardData }) {
  const { total, categories } = data;
  const topCategory = Object.keys(categories)[0] ?? "various topics";
  const completionRate =
    total.articles > 0
      ? Math.round((total.completed / total.articles) * 100)
      : 0;

  return (
    <div className="mb-14 md:mb-20">
      <h1 className="mb-3 text-3xl font-semibold tracking-tight text-black md:text-4xl lg:text-5xl">
        Your reading life, visualized
      </h1>
      <p className="mb-10 max-w-2xl text-base leading-relaxed text-[#999] md:mb-12 md:text-lg">
        You&apos;ve spent{" "}
        <span className="font-semibold text-[#1a1a1a]">
          {total.hoursRead} hours
        </span>{" "}
        across{" "}
        <span className="font-semibold text-[#1a1a1a]">
          {total.sessions.toLocaleString()} sessions
        </span>
        , mostly reading{" "}
        <span className="font-semibold text-[#1a1a1a]">{topCategory}</span>, and
        finished{" "}
        <span className="font-semibold text-[#1a1a1a]">{completionRate}%</span>{" "}
        of saved articles.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard value={total.articles} label="Articles" />
        <MetricCard value={`${total.hoursRead}h`} label="Time Read" />
        <MetricCard value={total.sessions.toLocaleString()} label="Sessions" />
        <MetricCard value={total.completed} label="Completed" />
        <MetricCard value={total.favorites} label="Favorites" />
        <MetricCard value={total.weeksTracked} label="Weeks Active" />
      </div>
    </div>
  );
}
