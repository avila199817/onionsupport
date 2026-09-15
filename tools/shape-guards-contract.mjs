import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isObject, safeObject } from "../src/core/objects.js";
import { safeArray, arrayFrom } from "../src/core/arrays.js";

// One authority per shape policy: plain-object guards in core/objects.js and
// array coercion in core/arrays.js, split so the auth closure loads the
// object guards alone. Every module imports them instead of carrying a copy
// under any name. src/main.js keeps its own isObject on purpose: the entry
// module must not import shared helpers, or rolldown folds them into the
// entry chunk and every closure pulls it; analytics/google-tag.js is the
// same kind of leaf. Two array helpers keep a different policy and stay
// local: incidencias-media-preview accepts iterables, public Home's toArray
// drops falsy entries.

const OBJECTS_AUTHORITY = "src/core/objects.js";
const ARRAYS_AUTHORITY = "src/core/arrays.js";
const ENTRY_AND_LEAF = Object.freeze(["src/main.js", "src/analytics/google-tag.js"]);
const SHARED_HELPER_MODULES = Object.freeze(["core/objects.js", "core/arrays.js", "core/presentation-text.js", "core/escape-html.js"]);
const OBJECT_FINGERPRINT = 'typeof value === "object" && !Array.isArray(value)';
const OBJECT_FINGERPRINT_EXEMPT = Object.freeze(["src/main.js"]);
const NAMES = Object.freeze({ isObject: OBJECTS_AUTHORITY, safeObject: OBJECTS_AUTHORITY, safeArray: ARRAYS_AUTHORITY, arrayFrom: ARRAYS_AUTHORITY });
const DEFINER_EXEMPT = Object.freeze({ isObject: ["src/main.js"] });

// Behaviour: the guards accept exactly what the retired copies accepted.
const nodeListLike = { length: 2, 0: "x", 1: "y" };
const plain = { a: 1 };
const list = [1, 2];
for (const value of [undefined, null, 0, 1, "", "abc", true, list, new Map(), () => 1, Object.create(null)]) {
  assert.equal(isObject(value), Boolean(value && typeof value === "object" && !Array.isArray(value)));
  assert.deepEqual(safeArray(value), Array.isArray(value) ? value : []);
}
assert.equal(isObject(plain), true);
assert.equal(isObject(list), false);
assert.equal(safeObject(plain), plain);
assert.deepEqual(safeObject(list), {});
assert.equal(safeObject(null, null), null);
assert.equal(safeObject("x", 7), 7);
assert.equal(safeArray(list), list);
assert.deepEqual(safeArray(nodeListLike), []);
assert.equal(arrayFrom(list), list);
assert.deepEqual(arrayFrom(nodeListLike), ["x", "y"]);
assert.deepEqual(arrayFrom("abc"), []);
assert.deepEqual(arrayFrom(new Set([1])), []);
assert.deepEqual(arrayFrom(null), []);

// Source: one definer per name, callers bind via import, no idiom copies,
// and the entry/leaf modules stay free of shared helper imports.
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
const idiomCopies = [];
const entryImports = [];
for (const file of sourceFiles(SRC_ROOT)) {
  const code = readFileSync(file, "utf8");
  const executable = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const path = `src/${relative(SRC_ROOT, file).split(sep).join("/")}`;
  for (const name of Object.keys(NAMES)) {
    const defines = new RegExp(`^(?:export )?(?:async )?(?:function ${name}\\s*\\(|(?:const|let|var) ${name}\\b)`, "mu").test(code);
    const imports = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*"[^"]+"`, "u").test(code);
    if (defines) definers[name].push(path);
    else if (new RegExp(`(?<![\\w$.])${name}\\s*\\(`, "u").test(executable) && !imports) callersWithoutBinding.push(`${path} → ${name}`);
  }
  if (path !== OBJECTS_AUTHORITY && !OBJECT_FINGERPRINT_EXEMPT.includes(path) && code.includes(OBJECT_FINGERPRINT)) idiomCopies.push(path);
  if (ENTRY_AND_LEAF.includes(path)) {
    for (const module of SHARED_HELPER_MODULES) if (code.includes(`/${module}"`)) entryImports.push(`${path} → ${module}`);
  }
}
for (const [name, authority] of Object.entries(NAMES)) {
  const allowed = [authority, ...(DEFINER_EXEMPT[name] || [])];
  assert.deepEqual(definers[name], allowed, `${name} is defined only in ${allowed.join(" and ")}`);
}
assert.deepEqual(idiomCopies, [], "no module carries the plain-object idiom outside the authority (main.js excepted)");
assert.deepEqual(callersWithoutBinding, [], "every isObject/safeObject/safeArray/arrayFrom caller binds its authority");
assert.deepEqual(entryImports, [], "main.js and analytics/google-tag.js never import the shared helper modules");

console.log("Shape guards contract: PASS · isObject/safeObject in core/objects.js · safeArray/arrayFrom in core/arrays.js · behaviour of the retired copies · one definer per name (main.js keeps isObject) · no idiom copies · entry and analytics leaf import no shared helpers");
