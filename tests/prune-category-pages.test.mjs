/**
 * Category-page orphan pruning (Category Governance, Layer 3).
 *
 * Category listing+feed pages emit to /categories/<slug>/. When a category is
 * gated out (count < threshold) or merged away, Eleventy's in-place build writes
 * the surviving pages but never deletes the orphaned dirs — so stale category
 * pages keep serving. /categories/ is a theme-owned namespace (only category
 * pages live there), so a slug-membership prune is safe: remove any
 * /categories/<slug>/ dir whose slug is not in the current valid set. The
 * /categories/index.html FILE (the index) is never a candidate (files ignored).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pruneCategoryOrphans } from "../lib/prune-category-pages.mjs";

const makeCategoriesDir = () => {
  const out = mkdtempSync(join(tmpdir(), "prune-cat-"));
  const dir = join(out, "categories");
  mkdirSync(dir, { recursive: true });
  return dir;
};
const addCategory = (dir, slug) => {
  mkdirSync(join(dir, slug), { recursive: true });
  writeFileSync(join(dir, slug, "index.html"), `<h1>${slug}</h1>`);
  writeFileSync(join(dir, slug, "feed.xml"), "<rss/>");
};

test("removes category dirs whose slug is not in the valid set", async () => {
  const dir = makeCategoriesDir();
  addCategory(dir, "politics");
  addCategory(dir, "ai");
  addCategory(dir, "orphan-1post");
  const removed = await pruneCategoryOrphans(dir, new Set(["politics", "ai"]));
  assert.deepEqual(removed.sort(), ["orphan-1post"]);
  assert.ok(existsSync(join(dir, "politics")));
  assert.ok(existsSync(join(dir, "ai")));
  assert.ok(!existsSync(join(dir, "orphan-1post")));
  rmSync(join(dir, ".."), { recursive: true, force: true });
});

test("accepts an array or a Set of valid slugs", async () => {
  const dir = makeCategoriesDir();
  addCategory(dir, "keep");
  addCategory(dir, "drop");
  const removed = await pruneCategoryOrphans(dir, ["keep"]);
  assert.deepEqual(removed, ["drop"]);
  rmSync(join(dir, ".."), { recursive: true, force: true });
});

test("never removes the /categories/index.html index FILE", async () => {
  const dir = makeCategoriesDir();
  writeFileSync(join(dir, "index.html"), "<h1>Categories</h1>");
  addCategory(dir, "keep");
  const removed = await pruneCategoryOrphans(dir, new Set(["keep"]));
  assert.deepEqual(removed, []);
  assert.ok(existsSync(join(dir, "index.html")));
  rmSync(join(dir, ".."), { recursive: true, force: true });
});

test("returns [] and does not throw when the categories dir is absent", async () => {
  const removed = await pruneCategoryOrphans(join(tmpdir(), "no-such-categories-xyz"), new Set(["a"]));
  assert.deepEqual(removed, []);
});

test("empty valid set removes all category dirs (e.g. all gated)", async () => {
  const dir = makeCategoriesDir();
  addCategory(dir, "a");
  addCategory(dir, "b");
  const removed = await pruneCategoryOrphans(dir, new Set());
  assert.deepEqual(removed.sort(), ["a", "b"]);
  rmSync(join(dir, ".."), { recursive: true, force: true });
});
