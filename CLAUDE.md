# CLAUDE.md - Indiekit Eleventy Theme

This file provides guidance to Claude Code when working with the Indiekit Eleventy theme.

## Project Overview

This is a comprehensive Eleventy theme designed for IndieWeb-powered personal websites using Indiekit. It renders Micropub posts (articles, notes, photos, bookmarks, likes, replies, reposts), integrates with Indiekit endpoint plugins for enhanced functionality (CV, homepage builder, GitHub, Funkwhale, Last.fm, YouTube, RSS, Microsub, etc.), and includes full webmention support.

**Live Site:** https://rmendes.net
**Used as Git submodule in:**
- `/home/rick/code/indiekit-dev/indiekit-cloudron` (Cloudron deployment)
- `/home/rick/code/indiekit-dev/indiekit-deploy` (Docker Compose deployment)

## CRITICAL: Submodule Workflow

**This repo is used as a Git submodule.** After ANY changes:

1. **Edit, commit, and push** this repo (indiekit-eleventy-theme)
2. **Update submodule pointer** in parent repo(s):

```bash
cd /home/rick/code/indiekit-dev/indiekit-cloudron
git submodule update --remote eleventy-site
git add eleventy-site
git commit -m "chore: update eleventy-site submodule"
git push origin main
```

3. **Redeploy:**

```bash
cd /home/rick/code/indiekit-dev/indiekit-cloudron
make prepare  # REQUIRED — copies .rmendes files to non-suffixed versions
cloudron build --no-cache && cloudron update --app rmendes.net --no-backup
```

**Common mistake:** Editing files in `indiekit-cloudron/eleventy-site/` instead of this repo. Those changes are ephemeral — always edit here.

## CRITICAL: Indiekit Date Handling Convention

**All dates MUST be stored and passed as ISO 8601 strings.** This is the universal pattern across Indiekit and ALL `@rmdes/*` plugins.

### The Rule

- **Storage (MongoDB):** Store dates as ISO strings (`new Date().toISOString()`), NEVER as JavaScript `Date` objects
- **Controllers:** Pass date strings through to templates unchanged — NO conversion helpers, NO `formatDate()` wrappers
- **Templates:** Use the `| date` Nunjucks filter for display formatting (e.g., `{{ value | date("PPp") }}`)
- **Template guards:** Always wrap `| date` in `{% if value %}` to protect against null/undefined

### Why This Matters

The Nunjucks `| date` filter is `@indiekit/util`'s `formatDate()`, which calls `date-fns parseISO(string)`. It ONLY accepts ISO 8601 strings:

- `Date` objects → `dateString.split is not a function` (CRASH)
- `null` / `undefined` → `Cannot read properties of undefined (reading 'match')` (CRASH)
- Pre-formatted strings (e.g., "8 Feb 2025") → Invalid Date (WRONG OUTPUT)
- ISO strings (e.g., `"2025-02-08T14:30:00.000Z"`) → Correctly formatted (WORKS)

### Correct Pattern

```javascript
// _data file - store/return ISO strings
export default async function () {
  const data = await fetch(...);
  return {
    lastSync: new Date().toISOString(),  // ← ISO string
    items: data.map(item => ({
      published: item.published || null,  // ← already ISO string from API
    }))
  };
}
```

```nunjucks
{# Template - use | date filter, guard for null #}
{% if lastSync %}
  {{ lastSync | date("PPp") }}
{% endif %}
```

## Architecture

### Data Flow: Plugin → JSON → _data → Template

```
Indiekit Plugin (backend)
  → writes JSON to content/.indiekit/*.json
  → _data/*.js reads JSON file
  → Nunjucks template renders data
```

**Example:** CV plugin flow

1. `@rmdes/indiekit-endpoint-cv` writes `content/.indiekit/cv.json`
2. `_data/cv.js` reads the JSON file and exports the data
3. `cv.njk` and `_includes/components/sections/cv-*.njk` render the data
4. Homepage builder can include CV sections via `homepageConfig.sections`

### Key Files by Function

#### Core Configuration

