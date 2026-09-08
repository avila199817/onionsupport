import assert from "node:assert/strict";
import Http from "../src/core/http.js";
import { AppCore } from "../src/core/index.js";
import { notifyDomainChanged, onDomainChanged } from "../src/core/domain-events.js";
import { updateUsuarioRequest } from "../src/views/usuarios/usuarios.api.js";
import { updateIncidenciaRequest, getIncidenciaByIdRequest as readTicket } from "../src/views/incidencias/incidencias.api.impl.js";
import { clearIncidenciasCache } from "../src/views/incidencias/incidencias.api.js";
import { markFacturaPaidRequest } from "../src/views/facturas/facturas.api.js";
import { loadHomeDashboard, getHomeCacheState, clearHomeDashboardCache } from "../src/views/home/home.api.js";
import { HomeView } from "../src/views/home/index.js";

const person = { userId: "ON-EVENT-FIXTURE", name: "Nombre Actual", role: "user", email: "fixture@example.test" };
const ticket = { ticketId: "INC-EVENT-FIXTURE", userId: person.userId, name: person.name, subject: "Equipo", status: "open" };
const invoice = { facturaId: "202600001", total: 12, paymentStatus: "paid" };
const saved = { get: Http.get, patch: Http.patch, post: Http.post, Node: globalThis.Node };
let controller;
const observed = [];
const unsubscribe = onDomainChanged((domain) => observed.push(domain));
let ticketListReads = 0;
let ticketDetailReads = 0;
let holdList = null;
let holdDetail = null;
let rejectWrite = false;

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
async function until(predicate, message) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise((done) => setTimeout(done, 5));
  }
  assert.fail(message);
}

// This is a lifecycle test double, not a browser/layout test. The production
// controller, APIs, cache epochs, domain signal and templates run unchanged.
class Host {
  dataset = {};
  innerHTML = "";
  events = new Map();
  setAttribute() {}
  addEventListener(name, callback) { this.events.set(name, callback); }
  removeEventListener(name, callback) { if (this.events.get(name) === callback) this.events.delete(name); }
}

