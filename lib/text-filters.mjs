/**
 * Text/excerpt Nunjucks filters, extracted from eleventy.config.js for unit
 * testing. Behaviour is identical to the inline definitions they replaced.
 *
 * Register them all via the default export:
 *   import registerTextFilters from "./lib/text-filters.mjs";
 *   registerTextFilters(eleventyConfig);
 *
 * The individual functions are exported for tests.
 */

/** Truncate a string to `len` chars, appending an ellipsis when clipped. */
export function truncate(str, len = 200) {
  if (!str) return "";
  if (str.length <= len) return str;
  return str.slice(0, len).trim() + "...";
}

/** Named entities worth decoding. Numeric references are handled generically. */
const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

/**
 * Strip HTML tags and decode entities → clean plain text.
 * Shared by `plainText` (full) and `ogDescription` (truncated excerpt).
 *
 * Decoding matters: a bare tag-strip leaves entities encoded, and Nunjucks
 * auto-escaping then re-encodes the ampersand, so the meta tag ships the
 * entity as visible text. That is where `&amp;#9998;` in rmendes.net's
 * og:description came from — post.njk writes its post-type badge as numeric
 * references (`&#9998; Note`), which the old fixed list of six NAMED entities
 * never matched.
 *
 * Decoding happens in ONE pass. Chained .replace() calls decoded `&amp;` first,
 * so an author's literal `&amp;lt;` became `&lt;` became `<` — one entity
 * decoded twice.
 * @param {string} content - HTML
 * @returns {string} Plain text with entities resolved
 */
export function toPlainText(content) {
  if (!content) return "";
  const text = content
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#[Xx][0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, (entity, body) => {
      if (body[0] === "#") {
        const code = Number.parseInt(
          body[1] === "x" || body[1] === "X" ? body.slice(2) : body.slice(1),
          body[1] === "x" || body[1] === "X" ? 16 : 10,
        );
        // Reject non-characters and out-of-range values rather than emitting
        // U+FFFD into a meta tag.
        if (!Number.isFinite(code) || code < 0x20 || code > 0x10ffff) return "";
        try {
          return String.fromCodePoint(code);
        } catch {
          return "";
        }
      }
      // An unknown named entity stays as written — decoding it to nothing
      // would silently eat text.
      return NAMED_ENTITIES[body] ?? entity;
    });
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The post body, when the HTML carries microformats.
 *
 * A post layout wraps its body in `e-content`; everything around it — the
 * post-type badge, date, tags, the AI-transparency disclosure, and the hidden
 * `p-summary` Bridgy duplicate — is page furniture. base.njk derives the
 * description from the WHOLE rendered layout, so without this the og:description
 * read "✎ Note 2 September 2026 bluesky indiekit <body> <body again> AI: Text
 * None Learn more about AI usage on this sit…".
 *
 * Non-post pages have no e-content and are returned unchanged.
 * @param {string} content - HTML
 * @returns {string} The e-content subtree, or `content` untouched
 */
function extractContentBody(content) {
  const open = /<(\w+)[^>]*\bclass="[^"]*\be-content\b[^"]*"[^>]*>/.exec(content);
  if (!open) return content;

  // Walk same-tag open/close pairs to find the matching end tag; a prose body
  // routinely nests <div>s, so the first </div> is not necessarily ours.
  const tag = open[1];
  const start = open.index + open[0].length;
  const scanner = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, "gi");
  scanner.lastIndex = start;
  let depth = 1;
  let match;
  while ((match = scanner.exec(content))) {
    depth += match[0][1] === "/" ? -1 : 1;
    if (depth === 0) return content.slice(start, match.index);
  }
  // Unbalanced markup: everything from the body onward still beats page chrome.
  return content.slice(start);
}

/**
 * Clean excerpt for OpenGraph / cards — the post body as plain text, truncated.
 * Scoped to `e-content` when present so the excerpt is what the post SAYS, not
 * the furniture the layout renders around it. `plainText` deliberately keeps
 * the whole document.
 * @param {string} content - HTML
 * @param {number} [len] - Max length before ellipsis
 * @returns {string} Excerpt
 */
export function ogDescription(content, len = 200) {
  let text = toPlainText(extractContentBody(content));
  if (text.length > len) {
    text = text.slice(0, len).trim() + "...";
  }
  return text;
}

/** First non-hidden, non-data-URI <img src> in content, or null. */
export function extractFirstImage(content) {
  if (!content) return null;
  // Match all <img> tags, skip hidden ones and data URIs
  const imgRegex = /<img[^>]*?\ssrc=["']([^"']+)["'][^>]*>/gi;
  for (const match of content.matchAll(imgRegex)) {
    const fullTag = match[0];
    const src = match[1];
    if (src.startsWith("data:")) continue;
    if (/\bhidden\b/.test(fullTag)) continue;
    return src;
  }
  return null;
}

/** Encode an email as HTML decimal entities (anti-scraping). mode="href" also encodes the mailto: prefix. */
export function obfuscateEmail(email, mode = "display") {
  if (!email) return "";
  // Convert each character to HTML decimal entity
  const encoded = [...email].map(char => `&#${char.charCodeAt(0)};`).join("");
  if (mode === "href") {
    // For mailto: links, also encode the "mailto:" prefix
    const mailto = [...("mailto:")].map(char => `&#${char.charCodeAt(0)};`).join("");
    return mailto + encoded;
  }
  return encoded;
}

/** Register all text filters on an Eleventy config. */
export default function registerTextFilters(eleventyConfig) {
  eleventyConfig.addFilter("truncate", truncate);
  eleventyConfig.addFilter("plainText", toPlainText);
  eleventyConfig.addFilter("ogDescription", ogDescription);
  eleventyConfig.addFilter("extractFirstImage", extractFirstImage);
  eleventyConfig.addFilter("obfuscateEmail", obfuscateEmail);
}
