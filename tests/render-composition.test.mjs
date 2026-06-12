import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderNode, resolveBlockTemplate, KNOWN_WIDGET_TYPES, ENDPOINT_SLUGS } from "../lib/render-composition.mjs";

const mockRender = async (templatePath, data) => {
  if (templatePath.includes("crash")) throw new Error("boom");
  return `[${templatePath} id=${data.block?.id || ""}]`;
};

test("renders a single section leaf via its block template", async () => {
  const node = { block: "section", id: "s1", type: "hero", config: {} };
  const html = await renderNode(node, mockRender, {});
  assert.match(html, /blocks\/hero|sections\/hero/);
  assert.match(html, /id=s1/);
});

test("recurses a container, concatenating children", async () => {
  const tree = { block: "container", as: "stack", role: "main", children: [
    { block: "section", id: "a", type: "hero", config: {} },
    { block: "section", id: "b", type: "recent-posts", config: {} },
  ]};
  const html = await renderNode(tree, mockRender, {});
  assert.match(html, /id=a/);
  assert.match(html, /id=b/);
});

test("CRASH CONTAINMENT: a throwing block becomes an HTML comment, siblings still render", async () => {
  const tree = { block: "container", as: "stack", role: "main", children: [
    { block: "section", id: "ok1", type: "hero", config: {} },
    { block: "section", id: "bad", type: "crash", config: {} },
    { block: "section", id: "ok2", type: "recent-posts", config: {} },
  ]};
  const html = await renderNode(tree, mockRender, {});
  assert.match(html, /id=ok1/);
  assert.match(html, /id=ok2/);
  assert.match(html, /<!-- block-error: crash/);
  assert.doesNotMatch(html, /boom/);
});

test("unknown/empty node yields an empty string, not a throw", async () => {
  assert.equal(await renderNode(null, mockRender, {}), "");
  assert.equal(await renderNode({ block: "section" }, mockRender, {}), "");
});

// ── Phase-1 widget routing bridge ────────────────────────────────────────────
// Sidebar widget partials live in _includes/components/widgets/, not sections/.
// KNOWN_WIDGET_TYPES routes those types to widgets/<type>.njk. Phase 2's block
// catalog replaces this set with per-block template metadata.

test("WIDGET ROUTING: known widget types resolve to components/widgets/<type>.njk", () => {
  assert.equal(resolveBlockTemplate("author-card"), "_includes/components/widgets/author-card.njk");
  assert.equal(resolveBlockTemplate("search"), "_includes/components/widgets/search.njk");
  assert.equal(resolveBlockTemplate("social-activity"), "_includes/components/widgets/social-activity.njk");
});

test("WIDGET ROUTING: section types (and section/widget collisions) resolve to components/sections/<type>.njk", () => {
  assert.equal(resolveBlockTemplate("hero"), "_includes/components/sections/hero.njk");
  // "recent-posts" and "ai-usage" exist as BOTH a section and a widget — in
  // the Phase-1 flat type vocabulary the section wins (deterministic rule).
  assert.equal(resolveBlockTemplate("recent-posts"), "_includes/components/sections/recent-posts.njk");
  assert.equal(resolveBlockTemplate("ai-usage"), "_includes/components/sections/ai-usage.njk");
});

test("WIDGET ROUTING: a widget-type section node renders via the widget partial and receives `widget` data", async () => {
  let captured;
  const spyRender = async (templatePath, data) => {
    captured = { templatePath, data };
    return "ok";
  };
  const node = { block: "section", id: "w1", type: "author-card", config: { compact: true } };
  await renderNode(node, spyRender, {});
  assert.equal(captured.templatePath, "_includes/components/widgets/author-card.njk");
  // Widget partials consume the homepage-sidebar context shape (`widget.…`),
  // section partials consume `section.…` — renderSection provides both.
  assert.equal(captured.data.widget, node);
  assert.equal(captured.data.section, node);
  assert.deepEqual(captured.data.config, { compact: true });
});

