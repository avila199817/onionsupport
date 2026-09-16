import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ERROR_MESSAGE_POLICIES, errorMessage } from "../src/core/errors.js";

// One technical extractor of the human-readable text an error carries,
// core/errors.js errorMessage(error, fallback, order), with two named orders.
// Eighteen modules carried a copy (safeError, errorText, errorMessage,
// normalizeErrorMessage) and two features inlined the chain; each consumer
// now calls the authority with the order it reproduced. The orders are
// frozen here: moving a consumer between them is a product decision. Codes
// are never a message (errorCode reads them); which human message a domain
// shows for a code or status is the presentation layer's decision.
const AUTHORITY = "src/core/errors.js";
const POLICIES = Object.freeze({
  messageFirst: ["message", "dataMessage", "payloadMessage", "responseDataMessage", "responseMessage"],
  payloadFirst: ["dataMessage", "payloadMessage", "responseDataMessage", "responseMessage", "message"],
});
// Consumer → order, as measured before the migration.
const CONSUMERS = Object.freeze({
  "src/features/entity-overlay/index.js": "messageFirst",
  "src/features/facturas-paid-confirm/index.js": "messageFirst",
  "src/features/incidencias-technician-profile/index.js": "messageFirst",
  "src/views/clientes/clientes.create-controller.js": "messageFirst",
  "src/views/clientes/index.js": "messageFirst",
  "src/views/correo/index.js": "messageFirst",
  "src/views/empleados/index.js": "messageFirst",
  "src/views/facturas/index.js": "messageFirst",
  "src/views/home/index.js": "messageFirst",
  "src/views/incidencias/index.impl.js": "messageFirst",
  "src/views/usuarios/index.js": "messageFirst",
  "src/views/usuarios/usuarios.api.js": "messageFirst",
  "src/views/cuenta/cuenta.api.js": "payloadFirst",
  "src/views/cuenta/index.js": "payloadFirst",
  "src/views/server/index.js": "payloadFirst",
  "src/views/server/server.api.base.js": "payloadFirst",
  "src/views/server/server.api.js": "payloadFirst",
  "src/views/usuarios/usuarios.template.create.js": "payloadFirst",
  "src/views/whatsapp/index.js": "payloadFirst",
});
// Extractors with a policy of their own that stay local (upper bound; each has a reason):
// - clientes.api errorMessage(response): reads a response envelope and falls back to its error/code text (envelope reader, not an Error reader)
// - whatsapp.api requestError: strips control characters, caps at 500 and builds a WhatsAppApiError with its own code chain (transport wrapper)
// - public-support errorMessage(error): maps status/conflict to the support domain's human text (presentation layer, not extraction)
const LOCAL_EXTRACTORS = Object.freeze(["src/views/clientes/clientes.api.js", "src/views/whatsapp/whatsapp.api.js"]);
const LOCAL_DEFINERS = Object.freeze(["src/views/clientes/clientes.api.js", "src/features/public-support/index.js"]);
const CHAIN_FINGERPRINT = /\?\.data\?\.message|error\?\.payload\?\.message|response\?\.data\?\.message/u;
const SECRET = "S3cr3tV4lu3XYZ";

