import { test } from "node:test";
import assert from "node:assert/strict";
import { renderNode } from "../lib/render-composition.mjs";

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
