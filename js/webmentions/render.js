/**
 * webmentions/render.js — DOM rendering for the client webmention widget.
 * Moved verbatim from js/webmentions.js; pure helpers now come from core.js
 * and reply-button wiring from reply.js.
 */
import { detectPlatform, formatDate } from "./core.js";
import { wireReplyButtons } from "./reply.js";

export function processWebmentions(allChildren, hasBuildTimeSection) {
  if (!allChildren || !allChildren.length) return;

  // Separate owner replies (threaded under parent) from regular interactions
  var ownerReplies = allChildren.filter(function (wm) { return wm.is_owner && wm.parent_url; });
  var regularItems = allChildren.filter(function (wm) { return !wm.is_owner; });

  let mentionsToShow;
  if (hasBuildTimeSection) {
    // Build-time section exists — deduplicate against what's actually rendered
    // in the DOM rather than using timestamps (which miss webmentions that the
    // build-time cache didn't include but that the API returns).

    // Collect author URLs already shown in facepiles (likes, reposts, bookmarks)
    var renderedAvatars = new Set();
    document.querySelectorAll('.webmention-likes li[data-author-url], .webmention-reposts li[data-author-url], .webmention-bookmarks li[data-author-url]').forEach(function (li) {
      var authorUrl = li.dataset.authorUrl;
      // Determine the type from the parent section class
      var parent = li.closest('[class*="webmention-"]');
      var type = 'like-of';
      if (parent) {
        if (parent.classList.contains('webmention-reposts')) type = 'repost-of';
        if (parent.classList.contains('webmention-bookmarks')) type = 'bookmark-of';
      }
      if (authorUrl) renderedAvatars.add(authorUrl + '::' + type);
    });

    // Collect reply URLs already shown in reply cards
    var renderedReplies = new Set();
    document.querySelectorAll('.webmention-replies li[data-wm-url]').forEach(function (li) {
      if (li.dataset.wmUrl) renderedReplies.add(li.dataset.wmUrl);
    });

    mentionsToShow = regularItems.filter(function (wm) {
      var prop = wm['wm-property'] || 'mention-of';
      if (prop === 'in-reply-to') {
        // Skip replies whose source URL is already rendered
        return !renderedReplies.has(wm.url);
      }
      // Skip likes/reposts/bookmarks whose author is already in a facepile
      var authorUrl = (wm.author && wm.author.url) || '';
      if (authorUrl && renderedAvatars.has(authorUrl + '::' + prop)) return false;
      return true;
    });
  } else {
    // No build-time section - show ALL regular webmentions from API
    mentionsToShow = regularItems;
  }

  if (mentionsToShow.length) {
    // Group by type
    const likes = mentionsToShow.filter((m) => m['wm-property'] === 'like-of');
    const reposts = mentionsToShow.filter((m) => m['wm-property'] === 'repost-of');
    const replies = mentionsToShow.filter((m) => m['wm-property'] === 'in-reply-to');
    const mentions = mentionsToShow.filter((m) => m['wm-property'] === 'mention-of');

    if (likes.length) {
      appendAvatars('.webmention-likes .facepile, .webmention-likes .avatar-row', likes, 'likes');
      updateCount('.webmention-likes h3', likes.length, 'Like');
    }

    if (reposts.length) {
      appendAvatars('.webmention-reposts .facepile, .webmention-reposts .avatar-row', reposts, 'reposts');
      updateCount('.webmention-reposts h3', reposts.length, 'Repost');
    }

    if (replies.length) {
      appendReplies('.webmention-replies ul', replies);
      updateCount('.webmention-replies h3', replies.length, 'Repl', 'ies', 'y');
    }

    if (mentions.length) {
      appendMentions('.webmention-mentions ul', mentions);
      updateCount('.webmention-mentions h3', mentions.length, 'Mention');
    }

    // Update total count in main header
    updateTotalCount(mentionsToShow.length);
  }

  // Thread owner replies under their parent interaction cards
  threadOwnerReplies(ownerReplies);
}

