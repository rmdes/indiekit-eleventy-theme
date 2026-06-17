/**
 * Collection-Default Composition Artifact (Phase 6.3)
 * Reads the v4 listing-sidebar composition artifact written by the site-config
 * plugin (`collection-default.json`). Mirrors _data/composition.mjs exactly,
 * but for the per-collection blog-listing sidebar. Falls back to null; base.njk's
 * listing-sidebar branch falls through to the full-width layout when absent.
 *
 * Shape: stack(root, [stack(complementary, <sections>, {sticky:true})]).
 *
 * Runtime path: /app/data/content/_data/compositions/collection-default.json
 * (resolves via the content/ symlink, same mechanism as _data/composition.mjs).
 * Eleventy watches ./content/_data/compositions/; on change, a rebuild picks
 * up the new composition without a Docker rebuild.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default function () {
  try {
    // Resolve via the content/ symlink relative to the Eleventy project
    const artifactPath = resolve(__dirname, "..", "content", "_data", "compositions", "collection-default.json");
    const raw = readFileSync(artifactPath, "utf8");
    const artifact = JSON.parse(raw);
    if (artifact?.schemaVersion !== 4) {
      // Return the artifact anyway — base.njk's strict listing-sidebar gate
      // falls back to the full-width layout; this warn is the loud signal
      // explaining WHY the listing sidebar didn't render.
      console.warn(`[collectionDefault] artifact schemaVersion ${artifact?.schemaVersion} unsupported (expected 4) — falling back to full-width listing`);
    } else {
      console.log("[collectionDefault] Loaded v4 artifact from _data/compositions/collection-default.json");
    }
    return artifact;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[collectionDefault] could not load compositions/collection-default.json: ${error.message}`);
    }
    // Missing file (no listing composition yet) is normal — fall through to null.
    return null;
  }
}
