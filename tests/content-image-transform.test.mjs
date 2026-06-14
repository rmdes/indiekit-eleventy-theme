import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldOptimize } from "../lib/content-image-transform.mjs";

test("shouldOptimize: html pages optimize unless explicitly image-free", () => {
  assert.equal(shouldOptimize("/a/index.html", true), true);   // flagged → optimize
  assert.equal(shouldOptimize("/a/index.html", false), false); // explicitly image-free → skip
  assert.equal(shouldOptimize("/a/index.html", undefined), true); // unknown page → fail-safe optimize
  assert.equal(shouldOptimize("/feed.xml", true), false);      // non-html → skip
  assert.equal(shouldOptimize(undefined, true), false);        // no outputPath → skip
});
