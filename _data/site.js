/**
 * Site configuration for Eleventy
 *
 * Reads from /app/data/content/_data/site-config.json (written by
 * @rmdes/indiekit-endpoint-site-config at runtime) with a fallback to
 * _data/site.example.json for theme-only development.
 *
 * The JSON covers identity, branding, layout, and features. Fields not yet
 * in the JSON schema (author, social, feeds, webmentions, support, etc.)
 * continue to be resolved from environment variables so all existing
 * templates keep working without change.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_PATH = "/app/data/content/_data/site-config.json";
const EXAMPLE_PATH = path.join(__dirname, "site.example.json");

// ---------------------------------------------------------------------------
// Helpers for env-var-derived fields (unchanged from previous implementation)
// ---------------------------------------------------------------------------

// Parse social links from env (format: "name|url|icon,name|url|icon")
function parseSocialLinks(envVar) {
  if (!envVar) return [];
  return envVar.split(",").map((link) => {
    const [name, url, icon] = link.split("|").map((s) => s.trim());
    // Bluesky requires "me atproto" for verification
    const rel = url.includes("bsky.app") ? "me atproto" : "me";
    return { name, url, rel, icon: icon || name.toLowerCase() };
  });
}

// Get fediverse handle for fediverse:creator meta tag
// Prefers the site's own ActivityPub identity over external Mastodon account
function getFediverseCreator() {
  // Primary: site's own ActivityPub actor (canonical fediverse identity)
  const apHandle = process.env.ACTIVITYPUB_HANDLE;
  if (apHandle) {
    const domain = (process.env.SITE_URL || "https://example.com").replace(/^https?:\/\//, "");
    return `@${apHandle}@${domain}`;
  }
  // Fallback: external Mastodon account (syndication target)
  const instance = process.env.MASTODON_INSTANCE?.replace("https://", "") || "";
  const user = process.env.MASTODON_USER || "";
  if (instance && user) {
    return `@${user}@${instance}`;
  }
  return "";
}

// Auto-generate social links from feed config when SITE_SOCIAL is not set
function buildSocialFromFeeds() {
  const links = [];
  const github = process.env.GITHUB_USERNAME;
  if (github) {
    links.push({ name: "GitHub", url: `https://github.com/${github}`, rel: "me", icon: "github" });
  }
  const bskyHandle = process.env.BLUESKY_HANDLE;
  if (bskyHandle) {
    links.push({ name: "Bluesky", url: `https://bsky.app/profile/${bskyHandle}`, rel: "me atproto", icon: "bluesky" });
  }
  const mastoInstance = process.env.MASTODON_INSTANCE?.replace("https://", "");
  const mastoUser = process.env.MASTODON_USER;
  if (mastoInstance && mastoUser) {
    links.push({ name: "Mastodon", url: `https://${mastoInstance}/@${mastoUser}`, rel: "me", icon: "mastodon" });
  }
  const linkedin = process.env.LINKEDIN_USERNAME;
  if (linkedin) {
    links.push({ name: "LinkedIn", url: `https://linkedin.com/in/${linkedin}`, rel: "me", icon: "linkedin" });
  }
  const apHandle = process.env.ACTIVITYPUB_HANDLE;
  if (apHandle) {
    const siteUrl = process.env.SITE_URL || "https://example.com";
    links.push({ name: "ActivityPub", url: `${siteUrl}/activitypub/users/${apHandle}`, rel: "me", icon: "activitypub" });
  }
  return links;
}

// ---------------------------------------------------------------------------
// Main export: reads JSON config then merges with env-var fields
// ---------------------------------------------------------------------------

export default function siteData() {
  // Load the JSON config (runtime artifact or example fallback)
  const source = existsSync(RUNTIME_PATH) ? RUNTIME_PATH : EXAMPLE_PATH;
  const raw = readFileSync(source, "utf8");
  const config = JSON.parse(raw);

  // Shorthand for nested sections
  const identity = config.identity || {};
  const branding = config.branding || {};
  const layout = config.layout || {};
  const features = config.features || {};

  // site.url: no trailing slash — used as URL base for path concatenation
  // site.me / site.author.url: trailing slash — Mastodon rel="me" requires exact match
  const siteUrlBase = (process.env.SITE_URL || "https://example.com").replace(/\/$/, "");
  const siteUrlWithSlash = siteUrlBase + "/";

  // Parse SITE_SOCIAL once; reuse for the length check and the assigned value
  const parsedSocial = parseSocialLinks(process.env.SITE_SOCIAL);

  return {
    // -----------------------------------------------------------------------
    // Fields sourced from site-config.json (plugin-managed)
    // -----------------------------------------------------------------------
    // Expose the raw config sections so future templates can use them directly
    identity,
    branding,
    layout,
    features,

    // -----------------------------------------------------------------------
    // Fields mapped from JSON → flat structure for template compatibility
    // -----------------------------------------------------------------------

    // Basic site info
    // JSON identity.name takes precedence over env var, then default
    name: identity.name || process.env.SITE_NAME || "My IndieWeb Blog",
    url: siteUrlBase,
    me: siteUrlWithSlash,
    locale: identity.locale || process.env.SITE_LOCALE || "en",
    description:
      identity.description ||
      process.env.SITE_DESCRIPTION ||
      "An IndieWeb-powered blog with Micropub support",

    // -----------------------------------------------------------------------
    // Fields resolved from environment variables
    // (not yet in the JSON schema — env vars remain the source of truth)
    // -----------------------------------------------------------------------

    // Author info (shown in h-card, about page, etc.)
    author: {
      name: process.env.AUTHOR_NAME || "Blog Author",
      url: siteUrlWithSlash,
      avatar: process.env.AUTHOR_AVATAR || "/images/default-avatar.svg",
      title: process.env.AUTHOR_TITLE || "",
      bio: process.env.AUTHOR_BIO || "Welcome to my IndieWeb blog.",
      location: process.env.AUTHOR_LOCATION || "",
      locality: process.env.AUTHOR_LOCALITY || "",
      region: process.env.AUTHOR_REGION || "",
      country: process.env.AUTHOR_COUNTRY || "",
      org: process.env.AUTHOR_ORG || "",
      pronoun: process.env.AUTHOR_PRONOUN || "",
      categories: process.env.AUTHOR_CATEGORIES?.split(",").map(s => s.trim()) || [],
      keyUrl: process.env.AUTHOR_KEY_URL || "",
      email: process.env.AUTHOR_EMAIL || "",
    },

    // Social links (for rel="me" and h-card)
    // Set SITE_SOCIAL env var as: "GitHub|https://github.com/user|github,..."
    // Falls back to auto-generating from feed config (GITHUB_USERNAME, BLUESKY_HANDLE, etc.)
    social: parsedSocial.length > 0 ? parsedSocial : buildSocialFromFeeds(),

    // Feed integrations (usernames for data fetching)
    feeds: {
      github: process.env.GITHUB_USERNAME || "",
      bluesky: process.env.BLUESKY_HANDLE || "",
      mastodon: {
        instance: process.env.MASTODON_INSTANCE?.replace("https://", "") || "",
        username: process.env.MASTODON_USER || "",
      },
    },

    // Webmentions configuration
    webmentions: {
      domain: process.env.SITE_URL?.replace("https://", "").replace("http://", "") || "example.com",
    },

    // Fediverse creator for meta tag (e.g., @rick@rmendes.net)
    fediverseCreator: getFediverseCreator(),

    // Support/monetization configuration (used in _textcasting JSON Feed extension)
    support: {
      url: process.env.SUPPORT_URL || null,
      stripe: process.env.SUPPORT_STRIPE_URL || null,
      lightning: process.env.SUPPORT_LIGHTNING_ADDRESS || null,
      paymentPointer: process.env.SUPPORT_PAYMENT_POINTER || null,
    },

    // Markdown for Agents — serve clean Markdown to AI agents
    // Set MARKDOWN_AGENTS_ENABLED to "false" to disable entirely
    markdownAgents: {
      enabled: (process.env.MARKDOWN_AGENTS_ENABLED || "true").toLowerCase() === "true",
      aiTrain: process.env.MARKDOWN_AGENTS_AI_TRAIN || "yes",
      search: process.env.MARKDOWN_AGENTS_SEARCH || "yes",
      aiInput: process.env.MARKDOWN_AGENTS_AI_INPUT || "yes",
    },
  };
}
