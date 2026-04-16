import type { MatterItem, MatterSession } from "./matter-api";
import type { DashboardData, ProcessedItem, WeekData } from "./types";
import { sanitizeExternalUrl } from "./url";

export function processData(
  items: MatterItem[],
  sessions: MatterSession[],
  categories: Record<string, string>,
  authorMap: Record<string, string> = {}
): DashboardData {
  // Process items
  const processedItems: ProcessedItem[] = items.map((item) => {
    const rawAuthor = item.author?.name ?? "";
    const author = authorMap[rawAuthor] ?? rawAuthor;
    return {
      id: item.id,
      title: item.title,
      url: sanitizeExternalUrl(item.url),
      author,
      source: item.site_name ?? "",
      category: categories[item.id] ?? "Uncategorized",
      status: item.status,
      progress: Math.min(100, Math.max(0, Math.round((item.reading_progress ?? 0) * 100))),
      favorite: item.is_favorite,
      wordCount: item.word_count ?? 0,
      excerpt: item.excerpt ?? "",
      imageUrl: sanitizeExternalUrl(item.image_url) ?? "",
    };
  });

  // Category counts
  const catCounts: Record<string, number> = {};
  for (const item of processedItems) {
    catCounts[item.category] = (catCounts[item.category] ?? 0) + 1;
  }
  // Sort by count descending
  const sortedCats = Object.fromEntries(
    Object.entries(catCounts).sort(([, a], [, b]) => b - a)
  );

  // Weekly sessions
  const weeks: Record<string, { seconds: number; count: number }> = {};
  for (const s of sessions) {
    const dt = new Date(s.date);
    if (Number.isNaN(dt.getTime())) continue;
    const day = dt.getUTCDay();
    const diff = (day === 0 ? 6 : day - 1); // Monday = 0
    const monday = new Date(dt);
    monday.setUTCDate(monday.getUTCDate() - diff);
    const key = monday.toISOString().slice(0, 10);
    if (!weeks[key]) weeks[key] = { seconds: 0, count: 0 };
    weeks[key].seconds += s.seconds_read;
    weeks[key].count += 1;
  }
  const weekly: WeekData[] = Object.entries(weeks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, w]) => ({
      week,
      minutes: Math.round((w.seconds / 60) * 10) / 10,
      sessions: w.count,
    }));

  // Sources
  const sources: Record<string, number> = {};
  for (const item of processedItems) {
    if (item.source) sources[item.source] = (sources[item.source] ?? 0) + 1;
  }
  const sortedSources = Object.fromEntries(
    Object.entries(sources)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
  );

  // Authors (deduplicated via LLM authorMap)
  const authors: Record<string, number> = {};
  for (const item of processedItems) {
    if (item.author && !item.author.includes("@") && item.author.length < 50) {
      const canonical = authorMap[item.author] ?? item.author;
      authors[canonical] = (authors[canonical] ?? 0) + 1;
    }
  }
  const sortedAuthors = Object.fromEntries(
    Object.entries(authors)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
  );

  // Progress distribution
  const progress: Record<string, number> = {
    "0%": 0,
    "1-24%": 0,
    "25-49%": 0,
    "50-74%": 0,
    "75-99%": 0,
    "100%": 0,
  };
  for (const item of processedItems) {
    if (item.progress === 0) progress["0%"]++;
    else if (item.progress < 25) progress["1-24%"]++;
    else if (item.progress < 50) progress["25-49%"]++;
    else if (item.progress < 75) progress["50-74%"]++;
    else if (item.progress < 100) progress["75-99%"]++;
    else progress["100%"]++;
  }

  const totalSeconds = sessions.reduce((s, x) => s + x.seconds_read, 0);

  return {
    total: {
      articles: items.length,
      sessions: sessions.length,
      hoursRead: Math.round((totalSeconds / 3600) * 10) / 10,
      favorites: processedItems.filter((i) => i.favorite).length,
      completed: processedItems.filter((i) => i.progress >= 100).length,
      weeksTracked: Object.keys(weeks).length,
    },
    categories: sortedCats,
    weekly,
    sources: sortedSources,
    authors: sortedAuthors,
    progress,
    favorites: processedItems.filter((i) => i.favorite),
    items: processedItems,
  };
}
