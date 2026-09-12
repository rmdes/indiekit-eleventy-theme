/**
 * Per-page description derivation.
 *
 * The source of truth is a page's OWN markdown — never its rendered HTML.
 *
 * Deriving descriptions by scraping the rendered page is what this module
 * replaces, and every bug it caused traces back to that one decision: the
 * post-type badge arrived as `&#9998;`, the excerpt included the date/tags/AI
 * disclosure and a hidden Bridgy duplicate, listing pages described themselves
 * by whichever post happened to be newest, and — because a V8 substring keeps a
 * pointer to its parent — a 200-character excerpt pinned the whole 230KB page,
 * 764MB across the site, which OOM-looped the watcher for a day.
 *
 * Reading the markdown instead removes all four by construction: no entities to
 * decode, no layout to strip, no heuristics to guess page kind, and nothing
 * large to hold a reference into.
 *
 * Pure and side-effect free: callers supply the data, so this is unit-testable
 * and has no opinion about Eleventy.
 */

/**
 * Strip markdown syntax, leaving plain prose.
 * @param {string} raw - Markdown source
 * @returns {string} Text with markdown constructs removed
 */
export function stripMarkdown(raw) {
  if (!raw) return "";
  return (
    raw
      // Frontmatter. Eleventy's collection `rawInput` has it removed already,
      // but a caller reading the file itself does not.
      .replace(/^---[\s\S]*?---\s*/, "")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "") // images
      .replace(/^\|.*\|$/gm, "") // table rows
      .replace(/^\s*[-|: ]+$/gm, "") // table separators
      .replace(/\{#[^}]+\}/g, "") // heading anchors
      .replace(/<[^>]+>/g, "") // inline HTML
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → text
      .replace(/^#{1,6}\s+/gm, "") // heading markers
      .replace(/[*_~`>]/g, "") // emphasis, code, quote markers
      .replace(/^\s*[-*+]\s+/gm, "") // bullets
      .replace(/^\s*\d+\.\s+/gm, "") // numbered lists
      .replace(/^-{3,}$/gm, "") // horizontal rules
  );
}

/**
 * The first meaningful paragraph of a markdown document.
 * Stops at the first blank line so a description is one idea, not the whole post.
 * @param {string} raw - Markdown source
 * @returns {string} Single-line paragraph text
 */
export function firstParagraph(raw) {
  const lines = stripMarkdown(raw).split("\n");
  const paragraph = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.push(trimmed);
  }

  return paragraph.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Truncate on a word boundary so a description never ends mid-word.
 * @param {string} text
 * @param {number} limit - Maximum length before the ellipsis
 * @returns {string}
 */
function truncate(text, limit) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  // `.slice()` yields a V8 SlicedString that keeps its parent alive; the
  // parent here is one page's markdown rather than a whole rendered site, but
  // concatenating with the ellipsis materialises a standalone string anyway.
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

/**
 * Derive one page's description.
 *
 * Precedence: `summary` first — it is the field Indiekit's Micropub populates
 * (the h-entry `p-summary`, also used for Bridgy syndication text), so on this
 * content it is the author's own short description. Then `description`, for
 * pages authored outside Micropub. Then the opening of the post itself.
 *
 * A page with no prose of its own (a listing, an index) yields "" so the caller
 * falls back to the site description — no page-kind heuristics required. Between
 * that and this chain, a card always has something.
 *
 * @param {object} item - `{ data, rawInput }` from an Eleventy collection item
 * @param {number} [limit] - Maximum length before truncation
 * @returns {string} Plain-text description, or "" when the page has no prose
 */
export function deriveDescription(item, limit = 200) {
  const data = item?.data || {};

  const explicit = data.summary || data.description;
  if (typeof explicit === "string" && explicit.trim()) {
    return truncate(explicit.replace(/\s+/g, " ").trim(), limit);
  }

  const paragraph = firstParagraph(item?.rawInput || "");
  return paragraph ? truncate(paragraph, limit) : "";
}
