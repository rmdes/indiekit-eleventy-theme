/**
 * OG-card orphan pruning.
 *
 * Cards are generated per post into `.cache/og/<slug>.png` and passthrough-copied
 * to `<output>/og/`. Neither directory is ever cleaned: the in-place Eleventy
 * build only adds and overwrites, and passthrough copy never deletes. So a card
 * outlives the post it belonged to — rmendes accumulated 62 such orphans between
 * March and September purely from deleted posts, and a slug-scheme change orphans
 * the ENTIRE set at once.
 *
 * That is the same class of bug as the theme assets that kept serving at 200 on
 * three sites after being git-rm'd: deleting the source is not deleting the
 * output. This makes it structural rather than a thing to remember.
 *
 * Safe by construction: both directories are theme-owned namespaces. Every
 * `*.png` in `.cache/og/` is a generated card, and `<output>/og/` exists only as
 * the passthrough target for them — nothing else writes there. `manifest.json`
 * and the generated site-level `default.png` are never candidates. Never throws:
 * a prune failure must not fail a build (warn + continue). Mirrors
 * lib/prune-category-pages.mjs / lib/prune-composed-pages.mjs.
 *
 * @module lib/prune-og
 */
import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

/** Never removed: the fallback card and the cache bookkeeping. */
const PROTECTED = new Set(["default.png", "manifest.json"]);

/**
 * Remove `<dir>/<slug>.png` files whose slug is not in the current valid set.
 *
 * @param {string} ogDir - a directory holding generated cards (`.cache/og` or `<output>/og`)
 * @param {Iterable<string>} validSlugs - slugs of posts that still have a card
 * @returns {Promise<string[]>} slugs whose cards were removed
 */
export async function pruneOgOrphans(ogDir, validSlugs) {
  const keep = validSlugs instanceof Set ? validSlugs : new Set(validSlugs);
  const removed = [];

  // An empty valid set means "we could not determine what is valid" — deleting
  // every card on that basis would be catastrophic and is never what the caller
  // wants. A site with genuinely zero cards has nothing to prune anyway.
  if (keep.size === 0) return removed;

  let entries;
  try {
    entries = await readdir(ogDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[og] prune: cannot read ${ogDir}: ${error.message}`);
    }
    return removed;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (PROTECTED.has(entry.name)) continue;
    if (!entry.name.endsWith(".png")) continue;

    const slug = entry.name.slice(0, -".png".length);
    if (keep.has(slug)) continue;

    try {
      await unlink(join(ogDir, entry.name));
      removed.push(slug);
    } catch (error) {
      console.warn(`[og] prune failed for ${entry.name} (build continues): ${error.message}`);
    }
  }

  return removed;
}

/**
 * The slugs that currently have a card, read from the OG manifest.
 *
 * The manifest is the generator's own record of what it wrote, so it is the
 * authority on what should exist — but only once og.js has pruned its own stale
 * entries on a complete pass. Bookkeeping keys (`__default__`) are excluded.
 *
 * @param {string} manifestPath - path to `.cache/og/manifest.json`
 * @param {object} [io] - injectable reader for tests
 * @returns {Promise<Set<string>>} valid slugs, empty when unreadable
 */
export async function readOgManifestSlugs(manifestPath, io = {}) {
  const read = io.readFile || (async (p) => (await import("node:fs/promises")).readFile(p, "utf8"));
  try {
    const manifest = JSON.parse(await read(manifestPath));
    return new Set(Object.keys(manifest).filter((key) => !key.startsWith("__")));
  } catch (error) {
    // Unreadable manifest → empty set → pruneOgOrphans deletes nothing.
    if (error.code !== "ENOENT") {
      console.warn(`[og] prune: cannot read manifest ${manifestPath}: ${error.message}`);
    }
    return new Set();
  }
}
