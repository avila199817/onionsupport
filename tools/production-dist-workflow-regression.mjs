import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
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
  "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
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
  "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
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

/* =========================================================
   Production verification must reason about immutable identities, never about a moving
   main. The gate used to expect production to serve `github.event.pull_request.base.sha`
   -- the tip of main when the PR event was minted -- which is not a revision production
   was necessarily ever asked to serve: the deploy declares paths-ignore for .github/** and
   docs/**, so a tip can be skipped entirely, and a deploy that will happen has not happened
   yet. That produced false reds attributed to unrelated pull requests.
========================================================= */

for (const token of [
  "Capture deployed production baseline",
  "actions: read",
  "status=success&per_page=1",
  "Classify production verification outcome",
  "production-baseline-policy.mjs",
  "superseded-by-newer-verified-main",
  "Bind reproducible rebuild to the deployed artifact",
  "EXPECTED_MANIFEST_DIGEST: ${{ steps.digest.outputs.digest }}",
  "run-id: ${{ github.event.workflow_run.id }}",
]) {
  assert.ok(
    verificationWorkflow.includes(token),
    `Immutable-identity production gate missing: ${token}`
  );
}

assert.doesNotMatch(
  verificationWorkflow,
  /pull_request\.base\.sha/,
  "The production gate must never expect production to serve a pull request's base tip."
);

assert.doesNotMatch(
  verificationWorkflow,
  /TRUSTED_SHA:[^\n]*github\.sha/,
  "The production gate must never expect production to serve the current branch tip."
);

{
  const order = [
    "Capture deployed production baseline",
    "Resolve trusted verification revision",
    "Verify canonical compiled bytes exactly",
    "Classify production verification outcome",
  ].map((name) => verificationWorkflow.indexOf(name));

  for (let i = 1; i < order.length; i += 1) {
    assert.ok(
      order[i - 1] >= 0 && order[i] > order[i - 1],
      "The baseline is captured before it is trusted, compared and classified."
    );
  }

  const classify = verificationWorkflow
    .split("- name: Classify production verification outcome", 2)[1]
    .split("\n      - name:", 1)[0];
  assert.doesNotMatch(
    classify,
    /continue-on-error/u,
    "The classification is the verdict: it may never be allowed to fail silently."
  );
  assert.ok(
    classify.includes("exit 1"),
    "A production that matches neither the baseline nor a newer deploy must fail the run."
  );
}

/* =========================================================
   THE CLASSIFIER IS WORKFLOW BOOKKEEPING, NOT VERIFICATION CODE

   Two checkouts, two jobs. `verification-tooling/` is pinned to the trusted, already
   deployed revision because it holds the code that INSPECTS production; pointing it at the
   candidate would let a pull request grade itself. `workflow-tooling/` is the workflow's own
   revision and holds only the code that INTERPRETS this run's bookkeeping -- two run ids and
   one boolean -- never touching production.

   The classifier is the second kind, and importing it from the first is a bootstrapping
   error, not a policy choice: the trusted revision is by construction the one already
   deployed, so it predates every module this run introduces, and the step dies with
   ERR_MODULE_NOT_FOUND. That is exactly how it failed once.
========================================================= */

{
  const CLASSIFIER = "tools/production-baseline-policy.mjs";
  assert.ok(
    verificationWorkflow.includes(`./workflow-tooling/${CLASSIFIER}`),
    "The skew classifier must be imported from the workflow's own checkout."
  );
  assert.ok(
    !verificationWorkflow.includes(`verification-tooling/${CLASSIFIER}`),
    "The skew classifier must never be imported from the trusted revision: that revision is " +
      "the one already deployed, so it predates the module and the step cannot resolve it."
  );

  const stepBlock = (name) =>
    verificationWorkflow.split(`- name: ${name}`, 2)[1].split("\n      - name:", 1)[0];

  const workflowTooling = stepBlock("Checkout workflow-owned policy");
  assert.ok(
    workflowTooling.includes("path: workflow-tooling"),
    "The workflow-owned policy checkout must land in workflow-tooling/."
  );
  assert.doesNotMatch(
    workflowTooling,
    /^\s+ref:/mu,
    "The workflow-owned policy checkout carries no ref: it is this workflow's own revision."
  );

  const verifierTooling = stepBlock("Checkout verifier tooling");
  assert.ok(
    verifierTooling.includes("ref: ${{ steps.trust.outputs.sha }}"),
    "The verifier tooling stays pinned to the trusted revision: it inspects production."
  );

  // Whatever leg classifies must also have checked the policy out, or the import cannot resolve.
  const GUARD = "github.event_name != 'workflow_run'";
  assert.ok(
    workflowTooling.includes(`if: ${GUARD}`),
    "The workflow-owned policy checkout is gated on the leg that classifies."
  );
  assert.ok(
    stepBlock("Classify production verification outcome").includes(GUARD),
    "The classification runs only on the leg that checked the policy out."
  );
}

