/**
 * URL → embed mapper for the "embed" composition block (lib/embed-providers.mjs).
 *
 * embedInfo(url) is a SECURITY BOUNDARY: the stored config is catalog-validated
 * by site-config, but the theme never trusts it. Rules:
 *   - https: only, parsed with `new URL()` (garbage → null)
 *   - hostname matching is dot-anchored (host === h || host.endsWith("." + h)),
 *     so "evilyoutube.com" can never match "youtube.com"
 *   - every returned src is https on the provider's OWN embed host; arbitrary
 *     input only reaches src via encodeURIComponent (SoundCloud) or after
 *     host+path validation (Bandcamp /EmbeddedPlayer, embed.acast.com)
 * Anything unrecognized → null; the template then falls back to a plain link.
 *
 * Return shapes (all plain objects, consumed by sections/embed.njk):
 *   { provider: "youtube", kind: "lite-youtube", videoId }
 *   { provider, kind: "iframe", src, aspect: "16/9" }   — responsive video
 *   { provider, kind: "iframe", src, height: <px> }     — fixed-height player
 */

const YT_ID_RE = /^[A-Za-z0-9_-]{6,20}$/;

const hostMatches = (host, suffix) =>
  host === suffix || host.endsWith("." + suffix);

function youtube(u, host) {
  let id;
  if (host === "youtu.be") {
    id = u.pathname.split("/")[1];
  } else if (u.pathname === "/watch") {
    id = u.searchParams.get("v");
  } else {
    id = (u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/) || [])[1];
  }
  if (!id || !YT_ID_RE.test(id)) return null;
  return { provider: "youtube", kind: "lite-youtube", videoId: id };
}

function vimeo(u) {
  const m = u.pathname.match(/^\/(\d+)\/?$/);
  if (!m) return null;
  return {
    provider: "vimeo",
    kind: "iframe",
    src: `https://player.vimeo.com/video/${m[1]}`,
    aspect: "16/9",
  };
}

function spotify(u) {
  const m = u.pathname.match(
    /^\/(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/,
  );
  if (!m) return null;
  return {
    provider: "spotify",
    kind: "iframe",
    src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`,
    height: m[1] === "track" || m[1] === "episode" ? 152 : 352,
  };
}

function soundcloud(u) {
  if (u.pathname === "/" || u.pathname === "") return null;
  return {
    provider: "soundcloud",
    kind: "iframe",
    src: "https://w.soundcloud.com/player/?url=" + encodeURIComponent(u.href),
    height: 166,
  };
}

function acast(u, host) {
  if (host === "embed.acast.com") {
    return { provider: "acast", kind: "iframe", src: u.href, height: 190 };
  }
  const m = u.pathname.match(/^\/([^/]+)\/episodes\/([^/]+)\/?$/);
  if (host !== "shows.acast.com" || !m) return null;
  return {
    provider: "acast",
    kind: "iframe",
    src: `https://embed.acast.com/${m[1]}/${m[2]}`,
    height: 190,
  };
}

function bandcamp(u) {
  // ONLY the /EmbeddedPlayer URLs from Bandcamp's share/embed dialog — public
  // album URLs carry no derivable embed id, so they fall through to the link.
  if (!u.pathname.startsWith("/EmbeddedPlayer")) return null;
  return {
    provider: "bandcamp",
    kind: "iframe",
    src: u.href,
    height: u.href.includes("size=small") ? 42 : 470,
  };
}

function codepen(u) {
  const m = u.pathname.match(/^\/([^/]+)\/pen\/([^/]+)\/?$/);
  if (!m) return null;
  return {
    provider: "codepen",
    kind: "iframe",
    src: `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result`,
    height: 400,
  };
}

const PROVIDERS = [
  { hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com"], map: youtube },
  { hosts: ["vimeo.com"], map: vimeo },
  { hosts: ["spotify.com"], map: spotify },
  { hosts: ["soundcloud.com"], map: soundcloud },
  { hosts: ["acast.com"], map: acast },
  { hosts: ["bandcamp.com"], map: bandcamp },
  { hosts: ["codepen.io"], map: codepen },
];

/**
 * @param {string} url  Stored config URL (untrusted)
 * @returns {object|null}  Embed descriptor, or null when the URL is not a
 *   recognized https provider URL (template falls back to a plain link).
 */
export function embedInfo(url) {
  if (typeof url !== "string") return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  for (const { hosts, map } of PROVIDERS) {
    if (hosts.some((h) => hostMatches(host, h))) return map(u, host);
  }
  return null;
}
