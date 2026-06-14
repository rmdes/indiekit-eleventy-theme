// lib/image-shortcode.mjs
import Image from "@11ty/eleventy-img";

/**
 * Returns true when `src` is an absolute http(s) URL.
 *
 * Remote images are never downloaded or re-encoded — doing so would risk
 * Sharp OOM inside the 3.5 GB container cgroup limit.
 *
 * @param {string} src
 * @returns {boolean}
 */
export function isRemote(src) {
  return /^https?:\/\//.test(src || "");
}

/**
 * Returns true when `src` points to an SVG file (by extension, with optional
 * query string or fragment).  SVGs must never be rasterized by Sharp.
 *
 * @param {string} src
 * @returns {boolean}
 */
export function isSvg(src) {
  return /\.svg(\?|#|$)/i.test(src || "");
}

/**
 * Serialises an attribute map to a string of `key="value"` pairs, omitting
 * entries whose value is undefined, null, or empty string.
 *
 * @param {Record<string, unknown>} attrs
 * @returns {string}
 */
function attrsToString(attrs) {
  return Object.entries(attrs)
    .filter(([k, v]) => (v !== undefined && v !== null && v !== "") || k === "alt")
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, "&quot;")}"`)
    .join(" ");
}

/**
 * Build a plain passthrough `<img>` (no eleventy-img processing, no
 * `eleventy:ignore`). Used for remote/SVG/empty sources and as the fault
 * tolerant fallback when local optimization fails.
 *
 * @param {string} src
 * @param {Record<string, unknown>} attrs
 * @returns {string}
 */
function passthrough(src, attrs) {
  const safeSrc = (src || "").replace(/"/g, "&quot;");
  return `<img src="${safeSrc}" ${attrsToString(attrs)}>`;
}

/**
 * Render an avatar / site-chrome image.
 *
 * - **Remote src** (http/https) or **SVG** or **falsy src** — returns a
 *   passthrough `<img>` with no `eleventy:ignore` attribute.  We deliberately
 *   omit `eleventy:ignore` because cleanTag (which strips it) only runs when
 *   the global eleventyImageTransformPlugin transform fires; when the hasImages
 *   gate skips the transform the attribute would leak into the browser HTML.
 * - **Local raster src** (relative or root-relative path) — runs the source
 *   through `@11ty/eleventy-img` (webp + jpeg, single width, cached to
 *   `_site/img/`) and returns the generated `<picture>` or `<img>` markup.
 *
 * Defaults decoding to `"async"` and loading to `"lazy"` unless the caller
 * overrides them (e.g. pass `loading: "eager"` for above-the-fold hero avatars).
 *
 * @param {string} src - Image source (URL or file path)
 * @param {Record<string, unknown>} attributes - HTML attributes forwarded to
 *   the rendered element.  `alt` is required by eleventy-img for local sources.
 * @returns {Promise<string>} HTML string
 */
export async function renderAvatar(src, attributes = {}) {
  const attrs = { decoding: "async", loading: "lazy", ...attributes };

  // Passthrough (skip eleventy-img) for remote URLs, SVGs, and empty src.
  // We deliberately do NOT emit `eleventy:ignore`:
  //  - remote imgs are protected from Sharp by the remote-image-marker PostHTML
  //    plugin (and cleaned by cleanTag) WHEN the global transform runs;
  //  - SVGs are vectors — never rasterize; if the transform does hit one it fails
  //    gracefully (failOnError:false), leaving the original tag;
  //  - and when the hasImages gate SKIPS the transform, cleanTag never runs, so
  //    emitting `eleventy:ignore` would leak it into the final HTML.
  if (!src || isRemote(src) || isSvg(src)) {
    return passthrough(src, attrs);
  }

  // Local raster source: optimize via eleventy-img. A single missing or
  // unreadable file must NEVER crash the whole site build — eleventy-img's
  // programmatic Image() throws on stat failure (e.g. ENOENT) even with
  // failOnError:false, unlike its PostHTML transform which logs and continues.
  // Fall back to a plain passthrough <img> on any error (matches pre-1b
  // behavior, where the global transform left an unresolvable <img> intact).
  try {
    const metadata = await Image(src, {
      widths: [attrs.width || "auto"],
      formats: ["webp", "jpeg"],
      outputDir: "./_site/img/",
      urlPath: "/img/",
      failOnError: false,
    });

    return Image.generateHTML(metadata, attrs);
  } catch (error) {
    console.warn(`[avatar] optimize failed for "${src}": ${error.message} — passthrough`);
    return passthrough(src, attrs);
  }
}