| File | Purpose |
|------|---------|
| `eleventy.config.js` | Eleventy configuration, plugins, filters, collections, post-build hooks |
| `tailwind.config.js` | Tailwind CSS configuration (colors, typography) |
| `postcss.config.js` | PostCSS pipeline (Tailwind, autoprefixer) |
| `package.json` | Dependencies, scripts (`build`, `dev`, `build:css`) |

#### Data Files (_data/)

All `_data/*.js` files are ESM modules that export functions returning data objects. Most fetch from Indiekit plugin JSON files or external APIs.

| File | Data Source | Purpose |
|------|-------------|---------|
| `site.js` | Environment variables | Site config (name, URL, author, social links) |
| `cv.js` | `content/.indiekit/cv.json` | CV data from `@rmdes/indiekit-endpoint-cv` |
| `homepageConfig.js` | `content/.indiekit/homepage.json` | Homepage layout from `@rmdes/indiekit-endpoint-homepage` |
| `enabledPostTypes.js` | `content/.indiekit/post-types.json` or env | List of enabled post types for navigation |
| `urlAliases.js` | `content/.indiekit/url-aliases.json` | Legacy URL mappings for webmentions |
| `blogrollStatus.js` | Indiekit `/blogrollapi/api/status` | Checks if blogroll plugin is available |
| `podrollStatus.js` | Indiekit `/podroll/api/status` | Checks if podroll plugin is available |
| `githubActivity.js` | Indiekit `/githubapi/api/*` or GitHub API | GitHub commits, stars, featured repos |
| `githubRepos.js` | GitHub API | Starred repositories for sidebar |
| `funkwhaleActivity.js` | Indiekit Funkwhale plugin API | Listening activity |
| `lastfmActivity.js` | Indiekit Last.fm plugin API | Scrobbles, loved tracks |
| `newsActivity.js` | Indiekit IndieNews plugin API | Submitted IndieNews posts |
| `youtubeChannel.js` | YouTube Data API v3 | Channel info, latest videos, live status |
| `blueskyFeed.js` | Bluesky AT Protocol API | Recent Bluesky posts for sidebar |
| `mastodonFeed.js` | Mastodon API | Recent Mastodon posts for sidebar |

**Data Source Pattern:**

Most plugin-dependent data files:
1. Try to fetch from Indiekit plugin API first
2. Fall back to direct API (if credentials available)
3. Return `{ source: "indiekit" | "api" | "error", ...data }`
4. Templates check `source` to conditionally display

#### Layouts (_includes/layouts/)

| File | Used By | Features |
|------|---------|----------|
| `base.njk` | All pages | Base HTML shell with header, footer, nav, meta tags |
| `home.njk` | Homepage | Two-tier fallback: plugin-driven (homepage builder) or default (hero + recent posts) |
| `post.njk` | Individual posts | h-entry microformat, Bridgy syndication, webmentions, reply context, photo gallery |
| `page.njk` | Static pages | Simple content wrapper, no post metadata |

#### Components (_includes/components/)

| Component | Purpose |
|-----------|---------|
| `homepage-builder.njk` | Renders plugin-configured homepage layout (single/two-column, sections, sidebar) |
| `homepage-section.njk` | Router for section types (hero, cv-*, custom-html, recent-posts) |
| `homepage-sidebar.njk` | Renders plugin-configured sidebar widgets |
| `homepage-footer.njk` | Optional homepage footer with admin link |
| `sidebar.njk` | Default sidebar (author card, social activity, GitHub, Funkwhale, blogroll, categories) |
| `blog-sidebar.njk` | Sidebar for blog/post pages (recent posts, categories) |
| `h-card.njk` | Microformat2 h-card for author identity |
| `reply-context.njk` | Displays reply-to/like-of/repost-of/bookmark-of context with h-cite |
| `webmentions.njk` | Renders likes, reposts, replies from webmention.io + conversations API, with threaded owner replies |
| `empty-collection.njk` | Fallback message when a post type collection is empty |

#### Sections (_includes/components/sections/)

Homepage builder sections:

