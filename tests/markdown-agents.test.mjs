import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stripMarkdown,
  noteExcerpt,
  sanitizeSummary,
  buildPostMarkdown,
  buildAboutMarkdown,
  buildHomeMarkdown,
  buildLlmsTxt,
  generateMarkdownForAgents,
} from "../lib/markdown-agents.mjs";

test("stripMarkdown removes links, images, md tokens, and html", () => {
  assert.equal(stripMarkdown("__Replied to[a post](http://x)__: hello #tag"), "Replied to a post: hello tag");
  assert.equal(stripMarkdown("![alt](img.png) text"), "text");
  assert.equal(stripMarkdown("<p>hi</p>  there"), "hi there");
});

test("noteExcerpt truncates on a word boundary with an ellipsis", () => {
  const out = noteExcerpt("one two three four five six seven eight nine ten eleven twelve", 20);
  assert.ok(out.length <= 21, `length ${out.length}`);
  assert.ok(out.endsWith("…"));
  assert.ok(!/\s$/.test(out.slice(0, -1)), "no trailing space before ellipsis");
});

test("noteExcerpt returns short clean text unchanged", () => {
  assert.equal(noteExcerpt("short note", 80), "short note");
});

test("sanitizeSummary collapses whitespace and newlines", () => {
  assert.equal(sanitizeSummary("a  b\nc"), "a b c");
});

test("sanitizeSummary truncates at the 160-char default with an ellipsis", () => {
  const input = "word ".repeat(60); // 300 chars, well over 160
  const out = sanitizeSummary(input);
  assert.ok(out.length <= 161, `length ${out.length}`);
  assert.ok(out.endsWith("…"));
});

const POST_ENV = {
  AUTHOR_NAME: "Ricardo Mendes", SITE_URL: "https://rmendes.net",
  MARKDOWN_AGENTS_AI_TRAIN: "yes", MARKDOWN_AGENTS_SEARCH: "yes", MARKDOWN_AGENTS_AI_INPUT: "yes",
};

