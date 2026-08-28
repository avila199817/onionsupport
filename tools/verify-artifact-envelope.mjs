import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { collectArtifact, sha256 } from "./compare-build-artifacts.mjs";

const METADATA_PATHS = new Set([
  "build-metadata/release.json",
  "build-metadata/release-manifest.json",
  "build-metadata/release-manifest.sha256",
]);

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

export async function verifyArtifactEnvelope(root, { releaseSha, manifestDigest = "" }) {
  const expectedSha = String(releaseSha || "").trim().toLowerCase();
  const expectedDigest = String(manifestDigest || "").trim().replace(/^sha256:/, "").toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expectedSha)) throw new Error("Expected release SHA is invalid.");
  if (expectedDigest && !/^[a-f0-9]{64}$/.test(expectedDigest)) {
    throw new Error("Expected manifest digest is invalid.");
  }

  const artifactRoot = resolve(root);
  const files = await collectArtifact(artifactRoot);
  const metadataPaths = [...files.keys()].filter((path) => path.startsWith("build-metadata/"));
  if (
    metadataPaths.length !== METADATA_PATHS.size ||
    metadataPaths.some((path) => !METADATA_PATHS.has(path))
  ) {
    throw new Error(`Private metadata inventory is not exact: ${metadataPaths.join(", ")}`);
  }

  const releaseBuffer = await readFile(resolve(artifactRoot, "build-metadata/release.json"));
  const manifestBuffer = await readFile(resolve(artifactRoot, "build-metadata/release-manifest.json"));
  const sidecar = await readFile(
    resolve(artifactRoot, "build-metadata/release-manifest.sha256"),
    "utf8"
  );
  const release = JSON.parse(releaseBuffer.toString("utf8"));
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  const actualManifestDigest = sha256(manifestBuffer);

  if (
    !exactKeys(release, ["schema", "gitSha"]) ||
    release.schema !== "onionsupport.frontend.release.v1" ||
    release.gitSha !== expectedSha
  ) {
    throw new Error("release.json schema or SHA is invalid.");
  }
  if (
    !exactKeys(manifest, ["schema", "gitSha", "files"]) ||
    manifest.schema !== "onionsupport.frontend.release-manifest.v1" ||
    manifest.gitSha !== expectedSha ||
    !Array.isArray(manifest.files)
  ) {
    throw new Error("release-manifest.json schema or SHA is invalid.");
  }
  if (sidecar !== `${actualManifestDigest}  release-manifest.json\n`) {
    throw new Error("release-manifest.sha256 does not authenticate the manifest bytes.");
  }
  if (expectedDigest && actualManifestDigest !== expectedDigest) {
    throw new Error(
      `Manifest transfer digest mismatch: ${actualManifestDigest} != ${expectedDigest}.`
    );
  }

  const manifestPaths = new Set();
  let prior = "";
  for (const entry of manifest.files) {
    if (!exactKeys(entry, ["path", "bytes", "sha256"])) {
      throw new Error("Manifest entry keys are invalid.");
    }
    const path = String(entry.path || "");
    if (
      !path || path.startsWith("/") || path.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(path) ||
      !/^[A-Za-z0-9._~/-]+$/.test(path) ||
      path.split("/").some((part) => part === "" || part === "." || part === "..")
    ) {
      throw new Error(`Manifest path is not canonical: ${path}`);
    }
    if (manifestPaths.has(path) || (prior && prior.localeCompare(path, "en") >= 0)) {
      throw new Error(`Manifest paths are duplicate or unsorted at: ${path}`);
    }
    prior = path;
    manifestPaths.add(path);

    const artifactFile = files.get(`dist/${path}`);
    if (!artifactFile) throw new Error(`Manifest references missing dist path: ${path}`);
    if (
      !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(String(entry.sha256 || "")) ||
      artifactFile.bytes !== entry.bytes || artifactFile.sha256 !== entry.sha256
    ) {
      throw new Error(`Manifest bytes or digest mismatch: ${path}`);
    }
  }

  const distPaths = [...files.keys()]
    .filter((path) => path.startsWith("dist/"))
    .map((path) => path.slice("dist/".length));
  if (manifestPaths.size !== distPaths.length) {
    throw new Error(`Manifest/dist inventory size mismatch: ${manifestPaths.size}/${distPaths.length}`);
  }
  for (const path of distPaths) {
    if (!manifestPaths.has(path)) throw new Error(`Dist path absent from manifest: ${path}`);
  }

  return { files: distPaths.length, manifestDigest: actualManifestDigest };
}

async function main() {
  const root = String(process.env.ONION_ARTIFACT_DIR || "").trim();
  const releaseSha = String(process.env.ONION_RELEASE_SHA || "").trim();
  const manifestDigest = String(process.env.EXPECTED_MANIFEST_DIGEST || "").trim();
  if (!root) throw new Error("ONION_ARTIFACT_DIR is required.");
  const result = await verifyArtifactEnvelope(root, { releaseSha, manifestDigest });
  console.log(
    `Artifact envelope: PASS (${result.files} dist files; manifest ${result.manifestDigest})`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main();
}
