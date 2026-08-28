import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const workflow = await readFile(
  resolve(ROOT, ".github/workflows/azure-static-web-apps-polite-bay-086469a1e.yml"),
  "utf8"
);
const verificationWorkflow = await readFile(
  resolve(ROOT, ".github/workflows/production-verification.yml"),
  "utf8"
);

function jobSection(name, nextName = "") {
  const start = workflow.indexOf(`  ${name}:\n`);
  const end = nextName
    ? workflow.indexOf(`  ${nextName}:\n`, start + 1)
    : workflow.length;
  assert.ok(start >= 0 && end > start, `Workflow job boundary missing: ${name}`);
  return workflow.slice(start, end);
}

const validateJob = jobSection("validate", "deploy_production");
const deployJob = jobSection("deploy_production");
const originStep = deployJob.slice(
  deployJob.indexOf("Verify Azure production origin canonicalizes exactly"),
  deployJob.indexOf("Verify canonical dist bytes")
);

assert.match(
  workflow,
  /PRODUCTION_RELEASE_CONTRACT: "compiled-dist-v1"/,
  "The rollout-aware production contract marker is missing."
);

for (const token of [
  'node-version: "22.23.2"',
  "corepack prepare npm@10.9.8 --activate",
  "npm ci --ignore-scripts --no-audit --no-fund",
  "npm run validate:ci",
  "Materialize exact production artifact",
  "candidate/production-artifact/dist",
  "candidate/production-artifact/build-metadata",
  "actions/upload-artifact@330a01c490aca151604b8cf639adc76d48f6c5d4",
]) {
  assert.ok(validateJob.includes(token), `Secretless production build contract missing: ${token}`);
}
assert.doesNotMatch(
  validateJob,
  /\$\{\{\s*secrets\./,
  "The production build job must not receive repository secrets."
);
assert.ok(
  validateJob.indexOf("npm run validate:ci") <
    validateJob.indexOf("Materialize exact production artifact") &&
  validateJob.indexOf("Materialize exact production artifact") <
    validateJob.indexOf("Upload exact production artifact"),
  "Validation, exact-envelope materialization and upload must remain ordered."
);

for (const token of [
  "actions/download-artifact@018cc2cf5baa6db3ef3c5f8a56943fffe632ef53",
  "artifact-ids: ${{ needs.validate.outputs.production_artifact_id }}",
  "Validate exact production artifact before token access",
  "node tools/verify-artifact-envelope.mjs",
  "app_location: ${{ env.APP_LOCATION }}",
  "skip_app_build: true",
  "Verify Azure production origin canonicalizes exactly",
  "for attempt in $(seq 1 8)",
  "--dump-header -",
  'if [[ "${status}" != "301" ]]',
  '[[ "${location}" != "${expected}" ]]',
  "node tools/verify-deployed-dist.mjs",
  "bash \"${RUNNER_TEMP}/verify_production.sh\"",
]) {
  assert.ok(deployJob.includes(token), `Production deploy contract missing: ${token}`);
}
assert.ok(
  workflow.includes('AZURE_PRODUCTION_ORIGIN: "https://polite-bay-086469a1e.1.azurestaticapps.net"'),
  "The production Azure origin must remain pinned exactly."
);
assert.doesNotMatch(
  originStep,
  /--location|redirect:\s*["']follow["']/,
  "Azure-origin verification must prove the single redirect without following it."
);
assert.doesNotMatch(
  deployJob,
  /npm (?:ci|install|run (?:build|validate:ci|test:browser:dist))/,
  "The fresh runner receiving the Azure token must not execute the production build."
);

const downloadIndex = deployJob.indexOf("Download exact production artifact by ID");
const envelopeIndex = deployJob.indexOf("Validate exact production artifact before token access");
const tokenIndex = deployJob.indexOf("Validate deployment token");
const deployIndex = deployJob.indexOf("Deploy compiled static SPA");
const originIndex = deployJob.indexOf("Verify Azure production origin canonicalizes exactly");
const canonicalBytesIndex = deployJob.indexOf("Verify canonical dist bytes");
const productionIndex = deployJob.indexOf("Verify production security, routing and backend");
assert.ok(
  downloadIndex >= 0 && envelopeIndex > downloadIndex && tokenIndex > envelopeIndex &&
  deployIndex > tokenIndex && originIndex > deployIndex && canonicalBytesIndex > originIndex &&
  productionIndex > canonicalBytesIndex,
  "Download, envelope gate, token, deploy, Azure redirect and canonical byte gate changed."
);

for (const token of [
  "deployment_mode:",
  "- compiled-dist",
  "- legacy-root",
  "KNOWN_GOOD_LEGACY_SHA: edbdf2429b85a3de405d18aa58bd85eb319bd6de",
  'app_location="/"',
  "if: env.DEPLOYMENT_MODE == 'legacy-root'",
  "Verify known-good legacy canonical bytes",
  "DEPLOYED_URL: ${{ env.PUBLIC_SITE_URL }}",
  "VERIFY_CANONICAL: \"false\"",
]) {
  assert.ok(workflow.includes(token), `Known-good rollback contract missing: ${token}`);
}
assert.ok(
  (workflow.match(/edbdf2429b85a3de405d18aa58bd85eb319bd6de/g) || []).length >= 3,
  "Rollback SHA must bind checkout, expected revision and the runtime assertion."
);

for (const token of [
  "Resolve expected production release contract",
  'PRODUCTION_RELEASE_CONTRACT: \"compiled-dist-v1\"',
  'APP_LOCATION: \"/\"',
  "if: steps.release.outputs.mode == 'legacy-root'",
  "Verify deployed legacy production strictly",
  "if: steps.release.outputs.mode == 'compiled-dist'",
  "Rebuild expected compiled production",
  "npm run test:browser:dist",
  "Materialize exact expected compiled artifact",
  'artifact="${GITHUB_WORKSPACE}/expected-artifact"',
  'cp -a expected-main/dist "${artifact}/dist"',
  'cp -a expected-main/build-metadata "${artifact}/build-metadata"',
  "ONION_ARTIFACT_DIR=\"${artifact}\"",
  "node verification-tooling/tools/verify-artifact-envelope.mjs",
  "ONION_ARTIFACT_DIR: ${{ github.workspace }}/expected-artifact",
  "Verify canonical compiled bytes exactly",
  "node verification-tooling/tools/verify-deployed-dist.mjs",
  "Verify compiled production security, routing and backend",
]) {
  assert.ok(
    verificationWorkflow.includes(token),
    `Rollout-aware external production gate missing: ${token}`
  );
}
assert.doesNotMatch(
  verificationWorkflow,
  /ONION_ARTIFACT_DIR:\s*\$\{\{ github\.workspace \}\}\/expected-main/,
  "The external compiled verifier must never treat the source checkout as an artifact envelope."
);

console.log("Production dist workflow regression: PASS");
console.log("- build and browser validation run in the no-secret job");
console.log("- a fresh runner validates the exact artifact before token access");
console.log("- exact Azure-origin canonicalization and canonical bytes block production success");
console.log("- external verification supports legacy base PRs and compiled main");
console.log("- manual rollback is pinned to the verified legacy SHA");
