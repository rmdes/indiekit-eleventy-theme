/**
 * Blogroll Status Data
 * Checks if the blogroll API backend is available at build time.
 * Used for conditional navigation — the blogroll page itself loads data client-side.
 */
import { dataLog } from "../lib/log.js";

import { cachedFetch } from "../lib/data-fetch.js";

const INDIEKIT_URL = process.env.SITE_URL || "https://example.com";

export default async function () {
  try {
    const url = `${INDIEKIT_URL}/blogrollapi/api/status`;
    dataLog(`[blogrollStatus] Checking API: ${url}`);
    const data = await cachedFetch(url, {
      duration: "15m",
      type: "json",
    });
    dataLog("[blogrollStatus] API available");
    return {
      available: true,
      source: "indiekit",
      ...data,
    };
  } catch (error) {
    dataLog(
      `[blogrollStatus] API unavailable: ${error.message}`
    );
    return {
      available: false,
      source: "unavailable",
    };
  }
}
