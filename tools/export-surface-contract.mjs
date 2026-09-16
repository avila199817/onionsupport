import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Exported surface: a name is exported because someone imports it, and the
// public surface of a swept directory does not grow by accident.
//
// Two invariants, one per column of BASELINE:
//
// - Every export of a swept directory has a consumer outside its module: a
//   static importer in src, or a reference by name anywhere else in the
//   repository (tooling, fixtures, HTML, docs, access by string, a module
//   imported dynamically in a browser page). A name used only inside its
//   own module is not an export; a name nobody uses is dead.
// - The number of exports of a swept directory equals its authorized
//   baseline. The real rule is "never grow the public surface by
//   accident": a feature that genuinely needs a new export raises the
//   baseline in the same commit, deliberately, and a sweep that removes
//   exports lowers it in the same commit. The number is a record of a
//   decision, not an architectural target: it is expected to move.
const BASELINE = Object.freeze({
  "src/ui/sidebar": 7,
  "src/ui/topbar": 10,
  "src/views/correo": 25,
  "src/views/clientes": 102,
  "src/views/cuenta": 53,
  "src/views/facturas": 153,
  "src/views/home": 75,
  "src/views/incidencias": 165,
  "src/views/server": 127,
  "src/views/usuarios": 160,
  "src/views/whatsapp": 9,
});
const SWEPT_DIRECTORIES = Object.freeze(Object.keys(BASELINE));
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SKIP = new Set(["node_modules", "dist", ".git", "build-metadata", "scratchpad"]);
function walk(dir, accept) {
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en")).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP.has(entry.name) || entry.name.startsWith(".onion-build") ? [] : walk(path, accept);
    return accept(path) ? [path] : [];
  });
}
const rel = (path) => relative(ROOT, path).split(sep).join("/");
// The reference corpus needs the whole repository. Some jobs build a partial
// checkout (the home comparison copies src, tools and the build config only);
// there the corpus cannot prove a name unused, so the check reports that it
// was skipped instead of failing on a directory that is not there.
const OPTIONAL_ROOTS = Object.freeze([
  ["tools", (p) => /\.(mjs|js|json|sh)$/u.test(p)],
  [".github", (p) => /\.(mjs|js|py|sh|yml|yaml|json)$/u.test(p)],
  ["docs", (p) => p.endsWith(".md")],
]);
const missingRoots = OPTIONAL_ROOTS.filter(([name]) => !existsSync(join(ROOT, name))).map(([name]) => name);
const codeFiles = walk(join(ROOT, "src"), (p) => p.endsWith(".js"));
const otherFiles = [
  ...OPTIONAL_ROOTS.filter(([name]) => existsSync(join(ROOT, name))).flatMap(([name, accept]) => walk(join(ROOT, name), accept)),
  ...readdirSync(ROOT).filter((n) => n.endsWith(".html") || n === "vite.config.js" || n === "package.json").map((n) => join(ROOT, n)),
];
const sources = new Map([...codeFiles, ...otherFiles].map((p) => [rel(p), readFileSync(p, "utf8")]));
const DECLARATION = /^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gmu;
const LIST = /^export\s*\{([^}]*)\}/gmu;
function exportedNames(source) {
  const names = new Set();
  for (const m of source.matchAll(DECLARATION)) names.add(m[1]);
  for (const m of source.matchAll(LIST)) for (const part of m[1].split(",")) { const name = part.trim().split(/\s+as\s+/u).pop(); if (name) names.add(name); }
  return names;
}
const violations = [];
const counts = Object.fromEntries(SWEPT_DIRECTORIES.map((directory) => [directory, 0]));
let checked = 0;
for (const directory of SWEPT_DIRECTORIES) {
  for (const [path, source] of sources) {
    if (!path.startsWith(`${directory}/`) || !path.endsWith(".js")) continue;
    for (const name of exportedNames(source)) {
      checked += 1;
      counts[directory] += 1;
      const word = new RegExp(`(?<![\\w$])${name.replace(/\$/gu, "\\$")}(?![\\w$])`, "u");
      const referencedElsewhere = [...sources].some(([other, text]) => other !== path && word.test(text));
      if (!referencedElsewhere) violations.push(`${path}#${name}`);
    }
  }
}
if (missingRoots.length) {
  console.log(`Export surface contract: SKIPPED · partial checkout without ${missingRoots.join(", ")} · ${checked} exports not verifiable here`);
  process.exit(0);
}
assert.deepEqual(violations, [], `every export of ${SWEPT_DIRECTORIES.join(", ")} has a consumer outside its module`);
const grown = SWEPT_DIRECTORIES.filter((directory) => counts[directory] > BASELINE[directory]).map((directory) => `${directory}: ${counts[directory]} > ${BASELINE[directory]}`);
assert.deepEqual(grown, [], "a swept directory grew its public surface: raise its baseline in this commit only if the new export is a deliberate API");
const shrunk = SWEPT_DIRECTORIES.filter((directory) => counts[directory] < BASELINE[directory]).map((directory) => `${directory}: ${counts[directory]} < ${BASELINE[directory]}`);
assert.deepEqual(shrunk, [], "a swept directory shrank: lower its baseline in this commit so the authorized surface stays honest");
console.log(`Export surface contract: PASS · ${checked} exports in ${SWEPT_DIRECTORIES.length} swept directories, each referenced outside its module and each directory on its authorized baseline (${SWEPT_DIRECTORIES.map((directory) => `${directory.split("/").pop()} ${counts[directory]}`).join(", ")})`);