| Section | Config Type | Purpose |
|---------|-------------|---------|
| `hero.njk` | `hero` | Full-width hero with avatar, name, bio, social links |
| `recent-posts.njk` | `recent-posts` | Recent posts grid (configurable maxItems, postTypes filter) |
| `cv-experience.njk` | `cv-experience` | Work experience timeline from CV data |
| `cv-skills.njk` | `cv-skills` | Skills with proficiency bars from CV data |
| `cv-education.njk` | `cv-education` | Education history from CV data |
| `cv-projects.njk` | `cv-projects` | Featured projects from CV data |
| `cv-interests.njk` | `cv-interests` | Personal interests from CV data |
| `custom-html.njk` | `custom-html` | Arbitrary HTML content (from admin UI) |

#### Widgets (_includes/components/widgets/)

Sidebar widgets:

| Widget | Data Source | Purpose |
|--------|-------------|---------|
| `author-card.njk` | `site.author` | h-card with avatar, bio, social links |
| `social-activity.njk` | `blueskyFeed`, `mastodonFeed` | Recent posts from Bluesky/Mastodon |
| `github-repos.njk` | `githubActivity`, `githubRepos` | Featured repos, recent commits |
| `funkwhale.njk` | `funkwhaleActivity` | Now playing, listening stats |
| `recent-posts.njk` | `collections.posts` | Recent posts list (for non-blog pages) |
| `blogroll.njk` | Blogroll API | Recently updated blogs from OPML/Microsub |
| `categories.njk` | `collections.categories` | Category list with post counts |

#### Top-Level Templates (*.njk)

Page templates in the root directory:

| Template | Permalink | Purpose |
|----------|-----------|---------|
| `index.njk` | `/` | Homepage (uses `home.njk` layout) |
| `about.njk` | `/about/` | About page with full h-card |
| `cv.njk` | `/cv/` | CV page with all sections |
| `blog.njk` | `/blog/` | All posts chronologically |
| `articles.njk` | `/articles/` | Articles collection |
| `notes.njk` | `/notes/` | Notes collection |
| `photos.njk` | `/photos/` | Photos collection |
| `bookmarks.njk` | `/bookmarks/` | Bookmarks collection |
| `likes.njk` | `/likes/` | Likes collection |
| `replies.njk` | `/replies/` | Replies collection |
| `reposts.njk` | `/reposts/` | Reposts collection |
| `interactions.njk` | `/interactions/` | Combined social interactions |
| `slashes.njk` | `/slashes/` | Index of all slash pages |
| `categories.njk` | `/categories/:slug/` | Posts by category (pagination template) |
| `categories-index.njk` | `/categories/` | All categories index |
| `github.njk` | `/github/` | GitHub activity page |
| `funkwhale.njk` | `/funkwhale/` | Funkwhale listening page |
| `listening.njk` | `/listening/` | Last.fm listening page |
| `youtube.njk` | `/youtube/` | YouTube channel page |
| `blogroll.njk` | `/blogroll/` | Blogroll page (client-side data fetch) |
| `podroll.njk` | `/podroll/` | Podroll (podcast episodes) page |
| `news.njk` | `/news/` | IndieNews submissions page |
| `search.njk` | `/search/` | Pagefind search UI |
| `feed.njk` | `/feed.xml` | RSS 2.0 feed |
| `feed-json.njk` | `/feed.json` | JSON Feed 1.1 |
| `404.njk` | `/404.html` | 404 error page |
| `changelog.njk` | `/changelog/` | Site changelog |
| `webmention-debug.njk` | `/webmention-debug/` | Debug page for webmentions |

### Eleventy Configuration Highlights

#### Collections

| Collection | Glob Pattern | Purpose |
|------------|--------------|---------|
| `posts` | `content/**/*.md` | All content combined |
| `articles` | `content/articles/**/*.md` | Long-form posts |
| `notes` | `content/notes/**/*.md` | Short status updates |
| `photos` | `content/photos/**/*.md` | Photo posts |
| `bookmarks` | `content/bookmarks/**/*.md` | Saved links |
| `likes` | `content/likes/**/*.md` | Liked posts |
| `replies` | Filtered by `inReplyTo` property | Reply posts |
| `reposts` | Filtered by `repostOf` property | Repost posts |
| `pages` | `content/*.md` + `content/pages/*.md` | Slash pages (/about, /now, /uses, etc.) |
| `feed` | `content/**/*.md` (first 20) | Homepage/RSS feed |
| `categories` | Deduplicated from all posts | Category list |

