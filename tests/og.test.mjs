/**
 * OG-image pure helpers (lib/og.js).
 *
 * These underpin the manifest-based batch caching described in CLAUDE.md:
 * computeHash is the cache key (slug → content hash), so its determinism and
 * field-sensitivity decide whether an image is regenerated or served stale.
 * The text helpers shape the card content that hash covers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeHash,
  detectPostType,
  formatDate,
  sanitize,
  stripMarkdown,
  truncate,
  extractFirstParagraph,
} from "../lib/og.js";

// --- computeHash: the cache-key contract ---

test("computeHash is deterministic for identical inputs", () => {
  const a = computeHash("Title", "Desc", "2026-01-01", "Article", "Site");
  const b = computeHash("Title", "Desc", "2026-01-01", "Article", "Site");
  assert.equal(a, b);
});

test("computeHash returns a 12-char hex digest", () => {
  const h = computeHash("Title", "Desc", "2026-01-01", "Article", "Site");
  assert.match(h, /^[0-9a-f]{12}$/);
});

test("computeHash changes when ANY field changes (cache invalidation)", () => {
  const base = computeHash("Title", "Desc", "2026-01-01", "Article", "Site");
  assert.notEqual(base, computeHash("Title2", "Desc", "2026-01-01", "Article", "Site"));
  assert.notEqual(base, computeHash("Title", "Desc2", "2026-01-01", "Article", "Site"));
  assert.notEqual(base, computeHash("Title", "Desc", "2026-02-02", "Article", "Site"));
  assert.notEqual(base, computeHash("Title", "Desc", "2026-01-01", "Note", "Site"));
  assert.notEqual(base, computeHash("Title", "Desc", "2026-01-01", "Article", "Other"));
});

// --- detectPostType: directory → label ---

test("detectPostType maps a known content subdir to its label", () => {
  assert.equal(detectPostType("content/articles/2026-01-01-hello.md"), "Article");
  assert.equal(detectPostType("/abs/path/content/notes/x.md"), "Note");
  assert.equal(detectPostType("content/bookmarks/x.md"), "Bookmark");
});

test("detectPostType falls back to 'Post' for unknown or missing type dir", () => {
  assert.equal(detectPostType("content/unknowntype/x.md"), "Post");
  assert.equal(detectPostType("some/other/path/x.md"), "Post");
});

// --- formatDate: ISO in, en-US short out, safe on junk ---

test("formatDate formats an ISO date as en-US short", () => {
  assert.equal(formatDate("2026-01-15T10:00:00.000Z"), "Jan 15, 2026");
});

test("formatDate returns empty string for falsy or invalid input", () => {
  assert.equal(formatDate(""), "");
  assert.equal(formatDate(null), "");
  assert.equal(formatDate("not-a-date"), "");
});

// --- truncate: bounded, ellipsis on overflow ---

test("truncate leaves short text untouched", () => {
  assert.equal(truncate("hello", 10), "hello");
});

test("truncate clips long text and appends an ellipsis", () => {
  const out = truncate("abcdefghij", 5);
  assert.equal(out, "abcde…");
});

test("truncate tolerates empty input", () => {
  assert.equal(truncate("", 5), "");
  assert.equal(truncate(undefined, 5), "");
});

// --- sanitize: drop glyph-breaking characters ---

test("sanitize keeps ASCII/Latin text and trims", () => {
  assert.equal(sanitize("  Héllo wörld  "), "Héllo wörld");
});

test("sanitize strips characters outside the safe ranges (e.g. emoji)", () => {
  assert.equal(sanitize("Hi 🎉 there"), "Hi  there");
});

// --- stripMarkdown / extractFirstParagraph: card body text ---

test("stripMarkdown removes headings, emphasis, links and images", () => {
  const raw = "# Heading\n\nSome **bold** and [a link](https://x.test) and ![img](y.png).";
  const out = stripMarkdown(raw);
  assert.ok(!out.includes("#"));
  assert.ok(!out.includes("**"));
  assert.ok(out.includes("a link")); // link text kept
  assert.ok(!out.includes("https://x.test")); // link URL dropped
  assert.ok(!out.includes("img")); // image dropped entirely
});

test("extractFirstParagraph strips frontmatter and returns the first prose block", () => {
  const raw = "---\ntitle: x\n---\n\nFirst paragraph here.\n\nSecond paragraph.";
  const out = extractFirstParagraph(raw);
  assert.equal(out, "First paragraph here.");
});
