/**
 * Funkwhale Activity Data
 * Fetches from Indiekit's endpoint-funkwhale public API
 */
import { dataLog } from "../lib/log.js";

import { cachedFetch } from "../lib/data-fetch.js";

const INDIEKIT_URL = process.env.SITE_URL || "https://example.com";
const FUNKWHALE_INSTANCE = process.env.FUNKWHALE_INSTANCE || "";

/**
 * Fetch from Indiekit's public Funkwhale API endpoint
 */
async function fetchFromIndiekit(endpoint) {
  try {
    const url = `${INDIEKIT_URL}/funkwhaleapi/api/${endpoint}`;
    dataLog(`[funkwhaleActivity] Fetching from Indiekit: ${url}`);
    const data = await cachedFetch(url, {
      duration: "15m",
      type: "json",
    });
    dataLog(`[funkwhaleActivity] Indiekit ${endpoint} success`);
    return data;
  } catch (error) {
    dataLog(
      `[funkwhaleActivity] Indiekit API unavailable for ${endpoint}: ${error.message}`
    );
    return null;
  }
}

/**
 * Format duration in seconds to human-readable string
 */
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return "0:00";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

export default async function () {
  try {
    dataLog("[funkwhaleActivity] Fetching Funkwhale data...");

    // Fetch all data from Indiekit API
    const [nowPlaying, listenings, favorites, stats] = await Promise.all([
      fetchFromIndiekit("now-playing"),
      fetchFromIndiekit("listenings"),
      fetchFromIndiekit("favorites"),
      fetchFromIndiekit("stats"),
    ]);

    // Check if we got data
    const hasData = nowPlaying || listenings?.listenings?.length || stats?.summary;

    if (!hasData) {
      dataLog("[funkwhaleActivity] No data available from Indiekit");
      return {
        nowPlaying: null,
        listenings: [],
        favorites: [],
        stats: null,
        instanceUrl: FUNKWHALE_INSTANCE,
        source: "unavailable",
      };
    }

    dataLog("[funkwhaleActivity] Using Indiekit API data");

    // Format stats with human-readable durations
    let formattedStats = null;
    if (stats?.summary) {
      formattedStats = {
        ...stats,
        summary: {
          all: {
            ...stats.summary.all,
            totalDurationFormatted: formatDuration(stats.summary.all?.totalDuration || 0),
          },
          month: {
            ...stats.summary.month,
            totalDurationFormatted: formatDuration(stats.summary.month?.totalDuration || 0),
          },
          week: {
            ...stats.summary.week,
            totalDurationFormatted: formatDuration(stats.summary.week?.totalDuration || 0),
          },
        },
      };
    }

    return {
      nowPlaying: nowPlaying || null,
      listenings: listenings?.listenings || [],
      favorites: favorites?.favorites || [],
      stats: formattedStats,
      instanceUrl: FUNKWHALE_INSTANCE,
      source: "indiekit",
    };
  } catch (error) {
    console.error("[funkwhaleActivity] Error:", error.message);
    return {
      nowPlaying: null,
      listenings: [],
      favorites: [],
      stats: null,
      instanceUrl: FUNKWHALE_INSTANCE,
      source: "error",
    };
  }
}
