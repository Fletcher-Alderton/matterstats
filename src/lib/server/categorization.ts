import { fetchWithTimeout, readErrorBody } from "@/lib/server/http";
import { log, warn, error, logUpstreamError } from "@/lib/server/log";

export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const EMBED_MODEL =
  process.env.EMBED_MODEL ?? "perplexity/pplx-embed-v1-0.6b";
const EMBED_URL =
  process.env.EMBED_URL ?? "https://openrouter.ai/api/v1/embeddings";
const CHAT_MODEL = process.env.CHAT_MODEL ?? "meta-llama/llama-4-scout";
const CHAT_URL =
  process.env.CHAT_URL ?? "https://openrouter.ai/api/v1/chat/completions";

const CHAT_FALLBACK_MODELS = (process.env.CHAT_FALLBACK_MODELS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const EMBED_FALLBACK_MODELS = (process.env.EMBED_FALLBACK_MODELS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const CHAT_MODEL_PROVIDER = process.env.CHAT_MODEL_PROVIDER ?? "";
const EMBED_MODEL_PROVIDER = process.env.EMBED_MODEL_PROVIDER ?? "";

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 2000;
const CHAT_TIMEOUT_MS = 15_000;
const EMBED_TIMEOUT_MS = 20_000;

const DISCOVERY_SAMPLE_SIZE = 100;
export const BATCH_SIZE = 50;

export const MAX_ITEMS = 2000;
const MAX_AUTHORS = 200;
export const MAX_TITLE_CHARS = 200;
export const MAX_EXCERPT_CHARS = 400;
const MAX_CATEGORY_KEY_CHARS = 60;
const MAX_CATEGORY_DESC_CHARS = 200;
export const MIN_CATEGORIES = 6;
export const ARTICLES_PER_CATEGORY = 25;

// ---------------------------------------------------------------------------
// JSON extraction
// ---------------------------------------------------------------------------

function extractJsonObject(
  text: string
): Record<string, string> {
  // Strip <think>...</think> blocks (DeepSeek, Qwen reasoning artifacts)
  text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // Try raw JSON.parse first
  try {
    const parsed = JSON.parse(text);
    if (isStringRecord(parsed)) return parsed;
    const coerced = coerceToStringRecord(parsed);
    if (coerced) return coerced;
  } catch {
    // fall through
  }

  // Try extracting from markdown fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1]);
      if (isStringRecord(parsed)) return parsed;
      const coerced = coerceToStringRecord(parsed);
      if (coerced) return coerced;
    } catch {
      // fall through
    }
  }

  // Fall back to first { ... last }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
      if (isStringRecord(parsed)) return parsed;
      const coerced = coerceToStringRecord(parsed);
      if (coerced) return coerced;
    } catch {
      // fall through
    }
  }

  // Try repairing truncated JSON (close unclosed strings and braces)
  if (firstBrace !== -1) {
    const repaired = repairTruncatedJson(text.slice(firstBrace));
    if (repaired) return repaired;
  }

  return {};
}

function isStringRecord(
  value: unknown
): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  for (const v of Object.values(value)) {
    if (typeof v !== "string") return false;
  }
  return true;
}

/** Attempt to repair truncated JSON by finding the last complete key-value pair. */
function repairTruncatedJson(text: string): Record<string, string> | null {
  // Find the last complete "key": "value" pair by looking for the last `",` or `"\n`
  // that ends a complete value, then close the object there.
  const lastCompleteEntry = text.lastIndexOf('",');
  if (lastCompleteEntry === -1) {
    // Try last `"` followed by whitespace/newline before truncation
    const lastQuote = text.lastIndexOf('"');
    if (lastQuote > 0) {
      const attempt = text.slice(0, lastQuote + 1) + "}";
      try {
        const parsed = JSON.parse(attempt);
        const coerced = coerceToStringRecord(parsed);
        if (coerced && Object.keys(coerced).length > 0) {
          log(`[categorize:json] Repaired truncated JSON (${Object.keys(coerced).length} entries)`);
          return coerced;
        }
      } catch { /* fall through */ }
    }
    return null;
  }

  const attempt = text.slice(0, lastCompleteEntry + 1) + "}";
  try {
    const parsed = JSON.parse(attempt);
    const coerced = coerceToStringRecord(parsed);
    if (coerced && Object.keys(coerced).length > 0) {
      log(`[categorize:json] Repaired truncated JSON (${Object.keys(coerced).length} entries)`);
      return coerced;
    }
  } catch { /* fall through */ }

  return null;
}

