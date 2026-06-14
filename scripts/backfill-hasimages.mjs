/**
 * backfill-hasimages.mjs
 *
 * One-time backfill: adds `hasImages: true` to the frontmatter of existing
 * Markdown posts that contain an image. Safe to run repeatedly (idempotent).
 *
 * Usage:
 *   node scripts/backfill-hasimages.mjs <contentDir> [--dry-run]
 *
 * SAFETY: Does NOT re-serialize frontmatter via gray-matter / matter.stringify().
 * Instead it does a surgical string insertion so ISO date strings are never
 * parsed into JS Date objects (which would corrupt them when re-emitted as YAML
 * timestamps and crash the Nunjucks | date filter).
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

// ---------------------------------------------------------------------------
// Pure detection — mirrors detectHasImages() in indiekit-endpoint-micropub
// ---------------------------------------------------------------------------

/**
 * Detect whether a post carries an image.
 * - `data.photo` is non-empty (array with items, or truthy non-array)
 * - OR `content` contains a Markdown image `![...](...)` or an `<img` tag
 *
 * @param {object} data     - gray-matter `data` (frontmatter fields)
 * @param {string} [content] - gray-matter `content` (body text)
 * @returns {boolean}
 */
export function hasImage(data, content = "") {
  const { photo } = data;

  // Non-empty photo array or truthy non-array photo value
  if (Array.isArray(photo) ? photo.length > 0 : Boolean(photo)) {
    return true;
  }

  // Markdown image syntax or HTML <img tag (same regex as micropub endpoint)
  return /!\[[^\]]*\]\(|<img[\s>/]/i.test(content ?? "");
}

// ---------------------------------------------------------------------------
// Surgical insertion — never touches frontmatter via YAML serialization
// ---------------------------------------------------------------------------

/**
 * Surgically insert `hasImages: true` as the first key inside the frontmatter
 * block of a raw Markdown file. Returns the result and whether the file was
 * actually changed.
 *
 * Rules:
 * - If the file has no frontmatter (no leading `---`), return unchanged.
 * - If `hasImages:` already exists anywhere in the frontmatter block, return unchanged.
 * - Otherwise, insert `hasImages: true\n` immediately after the opening `---\n`
 *   (or `---\r\n` for CRLF files), leaving every other byte intact.
 *
 * @param {string} raw - Full raw file text
 * @returns {{ changed: boolean, text: string }}
 */
export function insertHasImages(raw) {
  // Detect line ending style from the first line
  const crlf = raw.startsWith("---\r\n");
  const lf = raw.startsWith("---\n");

  if (!crlf && !lf) {
    // No frontmatter block — skip
    return { changed: false, text: raw };
  }

  const nl = crlf ? "\r\n" : "\n";
  const openingFence = `---${nl}`;

  // Find the closing `---` fence to bound the frontmatter region
  const afterOpening = raw.slice(openingFence.length);
  const closingIdx = afterOpening.search(/^---(\r?\n|$)/m);

  if (closingIdx === -1) {
    // Malformed frontmatter — skip
    return { changed: false, text: raw };
  }

  const frontmatterBody = afterOpening.slice(0, closingIdx);

  // Idempotency check: already has a hasImages key?
  if (/^hasImages\s*:/m.test(frontmatterBody)) {
    return { changed: false, text: raw };
  }

  // Surgical insert: place the new line right after the opening ---
  const insertedLine = `hasImages: true${nl}`;
  const newText = openingFence + insertedLine + afterOpening;

  return { changed: true, text: newText };
}

// ---------------------------------------------------------------------------
// CLI entry point (guarded so importing for tests doesn't execute it)
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const contentDir = args.find((a) => !a.startsWith("--"));

  if (!contentDir) {
    console.error("Usage: node scripts/backfill-hasimages.mjs <contentDir> [--dry-run]");
    process.exit(1);
  }

  const absDir = path.resolve(contentDir);

  if (!fs.existsSync(absDir)) {
    console.error(`Content directory not found: ${absDir}`);
    process.exit(1);
  }

  // Recursively find all *.md files (Node 20+ fs.readdirSync recursive)
  const allEntries = fs.readdirSync(absDir, { recursive: true });
  const mdFiles = allEntries
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.join(absDir, entry));

  let total = 0;
  let flagged = 0;
  let skippedNoImage = 0;
  let skippedAlreadyFlagged = 0;
  let skippedNoFrontmatter = 0;

  for (const filePath of mdFiles) {
    total++;
    const raw = fs.readFileSync(filePath, "utf8");

    // Parse for detection only — we never write via gray-matter
    let parsed;
    try {
      parsed = matter(raw);
    } catch {
      // Unparseable frontmatter — treat as no image, skip
      skippedNoImage++;
      continue;
    }

    const { data, content } = parsed;

    if (!hasImage(data, content)) {
      skippedNoImage++;
      continue;
    }

    const { changed, text } = insertHasImages(raw);

    if (!changed) {
      // insertHasImages returns changed:false for no-frontmatter or already-flagged
      // Distinguish by checking data.hasImages
      if (data.hasImages !== undefined) {
        skippedAlreadyFlagged++;
      } else {
        skippedNoFrontmatter++;
      }
      continue;
    }

    flagged++;

    if (!dryRun) {
      fs.writeFileSync(filePath, text, "utf8");
      console.log(`  flagged: ${path.relative(absDir, filePath)}`);
    } else {
      console.log(`  would flag: ${path.relative(absDir, filePath)}`);
    }
  }

  console.log("");
  console.log(`${dryRun ? "[DRY RUN] " : ""}Backfill complete`);
  console.log(`  total files:          ${total}`);
  console.log(`  flagged:              ${flagged}`);
  console.log(`  skipped-no-image:     ${skippedNoImage}`);
  console.log(`  skipped-already-set:  ${skippedAlreadyFlagged}`);
  console.log(`  skipped-no-fm:        ${skippedNoFrontmatter}`);
}
