import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createAsyncScope } from "../src/core/async-scope.js";

// Exercise the actual intake with a small DOM/HTTP boundary; no network, Auth
// boot or test-only exports in production. Browser coverage checks real events.
const source = (await readFile(new URL("../src/features/public-support/index.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/^export default Object\.freeze\([\s\S]*$/m, "")
  .replace(/^export /gm, "");

const accepted = {
  ok: true, success: true, accepted: true,
  ticketId: null, incidenciaId: null, activationRequired: null,
};
const ownerAccepted = {
  ...accepted, ticketId: "INC-20260908-ABC123", incidenciaId: "INC-20260908-ABC123",
  activationRequired: false,
};

function node(name = "", value = "", maxLength = -1) {
  const attributes = new Map();
  const classes = new Set();
  return {
    name, value, maxLength, dataset: {}, hidden: false, textContent: "", disabled: false,
    classList: { toggle(key, enabled) { if (enabled) classes.add(key); else classes.delete(key); } },
    setAttribute(key, next) { attributes.set(key, String(next)); },
    getAttribute(key) { return attributes.get(key) ?? null; },
    removeAttribute(key) { attributes.delete(key); },
    matches() { return true; },
    focus() {},
  };
}

function fixture() {
  const requests = [];
  const events = [];
  const initial = {
    fullName: ["Prueba Local", 120], email: ["fixture@example.test", 180], phone: ["612 345 678", 11],
    address: ["Calle de Prueba 1", 180], addressLine2: ["", 120], postalCode: ["08001", 5],
    city: ["Barcelona", 90], province: ["Barcelona", 90], subject: ["Prueba del formulario", 140],
    description: ["Primera línea\nSegunda línea", 4000], website: ["", -1],
  };
  const fields = Object.fromEntries(Object.entries(initial).map(([name, [value, limit]]) => [name, node(name, value, limit)]));
  const errors = Object.fromEntries(Object.keys(fields).map((name) => [name, { ...node(), id: `public-support-error-${name}`, hidden: true }]));
  const feedback = node();
  const label = node();
  const submit = node();
  const counter = node();
  const form = {
    ...node(), isConnected: true,
    elements: { namedItem: (name) => fields[name] || null },
    querySelector(selector) {
      if (selector.includes("error-for")) return errors[selector.match(/="([^"]+)"/)?.[1]];
      if (selector.includes("submit-label")) return label;
      if (selector.includes("support-status")) return feedback;
      if (selector.includes("support-counter")) return counter;
      if (selector === ".public-support-submit") return submit;
      return null;
    },
    querySelectorAll() { return Object.values(fields); },
  };
  fields.postalCode.setAttribute("aria-describedby", "public-support-postal-help");
  const context = vm.createContext({
    createAsyncScope,
    AppCore: { getState: () => ({}) },
    FormData: class { constructor(value) { this.form = value; } get(name) { return this.form.elements.namedItem(name)?.value || ""; } },
    Http: { post(endpoint, body, options) {
      return new Promise((resolve, reject) => requests.push({ endpoint, body, options, resolve, reject }));
    } },
    CustomEvent: class { constructor(type, detail) { this.type = type; Object.assign(this, detail); } },
  });
  vm.runInContext(source, context);
  Object.assign(context, {
    form,
    window: { dispatchEvent: (event) => events.push(event), requestAnimationFrame: () => 1, cancelAnimationFrame() {}, removeEventListener() {} },
    document: { removeEventListener() {} },
  });
  vm.runInContext("mountRoot = { contains: (form) => form.isConnected, removeEventListener() {} };", context);
  const run = (code) => vm.runInContext(code, context);
  return { fields, errors, form, feedback, label, submit, counter, requests, events, context, run };
}

let scenarios = 0;
{
  const f = fixture();
  f.run('setFieldError(form, form.elements.namedItem("postalCode"), "Revisa el CP.")');
  assert.equal(f.fields.postalCode.getAttribute("aria-describedby"), "public-support-postal-help public-support-error-postalCode");
  f.run('setFieldError(form, form.elements.namedItem("postalCode"), "")');
  assert.equal(f.fields.postalCode.getAttribute("aria-describedby"), "public-support-postal-help");
  assert.equal(f.run("payload(form).description"), "Primera línea\nSegunda línea");
  // Matches the verified backend: five digits, with no invented municipality/range policy.
  f.fields.postalCode.value = "99000";
  assert.equal(f.run("validate(form).length"), 0);
  f.fields.email.value = "x".repeat(180) + "@example.test";
  assert.equal(f.run("validate(form).some((field) => field.name === 'email')"), true);
  scenarios++;
}
{
  const f = fixture();
  for (const phone of ["6123456789", "+34 34612345678", "00346123456789"]) {
    f.fields.phone.value = phone;
    assert.equal(f.run("validate(form).some((field) => field.name === 'phone')"), true, phone);
    f.context.phone = phone;
    assert.equal(f.run("formatNationalSpanishPhone(phone)"), phone);
  }
  for (const phone of ["612 345 678", "+34 612 345 678", "0034612345678", "34612345678"]) {
    f.context.phone = phone;
    assert.equal(f.run("normalizeSpanishPhone(phone)"), "+34 612 345 678", phone);
  }
  scenarios++;
}
{
  const f = fixture();
  const first = f.run("send(form)");
  assert.equal(await f.run("send(form)"), false);
  assert.equal(f.requests.length, 1, "double submit must not create another POST");
  const key = f.requests[0].options.headers["Idempotency-Key"];
  assert.match(key, /^\d{8}:.+/);
  assert.equal(f.form.dataset.submitting, "true");
  assert.equal(f.fields.description.disabled, true);
  f.requests[0].reject({ status: 503 });
  assert.equal(await first, false);
  assert.equal(f.fields.description.value, "Primera línea\nSegunda línea");
  assert.equal(f.fields.description.disabled, false);
  const retry = f.run("send(form)");
  assert.equal(f.requests[1].options.headers["Idempotency-Key"], key);
  f.requests[1].reject({ status: 429 });
  await retry;
  f.fields.subject.value += " editada";
  f.context.inputEvent = { target: { ...f.fields.subject, closest: () => f.form } };
  f.run("onInput(inputEvent)");
  const edited = f.run("send(form)");
  assert.notEqual(f.requests[2].options.headers["Idempotency-Key"], key);
  f.requests[2].reject({ status: 422, payload: { errors: [{ field: "address", message: "Revisa la dirección." }] } });
  await edited;
  assert.equal(f.errors.address.textContent, "Revisa la dirección.");
  assert.equal(f.fields.address.getAttribute("aria-invalid"), "true");
  scenarios++;
}
for (const response of [null, "OK", {}, { ok: false }, { ...accepted, success: false }, { ...accepted, accepted: false }, { ok: true, success: true, accepted: true }, { ...ownerAccepted, incidenciaId: "INC-20260908-999999" }]) {
  const f = fixture();
  const promise = f.run("send(form)");
  const key = f.requests[0].options.headers["Idempotency-Key"];
  f.requests[0].resolve(response);
  assert.equal(await promise, false, `unconfirmed response: ${JSON.stringify(response)}`);
  assert.equal(f.fields.subject.value, "Prueba del formulario");
  assert.equal(f.fields.description.value, "Primera línea\nSegunda línea");
  assert.equal(f.form.dataset.publicSupportIdempotencyKey, key);
  assert.equal(f.form.dataset.activeTicket, "false");
  assert.equal(f.events.length, 0);
  scenarios++;
}
for (const response of [accepted, ownerAccepted, { data: accepted }]) {
  const f = fixture();
  const promise = f.run("send(form)");
  f.requests[0].resolve(response);
  assert.equal(await promise, true);
  assert.equal(f.fields.subject.value, "");
  assert.equal(f.counter.textContent, "0 / 4000");
  assert.equal(f.events[0].type, "onion:public-support:accepted");
  assert.equal(f.label.textContent, response === ownerAccepted ? "Incidencia en curso" : "Solicitud recibida");
  assert.equal(f.run("lockMatchesCurrentIdentity(form)"), true);
  f.fields.email.value = "other@example.test";
  assert.equal(f.run("lockMatchesCurrentIdentity(form)"), true, "same phone retains lock");
  f.fields.email.value = "fixture@example.test";
  f.fields.phone.value = "623 456 789";
  assert.equal(f.run("lockMatchesCurrentIdentity(form)"), true, "same email retains lock");
  f.fields.email.value = "other@example.test";
  assert.equal(f.run("lockMatchesCurrentIdentity(form)"), false);
  scenarios++;
}
for (const dispose of ["form.isConnected = false; cancelDetachedSubmissions()", "destroyPublicSupport() "]) {
  const f = fixture();
  const promise = f.run("send(form)");
  f.run(dispose);
  assert.equal(f.requests[0].options.signal.aborted, true);
  // An uncooperative transport can still resolve: stale completion has no UI effect.
  f.requests[0].resolve(accepted);
  assert.equal(await promise, false);
  assert.equal(f.events.length, 0);
  assert.equal(f.fields.subject.value, "Prueba del formulario");
  assert.equal(f.fields.description.disabled, false);
  assert.equal(f.form.dataset.submitting, "false");
  scenarios++;
}
{
  const f = fixture();
  const old = f.run("send(form)");
  f.run("form.isConnected = false; cancelDetachedSubmissions(); form.isConnected = true");
  const current = f.run("send(form)");
  f.requests[0].resolve(accepted);
  assert.equal(await old, false);
  assert.equal(f.form.dataset.submitting, "true", "old completion cannot unlock a newer request");
  f.run("form.isConnected = false; cancelDetachedSubmissions()");
  assert.equal(f.requests[1].options.signal.aborted, true, "new request retains cleanup ownership");
  f.requests[1].resolve(accepted);
  assert.equal(await current, false);
  assert.equal(f.events.length, 0);
  scenarios++;
}

console.log(`Public support runtime: PASS · ${scenarios} scenarios · validation · identity preservation · idempotency · acceptance · lifecycle · no network`);
