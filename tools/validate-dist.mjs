import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = resolve(ROOT, process.env.ONION_BUILD_OUT_DIR || "dist");
const METADATA = resolve(ROOT, process.env.ONION_BUILD_METADATA_DIR || "build-metadata");
const CANDIDATE_SOURCE = String(process.env.ONION_CANDIDATE_SOURCE_DIR || "").trim();

const ROOT_FILES = Object.freeze([
  "index.html",
  "login.html",
  "staticwebapp.config.json",
  "site.webmanifest",
  "robots.txt",
  "sitemap.xml",
  "favicon.ico",
  "ad1f6102f1914986b540f6a34bf6939b.txt",
]);

const SEO_FILES = Object.freeze([
  "seo/reparacion-ordenadores.html",
  "seo/soporte-informatico.html",
  "seo/redes-wifi.html",
  "seo/impresoras.html",
  "seo/soporte-empresas.html",
]);

const COMPATIBILITY_DIRECTORIES = Object.freeze([
  "src/analytics",
  "src/css",
  "src/media",
  "src/preboot",
]);

const CLASSIC_SCRIPT_ALLOWLIST = new Set([
  "src/preboot/public-home-preload.js",
  "src/preboot/theme.js",
  "src/analytics/google-tag.js",
]);

const METADATA_FILES = new Set([
  "release.json",
  "release-manifest.json",
  "release-manifest.sha256",
]);

const EXACT_COPY_FILES = Object.freeze([
  "staticwebapp.config.json",
  "site.webmanifest",
  "robots.txt",
  "sitemap.xml",
  "favicon.ico",
  "ad1f6102f1914986b540f6a34bf6939b.txt",
]);

function posixPath(value) {
  return String(value || "").split(sep).join("/");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return JSON.stringify(actual) === JSON.stringify([...expected].sort());
}

function canonicalRelativePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    /^[A-Za-z0-9._~/-]+$/.test(value) &&
    posix.normalize(value) === value &&
    !value.split("/").some((part) => part === "" || part === "." || part === "..")
  );
}

function expectedReleaseSha() {
  const supplied = String(
    process.env.ONION_RELEASE_SHA || process.env.GITHUB_SHA || ""
  ).trim();
  const candidate = supplied || execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();

  if (!/^[a-f0-9]{40}$/i.test(candidate)) {
    throw new Error("Expected release SHA must be a full 40-character Git commit.");
  }
  return candidate.toLowerCase();
}

