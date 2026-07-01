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

/**
 * Strip HTML tags and decode common entities → clean plain text.
 * Shared by `plainText` (full) and `ogDescription` (truncated excerpt).
 * Decoding matters: a bare tag-strip leaves entities like &quot; encoded,
 * and Nunjucks auto-escaping then double-encodes them (&amp;quot; → literal
 * &quot;). Decoding here yields real chars that escape cleanly on output.
 */
export function toPlainText(content) {
  if (!content) return "";
  let text = content.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"')
             .replace(/&#39;/g, "'")
             .replace(/&nbsp;/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

/** Clean excerpt for OpenGraph / cards — plain text, truncated to `len`. */
export function ogDescription(content, len = 200) {
  let text = toPlainText(content);
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
