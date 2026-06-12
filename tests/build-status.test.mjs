/**
 * Atomic build-status writer (site-builder Phase 5, spec §2.4/§5.3).
 *
 * Contract under test:
 * - lastOkDurationSeconds is carried forward on every write where the patch
 *   doesn't supply it (the UI quotes it; stuck detection multiplies it)
 * - the reader is tolerant of partial/corrupt previous files (start.sh's
 *   crash wrapper is a dumb heredoc that may drop fields)
 * - writes are atomic (tmp + rename, no .tmp leftovers)
 * - the writer NEVER throws — a status failure must not fail a build
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BUILD_STATUS_PATH,
  renderBuildStatus,
  writeBuildStatus,
} from "../lib/build-status.mjs";

const statusPath = () => join(mkdtempSync(join(tmpdir(), "build-status-")), "build-status.json");
const readStatus = (path) => JSON.parse(readFileSync(path, "utf8"));

test("BUILD_STATUS_PATH lives outside the site output", () => {
  assert.equal(BUILD_STATUS_PATH, "/app/data/build-status.json");
});

test("renderBuildStatus carries lastOkDurationSeconds forward when patch omits it", () => {
  const previous = { state: "ok", buildId: "a", lastOkDurationSeconds: 42 };
  const next = renderBuildStatus(previous, { state: "building", buildId: "b" });
  assert.equal(next.state, "building");
  assert.equal(next.buildId, "b");
  assert.equal(next.lastOkDurationSeconds, 42);
});

test("renderBuildStatus lets the patch override lastOkDurationSeconds", () => {
  const previous = { state: "ok", lastOkDurationSeconds: 42 };
  const next = renderBuildStatus(previous, { state: "ok", lastOkDurationSeconds: 7 });
  assert.equal(next.lastOkDurationSeconds, 7);
});

test("renderBuildStatus tolerates partial previous objects (start.sh heredoc drops fields)", () => {
  assert.deepEqual(renderBuildStatus({ state: "failed" }, { state: "building", buildId: "c" }), {
    state: "building",
    buildId: "c",
  });
  assert.deepEqual(renderBuildStatus(null, { state: "building" }), { state: "building" });
  assert.deepEqual(renderBuildStatus("garbage", { state: "building" }), { state: "building" });
});

test("renderBuildStatus stamps Date timestamps as ISO strings", () => {
  const startedAt = new Date("2026-06-12T10:00:00.000Z");
  const next = renderBuildStatus({}, { state: "building", startedAt });
  assert.equal(next.startedAt, "2026-06-12T10:00:00.000Z");
  assert.equal(typeof next.startedAt, "string");
});

test("writeBuildStatus: building → ok merge carries lastOkDurationSeconds", async () => {
  const path = statusPath();
  assert.equal(
    await writeBuildStatus(
      { state: "ok", buildId: "b1", durationSeconds: 90, lastOkDurationSeconds: 90 },
      path,
    ),
    true,
  );
  assert.equal(await writeBuildStatus({ state: "building", buildId: "b2" }, path), true);

  const status = readStatus(path);
  assert.equal(status.state, "building");
  assert.equal(status.buildId, "b2");
  assert.equal(status.lastOkDurationSeconds, 90);
  assert.equal(status.durationSeconds, undefined);
});

test("writeBuildStatus: failed write preserves lastOkDurationSeconds", async () => {
  const path = statusPath();
  await writeBuildStatus({ state: "ok", buildId: "b1", lastOkDurationSeconds: 33 }, path);
  await writeBuildStatus({ state: "failed", buildId: "b2", error: "boom" }, path);

  const status = readStatus(path);
  assert.equal(status.state, "failed");
  assert.equal(status.error, "boom");
  assert.equal(status.lastOkDurationSeconds, 33);
});

test("writeBuildStatus tolerates a corrupt previous file", async () => {
  const path = statusPath();
  writeFileSync(path, "{ not json");
  assert.equal(await writeBuildStatus({ state: "building", buildId: "b1" }, path), true);
  assert.equal(readStatus(path).state, "building");
});

test("writeBuildStatus leaves no tmp files behind", async () => {
  const path = statusPath();
  await writeBuildStatus({ state: "building", buildId: "b1" }, path);
  await writeBuildStatus({ state: "ok", buildId: "b1" }, path);

  const dir = join(path, "..");
  assert.deepEqual(readdirSync(dir), ["build-status.json"]);
});

test("writeBuildStatus never throws on an unwritable path", async () => {
  const bogus = "/nonexistent-dir-for-build-status-test/build-status.json";
  let result;
  await assert.doesNotReject(async () => {
    result = await writeBuildStatus({ state: "building", buildId: "b1" }, bogus);
  });
  assert.equal(result, false);
});
