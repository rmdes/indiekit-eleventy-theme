/**
 * Composed-page orphan pruning (6.5 follow-up).
 *
 * Composed standalone pages (`composed-pages.njk`) emit to the SHARED site root
 * at `/<slug>/index.html`. When a page:<slug> composition is deleted or renamed
 * in the site-config admin, the in-place incremental (watch-mode) build never
 * removes the now-orphaned output — it lingers, served stale, until the next
 * full rebuild into a fresh release dir.
 *
 * `prune-preview.mjs` solves the analogous preview problem safely because
 * previews live in a namespaced sandbox (`/preview/<surface>/<token>/`) it fully
 * owns. Composed pages do NOT — `/<slug>/` sits at the root alongside authored
 * pages (content/pages/<slug>.md → /<slug>/), collection listings (/articles/),
 * post-type roots, etc. A naive "remove root dirs not in pages.json" would delete
 * the whole site.
 *
 * Safety mechanism: composed-pages.njk stamps a data-attribute MARKER
 * (COMPOSED_PAGE_MARKER) into every composed page's HTML (an attribute, not an
 * HTML comment, so it survives the production htmlmin pass which sets
 * removeComments:true). The prune only ever removes a `/<slug>/` dir whose
 * index.html bears that marker AND whose slug is no longer in the current
 * published set. The on-disk marked files are the authoritative "previously
 * emitted" set, so no manifest is needed and the prune self-corrects across
 * watch/build modes and release dirs.
 *
 * Mirrors prune-preview.mjs conventions: never throws (a prune failure must not
 * fail a build — warn + continue), returns the list of removed slugs to log.
 */
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

/**
 * Data attribute composed-pages.njk writes into every composed page's HTML.
 * Survives html-minifier-terser (removeComments:true strips comments, but it
 * does not remove attributes or empty elements with the theme's options).
 */
export const COMPOSED_PAGE_MARKER = "data-indiekit-composed-page";

/**
 * The OPENING-TAG fragment actually matched on disk. Anchoring to `<div ` (not
 * the bare attribute name) prevents a false positive from a page that merely
 * MENTIONS the attribute in prose: in rendered HTML such a mention is either
 * plain text (no `<div ` prefix) or HTML-escaped (`&lt;div …`), so only the
 * genuine marker element matches. The space after `<div` is mandatory and is
 * preserved by htmlmin's collapseWhitespace, so the fragment is stable in both
 * watch (unminified) and production (minified) output.
 */
const COMPOSED_PAGE_MARKER_FRAGMENT = `<div ${COMPOSED_PAGE_MARKER}`;

/**
 * Remove orphaned composed-page output from the shared site root.
 *
 * @param {string} outputDir - Eleventy build output directory
 * @param {Iterable<string>} currentSlugs - slugs of currently-published composed pages
 * @param {object} [options]
 * @param {string} [options.marker] - the HTML fragment identifying composed-page output
 * @returns {Promise<string[]>} slugs whose output dirs were removed
 */
export async function pruneComposedPageOrphans(outputDir, currentSlugs, options = {}) {
  const { marker = COMPOSED_PAGE_MARKER_FRAGMENT } = options;
  const keep = currentSlugs instanceof Set ? currentSlugs : new Set(currentSlugs);
  const removed = [];

  let entries;
  try {
    entries = await readdir(outputDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[composed-pages] prune: cannot read ${outputDir}: ${error.message}`);
    }
    return removed;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    if (keep.has(slug)) continue; // still a published composed page — keep

    let html;
    try {
      html = await readFile(join(outputDir, slug, "index.html"), "utf8");
    } catch {
      continue; // no index.html → not a composed-page output dir
    }
    if (!html.includes(marker)) continue; // not emitted by composed-pages.njk — never touch

    try {
      await rm(join(outputDir, slug), { recursive: true, force: true });
      removed.push(slug);
    } catch (error) {
      console.warn(`[composed-pages] prune failed for /${slug}/ (build continues): ${error.message}`);
    }
  }

  return removed;
}
