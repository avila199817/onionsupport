import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { AMOUNT_POLICIES, parseAmount, round2 } from "../src/core/amounts.js";

// core/amounts.js: one text mechanism for money and quantities (currency
// symbols and percent dropped, the last separator decides decimal vs
// thousands) with three named policies for values that are not text, and
// round2 for cents. Twelve modules carried the parser as number, num or
// numberOrNull: on every text and number the copies agreed; they differed
// only on booleans and objects, which is what the policies name. Four
// modules carried round2 and the Facturas view two inline roundings.
const AUTHORITY = "src/core/amounts.js";
const NAMES = Object.freeze(["AMOUNT_POLICIES", "parseAmount", "round2"]);
const ENTRY_AND_LEAF = Object.freeze(["src/main.js", "src/analytics/google-tag.js"]);
const POLICY_NAMES = Object.freeze(["coerced", "booleanDigit", "textOnly"]);
// Measured before the migration: every parseAmount consumer with the policy its copy reproduced.
const CONSUMERS = Object.freeze({
  "src/views/clientes/clientes.model.js": ["coerced"],
  "src/views/clientes/clientes.template.modal.js": ["coerced"],
  "src/views/facturas/facturas.api.alias-core.js": ["textOnly"],
  "src/views/facturas/facturas.api.base.js": ["booleanDigit"],
  "src/views/facturas/facturas.template.create.js": ["booleanDigit"],
  "src/views/facturas/facturas.template.js": ["textOnly"],
  "src/views/facturas/facturas.template.modal.base.js": ["booleanDigit"],
  "src/views/facturas/facturas.template.modal.js": ["textOnly"],
  "src/views/home/home.api.js": ["textOnly"],
  "src/views/incidencias/incidencias.api.impl.js": ["coerced"],
  "src/views/incidencias/incidencias.template.js": ["coerced"],
  "src/views/incidencias/incidencias.template.modal.impl.js": ["textOnly"],
});
const ROUND2_CONSUMERS = Object.freeze([
  "src/views/facturas/facturas.api.alias-core.js",
  "src/views/facturas/facturas.api.base.js",
  "src/views/facturas/facturas.template.create.js",
  "src/views/facturas/facturas.template.modal.js",
  "src/views/facturas/index.js",
]);
const RETIRED_LOCAL = Object.freeze([
  ["amount text mechanism (currency symbols stripped)", /\[€\$£¥%\]/u],
  ["cents rounding with Number.EPSILON", /Number\.EPSILON\s*\)\s*\*\s*100\s*\)\s*\/\s*100/u],
  ["numberOrNull()", /^(?:export )?function numberOrNull\s*\(/mu],
]);

// Policies: frozen, distinct, named; each names what booleans and objects become.
assert.deepEqual(Object.keys(AMOUNT_POLICIES), POLICY_NAMES);
assert.ok(Object.isFrozen(AMOUNT_POLICIES));
for (const policy of Object.values(AMOUNT_POLICIES)) {
  assert.ok(Object.isFrozen(policy));
  assert.deepEqual(Object.keys(policy), ["booleans", "objects"]);
}
const { coerced, booleanDigit, textOnly } = AMOUNT_POLICIES;
assert.deepEqual(coerced, { booleans: "number", objects: "number" });
assert.deepEqual(booleanDigit, { booleans: "number", objects: "fallback" });
assert.deepEqual(textOnly, { booleans: "fallback", objects: "fallback" });

