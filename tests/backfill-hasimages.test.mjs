import { test } from "node:test";
import assert from "node:assert/strict";
import { hasImage, insertHasImages } from "../scripts/backfill-hasimages.mjs";

// ---------------------------------------------------------------------------
// hasImage detection
// ---------------------------------------------------------------------------

test("hasImage: non-empty photo array → true", () => {
  assert.equal(hasImage({ photo: ["https://example.com/img.jpg"] }, ""), true);
});

test("hasImage: empty photo array → false", () => {
  assert.equal(hasImage({ photo: [] }, ""), false);
});

test("hasImage: truthy non-array photo → true", () => {
  assert.equal(hasImage({ photo: "https://example.com/img.jpg" }, ""), true);
});

test("hasImage: no photo, content with markdown image → true", () => {
  assert.equal(hasImage({}, "Some text ![alt text](https://x/y.jpg) more"), true);
});

test("hasImage: no photo, content with <img> tag → true", () => {
  assert.equal(hasImage({}, "Some text <img src=\"x.jpg\"> more"), true);
});

test("hasImage: no photo, content with self-closing <img/> → true", () => {
  assert.equal(hasImage({}, "<img src=\"x.jpg\"/>"), true);
});

test("hasImage: no photo, plain content → false", () => {
  assert.equal(hasImage({}, "Just some plain text with no images."), false);
});

test("hasImage: undefined photo, undefined content → false", () => {
  assert.equal(hasImage({}, undefined), false);
});

// ---------------------------------------------------------------------------
// insertHasImages surgical insertion
// ---------------------------------------------------------------------------

// The critical date-safety test
test("insertHasImages: inserts flag without corrupting ISO date string", () => {
  const raw =
    "---\ntitle: Test\npublished: 2026-02-08T14:30:00.000Z\nphoto:\n  - https://x/y.jpg\n---\nbody\n";
  const { changed, text } = insertHasImages(raw);
  assert.equal(changed, true, "should report changed=true");
  assert.ok(text.includes("hasImages: true"), "must contain hasImages: true");
  assert.ok(
    text.includes("published: 2026-02-08T14:30:00.000Z"),
    "ISO date must be unchanged as-is"
  );
  assert.ok(text.endsWith("---\nbody\n"), "body must be unchanged");
});

test("insertHasImages: idempotent — already has hasImages: true → changed:false", () => {
  const raw =
    "---\ntitle: Test\nhasImages: true\npublished: 2026-02-08T00:00:00.000Z\n---\nbody\n";
  const { changed, text } = insertHasImages(raw);
  assert.equal(changed, false, "should report changed=false");
  assert.equal(text, raw, "text must be unchanged");
});

test("insertHasImages: idempotent — already has hasImages: false → changed:false", () => {
  const raw = "---\ntitle: Test\nhasImages: false\n---\nbody\n";
  const { changed, text } = insertHasImages(raw);
  assert.equal(changed, false, "should report changed=false");
  assert.equal(text, raw, "text must be unchanged");
});

test("insertHasImages: no frontmatter block → changed:false, text unchanged", () => {
  const raw = "This is just markdown with no frontmatter.\n";
  const { changed, text } = insertHasImages(raw);
  assert.equal(changed, false, "should report changed=false");
  assert.equal(text, raw, "text must be unchanged");
});

test("insertHasImages: handles CRLF line endings", () => {
  const raw = "---\r\ntitle: Test\r\n---\r\nbody\r\n";
  const { changed, text } = insertHasImages(raw);
  assert.equal(changed, true, "should report changed=true");
  assert.ok(text.includes("hasImages: true\r\n"), "must use CRLF for inserted line");
  assert.ok(text.includes("title: Test\r\n"), "existing CRLF lines unchanged");
});

test("insertHasImages: new line inserted right after opening ---", () => {
  const raw = "---\ntitle: Post\ntags:\n  - one\n---\ncontent here\n";
  const { changed, text } = insertHasImages(raw);
  assert.equal(changed, true);
  // The hasImages line should be the SECOND line (index 1 after split)
  const lines = text.split("\n");
  assert.equal(lines[0], "---", "first line is opening ---");
  assert.equal(lines[1], "hasImages: true", "second line is the inserted flag");
});
