import assert from "node:assert/strict";
import Http from "../src/core/http.js";
import { AppCore } from "../src/core/index.js";
import { onDomainChanged } from "../src/core/domain-events.js";
import {
  clearUsuariosCache, getUsuarioByIdStore, getUsuariosStoreSnapshot,
  loadUsuarioDetail, replaceUsuariosStore, updateUsuario, updateUsuarioRequest,
} from "../src/views/usuarios/usuarios.api.js";
import { resolveAvatarPresentation } from "../src/features/avatar-system/identity.js";
import { renderUsuariosTemplate } from "../src/views/usuarios/usuarios.template.js";
import { renderUsuariosDetailModal } from "../src/views/usuarios/usuarios.template.modal.js";

// Real mutation, model, store and templates. Only the HTTP boundary is replaced.
// This is not the required browser/form matrix; it characterizes the missing
// commit-before-publish guarantee beneath any consumer of the public API.
const initial = {
  id: "usr-fixture-17", userId: "usr-fixture-17", username: "fixture-17",
  name: "Ana Ruiz", email: "fixture17@example.invalid", role: "user", active: true,
  avatar: "", avatarUrl: "", hasAvatar: false, updatedAt: "2026-09-11T10:00:00.000Z",
};
const other = { ...initial, id: "usr-fixture-18", userId: "usr-fixture-18", name: "Ana Ruiz" };
const admin = { id: "synthetic-admin", userId: "synthetic-admin", username: "synthetic-admin", name: "Administración", role: "admin", active: true };
const originalPatch = Http.patch;
const originalGet = Http.get;
const writes = [];
const events = [];
let reads = 0;
let nextResponse;
let unsubscribe = () => {};
try {
  AppCore.applySession({ user: admin, token: "synthetic-token", session: { sessionId: "synthetic-session" } });
  clearUsuariosCache();
  replaceUsuariosStore([initial, other]);
  const previous = structuredClone(initial);
  Http.get = async () => { reads += 1; throw new Error("No extra profile request is allowed"); };
  Http.patch = async (path, body) => {
    writes.push({ path, body });
    return nextResponse ?? { ok: true, user: { ...initial, ...body, updatedAt: "2026-09-11T10:01:00.000Z" } };
  };
  unsubscribe = onDomainChanged((domain) => {
    if (domain !== "usuarios") return;
    const user = getUsuarioByIdStore(initial.userId);
    events.push({ name: user?.name, initials: resolveAvatarPresentation(user).initials });
  });
  const saved = await updateUsuarioRequest(initial.userId, { name: "Beatriz Mora" });
  assert.deepEqual(writes, [{ path: "/api/users/usr-fixture-17", body: { name: "Beatriz Mora" } }]);
  assert.equal(saved.name, "Beatriz Mora");
  assert.deepEqual(events, [{ name: "Beatriz Mora", initials: "BM" }], "Every subscriber must see the confirmed user, not the previous store value");
  assert.equal(getUsuarioByIdStore(initial.userId).name, "Beatriz Mora");
  assert.equal((await loadUsuarioDetail(initial.userId)).name, "Beatriz Mora", "Reopening a cached detail must not restore the previous name");
  assert.equal(getUsuarioByIdStore(other.userId).name, "Ana Ruiz", "Homonyms with different IDs do not share identity");
  assert.equal(AppCore.runtimeState.read().user.name, admin.name, "Editing someone else never replaces the administrator");
  const beforeAvatar = resolveAvatarPresentation(initial);
  const afterAvatar = resolveAvatarPresentation(getUsuarioByIdStore(initial.userId));
  assert.equal(afterAvatar.initials, "BM");
  assert.equal(afterAvatar.fingerprint, beforeAvatar.fingerprint);
  assert.equal(afterAvatar.tone, beforeAvatar.tone);
  for (const html of [
    renderUsuariosTemplate({ items: [getUsuarioByIdStore(initial.userId)] }),
    renderUsuariosDetailModal({ detail: await loadUsuarioDetail(initial.userId) }),
  ]) {
    assert.ok(html.includes("Beatriz Mora"));
    assert.ok(!html.includes("Ana Ruiz"), "Actual user templates must not recover an older alias/raw name");
  }
  assert.deepEqual(initial, previous, "Caller snapshots are not mutated as a synchronization shortcut");
  assert.equal(reads, 0);
  const count = getUsuariosStoreSnapshot().remoteCount;
  await updateUsuario(initial.userId, { name: "Carla Sol" });
  assert.equal(getUsuarioByIdStore(initial.userId).name, "Carla Sol");
  assert.equal(events.length, 2, "The convenience entry publishes exactly once");
  assert.equal(getUsuariosStoreSnapshot().remoteCount, count, "An update does not invent an extra user");
  const committed = getUsuarioByIdStore(initial.userId);
  nextResponse = { ok: false, message: "Synthetic rejected update" };
  await assert.rejects(updateUsuarioRequest(initial.userId, { name: "Cambio rechazado" }));
  assert.deepEqual(getUsuarioByIdStore(initial.userId), committed);
  assert.equal(events.length, 2, "Failed HTTP writes are not confirmations");
  console.log("Confirmed user write: PASS · actual PATCH owner → canonical store before publish → real user templates/cached reopen · stable ID/tone · other user/admin isolated · failed update unchanged · zero extra reads");
} finally {
  unsubscribe();
  Http.patch = originalPatch;
  Http.get = originalGet;
  clearUsuariosCache();
  AppCore.clearSession();
}
