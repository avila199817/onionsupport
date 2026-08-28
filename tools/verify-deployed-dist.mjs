import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  hasOneYearImmutableCache,
  hasPrivateNoStoreCache,
} from "./cache-control-policy.mjs";
import { verifyArtifactEnvelope } from "./verify-artifact-envelope.mjs";

const rawArtifactRoot = String(process.env.ONION_ARTIFACT_DIR || "").trim();
if (!rawArtifactRoot) throw new Error("ONION_ARTIFACT_DIR is required.");
const artifactRoot = resolve(rawArtifactRoot);
const releaseSha = String(process.env.ONION_RELEASE_SHA || "").trim().toLowerCase();
const manifestDigest = String(process.env.EXPECTED_MANIFEST_DIGEST || "").trim();
const rawBase = String(process.env.DEPLOYED_URL || "").trim();
if (!rawBase) throw new Error("DEPLOYED_URL is required.");

const base = new URL(rawBase.includes("://") ? rawBase : `https://${rawBase}`);
if (
  base.protocol !== "https:" || base.username || base.password ||
  base.pathname !== "/" || base.search || base.hash
) {
  throw new Error(`Unsafe deployed URL: ${base.href}`);
}

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

const artifactEntries = manifest.files
  .filter((entry) => entry.path !== "staticwebapp.config.json")
  .map((entry) => ({
    ...entry,
    route: routeBackings.get(entry.path) || `/${entry.path}`,
  }));

const privateSpaRoutes = [
  "/password-request",
  "/password-reset",
  "/password-reset/confirm/ci-verifier",
  "/reset-password",
  "/reset-password/confirm/ci-verifier",
  "/activate-account",
  "/activate-account/ci-verifier",
  "/dashboard",
  "/@ci-probe",
  "/@ci-probe/incidencias/ci-ticket",
  "/incidencias",
  "/incidencias/ci-ticket",
  "/facturas",
  "/clientes",
  "/usuarios",
  "/correo",
  "/servidor",
  "/cuenta",
  "/ajustes",
];
const indexEntry = manifest.files.find((entry) => entry.path === "index.html");
if (!indexEntry) throw new Error("Trusted artifact does not contain index.html.");
const deployedEntries = [
  ...artifactEntries,
  ...privateSpaRoutes.map((route) => ({ ...indexEntry, route })),
];

const redirectRoutes = [
  ["/index.html", "/"],
  ["/login.html", "/login"],
  ["/seo/reparacion-ordenadores", "/reparacion-ordenadores"],
  ["/seo/reparacion-ordenadores.html", "/reparacion-ordenadores"],
  ["/seo/soporte-informatico", "/soporte-informatico"],
  ["/seo/soporte-informatico.html", "/soporte-informatico"],
  ["/seo/redes-wifi", "/redes-wifi"],
  ["/seo/redes-wifi.html", "/redes-wifi"],
  ["/seo/impresoras", "/impresoras"],
  ["/seo/impresoras.html", "/impresoras"],
  ["/seo/soporte-empresas", "/soporte-empresas"],
  ["/seo/soporte-empresas.html", "/soporte-empresas"],
];

const allowedMimeTypes = new Map([
  [".css", new Set(["text/css"])],
  [".html", new Set(["text/html"])],
  [".ico", new Set(["image/x-icon", "image/vnd.microsoft.icon"])],
  [".js", new Set(["application/javascript", "text/javascript"])],
  [".json", new Set(["application/json"])],
  [".png", new Set(["image/png"])],
  [".txt", new Set(["text/plain"])],
  [".webmanifest", new Set(["application/manifest+json", "application/json"])],
  [".webp", new Set(["image/webp"])],
  [".xml", new Set(["application/xml", "text/xml"])],
]);

function extension(path) {
  const index = path.lastIndexOf(".");
  return index >= 0 ? path.slice(index).toLowerCase() : "";
}

function requestUrl(path, attempt) {
  if (
    !/^\/[A-Za-z0-9._~@/-]*$/.test(path) || path.includes("//") ||
    path.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error(`Unsafe deployed path: ${path}`);
  }
  const url = new URL(base.origin);
  url.pathname = path;
  url.searchParams.set("release", releaseSha);
  url.searchParams.set("verify", String(attempt));
  return url;
}

