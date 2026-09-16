import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { TIMESTAMP_POLICIES, toTimestamp, toDate } from "../src/core/dates.js";

// core/dates.js: one parser from a payload value to epoch milliseconds
// with three named policies for text, and toDate on top of it. Fifteen
// modules carried the parser as toTimestamp, timestamp, normalizeDateInput,
// dateMs or toDate, in nine behaviour classes whose differences (seconds
// threshold, numeric text, negative numbers, Date instances, date-only
// text) never showed on what the backend sends: ISO text, epoch numbers and
// blanks. The domain differences that are real are the policies: Facturas
// reads date-only text as local midnight (civil invoice dates) and its list
// template also reads Spanish dd/mm/yyyy text.
const AUTHORITY = "src/core/dates.js";
const NAMES = Object.freeze(["TIMESTAMP_POLICIES", "toTimestamp", "toDate"]);
const ENTRY_AND_LEAF = Object.freeze(["src/main.js", "src/analytics/google-tag.js"]);
// Measured before the migration: every consumer with the policy it reproduced.
const CONSUMERS = Object.freeze({
  "src/features/incidencias-detail-live-sync/index.js": ["epoch"],
  "src/features/incidencias-detail-state/index.js": ["epoch"],
  "src/views/clientes/clientes.model.js": ["epoch"],
  "src/views/clientes/clientes.template.js": ["epoch"],
  "src/views/clientes/clientes.template.modal.js": ["epoch"],
  "src/views/facturas/facturas.template.js": ["invoiceText"],
  "src/views/facturas/facturas.template.modal.base.js": ["invoiceDay"],
  "src/views/home/home.api.js": ["epoch"],
  "src/views/home/home.template.foundation.js": ["epoch"],
  "src/views/home/home.template.shared.js": ["epoch"],
  "src/views/incidencias/incidencias.template.modal.impl.js": ["epoch"],
  "src/views/incidencias/incidencias.template.modal.js": ["epoch"],
  "src/views/server/server.template.base.js": ["epoch"],
  "src/views/usuarios/usuarios.api.js": ["epoch"],
  "src/views/usuarios/usuarios.template.js": ["epoch"],
  "src/views/usuarios/usuarios.template.modal.js": ["epoch"],
  "src/views/whatsapp/whatsapp.template.js": ["epoch"],
});
const RETIRED_LOCAL = Object.freeze([
  ["toTimestamp()", /^(?:export )?function toTimestamp\s*\(/mu],
  ["timestamp(value)", /^(?:export )?function timestamp\s*\(\s*value\b/mu],
  ["normalizeDateInput()", /^(?:export )?function normalizeDateInput\s*\(/mu],
  ["dateMs()", /^(?:export )?function dateMs\s*\(/mu],
  ["toDate()", /^(?:export )?function toDate\s*\(/mu],
  ["seconds-or-milliseconds heuristic", /9_?999_?999_?999\s*\?|<\s*100000000000\s*\?/u],
]);

// Policies: frozen, distinct, named.
assert.deepEqual(Object.keys(TIMESTAMP_POLICIES), ["epoch", "invoiceDay", "invoiceText"]);
assert.ok(Object.isFrozen(TIMESTAMP_POLICIES));
for (const policy of Object.values(TIMESTAMP_POLICIES)) assert.ok(Object.isFrozen(policy));
const { epoch, invoiceDay, invoiceText } = TIMESTAMP_POLICIES;

// Mechanism, the same under every policy.
for (const policy of [epoch, invoiceDay, invoiceText]) {
  assert.equal(toTimestamp(null, policy), 0);
  assert.equal(toTimestamp(undefined, policy), 0);
  assert.equal(toTimestamp("", policy), 0);
  assert.equal(toTimestamp("   ", policy), 0);
  assert.equal(toTimestamp(0, policy), 0);
  assert.equal(toTimestamp(false, policy), 0, "false is text 'false', not a date");
  assert.equal(toTimestamp(NaN, policy), 0);
  assert.equal(toTimestamp(Infinity, policy), 0);
  assert.equal(toTimestamp(new Date(1700000000123), policy), 1700000000123, "a Date keeps its milliseconds");
  assert.equal(toTimestamp(new Date(NaN), policy), 0);
  assert.equal(toTimestamp(1700000000, policy), 1700000000000, "epoch seconds up to 9_999_999_999");
  assert.equal(toTimestamp(9_999_999_999, policy), 9_999_999_999_000);
  assert.equal(toTimestamp(10_000_000_000, policy), 10_000_000_000, "above that, milliseconds");
  assert.equal(toTimestamp(1700000000000, policy), 1700000000000);
  assert.equal(toTimestamp("1700000000", policy), 1700000000000, "numeric text follows the number rule");
  assert.equal(toTimestamp(" 1700000000000 ", policy), 1700000000000);
  assert.equal(toTimestamp("0", policy), 0, "'0' is epoch 0, never the year 2000 of Date.parse");
  assert.equal(toTimestamp("1e3", policy), 0, "only plain numeric text: no exponent, no hex");
  assert.equal(toTimestamp("0x10", policy), 0);
  assert.equal(toTimestamp("2026-09-16T04:00:00.000Z", policy), Date.UTC(2026, 8, 16, 4));
  assert.equal(toTimestamp("2026-09-16T06:00:00+02:00", policy), Date.UTC(2026, 8, 16, 4));
  assert.equal(toTimestamp("abc", policy), 0);
  assert.equal(toTimestamp({}, policy), 0);
  assert.equal(toTimestamp([], policy), 0);
  assert.equal(toTimestamp("9".repeat(400), policy), 0, "a numeric text beyond Number's range is no date");
  assert.equal(toDate(null, policy), null);
  assert.equal(toDate("abc", policy), null);
  assert.equal(toDate(1700000000, policy)?.getTime(), 1700000000000);
  assert.equal(toDate("2026-09-16T04:00:00Z", policy)?.toISOString(), "2026-09-16T04:00:00.000Z");
}
// Policies: what text a domain reads.
assert.equal(toTimestamp("2026-09-16", epoch), Date.UTC(2026, 8, 16), "epoch: date-only text is UTC midnight (Date.parse)");
assert.equal(toTimestamp("2026-09-16", invoiceDay), new Date(2026, 8, 16).getTime(), "invoiceDay: date-only text is local midnight");
assert.equal(toTimestamp("2026-09-16", invoiceText), new Date(2026, 8, 16).getTime());
assert.equal(toTimestamp("2026-09-16 04:00", epoch), new Date(2026, 8, 16, 4).getTime(), "epoch: a space before the time parses (V8 local time)");
assert.equal(toTimestamp("2026-09-16 04:00", invoiceDay), 0, "invoiceDay: text without T takes the midnight suffix and fails, as the Facturas copies did");
assert.equal(toTimestamp("16/09/2026", epoch), 0, "epoch: no Spanish dates");
assert.equal(toTimestamp("16/09/2026", invoiceDay), 0, "invoiceDay: no Spanish dates");
assert.equal(toTimestamp("16/09/2026", invoiceText), new Date(2026, 8, 16).getTime(), "invoiceText: dd/mm/yyyy as a local date");
assert.equal(toTimestamp("16/09/2026 10:30", invoiceText), new Date(2026, 8, 16, 10, 30).getTime());
assert.equal(toTimestamp("16/09/2026, 10:30:15", invoiceText), new Date(2026, 8, 16, 10, 30, 15).getTime());
assert.equal(toTimestamp("9/1/2026", invoiceText), new Date(2026, 0, 9).getTime(), "day first");
assert.equal(toTimestamp("2026/09/16", invoiceText), 0, "not a Spanish date; not ISO either");

// Source: one definer, retired copies stay retired, every consumer imports
// the authority and names its policy, the consumer map is the measured one,
// and the entry and analytics leaf import nothing from it.
const SRC_ROOT = fileURLToPath(new URL("../src/", import.meta.url));
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en")).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}
const definers = [];
const retired = [];
const consumers = {};
const callsWithoutPolicy = [];
const callersWithoutBinding = [];
const entryImports = [];
for (const file of sourceFiles(SRC_ROOT)) {
  const code = readFileSync(file, "utf8");
  const executable = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const path = `src/${relative(SRC_ROOT, file).split(sep).join("/")}`;
  if (/^export function (?:toTimestamp|toDate)\s*\(/mu.test(code) && path === AUTHORITY) definers.push(path);
  if (path === AUTHORITY) continue;
  for (const [label, pattern] of RETIRED_LOCAL) if (pattern.test(code)) retired.push(`${path} → ${label}`);
  const imports = /import\s*\{([^}]*)\}\s*from\s*"(?:(?:\.\.\/)+core|\.)\/dates\.js"/u.exec(code);
  const imported = imports ? imports[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
  const calls = [...executable.matchAll(/(?<![\w$.])(toTimestamp|toDate)\s*\(/gu)];
  if (calls.length && !imports) callersWithoutBinding.push(path);
  for (const alias of imported) if (/\sas\s/u.test(alias)) callersWithoutBinding.push(`${path} → ${alias}`);
  const policies = new Set();
  for (const call of calls) {
    // the policy is the last argument: TIMESTAMP_POLICIES.<name> before the matching ")"
    let depth = 1; let i = call.index + call[0].length; const start = i;
    for (; i < executable.length && depth > 0; i++) { const c = executable[i]; if (c === "(") depth++; else if (c === ")") depth--; }
    const args = executable.slice(start, i - 1);
    const named = args.match(/TIMESTAMP_POLICIES\.(\w+)\s*$/u);
    if (!named) callsWithoutPolicy.push(`${path}:${executable.slice(0, call.index).split("\n").length}`);
    else policies.add(named[1]);
  }
  if (calls.length) consumers[path] = [...policies].sort();
  if (ENTRY_AND_LEAF.includes(path) && code.includes("/core/dates.js\"")) entryImports.push(path);
}
assert.deepEqual(definers, [AUTHORITY], "toTimestamp and toDate are defined in core/dates.js only");
assert.deepEqual(retired, [], "no module defines toTimestamp, timestamp(value), normalizeDateInput, dateMs or toDate again, nor its own seconds-or-milliseconds heuristic");
assert.deepEqual(callersWithoutBinding, [], "every caller imports core/dates.js by name");
assert.deepEqual(callsWithoutPolicy, [], "every toTimestamp/toDate call names its policy as the last argument");
assert.deepEqual(consumers, CONSUMERS, "the consumers and their policies are the measured map");
assert.deepEqual(entryImports, [], "main.js and analytics/google-tag.js never import core/dates.js");

console.log(`Dates contract: PASS · toTimestamp/toDate in core/dates.js · 3 policies frozen (epoch, invoiceDay, invoiceText) · mechanism and per-policy text · ${Object.keys(consumers).length} consumers on their measured policy · no retired copy or local heuristic · callers bind by name and name their policy · entry and analytics leaf import none`);
