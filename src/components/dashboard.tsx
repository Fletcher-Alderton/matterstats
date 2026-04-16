"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { DashboardData } from "@/lib/types";
import { processData } from "@/lib/process-data";
import {
  readSavedToken,
  saveToken,
  clearToken,
  readCache,
  writeCache,
  clearCacheForToken,
  cleanupLegacyKeys,
} from "@/lib/browser-storage";
import { Login } from "./login";
import {
  WeeklyChart,
  CategoryDonut,
  CategoryBars,
  ProgressChart,
  SessionChart,
} from "./charts";
import { ReadingLoader } from "./reading-loader";
import { TopBar } from "./top-bar";
import { ShareButton } from "./share-button";
import { HeroOverview } from "./hero-overview";
import { Section } from "./section";
import { InsightRail } from "./insight-rail";
import { LeaderboardList } from "./leaderboard-list";
import { FavoritesShowcase } from "./favorites-showcase";
import { ArticleExplorer } from "./article-explorer";

type LoadingStep = { label: string; status: "pending" | "active" | "done" };

type LoadState =
  | { phase: "login" }
  | {
      phase: "loading";
      steps: LoadingStep[];
      detail?: string;
      progress: number;
    }
  | { phase: "ready"; data: DashboardData; warnings?: string[] }
  | { phase: "error"; message: string };

