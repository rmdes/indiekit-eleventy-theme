import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Eleventy, { EleventyRenderPlugin } from "@11ty/eleventy";

/**
 * Version-pin canary for the RenderPlugin bridge used by the
 * `renderCompositionTree` shortcode in eleventy.config.js.
 *
 * The shortcode reaches RenderPlugin's `renderFile` through Eleventy-internal
 * storage (`eleventyConfig.universal.shortcodes.renderFile`, UserConfig.js) and
 * invokes it with a hand-built `this` carrying `{ ctx, page, eleventy, data }`
 * so accessGlobalData's ProxyWrap exposes the global cascade to partials.
 * Verified against Eleventy 3.1.2 — if an Eleventy upgrade moves or renames
 * that storage, or changes renderFile's `this` contract, this test fails red
 * instead of the build silently emitting empty composition sections.
 */
test("RenderPlugin bridge: universal.shortcodes.renderFile resolves and renders a partial with block data + global cascade", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rf-bridge-"));
  try {
    writeFileSync(join(dir, "partial.njk"), "PARTIAL[{{ b }}] site={{ site.name }}");
    writeFileSync(join(dir, "page.njk"), "{% bridgecheck %}");

    let bridgeType = "unset";
    const elev = new Eleventy(dir, join(dir, "_site"), {
      configPath: false,
      quietMode: true,
      config(eleventyConfig) {
        eleventyConfig.addPlugin(EleventyRenderPlugin, { accessGlobalData: true });
        eleventyConfig.addGlobalData("site", { name: "GLOBALDATA-OK" });
        // Same lazy lookup + bound-context call shape as renderCompositionTree.
        eleventyConfig.addAsyncShortcode("bridgecheck", async function () {
          const renderFile = eleventyConfig.universal?.shortcodes?.renderFile;
          bridgeType = typeof renderFile;
          if (bridgeType !== "function") return "BRIDGE-MISSING";
          const boundContext = { ctx: this.ctx, page: this.page, eleventy: this.eleventy, data: this.ctx };
          return renderFile.call(boundContext, join(dir, "partial.njk"), { b: "b1" }, "njk");
        });
      },
    });

    const results = await elev.toJSON();
    const page = results.find((entry) => entry.inputPath.includes("page"));

    assert.equal(bridgeType, "function", "renderFile must be reachable via eleventyConfig.universal.shortcodes");
    assert.ok(page, "page template must render");
    assert.match(page.content, /PARTIAL\[b1\]/, "partial must receive the block's own data");
    assert.match(page.content, /site=GLOBALDATA-OK/, "partial must receive the global cascade (accessGlobalData)");
  } finally {
    rmSync(dir, { recursive: true });
  }
});

/**
 * Smoke test for the REAL composition-widget-chrome.njk partial through REAL
 * renderFile. Every chrome test in render-composition.test.mjs spies the
 * partial away — without this, a Nunjucks syntax error in the partial would
 * only surface at site build. Renders the actual repo file (absolute path);
 * its `{% from "components/icon.njk" import icon %}` resolves against the
 * tmp project's _includes, so the real icon.njk is copied in.
 */
test("CHROME SMOKE: composition-widget-chrome.njk renders via renderFile — collapse chrome, aria pair, fallback title", async () => {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const chromePartial = join(repoRoot, "_includes", "components", "composition-widget-chrome.njk");
  const dir = mkdtempSync(join(tmpdir(), "chrome-smoke-"));
  try {
    mkdirSync(join(dir, "_includes", "components"), { recursive: true });
    copyFileSync(
      join(repoRoot, "_includes", "components", "icon.njk"),
      join(dir, "_includes", "components", "icon.njk"),
    );
    writeFileSync(join(dir, "page.njk"), "{% chromesmoke %}");

    const elev = new Eleventy(dir, join(dir, "_site"), {
      configPath: false,
      quietMode: true,
      config(eleventyConfig) {
        eleventyConfig.addPlugin(EleventyRenderPlugin, { accessGlobalData: true });
        eleventyConfig.addAsyncShortcode("chromesmoke", async function () {
          const renderFile = eleventyConfig.universal?.shortcodes?.renderFile;
          if (typeof renderFile !== "function") return "BRIDGE-MISSING";
          const boundContext = { ctx: this.ctx, page: this.page, eleventy: this.eleventy, data: this.ctx };
          // Same data shape wrapWidgetChrome passes; empty title/iconName
          // exercise the partial's internal fallback maps ("blogroll" →
          // "Blogroll" + book-open accent).
          return renderFile.call(boundContext, chromePartial, {
            blockId: "smoke1",
            widgetType: "blogroll",
            title: "",
            iconName: "",
            defaultOpen: "true",
            innerHtml: '<div class="widget">SMOKE-INNER</div>',
          }, "njk");
        });
      },
    });

    const results = await elev.toJSON();
    const page = results.find((entry) => entry.inputPath.includes("page"));

    assert.ok(page, "page template must render");
    assert.match(page.content, /widget-collapsible/, "collapse wrapper must render");
    assert.match(page.content, /aria-controls="widget-panel-smoke1"/, "button must reference the panel (WCAG pair)");
    assert.match(page.content, /id="widget-panel-smoke1"/, "panel id must match aria-controls");
    assert.match(page.content, /localStorage\.getItem\('widget-smoke1'\)/, "localStorage key must use the stable block id");
    assert.match(page.content, /Blogroll/, "type-title fallback map must resolve when no catalog title is passed");
    assert.match(page.content, /SMOKE-INNER/, "innerHtml must pass through");
  } finally {
    rmSync(dir, { recursive: true });
  }
});