// Mechanism, the same under every policy.
const EUR = "€";
for (const policy of [coerced, booleanDigit, textOnly]) {
  assert.equal(parseAmount(null, 5, policy), 5);
  assert.equal(parseAmount("", 5, policy), 5);
  assert.equal(parseAmount(undefined, 5, policy), 0, "undefined is 0: the copies declared value = 0");
  assert.equal(parseAmount(12.5, 5, policy), 12.5);
  assert.ok(Object.is(parseAmount(-0, 5, policy), -0));
  assert.equal(parseAmount(NaN, 5, policy), 5);
  assert.equal(parseAmount(Infinity, 5, policy), 5);
  assert.equal(parseAmount("12", 5, policy), 12);
  assert.equal(parseAmount("12,5", 5, policy), 12.5);
  assert.equal(parseAmount("12.5", 5, policy), 12.5);
  assert.equal(parseAmount("1.234,56", 5, policy), 1234.56);
  assert.equal(parseAmount("1,234.56", 5, policy), 1234.56);
  assert.equal(parseAmount("12.345.678,90", 5, policy), 12345678.9);
  assert.equal(parseAmount("1,234", 5, policy), 1.234, "only commas: the comma is decimal");
  assert.equal(parseAmount("1.234", 5, policy), 1.234, "only dots: Number() reads them");
  assert.equal(parseAmount(`${EUR}12,50`, 5, policy), 12.5);
  assert.equal(parseAmount(`12,50 ${EUR}`, 5, policy), 12.5);
  assert.equal(parseAmount("$1,234.56", 5, policy), 1234.56);
  assert.equal(parseAmount("1.234,56 EUR", 5, policy), 1234.56);
  assert.equal(parseAmount("12 345,67", 5, policy), 12345.67);
  assert.equal(parseAmount("-12,5", 5, policy), -12.5);
  assert.equal(parseAmount("+12", 5, policy), 12);
  assert.equal(parseAmount(" 12 ", 5, policy), 12);
  assert.equal(parseAmount("12%", 5, policy), 12);
  assert.equal(parseAmount("12abc", 5, policy), 12);
  assert.equal(parseAmount("1e3", 5, policy), 13, "letters drop; no exponent");
  assert.equal(parseAmount(".5", 5, policy), 0.5);
  assert.equal(parseAmount("5,", 5, policy), 5);
  assert.equal(parseAmount("(5)", 5, policy), 5);
  for (const text of ["abc", "-", "+", " ", "1.5.5", "1,5,5", "--5", ","]) assert.equal(parseAmount(text, 5, policy), 5, `${JSON.stringify(text)} falls back`);
  assert.equal(parseAmount("abc", null, policy), null);
  assert.ok(Number.isNaN(parseAmount("abc", NaN, policy)));
}
// The policies: booleans and objects.
assert.equal(parseAmount(true, 5, coerced), 1);
assert.equal(parseAmount(false, 5, coerced), 0);
assert.equal(parseAmount([12], 5, coerced), 12);
assert.equal(parseAmount([], 5, coerced), 0);
assert.equal(parseAmount(new Date(0), 5, coerced), 0);
assert.equal(parseAmount({}, 5, coerced), 5);
assert.equal(parseAmount(true, 5, booleanDigit), 1);
assert.equal(parseAmount(false, 5, booleanDigit), 0);
assert.equal(parseAmount([12], 5, booleanDigit), 5);
assert.equal(parseAmount([], 5, booleanDigit), 5);
assert.equal(parseAmount(new Date(0), 5, booleanDigit), 5);
assert.equal(parseAmount({}, 5, booleanDigit), 5);
assert.equal(parseAmount(true, 5, textOnly), 5);
assert.equal(parseAmount(false, 5, textOnly), 5);
assert.equal(parseAmount([12], 5, textOnly), 5);
assert.equal(parseAmount({}, 5, textOnly), 5);
// round2: cents with Number.EPSILON, on a number or on text Number() reads.
assert.equal(round2(1.005), 1.01);
assert.equal(round2(2.675), 2.68);
assert.equal(round2(1.2345), 1.23);
assert.equal(round2(-1.005), -1);
assert.equal(round2(0), 0);
assert.equal(round2("1.5"), 1.5);
assert.ok(Number.isNaN(round2("1,5")));
assert.ok(Number.isNaN(round2(NaN)));
assert.equal(round2(parseAmount("1,005", 0, booleanDigit)), 1.01);