/* ── Data fetching helpers ── */
async function safeReadError(res: Response): Promise<string> {
  try {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const data = await res.json();
      return data.error || `Request failed (${res.status})`;
    }
    return (await res.text()) || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

/* ── Main dashboard ── */
export function Dashboard() {
  const [state, setState] = useState<LoadState>({ phase: "login" });
  const [remember, setRemember] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const loadData = useCallback(async (token: string, rem: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    tokenRef.current = token;

    const cached = await readCache(token, rem);
    if (cached && Date.now() - cached.timestamp < 1000 * 60 * 30) {
      if (requestId !== requestIdRef.current) return;
      saveToken(token, rem);
      setState({
        phase: "ready",
        data: cached.data as DashboardData,
        warnings: cached.warnings,
      });
      return;
    }

    const STEP_LABELS = [
      "Connecting to Matter",
      "Fetching your library",
      "Analyzing content",
      "Building dashboard",
    ];

    const STEP_MAP: Record<string, number> = {
      "Connecting to Matter": 0,
      "Fetching reading data": 1,
      "Discovering categories": 2,
      "Analyzing authors": 2,
      "Computing embeddings": 2,
      "Classifying articles": 3,
      Finalizing: 3,
    };

    const makeSteps = (activeIdx: number): LoadingStep[] =>
      STEP_LABELS.map((label, i) => ({
        label,
        status:
          i < activeIdx
            ? ("done" as const)
            : i === activeIdx
              ? ("active" as const)
              : ("pending" as const),
      }));

    setState({ phase: "loading", steps: makeSteps(0), progress: 0 });

    try {
      const res = await fetch("/api/matter/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, type: "dashboard" }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(await safeReadError(res));
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (requestId !== requestIdRef.current) {
          reader.cancel();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const chunk of lines) {
          const line = chunk.trim();
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6);

          try {
            const event = JSON.parse(json);

            if (event.error) {
              throw new Error(event.error);
            }

            if (event.done) {
              const { items, sessions, categories, authorMap, warnings } =
                event;
              const data = processData(items, sessions, categories, authorMap);
              saveToken(token, rem);
              await writeCache(token, rem, data, warnings);
              setState({ phase: "ready", data, warnings });
              return;
            }

            // Progress event
            const { step, detail, progress } = event as {
              step: string;
              detail: string;
              progress: number;
            };
            const activeIdx =
              STEP_MAP[step] ??
              (progress >= 90
                ? 3
                : progress >= 50
                  ? 2
                  : progress >= 10
                    ? 1
                    : 0);
            setState({
              phase: "loading",
              steps: makeSteps(activeIdx),
              detail,
              progress,
            });
          } catch (parseErr) {
            if (
              parseErr instanceof Error &&
              parseErr.message !== "Unexpected end of JSON input"
            ) {
              throw parseErr;
            }
          }
        }
      }

      // If we reach here without a done event, something went wrong
      throw new Error("Stream ended without completion");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (requestId !== requestIdRef.current) return;
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setState({ phase: "error", message });
    }
  }, []);

  useEffect(() => {
    cleanupLegacyKeys();
    const saved = readSavedToken();
    if (saved) {
      setRemember(saved.remember);
      loadData(saved.token, saved.remember);
    }
  }, [loadData]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  if (state.phase === "login") {
    return (
      <Login
        onLogin={(token, rem) => {
          setRemember(rem);
          loadData(token, rem);
        }}
      />
    );
  }

  if (state.phase === "loading") {
    return (
      <ReadingLoader
        steps={state.steps}
        detail={state.detail}
        progress={state.progress}
      />
    );
  }

  if (state.phase === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#fafafa] px-6">
        <div className="px-8 py-6 text-center">
          <p className="text-base font-medium text-[#1a1a1a]">
            {state.message}
          </p>
        </div>
        <button
          onClick={() => {
            clearToken();
            setState({ phase: "login" });
          }}
          className="bg-[#1a1a1a] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
        >
          Try Again
        </button>
      </div>
    );
  }

  const { data } = state;
  const totalArticles = Object.values(data.categories).reduce(
    (s, v) => s + v,
    0,
  );

  return (
    <div className="min-h-screen bg-[#fafafa] text-black">
      <ShareButton data={data} />
      <div className="mx-auto max-w-[1200px] px-5 pb-4 pt-2 md:px-8">
        <TopBar
          onDisconnect={async () => {
            abortRef.current?.abort();
            if (tokenRef.current) await clearCacheForToken(tokenRef.current);
            clearToken();
            tokenRef.current = null;
            setState({ phase: "login" });
          }}
          onClearCache={async () => {
            if (!tokenRef.current) return;
            await clearCacheForToken(tokenRef.current);
            loadData(tokenRef.current, remember);
          }}
        />

        {state.phase === "ready" &&
          state.warnings &&
          state.warnings.length > 0 && (
            <div className="mb-6 border-b border-[#e0e0e0] px-5 py-3 text-sm text-[#999]">
              {state.warnings.join(" · ")}
            </div>
          )}

        {/* Hero */}
        <HeroOverview data={data} />

        {/* Reading rhythm + insights */}
        <div className="mb-8 grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Section
              title="Reading Rhythm"
              description="Weekly reading time over your history"
            >
              <WeeklyChart data={data.weekly} />
            </Section>
          </div>
          <div className="lg:col-span-4">
            <Section title="Insights">
              <InsightRail data={data} />
            </Section>
          </div>
        </div>

        {/* Progress distribution */}
        <div className="mb-8">
          <Section
            title="Reading Progress"
            description="How far you get through your articles"
          >
            <ProgressChart data={data.progress} />
          </Section>
        </div>

        {/* Categories */}
        <div className="mb-8">
          <Section title="What You Read" description="Articles by topic">
            <div className="mx-auto mb-6 max-w-xs">
              <CategoryDonut data={data.categories} total={totalArticles} />
            </div>
            <CategoryBars
              data={data.categories}
              total={totalArticles}
              columns
            />
          </Section>
        </div>

        {/* Authors & Sources */}
        <div className="mb-8 grid gap-6 md:grid-cols-2">
          <Section title="Top Authors">
            <LeaderboardList data={data.authors} label="Authors" />
          </Section>
          <Section title="Top Sources">
            <LeaderboardList data={data.sources} label="Sources" />
          </Section>
        </div>

        {/* Sessions */}
        <div className="mb-8">
          <Section
            title="Session Activity"
            description="Reading sessions per week"
          >
            <SessionChart data={data.weekly} />
          </Section>
        </div>

        {/* Favorites */}
        {data.favorites.length > 0 && (
          <div className="mb-8">
            <Section
              title="Worth Revisiting"
              description="Your favorited articles"
            >
              <FavoritesShowcase favorites={data.favorites} />
            </Section>
          </div>
        )}

        {/* Library explorer */}
        <div className="mb-8">
          <Section
            title="Library"
            description="Browse and search your full reading list"
          >
            <ArticleExplorer items={data.items} categories={data.categories} />
          </Section>
        </div>

        <footer className="pb-10 pt-4 text-center text-xs text-[#bbb]">
          <p>
            Built with your{" "}
            <a
              href="https://getmatter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#888] transition-colors hover:text-black hover:underline"
            >
              Matter
            </a>{" "}
            reading data
          </p>
          <p className="mt-1">
            Made by{" "}
            <a
              href="https://www.fletcheralderton.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#888] transition-colors hover:text-black hover:underline"
            >
              Fletcher Alderton
            </a>
            {" · "}
            <a
              href="https://github.com/fletcheralderton/matterstats"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#888] transition-colors hover:text-black hover:underline"
            >
              GitHub
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
