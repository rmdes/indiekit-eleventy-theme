/**
 * News/RSS Activity Data
 * Fetches from Indiekit's endpoint-rss public API
 */
import { dataLog } from "../lib/log.js";

import { cachedFetch } from "../lib/data-fetch.js";

const INDIEKIT_URL = process.env.SITE_URL || "https://example.com";

/**
 * Fetch from Indiekit's public RSS API endpoint
 */
async function fetchFromIndiekit(endpoint) {
  try {
    const url = `${INDIEKIT_URL}/rssapi/api/${endpoint}`;
    dataLog(`[newsActivity] Fetching from Indiekit: ${url}`);
    const data = await cachedFetch(url, {
      duration: "15m",
      type: "json",
    });
    dataLog(`[newsActivity] Indiekit ${endpoint} success`);
    return data;
  } catch (error) {
    dataLog(
      `[newsActivity] Indiekit API unavailable for ${endpoint}: ${error.message}`
    );
    return null;
  }
}

export default async function () {
  try {
    dataLog("[newsActivity] Fetching RSS feed data...");

    // Fetch all data from Indiekit API
    const [itemsRes, feedsRes, statusRes] = await Promise.all([
      fetchFromIndiekit("items?limit=50"),
      fetchFromIndiekit("feeds"),
      fetchFromIndiekit("status"),
    ]);

    // Check if we got data
    const hasData = itemsRes?.items?.length || feedsRes?.feeds?.length;

    if (!hasData) {
      dataLog("[newsActivity] No data available from Indiekit");
      return {
        items: [],
        feeds: [],
        status: null,
        lastUpdated: null,
        source: "unavailable",
      };
    }

    dataLog(
      `[newsActivity] Got ${itemsRes?.items?.length || 0} items from ${feedsRes?.feeds?.length || 0} feeds`
    );

    // Create a map of feed IDs to feed info for quick lookup
    const feedMap = new Map();
    for (const feed of feedsRes?.feeds || []) {
      feedMap.set(feed.id, feed);
    }

    // Enhance items with additional feed info
    const items = (itemsRes?.items || []).map((item) => {
      const feed = feedMap.get(item.feedId);
      return {
        ...item,
        feedInfo: feed
          ? {
              title: feed.title,
              siteUrl: feed.siteUrl,
              imageUrl: feed.imageUrl,
            }
          : null,
      };
    });

    return {
      items,
      feeds: feedsRes?.feeds || [],
      pagination: itemsRes?.pagination || null,
      status: statusRes || null,
      lastUpdated: statusRes?.lastSync || new Date().toISOString(),
      source: "indiekit",
    };
  } catch (error) {
    console.error("[newsActivity] Error:", error.message);
    return {
      items: [],
      feeds: [],
      status: null,
      lastUpdated: null,
      source: "error",
    };
  }
}
