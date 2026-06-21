/**
 * Composed standalone pages — IMPLEMENTATION + named exports.
 *
 * This is a `lib/` module (NOT `_data/`) precisely BECAUSE it has named exports.
 * An Eleventy `_data/*.mjs` file must export ONLY a default: if it also has named
 * exports, Eleventy exposes the module NAMESPACE as the global instead of calling
 * `default()`, so the `composedPages` global would become
 * `{filterComposedPages, composedPageSlugs, RESERVED_ROOT_SLUGS, default}` and
 * `composed-pages.njk` would paginate the export NAMES (rendering them as bogus
 * compositions) while `cv.njk` would see a non-array. The thin default-only data
 * wrapper lives at `_data/composedPages.mjs` and re-exports `getComposedPages`.
 *
 * Reads the v4 `pages.json` ARRAY artifact (every PUBLISHED `kind:page`
 * composition: `{schemaVersion, kind, target:{route,title}, tree, updatedAt}`)
 * and returns the surviving entries. Path resolves via the content/ symlink; a
 * `lib/` __dirname resolves `../content` to the same place a `_data/` one does
 * (both are one level under the theme root).
 *
 * @module lib/composed-pages
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Single-segment root route: `/<slug>/`.
const ROUTE_RE = /^\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/;

/**
 * Slugs owned by a root-level page TEMPLATE (e.g. `about.njk` → `/about/`). `cv`
 * is INTENTIONALLY ABSENT — it is composition-owned (page:cv) as of Phase 7.
 * When retiring a root template to a composition REMOVE its slug; when adding a
 * permanent root page, add it.
 */
export const RESERVED_ROOT_SLUGS = new Set([
  "about", "blog", "articles", "notes", "photos", "bookmarks", "likes",
  "replies", "reposts", "interactions", "slashes", "github", "funkwhale",
  "listening", "youtube", "blogroll", "podroll", "news", "search",
  "changelog", "categories",
]);

/**
 * Reserved root-template slugs PLUS every authored content/pages/<slug>.md slug.
 * @returns {Set<string>} protected slugs a composed page must never overwrite
 */
function authoredPageSlugs() {
  const protectedSlugs = new Set(RESERVED_ROOT_SLUGS);
  try {
    const pagesDir = resolve(__dirname, "..", "content", "pages");
    for (const name of readdirSync(pagesDir)) {
      if (name.endsWith(".md")) protectedSlugs.add(name.slice(0, -".md".length));
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[composedPages] could not read content/pages/: ${error.message}`);
    }
  }
  return protectedSlugs;
}

/**
 * PURE filter: v4/page/route/tree validity gate + the build-time slug-collision
 * leg. No filesystem access (I/O lives in the readers), so it is unit-testable.
 * @param {unknown} artifact - parsed pages.json (expected: array of v4 page entries)
 * @param {Set<string>} [authoredSlugs] - slugs to exclude
 * @returns {object[]} surviving entries, in input order
 */
export function filterComposedPages(artifact, authoredSlugs = new Set()) {
  if (!Array.isArray(artifact)) {
    console.warn(`[composedPages] pages.json is not an array (got ${typeof artifact}) — ignoring (no composed pages will be built)`);
    return [];
  }

  const surviving = [];

  for (const entry of artifact) {
    const route = entry?.target?.route;
    if (
      entry?.schemaVersion !== 4 ||
      entry?.kind !== "page" ||
      typeof route !== "string" ||
      !ROUTE_RE.test(route) ||
      !entry?.tree
    ) {
      console.warn(`[composedPages] dropping malformed page entry (route=${JSON.stringify(route)}, kind=${JSON.stringify(entry?.kind)}, schemaVersion=${entry?.schemaVersion}) — failed the v4/page/route/tree gate`);
      continue;
    }

    const slug = route.slice(1, -1);
    if (authoredSlugs.has(slug)) {
      console.log(`[composedPages] route ${route} collides with content/pages/${slug}.md — skipping`);
      continue;
    }

    surviving.push(entry);
  }

  return surviving;
}

/**
 * Read + parse the pages.json artifact (via the content/ symlink). ENOENT (no
 * published pages — the normal steady state) and parse errors → [].
 * @returns {unknown} parsed artifact (expected array) or [] on missing/error
 */
function loadArtifact() {
  try {
    const artifactPath = resolve(__dirname, "..", "content", "_data", "compositions", "pages.json");
    return JSON.parse(readFileSync(artifactPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[composedPages] could not load compositions/pages.json: ${error.message}`);
    }
    return [];
  }
}

/**
 * Slugs of the currently-published composed pages. Consumed by the orphan prune
 * in eleventy.config.js.
 * @returns {string[]} current composed-page slugs
 */
export function composedPageSlugs() {
  return filterComposedPages(loadArtifact(), authoredPageSlugs()).map((entry) =>
    entry.target.route.slice(1, -1),
  );
}

/**
 * The surviving published composed-page entries — the value of the Eleventy
 * `composedPages` global (via the _data wrapper's default export).
 * @returns {object[]} surviving entries
 */
export function getComposedPages() {
  const surviving = filterComposedPages(loadArtifact(), authoredPageSlugs());
  if (surviving.length > 0) {
    console.log(`[composedPages] Loaded ${surviving.length} published page(s) from _data/compositions/pages.json`);
  }
  return surviving;
}
