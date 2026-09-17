import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CURRENCY_POLICIES, DATE_PRESETS, currencyCode, currencyFormatter, dateFormatter, formatCurrency, formatDecimal } from "../src/core/format.js";

// core/format.js: formatting primitives over values the domain has already
// parsed. Ten formatMoney copies plus two inline versions built an es-ES
// currency Intl formatter each (four with a cache of their own) and five
// copies built the plain es-ES number formatter. The kernel keeps the
// formatters, one per currency code and policy; the domain keeps its parser,
// its empty text and, where it differs from the standard one, its fallback
// text (the Clientes modal and the Incidencias list and modal compose
// currencyFormatter for that). Four named currency policies name the
// digits and grouping a domain shows. Date presets name the es-ES
// DateTimeFormat option sets more than one domain shows (16 constructions
// in 11 modules became four presets behind one cache); a preset used by
// one module stays with that module, listed below as an upper bound.
const AUTHORITY = "src/core/format.js";
const ENTRY_AND_LEAF = Object.freeze(["src/main.js", "src/analytics/google-tag.js"]);
// Measured before the migration: every consumer with the currency policies it names.
const CONSUMERS = Object.freeze({
  "src/features/facturas-paid-confirm/index.js": ["standard"],
  "src/features/incidencias-detail-state/index.js": [],
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
  "src/views/incidencias/incidencias.template.modal.js": [],
  "src/views/server/server.template.js": ["precise", "standard"],
  "src/views/usuarios/usuarios.template.js": [],
  "src/views/usuarios/usuarios.template.modal.js": [],
});
// Measured: every consumer with the date presets it names.
const DATE_CONSUMERS = Object.freeze({
  "src/features/incidencias-detail-state/index.js": ["shortMonthDateTime"],
  "src/views/clientes/clientes.template.js": ["dateTime", "shortMonthDate"],
  "src/views/clientes/clientes.template.modal.js": ["dateTime", "shortMonthDate"],
  "src/views/facturas/facturas.template.js": ["date", "dateTime"],
  "src/views/facturas/facturas.template.modal.base.js": ["date", "dateTime"],
  "src/views/home/home.template.foundation.js": ["shortMonthDateTime"],
  "src/views/incidencias/incidencias.template.js": ["shortMonthDate"],
  "src/views/incidencias/incidencias.template.modal.impl.js": ["dateTime"],
  "src/views/incidencias/incidencias.template.modal.js": ["shortMonthDateTime"],
  "src/views/usuarios/usuarios.template.js": ["dateTime", "shortMonthDate"],
  "src/views/usuarios/usuarios.template.modal.js": ["dateTime"],
});
// Upper bound of es-ES DateTimeFormat constructions outside the authority: presets one module shows.
const LOCAL_DATE_FORMATTERS = Object.freeze({
  "src/views/clientes/clientes.template.js": 1,
  "src/views/correo/correo.template.js": 3,
  "src/views/incidencias/incidencias.template.js": 2,
  "src/views/server/server.template.base.js": 1,
  "src/views/server/server.template.js": 2,
  "src/views/whatsapp/whatsapp.template.js": 1,
});
// Local policies that stay with their domain, with the reason.
const LOCAL_CURRENCY_FORMATTERS = Object.freeze({
  // chart axis labels: compact notation from 1000 and digits that depend on the value
  "src/views/server/server.template.js": 1,
});

/* ALTA EXPLICITA DE UN CONSUMIDOR NUEVO · mismo criterio que en
   `error-extraction-contract`.

   Los mapas de arriba se miden contra `src`, y los jobs que validan con el
   tooling de la base los ejecutan contra el `src` del candidato. Un modulo
   NUEVO no puede estar en ellos todavia --el archivo no existe aun en la
   base-- y comparar el mapa entero con `deepEqual` lo rechazaba, de modo
   que ningun PR podia estrenar un consumidor de estas autoridades. La
   salida no es relajar la comprobacion: es que el modulo nuevo DECLARE en
   su propio origen QUE usa, donde el revisor lo ve en el diff y donde este
   contrato puede comprobarlo contra lo que llama de verdad.

   `none` significa "ninguna", y hay que escribirlo: el silencio no declara. */
const CURRENCY_DECLARATION_FORM = "/* @format-currency-policies <none|lista> */";
const PRESET_DECLARATION_FORM = "/* @format-date-presets <none|lista> */";
const CURRENCY_DECLARATION = /@format-currency-policies\s+([A-Za-z][A-Za-z0-9,\t ]*)/gu;
const PRESET_DECLARATION = /@format-date-presets\s+([A-Za-z][A-Za-z0-9,\t ]*)/gu;

function declaredNames(code, pattern) {
  return [...code.matchAll(pattern)].map((match) =>
    match[1].split(",").map((name) => name.trim()).filter(Boolean).filter((name) => name !== "none"));
}

