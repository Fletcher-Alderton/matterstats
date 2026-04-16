"use client";

import { useState, useMemo } from "react";
import type { DashboardData } from "@/lib/types";

const ARTICLE_PAGE_SIZE = 50;

export function ArticleExplorer({
  items,
  categories,
}: {
  items: DashboardData["items"];
  categories: DashboardData["categories"];
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [visibleCount, setVisibleCount] = useState(ARTICLE_PAGE_SIZE);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (categoryFilter !== "All" && item.category !== categoryFilter)
        return false;
      if (statusFilter !== "All") {
        if (statusFilter === "Unread" && item.progress !== 0) return false;
        if (
          statusFilter === "In Progress" &&
          (item.progress === 0 || item.progress >= 100)
        )
          return false;
        if (statusFilter === "Completed" && item.progress < 100) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.author.toLowerCase().includes(q) ||
          item.source.toLowerCase().includes(q) ||
          item.excerpt.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, categoryFilter, statusFilter, search]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const progressColor = (p: number) =>
    p >= 100 ? "#1a1a1a" : p > 0 ? "#999" : "#ddd";

  const statusFilters = ["All", "Unread", "In Progress", "Completed"];

  return (
    <>
      {/* Search */}
      <div className="relative mb-4">
        <svg
          className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#999]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisibleCount(ARTICLE_PAGE_SIZE);
          }}
          placeholder="Search articles, authors, sources..."
          className="w-full border-b border-[#e0e0e0] bg-transparent py-3 pl-10 pr-4 text-sm text-[#1a1a1a] placeholder-[#999] outline-none transition-colors focus:border-[#1a1a1a]"
        />
      </div>

      {/* Filters */}
      <div className="mb-2 flex flex-wrap gap-3">
        {statusFilters.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s);
              setVisibleCount(ARTICLE_PAGE_SIZE);
            }}
            className={`px-1 py-1.5 text-xs font-medium transition-all ${
              s === statusFilter
                ? "border-b-2 border-[#1a1a1a] text-[#1a1a1a]"
                : "text-[#999] hover:text-[#1a1a1a]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="mb-5 flex gap-3 overflow-x-auto pb-1">
        {["All", ...Object.keys(categories)].map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setCategoryFilter(cat);
              setVisibleCount(ARTICLE_PAGE_SIZE);
            }}
            className={`shrink-0 px-1 py-1.5 text-xs font-medium transition-all ${
              cat === categoryFilter
                ? "border-b-2 border-[#1a1a1a] text-[#1a1a1a]"
                : "text-[#999] hover:text-[#1a1a1a]"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Result count */}
      <div className="mb-3 text-xs text-[#999]">
        {filtered.length} article{filtered.length !== 1 ? "s" : ""}
        {categoryFilter !== "All" || statusFilter !== "All" || search
          ? " found"
          : " total"}
      </div>

      {/* Article list */}
      <div className="flex flex-col">
        {visible.map((item) => {
          const Wrapper = item.url ? "a" : "div";
          const linkProps = item.url
            ? {
                href: item.url,
                target: "_blank" as const,
                rel: "noopener noreferrer",
              }
            : {};
          return (
            <Wrapper
              key={item.id}
              {...linkProps}
              className="group border-b border-[#e8e8e8] px-4 py-3 transition-colors"
            >
              {/* Desktop layout */}
              <div className="hidden items-center gap-4 md:flex">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[#1a1a1a] group-hover:underline">
                    {item.title}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-[#999]">
                    {item.author && <>{item.author} · </>}
                    {item.source}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-[#999]">
                  {item.category}
                </span>
                <div className="flex w-24 items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden bg-[#e8e8e8]">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${item.progress}%`,
                        background: progressColor(item.progress),
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-[11px] font-medium text-[#999]">
                    {item.progress}%
                  </span>
                </div>
              </div>
              {/* Mobile layout */}
              <div className="flex flex-col gap-1.5 md:hidden">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-[#1a1a1a]">
                    {item.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#999]">
                  {item.author && <span>{item.author}</span>}
                  {item.author && <span>·</span>}
                  <span>{item.source}</span>
                  <span>·</span>
                  <span className="text-[#999]">{item.category}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden bg-[#e8e8e8]">
                    <div
                      className="h-full"
                      style={{
                        width: `${item.progress}%`,
                        background: progressColor(item.progress),
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-[#999]">
                    {item.progress}%
                  </span>
                </div>
              </div>
            </Wrapper>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + ARTICLE_PAGE_SIZE)}
          className="mt-4 text-sm font-medium text-[#999] transition-colors hover:text-[#1a1a1a] border-b border-[#1a1a1a]"
        >
          Show more ({filtered.length - visibleCount} remaining)
        </button>
      )}

      {visible.length === 0 && (
        <p className="py-8 text-center text-sm text-[#999]">
          No articles match your filters
        </p>
      )}
    </>
  );
}
