import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lintPage,
  createBuildLint,
  HTML_BYTES_LIMIT,
  IMAGE_COUNT_LIMIT,
  MAX_WARNINGS,
} from "../lib/build-lint.mjs";

const page = (url, content) => ({ url, outputPath: `_site${url}index.html`, content });

test("lintPage: within budget → null; AT the limit is still within budget", () => {
  assert.equal(lintPage("/a/", "<p>hi</p>"), null);
  assert.equal(lintPage("/a/", "x".repeat(HTML_BYTES_LIMIT)), null);
  assert.equal(lintPage("/a/", "<img src=x>".repeat(IMAGE_COUNT_LIMIT)), null);
});

test("lintPage: oversized HTML flags html-size with measured bytes", () => {
  const w = lintPage("/big/", "x".repeat(HTML_BYTES_LIMIT + 1));
  assert.deepEqual(w.reasons, ["html-size"]);
  assert.equal(w.htmlBytes, HTML_BYTES_LIMIT + 1);
  assert.equal(w.url, "/big/");
});

test("lintPage: image count over limit flags image-count (self-closing too)", () => {
  const w = lintPage("/gallery/", "<img src=x/>".repeat(IMAGE_COUNT_LIMIT + 1));
  assert.deepEqual(w.reasons, ["image-count"]);
  assert.equal(w.imageCount, IMAGE_COUNT_LIMIT + 1);
});

test("lintPage: multibyte content measured in BYTES, both reasons combine", () => {
  // é = 2 bytes in UTF-8: half the limit in chars crosses it in bytes.
  const chars = Math.floor(HTML_BYTES_LIMIT / 2) + 1;
  const many = "<img src=x>".repeat(IMAGE_COUNT_LIMIT + 1) + "é".repeat(chars);
  assert.deepEqual(lintPage("/both/", many).reasons, ["html-size", "image-count"]);
});

test("record: skips non-HTML outputs and entries without content", () => {
  const lint = createBuildLint();
  const warnings = lint.record([
    { url: "/feed.xml", outputPath: "_site/feed.xml", content: "x".repeat(HTML_BYTES_LIMIT + 1) },
    { url: "/copied/", outputPath: "_site/copied/index.html" }, // no content
    null,
    page("/ok/", "<p>fine</p>"),
  ]);
  assert.deepEqual(warnings, []);
});

test("record: incremental rebuild updates state — fixes clear, new offenders add", () => {
  const lint = createBuildLint();
  const big = "x".repeat(HTML_BYTES_LIMIT + 1);
  // Full build: two offenders
  let warnings = lint.record([page("/a/", big), page("/b/", big), page("/c/", "<p>ok</p>")]);
  assert.deepEqual(warnings.map((w) => w.url).sort(), ["/a/", "/b/"]);
  // Incremental: /a/ fixed, /c/ regresses — /b/ untouched and retained
  warnings = lint.record([page("/a/", "<p>fixed</p>"), page("/c/", big)]);
  assert.deepEqual(warnings.map((w) => w.url).sort(), ["/b/", "/c/"]);
});

test("record: sorted by htmlBytes descending and capped at MAX_WARNINGS", () => {
  const lint = createBuildLint();
  const results = Array.from({ length: MAX_WARNINGS + 5 }, (_, i) =>
    page(`/p${i}/`, "x".repeat(HTML_BYTES_LIMIT + 1 + i)),
  );
  const warnings = lint.record(results);
  assert.equal(warnings.length, MAX_WARNINGS);
  assert.equal(warnings[0].url, `/p${MAX_WARNINGS + 4}/`, "worst first");
  const bytes = warnings.map((w) => w.htmlBytes);
  assert.deepEqual(bytes, [...bytes].sort((a, b) => b - a));
});
