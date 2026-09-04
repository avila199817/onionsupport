import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateLoginIndexingReport } from "./lighthouse-indexing-contract.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

const workflowPath = path.join(
  ROOT,
  ".github",
  "workflows",
  "performance-monitor.yml"
);

const mobilePath = path.join(
  ROOT,
  ".github",
  "lighthouse",
  "mobile.json"
);

const desktopPath = path.join(
  ROOT,
  ".github",
  "lighthouse",
  "desktop.json"
);

const summaryPath = path.join(
  ROOT,
  ".github",
  "scripts",
  "lighthouse-summary.mjs"
);

const workflow = fs.readFileSync(workflowPath, "utf8");
const mobile = JSON.parse(fs.readFileSync(mobilePath, "utf8"));
const desktop = JSON.parse(fs.readFileSync(desktopPath, "utf8"));
const summary = fs.readFileSync(summaryPath, "utf8");

const actionLines = workflow
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => line.startsWith("uses: "));

assert.ok(actionLines.length >= 5, "faltan actions del monitor");

for (const line of actionLines) {
  const reference = line
    .slice("uses: ".length)
    .split(/\s+#/u)[0]
    .trim();

  assert.match(
    reference,
    /@[0-9a-f]{40}$/u,
    `action no fijada a SHA inmutable: ${reference}`
  );
}

for (const [token, expectedCount] of Object.entries({
  "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803": 2,
  "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020": 2,
  "treosh/lighthouse-ci-action@3e7e23fb74242897f95c0ba9cabad3d0227b9b18": 1,
})) {
  assert.equal(
    workflow.split(token).length - 1,
    expectedCount,
    `${token} debe aparecer ${expectedCount} vez/veces`
  );
}

const exactMonitorRef = "ref: ${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || github.sha }}";
assert.equal(
  workflow.split(exactMonitorRef).length - 1,
  2,
  "ambos jobs deben hacer checkout del SHA exacto que están auditando"
);
assert.equal(
  workflow.split("- name: Assert immutable monitor source").length - 1,
  2,
  "ambos jobs deben demostrar el checkout inmutable"
);
assert.equal(
  workflow.split("EXPECTED_MONITOR_SHA:").length - 1,
  2,
  "ambos jobs deben ligar la aserción al SHA auditado"
);
assert.equal(
  workflow.split('git rev-parse HEAD').length - 1,
  2,
  "ambos jobs deben comparar HEAD con el SHA auditado"
);
assert.equal(
  workflow.split('git status --porcelain --untracked-files=all').length - 1,
  2,
  "ambos jobs deben exigir un checkout limpio"
);

const runnerLines = workflow
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => line.startsWith("runs-on: "));

assert.deepEqual(
  [...new Set(runnerLines)],
  ["runs-on: ubuntu-24.04"],
  "todos los jobs deben fijar ubuntu-24.04"
);

for (const token of [
  'workflows:\n      - "Azure Static Web Apps CI/CD"',
  "github.event.workflow_run.conclusion == 'success'",
  'cron: "17 5 * * 1-5"',
  "workflow_dispatch:",
  "pull_request:",
  "runs: 5",
  "uploadArtifacts: true",
  "temporaryPublicStorage: false",
  "https://onionsupport.com/",
  "https://onionsupport.com/login",
  "https://onionsupport.com/reparacion-ordenadores",
  'LIGHTHOUSE_EXPECTED_SAMPLES: "5"',
  "node .github/scripts/performance-monitor-contract.mjs",
  'node .github/scripts/lighthouse-indexing-contract.mjs "${LIGHTHOUSE_RESULTS_PATH}"',
  '- ".github/scripts/lighthouse-indexing-contract.mjs"',
  "node .github/scripts/lighthouse-summary.mjs",
]) {
  assert.ok(
    workflow.includes(token),
    `falta contrato del monitor: ${token}`
  );
}

assert.doesNotMatch(
  workflow,
  /temporaryPublicStorage:\s+true/u,
  "los informes no pueden subirse a almacenamiento público temporal"
);

assert.doesNotMatch(
  workflow,
  /\b(?:write|admin):\s*(?:write|admin)\b/u,
  "el monitor debe conservar permisos read-only"
);

