/**
 * Build-time logging for _data fetchers.
 *
 * Informational chatter (fetch attempts, API fallbacks, cache notes) is
 * silenced by default so production builds stay quiet. Enable it with:
 *   ELEVENTY_DATA_LOG=1        # explicit opt-in
 *   DEBUG=data                 # or DEBUG=* / DEBUG=...,data,...
 *
 * Errors are NEVER gated — use console.error directly for genuine failures.
 */
const enabled =
  process.env.ELEVENTY_DATA_LOG === "1" ||
  /(^|,)\s*(data|\*)\s*(,|$)/.test(process.env.DEBUG || "");

/** console.log, but only when data logging is enabled. */
export function dataLog(...args) {
  if (enabled) console.log(...args);
}

/** True when data logging is on — for guarding expensive log-only computation. */
export const dataLogEnabled = enabled;
