import type { MatterItem, MatterSession } from "@/lib/matter-api";
import { fetchWithTimeout, readErrorBody } from "@/lib/server/http";
import {
  OPENROUTER_API_KEY,
  MAX_ITEMS,
  MAX_TITLE_CHARS,
  MAX_EXCERPT_CHARS,
  MIN_CATEGORIES,
  ARTICLES_PER_CATEGORY,
  BATCH_SIZE,
  discoverCategories,
  dedupeAuthors,
  getEmbeddings,
  cosineSimilarity,
} from "@/lib/server/categorization";
import { log, warn, error, logUpstreamError } from "@/lib/server/log";
import { checkRateLimit, parseClientIp } from "@/lib/server/rate-limit";

// ---------------------------------------------------------------------------
// Matter API constants (mirrored from matter-api.ts)
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.getmatter.com/public/v1";
const PAGE_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

interface ProgressEvent {
  step: string;
  detail: string;
  progress: number;
}

type SSEWriter = {
  sendProgress: (event: ProgressEvent) => void;
  sendDone: (payload: Record<string, unknown>) => void;
  sendError: (message: string) => void;
  close: () => void;
};

function createSSEWriter(controller: ReadableStreamDefaultController<Uint8Array>): SSEWriter {
  const encoder = new TextEncoder();

  function write(data: string) {
    try {
      controller.enqueue(encoder.encode(`data: ${data}\n\n`));
    } catch {
      // stream may be closed
    }
  }

  return {
    sendProgress(event: ProgressEvent) {
      write(JSON.stringify(event));
    },
    sendDone(payload: Record<string, unknown>) {
      write(JSON.stringify({ done: true, ...payload }));
    },
    sendError(message: string) {
      write(JSON.stringify({ error: message }));
    },
    close() {
      try {
        controller.close();
      } catch {
        // already closed
      }
    },
  };
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// ---------------------------------------------------------------------------
// Matter API pagination with progress
// ---------------------------------------------------------------------------

interface MatterListResponse<T> {
  object: "list";
  results: T[];
  has_more: boolean;
  next_cursor: string | null;
}

async function fetchPagesWithProgress<T>(
  token: string,
  endpoint: string,
  label: string,
  onPage: (page: number, totalSoFar: number) => void,
  signal?: AbortSignal
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  let page = 0;

  do {
    page++;
    const url = new URL(`${BASE_URL}/${endpoint}`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    log(`[stream:api] ${label} page ${page}`);

    const MAX_ATTEMPTS = 3;
    let res: Response | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      res = await fetchWithTimeout(
        url.toString(),
        { headers: { Authorization: `Bearer ${token}` } },
        PAGE_TIMEOUT_MS,
        signal
      );

      if (res.status !== 429 || attempt === MAX_ATTEMPTS) break;

      const retrySecs = Number.parseInt(res.headers.get("retry-after") ?? "", 10);
      const waitMs = Number.isFinite(retrySecs) ? Math.min(retrySecs * 1000, 10_000) : 1000 * attempt;
      warn(`[stream:api] ${label} page ${page} — 429, retrying in ${waitMs}ms (attempt ${attempt}/${MAX_ATTEMPTS})`);
      await abortableSleep(waitMs, signal);
    }

    if (!res!.ok) {
      const body = await readErrorBody(res!);
      logUpstreamError(`[stream:api] ${label} page ${page}`, res!.status, body);
      throw new Error(`Matter API error ${res!.status}`);
    }

    const data: MatterListResponse<T> = await res!.json();
    all.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;

    onPage(page, all.length);
    log(`[stream:api] ${label} page ${page}: ${data.results.length} results (total: ${all.length})`);
  } while (cursor);

  return all;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      warn("[api/matter/stream] Invalid JSON body received");
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { token, type } = body as { token?: unknown; type?: unknown };

    if (!token || typeof token !== "string") {
      return Response.json({ error: "Missing API token" }, { status: 400 });
    }

    if (type !== "dashboard") {
      warn(`[api/matter/stream] Invalid type: ${String(type)}`);
      return Response.json(
        { error: "Invalid type — must be 'dashboard'" },
        { status: 400 }
      );
    }

    log("[api/matter/stream] Stream request: type=dashboard");

    const ip = parseClientIp(
      request.headers.get("x-forwarded-for"),
      request.headers.get("x-real-ip") ?? undefined,
    );
    if (process.env.NODE_ENV === "production") {
      const rateCheck = checkRateLimit(`matter:${ip}`);
      if (!rateCheck.allowed) {
        warn(`[api/matter/stream] Rate limited: ${ip}`);
        return Response.json(
          { error: "Rate limit exceeded", retryAfter: rateCheck.retryAfter },
          { status: 429 }
        );
      }
      const dashboardRateCheck = checkRateLimit(`dashboard:${ip}`);
      if (!dashboardRateCheck.allowed) {
        warn(`[api/matter/stream] Dashboard rate limited: ${ip}`);
        return Response.json(
          { error: "Rate limit exceeded", retryAfter: dashboardRateCheck.retryAfter },
          { status: 429 }
        );
      }
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const sse = createSSEWriter(controller);

        try {
          await runDashboardStream(token, request.signal, sse);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          error(`[api/matter/stream] Stream error: ${message}`);
          sse.sendError("Stream failed");
        } finally {
          sse.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    error(`[api/matter/stream] Unhandled error: ${err instanceof Error ? err.message : "Unknown error"}`);
    return Response.json({ error: "Request failed" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Dashboard streaming pipeline
// ---------------------------------------------------------------------------

async function runDashboardStream(
  token: string,
  signal: AbortSignal,
  sse: SSEWriter
): Promise<void> {
  const start = Date.now();

  // Step 1: Connecting
  sse.sendProgress({ step: "Connecting to Matter", detail: "Establishing connection…", progress: 5 });

  // Step 2: Fetch items + sessions in parallel with per-page progress
  let itemPages = 0;
  let sessionPages = 0;

  const estimatedItemPages = 3;
  const estimatedSessionPages = 26;

  function emitFetchProgress() {
    const itemFrac = Math.min(itemPages / estimatedItemPages, 1);
    const sessionFrac = Math.min(sessionPages / estimatedSessionPages, 1);
    const combined = Math.max(itemFrac, sessionFrac);
    // Scale from 10 to 50
    const progress = Math.round(10 + combined * 40);

    const detail = `Items: ${itemPages} page${itemPages !== 1 ? "s" : ""}, Sessions: ${sessionPages} page${sessionPages !== 1 ? "s" : ""}`;
    sse.sendProgress({ step: "Fetching reading data", detail, progress: Math.min(progress, 50) });
  }

  let items: MatterItem[];
  let sessions: MatterSession[];

  try {
    [items, sessions] = await Promise.all([
      fetchPagesWithProgress<MatterItem>(
        token,
        "items?status=all",
        "items",
        (page) => {
          itemPages = page;
          emitFetchProgress();
        },
        signal
      ),
      fetchPagesWithProgress<MatterSession>(
        token,
        "reading_sessions",
        "sessions",
        (page) => {
          sessionPages = page;
          emitFetchProgress();
        },
        signal
      ),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/\b(401|403)\b/.test(message)) {
      sse.sendError("Invalid API token");
    } else {
      sse.sendError("Failed to fetch reading data");
    }
    return;
  }

  log(`[api/matter/stream] Fetched ${items.length} items + ${sessions.length} sessions in ${Date.now() - start}ms`);

  // Prepare categorization inputs
  const authors = items
    .map((i) => i.author?.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);

  const cappedItems = items.slice(0, MAX_ITEMS);
  const uniqueAuthors = [...new Set(authors)];
  const maxCategories = Math.min(15, Math.max(MIN_CATEGORIES, Math.ceil(cappedItems.length / ARTICLES_PER_CATEGORY)));

  const categories: Record<string, string> = {};
  let authorMap: Record<string, string> = {};
  const warnings: string[] = [];

  if (cappedItems.length === 0) {
    log("[api/matter/stream] No items to categorize — skipping");
    sse.sendProgress({ step: "Finalizing", detail: "No items to categorize", progress: 95 });
    sse.sendDone({ items, sessions, categories, authorMap, warnings });
    return;
  }

  if (items.length > MAX_ITEMS) {
    warnings.push(`Categorization limited to first ${MAX_ITEMS} items`);
  }

  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === "your_key_here") {
    warn("[api/matter/stream] OpenRouter API key not configured — skipping categorization");
    warnings.push("OpenRouter API key not configured");
    sse.sendProgress({ step: "Finalizing", detail: "Skipping categorization (no API key)", progress: 95 });
    sse.sendDone({ items, sessions, categories, authorMap, warnings });
    return;
  }

  // Step 3: Discover categories + dedupe authors in parallel
  sse.sendProgress({ step: "Discovering categories", detail: `Analyzing ${cappedItems.length} items…`, progress: 55 });
  sse.sendProgress({ step: "Analyzing authors", detail: `${uniqueAuthors.length} unique authors…`, progress: 55 });

  let discovered: Record<string, string>;

  try {
    const [disc, aMap] = await Promise.all([
      discoverCategories(cappedItems.map((i) => i.title), maxCategories, signal),
      uniqueAuthors.length > 1
        ? dedupeAuthors(uniqueAuthors, signal).catch((err) => {
            warn(`[api/matter/stream] Author dedup failed (non-fatal): ${err instanceof Error ? err.message : err}`);
            warnings.push("Author dedup temporarily unavailable");
            return {} as Record<string, string>;
          })
        : Promise.resolve({} as Record<string, string>),
    ]);
    discovered = disc;
    authorMap = aMap;
  } catch (err) {
    error(`[api/matter/stream] Category discovery failed: ${err instanceof Error ? err.message : err}`);
    warnings.push("Categorization temporarily unavailable");
    sse.sendProgress({ step: "Finalizing", detail: "Categorization failed", progress: 95 });
    sse.sendDone({ items, sessions, categories, authorMap, warnings });
    return;
  }

  const categoryNames = Object.keys(discovered);
  const categoryDescriptions = Object.values(discovered);

  const articleTexts = cappedItems.map(
    (item) => `${item.title.slice(0, MAX_TITLE_CHARS)}. ${(item.excerpt ?? "").slice(0, MAX_EXCERPT_CHARS)}`
  );

  // Step 4: Compute embeddings with progress
  sse.sendProgress({ step: "Computing embeddings", detail: "Category embeddings…", progress: 60 });

  let categoryEmbeddings: number[][];
  try {
    categoryEmbeddings = await getEmbeddings(categoryDescriptions, "categories", signal);
  } catch (err) {
    error(`[api/matter/stream] Category embedding failed: ${err instanceof Error ? err.message : err}`);
    warnings.push("Categorization temporarily unavailable");
    sse.sendProgress({ step: "Finalizing", detail: "Embedding failed", progress: 95 });
    sse.sendDone({ items, sessions, categories, authorMap, warnings });
    return;
  }

  const articleEmbeddings: number[][] = [];
  const totalBatches = Math.ceil(articleTexts.length / BATCH_SIZE);

  for (let i = 0; i < articleTexts.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = articleTexts.slice(i, i + BATCH_SIZE);

    // Scale progress from 60 to 85 across batches
    const batchProgress = Math.round(60 + (batchNum / totalBatches) * 25);
    sse.sendProgress({
      step: "Computing embeddings",
      detail: `Article batch ${batchNum}/${totalBatches}…`,
      progress: Math.min(batchProgress, 85),
    });

    try {
      const batchEmbeddings = await getEmbeddings(batch, `articles batch ${batchNum}/${totalBatches}`, signal);
      articleEmbeddings.push(...batchEmbeddings);
    } catch (err) {
      error(`[api/matter/stream] Article embedding batch ${batchNum} failed: ${err instanceof Error ? err.message : err}`);
      warnings.push("Categorization temporarily unavailable");
      sse.sendProgress({ step: "Finalizing", detail: "Embedding failed", progress: 95 });
      sse.sendDone({ items, sessions, categories, authorMap, warnings });
      return;
    }
  }

  // Validate embedding dimensions
  const catDim = categoryEmbeddings[0]?.length ?? 0;
  const artDim = articleEmbeddings[0]?.length ?? 0;
  if (catDim > 0 && artDim > 0 && catDim !== artDim) {
    error(`[api/matter/stream] Embedding dimension mismatch: categories=${catDim}, articles=${artDim}`);
    warnings.push(`Embedding dimension mismatch: categories=${catDim}, articles=${artDim}`);
    sse.sendProgress({ step: "Finalizing", detail: "Dimension mismatch", progress: 95 });
    sse.sendDone({ items, sessions, categories: {}, authorMap, warnings });
    return;
  }

  // Step 5: Classify articles
  sse.sendProgress({ step: "Classifying articles", detail: `${cappedItems.length} articles × ${categoryNames.length} categories…`, progress: 90 });

  for (let i = 0; i < cappedItems.length; i++) {
    let bestCat = categoryNames[0];
    let bestScore = -1;

    for (let j = 0; j < categoryEmbeddings.length; j++) {
      const score = cosineSimilarity(articleEmbeddings[i], categoryEmbeddings[j]);
      if (score > bestScore) {
        bestScore = score;
        bestCat = categoryNames[j];
      }
    }

    categories[cappedItems[i].id] = bestCat;
  }

  // Step 6: Finalize
  sse.sendProgress({ step: "Finalizing", detail: "Assembling response…", progress: 95 });

  const totalElapsed = Date.now() - start;
  log(`[api/matter/stream] Dashboard complete in ${totalElapsed}ms — ${Object.keys(categories).length} categorized, ${Object.keys(authorMap).length} author mappings`);

  // Done
  sse.sendDone({ items, sessions, categories, authorMap, warnings });
}