test("buildPostMarkdown uses summary (not description) + AI-transparency fields", () => {
  const fm = {
    title: "The Brexit Bus", date: "2026-06-06T11:15:32.045+01:00",
    summary: "One day historians will look back.", category: ["Brexit", "Disinformation"],
    aiTextLevel: "1", aiTools: "ChatGPT", aiDescription: "Editorial assistance",
  };
  const out = buildPostMarkdown({
    fm, body: "Body text here.", type: "articles",
    htmlUrl: "https://rmendes.net/articles/2026/06/06/the-brexit-bus/", env: POST_ENV,
  });
  assert.match(out, /title: "The Brexit Bus"/);
  assert.match(out, /author: Ricardo Mendes/);
  assert.match(out, /url: https:\/\/rmendes\.net\/articles\/2026\/06\/06\/the-brexit-bus\//);
  assert.match(out, /categories:\n {2}- "Brexit"\n {2}- "Disinformation"/);
  assert.match(out, /description: "One day historians will look back\."/);
  assert.match(out, /ai_text_level: "1"/);
  assert.match(out, /ai_tools: "ChatGPT"/);
  assert.match(out, /ai_description: "Editorial assistance"/);
  assert.match(out, /content_signal: ai-train=yes, search=yes, ai-input=yes/);
  assert.match(out, /\n# The Brexit Bus\n\nBody text here\.\n$/);
});

test("buildPostMarkdown gives a titleless note an excerpt heading", () => {
  const out = buildPostMarkdown({
    fm: { date: "2016-01-27T22:00:00.000Z" },
    body: "nous sommes la meilleur partie", type: "notes",
    htmlUrl: "https://rmendes.net/notes/2016/01/27/x/", env: POST_ENV,
  });
  assert.match(out, /type: notes/);
  assert.match(out, /# nous sommes la meilleur partie/);
});

test("buildAboutMarkdown renders an h-card from env and links llms.txt", () => {
  const env = {
    SITE_URL: "https://rmendes.net", AUTHOR_NAME: "Ricardo Mendes",
    AUTHOR_TITLE: "Middleware Engineer", AUTHOR_LOCATION: "Brussels",
    AUTHOR_BIO: "Writer and DevOps.", GITHUB_USERNAME: "rmdes", BLUESKY_HANDLE: "rmendes.net",
  };
  const out = buildAboutMarkdown(env);
  assert.match(out, /# Ricardo Mendes/);
  assert.match(out, /Middleware Engineer/);
  assert.match(out, /Brussels/);
  assert.match(out, /## Elsewhere/);
  assert.match(out, /- \[GitHub\]\(https:\/\/github\.com\/rmdes\)/);
  assert.match(out, /- \[Bluesky\]\(https:\/\/bsky\.app\/profile\/rmendes\.net\)/);
  assert.match(out, /https:\/\/rmendes\.net\/llms\.txt/);
});

test("buildAboutMarkdown degrades gracefully with empty env (no 'undefined')", () => {
  const out = buildAboutMarkdown({});
  assert.doesNotMatch(out, /undefined/);
  assert.match(out, /# Blog Author/);
});

test("buildAboutMarkdown honors SITE_SOCIAL CSV-pipe list and skips malformed items", () => {
  const env = {
    SITE_URL: "https://rmendes.net", AUTHOR_NAME: "Ricardo Mendes",
    // well-formed pair, a malformed item missing its URL, and another well-formed pair
    SITE_SOCIAL: "GitHub|https://github.com/x|github,BrokenNoUrl,Mastodon|https://m.example/@x|mastodon",
  };
  let out;
  assert.doesNotThrow(() => { out = buildAboutMarkdown(env); });
  assert.match(out, /- \[GitHub\]\(https:\/\/github\.com\/x\)/);
  assert.match(out, /- \[Mastodon\]\(https:\/\/m\.example\/@x\)/);
  assert.doesNotMatch(out, /BrokenNoUrl/);
});

test("buildHomeMarkdown is thin: identity + section pointers + llms.txt", () => {
  const env = {
    SITE_URL: "https://rmendes.net", SITE_NAME: "A Node on the Web",
    SITE_DESCRIPTION: "Politics, tech, autonomy.", AUTHOR_NAME: "Ricardo Mendes",
  };
  const out = buildHomeMarkdown(env);
  assert.match(out, /# A Node on the Web/);
  assert.match(out, /> Politics, tech, autonomy\./);
  assert.match(out, /- \[Articles\]\(https:\/\/rmendes\.net\/articles\/\)/);
  assert.match(out, /https:\/\/rmendes\.net\/llms\.txt/);
});

const LLMS_ENV = {
  SITE_URL: "https://rmendes.net", SITE_NAME: "A Node on the Web",
  SITE_DESCRIPTION: "desc", AUTHOR_NAME: "Ricardo Mendes",
  MARKDOWN_AGENTS_AI_TRAIN: "yes", MARKDOWN_AGENTS_SEARCH: "yes", MARKDOWN_AGENTS_AI_INPUT: "yes",
};

test("buildLlmsTxt: articles newest-first w/ summary; notes capped w/ disclosure", () => {
  const entries = [
    { type: "articles", title: "Old", mdUrl: "https://rmendes.net/a/old.md", summary: "s1", date: "2025-01-01" },
    { type: "articles", title: "New", mdUrl: "https://rmendes.net/a/new.md", summary: "s2", date: "2026-01-01" },
  ];
  for (let i = 0; i < 30; i++) {
    const d = `2026-01-${String(i + 1).padStart(2, "0")}`;
    entries.push({ type: "notes", title: `${d} — n${i}`, mdUrl: `https://rmendes.net/n/${i}.md`, summary: "", date: d });
  }
  const out = buildLlmsTxt({ entries, env: LLMS_ENV });
  assert.match(out, /# A Node on the Web/);
  assert.match(out, /ai-train=yes, search=yes, ai-input=yes/);
  assert.ok(out.indexOf("[New]") < out.indexOf("[Old]"), "newest article first");
  assert.match(out, /- \[New\]\(https:\/\/rmendes\.net\/a\/new\.md\): s2/);
  assert.match(out, /Showing 25 most recent of 30/);
  const noteLines = out.split("\n").filter((l) => /\/n\/\d+\.md/.test(l));
  assert.equal(noteLines.length, 25);
  assert.match(out, /- \[About Ricardo Mendes\]\(https:\/\/rmendes\.net\/about\.md\)/);
});

test("buildLlmsTxt empty-state still emits header and More", () => {
  const out = buildLlmsTxt({ entries: [], env: LLMS_ENV });
  assert.match(out, /# A Node on the Web/);
  assert.match(out, /## More/);
});

test("generateMarkdownForAgents writes .md per matching result + twins + llms.txt", () => {
  const writes = {};
  const io = {
    readFileSync: (p) => {
      if (p.includes("brexit")) return "---\ntitle: Brexit\ndate: 2026-06-06\nsummary: S\n---\nBody";
      if (p.includes("note1")) return "---\ndate: 2016-01-27\n---\nnote body text";
      throw new Error("nofile");
    },
    writeFileSync: (p, c) => { writes[p.replace(/\\/g, "/")] = c; },
    mkdirSync: () => {},
  };
  const results = [
    { url: "/articles/2026/06/06/brexit/", inputPath: "/x/content/articles/2026-06-06-brexit.md", outputPath: "/out/articles/2026/06/06/brexit/index.html" },
    { url: "/notes/2016/01/27/note1/", inputPath: "/x/content/notes/2016-01-27-note1.md", outputPath: "/out/notes/2016/01/27/note1/index.html" },
    { url: "/articles/", inputPath: "/x/articles.njk", outputPath: "/out/articles/index.html" },
    { url: "/bookmarks/2020/01/01/b/", inputPath: "/x/content/bookmarks/b.md", outputPath: "/out/bookmarks/2020/01/01/b/index.html" },
  ];
  const env = { SITE_URL: "https://rmendes.net", AUTHOR_NAME: "RM" };
  const res = generateMarkdownForAgents({ results, outputDir: "/out", env, io });

  assert.equal(res.mdCount, 2, "only article + note, not index/bookmark");
  assert.ok(writes["/out/articles/2026/06/06/brexit/index.md"]);
  assert.ok(writes["/out/notes/2016/01/27/note1/index.md"]);
  assert.ok(writes["/out/about/index.md"]);
  assert.ok(writes["/out/index.md"]);
  const llms = writes["/out/llms.txt"];
  assert.ok(llms.includes("## Articles") && llms.includes("[Brexit]"));
  assert.ok(llms.includes("2016-01-27 — note body text"), "note entry = date — excerpt");

  // Subset invariant (spec §8): only articles/notes get twins + llms entries
  assert.ok(!writes["/out/bookmarks/2020/01/01/b/index.md"], "bookmarks must not get a .md");
  assert.ok(!llms.includes("/bookmarks/"), "bookmarks must not appear in llms.txt");
  assert.ok(!writes["/out/articles/index.md"], "paginated /articles/ index must not get a .md");
});
