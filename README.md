# Indiekit Eleventy Theme

A modern, IndieWeb-native Eleventy theme designed for [Indiekit](https://getindiekit.com/)-powered personal websites. Neutral and reusable across multiple deployments via the site-config plugin. Own your content, syndicate everywhere.

## Features

### IndieWeb First

This theme is built from the ground up for the IndieWeb:

- **Microformats2** markup (h-card, h-entry, h-feed, h-cite)
- **Webmentions** via webmention.io (likes, reposts, replies)
- **IndieAuth** with rel="me" verification
- **Micropub** integration with Indiekit
- **POSSE** syndication to Bluesky, Mastodon, LinkedIn, IndieNews

### Full Post Type Support

All IndieWeb post types via Indiekit:
- **Articles** — Long-form blog posts with titles
- **Notes** — Short status updates (like tweets)
- **Photos** — Image posts with multi-photo galleries
- **Bookmarks** — Save and share links with descriptions
- **Likes** — Appreciate others' content
- **Replies** — Respond to posts across the web
- **Reposts** — Share others' content
- **Pages** — Root-level slash pages (/about, /now, /uses)

### Homepage Builder

Dynamic, plugin-configured homepage with:
- **Hero section** with avatar, bio, social links
- **Recent posts** with configurable filtering
- **CV sections** (experience, skills, education, projects, interests)
- **Custom HTML** sections from admin UI
- **Two-column layout** with configurable sidebar
- **Single-column** or **full-width hero** layouts

### Plugin Integration

Integrates with custom Indiekit endpoint plugins:

| Plugin | Features |
|--------|----------|
| `@rmdes/indiekit-endpoint-homepage` | Dynamic homepage builder with admin UI |
| `@rmdes/indiekit-endpoint-cv` | CV/resume builder with admin UI |
| `@rmdes/indiekit-endpoint-github` | GitHub activity, commits, stars, featured repos |
| `@rmdes/indiekit-endpoint-funkwhale` | Listening activity from Funkwhale |
| `@rmdes/indiekit-endpoint-lastfm` | Scrobbles and loved tracks from Last.fm |
| `@rmdes/indiekit-endpoint-youtube` | Channel info, latest videos, live status |
| `@rmdes/indiekit-endpoint-blogroll` | OPML/Microsub blog aggregator with admin UI |
| `@rmdes/indiekit-endpoint-podroll` | Podcast episode aggregator |
| `@rmdes/indiekit-endpoint-rss` | RSS feed reader with MongoDB caching |
| `@rmdes/indiekit-endpoint-microsub` | Social reader with channels and timeline |
| `@rmdes/indiekit-endpoint-conversations` | Multi-platform interaction aggregation + owner reply threading |
| `@rmdes/indiekit-endpoint-comments` | IndieAuth visitor comments with owner replies |

### Modern Tech Stack

- **Eleventy 3.0** — Fast, flexible static site generator
- **Tailwind CSS** — Utility-first styling with dark mode
- **Alpine.js** — Lightweight JavaScript framework
- **Pagefind** — Fast client-side search
- **Markdown-it** — Rich markdown with auto-linking
- **Image optimization** — Automatic WebP conversion, lazy loading

## Installation

### As a Git Submodule (Recommended)

This theme is designed to be used as a Git submodule in your Indiekit deployment repository:

```bash
# In your Indiekit deployment repo
git submodule add https://github.com/rmdes/indiekit-eleventy-theme.git eleventy-site
git submodule update --init --recursive
cd eleventy-site
npm install
```

**Why submodule?** Keeps the theme neutral (no personal data), allows upstream updates, and separates theme development from deployment.

### Standalone Installation

For local development or testing:

```bash
git clone https://github.com/rmdes/indiekit-eleventy-theme.git
cd indiekit-eleventy-theme
npm install
```

## Multi-Site Architecture

This theme is neutral and reusable across multiple Indiekit deployments. Per-site configuration is managed entirely through the **@rmdes/indiekit-endpoint-site-config** plugin, which provides a unified admin interface for:

- **Identity** (author name, avatar, bio, title, social links)
- **Branding** (colors, fonts via CSS custom properties)
- **Navigation** (header menu items, "Option B" mode: operator-configured or defaults)
- **Features** (toggles for AI transparency disclosure, markdown agents, etc.)
- **Homepage** (layout, sections, sidebar widgets)

**How it works:**

1. Operator edits Site-Config admin UI in Indiekit
2. Plugin writes JSON/CSS artifacts to `/app/data/content/_data/`
   - `site-config.json` (core config)
   - `theme.css` (Tier 2 semantic color tokens)
   - `critical.css` (inlined, critical path CSS)
   - `homepage.json` (homepage layout)
3. Theme watches these files; changes trigger Eleventy rebuild
4. Templates read from `site.*` data and conditionally render based on `loadedPlugins` and `site.features`

**Why site-config?**

- **No personal data in theme** — the same code runs on rmendes.net, v2.chardonsbleus.org, and other deployments
- **Runtime configuration** — operator edits take effect without Docker rebuild
- **Colors and typography** — centralized in CSS custom properties, no hardcoded palette
- **Feature flags** — control which UI elements appear per-site

## Configuration

**Site-level configuration:** Use the @rmdes/indiekit-endpoint-site-config plugin admin UI (recommended).

**Theme-level configuration:** Environment variables serve as fallbacks for the plugin and for theme-only development.

**All configuration is done via environment variables OR site-config plugin** — the theme contains no hardcoded personal data.

### Required Variables

```bash
# Site basics
SITE_URL="https://your-site.com"
SITE_NAME="Your Site Name"
SITE_DESCRIPTION="A short description of your site"
SITE_LOCALE="en"

# Author info (displayed in h-card)
AUTHOR_NAME="Your Name"
AUTHOR_BIO="A short bio about yourself"
AUTHOR_AVATAR="/images/avatar.jpg"
```

### Social Links

Format: `Name|URL|icon,Name|URL|icon`

```bash
SITE_SOCIAL="GitHub|https://github.com/you|github,Mastodon|https://mastodon.social/@you|mastodon,Bluesky|https://bsky.app/profile/you|bluesky"
```

**Auto-generation:** If `SITE_SOCIAL` is not set, social links are automatically generated from feed credentials (GitHub, Bluesky, Mastodon, LinkedIn).

### Optional Author Fields

```bash
AUTHOR_TITLE="Software Developer"
AUTHOR_LOCATION="City, Country"
AUTHOR_LOCALITY="City"
AUTHOR_REGION="State/Province"
AUTHOR_COUNTRY="Country"
AUTHOR_ORG="Company Name"
AUTHOR_PRONOUN="they/them"
AUTHOR_CATEGORIES="IndieWeb,Open Source,Photography"  # Comma-separated
AUTHOR_KEY_URL="https://keybase.io/you/pgp_keys.asc"
AUTHOR_EMAIL="you@example.com"
```

### Social Activity Feeds

For sidebar social activity widgets:

```bash
# Bluesky
BLUESKY_HANDLE="you.bsky.social"

# Mastodon
MASTODON_INSTANCE="https://mastodon.social"
MASTODON_USER="your-username"
```

### Plugin API Credentials

#### GitHub Activity
```bash
GITHUB_USERNAME="your-username"
GITHUB_TOKEN="ghp_xxxx"  # Personal access token (optional, increases rate limit)
GITHUB_FEATURED_REPOS="user/repo1,user/repo2"  # Comma-separated
```

#### Funkwhale
```bash
FUNKWHALE_INSTANCE="https://your-instance.com"
FUNKWHALE_USERNAME="your-username"
FUNKWHALE_TOKEN="your-api-token"
```

#### YouTube
```bash
YOUTUBE_API_KEY="your-api-key"
YOUTUBE_CHANNELS="@channel1,@channel2"  # Comma-separated handles
```

#### LinkedIn
```bash
LINKEDIN_USERNAME="your-username"
```

### Post Type Configuration

Control which post types appear in navigation:

```bash
# Option 1: Environment variable (comma-separated)
POST_TYPES="article,note,photo,bookmark"

# Option 2: JSON file (written by Indiekit or deployer)
# Create content/.indiekit/post-types.json:
# ["article", "note", "photo"]
```

**Default:** All standard post types enabled (article, note, photo, bookmark, like, reply, repost).

## Directory Structure

```
indiekit-eleventy-theme/
├── _data/                    # Data files
│   ├── site.js              # Site config from env vars
│   ├── cv.js                # CV data from plugin
│   ├── homepageConfig.js    # Homepage layout from plugin
│   ├── enabledPostTypes.js  # Post types for navigation
│   ├── githubActivity.js    # GitHub data (Indiekit API → GitHub API fallback)
│   ├── funkwhaleActivity.js # Funkwhale listening activity
│   ├── lastfmActivity.js    # Last.fm scrobbles
│   ├── youtubeChannel.js    # YouTube channel info
│   ├── blueskyFeed.js       # Bluesky posts for sidebar
│   ├── mastodonFeed.js      # Mastodon posts for sidebar
│   ├── blogrollStatus.js    # Blogroll API availability check
│   └── urlAliases.js        # Legacy URL mappings for webmentions
├── _includes/
│   ├── layouts/
│   │   ├── base.njk         # Base HTML shell (header, footer, nav)
│   │   ├── home.njk         # Homepage layout (plugin vs default)
│   │   ├── post.njk         # Individual post (h-entry, webmentions)
│   │   └── page.njk         # Simple page layout
│   ├── components/
│   │   ├── homepage-builder.njk  # Renders plugin homepage config
│   │   ├── homepage-section.njk  # Section router
│   │   ├── sidebar.njk           # Default sidebar
│   │   ├── h-card.njk            # Author identity card
│   │   ├── reply-context.njk     # Reply/like/repost context
│   │   └── webmentions.njk       # Webmention display + form
│   │   ├── sections/
│   │   │   ├── hero.njk          # Homepage hero
│   │   │   ├── recent-posts.njk  # Recent posts grid
│   │   │   ├── cv-experience.njk # Work experience timeline
│   │   │   ├── cv-skills.njk     # Skills with proficiency
│   │   │   ├── cv-education.njk  # Education history
│   │   │   ├── cv-projects.njk   # Featured projects
│   │   │   ├── cv-interests.njk  # Personal interests
│   │   │   └── custom-html.njk   # Custom HTML content
│   │   └── widgets/
│   │       ├── author-card.njk   # Sidebar h-card
│   │       ├── social-activity.njk  # Bluesky/Mastodon feed
│   │       ├── github-repos.njk  # GitHub featured repos
│   │       ├── funkwhale.njk     # Now playing widget
│   │       ├── blogroll.njk      # Recently updated blogs
│   │       └── categories.njk    # Category list
├── css/
│   ├── tailwind.css         # Tailwind source
│   ├── style.css            # Compiled output (generated)
│   └── prism-theme.css      # Syntax highlighting theme
├── js/
│   ├── webmentions.js       # Client-side webmention fetcher
│   └── admin.js             # Admin auth detection (shows FAB + dashboard link)
├── images/                  # Static images
├── *.njk                    # Page templates (blog, about, cv, etc.)
├── eleventy.config.js       # Eleventy configuration
├── tailwind.config.js       # Tailwind configuration
├── postcss.config.js        # PostCSS pipeline
└── package.json             # Dependencies and scripts
```

## Usage

### Development

```bash
# Install dependencies
npm install

# Development server with hot reload
npm run dev
# → http://localhost:8080

# Build for production
npm run build
# → Output to _site/

# Build CSS only (after Tailwind config changes)
npm run build:css
```

### Content Directory

The theme expects content in a `content/` directory (typically a symlink to Indiekit's content store):

```
content/
├── .indiekit/               # Plugin data files
│   ├── homepage.json        # Homepage builder config
│   ├── cv.json              # CV data
│   └── post-types.json      # Enabled post types
├── articles/
│   └── 2025-01-15-post.md
├── notes/
│   └── 2025-01-15-note.md
├── photos/
│   └── 2025-01-15-photo.md
└── pages/
    └── about.md             # Slash page
```

## Customization

### Colors and Typography

Edit `tailwind.config.js`:

```javascript
theme: {
  extend: {
    colors: {
      primary: {
        500: "#3b82f6",  // Your primary color
        600: "#2563eb",
        // ...
      },
    },
    fontFamily: {
      sans: ["Your Font", "system-ui", "sans-serif"],
    },
  },
}
```

Then rebuild CSS: `npm run build:css`

### Dark Mode

The theme includes full dark mode support with `dark:` variants. Toggle is available in header/mobile nav, syncs with system preference.

### Override Files

When using as a submodule, place override files in your parent repo:

```
your-deployment-repo/
├── overrides/
│   └── eleventy-site/
│       ├── _data/           # Override data files
│       ├── images/          # Your images
│       └── about.njk        # Override templates
└── eleventy-site/           # This theme (submodule)
```

Override files are copied over the submodule during build.

**Warning:** Be careful with `_data/` overrides — they can shadow dynamic plugin data. Use only for truly static customizations.

## Plugin Integration

### Site-Config Plugin (Core)

The **@rmdes/indiekit-endpoint-site-config** plugin is the central hub for all per-site configuration:

**Admin tabs:**
- **Identity** — Author h-card (name, avatar, bio, title, location, social links)
- **Branding** — Colors, fonts, visual direction (written as CSS custom properties to `theme.css`)
- **Navigation** — Header menu items (Option B: operator-configured XOR theme defaults)
- **Features** — Feature flags (AI transparency, markdown agents, etc.)
- **Homepage** — (if homepage plugin enabled) Layout, sections, sidebar widgets

**Files written to `/app/data/content/_data/`:**
- `site-config.json` — Core config object
- `theme.css` — CSS custom properties for colors and fonts
- `critical.css` — Critical path CSS (inlined for fast first paint)
- `homepage.json` — Homepage layout (if configured)

**Eleventy watches these files** — changes trigger rebuild without Docker restart.

### How Plugins Provide Data

Indiekit plugins write JSON files to `content/_data/` (a symlink to `/app/data/content/_data/`). The theme's `_data/*.js` files read these JSON files at build time.

**Example flow:**

1. User edits CV in Indiekit admin UI (`/cv`)
2. `@rmdes/indiekit-endpoint-cv` saves to `/app/data/content/_data/cv.json`
3. Eleventy rebuild triggers (`_data/cv.js` reads the JSON file)
4. CV sections render with new data

### Homepage Builder

**Unified into site-config plugin.** The homepage layout is configured via Site-Config → Homepage tab:

1. Operator enables homepage builder and configures layout
2. Site-Config plugin writes `homepage.json` to `/app/data/content/_data/`
3. `_data/homepageConfig.js` reads the JSON
4. `home.njk` → `homepage-builder.njk` renders configured layout

**Fallback:** If no homepage config exists, the theme shows a default layout (hero + recent posts + sidebar).

**Homepage sections (plugin-gated):**
- `hero` — Author intro with avatar, bio, social links (configurable CTA)
- `recent-posts` — Grid of recent posts (configurable post type filter)
- `cv-experience`, `cv-skills`, `cv-education`, `cv-projects`, `cv-interests` — CV sections (requires CV plugin)
- `custom-html` — Arbitrary HTML from admin UI

**Sidebar widgets (plugin-gated):**
- `author-card` — Sidebar h-card
- `recent-posts` — Recent posts list
- `social-activity` — Bluesky/Mastodon feed
- `github-repos` — Featured GitHub repos
- `funkwhale` — Now playing widget
- `blogroll` — Recently updated blogs
- `categories` — Category list

### Plugin Loadout (Which Plugins Are Active)

The **plugin-loadout.json** controls which optional plugins are loaded. The theme gates all conditional rendering on this file:

```javascript
// _data/loadedPlugins.js converts plugin-loadout.json to a truthy map
{ cv: true, github: true, podroll: true, ... }
```

**Usage in templates:**
```nunjucks
{% if loadedPlugins.cv %}<a href="/cv/">CV</a>{% endif %}
{% if loadedPlugins.github %}<a href="/github/">GitHub</a>{% endif %}
```

**Why gating?** The same theme runs on multiple deployments with different plugin configurations. Gating prevents 404s when optional plugins aren't installed.

### Adding Custom Sections

To add a custom homepage section:

1. Create template in `_includes/components/sections/your-section.njk`
2. Register in `_includes/components/homepage-section.njk`:

```nunjucks
{% if section.type == "your-section" %}
  {% include "components/sections/your-section.njk" %}
{% endif %}
```

3. Plugin should register the section via `homepageSections` in Indiekit

## Deployment

### Cloudron

See `indiekit-cloudron` repository for Cloudron deployment with this theme as submodule.

### Docker Compose

See `indiekit-deploy` repository for Docker Compose deployment with this theme as submodule.

### Static Host (Netlify, Vercel, etc.)

1. **Not recommended** — Indiekit needs a server for Micropub/Webmentions
2. For static-only use (no Indiekit), set all env vars and run `npm run build`
3. Deploy `_site/` directory

## Pages Included

| Page | URL | Description |
|------|-----|-------------|
| Home | `/` | Dynamic homepage (plugin or default) |
| About | `/about/` | Full h-card with bio |
| CV | `/cv/` | Resume with all sections |
| Blog | `/blog/` | All posts chronologically |
| Articles | `/articles/` | Long-form articles |
| Notes | `/notes/` | Short status updates |
| Photos | `/photos/` | Photo posts |
| Bookmarks | `/bookmarks/` | Saved links |
| Likes | `/likes/` | Liked posts |
| Replies | `/replies/` | Responses to others |
| Reposts | `/reposts/` | Shared content |
| Interactions | `/interactions/` | Combined social interactions |
| Slashes | `/slashes/` | Index of all slash pages |
| Categories | `/categories/` | Posts by category |
| GitHub | `/github/` | GitHub activity (if plugin enabled) |
| Funkwhale | `/funkwhale/` | Listening history (if plugin enabled) |
| Last.fm | `/listening/` | Last.fm scrobbles (if plugin enabled) |
| YouTube | `/youtube/` | YouTube channel (if plugin enabled) |
| Blogroll | `/blogroll/` | Blog aggregator (if plugin enabled) |
| Podroll | `/podroll/` | Podcast episodes (if plugin enabled) |
| IndieNews | `/news/` | IndieNews submissions (if plugin enabled) |
| Search | `/search/` | Pagefind search UI |
| RSS Feed | `/feed.xml` | RSS 2.0 feed |
| JSON Feed | `/feed.json` | JSON Feed 1.1 |
| Changelog | `/changelog/` | Site changelog |

## IndieWeb Resources

- [IndieWebify.me](https://indiewebify.me/) — Test your IndieWeb implementation
- [Microformats Wiki](https://microformats.org/wiki/h-card) — Microformats2 reference
- [webmention.io](https://webmention.io/) — Webmention service
- [IndieAuth](https://indieauth.com/) — Authentication protocol
- [Bridgy](https://brid.gy/) — Backfeed social interactions

## Reply-to-Interactions

The theme supports threaded owner replies on all interaction types: IndieWeb webmentions, Mastodon/Bluesky backfills, and native authenticated comments.

### How It Works

```
Visitor interaction (Mastodon reply, Bluesky like, webmention, native comment)
    │
    v
Conversations API (/conversations/api/mentions)
    │ Enriches response with owner replies from posts collection
    │ Adds is_owner: true + parent_url for threading
    v
webmentions.js (client-side)
    │ processWebmentions() separates owner replies from regular interactions
    │ Renders regular interactions (likes, reposts, replies)
    │ threadOwnerReplies() inserts owner reply cards under parent interactions
    v
Threaded display:
    ┌─────────────────────────────────┐
    │ Jane Doe [Mastodon] Mar 11      │
    │ Great post!                      │
    │ [Reply]                          │
    │  ┌─────────────────────────────┐ │
    │  │ Ricardo Mendes [Author]      │ │
    │  │ Thanks!                      │ │
    │  └─────────────────────────────┘ │
    └─────────────────────────────────┘
```

### Key Files

| File | Role |
|------|------|
| `js/webmentions.js` | Fetches interactions from 3 APIs (webmentions, conversations, comments), deduplicates, renders, and threads owner replies |
| `js/comments.js` | Alpine.js component for native comment form, IndieAuth flow, and inline reply UI |
| `_includes/components/webmentions.njk` | Server-side template with `data-wm-url` attributes and `wm-owner-reply-slot` divs for threading |

### Threading Mechanism

1. **`processWebmentions(allChildren)`** separates items with `is_owner: true` and `parent_url` from regular interactions
2. Regular interactions render normally (likes, reposts, reply cards)
3. Each reply `<li>` gets a `data-wm-url` attribute matching the interaction's source URL
4. Each reply `<li>` includes an empty `<div class="wm-owner-reply-slot">` for threading
5. **`threadOwnerReplies(ownerReplies)`** matches each owner reply's `parent_url` to a reply `<li>`'s `data-wm-url`, then inserts an amber-bordered reply card into the slot

### Reply Routing

When the site owner clicks "Reply" on an interaction, the routing depends on the interaction's source:

| Source | Route | Syndication |
|--------|-------|-------------|
| Mastodon reply | `POST /micropub` with `in-reply-to` | `mp-syndicate-to: mastodon` |
| Bluesky reply | `POST /micropub` with `in-reply-to` | `mp-syndicate-to: bluesky` |
| IndieWeb webmention | `POST /micropub` with `in-reply-to` | No syndication (webmention sent) |
| Native comment | `POST /comments/api/reply` | Stored in comments collection |

### Plugin Dependencies

| Plugin | Role |
|--------|------|
| [`@rmdes/indiekit-endpoint-conversations`](https://github.com/rmdes/indiekit-endpoint-conversations) | Serves interactions with owner reply enrichment (`is_owner`, `parent_url`) |
| [`@rmdes/indiekit-endpoint-comments`](https://github.com/rmdes/indiekit-endpoint-comments) | Handles native comment replies and owner detection (`/api/is-owner`) |
| `@rmdes/indiekit-endpoint-webmention-io` | Serves webmention.io data (likes, reposts, replies from IndieWeb) |

## Troubleshooting

### Webmentions not appearing

**Solution:**
1. Check `SITE_URL` matches your live domain exactly
2. Verify webmention.io API is responding: `https://webmention.io/api/mentions?target=https://your-site.com/`
3. Check build-time cache at `/webmention-debug/`
4. Ensure post URLs match exactly (with/without trailing slash)

### Plugin data not showing

**Solution:**
1. Verify the plugin is installed and running in Indiekit
2. Check environment variables are set correctly
3. Check `content/.indiekit/*.json` files exist and are valid JSON
4. Rebuild Eleventy to refresh data: `npm run build`

### Dark mode not working

**Solution:**
1. Check browser console for JavaScript errors
2. Verify Alpine.js loaded: `<script src="...alpinejs..."></script>`
3. Clear localStorage: `localStorage.removeItem('theme')`

### Search not working

**Solution:**
1. Check Pagefind indexed: `_site/_pagefind/` directory exists
2. Rebuild with search indexing: `npm run build`
3. Check search page is not blocked by CSP headers

## Contributing

This theme is shared across multiple Indiekit deployments. Contributions welcome, but must maintain neutrality:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with `npm run dev`
5. Submit a pull request

**Guidelines:**
- **Keep theme neutral** (no hardcoded personal data, no site-specific content)
- **Use site-config plugin** for all per-site configuration (identity, branding, navigation, features)
- **Use environment variables** for theme-level development fallbacks
- **Gate optional features** behind `loadedPlugins` or `site.features` flags
- **Maintain microformats2 markup** (h-card, h-entry, h-feed, h-cite)
- **Test dark mode** and multiple color schemes
- **Follow existing code style** (ESM, Nunjucks, Tailwind CSS)

## License

MIT

## Credits

- Built for [Indiekit](https://getindiekit.com/) by Paul Robert Lloyd
- Inspired by the [IndieWeb](https://indieweb.org/) community
- Styled with [Tailwind CSS](https://tailwindcss.com/)
- Icons from [Heroicons](https://heroicons.com/)
- Search by [Pagefind](https://pagefind.app/)
- Static site generation by [Eleventy](https://11ty.dev/)

## Related Projects

- [Indiekit](https://github.com/getindiekit/indiekit) — Micropub server
- [indiekit-cloudron](https://github.com/rmdes/indiekit-cloudron) — Cloudron deployment
- [indiekit-deploy](https://github.com/rmdes/indiekit-deploy) — Docker Compose deployment
- [@rmdes/indiekit-endpoint-*](https://github.com/rmdes?tab=repositories) — Custom Indiekit plugins
