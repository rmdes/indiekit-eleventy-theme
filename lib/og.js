/**
 * OpenGraph image generation for posts without photos.
 * Uses Satori (layout → SVG) + @resvg/resvg-js (SVG → PNG).
 * Generated images are cached in .cache/og/ and passthrough-copied to output.
 *
 * Card design inspired by GitHub's OG images: light background, clean
 * typography hierarchy, avatar, metadata row, and accent color bar.
 */

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WIDTH = 1200;
const HEIGHT = 630;

// Card design version — bump to force full regeneration
const DESIGN_VERSION = 4;

// Neutral base palette. Only the accent-derived entries (bar, badge, badgeText)
// are overridden per site; the greys stay fixed so the card keeps its contrast
// whatever brand colour a site picks.
const BASE_COLORS = {
  bg: "#ffffff",
  title: "#24292f",
  description: "#57606a",
  meta: "#57606a",
  accent: "#3b82f6",
  badge: "#ddf4ff",
  badgeText: "#0969da",
  border: "#d8dee4",
  bar: "#3b82f6",
};

/**
 * Mix a 6-digit hex colour toward white — used to tint the badge background
 * from the site's accent without pulling in a colour library.
 * @param {string} hex - Colour like "#e2b71d"
 * @param {number} weight - 0 = unchanged, 1 = white
 * @returns {string|null} Mixed hex, or null when `hex` is not 6-digit hex
 */
