import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  hasOneYearImmutableCache,
  hasPrivateNoStoreCache,
} from "./cache-control-policy.mjs";
import {
  classifyProductionSkew,
  isVerificationFailure,
  selectDeployedBaseline,
} from "./production-baseline-policy.mjs";

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
const sitemap = await readFile(resolve(ROOT, "sitemap.xml"), "utf8");

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

/* =========================================================
   Onion Support · Agenda se navega EN DIRECTO desde un correo

   El backend manda al destinatario de una cita a `${APP_URL}/agenda?citaId=…`.
   Esa URL no la abre el router: la abre el navegador contra el host, en frío.
   Static Web Apps elige la ruta por el PATHNAME, así que la query no participa
   y `/agenda` tenía que estar declarada para que la petición llegara siquiera
   a la SPA. No lo estaba --era la única vista privada del registro sin ruta--
   y el host respondía con su 404 nativo: el enlace del correo moría en Azure.

   Se declara la ruta, no un fallback. Es la diferencia entre servir el shell
   donde hay vista y convertir cualquier URL inventada en un 200.
========================================================= */

const PRIVATE_SPA_POLICY = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "X-Robots-Tag": "noindex, nofollow",
};

const agendaRoute = routeMap.get("/agenda*");
assert.ok(
  agendaRoute,
  "Agenda deep links must be declared: without /agenda* the host answers /agenda?citaId=… " +
    "with Azure's native 404 and the appointment mail leads nowhere."
);
assert.equal(
  agendaRoute.rewrite,
  "/index.html",
  "Agenda deep links must resolve to the SPA shell, byte for byte."
);
for (const [header, value] of Object.entries(PRIVATE_SPA_POLICY)) {
  assert.equal(
    agendaRoute.headers?.[header],
    value,
    `Agenda is private: it must send ${header}: ${value}, like every other private route.`
  );
}

/* La política no se declara aparte para Agenda: es la de sus hermanas, literal. */
for (const sibling of ["/dashboard*", "/incidencias*", "/tickets*", "/facturas*", "/ajustes*"]) {
  assert.deepEqual(
    routeMap.get(sibling)?.headers,
    agendaRoute.headers,
    `${sibling} and /agenda* must share one private policy, not two that drift apart.`
  );
}

/* Declarar una ruta no puede degradar en fallback global. */
assert.equal(
  routeMap.has("/*"),
  false,
  "A global wildcard would serve the shell for every unknown URL: soft-404 by construction."
);

/* Y una URL que no pertenece a ninguna ruta declarada sigue sin shell que servir. */
const spaPatterns = [...routeMap.values()]
  .filter((entry) => entry.rewrite === "/index.html")
  .map((entry) => entry.route);
const matchesSpaRoute = (path) =>
  spaPatterns.some((pattern) =>
    pattern.endsWith("*") ? path.startsWith(pattern.slice(0, -1)) : path === pattern
  );
for (const unknown of [
  "/__onion-not-found__/soft-404-probe",
  "/__onion-not-found__/nested/soft-404-probe",
  "/__onion-not-found__-single",
  "/citas",
  "/calendario",
]) {
  assert.equal(
    matchesSpaRoute(unknown),
    false,
    `${unknown} belongs to no declared route and must stay a real 404, not a 200 with the shell.`
  );
}

/* Agenda es privada: no se publica en el sitemap ni recibe canonical público. */
assert.doesNotMatch(
  sitemap,
  /\/agenda/u,
  "A private view has nothing to do in the public sitemap."
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
  '"/agenda"',
  '"/agenda/ci-probe"',
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
  '"/agenda"',
  '"/agenda/ci-probe"',
  'assert_redirect "/index.html" "/"',
  'assert_redirect "/login.html" "/login"',
]) {
  assert.ok(productionVerifier.includes(token), `Production verifier hardening missing: ${token}`);
}

/* =========================================================
   Production verification reasons about immutable identities.

   The six scenarios the owner asked to reproduce, as a pure table: no network, no clock,
   no CI. `matched` is the verdict of the real byte comparison; `newest` is what the deploy
   pipeline reports AFTER it.
========================================================= */

const A = { sha: "a".repeat(40), runId: 100, conclusion: "success" };
const B = { sha: "b".repeat(40), runId: 101, conclusion: "success" };