function threadOwnerReplies(ownerReplies) {
  if (!ownerReplies || !ownerReplies.length) return;

  ownerReplies.forEach(function (reply) {
    var parentUrl = reply.parent_url;
    if (!parentUrl) return;

    // Find the interaction card whose URL matches the parent
    var matchingLi = document.querySelector('.webmention-replies li[data-wm-url="' + CSS.escape(parentUrl) + '"]');
    if (!matchingLi) return;

    var slot = matchingLi.querySelector('.wm-owner-reply-slot');
    if (!slot) return;

    // Skip if already rendered (dedup by reply URL)
    if (slot.querySelector('[data-reply-url="' + CSS.escape(reply.url) + '"]')) return;

    var replyCard = document.createElement('div');
    replyCard.className = 'p-3 bg-surface-100 dark:bg-surface-900 rounded-lg border-l-2 border-amber-400 dark:border-amber-600';
    replyCard.dataset.replyUrl = reply.url || '';

    var innerDiv = document.createElement('div');
    innerDiv.className = 'flex items-start gap-2';

    var avatar = document.createElement('div');
    avatar.className = 'w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900 flex-shrink-0 flex items-center justify-center text-xs font-bold';
    avatar.textContent = (reply.author && reply.author.name ? reply.author.name[0] : 'O').toUpperCase();

    var contentArea = document.createElement('div');
    contentArea.className = 'flex-1';

    var headerRow = document.createElement('div');
    headerRow.className = 'flex items-center gap-2 flex-wrap';

    var nameSpan = document.createElement('span');
    nameSpan.className = 'font-medium text-sm';
    nameSpan.textContent = (reply.author && reply.author.name) || 'Owner';

    var authorBadge = document.createElement('span');
    authorBadge.className = 'inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full';
    authorBadge.textContent = 'Author';

    // Detect syndication platform and URL from the reply's syndication field
    var synUrls = reply.syndication || [];
    var synUrl = synUrls.length > 0 ? synUrls[0] : null;
    var synPlatform = null;
    if (synUrl) {
      if (synUrl.includes('bsky.app')) synPlatform = 'bluesky';
      else if (synUrl.match(/\/@[^/]+\/\d+/)) synPlatform = 'mastodon';
      else if (synUrl.includes('activitypub')) synPlatform = 'activitypub';
    }

    headerRow.appendChild(nameSpan);
    headerRow.appendChild(authorBadge);

    // Add platform badge if syndicated
    if (synPlatform) {
      headerRow.appendChild(createProvenanceBadge(synPlatform));
    }

    // Timestamp — link to syndicated URL if available, plain text otherwise
    var timeEl = document.createElement('time');
    timeEl.className = 'text-xs text-surface-600 dark:text-surface-400 font-mono';
    timeEl.dateTime = reply.published || '';
    timeEl.textContent = formatDate(reply.published);

    if (synUrl) {
      var dateLink = document.createElement('a');
      dateLink.href = synUrl;
      dateLink.className = 'text-xs text-surface-600 dark:text-surface-400 hover:underline';
      dateLink.target = '_blank';
      dateLink.rel = 'noopener';
      dateLink.appendChild(timeEl);
      headerRow.appendChild(dateLink);
    } else {
      headerRow.appendChild(timeEl);
    }

    var textDiv = document.createElement('div');
    textDiv.className = 'mt-1 text-sm prose dark:prose-invert';
    textDiv.textContent = (reply.content && reply.content.text) || '';

    contentArea.appendChild(headerRow);
    contentArea.appendChild(textDiv);

    innerDiv.appendChild(avatar);
    innerDiv.appendChild(contentArea);
    replyCard.appendChild(innerDiv);
    slot.appendChild(replyCard);
  });
}

export function enrichBuildTimeBadges(convItems) {
  if (!convItems || !convItems.length) return;

  convItems.forEach(function (item) {
    if (!item.platform) return;

    // Find matching build-time reply card: try URL match, then author URL match
    var li = null;
    if (item.url) {
      li = document.querySelector('.webmention-replies li[data-wm-url="' + CSS.escape(item.url) + '"]');
    }
    if (!li && item.author && item.author.url) {
      li = document.querySelector('.webmention-replies li[data-author-url="' + CSS.escape(item.author.url) + '"]');
    }
    if (!li) return;

    // Skip cards we rendered client-side (they already have correct badges)
    if (li.dataset.new === 'true') return;

    var newPlatform = detectPlatform(item);
    var currentPlatform = li.dataset.platform;
    if (newPlatform === currentPlatform) return;

    // Update the badge
    li.dataset.platform = newPlatform;
    var oldBadge = li.querySelector('.wm-provenance-badge');
    if (oldBadge) {
      oldBadge.replaceWith(createProvenanceBadge(newPlatform));
    }

    // Update reply button platform
    var replyBtn = li.querySelector('.wm-reply-btn');
    if (replyBtn) {
      replyBtn.dataset.platform = newPlatform;
    }
  });
}

