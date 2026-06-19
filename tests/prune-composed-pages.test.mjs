/**
 * Composed-page orphan pruning (6.5 follow-up).
 *
 * Contract under test:
 * - Composed pages emit to the SHARED site root (/<slug>/index.html), unlike
 *   previews (namespaced under /preview/). So the prune must NEVER remove a dir
 *   it didn't emit. Safety comes from a data-attribute MARKER that
 *   composed-pages.njk writes into every composed page's HTML; the prune only
 *   removes a /<slug>/ dir whose index.html bears the marker AND whose slug is
 *   no longer in the current published set.
 * - A marked dir whose slug IS still current → kept.
 * - An UNMARKED dir (authored content/pages page, collection listing, post-type
 *   root) → NEVER removed, even if its slug isn't in the current set.
 * - Top-level files and dirs without index.html → ignored.
 * - Missing outputDir → silent no-op, never throws.
 * - Returns the list of removed slugs so the caller can log them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  pruneComposedPageOrphans,
  COMPOSED_PAGE_MARKER,
} from "../lib/prune-composed-pages.mjs";

const makeOutputDir = () => mkdtempSync(join(tmpdir(), "prune-composed-"));

/** Emit <outputDir>/<slug>/index.html, optionally bearing the composed-page marker. */
const addPage = (outputDir, slug, { marked }) => {
  mkdirSync(join(outputDir, slug), { recursive: true });
  const body = marked
    ? `<!doctype html><head></head><body><div ${COMPOSED_PAGE_MARKER} hidden></div><h1>${slug}</h1></body>`
    : `<!doctype html><head></head><body><h1>${slug}</h1></body>`;
  writeFileSync(join(outputDir, slug, "index.html"), body);
};

test("removes a marked composed-page dir whose slug is no longer current", async () => {
  const out = makeOutputDir();
  addPage(out, "keep", { marked: true });
  addPage(out, "stale", { marked: true });
  const removed = await pruneComposedPageOrphans(out, ["keep"]);
  assert.deepEqual(removed, ["stale"]);
  assert.ok(existsSync(join(out, "keep")));
  assert.ok(!existsSync(join(out, "stale")));
  rmSync(out, { recursive: true, force: true });
});

test("never removes an UNMARKED dir, even when its slug is not current", async () => {
  const out = makeOutputDir();
  addPage(out, "about", { marked: false }); // authored content/pages/about.md output
  addPage(out, "articles", { marked: false }); // collection listing
  const removed = await pruneComposedPageOrphans(out, []);
  assert.deepEqual(removed, []);
  assert.ok(existsSync(join(out, "about")));
  assert.ok(existsSync(join(out, "articles")));
  rmSync(out, { recursive: true, force: true });
});

test("keeps a marked dir that is still current (accepts a Set)", async () => {
  const out = makeOutputDir();
  addPage(out, "now", { marked: true });
  const removed = await pruneComposedPageOrphans(out, new Set(["now"]));
  assert.deepEqual(removed, []);
  assert.ok(existsSync(join(out, "now")));
  rmSync(out, { recursive: true, force: true });
});

test("does NOT remove a page that merely mentions the marker attribute in prose", async () => {
  const out = makeOutputDir();
  // A real page (e.g. a colophon) that documents the attribute as plain text /
  // escaped code — must NOT be mistaken for composed-page output.
  mkdirSync(join(out, "colophon"), { recursive: true });
  writeFileSync(
    join(out, "colophon", "index.html"),
    `<!doctype html><body><p>This site marks composed pages with ` +
      `data-indiekit-composed-page and escaped &lt;div data-indiekit-composed-page&gt;.</p></body>`,
  );
  const removed = await pruneComposedPageOrphans(out, []);
  assert.deepEqual(removed, []);
  assert.ok(existsSync(join(out, "colophon")));
  rmSync(out, { recursive: true, force: true });
});

test("ignores top-level files and dirs without index.html", async () => {
  const out = makeOutputDir();
  writeFileSync(join(out, "feed.xml"), "<rss/>");
  mkdirSync(join(out, "emptydir"));
  const removed = await pruneComposedPageOrphans(out, []);
  assert.deepEqual(removed, []);
  rmSync(out, { recursive: true, force: true });
});

test("returns [] and does not throw when outputDir is absent", async () => {
  const removed = await pruneComposedPageOrphans(
    join(tmpdir(), "prune-composed-does-not-exist-xyz"),
    [],
  );
  assert.deepEqual(removed, []);
});
