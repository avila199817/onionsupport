import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { firstNonBlank, firstNonEmpty } from "../src/core/objects.js";
import { clamp } from "../src/core/numbers.js";
import { nowIso, nowMs } from "../src/core/clock.js";

// Three small authorities with named policies instead of copies.
// - core/objects.js: first candidate of a fallback chain. firstNonBlank skips
//   null, undefined and blank strings; firstNonEmpty also skips empty arrays
//   and plain objects without keys. 44 modules carried one of the two under
//   the name `first`, which did not say which. Neither flattens arguments
//   (repo_integrity keeps that invariant on the authority). They live with
//   the object guards because a module of their own becomes a chunk that
//   every startup closure imports (+529 bytes on the public Home).
// - core/numbers.js: clamp(value, min, max) with no numeric policy of its
//   own. Copies that parsed inside clamp now parse at the call site with the
//   module's own parser. correo.api keeps clamp(value, fallback, min, max):
//   an integer parse with fallback that moves with the numeric policies.
// - core/clock.js: nowIso() and nowMs(), the single time source. The copy in
//   server.api.base wrapped toISOString in try/catch: new Date() is always
//   valid, so the catch branch could not run.
const FIRST_AUTHORITY = "src/core/objects.js";
const NUMBERS_AUTHORITY = "src/core/numbers.js";
const CLOCK_AUTHORITY = "src/core/clock.js";
const AUTHORITY_MODULES = Object.freeze(["core/objects.js", "core/numbers.js", "core/clock.js"]);
const ENTRY_AND_LEAF = Object.freeze(["src/main.js", "src/analytics/google-tag.js"]);
const NAMES = Object.freeze({ firstNonBlank: FIRST_AUTHORITY, firstNonEmpty: FIRST_AUTHORITY, clamp: NUMBERS_AUTHORITY, nowIso: CLOCK_AUTHORITY, nowMs: CLOCK_AUTHORITY });
// Upper bound of local definers outside the authority, with the policy that keeps them there.
const DEFINER_PENDING = Object.freeze({ clamp: ["src/views/correo/correo.api.js"] });
const RETIRED_LOCAL = Object.freeze([
  ["first(...values)", /^(?:export )?(?:function first\s*\(\s*\.\.\.values\s*\)|const first = \(\.\.\.values\) =>)/mu],
  ["now() over Date.now()", /^(?:export )?function now\s*\(\s*\)\s*\{\s*return Date\.now\(\);/mu],
  ["nowIso()", /^(?:export )?(?:function nowIso\s*\(|const nowIso\s*=)/mu],
]);

// Behaviour: the policies accept and skip exactly what the retired copies did.
const list = [1];
const plain = { a: 1 };
assert.equal(firstNonBlank(undefined, null, "", "  ", "\n", "x"), "x");
assert.equal(firstNonBlank(0, 1), 0);
assert.equal(firstNonBlank(false, 1), false);
assert.ok(Number.isNaN(firstNonBlank(NaN, 1)));
assert.deepEqual(firstNonBlank([], "x"), []);
assert.deepEqual(firstNonBlank({}, "x"), {});
assert.deepEqual(firstNonBlank([[]], 1), [[]], "arrays are values, never flattened");
assert.equal(firstNonBlank(), null);
assert.equal(firstNonBlank("  "), null);
assert.equal(firstNonEmpty(undefined, null, "", [], {}, "x"), "x");
assert.equal(firstNonEmpty(list, "x"), list);
assert.equal(firstNonEmpty(plain, "x"), plain);
assert.equal(firstNonEmpty(0, 1), 0);
assert.equal(firstNonEmpty(false), false);
assert.ok(Number.isNaN(firstNonEmpty(NaN)));
assert.deepEqual(firstNonEmpty([[]]), [[]], "an array with one empty array is a value");
assert.equal(firstNonEmpty(new Date(0), "x"), "x", "objects without own keys are empty, as in the retired copies");
assert.equal(firstNonEmpty(new Map([[1, 1]]), "x"), "x");
assert.equal(firstNonEmpty(Object.create(null), "x"), "x");
assert.equal(firstNonEmpty(), null);
assert.equal(clamp(5, 0, 1), 1);
assert.equal(clamp(-1, 0, 1), 0);
assert.equal(clamp(0.5, 0, 1), 0.5);
assert.equal(clamp(250, 1, 200), 200);
assert.ok(Number.isNaN(clamp(NaN, 0, 1)), "no numeric policy: NaN stays NaN");
assert.equal(clamp("3", 0, 10), 3, "Math.min/Math.max coercion, as in the pure copies");
const isoStamp = nowIso();
assert.match(isoStamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
assert.ok(Math.abs(Date.parse(isoStamp) - Date.now()) < 5_000);
assert.ok(Math.abs(nowMs() - Date.now()) < 5_000);

// Source: one definer per name (correo.api pending for clamp), retired local
// helpers do not come back, callers bind the authority by its name, and the
// entry and analytics leaf import none of these modules.
const SRC_ROOT = fileURLToPath(new URL("../src/", import.meta.url));
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en")).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}
const definers = Object.fromEntries(Object.keys(NAMES).map((name) => [name, []]));
const callersWithoutBinding = [];
const aliasImports = [];
const retired = [];
const entryImports = [];
for (const file of sourceFiles(SRC_ROOT)) {
  const code = readFileSync(file, "utf8");
  const executable = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const path = `src/${relative(SRC_ROOT, file).split(sep).join("/")}`;
  for (const [name, authority] of Object.entries(NAMES)) {
    const defines = new RegExp(`^(?:export )?(?:async )?(?:function ${name}\\s*\\(|(?:const|let|var) ${name}\\b)`, "mu").test(code);
    const imports = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*"(?:\\.|[^"]*/core)/${authority.slice("src/core/".length)}"`, "u").test(code);
    if (defines) definers[name].push(path);
    // A JS call passes an expression; CSS clamp(30px, 8.5vw, 76px) inside a template string starts with a length.
    else if (new RegExp(`(?<![\\w$.])${name}\\s*\\((?!\\s*\\d)`, "u").test(executable) && !imports) callersWithoutBinding.push(`${path} → ${name}`);
    if (new RegExp(`import\\s*\\{[^}]*\\b${name}\\s+as\\s`, "u").test(code)) aliasImports.push(`${path} → ${name}`);
  }
  if (!Object.values(NAMES).includes(path)) for (const [label, pattern] of RETIRED_LOCAL) if (pattern.test(code)) retired.push(`${path} → ${label}`);
  if (ENTRY_AND_LEAF.includes(path)) {
    for (const module of AUTHORITY_MODULES) if (code.includes(`/${module}"`)) entryImports.push(`${path} → ${module}`);
  }
}
for (const [name, authority] of Object.entries(NAMES)) {
  const pending = DEFINER_PENDING[name] || [];
  const outside = definers[name].filter((path) => path !== authority);
  assert.ok(definers[name].includes(authority), `${name} is defined in ${authority}`);
  assert.deepEqual(outside.filter((path) => !pending.includes(path)), [], `${name} is defined only in ${authority}${pending.length ? ` (pending: ${pending.join(", ")})` : ""}`);
}
assert.deepEqual(retired, [], "no module defines a local first(...values), now() or nowIso() again");
assert.deepEqual(callersWithoutBinding, [], "every firstNonBlank/firstNonEmpty/clamp/nowIso/nowMs caller imports its authority");
assert.deepEqual(aliasImports, [], "the authorities are imported by their own names");
assert.deepEqual(entryImports, [], "main.js and analytics/google-tag.js never import core/objects, core/numbers or core/clock");

console.log("First/numbers/clock contract: PASS · firstNonBlank/firstNonEmpty in core/objects.js · clamp in core/numbers.js (correo.api pending) · nowIso/nowMs in core/clock.js · behaviour of the retired copies · one definer per name · no local first/now/nowIso · callers bind by name · entry and analytics leaf import none");
