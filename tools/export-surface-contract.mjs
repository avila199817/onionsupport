import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Exported surface: a name is exported because someone imports it. In the
// swept directories every export either has a static importer in src or is
// referenced by name somewhere else in the repository (tooling, HTML,
// docs, dynamic access by string); anything else is either used only inside
// its own module (then it is not an export) or dead (then it goes). The
// list of swept directories only grows; a swept directory never regresses.
const SWEPT_DIRECTORIES = Object.freeze(["src/ui/sidebar", "src/ui/topbar", "src/views/correo", "src/views/cuenta", "src/views/server", "src/views/whatsapp"]);
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
const codeFiles = walk(join(ROOT, "src"), (p) => p.endsWith(".js"));
const otherFiles = [...walk(join(ROOT, "tools"), (p) => /\.(mjs|js|json|sh)$/u.test(p)), ...walk(join(ROOT, ".github"), (p) => /\.(mjs|js|py|sh|yml|yaml|json)$/u.test(p)), ...walk(join(ROOT, "docs"), (p) => p.endsWith(".md")), ...readdirSync(ROOT).filter((n) => n.endsWith(".html") || n === "vite.config.js" || n === "package.json").map((n) => join(ROOT, n))];
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
let checked = 0;
for (const directory of SWEPT_DIRECTORIES) {
  for (const [path, source] of sources) {
    if (!path.startsWith(`${directory}/`) || !path.endsWith(".js")) continue;
    for (const name of exportedNames(source)) {
      checked += 1;
      const word = new RegExp(`(?<![\\w$])${name.replace(/\$/gu, "\\$")}(?![\\w$])`, "u");
      const referencedElsewhere = [...sources].some(([other, text]) => other !== path && word.test(text));
      if (!referencedElsewhere) violations.push(`${path}#${name}`);
    }
  }
}
assert.deepEqual(violations, [], `every export of ${SWEPT_DIRECTORIES.join(", ")} has a consumer outside its module`);
console.log(`Export surface contract: PASS · ${checked} exports in ${SWEPT_DIRECTORIES.length} swept ${SWEPT_DIRECTORIES.length === 1 ? "directory" : "directories"} (${SWEPT_DIRECTORIES.join(", ")}) each referenced outside its module`);
