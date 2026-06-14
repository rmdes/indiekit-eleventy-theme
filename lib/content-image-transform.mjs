// lib/content-image-transform.mjs

// outputPath -> hasImages boolean, populated by the _imageGate collection below.
// Eleventy transforms only receive the `page` sub-object (no data cascade), so we
// thread the per-page hasImages flag in via a collection (which has item.data) keyed
// by the shared outputPath.
const imageGate = new Map();

/**
 * Register a collection that records each page's hasImages flag by outputPath.
 * Collections are resolved before any transform runs, so the map is fully populated
 * by transform time. Returns an empty collection (side-effect only).
 */
export function registerImageGate(eleventyConfig) {
  eleventyConfig.addCollection("_imageGate", (api) => {
    imageGate.clear();
    for (const item of api.getAll()) {
      if (item.outputPath) {
        imageGate.set(item.outputPath, item.data?.hasImages === true);
      }
    }
    return [];
  });
}

/**
 * Gate: should the content-image pipeline run for this page?
 * HTML pages are optimized UNLESS explicitly flagged image-free (hasImages === false).
 * A page absent from the gate map (undefined — e.g. eleventyExcludeFromCollections
 * pages) defaults to OPTIMIZE: fail safe, never ship unoptimized images. The ~95%
 * chrome-only content pages are all in collections with an explicit false → skipped,
 * so the parse-reduction win is preserved.
 */
export function shouldOptimize(outputPath, hasImages) {
  return typeof outputPath === "string"
    && outputPath.endsWith(".html")
    && hasImages !== false;
}

/**
 * Override for Eleventy's built-in "@11ty/eleventy/html-transformer" (registered under
 * that exact name → replaces the built-in). Image-bearing pages run the full pipeline
 * via transformContent (eleventy-img + remote-image-marker); explicitly image-free
 * pages return content untouched, skipping the PostHTML parse. The URL-callback guard
 * keeps correctness if addUrlTransform callbacks are ever registered (they modify
 * <a>/<link>, not just <img>, so the full pipeline must still run for them).
 */
export function makeContentImageTransform(eleventyConfig) {
  return async function (content) {
    const hasImages = imageGate.get(this.outputPath);
    if (!shouldOptimize(this.outputPath, hasImages)) {
      const hasUrlCallbacks =
        eleventyConfig.htmlTransformer.getCallbacks("html", this).length > 0;
      if (!hasUrlCallbacks) return content;
    }
    return eleventyConfig.htmlTransformer.transformContent(this.outputPath, content, this);
  };
}
