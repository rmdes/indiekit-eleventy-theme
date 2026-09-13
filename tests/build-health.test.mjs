/**
 * Public build-health projection (lib/build-health.mjs).
 *
 * This file is the only outward signal that a site has stopped building — nginx
 * serves the last good build's pages with 200s through a crash loop, so uptime
 * monitoring stays green. The merge logic is what makes it useful: a failure
 * must NOT erase when the site last built, and the failure count must survive
 * across writes made by two different processes (the theme's build hook and
 * start.sh's supervisor).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderBuildHealth, writeBuildHealth } from "../lib/build-health.mjs";

// --- success clears, failure accumulates ---

test("a successful build sets lastOkAt and clears the failure count", () => {
  const out = renderBuildHealth(
    { state: "failed", consecutiveFailures: 37, lastOkAt: "2026-09-11T15:43:51.000Z" },
    { state: "ok", lastBuildAt: "2026-09-12T17:41:15.000Z" },
  );
  assert.equal(out.state, "ok");
  assert.equal(out.lastOkAt, "2026-09-12T17:41:15.000Z");
  assert.equal(out.consecutiveFailures, 0);
});

test("a failure preserves lastOkAt — that timestamp ageing is the alert signal", () => {
  const out = renderBuildHealth(
    { state: "ok", lastOkAt: "2026-09-11T15:43:51.000Z", consecutiveFailures: 0 },
    { state: "failed", lastBuildAt: "2026-09-11T15:46:20.000Z" },
  );
  assert.equal(out.state, "failed");
  assert.equal(out.lastOkAt, "2026-09-11T15:43:51.000Z", "must not be erased by a failure");
  assert.equal(out.consecutiveFailures, 1);
});

test("consecutive failures accumulate across writes", () => {
  let health = {};
  for (let i = 1; i <= 40; i++) {
    health = renderBuildHealth(health, { state: "failed", lastBuildAt: "2026-09-12T00:00:00.000Z" });
    assert.equal(health.consecutiveFailures, i);
  }
  // 40 crashes and still no successful build in this container. lastOkAt must
  // be an explicit null, NOT an absent key: JSON.stringify drops undefined, and
  // a monitor rule like "alert if lastOkAt older than 24h" silently matches
  // nothing against a missing field — the never-built site would fail open.
  assert.equal(health.lastOkAt, null);
  assert.ok("lastOkAt" in health, "the key must be present even when unknown");
});

test("a never-built site publishes lastOkAt as null, not as a missing key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "build-health-"));
  const path = join(dir, "health", "build.json");
  await writeBuildHealth({ state: "failed", lastBuildAt: "2026-09-13T00:00:00.000Z" }, path);

  const raw = await readFile(path, "utf8");
  assert.match(raw, /"lastOkAt": null/, raw);
  assert.equal(JSON.parse(raw).lastOkAt, null);
});

// --- tolerance: start.sh writes this file too ---

test("a missing, partial or corrupt previous degrades instead of throwing", () => {
  for (const previous of [null, undefined, "garbage", 42, [], {}]) {
    const out = renderBuildHealth(previous, { state: "failed", lastBuildAt: "2026-09-12T00:00:00.000Z" });
    assert.equal(out.consecutiveFailures, 1, `previous=${JSON.stringify(previous)}`);
  }
});

test("a nonsensical stored failure count restarts from 1 rather than propagating", () => {
  for (const bad of [-5, 1.5, "12", null]) {
    const out = renderBuildHealth({ consecutiveFailures: bad }, { state: "failed", lastBuildAt: "x" });
    assert.equal(out.consecutiveFailures, 1, `stored=${JSON.stringify(bad)}`);
  }
});

test("Date objects are stamped to ISO strings (hard convention in this codebase)", () => {
  const out = renderBuildHealth({}, { state: "ok", lastBuildAt: new Date("2026-09-12T17:41:15.000Z") });
  assert.equal(out.lastBuildAt, "2026-09-12T17:41:15.000Z");
  assert.equal(out.lastOkAt, "2026-09-12T17:41:15.000Z");
});

// --- the public projection must stay public-safe ---

test("only the projected fields are written — no error strings or page paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "build-health-"));
  const path = join(dir, "health", "build.json");

  await writeBuildHealth(
    { state: "ok", lastBuildAt: "2026-09-12T17:41:15.000Z", durationSeconds: 160.2, incremental: true, pageWarnings: 0 },
    path,
  );
  const written = JSON.parse(await readFile(path, "utf8"));

  assert.deepEqual(
    Object.keys(written).sort(),
    ["consecutiveFailures", "durationSeconds", "incremental", "lastBuildAt", "lastOkAt", "pageWarnings", "state"],
  );
  // pageWarnings is a COUNT here; build-status.json keeps the array with paths.
  assert.equal(typeof written.pageWarnings, "number");
});

test("writeBuildHealth creates the directory and never throws on an unusable path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "build-health-"));
  assert.equal(await writeBuildHealth({ state: "ok", lastBuildAt: "x" }, join(dir, "deep", "nested", "build.json")), true);

  // An unusable path must warn and return false, not reject — this runs inside
  // a build hook and inside start.sh's supervisor, where throwing would turn a
  // monitoring write into an outage. A regular file standing where a directory
  // is needed reproduces that (ENOTDIR) without touching anything outside tmp.
  const blocker = join(dir, "blocker");
  await writeFile(blocker, "not a directory");
  assert.equal(await writeBuildHealth({ state: "ok", lastBuildAt: "x" }, join(blocker, "build.json")), false);
});

test("a full crash-loop then recovery reads correctly end to end", async () => {
  const dir = await mkdtemp(join(tmpdir(), "build-health-"));
  const path = join(dir, "health", "build.json");

  await writeBuildHealth({ state: "ok", lastBuildAt: "2026-09-11T15:43:51.000Z" }, path);
  for (let i = 0; i < 40; i++) {
    await writeBuildHealth({ state: "failed", lastBuildAt: "2026-09-12T00:00:00.000Z" }, path);
  }

  let health = JSON.parse(await readFile(path, "utf8"));
  assert.equal(health.state, "failed");
  assert.equal(health.consecutiveFailures, 40);
  assert.equal(health.lastOkAt, "2026-09-11T15:43:51.000Z", "26 hours of crashes must not erase this");

  await writeBuildHealth({ state: "ok", lastBuildAt: "2026-09-12T17:41:15.000Z" }, path);
  health = JSON.parse(await readFile(path, "utf8"));
  assert.equal(health.state, "ok");
  assert.equal(health.consecutiveFailures, 0);
  assert.equal(health.lastOkAt, "2026-09-12T17:41:15.000Z");
});
