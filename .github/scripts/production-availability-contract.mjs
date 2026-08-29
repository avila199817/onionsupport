import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflowPath = path.join(ROOT, ".github/workflows/production-availability.yml");
const repoIntegrityPath = path.join(ROOT, ".github/workflows/repo-integrity.yml");
const probePath = path.join(ROOT, ".github/scripts/production-availability-probe.mjs");
const incidentPath = path.join(ROOT, ".github/scripts/production-availability-incident.mjs");

for (const requiredPath of [workflowPath, repoIntegrityPath, probePath, incidentPath]) {
  assert.ok(fs.existsSync(requiredPath), `falta archivo de disponibilidad: ${path.relative(ROOT, requiredPath)}`);
}

const workflow = fs.readFileSync(workflowPath, "utf8");
const repoIntegrity = fs.readFileSync(repoIntegrityPath, "utf8");
const probe = fs.readFileSync(probePath, "utf8");
const incident = fs.readFileSync(incidentPath, "utf8");

for (const scriptPath of [probePath, incidentPath]) {
  const checked = spawnSync(process.execPath, ["--check", scriptPath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(
    checked.status,
    0,
    `${path.relative(ROOT, scriptPath)} tiene sintaxis inválida: ${checked.stderr || checked.stdout}`
  );
}

const actionLines = workflow
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => line.startsWith("uses: "));

assert.equal(actionLines.length, 5, "el monitor debe usar exactamente cinco actions fijadas");
for (const line of actionLines) {
  const reference = line.slice("uses: ".length).split(/\s+#/u)[0].trim();
  assert.match(reference, /@[0-9a-f]{40}$/u, `action no fijada a SHA: ${reference}`);
}

for (const [token, expected] of Object.entries({
  "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803": 2,
  "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e": 2,
  "actions/upload-artifact@330a01c490aca151604b8cf639adc76d48f6c5d4": 1,
})) {
  assert.equal(
    workflow.split(token).length - 1,
    expected,
    `${token} debe aparecer ${expected} vez/veces`
  );
}

const runnerLines = workflow
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => line.startsWith("runs-on: "));
assert.deepEqual(
  [...new Set(runnerLines)],
  ["runs-on: ubuntu-24.04"],
  "todos los jobs de disponibilidad deben fijar ubuntu-24.04"
);

for (const token of [
  "name: Production Availability Monitor",
  'cron: "*/15 * * * *"',
  'workflows:\n      - "Azure Static Web Apps CI/CD"',
  "workflow_dispatch:",
  "pull_request:",
  "github.event_name != 'pull_request'",
  "issues: write",
  "continue-on-error: true",
  'PUBLIC_SITE_URL: https://onionsupport.com',
  'PROBE_ROUNDS: "3"',
  'PROBE_MIN_SUCCESS_ROUNDS: "2"',
  'PROBE_DELAY_MS: "15000"',
  "node .github/scripts/production-availability-probe.mjs",
  "node .github/scripts/production-availability-incident.mjs",
  "if: steps.availability.outcome == 'failure'",
  "retention-days: 7",
  "cancel-in-progress: false",
]) {
  assert.ok(workflow.includes(token), `falta contrato del workflow de disponibilidad: ${token}`);
}

assert.doesNotMatch(workflow, /secrets\./u, "el monitor no puede depender de secretos de despliegue");
assert.doesNotMatch(
  workflow,
  /workflow_dispatch:[\s\S]{0,500}deployment_mode/u,
  "el monitor no puede exponer ni invocar modos de redeploy"
);

for (const token of [
  'const SCHEMA = "onionsupport.production-availability.v1"',
  'const PAGE_PATHS = Object.freeze(["/", "/login"]);',
  '"x-azure-ref"',
  '"x-ms-request-id"',
  '"x-msedge-ref"',
  '"retry-after"',
  "persistent503",
  "PROBE_MIN_SUCCESS_ROUNDS",
  "MAX_DISCOVERED_RESOURCES",
  "onion_availability_probe",
  "Unexpected Content-Type",
  "production-availability-report.json",
]) {
  assert.ok(probe.includes(token), `falta contrato del probe: ${token}`);
}

assert.doesNotMatch(probe, /child_process|exec\(|spawn\(/u, "el probe no puede ejecutar procesos externos");
assert.doesNotMatch(probe, /GITHUB_TOKEN|Authorization/u, "el probe público no puede usar credenciales");

for (const token of [
  'const INCIDENT_MARKER = "<!-- onionsupport-production-availability-v1 -->"',
  'const INCIDENT_TITLE = "[PRODUCTION-AVAILABILITY] Recursos estáticos no disponibles"',
  "GITHUB_TOKEN",
  'method: "POST"',
  'method: "PATCH"',
  'state_reason: "completed"',
  "No ejecuta redeploys ni reintentos de publicación a ciegas",
  "x-azure-ref",
  "retry-after",
]) {
  assert.ok(incident.includes(token), `falta contrato del gestor de incidente: ${token}`);
}

assert.doesNotMatch(
  incident,
  /static-web-apps-deploy|workflow_dispatch|actions\/workflows/u,
  "el gestor de incidentes no puede desplegar ni disparar workflows"
);

assert.ok(
  repoIntegrity.includes("node .github/scripts/production-availability-contract.mjs"),
  "Repository Integrity debe ejecutar el contrato de disponibilidad"
);

console.log(
  "Production availability contract OK · 3 rounds · 2 required · asset graph · Azure headers · deduplicated incident · no blind redeploy"
);
