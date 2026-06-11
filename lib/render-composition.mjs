/**
 * Pure recursive composition renderer (Phase 1). No Eleventy import — the
 * render function is injected so the per-block error boundary is unit-testable.
 *
 * A node is either:
 *   - container: { block:"container", as, role, variant, children:[] }
 *   - section:   { block:"section", id, type, v, config }
 *
 * Crash containment ("safeBlock"): every node render is wrapped in try/catch;
 * a throw becomes `<!-- block-error: <type> -->` + a warning, and siblings/
 * parents keep rendering. One bad block can NEVER fail the build. Spec §4.
 * @module render-composition
 */

const CONTAINER_TAG_BY_ROLE = {
  main: "main", complementary: "aside", contentinfo: "footer",
  banner: "header", region: "section", root: "div",
};

/**
 * Phase-1 widget routing bridge. Sidebar widget partials live in
 * `_includes/components/widgets/`, not `sections/` — the Phase-1 composition
 * vocabulary has a single flat `type` namespace, so this explicit set routes
 * widget types to the widgets directory. Derived from the actual files in
 * `_includes/components/widgets/`, EXCLUDING types that also exist as
 * sections ("recent-posts", "ai-usage") — for those collisions the section
 * template wins (deterministic rule). Phase 2's block catalog replaces this
 * set with per-block template metadata.
 */
export const KNOWN_WIDGET_TYPES = new Set([
  "author-card",
  "author-card-compact",
  "blogroll",
  "categories",
  "fediverse-follow",
  "feedland",
  "funkwhale",
  "github-repos",
  "post-categories",
  "post-navigation",
  "recent-comments",
  "recent-posts-blog",
  "search",
  "share",
  "social-activity",
  "subscribe",
  "toc",
  "webmentions",
]);

export function resolveBlockTemplate(type) {
  if (KNOWN_WIDGET_TYPES.has(type)) {
    return `_includes/components/widgets/${type}.njk`;
  }
  return `_includes/components/sections/${type}.njk`;
}

async function renderSection(node, renderFn, ctx) {
  if (!node.type) return "";
  const templatePath = resolveBlockTemplate(node.type);
  // `section` mirrors homepage-section.njk's context; `widget` mirrors
  // homepage-sidebar.njk's include scope, where the loop variable `widget`
  // is visible to partials. Per-node data spreads AFTER ctx so future ctx
  // keys can never silently shadow it (ctx is always {} today).
  return renderFn(templatePath, { ...ctx, block: node, section: node, widget: node, config: node.config || {} });
}

async function renderContainer(node, renderFn, ctx) {
  const children = Array.isArray(node.children) ? node.children : [];
  const parts = await Promise.all(children.map((c) => renderNode(c, renderFn, ctx)));
  const inner = parts.join("");
  const tag = CONTAINER_TAG_BY_ROLE[node.role] || "div";
  const cls = containerClasses(node);
  const pf = node.role === "complementary" ? ' data-pagefind-ignore' : "";
  return `<${tag} class="${cls}"${pf}>${inner}</${tag}>`;
}

export function containerClasses(node) {
  const v = node.variant || {};
  const tokens = [`comp-${node.as || "stack"}`];
  if (node.role) tokens.push(`comp-${node.role}`);
  if (v.width) tokens.push(`comp-w-${v.width}`);
  if (v.columns) tokens.push(`comp-cols-${v.columns}`);
  if (v.gap) tokens.push(`comp-gap-${v.gap}`);
  if (v.sticky) tokens.push("comp-sticky");
  return tokens.join(" ");
}

export async function renderNode(node, renderFn, ctx = {}) {
  if (!node || typeof node !== "object") return "";
  try {
    if (node.block === "container") return await renderContainer(node, renderFn, ctx);
    if (node.block === "section")   return await renderSection(node, renderFn, ctx);
    return "";
  } catch (error) {
    const label = node.type || node.as || "unknown";
    console.warn(`[render-composition] block "${label}" (id=${node.id || "?"}) failed: ${error.message}`);
    return `<!-- block-error: ${String(label).replace(/[<>]/g, "")} -->`;
  }
}
