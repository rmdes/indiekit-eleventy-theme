/**
 * Block Catalog Data (Site Builder Phase 3)
 * Loads the block catalog artifact written by @rmdes/indiekit-endpoint-site-config
 * at boot (block-catalog.json). Shape: { catalogVersion, generatedAt, blocks: [...] }.
 * Returns { byId: {id → entry}, available: true } or { byId: {}, available: false }
 * when absent (fresh installs, theme-only dev) — the renderer falls back to
 * convention-based resolution then.
 *
 * Runtime path: /app/data/content/_data/block-catalog.json (resolves via the
 * content/ symlink, same mechanism as _data/composition.mjs). Eleventy watches
 * the file; on change, a rebuild picks up the new catalog without a Docker
 * rebuild.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default function () {
  try {
    const path = resolve(__dirname, "..", "content", "_data", "block-catalog.json");
    const artifact = JSON.parse(readFileSync(path, "utf8"));
    if (artifact?.catalogVersion !== 1 || !Array.isArray(artifact.blocks)) {
      console.warn(`[composition] block-catalog.json has unexpected shape (catalogVersion ${artifact?.catalogVersion}) — catalog-driven dispatch disabled`);
      return { byId: {}, available: false };
    }
    const byId = {};
    for (const block of artifact.blocks) byId[block.id] = block;
    console.log(`[composition] Loaded block catalog (${artifact.blocks.length} blocks)`);
    return { byId, available: true };
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[composition] could not load block-catalog.json: ${error.message}`);
    }
    // Missing file (no site-config catalog yet) is normal — convention fallback.
    return { byId: {}, available: false };
  }
}
