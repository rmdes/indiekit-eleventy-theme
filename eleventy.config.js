import { EleventyRenderPlugin } from "@11ty/eleventy";
import pluginWebmentions from "@chrisburnell/eleventy-cache-webmentions";
import pluginRss from "@11ty/eleventy-plugin-rss";
import embedEverything from "eleventy-plugin-embed-everything";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";

import markdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import { minify } from "html-minifier-terser";
import { minify as minifyJS } from "terser";
import registerUnfurlShortcode, { getCachedCard, prefetchUrl } from "./lib/unfurl-shortcode.js";
import { renderNode } from "./lib/render-composition.mjs";
import { renderAvatar } from "./lib/image-shortcode.mjs";
import { makeContentImageTransform, registerImageGate } from "./lib/content-image-transform.mjs";
import { writeBuildStatus, writeBuildStatusSync } from "./lib/build-status.mjs";
import { prunePreviewOrphans, readCurrentPreviewToken } from "./lib/prune-preview.mjs";
import matter from "gray-matter";
import { createHash, createHmac, randomUUID } from "crypto";
import { createRequire } from "module";
import { execFileSync } from "child_process";
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, copyFileSync, appendFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const esmRequire = createRequire(import.meta.url);
const postGraph = esmRequire("@rknightuk/eleventy-plugin-post-graph");

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteUrl = process.env.SITE_URL || "https://example.com";

/**
 * Resolve the site TITLE/brand for build-time consumers (e.g. the OG card
 * generator) using the same precedence as _data/site.js:
 *   identity.siteName → SITE_NAME env → identity.name → "My IndieWeb Blog".
 * Reads the runtime site-config.json written by the site-config plugin, with a
 * fallback to the theme's _data/site.example.json for theme-only dev. Wrapped in
 * try/catch so a missing/broken file degrades to the env var, never throwing
 * during the build.
 */
function resolveSiteName() {
  const RUNTIME = "/app/data/content/_data/site-config.json";
  const EXAMPLE = resolve(__dirname, "_data", "site.example.json");
  let identity = {};
  try {
    const source = existsSync(RUNTIME) ? RUNTIME : EXAMPLE;
    identity = JSON.parse(readFileSync(source, "utf8")).identity || {};
  } catch {
    identity = {};
  }
  return (
    identity.siteName ||
    process.env.SITE_NAME ||
    identity.name ||
    "My IndieWeb Blog"
  );
}

// Memory profiler — logs RSS + V8 heap at key build phases
// Writes to file (log buffer gets flushed by AP inbox traffic) AND stdout
const MEM_LOG = "/app/data/.eleventy-mem.log";
function logMemory(phase) {
  const mem = process.memoryUsage();
  const rss = (mem.rss / 1024 / 1024).toFixed(0);
  const heapUsed = (mem.heapUsed / 1024 / 1024).toFixed(0);
  const heapTotal = (mem.heapTotal / 1024 / 1024).toFixed(0);
  const external = (mem.external / 1024 / 1024).toFixed(0);
  const arrayBuffers = (mem.arrayBuffers / 1024 / 1024).toFixed(0);
  const line = `[${new Date().toISOString()}] ${phase}: RSS=${rss}MB heap=${heapUsed}/${heapTotal}MB external=${external}MB buffers=${arrayBuffers}MB`;
  console.log(`[mem] ${phase}: RSS=${rss}MB heap=${heapUsed}/${heapTotal}MB external=${external}MB buffers=${arrayBuffers}MB`);
  try { appendFileSync(MEM_LOG, line + "\n"); } catch { /* not on Cloudron or not writable */ }
}