function mixWithWhite(hex, weight) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  const channel = (shift) =>
    Math.round(((value >> shift) & 255) * (1 - weight) + 255 * weight);
  return `#${[16, 8, 0]
    .map((shift) => channel(shift).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Build the card palette for one site.
 *
 * A site's accent reaches us as `branding.colors.primary` from site-config,
 * which the admin UI writes as plain hex. Anything else — an oklch() value, a
 * named colour, an empty string — fails the hex guard and falls back to the
 * neutral blue, because Satori/resvg would otherwise render (or refuse) a
 * colour we cannot verify.
 * @param {string} [accent] - Site accent colour
 * @returns {object} Palette with the same keys as BASE_COLORS
 */
function buildPalette(accent) {
  const tint = mixWithWhite(accent, 0.88);
  if (!tint) return BASE_COLORS;
  return {
    ...BASE_COLORS,
    accent,
    bar: accent,
    badge: tint,
    badgeText: accent,
  };
}

const POST_TYPE_MAP = {
  articles: "Article",
  notes: "Note",
  bookmarks: "Bookmark",
  photos: "Photo",
  likes: "Like",
  replies: "Reply",
  reposts: "Repost",
  pages: "Page",
  videos: "Video",
  audio: "Audio",
  jams: "Jam",
  rsvps: "RSVP",
  events: "Event",
};

// Satori embeds the avatar as a data URI, so it must be a raster format resvg
// can decode. SVG avatars (the theme's own default-avatar.svg included) are
// deliberately not accepted — Satori's SVG-in-img support is unreliable and a
// throw here would fail the whole build.
// ponytail: raster only; if SVG avatars are ever wanted, rasterise them here.
const AVATAR_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

let avatarDataUri;

/**
 * Resolve a configured avatar to a file on disk.
 *
 * `src` is whatever the operator put in AUTHOR_AVATAR (or site-config): a
 * root-relative path ("/images/rick.jpg"), a same-origin URL, or a remote one.
 * Only local files are read — fetching a remote avatar would put a network
 * request in the build, which this theme avoids by policy.
 * @param {string} src - Configured avatar location
 * @param {string} contentDir - Path to the site's content/ directory
 * @returns {string|null} Absolute path, or null when nothing usable resolves
 */
function resolveAvatarPath(src, contentDir) {
  if (!src) return null;

  // A URL contributes only its path: a same-origin avatar then resolves like a
  // root-relative one, and a genuinely remote one simply finds no local file.
  let rel = src;
  if (/^https?:\/\//i.test(rel)) {
    try {
      rel = new URL(rel).pathname;
    } catch {
      return null;
    }
  }
  rel = rel.replace(/^\/+/, "");
  if (!rel || rel.split("/").includes("..")) return null;

  // Theme assets ("images/…") first, then site media ("media/…").
  for (const base of [resolve(__dirname, ".."), contentDir]) {
    if (!base) continue;
    const candidate = join(base, rel);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Load the site's avatar as a data URI, memoised for the batch.
 * Returns null when no avatar is configured — the card layout drops the avatar
 * column entirely, which is the correct look for a site without one.
 * @param {string} src - Configured avatar location
 * @param {string} contentDir - Path to the site's content/ directory
 * @returns {string|null} Data URI, or null
 */
function loadAvatar(src, contentDir) {
  if (avatarDataUri !== undefined) return avatarDataUri;
  avatarDataUri = null;

  const path = resolveAvatarPath(src, contentDir);
  if (!path) return avatarDataUri;

  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  const mime = AVATAR_TYPES[ext];
  if (!mime) {
    console.warn(`[og] Ignoring avatar "${src}": only .jpg/.jpeg/.png render on the card`);
    return avatarDataUri;
  }

  try {
    avatarDataUri = `data:${mime};base64,${readFileSync(path).toString("base64")}`;
  } catch (error) {
    console.warn(`[og] Could not read avatar "${src}": ${error.message}`);
  }
  return avatarDataUri;
}

function loadFonts() {
  const fontsDir = resolve(
    __dirname,
    "..",
    "node_modules",
    "@fontsource",
    "inter",
    "files",
  );
  return [
    {
      name: "Inter",
      data: readFileSync(join(fontsDir, "inter-latin-400-normal.woff")),
      weight: 400,
      style: "normal",
    },
    {
      name: "Inter",
      data: readFileSync(join(fontsDir, "inter-latin-700-normal.woff")),
      weight: 700,
      style: "normal",
    },
  ];
}

/**
 * Cache key for one card. `cardKey` carries everything about the card that is
 * not per-post — site name, palette, which elements are shown, the avatar —
 * so changing a site's branding invalidates its cached cards on its own,
 * without anyone remembering to bump DESIGN_VERSION.
 * @param {string} title
 * @param {string} description
 * @param {string} date
 * @param {string} postType
 * @param {string} cardKey - Fingerprint of the site's card configuration
 * @returns {string} 12-char hex digest
 */
function computeHash(title, description, date, postType, cardKey) {
  return createHash("md5")
    .update(`v${DESIGN_VERSION}|${title}|${description}|${date}|${postType}|${cardKey}`)
    .digest("hex")
    .slice(0, 12);
}

/**
 * Resolve the raw per-site OG settings into the shape buildCard consumes.
 *
 * `hide` is a comma-separated opt-out list (OG_CARD_HIDE in env.sh), e.g.
 * "date,siteName". Opt-out rather than opt-in so an empty or absent value
 * keeps the full card instead of silently blanking it. The title is never
 * hideable — it is the card.
 * @param {object} [config] - { siteName, accent, avatar, hide }
 * @param {string} [contentDir] - Path to content/, for resolving media avatars
 * @returns {object} { siteName, colors, show, avatar, cardKey }
 */
function resolveCard(config = {}, contentDir = "") {
  const hidden = new Set(
    String(config.hide || "")
      .split(",")
      .map((element) => element.trim().toLowerCase())
      .filter(Boolean),
  );
  const show = {
    badge: !hidden.has("badge"),
    date: !hidden.has("date"),
    avatar: !hidden.has("avatar"),
    description: !hidden.has("description"),
    siteName: !hidden.has("sitename"),
  };

  const card = {
    siteName: config.siteName || "",
    colors: buildPalette(config.accent),
    show,
    avatar: show.avatar ? loadAvatar(config.avatar, contentDir) : null,
  };

  // The avatar enters the key as a digest, not the image: two sites with
  // different photos must not share cached cards, but the manifest stays small.
  card.cardKey = JSON.stringify({
    siteName: card.siteName,
    colors: card.colors,
    show,
    avatar: card.avatar
      ? createHash("md5").update(card.avatar).digest("hex").slice(0, 12)
      : "",
  });

  return card;
}

function detectPostType(filePath) {
  const parts = filePath.split("/");
  const contentIdx = parts.indexOf("content");
  if (contentIdx >= 0 && contentIdx + 1 < parts.length) {
    const typeDir = parts[contentIdx + 1];
    if (POST_TYPE_MAP[typeDir]) return POST_TYPE_MAP[typeDir];
  }
  return "Post";
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Use the full filename (with date prefix) as the OG image slug.
 */
function toOgSlug(filename) {
  return filename;
}

/**
 * Sanitize text for Satori rendering — strip characters that cause NO GLYPH.
 * Keeps Latin-1 Supplement and Latin Extended-A/B, so accented text
 * (é à è ç ù ô, and Central/Eastern European letters) survives intact.
 */
function sanitize(text) {
  if (!text) return "";
  return text.replace(/[^\x20-\x7E\u00A0-\u024F\u2010-\u2027\u2030-\u205E]/g, "").trim();
}

// Symbols the bundled Inter latin subset DOES have a glyph for, despite being
// classified Extended_Pictographic.
const PICTOGRAPHIC_KEEP = new Set(["©", "®", "™"]);

/**
 * Remove emoji and pictographs, which the Latin-only Inter subset renders as a
 * "NO GLYPH" box — seen on post titles that begin with an emoji.
 *
 * Titles come from frontmatter and skip sanitize(), which would be too blunt
 * here: it keeps only Latin ranges, so a Cyrillic or CJK title would be erased
 * to nothing. Stripping just the pictographs leaves every other script exactly
 * as it was — no better, no worse — while fixing the reported case.
 * ponytail: bundle a symbol font if emoji ever need to actually render.
 * @param {string} text
 * @returns {string} Text without pictographs
 */
function stripPictographs(text) {
  if (!text) return "";
  return text
    .replace(
      /\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{20E3}\u{200D}]/gu,
      (char) => (PICTOGRAPHIC_KEEP.has(char) ? char : ""),
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strip markdown formatting from raw content, returning plain text lines.
 */
function stripMarkdown(raw) {
  return raw
    // Strip frontmatter
    .replace(/^---[\s\S]*?---\s*/, "")
    // Strip images
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    // Strip markdown tables (lines with pipes)
    .replace(/^\|.*\|$/gm, "")
    // Strip table separator rows
    .replace(/^\s*[-|: ]+$/gm, "")
    // Strip heading anchors {#id}
    .replace(/\{#[^}]+\}/g, "")
    // Strip HTML tags
    .replace(/<[^>]+>/g, "")
    // Strip markdown links, keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Strip heading markers
    .replace(/^#{1,6}\s+/gm, "")
    // Strip bold, italic, strikethrough, code, blockquote markers
    .replace(/[*_~`>]/g, "")
    // Strip list bullets and numbered lists
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    // Strip horizontal rules
    .replace(/^-{3,}$/gm, "");
}