function reviewDeclaredUse({ path, code, used, listed, valid, pattern, form, label }) {
  for (const name of used) assert.ok(Object.hasOwn(valid, name), `${path}: nombra ${label} que no existe (${name})`);
  const declared = declaredNames(code, pattern);
  if (Object.hasOwn(listed, path)) {
    assert.deepEqual(declared, [], `${path}: esta medido; ${label} vive en el mapa de este contrato, no en una declaracion`);
    return;
  }
  assert.equal(declared.length, 1, `${path}: un consumidor que este contrato no midio declara una vez, en su propio origen (${form})`);
  for (const name of declared[0]) assert.ok(Object.hasOwn(valid, name), `${path}: declara ${label} que no existe (${name})`);
  assert.deepEqual([...declared[0]].sort(), [...used].sort(), `${path}: declara [${declared[0]}] y usa [${used}]`);
}

/* Las protecciones siguen puestas, y aqui se demuestra una por una. */
const NUEVO = "src/views/nueva/nueva.dates.js";
const MEDIDO = "src/views/facturas/facturas.template.js";
const currencyCase = (path, code, used, listed = CONSUMERS) => () => reviewDeclaredUse({
  path, code, used, listed, valid: CURRENCY_POLICIES, pattern: CURRENCY_DECLARATION,
  form: CURRENCY_DECLARATION_FORM, label: "una politica",
});
currencyCase(NUEVO, "/* @format-currency-policies none */", [])();
currencyCase(NUEVO, "/* @format-currency-policies standard, precise */", ["precise", "standard"])();
assert.throws(currencyCase(NUEVO, "sin declaracion", []), /declara una vez/u, "un consumidor nuevo sin declarar no pasa");
assert.throws(currencyCase(NUEVO, "/* @format-currency-policies inventada */", ["standard"]), /declara una politica que no existe/u, "una politica desconocida no pasa");
assert.throws(currencyCase(NUEVO, "/* @format-currency-policies none */", ["standard"]), /declara \[\] y usa \[standard\]/u, "declarar una cosa y usar otra no pasa");
assert.throws(currencyCase(NUEVO, "/* @format-currency-policies standard */", ["inventada"]), /nombra una politica que no existe/u, "usar una politica inexistente no pasa");
assert.throws(currencyCase(NUEVO, "/* @format-currency-policies none */\n/* @format-currency-policies standard */", []), /una vez/u, "dos declaraciones no pasan");
assert.throws(currencyCase(MEDIDO, "/* @format-currency-policies none */", ["standard"]), /vive en el mapa/u, "un consumidor medido no se mueve declarando");
assert.throws(() => reviewDeclaredUse({
  path: NUEVO, code: "/* @format-date-presets inventado */", used: ["dateTime"], listed: DATE_CONSUMERS,
  valid: DATE_PRESETS, pattern: PRESET_DECLARATION, form: PRESET_DECLARATION_FORM, label: "un preset",
}), /declara un preset que no existe/u, "y lo mismo vale para los presets de fecha");

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
// Date presets: frozen, one formatter per preset, the shape each preset prints (time zone independent).
assert.deepEqual(Object.keys(DATE_PRESETS), ["dateTime", "date", "shortMonthDate", "shortMonthDateTime"]);
assert.ok(Object.isFrozen(DATE_PRESETS));
for (const preset of Object.values(DATE_PRESETS)) assert.ok(Object.isFrozen(preset));
const sample = new Date(Date.UTC(2026, 8, 16, 4, 5, 6));
assert.equal(dateFormatter(DATE_PRESETS.dateTime), dateFormatter(DATE_PRESETS.dateTime), "one formatter per preset");
assert.notEqual(dateFormatter(DATE_PRESETS.dateTime), dateFormatter(DATE_PRESETS.date));
assert.match(dateFormatter(DATE_PRESETS.dateTime).format(sample), /^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/u);
assert.match(dateFormatter(DATE_PRESETS.date).format(sample), /^\d{2}\/\d{2}\/\d{4}$/u);
assert.match(dateFormatter(DATE_PRESETS.shortMonthDate).format(sample), /^\d{2} [a-z]{3,4}\.? \d{4}$/u);
assert.match(dateFormatter(DATE_PRESETS.shortMonthDateTime).format(sample), /^\d{2} [a-z]{3,4}\.? \d{4}, \d{2}:\d{2}$/u);
assert.equal(dateFormatter(DATE_PRESETS.dateTime).resolvedOptions().locale.slice(0, 2), "es");

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
const dateConsumers = {};
const sharedPresetOutside = [];
const localDateFormatters = {};
const PRESET_KEYS = new Map(Object.entries(DATE_PRESETS).map(([name, preset]) => [JSON.stringify(Object.fromEntries(Object.entries(preset).sort())), name]));
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
  for (const built of executable.matchAll(/new Intl\.DateTimeFormat\(\s*["']es-ES["']\s*(?:,\s*(\{[^{}]*\}))?\s*\)/gu)) {
    const options = {};
    for (const pair of (built[1] || "{}").matchAll(/(\w+)\s*:\s*["']([^"']*)["']/gu)) options[pair[1]] = pair[2];
    const preset = PRESET_KEYS.get(JSON.stringify(Object.fromEntries(Object.entries(options).sort())));
    if (preset) sharedPresetOutside.push(`${path} → ${preset}`);
    else localDateFormatters[path] = (localDateFormatters[path] || 0) + 1;
  }
  const presets = [...new Set([...executable.matchAll(/DATE_PRESETS\.(\w+)/gu)].map((m) => m[1]))].sort();
  if (presets.length) {
    reviewDeclaredUse({ path, code, used: presets, listed: DATE_CONSUMERS, valid: DATE_PRESETS,
      pattern: PRESET_DECLARATION, form: PRESET_DECLARATION_FORM, label: "un preset" });
    dateConsumers[path] = presets;
  }
  const calls = [...executable.matchAll(/(?<![\w$.])(formatCurrency|currencyFormatter|formatDecimal|currencyCode|dateFormatter)\s*\(/gu)];
  if (calls.length && !imports) callersWithoutBinding.push(path);
  for (const alias of imported) if (/\sas\s/u.test(alias)) callersWithoutBinding.push(`${path} → ${alias}`);
  if (calls.length) {
    const policies = [...new Set([...executable.matchAll(/CURRENCY_POLICIES\.(\w+)/gu)].map((m) => m[1]))].sort();
    reviewDeclaredUse({ path, code, used: policies, listed: CONSUMERS, valid: CURRENCY_POLICIES,
      pattern: CURRENCY_DECLARATION, form: CURRENCY_DECLARATION_FORM, label: "una politica" });
    consumers[path] = policies;
  }
  if (ENTRY_AND_LEAF.includes(path) && code.includes("/core/format.js\"")) entryImports.push(path);
}
assert.deepEqual(definers, [AUTHORITY], "the primitives are defined in core/format.js only");
assert.deepEqual(currencyOutside, LOCAL_CURRENCY_FORMATTERS, "no currency Intl formatter outside the authority beyond the listed local policy");
assert.deepEqual(cachesOutside, [], "no module keeps a money formatter cache of its own");
assert.deepEqual(plainOutside, [], "no module builds the plain es-ES number formatter again");
assert.deepEqual(callersWithoutBinding, [], "every caller imports core/format.js by name");
/* Los medidos, contra el mapa y en los dos sentidos: uno que cambie de
   politica falla, y uno que desaparezca de `src` tambien. Los que este
   contrato no midio ya han pasado por su declaracion, arriba. */
const listedConsumers = Object.fromEntries(Object.entries(consumers).filter(([path]) => Object.hasOwn(CONSUMERS, path)));
assert.deepEqual(listedConsumers, CONSUMERS, "the consumers and their policies are the measured map");
assert.deepEqual(sharedPresetOutside, [], "no module builds a shared date preset again");
/* COTA SUPERIOR, que es lo que este mapa dice ser. Un modulo puede dejar de
   construir formateadores propios --y Agenda lo hace al pasar a la
   autoridad--; lo que no puede es construir mas de los medidos, ni
   estrenarlos sin medida: el que no esta listado tiene cota cero. */
const overLocalBound = Object.entries(localDateFormatters)
  .filter(([path, count]) => count > (LOCAL_DATE_FORMATTERS[path] || 0))
  .map(([path, count]) => `${path}: ${count} > ${LOCAL_DATE_FORMATTERS[path] || 0}`);
assert.deepEqual(overLocalBound, [], "local date presets stay within the measured upper bound per module");
const listedDateConsumers = Object.fromEntries(Object.entries(dateConsumers).filter(([path]) => Object.hasOwn(DATE_CONSUMERS, path)));
assert.deepEqual(listedDateConsumers, DATE_CONSUMERS, "the date preset consumers are the measured map");
assert.deepEqual(entryImports, [], "main.js and analytics/google-tag.js never import core/format.js");

console.log(`Format contract: PASS · formatCurrency/currencyFormatter/currencyCode/formatDecimal/dateFormatter in core/format.js · 4 currency policies and 4 date presets frozen · behaviour with real Intl (EUR, USD, JPY, unknown and malformed codes; preset shapes) · ${Object.keys(listedConsumers).length} consumers on their measured policies (${Object.keys(consumers).length - Object.keys(listedConsumers).length} declaring their own) · ${Object.keys(listedDateConsumers).length} date consumers on their measured presets (${Object.keys(dateConsumers).length - Object.keys(listedDateConsumers).length} declaring their own) · 1 local currency policy and ${Object.values(localDateFormatters).reduce((a, b) => a + b, 0)} local date presets listed · no shared preset, formatter cache or plain es-ES formatter outside · callers bind by name · entry and analytics leaf import none`);
