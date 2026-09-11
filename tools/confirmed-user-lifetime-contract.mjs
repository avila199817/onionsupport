import assert from "node:assert/strict";
import Http from "../src/core/http.js";
import { AppCore } from "../src/core/index.js";
import { onDomainChanged } from "../src/core/domain-events.js";
import { clearUsuariosCache, getUsuarioByIdStore, getUsuarios, getUsuariosStateSnapshot,
  getUsuarioByIdRequest, loadUsuarioDetail, loadUsuarios, normalizeUsuarioModel,
  replaceUsuariosStore, updateUsuarioRequest } from "../src/views/usuarios/usuarios.api.js";

// Only HTTP is replaced. Deferred responses exercise the real mutation queue,
// Core session lifetime, existing store/cache owner and domain notification.
const original = { get: Http.get, patch: Http.patch };
const person = { id: "usr-fixture-17", userId: "usr-fixture-17", username: "fixture-17",
  name: "Ana Ruiz", email: "ana@example.invalid", role: "user", active: true,
  avatar: "https://onionsupport.com/synthetic-old.webp", hasAvatar: true };
const admin = { id: "admin-fixture-A", userId: "admin-fixture-A", name: "Admin A", role: "admin", active: true, permissions: ["users:write"] };
let session = 0;
let events = 0;
const stop = onDomainChanged(domain => { if (domain === "usuarios") events += 1; });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function reset(items = [person]) {
  AppCore.clearSession();
  AppCore.applySession({ user: admin, token: `fixture-token-${++session}`, session: { sessionId: `fixture-session-${session}` } });
  clearUsuariosCache(); replaceUsuariosStore(items); events = 0;
  Http.patch = async (_path, body) => ({ ok: true, user: { id: person.id, ...body } });
  Http.get = async () => { throw new Error("Unexpected synthetic GET"); };
}
function response(name = "Beatriz Mora", extra = {}) { return { ok: true, user: { id: person.id, name, ...extra } }; }
const passed = [];
async function check(name, run) { reset(); await run(); passed.push(name); console.log(`PASS ${name}`); }
try {
  await check("partial rename retains real photo; explicit false/null/empty removes every alias", async () => {
    await updateUsuarioRequest(person.id, { name: "Beatriz Mora" });
    let current = getUsuarioByIdStore(person.id);
    assert.equal(current.avatarUrl, person.avatar); assert.equal(current.hasAvatar, true);
    assert.equal(current.email, person.email);
    for (const photo of [{ hasAvatar: false }, { avatarUrl: null }, { avatarUrl: "" }]) {
      replaceUsuariosStore([person]);
      Http.patch = async () => response("Beatriz Mora", photo);
      await updateUsuarioRequest(person.id, { name: "Beatriz Mora" });
      current = getUsuarioByIdStore(person.id);
      assert.equal(current.avatarUrl, ""); assert.equal(current.avatar, ""); assert.equal(current.hasAvatar, false);
    }
    replaceUsuariosStore([person]);
    Http.patch = async () => response("Beatriz Mora", { avatarUrl: undefined });
    await updateUsuarioRequest(person.id, { name: "Beatriz Mora" });
    assert.equal(getUsuarioByIdStore(person.id).avatarUrl, person.avatar);
    Http.patch = async () => response("Beatriz Mora", { avatarUrl: "https://onionsupport.com/synthetic-new.webp", hasAvatar: true });
    await updateUsuarioRequest(person.id, { name: "Beatriz Mora" });
    assert.equal(getUsuarioByIdStore(person.id).avatarUrl, "https://onionsupport.com/synthetic-new.webp");
    assert.equal(normalizeUsuarioModel({ ...person, hasAvatar: false }).avatarUrl, "");
  });
  await check("GET begun before a confirmed PATCH cannot restore the old name/photo", async () => {
    const read = deferred(); Http.get = () => read.promise;
    const loading = loadUsuarioDetail(person.id, { force: true });
    Http.patch = async () => response("Beatriz Mora", { hasAvatar: false });
    await updateUsuarioRequest(person.id, { name: "Beatriz Mora" });
    read.resolve({ ok: true, user: person });
    assert.equal((await loading).name, "Beatriz Mora");
    assert.equal(getUsuarioByIdStore(person.id).avatarUrl, "");
  });
  await check("a failed earlier GET falls back to the latest committed value, not its captured snapshot", async () => {
    const read = deferred(); Http.get = () => read.promise;
    const loading = loadUsuarioDetail(person.id, { force: true });
    await updateUsuarioRequest(person.id, { name: "Beatriz Mora" });
    read.reject(new Error("Synthetic disconnected read"));
    assert.equal((await loading).name, "Beatriz Mora");
  });
  await check("permission failure is not hidden by a committed value or cache", async () => {
    const read = deferred(); Http.get = () => read.promise;
    const loading = loadUsuarioDetail(person.id, { force: true });
    const result = assert.rejects(loading, error => error.status === 403);
    await updateUsuarioRequest(person.id, { name: "Beatriz Mora" });
    read.resolve({ ok: false, status: 403, code: "SYNTHETIC_FORBIDDEN" });
    await result;
    Http.get = async () => { throw Object.assign(new Error("Synthetic unauthenticated"), { status: 401 }); };
    await assert.rejects(loadUsuarioDetail(person.id, { force: true }), error => error.status === 401);
  });
  await check("foreign identity and malformed canonical name are never published", async () => {
    for (const source of [{ id: "another-person", name: "Beatriz Mora" }, { id: person.id, name: null }, { id: person.id, name: "" }]) {
      Http.patch = async () => ({ ok: true, user: source });
      await assert.rejects(updateUsuarioRequest(person.id, { name: "Beatriz Mora" }), error => error.code === "USUARIO_UPDATE_INVALID_RESPONSE");
      assert.equal(getUsuarioByIdStore(person.id).name, "Ana Ruiz"); assert.equal(events, 0);
    }
    Http.get = async () => ({ ok: true, user: { id: "another-person", name: "Persona ajena" } });
    await assert.rejects(getUsuarioByIdRequest(person.id), error => error.code === "USUARIO_DETAIL_INVALID_RESPONSE");
  });
  await check("same-person writes serialize; different people do not block each other", async () => {
    const first = deferred(), second = deferred(); const bodies = [];
    Http.patch = (_path, body) => { bodies.push(body.name); return bodies.length === 1 ? first.promise : second.promise; };
    const one = updateUsuarioRequest(person.id, { name: "Beatriz Mora" });
    const two = updateUsuarioRequest(person.id, { name: "Carla Sol" });
    assert.deepEqual(bodies, ["Beatriz Mora"]);
    second.resolve(response("Carla Sol"));
    first.resolve(response("Beatriz Mora"));
    await Promise.all([one, two]);
    assert.deepEqual(bodies, ["Beatriz Mora", "Carla Sol"]);
    assert.equal(getUsuarioByIdStore(person.id).name, "Carla Sol"); assert.equal(events, 2);
    const waiting = deferred();
    Http.patch = (path, body) => path.endsWith(person.id) ? waiting.promise : Promise.resolve({ ok: true, user: { id: "usr-fixture-18", ...body } });
    const slow = updateUsuarioRequest(person.id, { name: "Daniela Sur" });
    await updateUsuarioRequest("usr-fixture-18", { name: "Otra Persona" });
    assert.equal(getUsuarioByIdStore("usr-fixture-18").name, "Otra Persona");
    waiting.resolve(response("Daniela Sur")); await slow;
  });
  await check("uncertain preceding write stops its unsent successor, without automatic retry", async () => {
    const first = deferred(); let calls = 0;
    Http.patch = () => { calls += 1; return first.promise; };
    const one = updateUsuarioRequest(person.id, { name: "Beatriz Mora" });
    const two = updateUsuarioRequest(person.id, { name: "Carla Sol" });
    const oneRejected = assert.rejects(one, /Synthetic timeout/);
    const twoRejected = assert.rejects(two, error => error.code === "USUARIO_UPDATE_QUEUE_STOPPED");
    first.reject(new Error("Synthetic timeout; server outcome unknown"));
    await Promise.all([oneRejected, twoRejected]);
    assert.equal(calls, 1); assert.equal(events, 0); assert.equal(getUsuarioByIdStore(person.id).name, "Ana Ruiz");
  });
  await check("logout immediately clears the owner; late GET/PATCH and queued writes do not cross accounts", async () => {
    const read = deferred(), write = deferred(); let writes = 0;
    Http.get = () => read.promise; Http.patch = () => { writes += 1; return write.promise; };
    const loading = loadUsuarioDetail(person.id, { force: true });
    const ignoredRead = assert.rejects(loading, error => error.name === "AbortError");
    const one = updateUsuarioRequest(person.id, { name: "Beatriz Mora" });
    const two = updateUsuarioRequest(person.id, { name: "Carla Sol" });
    AppCore.clearSession();
    assert.deepEqual(getUsuarios(), []);
    AppCore.applySession({ user: { ...admin, id: "admin-B", userId: "admin-B" }, token: "token-B", session: { sessionId: "session-B" } });
    const inB = { ...person, name: "Lectura propia de B" }; replaceUsuariosStore([inB]);
    read.resolve({ ok: true, user: person }); write.resolve(response());
    assert.equal(await one, null); assert.equal(await two, null); await ignoredRead;
    assert.equal(writes, 1); assert.equal(events, 0);
    assert.equal(getUsuarioByIdStore(person.id).name, "Lectura propia de B");
  });
  await check("same-account re-login and permission change invalidate pending work", async () => {
    for (const change of [() => { AppCore.clearSession(); AppCore.applySession({ user: admin, token: "token-new", session: { sessionId: "session-new" } }); },
      () => AppCore.setUser({ ...AppCore.runtimeState.read().user, permissions: [] })]) {
      reset(); const read = deferred(); Http.get = () => read.promise;
      const loading = loadUsuarioDetail(person.id, { force: true });
      const rejected = assert.rejects(loading, error => error.name === "AbortError");
      change(); read.resolve({ ok: true, user: person }); await rejected;
      assert.deepEqual(getUsuarios(), []);
    }
  });
  await check("token rotation with stable session ID preserves current identity and pending work", async () => {
    const before = AppCore.getSessionEpoch(), write = deferred(); Http.patch = () => write.promise;
    const pending = updateUsuarioRequest(person.id, { name: "Beatriz Mora" });
    AppCore.setToken("synthetic-rotated-token");
    assert.equal(AppCore.getSessionEpoch(), before);
    write.resolve(response()); assert.equal((await pending).name, "Beatriz Mora");
    assert.equal(events, 1);
  });
  await check("list started before rename or invalidation cannot refill stale data", async () => {
    const read = deferred(); Http.get = () => read.promise;
    const loading = loadUsuarios({ force: true, all: false });
    await updateUsuarioRequest(person.id, { name: "Beatriz Mora" });
    read.resolve({ ok: true, items: [person], count: 1 }); await loading;
    assert.equal(getUsuarioByIdStore(person.id).name, "Beatriz Mora");
    assert.equal(getUsuariosStateSnapshot().loading, false);
    const stale = deferred(); Http.get = () => stale.promise;
    const afterClear = loadUsuarioDetail(person.id, { force: true });
    const rejected = assert.rejects(afterClear, error => error.name === "AbortError");
    clearUsuariosCache(); stale.resolve({ ok: true, user: person }); await rejected;
    assert.deepEqual(getUsuarios(), []);
  });
  console.log(JSON.stringify({ suite: "confirmed-user-lifetime", cases: passed.length, passed, boundary: "synthetic HTTP only; not browser/DOM acceptance" }));
} finally { stop(); Http.get = original.get; Http.patch = original.patch; clearUsuariosCache(); AppCore.clearSession(); }
