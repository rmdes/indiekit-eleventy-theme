import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
  // main → div, NOT <main>: the composition renders INSIDE base.njk's
  // <main id="main-content">, so emitting <main> nests landmarks (invalid
  // HTML + duplicate landmark for assistive tech). No role="main" attribute
  // either — it would duplicate the landmark just the same; the upstream
  // layout owns it. Styling is class-based (.comp-main), so the tag is
  // irrelevant to CSS (verified: no tag-based comp selectors in tailwind.css).
  main: "div", complementary: "aside", contentinfo: "footer",
  banner: "header", region: "section", root: "div",
};

/**
 * Widget routing — PATH RESOLUTION ONLY (block existence/gating is owned by the
 * block catalog, see renderSection). Sidebar widget partials live in
 * `_includes/components/widgets/`, sections in `_includes/components/sections/`;
 * the composition vocabulary is a single flat `type` namespace, so we route a
 * type to the right directory.
 *
 * Phase 7d follow-up: the two sets are now DERIVED FROM THE FILESYSTEM at module
 * load (the "blocks/ directory probe" the hardcoded lists were a placeholder
 * for), so adding/removing a partial needs no edit here:
 *   - COLLISION_TYPES  = types with BOTH a widget AND a section template. The
 *     section wins by default; inside a complementary region the WIDGET (compact
 *     sidebar variant) wins — region-aware override (T4 parity).
 *   - KNOWN_WIDGET_TYPES = PURE widget types (widget template, no section twin) →
 *     always route to widgets/.
 * Path resolution stays relative to THIS module (import.meta.url), so it is
 * cwd-independent (mirrors tests/render-composition.test.mjs's drift guard).
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPONENTS_DIR = join(__dirname, "..", "_includes", "components");

function njkTypeNames(subdir) {
  try {
    return readdirSync(join(COMPONENTS_DIR, subdir))
      .filter((f) => f.endsWith(".njk"))
      .map((f) => f.slice(0, -4));
  } catch {
    return [];
  }
}

const WIDGET_TEMPLATE_TYPES = new Set(njkTypeNames("widgets"));
const SECTION_TEMPLATE_TYPES = new Set(njkTypeNames("sections"));

export const COLLISION_TYPES = new Set(
  [...WIDGET_TEMPLATE_TYPES].filter((t) => SECTION_TEMPLATE_TYPES.has(t)),
);
export const KNOWN_WIDGET_TYPES = new Set(
  [...WIDGET_TEMPLATE_TYPES].filter((t) => !SECTION_TEMPLATE_TYPES.has(t)),
);

export function resolveBlockTemplate(type, region) {
  if (KNOWN_WIDGET_TYPES.has(type)) {
    return `_includes/components/widgets/${type}.njk`;
  }
  if (region === "complementary" && COLLISION_TYPES.has(type)) {
    return `_includes/components/widgets/${type}.njk`;
  }
  return `_includes/components/sections/${type}.njk`;
}

// Phase 7d — ENDPOINT_SLUGS (the requiresPlugin display-name → loadout-slug
// bridge) was REMOVED. Now that every plugin-owned block is declared by its
// plugin via get blocks() (Phases 7b/7c) and the matching BUILTIN_BLOCKS seeds
// are gone (site-config), a migrated block is present in a site's runtime
// catalog ONLY when its plugin is loaded — so catalog PRESENCE is the gate, and
// the render-time requiresPlugin / legacy-map gating is retired (see renderSection).

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
  // When the catalog artifact is present it owns block EXISTENCE: an unknown
  // type → placeholder comment (never a renderFile throw). Phase 7d retired the
  // render-time PLUGIN GATING (requiresPlugin → loadout slug, + the legacy
  // widget/section requirement maps): a plugin-owned block is in a site's
  // catalog ONLY when its plugin is loaded (the plugin's get blocks() is the
  // sole source now that the BUILTIN_BLOCKS seeds are gone), so catalog
  // PRESENCE already gates it — a redundant render-time gate could only ever
  // wrongly blank a block. Theme built-ins (requiresPlugin null) are always
  // present and were never gated. DELIBERATE ASYMMETRY: the existence check is
  // scoped to catalog-available; catalog-absent (theme-only dev) keeps Phase-1
  // zero-gating parity — production always ships the catalog. Template PATH
  // resolution stays convention-based below.
  const catalog = ctx.blockCatalog;
  if (catalog?.available) {
    const entry = catalogEntry(catalog, node.type);
    if (!entry) {
      console.warn(`[render-composition] unknown block type "${node.type}" (id=${node.id || "?"}) — placeholder emitted`);
      return `<!-- block-unknown: ${String(node.type).replace(/[<>]/g, "")} -->`;
    }
  }
  const templatePath = resolveBlockTemplate(node.type, ctx.region);
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
  // Charset guard: blockId reaches inline Alpine JS expressions in the chrome
  // (x-data localStorage key, @click) — Nunjucks entity-encodes quotes, but
  // the browser decodes attribute values BEFORE Alpine evaluates them, so an
  // id containing `'` or `}` would silently break the toggle client-side.
  // Only [\w-] ids pass; anything else falls back to the positional id.
  const blockId = /^[\w-]+$/.test(child.id || "") ? child.id : `pos${index}`;
  if (child.id && blockId !== child.id) {
    console.warn(`[render-composition] block id ${JSON.stringify(child.id)} contains characters unsafe for chrome keys — using positional id "${blockId}"`);
  }
  try {
    return await renderFn(CHROME_TEMPLATE, {
      blockId,
      widgetType: child.type || "",
      // v3 parity: custom-html titles are per-INSTANCE (widget.config.title
      // in the v3 dispatcher map) — catalog labels are per-TYPE and can't
      // carry them, so the instance title takes precedence for that type only.
      title: (child.type === "custom-html" && child.config?.title) || entry?.label || "",
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
  // Region hint for region-aware routing (resolveBlockTemplate): only
  // role-bearing containers set it — role-less nested containers inherit the
  // ancestor region; role-bearing nested containers overwrite it (correct:
  // their subtree IS that region).
  const childCtx = node.role ? { ...ctx, region: node.role } : ctx;
  const parts = await Promise.all(children.map(async (child, index) => {
    const html = await renderNode(child, renderFn, childCtx);
    if (!isComplementary || child?.block !== "section") return html;
    return wrapWidgetChrome(child, index, html, renderFn, childCtx);
  }));
  const inner = parts.join("");
  const tag = CONTAINER_TAG_BY_ROLE[node.role] || "div";
  const cls = containerClasses(node);
  const pf = isComplementary ? ' data-pagefind-ignore' : "";
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
