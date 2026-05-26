/**
 * Homepage Configuration Data
 * Reads composition config (sections, sidebar, footer, hero, layout) from
 * @rmdes/indiekit-endpoint-site-config (which absorbed the homepage plugin
 * in the v1.0.0-beta.1 unification). Falls back to null — home.njk then
 * uses the default layout.
 *
 * Runtime path: /app/data/content/_data/homepage.json (resolves via the
 * content/ symlink). Eleventy watches this file; on change, a rebuild
 * picks up the new composition without a Docker rebuild.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default function () {
  try {
    // Resolve via the content/ symlink relative to the Eleventy project
    const configPath = resolve(__dirname, "..", "content", "_data", "homepage.json");
    const raw = readFileSync(configPath, "utf8");
    const config = JSON.parse(raw);
    console.log("[homepageConfig] Loaded plugin config from _data/homepage.json");
    return config;
  } catch {
    // No site-config plugin homepage.json yet — first boot or theme-only dev
    return null;
  }
}
