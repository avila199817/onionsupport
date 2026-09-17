import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ERROR_MESSAGE_POLICIES, describeError, errorCode, errorMessage, errorStatus } from "../src/core/errors.js";

// Technical extraction of what an error carries lives in core/errors.js:
// errorMessage(error, fallback, order) with two named orders, errorStatus
// (the first finite status above zero among status, statusCode, the
// response's and the payload's), errorCode (the first code among code, the
// envelope's error string, the payload's and the response's, as the
// canonical code key) and describeError (the kernel's { name, message,
// status, code } record). Eighteen modules carried a message copy, nine a
// status or code copy and seven a structured record; each consumer now
// composes the authority. The message orders are frozen here: moving a
// consumer between them is a product decision. Codes are never a message;
// which human message a domain shows for a code or status is the
// presentation layer's decision.
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
  "src/views/facturas/facturas.api.base.js": "messageFirst",
  "src/views/home/home.api.js": "messageFirst",
  "src/views/incidencias/incidencias.api.impl.js": "messageFirst",
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
// - whatsapp.api requestError: strips control characters, caps at 500/120 and builds a WhatsAppApiError with its own message and code chains (transport wrapper)
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

// Behaviour: status and code.
const httpLike = Object.assign(new Error("HTTP 404"), { code: "NOT_FOUND", status: 404, statusCode: 404, data: { code: "***" }, payload: { code: "***" }, response: { status: 404 } });
assert.equal(errorStatus(httpLike), 404);
assert.equal(errorCode(httpLike), "NOT_FOUND", "the error's own code wins; the masked payload code never leaks");
assert.equal(errorStatus({ statusCode: 503 }), 503);
assert.equal(errorStatus({ response: { status: 502 } }), 502);
assert.equal(errorStatus({ data: { status: 410 } }), 410, "a payload status counts when the error carries none");
assert.equal(errorStatus({ status: "409" }), 409, "numeric text is a status");
assert.equal(errorStatus({ status: 0, statusCode: 0 }), 0, "0 is no status: the fallback");
assert.equal(errorStatus({ status: 0 }, null), null);
assert.equal(errorStatus({ status: NaN, statusCode: "abc" }, 400), 400);
assert.equal(errorStatus({ status: -1, statusCode: 404 }), 404, "a negative number is no status");
assert.equal(errorStatus(null), 0);
assert.equal(errorCode({ code: "cliente-not-found" }), "CLIENTE_NOT_FOUND", "canonical code key");
assert.equal(errorCode({ error: "invalid_grant" }), "INVALID_GRANT", "the envelope's error string is a code");
assert.equal(errorCode({ data: { code: "TOKEN_EXPIRED" } }), "TOKEN_EXPIRED");
assert.equal(errorCode({ code: 42 }), "42", "a numeric code is text");
assert.equal(errorCode({ error: { code: "REVIEW_INPUT_INVALID" } }), "", "an object is no code");
assert.equal(errorCode({ code: "  " }, "FB"), "FB");
assert.equal(errorCode(null, "FB"), "FB");
assert.equal(errorCode(new Error("x")), "");
const described = describeError(Object.assign(new Error("  Cliente no encontrado.\n?token=abc  "), { name: "HttpError", code: "cliente-not-found", status: "404" }));
assert.deepEqual(described, { name: "HttpError", message: "Cliente no encontrado. ?token=***", status: 404, code: "CLIENTE_NOT_FOUND" }, "the kernel record: name, one-line redacted message, numeric status, canonical code");
assert.deepEqual(describeError(new Error("x")), { name: "Error", message: "x", status: null, code: null });
assert.deepEqual(describeError("texto"), { name: "Error", message: "texto", status: null, code: null }, "a thrown string is described as its text");
assert.equal(describeError(null), null);
assert.equal(describeError(undefined), null);

