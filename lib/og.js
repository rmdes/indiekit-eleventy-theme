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
const DESIGN_VERSION = 3;

const COLORS = {
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

let avatarDataUri = null;

function loadAvatar() {
  if (avatarDataUri) return avatarDataUri;
  const avatarPath = resolve(__dirname, "..", "images", "rick.jpg");
  if (existsSync(avatarPath)) {
    const buf = readFileSync(avatarPath);
    avatarDataUri = `data:image/jpeg;base64,${buf.toString("base64")}`;
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

function computeHash(title, description, date, postType, siteName) {
  return createHash("md5")
    .update(`v${DESIGN_VERSION}|${title}|${description}|${date}|${postType}|${siteName}`)
    .digest("hex")
    .slice(0, 12);
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
 */
function sanitize(text) {
  if (!text) return "";
  return text.replace(/[^\x20-\x7E\u00A0-\u024F\u2010-\u2027\u2030-\u205E]/g, "").trim();
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

function buildCard(title, description, dateStr, postType, siteName) {
  const avatar = loadAvatar();
  const formattedDate = formatDate(dateStr);

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
                    // Post type badge + date inline
                    {
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
                          {
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
                          },
                          formattedDate
                            ? { type: "span", props: { children: formattedDate } }
                            : null,
                        ].filter(Boolean),
                      },
                    },
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
                    // Description (if available)
                    description
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
        {
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
        },
      ],
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
 * Generate OG images for all content posts without photos.
 * @param {string} contentDir - Path to content/ directory
 * @param {string} cacheDir - Path to .cache/ directory
 * @param {string} siteName - Site name for the card
 * @param {number} batchSize - Max images to generate (0 = unlimited)
 * @returns {{ hasMore: boolean }} Whether more images need generation
 */
export async function generateOgImages(contentDir, cacheDir, siteName, batchSize = 0) {
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

    // Title: use frontmatter title/name, or first paragraph of body
    const fmTitle = fm.title || fm.name || "";
    const bodyText = extractFirstParagraph(raw);
    const title = fmTitle || bodyText || "Untitled";

    // Description: only show if we have a frontmatter title (so body adds context)
    const description = fmTitle ? bodyText : "";

    const hash = computeHash(title, description, date, postType, siteName);

    if (manifest[slug]?.hash === hash && existsSync(join(ogDir, `${slug}.png`))) {
      newManifest[slug] = manifest[slug];
      skipped++;
      continue;
    }

    const card = buildCard(title, description, date, postType, siteName);
    const svg = await satori(card, { width: WIDTH, height: HEIGHT, fonts });
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: WIDTH },
    });
    const pngBuffer = resvg.render().asPng();

    writeFileSync(join(ogDir, `${slug}.png`), pngBuffer);
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
  detectPostType,
  formatDate,
  sanitize,
  stripMarkdown,
  truncate,
  extractFirstParagraph,
};
