import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE = resolve(process.env.ONION_CANDIDATE_SOURCE_DIR || ROOT);
const SELF = "tools/repository-cleanup-contract.mjs";
const RECORD = "docs/releases/2026-09-11-repository-cleanup.md";
const RETIRED = Object.freeze([
  { id: "A02", path: "src/features/incidencias-user-update-turn/index.js", tokens: ["incidencias-user-update-turn", "onion-user-update-turn"] },
  { id: "A03", path: "src/features/incidencias-detail-experience/index.js", tokens: ["incidencias-detail-experience"] },
]);
const normalize = (text) => String(text).toLowerCase().replace(/[^a-z0-9]/g, "");

function auditReferences(files, retired = RETIRED) {
  const findings = [];
  for (const item of retired) {
    if (files.some((file) => file.path === item.path)) findings.push(`${item.id}: retired file present: ${item.path}`);
    for (const file of files) {
      if (file.path === SELF || file.path === RECORD || file.path === item.path) continue;
      const haystack = normalize(`${file.path}\n${file.text}`);
      if (item.tokens.some((token) => haystack.includes(normalize(token)))) {
        findings.push(`${item.id}: reference requires review: ${file.path}`);
      }
    }
  }
  return findings;
}

function selfTest() {
  const retired = [{ id: "fixture", path: "src/old-feature.js", tokens: ["OldFeature"] }];
  assert.deepEqual(auditReferences([{ path: "src/live.js", text: "export const live = true;" }], retired), []);
  for (const text of ['import("./old-feature.js")', 'registry["old-feature"]', "mountOldFeature()", '"old-" + "feature"', '<script src="old-feature.js"></script>']) {
    assert.equal(auditReferences([{ path: "consumer.js", text }], retired).length, 1);
  }
  assert.equal(auditReferences([{ path: "src/old-feature.js", text: "" }], retired).length, 1);
  assert.equal(auditReferences([{ path: "docs/runbook.md", text: "apply old-feature" }], retired).length, 1);
  assert.deepEqual(auditReferences([{ path: RECORD, text: "old-feature removed with evidence" }], retired), []);
  assert.deepEqual(auditReferences([{ path: SELF, text: "OldFeature" }], retired), []);
}

selfTest();
if (!process.argv.includes("--self-test")) {
  const git = (...args) => execFileSync("git", ["-C", SOURCE, ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  const sha = git("rev-parse", "HEAD").trim();
  assert.match(sha, /^[a-f0-9]{40}$/);
  const entries = git("ls-files", "-s", "-z").split("\0").filter(Boolean);
  const files = [];
  const totals = { trackedFiles: 0, sourceBytes: 0, runtimeJsFiles: 0, runtimeJsLines: 0, runtimeCssFiles: 0, runtimeCssLines: 0 };
  const extensions = {};
  for (const entry of entries) {
    const tab = entry.indexOf("\t");
    assert.ok(tab > 0, "Malformed tracked entry");
    const [mode, blob, stage] = entry.slice(0, tab).split(" ");
    const path = entry.slice(tab + 1);
    assert.ok(["100644", "100755"].includes(mode) && stage === "0", `Unsafe tracked entry: ${path}`);
    const absolute = resolve(SOURCE, path);
    const stat = lstatSync(absolute);
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), `Nonregular source: ${path}`);
    const bytes = readFileSync(absolute);
    const actualBlob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    assert.equal(actualBlob, blob, `Source differs from tracked Git blob: ${path}`);
    const text = bytes.includes(0) ? "" : bytes.toString("utf8");
    files.push({ path, text });
    totals.trackedFiles += 1;
    totals.sourceBytes += bytes.length;
    const extension = extname(path) || "(none)";
    extensions[extension] = (extensions[extension] || 0) + 1;
    if (path.startsWith("src/") && [".js", ".css"].includes(extension)) {
      const kind = extension === ".js" ? "Js" : "Css";
      totals[`runtime${kind}Files`] += 1;
      totals[`runtime${kind}Lines`] += text ? text.split(/\r?\n/).length - (text.endsWith("\n") ? 1 : 0) : 0;
    }
  }
  for (const item of RETIRED) assert.equal(existsSync(resolve(SOURCE, item.path)), false, `${item.id}: retired source exists`);
  assert.deepEqual(auditReferences(files), [], "Retired reference reintroduced; inspect consumers rather than weakening this check");
  const pkg = JSON.parse(readFileSync(resolve(SOURCE, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies || {}), [], "Frontend runtime dependency baseline changed; review explicitly");
  assert.deepEqual(Object.keys(pkg.devDependencies || {}).sort(), ["playwright-core", "vite"], "Development dependency baseline changed; review explicitly");
  console.log("Repository cleanup contract: PASS");
  console.log(JSON.stringify({ schema: "onionsupport.cleanup-inventory.v1", sha, node: process.version, method: "all tracked blobs verified; physical lines include blanks/comments; source excludes .git, node_modules and untracked outputs", ...totals, extensions, retired: RETIRED.map(({ id, path }) => ({ id, path })), referenceMatches: 0 }, null, 2));
} else {
  console.log("Repository cleanup reference self-tests: PASS");
}
