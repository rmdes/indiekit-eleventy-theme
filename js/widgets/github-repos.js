/**
 * GitHub repos widget — Alpine component.
 * Extracted from the widget partial (site-builder Phase 3): inline factory
 * scripts inside <is-land> raced Alpine hydration (factory undefined →
 * contributions.slice crash), and per-block renderFile would duplicate the
 * script per instance. Alpine.data() in alpine:init is the theme's
 * established pattern (see js/comments.js).
 */
document.addEventListener("alpine:init", () => {
  Alpine.data("githubWidget", (username) => ({
    activeTab: 'commits',
    loading: true,
    commits: [],
    repos: [],
    featured: [],
    contributions: [],

    async init() {
      try {
        const fetches = [
          fetch('/githubapi/api/commits').then(r => r.ok ? r.json() : null).catch(() => null),
          fetch('/githubapi/api/featured').then(r => r.ok ? r.json() : null).catch(() => null),
          fetch('/githubapi/api/contributions').then(r => r.ok ? r.json() : null).catch(() => null),
        ];
        if (username) {
          fetches.push(
            fetch('https://api.github.com/users/' + username + '/repos?sort=updated&per_page=10&type=owner', {
              headers: { 'Accept': 'application/vnd.github.v3+json' }
            }).then(r => r.ok ? r.json() : null).catch(() => null)
          );
        }
        const [commitsRes, featuredRes, contribRes, reposRes] = await Promise.all(fetches);
        this.commits = commitsRes?.commits || [];
        this.featured = featuredRes?.featured || [];
        this.contributions = contribRes?.contributions || [];
        this.repos = (reposRes || []).filter(r => !r.fork && !r.private);
      } catch (err) {
        console.error('GitHub widget error:', err);
      } finally {
        this.loading = false;
      }
    },

    formatDate(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now - d;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffHours < 1) return 'just now';
      if (diffHours < 24) return diffHours + 'h ago';
      if (diffDays < 7) return diffDays + 'd ago';
      return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    }
  }));
});
