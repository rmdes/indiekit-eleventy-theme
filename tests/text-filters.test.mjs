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
