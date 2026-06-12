/**
 * Recent webmentions widget — Alpine component.
 * Extracted from the widget partial (site-builder Phase 3): inline factory
 * scripts inside <is-land> raced Alpine hydration (factory undefined), and
 * per-block renderFile would duplicate the script per instance. Alpine.data()
 * in alpine:init is the theme's established pattern (see js/comments.js).
 */
document.addEventListener("alpine:init", () => {
  Alpine.data("webmentionsWidget", () => ({
    tab: 'inbound',
    loading: false,
    error: null,
    mentions: [],
    async init() {
      this.loading = true;
      try {
        const [wmRes, convRes] = await Promise.all([
          fetch('/webmentions/api/mentions?per-page=50&page=0').catch(() => null),
          fetch('/conversations/api/mentions?per-page=50&page=0').catch(() => null),
        ]);
        const wmData = wmRes?.ok ? await wmRes.json() : { children: [] };
        const convData = convRes?.ok ? await convRes.json() : { children: [] };

        // Merge: conversations items first (richer metadata), then webmentions
        const seen = new Set();
        const merged = [];
        for (const item of (convData.children || [])) {
          const key = item['wm-id'] || item.url;
          if (key && !seen.has(key)) { seen.add(key); merged.push(item); }
        }
        for (const item of (wmData.children || [])) {
          const key = item['wm-id'];
          if (!key || seen.has(key)) continue;
          if (item.url && seen.has(item.url)) continue;
          seen.add(key);
          merged.push(item);
        }

        this.mentions = merged.sort((a, b) => {
          return new Date(b.published || b['wm-received'] || 0) - new Date(a.published || a['wm-received'] || 0);
        });
      } catch (e) {
        this.error = 'Could not load';
      } finally {
        this.loading = false;
      }
    },
    formatPath(url) {
      try { return new URL(url).pathname; } catch { return url; }
    }
  }));
});
