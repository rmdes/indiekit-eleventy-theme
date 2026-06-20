/**
 * Category-page orphan pruning (Category Governance, Layer 3).
 *
 * Category listing + feed pages emit to `<output>/categories/<slug>/` (index.html,
 * feed.xml, feed.json). When a category is gated out (count < threshold) or merged
 * away by lib/categories.mjs, the in-place Eleventy build writes the surviving
 * pages but never removes the now-orphaned dirs (Eleventy only adds/overwrites
 * outputs). Without this, stale category pages keep serving and the page-count /
 * build-memory win is never realised.
 *
 * Safe by construction: `/categories/` is a theme-owned namespace — every
 * `/categories/<dir>/` is a category page — so removing any dir whose slug is not
 * in the current valid set is correct. The `/categories/index.html` FILE (the
 * index) is never a candidate (only directories are considered). Never throws —
 * a prune failure must not fail a build (warn + continue). Mirrors
 * lib/prune-composed-pages.mjs / lib/prune-preview.mjs.
 *
 * @module lib/prune-category-pages
 */
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

/**
 * Remove orphaned `/categories/<slug>/` dirs not in the current valid slug set.
 *
 * @param {string} categoriesDir - the build output `categories/` directory
 * @param {Iterable<string>} validSlugs - slugs of categories still in use
 *   (union of the gated listing + feed sets)
 * @returns {Promise<string[]>} slugs whose dirs were removed
 */
export async function pruneCategoryOrphans(categoriesDir, validSlugs) {
  const keep = validSlugs instanceof Set ? validSlugs : new Set(validSlugs);
  const removed = [];

  let entries;
  try {
    entries = await readdir(categoriesDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[categories] prune: cannot read ${categoriesDir}: ${error.message}`);
    }
    return removed;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue; // the index.html FILE is never a candidate
    const slug = entry.name;
    if (keep.has(slug)) continue;
    try {
      await rm(join(categoriesDir, slug), { recursive: true, force: true });
      removed.push(slug);
    } catch (error) {
      console.warn(`[categories] prune failed for /categories/${slug}/ (build continues): ${error.message}`);
    }
  }

  return removed;
}
