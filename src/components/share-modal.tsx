"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { DashboardData } from "@/lib/types";
import { formatTime, formatWeekLabel } from "@/lib/format";

const SIZE = 1080;
const DISPLAY = 360;
const PAD = 80;
const FONT = "system-ui, -apple-system, sans-serif";

type Tab = {
  key: string;
  label: string;
  draw: (ctx: CanvasRenderingContext2D, data: DashboardData) => void;
};

/* ── Canvas helpers ── */

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = "#e0e0e0";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
}

function drawBranding(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#999999";
  ctx.font = `500 28px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(typeof window !== "undefined" ? window.location.host : "matterstats", SIZE / 2, SIZE - 50);
}

function drawHeader(ctx: CanvasRenderingContext2D, title: string) {
  const y = PAD + 20;
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `600 40px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(title, SIZE / 2, y);
  ctx.strokeStyle = "#e0e0e0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y + 24);
  ctx.lineTo(SIZE - PAD, y + 24);
  ctx.stroke();
}


/* ── Reusable drawing patterns ── */

function drawBarChart(
  ctx: CanvasRenderingContext2D,
  bars: { label: string; value: number }[],
  unit: string,
  formatValue: (v: number) => string = (v) => String(v),
) {
  if (bars.length === 0) return;

  const top = 140;
  const bottom = SIZE - 130;
  const left = PAD + 20;
  const right = SIZE - PAD;
  const chartH = bottom - top;

  const max = Math.max(...bars.map((b) => b.value), 1);
  const barW = Math.max(1, Math.min(24, (right - left) / bars.length - 2));
  const gap = (right - left - barW * bars.length) / (bars.length + 1);

  // Y-axis guide lines
  ctx.strokeStyle = "#f0f0f0";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const y = bottom - (chartH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }

  // Bars
  for (let i = 0; i < bars.length; i++) {
    const x = left + gap + i * (barW + gap);
    const h = (bars[i].value / max) * (chartH - 20);
    const y = bottom - h;

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(x, y, barW, h);
  }

  // X labels (show ~8 evenly spaced)
  const labelCount = Math.min(8, bars.length);
  const step = Math.max(1, Math.floor(bars.length / labelCount));
  ctx.fillStyle = "#999999";
  ctx.font = `400 22px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i < bars.length; i += step) {
    const x = left + gap + i * (barW + gap) + barW / 2;
    ctx.fillText(bars[i].label, x, bottom + 10);
  }

  // Summary stat top-right
  const total = bars.reduce((s, b) => s + b.value, 0);
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `700 56px ${FONT}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(formatValue(total), right, PAD - 4);
  ctx.fillStyle = "#999999";
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText(unit, right, PAD + 24);
}

function drawLeaderboard(
  ctx: CanvasRenderingContext2D,
  entries: [string, number][],
) {
  const top = 140;
  const left = PAD;
  const right = SIZE - PAD;
  const rowH = 72;
  const maxCount = entries.length > 0 ? entries[0][1] : 1;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const show = entries.slice(0, 10);

  for (let i = 0; i < show.length; i++) {
    const [name, count] = show[i];
    const y = top + i * rowH;
    const barW = (count / maxCount) * (right - left);
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;

    // Bar background
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(left, y, barW, rowH - 8);

    // Rank
    ctx.fillStyle = "#999999";
    ctx.font = `600 26px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), left + 28, y + (rowH - 8) / 2);

    // Name
    ctx.fillStyle = "#1a1a1a";
    ctx.font = `500 28px ${FONT}`;
    ctx.textAlign = "left";
    const maxNameW = right - left - 200;
    let displayName = name;
    while (ctx.measureText(displayName).width > maxNameW && displayName.length > 3) {
      displayName = displayName.slice(0, -4) + "…";
    }
    ctx.fillText(displayName, left + 60, y + (rowH - 8) / 2 + 2);

    // Count + pct
    ctx.fillStyle = "#1a1a1a";
    ctx.font = `600 28px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(String(count), right - 70, y + (rowH - 8) / 2 + 2);
    ctx.fillStyle = "#999999";
    ctx.font = `400 24px ${FONT}`;
    ctx.fillText(`${pct}%`, right, y + (rowH - 8) / 2 + 2);
  }
}

