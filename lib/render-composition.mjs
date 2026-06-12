import widgetPluginRequirements from "../_data/widgetPluginRequirements.js";
import sectionPluginRequirements from "../_data/sectionPluginRequirements.js";

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
 * Phase-1 widget routing bridge — PATH RESOLUTION ONLY since Phase 3.
 * Sidebar widget partials live in `_includes/components/widgets/`, not
 * `sections/` — the composition vocabulary has a single flat `type`
 * namespace, so this explicit set routes widget types to the widgets
 * directory. Derived from the actual files in `_includes/components/widgets/`,
 * EXCLUDING types that also exist as sections ("recent-posts", "ai-usage") —
 * for those collisions the section template wins (deterministic rule).
 * Block EXISTENCE and plugin GATING are owned by the block catalog
 * (ctx.blockCatalog, see renderSection); a `blocks/` directory probe that
 * retires this set entirely is Phase 7.
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

/**
 * ENDPOINT_SLUGS — catalog `requiresPlugin` display name → plugin-loadout slug.
 *
 * The block catalog stamps each plugin-registered block with the registering
 * endpoint's DISPLAY NAME (`sourcePlugin` in site-config's scan-plugins.js →
 * `requiresPlugin` in block-catalog.json). The theme's loadedPlugins map is
 * keyed by registry/loadout SLUGS — this map bridges the two.
 *
 * VERIFIED 2026-06-12 against production (rmendes.net):
 * - Distinct non-null `requiresPlugin` values in the live catalog
 *   (/app/data/content/_data/block-catalog.json, 37 blocks):
 *   "CV editor endpoint" (15 cv-* blocks). All other blocks: null (built-in).
 * - Loadout slugs from /app/data/content/_data/loaded-plugins.json keys:
 *   "cv", "github", …
 * - Display names from plugin sources:
 *   "CV editor endpoint"      → indiekit-endpoint-cv/index.js     (name field)
 *   "GitHub activity endpoint"→ indiekit-endpoint-github/index.js (name field)
 *   (github pre-mapped: it is the most likely next homepageWidgets registrant;
 *   today only the CV plugin registers catalog blocks.)
 *
 * SOURCE OF TRUTH is the production catalog — a fully mechanical theme-side
 * drift guard isn't possible (the catalog is generated at runtime by the
 * site-config plugin). UNMAPPED names FAIL OPEN: the block renders ungated
 * with a warn (see renderSection) — that is the runtime safety net when a
 * plugin starts registering blocks before this map learns its name.
 */
export const ENDPOINT_SLUGS = Object.freeze({
  "CV editor endpoint": "cv",
  "GitHub activity endpoint": "github",
});

/**
 * Single catalog lookup point — hasOwn discipline lives here: byId may be a
 * plain object literal (test fixtures), so an inherited name as the type
 * ("constructor", "toString") must not pass the existence gate and crash in
 * renderFile instead of placeholding. The loader also builds byId with a
 * null prototype. Shared by renderSection (existence/gating) and the
 * complementary chrome wrap (labels/icons).
 */
function catalogEntry(catalog, type) {
  if (!catalog?.available || !catalog.byId) return undefined;
  return Object.hasOwn(catalog.byId, type) ? catalog.byId[type] : undefined;
}