// ── Phase-3 catalog-driven dispatch ──────────────────────────────────────────
// When ctx.blockCatalog.available, the catalog owns block EXISTENCE (unknown
// types → placeholder comment) and PLUGIN GATING (requiresPlugin display name
// → loadout slug via ENDPOINT_SLUGS → ctx.loadedPlugins). Template PATH
// resolution stays convention-based (resolveBlockTemplate) until Phase 7.
// Display names below are the VERIFIED plugin `name` values — see the
// ENDPOINT_SLUGS provenance comment in lib/render-composition.mjs.

const CATALOG = { available: true, byId: {
  "recent-posts": { id: "recent-posts", label: "Recent Posts", icon: "newspaper", requiresPlugin: null },
  "github-repos": { id: "github-repos", label: "GitHub Projects", icon: "github", requiresPlugin: "GitHub activity endpoint", legacy: false },
  "cv-experience": { id: "cv-experience", label: "Experience", requiresPlugin: "CV editor endpoint", legacy: true },
  "donation-box": { id: "donation-box", label: "Donate", requiresPlugin: "Some unmapped endpoint" },
}};

test("catalog-driven: known type renders; requiresPlugin gates on loadedPlugins via ENDPOINT_SLUGS", async () => {
  const node = { block: "section", id: "b1", type: "github-repos", config: {} };
  const ctxLoaded = { blockCatalog: CATALOG, loadedPlugins: { github: true } };
  assert.match(await renderNode(node, mockRender, ctxLoaded), /widgets\/github-repos/);
  const ctxUnloaded = { blockCatalog: CATALOG, loadedPlugins: {} };
  const html = await renderNode(node, mockRender, ctxUnloaded);
  assert.match(html, /<!-- block-skipped: github-repos \(requires github\) -->/);
});

test("catalog-driven: unknown type yields a logged placeholder comment, not silence", async () => {
  const node = { block: "section", id: "bx", type: "no-such-block", config: {} };
  const html = await renderNode(node, mockRender, { blockCatalog: CATALOG, loadedPlugins: {} });
  assert.match(html, /<!-- block-unknown: no-such-block -->/);
});

test("catalog-driven: inherited object names cannot bypass the existence gate", async () => {
  // byId built as an object literal inherits "constructor"/"toString" — the
  // hasOwn lookup must treat them as unknown types (placeholder), not let
  // them through to renderFile as phantom catalog entries.
  const node = { block: "section", id: "bp", type: "constructor", config: {} };
  const html = await renderNode(node, mockRender, { blockCatalog: CATALOG, loadedPlugins: {} });
  assert.match(html, /<!-- block-unknown: constructor -->/);
});

test("catalog absent: falls back to convention-based resolution (Phase 1 behavior)", async () => {
  const node = { block: "section", id: "b2", type: "recent-posts", config: {} };
  const html = await renderNode(node, mockRender, { blockCatalog: { byId: {}, available: false }, loadedPlugins: {} });
  assert.match(html, /sections\/recent-posts/);
});

test("built-ins (requiresPlugin null) are never gated", async () => {
  const node = { block: "section", id: "b3", type: "recent-posts", config: {} };
  const html = await renderNode(node, mockRender, { blockCatalog: CATALOG, loadedPlugins: {} });
  assert.match(html, /id=b3/);
});

// ── Phase-3 interim legacy-map gate (dies in Phase 7) ────────────────────────
// The catalog marks api-source widgets (github-repos, blogroll, webmentions, …)
// requiresPlugin: null because site-config registers them on behalf of their
// data plugins. Until Phase 7, whenever the catalog produced no slug, the v3
// legacy maps (widgetPluginRequirements / sectionPluginRequirements) provide a
// secondary gate so a plugin-less site skips cleanly instead of rendering
// broken widget chrome.

test("LEGACY GATE: catalog-built-in api-source widget (requiresPlugin null) keeps v3 gating via legacy map", async () => {
  // Models PRODUCTION reality: github-repos is in the live catalog with
  // requiresPlugin null — the legacy widget map still requires "github".
  const catalogProd = { available: true, byId: {
    "github-repos": { id: "github-repos", label: "GitHub Projects", requiresPlugin: null },
  }};
  const node = { block: "section", id: "g1", type: "github-repos", config: {} };
  const skipped = await renderNode(node, mockRender, { blockCatalog: catalogProd, loadedPlugins: {} });
  assert.match(skipped, /<!-- block-skipped: github-repos \(requires github\) -->/);
  const rendered = await renderNode(node, mockRender, { blockCatalog: catalogProd, loadedPlugins: { github: true } });
  assert.match(rendered, /widgets\/github-repos/);
  assert.match(rendered, /id=g1/);
});

