import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CURRENCY_POLICIES, currencyCode, currencyFormatter, formatCurrency, formatDecimal } from "../src/core/format.js";

// core/format.js: formatting primitives over values the domain has already
// parsed. Ten formatMoney copies plus two inline versions built an es-ES
// currency Intl formatter each (four with a cache of their own) and five
// copies built the plain es-ES number formatter. The kernel keeps the
// formatters, one per currency code and policy; the domain keeps its parser,
// its empty text and, where it differs from the standard one, its fallback
// text (the Clientes modal and the Incidencias list and modal compose
// currencyFormatter for that). Four named currency policies name the
// digits and grouping a domain shows.
const AUTHORITY = "src/core/format.js";
const ENTRY_AND_LEAF = Object.freeze(["src/main.js", "src/analytics/google-tag.js"]);
// Measured before the migration: every consumer with the policies it names.
const CONSUMERS = Object.freeze({
  "src/features/facturas-paid-confirm/index.js": ["standard"],
  "src/features/incidencias-technician-profile/index.js": [],
  "src/views/clientes/clientes.template.js": ["standard"],
  "src/views/clientes/clientes.template.modal.js": ["currencyDigits"],
  "src/views/facturas/facturas.template.create.js": ["standard"],
  "src/views/facturas/facturas.template.js": ["standard"],
  "src/views/facturas/facturas.template.modal.base.js": ["standard"],
  "src/views/facturas/index.js": ["standard"],
  "src/views/home/home.template.foundation.js": ["standard"],
  "src/views/incidencias/incidencias.template.js": ["grouped"],
  "src/views/incidencias/incidencias.template.modal.impl.js": ["currencyDigits"],
  "src/views/server/server.template.js": ["precise", "standard"],
  "src/views/usuarios/usuarios.template.js": [],
});
// Local policies that stay with their domain, with the reason.
const LOCAL_CURRENCY_FORMATTERS = Object.freeze({
  // chart axis labels: compact notation from 1000 and digits that depend on the value
  "src/views/server/server.template.js": 1,
});

// Policies: frozen and distinct.
assert.deepEqual(Object.keys(CURRENCY_POLICIES), ["standard", "grouped", "precise", "currencyDigits"]);
assert.ok(Object.isFrozen(CURRENCY_POLICIES));
for (const policy of Object.values(CURRENCY_POLICIES)) assert.ok(Object.isFrozen(policy));
const { standard, grouped, precise, currencyDigits } = CURRENCY_POLICIES;

// Behaviour (real Intl; CI and the browsers share the CLDR rules for es-ES).
// Intl separates the currency with a no-break space; the assertions read it as a plain one.
const plain = (text) => text.replace(/\u00a0/gu, " ");
assert.equal(currencyCode(" eur "), "EUR");
assert.equal(currencyCode(null), "EUR");
assert.equal(currencyCode("", "USD"), "USD");
assert.equal(plain(formatCurrency(12.5, "EUR", standard)), "12,50 €");
assert.equal(plain(formatCurrency(1234, "EUR", standard)), "1234,00 €", "standard: es-ES groups from five digits");
assert.equal(plain(formatCurrency(12345.678, "EUR", standard)), "12.345,68 €");
assert.equal(plain(formatCurrency(-1234.5, "EUR", standard)), "-1234,50 €");
assert.equal(plain(formatCurrency(1234, "EUR", grouped)), "1.234,00 €", "grouped: thousands from four digits");
assert.equal(plain(formatCurrency(12345.678, "EUR", precise)), "12.345,678 €", "precise: up to four decimals");
assert.equal(plain(formatCurrency(12.5, "EUR", precise)), "12,50 €");
assert.equal(plain(formatCurrency(12.5, "EUR", currencyDigits)), "12,50 €", "currencyDigits: EUR keeps two");
assert.equal(plain(formatCurrency(12, "JPY", currencyDigits)), "12 JPY", "currencyDigits: a zero-decimal currency shows none");
assert.equal(plain(formatCurrency(12, "JPY", standard)), "12,00 JPY");
assert.equal(plain(formatCurrency(1234.5, "USD", standard)), "1234,50 US$");
assert.equal(plain(formatCurrency(12.5, "ABC", standard)), "12,50 ABC", "a well-formed unknown code formats with its letters");
assert.equal(currencyFormatter("XX1", standard), null, "a malformed code has no formatter");
assert.equal(plain(formatCurrency(12.5, "XX1", standard)), "12,50 XX1", "…and the standard fallback text carries the code");
assert.equal(plain(formatCurrency(0, "EURO", standard)), "0,00 EURO");
assert.equal(currencyFormatter("EUR", standard), currencyFormatter("EUR", standard), "one formatter per code and policy");
assert.notEqual(currencyFormatter("EUR", standard), currencyFormatter("EUR", grouped));
assert.equal(plain(formatDecimal(1234)), "1234");
assert.equal(plain(formatDecimal(12345.678)), "12.345,678");
assert.equal(plain(formatDecimal(0)), "0");
assert.equal(plain(formatDecimal(-1.5)), "-1,5");
assert.equal(plain(formatDecimal(NaN)), "NaN", "the domain parses first; the primitive formats what it gets");

