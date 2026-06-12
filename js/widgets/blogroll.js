/**
 * Blogroll widget — Alpine component.
 * Extracted from the widget partial (site-builder Phase 3): inline factory
 * scripts inside <is-land> raced Alpine hydration (factory undefined), and
 * per-block renderFile would duplicate the script per instance. Alpine.data()
 * in alpine:init is the theme's established pattern (see js/comments.js).
 */
document.addEventListener("alpine:init", () => {
  Alpine.data("blogrollWidget", () => ({
    allBlogs: [],
    activeTab: 'all',
    tabs: [],
    loading: true,

    get filteredBlogs() {
      if (this.activeTab === 'all') return this.allBlogs;
      return this.allBlogs.filter(b => (b.source || 'other') === this.activeTab);
    },

    async init() {
      try {
        const res = await fetch('/blogrollapi/api/blogs?sort=recent&limit=200').then(r => r.json());
        this.allBlogs = res.items || [];
        this.buildTabs();
      } catch (err) {
        console.error('Blogroll widget error:', err);
      } finally {
        this.loading = false;
      }
    },

    buildTabs() {
      const counts = {};
      for (const blog of this.allBlogs) {
        const src = blog.source || 'other';
        counts[src] = (counts[src] || 0) + 1;
      }

      const labels = {
        microsub: 'Microsub',
        feedland: 'FeedLand',
        other: 'Other',
      };

      const sources = Object.keys(counts);
      if (sources.length <= 1) {
        this.tabs = [];
        this.activeTab = 'all';
        return;
      }

      this.tabs = sources.map(key => ({
        key,
        label: labels[key] || key,
        count: counts[key],
      }));

      // Default to the first tab
      this.activeTab = this.tabs[0].key;
    }
  }));
});
