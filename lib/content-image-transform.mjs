// lib/content-image-transform.mjs

/**
 * Gate: should the content-image (PostHTML + eleventy-img + remote-image-marker)
 * pipeline run for this page? Only HTML pages explicitly flagged `hasImages` need
 * the parse; chrome-only pages (~95%) are skipped — their avatars are optimized at
 * call-sites via the {% avatar %} shortcode instead.
 */
export function shouldOptimize(outputPath, data) {
  return typeof outputPath === "string"
    && outputPath.endsWith(".html")
    && data?.hasImages === true;
}

/**
 * Build the override for Eleventy's built-in "@11ty/eleventy/html-transformer".
 * Registering a transform under that exact name REPLACES the built-in one with this
 * gated wrapper:
 *   - image-bearing pages (shouldOptimize true) run the full pipeline via
 *     htmlTransformer.transformContent (eleventy-img + remote-image-marker);
 *   - chrome-only pages return content untouched, skipping the PostHTML
 *     parse/serialize entirely.
 * The URL-callback guard preserves correctness if any addUrlTransform callbacks are
 * ever registered (those modify <a>/<link>, not just <img>, so the full pipeline must
 * still run for them even on image-free pages).
 */
export function makeContentImageTransform(eleventyConfig) {
  return async function (content) {
    if (!shouldOptimize(this.outputPath, this.page?.data)) {
      const hasUrlCallbacks =
        eleventyConfig.htmlTransformer.getCallbacks("html", this).length > 0;
      if (!hasUrlCallbacks) return content;
    }
    return eleventyConfig.htmlTransformer.transformContent(this.outputPath, content, this);
  };
}
