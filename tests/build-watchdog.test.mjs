/**
 * Overdue-build detection (lib/build-watchdog.mjs).
 *
 * This decides whether to KILL a running Eleventy watcher, so the tests lean
 * hard on the direction that costs something: a false positive destroys a
 * legitimate in-flight build and hands the site a partial output tree. Every
 * unmeasurable or malformed input must resolve to "not overdue".
 *
 * The real numbers behind the thresholds come from rmendes's .eleventy-mem.log
 * (950 completed builds): full builds 154s median, 266s p90, 461s max. The
 * "a real 461s build is not killed" case below is that worst observation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  isBuildOverdue,
  overdueThresholdSeconds,
  inspectBuildStatus,
  RESTART_FLOOR_SECONDS,
  DEFAULT_OK_SECONDS,
  OVERDUE_MULTIPLIER,
} from "../lib/build-watchdog.mjs";

const NOW = Date.parse("2026-09-15T18:30:00.000Z");
const building = (agoSeconds, extra = {}) => ({
  state: "building",
  buildId: "b1",
  startedAt: new Date(NOW - agoSeconds * 1000).toISOString(),
  ...extra,
});

// --- the threshold ---

test("threshold is the floor when the site has no recorded good build", () => {
  assert.equal(overdueThresholdSeconds(undefined), RESTART_FLOOR_SECONDS);
  assert.equal(overdueThresholdSeconds({}), RESTART_FLOOR_SECONDS);
  // 4 x 60 = 240 < 900, so the floor still wins with the default.
  assert.equal(OVERDUE_MULTIPLIER * DEFAULT_OK_SECONDS < RESTART_FLOOR_SECONDS, true);
});

test("threshold self-calibrates upward for a slow site", () => {
  // A site whose good builds take 5 minutes gets 20 minutes of rope.
  assert.equal(overdueThresholdSeconds({ lastOkDurationSeconds: 300 }), 1200);
});

test("a fast site is never given LESS than the floor", () => {
  // 55s incremental x 4 = 220s, which would kill real full builds. Floor wins.
  assert.equal(overdueThresholdSeconds({ lastOkDurationSeconds: 55 }), RESTART_FLOOR_SECONDS);
});

test("garbage lastOkDurationSeconds falls back to the default, not NaN", () => {
  for (const bad of [0, -10, "60", null, Number.NaN, {}]) {
    assert.equal(
      overdueThresholdSeconds({ lastOkDurationSeconds: bad }),
      RESTART_FLOOR_SECONDS,
      `lastOkDurationSeconds=${JSON.stringify(bad)}`,
    );
  }
});

// --- the dangerous direction: do not kill real builds ---

test("the slowest build ever observed on rmendes (461s) is NOT overdue", () => {
  assert.equal(isBuildOverdue(building(461, { lastOkDurationSeconds: 55 }), NOW), false);
});

test("a build one second under the threshold is NOT overdue", () => {
  assert.equal(isBuildOverdue(building(RESTART_FLOOR_SECONDS - 1), NOW), false);
});

test("a terminal state is never overdue, however old", () => {
  for (const state of ["ok", "failed", "unknown"]) {
    assert.equal(
      isBuildOverdue({ state, finishedAt: "2020-01-01T00:00:00.000Z" }, NOW),
      false,
      state,
    );
  }
});

test("an unmeasurable 'building' is never overdue", () => {
  // start.sh's crash wrapper writes this file with a heredoc that drops fields.
  // Killing on a status we cannot measure would be a self-inflicted outage.
  assert.equal(isBuildOverdue({ state: "building" }, NOW), false);
  assert.equal(isBuildOverdue({ state: "building", startedAt: "not a date" }, NOW), false);
  assert.equal(isBuildOverdue({ state: "building", startedAt: 1_757_000_000 }, NOW), false);
  assert.equal(isBuildOverdue(null, NOW), false);
  assert.equal(isBuildOverdue(undefined, NOW), false);
  assert.equal(isBuildOverdue("building", NOW), false);
});

test("a startedAt in the future is not overdue", () => {
  assert.equal(isBuildOverdue(building(-3600), NOW), false);
});

// --- the case this module exists for ---

test("the 2026-09-15 incident is detected", () => {
  // Real shape: state stuck at "building" since 18:13:47 while the process
  // stayed alive. Threshold for that site was the 900s floor (55s increments).
  const incident = {
    state: "building",
    buildId: "722877f2-65b2-4a02-8094-db12ec97752a",
    startedAt: "2026-09-15T18:13:47.494Z",
    lastOkDurationSeconds: 55.3,
  };
  const oneHourLater = Date.parse("2026-09-15T19:13:47.494Z");
  assert.equal(isBuildOverdue(incident, oneHourLater), true);

  // ...and was NOT yet flagged five minutes in, while a full build could still
  // plausibly have been running.
  const fiveMinutesLater = Date.parse("2026-09-15T18:18:47.494Z");
  assert.equal(isBuildOverdue(incident, fiveMinutesLater), false);
});

// --- the file reader ---

test("inspectBuildStatus reports elapsed and threshold alongside the verdict", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchdog-"));
  const path = join(dir, "build-status.json");
  await writeFile(path, JSON.stringify(building(1000, { lastOkDurationSeconds: 55.3 })));

  const result = inspectBuildStatus(path, NOW);
  assert.equal(result.overdue, true);
  assert.equal(result.elapsedSeconds, 1000);
  assert.equal(result.thresholdSeconds, RESTART_FLOOR_SECONDS);
  assert.equal(result.status.buildId, "b1");
});

test("a missing or corrupt status file is not overdue and does not throw", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchdog-"));
  assert.equal(inspectBuildStatus(join(dir, "nope.json"), NOW).overdue, false);

  const bad = join(dir, "build-status.json");
  await writeFile(bad, "{ truncated");
  const result = inspectBuildStatus(bad, NOW);
  assert.equal(result.overdue, false);
  assert.equal(result.status, null);
  assert.equal(result.elapsedSeconds, null);
});
