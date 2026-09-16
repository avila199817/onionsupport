import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { BOOLEAN_POLICIES, parseBoolean } from "../src/core/booleans.js";

// One boolean parser with named token policies in core/booleans.js. Six
// modules carried a parseBoolean copy and one a `bool` copy, with five
// different token lists and two coercion scopes; each now calls the
// authority with the policy that reproduces exactly what it accepted. The
// policies are frozen here: adding a token or moving a consumer to a wider
// policy is a product decision. Four parsers keep their own policy and
// stay local, listed below with the reason.
const AUTHORITY = "src/core/booleans.js";
const POLICIES = Object.freeze({
  switch: { truthy: ["true", "1", "yes", "si", "on"], falsy: ["false", "0", "no", "off"], coerce: "strings", fallback: false },
  switchAny: { truthy: ["true", "1", "yes", "si", "on"], falsy: ["false", "0", "no", "off"], coerce: "any", fallback: false },
  activity: { truthy: ["true", "yes", "si", "on", "enabled", "active"], falsy: ["false", "no", "off", "disabled", "inactive"], coerce: "any", fallback: false },
  activityEs: { truthy: ["true", "yes", "si", "on", "enabled", "active", "activo"], falsy: ["false", "no", "off", "disabled", "inactive", "inactivo"], coerce: "any", fallback: null },
  activityEsStrings: { truthy: ["true", "yes", "si", "on", "enabled", "active", "activo"], falsy: ["false", "no", "off", "disabled", "inactive", "inactivo"], coerce: "strings", fallback: null },
  activityEsExtended: { truthy: ["true", "1", "yes", "si", "on", "active", "activo", "enabled", "habilitado"], falsy: ["false", "0", "no", "off", "inactive", "inactivo", "disabled", "deshabilitado"], coerce: "any", fallback: false },
});
// Consumer → policy, as measured before the migration. Moving a module is a decision.
const CONSUMERS = Object.freeze({
  "src/views/facturas/index.js": "switch",
  "src/views/facturas/facturas.template.modal.base.js": "switchAny",
  "src/views/facturas/facturas.template.create.js": "activity",
  "src/views/usuarios/usuarios.template.create.js": "activity",
  "src/views/clientes/clientes.model.js": "activityEs",
  "src/views/clientes/clientes.template.modal.js": "activityEsStrings",
  "src/views/usuarios/usuarios.api.js": "activityEsExtended",
});

// Policies are exactly the frozen lists.
assert.deepEqual(Object.keys(BOOLEAN_POLICIES).sort(), Object.keys(POLICIES).sort(), "the authority names exactly the five policies");
for (const [name, expected] of Object.entries(POLICIES)) {
  assert.deepEqual({ truthy: [...BOOLEAN_POLICIES[name].truthy], falsy: [...BOOLEAN_POLICIES[name].falsy], coerce: BOOLEAN_POLICIES[name].coerce, fallback: BOOLEAN_POLICIES[name].fallback }, expected, `${name}: token lists, coercion scope and default fallback are the frozen ones`);
}

