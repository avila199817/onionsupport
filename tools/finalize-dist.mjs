import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = resolve(ROOT, process.env.ONION_BUILD_OUT_DIR || "dist");
const METADATA = resolve(ROOT, process.env.ONION_BUILD_METADATA_DIR || "build-metadata");
const MANIFEST_NAME = "release-manifest.json";
const MANIFEST_DIGEST_NAME = "release-manifest.sha256";

const defaultDist = resolve(ROOT, "dist");
const defaultMetadata = resolve(ROOT, "build-metadata");
const reproParent = dirname(DIST);
const safeReproPair = (
  reproParent === dirname(METADATA) &&
  reproParent.startsWith(`${resolve(tmpdir())}${sep}`) &&
  basename(reproParent).startsWith("onion-build-repro-") &&
  [["first", "first-metadata"], ["second", "second-metadata"]]
    .some(([distName, metadataName]) => (
      basename(DIST) === distName && basename(METADATA) === metadataName
    ))
);
if (!((DIST === defaultDist && METADATA === defaultMetadata) || safeReproPair)) {
  throw new Error(`Unsafe release output pair: ${DIST} / ${METADATA}`);
}

function posixPath(value) {
  return String(value || "").split(sep).join("/");
}

function resolveReleaseSha() {
  const supplied = String(
    process.env.ONION_RELEASE_SHA || process.env.GITHUB_SHA || ""
  ).trim();
  const candidate = supplied || execFileSync(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: ROOT, encoding: "utf8" }
  ).trim();

  if (!/^[a-f0-9]{40}$/i.test(candidate)) {
    throw new Error("Release SHA must be a full 40-character Git commit.");
  }

  return candidate.toLowerCase();
}

async function listFiles(directory) {
  const output = [];

  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));

    for (const entry of entries) {
      const absolutePath = resolve(current, entry.name);
      const stat = await lstat(absolutePath);

      if (stat.isSymbolicLink()) {
        throw new Error(`Release artifact contains a symlink: ${absolutePath}`);
      }

      if (stat.isDirectory()) {
        await visit(absolutePath);
      } else if (stat.isFile()) {
        output.push(absolutePath);
      }
    }
  }

  await visit(directory);
  return output;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

const gitSha = resolveReleaseSha();
if (METADATA === ROOT || METADATA === DIST || METADATA.startsWith(`${DIST}${sep}`)) {
  throw new Error("Build metadata must be a dedicated directory outside dist.");
}

await mkdir(METADATA, { recursive: true });
const metadataStat = await lstat(METADATA);
if (!metadataStat.isDirectory() || metadataStat.isSymbolicLink()) {
  throw new Error("Build metadata path must be a real directory.");
}

await writeFile(
  resolve(METADATA, "release.json"),
  `${JSON.stringify({
    schema: "onionsupport.frontend.release.v1",
    gitSha,
  }, null, 2)}\n`,
  "utf8"
);

const files = [];
for (const absolutePath of await listFiles(DIST)) {
  const path = posixPath(relative(DIST, absolutePath));

  const contents = await readFile(absolutePath);
  files.push({
    path,
    bytes: contents.byteLength,
    sha256: sha256(contents),
  });
}

files.sort((left, right) => left.path.localeCompare(right.path, "en"));

const manifestContents = `${JSON.stringify({
    schema: "onionsupport.frontend.release-manifest.v1",
    gitSha,
    files,
  }, null, 2)}\n`;

await writeFile(
  resolve(METADATA, MANIFEST_NAME),
  manifestContents,
  "utf8"
);

await writeFile(
  resolve(METADATA, MANIFEST_DIGEST_NAME),
  `${sha256(Buffer.from(manifestContents, "utf8"))}  ${MANIFEST_NAME}\n`,
  "utf8"
);

console.log(`Finalized ${files.length} release files for ${gitSha}.`);
