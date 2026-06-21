import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Regression guard for the Phase 7 /cv cutover permalink. cv.njk yields /cv to a
// PUBLISHED page:cv via eleventyComputed.permalink. The trap that broke a deploy:
// `composedPages` is a _data global, and inside eleventyComputed (permalink
// resolves EARLY) it can arrive as the UNINVOKED data function, not its array —
// calling `.some` on the function threw a TypeError and FAILED THE WHOLE BUILD.
// The fix must INVOKE the function (not just Array.isArray-guard and bail, which
// would make cv.njk never see the published page → /cv collision on publish).
//
// We assert the structure (no eval) so a regression that drops the function
// guard, or reverts to the naive `(composedPages || []).some(...)`, fails here.

const __dirname = dirname(fileURLToPath(import.meta.url));
const cv = readFileSync(resolve(__dirname, "..", "cv.njk"), "utf8");
const fm = cv.match(/^---js\n([\s\S]*?)\n---/)?.[1] ?? "";

test("cv.njk uses ---js frontmatter with an eleventyComputed.permalink", () => {
  assert.ok(fm, "cv.njk must use ---js frontmatter");
  assert.match(fm, /eleventyComputed\s*:/);
  assert.match(fm, /permalink\s*:/);
});

test("cv.njk permalink INVOKES composedPages when it is a function (the crash guard)", () => {
  // Must handle the uninvoked-function form, or the build crashes again.
  assert.match(fm, /typeof\s+\w+\s*===?\s*["']function["']/, "must detect the function form");
  assert.match(fm, /\bcp\(\)|composedPages\(\)/, "must INVOKE the function to get the array");
});

test("cv.njk permalink must NOT use the naive (composedPages || []).some form", () => {
  assert.doesNotMatch(
    fm,
    /\(\s*data\.composedPages\s*\|\|\s*\[\]\s*\)\.some/,
    "the naive form throws when composedPages is the uninvoked function",
  );
});

test("cv.njk permalink yields false (skip) or the /cv/ route — never derived from page.inputPath", () => {
  assert.match(fm, /["']\/cv\/["']/, "renders /cv when not yielding");
  assert.match(fm, /\bfalse\b/, "yields (permalink:false) when page:cv is published");
  assert.doesNotMatch(fm, /inputPath/, "must not read the race-prone page.inputPath");
});