assert.doesNotMatch(
  workflow,
  /secrets\./u,
  "el monitor público no debe depender de secretos"
);

const loginSeoAudits = [
  "document-title", "meta-description", "http-status-code", "link-text",
  "crawlable-anchors", "robots-txt", "image-alt", "hreflang", "canonical",
];

function assertionsForUrl(config, url) {
  const matching = config.ci.assert.assertMatrix.filter((entry) =>
    new RegExp(entry.matchingUrlPattern).test(url));
  const rules = {};
  // LHCI applies every matching entry; entries do not override each other.
  for (const entry of matching) {
    for (const [audit, rule] of Object.entries(entry.assertions)) {
      assert.ok(!Object.hasOwn(rules, audit), `${url}: assertion duplicada ${audit}`);
      rules[audit] = rule;
    }
  }
  return rules;
}

function validateRoutePolicy(label, config) {
  assert.deepEqual(Object.keys(config.ci.assert), ["assertMatrix"],
    `${label}: assertMatrix no puede mezclarse con assertions/preset globales`);
  assert.equal(config.ci.assert.assertMatrix.length, 3,
    `${label}: deben existir reglas comunes, SEO público y SEO de acceso`);

  const commonRules = {
    "categories:performance": ["warn", { minScore: label === "mobile" ? 0.92 : 0.94, aggregationMethod: "median-run" }],
    "categories:accessibility": ["error", { minScore: 0.95, aggregationMethod: "median-run" }],
    "categories:best-practices": ["error", { minScore: 0.95, aggregationMethod: "median-run" }],
    "first-contentful-paint": ["warn", { maxNumericValue: 1800, aggregationMethod: "median-run" }],
    "largest-contentful-paint": ["warn", { maxNumericValue: 2500, aggregationMethod: "median-run" }],
    "cumulative-layout-shift": ["warn", { maxNumericValue: 0.1, aggregationMethod: "median-run" }],
    "total-blocking-time": ["warn", { maxNumericValue: 300, aggregationMethod: "median-run" }],
  };

  const routeCases = [
    ["/", false],
    ["/reparacion-ordenadores", false],
    ["/servicio-futuro", false],
    ["/login-ayuda", false],
    ["/login/ayuda", false],
    ["/?next=/login", false],
    ["/reparacion-ordenadores?next=/login", false],
    ["https://unexpected.example/", false],
    ["https://unexpected.example/login", false],
    ["https://unexpected.example/reparacion-ordenadores", false],
    ["/login", true],
    ["/login/", true],
    ["/login?next=/", true],
    ["/login/#acceso", true],
  ];

  for (const [route, login] of routeCases) {
    const url = route.startsWith("https://") ? route : `https://onionsupport.com${route}`;
    const rules = assertionsForUrl(config, url);
    for (const [audit, expected] of Object.entries(commonRules)) {
      assert.deepEqual(rules[audit], expected,
        `${label} ${route}: conservar nivel, umbral y agregación de ${audit}`);
    }

    if (login) {
      assert.ok(!Object.hasOwn(rules, "categories:seo"),
        `${label} ${route}: el SEO agregado presupone indexación pública`);
      assert.ok(!Object.hasOwn(rules, "is-crawlable"),
        `${label} ${route}: noindex se verifica en el contrato de LHR; LHCI no admite maxScore`);
      for (const audit of loginSeoAudits) {
        assert.deepEqual(rules[audit], ["error", { minScore: 1, aggregationMethod: "median-run" }],
          `${label} ${route}: conservar la auditoría SEO aplicable ${audit}`);
      }
    } else {
      assert.deepEqual(rules["categories:seo"], ["error", { minScore: 0.95, aggregationMethod: "median-run" }],
        `${label} ${route}: SEO público debe conservar error >= 0.95`);
    }
  }
}