/** Coerce a parsed object into Record<string, string> by flattening values. */
function coerceToStringRecord(
  value: unknown
): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") {
      result[k] = v;
    } else if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      result[k] = v.join(", ");
    } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      // Handle nested objects like {"Tech": {"keywords": [...], "description": "..."}}
      const flat = flattenObjectToString(v as Record<string, unknown>);
      if (flat) result[k] = flat;
    } else if (typeof v === "number") {
      // Skip numeric values (e.g. counts) — don't fail the whole parse
      continue;
    } else {
      continue;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** Flatten an object's string/array values into a single comma-separated string. */
function flattenObjectToString(obj: Record<string, unknown>): string | null {
  const parts: string[] = [];
  for (const v of Object.values(obj)) {
    if (typeof v === "string") {
      parts.push(v);
    } else if (Array.isArray(v)) {
      parts.push(...v.filter((x): x is string => typeof x === "string"));
    }
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

// ---------------------------------------------------------------------------
// OpenRouter helpers
// ---------------------------------------------------------------------------

async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
  label: string,
  signal?: AbortSignal,
  maxTokens: number = 8192
): Promise<string> {
  const allModels = [CHAT_MODEL, ...CHAT_FALLBACK_MODELS];
  log(`[categorize:chat] ${label} — sending request to ${CHAT_MODEL} (fallbacks: ${CHAT_FALLBACK_MODELS.join(", ") || "none"})`);
  const start = Date.now();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetchWithTimeout(
      CHAT_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          models: allModels,
          temperature: 0,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          reasoning: { enabled: false },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          ...(CHAT_MODEL_PROVIDER && { provider: { order: [CHAT_MODEL_PROVIDER] } }),
        }),
      },
      CHAT_TIMEOUT_MS,
      signal
    );

    const elapsed = Date.now() - start;

    if (res.status === 429 && attempt < MAX_RETRIES - 1) {
      const wait = RETRY_BACKOFF_MS * (attempt + 1);
      warn(`[categorize:chat] ${label} — rate limited (429), retrying in ${wait}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    if (!res.ok) {
      const body = await readErrorBody(res);
      logUpstreamError(`[categorize:chat] ${label}`, res.status, body, elapsed);
      throw new Error(`Chat API error ${res.status}`);
    }

    const data = await res.json();
    const usedModel = data.model ?? CHAT_MODEL;
    if (usedModel !== CHAT_MODEL) {
      log(`[categorize:chat] ${label} — used fallback model: ${usedModel}`);
    }
    const message = data.choices?.[0]?.message;
    let content = (message?.content as string) ?? "";

    // Some models (e.g. Qwen3) put output in reasoning instead of content
    if (!content && message?.reasoning) {
      log(`[categorize:chat] ${label} — content empty, extracting from reasoning field`);
      content = message.reasoning as string;
    }

    // Strip <think>...</think> blocks (DeepSeek, Qwen reasoning artifacts)
    content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    log(`[categorize:chat] ${label} — OK in ${elapsed}ms, response length: ${content.length} chars`);
    return content;
  }
  throw new Error("Chat API: max retries exceeded");
}

export async function getEmbeddings(texts: string[], label: string, signal?: AbortSignal): Promise<number[][]> {
  log(`[categorize:embed] ${label} — requesting ${texts.length} embeddings from ${EMBED_MODEL} (fallbacks: ${EMBED_FALLBACK_MODELS.join(", ") || "none"})`);
  const start = Date.now();

  const allModels = [EMBED_MODEL, ...EMBED_FALLBACK_MODELS];

  const res = await fetchWithTimeout(
    EMBED_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        models: allModels,
        input: texts,
        ...(EMBED_MODEL_PROVIDER && { provider: { order: [EMBED_MODEL_PROVIDER] } }),
      }),
    },
    EMBED_TIMEOUT_MS,
    signal
  );

  const elapsed = Date.now() - start;

  if (!res.ok) {
    const body = await readErrorBody(res);
    logUpstreamError(`[categorize:embed] ${label}`, res.status, body, elapsed);
    throw new Error(`Embedding error ${res.status}`);
  }

  const data = await res.json();
  const usedModel = data.model ?? EMBED_MODEL;
  if (usedModel !== EMBED_MODEL) {
    log(`[categorize:embed] ${label} — used fallback model: ${usedModel}`);
  }
  if (!Array.isArray(data.data) || data.data.length !== texts.length) {
    const got = data.data?.length ?? 0;
    error(`[categorize:embed] ${label} — dimension mismatch: expected ${texts.length}, got ${got}`);
    throw new Error(`Expected ${texts.length} embeddings, got ${got}`);
  }

  const embeddings = data.data.map((d: { embedding: number[] }) => d.embedding);
  const dim = embeddings[0]?.length ?? 0;
  log(`[categorize:embed] ${label} — OK in ${elapsed}ms, ${embeddings.length} embeddings × ${dim} dims`);
  return embeddings;
}

// ---------------------------------------------------------------------------
// Categorization primitives
// ---------------------------------------------------------------------------

export async function dedupeAuthors(
  authors: string[],
  signal?: AbortSignal
): Promise<Record<string, string>> {
  const capped = authors.slice(0, MAX_AUTHORS);
  log(`[categorize:dedup] Starting author dedup for ${capped.length} authors${authors.length > MAX_AUTHORS ? ` (capped from ${authors.length})` : ""}`);

  const content = await chatCompletion(
    'You deduplicate author names. Given a list of author names, identify duplicates (e.g. "David Pierce" and "David Pierce from Installer" are the same person, "John Smith" and "john smith" are the same). Return a JSON object mapping ONLY the duplicate/variant names to their canonical (shortest, cleanest) form. Omit names that have no duplicates. Respond with ONLY valid JSON.',
    `Deduplicate these author names:\n\n${capped.join("\n")}`,
    "author-dedup",
    signal,
    2048
  );

  const parsed = extractJsonObject(content);
  const authorSet = new Set(capped);
  const result: Record<string, string> = {};
  for (const [input, canonical] of Object.entries(parsed)) {
    if (
      typeof canonical === "string" &&
      canonical.trim() &&
      canonical !== input &&
      authorSet.has(input) &&
      canonical.length <= 100
    ) {
      result[input] = canonical;
    }
  }

  log(`[categorize:dedup] Found ${Object.keys(result).length} duplicate mappings`);
  return result;
}

export async function discoverCategories(
  titles: string[],
  maxCategories: number,
  signal?: AbortSignal
): Promise<Record<string, string>> {
  const trimmedTitles = titles.map((t) => t.slice(0, MAX_TITLE_CHARS));
  const sampled =
    trimmedTitles.length <= DISCOVERY_SAMPLE_SIZE
      ? trimmedTitles
      : Array.from({ length: DISCOVERY_SAMPLE_SIZE }, (_, i) =>
          trimmedTitles[Math.floor((i * trimmedTitles.length) / DISCOVERY_SAMPLE_SIZE)]
        );

  log(`[categorize:discover] Discovering up to ${maxCategories} categories from ${sampled.length} sampled titles (${titles.length} total)`);

  const content = await chatCompletion(
    `You analyze article titles and propose thematic categories. Return a JSON object with ${MIN_CATEGORIES}-${maxCategories} categories. Each key is a short category name (no emoji), each value is a brief comma-separated list of keywords (max 10 keywords per category). Keep your response compact. Example: {"Tech & AI": "software, programming, AI, machine learning, cloud"}. Respond with ONLY valid JSON.`,
    `Analyze these article titles and propose ${MIN_CATEGORIES}-${maxCategories} thematic categories:\n\n${sampled.join("\n")}`,
    "category-discovery",
    signal,
    4096
  );

  const parsed = extractJsonObject(content);

  if (Object.keys(parsed).length === 0) {
    error(`[categorize:discover] Failed to parse response (${content.length} chars). First 500 chars: ${content.slice(0, 500)}`);
  } else {
    log(`[categorize:discover] Parsed ${Object.keys(parsed).length} entries from response`);
  }

  const categories: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (Object.keys(categories).length >= maxCategories) break;
    const key = k.trim().slice(0, MAX_CATEGORY_KEY_CHARS);
    const desc = typeof v === "string" ? v.trim().slice(0, MAX_CATEGORY_DESC_CHARS) : "";
    if (key && desc) {
      categories[key] = desc;
    }
  }

  if (Object.keys(categories).length < 2) {
    error(`[categorize:discover] Too few categories returned: ${Object.keys(categories).length}. Parsed keys: [${Object.keys(parsed).join(", ")}]`);
    throw new Error("Too few valid categories returned");
  }

  log(`[categorize:discover] Discovered ${Object.keys(categories).length} categories: ${Object.keys(categories).join(", ")}`);
  return categories;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;

  return dot / denom;
}