function verifyResponseHeaders(entry, response) {
  const errors = [];
  const expectedTypes = allowedMimeTypes.get(extension(entry.path));
  const contentType = String(response.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!expectedTypes) {
    errors.push(`${entry.route}: unsupported trusted MIME extension for ${entry.path}`);
  } else if (!expectedTypes.has(contentType)) {
    errors.push(
      `${entry.route}: Content-Type ${contentType || "<missing>"} is invalid for ${entry.path}`
    );
  }

  const nosniff = String(response.headers.get("x-content-type-options") || "").toLowerCase();
  if (nosniff !== "nosniff") {
    errors.push(`${entry.route}: X-Content-Type-Options is not nosniff`);
  }

  if (entry.path.startsWith("assets/")) {
    if (!hasOneYearImmutableCache(response.headers.get("cache-control"))) {
      errors.push(`${entry.route}: fingerprinted asset cache policy is not one-year immutable`);
    }
  }

  if (privateSpaRoutes.includes(entry.route)) {
    if (!hasPrivateNoStoreCache(response.headers.get("cache-control"))) {
      errors.push(`${entry.route}: private SPA route is cacheable`);
    }
    const robots = String(response.headers.get("x-robots-tag") || "").toLowerCase();
    if (!robots.includes("noindex") || !robots.includes("nofollow")) {
      errors.push(`${entry.route}: private SPA route is indexable`);
    }
  }
  return errors;
}

async function fetchEntry(entry, attempt) {
  const url = requestUrl(entry.route, attempt);
  const response = await fetch(url, {
    redirect: "manual",
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
  if (response.url !== url.href) {
    return `${entry.route}: effective URL changed to ${response.url}`;
  }
  const headerErrors = verifyResponseHeaders(entry, response);
  if (headerErrors.length) return headerErrors.join("; ");
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

async function verifyRedirects(attempt) {
  const errors = [];
  await Promise.all(redirectRoutes.map(async ([source, destination]) => {
    try {
      const response = await fetch(requestUrl(source, attempt), {
        redirect: "manual",
        headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
        signal: AbortSignal.timeout(30_000),
      });
      await response.arrayBuffer();
      const location = String(response.headers.get("location") || "");
      const absoluteDestination = new URL(destination, base.origin).href;
      if (response.status !== 301) {
        errors.push(`${source}: HTTP ${response.status}, expected 301`);
      } else if (location !== destination && location !== absoluteDestination) {
        errors.push(`${source}: Location ${location || "<missing>"}, expected ${destination}`);
      }
    } catch (error) {
      errors.push(`${source}: ${error.message}`);
    }
  }));
  return errors;
}

const deniedPaths = [
  "/api",
  "/.auth",
  "/seo",
  "/src",
  "/assets",
  "/tools",
  "/tools/validate-dist.mjs",
  "/tools/verify-deployed-dist.mjs",
  "/dist",
  "/dist/index.html",
  "/build-metadata",
  "/build-metadata/release.json",
  "/build-metadata/release-manifest.json",
  "/build-metadata/release-manifest.sha256",
  "/staticwebapp.config.json",
  "/config",
  "/node_modules",
  "/.git/config",
  "/.github/workflows/production-verification.yml",
  "/docs",
  "/src/main.js",
  "/src/views/incidencias/index.js",
  "/package.json",
  "/package-lock.json",
  "/vite.config.js",
  "/.node-version",
  "/.nvmrc",
  "/.gitignore",
  "/.env",
  "/pnpm-lock.yaml",
  "/yarn.lock",
  "/README.md",
  "/manifest.json",
  "/sw.js",
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
    ...await verifyRedirects(attempt),
    ...await verifyDenied(attempt),
  ];
  if (!lastErrors.length) {
    console.log(
      `Deployed dist verification: PASS (${artifactEntries.length} files; ` +
      `${privateSpaRoutes.length} exact SPA rewrites; ` +
      `${redirectRoutes.length} canonical redirects; ` +
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
