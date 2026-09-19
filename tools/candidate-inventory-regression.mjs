import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_CSS_POLICY } from "./public-css-minify.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const VALIDATOR = resolve(ROOT, "tools/validate-dist.mjs");
const SOURCE = resolve(String(process.env.ONION_CANDIDATE_SOURCE_DIR || ROOT));
const DIST = resolve(ROOT, process.env.ONION_BUILD_OUT_DIR || "dist");
const METADATA = resolve(ROOT, process.env.ONION_BUILD_METADATA_DIR || "build-metadata");
const RELEASE_SHA = String(
  process.env.ONION_RELEASE_SHA || process.env.GITHUB_SHA || execFileSync(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: ROOT, encoding: "utf8" }
  )
).trim();

const EXACT_FILES = Object.freeze([
  "staticwebapp.config.json",
  "site.webmanifest",
  "robots.txt",
  "sitemap.xml",
  "favicon.ico",
  "ad1f6102f1914986b540f6a34bf6939b.txt",
]);
const COMPATIBILITY_DIRECTORIES = Object.freeze([
  "src/analytics",
  "src/css",
  "src/media",
  "src/preboot",
]);

function runValidator(candidateSource) {
  return spawnSync(process.execPath, [VALIDATOR], {
    cwd: ROOT,
    env: {
      ...process.env,
      ONION_BUILD_OUT_DIR: DIST,
      ONION_BUILD_METADATA_DIR: METADATA,
      ONION_CANDIDATE_SOURCE_DIR: candidateSource,
      ONION_RELEASE_SHA: RELEASE_SHA,
    },
    encoding: "utf8",
  });
}

const tempRoot = await mkdtemp(resolve(tmpdir(), "onion-candidate-inventory-"));
const candidate = resolve(tempRoot, "candidate-data");
try {
  await mkdir(candidate);
  for (const path of EXACT_FILES) {
    const destination = resolve(candidate, path);
    await mkdir(dirname(destination), { recursive: true });
    await cp(resolve(SOURCE, path), destination);
  }
  for (const path of COMPATIBILITY_DIRECTORIES) {
    await cp(resolve(SOURCE, path), resolve(candidate, path), { recursive: true });
  }
  try {
    await cp(resolve(SOURCE, PUBLIC_CSS_POLICY), resolve(candidate, PUBLIC_CSS_POLICY));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const baseline = runValidator(candidate);
  assert.equal(
    baseline.status,
    0,
    `Candidate inventory baseline failed:\n${baseline.stdout}${baseline.stderr}`
  );

  const publicCssPath = "src/css/views/public/index.css";
  const publicCss = await readFile(resolve(candidate, publicCssPath));
  await writeFile(resolve(candidate, publicCssPath), Buffer.concat([
    publicCss,
    Buffer.from("\n.integrity-probe { --candidate-tamper: 1; }\n"),
  ]));
  const alteredCss = runValidator(candidate);
  assert.notEqual(alteredCss.status, 0, "An allowlisted CSS change absent from dist was accepted.");
  assert.match(`${alteredCss.stdout}${alteredCss.stderr}`,
    /Dist static asset differs from trusted candidate transform: src\/css\/views\/public\/index\.css/);
  await writeFile(resolve(candidate, publicCssPath), publicCss);

  const addedPath = resolve(candidate, "src/css/__candidate_inventory_addition__.css");
  await writeFile(addedPath, ".candidate-inventory-addition{}\n", "utf8");
  const addition = runValidator(candidate);
  assert.notEqual(addition.status, 0, "A candidate compatibility addition absent from dist was accepted.");
  assert.match(
    `${addition.stdout}${addition.stderr}`,
    /Required dist file is missing: src\/css\/__candidate_inventory_addition__\.css/
  );

  await rm(addedPath);
  await rm(resolve(candidate, "src/css/core/noscript.css"));
  const removal = runValidator(candidate);
  assert.notEqual(removal.status, 0, "A stale compatibility file removed by candidate was accepted.");
  assert.match(
    `${removal.stdout}${removal.stderr}`,
    /Release path is outside the exact allowlist: src\/css\/core\/noscript\.css/
  );

  console.log("Candidate inventory regression: PASS (addition + removal + public CSS fidelity)");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
