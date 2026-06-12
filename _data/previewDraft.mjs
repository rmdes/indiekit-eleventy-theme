/**
 * Preview Draft Artifact Data (Site Builder Phase 5)
 * Reads the v4 preview-draft composition artifact written by the site-builder
 * plugin's preview-draft writer. Clone of _data/composition.mjs, with one
 * extra gate: the artifact must declare kind "preview" — anything else is
 * ignored (warn + null) so a misplaced homepage artifact can never publish a
 * preview page. Null (missing artifact) → preview.njk computes
 * `permalink: false` → no page is built.
 *
 * Runtime path: /app/data/content/_data/compositions/preview-draft.json
 * (resolves via the content/ symlink, same mechanism as _data/composition.mjs).
 * Eleventy already watches ./content/_data/compositions/; writing the draft
 * artifact triggers an incremental rebuild with zero config changes.
 *
 * schemaVersion is deliberately NOT gated here — the renderCompositionTree
 * shortcode owns that gate (warn + HTML comment), same split as composition.mjs.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default function () {
  try {
    // Resolve via the content/ symlink relative to the Eleventy project
    const artifactPath = resolve(__dirname, "..", "content", "_data", "compositions", "preview-draft.json");
    const raw = readFileSync(artifactPath, "utf8");
    const artifact = JSON.parse(raw);
    if (artifact?.kind !== "preview") {
      console.warn(`[previewDraft] artifact kind "${artifact?.kind}" is not "preview" — ignoring (no preview page will be built)`);
      return null;
    }
    console.log("[previewDraft] Loaded preview draft from _data/compositions/preview-draft.json");
    return artifact;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[previewDraft] could not load compositions/preview-draft.json: ${error.message}`);
    }
    // Missing file (no pending preview) is the normal steady state — null.
    return null;
  }
}
