/**
 * widgetPluginRequirements — map of widget.type → required plugin key
 *
 * NOTE: The homepage path no longer consumes this (Phase 3 cutover, R3);
 * survives for the cv-* dispatchers (+ homepage-section.njk) until Phase 6.
 *
 * Used by sidebar/widget-render templates to hide widgets whose backing
 * plugin isn't loaded for this site (Plan B multi-site loadouts).
 *
 * Pattern in templates:
 *   {% set req = widgetPluginRequirements[widget.type] %}
 *   {% if not req or loadedPlugins[req] %}
 *     {# render the widget — required plugin is loaded OR widget has no plugin dep #}
 *   {% endif %}
 *
 * Widget types NOT in this map are assumed plugin-independent (theme-level):
 *   author-card, author-card-compact, recent-posts, recent-posts-blog,
 *   categories, post-categories, post-navigation, search, share, subscribe,
 *   social-activity (theme widget reading from multiple sources),
 *   ai-usage (theme-level transparency), custom-html, toc.
 */

export default {
  "github-repos":   "github",
  "funkwhale":      "funkwhale",
  "lastfm":         "lastfm",
  "youtube":        "youtube",
  "blogroll":       "blogroll",
  "podroll":        "podroll",
  "recent-comments": "comments",
  "webmentions":    "webmention-io",
  "fediverse-follow": "activitypub",
};