// Source: one definer per name, retired copies do not come back, every
// parseAmount call names its policy last and the consumer map matches,
// round2 callers import it, callers bind by name, and the entry and
// analytics leaf import nothing from the module.
const SRC_ROOT = fileURLToPath(new URL("../src/", import.meta.url));
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en")).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}
function callArgs(code, start) {
  let depth = 0, current = "", quote = null;
  const args = [];
  for (let i = start; i < code.length; i += 1) {
    const c = code[i];
    if (quote) {
      current += c;
      if (c === "\\") { current += code[i + 1]; i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; current += c; continue; }
    if ("([{".includes(c)) depth += 1;
    if (")]}".includes(c)) {
      if (depth === 0) { args.push(current.trim()); return args; }
      depth -= 1;
    }
    if (c === "," && depth === 0) { args.push(current.trim()); current = ""; continue; }
    current += c;
  }
  throw new Error("unterminated call");
}
const definers = Object.fromEntries(NAMES.map((name) => [name, []]));
const callersWithoutBinding = [];
const aliasImports = [];
const retired = [];
const withoutPolicy = [];
const measured = {};
const round2Callers = [];
const entryImports = [];
for (const file of sourceFiles(SRC_ROOT)) {
  const code = readFileSync(file, "utf8");
  const executable = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const path = `src/${relative(SRC_ROOT, file).split(sep).join("/")}`;
  const imports = /import\s*\{[^}]*\}\s*from\s*"(?:\.|[^"]*\/core)\/amounts\.js"/u.test(code);
  for (const name of NAMES) {
    if (new RegExp(`^(?:export )?(?:async )?(?:function ${name}\\s*\\(|(?:const|let|var) ${name}\\b)`, "mu").test(code)) definers[name].push(path);
    else if (new RegExp(`(?<![\\w$.])${name}\\s*\\(`, "u").test(executable) && !(imports && new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*"[^"]*core/amounts\\.js"`, "u").test(code))) callersWithoutBinding.push(`${path} → ${name}`);
    if (new RegExp(`import\\s*\\{[^}]*\\b${name}\\s+as\\s`, "u").test(code)) aliasImports.push(`${path} → ${name}`);
  }
  if (path !== AUTHORITY) {
    for (const [label, pattern] of RETIRED_LOCAL) if (pattern.test(code)) retired.push(`${path} → ${label}`);
    const policies = new Set();
    const pattern = /(?<![\w$.])parseAmount\s*\(/gu;
    for (let match = pattern.exec(executable); match; match = pattern.exec(executable)) {
      const args = callArgs(executable, match.index + match[0].length);
      const policy = /^AMOUNT_POLICIES\.(\w+)$/u.exec(args[args.length - 1] || "");
      if (args.length !== 3 || !policy || !POLICY_NAMES.includes(policy[1])) withoutPolicy.push(`${path}: parseAmount(${args.join(", ")})`);
      else policies.add(policy[1]);
    }
    if (policies.size) measured[path] = [...policies].sort();
    if (/(?<![\w$.])round2\s*\(/u.test(executable)) round2Callers.push(path);
  }
  if (ENTRY_AND_LEAF.includes(path) && code.includes("/amounts.js\"")) entryImports.push(path);
}
for (const name of NAMES) assert.deepEqual(definers[name], [AUTHORITY], `${name} is defined only in ${AUTHORITY}`);
assert.deepEqual(retired, [], "no module strips currency symbols, rounds cents with Number.EPSILON or defines numberOrNull on its own again");
assert.deepEqual(withoutPolicy, [], "every parseAmount call passes value, fallback and a named AMOUNT_POLICIES entry");
assert.deepEqual(measured, CONSUMERS, "each consumer uses the policy its retired copy reproduced");
assert.deepEqual(round2Callers, [...ROUND2_CONSUMERS], "round2 callers are the measured Facturas modules");
assert.deepEqual(callersWithoutBinding, [], "every parseAmount/round2/AMOUNT_POLICIES caller imports core/amounts.js");
assert.deepEqual(aliasImports, [], "the authority is imported by its own names");
assert.deepEqual(entryImports, [], "main.js and analytics/google-tag.js never import core/amounts.js");
console.log(`Amounts contract: PASS · parseAmount/round2/AMOUNT_POLICIES in ${AUTHORITY} · 3 policies frozen (coerced, booleanDigit, textOnly) · text mechanism and per-policy booleans/objects · ${Object.keys(CONSUMERS).length} parseAmount consumers on their measured policy · ${ROUND2_CONSUMERS.length} round2 consumers · no retired mechanism, rounding or numberOrNull · callers bind by name and name their policy · entry and analytics leaf import none`);
