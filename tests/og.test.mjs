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
  mixWithWhite,
  buildPalette,
  resolveCard,
  stripPictographs,
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

// --- per-site card configuration ---
//
// The card used to hardcode one deployment's avatar and accent, so a shared
// theme published another site's identity. These cover the guards that keep
// that fixed: bad colour input must degrade rather than render wrong, and the
// cache key must move when a site's branding does.

test("mixWithWhite lightens a hex colour toward white", () => {
  assert.equal(mixWithWhite("#000000", 0), "#000000");
  assert.equal(mixWithWhite("#000000", 1), "#ffffff");
  assert.equal(mixWithWhite("#e2b71d", 0.88), "#fcf6e4");
});

test("mixWithWhite rejects anything that is not 6-digit hex", () => {
  // site-config writes plain hex; an oklch()/named/short value must not reach
  // Satori, which would render an unverifiable colour or throw.
  for (const bad of ["oklch(70% 0.1 90)", "rebeccapurple", "#fff", "", null, undefined]) {
    assert.equal(mixWithWhite(bad, 0.5), null, `expected null for ${String(bad)}`);
  }
});

test("buildPalette applies a valid accent to the bar and badge", () => {
  const palette = buildPalette("#e2b71d");
  assert.equal(palette.bar, "#e2b71d");
  assert.equal(palette.badgeText, "#e2b71d");
  assert.equal(palette.badge, "#fcf6e4");
  // Greys are fixed so contrast survives any brand colour.
  assert.equal(palette.title, "#24292f");
});

test("buildPalette falls back to the neutral palette for an unusable accent", () => {
  assert.deepEqual(buildPalette("oklch(70% 0.1 90)"), buildPalette(""));
  assert.equal(buildPalette("").bar, "#3b82f6");
});

test("resolveCard shows every element by default", () => {
  const card = resolveCard({ siteName: "Site" });
  assert.deepEqual(card.show, {
    badge: true,
    date: true,
    avatar: true,
    description: true,
    siteName: true,
  });
});

test("resolveCard hides the elements named in the opt-out list", () => {
  const card = resolveCard({ siteName: "Site", hide: " Date , SiteName " });
  assert.equal(card.show.date, false);
  assert.equal(card.show.siteName, false);
  assert.equal(card.show.badge, true);
});

test("resolveCard drops the avatar when none is configured", () => {
  // The demo and chardonsbleus sites run with AUTHOR_AVATAR="" — they must get
  // a text-only card, never another site's photo.
  assert.equal(resolveCard({ siteName: "Indiekit Demo" }).avatar, null);
  assert.equal(resolveCard({ siteName: "X", avatar: "" }).avatar, null);
});

test("resolveCard ignores a remote avatar rather than fetching it", () => {
  assert.equal(
    resolveCard({ avatar: "https://example.com/elsewhere/nobody.jpg" }).avatar,
    null,
  );
});

test("resolveCard refuses an avatar path that escapes the site", () => {
  assert.equal(resolveCard({ avatar: "/../../etc/passwd" }).avatar, null);
});

test("cardKey changes with every visual setting (cache invalidation)", () => {
  const base = resolveCard({ siteName: "Site", accent: "#e2b71d" }).cardKey;
  assert.notEqual(base, resolveCard({ siteName: "Other", accent: "#e2b71d" }).cardKey);
  assert.notEqual(base, resolveCard({ siteName: "Site", accent: "#3b82f6" }).cardKey);
  assert.notEqual(
    base,
    resolveCard({ siteName: "Site", accent: "#e2b71d", hide: "date" }).cardKey,
  );
  assert.equal(base, resolveCard({ siteName: "Site", accent: "#e2b71d" }).cardKey);
});

test("a changed cardKey changes the post hash, forcing regeneration", () => {
  const post = ["Title", "Desc", "2026-01-01", "Article"];
  const a = computeHash(...post, resolveCard({ siteName: "Site" }).cardKey);
  const b = computeHash(...post, resolveCard({ siteName: "Site", accent: "#e2b71d" }).cardKey);
  assert.notEqual(a, b);
});

// --- stripPictographs: the NO GLYPH box on card titles ---
//
// Frontmatter titles bypass sanitize(), so a title opening with an emoji
// rendered a "NO GLYPH" box on the card (seen on the demo's PR-comment notes).
// sanitize() is too blunt for titles: it keeps only Latin ranges.

test("stripPictographs removes a leading emoji from a title", () => {
  assert.equal(
    stripPictographs("\u{1F527} @rmdes \u2014 PR #925 : fix(endpoint-posts)"),
    "@rmdes \u2014 PR #925 : fix(endpoint-posts)",
  );
});

test("stripPictographs preserves accented Latin text", () => {
  const accented = "\u00C9lections fran\u00E7aises : o\u00F9 va-t-on ? \u00C0 Gen\u00E8ve, \u00E7a d\u00E9\u00E7oit";
  assert.equal(stripPictographs(accented), accented);
});

test("stripPictographs leaves non-Latin scripts alone", () => {
  // Erasing them (as sanitize would) turns a real title into nothing.
  assert.equal(stripPictographs("\u041F\u0440\u0438\u0432\u0435\u0442 \u043C\u0438\u0440"), "\u041F\u0440\u0438\u0432\u0435\u0442 \u043C\u0438\u0440");
  assert.equal(stripPictographs("\u65E5\u672C\u8A9E\u306E\u30BF\u30A4\u30C8\u30EB"), "\u65E5\u672C\u8A9E\u306E\u30BF\u30A4\u30C8\u30EB");
});

test("stripPictographs keeps symbols Inter can actually render", () => {
  assert.equal(stripPictographs("Foo \u00A9 2026 Bar \u2122"), "Foo \u00A9 2026 Bar \u2122");
});

test("stripPictographs removes joiners and modifiers, not just the pictographs", () => {
  // A bare pictograph strip would leave invisible ZWJ/variation selectors behind.
  assert.equal(stripPictographs("\u{1F468}\u200D\u{1F469}\u200D\u{1F467} family"), "family");
  assert.equal(stripPictographs("\u{1F44D}\u{1F3FD} thumbs"), "thumbs");
  assert.equal(stripPictographs("5\uFE0F\u20E3 keycap"), "5 keycap");
});

test("sanitize keeps accents (body text path)", () => {
  assert.equal(sanitize("caf\u00E9 \u00E0 Gen\u00E8ve"), "caf\u00E9 \u00E0 Gen\u00E8ve");
});
