/**
 * OG-card orphan pruning (lib/prune-og.mjs).
 *
 * A pruner that gets its "valid" set wrong deletes a site's entire OG card set,
 * so these cover the dangerous directions harder than the happy path: an
 * unreadable or empty manifest must delete NOTHING, and the protected files must
 * survive every call.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readdir, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pruneOgOrphans, readOgManifestSlugs } from "../lib/prune-og.mjs";

/** Build an og dir containing the given card slugs plus the protected files. */
async function makeOgDir(slugs, extra = {}) {
  const dir = await mkdtemp(join(tmpdir(), "prune-og-"));
  for (const slug of slugs) await writeFile(join(dir, `${slug}.png`), "png");
  await writeFile(join(dir, "default.png"), "png");
  await writeFile(join(dir, "manifest.json"), JSON.stringify(extra.manifest ?? {}));
  return dir;
}

const names = async (dir) => (await readdir(dir)).sort();

// --- the happy path ---

test("removes cards whose slug is not in the valid set", async () => {
  const dir = await makeOgDir(["likes-2026-02-22-5be34", "notes-2026-01-01-aaaaa", "gone-2020-01-01-zzzzz"]);
  const removed = await pruneOgOrphans(dir, ["likes-2026-02-22-5be34", "notes-2026-01-01-aaaaa"]);

  assert.deepEqual(removed, ["gone-2020-01-01-zzzzz"]);
  assert.deepEqual(await names(dir), [
    "default.png", "likes-2026-02-22-5be34.png", "manifest.json", "notes-2026-01-01-aaaaa.png",
  ]);
});

test("accepts a Set or any iterable of slugs", async () => {
  const dir = await makeOgDir(["keep", "drop"]);
  await pruneOgOrphans(dir, new Set(["keep"]));
  assert.ok(!(await names(dir)).includes("drop.png"));
});

test("the whole previous slug scheme is pruned after a rename", async () => {
  // The flat->typed slug change orphans every existing card at once.
  const old = ["2026-02-22-5be34", "2026-01-01-aaaaa"];
  const neu = ["likes-2026-02-22-5be34", "notes-2026-01-01-aaaaa"];
  const dir = await makeOgDir([...old, ...neu]);

  const removed = await pruneOgOrphans(dir, neu);
  assert.deepEqual(removed.sort(), old.sort());
  assert.deepEqual(await names(dir), ["default.png", "manifest.json", ...neu.map((s) => `${s}.png`)].sort());
});

// --- the dangerous directions ---

test("an EMPTY valid set deletes nothing", async () => {
  // "I could not determine what is valid" must never mean "delete everything".
  const dir = await makeOgDir(["a", "b", "c"]);
  const removed = await pruneOgOrphans(dir, []);
  assert.deepEqual(removed, []);
  assert.equal((await names(dir)).length, 5);
});

test("readOgManifestSlugs returns an empty set for a missing or corrupt manifest", async () => {
  const dir = await mkdtemp(join(tmpdir(), "prune-og-"));
  assert.equal((await readOgManifestSlugs(join(dir, "nope.json"))).size, 0);

  const bad = join(dir, "manifest.json");
  await writeFile(bad, "{ not json");
  assert.equal((await readOgManifestSlugs(bad)).size, 0);
});

test("a corrupt manifest therefore prunes nothing, end to end", async () => {
  const dir = await makeOgDir(["a", "b"]);
  await writeFile(join(dir, "manifest.json"), "{ truncated");
  const slugs = await readOgManifestSlugs(join(dir, "manifest.json"));
  assert.deepEqual(await pruneOgOrphans(dir, slugs), []);
  assert.equal((await names(dir)).length, 4);
});

test("protected files are never candidates", async () => {
  const dir = await makeOgDir([]);
  await pruneOgOrphans(dir, ["something-unrelated"]);
  assert.deepEqual(await names(dir), ["default.png", "manifest.json"]);
});

test("non-png files and directories are left alone", async () => {
  const dir = await makeOgDir(["keep"]);
  await writeFile(join(dir, "notes.txt"), "x");
  await mkdir(join(dir, "subdir"));
  await pruneOgOrphans(dir, ["keep"]);
  assert.deepEqual(await names(dir), ["default.png", "keep.png", "manifest.json", "notes.txt", "subdir"]);
});

test("a missing directory is not an error", async () => {
  assert.deepEqual(await pruneOgOrphans("/nonexistent-og-dir-xyz", ["a"]), []);
});

// --- manifest reading ---

test("readOgManifestSlugs excludes bookkeeping keys", async () => {
  const dir = await mkdtemp(join(tmpdir(), "prune-og-"));
  const path = join(dir, "manifest.json");
  await writeFile(path, JSON.stringify({
    "likes-2026-02-22-5be34": { hash: "a" },
    "notes-2026-01-01-aaaaa": { hash: "b" },
    __default__: { hash: "c" },
  }));

  const slugs = await readOgManifestSlugs(path);
  assert.deepEqual([...slugs].sort(), ["likes-2026-02-22-5be34", "notes-2026-01-01-aaaaa"]);
  assert.ok(!slugs.has("__default__"), "__default__ must not be treated as a card slug");
});

test("the default card survives a prune driven by a real manifest", async () => {
  // Regression guard: __default__ is excluded from the valid set, so default.png
  // would be an orphan by that logic — PROTECTED is what saves it.
  const dir = await makeOgDir(["likes-x"], { manifest: { "likes-x": { hash: "a" }, __default__: { hash: "b" } } });
  const slugs = await readOgManifestSlugs(join(dir, "manifest.json"));
  await pruneOgOrphans(dir, slugs);
  assert.ok((await names(dir)).includes("default.png"));
});
