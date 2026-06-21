/**
 * Composed standalone pages — Eleventy GLOBAL DATA (`composedPages`).
 *
 * CRITICAL: this file must export ONLY a default. An Eleventy `_data/*.mjs` with
 * ANY named export makes Eleventy expose the module NAMESPACE as the global
 * instead of calling `default()` — so `composedPages` would become
 * `{filterComposedPages, composedPageSlugs, …}` and `composed-pages.njk` would
 * paginate the export names while `cv.njk` saw a non-array (the Phase 7 /cv
 * cutover bug). Implementation + named exports (filterComposedPages,
 * composedPageSlugs, RESERVED_ROOT_SLUGS) live in ../lib/composed-pages.mjs.
 *
 * Returns an ARRAY of the surviving published `kind:page` compositions; [] when
 * none are published.
 */

import { getComposedPages } from "../lib/composed-pages.mjs";

export default function () {
  return getComposedPages();
}
