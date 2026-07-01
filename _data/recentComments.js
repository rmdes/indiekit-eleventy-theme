/**
 * Recent Comments Data
 * Fetches the 5 most recent comments at build time for the sidebar widget.
 */
import { dataLog } from "../lib/log.js";

import { cachedFetch } from "../lib/data-fetch.js";

const INDIEKIT_URL = process.env.SITE_URL || "https://example.com";

export default async function () {
  try {
    const url = `${INDIEKIT_URL}/comments/api/comments?limit=5`;
    dataLog(`[recentComments] Fetching: ${url}`);
    const data = await cachedFetch(url, {
      duration: "15m",
      type: "json",
    });
    dataLog(`[recentComments] Got ${(data.children || []).length} comments`);
    return data.children || [];
  } catch (error) {
    dataLog(`[recentComments] Unavailable: ${error.message}`);
    return [];
  }
}
