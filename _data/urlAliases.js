/**
 * URL Aliases for Webmention Recovery
 *
 * Maps new URLs to their old URLs so webmentions from previous
 * URL structures can be displayed on current pages.
 *
 * Place redirect map files in the parent directory of this theme:
 * - redirects.map (e.g., micro.blog: /YYYY/MM/DD/slug.html → /notes/...)
 * - old-blog-redirects.map (e.g., Known/WP: /YYYY/slug → /content/...)
 */
import { dataLog } from "../lib/log.js";

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteUrl = process.env.SITE_URL || "https://example.com";

/**
 * Parse a redirect map file into URL mappings
 * Format: old_path new_path;
 */
function parseRedirectMap(filePath) {
  const aliases = {};

  if (!existsSync(filePath)) {
    dataLog(`[urlAliases] File not found: ${filePath}`);
    return aliases;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("#");
    });

    for (const line of lines) {
      // Format: /old/path /new/path;
      const match = line.match(/^(\S+)\s+(\S+);?$/);
      if (match) {
        const [, oldPath, newPath] = match;
        // Normalize paths (remove trailing slashes, ensure leading slash)
        const normalizedNew = newPath.replace(/;$/, "").replace(/\/$/, "");
        const normalizedOld = oldPath.replace(/\/$/, "");

        // Map new URL → array of old URLs
        if (!aliases[normalizedNew]) {
          aliases[normalizedNew] = [];
        }
        aliases[normalizedNew].push(normalizedOld);
      }
    }
  } catch (error) {
    console.error(`[urlAliases] Error parsing ${filePath}:`, error.message);
  }

  return aliases;
}

/**
 * Merge multiple alias maps
 */
function mergeAliases(...maps) {
  const merged = {};
  for (const map of maps) {
    for (const [newUrl, oldUrls] of Object.entries(map)) {
      if (!merged[newUrl]) {
        merged[newUrl] = [];
      }
      merged[newUrl].push(...oldUrls);
    }
  }
  return merged;
}

// Parse redirect maps from /app/pkg (Docker) or parent directory (local dev)
// In Docker: eleventy-site is at /app/pkg/eleventy-site, maps are at /app/pkg/
// In local dev: maps might be at ../
const pkgRoot = resolve(__dirname, "../..");

// Helper to find first existing file
function findFile(candidates) {
  for (const path of candidates) {
    if (existsSync(path)) {
      dataLog(`[urlAliases] Found: ${path}`);
      return path;
    }
  }
  dataLog(`[urlAliases] No file found in: ${candidates.join(", ")}`);
  return null;
}

// Try multiple possible locations for each map type
const microblogMapPath = findFile([
  resolve(pkgRoot, "redirects.map"),
  resolve(__dirname, "../../redirects.map"),
]);

const knownMapPath = findFile([
  resolve(pkgRoot, "old-blog-redirects.map"),
  resolve(__dirname, "../../old-blog-redirects.map"),
]);

const microblogAliases = microblogMapPath ? parseRedirectMap(microblogMapPath) : {};
const knownAliases = knownMapPath ? parseRedirectMap(knownMapPath) : {};

const allAliases = mergeAliases(microblogAliases, knownAliases);

// Log summary
const totalMappings = Object.keys(allAliases).length;
const totalOldUrls = Object.values(allAliases).reduce((sum, urls) => sum + urls.length, 0);
dataLog(`[urlAliases] Loaded ${totalMappings} URL mappings with ${totalOldUrls} old URLs`);

export default {
  // The merged alias map: new URL → [old URLs]
  aliases: allAliases,

  // Site URL for building absolute URLs
  siteUrl,

  /**
   * Get all URLs (old and new) that should be checked for webmentions
   * @param {string} url - Current page URL (relative)
   * @returns {string[]} - Array of absolute URLs to check
   */
  getAllUrls(url) {
    const normalizedUrl = url.replace(/\/$/, "");
    const urls = [
      `${siteUrl}${url}`,
      `${siteUrl}${normalizedUrl}`,
    ];

    // Add old URL variations
    const oldUrls = allAliases[normalizedUrl] || [];
    for (const oldUrl of oldUrls) {
      urls.push(`${siteUrl}${oldUrl}`);
      // Also try with trailing slash
      urls.push(`${siteUrl}${oldUrl}/`);
    }

    // Deduplicate
    return [...new Set(urls)];
  },

  /**
   * Get just the old URLs for a given new URL
   * @param {string} url - Current page URL (relative)
   * @returns {string[]} - Array of old relative URLs
   */
  getOldUrls(url) {
    const normalizedUrl = url.replace(/\/$/, "");
    return allAliases[normalizedUrl] || [];
  },
};
