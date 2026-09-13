/**
 * Public build-health projection — served at /health/build.json.
 *
 * WHY THIS EXISTS: on 2026-09-11 the Eleventy watcher entered a crash loop that
 * ran for 26 hours. nginx kept serving 200s the whole time (the last good build's
 * pages were still on disk), so uptime monitoring stayed green while every new
 * post 404'd. The container knew — start.sh's supervisor logged each crash and
 * backed off — but told nobody outside. This is the telling-somebody part.
 *
 * DELIBERATELY SEPARATE FROM build-status.json, which lives outside the site
 * output because it is private (it carries error strings and page paths, and is
 * read by site-config's authed API). This file is public, so it carries only a
 * state word, timestamps and counters — nothing that describes the site's
 * internals.
 *
 * WHAT "ok" MEANS: the build process completed without crashing. It does NOT
 * mean every page rendered correctly — `eleventy.after` fires on a completed
 * run, so a build that finishes while individual pages are wrong still reports
 * ok. `pageWarnings` is the only hint at that class, and it does not flip the
 * state. This file detects a build that STOPPED, not one that lied.
 *
 * Written by two processes that cannot overlap, and the reason is structural
 * rather than a convention to be careful about: the supervisor's write happens
 * after `EXIT_CODE=$?` in start.sh, i.e. only once the watcher PROCESS has
 * exited — and `eleventy.after` runs inside that process. So the read-modify-
 * write below needs no lock; a half-finished write is impossible anyway because
 * it lands via tmp+rename.
 *   - the theme's `eleventy.after` hook, on a successful build (state: "ok")
 *   - start.sh's supervisor, when the watcher exits non-zero (state: "failed")
 *
 * MONITOR ON `state` AND ON THE AGE OF `lastOkAt` — not on HTTP status, which is
 * 200 either way, and not on a stored "staleness" number. A stored age would be
 * frozen at write time, and the dangerous failure is precisely the one where
 * nothing is writing any more (supervisor dead, container wedged): the file
 * would sit there claiming `ok` forever. An absolute `lastOkAt` that stops
 * advancing is detectable; a stale counter is not.
 */
import { readFile, writeFile, rename, unlink, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export const BUILD_HEALTH_PATH = "/app/data/site/health/build.json";

/**
 * Merge the previous health file into a patch.
 *
 * Carries forward the two fields a single write cannot know on its own:
 * `lastOkAt` (a failure must not erase when the site last built) and
 * `consecutiveFailures` (which only a sequence of writes can count).
 *
 * Tolerates a missing, partial or corrupt previous — start.sh writes this file
 * too, and a half-written file must degrade to "start counting again" rather
 * than throw inside a build hook.
 *
 * @param {unknown} previous - Prior health (tolerated: null, partial, non-object)
 * @param {object} patch - `{ state, lastBuildAt, durationSeconds, pageWarnings }`
 * @returns {object} The health object to persist
 */
export function renderBuildHealth(previous, patch) {
  const prev = previous && typeof previous === "object" ? previous : {};
  const next = { ...patch };

  if (next.state === "ok") {
    next.lastOkAt = next.lastBuildAt;
    next.consecutiveFailures = 0;
  } else {
    // Preserve when the site last actually built — that timestamp ageing is the
    // signal a monitor alerts on.
    //
    // Explicit null, never an absent key: JSON.stringify drops undefined, so a
    // container that has NEVER built successfully would publish no `lastOkAt`
    // at all — and a monitor rule of the form "alert if lastOkAt is older than
    // 24h" silently matches nothing when the field is missing. That is the
    // worst case (a site that has never once built) failing open. A null is
    // visible and forces the rule to decide.
    next.lastOkAt = typeof prev.lastOkAt === "string" ? prev.lastOkAt : null;
    const prior = Number.isInteger(prev.consecutiveFailures) && prev.consecutiveFailures > 0
      ? prev.consecutiveFailures
      : 0;
    next.consecutiveFailures = prior + 1;
  }

  for (const key of ["lastBuildAt", "lastOkAt"]) {
    if (next[key] instanceof Date) next[key] = next[key].toISOString();
  }
  return next;
}

/**
 * Atomic tmp+rename write. NEVER throws — a health write must not fail a build.
 * @param {object} patch - Fields for the new health file
 * @param {string} [path] - Override for tests
 * @returns {Promise<boolean>} true if persisted
 */
export async function writeBuildHealth(patch, path = BUILD_HEALTH_PATH) {
  const tmpPath = `${path}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true });
    let previous;
    try {
      previous = JSON.parse(await readFile(path, "utf8"));
    } catch {
      previous = {}; // missing or corrupt — start fresh
    }
    const health = renderBuildHealth(previous, patch);
    await writeFile(tmpPath, `${JSON.stringify(health, null, 2)}\n`);
    await rename(tmpPath, path);
    return true;
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    console.warn(`[build-health] Write failed (build continues): ${error.message}`);
    return false;
  }
}
