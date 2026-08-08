/** Build lint (site-builder baseline C6): flag pages whose OUTPUT is over
 *  budget — oversized HTML or excessive image counts — and surface the worst
 *  offenders in build-status.json (`pageWarnings`), where the site-config
 *  admin API already exposes the whole status object.
 *
 *  Stateful by design: the watcher process keeps one instance across builds,
 *  so an incremental rebuild UPDATES the rebuilt pages' entries (adding new
 *  offenders, clearing fixed ones) instead of replacing a full-build list
 *  with a one-page one. Process restart → first build is full → reseeded. */

export const HTML_BYTES_LIMIT = 300 * 1024;
export const IMAGE_COUNT_LIMIT = 60;
// Bound what lands in build-status.json — it's a small operational file,
// not an audit report; the worst offenders are the actionable ones.
export const MAX_WARNINGS = 20;

/**
 * Lint one rendered page.
 * @param {string} url Page URL
 * @param {string} content Rendered HTML
 * @returns {object | null} Warning entry, or null when within budget
 */
export function lintPage(url, content) {
  const htmlBytes = Buffer.byteLength(content);
  const imageCount = (content.match(/<img[\s/>]/gi) || []).length;
  const reasons = [];
  if (htmlBytes > HTML_BYTES_LIMIT) reasons.push("html-size");
  if (imageCount > IMAGE_COUNT_LIMIT) reasons.push("image-count");
  return reasons.length > 0 ? { url, htmlBytes, imageCount, reasons } : null;
}

/**
 * @returns {{ record(results: Array<object>|undefined): Array<object> }}
 *   record() folds one build's `eleventy.after` results into the running
 *   per-URL state and returns the current worst-offenders list (htmlBytes
 *   descending, capped at MAX_WARNINGS).
 */
export function createBuildLint() {
  const byUrl = new Map();
  return {
    record(results) {
      for (const result of results || []) {
        if (!result || typeof result.url !== "string") continue;
        if (typeof result.content !== "string") continue;
        if (typeof result.outputPath !== "string" || !result.outputPath.endsWith(".html")) continue;
        const warning = lintPage(result.url, result.content);
        if (warning) byUrl.set(result.url, warning);
        else byUrl.delete(result.url);
      }
      return [...byUrl.values()]
        .sort((a, b) => b.htmlBytes - a.htmlBytes)
        .slice(0, MAX_WARNINGS);
    },
  };
}
