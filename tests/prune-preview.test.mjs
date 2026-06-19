/**
 * Per-surface preview orphan pruning (#32-T4).
 *
 * Contract under test (the per-surface structure
 * <outputDir>/preview/<routeKey>/<token>/):
 * - preview tokens ROTATE on every publish, but the in-place incremental build
 *   never deletes orphaned output. For EACH surface, prunePreviewOrphans keeps
 *   only the current token dir under <preview>/<routeKey>/ and removes the rest.
 * - a surface's null/absent current token → ALL its token dirs are removed.
 * - TOP-LEVEL sweep: any <preview>/<name> that is NOT a known routeKey dir is a
 *   LEGACY flat /preview/<token>/ dir from the old single-slot design → removed
 *   (migration cleanup). The routeKey dirs themselves are never deleted here.
 * - surfaces are INDEPENDENT — pruning one never touches another's current token.
 * - <preview>/ absent (or a surface dir absent) → silent no-op.
 * - plain FILES are left alone — preview output only ever emits directories.
 * - NEVER throws — a prune failure must not fail a build (warn + continue).
 * - returns the list of removed paths (legacy = bare name; per-surface =
 *   "<routeKey>/<token>") so the caller can log them.
 * - readCurrentPreviewTokens reads each preview-<routeKey>.json with the loader's
 *   tolerance (kind must be "preview", token must pass the URL-safe regex);
 *   missing/corrupt/wrong-kind/malformed → null for that surface.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  prunePreviewOrphans,
  readCurrentPreviewTokens,
  PREVIEW_SURFACES,
} from "../lib/prune-preview.mjs";

/** Make a fake build output dir with a preview/ subtree. */
const makeOutputDir = () => mkdtempSync(join(tmpdir(), "prune-preview-"));

/** Create <outputDir>/preview/<routeKey>/<token>/index.html like a preview page emits. */
const addPreviewDir = (outputDir, routeKey, token) => {
  const dir = join(outputDir, "preview", routeKey, token);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), "<html></html>");
};

/** Create a LEGACY flat <outputDir>/preview/<token>/ dir (old single-slot output). */
const addLegacyFlatDir = (outputDir, token) => {
  const dir = join(outputDir, "preview", token);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), "<html></html>");
};

const allTokens = (overrides = {}) => ({
  homepage: null,
  listing: null,
  posttype: null,
  pages: null,
  ...overrides,
});

test("SURFACES: the known routeKeys are homepage/listing/posttype/pages", () => {
  assert.deepEqual([...PREVIEW_SURFACES].sort(), ["homepage", "listing", "pages", "posttype"]);
});

test("PRUNE: refuses a falsy outputDir (returns [], no throw)", async () => {
  assert.deepEqual(await prunePreviewOrphans(undefined, allTokens()), []);
  assert.deepEqual(await prunePreviewOrphans(null, allTokens()), []);
  assert.deepEqual(await prunePreviewOrphans("", allTokens()), []);
});

test("PRUNE: no-op when <outputDir>/preview/ does not exist", async () => {
  const outputDir = makeOutputDir();
  assert.deepEqual(await prunePreviewOrphans(outputDir, allTokens()), []);
});

test("PRUNE: each surface keeps its current token dir → nothing removed", async () => {
  const outputDir = makeOutputDir();
  addPreviewDir(outputDir, "homepage", "tok-home");
  addPreviewDir(outputDir, "listing", "tok-list");
  addPreviewDir(outputDir, "posttype", "tok-post");

  const removed = await prunePreviewOrphans(
    outputDir,
    allTokens({ homepage: "tok-home", listing: "tok-list", posttype: "tok-post" }),
  );

  assert.deepEqual(removed, []);
  assert.ok(existsSync(join(outputDir, "preview", "homepage", "tok-home")));
  assert.ok(existsSync(join(outputDir, "preview", "listing", "tok-list")));
  assert.ok(existsSync(join(outputDir, "preview", "posttype", "tok-post")));
});

test("PRUNE: stale token dirs removed, current kept (per surface)", async () => {
  const outputDir = makeOutputDir();
  addPreviewDir(outputDir, "listing", "tok-current");
  addPreviewDir(outputDir, "listing", "tok-old-1");
  addPreviewDir(outputDir, "listing", "tok-old-2");

  const removed = await prunePreviewOrphans(outputDir, allTokens({ listing: "tok-current" }));

  assert.deepEqual(removed.sort(), [join("listing", "tok-old-1"), join("listing", "tok-old-2")]);
  assert.ok(existsSync(join(outputDir, "preview", "listing", "tok-current")));
  assert.ok(!existsSync(join(outputDir, "preview", "listing", "tok-old-1")));
  assert.ok(!existsSync(join(outputDir, "preview", "listing", "tok-old-2")));
});

test("PRUNE: a surface's null token removes ALL its token dirs", async () => {
  const outputDir = makeOutputDir();
  addPreviewDir(outputDir, "posttype", "tok-1");
  addPreviewDir(outputDir, "posttype", "tok-2");

  const removed = await prunePreviewOrphans(outputDir, allTokens({ posttype: null }));

  assert.deepEqual(removed.sort(), [join("posttype", "tok-1"), join("posttype", "tok-2")]);
  assert.deepEqual(readdirSync(join(outputDir, "preview", "posttype")), []);
});

