import assert from "node:assert/strict";
import { cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectArtifact } from "./compare-build-artifacts.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const workflow = await readFile(
  resolve(ROOT, ".github/workflows/trusted-pr-integrity.yml"),
  "utf8"
);

function jobSection(name, nextName) {
  const start = workflow.indexOf(`  ${name}:\n`);
  const end = workflow.indexOf(`  ${nextName}:\n`, start + 1);
  assert.ok(start >= 0 && end > start, `Workflow job boundary missing: ${name} -> ${nextName}`);
  return workflow.slice(start, end);
}

const candidateJob = jobSection("build_candidate_dist", "validate_dist_artifact");
const validationJob = jobSection("validate_dist_artifact", "deploy_preview");
const previewJob = jobSection("deploy_preview", "close_preview");

assert.equal(
  (candidateJob.match(/npm run test:browser:dist/g) || []).length,
  1,
  "Browser execution must remain in the isolated candidate job exactly once."
);
assert.doesNotMatch(
  validationJob,
  /test:browser:dist/,
  "Trusted artifact validation must never execute candidate JavaScript in a browser."
);

assert.doesNotMatch(
  candidateJob,
  /github\.workspace }}\/trusted-artifact|mkdir .*trusted-artifact|cp -a .*trusted-artifact/,
  "Candidate runner must not create a path later assumed by the validation runner."
);
for (const token of [
  "ONION_STAGED_BUILD_DIR: ${{ github.workspace }}/trusted-rebuild",
  "Materialize exact trusted artifact in this runner",
  "cp -a trusted-rebuild/dist trusted-artifact/dist",
  "cp -a trusted-rebuild/build-metadata trusted-artifact/build-metadata",
  "Sólo se permiten dist y build-metadata",
  "ONION_TRUSTED_ARTIFACT_DIR: ${{ github.workspace }}/trusted-artifact",
  "sha256sum trusted-artifact/build-metadata/release-manifest.json",
  "Raíz de artifact ausente",
]) {
  assert.ok(validationJob.includes(token), `Trusted validation path contract missing: ${token}`);
}
assert.ok(
  validationJob.indexOf("ONION_STAGED_BUILD_DIR") <
    validationJob.indexOf("Materialize exact trusted artifact in this runner") &&
  validationJob.indexOf("Materialize exact trusted artifact in this runner") <
    validationJob.indexOf("ONION_TRUSTED_ARTIFACT_DIR"),
  "Trusted rebuild must be staged and materialized in the same job before consumption."
);
assert.ok(
  validationJob.indexOf("ONION_TRUSTED_ARTIFACT_DIR") <
    validationJob.indexOf("sha256sum trusted-artifact/build-metadata/release-manifest.json"),
  "Exact trusted envelope must be compared before its manifest digest is exported."
);
const validationCompareIndex = validationJob.indexOf("compare-build-artifacts.mjs");
const validationDigestIndex = validationJob.indexOf(
  "sha256sum trusted-artifact/build-metadata/release-manifest.json"
);
const validationUploadIndex = validationJob.indexOf(
  "Upload trusted rebuild for later preview deployment"
);
const validationUploadPathsIndex = validationJob.indexOf(
  "trusted-artifact/dist\n            trusted-artifact/build-metadata",
  validationUploadIndex
);
assert.ok(
  validationCompareIndex >= 0 && validationDigestIndex > validationCompareIndex &&
  validationUploadIndex > validationDigestIndex &&
  validationUploadPathsIndex > validationUploadIndex,
  "Validation must compare, digest and upload the same exact trusted envelope in order."
);

const downloadIndex = previewJob.indexOf("Download exact trusted rebuild by ID");
const downloadPathIndex = previewJob.indexOf("path: trusted-artifact", downloadIndex);
const envelopeIndex = previewJob.indexOf("verify-artifact-envelope.mjs", downloadPathIndex);
const deployIndex = previewJob.indexOf("app_location: trusted-artifact/dist", envelopeIndex);
assert.ok(
  downloadIndex >= 0 && downloadPathIndex > downloadIndex &&
  envelopeIndex > downloadPathIndex && deployIndex > envelopeIndex,
  "Preview runner must download, verify and only then deploy its local trusted artifact."
);

const tempRoot = await mkdtemp(resolve(tmpdir(), "onion-runner-isolation-"));
try {
  const validationRoot = resolve(tempRoot, "validation-runner");
  const trustedRebuild = resolve(validationRoot, "trusted-rebuild");
  const trustedArtifact = resolve(validationRoot, "trusted-artifact");
  const previewRunner = resolve(tempRoot, "preview-runner/trusted-artifact");
  await mkdir(resolve(trustedRebuild, "dist"), { recursive: true });
  await mkdir(resolve(trustedRebuild, "build-metadata"));
  await writeFile(resolve(trustedRebuild, "dist/index.html"), "trusted bytes\n");
  await writeFile(resolve(trustedRebuild, "build-metadata/release.json"), "trusted metadata\n");
  await writeFile(resolve(trustedRebuild, "base-tooling-only.txt"), "not uploaded\n");

  await assert.rejects(
    collectArtifact(trustedRebuild),
    /Artifact root entries are not exact/,
    "A build workspace with extra roots must never be accepted as an artifact envelope."
  );
  await mkdir(trustedArtifact);
  await cp(resolve(trustedRebuild, "dist"), resolve(trustedArtifact, "dist"), { recursive: true });
  await cp(
    resolve(trustedRebuild, "build-metadata"),
    resolve(trustedArtifact, "build-metadata"),
    { recursive: true }
  );
  const producerFiles = await collectArtifact(trustedArtifact);

  await assert.rejects(lstat(previewRunner), /ENOENT/);
  await mkdir(previewRunner, { recursive: true });
  await cp(resolve(trustedArtifact, "dist"), resolve(previewRunner, "dist"), { recursive: true });
  await cp(
    resolve(trustedArtifact, "build-metadata"),
    resolve(previewRunner, "build-metadata"),
    { recursive: true }
  );

  const consumerFiles = await collectArtifact(previewRunner);
  assert.deepEqual([...consumerFiles.keys()], [...producerFiles.keys()]);
  await assert.rejects(lstat(resolve(previewRunner, "base-tooling-only.txt")), /ENOENT/);

  console.log("Workflow runner isolation regression: PASS");
  console.log("- validation materializes an exact envelope from its same-runner trusted rebuild");
  console.log("- preview consumes only a freshly downloaded exact artifact envelope");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