// Behaviour: the shared mechanism and each policy's own answers.
for (const tokens of Object.values(BOOLEAN_POLICIES)) {
  assert.equal(parseBoolean(true, tokens, null), true);
  assert.equal(parseBoolean(false, tokens, null), false);
  assert.equal(parseBoolean(1, tokens, null), true);
  assert.equal(parseBoolean("1", tokens, null), true);
  assert.equal(parseBoolean(0, tokens, null), false);
  assert.equal(parseBoolean("0", tokens, null), false);
  assert.equal(parseBoolean(" Sí ", tokens, null), true, "slug key: trimmed, lower-cased, accents stripped");
  assert.equal(parseBoolean("OFF", tokens, null), false);
  assert.equal(parseBoolean("", tokens, "fb"), "fb");
  assert.equal(parseBoolean(null, tokens, "fb"), "fb");
  assert.equal(parseBoolean(undefined, tokens, "fb"), "fb");
  assert.equal(parseBoolean(2, tokens, "fb"), "fb");
  assert.equal(parseBoolean("maybe", tokens, "fb"), "fb");
  assert.equal(parseBoolean("maybe", tokens), tokens.fallback, "an omitted fallback is the policy's own, as the retired copy's default parameter");
  assert.equal(parseBoolean("maybe", tokens, undefined), tokens.fallback);
}
// Local parsers with a policy of their own (upper bound; each has a reason):
// - facturas.api.base parseBooleanFlag: any non-zero number is true and "none"/"null" are false (pagination flag of the invoices API)
// - cuenta.api normalizeBoolean: theme words dark/light and y/n, non-zero numbers true, the fallback coerced to boolean (preferences)
// - usuarios.api parseStrictBoolean: activityEsExtended words without padded digits and a contract error instead of a fallback (API validation)
// - facturas.template bool: any number other than 1 is false, never the fallback (switch words otherwise)
const LOCAL_POLICIES = Object.freeze(["src/views/facturas/facturas.api.base.js", "src/views/cuenta/cuenta.api.js", "src/views/usuarios/usuarios.api.js", "src/views/facturas/facturas.template.js"]);
const TOKEN_LIST_FINGERPRINT = /\[\s*"true",[\s\S]{0,80}?"yes"/u;
const { switch: sw, switchAny, activity, activityEs, activityEsStrings, activityEsExtended } = BOOLEAN_POLICIES;
assert.equal(parseBoolean("enabled", sw, "fb"), "fb", "switch has no activity words");
assert.equal(parseBoolean("activo", activity, "fb"), "fb", "activity has no Spanish words");
assert.equal(parseBoolean("activo", activityEs, "fb"), true);
assert.equal(parseBoolean("habilitado", activityEs, "fb"), "fb");
assert.equal(parseBoolean("habilitado", activityEsExtended, "fb"), true);
assert.equal(parseBoolean("deshabilitado", activityEsExtended, "fb"), false);
assert.equal(parseBoolean(" 1 ", sw, "fb"), true, "switch lists 1/0 as tokens, so padded digits parse");
assert.equal(parseBoolean(" 1 ", activityEsExtended, "fb"), true);
assert.equal(parseBoolean(" 1 ", activity, "fb"), "fb", "activity lists no digits: padded digits fall back");
assert.equal(parseBoolean(["yes"], activityEs, "fb"), true, "coerce any: the slug key of an array");
assert.equal(parseBoolean(["yes"], activityEsStrings, "fb"), "fb", "coerce strings: only strings reach the tokens");
assert.equal(parseBoolean(["yes"], sw, "fb"), "fb");
assert.equal(parseBoolean(["yes"], switchAny, "fb"), true);
assert.equal(parseBoolean(2, switchAny, "fb"), "fb");

// Source: no other definer under any boolean-parser name, every consumer imports the authority and passes its policy on every call.
const SRC_ROOT = fileURLToPath(new URL("../src/", import.meta.url));
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en")).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}
const definers = [];
const consumers = {};
const tokenListsOutside = [];
for (const file of sourceFiles(SRC_ROOT)) {
  const code = readFileSync(file, "utf8");
  const path = `src/${relative(SRC_ROOT, file).split(sep).join("/")}`;
  if (/^(?:export )?(?:function parseBoolean\s*\(|(?:const|let) parseBoolean\b)/mu.test(code)) definers.push(path);
  if (path === AUTHORITY) continue;
  if (TOKEN_LIST_FINGERPRINT.test(code) && !LOCAL_POLICIES.includes(path)) tokenListsOutside.push(path);
  const executable = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const calls = (executable.match(/(?<![\w$.])parseBoolean\s*\(/gu) || []).length;
  if (calls === 0) continue;
  const policies = [...new Set([...executable.matchAll(/BOOLEAN_POLICIES\.(\w+)/gu)].map((m) => m[1]))];
  const policyRefs = (executable.match(/BOOLEAN_POLICIES\.\w+/gu) || []).length;
  assert.match(code, /import \{[^}]*\bparseBoolean\b[^}]*\} from "[^"]*\/core\/booleans\.js";/u, `${path}: imports parseBoolean from the authority`);
  assert.equal(policyRefs, calls, `${path}: every parseBoolean call names its policy as its second argument (${calls} calls, ${policyRefs} policy references)`);
  assert.equal(policies.length, 1, `${path}: one policy per module (${policies.join(", ")})`);
  consumers[path] = policies[0];
}
assert.deepEqual(definers, [AUTHORITY], "parseBoolean is defined only in core/booleans.js");
assert.deepEqual(consumers, CONSUMERS, "each consumer uses the policy measured before the migration; moving one is a decision");
assert.deepEqual(tokenListsOutside, [], "no module carries a boolean token list outside the authority and the three listed local policies");
for (const path of LOCAL_POLICIES) assert.ok(TOKEN_LIST_FINGERPRINT.test(readFileSync(join(SRC_ROOT, path.slice("src/".length)), "utf8")), `${path} still carries its own policy (drop it from the list when it converges)`);

console.log(`Boolean policies contract: PASS · ${Object.keys(POLICIES).length} named policies frozen · ${Object.keys(CONSUMERS).length} consumers on their measured policy · one definer · ${LOCAL_POLICIES.length} local policies listed · mechanism and per-policy answers`);
