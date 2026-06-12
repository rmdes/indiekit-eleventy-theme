import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import loadBlockCatalog from "../_data/blockCatalog.mjs";

/**
 * Loader-level tests for _data/blockCatalog.mjs. The loader reads
 * content/_data/block-catalog.json at CALL time (not import time), so it is
 * directly testable with a real fs fixture. That path is the shared
 * (gitignored) dev location — any developer-local artifact is backed up
 * before the test and restored after, and the fixture is always removed.
 *
 * Blank-homepage protection (final-review Important #1): an empty-but-valid
 * catalog ({ catalogVersion: 1, blocks: [] } — or one whose entries are all
 * skipped by the per-entry id guard) must DISABLE catalog-driven dispatch
 * (available: false). With available: true and zero entries, renderSection
 * would turn EVERY block into block-unknown — a fully blank Tier-0 homepage.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const dataDir = join(repoRoot, "content", "_data");
const artifactPath = join(dataDir, "block-catalog.json");
const backupPath = `${artifactPath}.test-backup`;

function withArtifact(artifact, callback) {
  mkdirSync(dataDir, { recursive: true });
  const hadLocalArtifact = existsSync(artifactPath);
  if (hadLocalArtifact) renameSync(artifactPath, backupPath);
  try {
    writeFileSync(artifactPath, JSON.stringify(artifact));
    return callback();
  } finally {
    rmSync(artifactPath, { force: true });
    if (hadLocalArtifact) renameSync(backupPath, artifactPath);
  }
}

test("LOADER: a valid catalog with entries enables catalog-driven dispatch", () => {
  const result = withArtifact(
    { catalogVersion: 1, blocks: [{ id: "hero", label: "Hero" }] },
    () => loadBlockCatalog(),
  );
  assert.equal(result.available, true);
  assert.equal(result.byId.hero.label, "Hero");
});

test("LOADER: empty-but-valid catalog (blocks: []) disables catalog-driven dispatch — blank-homepage protection", () => {
  const result = withArtifact({ catalogVersion: 1, blocks: [] }, () => loadBlockCatalog());
  assert.equal(result.available, false);
  assert.deepEqual({ ...result.byId }, {});
});

test("LOADER: catalog whose entries are ALL skipped by the per-entry guard also disables dispatch", () => {
  const result = withArtifact(
    { catalogVersion: 1, blocks: [{ label: "no id" }, null, { id: "" }] },
    () => loadBlockCatalog(),
  );
  assert.equal(result.available, false);
  assert.deepEqual({ ...result.byId }, {});
});
