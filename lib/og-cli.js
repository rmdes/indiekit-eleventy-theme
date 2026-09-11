#!/usr/bin/env node

/**
 * CLI entry point for OG image generation.
 * Runs as a separate process to isolate memory from Eleventy.
 *
 * Usage: node lib/og-cli.js <contentDir> <cacheDir> <configJson> [batchSize]
 *
 * configJson: JSON object describing this site's card — { siteName,
 *            description, accent, avatar, hide }. Passed as one argument
 *            rather than a growing list of positionals; see resolveCard()
 *            in og.js for what each field does.
 *
 * batchSize: Max images to generate per invocation (0 = unlimited).
 *            When set, exits after generating that many images so the caller
 *            can re-spawn (releasing all WASM native memory between batches).
 *            Exit code 2 = batch complete, more work remains.
 */

import { generateOgImages } from "./og.js";

const [contentDir, cacheDir, configJson, batchSizeStr] = process.argv.slice(2);

if (!contentDir || !cacheDir || !configJson) {
  console.error("[og] Usage: node og-cli.js <contentDir> <cacheDir> <configJson> [batchSize]");
  process.exit(1);
}

let config;
try {
  config = JSON.parse(configJson);
} catch (error) {
  // A malformed config would silently produce cards with no site name at all,
  // so fail loudly instead of guessing.
  console.error(`[og] Invalid config JSON: ${error.message}`);
  process.exit(1);
}

const batchSize = parseInt(batchSizeStr, 10) || 0;
const result = await generateOgImages(contentDir, cacheDir, config, batchSize);

// Exit code 2 signals "batch complete, more images remain"
if (result?.hasMore) {
  process.exit(2);
}
