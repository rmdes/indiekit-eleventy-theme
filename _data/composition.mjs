/**
 * Composition Artifact Data (Site Builder Phase 1)
 * Reads the v4 homepage composition artifact written by the site-builder
 * (future phases) — or the hand-written Phase-1 fixture. Falls back to null;
 * home.njk then uses the homepage-builder / default layout paths unchanged.
 *
 * Runtime path: /app/data/content/_data/compositions/homepage.json (resolves
 * via the content/ symlink, same mechanism as _data/homepageConfig.js).
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
    const artifactPath = resolve(__dirname, "..", "content", "_data", "compositions", "homepage.json");
    const raw = readFileSync(artifactPath, "utf8");
    const artifact = JSON.parse(raw);
    if (artifact?.schemaVersion !== 4) {
      // Return the artifact anyway — home.njk's strict Tier-0 gate falls back
      // to the homepage builder/default tiers; this warn is the loud signal
      // explaining WHY the composition didn't render.
      console.warn(`[composition] artifact schemaVersion ${artifact?.schemaVersion} unsupported (expected 4) — falling back to homepage builder/default`);
    } else {
      console.log("[composition] Loaded v4 artifact from _data/compositions/homepage.json");
    }
    return artifact;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[composition] could not load compositions/homepage.json: ${error.message}`);
    }
    // Missing file (no site-builder composition yet) is normal — fall through to null.
    return null;
  }
}
