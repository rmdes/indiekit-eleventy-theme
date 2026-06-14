import { test } from "node:test";
import assert from "node:assert/strict";
import { renderAvatar, isRemote, isSvg } from "../lib/image-shortcode.mjs";

test("isRemote: absolute http(s) URLs are remote", () => {
  assert.equal(isRemote("https://rmendes.net/images/rick.jpg"), true);
  assert.equal(isRemote("http://x/y.png"), true);
  assert.equal(isRemote("/images/rick.jpg"), false);
  assert.equal(isRemote("images/rick.jpg"), false);
});

test("renderAvatar: remote src → passthrough <img>, no optimization, no eleventy:ignore", async () => {
  const html = await renderAvatar("https://rmendes.net/images/rick.jpg", {
    alt: "Rick", width: 128, height: 128, class: "avatar", loading: "eager",
  });
  assert.match(html, /<img[^>]*src="https:\/\/rmendes\.net\/images\/rick\.jpg"/);
  assert.doesNotMatch(html, /eleventy:ignore/);
  assert.match(html, /alt="Rick"/);
  assert.match(html, /class="avatar"/);
  assert.doesNotMatch(html, /\/img\//); // not optimized
});

test("renderAvatar: falsy src → empty-src passthrough <img>, no optimization, no eleventy:ignore", async () => {
  const html = await renderAvatar(null, { alt: "", width: 48, height: 48, class: "avatar" });
  assert.match(html, /<img[^>]*src=""/);
  assert.match(html, /alt=""/);
  assert.doesNotMatch(html, /eleventy:ignore/);
  assert.doesNotMatch(html, /\/img\//);
});

test("renderAvatar: svg src → passthrough <img>, not rasterized, no eleventy:ignore", async () => {
  const html = await renderAvatar("/images/default-avatar.svg", { alt: "x", width: 48, height: 48 });
  assert.match(html, /<img[^>]*src="\/images\/default-avatar\.svg"/);
  assert.doesNotMatch(html, /<picture>/);
  assert.doesNotMatch(html, /\/img\//);
  assert.doesNotMatch(html, /eleventy:ignore/);
});

test("isSvg: detects .svg with optional query/hash", () => {
  assert.equal(isSvg("/a/b.svg"), true);
  assert.equal(isSvg("/a/b.svg?v=2"), true);
  assert.equal(isSvg("https://x/y.svg#i"), true);
  assert.equal(isSvg("/a/b.png"), false);
});

test("renderAvatar: missing local file falls back to passthrough (never throws)", async () => {
  // Regression: site.author.avatar = /images/rick.jpg (root-relative, not a real
  // build file) crashed the whole build via eleventy-img ENOENT. Must passthrough.
  const html = await renderAvatar("/images/does-not-exist-xyz.jpg", {
    alt: "Rick", width: 128, height: 128, class: "avatar",
  });
  assert.match(html, /<img[^>]*src="\/images\/does-not-exist-xyz\.jpg"/);
  assert.match(html, /alt="Rick"/);
  assert.doesNotMatch(html, /<picture>/);
  assert.doesNotMatch(html, /\/img\//);
});