export default function (eleventyConfig) {
  // Don't use .gitignore for determining what to process
  // (content/ is in .gitignore because it's a symlink, but we need to process it)
  eleventyConfig.setUseGitIgnore(false);

  // Ignore output directory (prevents re-processing generated files via symlink)
  eleventyConfig.ignores.add("_site");
  eleventyConfig.ignores.add("_site/**");
  eleventyConfig.ignores.add("/app/data/site");
  eleventyConfig.ignores.add("/app/data/site/**");
  eleventyConfig.ignores.add("node_modules");
  eleventyConfig.ignores.add("node_modules/**");
  eleventyConfig.ignores.add("CLAUDE.md");
  eleventyConfig.ignores.add("README.md");

  // Ignore Pagefind output directory
  eleventyConfig.ignores.add("pagefind");
  eleventyConfig.ignores.add("pagefind/**");
  // Ignore interactive assets (served via passthrough copy, not processed as templates)
  eleventyConfig.ignores.add("interactive");
  eleventyConfig.ignores.add("interactive/**");

  // Configure watch targets to exclude output directory
  eleventyConfig.watchIgnores.add("_site");
  eleventyConfig.watchIgnores.add("_site/**");
  eleventyConfig.watchIgnores.add("/app/data/site");
  eleventyConfig.watchIgnores.add("/app/data/site/**");
  eleventyConfig.watchIgnores.add("pagefind");
  eleventyConfig.watchIgnores.add("pagefind/**");
  eleventyConfig.watchIgnores.add(".cache/og");
  eleventyConfig.watchIgnores.add(".cache/og/**");
  eleventyConfig.watchIgnores.add(".cache/unfurl");
  eleventyConfig.watchIgnores.add(".cache/unfurl/**");

  // Watcher tuning: handle rapid successive file changes
  // When a post is created via Micropub, the file is written twice in quick
  // succession: first the initial content, then ~2s later a Micropub update
  // adds syndication URLs. awaitWriteFinish delays the watcher event until
  // the file is stable (no writes for 2s), so both changes are captured in
  // one build. The throttle adds a 3s build-level debounce on top.
  eleventyConfig.setChokidarConfig({
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  });
  eleventyConfig.setWatchThrottleWaitTime(3000);

  // Configure markdown-it with linkify enabled (auto-convert URLs to links)
  const md = markdownIt({
    html: true,
    linkify: true,  // Auto-convert URLs to clickable links
    typographer: true,
  });
  md.use(markdownItAnchor, {
    permalink: markdownItAnchor.permalink.headerLink(),
    slugify: (s) => s.toLowerCase().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, ""),
    level: [2, 3, 4],
  });

  // Hashtag plugin: converts #tag to category links on-site
  // Syndication targets (Bluesky, Mastodon) handle raw #tag natively via facet detection
  md.inline.ruler.push("hashtag", (state, silent) => {
    const pos = state.pos;
    if (state.src.charCodeAt(pos) !== 0x23 /* # */) return false;

    // Must be at start of string or preceded by whitespace/punctuation (not part of a URL fragment or hex color)
    if (pos > 0) {
      const prevChar = state.src.charAt(pos - 1);
      if (!/[\s()\[\]{},;:!?"'«»""'']/.test(prevChar)) return false;
    }

    // Match hashtag: # followed by letter/underscore, then word chars (letters, digits, underscores)
    const tail = state.src.slice(pos + 1);
    const match = tail.match(/^([a-zA-Z_]\w*)/);
    if (!match) return false;

    const tag = match[1];

    // Skip pure hex color codes (3, 4, 6, or 8 hex digits with nothing else)
    if (/^[0-9a-fA-F]{3,8}$/.test(tag)) return false;

    if (!silent) {
      const slug = tag.toLowerCase().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
      const tokenOpen = state.push("link_open", "a", 1);
      tokenOpen.attrSet("href", `/categories/${slug}/`);
      tokenOpen.attrSet("class", "p-category hashtag");

      const tokenText = state.push("text", "", 0);
      tokenText.content = `#${tag}`;

      state.push("link_close", "a", -1);
    }

    state.pos = pos + 1 + tag.length;
    return true;
  });

  eleventyConfig.setLibrary("md", md);

  // Syntax highlighting for fenced code blocks (```lang)
  eleventyConfig.addPlugin(syntaxHighlight);

  // RSS plugin for feed filters (dateToRfc822, absoluteUrl, etc.)
  // Custom feed templates in feed.njk and feed-json.njk use these filters
  eleventyConfig.addPlugin(pluginRss);

  // Render plugin — provides the `renderFile` universal shortcode so the
  // composition renderer can run block partials through the same Nunjucks
  // engine (all filters/globals available).
  eleventyConfig.addPlugin(EleventyRenderPlugin, { accessGlobalData: true });

  // Per-build block-data memo (cleared each build like the other caches).
  // Reserved for Phase 2+ block-data memoization — Phase 1 only declares and
  // clears it to establish the pattern; it is intentionally unused for now.
  const _blockDataCache = new Map();
  eleventyConfig.on("eleventy.before", () => { _blockDataCache.clear(); });

  // Recursive composition renderer. Runs each block's Nunjucks partial through
  // RenderPlugin's `renderFile` in the same engine with all filters/globals.
  // Failure paths log loudly with the `[composition]` prefix — the htmlmin
  // transform strips HTML comments in production, so the comments alone are
  // dev-build-only signal. (Per-block render errors log from
  // lib/render-composition.mjs with the `[render-composition]` prefix.)
  // Perf note: RenderPlugin recompiles partials on every renderFile call;
  // _blockDataCache may grow into that memo role in later phases.
  eleventyConfig.addAsyncShortcode("renderCompositionTree", async function (treeJson) {
    let tree;
    try { tree = typeof treeJson === "string" ? JSON.parse(treeJson) : treeJson; }
    catch (error) {
      console.warn("[composition] invalid tree JSON: " + error.message);
      return "<!-- composition: invalid tree JSON -->";
    }
    if (!tree || tree.schemaVersion !== 4) {
      console.warn("[composition] unsupported schemaVersion: " + tree?.schemaVersion);
      const echoed = String(tree?.schemaVersion).replace(/[^\w.-]/g, "");
      return `<!-- composition: unsupported schemaVersion (${echoed}) -->`;
    }
    if (!tree.tree || typeof tree.tree !== "object") {
      console.warn("[composition] artifact has no tree node");
      return "<!-- composition: missing tree -->";
    }

    // RenderPlugin registers `renderFile` as a universal shortcode only — it is
    // NOT reachable as `this.renderFile` inside a Nunjucks shortcode (Nunjucks
    // builds shortcode `this` purely from template context). Grab the registered
    // function reference instead; it closes over templateConfig/extensionMap and
    // uses `this` only as a data carrier. NOTE: `universal.shortcodes` is
    // Eleventy-internal storage (UserConfig.js) — version-pinned bridge,
    // verified against Eleventy 3.1.2; re-verify on upgrade. Looked up lazily
    // so plugin registration order doesn't matter; the guard degrades to an
    // HTML comment instead of a crash.
    const renderFile = eleventyConfig.universal?.shortcodes?.renderFile;
    if (typeof renderFile !== "function") {
      console.error("[composition] RenderPlugin renderFile not found in universal.shortcodes — Eleventy internals changed? (version-pinned bridge, verified 3.1.2)");
      return "<!-- composition: renderFile unavailable -->";
    }

    // Expose the full template context as `data` so renderShortcodeFn's
    // accessGlobalData fallback (ProxyWrap) gives partials the global cascade
    // (site, collections, …) underneath each block's own data.
    const boundContext = { ctx: this.ctx, page: this.page, eleventy: this.eleventy, data: this.ctx };
    const renderFn = (templatePath, data) => renderFile.call(boundContext, templatePath, data, "njk");
    // Phase 3: thread the catalog + plugin loadout globals (from the data
    // cascade) into the renderer for existence checks and requiresPlugin
    // gating. Absent catalog (theme-only dev) degrades to convention-based
    // resolution inside renderSection.
    return renderNode(tree.tree, renderFn, {
      blockCatalog: this.ctx?.blockCatalog,
      loadedPlugins: this.ctx?.loadedPlugins,
    });
  });

  // {% avatar src, alt, opts %} — optimize local chrome avatars at the call-site
  // (remote avatars pass through with eleventy:ignore). See lib/image-shortcode.mjs.
  eleventyConfig.addAsyncShortcode("avatar", async function (src, alt, opts = {}) {
    return renderAvatar(src, { alt, ...opts });
  });

  // Post graph — GitHub-style contribution grid for posting frequency
  eleventyConfig.addPlugin(postGraph, {
    sort: "desc",
    limit: 2,
    dayBoxTitle: true,
    selectorLight: ":root",
    selectorDark: ".dark",
    boxColorLight: "#e7e5e4",      // surface-200 (warm stone)
    highlightColorLight: "#d97706", // amber-600 (accent)
    textColorLight: "#1c1917",      // surface-900
    boxColorDark: "#292524",        // surface-800
    highlightColorDark: "#fbbf24",  // amber-400
    textColorDark: "#fafaf9",       // surface-50
  });

  // JSON encode filter for JSON feed
  eleventyConfig.addFilter("jsonEncode", (value) => {
    return JSON.stringify(value);
  });

  // Guess MIME type from URL extension
  function guessMimeType(url, category) {
    const lower = (typeof url === "string" ? url : "").toLowerCase();
    if (category === "photo") {
      if (lower.includes(".png")) return "image/png";
      if (lower.includes(".gif")) return "image/gif";
      if (lower.includes(".webp")) return "image/webp";
      if (lower.includes(".svg")) return "image/svg+xml";
      return "image/jpeg";
    }
    if (category === "audio") {
      if (lower.includes(".ogg") || lower.includes(".opus")) return "audio/ogg";
      if (lower.includes(".flac")) return "audio/flac";
      if (lower.includes(".wav")) return "audio/wav";
      return "audio/mpeg";
    }
    if (category === "video") {
      if (lower.includes(".webm")) return "video/webm";
      if (lower.includes(".mov")) return "video/quicktime";
      return "video/mp4";
    }
    return "application/octet-stream";
  }

  // Extract URL string from value that may be a string or {url, alt} object
  function resolveMediaUrl(value) {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && value.url) return value.url;
    return null;
  }

  // Feed attachments filter — builds JSON Feed attachments array from post data
  eleventyConfig.addFilter("feedAttachments", (postData) => {
    const attachments = [];
    const processMedia = (items, category) => {
      const list = Array.isArray(items) ? items : [items];
      for (const item of list) {
        const rawUrl = resolveMediaUrl(item);
        if (!rawUrl) continue;
        const url = rawUrl.startsWith("http") ? rawUrl : `${siteUrl}${rawUrl}`;
        attachments.push({ url, mime_type: guessMimeType(rawUrl, category) });
      }
    };
    if (postData.photo) processMedia(postData.photo, "photo");
    if (postData.audio) processMedia(postData.audio, "audio");
    if (postData.video) processMedia(postData.video, "video");
    return attachments;
  });

  // Textcasting support filter — builds clean support object excluding null values
  eleventyConfig.addFilter("textcastingSupport", (support) => {
    if (!support) return {};
    const obj = {};
    if (support.url) obj.url = support.url;
    if (support.stripe) obj.stripe = support.stripe;
    if (support.lightning) obj.lightning = support.lightning;
    if (support.paymentPointer) obj.payment_pointer = support.paymentPointer;
    return obj;
  });

  // Protocol type filter — classifies a URL by its origin protocol/network
  eleventyConfig.addFilter("protocolType", (url) => {
    if (!url || typeof url !== "string") return "web";
    const lower = url.toLowerCase();
    if (lower.includes("bsky.app") || lower.includes("bluesky")) return "atmosphere";
    // Match Fediverse instances by known domain patterns (avoid overly broad "social")
    if (lower.includes("mastodon.") || lower.includes("mstdn.") || lower.includes("fosstodon.") ||
        lower.includes("pleroma.") || lower.includes("misskey.") || lower.includes("pixelfed.") ||
        lower.includes("fediverse")) return "fediverse";
    return "web";
  });

  // Email obfuscation filter - converts email to HTML entities
  // Blocks ~95% of spam harvesters while remaining valid for microformat parsers
  // Usage: {{ email | obfuscateEmail }} or {{ email | obfuscateEmail("href") }}
  eleventyConfig.addFilter("obfuscateEmail", (email, mode = "display") => {
    if (!email) return "";
    // Convert each character to HTML decimal entity
    const encoded = [...email].map(char => `&#${char.charCodeAt(0)};`).join("");
    if (mode === "href") {
      // For mailto: links, also encode the "mailto:" prefix
      const mailto = [...("mailto:")].map(char => `&#${char.charCodeAt(0)};`).join("");
      return mailto + encoded;
    }
    return encoded;
  });

  // Alias dateToRfc822 (plugin provides dateToRfc2822)
  eleventyConfig.addFilter("dateToRfc822", (date) => {
    return pluginRss.dateToRfc2822(date);
  });

  // Embed Everything - auto-embed YouTube, Vimeo, Bluesky, Mastodon, etc.
  // YouTube uses lite-yt-embed facade: shows thumbnail + play button,
  // only loads full iframe on click (~800 KiB savings).
  // CSS/JS disabled here — already loaded in base.njk.
  eleventyConfig.addPlugin(embedEverything, {
    use: ["youtube", "vimeo", "twitter", "mastodon", "bluesky", "spotify", "soundcloud"],
    youtube: {
      options: {
        lite: {
          css: { enabled: false },
          js: { enabled: false },
          responsive: true,
        },
        recommendSelfOnly: true,
      },
    },
    mastodon: {
      options: {
        server: "indieweb.social",
      },
    },
  });

  // Unfurl shortcode — renders any URL as a rich card (OpenGraph/Twitter Card metadata)
  // Usage in templates: {% unfurl "https://example.com/article" %}
  registerUnfurlShortcode(eleventyConfig);

  // Synchronous unfurl filter — reads from pre-populated disk cache.
  // Safe for deeply nested includes where async shortcodes fail silently.
  // Usage: {{ url | unfurlCard | safe }}
  eleventyConfig.addFilter("unfurlCard", getCachedCard);

  // Custom transform to convert YouTube links to lite-youtube embeds
  // Catches bare YouTube links in Markdown that the embed plugin misses
  eleventyConfig.addTransform("youtube-link-to-embed", function (content, outputPath) {
    if (typeof outputPath !== "string" || !outputPath.endsWith(".html")) {
      return content;
    }
    // Single substring check — "youtu" covers both youtube.com/watch and youtu.be/
    // Avoids scanning large HTML twice (was two includes() calls on 15-50KB per page)
    if (!content.includes("youtu")) {
      return content;
    }
    // Match <a> tags where href contains youtube.com/watch or youtu.be
    // Link text can be: URL, www.youtube..., youtube..., or youtube-related text
    const youtubePattern = /<a[^>]+href="https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)[^"]*"[^>]*>(?:https?:\/\/)?(?:www\.)?[^<]*(?:youtube|youtu\.be)[^<]*<\/a>/gi;

    content = content.replace(youtubePattern, (match, videoId) => {
      // Use lite-youtube facade — loads full iframe only on click
      return `</p><div class="video-embed eleventy-plugin-youtube-embed"><lite-youtube videoid="${videoId}" style="background-image: url('https://i.ytimg.com/vi/${videoId}/hqdefault.jpg');"><div class="lty-playbtn"></div></lite-youtube></div><p>`;
    });

    // Clean up empty <p></p> tags created by the replacement
    content = content.replace(/<p>\s*<\/p>/g, '');

    return content;
  });

  // Image optimization - transforms <img> tags automatically
  // PROCESS_REMOTE_IMAGES: set to "true" to let Sharp download and re-encode remote images.
  // Default "false" — skips remote URLs (adds eleventy:ignore) to avoid OOM from Sharp's
  // native memory usage when processing hundreds of external images (bookmarks, webmentions).
  const processRemoteImages = process.env.PROCESS_REMOTE_IMAGES === "true";
  if (!processRemoteImages) {
    eleventyConfig.htmlTransformer.addPosthtmlPlugin("html", () => {
      return (tree) => {
        tree.match({ tag: "img" }, (node) => {
          if (node.attrs?.src && /^https?:\/\//.test(node.attrs.src)) {
            node.attrs["eleventy:ignore"] = "";
          }
          return node;
        });
        return tree;
      };
    }, { priority: 1 }); // priority > 0 runs before image plugin (priority -1)
  }

  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    extensions: "html",
    formats: ["webp", "jpeg"],
    widths: ["auto"],
    failOnError: false,
    cacheOptions: {
      duration: process.env.ELEVENTY_RUN_MODE === "build" ? "1d" : "30d",
    },
    concurrency: 1,
    defaultAttributes: {
      loading: "lazy",
      decoding: "async",
      sizes: "auto",
      alt: "",
    },
  });

  // Image optimization gate (debt-paydown 1b). Eleventy's built-in
  // "@11ty/eleventy/html-transformer" runs the registered PostHTML plugins above
  // (remote-image-marker + eleventy-img) — but it parses EVERY page to find <img>.
  // We override that transform (registering under the same name) with a gated wrapper:
  // only pages flagged `hasImages` run the full pipeline; chrome-only pages (~95%) skip
  // the PostHTML parse entirely. The gate is the per-post `hasImages` data flag, NOT a
  // content substring (chrome <img> from partials would defeat that; avatars are now
  // optimized at call-sites via {% avatar %}). The plugin + remote-image-marker stay
  // registered above — the override calls into them via htmlTransformer.transformContent.
  // A collection populates a per-page outputPath→hasImages map (transforms don't get the
  // data cascade); the override reads it.
  // (Re-touches an Eleventy internal transform name — gated on real data, not a substring;
  // to be centralized per debt item 2.)
  registerImageGate(eleventyConfig);
  eleventyConfig.addTransform("@11ty/eleventy/html-transformer", makeContentImageTransform(eleventyConfig));

  // Per-post image flag — gates the content-image transform (debt-paydown 1b).
  // Explicit frontmatter `hasImages` is authoritative (set by the Micropub endpoint
  // on new image posts + a one-time backfill on existing posts). Photo posts always
  // carry a `photo` property, so they're covered even before the backfill runs.
  // Default false → chrome-only pages (notes/articles with no content image) are
  // never parsed for <img> optimization.
  eleventyConfig.addGlobalData("eleventyComputed.hasImages", () => (data) => {
    // `data.hasImages` here is the raw frontmatter value — a computed key is not in
    // its own scope during resolution — so this reads the frontmatter override, not
    // the computed result. (Documented Eleventy "default with override" pattern.)
    if (typeof data.hasImages === "boolean") return data.hasImages;
    return Boolean(data.photo);
  });

  // Wrap <table> elements in <table-saw> for responsive tables
  eleventyConfig.addTransform("table-saw-wrap", function (content, outputPath) {
    if (outputPath && outputPath.endsWith(".html")) {
      return content.replace(/<table(\s|>)/g, "<table-saw><table$1").replace(/<\/table>/g, "</table></table-saw>");
    }
    return content;
  });

  // Fix OG image meta tags post-rendering — bypasses Eleventy 3.x race condition (#3183).
  // page.url is unreliable during parallel rendering, but outputPath IS correct
  // since files are written to the correct location. Derives the OG slug from
  // outputPath and replaces placeholders emitted by base.njk.
  // Clear eleventy-img in-memory cache between builds to prevent native memory leak.
  // The MemoryCache singleton holds Sharp ArrayBuffers (~200KB-1MB each) that never get
  // freed in watch mode. After 20-30 incremental rebuilds, external memory grows from
  // ~170MB to 500MB+, eventually causing OOM. Disk cache handles persistence.
  const { memCache: imgMemCache } = esmRequire("@11ty/eleventy-img/src/caches.js");
  eleventyConfig.on("eleventy.before", () => {
    const size = imgMemCache.size();
    if (size > 0) {
      imgMemCache.cache = {};
      console.log(`[eleventy-img] Cleared in-memory cache (${size} entries)`);
    }
  });

  // Cache: directory listing built once per build instead of 3,426 existsSync calls
  let _ogFileSet = null;
  eleventyConfig.on("eleventy.before", () => { _ogFileSet = null; });
  function hasOgImage(ogSlug) {
    if (!_ogFileSet) {
      const ogDir = resolve(__dirname, ".cache", "og");
      try {
        _ogFileSet = new Set(readdirSync(ogDir));
      } catch {
        _ogFileSet = new Set();
      }
    }
    return _ogFileSet.has(`${ogSlug}.png`);
  }
  eleventyConfig.addTransform("og-fix", function (content, outputPath) {
    if (!outputPath || !outputPath.endsWith(".html")) return content;

    // Derive correct page URL and OG slug from outputPath (immune to race condition)
    // Content pages match: .../type/yyyy/MM/dd/slug/index.html
    const dateMatch = outputPath.match(
      /\/([\w-]+)\/(\d{4})\/(\d{2})\/(\d{2})\/([\w-]+)\/index\.html$/
    );

    if (dateMatch) {
      const [, type, year, month, day, slug] = dateMatch;
      const pageUrlPath = `/${type}/${year}/${month}/${day}/${slug}/`;
      const correctFullUrl = `${siteUrl}${pageUrlPath}`;
      const ogSlug = `${year}-${month}-${day}-${slug}`;
      const hasOg = hasOgImage(ogSlug);
      const ogImageUrl = hasOg
        ? `${siteUrl}/og/${ogSlug}.png`
        : `${siteUrl}/images/og-default.png`;
      const twitterCard = hasOg ? "summary_large_image" : "summary";

      // Fix og:url and canonical (also affected by race condition)
      content = content.replace(
        /(<meta property="og:url" content=")[^"]*(")/,
        `$1${correctFullUrl}$2`
      );
      content = content.replace(
        /(<link rel="canonical" href=")[^"]*(")/,
        `$1${correctFullUrl}$2`
      );

      // Replace OG image and twitter card placeholders
      content = content.replace(/__OG_IMAGE_PLACEHOLDER__/g, ogImageUrl);
      content = content.replace(/__TWITTER_CARD_PLACEHOLDER__/g, twitterCard);
    } else {
      // Non-date pages (homepage, about, etc.): use defaults
      content = content.replace(
        /__OG_IMAGE_PLACEHOLDER__/g,
        `${siteUrl}/images/og-default.png`
      );
      content = content.replace(/__TWITTER_CARD_PLACEHOLDER__/g, "summary");
    }

    return content;
  });

  // Auto-unfurl standalone external links in note content
  // Finds <a> tags that are the primary content of a <p> tag and injects OG preview cards
  eleventyConfig.addTransform("auto-unfurl-notes", async function (content, outputPath) {
    if (!outputPath || !outputPath.endsWith(".html")) return content;
    // Only process note pages (individual + listing)
    if (!outputPath.includes("/notes/")) return content;

    // Match <p> tags whose content is short text + a single external <a> as the last element
    // Pattern: <p>optional short text <a href="https://external.example">...</a></p>
    const linkParagraphRe = /<p>([^<]{0,80})?<a\s+href="(https?:\/\/[^"]+)"[^>]*>[^<]*<\/a>\s*<\/p>/g;
    const siteHost = new URL(siteUrl).hostname;
    const matches = [];

    let match;
    while ((match = linkParagraphRe.exec(content)) !== null) {
      const url = match[2];
      try {
        const linkHost = new URL(url).hostname;
        // Skip same-domain links and common non-content URLs
        if (linkHost === siteHost || linkHost.endsWith("." + siteHost)) continue;
        matches.push({ fullMatch: match[0], url, index: match.index });
      } catch {
        continue;
      }
    }

    if (matches.length === 0) return content;

    // Unfurl all matched URLs in parallel (uses cache, throttles network)
    const cards = await Promise.all(matches.map(m => prefetchUrl(m.url)));

    // Replace in reverse order to preserve indices
    let result = content;
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      const card = cards[i];
      // Skip if unfurl returned just a fallback link (no OG data)
      if (!card || !card.includes("unfurl-card")) continue;
      // Insert the unfurl card after the paragraph
      const insertPos = m.index + m.fullMatch.length;
      result = result.slice(0, insertPos) + "\n" + card + "\n" + result.slice(insertPos);
    }

    return result;
  });

  // HTML minification — only during initial build, skip during watch rebuilds
  eleventyConfig.addTransform("htmlmin", async function (content, outputPath) {
    if (outputPath && outputPath.endsWith(".html") && process.env.ELEVENTY_RUN_MODE === "build") {
      try {
        return await minify(content, {
          collapseWhitespace: true,
          removeComments: true,
          html5: true,
          decodeEntities: true,
          minifyCSS: false,
          minifyJS: false,
        });
      } catch {
        console.warn(`[htmlmin] Parse error in ${outputPath}, skipping minification`);
        return content;
      }
    }
    return content;
  });

  // Copy static assets to output
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("images");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("favicon.ico");
  eleventyConfig.addPassthroughCopy("interactive");
  eleventyConfig.addPassthroughCopy({ ".cache/og": "og" });

  // Note: /css/theme.css is generated by theme.css.njk template (NOT passthrough).
  // The template reads content/_data/theme.css (runtime) with css/theme.example.css
  // as a fallback. This is the idiomatic Eleventy pattern documented at
  // https://www.11ty.dev/docs/permalinks/ — passthrough copy order is undocumented
  // and unreliable for overrides, but template+permalink is deterministic.

  // Copy vendor web components from node_modules
  eleventyConfig.addPassthroughCopy({
    "node_modules/@zachleat/table-saw/table-saw.js": "js/table-saw.js",
    "node_modules/@11ty/is-land/is-land.js": "js/is-land.js",
    "node_modules/@zachleat/filter-container/filter-container.js": "js/filter-container.js",
  });

  // Copy Inter font files (latin + latin-ext subsets, woff2 only for modern browsers)
  eleventyConfig.addPassthroughCopy({
    "node_modules/@fontsource/inter/files/inter-latin-*-normal.woff2": "fonts",
    "node_modules/@fontsource/inter/files/inter-latin-ext-*-normal.woff2": "fonts",
  });

  // Watch for content changes
  eleventyConfig.addWatchTarget("./content/");
  eleventyConfig.addWatchTarget("./css/");
  // Watch runtime files written by @rmdes/indiekit-endpoint-site-config so
  // the dev/watch server rebuilds on admin saves. These are absolute paths via
  // the content/ symlink to /app/data/content/_data/.
  eleventyConfig.addWatchTarget("./content/_data/theme.css");
  eleventyConfig.addWatchTarget("./content/_data/critical.css");
  eleventyConfig.addWatchTarget("./content/_data/site-config.json");
  eleventyConfig.addWatchTarget("./content/_data/homepage.json");
  eleventyConfig.addWatchTarget("./content/_data/compositions/");
  eleventyConfig.addWatchTarget("./content/_data/block-catalog.json");

  // Webmentions plugin configuration
  const wmDomain = siteUrl.replace("https://", "").replace("http://", "");
  eleventyConfig.addPlugin(pluginWebmentions, {
    domain: siteUrl,
    feed: `http://127.0.0.1:8080/webmentions/api/mentions?per-page=10000`,
    key: "children",
  });

  // Date formatting filter
  // Memoized: same dates repeat across pages (sidebars, pagination, feeds)
  // 16,935 calls → unique dates are ~2,350 (one per post)
  const _dateDisplayCache = new Map();
  eleventyConfig.on("eleventy.before", () => { _dateDisplayCache.clear(); });
  eleventyConfig.addFilter("dateDisplay", (dateObj) => {
    if (!dateObj) return "";
    const key = dateObj instanceof Date ? dateObj.getTime() : dateObj;
    const cached = _dateDisplayCache.get(key);
    if (cached !== undefined) return cached;
    const result = new Date(dateObj).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    _dateDisplayCache.set(key, result);
    return result;
  });

  // ISO date filter
  const _isoDateCache = new Map();
  eleventyConfig.on("eleventy.before", () => { _isoDateCache.clear(); });
  eleventyConfig.addFilter("isoDate", (dateObj) => {
    if (!dateObj) return "";
    const key = dateObj instanceof Date ? dateObj.getTime() : dateObj;
    const cached = _isoDateCache.get(key);
    if (cached !== undefined) return cached;
    const result = new Date(dateObj).toISOString();
    _isoDateCache.set(key, result);
    return result;
  });

  // Digest-to-HTML filter for RSS feed descriptions
  eleventyConfig.addFilter("digestToHtml", (digest, siteUrl) => {
    const typeLabels = {
      articles: "Articles",
      notes: "Notes",
      photos: "Photos",
      bookmarks: "Bookmarks",
      likes: "Likes",
      reposts: "Reposts",
    };
    const typeOrder = ["articles", "notes", "photos", "bookmarks", "likes", "reposts"];
    let html = "";

    for (const type of typeOrder) {
      const posts = digest.byType[type];
      if (!posts || !posts.length) continue;

      html += `<h3>${typeLabels[type]}</h3><ul>`;
      for (const post of posts) {
        const postUrl = siteUrl + post.url;
        let label;
        if (type === "likes") {
          const target = post.data.likeOf || post.data.like_of;
          label = `Liked: ${target}`;
        } else if (type === "bookmarks") {
          const target = post.data.bookmarkOf || post.data.bookmark_of;
          label = post.data.title || `Bookmarked: ${target}`;
        } else if (type === "reposts") {
          const target = post.data.repostOf || post.data.repost_of;
          label = `Reposted: ${target}`;
        } else if (post.data.title) {
          label = post.data.title;
        } else {
          const content = post.templateContent || "";
          label = content.replace(/<[^>]*>/g, "").slice(0, 120).trim() || "Untitled";
        }
        html += `<li><a href="${postUrl}">${label}</a></li>`;
      }
      html += `</ul>`;
    }

    return html;
  });

  // Truncate filter
  eleventyConfig.addFilter("truncate", (str, len = 200) => {
    if (!str) return "";
    if (str.length <= len) return str;
    return str.slice(0, len).trim() + "...";
  });

  // Strip HTML tags and decode common entities → clean plain text.
  // Shared by `plainText` (full) and `ogDescription` (truncated excerpt).
  // Decoding matters: a bare `striptags` leaves entities like &quot; encoded,
  // and Nunjucks auto-escaping then double-encodes them (&amp;quot; → literal
  // &quot;). Decoding here yields real chars that escape cleanly on output.
  const toPlainText = (content) => {
    if (!content) return "";
    let text = content.replace(/<[^>]+>/g, ' ');
    text = text.replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'")
               .replace(/&nbsp;/g, ' ');
    return text.replace(/\s+/g, ' ').trim();
  };

  // Plain-text content (HTML stripped, entities decoded), NOT truncated.
  // Use for excerpts/feeds that must not double-encode entities.
  eleventyConfig.addFilter("plainText", (content) => toPlainText(content));

  // Clean excerpt for OpenGraph / cards - plain text, truncated.
  eleventyConfig.addFilter("ogDescription", (content, len = 200) => {
    let text = toPlainText(content);
    if (text.length > len) {
      text = text.slice(0, len).trim() + "...";
    }
    return text;
  });

  // Extract first image from content for OpenGraph fallback
  eleventyConfig.addFilter("extractFirstImage", (content) => {
    if (!content) return null;
    // Match all <img> tags, skip hidden ones and data URIs
    const imgRegex = /<img[^>]*?\ssrc=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = imgRegex.exec(content)) !== null) {
      const fullTag = match[0];
      const src = match[1];
      if (src.startsWith("data:")) continue;
      if (/\bhidden\b/.test(fullTag)) continue;
      return src;
    }
    return null;
  });

  // Head filter for arrays
  eleventyConfig.addFilter("head", (array, n) => {
    if (!Array.isArray(array) || n < 1) return array;
    return array.slice(0, n);
  });

  // Exclude post types from a collection by detecting type from frontmatter properties
  // Usage: collections.posts | excludePostTypes(["reply", "like"])
  // Supported types: reply, like, bookmark, repost, photo, article, note
  eleventyConfig.addFilter("excludePostTypes", (posts, excludeTypes) => {
    if (!Array.isArray(posts) || !Array.isArray(excludeTypes) || !excludeTypes.length) return posts;
    return posts.filter((post) => {
      const d = post.data || {};
      let type;
      if (d.inReplyTo || d.in_reply_to) type = "reply";
      else if (d.likeOf || d.like_of) type = "like";
      else if (d.bookmarkOf || d.bookmark_of) type = "bookmark";
      else if (d.repostOf || d.repost_of) type = "repost";
      else if (d.photo && d.photo.length) type = "photo";
      else if (d.title) type = "article";
      else type = "note";
      return !excludeTypes.includes(type);
    });
  });

  // Slugify filter
  eleventyConfig.addFilter("slugify", (str) => {
    if (!str) return "";
    return str
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  });

  eleventyConfig.addFilter("stripTrailingSlash", (url) => {
    if (!url || typeof url !== "string") return url || "";
    return url.endsWith("/") ? url.slice(0, -1) : url;
  });

  // Safe alternative to the built-in `dictsort` filter. Nunjucks' `dictsort`
  // throws "val must be an object" when given anything that isn't a plain
  // object — including arrays, strings, and `undefined`. CV-related data can
  // arrive in any of those shapes when the CV plugin writes a malformed
  // cv.json or when fallback defaults race with plugin initialisation.
  // Returning `[]` for non-objects lets template guards short-circuit safely.
  eleventyConfig.addFilter("safeDictsort", (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    return Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  });

  // Hash filter for cache busting - generates MD5 hash of file content
  // Cache: same 16 static files are hashed once per build instead of once per page
  // (16 files × 3,426 pages = 55,332 readFileSync calls without cache)
  const _hashCache = new Map();
  eleventyConfig.addFilter("hash", (filePath) => {
    const cached = _hashCache.get(filePath);
    if (cached) return cached;
    try {
      const fullPath = resolve(__dirname, filePath.startsWith("/") ? `.${filePath}` : filePath);
      const content = readFileSync(fullPath);
      const hash = createHash("md5").update(content).digest("hex").slice(0, 8);
      _hashCache.set(filePath, hash);
      return hash;
    } catch {
      // Return timestamp as fallback if file not found
      return Date.now().toString(36);
    }
  });
  // Clear hash cache on rebuild so changed files get new hashes
  eleventyConfig.on("eleventy.before", () => { _hashCache.clear(); });

  // Derive OG slug from page.url (reliable) instead of page.fileSlug
  // (which suffers from Nunjucks race conditions in Eleventy 3.x parallel rendering).
  // OG images are named with the full date prefix to match URL segments exactly.
  eleventyConfig.addFilter("ogSlug", (url) => {
    if (!url) return "";
    const segments = url.split("/").filter(Boolean);
    // Date-based URL: /type/yyyy/MM/dd/slug/ → 5 segments → "yyyy-MM-dd-slug"
    if (segments.length === 5) {
      const [, year, month, day, slug] = segments;
      return `${year}-${month}-${day}-${slug}`;
    }
    // Fallback: last segment (for pages, legacy URLs)
    return segments[segments.length - 1] || "";
  });

  // Check if a generated OG image exists for this slug
  eleventyConfig.addFilter("hasOgImage", (slug) => {
    if (!slug) return false;
    const ogPath = resolve(__dirname, ".cache", "og", `${slug}.png`);
    return existsSync(ogPath);
  });

  // Inline file contents (for critical CSS inlining)
  eleventyConfig.addFilter("inlineFile", (filePath) => {
    try {
      const fullPath = resolve(__dirname, filePath.startsWith("/") ? `.${filePath}` : filePath);
      return readFileSync(fullPath, "utf-8");
    } catch {
      return "";
    }
  });

  // Extract raw Markdown body from a source file (strips front matter)
  eleventyConfig.addFilter("rawMarkdownBody", (inputPath) => {
    try {
      const src = readFileSync(inputPath, "utf-8");
      const { content } = matter(src);
      return content.trim();
    } catch {
      return "";
    }
  });

  // Current timestamp filter (for client-side JS buildtime)
  eleventyConfig.addFilter("timestamp", () => Date.now());

  // Date filter (for sidebar dates)
  // Memoized: same date+format combos repeat across pages
  // 33,025 calls on initial build → unique combos ~2,350
  const _dateFilterCache = new Map();
  eleventyConfig.on("eleventy.before", () => { _dateFilterCache.clear(); });
  eleventyConfig.addFilter("date", (dateObj, format) => {
    if (!dateObj) return "";
    const dateKey = dateObj instanceof Date ? dateObj.getTime() : dateObj;
    const key = `${dateKey}|${format}`;
    const cached = _dateFilterCache.get(key);
    if (cached !== undefined) return cached;
    const date = new Date(dateObj);
    const options = {};

    if (format.includes("MMM")) options.month = "short";
    if (format.includes("d")) options.day = "numeric";
    if (format.includes("yyyy")) options.year = "numeric";

    const result = date.toLocaleDateString("en-US", options);
    _dateFilterCache.set(key, result);
    return result;
  });

  // Webmention filters - with legacy URL support
  // This filter checks both current URL and any legacy URLs from redirects
  // Merges webmentions + conversations with deduplication (conversations first)
  eleventyConfig.addFilter("webmentionsForUrl", function (webmentions, url, urlAliases, conversationMentions = []) {
    if (!url) return [];

    // Merge conversations + webmentions with deduplication
    const seen = new Set();
    const merged = [];

    // Add conversations first (richer metadata)
    for (const item of conversationMentions) {
      const key = item['wm-id'] || item.url;
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }

    // Add webmentions (skip duplicates)
    if (webmentions) {
      for (const item of webmentions) {
        const key = item['wm-id'];
        if (!key || seen.has(key)) continue;
        if (item.url && seen.has(item.url)) continue;
        seen.add(key);
        merged.push(item);
      }
    }

    // Build list of all URLs to check (current + legacy)
    const urlsToCheck = new Set();

    // Add current URL variations
    const absoluteUrl = url.startsWith("http") ? url : `${siteUrl}${url}`;
    urlsToCheck.add(absoluteUrl);
    urlsToCheck.add(absoluteUrl.replace(/\/$/, ""));
    urlsToCheck.add(absoluteUrl.endsWith("/") ? absoluteUrl : `${absoluteUrl}/`);

    // Add legacy URLs from aliases (if provided)
    if (urlAliases?.aliases) {
      const normalizedUrl = url.replace(/\/$/, "");
      const oldUrls = urlAliases.aliases[normalizedUrl] || [];
      for (const oldUrl of oldUrls) {
        urlsToCheck.add(`${siteUrl}${oldUrl}`);
        urlsToCheck.add(`${siteUrl}${oldUrl}/`);
        urlsToCheck.add(`${siteUrl}${oldUrl}`.replace(/\/$/, ""));
      }
    }

    // Compute legacy /content/ URL from current URL for old webmention.io targets
    // Pattern: /type/yyyy/MM/dd/slug/ → /content/type/yyyy-MM-dd-slug/
    const pathSegments = url.replace(/\/$/, "").split("/").filter(Boolean);
    if (pathSegments.length === 5) {
      const [type, year, month, day, slug] = pathSegments;
      const contentUrl = `/content/${type}/${year}-${month}-${day}-${slug}/`;
      urlsToCheck.add(`${siteUrl}${contentUrl}`);
      urlsToCheck.add(`${siteUrl}${contentUrl}`.replace(/\/$/, ""));
    }

    // Filter merged data matching any of our URLs
    const matched = merged.filter((wm) => urlsToCheck.has(wm["wm-target"]));

    // Deduplicate cross-source: same author + same interaction type = same mention
    // (webmention.io and conversations API may both report the same like/reply)
    const deduped = [];
    const authorActions = new Set();
    for (const wm of matched) {
      const authorUrl = wm.author?.url || wm.url || "";
      const action = wm["wm-property"] || "mention";
      const key = `${authorUrl}::${action}`;
      if (authorActions.has(key)) continue;
      authorActions.add(key);
      deduped.push(wm);
    }
    return deduped;
  });

  eleventyConfig.addFilter("webmentionsByType", function (mentions, type) {
    if (!mentions) return [];
    const typeMap = {
      likes: "like-of",
      reposts: "repost-of",
      bookmarks: "bookmark-of",
      replies: "in-reply-to",
      mentions: "mention-of",
    };
    const wmProperty = typeMap[type] || type;
    return mentions.filter((m) => m["wm-property"] === wmProperty);
  });

  // Post navigation — find previous/next post in a collection
  // (Nunjucks {% set %} inside {% for %} doesn't propagate, so we need filters)
  eleventyConfig.addFilter("previousInCollection", function (collection, page) {
    if (!collection || !page) return null;
    const index = collection.findIndex((p) => p.url === page.url);
    return index > 0 ? collection[index - 1] : null;
  });

  eleventyConfig.addFilter("nextInCollection", function (collection, page) {
    if (!collection || !page) return null;
    const index = collection.findIndex((p) => p.url === page.url);
    return index >= 0 && index < collection.length - 1
      ? collection[index + 1]
      : null;
  });

  // Posting frequency — compute posts-per-month for last 12 months (for sparkline).
  // Returns an inline SVG that uses currentColor for stroke and a semi-transparent
  // gradient fill. Wrap in a colored span to set the domain color via Tailwind.
  eleventyConfig.addFilter("postingFrequency", (posts) => {
    if (!Array.isArray(posts) || posts.length === 0) return "";
    const now = new Date();
    const counts = new Array(12).fill(0);
    for (const post of posts) {
      const postDate = new Date(post.date || post.data?.date);
      if (isNaN(postDate.getTime())) continue;
      const monthsAgo = (now.getFullYear() - postDate.getFullYear()) * 12 + (now.getMonth() - postDate.getMonth());
      if (monthsAgo >= 0 && monthsAgo < 12) {
        counts[11 - monthsAgo]++;
      }
    }

    // Extrapolate the current (partial) month to avoid false downward trend.
    // e.g. 51 posts in 5 days of a 31-day month projects to ~316.
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (dayOfMonth < daysInMonth && counts[11] > 0) {
      counts[11] = Math.round(counts[11] / dayOfMonth * daysInMonth);
    }

    const max = Math.max(...counts, 1);
    const w = 200;
    const h = 32;
    const pad = 2;
    const step = w / (counts.length - 1);
    const points = counts.map((v, i) => {
      const x = i * step;
      const y = h - pad - ((v / max) * (h - pad * 2));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    // Closed polygon for gradient fill (line path + bottom corners)
    const fillPoints = `${points} ${w},${h} 0,${h}`;
    return [
      `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none" class="sparkline" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Posting frequency over the last 12 months">`,
      `<defs><linearGradient id="spk-fill" x1="0" y1="0" x2="0" y2="1">`,
      `<stop offset="0%" stop-color="currentColor" stop-opacity="0.25"/>`,
      `<stop offset="100%" stop-color="currentColor" stop-opacity="0.02"/>`,
      `</linearGradient></defs>`,
      `<polygon fill="url(#spk-fill)" points="${fillPoints}"/>`,
      `<polyline fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" points="${points}"/>`,
      `</svg>`,
    ].join("");
  });

  // Filter AI-involved posts (ai-text-level > "0" or aiTextLevel > "0")
  // Memoized: same collections.posts input produces same output — compute once per build
  // (694 calls × 2,350 posts = 1.6M iterations without cache)
  let _aiPostsCache = null;
  let _aiStatsCache = null;
  eleventyConfig.on("eleventy.before", () => { _aiPostsCache = null; _aiStatsCache = null; });

  eleventyConfig.addFilter("aiPosts", (posts) => {
    if (!Array.isArray(posts)) return [];
    if (_aiPostsCache) return _aiPostsCache;
    _aiPostsCache = posts.filter((post) => {
      const level = post.data?.aiTextLevel || post.data?.["ai-text-level"] || "0";
      return level !== "0" && level !== 0;
    });
    return _aiPostsCache;
  });

  // AI stats — returns { total, aiCount, percentage, byLevel }
  eleventyConfig.addFilter("aiStats", (posts) => {
    if (!Array.isArray(posts)) return { total: 0, aiCount: 0, percentage: 0, byLevel: {} };
    if (_aiStatsCache) return _aiStatsCache;
    const total = posts.length;
    const byLevel = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const post of posts) {
      const level = parseInt(post.data?.aiTextLevel || post.data?.["ai-text-level"] || "0", 10);
      byLevel[level] = (byLevel[level] || 0) + 1;
    }
    const aiCount = total - byLevel[0];
    _aiStatsCache = {
      total,
      aiCount,
      percentage: total > 0 ? ((aiCount / total) * 100).toFixed(1) : "0",
      byLevel,
    };
    return _aiStatsCache;
  });

  // Helper: exclude drafts from collections
  const isPublished = (item) => !item.data.draft;

  // Collections for different post types
  // Note: content path is content/ due to symlink structure
  // "posts" shows ALL content types combined
  eleventyConfig.addCollection("posts", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("content/**/*.md")
      .filter(isPublished)
      .sort((a, b) => b.date - a.date);
  });

  eleventyConfig.addCollection("notes", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("content/notes/**/*.md")
      .filter(isPublished)
      .sort((a, b) => b.date - a.date);
  });

  eleventyConfig.addCollection("articles", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("content/articles/**/*.md")
      .filter(isPublished)
      .sort((a, b) => b.date - a.date);
  });

  eleventyConfig.addCollection("bookmarks", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("content/bookmarks/**/*.md")
      .filter(isPublished)
      .sort((a, b) => b.date - a.date);
  });

  eleventyConfig.addCollection("photos", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("content/photos/**/*.md")
      .filter(isPublished)
      .sort((a, b) => b.date - a.date);
  });

  eleventyConfig.addCollection("likes", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("content/likes/**/*.md")
      .filter(isPublished)
      .sort((a, b) => b.date - a.date);
  });

  // Replies collection - posts with inReplyTo/in_reply_to property
  // Supports both camelCase (Indiekit Eleventy preset) and underscore (legacy) names
  eleventyConfig.addCollection("replies", function (collectionApi) {
    return collectionApi
      .getAll()
      .filter((item) => isPublished(item) && (item.data.inReplyTo || item.data.in_reply_to))
      .sort((a, b) => b.date - a.date);
  });

  // Reposts collection - posts with repostOf/repost_of property
  // Supports both camelCase (Indiekit Eleventy preset) and underscore (legacy) names
  eleventyConfig.addCollection("reposts", function (collectionApi) {
    return collectionApi
      .getAll()
      .filter((item) => isPublished(item) && (item.data.repostOf || item.data.repost_of))
      .sort((a, b) => b.date - a.date);
  });

  // Pages collection - root-level slash pages (about, now, uses, etc.)
  // Includes both content/*.md (legacy) and content/pages/*.md (new post-type-page)
  // Created via Indiekit's page post type
  eleventyConfig.addCollection("pages", function (collectionApi) {
    const rootPages = collectionApi.getFilteredByGlob("content/*.md");
    const pagesDir = collectionApi.getFilteredByGlob("content/pages/*.md");
    return [...rootPages, ...pagesDir]
      .filter(page => isPublished(page) && !page.inputPath.includes('content.json') && !page.inputPath.includes('pages.json'))
      .sort((a, b) => (a.data.title || a.data.name || "").localeCompare(b.data.title || b.data.name || ""));
  });

  // All content combined for homepage feed
  eleventyConfig.addCollection("feed", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("content/**/*.md")
      .filter(isPublished)
      .sort((a, b) => b.date - a.date)
      .slice(0, 20);
  });

  // Recently edited posts (updated !== published) — for /updated.xml
  // Note: getFilteredByGlob reuses Eleventy's cached template parse, no extra I/O
  eleventyConfig.addCollection("recentlyUpdated", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("content/**/*.md")
      .filter(isPublished)
      .filter((item) => {
        if (!item.data.updated) return false;
        const published = new Date(item.date).getTime();
        const updated = new Date(item.data.updated).getTime();
        return updated > published;
      })
      .sort((a, b) => new Date(b.data.updated) - new Date(a.data.updated))
      .slice(0, 20);
  });

  // Categories collection - deduplicated by slug to avoid duplicate permalinks
  eleventyConfig.addCollection("categories", function (collectionApi) {
    const categoryMap = new Map(); // slug -> original name (first seen)
    const slugify = (str) => str.toLowerCase().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");

    collectionApi.getAll().filter(isPublished).forEach((item) => {
      if (item.data.category) {
        const cats = Array.isArray(item.data.category) ? item.data.category : [item.data.category];
        cats.forEach((cat) => {
          if (cat && typeof cat === 'string' && cat.trim()) {
            const slug = slugify(cat.trim());
            if (slug && !categoryMap.has(slug)) {
              categoryMap.set(slug, cat.trim());
            }
          }
        });
      }
    });
    return [...categoryMap.values()].sort();
  });

  // Category feeds — pre-grouped posts for per-category RSS/JSON feeds
  eleventyConfig.addCollection("categoryFeeds", function (collectionApi) {
    const slugify = (str) => str.toLowerCase().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
    const grouped = new Map(); // slug -> { name, slug, posts[] }

    collectionApi
      .getFilteredByGlob("content/**/*.md")
      .filter(isPublished)
      .sort((a, b) => b.date - a.date)
      .forEach((item) => {
        if (!item.data.category) return;
        const cats = Array.isArray(item.data.category) ? item.data.category : [item.data.category];
        for (const cat of cats) {
          if (!cat || typeof cat !== "string" || !cat.trim()) continue;
          const slug = slugify(cat.trim());
          if (!slug) continue;
          if (!grouped.has(slug)) {
            grouped.set(slug, { name: cat.trim(), slug, posts: [] });
          }
          const entry = grouped.get(slug);
          if (entry.posts.length < 50) {
            entry.posts.push(item);
          }
        }
      });

    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  // Recent posts for sidebar
  eleventyConfig.addCollection("recentPosts", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("content/**/*.md")
      .filter(isPublished)
      .sort((a, b) => b.date - a.date)
      .slice(0, 5);
  });

  // Featured posts — curated selection via `pinned: true` frontmatter
  // Property named "pinned" to avoid conflict with "featured" (hero image) in MF2/Micropub
  eleventyConfig.addCollection("featuredPosts", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("content/**/*.md")
      .filter(isPublished)
      .filter((item) => item.data.pinned === true || item.data.pinned === "true")
      .sort((a, b) => b.date - a.date);
  });

  // Weekly digests — posts grouped by ISO week for digest pages and RSS feed
  eleventyConfig.addCollection("weeklyDigests", function (collectionApi) {
    const allPosts = collectionApi
      .getFilteredByGlob("content/**/*.md")
      .filter(isPublished)
      .filter((item) => {
        // Exclude replies
        return !(item.data.inReplyTo || item.data.in_reply_to);
      })
      .sort((a, b) => b.date - a.date);

    // ISO week helpers
    const getISOWeek = (date) => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    };
    const getISOYear = (date) => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      return d.getUTCFullYear();
    };

    // Group by ISO week
    const weekMap = new Map();

    for (const post of allPosts) {
      const d = new Date(post.date);
      const week = getISOWeek(d);
      const year = getISOYear(d);
      const key = `${year}-W${String(week).padStart(2, "0")}`;

      if (!weekMap.has(key)) {
        // Calculate Monday (start) and Sunday (end) of ISO week
        const jan4 = new Date(Date.UTC(year, 0, 4));
        const dayOfWeek = jan4.getUTCDay() || 7;
        const monday = new Date(jan4);
        monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
        const sunday = new Date(monday);
        sunday.setUTCDate(monday.getUTCDate() + 6);

        weekMap.set(key, {
          year,
          week,
          slug: `${year}/W${String(week).padStart(2, "0")}`,
          label: `Week ${week}, ${year}`,
          startDate: monday.toISOString().slice(0, 10),
          endDate: sunday.toISOString().slice(0, 10),
          posts: [],
        });
      }

      weekMap.get(key).posts.push(post);
    }

    // Post type detection (matches blog.njk logic)
    const typeDetect = (post) => {
      if (post.data.likeOf || post.data.like_of) return "likes";
      if (post.data.bookmarkOf || post.data.bookmark_of) return "bookmarks";
      if (post.data.repostOf || post.data.repost_of) return "reposts";
      if (post.data.photo && post.data.photo.length) return "photos";
      if (post.data.title) return "articles";
      return "notes";
    };

    // Build byType for each week and convert to array
    const digests = [...weekMap.values()].map((entry) => {
      const byType = {};
      for (const post of entry.posts) {
        const type = typeDetect(post);
        if (!byType[type]) byType[type] = [];
        byType[type].push(post);
      }
      return { ...entry, byType };
    });

    // Sort newest-week-first
    digests.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.week - a.week;
    });

    return digests;
  });

  // Build-status: mark the build as "building" (site-builder Phase 5, spec §2.4).
  // buildId/buildStart are reassigned per build cycle — the config lives in a
  // long-lived --watch --incremental process where builds are serialized.
  // MUST write synchronously: Eleventy's AsyncEventEmitter runs eleventy.before
  // listeners in PARALLEL (Promise.all), so an async write would suspend at its
  // first await while the fully-synchronous OG hook (execFileSync batch loop)
  // blocks the event loop — the file would show the stale previous state for
  // the whole OG phase. Skipped silently outside the container (no /app/data);
  // writeBuildStatusSync never throws, so a status failure can't fail a build.
  let buildId = null;
  let buildStart = null;
  eleventyConfig.on("eleventy.before", () => {
    if (!existsSync("/app/data")) return;
    buildId = randomUUID();
    buildStart = Date.now();
    writeBuildStatusSync({
      state: "building",
      buildId,
      startedAt: new Date(buildStart).toISOString(),
    });
  });

  // Generate OpenGraph images for posts without photos.
  // Uses batch spawning: each invocation generates up to BATCH_SIZE images then exits,
  // fully releasing WASM native memory (Satori Yoga + Resvg Rust) between batches.
  // Exit code 2 = batch complete, more work remains → re-spawn.
  // Manifest caching makes incremental builds fast (only new posts get generated).
  eleventyConfig.on("eleventy.before", () => {
    logMemory("before-build (OG start)");
    const contentDir = resolve(__dirname, "content");
    const cacheDir = resolve(__dirname, ".cache");
    // Resolve the SITE TITLE the same way _data/site.js does so OG card images
    // match the header/<title>: identity.siteName → SITE_NAME env → identity.name
    // → default. Reading the runtime site-config.json (written by the site-config
    // plugin) keeps the UI-configured brand authoritative without an env var.
    const siteName = resolveSiteName();
    const BATCH_SIZE = 100;
    let totalGenerated = 0;
    let batch = 0;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        batch++;
        try {
          execFileSync(process.execPath, [
            "--max-old-space-size=512",
            "--expose-gc",
            resolve(__dirname, "lib", "og-cli.js"),
            contentDir,
            cacheDir,
            siteName,
            String(BATCH_SIZE),
          ], {
            stdio: "inherit",
            env: { ...process.env, NODE_OPTIONS: "" },
          });
          // Exit code 0 = all done
          break;
        } catch (err) {
          if (err.status === 2) {
            // Exit code 2 = batch complete, more images remain
            totalGenerated += BATCH_SIZE;
            continue;
          }
          throw err;
        }
      }

      // Sync new OG images to output directory.
      // During incremental builds, .cache/og is in watchIgnores so Eleventy's
      // passthrough copy won't pick up newly generated images. Copy them manually.
      const ogCacheDir = resolve(cacheDir, "og");
      const ogOutputDir = resolve(__dirname, "_site", "og");
      if (existsSync(ogCacheDir) && existsSync(resolve(__dirname, "_site"))) {
        mkdirSync(ogOutputDir, { recursive: true });
        let synced = 0;
        for (const file of readdirSync(ogCacheDir)) {
          if (file.endsWith(".png") && !existsSync(resolve(ogOutputDir, file))) {
            copyFileSync(resolve(ogCacheDir, file), resolve(ogOutputDir, file));
            synced++;
          }
        }
        if (synced > 0) {
          console.log(`[og] Synced ${synced} new image(s) to output`);
        }
      }
    } catch (err) {
      console.error("[og] Image generation failed:", err.message);
    }
  });

  // Pre-fetch unfurl metadata for all interaction URLs in content files.
  // Populates the disk cache BEFORE templates render, so the synchronous
  // unfurlCard filter (used in nested includes like recent-posts) has data.
  eleventyConfig.on("eleventy.before", async () => {
    const contentDir = resolve(__dirname, "content");
    if (!existsSync(contentDir)) return;

    const urls = new Set();
    const interactionProps = [
      "likeOf", "like_of", "bookmarkOf", "bookmark_of",
      "repostOf", "repost_of", "inReplyTo", "in_reply_to",
    ];

    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith(".md")) continue;
        try {
          const { data } = matter(readFileSync(full, "utf-8"));
          for (const prop of interactionProps) {
            if (data[prop]) urls.add(data[prop]);
          }
        } catch { /* skip unparseable files */ }
      }
    };
    walk(contentDir);
    // Free parsed markdown content before starting network-heavy prefetch
    if (typeof global.gc === "function") global.gc();

    if (urls.size === 0) return;
    const urlArray = [...urls];
    const UNFURL_BATCH = 50;
    const totalBatches = Math.ceil(urlArray.length / UNFURL_BATCH);
    console.log(`[unfurl] Pre-fetching ${urlArray.length} interaction URLs (${totalBatches} batches of ${UNFURL_BATCH})...`);
    let fetched = 0;
    for (let i = 0; i < urlArray.length; i += UNFURL_BATCH) {
      const batch = urlArray.slice(i, i + UNFURL_BATCH);
      const batchNum = Math.floor(i / UNFURL_BATCH) + 1;
      await Promise.all(batch.map((url) => prefetchUrl(url)));
      fetched += batch.length;
      if (typeof global.gc === "function") global.gc();
      if (batchNum === 1 || batchNum % 5 === 0 || batchNum === totalBatches) {
        const rss = (process.memoryUsage.rss() / 1024 / 1024).toFixed(0);
        console.log(`[unfurl] Batch ${batchNum}/${totalBatches} (${fetched}/${urlArray.length}) | RSS: ${rss} MB`);
      }
    }
    console.log(`[unfurl] Pre-fetch complete.`);
  });

  // Post-build hook: pagefind indexing + WebSub notification
  // Pagefind runs once on the first build (initial or watcher's first full build), then never again.
  // WebSub runs on every non-incremental build.
  // Note: --incremental CLI flag sets incremental=true even for the watcher's first full build,
  // so we cannot use the incremental flag to guard pagefind. Use a one-shot flag instead.
  let pagefindDone = false;
  eleventyConfig.on("eleventy.after", async ({ dir, directories, runMode, incremental }) => {
    logMemory("after-build (pre-hooks)");
    // Markdown for Agents — generate index.md alongside index.html for articles
    const mdEnabled = (process.env.MARKDOWN_AGENTS_ENABLED || "true").toLowerCase() === "true";
    if (mdEnabled && !incremental) {
      const outputDir = directories?.output || dir.output;
      const contentDir = resolve(__dirname, "content/articles");
      const aiTrain = process.env.MARKDOWN_AGENTS_AI_TRAIN || "yes";
      const search = process.env.MARKDOWN_AGENTS_SEARCH || "yes";
      const aiInput = process.env.MARKDOWN_AGENTS_AI_INPUT || "yes";
      const authorName = process.env.AUTHOR_NAME || "Blog Author";
      let mdCount = 0;
      try {
        const files = readdirSync(contentDir).filter(f => f.endsWith(".md"));
        for (const file of files) {
          const src = readFileSync(resolve(contentDir, file), "utf-8");
          const { data: fm, content: body } = matter(src);
          if (!fm || fm.draft) continue;
          // Derive the output path from the article's permalink or url
          const articleUrl = fm.permalink || fm.url;
          if (!articleUrl || !articleUrl.startsWith("/articles/")) continue;
          const mdDir = resolve(outputDir, articleUrl.replace(/^\//, "").replace(/\/$/, ""));
          const mdPath = resolve(mdDir, "index.md");
          const trimmedBody = body.trim();
          const tokens = Math.ceil(trimmedBody.length / 4);
          const title = (fm.title || "").replace(/"/g, '\\"');
          const date = fm.date ? new Date(fm.date).toISOString() : fm.published || "";
          let frontLines = [
            "---",
            `title: "${title}"`,
            `date: ${date}`,
            `author: ${authorName}`,
            `url: ${siteUrl}${articleUrl}`,
          ];
          if (fm.category && Array.isArray(fm.category) && fm.category.length > 0) {
            frontLines.push("categories:");
            for (const cat of fm.category) {
              frontLines.push(`  - ${cat}`);
            }
          }
          if (fm.description) {
            frontLines.push(`description: "${fm.description.replace(/"/g, '\\"')}"`);
          }
          frontLines.push(`tokens: ${tokens}`);
          frontLines.push(`content_signal: ai-train=${aiTrain}, search=${search}, ai-input=${aiInput}`);
          frontLines.push("---");
          mkdirSync(mdDir, { recursive: true });
          writeFileSync(mdPath, frontLines.join("\n") + "\n\n# " + (fm.title || "") + "\n\n" + trimmedBody + "\n");
          mdCount++;
        }
        console.log(`[markdown-agents] Generated ${mdCount} article .md files`);
      } catch (err) {
        console.error("[markdown-agents] Error generating .md files:", err.message);
      }
    }

    // Sitemap generation — scan output HTML files, exclude URL patterns
    // Runs on every build (including incremental) so new posts appear immediately
    {
      const sitemapOutputDir = directories?.output || dir.output;
      const excludePatterns = [
        /^\/replies\//,
        /\/feed\.(xml|json)$/,
        /^\/categories\//,
        /^\/digest/,
        /^\/webmention-debug\//,
        /^\/404\.html$/,
        /^\/dashboard/,
        /^\/homepage/,
        /^\/search\//,
        /^\/graph\//,
        /^\/sitemap\.xml$/,
        /^\/\.interface-design\//,
        /^\/preview\//,
      ];
      try {
        const walkHtml = (base, prefix = "") => {
          const entries = [];
          for (const entry of readdirSync(resolve(base, prefix), { withFileTypes: true })) {
            const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
              entries.push(...walkHtml(base, rel));
            } else if (entry.name === "index.html") {
              const urlPath = prefix ? `/${prefix}/` : "/";
              entries.push(urlPath);
            }
          }
          return entries;
        };
        const allUrls = walkHtml(sitemapOutputDir)
          .filter((url) => !excludePatterns.some((p) => p.test(url)))
          .sort();
        const xmlLines = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ];
        for (const url of allUrls) {
          xmlLines.push(`  <url><loc>${siteUrl}${url}</loc></url>`);
        }
        xmlLines.push("</urlset>");
        writeFileSync(resolve(sitemapOutputDir, "sitemap.xml"), xmlLines.join("\n"));
        console.log(`[sitemap] Generated sitemap.xml with ${allUrls.length} URLs`);
      } catch (err) {
        console.error("[sitemap] Generation failed:", err.message);
      }
    }

    // Pagefind indexing — run exactly once per process lifetime
    if (!pagefindDone) {
      pagefindDone = true;
      const outputDir = directories?.output || dir.output;
      try {
        console.log(`[pagefind] Indexing ${outputDir} (${runMode})...`);
        execFileSync("npx", ["pagefind", "--site", outputDir, "--output-subdir", "pagefind", "--glob", "**/*.html"], {
          stdio: "inherit",
          timeout: 120000,
        });
        console.log("[pagefind] Indexing complete");
      } catch (err) {
        console.error("[pagefind] Indexing failed:", err.message);
      }

    }

    // JS minification — minify source JS files in output (skip vendor, already-minified)
    if (runMode === "build" && !incremental) {
      const jsOutputDir = directories?.output || dir.output;
      const jsDir = resolve(jsOutputDir, "js");
      if (existsSync(jsDir)) {
        let jsMinified = 0;
        let jsSaved = 0;
        for (const file of readdirSync(jsDir).filter(f => f.endsWith(".js") && !f.endsWith(".min.js"))) {
          const filePath = resolve(jsDir, file);
          try {
            const src = readFileSync(filePath, "utf-8");
            const result = await minifyJS(src, { compress: true, mangle: true });
            if (result.code) {
              const saved = src.length - result.code.length;
              if (saved > 0) {
                writeFileSync(filePath, result.code);
                jsSaved += saved;
                jsMinified++;
              }
            }
          } catch (err) {
            console.error(`[js-minify] Failed to minify ${file}:`, err.message);
          }
        }
        if (jsMinified > 0) {
          console.log(`[js-minify] Minified ${jsMinified} JS files, saved ${(jsSaved / 1024).toFixed(1)} KiB`);
        }
      }
    }

    // Syndication webhook — trigger after incremental rebuilds (new posts are now live)
    // Cuts syndication latency from ~2 min (poller) to ~5 sec (immediate trigger)
    if (incremental) {
      const syndicateUrl = process.env.SYNDICATE_WEBHOOK_URL;
      if (syndicateUrl) {
        try {
          const secretFile = process.env.SYNDICATE_SECRET_FILE || "/app/data/config/.secret";
          const secret = readFileSync(secretFile, "utf-8").trim();

          // Build a minimal HS256 JWT using built-in crypto (no jsonwebtoken dependency)
          const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
          const now = Math.floor(Date.now() / 1000);
          const payload = Buffer.from(JSON.stringify({
            me: siteUrl,
            scope: "update",
            iat: now,
            exp: now + 300, // 5 minutes
          })).toString("base64url");
          const signature = createHmac("sha256", secret)
            .update(`${header}.${payload}`)
            .digest("base64url");
          const token = `${header}.${payload}.${signature}`;

          const res = await fetch(`${syndicateUrl}?token=${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(30000),
          });
          console.log(`[syndicate-hook] Triggered syndication: ${res.status}`);
        } catch (err) {
          console.error(`[syndicate-hook] Failed:`, err.message);
        }
      }
    }

    // Signal readiness to Indiekit plugins — build is complete, system is stable.
    // Plugins poll for this file via @rmdes/indiekit-startup-gate before starting
    // heavy background tasks (feed polling, AP federation, sync jobs).
    // Only fires once — subsequent incremental builds skip this.
    const readyPath = "/app/data/.indiekit-ready";
    if (!existsSync(readyPath)) {
      try {
        writeFileSync(readyPath, "");
        console.log("[startup-gate] Readiness signal created — plugins will start deferred tasks");
      } catch { /* not running in Cloudron container — skip */ }
    }

    // Force garbage collection after post-build work completes.
    // V8 doesn't return freed heap pages to the OS without GC pressure.
    // In watch mode the watcher sits idle after its initial full build,
    // so without this, ~2 GB of build-time allocations stay resident.
    // Requires --expose-gc in NODE_OPTIONS (set in start.sh for the watcher).
    if (typeof global.gc === "function") {
      const before = process.memoryUsage();
      global.gc();
      const after = process.memoryUsage();
      const freed = ((before.heapUsed - after.heapUsed) / 1024 / 1024).toFixed(0);
      console.log(`[gc] Post-build GC freed ${freed} MB (heap: ${(after.heapUsed / 1024 / 1024).toFixed(0)} MB)`);

      // Log V8 heap space breakdown for memory investigation
      try {
        const v8 = await import("node:v8");
        const spaces = v8.getHeapSpaceStatistics();
        console.log(`[gc] Heap spaces after GC:`);
        for (const s of spaces) {
          const usedMB = (s.space_used_size / 1024 / 1024).toFixed(1);
          if (s.space_used_size > 1024 * 1024) {
            console.log(`[gc]   ${s.space_name}: ${usedMB} MB`);
          }
        }

        // Write heap snapshot to /tmp if HEAP_SNAPSHOT=1 is set
        if (process.env.HEAP_SNAPSHOT === "1") {
          const filename = `/tmp/eleventy-heap-${Date.now()}.heapsnapshot`;
          console.log(`[gc] Writing heap snapshot to ${filename}...`);
          v8.writeHeapSnapshot(filename);
          console.log(`[gc] Snapshot written`);
          // Only take one snapshot, then unset
          delete process.env.HEAP_SNAPSHOT;
        }
      } catch (e) {
        console.log(`[gc] Heap stats unavailable: ${e.message}`);
      }
    }

    // Build-status: mark the build "ok" (site-builder Phase 5, spec §2.4).
    // Must run BEFORE the incremental early-return below — every publish is an
    // incremental rebuild and must be observable. lastOkDurationSeconds is the
    // per-site self-calibrating number the admin UI quotes and stuck detection
    // multiplies. writeBuildStatus never throws (warns + returns false).
    if (existsSync("/app/data")) {
      const finishedAt = Date.now();
      const durationSeconds =
        buildStart === null ? undefined : Number(((finishedAt - buildStart) / 1000).toFixed(1));
      await writeBuildStatus({
        state: "ok",
        ...(buildId ? { buildId } : {}),
        finishedAt: new Date(finishedAt).toISOString(),
        durationSeconds,
        incremental: Boolean(incremental),
        // Omitted when unknown so the writer carries the previous value forward
        ...(durationSeconds === undefined ? {} : { lastOkDurationSeconds: durationSeconds }),
      });
    }

    // Preview orphan pruning (site-builder Phase 5 follow-up). Preview tokens
    // rotate on every publish, but the in-place incremental build never
    // deletes the old /preview/<token>/ output — without pruning, the stale
    // token's page keeps serving 200 forever. Remove every preview directory
    // that isn't the CURRENT draft token (no artifact → no preview should
    // exist → remove all). Must run BEFORE the incremental early-return —
    // every publish is an incremental rebuild. Never throws.
    {
      const artifactPath = resolve(__dirname, "content", "_data", "compositions", "preview-draft.json");
      const currentToken = readCurrentPreviewToken(artifactPath);
      const pruned = await prunePreviewOrphans(directories?.output || dir.output, currentToken);
      if (pruned.length > 0) {
        console.log(`[preview] Pruned ${pruned.length} stale preview dir(s): ${pruned.join(", ")}`);
      }
    }

    // WebSub hub notification — skip on incremental rebuilds
    if (incremental) return;
    const hubUrl = "https://websubhub.com/hub";
    const feedUrls = [
      `${siteUrl}/`,
      `${siteUrl}/feed.xml`,
      `${siteUrl}/feed.json`,
    ];

    // Discover category feed URLs from build output
    const outputDir = directories?.output || dir.output;
    const categoriesDir = resolve(outputDir, "categories");
    try {
      for (const entry of readdirSync(categoriesDir, { withFileTypes: true })) {
        if (entry.isDirectory() && existsSync(resolve(categoriesDir, entry.name, "feed.xml"))) {
          feedUrls.push(`${siteUrl}/categories/${entry.name}/feed.xml`);
          feedUrls.push(`${siteUrl}/categories/${entry.name}/feed.json`);
        }
      }
    } catch {
      // categoriesDir may not exist on first build — ignore
    }

    console.log(`[websub] Notifying hub for ${feedUrls.length} URLs...`);
    for (const feedUrl of feedUrls) {
      try {
        const res = await fetch(hubUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `hub.mode=publish&hub.url=${encodeURIComponent(feedUrl)}`,
        });
        console.log(`[websub] Notified hub for ${feedUrl}: ${res.status}`);
      } catch (err) {
        console.error(`[websub] Hub notification failed for ${feedUrl}:`, err.message);
      }
    }
  });

  return {
    dir: {
      input: ".",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: false,  // Disable to avoid Nunjucks interpreting {{ in content
    htmlTemplateEngine: "njk",
  };
}