test("PRUNE: surfaces are INDEPENDENT — pruning posttype never touches listing's current", async () => {
  const outputDir = makeOutputDir();
  addPreviewDir(outputDir, "listing", "keep-listing");
  addPreviewDir(outputDir, "posttype", "stale-post");

  const removed = await prunePreviewOrphans(
    outputDir,
    allTokens({ listing: "keep-listing", posttype: null }),
  );

  assert.deepEqual(removed, [join("posttype", "stale-post")]);
  assert.ok(existsSync(join(outputDir, "preview", "listing", "keep-listing")));
});

test("PRUNE: legacy flat /preview/<token>/ dirs are swept; routeKey dirs preserved", async () => {
  const outputDir = makeOutputDir();
  addLegacyFlatDir(outputDir, "old-flat-token-1");
  addLegacyFlatDir(outputDir, "old-flat-token-2");
  addPreviewDir(outputDir, "homepage", "tok-home");

  const removed = await prunePreviewOrphans(outputDir, allTokens({ homepage: "tok-home" }));

  assert.deepEqual(removed.sort(), ["old-flat-token-1", "old-flat-token-2"]);
  // The routeKey dir + its current token survive; legacy flat dirs are gone.
  assert.ok(existsSync(join(outputDir, "preview", "homepage", "tok-home")));
  assert.ok(!existsSync(join(outputDir, "preview", "old-flat-token-1")));
  assert.ok(!existsSync(join(outputDir, "preview", "old-flat-token-2")));
});

test("PRUNE: plain files at the top level are left alone", async () => {
  const outputDir = makeOutputDir();
  mkdirSync(join(outputDir, "preview"), { recursive: true });
  writeFileSync(join(outputDir, "preview", "stray.html"), "<html></html>");
  addLegacyFlatDir(outputDir, "old-flat");

  const removed = await prunePreviewOrphans(outputDir, allTokens());

  assert.deepEqual(removed, ["old-flat"]);
  assert.ok(existsSync(join(outputDir, "preview", "stray.html")));
});

test("PRUNE: never throws when preview path is unreadable (a file, not a dir)", async () => {
  const outputDir = makeOutputDir();
  writeFileSync(join(outputDir, "preview"), "not a directory");

  let removed;
  await assert.doesNotReject(async () => {
    removed = await prunePreviewOrphans(outputDir, allTokens());
  });
  assert.deepEqual(removed, []);
});

// --- readCurrentPreviewTokens (per-surface tolerant artifact read) ---

const makeCompositionsDir = () => mkdtempSync(join(tmpdir(), "prune-preview-comp-"));
const writeArtifact = (dir, routeKey, body) =>
  writeFileSync(join(dir, `preview-${routeKey}.json`), JSON.stringify(body));

test("TOKENS: reads a valid token per surface into a routeKey map", () => {
  const dir = makeCompositionsDir();
  writeArtifact(dir, "homepage", { kind: "preview", token: "home_TOK-1" });
  writeArtifact(dir, "listing", { kind: "preview", token: "list_TOK-2" });
  writeArtifact(dir, "posttype", { kind: "preview", token: "post_TOK-3" });
  writeArtifact(dir, "pages", { kind: "preview", token: "page_TOK-4" });

  assert.deepEqual(readCurrentPreviewTokens(dir), {
    homepage: "home_TOK-1",
    listing: "list_TOK-2",
    posttype: "post_TOK-3",
    pages: "page_TOK-4",
  });
});

test("TOKENS: missing artifacts → all null (normal steady state)", () => {
  const dir = makeCompositionsDir();
  assert.deepEqual(readCurrentPreviewTokens(dir), {
    homepage: null,
    listing: null,
    posttype: null,
    pages: null,
  });
});

test("TOKENS: mixed — one valid, others absent/invalid → per-surface map", () => {
  const dir = makeCompositionsDir();
  writeArtifact(dir, "homepage", { kind: "preview", token: "home_ok" });
  writeArtifact(dir, "listing", { kind: "homepage", token: "wrong_kind" }); // wrong kind → null
  writeFileSync(join(dir, "preview-posttype.json"), "{ not json"); // corrupt → null

  assert.deepEqual(readCurrentPreviewTokens(dir), {
    homepage: "home_ok",
    listing: null,
    posttype: null,
    pages: null,
  });
});

test("TOKENS: pages (shared slot) reads its own token like any surface", () => {
  const dir = makeCompositionsDir();
  writeArtifact(dir, "pages", { kind: "preview", token: "pages_ok" });

  assert.deepEqual(readCurrentPreviewTokens(dir), {
    homepage: null,
    listing: null,
    posttype: null,
    pages: "pages_ok",
  });
});

test("TOKENS: malformed token (fails the URL-safe regex) → null for that surface", () => {
  const dir = makeCompositionsDir();
  writeArtifact(dir, "homepage", { kind: "preview", token: "../evil" });
  writeArtifact(dir, "listing", { kind: "preview", token: 42 });
  writeArtifact(dir, "posttype", { kind: "preview" }); // no token
  writeArtifact(dir, "pages", { kind: "preview", token: "../../escape" });

  assert.deepEqual(readCurrentPreviewTokens(dir), {
    homepage: null,
    listing: null,
    posttype: null,
    pages: null,
  });
});
