/**
 * FeedLand widget — Alpine component.
 * Extracted from the widget partial (site-builder Phase 3): inline factory
 * scripts inside <is-land> raced Alpine hydration (factory undefined), and
 * per-block renderFile would duplicate the script per instance. Alpine.data()
 * in alpine:init is the theme's established pattern (see js/comments.js).
 * The widget's styles moved to css/tailwind.css in the same change.
 */
document.addEventListener("alpine:init", () => {
  Alpine.data("feedlandWidget", () => ({
    blogs: [],
    sortBy: 'when',
    title: 'FeedLand',
    riverUrl: 'https://feedland.com',
    loading: true,
    selectedId: null,
    expandedId: null,
    menuOpen: false,

    get sortedBlogs() {
      const sorted = [...this.blogs];
      if (this.sortBy === 'title') {
        sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      } else {
        sorted.sort((a, b) => {
          const da = new Date(a.lastItemAt || a.lastFetchAt || 0);
          const db = new Date(b.lastItemAt || b.lastFetchAt || 0);
          return db - da;
        });
      }
      return sorted;
    },

    handleRowClick(blog) {
      if (this.selectedId !== blog.id) {
        this.selectedId = blog.id;
      } else {
        this.toggleExpand(blog);
      }
    },

    async toggleExpand(blog) {
      this.selectedId = blog.id;
      if (this.expandedId === blog.id) {
        this.expandedId = null;
        return;
      }
      this.expandedId = blog.id;
      if (!blog._items) {
        blog._loadingItems = true;
        try {
          const res = await fetch('/blogrollapi/api/blogs/' + blog.id);
          const data = await res.json();
          blog._items = (data.items || []).slice(0, 5);
        } catch (err) {
          console.error('FeedLand: failed to load items for', blog.title, err);
          blog._items = [];
        } finally {
          blog._loadingItems = false;
        }
      }
    },

    truncate(str, max) {
      if (!str) return '';
      return str.length > max ? str.slice(0, max) + '…' : str;
    },

    relativeTime(iso) {
      if (!iso) return '';
      const diff = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return mins + 'm';
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + 'h';
      const days = Math.floor(hrs / 24);
      return days + 'd';
    },

    async init() {
      try {
        const res = await fetch('/blogrollapi/api/blogs?source=feedland&sort=recent&limit=100');
        const data = await res.json();
        this.blogs = (data.items || []).map(b => ({
          ...b,
          _items: null,
          _loadingItems: false,
        }));
      } catch (err) {
        console.error('FeedLand widget error:', err);
      } finally {
        this.loading = false;
      }
    }
  }));
});
