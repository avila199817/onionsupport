import assert from "node:assert/strict";

// The error a view receives from core/http.js carries the backend payload as
// text, redacted by pattern, never encoded as a path. Until the secret
// redaction authority, sanitizeData ran the URL-aware pass over every payload
// string, so error.data.message arrived as
// "/Credenciales%20inv%C3%A1lidas..." while error.message arrived clean, and
// the views that read data.message first (Cuenta, Servidor, WhatsApp, the
// Usuarios create form) showed the backend message encoded. Routes keep the
// URL-aware pass: endpoint and url are still redacted as URLs.
const define = (name, value) => { try { Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }); } catch {} };
if (typeof globalThis.window === "undefined") define("window", globalThis);
if (typeof globalThis.document === "undefined") define("document", { createElement: () => ({}), addEventListener() {}, removeEventListener() {}, visibilityState: "visible" });
if (typeof globalThis.location === "undefined") define("location", { origin: "https://onionsupport.com", href: "https://onionsupport.com/", pathname: "/", search: "", hash: "" });
if (typeof globalThis.localStorage === "undefined") { const store = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} }; define("localStorage", store); define("sessionStorage", store); }

const SECRET = "S3cr3tV4lu3XYZ";
const payload = {
  message: "Credenciales inválidas. Revisa tu contraseña.",
  code: "VALIDATION_ERROR",
  detail: `Consulta /reset-password/confirm/${SECRET}?token=${SECRET} o Bearer ${SECRET}`,
  nested: { note: "Sesión expirada.\nVuelve a entrar.", items: ["Línea uno", `/callback?access_token=${SECRET}`] },
  token: SECRET,
};
let calls = 0;
define("fetch", async () => { calls += 1; return new Response(JSON.stringify(payload), { status: 422, headers: { "content-type": "application/json" } }); });

const { default: Http } = await import("../src/core/http.js");
let caught = null;
try { await Http.post(`/clientes?page=2&token=${SECRET}`, { nombre: "x" }); } catch (error) { caught = error; }
assert.ok(caught, "an HTTP 422 rejects (a status that never triggers the session refresh)");
assert.ok(calls >= 1, "the fake fetch answered");
assert.equal(caught.name, "HttpError");
assert.equal(caught.status, 422);
assert.equal(caught.code, "VALIDATION_ERROR");
assert.equal(caught.message, payload.message, "error.message is the backend message, clean");
assert.equal(caught.data.message, payload.message, "error.data.message is the backend message as text, not an encoded path");
assert.equal(caught.payload.message, payload.message, "error.payload.message is the same text");
assert.equal(caught.data.detail, "Consulta /reset-password/confirm/***?token=*** o Bearer ***", "payload strings are redacted by pattern");
assert.equal(caught.data.nested.note, "Sesión expirada.\nVuelve a entrar.", "payload strings keep their whitespace (views clean them)");
assert.deepEqual(caught.data.nested.items, ["Línea uno", "/callback?access_token=***"], "nested arrays too");
assert.equal(caught.data.token, "***", "sensitive keys stay masked by key");
assert.equal(caught.endpoint, "/clientes?page=2&token=***", "endpoint keeps the URL-aware pass");
assert.equal(caught.url, "https://api.onionsupport.com/clientes?page=2", "url keeps its origin; http drops sensitive query parameters from the request URL before sending");

const snapshot = Http.getDebugSnapshot();
assert.equal(snapshot.stats.lastError?.message, payload.message, "stats.lastError.message is text, not an encoded path");
assert.equal(snapshot.stats.lastError?.endpoint, "/clientes?page=2&token=***");
assert.equal(caught.data.code, "***", "inherited and unchanged: the by-key masking treats the payload's \"code\" as sensitive (OAuth code), so error.data.code is never readable; error.code carries the backend code");

console.log("HTTP error payload contract: PASS · error.message and error.data.message are the backend text · payload strings redacted by pattern with whitespace kept · endpoint/url redacted as URLs · sensitive keys masked · stats.lastError text");