**Note:** `replies` and `reposts` collections are dynamically filtered by property, not by directory. Supports both camelCase (`inReplyTo`, `repostOf`) and underscore (`in_reply_to`, `repost_of`) naming.

#### Custom Filters

| Filter | Purpose | Usage |
|--------|---------|-------|
| `dateDisplay` | Format date as "January 1, 2025" | `{{ date \| dateDisplay }}` |
| `isoDate` | Convert to ISO 8601 string | `{{ date \| isoDate }}` |
| `date` | Format date with custom format | `{{ date \| date("MMM d, yyyy") }}` |
| `truncate` | Truncate string to max length | `{{ text \| truncate(200) }}` |
| `ogDescription` | Strip HTML, decode entities, truncate | `{{ content \| ogDescription(200) }}` |
| `extractFirstImage` | Extract first `<img src>` from content | `{{ content \| extractFirstImage }}` |
| `obfuscateEmail` | Convert email to HTML entities | `{{ email \| obfuscateEmail }}` |
| `head` | Get first N items from array | `{{ array \| head(5) }}` |
| `slugify` | Convert string to slug | `{{ name \| slugify }}` |
| `hash` | MD5 hash of file for cache busting | `{{ '/css/style.css' \| hash }}` |
| `timestamp` | Current Unix timestamp | `{{ '' \| timestamp }}` |
| `webmentionsForUrl` | Filter webmentions by URL + aliases | `{{ webmentions \| webmentionsForUrl(page.url, urlAliases) }}` |
| `webmentionsByType` | Filter by type (likes, reposts, replies) | `{{ mentions \| webmentionsByType('likes') }}` |
| `jsonEncode` | JSON.stringify for JSON feed | `{{ value \| jsonEncode }}` |
| `dateToRfc822` | RFC 2822 format for RSS | `{{ date \| dateToRfc822 }}` |

#### Plugins

| Plugin | Purpose |
|--------|---------|
| `@11ty/eleventy-plugin-rss` | RSS feed filters (dateToRfc2822, absoluteUrl) |
| `@11ty/eleventy-plugin-syntaxhighlight` | Syntax highlighting for code blocks |
| `@11ty/eleventy-img` | Automatic image optimization (webp, lazy loading) |
| `eleventy-plugin-embed-everything` | Auto-embed YouTube, Vimeo, Mastodon, Bluesky, Spotify |
| `@chrisburnell/eleventy-cache-webmentions` | Build-time webmention caching |
| `@quasibit/eleventy-plugin-sitemap` | Sitemap generation |
| `html-minifier-terser` | HTML minification (production only) |
| `pagefind` | Search indexing (post-build via eleventy.after hook) |

#### Transforms

| Transform | Purpose |
|-----------|---------|
| `youtube-link-to-embed` | Converts YouTube links to embeds |
| `htmlmin` | Minifies HTML (build mode only, not watch mode) |
| `eleventyImageTransformPlugin` | Optimizes `<img>` tags |

#### Pre-Build Hook: OG Image Generation (`eleventy.before`)

Generates OpenGraph images for posts without photos using Satori (Yoga WASM → SVG) + Resvg (Rust WASM → PNG).

**Key files:**
- `lib/og.js` — generation logic, card layout, manifest-based caching
- `lib/og-cli.js` — CLI wrapper, accepts `batchSize` argument
- `eleventy.config.js` — spawns og-cli with batch loop

**Architecture:** Runs as a separate process (`execFileSync`) to isolate WASM native memory from Eleventy. Uses **batch spawning** — each invocation generates up to 100 images, then exits with code 2 ("more remain"). The spawner re-loops until exit code 0. This keeps peak RSS at ~460 MB per batch regardless of total image count.

