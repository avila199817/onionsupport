import { copyFile, lstat, mkdir, readdir, realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const TRUSTED_FILES = Object.freeze([
  "package.json",
  "package-lock.json",
  "vite.config.js",
]);

const CANDIDATE_FILES = Object.freeze([
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
]);

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

async function assertRealDirectory(path, label) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory: ${path}`);
  }
  return realpath(path);
}

async function copyCheckedFile(sourceRoot, destinationRoot, path) {
  if (!canonicalRelativePath(path)) throw new Error(`Unsafe staged path: ${path}`);

  const source = resolve(sourceRoot, path);
  const sourceStat = await lstat(source);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error(`Staged input must be a regular file: ${path}`);
  }

  const [realSourceRoot, realSource] = await Promise.all([
    realpath(sourceRoot),
    realpath(source),
  ]);
  if (realSource !== realSourceRoot && !realSource.startsWith(`${realSourceRoot}${sep}`)) {
    throw new Error(`Staged input escapes its source root: ${path}`);
  }

  const destination = resolve(destinationRoot, path);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function copyCheckedTree(sourceRoot, destinationRoot, relativeDirectory) {
  if (!canonicalRelativePath(relativeDirectory)) {
    throw new Error(`Unsafe staged directory: ${relativeDirectory}`);
  }

  const sourceDirectory = resolve(sourceRoot, relativeDirectory);
  await assertRealDirectory(sourceDirectory, `Staged ${relativeDirectory}`);
  let copied = 0;

  async function visit(directory, prefix) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));

    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (!canonicalRelativePath(path)) throw new Error(`Unsafe staged path: ${path}`);

      const absolutePath = resolve(directory, entry.name);
      const stat = await lstat(absolutePath);
      if (stat.isSymbolicLink()) throw new Error(`Symlink forbidden in staged input: ${path}`);
      if (stat.isDirectory()) {
        await visit(absolutePath, path);
      } else if (stat.isFile()) {
        await copyCheckedFile(sourceRoot, destinationRoot, path);
        copied += 1;
      } else {
        throw new Error(`Only regular files are permitted in staged input: ${path}`);
      }
    }
  }

  await visit(sourceDirectory, relativeDirectory);
  return copied;
}

export async function stageTrustedBuild({ trustedSource, candidateSource, destination }) {
  const trustedRoot = resolve(trustedSource);
  const candidateRoot = resolve(candidateSource);
  const outputRoot = resolve(destination);

  await Promise.all([
    assertRealDirectory(trustedRoot, "Trusted source"),
    assertRealDirectory(candidateRoot, "Candidate data"),
  ]);

  if (
    outputRoot === trustedRoot ||
    outputRoot === candidateRoot ||
    outputRoot.startsWith(`${trustedRoot}${sep}`) ||
    outputRoot.startsWith(`${candidateRoot}${sep}`)
  ) {
    throw new Error("Trusted staging destination must be outside both source trees.");
  }

  try {
    await lstat(outputRoot);
    throw new Error(`Trusted staging destination already exists: ${outputRoot}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(outputRoot, { recursive: false });

  let trustedFiles = 0;
  for (const path of TRUSTED_FILES) {
    await copyCheckedFile(trustedRoot, outputRoot, path);
    trustedFiles += 1;
  }
  trustedFiles += await copyCheckedTree(trustedRoot, outputRoot, "tools");

  let candidateFiles = 0;
  for (const path of CANDIDATE_FILES) {
    await copyCheckedFile(candidateRoot, outputRoot, path);
    candidateFiles += 1;
  }
  candidateFiles += await copyCheckedTree(candidateRoot, outputRoot, "src");

  return { destination: outputRoot, trustedFiles, candidateFiles };
}

async function main() {
  const trustedSource = String(process.env.ONION_TRUSTED_SOURCE_DIR || ROOT).trim();
  const candidateSource = String(process.env.ONION_CANDIDATE_SOURCE_DIR || "").trim();
  const destination = String(process.env.ONION_STAGED_BUILD_DIR || "").trim();
  if (!candidateSource || !destination) {
    throw new Error("ONION_CANDIDATE_SOURCE_DIR and ONION_STAGED_BUILD_DIR are required.");
  }

  const result = await stageTrustedBuild({ trustedSource, candidateSource, destination });
  console.log(
    `Trusted build staged: ${result.trustedFiles} base-tooling files + ` +
    `${result.candidateFiles} candidate-data files.`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main();
}
