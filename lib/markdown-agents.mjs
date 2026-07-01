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

function contentSignalLine(env) {
  const t = env.MARKDOWN_AGENTS_AI_TRAIN || "yes";
  const s = env.MARKDOWN_AGENTS_SEARCH || "yes";
  const i = env.MARKDOWN_AGENTS_AI_INPUT || "yes";
  return `ai-train=${t}, search=${s}, ai-input=${i}`;
}

const q = (v) => String(v).replace(/"/g, '\\"');

export function buildPostMarkdown({ fm, body, type, htmlUrl, env }) {
  const trimmed = String(body || "").trim();
  const tokens = Math.ceil(trimmed.length / 4);
  const heading = fm.title || noteExcerpt(body) || "";
  const date = fm.date ? new Date(fm.date).toISOString() : (fm.published || "");
  const summary = fm.summary || fm.description || "";
  const lines = [
    "---",
    `title: "${q(heading)}"`,
    `date: ${date}`,
    `author: ${env.AUTHOR_NAME || "Blog Author"}`,
    `url: ${htmlUrl}`,
    `type: ${type}`,
  ];
  if (Array.isArray(fm.category) && fm.category.length) {
    lines.push("categories:");
    for (const cat of fm.category) lines.push(`  - ${cat}`);
  }
  if (summary) lines.push(`description: "${q(summary)}"`);
  if (fm.aiTextLevel != null && fm.aiTextLevel !== "") lines.push(`ai_text_level: "${q(fm.aiTextLevel)}"`);
  if (fm.aiTools) lines.push(`ai_tools: "${q(fm.aiTools)}"`);
  if (fm.aiDescription) lines.push(`ai_description: "${q(fm.aiDescription)}"`);
  lines.push(`tokens: ${tokens}`);
  lines.push(`content_signal: ${contentSignalLine(env)}`);
  lines.push("---");
  return lines.join("\n") + "\n\n# " + heading + "\n\n" + trimmed + "\n";
}
