/**
 * Category index — single source of truth for category listing pages AND feeds
 * (Category Governance, Layer 3). Replaces the two duplicated `addCollection`
 * callbacks in eleventy.config.js (`categories` + `categoryFeeds`) which grouped
 * by lowercased slug but the listing TEMPLATE then re-matched posts by raw
 * case-sensitive string — silently dropping mixed-case posts (Politics vs
 * politics) from listings. Here, grouping is case-insensitive (by slug) and the
 * grouped posts ARE the source the templates iterate, so the case bug is gone.
 *
 * Pure + dependency-free so it unit-tests without an Eleventy build. The thin
 * Eleventy wiring (reading the collection, the config artifact) stays in
 * eleventy.config.js.
 *
 * @module lib/categories
 */
import { readFileSync } from "node:fs";

/**
 * Slugify a category name. Lowercases first, so "Politics" and "politics" map to
 * the same slug. This is the canonical copy — the 4 duplicated inline copies
 * (eleventy.config.js category collections, the `slugify` filter, _data/site.js)
 * should delegate here.
 * @param {unknown} str
 * @returns {string}
 */
export function slugifyCategory(str) {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build the grouped category index from Eleventy items.
 *
 * @param {Array<{data?:{category?:unknown}}>} items - published items, pre-sorted
 *   newest-first (so each entry's posts come out newest-first for feeds)
 * @param {object} [options]
 * @param {number} [options.feedPostLimit=50] - cap on posts retained per entry
 *   (count is always the TRUE total, regardless of the cap)
 * @returns {Array<{name:string, slug:string, count:number, posts:object[]}>}
 *   entries sorted by name
 */
export function buildCategoryIndex(items, options = {}) {
  const { feedPostLimit = 50 } = options;
  const grouped = new Map(); // slug -> { name, slug, count, posts }

  for (const item of Array.isArray(items) ? items : []) {
    const raw = item?.data?.category;
    if (!raw) continue;
    const cats = Array.isArray(raw) ? raw : [raw];
    for (const cat of cats) {
      if (typeof cat !== "string" || !cat.trim()) continue;
      const name = cat.trim();
      const slug = slugifyCategory(name);
      if (!slug) continue;
      let entry = grouped.get(slug);
      if (!entry) {
        entry = { name, slug, count: 0, posts: [] };
        grouped.set(slug, entry);
      }
      entry.count += 1;
      if (entry.posts.length < feedPostLimit) entry.posts.push(item);
    }
  }

  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Gate a category index for a given surface. A category survives iff its post
 * count meets the threshold, UNLESS a per-category override forces it on/off.
 * This is the build-side ">=N posts" rule that drops listing/feed pages for the
 * long tail of 1-post categories (the build-memory win).
 *
 * @param {Array<{slug:string, count:number}>} index
 * @param {object} [options]
 * @param {number} [options.threshold=1] - minimum post count (1 = no-op)
 * @param {Object<string,{feed?:boolean, listing?:boolean}>} [options.overrides]
 *   per-slug forced inclusion (true) / exclusion (false)
 * @param {"listing"|"feed"} [options.surface="listing"]
 * @returns {Array} the surviving subset
 */
export function gateCategories(index, options = {}) {
  const { threshold = 1, overrides = {}, surface = "listing" } = options;
  return (Array.isArray(index) ? index : []).filter((c) => {
    const o = overrides[c.slug] || {};
    const forced = surface === "feed" ? o.feed : o.listing;
    if (forced === true) return true;
    if (forced === false) return false;
    return c.count >= threshold;
  });
}

/**
 * Read the category-governance config artifact written by the site-config plugin
 * (Layer 2). Absent/malformed → safe defaults. Resolves nothing itself — the
 * caller passes the path so this stays testable.
 *
 * Shape: { threshold: number, overrides: { [slug]: { feed?:boolean, listing?:boolean } } }
 *
 * @param {string} artifactPath
 * @returns {{ threshold: number, overrides: object }}
 */
export function readCategoryConfig(artifactPath) {
  const defaults = { threshold: 2, overrides: {} };
  try {
    const parsed = JSON.parse(readFileSync(artifactPath, "utf8"));
    return {
      threshold: Number.isInteger(parsed?.threshold) && parsed.threshold >= 1 ? parsed.threshold : defaults.threshold,
      overrides: parsed?.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {},
    };
  } catch {
    return defaults;
  }
}
