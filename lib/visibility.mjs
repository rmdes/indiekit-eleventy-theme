/**
 * Post visibility — Micropub's `visibility` property (public | unlisted | private).
 *
 * Eleventy builds a page for every source file regardless of collections, so
 * excluding an item here gives exactly "unlisted" semantics: the post keeps its
 * own working URL, it just stops appearing in /blog/, feeds, widgets and every
 * other listing.
 *
 * Only the two values that explicitly ask to be hidden are hidden. An unknown
 * or misspelled value leaves the post listed rather than making it silently
 * vanish — a blog quietly dropping posts is the worse failure.
 *
 * NOTE: `private` is treated the same as `unlisted` here, which means a private
 * post is still readable by anyone who knows its URL. Genuine privacy needs the
 * page not to render at all; the theme cannot authenticate a reader.
 */

const HIDDEN = new Set(["unlisted", "private"]);

/**
 * Should this item appear in collections (listings, feeds, widgets)?
 *
 * @param {object} data Eleventy template `data` (frontmatter merged with computed data)
 * @returns {boolean}
 */
export function isListed(data = {}) {
  if (data.draft) return false;
  if (!data.visibility) return true;
  return !HIDDEN.has(String(data.visibility).toLowerCase().trim());
}