function drawHorizontalBars(
  ctx: CanvasRenderingContext2D,
  entries: [string, number][],
  total: number,
) {
  const left = PAD;
  const right = SIZE - PAD;
  const maxVal = entries.length > 0 ? entries[0][1] : 1;
  const show = entries.slice(0, 10);

  // Calculate spacing to fill available area (between header and branding)
  const areaTop = 140;
  const areaBottom = SIZE - 100;
  const rowH = Math.min(76, (areaBottom - areaTop) / show.length);
  const labelH = 28;
  const barH = rowH - labelH - 6;

  for (let i = 0; i < show.length; i++) {
    const [name, count] = show[i];
    const rowY = areaTop + i * rowH;
    const barY = rowY + labelH;
    const barW = Math.max(4, (count / maxVal) * (right - left - 120));
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;

    // Label above bar
    ctx.fillStyle = "#999999";
    ctx.font = `500 22px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(name, left, rowY + labelH - 6);

    // Bar
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(left, barY, barW, barH);

    // Count inside or beside bar
    ctx.fillStyle = barW > 100 ? "#ffffff" : "#1a1a1a";
    ctx.font = `600 20px ${FONT}`;
    ctx.textAlign = barW > 100 ? "right" : "left";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `${count}  (${pct}%)`,
      barW > 100 ? left + barW - 12 : left + barW + 10,
      barY + barH / 2,
    );
  }
}

/* ── Tab draw functions ── */

function drawOverview(ctx: CanvasRenderingContext2D, data: DashboardData) {
  drawBackground(ctx);
  drawHeader(ctx, "My Reading Stats");

  const { total, categories } = data;
  const topCategory = Object.keys(categories)[0] ?? "—";

  const stats = [
    { value: String(total.articles), label: "Articles" },
    { value: `${total.hoursRead}h`, label: "Time Read" },
    { value: total.sessions.toLocaleString(), label: "Sessions" },
    { value: String(total.completed), label: "Completed" },
    { value: String(total.favorites), label: "Favorites" },
    { value: String(total.weeksTracked), label: "Weeks Active" },
  ];

  const cols = 3;
  const cellW = (SIZE - PAD * 2) / cols;
  const cellH = 220;
  const startY = 180;

  for (let i = 0; i < stats.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = PAD + col * cellW + cellW / 2;
    const cy = startY + row * cellH + cellH / 2;

    ctx.fillStyle = "#1a1a1a";
    ctx.font = `700 80px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(stats[i].value, cx, cy - 20);

    ctx.fillStyle = "#999999";
    ctx.font = `500 24px ${FONT}`;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(stats[i].label.toUpperCase(), cx, cy + 40);
  }

  const calloutY = startY + 2 * cellH + 60;
  ctx.fillStyle = "#999999";
  ctx.font = `400 28px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(`Most read topic: ${topCategory}`, SIZE / 2, calloutY);

  ctx.strokeStyle = "#e0e0e0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, calloutY + 30);
  ctx.lineTo(SIZE - PAD, calloutY + 30);
  ctx.stroke();

  const completionRate = total.articles > 0
    ? Math.round((total.completed / total.articles) * 100)
    : 0;
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `600 72px ${FONT}`;
  ctx.fillText(`${completionRate}%`, SIZE / 2, calloutY + 120);
  ctx.fillStyle = "#999999";
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText("COMPLETION RATE", SIZE / 2, calloutY + 165);

  drawBranding(ctx);
}

function drawReadingRhythm(ctx: CanvasRenderingContext2D, data: DashboardData) {
  drawBackground(ctx);
  drawHeader(ctx, "Reading Rhythm");

  const bars = data.weekly.map((w) => ({
    label: formatWeekLabel(w.week),
    value: w.minutes,
  }));
  drawBarChart(ctx, bars, "TOTAL MINUTES", (v) => formatTime(v));
  drawBranding(ctx);
}

function drawInsights(ctx: CanvasRenderingContext2D, data: DashboardData) {
  drawBackground(ctx);
  drawHeader(ctx, "Insights");

  const { weekly, progress } = data;
  const latest = weekly[weekly.length - 1];
  const totalMinutes = weekly.reduce((s, w) => s + w.minutes, 0);
  const avgMinutes = weekly.length > 0 ? Math.round(totalMinutes / weekly.length) : 0;
  const peakWeek = weekly.length > 0
    ? weekly.reduce((best, w) => (w.minutes > best.minutes ? w : best), weekly[0])
    : null;
  const totalArticles = Object.values(progress).reduce((s, v) => s + v, 0);
  const completedPct = totalArticles > 0 ? Math.round(((progress["100%"] ?? 0) / totalArticles) * 100) : 0;

  const stats = [
    { label: "Last Week", value: latest ? formatTime(latest.minutes) : "—", sub: latest ? `${latest.sessions} sessions` : "" },
    { label: "Weekly Average", value: formatTime(avgMinutes), sub: "" },
    { label: "Peak Week", value: peakWeek ? formatTime(peakWeek.minutes) : "—", sub: peakWeek ? formatWeekLabel(peakWeek.week) : "" },
    { label: "Completion Rate", value: `${completedPct}%`, sub: `${progress["100%"] ?? 0} of ${totalArticles}` },
  ];

  const top = 170;
  const rowH = 190;

  for (let i = 0; i < stats.length; i++) {
    const y = top + i * rowH;

    // Divider above (except first row)
    if (i > 0) {
      ctx.strokeStyle = "#e8e8e8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, y - 24);
      ctx.lineTo(SIZE - PAD, y - 24);
      ctx.stroke();
    }

    ctx.fillStyle = "#999999";
    ctx.font = `500 24px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(stats[i].label.toUpperCase(), PAD, y);

    ctx.fillStyle = "#1a1a1a";
    ctx.font = `700 72px ${FONT}`;
    ctx.fillText(stats[i].value, PAD, y + 70);

    if (stats[i].sub) {
      ctx.fillStyle = "#999999";
      ctx.font = `400 28px ${FONT}`;
      ctx.fillText(stats[i].sub, PAD, y + 110);
    }
  }

  drawBranding(ctx);
}

