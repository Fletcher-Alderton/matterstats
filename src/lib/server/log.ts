const isDev = process.env.NODE_ENV !== "production";

export const log = isDev
  ? (...args: unknown[]) => console.log(...args)
  : () => {};

export const warn = isDev
  ? (...args: unknown[]) => console.warn(...args)
  : () => {};

export const error = (...args: unknown[]) => console.error(...args);

/** Log an upstream error — includes full body in dev, omits it in prod to avoid leaking user data. */
export function logUpstreamError(tag: string, status: number, body: string, elapsedMs?: number): void {
  const timing = elapsedMs !== undefined ? ` in ${elapsedMs}ms` : "";
  if (isDev) {
    error(`${tag} — FAILED ${status}${timing}: ${body}`);
  } else {
    error(`${tag} — FAILED ${status}${timing}`);
  }
}
