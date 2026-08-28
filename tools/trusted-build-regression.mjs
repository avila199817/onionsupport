import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";

import { compareArtifactRoots } from "./compare-build-artifacts.mjs";
import { stageTrustedBuild } from "./stage-trusted-build.mjs";
import { verifyArtifactEnvelope } from "./verify-artifact-envelope.mjs";

const SHA = "a".repeat(40);

async function write(root, path, contents) {
  const target = resolve(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
}

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function distFiles(root) {
  const dist = resolve(root, "dist");
  const output = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      if (entry.isFile()) {
        const contents = await readFile(absolutePath);
        output.push({
          path: relative(dist, absolutePath).split(sep).join("/"),
          bytes: contents.byteLength,
          sha256: hash(contents),
        });
      }
    }
  }
  await visit(dist);
  return output.sort((left, right) => left.path.localeCompare(right.path, "en"));
}

async function writeEnvelope(root) {
  const metadata = resolve(root, "build-metadata");
  await rm(metadata, { recursive: true, force: true });
  await mkdir(metadata, { recursive: true });
  const release = `${JSON.stringify({
    schema: "onionsupport.frontend.release.v1",
    gitSha: SHA,
  }, null, 2)}\n`;
  const manifest = `${JSON.stringify({
    schema: "onionsupport.frontend.release-manifest.v1",
    gitSha: SHA,
    files: await distFiles(root),
  }, null, 2)}\n`;
  await write(metadata, "release.json", release);
  await write(metadata, "release-manifest.json", manifest);
  await write(
    metadata,
    "release-manifest.sha256",
    `${hash(Buffer.from(manifest))}  release-manifest.json\n`
  );
}

async function createCleanArtifact(root) {
  await write(root, "dist/index.html", '<script type="module" src="/assets/js/main-abcdefgh.js"></script>\n');
  await write(root, "dist/assets/js/main-abcdefgh.js", "export const trusted = true;\n");
  await writeEnvelope(root);
}

async function rejectedMessage(callback) {
  try {
    await callback();
  } catch (error) {
    return String(error?.message || error);
  }
  throw new Error("Expected provenance comparison to reject divergent artifacts.");
}

