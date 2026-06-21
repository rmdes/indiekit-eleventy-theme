/**
 * Composed Standalone Pages (Phase 6.5, #32-T7)
 * Reads the v4 `pages.json` ARRAY artifact written by the site-config plugin's
 * pages writer (T4): every PUBLISHED `kind:page` composition, each
 * `{schemaVersion, kind, target:{route,title}, tree, updatedAt}`. The theme
 * renders one full-page composition per surviving entry at `target.route` via
 * the `composed-pages.njk` pagination template (mirrors categories.njk).
 *
 * IMPORTANT — name collision: this global is `composedPages`, NOT `pages`.
 * There is an existing `pages` COLLECTION (eleventy.config.js) and an existing
 * `content/pages/pages.json` directory-data file; a `pages` global would clash.
 * The artifact lives at content/_data/compositions/pages.json (a DIFFERENT
 * directory from content/pages/pages.json — no filesystem clash).
 *
 * Gates (defense in depth alongside the site-config validator):
 *   - schemaVersion === 4, kind === "page", a valid single-segment
 *     `target.route` (`/<slug>/`), and a `tree`. Malformed entries are dropped
 *     with a warn.
 *
 * BUILD-TIME slug-guard leg (D5/security, second half of the double-guard):
 *   - Any composed page whose route slug collides with an authored
 *     content/pages/<slug>.md page is FILTERED OUT and logged. This prevents a
 *     composed page from silently overwriting an authored slash-page's output
 *     even if the save-time guard was bypassed or the .md page was added later.
 *
 * Runtime path: /app/data/content/_data/compositions/pages.json (resolves via
 * the content/ symlink, same mechanism as collectionDefault.mjs / previews.mjs).
 * Eleventy already watches ./content/_data/compositions/; writing the artifact
 * triggers an incremental rebuild with zero config changes.
 *
 * Returns an ARRAY of the surviving entries. ENOENT (no published pages) → [].
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Single-segment root route: `/<slug>/` where slug is lowercase
// alphanumerics with internal single hyphens (matches the site-config
// validator + the post-type-page slug shape).
const ROUTE_RE = /^\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/;

/**
 * Slugs owned by a root-level page TEMPLATE (e.g. `about.njk` → `/about/`). The
 * content/pages slug-guard only covers `content/pages/*.md`, so without this a
 * composed `page:<slug>` colliding with a root template would silently double-
 * write its `/<slug>/index.html`. `cv` is INTENTIONALLY ABSENT — it is
 * composition-owned (page:cv) as of Phase 7. When retiring a root template to a
 * composition, REMOVE its slug here; when adding a permanent root page, add it.
 */
export const RESERVED_ROOT_SLUGS = new Set([
  "about", "blog", "articles", "notes", "photos", "bookmarks", "likes",
  "replies", "reposts", "interactions", "slashes", "github", "funkwhale",
  "listening", "youtube", "blogroll", "podroll", "news", "search",
  "changelog", "categories",
]);

/**
 * Derive the set of slugs a composed page must never overwrite: the reserved
 * root-template slugs PLUS every authored content/pages/<slug>.md slug (filename
 * without `.md`). Resolves via the content/ symlink, same as the artifact. A
 * missing directory (fresh container) → just the reserved set.
 *
 * @returns {Set<string>} protected slugs
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
 * PURE filter: apply the v4/page/route/tree validity gate and the build-time
 * slug-collision leg to a parsed `pages.json` artifact. No filesystem access —
 * the I/O (reading the artifact + deriving authored slugs) lives in the default
 * export, so this gate/collision logic can be unit-tested in isolation.
 *
 * @param {unknown} artifact - parsed pages.json (expected: array of v4 page entries)
 * @param {Set<string>} [authoredSlugs] - authored content/pages/<slug>.md slugs to exclude
 * @returns {object[]} surviving entries, in input order
 */
export function filterComposedPages(artifact, authoredSlugs = new Set()) {
  if (!Array.isArray(artifact)) {
    console.warn(`[composedPages] pages.json is not an array (got ${typeof artifact}) — ignoring (no composed pages will be built)`);
    return [];
  }

  const surviving = [];

  for (const entry of artifact) {
    // Per-entry validity gate (defense in depth).
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

    // BUILD-TIME slug-guard leg: skip any composed page that collides with an
    // authored content/pages/<slug>.md output. route is `/<slug>/` → slug is
    // the segment between the slashes.
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
 *
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
 * Slugs of the currently-published composed pages (the segment of each
 * `/<slug>/` route). Consumed by the orphan prune in eleventy.config.js to know
 * which composed-page output dirs are still live.
 *
 * @returns {string[]} current composed-page slugs
 */
export function composedPageSlugs() {
  return filterComposedPages(loadArtifact(), authoredPageSlugs()).map((entry) =>
    entry.target.route.slice(1, -1),
  );
}

export default function () {
  const artifact = loadArtifact();
  const surviving = filterComposedPages(artifact, authoredPageSlugs());
  // TEMP Phase 7 cutover debug — proves whether Eleventy EXECUTES this global
  // each build (vs serving a cached []). Remove once /cv cutover is confirmed.
  console.log(
    `[composedPages] DEBUG default() EXECUTED artifact=${Array.isArray(artifact) ? artifact.length : typeof artifact} surviving=${surviving.length} routes=${JSON.stringify(surviving.map((p) => p && p.target && p.target.route))}`,
  );
  if (surviving.length > 0) {
    console.log(`[composedPages] Loaded ${surviving.length} published page(s) from _data/compositions/pages.json`);
  }
  return surviving;
}
