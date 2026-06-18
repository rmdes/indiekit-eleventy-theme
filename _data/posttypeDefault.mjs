/**
 * PostType-Default Composition Artifact (Phase 6.4)
 * Reads the v4 post-page-sidebar composition artifact written by the site-config
 * plugin (`posttype-default.json`). Mirrors _data/collectionDefault.mjs exactly,
 * but for the per-post-type sidebar rendered on individual post pages. Falls back
 * to null; base.njk's post-sidebar branch falls through to the full-width layout
 * when absent.
 *
 * Shape: stack(root, [stack(complementary, <sections>, {sticky:true})]).
 *
 * Runtime path: /app/data/content/_data/compositions/posttype-default.json
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
    const artifactPath = resolve(__dirname, "..", "content", "_data", "compositions", "posttype-default.json");
    const raw = readFileSync(artifactPath, "utf8");
    const artifact = JSON.parse(raw);
    if (artifact?.schemaVersion !== 4) {
      // Return the artifact anyway — base.njk's strict post-sidebar gate
      // falls back to the full-width layout; this warn is the loud signal
      // explaining WHY the post sidebar didn't render.
      console.warn(`[posttypeDefault] artifact schemaVersion ${artifact?.schemaVersion} unsupported (expected 4) — falling back to full-width post`);
    } else {
      console.log("[posttypeDefault] Loaded v4 artifact from _data/compositions/posttype-default.json");
    }
    return artifact;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[posttypeDefault] could not load compositions/posttype-default.json: ${error.message}`);
    }
    // Missing file (no post-type composition yet) is normal — fall through to null.
    return null;
  }
}