/**
 * Extract the first paragraph from raw markdown content.
 * Returns only the first meaningful block of text, ignoring headings,
 * tables, lists, and other structural elements.
 */
function extractFirstParagraph(raw) {
  const stripped = stripMarkdown(raw);
  // Split into lines, find first non-empty line(s) that form a paragraph
  const lines = stripped.split("\n");
  const paragraphLines = [];
  let started = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      // Empty line: if we've started collecting, the paragraph is done
      if (started) break;
      continue;
    }
    started = true;
    paragraphLines.push(trimmed);
  }

  const text = paragraphLines.join(" ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const safe = sanitize(text);
  return safe || text;
}

function truncate(text, max) {
  if (!text || text.length <= max) return text || "";
  return text.slice(0, max).trim() + "\u2026";
}

/**
 * Compose the Satori element tree for one card.
 * @param {string} title
 * @param {string} description
 * @param {string} dateStr
 * @param {string} postType
 * @param {object} card - From resolveCard(): { siteName, colors, show, avatar }
 * @returns {object} Satori element tree
 */
function buildCard(title, description, dateStr, postType, card) {
  const { colors: COLORS, show, siteName } = card;
  const avatar = card.avatar;
  const formattedDate = show.date ? formatDate(dateStr) : "";

  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        backgroundColor: COLORS.bg,
      },
      children: [
        // Top accent bar
        {
          type: "div",
          props: {
            style: {
              width: "100%",
              height: "6px",
              backgroundColor: COLORS.bar,
              flexShrink: 0,
            },
          },
        },
        // Main content — vertically centered
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flex: 1,
              padding: "0 64px",
              alignItems: "center",
            },
            children: [
              // Left: text content
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    gap: "16px",
                    overflow: "hidden",
                    paddingRight: avatar ? "48px" : "0",
                  },
                  children: [
                    // Post type badge + date inline — dropped entirely when the
                    // site hides both, so the title moves up rather than
                    // leaving an empty row.
                    show.badge || formattedDate
                      ? {
                          type: "div",
                          props: {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              color: COLORS.meta,
                              fontSize: "18px",
                              fontWeight: 400,
                              fontFamily: "Inter",
                            },
                            children: [
                              show.badge
                                ? {
                                    type: "span",
                                    props: {
                                      style: {
                                        backgroundColor: COLORS.badge,
                                        color: COLORS.badgeText,
                                        fontSize: "14px",
                                        fontWeight: 700,
                                        fontFamily: "Inter",
                                        padding: "4px 12px",
                                        borderRadius: "999px",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.05em",
                                      },
                                      children: postType,
                                    },
                                  }
                                : null,
                              formattedDate
                                ? { type: "span", props: { children: formattedDate } }
                                : null,
                            ].filter(Boolean),
                          },
                        }
                      : null,
                    // Title
                    {
                      type: "div",
                      props: {
                        style: {
                          color: COLORS.title,
                          fontSize: "48px",
                          fontWeight: 700,
                          fontFamily: "Inter",
                          lineHeight: 1.2,
                          overflow: "hidden",
                        },
                        children: truncate(title, 120),
                      },
                    },
                    // Description (if available and not hidden)
                    show.description && description
                      ? {
                          type: "div",
                          props: {
                            style: {
                              color: COLORS.description,
                              fontSize: "22px",
                              fontWeight: 400,
                              fontFamily: "Inter",
                              lineHeight: 1.4,
                              overflow: "hidden",
                            },
                            children: truncate(description, 160),
                          },
                        }
                      : null,
                  ].filter(Boolean),
                },
              },
              // Right: avatar
              avatar
                ? {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        flexShrink: 0,
                      },
                      children: [
                        {
                          type: "img",
                          props: {
                            src: avatar,
                            width: 128,
                            height: 128,
                            style: {
                              borderRadius: "16px",
                              border: `2px solid ${COLORS.border}`,
                            },
                          },
                        },
                      ],
                    },
                  }
                : null,
            ].filter(Boolean),
          },
        },
        // Footer: site name
        show.siteName && siteName
          ? {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  padding: "0 64px 32px 64px",
                },
                children: [
                  {
                    type: "div",
                    props: {
                      style: {
                        color: "#8b949e",
                        fontSize: "18px",
                        fontWeight: 400,
                        fontFamily: "Inter",
                      },
                      children: siteName,
                    },
                  },
                ],
              },
            }
          : null,
      ].filter(Boolean),
    },
  };
}

