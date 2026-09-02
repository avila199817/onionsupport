import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const KNOWN_SETUP_NODE_PINS = Object.freeze([
  "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
  "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
]);

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

assert.equal(
  workflow.split("actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803").length - 1,
  2,
  "checkout trusted debe aparecer 2 veces"
);
const setupPins = KNOWN_SETUP_NODE_PINS.filter((pin) => workflow.includes(pin));
assert.equal(setupPins.length, 1, "Lighthouse debe usar exactamente un setup-node de migración conocido");
assert.equal(
  workflow.split(setupPins[0]).length - 1,
  2,
  "setup-node trusted debe aparecer 2 veces"
);
assert.equal(
  workflow.split("treosh/lighthouse-ci-action@3e7e23fb74242897f95c0ba9cabad3d0227b9b18").length - 1,
  1,
  "Lighthouse action trusted debe aparecer una vez"
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

function assertions(config) {
  return config?.ci?.assert?.assertions || {};
}

for (const [label, config] of [
  ["mobile", mobile],
  ["desktop", desktop],
]) {
  const rules = assertions(config);

  for (const category of [
    "categories:performance",
    "categories:accessibility",
    "categories:best-practices",
    "categories:seo",
  ]) {
    assert.ok(
      Array.isArray(rules[category]),
      `${label}: falta assertion ${category}`
    );
  }

  for (const metric of [
    "first-contentful-paint",
    "largest-contentful-paint",
    "cumulative-layout-shift",
    "total-blocking-time",
  ]) {
    assert.ok(
      Array.isArray(rules[metric]),
      `${label}: falta assertion ${metric}`
    );
  }

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

const mobileRules = assertions(mobile);
const desktopRules = assertions(desktop);

assert.equal(mobileRules["categories:performance"]?.[1]?.minScore, 0.92, "mobile performance warning budget must be 0.92");
assert.equal(mobileRules["first-contentful-paint"]?.[1]?.maxNumericValue, 1800, "mobile FCP warning budget must be 1800ms");
assert.equal(mobileRules["largest-contentful-paint"]?.[1]?.maxNumericValue, 2500, "mobile LCP warning budget must be 2500ms");
assert.equal(mobileRules["total-blocking-time"]?.[1]?.maxNumericValue, 300, "mobile TBT warning budget must be 300ms");
for (const [label, metricRules] of [["mobile", mobileRules], ["desktop", desktopRules]]) {
  assert.equal(metricRules["cumulative-layout-shift"]?.[1]?.maxNumericValue, 0.1, `${label}: CLS warning budget must stay at 0.1`);
  assert.ok(metricRules["largest-contentful-paint"]?.[1]?.maxNumericValue <= 2500, `${label}: LCP warning budget cannot exceed 2500ms`);
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
  "Performance monitor contract OK · immutable migration pin · 5 unique samples · deduplicated · mobile/desktop · private artifacts · read-only"
);