for (const [label, config] of [
  ["mobile", mobile],
  ["desktop", desktop],
]) {
  validateRoutePolicy(label, config);

  const weakenedPublic = structuredClone(config);
  const publicEntry = weakenedPublic.ci.assert.assertMatrix.find((entry) => entry.assertions["categories:seo"]);
  publicEntry.assertions["categories:seo"][1].minScore = 0.94;
  assert.throws(() => validateRoutePolicy(label, weakenedPublic), /SEO público/u,
    `${label}: el contrato debe rechazar un umbral SEO público debilitado`);

  const missingLoginAudit = structuredClone(config);
  const loginEntry = missingLoginAudit.ci.assert.assertMatrix.find((entry) => entry.assertions["document-title"]);
  delete loginEntry.assertions["document-title"];
  assert.throws(() => validateRoutePolicy(label, missingLoginAudit), /auditoría SEO aplicable/u,
    `${label}: el contrato debe rechazar auditorías de acceso desactivadas`);

  const flags = String(
    config?.ci?.collect?.settings?.chromeFlags || ""
  );

  assert.match(
    flags,
    /--no-sandbox/u,
    `${label}: Chrome debe conservar --no-sandbox`
  );

  assert.match(
    flags,
    /--disable-dev-shm-usage/u,
    `${label}: Chrome debe conservar --disable-dev-shm-usage`
  );
}

assert.equal(
  mobile?.ci?.collect?.settings?.formFactor,
  "mobile",
  "el perfil mobile debe fijar formFactor=mobile"
);

assert.equal(
  desktop?.ci?.collect?.settings?.preset,
  "desktop",
  "el perfil desktop debe usar preset=desktop"
);

const noindexReport = {
  requestedUrl: "https://onionsupport.com/login",
  finalUrl: "https://onionsupport.com/login",
  audits: {
    "is-crawlable": {
      score: 0,
      details: { items: [
        { source: { type: "node", snippet: '<meta name="robots" content="noindex,follow" />' } },
        { source: "X-Robots-Tag: noindex, follow" },
      ] },
    },
  },
};
assert.equal(validateLoginIndexingReport(noindexReport), true);
for (const [label, mutate, message] of [
  ["indexable", (report) => { report.audits["is-crawlable"].score = 1; }, /is-crawlable=0/u],
  ["audit ausente", (report) => { delete report.audits["is-crawlable"]; }, /is-crawlable=0/u],
  ["sólo robots.txt", (report) => { report.audits["is-crawlable"].details.items = [{ source: { type: "source-location", url: "https://onionsupport.com/robots.txt" } }]; }, /evidencia HTML/u],
  ["HTTP ausente", (report) => { report.audits["is-crawlable"].details.items.pop(); }, /evidencia HTTP/u],
  ["nofollow", (report) => { report.audits["is-crawlable"].details.items[1].source = "X-Robots-Tag: noindex, nofollow"; }, /evidencia HTTP/u],
  ["bloqueo robots.txt adicional", (report) => { report.audits["is-crawlable"].details.items.push({ source: { type: "source-location", url: "https://onionsupport.com/robots.txt" } }); }, /no se permiten bloqueos/u],
  ["header contradictorio adicional", (report) => { report.audits["is-crawlable"].details.items.push({ source: "X-Robots-Tag: noindex, nofollow" }); }, /directivas contradictorias/u],
  ["redirección", (report) => { report.finalUrl = "https://onionsupport.com/"; }, /conservar su URL/u],
]) {
  const invalid = structuredClone(noindexReport);
  mutate(invalid);
  assert.throws(() => validateLoginIndexingReport(invalid), message,
    `la regresión ${label} debe bloquear el monitor`);
}

for (const token of [
  "onionsupport.lighthouse-summary.v2",
  "reportIdentity",
  "uniqueReportsByIdentity",
  "duplicatesIgnored",
  "expectedSamplesPerUrl",
  "Unexpected Lighthouse sample count",
  "performanceMedian",
  "performanceWorst",
  "lcpMedian",
  "lcpWorst",
  "clsMedian",
  "clsWorst",
  "tbtMedian",
  "tbtWorst",
  "GITHUB_STEP_SUMMARY",
]) {
  assert.ok(
    summary.includes(token),
    `falta contrato del resumen: ${token}`
  );
}

console.log(
  "Performance monitor contract OK · exact audited SHA source · strict immutable pin · 5 unique samples · mobile/desktop · public SEO >= 0.95 · login noindex + applicable SEO · unchanged performance budgets · private artifacts · read-only"
);
