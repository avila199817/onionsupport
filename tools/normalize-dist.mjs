import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = resolve(ROOT, process.env.ONION_BUILD_OUT_DIR || "dist");

const defaultDist = resolve(ROOT, "dist");
const reproParent = dirname(DIST);
const safeReproDist = (
  reproParent.startsWith(`${resolve(tmpdir())}${sep}`) &&
  basename(reproParent).startsWith("onion-build-repro-") &&
  ["first", "second"].includes(basename(DIST))
);
if (DIST !== defaultDist && !safeReproDist) {
  throw new Error(`Unsafe dist normalization directory: ${DIST}`);
}
const VITE_MANIFEST = resolve(DIST, ".vite/manifest.json");

const PRELOAD_ENTRIES = Object.freeze({
  main: { source: "src/main.js", chunkName: "main" },
  enhancements: { source: "src/app/enhancements.js", chunkName: "enhancements" },
  "ticket-deeplink": { source: "src/features/ticket-deeplink/index.js", chunkName: "ticket-deeplink" },
  chrome: { source: "src/ui/chrome/index.js", chunkName: "chrome" },
});

const manifest = JSON.parse(await readFile(VITE_MANIFEST, "utf8"));
const files = await readdir(DIST, { recursive: true });
const htmlFiles = files
  .filter((path) => path.endsWith(".html"))
  .sort((left, right) => left.localeCompare(right, "en"));

for (const relativePath of htmlFiles) {
  const absolutePath = resolve(DIST, relativePath);
  let html = await readFile(absolutePath, "utf8");

  for (const [marker, entry] of Object.entries(PRELOAD_ENTRIES)) {
    const direct = manifest[entry.source];
    const named = Object.values(manifest).find((item) => (
      item?.name === entry.chunkName && String(item?.file || "").startsWith("assets/js/")
    ));
    const emittedPath = String(
      String(direct?.file || "").startsWith("assets/js/")
        ? direct.file
        : named?.file || ""
    );
    const pattern = new RegExp(
      `<link(?=[^>]*data-onion-build-preload=["']${marker}["'])[^>]*>`,
      "g"
    );
    const matches = [...html.matchAll(pattern)];
    if (!matches.length) continue;
    if (!emittedPath || !emittedPath.startsWith("assets/js/")) {
      throw new Error(`Vite manifest has no JavaScript entry for ${entry.source}.`);
    }

    html = html.replace(pattern, (tag) => (
      tag.replace(/href=["'][^"']+["']/, `href="/${emittedPath}"`)
    ));
  }

  if (/data-onion-build-preload=["'][^"']+["'][^>]*href=["']\/(?:src|assets\/misc)\//i.test(html) ||
      /href=["']\/(?:src|assets\/misc)\/[^"']+["'][^>]*data-onion-build-preload=/i.test(html)) {
    throw new Error(`${relativePath} retains an unresolved build preload.`);
  }

  await writeFile(absolutePath, html, "utf8");
}

/*
 * Vite copied the source URLs that existed only to make the legacy HTML
 * functional before the build. All emitted HTML now points at graph chunks,
 * so these unbundled duplicates must not survive in the release.
 */
for (const path of files) {
  if (/^assets\/misc\/[^/]+-[A-Za-z0-9_-]{8,}\.js$/.test(path)) {
    await rm(resolve(DIST, path));
  }
}

await rm(resolve(DIST, ".vite"), { recursive: true, force: true });

console.log(`Normalized ${htmlFiles.length} HTML entries from the Vite manifest.`);