try {
  globalThis.Node = Host;
  AppCore.applySession({ user: person, token: "fixture-events-token", session: { sessionId: "fixture-events-session" } });
  Http.get = async (path) => {
    if (path === "/api/tickets") {
      ticketListReads += 1;
      const gate = holdList;
      holdList = null;
      if (gate) await gate.promise;
      return { ok: true, items: [ticket], total: 1, totalKnown: true, hasMore: false };
    }
    if (path === `/api/tickets/${ticket.ticketId}`) {
      ticketDetailReads += 1;
      const gate = holdDetail;
      holdDetail = null;
      if (gate) return gate.promise;
      return { ok: true, ticket };
    }
    if (path === "/api/facturas") return { ok: true, items: [invoice], total: 1 };
    if (path === "/api/facturas/stats") return { ok: true, stats: { invoiceCount: 1, totalAmount: 12, paidAmount: 12, pendingAmount: 0 } };
    if (path === "/api/users/me/onboarding") return { ok: true, onboarding: { assignedVersion: 0 } };
    throw new Error(`Unexpected fixture read: ${path}`);
  };
  Http.patch = async (path, body) => {
    if (rejectWrite) throw new Error("HTTP fixture rejected write");
    if (path.startsWith("/api/users/")) return { ok: true, user: { ...person, ...body } };
    if (path.startsWith("/api/tickets/")) return { ok: true, ticket };
    throw new Error(`Unexpected fixture write: ${path}`);
  };
  Http.post = async () => rejectWrite ? { ok: false, message: "Rejected" } : { ok: true, item: invoice };

  await loadHomeDashboard({ force: true });
  assert.equal(getHomeCacheState().fresh, true);
  assert.equal(notifyDomainChanged("untrusted-domain"), false);
  assert.equal(getHomeCacheState().fresh, true, "unknown signals have no effect");
  rejectWrite = true;
  await assert.rejects(updateUsuarioRequest(person.userId, { name: person.name }));
  await assert.rejects(updateIncidenciaRequest(ticket.ticketId, { status: "closed" }));
  await assert.rejects(markFacturaPaidRequest(invoice.facturaId));
  assert.deepEqual(observed, [], "failed writes cannot invalidate readers as confirmed changes");
  assert.equal(getHomeCacheState().fresh, true);

  rejectWrite = false;
  await updateUsuarioRequest(person.userId, { name: person.name });
  assert.deepEqual(observed, ["usuarios"]);
  assert.equal(getHomeCacheState().fresh, false, "confirmed writes invalidate an unmounted Home");
  await updateIncidenciaRequest(ticket.ticketId, { status: "closed" });
  await markFacturaPaidRequest(invoice.facturaId);
  assert.deepEqual(observed, ["usuarios", "incidencias", "facturas"], "public and inner API wrappers emit once per write");

  let survivingListenerCalls = 0;
  const stopThrowing = onDomainChanged(() => { throw new Error("Presentation failure"); });
  const stopSurvivor = onDomainChanged(() => { survivingListenerCalls += 1; });
  await updateUsuarioRequest(person.userId, { name: person.name });
  assert.equal(survivingListenerCalls, 1, "listener failure neither rejects a committed write nor blocks other invalidations");
  stopThrowing(); stopSurvivor();

  // Clearing a user identity must invalidate old in-flight ticket reads too.
  clearIncidenciasCache();
  const detailGate = deferred();
  holdDetail = detailGate;
  const oldRead = readTicket(ticket.ticketId);
  await until(() => ticketDetailReads === 1, "the old ticket read did not start");
  await updateUsuarioRequest(person.userId, { name: person.name });
  detailGate.resolve({ ok: true, ticket: { ...ticket, name: "Nombre anterior" } });
  await oldRead;
  assert.equal((await readTicket(ticket.ticketId)).name, person.name);
  assert.equal(ticketDetailReads, 2, "an invalidated read must not repopulate the ticket identity cache");

  await loadHomeDashboard({ force: true });
  const host = new Host();
  controller = HomeView(host, { user: { ...person, name: "Contexto antiguo" }, role: "admin" });
  assert.equal(controller.getSnapshot().role, "user", "retained route context cannot override the Core role");
  assert.ok(!host.innerHTML.includes("Contexto antiguo"), "Core identity wins over route seeds");
  await until(() => controller.getSnapshot().onboarding.loaded, "Home lifecycle did not settle");
  const initialReads = ticketListReads;
  await Promise.all([
    updateUsuarioRequest(person.userId, { name: person.name }),
    updateIncidenciaRequest(ticket.ticketId, { status: "open" }),
  ]);
  await until(() => getHomeCacheState().fresh && ticketListReads > initialReads, "Home did not refresh after writes");
  assert.equal(ticketListReads, initialReads + 1, "a burst of confirmed writes shares one Home reload");
  assert.equal(controller.getDashboard().incidencias[0].name, person.name);
  assert.equal(host.events.size, 1, "Home retains its single delegated DOM listener");

  const listGate = deferred();
  holdList = listGate;
  const beforeConcurrent = ticketListReads;
  notifyDomainChanged("incidencias");
  await until(() => ticketListReads === beforeConcurrent + 1, "first invalidation reload did not start");
  notifyDomainChanged("facturas");
  listGate.resolve();
  await until(() => getHomeCacheState().fresh && ticketListReads === beforeConcurrent + 2, "a write during reload was lost");
  assert.equal(controller.getSnapshot().error, "", "discarding a stale epoch is not a user-facing load failure");

  await updateUsuarioRequest(person.userId, { name: "Nombre propio después de editar" });
  await until(() => getHomeCacheState().fresh && host.innerHTML.includes("Nombre propio después de editar"),
    "Home greeting retained an old context user after self edit");
  assert.ok(!host.innerHTML.includes("Contexto antiguo"));

  // Destruction cancels queued work and unsubscribes; no background Home view.
  const beforeDestroy = ticketListReads;
  notifyDomainChanged("usuarios");
  controller.destroy();
  notifyDomainChanged("incidencias");
  await new Promise((done) => setTimeout(done, 15));
  assert.equal(ticketListReads, beforeDestroy);
  assert.equal(host.events.size, 0);
} finally {
  controller?.destroy();
  unsubscribe();
  Http.get = saved.get; Http.patch = saved.patch; Http.post = saved.post;
  if (saved.Node === undefined) delete globalThis.Node; else globalThis.Node = saved.Node;
  AppCore.clearSession();
  clearHomeDashboardCache();
  clearIncidenciasCache();
}

console.log("Private domain events: PASS · confirmed writes only · one signal/write · cache invalidation · no stale resurrection · coalesced active Home · clean teardown · no network");
