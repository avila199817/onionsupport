import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { firstNonBlank } from "../src/core/objects.js";

// Execute the production submit/close/reset functions and parent callbacks.
// Rendering, form validation and transport are boundaries here; browser form
// interaction is separately covered by the modal/browser contracts.
const read = (path) => readFile(new URL(`../src/views/${path}`, import.meta.url), "utf8");
const [incidencias, clientes, clientCreate] = await Promise.all([
  read("incidencias/index.impl.js"), read("clientes/index.js"), read("clientes/clientes.create-controller.js"),
]);
const section = (source, from, to) => {
  const start = source.indexOf(from), end = source.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `Production function missing: ${from}`);
  return source.slice(start, end);
};
const listener = (source) => {
  const match = source.match(/unsubscribeDomain = onDomainChanged\(\(domain\) => \{([\s\S]*?)\n    \}\);/);
  assert.ok(match, "Production domain subscription missing");
  return `(domain) => {${match[1]}\n}`;
};
const safeObject = (value, fallback = {}) => value && typeof value === "object" ? value : fallback;
// The curated Clientes create rules come from the module itself, never a copy:
// a second list here would drift from the one users actually see. The literal is
// evaluated, not hand-parsed, because a message may contain a colon or a brace.
const clienteCreateErrorRules = (() => {
  const marker = "const CREATE_CLIENTE_ERROR_RULES = Object.freeze(";
  const start = clientCreate.indexOf(marker);
  assert.ok(start >= 0, "CREATE_CLIENTE_ERROR_RULES missing from clientes.create-controller.js");
  const open = clientCreate.indexOf("[", start);
  const close = clientCreate.indexOf("\n]);", open);
  assert.ok(close > open, "CREATE_CLIENTE_ERROR_RULES is not a closed literal");
  return vm.runInNewContext(`(${clientCreate.slice(open, close + 2)})`);
})();

const noop = () => {};
const defaults = () => ({ subject: "Fixture", targetUserId: "U1", attachments: [] });

function incidentFixture() {
  const gate = Promise.withResolvers(), reads = [];
  const context = vm.createContext({
    domainRefreshPending: false, destroyed: false, mounted: true, detailOnly: false,
    creating: false, createModal: { open: true, submitting: false, form: defaults() },
    userSearchSeq: 0, items: [], total: 0, entityOverlay: null, host: null,
    safeObject, isAdmin: () => true, getCreateDefaults: defaults, dedupeFiles: (value) => value,
    readCreateForm: noop, validateCreateForm: () => ({ valid: true, errors: {} }),
    renderModals: noop, render: noop, restoreModalReturnFocus: noop,
    clearUserSearchTimer: noop, syncInfiniteObserver: noop, queueMicrotask,
    // message extractor stubs: the local safeError until the error message authority, errorMessage + its orders after it
    safeError: (error) => error.message, errorMessage: (error, fallback) => error?.message || fallback, ERROR_MESSAGE_POLICIES: { messageFirst: "messageFirst", payloadFirst: "payloadFirst" }, upsertByTicketId: (items, item) => [...items, item],
    load: (query) => { reads.push(query); return Promise.resolve(); },
    createIncidencia: async () => { const created = await gate.promise; context.changed("incidencias"); return created; },
  });
  const source = [
    section(incidencias, "  function resetCreateModal()", "  function openCreateModal("),
    section(incidencias, "  function closeCreateModal()", "  function patchCreateFormFromField("),
    section(incidencias, "  async function submitCreate(", "  function abortDetailRequest()"),
    section(incidencias, "  function flushDomainRefresh()", "  function bindDomainRefresh()"),
    `globalThis.submit = submitCreate; globalThis.close = closeCreateModal; globalThis.changed = ${listener(incidencias)};`,
  ].join("\n");
  vm.runInContext(source, context);
  return { context, gate, reads };
}

