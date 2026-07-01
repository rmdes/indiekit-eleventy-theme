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

function socialLinks(env) {
  if (env.SITE_SOCIAL) {
    return env.SITE_SOCIAL.split(",").map((item) => {
      const [name, url] = item.split("|").map((s) => (s || "").trim());
      return name && url ? { name, url } : null;
    }).filter(Boolean);
  }
  const links = [];
  if (env.GITHUB_USERNAME) links.push({ name: "GitHub", url: `https://github.com/${env.GITHUB_USERNAME}` });
  if (env.BLUESKY_HANDLE) links.push({ name: "Bluesky", url: `https://bsky.app/profile/${env.BLUESKY_HANDLE}` });
  if (env.MASTODON_INSTANCE && env.MASTODON_USER) {
    const inst = env.MASTODON_INSTANCE.replace(/^https?:\/\//, "");
    links.push({ name: "Mastodon", url: `https://${inst}/@${env.MASTODON_USER}` });
  }
  if (env.LINKEDIN_USERNAME) links.push({ name: "LinkedIn", url: `https://linkedin.com/in/${env.LINKEDIN_USERNAME}` });
  return links;
}

export function buildAboutMarkdown(env) {
  const site = env.SITE_URL || "https://example.com";
  const name = env.AUTHOR_NAME || "Blog Author";
  const lines = [
    "---",
    `title: "About ${q(name)}"`,
    `url: ${site}/about/`,
    "type: profile",
    `content_signal: ${contentSignalLine(env)}`,
    "---",
    "",
    `# ${name}`,
  ];
  if (env.AUTHOR_TITLE) lines.push("", env.AUTHOR_TITLE);
  if (env.AUTHOR_LOCATION) lines.push("", env.AUTHOR_LOCATION);
  if (env.AUTHOR_BIO) lines.push("", env.AUTHOR_BIO);
  const links = socialLinks(env);
  if (links.length) {
    lines.push("", "## Elsewhere");
    for (const l of links) lines.push(`- [${l.name}](${l.url})`);
  }
  lines.push(
    "", "## About this site",
    "This site is powered by [Indiekit](https://getindiekit.com), an IndieWeb server.",
    `Full machine-readable index: ${site}/llms.txt`,
    "",
  );
  return lines.join("\n");
}

export function buildHomeMarkdown(env) {
  const site = env.SITE_URL || "https://example.com";
  const name = env.SITE_NAME || env.AUTHOR_NAME || "Blog";
  const lines = [
    "---",
    `title: "${q(name)}"`,
    `url: ${site}/`,
    `content_signal: ${contentSignalLine(env)}`,
    "---",
    "",
    `# ${name}`,
  ];
  if (env.SITE_DESCRIPTION) lines.push("", `> ${env.SITE_DESCRIPTION}`);
  if (env.AUTHOR_NAME) {
    const bits = [env.AUTHOR_NAME, env.AUTHOR_TITLE].filter(Boolean).join(" — ");
    lines.push("", `${bits}.`);
  }
  lines.push(
    "", "## Sections",
    `- [Articles](${site}/articles/)`,
    `- [Notes](${site}/notes/)`,
    `- [About](${site}/about/)`,
    "",
    `Full machine-readable index: ${site}/llms.txt`,
    "",
  );
  return lines.join("\n");
}

export function buildLlmsTxt({ entries, env }) {
  const site = env.SITE_URL || "https://example.com";
  const name = env.SITE_NAME || env.AUTHOR_NAME || "Blog";
  const author = env.AUTHOR_NAME || "the author";
  const byDateDesc = (a, b) => String(b.date).localeCompare(String(a.date));
  const articles = entries.filter((e) => e.type === "articles").sort(byDateDesc);
  const notes = entries.filter((e) => e.type === "notes").sort(byDateDesc);
  const lines = [
    `# ${name}`, "",
    `> ${env.SITE_DESCRIPTION || ""}`, "",
    "Articles and notes below are available as clean Markdown for language models and agents: "
      + "follow a link directly, append `.md` to any article/note URL, or send `Accept: text/markdown`. "
      + "The homepage and About page also serve Markdown via the same header. Other content "
      + "(bookmarks, likes, reposts, replies, photos) is HTML-only. "
      + `AI usage signals for this content: ${contentSignalLine(env)}.`,
    "", "## Articles", "",
  ];
  for (const e of articles) {
    lines.push(e.summary ? `- [${e.title}](${e.mdUrl}): ${e.summary}` : `- [${e.title}](${e.mdUrl})`);
  }
  lines.push("", "## Notes", "",
    `_Showing ${Math.min(NOTES_RECENT, notes.length)} most recent of ${notes.length}; all notes are at ${site}/notes/_`,
    "");
  for (const e of notes.slice(0, NOTES_RECENT)) lines.push(`- [${e.title}](${e.mdUrl})`);
  lines.push(
    "", "## More", "",
    `- [About ${author}](${site}/about.md)`,
    `- [All articles](${site}/articles/)`,
    `- [All notes](${site}/notes/)`,
    `- [Pages](${site}/slashes/)`,
    "",
  );
  return lines.join("\n");
}