// Exercise the actual workflow adapter against an already-deployed verifier that
// has the original Python API and no CLI support for --production-root.
{
  const googleStep = verificationWorkflow
    .split("- name: Verify Google measurement bootstrap exactly", 2)[1]
    ?.split("\n      - name:", 1)[0];
  assert.ok(googleStep, "The Google production verification step must remain present.");
  assert.match(googleStep, /RELEASE_MODE: \$\{\{ steps\.release\.outputs\.mode \}\}/,
    "Google verification must use the resolved production release mode.");
  const run = googleStep.match(/        run: \|\n([\s\S]*)/)?.[1];
  assert.ok(run, "The Google workflow adapter must have an executable run block.");
  const script = run.replace(/^ {10}/gm, "");
  const fixture = await mkdtemp(resolve(tmpdir(), "onion-google-workflow-"));
  const contractPath = ".github/scripts/google_measurement_contract.py";
  const cssPath = "src/analytics/google-consent.css";
  const sourceCss = ".consent { color: red; }\n";
  const compiledCss = ".consent{color:red}";
  const sourceRoot = resolve(fixture, "expected-main");
  const artifactRoot = resolve(fixture, "expected-artifact/dist");
  const callsPath = resolve(fixture, "calls.jsonl");
  const livePath = resolve(fixture, "deployed.css");
  const put = async (relative, contents) => {
    const path = resolve(fixture, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
  };
  try {
    await put(`verification-tooling/${contractPath}`, `
import json
import os
from pathlib import Path

def _record(kind, root, **kwargs):
    with open(os.environ["GOOGLE_FIXTURE_CALLS"], "a") as calls:
        calls.write(json.dumps(dict(kind=kind, root=str(root), **kwargs)) + "\\n")

def validate_source(root):
    _record("source", root)
    return [] if (root / "source.marker").read_text() == "valid" else ["source rejected"]

def verify_production(root, base_url, revision, attempts, delay):
    _record("production", root, base_url=base_url, revision=revision, attempts=attempts, delay=delay)
    asset = root / "${cssPath}"
    if not asset.is_file():
        return ["production asset missing"]
    return [] if asset.read_bytes() == Path(os.environ["GOOGLE_FIXTURE_LIVE"]).read_bytes() else ["production bytes differ"]

if __name__ == "__main__":
    raise RuntimeError("The trusted legacy verifier has no new CLI argument")
`);
    for (const checkout of ["workflow-tooling", "expected-main", "candidate"]) {
      await put(`${checkout}/${contractPath}`, 'raise RuntimeError("candidate verifier must never execute")\n');
    }
    await put(`expected-main/${cssPath}`, sourceCss);
    await put("expected-main/source.marker", "valid");
    await put(`expected-artifact/dist/${cssPath}`, compiledCss);

    const invoke = async (mode, deployedCss) => {
      await writeFile(callsPath, "");
      await writeFile(livePath, deployedCss);
      const result = spawnSync("bash", ["-c", script], {
        cwd: fixture,
        env: {
          ...process.env,
          RELEASE_MODE: mode,
          PUBLIC_SITE_URL: "https://production.invalid",
          EXPECTED_SHA: "a".repeat(40),
          GOOGLE_FIXTURE_CALLS: callsPath,
          GOOGLE_FIXTURE_LIVE: livePath,
        },
        encoding: "utf8",
      });
      assert.ifError(result.error);
      const calls = (await readFile(callsPath, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
      return { ...result, calls };
    };
    const productionCall = (root) => ({
      kind: "production", root, base_url: "https://production.invalid",
      revision: "a".repeat(40), attempts: 3, delay: 5,
    });
    const compiled = await invoke("compiled-dist", compiledCss);
    assert.equal(compiled.status, 0, compiled.stderr);
    assert.deepEqual(compiled.calls, [{ kind: "source", root: sourceRoot }, productionCall(artifactRoot)],
      "Compiled releases validate source wiring and compare the artifact's emitted bytes.");
    const legacy = await invoke("legacy-root", sourceCss);
    assert.equal(legacy.status, 0, legacy.stderr);
    assert.deepEqual(legacy.calls, [{ kind: "source", root: sourceRoot }, productionCall(sourceRoot)],
      "Legacy releases retain source-root byte comparison.");
    const unknownMode = await invoke("unknown", compiledCss);
    assert.equal(unknownMode.status, 1, unknownMode.stderr);
    assert.match(unknownMode.stderr, /Unknown release mode/);
    assert.deepEqual(unknownMode.calls, [], "Unknown release modes must fail before validation.");

    await put("expected-main/source.marker", "invalid");
    const invalidSource = await invoke("compiled-dist", compiledCss);
    assert.equal(invalidSource.status, 1, invalidSource.stderr);
    assert.match(invalidSource.stderr, /source rejected/);
    assert.deepEqual(invalidSource.calls, [{ kind: "source", root: sourceRoot }],
      "Invalid source must block production inspection.");
    await put("expected-main/source.marker", "valid");

    const mismatch = await invoke("compiled-dist", sourceCss);
    assert.equal(mismatch.status, 1, mismatch.stderr);
    assert.match(mismatch.stderr, /production bytes differ/);
    await rm(resolve(artifactRoot, cssPath));
    const missing = await invoke("compiled-dist", compiledCss);
    assert.equal(missing.status, 1, missing.stderr);
    assert.match(missing.stderr, /production asset missing/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

console.log("Production dist workflow regression: PASS");
console.log("- build and browser validation run in the no-secret job");
console.log("- a fresh runner validates the exact artifact before token access");
console.log("- exact Azure-origin canonicalization and canonical bytes block production success");
console.log("- external verification supports legacy base PRs and compiled main");
console.log("- manual rollback is pinned to the verified legacy SHA");
console.log("- the production gate expects a deployed revision, never a moving branch tip");
console.log("- the skew classifier resolves from the workflow's own checkout, not the trusted one");
console.log("- Google verification uses the trusted API with separate source and emitted-byte roots");
