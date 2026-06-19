/** Per-surface preview orphan pruning (Phase 6.5, #32-T4).
 *
 *  Preview tokens ROTATE on every publish so old preview URLs die when content
 *  goes live — but the production build writes IN PLACE through
 *  --output=/app/data/site under --watch --incremental, and Eleventy never
 *  deletes orphaned output. Without pruning, every publish leaves one more
 *  stale preview directory that keeps serving 200 forever.
 *
 *  The output structure is now PER-SURFACE: <outputDir>/preview/<routeKey>/<token>/
 *  (was the flat <outputDir>/preview/<token>/ of the single-slot design). This
 *  module prunes each surface to its current token AND sweeps the legacy flat
 *  token dirs left at the top level by the old structure (migration cleanup).
 *
 *  Called from the theme's eleventy.after hook on EVERY build (including
 *  incremental — that's every publish), keyed on the current per-surface
 *  tokens. */
import { readFileSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

/** The known preview surfaces — single source of truth.
 *  `pages` (6.5) is the SHARED standalone-page preview slot: every standalone
 *  page shares routeKey "pages" (only the per-slug surfaceId varies), so one
 *  slot/artifact/token is rotated and pruned exactly like the singletons. */
export const PREVIEW_SURFACES = ["homepage", "listing", "posttype", "pages"];

/** Same token gate as the preview templates' permalink: URL-safe random tokens only. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Tolerant read of one per-surface preview artifact's token. Mirrors the gates
 * of _data/previews.mjs (kind must be "preview") plus the preview templates'
 * token regex (a malformed token never produced a preview page, so it must not
 * keep one alive). Missing/corrupt artifact, wrong kind, or malformed token → null.
 *
 * @param {string} artifactPath - Path to compositions/preview-<routeKey>.json
 * @returns {string | null} The current token, or null when no preview should exist
 */
function readTokenForSurface(artifactPath) {
  try {
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    if (artifact?.kind !== "preview") return null;
    const token = artifact.token;
    return typeof token === "string" && TOKEN_PATTERN.test(token) ? token : null;
  } catch {
    // Missing file (no pending preview) is the normal steady state.
    return null;
  }
}

/**
 * Read the current preview token for EACH surface from its per-surface artifact.
 * Returns a map keyed by routeKey. Does NOT replace the data loader — it only
 * answers "which preview directory is current per surface?" for pruning.
 *
 * @param {string} compositionsDir - Path to content/_data/compositions/
 * @returns {{ [routeKey: string]: string | null }} Map of routeKey → current token (or null)
 */
export function readCurrentPreviewTokens(compositionsDir) {
  const tokens = {};
  for (const surface of PREVIEW_SURFACES) {
    tokens[surface] = readTokenForSurface(join(compositionsDir, `preview-${surface}.json`));
  }
  return tokens;
}

/**
 * Remove orphaned preview output for the per-surface structure
 * <outputDir>/preview/<routeKey>/<token>/. For EACH surface, every token-dir
 * under <outputDir>/preview/<routeKey>/ whose name differs from the current
 * token is removed (null token → remove ALL token-dirs under that surface).
 *
 * Additionally, at the TOP level <outputDir>/preview/, any entry that is NOT a
 * known routeKey directory is swept — these are LEGACY flat /preview/<token>/
 * dirs from the old single-slot structure (migration cleanup). The known
 * routeKey directories themselves are NEVER deleted at this level; only their
 * stale children are pruned.
 *
 * Plain files (not directories) are left alone — preview output only ever emits
 * directories, so anything else isn't ours to delete.
 *
 * NEVER throws — a prune failure must not fail a build (warn + continue
 * per-entry). Silently no-ops when preview/ (or a surface dir) doesn't exist.
 *
 * @param {string} outputDir - The build's output directory (hook's dir.output)
 * @param {{ [routeKey: string]: string | null }} tokensByRoute - Current token per surface
 * @returns {Promise<string[]>} Paths (relative to preview/) of the directories removed
 */
export async function prunePreviewOrphans(outputDir, tokensByRoute = {}) {
  const removed = [];
  if (!outputDir) {
    console.warn("[preview] prune skipped: no output directory provided");
    return removed;
  }

  const previewDir = join(outputDir, "preview");
  let topEntries;
  try {
    topEntries = await readdir(previewDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[preview] prune skipped: cannot read ${previewDir}: ${error.message}`);
    }
    // No preview/ output at all — nothing to prune.
    return removed;
  }

  // 1. Top-level sweep: remove any directory that is NOT a known routeKey.
  //    These are legacy flat /preview/<token>/ dirs from the old structure.
  for (const entry of topEntries) {
    if (!entry.isDirectory()) continue;
    if (PREVIEW_SURFACES.includes(entry.name)) continue;
    try {
      await rm(join(previewDir, entry.name), { recursive: true, force: true });
      removed.push(entry.name);
    } catch (error) {
      console.warn(`[preview] prune failed for legacy ${entry.name} (build continues): ${error.message}`);
    }
  }

  // 2. Per-surface prune: under each <preview>/<routeKey>/, keep only the
  //    current token dir (null → remove all).
  for (const surface of PREVIEW_SURFACES) {
    const surfaceDir = join(previewDir, surface);
    const currentToken = tokensByRoute[surface] ?? null;
    let surfaceEntries;
    try {
      surfaceEntries = await readdir(surfaceDir, { withFileTypes: true });
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn(`[preview] prune skipped for ${surface}: cannot read ${surfaceDir}: ${error.message}`);
      }
      // No output for this surface — nothing to prune.
      continue;
    }

    for (const entry of surfaceEntries) {
      if (!entry.isDirectory()) continue;
      if (currentToken && entry.name === currentToken) continue;
      try {
        await rm(join(surfaceDir, entry.name), { recursive: true, force: true });
        removed.push(join(surface, entry.name));
      } catch (error) {
        console.warn(`[preview] prune failed for ${surface}/${entry.name} (build continues): ${error.message}`);
      }
    }
  }

  return removed;
}
