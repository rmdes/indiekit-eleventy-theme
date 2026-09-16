/**
 * Overdue-build detection for the supervisor's watchdog.
 *
 * WHY THIS EXISTS: start.sh's watcher supervisor only reacts to the watcher
 * PROCESS EXITING (`EXIT_CODE=$?`). But Eleventy catches build errors in watch
 * mode and keeps watching, so a build that throws leaves a live, idle, healthy-
 * looking process behind: `Wrote 0 files in 6.02 seconds` followed by
 * `Watching…`. On 2026-09-15 rmendes sat in exactly that state for 24 hours —
 * six builds started, none finished, five posts written to content/ that 404'd
 * and never reached the frontpage. `consecutiveFailures` stayed 0 the whole
 * time because nothing crashed, and /health/build.json still said `ok` from the
 * previous day. This is the piece that notices.
 *
 * The root cause is upstream (@11ty/eleventy 3.1.2 AND 3.1.6):
 * `TemplateWriter._addToTemplateMapIncrementalBuild` calls the SYNCHRONOUS
 * `TemplateContent.isFileRelevantToThisTemplate()`, which dereferences
 * `this.engine` → `get templateRender()` and throws on any Template that has
 * not had `asyncTemplateInitialization()` run. See
 * documentation-central/docs/ for the full write-up. This module does not fix
 * that; it bounds how long we live with it.
 *
 * TWO THRESHOLDS ON PURPOSE — this is not a duplicated fact:
 *   - site-config's `isStuckBuild()` (lib/controllers/design.js) uses
 *     max(2 × lastOkDurationSeconds, 120s). It draws a BANNER. Being early and
 *     occasionally wrong costs the reader a moment of doubt.
 *   - this module uses max(4 × lastOkDurationSeconds, 900s). It KILLS THE
 *     WATCHER. Being early and wrong destroys a legitimate in-flight build.
 * Measured on rmendes (.eleventy-mem.log, 950 completed builds): warm full
 * builds run 154s median, 266s p90, 461s max, and a COLD one (empty OG cache)
 * takes ~20 minutes. A 120s trigger would kill more real builds than stuck ones.
 *
 * Shares the `state === "building"` + `startedAt` DEFINITION with
 * `isStuckBuild()` deliberately; only the tolerance differs.
 *
 * @module lib/build-watchdog
 */
import { readFileSync } from "node:fs";

import { BUILD_STATUS_PATH } from "./build-status.mjs";

/**
 * Never restart a build younger than this, whatever lastOkDurationSeconds says.
 *
 * Sized for the COLD build, not the warm one. A warm full build on rmendes runs
 * 154s median / 266s p90 / 461s max, but a build whose OG cache is empty
 * regenerates ~2,600 cards and is documented at ~20 minutes (measured 660s for
 * 2,606 posts locally). lastOkDurationSeconds is always a WARM figure, so
 * 4 x it never covers a cold build — only this floor does. A floor below the
 * cold-build time would kill a legitimate build and then kill its retry, turning
 * a slow-but-working deploy into a permanent restart loop.
 *
 * 30 minutes still converts the 24-hour silent outage this exists for into a
 * bounded one, and it is the cheap direction to be wrong in.
 */
export const RESTART_FLOOR_SECONDS = 1800;

/** Multiple of the site's own last-good build time. Self-calibrating per site. */
export const OVERDUE_MULTIPLIER = 4;

/** Stand-in when lastOkDurationSeconds is missing or garbage (4 × 60 < the floor anyway). */
export const DEFAULT_OK_SECONDS = 60;

/**
 * How long this site's builds are allowed to run before being presumed wedged.
 *
 * @param {object | null | undefined} status - Parsed build-status content
 * @returns {number} seconds
 */
export function overdueThresholdSeconds(status) {
  const lastOk =
    typeof status?.lastOkDurationSeconds === "number" && status.lastOkDurationSeconds > 0
      ? status.lastOkDurationSeconds
      : DEFAULT_OK_SECONDS;
  return Math.max(OVERDUE_MULTIPLIER * lastOk, RESTART_FLOOR_SECONDS);
}

/**
 * Has a build been "building" long enough to presume the watcher is wedged?
 *
 * Tolerant by contract, and every tolerance failure resolves to NOT overdue.
 * start.sh's crash wrapper writes this file with a dumb heredoc that drops
 * fields, so a "building" object with no parsable `startedAt` cannot be
 * measured — and killing a watcher on an unmeasurable status would be a
 * self-inflicted outage. Silence is the safe direction here.
 *
 * @param {object | null | undefined} status - Parsed build-status content
 * @param {number} nowMs - Current epoch ms (injected for tests)
 * @returns {boolean}
 */
export function isBuildOverdue(status, nowMs) {
  if (status?.state !== "building") return false;
  const startedAt =
    typeof status.startedAt === "string" ? Date.parse(status.startedAt) : Number.NaN;
  if (Number.isNaN(startedAt)) return false;
  // A startedAt in the future means a clock skew or a tampered file, not an
  // overdue build. Negative elapsed can never exceed a positive threshold, so
  // this falls out of the comparison without a special case.
  return nowMs - startedAt > overdueThresholdSeconds(status) * 1000;
}

/**
 * Read the status file and decide. Never throws: a missing or corrupt file
 * means "nothing to act on", which is the same safe direction as above.
 *
 * @param {string} [path] - Override for tests
 * @param {number} [nowMs] - Injected clock
 * @returns {{overdue: boolean, status: object | null, thresholdSeconds: number, elapsedSeconds: number | null}}
 */
export function inspectBuildStatus(path = BUILD_STATUS_PATH, nowMs = Date.now()) {
  let status = null;
  try {
    status = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    status = null;
  }
  const startedAt =
    typeof status?.startedAt === "string" ? Date.parse(status.startedAt) : Number.NaN;
  return {
    overdue: isBuildOverdue(status, nowMs),
    status,
    thresholdSeconds: overdueThresholdSeconds(status),
    elapsedSeconds: Number.isNaN(startedAt) ? null : Math.round((nowMs - startedAt) / 1000),
  };
}