function appendAvatars(selector, items, type) {
  let row = document.querySelector(selector);

  // Create section if it doesn't exist
  if (!row) {
    const section = createAvatarSection(type);
    let webmentionsSection = document.getElementById('webmentions');
    if (!webmentionsSection) {
      createWebmentionsSection();
      webmentionsSection = document.getElementById('webmentions');
    }
    if (webmentionsSection) {
      webmentionsSection.appendChild(section);
      row = section.querySelector('.facepile');
    }
  }

  if (!row) return;

  items.forEach((item) => {
    const author = item.author || {};

    const li = document.createElement('li');
    li.className = 'inline';

    const link = document.createElement('a');
    link.href = author.url || '#';
    link.className = 'facepile-avatar';
    link.setAttribute('aria-label', (author.name || 'Anonymous') + ' (opens in new tab)');
    link.target = '_blank';
    link.rel = 'noopener';
    link.dataset.new = 'true';

    const img = document.createElement('img');
    img.src = author.photo || '/images/default-avatar.svg';
    img.alt = '';
    img.className = 'w-8 h-8 rounded-full ring-2 ring-white dark:ring-surface-900';
    img.loading = 'lazy';

    link.appendChild(img);
    li.appendChild(link);
    row.appendChild(li);
  });
}

function appendReplies(selector, items) {
  let list = document.querySelector(selector);

  // Create section if it doesn't exist
  if (!list) {
    const section = createReplySection();
    let webmentionsSection = document.getElementById('webmentions');
    if (!webmentionsSection) {
      createWebmentionsSection();
      webmentionsSection = document.getElementById('webmentions');
    }
    if (webmentionsSection) {
      webmentionsSection.appendChild(section);
      list = section.querySelector('ul');
    }
  }

  if (!list) return;

  items.forEach((item) => {
    const author = item.author || {};
    const content = item.content || {};
    const published = item.published || item['wm-received'];

    const li = document.createElement('li');
    li.className = 'p-4 bg-surface-100 dark:bg-surface-800 rounded-lg ring-2 ring-accent-500';
    li.dataset.new = 'true';
    li.dataset.platform = detectPlatform(item);
    li.dataset.wmUrl = item.url || '';

    // Build reply card using DOM methods
    const wrapper = document.createElement('div');
    wrapper.className = 'flex gap-3';

    // Avatar link
    const avatarLink = document.createElement('a');
    avatarLink.href = author.url || '#';
    avatarLink.target = '_blank';
    avatarLink.rel = 'noopener';

    const avatarImg = document.createElement('img');
    avatarImg.src = author.photo || '/images/default-avatar.svg';
    avatarImg.alt = author.name || 'Anonymous';
    avatarImg.className = 'w-10 h-10 rounded-full';
    avatarImg.loading = 'lazy';
    avatarLink.appendChild(avatarImg);

    // Content area
    const contentDiv = document.createElement('div');
    contentDiv.className = 'flex-1 min-w-0';

    // Header row
    const headerDiv = document.createElement('div');
    headerDiv.className = 'flex items-baseline gap-2 mb-1';

    const authorLink = document.createElement('a');
    authorLink.href = author.url || '#';
    authorLink.className = 'font-semibold text-surface-900 dark:text-surface-100 hover:underline';
    authorLink.target = '_blank';
    authorLink.rel = 'noopener';
    authorLink.textContent = author.name || 'Anonymous';

    const dateLink = document.createElement('a');
    dateLink.href = item.url || '#';
    dateLink.className = 'text-xs text-surface-600 dark:text-surface-400 hover:underline';
    dateLink.target = '_blank';
    dateLink.rel = 'noopener';

    const timeEl = document.createElement('time');
    timeEl.dateTime = published;
    timeEl.textContent = formatDate(published);
    dateLink.appendChild(timeEl);

    const newBadge = document.createElement('span');
    newBadge.className = 'text-xs text-accent-600 dark:text-accent-400 font-medium';
    newBadge.textContent = 'NEW';

    headerDiv.appendChild(authorLink);
    // Add provenance badge
    var platform = detectPlatform(item);
    headerDiv.appendChild(createProvenanceBadge(platform));
    headerDiv.appendChild(dateLink);
    headerDiv.appendChild(newBadge);

    // Reply content - use textContent for safety
    const replyDiv = document.createElement('div');
    replyDiv.className = 'text-surface-700 dark:text-surface-300 prose dark:prose-invert prose-sm max-w-none';
    replyDiv.textContent = content.text || '';

    // Reply button (hidden by default, shown for owner)
    const replyBtn = document.createElement('button');
    replyBtn.className = 'wm-reply-btn hidden text-xs text-primary-600 dark:text-primary-400 hover:underline mt-2';
    replyBtn.dataset.replyUrl = item.url || '';
    replyBtn.dataset.platform = platform;
    replyBtn.textContent = 'Reply';

    contentDiv.appendChild(headerDiv);
    contentDiv.appendChild(replyDiv);
    contentDiv.appendChild(replyBtn);

    wrapper.appendChild(avatarLink);
    wrapper.appendChild(contentDiv);
    li.appendChild(wrapper);

    // Owner reply slot for threaded replies
    const ownerReplySlot = document.createElement('div');
    ownerReplySlot.className = 'wm-owner-reply-slot ml-13 mt-2';
    li.appendChild(ownerReplySlot);

    // Also set data attributes for build-time parity
    li.dataset.wmSource = item['wm-source'] || '';
    li.dataset.authorUrl = author.url || '';

    // Prepend to show newest first
    list.insertBefore(li, list.firstChild);
  });

  // Wire up new reply buttons if owner is already detected
  wireReplyButtons();
}

