"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";
import type { DashboardData } from "@/lib/types";
import { formatTime } from "@/lib/format";

export { formatTime };

const CATEGORY_PALETTE = [
  "#1a1a1a", "#333333", "#4d4d4d", "#666666",
  "#808080", "#999999", "#b3b3b3", "#cccccc",
  "#d9d9d9", "#e0e0e0", "#e8e8e8", "#f0f0f0",
];

function getCategoryColor(name: string): string {
  if (name.includes("Uncategorized")) return "#d9d9d9";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return CATEGORY_PALETTE[Math.abs(hash) % CATEGORY_PALETTE.length];
}

const PROGRESS_COLORS = ["#e0e0e0", "#cccccc", "#b3b3b3", "#999999", "#666666", "#1a1a1a"];

const tooltipStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #e0e0e0",
  borderRadius: "0px",
  color: "#1a1a1a",
  padding: "8px 12px",
};

export function WeeklyChart({ data }: { data: DashboardData["weekly"] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" vertical={false} />
        <XAxis
          dataKey="week"
          tick={{ fill: "#999", fontSize: 10 }}
          tickFormatter={(v) => {
            const d = new Date(v + "T00:00:00");
            if (Number.isNaN(d.getTime())) return v;
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          }}
          interval={Math.max(0, Math.floor(data.length / 12))}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#999" }}
          tickFormatter={(v) => formatTime(v)}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, _name, props) => {
            const v = Number(value);
            const s = (props as { payload?: { sessions?: number } })?.payload?.sessions ?? 0;
            return [`${formatTime(v)} · ${s} sessions`, "Reading"];
          }}
          labelFormatter={(label) => {
            const d = new Date(label + "T00:00:00");
            if (Number.isNaN(d.getTime())) return label;
            return `Week of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
          }}
        />
        <Bar dataKey="minutes" radius={[0, 0, 0, 0]} fill="#1a1a1a" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonut({
  data,
  total,
}: {
  data: DashboardData["categories"];
  total?: number;
}) {
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 8);
  const rest = sorted.slice(8);
  const otherSum = rest.reduce((sum, [, v]) => sum + v, 0);
  const chartData = [
    ...top.map(([name, value]) => ({ name, value })),
    ...(otherSum > 0 ? [{ name: "Other", value: otherSum }] : []),
  ];
  const centerLabel = total ?? Object.values(data).reduce((s, v) => s + v, 0);

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={1}
          dataKey="value"
        >
          {chartData.map((entry, i) => (
            <Cell
              key={entry.name}
              fill={entry.name === "Other" ? "#e8e8e8" : CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]}
            />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-gray-900 text-2xl font-semibold"
        >
          {centerLabel}
        </text>
        <text
          x="50%"
          y="58%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-gray-400 text-xs"
        >
          total
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ProgressChart({ data }: { data: DashboardData["progress"] }) {
  const order = ["0%", "1-24%", "25-49%", "50-74%", "75-99%", "100%"];
  const chartData = order.map((k, i) => ({ name: k, count: data[k] ?? 0, fill: PROGRESS_COLORS[i] }));
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: "#999" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#999" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="count" radius={[0, 0, 0, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SessionChart({ data }: { data: DashboardData["weekly"] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" vertical={false} />
        <XAxis
          dataKey="week"
          tick={{ fill: "#999", fontSize: 10 }}
          tickFormatter={(v) => {
            const d = new Date(v + "T00:00:00");
            if (Number.isNaN(d.getTime())) return v;
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          }}
          interval={Math.max(0, Math.floor(data.length / 8))}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={{ fill: "#999" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} sessions`, "Sessions"]} />
        <Area
          type="monotone"
          dataKey="sessions"
          stroke="#1a1a1a"
          fill="rgba(26,26,26,0.06)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CategoryBars({
  data,
  total,
  columns,
}: {
  data: DashboardData["categories"];
  total?: number;
  columns?: boolean;
}) {
  const entries = Object.entries(data);
  const maxCount = Math.max(1, ...Object.values(data));
  const computedTotal = total ?? Object.values(data).reduce((s, v) => s + v, 0);

  const renderRow = ([name, count]: [string, number]) => {
    const color = getCategoryColor(name);
    const pct = (count / maxCount) * 100;
    const share = computedTotal > 0 ? ((count / computedTotal) * 100).toFixed(0) : "0";
    return (
      <div key={name} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[#f5f5f5]">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-black">{name}</div>
          <div className="mt-1.5 h-1.5 overflow-hidden bg-[#e8e8e8]">
            <div
              className="h-full transition-all duration-700"
              style={{ width: `${pct}%`, background: color }}
            />
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold text-gray-500">
          {count} <span className="font-normal text-gray-400">({share}%)</span>
        </span>
      </div>
    );
  };

  if (columns) {
    const mid = Math.ceil(entries.length / 2);
    const left = entries.slice(0, mid);
    const right = entries.slice(mid);
    return (
      <div className="grid gap-x-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1">{left.map(renderRow)}</div>
        <div className="flex flex-col gap-1">{right.map(renderRow)}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {entries.map(renderRow)}
    </div>
  );
}
