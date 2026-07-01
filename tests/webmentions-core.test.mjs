/**
 * webmentions/core.js — pure logic extracted from the client webmention widget.
 * mergeMentions is the highest-risk piece: cross-source dedup between the
 * conversations API and webmention.io, incl. owner-reply echo suppression.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractPostId,
  detectPlatform,
  formatDate,
  mergeMentions,
} from "../js/webmentions/core.js";

// --- extractPostId ---

test("extractPostId pulls the rkey from a Bluesky post URL (handle or DID)", () => {
  assert.equal(extractPostId("https://bsky.app/profile/alice.bsky.social/post/abc123"), "bsky:abc123");
  assert.equal(extractPostId("https://bsky.app/profile/did:plc:xyz/post/abc123"), "bsky:abc123");
});

test("extractPostId pulls the status id from a Mastodon URL", () => {
  assert.equal(extractPostId("https://mastodon.social/@bob/109876543210"), "masto:109876543210");
});

test("extractPostId returns null for unrecognised or empty URLs", () => {
  assert.equal(extractPostId("https://example.com/notes/1"), null);
  assert.equal(extractPostId(""), null);
  assert.equal(extractPostId(null), null);
});

// --- detectPlatform ---

test("detectPlatform maps the resolved platform field, folding unknown fedi → activitypub", () => {
  assert.equal(detectPlatform({ platform: "Mastodon" }), "mastodon");
  assert.equal(detectPlatform({ platform: "bluesky" }), "bluesky");
  assert.equal(detectPlatform({ platform: "webmention" }), "webmention");
  assert.equal(detectPlatform({ platform: "gotosocial" }), "activitypub");
});

test("detectPlatform falls back to URL heuristics when no platform field", () => {
  assert.equal(detectPlatform({ "wm-source": "https://brid.gy/repost/mastodon/x" }), "mastodon");
  assert.equal(detectPlatform({ "wm-source": "https://brid.gy/like/bluesky/x" }), "bluesky");
  assert.equal(detectPlatform({ "wm-source": "https://fed.brid.gy/y" }), "activitypub");
  assert.equal(detectPlatform({ author: { url: "https://bsky.app/profile/a" } }), "bluesky");
  assert.equal(detectPlatform({ "wm-source": "https://example.com" }), "webmention");
});

// --- formatDate ---

test("formatDate renders ISO as en-US short, empty for falsy", () => {
  assert.equal(formatDate("2026-03-02T00:00:00.000Z"), "Mar 2, 2026");
  assert.equal(formatDate(""), "");
  assert.equal(formatDate(null), "");
});

// --- mergeMentions ---

test("mergeMentions returns conversations items first and includes fresh wm items", () => {
  const conv = [{ "wm-id": "c1", url: "https://x/1", "wm-property": "in-reply-to", author: { url: "https://a/1" } }];
  const wm = [{ "wm-id": "w1", url: "https://x/2", "wm-property": "like-of", author: { url: "https://a/2" } }];
  const out = mergeMentions(conv, wm);
  assert.deepEqual(out.map((m) => m["wm-id"]), ["c1", "w1"]);
});

test("mergeMentions drops a wm item that duplicates a conversations item by wm-id", () => {
  const conv = [{ "wm-id": "dup", url: "https://x/1", author: {} }];
  const wm = [{ "wm-id": "dup", url: "https://x/other", author: {} }];
  assert.deepEqual(mergeMentions(conv, wm).map((m) => m.url), ["https://x/1"]);
});

test("mergeMentions drops a wm item sharing a source URL with a conversations item", () => {
  const conv = [{ "wm-id": "c1", url: "https://x/same", author: {} }];
  const wm = [{ "wm-id": "w1", url: "https://x/same", author: {} }];
  assert.deepEqual(mergeMentions(conv, wm).map((m) => m["wm-id"]), ["c1"]);
});

test("mergeMentions drops a wm item with the same author+action as a conversations item", () => {
  const conv = [{ "wm-id": "c1", "wm-property": "like-of", author: { url: "https://a/1" } }];
  const wm = [{ "wm-id": "w1", "wm-property": "like-of", author: { url: "https://a/1" } }];
  assert.deepEqual(mergeMentions(conv, wm).map((m) => m["wm-id"]), ["c1"]);
});

test("mergeMentions suppresses a webmention.io echo of the owner's own reply (by Bluesky post-id, DID vs handle)", () => {
  // Owner replied and it syndicated to a handle URL; the echo comes back with a DID URL.
  const conv = [{
    "wm-id": "owner1",
    is_owner: true,
    syndication: ["https://bsky.app/profile/me.bsky.social/post/rkey9"],
    author: { url: "https://me" },
  }];
  const wm = [{ "wm-id": "echo1", url: "https://bsky.app/profile/did:plc:me/post/rkey9", "wm-property": "in-reply-to", author: { url: "https://other" } }];
  const out = mergeMentions(conv, wm);
  assert.deepEqual(out.map((m) => m["wm-id"]), ["owner1"]); // echo dropped
});

test("mergeMentions keeps a genuinely new webmention.io reply", () => {
  const conv = [{ "wm-id": "c1", "wm-property": "in-reply-to", author: { url: "https://a/1" } }];
  const wm = [{ "wm-id": "w1", url: "https://blog.example/reply", "wm-property": "in-reply-to", author: { url: "https://a/2" } }];
  const out = mergeMentions(conv, wm);
  assert.deepEqual(out.map((m) => m["wm-id"]).sort(), ["c1", "w1"]);
});