**Why batch spawning:** Satori and Resvg allocate native memory outside V8's heap. `--max-old-space-size` only limits V8 — WASM native allocations are invisible to it. Without batching, 2,350+ images grow native memory to ~3 GB, OOM-killing the process in the 3 GB container. Batching fully releases native memory between invocations.

**Caching:** Manifest at `.cache/og/manifest.json` maps slug → content hash. Only changed/new posts generate images. Manifest saved every 10 images for crash resilience.

#### Post-Build Hooks (`eleventy.after`)

1. **Pagefind indexing** — indexes all HTML files for search
2. **WebSub hub notification** — notifies subscribers of feed updates (/, /feed.xml, /feed.json)

### IndieWeb Features

#### Microformats2

- **h-card** (author identity): Name, photo, bio, location, social links with `rel="me"`
- **h-entry** (post markup): All post types properly marked up
- **h-feed** (feed markup): Machine-readable post lists
- **h-cite** (reply context): Cites external content in replies/likes/reposts

#### Webmentions & Interactions

- Build-time caching via `@chrisburnell/eleventy-cache-webmentions`
- Client-side real-time fetching via `/js/webmentions.js` from three APIs:
  - `/webmentions/api/mentions` — IndieWeb webmentions (webmention.io)
  - `/conversations/api/mentions` — Mastodon/Bluesky/AP interactions (conversations plugin)
  - `/comments/api/comments` — Native authenticated comments (comments plugin)
- Displays likes, reposts, replies with avatars and platform badges
- **Owner reply threading** — owner replies appear nested under parent interactions with amber Author badge
- Send webmention form on every post
- Legacy URL support via `urlAliases` (for micro.blog and old blog URLs)

#### Reply-to-Interactions Architecture

The conversations API enriches its response with owner replies (`is_owner: true`, `parent_url`). The frontend's `threadOwnerReplies()` function matches `parent_url` to reply `<li>` elements via `data-wm-url` attributes and inserts threaded reply cards into `wm-owner-reply-slot` divs.

Reply routing is provenance-aware, using a two-level mapping:

1. **`replyTargets`** (from `GET /comments/api/is-owner`) maps detected platform → syndicator `service.name`
2. **`syndicationTargets`** (same endpoint) maps `service.name` → syndicator UID

The mapping is configurable via the comments plugin `replyTargets` option. Default routes mastodon/activitypub via the AP syndicator (self-hosted), bluesky via the Bluesky syndicator. Users without a self-hosted AP server can override to route mastodon → external Mastodon account.

Build-time reply buttons get a `data-platform` from URL heuristics as fallback. At runtime, `enrichBuildTimeBadges()` upgrades to NodeInfo-resolved platform from the conversations API.

Reply paths:
- **Fediverse replies (mastodon/activitypub)** — `POST /micropub` with `mp-syndicate-to` for the AP syndicator (configurable via `replyTargets`)
- **Bluesky replies** — `POST /micropub` with `mp-syndicate-to` for the Bluesky syndicator
- **IndieWeb webmention replies** — `POST /micropub` without `mp-syndicate-to` (webmention sent automatically)
- **Native comment replies** — `POST /comments/api/reply` (stored in comments collection)

#### IndieAuth

- `rel="me"` links in `<head>` for identity verification
- Bluesky uses `rel="me atproto"` for AT Protocol verification
- Fediverse creator meta tag for Mastodon verification

#### Micropub Endpoints

Base layout includes `<link>` tags pointing to Indiekit endpoints:

```html
<link rel="authorization_endpoint" href="{{ site.url }}/auth">
<link rel="token_endpoint" href="{{ site.url }}/auth/token">
<link rel="micropub" href="{{ site.url }}/micropub">
<link rel="microsub" href="{{ site.url }}/microsub">
```

#### Bridgy Syndication

Posts include hidden Bridgy syndication content in `post.njk`:

```nunjucks
<p class="p-summary e-bridgy-mastodon-content e-bridgy-bluesky-content hidden">
  {# Interaction posts include emoji + target URL #}
  🔖 {{ bookmarkedUrl }} - {{ description }}
</p>
```

