/**
 * webmentions/core.js — pure logic + cache, extracted from js/webmentions.js.
 *
 * No DOM access here (except the sessionStorage cache, which degrades safely).
 * These functions are unit-tested in tests/webmentions-core.test.mjs.
 */

/**
 * Extract a platform-specific post id so the same post is matched regardless of
 * URL format (Bluesky DID-vs-handle, Mastodon status id). Returns null if the
 * URL isn't a recognised Bluesky/Mastodon post.
 */
export function extractPostId(url) {
  if (!url) return null;
  // Bluesky: bsky.app/profile/.../post/<rkey>
  const bskyMatch = url.match(/bsky\.app\/profile\/[^/]+\/post\/([a-z0-9]+)/i);
  if (bskyMatch) return 'bsky:' + bskyMatch[1];
  // Mastodon: instance/@user/<digits>
  const mastoMatch = url.match(/\/@[^/]+\/(\d+)/);
  if (mastoMatch) return 'masto:' + mastoMatch[1];
  return null;
}

/** Resolve a mention's display platform (conversations NodeInfo field, else URL heuristics). */
export function detectPlatform(item) {
  // Conversations API provides a resolved platform field via NodeInfo
  if (item.platform) {
    const p = item.platform.toLowerCase();
    if (p === 'mastodon') return 'mastodon';
    if (p === 'bluesky') return 'bluesky';
    if (p === 'webmention') return 'webmention';
    // All other fediverse software (pleroma, misskey, gotosocial, fedify, etc.)
    return 'activitypub';
  }

  // Fallback: URL heuristics for webmention.io data and build-time cards
  const source = item['wm-source'] || '';
  const authorUrl = (item.author && item.author.url) || '';
  if (source.includes('brid.gy/') && source.includes('/mastodon/')) return 'mastodon';
  if (source.includes('brid.gy/') && source.includes('/bluesky/')) return 'bluesky';
  if (source.includes('fed.brid.gy')) return 'activitypub';
  if (authorUrl.includes('bsky.app')) return 'bluesky';
  return 'webmention';
}

/** Format an ISO date string as "Mon D, YYYY" (en-US). Empty string for falsy input. */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Merge conversations-API items (rich provenance, take priority) with
 * webmention.io items, deduplicating across sources. webmention.io items are
 * dropped when they duplicate a conversations item by wm-id, source URL,
 * author+action, or when they are a syndicated echo of one of the owner's own
 * replies (matched by platform post-id so Bluesky DID/handle variants collapse).
 *
 * @returns {Array} merged children, conversations items first
 */
export function mergeMentions(convItems, wmItems) {
  // Collect post ids + syndication URLs of the owner's own replies
  const ownerReplyPostIds = new Set();
  const ownerReplySyndicationUrls = new Set();
  for (const c of convItems) {
    if (c.is_owner && c.syndication) {
      const syns = Array.isArray(c.syndication) ? c.syndication : [c.syndication];
      for (const syn of syns) {
        if (syn) {
          ownerReplySyndicationUrls.add(syn.replace(/\/$/, '').toLowerCase());
          const pid = extractPostId(syn);
          if (pid) ownerReplyPostIds.add(pid);
        }
      }
    }
  }

  const convUrls = new Set(convItems.map((c) => c.url).filter(Boolean));
  const seen = new Set();
  const allChildren = [];

  // Conversations items first (they carry platform provenance)
  for (const wm of convItems) {
    const key = wm['wm-id'] || wm.url;
    if (key && !seen.has(key)) {
      seen.add(key);
      allChildren.push(wm);
    }
  }

  // author+action keys from conversations, for cross-source dedup
  const authorActions = new Set();
  for (const wm of convItems) {
    const authorUrl = (wm.author && wm.author.url) || wm.url || '';
    const action = wm['wm-property'] || 'mention';
    if (authorUrl) authorActions.add(authorUrl + '::' + action);
  }

  // webmention.io items, skipping duplicates + owner-reply echoes
  for (const wm of wmItems) {
    const key = wm['wm-id'];
    if (seen.has(key)) continue;
    if (wm.url && convUrls.has(wm.url)) continue;
    const authorUrl = (wm.author && wm.author.url) || wm.url || '';
    const action = wm['wm-property'] || 'mention';
    if (authorUrl && authorActions.has(authorUrl + '::' + action)) continue;
    if (wm.url) {
      const wmLower = wm.url.replace(/\/$/, '').toLowerCase();
      if (ownerReplySyndicationUrls.has(wmLower)) continue;
      const wmPostId = extractPostId(wm.url);
      if (wmPostId && ownerReplyPostIds.has(wmPostId)) continue;
    }
    seen.add(key);
    allChildren.push(wm);
  }

  return allChildren;
}

/**
 * sessionStorage-backed cache with a TTL. Degrades to a no-op when storage is
 * unavailable. Kept here so the entry module stays declarative.
 */
export function createCache(cacheKey, ttlMs) {
  return {
    get() {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (!cached) return null;
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.ts > ttlMs) {
          sessionStorage.removeItem(cacheKey);
          return null;
        }
        return parsed.children;
      } catch {
        return null;
      }
    },
    set(children) {
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), children }));
      } catch {
        // sessionStorage full or unavailable - no problem
      }
    },
  };
}