function scanContentFiles(contentDir) {
  const files = [];
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === ".indiekit") continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }
  walk(contentDir);
  return files;
}

/**
 * Render one card to a PNG on disk.
 * @param {object} card - Satori element tree
 * @param {object[]} fonts - Loaded font descriptors
 * @param {string} outPath - Destination .png path
 */
async function renderCard(card, fonts, outPath) {
  const svg = await satori(card, { width: WIDTH, height: HEIGHT, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } });
  writeFileSync(outPath, resvg.render().asPng());
}

/**
 * Generate OG images for all content posts without photos.
 * @param {string} contentDir - Path to content/ directory
 * @param {object} config - Per-site card config: { siteName, description, accent, avatar, hide }
 * @param {string} cacheDir - Path to .cache/ directory
 * @param {number} batchSize - Max images to generate (0 = unlimited)
 * @returns {{ hasMore: boolean }} Whether more images need generation
 */
export async function generateOgImages(contentDir, cacheDir, config, batchSize = 0) {
  const ogDir = join(cacheDir, "og");
  mkdirSync(ogDir, { recursive: true });

  const manifestPath = join(ogDir, "manifest.json");
  let manifest = {};
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    // First run
  }

  const fonts = loadFonts();
  const card = resolveCard(config, contentDir);

  // The site's fallback card, used wherever a page has no OG image of its own.
  // Generated per site rather than shipped as a static asset, so a shared theme
  // never serves one deployment's artwork from another's pages.
  const defaultHash = computeHash(
    card.siteName || "",
    config.description || "",
    "",
    "Site",
    card.cardKey,
  );
  const defaultPath = join(ogDir, "default.png");
  if (manifest.__default__?.hash !== defaultHash || !existsSync(defaultPath)) {
    await renderCard(
      buildCard(
        card.siteName || config.description || "",
        card.siteName ? config.description || "" : "",
        "",
        "Site",
        // The fallback card has no post type and no date of its own, and the
        // site name is already its title — no need to repeat it in the footer.
        {
          ...card,
          show: { ...card.show, badge: false, date: false, siteName: false },
        },
      ),
      fonts,
      defaultPath,
    );
    manifest.__default__ = { title: "__default__", hash: defaultHash };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  const mdFiles = scanContentFiles(contentDir);

  let generated = 0;
  let skipped = 0;
  // Seed with existing manifest so unscanned entries survive batch writes
  const newManifest = { ...manifest };
  const SAVE_INTERVAL = 10;
  // GC every 5 images to keep WASM native memory bounded.
  const GC_INTERVAL = 5;
  const hasGC = typeof global.gc === "function";
  let peakRss = 0;

  for (const filePath of mdFiles) {
    const raw = readFileSync(filePath, "utf8");
    const { data: fm } = matter(raw);

    if (fm.photo || fm.image) {
      skipped++;
      continue;
    }

    const slug = toOgSlug(basename(filePath, ".md"));
    const postType = detectPostType(filePath);
    const date = fm.published || fm.date || "";

    // Title: use frontmatter title/name, or first paragraph of body.
    // Frontmatter is raw author input and bypasses extractFirstParagraph's
    // sanitize(), so strip pictographs here or a title opening with an emoji
    // renders a NO GLYPH box. Stripping before hashing keeps the cache honest.
    const fmTitle = stripPictographs(fm.title || fm.name || "");
    const bodyText = extractFirstParagraph(raw);
    const title = fmTitle || bodyText || "Untitled";

    // Description: only show if we have a frontmatter title (so body adds context)
    const description = fmTitle ? bodyText : "";

    const hash = computeHash(title, description, date, postType, card.cardKey);

    if (manifest[slug]?.hash === hash && existsSync(join(ogDir, `${slug}.png`))) {
      newManifest[slug] = manifest[slug];
      skipped++;
      continue;
    }

    await renderCard(
      buildCard(title, description, date, postType, card),
      fonts,
      join(ogDir, `${slug}.png`),
    );
    newManifest[slug] = { title: slug, hash };
    generated++;

    // Save manifest periodically to preserve progress on OOM kill
    if (generated % SAVE_INTERVAL === 0) {
      writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2));
    }

    // Force GC to reclaim Satori/Resvg WASM native memory.
    if (hasGC && generated % GC_INTERVAL === 0) {
      global.gc();
      const rss = process.memoryUsage().rss;
      if (rss > peakRss) peakRss = rss;
    }

    // Batch limit: stop after N images so the caller can re-spawn
    if (batchSize > 0 && generated >= batchSize) {
      break;
    }
  }

  const hasMore = batchSize > 0 && generated >= batchSize;

  if (hasGC) global.gc();
  writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2));
  const mem = process.memoryUsage();
  if (mem.rss > peakRss) peakRss = mem.rss;
  console.log(
    `[og] Generated ${generated} images, skipped ${skipped} (cached or have photos)` +
    (hasMore ? ` [batch, more remain]` : ``) +
    ` | RSS: ${(mem.rss / 1024 / 1024).toFixed(0)} MB, peak: ${(peakRss / 1024 / 1024).toFixed(0)} MB, heap: ${(mem.heapUsed / 1024 / 1024).toFixed(0)} MB`,
  );

  return { hasMore };
}

// Pure helpers exported for unit testing. Not part of the public runtime API
// (the runtime entry point is generateOgImages / lib/og-cli.js).
export {
  computeHash,
  mixWithWhite,
  buildPalette,
  resolveCard,
  detectPostType,
  formatDate,
  sanitize,
  stripPictographs,
  stripMarkdown,
  truncate,
  extractFirstParagraph,
};
