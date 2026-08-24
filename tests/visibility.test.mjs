import { test } from "node:test";
import assert from "node:assert/strict";
import { isListed } from "../lib/visibility.mjs";

test("a post with no visibility set is listed", () => {
  assert.equal(isListed({}), true);
  assert.equal(isListed({ title: "hi" }), true);
});

test("visibility: public is listed", () => {
  assert.equal(isListed({ visibility: "public" }), true);
});

test("visibility: unlisted and private are kept out of collections", () => {
  assert.equal(isListed({ visibility: "unlisted" }), false);
  assert.equal(isListed({ visibility: "private" }), false);
});

test("visibility matching ignores case and surrounding whitespace", () => {
  assert.equal(isListed({ visibility: "Unlisted" }), false);
  assert.equal(isListed({ visibility: " PRIVATE " }), false);
});

test("an unknown visibility value leaves the post listed rather than vanishing", () => {
  assert.equal(isListed({ visibility: "unlsited" }), true);
  assert.equal(isListed({ visibility: "friends" }), true);
});

test("draft still wins regardless of visibility", () => {
  assert.equal(isListed({ draft: true }), false);
  assert.equal(isListed({ draft: true, visibility: "public" }), false);
});

test("isListed tolerates being called with no argument", () => {
  assert.equal(isListed(), true);
});