function appendMentions(selector, items) {
  let list = document.querySelector(selector);

  if (!list) {
    const section = createMentionSection();
    let webmentionsSection = document.getElementById('webmentions');
    if (!webmentionsSection) {
      createWebmentionsSection();
      webmentionsSection = document.getElementById('webmentions');
    }
    if (webmentionsSection) {
      webmentionsSection.appendChild(section);
      list = section.querySelector('ul');
    }
  }

  if (!list) return;

  items.forEach((item) => {
    const author = item.author || {};
    const published = item.published || item['wm-received'];

    const li = document.createElement('li');
    li.dataset.new = 'true';

    const link = document.createElement('a');
    link.href = item.url || '#';
    link.className = 'text-accent-600 dark:text-accent-400 hover:underline';
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = `${author.name || 'Someone'} mentioned this on ${formatDate(published)}`;

    const badge = document.createElement('span');
    badge.className = 'text-xs text-accent-600 dark:text-accent-400 font-medium ml-1';
    badge.textContent = 'NEW';

    li.appendChild(link);
    li.appendChild(badge);

    list.insertBefore(li, list.firstChild);
  });
}

function updateCount(selector, additionalCount, noun, pluralSuffix, singularSuffix) {
  const header = document.querySelector(selector);
  if (!header) return;

  const text = header.textContent;
  const match = text.match(/(\d+)/);
  if (match) {
    const currentCount = parseInt(match[1], 10);
    const newCount = currentCount + additionalCount;
    if (noun) {
      // Rebuild the header text with correct pluralization
      var suffix = pluralSuffix || 's';
      var singSuffix = singularSuffix || '';
      header.textContent = newCount + ' ' + noun + (newCount !== 1 ? suffix : singSuffix);
    } else {
      header.textContent = text.replace(/\d+/, newCount);
    }
  }
}

function updateTotalCount(additionalCount) {
  const header = document.querySelector('#webmentions h2');
  if (!header) return;

  const text = header.textContent;
  const match = text.match(/\((\d+)\)/);
  if (match) {
    const currentCount = parseInt(match[1], 10);
    const newCount = currentCount + additionalCount;
    header.textContent = text.replace(/\(\d+\)/, `(${newCount})`);
  }
}

function createAvatarSection(type) {
  const section = document.createElement('div');
  section.className = `webmention-${type} mb-6`;

  const header = document.createElement('h3');
  header.className = 'text-sm font-semibold text-surface-600 dark:text-surface-400 uppercase tracking-wide mb-3';
  header.textContent = `0 ${type === 'likes' ? 'Likes' : 'Reposts'}`;

  const row = document.createElement('ul');
  row.className = 'facepile';
  row.setAttribute('role', 'list');

  section.appendChild(header);
  section.appendChild(row);

  return section;
}

function createReplySection() {
  const section = document.createElement('div');
  section.className = 'webmention-replies';

  const header = document.createElement('h3');
  header.className = 'text-sm font-semibold text-surface-600 dark:text-surface-400 uppercase tracking-wide mb-4';
  header.textContent = '0 Replies';

  const list = document.createElement('ul');
  list.className = 'space-y-4';

  section.appendChild(header);
  section.appendChild(list);

  return section;
}

