import { test } from "node:test";
import assert from "node:assert/strict";
import { stripMarkdown, noteExcerpt, sanitizeSummary } from "../lib/markdown-agents.mjs";
import { buildPostMarkdown } from "../lib/markdown-agents.mjs";

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
  assert.match(out, /categories:\n {2}- Brexit\n {2}- Disinformation/);
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
