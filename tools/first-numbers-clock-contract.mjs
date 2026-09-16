import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { firstNonBlank, firstNonEmpty } from "../src/core/objects.js";
import { clamp, coercedNumber, finiteNumber } from "../src/core/numbers.js";
import { nowIso, nowMs } from "../src/core/clock.js";

// Three small authorities with named policies instead of copies.
// - core/objects.js: first candidate of a fallback chain. firstNonBlank skips
//   null, undefined and blank strings; firstNonEmpty also skips empty arrays
//   and plain objects without keys. 44 modules carried one of the two under
//   the name `first`, which did not say which. Neither flattens arguments
//   (repo_integrity keeps that invariant on the authority). They live with
//   the object guards because a module of their own becomes a chunk that
//   every startup closure imports (+529 bytes on the public Home).
// - core/numbers.js: one coercion (Number(value), finite or the fallback)
//   with two named policies for a blank value. coercedNumber: blanks
//   (undefined, null, "") are 0, as Number() reads them; eight modules
//   carried it as number/finiteNumber with value = 0. finiteNumber: a blank
//   is the fallback; the copies with value = null or without a value default
//   (safeNumber, number, optionalNumber, the canonical finiteNumber) carried
//   it. Three modules still declare finiteNumber's body with value = 0, where
//   undefined is 0 instead of the fallback: they are the pending upper bound
//   below until that difference is decided. clamp(value, min, max) has no
//   numeric policy of its own: callers parse first. correo.api keeps
//   clamp(value, fallback, min, max), an integer parse with fallback.
//   Amount parsers (currency symbols, decimal comma, round2) and the
//   integer policies (integer, nonNegativeInteger, parseNumber, the
//   positive-only number of the Incidencias create form) stay local.
// - core/clock.js: nowIso() and nowMs(), the single time source. The copy in
//   server.api.base wrapped toISOString in try/catch: new Date() is always
//   valid, so the catch branch could not run.
const FIRST_AUTHORITY = "src/core/objects.js";
const NUMBERS_AUTHORITY = "src/core/numbers.js";
const CLOCK_AUTHORITY = "src/core/clock.js";
const AUTHORITY_MODULES = Object.freeze(["core/objects.js", "core/numbers.js", "core/clock.js"]);
const ENTRY_AND_LEAF = Object.freeze(["src/main.js", "src/analytics/google-tag.js"]);
const NAMES = Object.freeze({ firstNonBlank: FIRST_AUTHORITY, firstNonEmpty: FIRST_AUTHORITY, clamp: NUMBERS_AUTHORITY, coercedNumber: NUMBERS_AUTHORITY, finiteNumber: NUMBERS_AUTHORITY, nowIso: CLOCK_AUTHORITY, nowMs: CLOCK_AUTHORITY });
// Upper bound of local definers outside the authority, with the policy that keeps them there.
const DEFINER_PENDING = Object.freeze({ clamp: ["src/views/correo/correo.api.js"] });
// Bodies of the retired numeric copies, whatever their local name. The C
// family (amount parsers) follows the blank check with a typeof branch and
// symbol stripping, so neither numeric pattern matches it.
const COERCED_BODY = /^(?:export )?function \w+\(\s*value = 0,\s*fallback = 0\s*\)\s*\{\s*const \w+ =\s*Number\(\s*value\s*\);\s*return Number\.isFinite\(\s*\w+\s*\)\s*\?\s*\w+\s*:\s*fallback;\s*\}/mu;
const FINITE_BODY = /^(?:export )?function \w+\(\s*value(?: = null)?,\s*fallback = (?:0|null)\s*\)\s*\{\s*if \(\s*value === null \|\|\s*value === undefined \|\|\s*value === ""\s*\)\s*(?:\{\s*)?return fallback;(?:\s*\})?\s*const \w+ =\s*Number\(\s*value\s*\);/mu;
const FINITE_BODY_VALUE_ZERO = /^(?:export )?function \w+\(\s*value = 0,\s*fallback = 0\s*\)\s*\{\s*if \(\s*value === null \|\|\s*value === undefined \|\|\s*value === ""\s*\)\s*(?:\{\s*)?return fallback;(?:\s*\})?\s*const \w+ =\s*Number\(\s*value\s*\);/mu;
// Upper bound of modules that still carry finiteNumber's body with value = 0 (undefined is 0 there, not the fallback).
const FINITE_VALUE_ZERO_PENDING = Object.freeze(["src/views/server/index.js", "src/views/server/server.api.base.js", "src/views/usuarios/usuarios.api.js"]);
const RETIRED_LOCAL = Object.freeze([
  ["first(...values)", /^(?:export )?(?:function first\s*\(\s*\.\.\.values\s*\)|const first = \(\.\.\.values\) =>)/mu],
  ["coercedNumber body (Number(value) finite or fallback, value = 0)", COERCED_BODY],
  ["finiteNumber body (blank is the fallback)", FINITE_BODY],
  ["optionalNumber(value)", /^(?:export )?function optionalNumber\s*\(\s*value\s*\)/mu],
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
// coercedNumber: blanks are 0, only NaN and infinities fall back.
assert.equal(coercedNumber(), 0);
assert.equal(coercedNumber(undefined, 5), 0, "undefined is 0: the copies declared value = 0");
assert.equal(coercedNumber(null, 5), 0);
assert.equal(coercedNumber("", 5), 0);
assert.equal(coercedNumber("  ", 5), 0);
assert.equal(coercedNumber(false, 5), 0);
assert.equal(coercedNumber(true, 5), 1);
assert.equal(coercedNumber([], 5), 0);
assert.equal(coercedNumber([7], 5), 7);
assert.equal(coercedNumber("3", 5), 3);
assert.equal(coercedNumber(" 3 ", 5), 3);
assert.equal(coercedNumber("0x10", 5), 16);
assert.equal(coercedNumber("1e3", 5), 1000);
assert.equal(coercedNumber("1,5", 5), 5, "no decimal comma: amount parsers stay with their domains");
assert.equal(coercedNumber("3px", 5), 5);
assert.equal(coercedNumber(NaN, 5), 5);
assert.equal(coercedNumber(Infinity, 5), 5);
assert.equal(coercedNumber({}, 5), 5);
assert.equal(coercedNumber("abc"), 0, "default fallback 0");
assert.ok(Object.is(coercedNumber(-0, 5), -0));
// finiteNumber: a blank is the fallback; the rest is Number(value) when finite.
assert.equal(finiteNumber(undefined, 5), 5);
assert.equal(finiteNumber(null, 5), 5);
assert.equal(finiteNumber("", 5), 5);
assert.equal(finiteNumber(undefined, null), null);
assert.equal(finiteNumber(), 0, "default fallback 0: every migrated call names its fallback");
assert.equal(finiteNumber("  ", 5), 0, "whitespace is not blank: Number(\"  \") is 0, as in the copies");
assert.equal(finiteNumber("3", null), 3);
assert.equal(finiteNumber(2.5, null), 2.5);
assert.equal(finiteNumber("abc", null), null);
assert.equal(finiteNumber(NaN, 5), 5);
assert.equal(finiteNumber(Infinity, 5), 5);
assert.equal(finiteNumber(true, 5), 1);
assert.equal(finiteNumber([], 5), 0);
assert.equal(finiteNumber({}, 5), 5);
assert.equal(finiteNumber("1,5", 5), 5);
assert.ok(Object.is(finiteNumber(-0, 5), -0));
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
const finiteValueZero = [];
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
  if (FINITE_BODY_VALUE_ZERO.test(code)) finiteValueZero.push(path);
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
assert.deepEqual(retired, [], "no module defines a local first(...values), now(), nowIso(), coercedNumber body, finiteNumber body or optionalNumber again");
assert.deepEqual(finiteValueZero.filter((path) => !FINITE_VALUE_ZERO_PENDING.includes(path)), [], `finiteNumber's body with value = 0 stays within the pending upper bound (${FINITE_VALUE_ZERO_PENDING.join(", ")})`);
assert.deepEqual(callersWithoutBinding, [], "every firstNonBlank/firstNonEmpty/clamp/coercedNumber/finiteNumber/nowIso/nowMs caller imports its authority");
assert.deepEqual(aliasImports, [], "the authorities are imported by their own names");
assert.deepEqual(entryImports, [], "main.js and analytics/google-tag.js never import core/objects, core/numbers or core/clock");

console.log(`First/numbers/clock contract: PASS · firstNonBlank/firstNonEmpty in core/objects.js · clamp, coercedNumber and finiteNumber in core/numbers.js (correo.api clamp pending; finiteNumber body with value = 0 in ${finiteValueZero.length} pending modules) · nowIso/nowMs in core/clock.js · behaviour of the retired copies · one definer per name · no local first/now/nowIso/numeric copy · callers bind by name · entry and analytics leaf import none`);
