/**
 * sectionPluginRequirements — map of section.type → required plugin key
 *
 * NOTE: Consumed by homepage-section.njk (cv-builder/cv-footer path, dies
 * Phase 6) AND lib/render-composition.mjs's legacy-map gate (dies Phase 7).
 * The deleted homepage dispatchers no longer consume it (Phase 3 cutover, R3).
 *
 * Parallel to widgetPluginRequirements but for homepage SECTIONS (the main
 * content blocks of the homepage builder, not the sidebar widgets).
 *
 * Used by components/homepage-section.njk to gate section rendering when
 * the backing plugin isn't loaded for this site (Plan B multi-site).
 *
 * Pattern in templates:
 *   {% set req = sectionPluginRequirements[section.type] %}
 *   {% if not req or loadedPlugins[req] %}
 *     {# dispatch to the right partial #}
 *   {% endif %}
 *
 * Section types NOT in this map are assumed plugin-independent (theme-level):
 *   featured-posts, recent-posts, custom-html, posting-activity, ai-usage.
 */

export default {
  "cv-experience":            "cv",
  "cv-projects":              "cv",
  "cv-projects-personal":     "cv",
  "cv-projects-work":         "cv",
  "cv-skills":                "cv",
  "cv-skills-personal":       "cv",
  "cv-skills-work":           "cv",
  "cv-education":             "cv",
  "cv-education-personal":    "cv",
  "cv-education-work":        "cv",
  "cv-interests":             "cv",
  "cv-interests-personal":    "cv",
  "cv-interests-work":        "cv",
  "cv-experience-personal":   "cv",
  "cv-experience-work":       "cv",
  "cv-languages":             "cv",
  "blogroll":                 "blogroll",
  "podroll":                  "podroll",
  "github-activity":          "github",
  "youtube":                  "youtube",
  "funkwhale":                "funkwhale",
  "lastfm":                   "lastfm",
};
