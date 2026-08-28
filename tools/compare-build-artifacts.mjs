import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const ARTIFACT_DIRECTORIES = Object.freeze(["dist", "build-metadata"]);

function canonicalRelativePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !value.split("/").some((part) => part === "" || part === "." || part === "..")
  );
}

function posixPath(value) {
  return String(value || "").split(sep).join("/");
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function collectArtifact(root) {
  const artifactRoot = resolve(root);
  const rootStat = await lstat(artifactRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Artifact root must be a real directory: ${artifactRoot}`);
  }

  const topEntries = await readdir(artifactRoot, { withFileTypes: true });
  const topNames = topEntries.map((entry) => entry.name).sort();
  if (JSON.stringify(topNames) !== JSON.stringify([...ARTIFACT_DIRECTORIES].sort())) {
    throw new Error(`Artifact root entries are not exact: ${topNames.join(", ")}`);
  }

  const files = new Map();
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      const path = posixPath(relative(artifactRoot, absolutePath));
      const stat = await lstat(absolutePath);
      if (!canonicalRelativePath(path)) throw new Error(`Non-canonical artifact path: ${path}`);
      if (stat.isSymbolicLink()) throw new Error(`Artifact symlink forbidden: ${path}`);
      if (stat.isDirectory()) {
        await visit(absolutePath);
      } else if (stat.isFile()) {
        if (files.has(path)) throw new Error(`Duplicate artifact path: ${path}`);
        const contents = await readFile(absolutePath);
        files.set(path, { contents, bytes: contents.byteLength, sha256: sha256(contents) });
      } else {
        throw new Error(`Only regular artifact files are permitted: ${path}`);
      }
    }
  }

  for (const directory of ARTIFACT_DIRECTORIES) {
    const absolutePath = resolve(artifactRoot, directory);
    const stat = await lstat(absolutePath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`Artifact directory must be real: ${directory}`);
    }
    await visit(absolutePath);
  }
  return files;
}

export async function compareArtifactRoots(candidateRoot, trustedRoot) {
  const [candidate, trusted] = await Promise.all([
    collectArtifact(candidateRoot),
    collectArtifact(trustedRoot),
  ]);
  const paths = [...new Set([...candidate.keys(), ...trusted.keys()])]
    .sort((left, right) => left.localeCompare(right, "en"));
  const errors = [];

  for (const path of paths) {
    const candidateFile = candidate.get(path);
    const trustedFile = trusted.get(path);
    if (!candidateFile) {
      errors.push(`candidate missing trusted path: ${path}`);
    } else if (!trustedFile) {
      errors.push(`candidate-only path: ${path}`);
    } else if (
      candidateFile.bytes !== trustedFile.bytes ||
      candidateFile.sha256 !== trustedFile.sha256
    ) {
      errors.push(
        `byte mismatch: ${path} ` +
        `(candidate=${candidateFile.sha256.slice(0, 16)} trusted=${trustedFile.sha256.slice(0, 16)})`
      );
    }
  }

  if (errors.length) {
    throw new Error(`Candidate artifact differs from trusted rebuild:\n${errors.map((item) => `- ${item}`).join("\n")}`);
  }
  return { files: paths.length };
}

async function main() {
  const candidateRoot = String(process.env.ONION_CANDIDATE_ARTIFACT_DIR || "").trim();
  const trustedRoot = String(process.env.ONION_TRUSTED_ARTIFACT_DIR || "").trim();
  if (!candidateRoot || !trustedRoot) {
    throw new Error("ONION_CANDIDATE_ARTIFACT_DIR and ONION_TRUSTED_ARTIFACT_DIR are required.");
  }
  const result = await compareArtifactRoots(candidateRoot, trustedRoot);
  console.log(`Artifact provenance: PASS (${result.files} byte-identical files)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main();
}
