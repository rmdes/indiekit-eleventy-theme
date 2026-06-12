import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import loadPreviewDraft from "../_data/previewDraft.mjs";

/**
 * Loader-level tests for _data/previewDraft.mjs (site builder Phase 5).
 * Mirrors tests/block-catalog-loader.test.mjs: the loader reads
 * content/_data/compositions/preview-draft.json at CALL time, so it is
 * directly testable with a real fs fixture. That path is the shared
 * (gitignored) dev location — any developer-local artifact is backed up
 * before each test and restored after, and the fixture is always removed.
 *
 * The two pieces of NEW logic under test:
 * 1. kind gate — an artifact whose kind !== "preview" must be ignored
 *    (null), so a misplaced homepage artifact can never publish a page
 *    under /preview/.
 * 2. ENOENT-silent null — a missing artifact is the normal steady state
 *    (no pending preview); preview.njk turns null into permalink: false.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const compositionsDir = join(repoRoot, "content", "_data", "compositions");
const artifactPath = join(compositionsDir, "preview-draft.json");
const backupPath = `${artifactPath}.test-backup`;

function withArtifact(rawContent, callback) {
  mkdirSync(compositionsDir, { recursive: true });
  const hadLocalArtifact = existsSync(artifactPath);
  if (hadLocalArtifact) renameSync(artifactPath, backupPath);
  try {
    if (rawContent !== null) writeFileSync(artifactPath, rawContent);
    return callback();
  } finally {
    rmSync(artifactPath, { force: true });
    if (hadLocalArtifact) renameSync(backupPath, artifactPath);
  }
}

const validDraft = {
  schemaVersion: 4,
  kind: "preview",
  token: "testtoken",
  revision: 1,
  tree: { block: "container", as: "stack", role: "root", children: [] },
};

test("LOADER: a kind 'preview' artifact is returned intact (token + revision + tree)", () => {
  const result = withArtifact(JSON.stringify(validDraft), () => loadPreviewDraft());
  assert.equal(result.token, "testtoken");
  assert.equal(result.revision, 1);
  assert.equal(result.schemaVersion, 4);
  assert.deepEqual(result.tree, validDraft.tree);
});

test("LOADER: kind gate — a non-preview artifact (e.g. a misplaced homepage) returns null", () => {
  const result = withArtifact(
    JSON.stringify({ ...validDraft, kind: "homepage" }),
    () => loadPreviewDraft(),
  );
  assert.equal(result, null);
});

test("LOADER: kind gate — an artifact with NO kind field returns null", () => {
  const { kind, ...noKind } = validDraft;
  const result = withArtifact(JSON.stringify(noKind), () => loadPreviewDraft());
  assert.equal(result, null);
});

test("LOADER: missing artifact (ENOENT) returns null — the normal no-pending-preview state", () => {
  const result = withArtifact(null, () => loadPreviewDraft());
  assert.equal(result, null);
});

test("LOADER: unparseable JSON returns null instead of crashing the build", () => {
  const result = withArtifact("{ not json", () => loadPreviewDraft());
  assert.equal(result, null);
});

test("LOADER: schemaVersion is NOT gated here — the renderCompositionTree shortcode owns that gate", () => {
  // A kind-correct draft with a wrong schemaVersion still loads; the
  // shortcode degrades it to an HTML comment. Gating it here too would
  // silently skip the page instead of surfacing the shortcode's warning.
  const result = withArtifact(
    JSON.stringify({ ...validDraft, schemaVersion: 3 }),
    () => loadPreviewDraft(),
  );
  assert.equal(result.schemaVersion, 3);
  assert.equal(result.token, "testtoken");
});
