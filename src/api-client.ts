/**
 * Thin HTTP client for the WP GTFS Pro REST API.
 *
 * Responsibilities:
 *  - Build namespaced URLs and inject the default feed_id.
 *  - Cache GET responses in-process for `cacheTtlSeconds` (spec §1.9: keep it to
 *    ~1 call per 30s per unique query so we never hammer the agency's WP site).
 *  - Turn failures into human-readable messages (spec §1.6) rather than leaking
 *    raw JSON or stack traces to the AI.
 */

import type { Config } from "./config.js";

/** A failure we want the AI to read as prose (not a thrown stack trace). */
export class GtfsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GtfsApiError";
  }
}

interface CacheEntry {
  expires: number;
  data: unknown;
}

export class ApiClient {
  private readonly base: string;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly config: Config) {
    this.base = `${config.gtfsProUrl}/wp-json/wp-gtfs-pro/v1`;
  }

  /** The configured default feed, used when a tool call omits feed_id. */
  get defaultFeedId(): string {
    return this.config.feedId;
  }

  /**
   * GET a REST path with query params. Empty/undefined params are dropped.
   * Results are cached by full URL for the configured TTL.
   */
  async get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(this.base + path);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    const href = url.toString();

    const now = Date.now();
    const hit = this.cache.get(href);
    if (hit && hit.expires > now) {
      return hit.data as T;
    }

    let res: Response;
    try {
      res = await fetch(href, {
        headers: { Accept: "application/json", "User-Agent": "gtfs-pro-mcp" },
      });
    } catch {
      // Network-level failure: the WP site is unreachable. Spec §1.6 exact intent.
      throw new GtfsApiError(
        `The transit data service at ${this.config.gtfsProUrl} is currently ` +
          `unavailable. The rider should check the agency website directly.`
      );
    }

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      throw new GtfsApiError(this.describeError(res.status, parsed));
    }

    const ttlMs = this.config.cacheTtlSeconds * 1000;
    if (ttlMs > 0) {
      this.cache.set(href, { expires: now + ttlMs, data: parsed });
    }
    return parsed as T;
  }

  /**
   * Convert a non-2xx response into a readable sentence. WordPress REST errors
   * carry `{ code, message }`; surface the message when present.
   */
  private describeError(status: number, body: unknown): string {
    const wpMessage =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : "";

    if (status === 404) {
      return wpMessage
        ? `Not found: ${wpMessage}`
        : "That transit record was not found. Double-check the stop or route id.";
    }
    if (status === 400) {
      return wpMessage
        ? `Invalid request: ${wpMessage}`
        : "The request was invalid. Check the parameters and try again.";
    }
    if (wpMessage) {
      return `The transit data service returned an error (${status}): ${wpMessage}`;
    }
    return `The transit data service returned an unexpected error (HTTP ${status}).`;
  }
}
