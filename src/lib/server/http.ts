import { warn } from "@/lib/server/log";

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const timeout = setTimeout(() => {
    warn(`[http] Request timed out after ${timeoutMs}ms: ${url}`);
    controller.abort();
  }, timeoutMs);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

export async function readErrorBody(
  response: Response
): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const json = await response.json();
      return JSON.stringify(json);
    }
    return await response.text();
  } catch {
    return `HTTP ${response.status}`;
  }
}