assert.deepEqual(Object.fromEntries(Object.entries(ERROR_MESSAGE_POLICIES).map(([k, v]) => [k, [...v]])), POLICIES, "the two orders are the frozen ones");
const { messageFirst, payloadFirst } = ERROR_MESSAGE_POLICIES;
const wrapped = Object.assign(new Error("Activación rechazada."), { code: "ACTIVATION_FAILED", status: 400, data: { code: "TOKEN_EXPIRED", message: "El enlace ha caducado." } });
assert.equal(errorMessage(wrapped, "fb", messageFirst), "Activación rechazada.", "messageFirst: the Error's own text wins");
assert.equal(errorMessage(wrapped, "fb", payloadFirst), "El enlace ha caducado.", "payloadFirst: the payload text wins");
const http = Object.assign(new Error("El correo del cliente no es válido."), { data: { message: "El correo del cliente no es válido." }, payload: { message: "El correo del cliente no es válido." } });
assert.equal(errorMessage(http, "fb", messageFirst), errorMessage(http, "fb", payloadFirst), "an http error reads the same under both orders");
assert.equal(errorMessage(new Error("  Línea\n  dos  "), "fb", messageFirst), "Línea dos", "one line, trimmed");
assert.equal(errorMessage(new Error(`Bearer ${SECRET} rechazado ?token=${SECRET}`), "fb", messageFirst), "Bearer *** rechazado ?token=***", "redacted");
assert.equal(errorMessage({ ok: false, code: "RATE_LIMITED", error: "RATE_LIMITED" }, "fb", messageFirst), "fb", "a code is never a message");
assert.equal(errorMessage({ error: { code: "REVIEW_INPUT_INVALID" } }, "fb", messageFirst), "fb", "an error object is never stringified");
assert.equal(errorMessage({ message: "Operación no permitida." }, "fb", payloadFirst), "Operación no permitida.", "a raw envelope with a message reads it");
assert.equal(errorMessage(Object.assign(new Error(""), { data: { message: "  " } }), "  respaldo  ", payloadFirst), "respaldo", "blank candidates fall through; the fallback is cleaned");
for (const value of [null, undefined, "", "texto", 0, 404, ["a"], new DOMException("x", "AbortError")]) {
  if (value instanceof DOMException) { assert.equal(errorMessage(value, "fb", messageFirst), "x"); continue; }
  assert.equal(errorMessage(value, "fb", messageFirst), "fb", `${JSON.stringify(value)}: fallback`);
}
assert.equal(errorMessage(null, "", messageFirst), "", "an empty fallback stays empty");

// Source: one definer, every consumer imports the authority and names its order on every call, no chain outside the authority and the listed locals.
const SRC_ROOT = fileURLToPath(new URL("../src/", import.meta.url));
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en")).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}
const definers = []; const consumers = {}; const chainsOutside = [];
for (const file of sourceFiles(SRC_ROOT)) {
  const code = readFileSync(file, "utf8");
  const path = `src/${relative(SRC_ROOT, file).split(sep).join("/")}`;
  if (/^(?:export )?function errorMessage\s*\(/mu.test(code)) definers.push(path);
  if (path === AUTHORITY || LOCAL_DEFINERS.includes(path)) continue;
  if (CHAIN_FINGERPRINT.test(code) && !LOCAL_EXTRACTORS.includes(path)) chainsOutside.push(path);
  const executable = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const calls = (executable.match(/(?<![\w$.])errorMessage\s*\(/gu) || []).length;
  if (calls === 0) continue;
  assert.match(code, /import \{[^}]*\berrorMessage\b[^}]*\} from "[^"]*\/core\/errors\.js";/u, `${path}: imports errorMessage from the authority`);
  const orders = (executable.match(/ERROR_MESSAGE_POLICIES\.\w+/gu) || []);
  assert.equal(orders.length, calls, `${path}: every errorMessage call names its order as its third argument (${calls} calls, ${orders.length} order references)`);
  const distinct = [...new Set(orders.map((o) => o.split(".")[1]))];
  assert.equal(distinct.length, 1, `${path}: one order per module (${distinct.join(", ")})`);
  consumers[path] = distinct[0];
}
assert.deepEqual(definers.sort(), [AUTHORITY, ...LOCAL_DEFINERS].sort(), "errorMessage is defined only in core/errors.js and the two listed locals (envelope reader, presentation mapper)");
assert.deepEqual(consumers, CONSUMERS, "each consumer uses the order measured before the migration; moving one is a decision");
assert.deepEqual(chainsOutside, [], "no module reads data/payload message chains outside the authority and the two listed local extractors");
for (const path of LOCAL_EXTRACTORS) assert.ok(CHAIN_FINGERPRINT.test(readFileSync(join(SRC_ROOT, path.slice("src/".length)), "utf8")), `${path} still carries its own extractor (drop it from the list when it converges)`);

console.log(`Error message policies contract: PASS · errorMessage in core/errors.js · 2 orders frozen · ${Object.keys(CONSUMERS).length} consumers on their measured order · one definer · ${LOCAL_EXTRACTORS.length} local extractors listed · behaviour of both orders`);
