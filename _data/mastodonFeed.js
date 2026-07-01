/**
 * Mastodon Feed Data
 * Fetches recent posts from Mastodon using the public API
 */
import { dataLog } from "../lib/log.js";

import { cachedFetch } from "../lib/data-fetch.js";

export default async function () {
  const instance = process.env.MASTODON_INSTANCE?.replace("https://", "") || "";
  const username = process.env.MASTODON_USER || "";

  try {
    // First, look up the account ID
    const lookupUrl = `https://${instance}/api/v1/accounts/lookup?acct=${username}`;

    const account = await cachedFetch(lookupUrl, {
      duration: "1h", // Cache account lookup for 1 hour
      type: "json",
      fetchOptions: {
        headers: {
          Accept: "application/json",
        },
      },
    });

    if (!account || !account.id) {
      dataLog("Mastodon account not found:", username);
      return [];
    }

    // Fetch recent statuses (excluding replies and boosts for cleaner feed)
    const statusesUrl = `https://${instance}/api/v1/accounts/${account.id}/statuses?limit=10&exclude_replies=true&exclude_reblogs=true`;

    const statuses = await cachedFetch(statusesUrl, {
      duration: "15m", // Cache for 15 minutes
      type: "json",
      fetchOptions: {
        headers: {
          Accept: "application/json",
        },
      },
    });

    if (!statuses || !Array.isArray(statuses)) {
      dataLog("No Mastodon statuses found for:", username);
      return [];
    }

    // Transform statuses into a simpler format
    return statuses.map((status) => ({
      id: status.id,
      url: status.url,
      text: stripHtml(status.content),
      htmlContent: status.content,
      createdAt: status.created_at,
      author: {
        username: status.account.username,
        displayName: status.account.display_name || status.account.username,
        avatar: status.account.avatar,
        url: status.account.url,
      },
      favouritesCount: status.favourites_count || 0,
      reblogsCount: status.reblogs_count || 0,
      repliesCount: status.replies_count || 0,
      // Media attachments
      media: status.media_attachments
        ? status.media_attachments.map((m) => ({
            type: m.type,
            url: m.url,
            previewUrl: m.preview_url,
            description: m.description,
          }))
        : [],
    }));
  } catch (error) {
    console.error("Error fetching Mastodon feed:", error.message);
    return [];
  }
}

// Simple HTML stripper for plain text display
function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