function drawReadingProgress(ctx: CanvasRenderingContext2D, data: DashboardData) {
  drawBackground(ctx);
  drawHeader(ctx, "Reading Progress");

  const entries = Object.entries(data.progress);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const maxVal = Math.max(...entries.map(([, v]) => v), 1);

  const left = PAD + 120;
  const right = SIZE - PAD;
  const barH = 64;
  const gap = 32;
  const totalH = entries.length * barH + (entries.length - 1) * gap;
  const areaTop = PAD + 24 + 40; // after header
  const areaBottom = SIZE - 100; // before branding
  const top = areaTop + (areaBottom - areaTop - totalH) / 2;

  for (let i = 0; i < entries.length; i++) {
    const [label, count] = entries[i];
    const y = top + i * (barH + gap);
    const barW = Math.max(4, (count / maxVal) * (right - left - 100));
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;

    // Shade from light to dark
    const shade = Math.round(26 + (229 - 26) * (1 - i / (entries.length - 1)));
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(left, y, barW, barH);

    // Label on left
    ctx.fillStyle = "#999999";
    ctx.font = `500 28px ${FONT}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(label, left - 16, y + barH / 2);

    // Count on right
    ctx.fillStyle = "#1a1a1a";
    ctx.font = `600 28px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(`${count}  (${pct}%)`, left + barW + 14, y + barH / 2);
  }

  drawBranding(ctx);
}

function drawWhatYouRead(ctx: CanvasRenderingContext2D, data: DashboardData) {
  drawBackground(ctx);
  drawHeader(ctx, "What You Read");

  const entries = Object.entries(data.categories);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  drawHorizontalBars(ctx, entries, total);
  drawBranding(ctx);
}

function drawTopAuthors(ctx: CanvasRenderingContext2D, data: DashboardData) {
  drawBackground(ctx);
  drawHeader(ctx, "Top Authors");
  drawLeaderboard(ctx, Object.entries(data.authors));
  drawBranding(ctx);
}

function drawTopSources(ctx: CanvasRenderingContext2D, data: DashboardData) {
  drawBackground(ctx);
  drawHeader(ctx, "Top Sources");
  drawLeaderboard(ctx, Object.entries(data.sources));
  drawBranding(ctx);
}

function drawSessionActivity(ctx: CanvasRenderingContext2D, data: DashboardData) {
  drawBackground(ctx);
  drawHeader(ctx, "Session Activity");

  const bars = data.weekly.map((w) => ({
    label: formatWeekLabel(w.week),
    value: w.sessions,
  }));
  drawBarChart(ctx, bars, "TOTAL SESSIONS", (v) => v.toLocaleString());
  drawBranding(ctx);
}

