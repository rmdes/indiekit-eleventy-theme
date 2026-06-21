import { test } from "node:test";
import assert from "node:assert/strict";
import { filterComposedPages, RESERVED_ROOT_SLUGS } from "../lib/composed-pages.mjs";

/** Build a well-formed published v4 page entry, with optional overrides. */
const validPage = (slug, over = {}) => ({
  schemaVersion: 4,
  kind: "page",
  target: { route: `/${slug}/`, title: slug },
  tree: { id: "root", children: [] },
  updatedAt: "2026-06-19T00:00:00.000Z",
  ...over,
});

test("keeps a well-formed v4 page entry", () => {
  const out = filterComposedPages([validPage("about")]);
  assert.equal(out.length, 1);
  assert.equal(out[0].target.route, "/about/");
});

test("drops entries failing the v4/page/route/tree gate", () => {
  const bad = [
    validPage("a", { schemaVersion: 3 }), // wrong schemaVersion
    validPage("b", { kind: "homepage" }), // wrong kind
    validPage("c", { target: { route: "/a/b/" } }), // multi-segment route
    validPage("d", { target: { route: "about" } }), // not slash-wrapped
    validPage("e", { target: { route: "/Mixed/" } }), // uppercase slug
    validPage("f", { tree: undefined }), // missing tree
    validPage("g", { target: undefined }), // missing target
  ];
  assert.deepEqual(filterComposedPages(bad), []);
});

test("drops a composed page colliding with an authored content/pages/<slug>.md", () => {
  const authored = new Set(["about"]);
  const out = filterComposedPages([validPage("about"), validPage("uses")], authored);
  assert.equal(out.length, 1);
  assert.equal(out[0].target.route, "/uses/");
});

test("returns [] for a non-array artifact", () => {
  assert.deepEqual(filterComposedPages(null), []);
  assert.deepEqual(filterComposedPages({}), []);
  assert.deepEqual(filterComposedPages(undefined), []);
});

test("defaults authoredSlugs to empty set (no collision filtering)", () => {
  const out = filterComposedPages([validPage("about"), validPage("uses")]);
  assert.equal(out.length, 2);
});

test("filters a mixed batch to only the surviving entries, preserving order", () => {
  const batch = [
    validPage("first"),
    validPage("bad", { schemaVersion: 2 }),
    validPage("collide"),
    validPage("last"),
  ];
  const out = filterComposedPages(batch, new Set(["collide"]));
  assert.deepEqual(
    out.map((e) => e.target.route),
    ["/first/", "/last/"],
  );
});

// Phase 7 Task 6 — reserved root-template slug guard.

test("RESERVED_ROOT_SLUGS protects root templates but NOT cv (composition-owned)", () => {
  assert.ok(RESERVED_ROOT_SLUGS.has("about"), "about.njk owns /about/");
  assert.ok(RESERVED_ROOT_SLUGS.has("blog"), "blog.njk owns /blog/");
  assert.ok(!RESERVED_ROOT_SLUGS.has("cv"), "cv is composition-owned (page:cv) — must NOT be reserved");
});

test("filterComposedPages drops a composed page colliding with a reserved root slug, keeps cv", () => {
  const out = filterComposedPages(
    [validPage("about"), validPage("cv")],
    RESERVED_ROOT_SLUGS,
  );
  assert.deepEqual(out.map((e) => e.target.route), ["/cv/"], "about dropped (root template), cv kept");
});
