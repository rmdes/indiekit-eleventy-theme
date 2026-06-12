/** Atomic build-status writer (site-builder Phase 5, spec §2.4/§5.3).
 *  Written by the theme's build hooks (building/ok) and start.sh's crash
 *  wrapper (failed). Read by site-config's authed API. Lives OUTSIDE the
 *  site output on purpose (never publicly served, survives releases). */
import { readFile, writeFile, rename, unlink } from "node:fs/promises";

export const BUILD_STATUS_PATH = "/app/data/build-status.json";

/**
 * Merge the previous status into a patch. The only field carried forward is
 * lastOkDurationSeconds — the per-site self-calibrating number the UI quotes
 * and stuck detection multiplies — so it survives building/failed writes that
 * don't supply it. Previous may be partial or garbage (start.sh's crash
 * wrapper is a dumb heredoc that may drop fields). Timestamps are stamped to
 * ISO strings (hard convention: dates are ISO 8601 strings, never Date objects).
 *
 * @param {unknown} previous - Prior status (tolerated: null, partial, non-object)
 * @param {object} patch - Fields for the new status
 * @returns {object} The status object to persist
 */
export function renderBuildStatus(previous, patch) {
  const prev = previous && typeof previous === "object" ? previous : {};
  const next = { ...patch };
  for (const key of ["startedAt", "finishedAt"]) {
    if (next[key] instanceof Date) next[key] = next[key].toISOString();
  }
  if (next.lastOkDurationSeconds === undefined && prev.lastOkDurationSeconds !== undefined) {
    next.lastOkDurationSeconds = prev.lastOkDurationSeconds;
  }
  return next;
}

/**
 * Read-previous (tolerant) → render → atomic tmp+rename. NEVER throws —
 * a status write failure must not fail a build (warn + return false).
 *
 * @param {object} patch - Fields for the new status
 * @param {string} [path] - Override for tests
 * @returns {Promise<boolean>} true if persisted
 */
export async function writeBuildStatus(patch, path = BUILD_STATUS_PATH) {
  const tmpPath = `${path}.tmp`;
  try {
    let previous;
    try {
      previous = JSON.parse(await readFile(path, "utf8"));
    } catch {
      previous = {}; // missing or corrupt — start fresh
    }
    const status = renderBuildStatus(previous, patch);
    await writeFile(tmpPath, JSON.stringify(status, null, 2));
    await rename(tmpPath, path);
    return true;
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    console.warn(`[build-status] Write failed (build continues): ${error.message}`);
    return false;
  }
}
