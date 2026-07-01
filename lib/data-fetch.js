/**
 * Shared data-fetching helper for _data files.
 *
 * Wraps @11ty/eleventy-fetch with two protections:
 *   1. Hard timeout — 10-second AbortController ceiling on every request
 *   2. Watch-mode cache extension — uses "4h" TTL during watch/serve,
 *      keeping the original (shorter) TTL only for production builds
 *
 * Usage:
 *   import { cachedFetch } from "../lib/data-fetch.js";
 *   const data = await cachedFetch(url, { duration: "15m", type: "json" });
 */

import EleventyFetch from "@11ty/eleventy-fetch";

export const FETCH_TIMEOUT_MS = 10_000; // 10 seconds

// In watch/serve mode, extend cache to avoid re-fetching on every rebuild.
// Production builds use the caller's original TTL for fresh data.
const WATCH_MODE_DURATION = "4h";
const DEFAULT_DURATION = "15m";

/** True when Eleventy is serving/watching rather than doing a production build. */
export const isWatchMode = () => process.env.ELEVENTY_RUN_MODE !== "build";

/**
 * Decide the cache TTL. Watch/serve mode always extends to 4h so incremental
 * rebuilds don't re-hit the network; production builds honour the caller's
 * TTL (default 15m) for fresh data.
 *
 * @param {{ duration?: string }} [options]
 * @param {boolean} [watchMode] - defaults to the live run mode
 * @returns {string} EleventyFetch duration string
 */
export function resolveDuration(options = {}, watchMode = isWatchMode()) {
  return watchMode ? WATCH_MODE_DURATION : (options?.duration || DEFAULT_DURATION);
}

/**
 * Fetch with timeout and watch-mode cache extension.
 *
 * @param {string} url - URL to fetch
 * @param {object} [options] - EleventyFetch options (duration, type, fetchOptions, etc.)
 * @param {{ fetcher?: Function }} [deps] - injectable fetcher (defaults to EleventyFetch; used by tests)
 * @returns {Promise<any>} Parsed response
 */
export async function cachedFetch(url, options = {}, { fetcher = EleventyFetch } = {}) {
  const duration = resolveDuration(options);

  // Create abort controller for hard timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const fetchOptions = {
      ...options.fetchOptions,
      signal: controller.signal,
    };

    return await fetcher(url, {
      ...options,
      duration,
      fetchOptions,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