async function renderSection(node, renderFn, ctx) {
  if (!node.type) return "";
  // Phase 3: when the catalog artifact is present it owns block EXISTENCE
  // (unknown types → placeholder, never a renderFile throw) and PLUGIN
  // GATING (requiresPlugin → loadout slug → ctx.loadedPlugins). Template
  // PATH resolution stays convention-based below (Phase 7 moves it here).
  // DELIBERATE ASYMMETRY: ALL gating (catalog + legacy maps) is scoped to
  // catalog-available; catalog-absent keeps exact Phase-1 zero-gating parity
  // (theme-only dev — production always ships the catalog). Don't "fix" this
  // in either direction.
  const catalog = ctx.blockCatalog;
  if (catalog?.available) {
    const entry = catalogEntry(catalog, node.type);
    if (!entry) {
      console.warn(`[render-composition] unknown block type "${node.type}" (id=${node.id || "?"}) — placeholder emitted`);
      return `<!-- block-unknown: ${String(node.type).replace(/[<>]/g, "")} -->`;
    }
    const slug = entry.requiresPlugin
      ? (Object.hasOwn(ENDPOINT_SLUGS, entry.requiresPlugin) ? ENDPOINT_SLUGS[entry.requiresPlugin] : null)
      : null;
    if (entry.requiresPlugin && slug && !ctx.loadedPlugins?.[slug]) {
      console.warn(`[render-composition] block "${node.type}" skipped — requires plugin "${slug}" (not in loadout)`);
      return `<!-- block-skipped: ${String(node.type).replace(/[<>]/g, "")} (requires ${slug}) -->`;
    }
    if (entry.requiresPlugin && !slug) {
      // Fail open at the CATALOG layer: a missing name mapping never blanks
      // a block by itself — but the legacy-map gate below still gets its say.
      console.warn(`[render-composition] no ENDPOINT_SLUGS mapping for "${entry.requiresPlugin}" — falling through to legacy-map gate for "${node.type}"`);
    }
    if (!slug) {
      // Phase-3 interim, dies in Phase 7 with the maps: api-source blocks the
      // catalog marks built-in (registered by site-config on behalf of their
      // data plugins) keep exact v3 gating semantics via the legacy maps.
      const legacyMap = KNOWN_WIDGET_TYPES.has(node.type)
        ? widgetPluginRequirements : sectionPluginRequirements;
      const legacySlug = Object.hasOwn(legacyMap, node.type) ? legacyMap[node.type] : null;
      if (legacySlug && !ctx.loadedPlugins?.[legacySlug]) {
        console.warn(`[render-composition] block "${node.type}" skipped — requires plugin "${legacySlug}" (legacy map, not in loadout)`);
        return `<!-- block-skipped: ${String(node.type).replace(/[<>]/g, "")} (requires ${legacySlug}) -->`;
      }
    }
  }
  const templatePath = resolveBlockTemplate(node.type);
  // `section` mirrors homepage-section.njk's context; `widget` mirrors
  // homepage-sidebar.njk's include scope, where the loop variable `widget`
  // is visible to partials. Per-node data spreads AFTER ctx so ctx keys
  // (blockCatalog, loadedPlugins since Phase 3) can never silently shadow
  // it. loadedPlugins is also in the global cascade partials already read —
  // passing the same value explicitly is harmless; blockCatalog is unused
  // by any partial (verified by grep over _includes/).
  return renderFn(templatePath, { ...ctx, block: node, section: node, widget: node, config: node.config || {} });
}

const CHROME_TEMPLATE = "_includes/components/composition-widget-chrome.njk";

/**
 * Container-owned collapse chrome (Phase 3, spec §4): complementary containers
 * wrap each SECTION child in the collapsible widget chrome, keyed on the
 * STABLE block id (v3's dispatcher keyed `widget-<type>-<loop.index0>`, which
 * shifts on reorder — a recorded bug; the partial also adds the
 * aria-controls/panel-id pair, the WCAG 4.1.2 fix). The renderer passes RAW
 * catalog values (`title`/`iconName` may be "") plus `widgetType` — the
 * PARTIAL owns the fallback chain (catalog label → legacy type maps → raw
 * type). First-3-open is a position heuristic over the container's children.
 *
 * NO chrome for: nested container children (only section leaves are widgets),
 * and children whose output is empty or a placeholder comment (block-skipped /
 * block-unknown / block-error) — an empty collapsible with a title for a
 * block that isn't there is wrong; placeholders pass through bare.
 */
async function wrapWidgetChrome(child, index, innerHtml, renderFn, ctx) {
  const trimmed = innerHtml.trim();
  if (!trimmed || trimmed.startsWith("<!--")) return innerHtml;
  const entry = catalogEntry(ctx.blockCatalog, child.type);
  const blockId = child.id || `pos${index}`;
  try {
    return await renderFn(CHROME_TEMPLATE, {
      blockId,
      widgetType: child.type || "",
      title: entry?.label || "",
      iconName: entry?.icon || "",
      defaultOpen: index < 3 ? "true" : "false",
      innerHtml,
    });
  } catch (error) {
    // Same containment contract as renderNode's safeBlock: a chrome render
    // failure degrades to the BARE widget — never lose the widget itself.
    console.warn(`[render-composition] widget chrome for "${child.type || "?"}" (id=${blockId}) failed: ${error.message} — emitting bare widget`);
    return innerHtml;
  }
}

async function renderContainer(node, renderFn, ctx) {
  const children = Array.isArray(node.children) ? node.children : [];
  const isComplementary = node.role === "complementary";
  const parts = await Promise.all(children.map(async (child, index) => {
    const html = await renderNode(child, renderFn, ctx);
    if (!isComplementary || child?.block !== "section") return html;
    return wrapWidgetChrome(child, index, html, renderFn, ctx);
  }));
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
    // Unrecognized block kind — render nothing, but never silently.
    console.warn(`[render-composition] unknown block kind "${node.block}" (id=${node.id || "?"}) — rendered as empty`);
    return "";
  } catch (error) {
    const label = node.type || node.as || "unknown";
    console.warn(`[render-composition] block "${label}" (id=${node.id || "?"}) failed: ${error.message}`);
    return `<!-- block-error: ${String(label).replace(/[<>]/g, "")} -->`;
  }
}
