/**
 * The image-transform gate (lib/content-image-gate.mjs).
 *
 * This guards 57% of the build. It silently stopped discriminating once the
 * h-card started emitting the avatar under /media/images/ on every page, and
 * nothing failed — the build stayed correct and got ~450s slower. These tests
 * exist so that the next time a chrome element introduces a /media/ or /uploads/
 * substring onto every page, something goes red.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { hasOptimizableContentImage } from "../lib/content-image-gate.mjs";

const AVATAR_HCARD =
  '<div class="widget"><div class="h-card p-author">' +
  '<data class="u-photo hidden" value="https://rmendes.net/media/images/rick.jpg"></data>' +
  '<a href="https://rmendes.net">Rick</a></div></div>';

// --- THE REGRESSION ---

test("THE REGRESSION: a chrome-only page carrying the hidden u-photo avatar is skipped", () => {
  const page = `<html><body><p>Just text.</p>${AVATAR_HCARD}</body></html>`;
  assert.equal(
    hasOptimizableContentImage(page),
    false,
    "the avatar <data> element is not an image; this page must not pay for a posthtml parse",
  );
});

test("a page with BOTH the avatar and a real content image still runs", () => {
  const page = `<html><body><img src="/media/photos/2026/x.jpg">${AVATAR_HCARD}</body></html>`;
  assert.equal(hasOptimizableContentImage(page), true);
});

// --- content images must always be detected ---

for (const [label, src] of [
  ["Micropub photo upload", "/media/photos/2026/10/abc.jpg"],
  ["article upload by year", "/uploads/2023/diagram.png"],
  ["legacy twitter import", "/uploads/twitter/old.jpg"],
  ["pre-sized variant", "/media/__sized__/thumb.jpg"],
  ["same-origin absolute", "https://rmendes.net/media/photos/2026/x.jpg"],
]) {
  test(`detects a content image: ${label}`, () => {
    assert.equal(
      hasOptimizableContentImage(`<img src="${src}">`),
      true,
      `${src} must not be skipped`,
    );
  });
}

test("a NEW upload directory fails toward running, not skipping (denylist, not allowlist)", () => {
  // The point of excluding only /media/images/ rather than listing known upload dirs.
  assert.equal(hasOptimizableContentImage('<img src="/media/videos/2027/new.jpg">'), true);
  assert.equal(hasOptimizableContentImage('<img src="/uploads/brand-new-dir/x.jpg">'), true);
});

// --- things that must NOT trigger the parse ---

test("a page with no media paths at all is skipped", () => {
  assert.equal(hasOptimizableContentImage("<html><body><p>hello</p></body></html>"), false);
});

test("the asset directory alone never triggers it, whatever the filename", () => {
  assert.equal(hasOptimizableContentImage('value="/media/images/anyone.png"'), false);
  assert.equal(hasOptimizableContentImage('value="https://example.org/media/images/a.jpg"'), false);
});

// --- documented limitation, pinned so it is a decision and not a surprise ---

test("KNOWN false positive: a remote URL containing /uploads/ costs one wasted parse", () => {
  // eleventy-img cannot optimize other-origin images, so this parse changes nothing.
  // Accepted: a substring test cannot tell origin apart without parsing, and the
  // failure direction is the safe one (wasted work, never a missed optimization).
  assert.equal(
    hasOptimizableContentImage('<img src="https://labs.ripe.net/uploads/photo.jpg">'),
    true,
  );
});

test("empty and non-string-ish input does not throw", () => {
  assert.equal(hasOptimizableContentImage(""), false);
});
