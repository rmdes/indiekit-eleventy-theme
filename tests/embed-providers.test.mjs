/**
 * Provider mapper for the "embed" composition block (lib/embed-providers.mjs).
 *
 * The mapper is a SECURITY BOUNDARY: every src it returns must be https on the
 * provider's own embed host, and hostname matching must be dot-anchored so
 * "evilyoutube.com" never matches "youtube.com". Stored config is validated by
 * site-config, but the theme renders defensively — these tests pin both the
 * happy paths and the reject paths.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { embedInfo } from "../lib/embed-providers.mjs";

// --- YouTube ---

test("youtube watch?v= maps to lite-youtube", () => {
  assert.deepEqual(embedInfo("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), {
    provider: "youtube",
    kind: "lite-youtube",
    videoId: "dQw4w9WgXcQ",
  });
});

test("youtu.be short link maps to lite-youtube", () => {
  assert.deepEqual(embedInfo("https://youtu.be/dQw4w9WgXcQ"), {
    provider: "youtube",
    kind: "lite-youtube",
    videoId: "dQw4w9WgXcQ",
  });
});

test("youtube /shorts/ and /embed/ (nocookie) map to lite-youtube", () => {
  assert.equal(
    embedInfo("https://www.youtube.com/shorts/dQw4w9WgXcQ").videoId,
    "dQw4w9WgXcQ",
  );
  assert.equal(
    embedInfo("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ").videoId,
    "dQw4w9WgXcQ",
  );
});

test("youtube URL with an invalid video id is rejected", () => {
  // "!" is outside [A-Za-z0-9_-]; too-short ids also fail the 6-20 gate
  assert.equal(embedInfo("https://www.youtube.com/watch?v=bad!id"), null);
  assert.equal(embedInfo("https://youtu.be/abc"), null);
});

// --- Vimeo ---

test("vimeo video URL maps to player.vimeo.com iframe with 16/9 aspect", () => {
  assert.deepEqual(embedInfo("https://vimeo.com/123456789"), {
    provider: "vimeo",
    kind: "iframe",
    src: "https://player.vimeo.com/video/123456789",
    aspect: "16/9",
  });
});

// --- Spotify ---

test("spotify track uses the compact 152px player", () => {
  assert.deepEqual(
    embedInfo("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"),
    {
      provider: "spotify",
      kind: "iframe",
      src: "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC",
      height: 152,
    },
  );
  assert.equal(
    embedInfo("https://open.spotify.com/episode/4uLU6hMCjMI75M1A2tKUQC").height,
    152,
  );
});

test("spotify album/playlist use the tall 352px player", () => {
  assert.deepEqual(
    embedInfo("https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE"),
    {
      provider: "spotify",
      kind: "iframe",
      src: "https://open.spotify.com/embed/album/6dVIqQ8qmQ5GBnJ9shOYGE",
      height: 352,
    },
  );
  assert.equal(
    embedInfo("https://open.spotify.com/playlist/6dVIqQ8qmQ5GBnJ9shOYGE").height,
    352,
  );
});

// --- SoundCloud ---

test("soundcloud track URL is wrapped in the w.soundcloud.com player", () => {
  const url = "https://soundcloud.com/forss/flickermood";
  assert.deepEqual(embedInfo(url), {
    provider: "soundcloud",
    kind: "iframe",
    src: "https://w.soundcloud.com/player/?url=" + encodeURIComponent(url),
    height: 166,
  });
});

// --- Acast ---

test("embed.acast.com URLs pass through as-is", () => {
  const url = "https://embed.acast.com/my-show/some-episode";
  const info = embedInfo(url);
  assert.equal(info.provider, "acast");
  assert.equal(info.kind, "iframe");
  assert.equal(info.src, url);
  assert.equal(info.height, 190);
});

test("shows.acast.com episode URLs map to embed.acast.com", () => {
  assert.equal(
    embedInfo("https://shows.acast.com/my-show/episodes/some-episode").src,
    "https://embed.acast.com/my-show/some-episode",
  );
});

// --- Bandcamp ---

test("bandcamp /EmbeddedPlayer URLs pass through (470px album player)", () => {
  const url =
    "https://bandcamp.com/EmbeddedPlayer/album=123456/size=large/tracklist=true/";
  const info = embedInfo(url);
  assert.equal(info.provider, "bandcamp");
  assert.equal(info.src, url);
  assert.equal(info.height, 470);
});

test("bandcamp size=small player gets the 42px slim height", () => {
  const url = "https://bandcamp.com/EmbeddedPlayer/track=987/size=small/";
  assert.equal(embedInfo(url).height, 42);
});

test("bandcamp public album URLs are rejected (no derivable embed id)", () => {
  assert.equal(embedInfo("https://artist.bandcamp.com/album/some-record"), null);
});

// --- CodePen ---

test("codepen pen URL maps to the /embed/ result view", () => {
  assert.deepEqual(embedInfo("https://codepen.io/someuser/pen/abYqLwe"), {
    provider: "codepen",
    kind: "iframe",
    src: "https://codepen.io/someuser/embed/abYqLwe?default-tab=result",
    height: 400,
  });
});

// --- Rejects (security boundary) ---

test("non-https URLs are rejected", () => {
  assert.equal(embedInfo("http://www.youtube.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(embedInfo("javascript:alert(1)"), null);
});

test("unknown hosts are rejected", () => {
  assert.equal(embedInfo("https://evil.com/watch?v=dQw4w9WgXcQ"), null);
});

test("suffix-spoof hosts are rejected (dot-anchored matching)", () => {
  assert.equal(embedInfo("https://evilyoutube.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(embedInfo("https://notvimeo.com/123456789"), null);
});

test("garbage / non-string input is rejected", () => {
  assert.equal(embedInfo("not a url at all"), null);
  assert.equal(embedInfo(""), null);
  assert.equal(embedInfo(null), null);
  assert.equal(embedInfo(undefined), null);
  assert.equal(embedInfo(42), null);
});

test("allowed host with an unknown path shape is rejected (renderer falls back to a link)", () => {
  assert.equal(embedInfo("https://vimeo.com/about"), null);
  assert.equal(embedInfo("https://www.youtube.com/@somechannel"), null);
});