// Source: one definer, no currency Intl formatter or formatter cache outside
// the authority (the listed local policy aside), no plain es-ES number
// formatter outside it, consumers on their measured policies, entry and
// analytics leaf import nothing.
const SRC_ROOT = fileURLToPath(new URL("../src/", import.meta.url));
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en")).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}
const definers = [];
const currencyOutside = {};
const cachesOutside = [];
const plainOutside = [];
const consumers = {};
const callersWithoutBinding = [];
const entryImports = [];
for (const file of sourceFiles(SRC_ROOT)) {
  const code = readFileSync(file, "utf8");
  const executable = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const path = `src/${relative(SRC_ROOT, file).split(sep).join("/")}`;
  if (/^export function (?:formatCurrency|currencyFormatter|currencyCode|formatDecimal)\s*\(/mu.test(code)) definers.push(path);
  if (path === AUTHORITY) continue;
  const currencyIntl = (executable.match(/style:\s*["']currency["']/gu) || []).length;
  if (currencyIntl) currencyOutside[path] = currencyIntl;
  if (/MONEY_FORMATTERS|getMoneyFormatter/u.test(executable)) cachesOutside.push(path);
  if (/new Intl\.NumberFormat\(\s*["']es-ES["']\s*\)/u.test(executable)) plainOutside.push(path);
  const imports = /import\s*\{([^}]*)\}\s*from\s*"(?:(?:\.\.\/)+core|\.)\/format\.js"/u.exec(code);
  const imported = imports ? imports[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
  const calls = [...executable.matchAll(/(?<![\w$.])(formatCurrency|currencyFormatter|formatDecimal|currencyCode)\s*\(/gu)];
  if (calls.length && !imports) callersWithoutBinding.push(path);
  for (const alias of imported) if (/\sas\s/u.test(alias)) callersWithoutBinding.push(`${path} → ${alias}`);
  if (calls.length) consumers[path] = [...new Set([...executable.matchAll(/CURRENCY_POLICIES\.(\w+)/gu)].map((m) => m[1]))].sort();
  if (ENTRY_AND_LEAF.includes(path) && code.includes("/core/format.js\"")) entryImports.push(path);
}
assert.deepEqual(definers, [AUTHORITY], "the primitives are defined in core/format.js only");
assert.deepEqual(currencyOutside, LOCAL_CURRENCY_FORMATTERS, "no currency Intl formatter outside the authority beyond the listed local policy");
assert.deepEqual(cachesOutside, [], "no module keeps a money formatter cache of its own");
assert.deepEqual(plainOutside, [], "no module builds the plain es-ES number formatter again");
assert.deepEqual(callersWithoutBinding, [], "every caller imports core/format.js by name");
assert.deepEqual(consumers, CONSUMERS, "the consumers and their policies are the measured map");
assert.deepEqual(entryImports, [], "main.js and analytics/google-tag.js never import core/format.js");

console.log(`Format contract: PASS · formatCurrency/currencyFormatter/currencyCode/formatDecimal in core/format.js · 4 currency policies frozen · behaviour with real Intl (EUR, USD, JPY, unknown and malformed codes) · ${Object.keys(consumers).length} consumers on their measured policies · 1 local currency policy listed · no formatter cache or plain es-ES formatter outside · callers bind by name · entry and analytics leaf import none`);
