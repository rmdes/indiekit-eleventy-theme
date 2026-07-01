/**
 * CV Data — reads from indiekit-endpoint-cv plugin data file.
 *
 * The CV plugin writes content/_data/cv.json on every save and on startup
 * (matching its declared v2 block contract: data.source:"file", file:"cv.json",
 * the same location site-config writes its artifacts). Eleventy reads it here.
 * content/.indiekit/cv.json is the pre-v2 legacy path, read only as a fallback
 * for the first post-migration build (see readCvJson below).
 *
 * Whatever the plugin writes — including malformed JSON, partial objects,
 * or wrong-shape values from a buggy version — we normalize before handing
 * to the templates. Templates trust the shape; broken cv.json should never
 * crash the build.
 */
import { dataLog } from "../lib/log.js";

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const EMPTY = Object.freeze({
  lastUpdated: null,
  experience: [],
  projects: [],
  skills: {},
  skillTypes: {},
  languages: [],
  education: [],
  interests: {},
  interestTypes: {},
});

const ARRAY_KEYS = ["experience", "projects", "languages", "education"];
const OBJECT_KEYS = ["skills", "skillTypes", "interests", "interestTypes"];

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function asObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function normalize(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const out = { lastUpdated: data.lastUpdated ?? null };
  for (const k of ARRAY_KEYS) out[k] = asArray(data[k]);
  for (const k of OBJECT_KEYS) out[k] = asObject(data[k]);
  return out;
}

/**
 * Read the raw cv.json, preferring the canonical v2 path and falling back to the
 * pre-v2 legacy path. The fallback only matters for the first build after the
 * write-path migration, before the plugin has rewritten the file to _data/; it is
 * removable (Phase 7d) once both sites have deployed the new writer at least once.
 * @returns {string|null} raw file contents, or null if neither path exists
 */
function readCvJson() {
  const candidates = [
    resolve(__dirname, "..", "content", "_data", "cv.json"),
    resolve(__dirname, "..", "content", ".indiekit", "cv.json"),
  ];
  for (const cvPath of candidates) {
    try {
      return readFileSync(cvPath, "utf8");
    } catch {
      // try next candidate
    }
  }
  return null;
}

export default function () {
  const raw = readCvJson();
  if (raw == null) return { ...EMPTY };
  try {
    const data = JSON.parse(raw);
    dataLog("[cv] Loaded CV data from plugin");
    return normalize(data);
  } catch {
    return { ...EMPTY };
  }
}