// 1. main does not move: production serves the captured baseline.
assert.equal(
  classifyProductionSkew({ baseline: A, matched: true, newest: A }),
  "exact-match",
  "A production that matches its captured baseline is an exact match"
);

// 2. main advances during the verification, and so does production.
assert.equal(
  classifyProductionSkew({ baseline: A, matched: false, newest: B }),
  "superseded-by-newer-verified-main",
  "A strictly newer successful deploy explains a baseline that no longer matches"
);

// 3. production still serves A while main is already B: the baseline is what was DEPLOYED,
//    not the tip, so A still matches and nothing is superseded.
assert.equal(
  classifyProductionSkew({ baseline: A, matched: true, newest: B }),
  "exact-match",
  "A tip ahead of production is irrelevant while production matches its deployed baseline"
);

// 4. production already serves B while this job captured A.
assert.equal(
  classifyProductionSkew({ baseline: A, matched: false, newest: B }),
  "superseded-by-newer-verified-main",
  "A job holding a stale baseline defers to the deploy that superseded it"
);

// 5. genuine mismatch: production matches neither, and nothing newer explains it.
assert.equal(
  classifyProductionSkew({ baseline: A, matched: false, newest: A }),
  "genuine-mismatch",
  "Without a newer deploy, a non-matching production is a real discrepancy"
);
assert.ok(
  isVerificationFailure("genuine-mismatch") &&
    !isVerificationFailure("exact-match") &&
    !isVerificationFailure("superseded-by-newer-verified-main"),
  "Only a genuine mismatch fails the run"
);

// 6. the deploy leg: an exact identity is never classified, it is compared. The policy is
//    only reachable off that leg, so a baseline that is not a successful deploy is refused.
for (const [label, baseline] of [
  ["no baseline at all", null],
  ["baseline with a short sha", { ...A, sha: "abc" }],
  ["baseline with a non-numeric run id", { ...A, runId: Number.NaN }],
  ["baseline from a failed deploy", { ...A, conclusion: "failure" }],
]) {
  assert.equal(
    classifyProductionSkew({ baseline, matched: false, newest: B }),
    "genuine-mismatch",
    `Missing evidence accepted as an explanation: ${label}`
  );
}

// Nothing may launder a discrepancy into a supersede: each mutation flips exactly one fact.
for (const [label, newest] of [
  ["an older run", { ...B, runId: 99 }],
  ["the same run", { ...B, runId: A.runId }],
  ["the same revision", { ...B, sha: A.sha }],
  ["a cancelled deploy", { ...B, conclusion: "cancelled" }],
  ["a failed deploy", { ...B, conclusion: "failure" }],
  ["an unreachable pipeline", null],
]) {
  assert.equal(
    classifyProductionSkew({ baseline: A, matched: false, newest }),
    "genuine-mismatch",
    `Unverified production accepted as superseded: ${label}`
  );
}

// The baseline is the newest SUCCESSFUL deploy, whatever order the pipeline reports.
assert.deepEqual(
  selectDeployedBaseline([A, B]),
  { sha: B.sha, runId: B.runId },
  "The newest successful deploy is the baseline"
);
assert.deepEqual(
  selectDeployedBaseline([B, A]),
  { sha: B.sha, runId: B.runId },
  "Baseline selection does not depend on the order the pipeline returns"
);
assert.equal(
  selectDeployedBaseline([{ ...B, conclusion: "failure" }, { ...A, conclusion: "cancelled" }]),
  null,
  "A deploy that never succeeded is never a baseline"
);
assert.equal(selectDeployedBaseline([]), null, "No deploy is not a baseline");
assert.equal(selectDeployedBaseline(null), null, "A malformed answer is not a baseline");

console.log("Deployed dist verifier regression: PASS");
console.log("- redirects, URL ambiguity, MIME and denied paths fail closed");
console.log("- SVG assets are accepted only with the exact image/svg+xml MIME type");
console.log("- generic unknown URLs are proven real HTTP 404 responses");
console.log("- obsolete language-prefixed paths are rejected across the tracked tree");
console.log("- fingerprinted and private cache policies resist conflicting directives");
console.log("- deep private SPA routes remain exact, no-store and noindex");
console.log("- Agenda deep links are a declared private route, never a global fallback");
console.log("- production verification classifies skew from immutable deploy identities, failing closed");
