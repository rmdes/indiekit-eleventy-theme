/**
 * loadedPlugins — single source of truth for "which plugins are loaded for THIS site"
 *
 * Source: /app/data/content/_data/loaded-plugins.json
 *   - Composed at build time by indiekit-cloudron/scripts/compose-site.mjs
 *   - Baked into the image by Dockerfile
 *   - Copied into _data/ at container start by start.sh
 *
 * Output: { <pluginKey>: true } — only loaded plugins are present (truthy).
 * Missing keys evaluate falsy in Nunjucks, so templates can use:
 *   {% if loadedPlugins.cv %}<a href="/cv/">CV</a>{% endif %}
 *
 * Fallback: empty object when running theme-only (no container, no composer
 * output). Templates then skip every conditional block — same as a site with
 * zero non-core plugins.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_PATH = "/app/data/content/_data/loaded-plugins.json";
const EXAMPLE_PATH = path.join(__dirname, "loaded-plugins.example.json");

export default function loadedPlugins() {
  const source = existsSync(RUNTIME_PATH)
    ? RUNTIME_PATH
    : existsSync(EXAMPLE_PATH) ? EXAMPLE_PATH : null;

  if (!source) return {};

  try {
    const raw = readFileSync(source, "utf8");
    const data = JSON.parse(raw);
    // plugin-loadout.json has shape { selected: [{key, package, tier, version}], summary: {...}, warnings: [...] }
    // Convert to { <key>: true } for ergonomic Nunjucks access.
    if (Array.isArray(data.selected)) {
      const map = {};
      for (const entry of data.selected) {
        if (entry.key) map[entry.key] = true;
      }
      return map;
    }
    // Already a flat map (older or simpler shape) — pass through with truthy normalization.
    if (data && typeof data === "object") {
      return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, !!v]));
    }
    return {};
  } catch (err) {
    console.warn(`[loadedPlugins] Failed to read ${source}: ${err.message}`);
    return {};
  }
}
