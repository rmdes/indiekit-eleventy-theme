/**
 * Preview orphan pruning (site-builder Phase 5 follow-up).
 *
 * Contract under test:
 * - preview tokens ROTATE on every publish, but the in-place incremental
 *   build (--output=/app/data/site, --watch --incremental) never deletes
 *   orphaned output. prunePreviewOrphans removes every <outputDir>/preview/
 *   directory whose name differs from the CURRENT draft token.
 * - no current token (null/undefined: no artifact → no preview page should
 *   exist) → ALL preview directories are removed.
 * - <outputDir>/preview/ absent → silent no-op.
 * - plain FILES inside preview/ are left alone — only directories are removed
 *   (defensive: the preview page only ever emits directories).
 * - NEVER throws — a prune failure must not fail a build (warn + continue).
 * - returns the list of removed names so the caller can log them.
 * - readCurrentPreviewToken mirrors _data/previewDraft.mjs tolerance: missing
 *   or corrupt artifact, wrong kind, or malformed token → null.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prunePreviewOrphans, readCurrentPreviewToken } from "../lib/prune-preview.mjs";

/** Make a fake build output dir with a preview/ subtree. */
const makeOutputDir = () => mkdtempSync(join(tmpdir(), "prune-preview-"));

/** Create <outputDir>/preview/<name>/index.html like the preview page emits. */
const addPreviewDir = (outputDir, name) => {
  const dir = join(outputDir, "preview", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), "<html></html>");
};

test("PRUNE: refuses a falsy outputDir (returns [], no throw)", async () => {
  assert.deepEqual(await prunePreviewOrphans(undefined, "tok"), []);
  assert.deepEqual(await prunePreviewOrphans(null, "tok"), []);
  assert.deepEqual(await prunePreviewOrphans("", "tok"), []);
});

test("PRUNE: no-op when <outputDir>/preview/ does not exist", async () => {
  const outputDir = makeOutputDir();
  assert.deepEqual(await prunePreviewOrphans(outputDir, "tok"), []);
});

test("PRUNE: current token's directory is the only entry → nothing removed", async () => {
  const outputDir = makeOutputDir();
  addPreviewDir(outputDir, "current-token");

  const removed = await prunePreviewOrphans(outputDir, "current-token");

  assert.deepEqual(removed, []);
  assert.ok(existsSync(join(outputDir, "preview", "current-token", "index.html")));
});

test("PRUNE: orphans removed, current token's directory kept", async () => {
  const outputDir = makeOutputDir();
  addPreviewDir(outputDir, "current-token");
  addPreviewDir(outputDir, "old-token-1");
  addPreviewDir(outputDir, "old-token-2");

  const removed = await prunePreviewOrphans(outputDir, "current-token");

  assert.deepEqual(removed.sort(), ["old-token-1", "old-token-2"]);
  assert.ok(existsSync(join(outputDir, "preview", "current-token")));
  assert.ok(!existsSync(join(outputDir, "preview", "old-token-1")));
  assert.ok(!existsSync(join(outputDir, "preview", "old-token-2")));
});

test("PRUNE: null token (no artifact) removes ALL preview directories", async () => {
  const outputDir = makeOutputDir();
  addPreviewDir(outputDir, "old-token-1");
  addPreviewDir(outputDir, "old-token-2");

  const removed = await prunePreviewOrphans(outputDir, null);

  assert.deepEqual(removed.sort(), ["old-token-1", "old-token-2"]);
  assert.deepEqual(readdirSync(join(outputDir, "preview")), []);
});

test("PRUNE: undefined token behaves like null (removes all)", async () => {
  const outputDir = makeOutputDir();
  addPreviewDir(outputDir, "old-token");

  const removed = await prunePreviewOrphans(outputDir, undefined);

  assert.deepEqual(removed, ["old-token"]);
});

test("PRUNE: plain files inside preview/ are left alone", async () => {
  const outputDir = makeOutputDir();
  mkdirSync(join(outputDir, "preview"), { recursive: true });
  writeFileSync(join(outputDir, "preview", "stray.html"), "<html></html>");
  addPreviewDir(outputDir, "old-token");

  const removed = await prunePreviewOrphans(outputDir, "current-token");

  assert.deepEqual(removed, ["old-token"]);
  assert.ok(existsSync(join(outputDir, "preview", "stray.html")));
});

test("PRUNE: never throws when preview path is unreadable (e.g. a file, not a dir)", async () => {
  const outputDir = makeOutputDir();
  writeFileSync(join(outputDir, "preview"), "not a directory");

  let removed;
  await assert.doesNotReject(async () => {
    removed = await prunePreviewOrphans(outputDir, "tok");
  });
  assert.deepEqual(removed, []);
});

// --- readCurrentPreviewToken (tolerant artifact read, same gates as the loader + preview.njk) ---

const artifactPath = () =>
  join(mkdtempSync(join(tmpdir(), "prune-preview-artifact-")), "preview-draft.json");

test("TOKEN: returns the token from a kind 'preview' artifact", () => {
  const path = artifactPath();
  writeFileSync(path, JSON.stringify({ kind: "preview", token: "abc_DEF-123" }));
  assert.equal(readCurrentPreviewToken(path), "abc_DEF-123");
});

test("TOKEN: missing artifact → null (normal steady state)", () => {
  assert.equal(readCurrentPreviewToken("/nonexistent/preview-draft.json"), null);
});

test("TOKEN: corrupt JSON → null", () => {
  const path = artifactPath();
  writeFileSync(path, "{ not json");
  assert.equal(readCurrentPreviewToken(path), null);
});

test("TOKEN: wrong kind → null (a misplaced homepage artifact never keeps a preview alive)", () => {
  const path = artifactPath();
  writeFileSync(path, JSON.stringify({ kind: "homepage", token: "abc" }));
  assert.equal(readCurrentPreviewToken(path), null);
});

test("TOKEN: malformed token (fails the preview.njk regex) → null", () => {
  const path = artifactPath();
  writeFileSync(path, JSON.stringify({ kind: "preview", token: "../evil" }));
  assert.equal(readCurrentPreviewToken(path), null);

  writeFileSync(path, JSON.stringify({ kind: "preview", token: 42 }));
  assert.equal(readCurrentPreviewToken(path), null);

  writeFileSync(path, JSON.stringify({ kind: "preview" }));
  assert.equal(readCurrentPreviewToken(path), null);
});
