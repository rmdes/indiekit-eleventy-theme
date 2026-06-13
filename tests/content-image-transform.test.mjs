import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldOptimize } from "../lib/content-image-transform.mjs";

test("shouldOptimize: only html pages with hasImages", () => {
  assert.equal(shouldOptimize("/a/index.html", { hasImages: true }), true);
  assert.equal(shouldOptimize("/a/index.html", { hasImages: false }), false);
  assert.equal(shouldOptimize("/a/index.html", {}), false);
  assert.equal(shouldOptimize("/feed.xml", { hasImages: true }), false);
  assert.equal(shouldOptimize(undefined, { hasImages: true }), false);
});