function clientFixture() {
  const gate = Promise.withResolvers(), reads = [];
  let child;
  const parent = vm.createContext({
    detailOnly: false, destroyed: false, creating: false, domainDirty: false, createController: null, context: {},
    alive: () => !parent.destroyed, originModalIsOpen: () => false,
    getCurrentRole: () => "admin", getCurrentUser: () => ({ userId: "U1" }), isAdmin: () => true,
    showToast: noop, emitEvent: noop, scheduleRender: noop, safeError: (error) => error.message, errorMessage: (error, fallback) => error?.message || fallback, ERROR_MESSAGE_POLICIES: { messageFirst: "messageFirst", payloadFirst: "payloadFirst" },
    refresh: () => { reads.push("clientes"); return Promise.resolve(); },
    createClientesCreateController: (callbacks) => {
      child = vm.createContext({
        ...callbacks, destroyed: false, createSeq: 0, userSearchSeq: 0, userSearchTimer: 0,
        modalHost: null, returnFocus: null, firstModalPaint: false,
        createModal: { open: false, submitting: false, form: {} },
        getCreateFormDefaults: () => ({}), safeObject, cleanText: (value) => String(value ?? ""),
        firstNonBlank, isBrowser: () => false,
        readCreateForm: () => child.createModal.form,
        validateCreateForm: () => ({ valid: true, errors: {}, payload: {} }),
        scheduleRender: noop, renderNow: noop, removeModalHost: noop,
        modalLifecycle: { activate: noop, deactivate: noop },
        safeError: (error) => error.message, errorMessage: (error, fallback) => error?.message || fallback, ERROR_MESSAGE_POLICIES: { messageFirst: "messageFirst", payloadFirst: "payloadFirst" }, normalizeClienteModel: (value) => value,
        // The create path presents by canonical code now, so the sandbox carries the real
        // rule list and a presentError with the authority's semantics (ordered, first match
        // wins, any condition, fallback last) instead of a stub that would prove nothing.
        CREATE_CLIENTE_ERROR_RULES: clienteCreateErrorRules,
        presentError: (error, rules, fallback) => {
          const status = Number(error?.status ?? error?.statusCode ?? 0) || 0;
          const code = String(error?.code ?? error?.data?.code ?? "");
          for (const rule of rules) {
            if (rule.offline === true && status === 0) return rule.message;
            if (rule.codes?.includes(code)) return rule.message;
          }
          return fallback;
        },
        createClienteRequest: async () => { const created = await gate.promise; parent.changed("clientes"); return created; },
        loadClienteDetailRequest: async () => ({ clienteId: "C1" }),
      });
      vm.runInContext([
        section(clientCreate, "  function reset()", "  const modalHostHandle"),
        section(clientCreate, "  async function submit(", "  function handleModalClick("),
        section(clientCreate, "  function open(", "  function destroy()"),
        "globalThis.submit = submit; globalThis.open = open; globalThis.close = close;",
      ].join("\n"), child);
      return { open: child.open, close: child.close, getSnapshot: () => child.createModal };
    },
  });
  vm.runInContext([
    section(clientes, "  function refreshChangedDomain()", "  function payload("),
    section(clientes, "function ensureCreateController()", "  function actionInfo("),
    `globalThis.open = openCreate; globalThis.changed = ${listener(clientes)};`,
  ].join("\n"), parent);
  return { parent, gate, reads, child: () => child };
}

let scenarios = 0;
for (const name of ["incidencias", "clientes"]) {
  for (const outcome of ["clean-cancel", "cancel", "success", "failure"]) {
    const fixture = name === "incidencias" ? incidentFixture() : clientFixture();
    if (fixture.parent) await fixture.parent.open();
    const parent = fixture.parent || fixture.context;
    const child = fixture.child?.() || fixture.context;
    if (outcome === "clean-cancel") {
      child.close();
      assert.equal(fixture.reads.length, 0, `${name}: clean cancel adds no read`);
      scenarios++; continue;
    }
    const pending = outcome === "cancel" ? null : child.submit();
    parent.changed("usuarios"); parent.changed("usuarios");
    await Promise.resolve();
    assert.equal(fixture.reads.length, 0, `${name}: open/pending modal defers repeated changes`);
    assert.equal(parent[name === "incidencias" ? "domainRefreshPending" : "domainDirty"], true);
    if (outcome === "success") {
      fixture.gate.resolve({ clienteId: "C1", ticketId: "I1" });
      assert.equal(await pending, true);
      assert.equal(child.createModal.open, false);
    } else {
      if (outcome === "failure") {
        fixture.gate.reject(new Error("Fixture write failed"));
        assert.equal(await pending, false);
        assert.equal(child.createModal.open, true);
        // What a person reads on a failed create is domain policy, not the raw throw.
        // Incidencias still shows the backend/exception message; Clientes presents by
        // canonical code (U10e) and a statusless failure lands on its safe fallback, so
        // the technical text must not surface at all.
        if (name === "clientes") {
          assert.equal(child.createModal.serverError, "No se pudo crear el cliente.");
          assert.ok(
            !String(child.createModal.serverError).includes("Fixture write failed"),
            "clientes: the raw failure text must never reach the create modal",
          );
        } else {
          assert.equal(child.createModal.serverError, "Fixture write failed");
        }
        assert.equal(fixture.reads.length, 0, `${name}: rejected submit retains pending refresh and draft`);
      }
      child.close();
    }
    await Promise.resolve();
    assert.equal(fixture.reads.length, 1, `${name}: real ${outcome} consumes all changes once`);
    assert.equal(parent[name === "incidencias" ? "domainRefreshPending" : "domainDirty"], false);
    if (name === "incidencias") assert.equal(fixture.reads[0].refreshFacets, true);
    child.close();
    assert.equal(fixture.reads.length, 1, `${name}: repeated close cannot reload again`);
    scenarios++;
  }
}
console.log(`Private create refresh: PASS · ${scenarios} production submit/cancel paths · pending user changes · one refresh after close · incident facets included`);
