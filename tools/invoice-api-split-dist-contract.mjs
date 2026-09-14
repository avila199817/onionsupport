import assert from "node:assert/strict";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SourceTextModule } from "node:vm";
import { gzipSync } from "node:zlib";
import { INVOICE_SPLIT_POLICY, invoiceApiSplitEnabled } from "./invoice-api-split.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE = resolve(process.env.ONION_CANDIDATE_SOURCE_DIR || ROOT);
const DIST = resolve(ROOT, process.env.ONION_BUILD_OUT_DIR || "dist");
const JS_ROOT = resolve(DIST, "assets/js");
// R03/A01: remeasured production artifact 10196534557, run 34593129204,
// source b8e4ed28e7286d638528a36e36a0a9b1059c4430 (2026-09-11).
// Observed raw closures: app 156433, auth 62960, bootstrap/Home union 215407.
// Ceilings allow 1567 / 1040 / 2593 bytes (1.00% / 1.65% / 1.20%) for
// bounded maintenance, not another invoice graph. Groups overlap; never add
// them or interpret source bytes as latency. See the canonical cleanup log.
const BUDGETS = Object.freeze({ app: 158000, auth: 64000, bootstrapPublicHome: 218000 });

function staticImports(code, identifier) {
  // PARSE ONLY. Never link, evaluate or supply a dynamic-import callback.
  const parsed = new SourceTextModule(code, { identifier });
  assert.equal(parsed.status, "unlinked");
  return [...new Set(parsed.moduleRequests?.map((item) => item.specifier) ?? parsed.dependencySpecifiers)];
}

assert.deepEqual(staticImports('import a from "./a.js"; export { b } from "./b.js"; import("./lazy.js");', "fixture"), ["./a.js", "./b.js"]);
assert.throws(() => staticImports("import {", "invalid-fixture"), SyntaxError);
assert.deepEqual(staticImports('throw new Error("must never execute");', "parse-only-fixture"), []);

const graph = new Map();
for (const entry of readdirSync(JS_ROOT, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
  const file = resolve(JS_ROOT, entry.name);
  const stat = lstatSync(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), `Unexpected chunk entry: ${entry.name}`);
  assert.ok(entry.name.endsWith(".js"), `Unexpected non-JavaScript chunk: ${entry.name}`);
  const bytes = readFileSync(file);
  const code = bytes.toString("utf8");
  const imports = staticImports(code, entry.name).map((specifier) => {
    assert.ok(specifier.startsWith("./") && !/[?#\\]/.test(specifier), `Unexpected static import: ${specifier}`);
    const target = resolve(dirname(file), specifier);
    assert.ok(target.startsWith(`${JS_ROOT}${sep}`), `Import escapes chunk directory: ${specifier}`);
    return relative(JS_ROOT, target).split(sep).join("/");
  });
  graph.set(entry.name, { code, bytes: bytes.length, gzip6: gzipSync(bytes, { level: 6 }).length, imports });
}
for (const [file, value] of graph) for (const dependency of value.imports) {
  assert.ok(graph.has(dependency), `Missing chunk: ${file} -> ${dependency}`);
}

function one(prefix, accepts = () => true) {
  const files = [...graph.keys()].filter((file) => file.startsWith(prefix) && accepts(graph.get(file)));
  assert.equal(files.length, 1, `Expected one ${prefix} entry; got ${files.length}`);
  return files[0];
}
function closure(roots) {
  const seen = new Set();
  function visit(file) {
    if (seen.has(file)) return;
    seen.add(file);
    for (const dependency of graph.get(file).imports) visit(dependency);
  }
  roots.forEach(visit);
  const files = [...seen].sort();
  return {
    roots, files,
    bytes: files.reduce((total, file) => total + graph.get(file).bytes, 0),
    gzip6: files.reduce((total, file) => total + graph.get(file).gzip6, 0),
  };
}

const app = one("app-");
const auth = one("auth-");
const groups = {
  app: closure([app]),
  auth: closure([auth]),
  bootstrapPublicHome: closure([one("main-"), app, one("enhancements-"), one("home-", (item) => item.code.includes("public.home"))]),
};
const enabled = invoiceApiSplitEnabled(SOURCE);
assert.equal(existsSync(resolve(DIST, INVOICE_SPLIT_POLICY)), false, "Build policy must not be published.");
if (enabled) {
  const invoice = one("invoice-api-");
  for (const [name, group] of Object.entries(groups)) {
    assert.ok(!group.files.includes(invoice), `Invoice API leaked into ${name}'s static graph.`);
    assert.ok(!group.files.some((file) => basename(file).startsWith("facturas.api-")), `Legacy invoice API leaked into ${name}.`);
  }
}
for (const [name, group] of Object.entries(groups)) {
  assert.ok(group.bytes <= BUDGETS[name], `${name}: ${group.bytes} raw bytes exceeds measured baseline ${BUDGETS[name]}.`);
}
console.log("Invoice API static graph contract: PASS");
console.log(JSON.stringify({ schema: "onionsupport.startup-graph.v1", node: process.version, zlib: process.versions.zlib, enabled, method: "parse-only static transitive closure including roots; per-file gzip level 6; overlapping groups are not additive", groups }, null, 2));