Bridgy reads this content when syndicating to Bluesky/Mastodon. Interaction types (bookmarks, likes, replies, reposts) include emoji prefix and target URL.

## Code Style

### TypeScript/JavaScript

- **ESM modules:** `"type": "module"` in package.json
- **Async data files:** `export default async function () { ... }`
- **Data source pattern:** Return `{ source: "indiekit" | "api" | "error", ...data }`
- **Date handling:** Always use ISO 8601 strings (`new Date().toISOString()`)

### Nunjucks Templates

- **Property name compatibility:** Support both camelCase and underscore names:

```nunjucks
{% set bookmarkedUrl = bookmarkOf or bookmark_of %}
{% set replyTo = inReplyTo or in_reply_to %}
```

- **Date filter guards:** Always check for null/undefined:

```nunjucks
{% if published %}
  {{ published | date("PPp") }}
{% endif %}
```

- **Markdown engine disabled:** `markdownTemplateEngine: false` to prevent parsing `{{` in content
- **Safe filter usage:** Use `| safe` for trusted HTML content only
- **Microformats classes:** Follow IndieWeb conventions (h-entry, p-name, dt-published, e-content, u-photo, etc.)

### CSS

- **Tailwind CSS** for all styling
- **Dark mode:** `dark:` variants, controlled by `.dark` class on `<html>`
- **Custom color palette:** `primary` (blue) and `surface` (neutral)
- **Typography plugin:** `prose` classes for content rendering
- **Responsive design:** Mobile-first, breakpoints: `sm:`, `md:`, `lg:`

## Common Tasks

### Adding a New Post Type

1. **Create collection** in `eleventy.config.js`:

```javascript
eleventyConfig.addCollection("checkins", function (collectionApi) {
  return collectionApi
    .getFilteredByGlob("content/checkins/**/*.md")
    .sort((a, b) => b.date - a.date);
});
```

2. **Create collection page** (e.g., `checkins.njk`):

```nunjucks
---
layout: layouts/page.njk
title: Check-ins
withBlogSidebar: true
permalink: /checkins/
---
{% for post in collections.checkins %}
  {# render post #}
{% endfor %}
```

3. **Add to enabledPostTypes** (optional, for nav):

Edit `_data/enabledPostTypes.js` or set `POST_TYPES` env var.

4. **Update `reply-context.njk`** if the post type has a target URL property.

5. **Update `post.njk` Bridgy content** if the post type needs special syndication text.

6. **Commit, push, and update submodule.**

### Adding a New Data Source

1. **Create `_data/newSource.js`:**

```javascript
import EleventyFetch from "@11ty/eleventy-fetch";

const INDIEKIT_URL = process.env.SITE_URL || "https://example.com";

export default async function () {
  try {
    const url = `${INDIEKIT_URL}/newapi/api/data`;
    const data = await EleventyFetch(url, {
      duration: "15m",
      type: "json",
    });
    return {
      source: "indiekit",
      ...data,
    };
  } catch (error) {
    console.log(`[newSource] API unavailable: ${error.message}`);
    return {
      source: "error",
      items: [],
    };
  }
}
```

2. **Use in template:**

```nunjucks
{% if newSource and newSource.source == "indiekit" %}
  {% for item in newSource.items %}
    {# render item #}
  {% endfor %}
{% endif %}
```

3. **Add status check** to base.njk navigation (if needed).

### Adding a New Homepage Section

1. **Create section template** in `_includes/components/sections/`:

```nunjucks
{# new-section.njk #}
{% set sectionConfig = section.config or {} %}
{% set maxItems = sectionConfig.maxItems or 5 %}

<section class="mb-8 sm:mb-12">
  <h2 class="text-xl sm:text-2xl font-bold">{{ sectionConfig.title or "New Section" }}</h2>
  {# render content #}
</section>
```

2. **Register in `homepage-section.njk`:**

```nunjucks
{% if section.type == "new-section" %}
  {% include "components/sections/new-section.njk" %}
```

3. **Plugin integration:** The plugin that provides this section should register it via `homepageSections` in Indiekit.

### Debugging Webmentions

