/**
 * CV Data — reads from indiekit-endpoint-cv plugin data file.
 *
 * The CV plugin writes content/.indiekit/cv.json on every save
 * and on startup. Eleventy reads that file here.
 *
 * Whatever the plugin writes — including malformed JSON, partial objects,
 * or wrong-shape values from a buggy version — we normalize before handing
 * to the templates. Templates trust the shape; broken cv.json should never
 * crash the build.
 */

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

export default function () {
  try {
    const cvPath = resolve(__dirname, "..", "content", ".indiekit", "cv.json");
    const raw = readFileSync(cvPath, "utf8");
    const data = JSON.parse(raw);
    console.log("[cv] Loaded CV data from plugin");
    return normalize(data);
  } catch {
    return { ...EMPTY };
  }
}
