import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { verifyArtifactEnvelope } from "./verify-artifact-envelope.mjs";

const artifactRoot = resolve(String(process.env.ONION_ARTIFACT_DIR || "").trim());
const releaseSha = String(process.env.ONION_RELEASE_SHA || "").trim().toLowerCase();
const manifestDigest = String(process.env.EXPECTED_MANIFEST_DIGEST || "").trim();
const rawBase = String(process.env.DEPLOYED_URL || "").trim();
if (!rawBase) throw new Error("DEPLOYED_URL is required.");

const base = new URL(rawBase.includes("://") ? rawBase : `https://${rawBase}`);
if (base.protocol !== "https:" || base.username || base.password) {
  throw new Error(`Unsafe deployed URL: ${base.href}`);
}
base.pathname = base.pathname.replace(/\/+$/, "");
base.search = "";
base.hash = "";

const envelope = await verifyArtifactEnvelope(artifactRoot, {
  releaseSha,
  manifestDigest,
});
const manifest = JSON.parse(
  await readFile(resolve(artifactRoot, "build-metadata/release-manifest.json"), "utf8")
);

const routeBackings = new Map([
  ["index.html", "/"],
  ["login.html", "/login"],
  ["seo/reparacion-ordenadores.html", "/reparacion-ordenadores"],
  ["seo/soporte-informatico.html", "/soporte-informatico"],
  ["seo/redes-wifi.html", "/redes-wifi"],
  ["seo/impresoras.html", "/impresoras"],
  ["seo/soporte-empresas.html", "/soporte-empresas"],
]);

const deployedEntries = manifest.files
  .filter((entry) => entry.path !== "staticwebapp.config.json")
  .map((entry) => ({
    ...entry,
    route: routeBackings.get(entry.path) || `/${entry.path}`,
  }));

function requestUrl(path, attempt) {
  const url = new URL(`${base.origin}${base.pathname}${path}`);
  url.searchParams.set("release", releaseSha);
  url.searchParams.set("verify", String(attempt));
  return url;
}

async function fetchEntry(entry, attempt) {
  const response = await fetch(requestUrl(entry.route, attempt), {
    redirect: "follow",
    headers: {
      "Accept-Encoding": "identity",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "User-Agent": "OnionSupport-Dist-Verification/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const contents = Buffer.from(await response.arrayBuffer());
  if (response.status !== 200) {
    return `${entry.route}: HTTP ${response.status}, expected 200`;
  }
  const expected = await readFile(resolve(artifactRoot, "dist", entry.path));
  if (!contents.equals(expected)) {
    return `${entry.route}: deployed bytes differ from ${entry.path}`;
  }
  return "";
}

async function verifyEntries(attempt) {
  const errors = [];
  const concurrency = 10;
  let cursor = 0;
  async function worker() {
    while (cursor < deployedEntries.length) {
      const entry = deployedEntries[cursor];
      cursor += 1;
      try {
        const error = await fetchEntry(entry, attempt);
        if (error) errors.push(error);
      } catch (error) {
        errors.push(`${entry.route}: ${error.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return errors;
}

const deniedPaths = [
  "/tools/validate-dist.mjs",
  "/dist/index.html",
  "/build-metadata/release.json",
  "/package.json",
  "/package-lock.json",
  "/vite.config.js",
  "/.node-version",
  "/.nvmrc",
  "/.gitignore",
];

async function verifyDenied(attempt) {
  const errors = [];
  await Promise.all(deniedPaths.map(async (path) => {
    try {
      const response = await fetch(requestUrl(path, attempt), {
        redirect: "manual",
        headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
        signal: AbortSignal.timeout(30_000),
      });
      await response.arrayBuffer();
      if (response.status !== 404) errors.push(`${path}: HTTP ${response.status}, expected 404`);
    } catch (error) {
      errors.push(`${path}: ${error.message}`);
    }
  }));
  return errors;
}

let lastErrors = [];
for (let attempt = 1; attempt <= 8; attempt += 1) {
  lastErrors = [
    ...await verifyEntries(attempt),
    ...await verifyDenied(attempt),
  ];
  if (!lastErrors.length) {
    console.log(
      `Deployed dist verification: PASS (${deployedEntries.length} public files; ` +
      `${deniedPaths.length} denied paths; manifest ${envelope.manifestDigest})`
    );
    process.exit(0);
  }
  if (attempt < 8) {
    console.log(`Dist propagation pending (${attempt}/8); retrying in 5s...`);
    await delay(5_000);
  }
}

throw new Error(
  `Deployed dist did not converge to the trusted artifact:\n` +
  lastErrors.slice(0, 20).map((item) => `- ${item}`).join("\n")
);
