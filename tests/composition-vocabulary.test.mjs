/**
 * Sync guard for the Phase-1 closed token vocabulary (spec §2.3).
 *
 * containerClasses() builds class names dynamically (`comp-${node.as}` etc.),
 * so Tailwind's content scanner cannot see them. Every token therefore must
 * be (a) safelisted in tailwind.config.js — or the @layer components rules
 * are tree-shaken out of style.css — and (b) defined in css/tailwind.css.
 *
 * Tokens are derived from containerClasses() itself, so adding a new token
 * to the renderer without wiring up the CSS side fails this test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { containerClasses } from "../lib/render-composition.mjs";

const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

// Nodes exercising the full Phase-1 vocabulary; flatMap through
// containerClasses() so the token list comes from the renderer, not a copy.
const PHASE1_NODES = [
  { as: "stack", role: "main" },
  {
    as: "columns",
    role: "complementary",
    variant: { width: "narrow", columns: "2-1", gap: "tight", sticky: true },
  },
  { as: "stack", variant: { width: "default", gap: "normal" } },
  { as: "stack", variant: { width: "wide", gap: "loose" } },
];

const tokens = [
  ...new Set(PHASE1_NODES.flatMap((node) => containerClasses(node).split(" "))),
];

test("Phase-1 vocabulary covers the expected 12 tokens", () => {
  assert.equal(tokens.length, 12, `derived tokens: ${tokens.join(", ")}`);
});

test("every vocabulary token is safelisted in tailwind.config.js", () => {
  const config = read("../tailwind.config.js");
  for (const token of tokens) {
    assert.ok(
      config.includes(`"${token}"`),
      `"${token}" missing from the tailwind.config.js safelist — without it the .${token} rule is tree-shaken out of style.css`,
    );
  }
});

test("every vocabulary token has a rule in css/tailwind.css", () => {
  const css = read("../css/tailwind.css");
  for (const token of tokens) {
    assert.ok(
      css.includes(`.${token}`),
      `.${token} has no rule in css/tailwind.css — the renderer emits a class with no styling`,
    );
  }
});
