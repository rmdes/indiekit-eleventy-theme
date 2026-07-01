/**
 * Last.fm Activity Data
 * Fetches from Indiekit's endpoint-lastfm public API
 */
import { dataLog } from "../lib/log.js";

import { cachedFetch } from "../lib/data-fetch.js";

const INDIEKIT_URL = process.env.SITE_URL || "https://example.com";
const LASTFM_USERNAME = process.env.LASTFM_USERNAME || "";

/**
 * Fetch from Indiekit's public Last.fm API endpoint
 */
async function fetchFromIndiekit(endpoint) {
  try {
    const url = `${INDIEKIT_URL}/lastfmapi/api/${endpoint}`;
    dataLog(`[lastfmActivity] Fetching from Indiekit: ${url}`);
    const data = await cachedFetch(url, {
      duration: "15m",
      type: "json",
    });
    dataLog(`[lastfmActivity] Indiekit ${endpoint} success`);
    return data;
  } catch (error) {
    dataLog(
      `[lastfmActivity] Indiekit API unavailable for ${endpoint}: ${error.message}`
    );
    return null;
  }
}

export default async function () {
  try {
    dataLog("[lastfmActivity] Fetching Last.fm data...");

    // Fetch all data from Indiekit API
    const [nowPlaying, scrobbles, loved, stats] = await Promise.all([
      fetchFromIndiekit("now-playing"),
      fetchFromIndiekit("scrobbles"),
      fetchFromIndiekit("loved"),
      fetchFromIndiekit("stats"),
    ]);

    // Check if we got data
    const hasData = nowPlaying || scrobbles?.scrobbles?.length || stats?.summary;

    if (!hasData) {
      dataLog("[lastfmActivity] No data available from Indiekit");
      return {
        nowPlaying: null,
        scrobbles: [],
        loved: [],
        stats: null,
        username: LASTFM_USERNAME,
        profileUrl: LASTFM_USERNAME ? `https://www.last.fm/user/${LASTFM_USERNAME}` : null,
        source: "unavailable",
      };
    }

    dataLog("[lastfmActivity] Using Indiekit API data");

    return {
      nowPlaying: nowPlaying || null,
      scrobbles: scrobbles?.scrobbles || [],
      loved: loved?.loved || [],
      stats: stats || null,
      username: LASTFM_USERNAME,
      profileUrl: LASTFM_USERNAME ? `https://www.last.fm/user/${LASTFM_USERNAME}` : null,
      source: "indiekit",
    };
  } catch (error) {
    console.error("[lastfmActivity] Error:", error.message);
    return {
      nowPlaying: null,
      scrobbles: [],
      loved: [],
      stats: null,
      username: LASTFM_USERNAME,
      profileUrl: null,
      source: "error",
    };
  }
}
