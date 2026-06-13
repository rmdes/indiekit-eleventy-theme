import { test } from "node:test";
import assert from "node:assert/strict";
import { renderAvatar, isRemote } from "../lib/image-shortcode.mjs";

test("isRemote: absolute http(s) URLs are remote", () => {
  assert.equal(isRemote("https://rmendes.net/images/rick.jpg"), true);
  assert.equal(isRemote("http://x/y.png"), true);
  assert.equal(isRemote("/images/rick.jpg"), false);
  assert.equal(isRemote("images/rick.jpg"), false);
});

test("renderAvatar: remote src → passthrough <img> with eleventy:ignore, no optimization", async () => {
  const html = await renderAvatar("https://rmendes.net/images/rick.jpg", {
    alt: "Rick", width: 128, height: 128, class: "avatar", loading: "eager",
  });
  assert.match(html, /<img[^>]*src="https:\/\/rmendes\.net\/images\/rick\.jpg"/);
  assert.match(html, /eleventy:ignore/);
  assert.match(html, /alt="Rick"/);
  assert.match(html, /class="avatar"/);
  assert.doesNotMatch(html, /\/img\//); // not optimized
});

test("renderAvatar: falsy src → empty-src passthrough <img> with eleventy:ignore, no optimization", async () => {
  const html = await renderAvatar(null, { alt: "", width: 48, height: 48, class: "avatar" });
  assert.match(html, /<img[^>]*src=""/);
  assert.match(html, /alt=""/);
  assert.match(html, /eleventy:ignore/);
  assert.doesNotMatch(html, /\/img\//);
});
