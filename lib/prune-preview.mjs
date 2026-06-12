/** Preview orphan pruning (site-builder Phase 5 follow-up).
 *
 *  Preview tokens ROTATE on every publish so old /preview/<token>/ URLs die
 *  when content goes live — but the production build writes IN PLACE through
 *  --output=/app/data/site under --watch --incremental, and Eleventy never
 *  deletes orphaned output. Without pruning, every publish leaves one more
 *  stale preview directory that keeps serving 200 forever.
 *
 *  Called from the theme's eleventy.after hook on EVERY build (including
 *  incremental — that's every publish), keyed on the current draft token. */
import { readFileSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

/** Same token gate as preview.njk's permalink: URL-safe random tokens only. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Tolerant read of the preview-draft artifact's token. Mirrors the gates of
 * _data/previewDraft.mjs (kind must be "preview") plus preview.njk's token
 * regex (a malformed token never produced a preview page, so it must not keep
 * one alive). Missing/corrupt artifact, wrong kind, or malformed token → null.
 * Does NOT replace the data loader — it only answers "which preview directory
 * is current?" for pruning.
 *
 * @param {string} artifactPath - Path to compositions/preview-draft.json
 * @returns {string | null} The current token, or null when no preview should exist
 */
export function readCurrentPreviewToken(artifactPath) {
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
 * Remove every <outputDir>/preview/ DIRECTORY whose name differs from the
 * current draft token. When currentToken is null/undefined (no artifact → no
 * preview page should exist) ALL preview directories are removed. Plain files
 * inside preview/ are left alone — the preview page only ever emits
 * directories, so anything else isn't ours to delete.
 *
 * NEVER throws — a prune failure must not fail a build (warn + continue
 * per-entry). Silently no-ops when preview/ doesn't exist.
 *
 * @param {string} outputDir - The build's output directory (hook's dir.output)
 * @param {string | null | undefined} currentToken - Current preview-draft token
 * @returns {Promise<string[]>} Names of the directories removed (for logging)
 */
export async function prunePreviewOrphans(outputDir, currentToken) {
  const removed = [];
  if (!outputDir) {
    console.warn("[preview] prune skipped: no output directory provided");
    return removed;
  }

  const previewDir = join(outputDir, "preview");
  let entries;
  try {
    entries = await readdir(previewDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[preview] prune skipped: cannot read ${previewDir}: ${error.message}`);
    }
    // No preview/ output at all — nothing to prune.
    return removed;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (currentToken && entry.name === currentToken) continue;
    try {
      await rm(join(previewDir, entry.name), { recursive: true, force: true });
      removed.push(entry.name);
    } catch (error) {
      console.warn(`[preview] prune failed for ${entry.name} (build continues): ${error.message}`);
    }
  }

  return removed;
}
