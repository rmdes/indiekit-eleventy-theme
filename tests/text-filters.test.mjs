/**
 * Text filters extracted from eleventy.config.js (lib/text-filters.mjs).
 *
 * These lock the behaviour that ~20 templates depend on (ogDescription: 17,
 * truncate: 10, extractFirstImage: 6, obfuscateEmail: 1, plainText: 2). The
 * extractFirstImage test in particular pins that the matchAll rewrite behaves
 * exactly like the original exec-loop: first non-hidden, non-data-URI <img>.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import registerTextFilters, {
  truncate,
  toPlainText,
  ogDescription,
  extractFirstImage,
  obfuscateEmail,
} from "../lib/text-filters.mjs";

// --- truncate ---

test("truncate leaves strings within the limit untouched", () => {
  assert.equal(truncate("hello", 200), "hello");
  assert.equal(truncate("exactly five", 12), "exactly five");
});

test("truncate clips and appends ... (trimming trailing space)", () => {
  assert.equal(truncate("abcdefghij", 5), "abcde...");
  assert.equal(truncate("ab cd ef", 3), "ab..."); // slice "ab " → trim → "ab"
});

test("truncate returns empty string for falsy input", () => {
  assert.equal(truncate("", 5), "");
  assert.equal(truncate(null, 5), "");
});

// --- toPlainText / plainText ---

test("toPlainText strips tags, decodes entities, collapses whitespace", () => {
  assert.equal(toPlainText("<p>Hello   <b>world</b></p>"), "Hello world");
  assert.equal(toPlainText("a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; f&nbsp;g"),
    `a & b <c> "d" 'e' f g`);
});

test("toPlainText returns empty string for falsy input", () => {
  assert.equal(toPlainText(""), "");
  assert.equal(toPlainText(null), "");
});

// --- ogDescription ---

test("ogDescription returns plain text untouched when under the limit", () => {
  assert.equal(ogDescription("<p>Short excerpt</p>", 200), "Short excerpt");
});

test("ogDescription truncates plain text with ... when over the limit", () => {
  assert.equal(ogDescription("<p>abcdefghij</p>", 5), "abcde...");
});

// --- extractFirstImage (matchAll must match the old exec-loop behaviour) ---

test("extractFirstImage returns the first <img src>", () => {
  assert.equal(
    extractFirstImage('<p>x</p><img src="/media/a.jpg"><img src="/media/b.jpg">'),
    "/media/a.jpg",
  );
});

test("extractFirstImage skips data: URIs and returns the next real image", () => {
  assert.equal(
    extractFirstImage('<img src="data:image/png;base64,AAAA"><img src="/media/real.jpg">'),
    "/media/real.jpg",
  );
});

test("extractFirstImage skips hidden images", () => {
  assert.equal(
    extractFirstImage('<img src="/media/spacer.gif" hidden><img src="/media/shown.jpg">'),
    "/media/shown.jpg",
  );
});

test("extractFirstImage returns null when there is no usable image", () => {
  assert.equal(extractFirstImage("<p>no images here</p>"), null);
  assert.equal(extractFirstImage(""), null);
  assert.equal(extractFirstImage('<img src="data:image/gif;base64,AA">'), null);
});

// --- obfuscateEmail ---

test("obfuscateEmail encodes each char as an HTML decimal entity (display)", () => {
  // "a@b" → &#97;&#64;&#98;
  assert.equal(obfuscateEmail("a@b"), "&#97;&#64;&#98;");
});

test("obfuscateEmail prepends an encoded mailto: prefix in href mode", () => {
  const out = obfuscateEmail("a@b", "href");
  const mailto = [..."mailto:"].map((c) => `&#${c.charCodeAt(0)};`).join("");
  assert.equal(out, mailto + "&#97;&#64;&#98;");
});

test("obfuscateEmail returns empty string for falsy input", () => {
  assert.equal(obfuscateEmail(""), "");
  assert.equal(obfuscateEmail(null), "");
});

// --- registration wiring (drift guard) ---

test("registerTextFilters registers exactly the five text filters", () => {
  const registered = [];
  const fakeConfig = { addFilter: (name) => registered.push(name) };
  registerTextFilters(fakeConfig);
  assert.deepEqual(
    registered.sort(),
    ["extractFirstImage", "obfuscateEmail", "ogDescription", "plainText", "truncate"],
  );
});

// --- entity decoding + e-content scoping (the og:description regressions) ---
//
// rmendes.net shipped `og:description="&amp;#9998; Note 2 September 2026 …"`:
// post.njk writes its post-type badge as NUMERIC references, which the old
// fixed list of six named entities never matched, and base.njk derives the
// description from the whole rendered layout.

test("toPlainText decodes numeric character references", () => {
  assert.equal(toPlainText("&#9998; Note"), "\u270E Note");
  assert.equal(toPlainText("&#128278; Bookmark"), "\u{1F516} Bookmark");
  assert.equal(toPlainText("&#x270E; hex"), "\u270E hex");
  assert.equal(toPlainText("&#X270E; upper-X hex"), "\u270E upper-X hex");
});

test("toPlainText decodes accented named entities and leaves real accents alone", () => {
  // Typed accents arrive as UTF-8 and must survive untouched.
  assert.equal(toPlainText("<p>\u00E9l\u00E8ve \u00E0 Gen\u00E8ve, \u00E7a d\u00E9\u00E7oit</p>"),
    "\u00E9l\u00E8ve \u00E0 Gen\u00E8ve, \u00E7a d\u00E9\u00E7oit");
  assert.equal(toPlainText("&#233;l&#232;ve"), "\u00E9l\u00E8ve");
});

test("toPlainText decodes each entity exactly once", () => {
  // Chained replaces decoded &amp; first, so a literal &amp;lt; became "<".
  assert.equal(toPlainText("&amp;lt;not-a-tag&amp;gt;"), "&lt;not-a-tag&gt;");
  assert.equal(toPlainText("A &amp;amp; B"), "A &amp; B");
});

test("toPlainText leaves an unknown named entity as written", () => {
  // Dropping it would silently eat text.
  assert.equal(toPlainText("&bogus; x"), "&bogus; x");
});

test("toPlainText rejects out-of-range numeric references instead of emitting U+FFFD", () => {
  assert.equal(toPlainText("&#1114112;x"), "x");
  assert.equal(toPlainText("&#0;x"), "x");
});



test("ogDescription falls back to the whole document when there is no e-content", () => {
  assert.equal(ogDescription("<p>A plain page.</p>", 200), "A plain page.");
});

test("plainText keeps the whole document even when e-content is present", () => {
  // Only the OG excerpt is scoped; plainText has other callers.
  const rendered = '<span>badge</span><div class="e-content"><p>body</p></div>';
  assert.equal(toPlainText(rendered), "badge body");
});

// --- obfuscated addresses must not survive into a scraped description ---

test("toPlainText drops mailto: links, contents and all", () => {
  // h-card.njk writes the address as numeric entities to deter harvesters.
  // toPlainText decodes numeric entities, so the element has to go first.
  const hcard =
    '<p>Before</p><a href="mailto:a@b.example" class="u-email" ' +
    'aria-label="Email a@b.example">&#97;&#64;&#98;&#46;&#101;&#120;</a><p>After</p>';
  const text = toPlainText(hcard);
  assert.equal(text, "Before After");
  assert.doesNotMatch(text, /@/);
});

test("toPlainText leaves ordinary links' text intact", () => {
  assert.equal(toPlainText('see <a href="/about/">the about page</a> now'), "see the about page now");
});

test("ogDescription is safe on absent input", () => {
  // base.njk pipes `description` (often undefined) through this filter.
  assert.equal(ogDescription(undefined, 200), "");
  assert.equal(ogDescription(null, 200), "");
  assert.equal(ogDescription("", 200), "");
});

