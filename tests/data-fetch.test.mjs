/**
 * Shared _data fetch helper (lib/data-fetch.js).
 *
 * Contract under test:
 * - resolveDuration: watch/serve mode always extends TTL to 4h; production
 *   builds honour the caller's duration (default 15m). This is what keeps
 *   incremental rebuilds off the network.
 * - cachedFetch: threads an AbortSignal into fetchOptions, returns the
 *   fetcher's result, propagates fetcher errors, and aborts once the hard
 *   timeout ceiling elapses.
 *
 * The fetcher is injected so these run with zero network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { cachedFetch, resolveDuration, isWatchMode, FETCH_TIMEOUT_MS } from "../lib/data-fetch.js";

// --- resolveDuration (pure) ---

test("resolveDuration forces 4h in watch mode, ignoring caller duration", () => {
  assert.equal(resolveDuration({ duration: "15m" }, true), "4h");
  assert.equal(resolveDuration({}, true), "4h");
});

test("resolveDuration honours caller duration in build mode", () => {
  assert.equal(resolveDuration({ duration: "1d" }, false), "1d");
});

test("resolveDuration defaults to 15m in build mode when duration is unset", () => {
  assert.equal(resolveDuration({}, false), "15m");
  assert.equal(resolveDuration(undefined, false), "15m");
});

// --- cachedFetch (injected fetcher, no network) ---

test("cachedFetch returns the fetcher result and threads an AbortSignal", async () => {
  let seenUrl;
  let seenOptions;
  const fetcher = async (url, options) => {
    seenUrl = url;
    seenOptions = options;
    return { ok: 1 };
  };

  const result = await cachedFetch(
    "https://example.test/data",
    { type: "json", duration: "5m", fetchOptions: { headers: { A: "b" } } },
    { fetcher },
  );

  assert.deepEqual(result, { ok: 1 });
  assert.equal(seenUrl, "https://example.test/data");
  assert.equal(seenOptions.type, "json");
  assert.equal(seenOptions.fetchOptions.headers.A, "b"); // caller fetchOptions preserved
  assert.ok(seenOptions.fetchOptions.signal instanceof AbortSignal);
});

test("cachedFetch propagates fetcher errors", async () => {
  const fetcher = async () => {
    throw new Error("boom");
  };
  await assert.rejects(cachedFetch("https://example.test", {}, { fetcher }), /boom/);
});

test("cachedFetch aborts the fetch signal once the timeout ceiling elapses", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });

  let aborted = false;
  const fetcher = (url, options) =>
    new Promise((_resolve, reject) => {
      options.fetchOptions.signal.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("aborted"));
      });
    });

  const pending = cachedFetch("https://example.test", {}, { fetcher });
  t.mock.timers.tick(FETCH_TIMEOUT_MS);

  await assert.rejects(pending, /aborted/);
  assert.equal(aborted, true);
});

test("cachedFetch clears the timeout on success (no late abort)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const fetcher = async () => ({ done: true });
  const result = await cachedFetch("https://example.test", {}, { fetcher });

  assert.deepEqual(result, { done: true });
  // If the timeout weren't cleared, advancing time would fire a stale abort.
  // A cleared timer makes this a no-op; the test simply must not throw.
  t.mock.timers.tick(FETCH_TIMEOUT_MS * 2);
});

// --- isWatchMode: the production/dev distinction ---

test("isWatchMode is false in the deployed container even while watching", () => {
  // Production serves the site with `eleventy --watch --incremental`, so the
  // run mode is never "build" there. Keying only on it handed every deployed
  // fetch the 4h dev TTL, and /app/data/cache survives container recreation,
  // so the stale entry outlived deploys and restarts.
  const runMode = process.env.ELEVENTY_RUN_MODE;
  const origin = process.env.CLOUDRON_APP_ORIGIN;
  try {
    process.env.ELEVENTY_RUN_MODE = "watch";
    process.env.CLOUDRON_APP_ORIGIN = "https://example.com";
    assert.equal(isWatchMode(), false);
    assert.equal(resolveDuration({ duration: "15m" }, isWatchMode()), "15m");
  } finally {
    runMode === undefined
      ? delete process.env.ELEVENTY_RUN_MODE
      : (process.env.ELEVENTY_RUN_MODE = runMode);
    origin === undefined
      ? delete process.env.CLOUDRON_APP_ORIGIN
      : (process.env.CLOUDRON_APP_ORIGIN = origin);
  }
});

test("isWatchMode stays true for a local watch", () => {
  const runMode = process.env.ELEVENTY_RUN_MODE;
  const origin = process.env.CLOUDRON_APP_ORIGIN;
  try {
    process.env.ELEVENTY_RUN_MODE = "watch";
    delete process.env.CLOUDRON_APP_ORIGIN;
    assert.equal(isWatchMode(), true);
    assert.equal(resolveDuration({ duration: "15m" }, isWatchMode()), "4h");
  } finally {
    runMode === undefined
      ? delete process.env.ELEVENTY_RUN_MODE
      : (process.env.ELEVENTY_RUN_MODE = runMode);
    if (origin !== undefined) process.env.CLOUDRON_APP_ORIGIN = origin;
  }
});

test("a one-shot local build still honours the caller", () => {
  const runMode = process.env.ELEVENTY_RUN_MODE;
  try {
    process.env.ELEVENTY_RUN_MODE = "build";
    assert.equal(isWatchMode(), false);
  } finally {
    runMode === undefined
      ? delete process.env.ELEVENTY_RUN_MODE
      : (process.env.ELEVENTY_RUN_MODE = runMode);
  }
});