function drawWorthRevisiting(ctx: CanvasRenderingContext2D, data: DashboardData) {
  drawBackground(ctx);
  drawHeader(ctx, "Worth Revisiting");

  const favs = data.favorites.slice(0, 8);
  const top = 160;
  const rowH = 100;

  for (let i = 0; i < favs.length; i++) {
    const f = favs[i];
    const y = top + i * rowH;

    // Title
    ctx.fillStyle = "#1a1a1a";
    ctx.font = `600 30px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    let title = f.title;
    while (ctx.measureText(title).width > SIZE - PAD * 2 && title.length > 3) {
      title = title.slice(0, -4) + "…";
    }
    ctx.fillText(title, PAD, y);

    // Author · Source · Category
    const meta = [f.author, f.source, f.category].filter(Boolean).join(" · ");
    ctx.fillStyle = "#999999";
    ctx.font = `400 24px ${FONT}`;
    let metaDisplay = meta;
    while (ctx.measureText(metaDisplay).width > SIZE - PAD * 2 && metaDisplay.length > 3) {
      metaDisplay = metaDisplay.slice(0, -4) + "…";
    }
    ctx.fillText(metaDisplay, PAD, y + 34);

    if (i < favs.length - 1) {
      ctx.strokeStyle = "#e8e8e8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, y + rowH - 20);
      ctx.lineTo(SIZE - PAD, y + rowH - 20);
      ctx.stroke();
    }
  }

  if (favs.length === 0) {
    ctx.fillStyle = "#999999";
    ctx.font = `400 32px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No favorites yet", SIZE / 2, SIZE / 2);
  }

  drawBranding(ctx);
}

/* ── Tabs ── */

const TABS: Tab[] = [
  { key: "overview", label: "Overview", draw: drawOverview },
  { key: "rhythm", label: "Reading Rhythm", draw: drawReadingRhythm },
  { key: "insights", label: "Insights", draw: drawInsights },
  { key: "progress", label: "Reading Progress", draw: drawReadingProgress },
  { key: "categories", label: "What You Read", draw: drawWhatYouRead },
  { key: "authors", label: "Top Authors", draw: drawTopAuthors },
  { key: "sources", label: "Top Sources", draw: drawTopSources },
  { key: "sessions", label: "Session Activity", draw: drawSessionActivity },
  { key: "favorites", label: "Worth Revisiting", draw: drawWorthRevisiting },
];

/* ── Modal ── */

export function ShareModal({
  data,
  onClose,
}: {
  data: DashboardData;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [saving, setSaving] = useState<"idle" | "copied" | "saved">("idle");

  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    tab.draw(ctx, data);
  }, [tab, data]);

  const getBlob = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas) return reject(new Error("No canvas"));
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to export"));
      }, "image/png");
    });
  }, []);

  const handleDownload = useCallback(async () => {
    try {
      const blob = await getBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `matter-stats-${activeTab}.png`;
      a.click();
      URL.revokeObjectURL(url);
      setSaving("saved");
      setTimeout(() => setSaving("idle"), 2000);
    } catch {
      /* noop */
    }
  }, [getBlob, activeTab]);

  const handleCopy = useCallback(async () => {
    try {
      const blob = await getBlob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setSaving("copied");
      setTimeout(() => setSaving("idle"), 2000);
    } catch {
      handleDownload();
    }
  }, [getBlob, handleDownload]);

  const handleShare = useCallback(async () => {
    try {
      const blob = await getBlob();
      const file = new File([blob], `matter-stats-${activeTab}.png`, {
        type: "image/png",
      });
      if (navigator.share) {
        await navigator.share({ files: [file] });
      }
    } catch {
      handleCopy();
    }
  }, [getBlob, activeTab, handleCopy]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative z-10 flex max-h-[90vh] w-[440px] max-w-[95vw] flex-col overflow-hidden bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e0e0e0] px-5 py-4">
          <span className="text-sm font-semibold text-[#1a1a1a]">Share Stats</span>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center text-[#999] transition-colors hover:text-[#1a1a1a]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable content area */}
        <div className="overflow-y-auto">
          {/* Tabs */}
          <div className="flex flex-wrap gap-1.5 border-b border-[#e0e0e0] px-5 py-3">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === t.key
                    ? "bg-[#1a1a1a] text-white"
                    : "bg-white text-[#999] border border-[#e0e0e0] hover:text-[#1a1a1a]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Canvas preview */}
          <div className="flex items-center justify-center p-5">
            <canvas
              ref={canvasRef}
              width={SIZE}
              height={SIZE}
              className="border border-[#e0e0e0]"
              style={{ width: DISPLAY, height: DISPLAY }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-[#e0e0e0] px-5 py-4">
          <button
            onClick={handleCopy}
            className="flex-1 bg-[#1a1a1a] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
          >
            {saving === "copied" ? "Copied!" : "Copy Image"}
          </button>
          <button
            onClick={handleDownload}
            className="flex-1 border border-[#e0e0e0] bg-white py-2.5 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-[#f0f0f0]"
          >
            {saving === "saved" ? "Saved!" : "Download"}
          </button>
          {"share" in navigator && (
            <button
              onClick={handleShare}
              className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#e0e0e0] bg-white transition-colors hover:bg-[#f0f0f0]"
              title="Share"
            >
              <svg className="h-4 w-4 text-[#1a1a1a]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
