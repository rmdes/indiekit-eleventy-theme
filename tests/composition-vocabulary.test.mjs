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

// Role-marker tokens deliberately WITHOUT a CSS rule — pure semantic anchors,
// not layout: do not "fix" them by adding styles or safelist entries.
const UNSTYLED_ROLE_TOKENS = new Set([
  "comp-root",
  "comp-region",
  "comp-banner",
  "comp-contentinfo",
]);

test("ARTIFACT CORNER: every token the committed homepage artifact emits is styled or an exempt role marker", () => {
  // Closes the third corner of the triangulation (renderer ↔ CSS ↔ artifact):
  // a typo'd `as`/`variant`/`role` value in a (future machine-written)
  // artifact would emit a comp-* class with no CSS rule and render silently
  // unstyled — this walks the real committed artifact through
  // containerClasses() and catches it.
  // The fixture lives in tests/fixtures/ (NOT content/) so Tier-0 stays
  // dormant in every clone until a runtime artifact is deliberately written
  // to content/_data/compositions/homepage.json (Phase 3+ site-config plugin).
  const artifact = JSON.parse(read("./fixtures/composition-homepage.json"));
  const styled = new Set(tokens);

  const collectContainers = (node, out = []) => {
    if (!node || typeof node !== "object") return out;
    if (node.block === "container") out.push(node);
    for (const child of Array.isArray(node.children) ? node.children : []) {
      collectContainers(child, out);
    }
    return out;
  };

  const containers = collectContainers(artifact.tree);
  assert.ok(containers.length > 0, "artifact tree has no containers — walk is vacuous, check the artifact/walker");

  for (const container of containers) {
    for (const token of containerClasses(container).split(" ")) {
      assert.ok(
        styled.has(token) || UNSTYLED_ROLE_TOKENS.has(token),
        `artifact emits "${token}" which has no CSS rule and is not an exempt role marker — ` +
          `typo'd as/variant/role value? (styled: ${[...styled].join(", ")}; exempt: ${[...UNSTYLED_ROLE_TOKENS].join(", ")})`,
      );
    }
  }
});
