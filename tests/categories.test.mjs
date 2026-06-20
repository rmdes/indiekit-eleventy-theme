import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slugifyCategory,
  buildCategoryIndex,
  gateCategories,
} from "../lib/categories.mjs";

const item = (cats, date = "2026-01-01") => ({ data: { category: cats }, date: new Date(date) });

test("slugifyCategory lowercases + dashes; mixed case collapses to one slug", () => {
  assert.equal(slugifyCategory("Politics"), "politics");
  assert.equal(slugifyCategory("politics"), "politics");
  assert.equal(slugifyCategory("Self-Hosting"), "self-hosting");
  assert.equal(slugifyCategory("  AI  "), "ai");
  assert.equal(slugifyCategory(""), "");
  assert.equal(slugifyCategory(null), "");
});

test("buildCategoryIndex groups case-insensitively with TRUE counts (the bug fix)", () => {
  const items = [item("Politics"), item("politics"), item(["AI", "politics"]), item("AI")];
  const idx = buildCategoryIndex(items);
  assert.equal(idx.length, 2);
  const politics = idx.find((c) => c.slug === "politics");
  const ai = idx.find((c) => c.slug === "ai");
  assert.equal(politics.count, 3); // Politics + politics + politics — none dropped
  assert.equal(politics.posts.length, 3);
  assert.equal(ai.count, 2);
  // entry shape
  assert.ok(typeof politics.name === "string" && politics.slug === "politics");
});

test("buildCategoryIndex ignores empty/non-string/missing categories (incl. the {} bug)", () => {
  const items = [item(undefined), item(""), item(["", "  "]), item({}), item("Real")];
  const idx = buildCategoryIndex(items);
  assert.equal(idx.length, 1);
  assert.equal(idx[0].slug, "real");
  assert.equal(idx[0].count, 1);
});

test("buildCategoryIndex caps posts[] at feedPostLimit but count stays the true total", () => {
  const items = Array.from({ length: 60 }, () => item("Big"));
  const idx = buildCategoryIndex(items, { feedPostLimit: 50 });
  assert.equal(idx[0].count, 60);
  assert.equal(idx[0].posts.length, 50);
});

test("buildCategoryIndex returns entries sorted by name", () => {
  const idx = buildCategoryIndex([item("Zebra"), item("apple"), item("Mango")]);
  assert.deepEqual(idx.map((c) => c.name), ["apple", "Mango", "Zebra"]);
});

test("gateCategories keeps count >= threshold by default", () => {
  const idx = [{ slug: "a", count: 1 }, { slug: "b", count: 2 }, { slug: "c", count: 5 }];
  assert.deepEqual(gateCategories(idx, { threshold: 2 }).map((c) => c.slug), ["b", "c"]);
});

test("gateCategories per-category overrides force on/off regardless of count", () => {
  const idx = [{ slug: "a", count: 1 }, { slug: "b", count: 9 }];
  const kept = gateCategories(idx, {
    threshold: 2,
    overrides: { a: { listing: true }, b: { listing: false } },
    surface: "listing",
  });
  assert.deepEqual(kept.map((c) => c.slug), ["a"]);
});

test("gateCategories surface selects the feed vs listing override key", () => {
  const idx = [{ slug: "a", count: 1 }];
  assert.equal(gateCategories(idx, { threshold: 2, overrides: { a: { feed: true } }, surface: "feed" }).length, 1);
  assert.equal(gateCategories(idx, { threshold: 2, overrides: { a: { feed: true } }, surface: "listing" }).length, 0);
});

test("gateCategories default threshold is 1 (no-op) when not specified", () => {
  const idx = [{ slug: "a", count: 1 }];
  assert.equal(gateCategories(idx).length, 1);
});
