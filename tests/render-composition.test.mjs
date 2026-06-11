import { test } from "node:test";
import assert from "node:assert/strict";
import { renderNode, resolveBlockTemplate } from "../lib/render-composition.mjs";

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