test("LEGACY GATE: requiresPlugin-null type absent from both legacy maps still renders ungated", async () => {
  // "author-card" is in KNOWN_WIDGET_TYPES but NOT in widgetPluginRequirements
  // (plugin-independent theme widget) — the secondary gate must not block it.
  const catalogProd = { available: true, byId: {
    "author-card": { id: "author-card", label: "Author Card", requiresPlugin: null },
  }};
  const node = { block: "section", id: "a1", type: "author-card", config: {} };
  const html = await renderNode(node, mockRender, { blockCatalog: catalogProd, loadedPlugins: {} });
  assert.match(html, /widgets\/author-card/);
  assert.match(html, /id=a1/);
});

test("FAIL-OPEN: an UNMAPPED requiresPlugin display name renders UNGATED (with a warn)", async () => {
  // "Some unmapped endpoint" has no ENDPOINT_SLUGS entry — the renderer must
  // not guess a slug; it warns and renders the block ungated (runtime safety
  // net for catalog entries registered by plugins newer than this theme).
  // NOTE: the fail-open path now also runs the legacy-map secondary gate —
  // "donation-box" is verified absent from BOTH legacy maps, so it stays a
  // pure fail-open probe.
  const node = { block: "section", id: "b4", type: "donation-box", config: {} };
  const html = await renderNode(node, mockRender, { blockCatalog: CATALOG, loadedPlugins: {} });
  assert.match(html, /sections\/donation-box/);
  assert.match(html, /id=b4/);
});

test("ENDPOINT_SLUGS drift guard: display-name keys map to well-formed loadout slugs", () => {
  // Source of truth for the KEYS is the production block catalog
  // (requiresPlugin = registering endpoint's display name); the VALUES are
  // loadout keys from loaded-plugins.json. A fully mechanical theme-side
  // drift guard isn't possible (the catalog lives in production) — the
  // fail-open behavior above is the runtime safety net for drift.
  assert.ok(Object.keys(ENDPOINT_SLUGS).length > 0, "ENDPOINT_SLUGS must not be empty");
  for (const [name, slug] of Object.entries(ENDPOINT_SLUGS)) {
    assert.equal(typeof name, "string");
    assert.ok(name.length > 0, "display-name key must be non-empty");
    assert.match(slug, /^[a-z][a-z0-9-]*$/, `slug "${slug}" for "${name}" is not a valid loadout key`);
  }
  // The one mapping the production catalog requires today:
  assert.equal(ENDPOINT_SLUGS["CV editor endpoint"], "cv");
});

test("WIDGET ROUTING: KNOWN_WIDGET_TYPES matches the widgets directory minus section collisions (drift guard)", () => {
  const njkTypes = (relativeDir) =>
    readdirSync(fileURLToPath(new URL(relativeDir, import.meta.url)))
      .filter((file) => file.endsWith(".njk"))
      .map((file) => file.replace(/\.njk$/, ""));

  const widgetTypes = njkTypes("../_includes/components/widgets/");
  const sectionTypes = new Set(njkTypes("../_includes/components/sections/"));
  // The collision rule: types that exist as BOTH a section and a widget route
  // to sections/, so they must NOT be in KNOWN_WIDGET_TYPES.
  const expected = widgetTypes.filter((type) => !sectionTypes.has(type)).sort();

  assert.deepEqual(
    [...KNOWN_WIDGET_TYPES].sort(),
    expected,
    "KNOWN_WIDGET_TYPES is out of sync with _includes/components/widgets/ " +
      "(minus types that also exist in sections/). Update the set in " +
      "lib/render-composition.mjs — or, if you've moved to the Phase-2 block " +
      "catalog, delete KNOWN_WIDGET_TYPES and this test.",
  );
});
