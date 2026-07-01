import { test } from "node:test";
import assert from "node:assert/strict";
import { stripMarkdown, noteExcerpt, sanitizeSummary } from "../lib/markdown-agents.mjs";

test("stripMarkdown removes links, images, md tokens, and html", () => {
  assert.equal(stripMarkdown("__Replied to[a post](http://x)__: hello #tag"), "Replied to a post: hello tag");
  assert.equal(stripMarkdown("![alt](img.png) text"), "text");
  assert.equal(stripMarkdown("<p>hi</p>  there"), "hi there");
});

test("noteExcerpt truncates on a word boundary with an ellipsis", () => {
  const out = noteExcerpt("one two three four five six seven eight nine ten eleven twelve", 20);
  assert.ok(out.length <= 21, `length ${out.length}`);
  assert.ok(out.endsWith("…"));
  assert.ok(!/\s$/.test(out.slice(0, -1)), "no trailing space before ellipsis");
});

test("noteExcerpt returns short clean text unchanged", () => {
  assert.equal(noteExcerpt("short note", 80), "short note");
});

test("sanitizeSummary collapses whitespace and newlines", () => {
  assert.equal(sanitizeSummary("a  b\nc"), "a b c");
});