function createMentionSection() {
  const section = document.createElement('div');
  section.className = 'webmention-mentions mt-6';

  const header = document.createElement('h3');
  header.className = 'text-sm font-semibold text-surface-600 dark:text-surface-400 uppercase tracking-wide mb-3';
  header.textContent = '0 Mentions';

  const list = document.createElement('ul');
  list.className = 'space-y-2 text-sm';

  section.appendChild(header);
  section.appendChild(list);

  return section;
}

function createWebmentionsSection() {
  const webmentionForm = document.querySelector('.webmention-form');
  if (!webmentionForm) return;

  const section = document.createElement('section');
  section.className = 'webmentions mt-8 pt-8 border-t border-surface-200 dark:border-surface-700';
  section.id = 'webmentions';
  section.setAttribute('aria-live', 'polite');
  section.setAttribute('aria-label', 'Webmentions');

  const header = document.createElement('h2');
  header.className = 'text-xl font-bold text-surface-900 dark:text-surface-100 mb-6';
  header.textContent = 'Webmentions (0)';

  section.appendChild(header);
  webmentionForm.parentNode.insertBefore(section, webmentionForm);
}

function createSvgIcon(viewBox, fillAttr, paths, strokeAttrs) {
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'w-3 h-3');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', fillAttr || 'currentColor');
  if (strokeAttrs) {
    svg.setAttribute('stroke', strokeAttrs.stroke || 'currentColor');
    svg.setAttribute('stroke-width', strokeAttrs.strokeWidth || '2');
    svg.setAttribute('stroke-linecap', strokeAttrs.strokeLinecap || 'round');
    svg.setAttribute('stroke-linejoin', strokeAttrs.strokeLinejoin || 'round');
  }
  paths.forEach(function (p) {
    var el = document.createElementNS(NS, p.tag || 'path');
    var attrs = p.attrs || {};
    Object.keys(attrs).forEach(function (attr) {
      el.setAttribute(attr, attrs[attr]);
    });
    svg.appendChild(el);
  });
  return svg;
}

export function createProvenanceBadge(platform) {
  var span = document.createElement('span');
  var svg;
  if (platform === 'mastodon') {
    span.className = 'wm-provenance-badge inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full';
    span.title = 'Mastodon';
    svg = createSvgIcon('0 0 24 24', 'currentColor', [
      { tag: 'path', attrs: { d: 'M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.668 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z' } }
    ]);
  } else if (platform === 'bluesky') {
    span.className = 'wm-provenance-badge inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-full';
    span.title = 'Bluesky';
    svg = createSvgIcon('0 0 568 501', 'currentColor', [
      { tag: 'path', attrs: { d: 'M123.121 33.664C188.241 82.553 258.281 181.68 284 234.873c25.719-53.192 95.759-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.947c0 17.346-9.945 145.713-15.778 166.555-20.275 72.453-94.155 90.933-159.875 79.748C507.222 323.8 536.444 388.56 473.333 453.32c-119.86 122.992-172.272-30.859-185.702-70.281-2.462-7.227-3.614-10.608-3.631-7.733-.017-2.875-1.169.506-3.631 7.733-13.43 39.422-65.842 193.273-185.702 70.281-63.111-64.76-33.89-129.52 80.986-149.071-65.72 11.185-139.6-7.295-159.875-79.748C9.945 203.659 0 75.291 0 57.946 0-28.906 76.135-1.612 123.121 33.664Z' } }
    ]);
  } else if (platform === 'activitypub') {
    span.className = 'wm-provenance-badge inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full';
    span.title = 'Fediverse (ActivityPub)';
    svg = createSvgIcon('0 0 24 24', 'currentColor', [
      { tag: 'path', attrs: { d: 'M13.09 4.43L24 10.73v2.51L13.09 19.58v-2.51L21.83 12 13.09 6.98v-2.55zM13.09 9.49L17.44 12l-4.35 2.51V9.49z' } },
      { tag: 'path', attrs: { d: 'M10.91 4.43L0 10.73v2.51l8.74-5.03v10.09l2.18 1.28V4.43zM6.56 12L2.18 14.51l4.35 2.51V12z' } }
    ]);
  } else {
    span.className = 'wm-provenance-badge inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full';
    span.title = 'IndieWeb';
    svg = createSvgIcon('0 0 24 24', 'none', [
      { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
      { tag: 'line', attrs: { x1: '2', y1: '12', x2: '22', y2: '12' } },
      { tag: 'path', attrs: { d: 'M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z' } }
    ], { stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' });
  }
  span.appendChild(svg);
  return span;
}