const tempRoot = await mkdtemp(resolve(tmpdir(), "onion-trusted-build-regression-"));
try {
  const trustedSource = resolve(tempRoot, "trusted-source");
  const candidateSource = resolve(tempRoot, "candidate-source");
  const staged = resolve(tempRoot, "staged");
  await mkdir(trustedSource);
  await mkdir(candidateSource);

  await write(trustedSource, "package.json", "trusted package\n");
  await write(trustedSource, "package-lock.json", "trusted lock\n");
  await write(trustedSource, "vite.config.js", "trusted vite\n");
  await write(trustedSource, "tools/base-build.mjs", "trusted tool\n");
  await write(trustedSource, "src/css/removed-from-candidate.css", "must not leak\n");

  for (const path of [
    "index.html",
    "login.html",
    "staticwebapp.config.json",
    "site.webmanifest",
    "robots.txt",
    "sitemap.xml",
    "favicon.ico",
    "ad1f6102f1914986b540f6a34bf6939b.txt",
    "seo/reparacion-ordenadores.html",
    "seo/soporte-informatico.html",
    "seo/redes-wifi.html",
    "seo/impresoras.html",
    "seo/soporte-empresas.html",
  ]) {
    await write(candidateSource, path, `candidate ${path}\n`);
  }
  await write(candidateSource, "src/main.js", "candidate runtime\n");
  await write(candidateSource, "src/css/app-private.css", "candidate addition\n");
  await write(candidateSource, "package.json", "malicious candidate package\n");
  await write(candidateSource, "vite.config.js", "malicious candidate vite\n");
  await write(candidateSource, "tools/evil.mjs", "malicious candidate tool\n");

  const stage = await stageTrustedBuild({ trustedSource, candidateSource, destination: staged });
  assert.ok(stage.trustedFiles >= 4);
  assert.ok(stage.candidateFiles >= 15);
  assert.equal(await readFile(resolve(staged, "package.json"), "utf8"), "trusted package\n");
  assert.equal(await readFile(resolve(staged, "vite.config.js"), "utf8"), "trusted vite\n");
  assert.equal(await readFile(resolve(staged, "src/css/app-private.css"), "utf8"), "candidate addition\n");
  await assert.rejects(readFile(resolve(staged, "src/css/removed-from-candidate.css")));
  await assert.rejects(readFile(resolve(staged, "tools/evil.mjs")));

  const trustedArtifact = resolve(tempRoot, "trusted-artifact");
  const exactCandidate = resolve(tempRoot, "exact-candidate");
  await mkdir(trustedArtifact);
  await createCleanArtifact(trustedArtifact);
  await cp(trustedArtifact, exactCandidate, { recursive: true });
  assert.equal((await compareArtifactRoots(exactCandidate, trustedArtifact)).files, 5);

  await write(trustedArtifact, "unexpected-root.txt", "must be rejected\n");
  const extraRootError = await rejectedMessage(() => (
    compareArtifactRoots(exactCandidate, trustedArtifact)
  ));
  assert.match(extraRootError, /Artifact root entries are not exact/);
  await rm(resolve(trustedArtifact, "unexpected-root.txt"));

  const forgedCandidate = resolve(tempRoot, "forged-candidate");
  await cp(trustedArtifact, forgedCandidate, { recursive: true });
  await write(
    forgedCandidate,
    "dist/index.html",
    '<script type="module" src="/assets/js/proof-abcdefgh.js"></script>\n'
  );
  await write(
    forgedCandidate,
    "dist/assets/js/proof-abcdefgh.js",
    "globalThis.candidateToolingExecuted = true;\n"
  );
  await writeEnvelope(forgedCandidate);
  await verifyArtifactEnvelope(forgedCandidate, { releaseSha: SHA });
  const forgedError = await rejectedMessage(() => (
    compareArtifactRoots(forgedCandidate, trustedArtifact)
  ));
  assert.match(forgedError, /candidate-only path: dist\/assets\/js\/proof-abcdefgh\.js/);
  assert.match(forgedError, /byte mismatch: dist\/index\.html/);

  const trustedWithAddition = resolve(tempRoot, "trusted-with-candidate-addition");
  const artifactMissingAddition = resolve(tempRoot, "artifact-missing-candidate-addition");
  await cp(trustedArtifact, trustedWithAddition, { recursive: true });
  await cp(trustedArtifact, artifactMissingAddition, { recursive: true });
  await write(trustedWithAddition, "dist/src/css/app-private.css", "candidate addition\n");
  await writeEnvelope(trustedWithAddition);
  const additionError = await rejectedMessage(() => (
    compareArtifactRoots(artifactMissingAddition, trustedWithAddition)
  ));
  assert.match(additionError, /candidate missing trusted path: dist\/src\/css\/app-private\.css/);

  const artifactRetainingRemoval = resolve(tempRoot, "artifact-retaining-removal");
  await cp(trustedArtifact, artifactRetainingRemoval, { recursive: true });
  await write(
    artifactRetainingRemoval,
    "dist/src/css/removed-from-candidate.css",
    "stale base file\n"
  );
  await writeEnvelope(artifactRetainingRemoval);
  const removalError = await rejectedMessage(() => (
    compareArtifactRoots(artifactRetainingRemoval, trustedArtifact)
  ));
  assert.match(
    removalError,
    /candidate-only path: dist\/src\/css\/removed-from-candidate\.css/
  );

  console.log("Trusted build regression: PASS");
  console.log("- candidate package/Vite/tools cannot replace base tooling");
  console.log("- candidate compatibility additions/removals follow candidate data exactly");
  console.log("- injected fingerprinted JS with regenerated valid sidecars is rejected");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
