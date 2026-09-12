/**
 * Per-page description derivation (lib/description.mjs).
 *
 * These lock the properties that make the four bugs of 2026-09-11/12 not just
 * fixed but unreachable: descriptions come from a page's own markdown, so there
 * are no HTML entities to decode, no layout furniture to strip, no page-kind
 * heuristics, and no large parent string to slice from.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveDescription, firstParagraph, stripMarkdown } from "../lib/description.mjs";

// --- source of truth: frontmatter, then the post's opening ---

test("summary wins — it is the field Micropub populates", () => {
  const item = { data: { summary: "A summary." }, rawInput: "Body text." };
  assert.equal(deriveDescription(item), "A summary.");
});

test("description is used for pages authored outside Micropub", () => {
  const item = { data: { description: "Set by the author." }, rawInput: "Body text." };
  assert.equal(deriveDescription(item), "Set by the author.");
});

test("summary takes precedence when a page somehow carries both", () => {
  // No file on rmendes has both today, but the order must be deliberate.
  const item = { data: { summary: "The summary.", description: "The description." } };
  assert.equal(deriveDescription(item), "The summary.");
});

test("otherwise the first paragraph of the post is used", () => {
  const item = {
    data: {},
    rawInput: "Testing if my double-post #bluesky bug is solved ?\n\nA second paragraph.",
  };
  assert.equal(deriveDescription(item), "Testing if my double-post #bluesky bug is solved ?");
});

test("a page with no prose of its own yields an empty string", () => {
  // Listing templates hit this, and the caller falls back to the site
  // description — no pagination or markup heuristics needed.
  assert.equal(deriveDescription({ data: {}, rawInput: "" }), "");
  assert.equal(deriveDescription({}), "");
  assert.equal(deriveDescription(undefined), "");
});

test("whitespace-only frontmatter is not treated as a description", () => {
  const item = { data: { description: "   " }, rawInput: "Real body text." };
  assert.equal(deriveDescription(item), "Real body text.");
});

// --- the bug classes this design removes ---

test("markdown source carries no HTML entities to leak (the &#9998; bug)", () => {
  // The post-type badge lived in the LAYOUT, which markdown never sees.
  const item = { data: {}, rawInput: "A note about ampersands & angle < brackets." };
  const out = deriveDescription(item);
  assert.equal(out, "A note about ampersands & angle < brackets.");
  assert.doesNotMatch(out, /&#\d+;/);
});

test("accents and non-Latin scripts survive intact", () => {
  const item = { data: {}, rawInput: "Après 18 ans d'instruction, à Genève — ça déçoit. Привет." };
  assert.equal(deriveDescription(item), "Après 18 ans d'instruction, à Genève — ça déçoit. Привет.");
});

test("the result does not retain its source (the OOM bug)", () => {
  // A description sliced out of a large string keeps that string alive in V8.
  // Here the source is one page's markdown, and the result must be small and
  // standalone regardless.
  const big = "word ".repeat(50_000);
  const out = deriveDescription({ data: {}, rawInput: big }, 200);
  assert.ok(out.length <= 201, `expected <=201 chars, got ${out.length}`);
});

// --- truncation ---

test("truncation stops on a word boundary and marks the cut", () => {
  const source = "alpha bravo charlie delta echo foxtrot golf hotel india";
  const out = deriveDescription({ data: {}, rawInput: source }, 20);

  assert.ok(out.endsWith("…"), out);
  assert.ok(out.length <= 21, out);
  // The kept text must be whole words: what precedes the ellipsis is a prefix
  // of the source that ends where a space follows in the original.
  const kept = out.slice(0, -1);
  assert.ok(source.startsWith(kept), `"${kept}" is not a prefix of the source`);
  assert.equal(source[kept.length], " ", `cut mid-word at "${kept}"`);
});

test("text at or under the limit is returned whole, with no ellipsis", () => {
  const item = { data: {}, rawInput: "Short enough." };
  assert.equal(deriveDescription(item, 200), "Short enough.");
});

// --- markdown handling ---

test("firstParagraph stops at the first blank line", () => {
  assert.equal(firstParagraph("One.\nStill one.\n\nTwo."), "One. Still one.");
});

test("firstParagraph skips leading blank lines (rawInput starts with a newline)", () => {
  // Eleventy's collection rawInput begins with the newline left by frontmatter.
  assert.equal(firstParagraph("\n\nThe opening line."), "The opening line.");
});

test("stripMarkdown removes syntax but keeps the words", () => {
  assert.equal(stripMarkdown("## A *heading*").trim(), "A heading");
  assert.equal(stripMarkdown("[link text](https://example.com)").trim(), "link text");
  assert.equal(stripMarkdown("![alt](img.png)ature").trim(), "ature");
  assert.equal(stripMarkdown("- item one").trim(), "item one");
});

test("stripMarkdown drops frontmatter when the caller passes a whole file", () => {
  assert.equal(stripMarkdown("---\ntitle: X\n---\n\nBody.").trim(), "Body.");
});
