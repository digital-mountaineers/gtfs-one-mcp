/**
 * Configuration loader for the GTFS Pro MCP server.
 *
 * Resolution order (later wins where they overlap):
 *   1. A JSON config file — path from `--config <path>`, else $GTFS_PRO_CONFIG,
 *      else ./gtfs-pro.config.json if it exists.
 *   2. Environment variables (GTFS_PRO_URL, GTFS_PRO_FEED_ID, ...).
 *
 * Only `gtfs_pro_url` is strictly required. Everything else has a sane default
 * so a single-agency setup can run with just the URL.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export interface Config {
  /** Base URL of the WordPress site running WP GTFS Pro (no trailing slash). */
  gtfsProUrl: string;
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
  gtfs_pro_url?: string;
  feed_id?: string;
  cache_ttl_seconds?: number;
  agency_name?: string;
  agency_description?: string;
}

function readConfigFile(): RawConfigFile {
  // --config <path> takes precedence, then $GTFS_PRO_CONFIG, then a local default.
  const argIdx = process.argv.indexOf("--config");
  const fromArg =
    argIdx !== -1 && process.argv[argIdx + 1] ? process.argv[argIdx + 1] : undefined;
  const candidate =
    fromArg ||
    process.env.GTFS_PRO_CONFIG ||
    (existsSync("gtfs-pro.config.json") ? "gtfs-pro.config.json" : undefined);

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

  const gtfsProUrl = (process.env.GTFS_PRO_URL || file.gtfs_pro_url || "").trim();
  if (!gtfsProUrl) {
    throw new Error(
      "Missing GTFS Pro site URL. Set `gtfs_pro_url` in your config file or the " +
        "GTFS_PRO_URL environment variable (e.g. https://your-agency-site.org)."
    );
  }

  const ttlRaw = process.env.GTFS_PRO_CACHE_TTL ?? file.cache_ttl_seconds;
  const cacheTtlSeconds = Number.isFinite(Number(ttlRaw)) ? Number(ttlRaw) : 30;

  return {
    // Strip any trailing slash so we can concatenate the REST namespace cleanly.
    gtfsProUrl: gtfsProUrl.replace(/\/+$/, ""),
    feedId: (process.env.GTFS_PRO_FEED_ID || file.feed_id || "default").trim(),
    cacheTtlSeconds: cacheTtlSeconds >= 0 ? cacheTtlSeconds : 30,
    agencyName: (
      process.env.GTFS_PRO_AGENCY_NAME ||
      file.agency_name ||
      "this transit agency"
    ).trim(),
    agencyDescription: (
      process.env.GTFS_PRO_AGENCY_DESCRIPTION ||
      file.agency_description ||
      ""
    ).trim(),
  };
}
