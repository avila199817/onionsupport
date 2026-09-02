import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  hasOneYearImmutableCache,
  hasPrivateNoStoreCache,
} from "./cache-control-policy.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const deployedVerifier = await readFile(resolve(ROOT, "tools/verify-deployed-dist.mjs"), "utf8");
const envelopeVerifier = await readFile(resolve(ROOT, "tools/verify-artifact-envelope.mjs"), "utf8");
const productionVerifier = await readFile(resolve(ROOT, ".github/ci/verify_production.sh"), "utf8");
const publicPathHygiene = await readFile(
  resolve(ROOT, ".github/scripts/public_path_hygiene.py"),
  "utf8"
);
const staticConfig = JSON.parse(
  await readFile(resolve(ROOT, "staticwebapp.config.json"), "utf8")
);

assert.equal(hasOneYearImmutableCache("public, max-age=31536000, immutable"), true);
for (const unsafe of [
  "public, s-max-age=31536000, max-age=0, immutable",
  "public, no-store, max-age=31536000, immutable",
  "public, no-cache, max-age=31536000, immutable",
  "private, max-age=31536000, immutable",
  "public=false, max-age=31536000, immutable",
  "public, max-age=31536000, immutable=1",
  "public, max-age=31536000, max-age=0, immutable",
]) {
  assert.equal(hasOneYearImmutableCache(unsafe), false, `Unsafe cache policy passed: ${unsafe}`);
}

assert.equal(hasPrivateNoStoreCache("no-cache, no-store, must-revalidate"), true);
for (const unsafe of [
  "no-cache",
  "no-store",
  'no-cache="set-cookie", no-store',
  "public, max-age=0",
]) {
  assert.equal(hasPrivateNoStoreCache(unsafe), false, `Cacheable private policy passed: ${unsafe}`);
}

const routeMap = new Map(staticConfig.routes.map((entry) => [entry.route, entry]));
assert.equal(
  Object.hasOwn(staticConfig, "navigationFallback"),
  false,
  "A global navigation fallback would turn unknown URLs into HTTP 200 soft-404 responses."
);
for (const path of ["/api", "/api/*", "/.auth", "/seo", "/src", "/assets"]) {
  assert.equal(routeMap.get(path)?.statusCode, 404, `${path} must be denied exactly.`);
}
for (const path of routeMap.keys()) {
  assert.doesNotMatch(
    path,
    /^\/[a-z]{2}(?:\/\*)?$/i,
    `${path} must not be declared as a language-prefixed static route.`
  );
}
const ticketsRoute = routeMap.get("/tickets*");
assert.equal(ticketsRoute?.rewrite, "/index.html", "Ticket deep links must keep their SPA shell.");
assert.match(
  String(ticketsRoute?.headers?.["X-Robots-Tag"] || ""),
  /noindex/i,
  "Ticket deep links must remain outside the index."
);

for (const token of [
  'redirect: "manual"',
  "response.url !== url.href",
  "hasOneYearImmutableCache",
  "hasPrivateNoStoreCache",
  'response.headers.get("x-content-type-options")',
  "privateSpaRoutes",
  "redirectRoutes",
  '["/index.html", "/"]',
  '["/login.html", "/login"]',
  '"/@ci-probe/incidencias/ci-ticket"',
  '"/tickets/INC-CI-000001"',
  '"/activate-account/ci-verifier"',
  '"/password-reset/confirm/ci-verifier"',
  '"/reset-password/confirm/ci-verifier"',
  '"/staticwebapp.config.json"',
  '"/build-metadata/release-manifest.sha256"',
  '"/src/main.js"',
  '"/__onion-not-found__/soft-404-probe"',
  '"/__onion-not-found__/nested/soft-404-probe"',
  '"/__onion-not-found__-single"',
]) {
  assert.ok(deployedVerifier.includes(token), `Deployed verifier hardening missing: ${token}`);
}

assert.ok(
  deployedVerifier.includes('[".svg", new Set(["image/svg+xml"])]'),
  "Exact-byte verification must accept SVG only as image/svg+xml."
);

assert.doesNotMatch(
  deployedVerifier,
  /redirect:\s*["']follow["']/,
  "Exact-byte verification must never follow a redirect."
);
assert.ok(
  envelopeVerifier.includes("!/^[A-Za-z0-9._~/-]+$/.test(path)"),
  "Artifact paths must reject URL delimiters and percent-encoded ambiguity."
);

for (const token of [
  "LANGUAGE_SEGMENT = bytes",
  '"git", "-C", str(ROOT), "ls-files", "-z"',
  "Public path hygiene: PASS",
  "obsolete language-prefixed public path",
]) {
  assert.ok(publicPathHygiene.includes(token), `Public path hygiene hardening missing: ${token}`);
}

for (const token of [
  "hsts_max_age",
  "includeSubDomains",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src-attr 'none'",
  "'unsafe-eval'",
  'api}" != "https://api.onionsupport.com"',
  '"/@ci-probe/incidencias/ci-ticket"',
  'assert_redirect "/index.html" "/"',
  'assert_redirect "/login.html" "/login"',
]) {
  assert.ok(productionVerifier.includes(token), `Production verifier hardening missing: ${token}`);
}

console.log("Deployed dist verifier regression: PASS");
console.log("- redirects, URL ambiguity, MIME and denied paths fail closed");
console.log("- SVG assets are accepted only with the exact image/svg+xml MIME type");
console.log("- generic unknown URLs are proven real HTTP 404 responses");
console.log("- obsolete language-prefixed paths are rejected across the tracked tree");
console.log("- fingerprinted and private cache policies resist conflicting directives");
console.log("- deep private SPA routes remain exact, no-store and noindex");
