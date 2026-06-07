/**
 * Configuration loader for the GTFS One MCP server.
 *
 * Resolution order (later wins where they overlap):
 *   1. A JSON config file — path from `--config <path>`, else $GTFS_ONE_CONFIG,
 *      else ./gtfs-one.config.json if it exists.
 *   2. Environment variables (GTFS_ONE_URL, GTFS_ONE_FEED_ID, ...).
 *
 * Only `gtfs_one_url` is strictly required. Everything else has a sane default
 * so a single-agency setup can run with just the URL.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export interface Config {
  /** Base URL of the WordPress site running GTFS One (no trailing slash). */
  gtfsOneUrl: string;
  /** Default feed to use when the AI doesn't specify one. */
  feedId: string;
  /** Local response cache lifetime, in seconds (protects the WP site). */
  cacheTtlSeconds: number;
  /** Human label for the agency this server covers (used in server metadata). */
  agencyName: string;
  /** Free-text description of the agency's service area (used in metadata). */
  agencyDescription: string;
}

interface RawConfigFile {
  gtfs_one_url?: string;
  feed_id?: string;
  cache_ttl_seconds?: number;
  agency_name?: string;
  agency_description?: string;
}

function readConfigFile(): RawConfigFile {
  // --config <path> takes precedence, then $GTFS_ONE_CONFIG, then a local default.
  const argIdx = process.argv.indexOf("--config");
  const fromArg =
    argIdx !== -1 && process.argv[argIdx + 1] ? process.argv[argIdx + 1] : undefined;
  const candidate =
    fromArg ||
    process.env.GTFS_ONE_CONFIG ||
    (existsSync("gtfs-one.config.json") ? "gtfs-one.config.json" : undefined);

  if (!candidate) return {};

  const path = resolve(candidate);
  if (!existsSync(path)) {
    throw new Error(`Config file not found: ${path}`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RawConfigFile;
  } catch (err) {
    throw new Error(
      `Could not parse config file ${path}: ${(err as Error).message}`
    );
  }
}

export function loadConfig(): Config {
  const file = readConfigFile();

  const gtfsOneUrl = (process.env.GTFS_ONE_URL || file.gtfs_one_url || "").trim();
  if (!gtfsOneUrl) {
    throw new Error(
      "Missing GTFS One site URL. Set `gtfs_one_url` in your config file or the " +
        "GTFS_ONE_URL environment variable (e.g. https://your-agency-site.org)."
    );
  }

  const ttlRaw = process.env.GTFS_ONE_CACHE_TTL ?? file.cache_ttl_seconds;
  const cacheTtlSeconds = Number.isFinite(Number(ttlRaw)) ? Number(ttlRaw) : 30;

  return {
    // Strip any trailing slash so we can concatenate the REST namespace cleanly.
    gtfsOneUrl: gtfsOneUrl.replace(/\/+$/, ""),
    feedId: (process.env.GTFS_ONE_FEED_ID || file.feed_id || "default").trim(),
    cacheTtlSeconds: cacheTtlSeconds >= 0 ? cacheTtlSeconds : 30,
    agencyName: (
      process.env.GTFS_ONE_AGENCY_NAME ||
      file.agency_name ||
      "this transit agency"
    ).trim(),
    agencyDescription: (
      process.env.GTFS_ONE_AGENCY_DESCRIPTION ||
      file.agency_description ||
      ""
    ).trim(),
  };
}
