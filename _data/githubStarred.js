/**
 * GitHub Starred Repos Metadata
 * Fetches the starred API response (cached 15min) to extract totalCount.
 * Only totalCount is passed to Eleventy's data cascade — the full star
 * list is discarded after parsing, keeping build memory low.
 * The starred page fetches all data client-side via Alpine.js.
 */
import { dataLog } from "../lib/log.js";

import { cachedFetch } from "../lib/data-fetch.js";

const INDIEKIT_URL = process.env.SITE_URL || "https://example.com";

export default async function () {
  try {
    const url = `${INDIEKIT_URL}/githubapi/api/starred/all`;
    const response = await cachedFetch(url, {
      duration: "15m",
      type: "json",
    });

    return {
      totalCount: response.totalCount || 0,
      buildDate: new Date().toISOString(),
    };
  } catch (error) {
    dataLog(`[githubStarred] Could not fetch starred count: ${error.message}`);
    return {
      totalCount: 0,
      buildDate: new Date().toISOString(),
    };
  }
}