// Source: one definer, every consumer imports the authority and names its order on every call, no chain outside the authority and the listed locals.
const SRC_ROOT = fileURLToPath(new URL("../src/", import.meta.url));
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en")).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}
const STATUS_CHAIN = /\?\.status\s*\|\|\s*[\w?.]*statusCode|\?\.statusCode\s*\|\|/u;
const CODE_CHAIN = /\?\.code\s*\|\|\s*[\w?.]*\?\.(?:error|code)\b|cleanText\(\s*(?:error|response)\?\.code\b[^)]*\)\s*\.toUpperCase\(\)/u;
// Readers with a policy of their own (upper bound): usuarios.api getErrorStatus composes errorStatus and clamps to 100..599.
const definers = []; const consumers = {}; const chainsOutside = []; const statusChains = []; const codeChains = [];
for (const file of sourceFiles(SRC_ROOT)) {
  const code = readFileSync(file, "utf8");
  const path = `src/${relative(SRC_ROOT, file).split(sep).join("/")}`;
  if (/^(?:export )?function errorMessage\s*\(/mu.test(code)) definers.push(path);
  if (path === AUTHORITY || LOCAL_DEFINERS.includes(path)) continue;
  if (CHAIN_FINGERPRINT.test(code) && !LOCAL_EXTRACTORS.includes(path)) chainsOutside.push(path);
  if (path !== "src/main.js" && !LOCAL_EXTRACTORS.includes(path) && STATUS_CHAIN.test(code)) statusChains.push(path);
  if (path !== "src/main.js" && !LOCAL_EXTRACTORS.includes(path) && CODE_CHAIN.test(code)) codeChains.push(path);
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
/* SÓLO HABLA QUIEN PUEDE RESPONDER · la decisión vive en el dominio.

   `errorMessage` extrae; presentar es de la vista. La extracción no puede
   filtrar por su cuenta faltas del motor: `core/errors.js` está en el cierre de
   arranque de la Home pública, cuyo presupuesto medido deja 33 bytes, y la
   regla costaba 91. Usuarios --la vista donde un `ReferenceError` llegó a
   imprimirse-- decide con los hechos que la autoridad ya calcula: sólo habla
   con su propio texto un error que trae estado HTTP o código, que es lo que
   distingue una respuesta del backend de una falta de programación. */
const PRESENTACION_POR_DOMINIO = Object.freeze({
  "src/views/usuarios/index.js": "humanErrorText",
});
for (const [ruta, politica] of Object.entries(PRESENTACION_POR_DOMINIO)) {
  const codigo = readFileSync(join(SRC_ROOT, ruta.slice("src/".length)), "utf8");
  assert.match(codigo, new RegExp(`function ${politica}\\(error, fallback\\)`, "u"), `${ruta}: declara su política de presentación`);
  assert.match(codigo, /errorStatus\(error, 0\) \|\| errorCode\(error\)/u, `${ruta}: la política decide por estado o código, no por el nombre de la clase`);
  const ejecutable = codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.equal((ejecutable.match(/(?<![\w$.])errorMessage\s*\(/gu) || []).length, 1,
    `${ruta}: una sola extracción, dentro de su política`);
  assert.equal((ejecutable.match(new RegExp(`(?<![\\w$.])${politica}\\s*\\(`, "gu")) || []).length >= 6, true,
    `${ruta}: todas sus presentaciones pasan por la política`);
}

assert.deepEqual(definers.sort(), [AUTHORITY, ...LOCAL_DEFINERS].sort(), "errorMessage is defined only in core/errors.js and the two listed locals (envelope reader, presentation mapper)");
assert.deepEqual(consumers, CONSUMERS, "each consumer uses the order measured before the migration; moving one is a decision");
assert.deepEqual(chainsOutside, [], "no module reads data/payload message chains outside the authority and the two listed local extractors");
assert.deepEqual(statusChains, [], "no module reads status || statusCode chains: errorStatus does");
assert.deepEqual(codeChains, [], "no module reads code || error chains or upper-cases a code by hand: errorCode does");
for (const path of LOCAL_EXTRACTORS) assert.ok(CHAIN_FINGERPRINT.test(readFileSync(join(SRC_ROOT, path.slice("src/".length)), "utf8")), `${path} still carries its own extractor (drop it from the list when it converges)`);

console.log(`Error extraction contract: PASS · errorMessage (2 orders frozen, ${Object.keys(CONSUMERS).length} consumers on their measured order), errorStatus, errorCode and describeError in core/errors.js · one definer · ${LOCAL_EXTRACTORS.length} local extractors listed · no status/code chain outside the authority · behaviour of the four · Usuarios presenta por estado o código`);
