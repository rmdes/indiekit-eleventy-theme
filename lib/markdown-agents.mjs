import matter from "gray-matter";
import { dirname, resolve } from "node:path";

export const NOTES_RECENT = 25;
export const ENABLED_TYPES = ["articles", "notes"];

export function stripMarkdown(text) {
  return String(text || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")     // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, " $1")  // links -> text (leading space preserves word boundary)
    .replace(/<[^>]+>/g, "")                   // html tags
    .replace(/[#>*_`~[\]]/g, "")               // md tokens
    .replace(/\s+/g, " ")
    .trim();
}

function clip(text, max) {
  const clean = stripMarkdown(text);
  if (clean.length <= max) return clean;
  return clean.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

export function noteExcerpt(body, max = 80) {
  return clip(body, max);
}

export function sanitizeSummary(text, max = 160) {
  return clip(text, max);
}
