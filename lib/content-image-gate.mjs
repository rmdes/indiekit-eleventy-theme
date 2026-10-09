/**
 * Does this page carry an image eleventy-img could actually optimize?
 *
 * Eleventy's built-in `@11ty/eleventy/html-transformer` parses every HTML page
 * into a posthtml AST and re-serialises it so registered posthtml plugins (here,
 * eleventy-img's transform plugin) can rewrite `<img>` into responsive
 * `<picture>`. That parse is the single most expensive thing in the build.
 *
 * Measured on rmendes 2026-10-09 with `DEBUG=Eleventy:Benchmark*`:
 *
 *     518807ms  57%  3463x  (Aggregate) Transforming `html` with posthtml
 *       2435ms   0%  3544x  (Aggregate) Template Write
 *       1524ms   0%  6301x  (Aggregate) Template Compile
 *
 * 57% of a 908-second build, against 5.6s for all template compile and write
 * combined. Only 469 of 3,476 pages carry a content image, so ~86% of that work
 * produced no change to the output.
 *
 * WHY THIS IS A MODULE WITH TESTS, not an inline regex: the gate existed before
 * and silently stopped working. It was written when every chrome image was remote
 * other-origin, so a bare `/(media|uploads)/` substring test was safe. Then
 * site-config's h-card began emitting the avatar on EVERY page as
 *
 *     <data class="u-photo hidden" value="https://<host>/media/images/<avatar>">
 *
 * a hidden microformats2 element — not an image, and not optimizable. The bare
 * test matched 3,461 of 3,476 pages, the gate never fired once, and nothing
 * failed: the build was correct, just ~450s slower per build and twice that per
 * publish (a publish costs two full builds). A substring heuristic that guards a
 * large cost needs a test that fails when the heuristic stops discriminating.
 *
 * DENYLIST, NOT ALLOWLIST. `/media/images/` is the site-asset directory; uploads
 * live in `/media/photos/` and `/uploads/`. Excluding the one asset directory
 * means a NEW upload location still matches and still gets optimized. An
 * allowlist of known upload directories would fail the other way — silently
 * skipping optimization for images in a directory nobody remembered to add.
 *
 * Deliberately a substring test on raw HTML, not a parse: parsing to decide
 * whether to parse would cost the thing it is avoiding. False positives are
 * cheap (one wasted parse, output unchanged); false negatives are not (an image
 * silently left unoptimized), so the predicate errs toward returning true.
 *
 * @param {string} content - Rendered HTML, before the html-transformer runs
 * @returns {boolean} true if the posthtml parse is worth paying for
 */
export function hasOptimizableContentImage(content) {
  return /\/uploads\/|\/media\/(?!images\/)/.test(content);
}