async function collectFiles(directory) {
  const output = new Map();

  const rootStat = await lstat(directory);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Artifact root must be a real directory: ${directory}`);
  }

  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));

    for (const entry of entries) {
      const absolutePath = resolve(current, entry.name);
      const path = posixPath(relative(directory, absolutePath));
      const stat = await lstat(absolutePath);

      if (!canonicalRelativePath(path)) {
        throw new Error(`Non-canonical artifact path: ${path}`);
      }
      if (stat.isSymbolicLink()) {
        throw new Error(`Symlink forbidden in artifact: ${path}`);
      }
      if (stat.isDirectory()) {
        await visit(absolutePath);
      } else if (stat.isFile()) {
        if (output.has(path)) throw new Error(`Duplicate artifact path: ${path}`);
        output.set(path, { absolutePath, stat });
      } else {
        throw new Error(`Only regular files are permitted in artifact: ${path}`);
      }
    }
  }

  await visit(directory);
  return output;
}

async function expectedCompatibilityPaths(sourceRoot = ROOT) {
  const output = new Set();
  for (const directory of COMPATIBILITY_DIRECTORIES) {
    const files = await collectFiles(resolve(sourceRoot, directory));
    for (const path of files.keys()) output.add(`${directory}/${path}`);
  }
  return output;
}

function stripReference(value = "") {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .split("#", 1)[0]
    .split("?", 1)[0];
}

function isAssetReference(value = "") {
  const clean = stripReference(value);
  return clean.startsWith("/assets/") || clean.startsWith("/src/");
}

function localPath(value = "") {
  return stripReference(value).replace(/^\/+/, "");
}

function htmlAssetReferences(source = "") {
  const references = [];
  const attributePattern = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  const srcsetPattern = /\b(?:srcset|imagesrcset)\s*=\s*["']([^"']+)["']/gi;

  for (const match of source.matchAll(attributePattern)) {
    if (isAssetReference(match[1])) references.push(match[1]);
  }
  for (const match of source.matchAll(srcsetPattern)) {
    for (const candidate of match[1].split(",")) {
      const reference = candidate.trim().split(/\s+/, 1)[0];
      if (isAssetReference(reference)) references.push(reference);
    }
  }
  return references;
}

function cssAssetReferences(source = "") {
  const references = [];
  for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    if (isAssetReference(match[1])) references.push(match[1]);
  }
  for (const match of source.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/gi)) {
    if (isAssetReference(match[1])) references.push(match[1]);
  }
  return references;
}

const errors = [];
let files;
let metadataFiles;
try {
  files = await collectFiles(DIST);
  metadataFiles = await collectFiles(METADATA);
} catch (error) {
  console.error(`Dist validation failed: ${error.message}`);
  process.exit(1);
}

const candidateRoot = CANDIDATE_SOURCE ? resolve(CANDIDATE_SOURCE) : null;
const expectedCompatibility = await expectedCompatibilityPaths(candidateRoot || ROOT);
const exactStaticPaths = new Set([
  ...ROOT_FILES,
  ...SEO_FILES,
  ...expectedCompatibility,
]);

for (const path of exactStaticPaths) {
  if (!files.has(path)) errors.push(`Required dist file is missing: ${path}`);
}

for (const path of files.keys()) {
  const generatedAsset = path.startsWith("assets/");
  if (!exactStaticPaths.has(path) && !generatedAsset) {
    errors.push(`Release path is outside the exact allowlist: ${path}`);
  }
  if (path.endsWith(".map")) errors.push(`Source map forbidden in release: ${path}`);
  if (path.startsWith("src/") && path.endsWith(".js") && !CLASSIC_SCRIPT_ALLOWLIST.has(path)) {
    errors.push(`Unbundled runtime JavaScript forbidden: ${path}`);
  }
  if (generatedAsset && !/^assets\/(?:js|css|media|fonts|misc)\/[^/]+-[A-Za-z0-9_-]{8,}\.[^.]+$/.test(path)) {
    errors.push(`Generated asset path or fingerprint is invalid: ${path}`);
  }
}

for (const path of metadataFiles.keys()) {
  if (!METADATA_FILES.has(path)) errors.push(`Unexpected metadata path: ${path}`);
}
for (const path of METADATA_FILES) {
  if (!metadataFiles.has(path)) errors.push(`Required metadata file is missing: ${path}`);
  if (files.has(path)) errors.push(`Private build metadata leaked into dist: ${path}`);
}

if (CANDIDATE_SOURCE) {
  try {
    const byteExactPaths = new Set([
      ...EXACT_COPY_FILES,
      ...expectedCompatibility,
    ]);
    byteExactPaths.delete("src/preboot/public-home-preload.js");

    for (const path of byteExactPaths) {
      const emitted = files.get(path);
      if (!emitted) continue;
      const candidatePath = resolve(candidateRoot, path);
      const candidateStat = await lstat(candidatePath);
      if (!candidateStat.isFile() || candidateStat.isSymbolicLink()) {
        errors.push(`Candidate exact-copy input is not a regular file: ${path}`);
        continue;
      }
      const [emittedBytes, candidateBytes] = await Promise.all([
        readFile(emitted.absolutePath),
        readFile(candidatePath),
      ]);
      if (!emittedBytes.equals(candidateBytes)) {
        errors.push(`Dist exact-copy asset differs from candidate source: ${path}`);
      }
    }
  } catch (error) {
    errors.push(`Candidate/dist fidelity validation failed: ${error.message}`);
  }
}

for (const [path, item] of files) {
  if (!/\.(?:html|css)$/i.test(path)) continue;
  const source = await readFile(item.absolutePath, "utf8");
  const references = path.endsWith(".html")
    ? htmlAssetReferences(source)
    : cssAssetReferences(source);

  for (const reference of references) {
    const target = localPath(reference);
    if (!files.has(target)) errors.push(`${path} references missing asset ${reference}`);
  }
}

for (const htmlPath of ["index.html", "login.html"]) {
  if (!files.has(htmlPath)) continue;
  const html = await readFile(files.get(htmlPath).absolutePath, "utf8");
  const noscriptBlocks = [...html.matchAll(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi)]
    .map((match) => match[0]);
  if (!noscriptBlocks.some((block) => /href=["']\/src\/css\/core\/noscript\.css["']/i.test(block))) {
    errors.push(`${htmlPath} does not preserve the conditional no-JavaScript stylesheet.`);
  }
  const outsideNoscript = html.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "");
  if (/href=["']\/src\/css\/core\/noscript\.css["']/i.test(outsideNoscript)) {
    errors.push(`${htmlPath} loads the no-JavaScript stylesheet when JavaScript is enabled.`);
  }
}

for (const [htmlPath, markers] of Object.entries({
  "index.html": ["main", "enhancements"],
  "login.html": ["enhancements", "ticket-deeplink", "chrome"],
})) {
  if (!files.has(htmlPath)) continue;
  const html = await readFile(files.get(htmlPath).absolutePath, "utf8");
  for (const marker of markers) {
    const pattern = new RegExp(
      `<link(?=[^>]*data-onion-build-preload=["']${marker}["'])(?=[^>]*href=["']([^"']+)["'])[^>]*>`,
      "g"
    );
    const matches = [...html.matchAll(pattern)];
    if (matches.length !== 1) {
      errors.push(`${htmlPath} must contain exactly one ${marker} build preload.`);
      continue;
    }
    const href = matches[0][1];
    if (!/^\/assets\/js\/[^/]+-[A-Za-z0-9_-]{8,}\.js$/.test(href) || !files.has(localPath(href))) {
      errors.push(`${htmlPath} ${marker} preload does not resolve to a generated chunk: ${href}`);
    }
  }
}

for (const [path, item] of files) {
  if (!path.startsWith("assets/css/") || !path.endsWith(".css")) continue;
  const css = await readFile(item.absolutePath, "utf8");
  if (css.includes(".noscript-services")) {
    errors.push(`${path} contains no-JavaScript-only rules in a global bundle.`);
  }
}

const prebootPath = "src/preboot/public-home-preload.js";
if (files.has(prebootPath)) {
  const preboot = await readFile(files.get(prebootPath).absolutePath, "utf8");
  const preloadTargets = [...preboot.matchAll(/["'](\/(?:assets|src)\/[^"']+)["']/g)]
    .map((match) => stripReference(match[1]));
  for (const reference of preloadTargets) {
    if (reference.startsWith("/src/") && reference.endsWith(".js")) {
      errors.push(`${prebootPath} contains forbidden source module preload ${reference}`);
    } else if (!files.has(localPath(reference))) {
      errors.push(`${prebootPath} references missing release asset ${reference}`);
    }
  }
  const modulePreloads = preloadTargets.filter((path) => path.startsWith("/assets/js/"));
  const modulePreloadCounts = new Map();
  for (const path of modulePreloads) {
    modulePreloadCounts.set(path, (modulePreloadCounts.get(path) || 0) + 1);
  }
  const preloadMultiplicity = [...modulePreloadCounts.values()].sort();
  if (modulePreloads.length !== 4 || JSON.stringify(preloadMultiplicity) !== JSON.stringify([1, 1, 2])) {
    errors.push(`${prebootPath} must preserve private boot hints and the home index/template chunk collapse.`);
  }
  if (!preboot.includes("head.querySelector")) {
    errors.push(`${prebootPath} lost its duplicate-preload guard.`);
  }
}

try {
  const config = JSON.parse(await readFile(resolve(DIST, "staticwebapp.config.json"), "utf8"));
  const assetsRoute = config.routes?.find((entry) => entry?.route === "/assets/*");
  const cacheControl = String(assetsRoute?.headers?.["Cache-Control"] || "");
  if (!/max-age=31536000/i.test(cacheControl) || !/immutable/i.test(cacheControl)) {
    errors.push("/assets/* must use one-year immutable caching.");
  }
  for (const route of [
    "/api",
    "/.auth",
    "/seo",
    "/src",
    "/assets",
    "/tools",
    "/tools/*",
    "/dist",
    "/dist/*",
    "/build-metadata",
    "/build-metadata/*",
    "/.node-version",
    "/.nvmrc",
    "/.gitignore",
    "/package.json",
    "/package-lock.json",
    "/vite.config.js",
    "/vite.config.*",
  ]) {
    const denial = config.routes?.find((entry) => entry?.route === route);
    if (denial?.statusCode !== 404) errors.push(`${route} must be denied with 404 during legacy bootstrap.`);
  }
} catch (error) {
  errors.push(`Invalid dist staticwebapp.config.json: ${error.message}`);
}

try {
  const hashedManifests = [...files.keys()].filter((path) => (
    /^assets\/misc\/site-[A-Za-z0-9_-]{8,}\.webmanifest$/.test(path)
  ));
  if (hashedManifests.length !== 1) {
    errors.push(`Expected one fingerprinted webmanifest, found ${hashedManifests.length}.`);
  } else {
    const rootManifest = await readFile(files.get("site.webmanifest").absolutePath);
    const hashedManifest = await readFile(files.get(hashedManifests[0]).absolutePath);
    if (!rootManifest.equals(hashedManifest)) {
      errors.push("Canonical and fingerprinted webmanifest bytes differ.");
    }
    for (const htmlPath of ["index.html", "login.html"]) {
      const html = await readFile(files.get(htmlPath).absolutePath, "utf8");
      if (!html.includes(`href="/${hashedManifests[0]}"`)) {
        errors.push(`${htmlPath} does not reference the fingerprinted webmanifest.`);
      }
    }
  }
} catch (error) {
  errors.push(`Invalid webmanifest contract: ${error.message}`);
}

try {
  const expectedSha = expectedReleaseSha();
  const releaseBuffer = await readFile(resolve(METADATA, "release.json"));
  const manifestBuffer = await readFile(resolve(METADATA, "release-manifest.json"));
  const sidecar = await readFile(resolve(METADATA, "release-manifest.sha256"), "utf8");
  const release = JSON.parse(releaseBuffer.toString("utf8"));
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));

  if (!exactKeys(release, ["schema", "gitSha"]) || release.schema !== "onionsupport.frontend.release.v1") {
    errors.push("release.json schema or keys are invalid.");
  }
  if (!exactKeys(manifest, ["schema", "gitSha", "files"]) || manifest.schema !== "onionsupport.frontend.release-manifest.v1") {
    errors.push("release-manifest.json schema or keys are invalid.");
  }
  if (release.gitSha !== expectedSha || manifest.gitSha !== expectedSha) {
    errors.push(`Release SHA mismatch; expected ${expectedSha}.`);
  }
  if (sidecar !== `${sha256(manifestBuffer)}  release-manifest.json\n`) {
    errors.push("release-manifest.sha256 does not authenticate the manifest bytes.");
  }
  if (!Array.isArray(manifest.files)) {
    errors.push("release-manifest.json files must be an array.");
  }

  const manifestPaths = new Set();
  let priorPath = "";
  for (const entry of Array.isArray(manifest.files) ? manifest.files : []) {
    if (!exactKeys(entry, ["path", "bytes", "sha256"])) {
      errors.push("Manifest entry has invalid keys.");
      continue;
    }
    if (!canonicalRelativePath(entry.path)) {
      errors.push(`Manifest entry path is not canonical: ${String(entry.path)}`);
      continue;
    }
    if (manifestPaths.has(entry.path)) errors.push(`Duplicate manifest path: ${entry.path}`);
    if (priorPath && priorPath.localeCompare(entry.path, "en") >= 0) {
      errors.push(`Manifest paths are not strictly sorted at ${entry.path}.`);
    }
    priorPath = entry.path;
    manifestPaths.add(entry.path);

    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      errors.push(`Manifest metadata is invalid: ${entry.path}`);
      continue;
    }
    const item = files.get(entry.path);
    if (!item) {
      errors.push(`Manifest references missing dist file: ${entry.path}`);
      continue;
    }
    const contents = await readFile(item.absolutePath);
    if (entry.bytes !== contents.byteLength || entry.sha256 !== sha256(contents)) {
      errors.push(`Manifest digest mismatch: ${entry.path}`);
    }
  }

  for (const path of files.keys()) {
    if (!manifestPaths.has(path)) errors.push(`Dist file absent from manifest: ${path}`);
  }
  if (manifestPaths.size !== files.size) {
    errors.push(`Manifest/dist inventory size mismatch: ${manifestPaths.size}/${files.size}.`);
  }
} catch (error) {
  errors.push(`Invalid private release metadata: ${error.message}`);
}

if (errors.length) {
  console.error("Dist validation: FAIL");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Dist validation: PASS (${files.size} public files; ${metadataFiles.size} private metadata files)`);
console.log("- exact public path allowlist and generated fingerprints are valid");
console.log("- no-JavaScript CSS remains conditional and compatibility assets resolve");
console.log("- private manifest schema, inventory, digests and release SHA are valid");
