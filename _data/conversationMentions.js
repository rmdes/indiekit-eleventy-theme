import { dataLog } from "../lib/log.js";
import { cachedFetch } from "../lib/data-fetch.js";

const INDIEKIT_URL = process.env.INDIEKIT_URL || process.env.SITE_URL || "";

export default async function () {
  if (!INDIEKIT_URL) {
    dataLog("[conversationMentions] SITE_URL/INDIEKIT_URL unset — skipping");
    return [];
  }
  try {
    const data = await cachedFetch(
      `${INDIEKIT_URL}/conversations/api/mentions?per-page=500`,
      { duration: "15m", type: "json" }
    );
    return data.children || [];
  } catch (e) {
    dataLog(`[conversationMentions] API unavailable: ${e.message}`);
    return [];
  }
}
