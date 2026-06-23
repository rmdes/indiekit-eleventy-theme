/**
 * Listening widget — Alpine component (Phase 7c).
 *
 * Combined Funkwhale + Last.fm "Listening" sidebar widget. Converted from a
 * build-time Nunjucks partial to a LIVE client-side fetch so "now playing" is
 * always current (build-time froze it at the last Eleventy build — the worst
 * behavior for a now-playing widget). Fetches the plugins' public JSON APIs:
 *   /funkwhaleapi/api/now-playing, /funkwhaleapi/api/listenings
 *   /lastfmapi/api/now-playing,   /lastfmapi/api/scrobbles
 * Each plugin owns its data via its API; a missing/disabled plugin just yields
 * null/[] and the widget degrades (e.g. funkwhale-only if Last.fm isn't loaded).
 *
 * Registered via Alpine.data() in alpine:init — the theme's established pattern
 * (avoids the inline-factory-inside-<is-land> hydration race).
 */
document.addEventListener("alpine:init", () => {
  Alpine.data("listeningWidget", () => ({
    loading: true,
    fwNow: null, // Funkwhale now-playing object (only when status === 'now-playing')
    lfmNow: null, // Last.fm now-playing object
    listenings: [], // Funkwhale recent (max 2)
    scrobbles: [], // Last.fm recent (max 2)

    // Prefer Funkwhale's now-playing, else Last.fm's (matches the prior build-time logic).
    get np() {
      return this.fwNow || this.lfmNow;
    },
    get npSource() {
      return this.fwNow ? "Funkwhale" : "Last.fm";
    },
    get hasData() {
      return !!(this.np || this.listenings.length || this.scrobbles.length);
    },

    async init() {
      try {
        const [fwNp, fwList, lfmNp, lfmScrob] = await Promise.all([
          fetch("/funkwhaleapi/api/now-playing").then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch("/funkwhaleapi/api/listenings?limit=2").then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch("/lastfmapi/api/now-playing").then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch("/lastfmapi/api/scrobbles?limit=2").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        this.fwNow = fwNp && fwNp.status === "now-playing" ? fwNp : null;
        this.lfmNow = lfmNp && lfmNp.status === "now-playing" ? lfmNp : null;
        this.listenings = (fwList?.listenings || []).slice(0, 2);
        this.scrobbles = (lfmScrob?.scrobbles || []).slice(0, 2);
      } catch (err) {
        console.error("Listening widget error:", err);
      } finally {
        this.loading = false;
      }
    },
  }));
});
