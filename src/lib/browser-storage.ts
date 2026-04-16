const TOKEN_KEY = "matterstats_token";
const REMEMBER_KEY = "matterstats_remember";
const CACHE_PREFIX = "matterstats:v2:cache:";
const LEGACY_CACHE_KEY = "matterstats_cache";
const LEGACY_TOKEN_KEY = "matterstats_token";

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

function getStorage(remember: boolean): Storage {
  return remember ? localStorage : sessionStorage;
}

export function readSavedToken(): { token: string; remember: boolean } | null {
  try {
    // Check sessionStorage first (most recent session)
    const sessionToken = sessionStorage.getItem(TOKEN_KEY);
    if (sessionToken) return { token: sessionToken, remember: false };

    // Then check localStorage (user opted to remember)
    const localToken = localStorage.getItem(TOKEN_KEY);
    const remembered = localStorage.getItem(REMEMBER_KEY) === "true";
    if (localToken && remembered) return { token: localToken, remember: true };

    return null;
  } catch {
    return null;
  }
}

export function saveToken(token: string, remember: boolean): void {
  try {
    // Always clear both to avoid stale data
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REMEMBER_KEY);

    const storage = getStorage(remember);
    storage.setItem(TOKEN_KEY, token);
    if (remember) {
      localStorage.setItem(REMEMBER_KEY, "true");
    }
  } catch {
    // ignore storage errors
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REMEMBER_KEY);
  } catch {
    // ignore storage errors
  }
}

function isValidCacheShape(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.total === "object" && d.total !== null &&
    typeof d.categories === "object" && d.categories !== null &&
    typeof d.progress === "object" && d.progress !== null &&
    typeof d.sources === "object" && d.sources !== null &&
    typeof d.authors === "object" && d.authors !== null &&
    Array.isArray(d.weekly) &&
    Array.isArray(d.items) &&
    Array.isArray(d.favorites)
  );
}

export async function readCache(token: string, remember: boolean): Promise<{ data: unknown; warnings?: string[]; timestamp: number } | null> {
  try {
    const hash = await hashToken(token);
    const key = CACHE_PREFIX + hash;
    const storage = getStorage(remember);
    const cached = storage.getItem(key);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (!parsed || typeof parsed.timestamp !== "number" || !isValidCacheShape(parsed.data)) {
      storage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCache(token: string, remember: boolean, data: unknown, warnings?: string[]): Promise<void> {
  try {
    const hash = await hashToken(token);
    const key = CACHE_PREFIX + hash;
    const storage = getStorage(remember);
    storage.setItem(key, JSON.stringify({ data, warnings, timestamp: Date.now() }));
  } catch {
    // ignore storage errors
  }
}

export async function clearCacheForToken(token: string): Promise<void> {
  try {
    const hash = await hashToken(token);
    const key = CACHE_PREFIX + hash;
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}

export function cleanupLegacyKeys(): void {
  // Remove old unscoped keys from both storages
  try {
    localStorage.removeItem(LEGACY_CACHE_KEY);
    sessionStorage.removeItem(LEGACY_CACHE_KEY);
    // Only remove legacy token if there's no remember flag (it's from old code)
    if (localStorage.getItem(REMEMBER_KEY) !== "true") {
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}
