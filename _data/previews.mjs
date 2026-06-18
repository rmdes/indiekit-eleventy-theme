/**
 * Per-Surface Preview Artifact Data (Phase 6.5, #32-T4)
 * Reads the v4 PER-SURFACE preview composition artifacts written by the
 * site-config plugin's preview writer: preview-homepage.json,
 * preview-listing.json, preview-posttype.json. Generalizes the single-artifact
 * _data/previewDraft.mjs into a MAP keyed by routeKey so per-surface preview
 * templates (T5) can access `previews.homepage` / `previews.listing` /
 * `previews.posttype`.
 *
 * Each surface applies the SAME gate as previewDraft.mjs: the artifact must
 * declare kind "preview" — anything else is ignored (warn + null) so a
 * misplaced composition artifact can never publish a preview page. A null map
 * value (missing artifact) → the matching preview template computes
 * `permalink: false` → no page is built for that surface.
 *
 * Runtime path: /app/data/content/_data/compositions/preview-<routeKey>.json
 * (resolves via the content/ symlink, same mechanism as previewDraft.mjs).
 * Eleventy already watches ./content/_data/compositions/; writing a preview
 * artifact triggers an incremental rebuild with zero config changes.
 *
 * schemaVersion is deliberately NOT gated here — the renderCompositionTree
 * shortcode owns that gate (warn + HTML comment), same split as composition.mjs
 * and previewDraft.mjs.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load one per-surface preview artifact. Mirrors previewDraft.mjs's gates and
 * log style, per surface.
 *
 * @param {string} routeKey - "homepage" | "listing" | "posttype"
 * @returns {object | null} The preview artifact, or null when absent/invalid
 */
function load(routeKey) {
  try {
    // Resolve via the content/ symlink relative to the Eleventy project
    const artifactPath = resolve(__dirname, "..", "content", "_data", "compositions", `preview-${routeKey}.json`);
    const raw = readFileSync(artifactPath, "utf8");
    const artifact = JSON.parse(raw);
    if (artifact?.kind !== "preview") {
      console.warn(`[previews:${routeKey}] artifact kind "${artifact?.kind}" is not "preview" — ignoring (no preview page will be built)`);
      return null;
    }
    console.log(`[previews:${routeKey}] Loaded preview from _data/compositions/preview-${routeKey}.json`);
    return artifact;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[previews:${routeKey}] could not load compositions/preview-${routeKey}.json: ${error.message}`);
    }
    // Missing file (no pending preview) is the normal steady state — null.
    return null;
  }
}

export default function () {
  return {
    homepage: load("homepage"),
    listing: load("listing"),
    posttype: load("posttype"),
  };
}