1. **Check build-time cache:** Look at `webmention-debug.njk` page
2. **Check client-side fetch:** Open browser console, check for fetch requests to `/webmentions/api/mentions`
3. **Verify target URL:** Webmentions must match exact URL (with or without trailing slash)
4. **Check legacy URLs:** Verify `urlAliases` data includes old URLs if needed

### Theming and Customization

1. **Colors:** Edit `tailwind.config.js` → `theme.extend.colors`
2. **Typography:** Edit `tailwind.config.js` → `theme.extend.typography`
3. **CSS utilities:** Add custom utilities to `css/tailwind.css`
4. **Rebuild CSS:** `npm run build:css` (or `make build:css` in parent repo)

## Performance Debugging

For diagnosing and fixing Eleventy build performance issues, see the comprehensive guide at `/home/rick/code/indiekit-dev/docs/eleventy-debugging-guide.md`.

**Quick diagnostic steps:**

1. **Baseline:** `time npx @11ty/eleventy --quiet` (run 3x, take median)
2. **Benchmark:** `DEBUG=Eleventy:Benchmark*  npx @11ty/eleventy` — find entries >15% of total or with call count matching page count
3. **Classify:** Network requests (high avg, low count) vs. redundant computation (low avg, high count) vs. client-side bloat (fast build, low Lighthouse)
4. **Fix:** Timeout + cache for network; memoize with `Map` for per-page computation; Web Components for client-side bloat
5. **Verify:** Re-measure against baseline

**Relevant to this theme:** Data files in `_data/` that fetch from external APIs (GitHub, Mastodon, Bluesky, YouTube, Funkwhale, Last.fm) are Pattern A candidates — always use `eleventy-fetch` with appropriate `duration` and handle failures gracefully. The OG image generation hook is a Pattern B candidate — it already uses batch spawning and manifest caching to manage memory and avoid redundant work.

## Anti-Patterns

1. ❌ **Forgetting to update submodule** after changes
2. ❌ **Editing files in submodule directory** (`indiekit-cloudron/eleventy-site/`)
3. ❌ **Using Date objects instead of ISO strings** for dates
4. ❌ **Not guarding `| date` filters** against null/undefined
5. ❌ **Using only underscore property names** (support both camelCase and underscore)
6. ❌ **Using `markdownTemplateEngine: "njk"`** (breaks code samples with `{{`)
7. ❌ **Hardcoding personal data in templates** (use environment variables)
8. ❌ **Forgetting to run `make prepare`** before `cloudron build` (deploys stale config)
9. ❌ **Using unsafe HTML string assignment in client-side JS** (security hooks reject it — use `createElement` + `textContent`)
10. ❌ **Removing overrides without checking if they shadow submodule files** (causes stale data)

## Troubleshooting

### "dateString.split is not a function"

**Cause:** A Date object was passed to the `| date` filter.
**Fix:** Store dates as ISO strings from the start: `new Date().toISOString()`

### Stale data in homepage/CV despite correct JSON files

**Cause:** Override file in `indiekit-cloudron/overrides/eleventy-site/` shadows the submodule.
**Fix:** Delete the override file and reset submodule: `cd eleventy-site && git checkout -- _data/file.js`

### Webmentions not appearing

**Causes:**
- Build-time cache expired (rebuild to refresh)
- Client-side JS blocked by CSP (check console)
- Target URL mismatch (check with/without trailing slash)
- webmention.io down (check status)

**Fix:** Check `webmention-debug.njk` page, verify `webmentionsForUrl` filter is working.

### Plugin data not appearing in navigation

**Cause:** The plugin's status endpoint is unavailable or returning `source: "error"`.
**Fix:** Check the plugin's API is running, verify environment variables are set.

### YouTube embeds not working

**Causes:**
- URL doesn't match pattern (must be youtube.com/watch or youtu.be)
- Link text doesn't contain "youtube" or URL (transform matches specific patterns)

**Fix:** Use embed plugin shortcode or raw `<iframe>` instead.

## Workspace Context

This repo is part of the Indiekit development workspace at `/home/rick/code/indiekit-dev/`. See the workspace CLAUDE.md for the full repository map and plugin architecture.
