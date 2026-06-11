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

export function resolveBlockTemplate(type) {
  return `_includes/components/sections/${type}.njk`;
}

async function renderSection(node, renderFn, ctx) {
  if (!node.type) return "";
  const templatePath = resolveBlockTemplate(node.type);
  return renderFn(templatePath, { block: node, section: node, config: node.config || {}, ...ctx });
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
