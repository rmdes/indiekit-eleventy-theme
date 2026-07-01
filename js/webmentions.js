/**
 * Client-side webmention widget — entry/orchestration module.
 *
 * Supplements build-time cached webmentions with real-time data from the
 * webmention.io proxy and the conversations API. Split into modules:
 *   webmentions/core.js   — pure logic + cache (unit-tested)
 *   webmentions/render.js — DOM rendering
 *   webmentions/reply.js  — owner-only reply form + Micropub submit
 *
 * Loaded as <script type="module"> from base.njk.
 */
import { createCache, mergeMentions, detectPlatform } from "./webmentions/core.js";
import { processWebmentions, enrichBuildTimeBadges, createProvenanceBadge } from "./webmentions/render.js";
import { wireReplyButtons } from "./webmentions/reply.js";

const container = document.querySelector('[data-webmentions]');
if (container) {
  const target = container.dataset.target;
  const domain = container.dataset.domain;
  if (target && domain) {
    initWebmentions(target);
  }
}

function initWebmentions(target) {
  // Fetch both with and without trailing slash since webmention.io stores
  // targets inconsistently (Bridgy sends different formats).
  const targetWithSlash = target.endsWith('/') ? target : target + '/';
  const targetWithoutSlash = target.endsWith('/') ? target.slice(0, -1) : target;
  const apiUrl1 = `/webmentions/api/mentions?target=${encodeURIComponent(targetWithSlash)}&per-page=100`;
  const apiUrl2 = `/webmentions/api/mentions?target=${encodeURIComponent(targetWithoutSlash)}&per-page=100`;

  const hasBuildTimeSection = document.getElementById('webmentions') !== null;

  // Cache API responses in sessionStorage (5 min TTL) so webmentions persist
  // across page refreshes without re-fetching every time.
  const cache = createCache(`wm-data-${target}`, 5 * 60 * 1000);

  // Try cached data first (renders instantly on refresh)
  const cached = cache.get();
  if (cached) {
    processWebmentions(cached, hasBuildTimeSection);
    // Enrich build-time badges from cached conversations data
    enrichBuildTimeBadges(cached.filter(function (c) { return c.platform; }));
  }

  // Conversations API URLs (dual-fetch for enriched data)
  const convApiUrl1 = `/conversations/api/mentions?target=${encodeURIComponent(targetWithSlash)}&per-page=100`;
  const convApiUrl2 = `/conversations/api/mentions?target=${encodeURIComponent(targetWithoutSlash)}&per-page=100`;

  // Always fetch fresh data from both APIs (updates cache for next refresh)
  Promise.all([
    fetch(apiUrl1).then((res) => res.json()).catch(() => ({ children: [] })),
    fetch(apiUrl2).then((res) => res.json()).catch(() => ({ children: [] })),
    fetch(convApiUrl1).then((res) => res.ok ? res.json() : { children: [] }).catch(() => ({ children: [] })),
    fetch(convApiUrl2).then((res) => res.ok ? res.json() : { children: [] }).catch(() => ({ children: [] })),
  ])
    .then(([wmData1, wmData2, convData1, convData2]) => {
      const wmItems = [...(wmData1.children || []), ...(wmData2.children || [])];
      const convItems = [...(convData1.children || []), ...(convData2.children || [])];

      // Merge + dedup across the two sources (see webmentions/core.js)
      const allChildren = mergeMentions(convItems, wmItems);

      // Cache the merged results
      cache.set(allChildren);

      // Only render if we didn't already render from cache
      if (!cached) {
        processWebmentions(allChildren, hasBuildTimeSection);
      }

      // Enrich build-time reply badges with conversations API platform data.
      // Build-time cards have badges from URL heuristics (often wrong for AP
      // servers); conversations items have NodeInfo-resolved platform names.
      enrichBuildTimeBadges(convItems);
    })
    .catch((err) => {
      console.debug('[Webmentions] Error fetching:', err.message);
    });

  // Populate provenance badges on build-time reply cards
  document.querySelectorAll('.webmention-replies li[data-wm-url]').forEach(function (li) {
    var source = li.dataset.wmSource || '';
    var authorUrl = li.dataset.authorUrl || '';
    var platform = detectPlatform({ 'wm-source': source, author: { url: authorUrl } });
    li.dataset.platform = platform;

    var badgeSlot = li.querySelector('.wm-provenance-badge');
    if (badgeSlot) {
      badgeSlot.replaceWith(createProvenanceBadge(platform));
    }

    // Set platform on reply button
    var replyBtn = li.querySelector('.wm-reply-btn');
    if (replyBtn) {
      replyBtn.dataset.platform = platform;
    }
  });

  // Show reply buttons when owner is detected (event from comments.js)
  document.addEventListener('owner:detected', function () {
    wireReplyButtons();
  });
}
