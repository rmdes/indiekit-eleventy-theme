// lib/image-shortcode.mjs
import Image from "@11ty/eleventy-img";

/**
 * Returns true when `src` is an absolute http(s) URL.
 *
 * Remote images are never downloaded or re-encoded — doing so would risk
 * Sharp OOM inside the 3.5 GB container cgroup limit. Instead they pass
 * through with an `eleventy:ignore` attribute, which tells the global
 * eleventyImageTransformPlugin (if present) to skip them.
 *
 * @param {string} src
 * @returns {boolean}
 */
export function isRemote(src) {
  return /^https?:\/\//.test(src || "");
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
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, "&quot;")}"`)
    .join(" ");
}

/**
 * Render an avatar / site-chrome image.
 *
 * - **Remote src** (http/https) — returns a passthrough `<img>` tagged with
 *   `eleventy:ignore` so no optimisation is attempted.
 * - **Local src** (relative or root-relative path) — runs the source through
 *   `@11ty/eleventy-img` (webp + jpeg, single width, cached to `_site/img/`)
 *   and returns the generated `<picture>` or `<img>` markup.
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

  if (!src || isRemote(src)) {
    const safeSrc = (src || "").replace(/"/g, "&quot;");
    return `<img src="${safeSrc}" ${attrsToString(attrs)} eleventy:ignore>`;
  }

  const metadata = await Image(src, {
    widths: [attrs.width || "auto"],
    formats: ["webp", "jpeg"],
    outputDir: "./_site/img/",
    urlPath: "/img/",
    failOnError: false,
  });

  return Image.generateHTML(metadata, attrs);
}
