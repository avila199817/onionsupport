import assert from "node:assert/strict";
import Http from "../src/core/http.js";
import { AppCore } from "../src/core/index.js";
import { onDomainChanged } from "../src/core/domain-events.js";
import { normalizeCuentaDetail, loadCuenta, uploadCuentaAvatar, deleteCuentaAvatar, changePassword, deactivateCuenta } from "../src/views/cuenta/cuenta.api.js";
import { updateUsuarioRequest, upsertUsuarioStore, getUsuarioByIdStore, getUsuarioByIdRequest } from "../src/views/usuarios/usuarios.api.js";
import { resolveAvatarPresentation } from "../src/features/avatar-system/identity.js";

// Exercise actual API owners against one injected HTTP boundary, no network.
const original = { get: Http.get, post: Http.post, patch: Http.patch, del: Http.del };
const account = { userId: "ON-PROFILE-A", username: "profile-a", name: "Ana Perfil",
  email: "ana@example.test", role: "admin", permissions: ["users:write"], avatarUrl: "/avatar-before.svg", hasAvatar: true };
const other = { ...account, userId: "ON-PROFILE-B", username: "profile-b", name: "Bea Cuenta", avatarUrl: "/avatar-b.svg" };
let session = 0;
function login(user = account) {
  AppCore.applySession({ user, token: `fixture-token-${++session}`, session: { sessionId: `fixture-session-${session}` } });
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function current() { return AppCore.runtimeState.read().user; }
let notifications = 0;
const unsubscribe = onDomainChanged((domain) => { if (domain === "usuarios") notifications += 1; });
const beforeFingerprint = resolveAvatarPresentation(account).fingerprint;
try {
  const deleted = normalizeCuentaDetail({ user: { userId: account.userId, hasAvatar: false } },
    { ...account, avatar: account.avatarUrl, picture: account.avatarUrl, photoUrl: account.avatarUrl });
  for (const identity of [deleted, deleted.user, deleted.account, deleted.profile]) {
    assert.equal(identity.avatarUrl, "", "an explicit deletion must govern every Cuenta projection");
  }
  assert.equal(normalizeCuentaDetail({ userId: account.userId, fullName: "Nombre completo", displayName: "Alias" }).name, "Nombre completo");
  assert.equal(normalizeCuentaDetail({ user: { userId: account.userId, avatarUrl: "" } }, account).avatarUrl, "");
  assert.equal(normalizeCuentaDetail({ user: { userId: account.userId, name: "Nombre nuevo" } }, account).avatarUrl, account.avatarUrl);

  login();
  let read = deferred();
  Http.get = () => read.promise;
  let task = loadCuenta();
  login(other);
  read.resolve({ user: account });
  assert.equal(await task, null);
  assert.equal(current().userId, other.userId, "a late /me must never replace a different session's user");
  assert.equal(current().avatarUrl, other.avatarUrl);

  login();
  read = deferred();
  task = loadCuenta();
  AppCore.clearSession();
  login({ ...account, name: "Sesión nueva" });
  read.resolve({ user: account });
  assert.equal(await task, null);
  assert.equal(current().name, "Sesión nueva", "same ID after login is still a new session");

  login();
  read = deferred();
  task = loadCuenta();
  Http.del = async () => ({ ok: true });
  const removal = await deleteCuentaAvatar();
  assert.equal(removal.avatarUrl, "");
  read.resolve({ user: account });
  assert.equal((await task).avatarUrl, "");
  assert.equal(current().avatarUrl, "", "a GET started before DELETE cannot resurrect the avatar");
  assert.equal(resolveAvatarPresentation(current()).fingerprint, beforeFingerprint);
  assert.equal(current().role, "admin");
  assert.deepEqual(current().permissions, account.permissions);

  login();
  upsertUsuarioStore(account);
  upsertUsuarioStore(other);
  const priorUserRead = deferred();
  Http.get = () => priorUserRead.promise;
  const pendingUserDetail = getUsuarioByIdRequest(account.userId);
  await deleteCuentaAvatar();
  assert.equal(getUsuarioByIdStore(account.userId).avatarUrl, "", "Cuenta updates the existing Usuarios owner without a new lookup");
  assert.equal(getUsuarioByIdStore(other.userId).avatarUrl, other.avatarUrl, "other cached IDs remain intact");
  priorUserRead.resolve({ user: account });
  assert.equal((await pendingUserDetail).avatarUrl, "", "an old Usuarios read cannot resurrect the deleted Cuenta avatar");

  login();
  read = deferred();
  task = loadCuenta();
  Http.patch = async (_path, body) => ({ ok: true, user: { userId: account.userId, ...body, role: "user" } });
  await updateUsuarioRequest(account.userId, { name: "Nombre confirmado" });
  read.resolve({ user: account });
  assert.equal((await task).name, "Nombre confirmado", "Cuenta and Usuarios share the confirmed profile revision");
  assert.equal(current().name, "Nombre confirmado");
  assert.equal(current().role, "admin", "profile acknowledgements do not redefine session ACL");

  login();
  const oldRead = deferred();
  const newRead = deferred();
  let reads = 0;
  Http.get = () => (++reads === 1 ? oldRead.promise : newRead.promise);
  const older = loadCuenta({ force: true });
  const newer = loadCuenta({ force: true });
  newRead.resolve({ user: { ...account, name: "Lectura nueva" } });
  await newer;
  oldRead.resolve({ user: account });
  await older;
  assert.equal(current().name, "Lectura nueva", "an older force-read cannot overwrite a newer read");

  // A DOM is only needed for FormData feature detection; no view is mounted.
  globalThis.window = {};
  globalThis.document = {};
  const file = new File(["fixture-image"], "fixture.png", { type: "image/png" });
  login();
  const upload = deferred();
  const deleteAfterUpload = deferred();
  const writes = [];
  Http.post = (path, body) => { writes.push(["POST", path]); assert.ok(body instanceof FormData); return upload.promise; };
  Http.del = (path) => { writes.push(["DELETE", path]); return deleteAfterUpload.promise; };
  const uploading = uploadCuentaAvatar(file);
  const deleting = deleteCuentaAvatar();
  assert.equal(writes.length, 1, "self avatar writes are serialized before reaching HTTP");
  upload.resolve({ ok: true, user: { userId: account.userId, avatarUrl: "/avatar-uploaded.svg" } });
  await uploading;
  assert.equal(writes.length, 2);
  deleteAfterUpload.resolve({ ok: true });
  await deleting;
  assert.equal(current().avatarUrl, "", "the confirmed upload cannot overtake a later explicit deletion");

  login();
  const rename = deferred();
  const uploadAfterName = deferred();
  const order = [];
  Http.patch = () => { order.push("name"); return rename.promise; };
  Http.post = () => { order.push("avatar"); return uploadAfterName.promise; };
  const naming = updateUsuarioRequest(account.userId, { name: "Nombre y foto" });
  const imaging = uploadCuentaAvatar(file);
  assert.deepEqual(order, ["name"], "the same user's Usuarios/Cuenta writes share one queue");
  rename.resolve({ ok: true, user: { userId: account.userId, name: "Nombre y foto" } });
  await naming;
  uploadAfterName.resolve({ ok: true, avatarUrl: "/avatar-after-name.svg" });
  await imaging;
  assert.equal(current().name, "Nombre y foto");
  assert.equal(current().avatarUrl, "/avatar-after-name.svg");
  assert.equal(getUsuarioByIdStore(account.userId).avatarUrl, "/avatar-after-name.svg", "an upload reaches Usuarios' existing detail projection");

  login();
  const firstName = deferred();
  const secondName = deferred();
  const thirdAvatar = deferred();
  const queued = [];
  Http.patch = (_path, body) => {
    queued.push(body.name);
    return body.name === "Primer cambio" ? firstName.promise : secondName.promise;
  };
  Http.post = () => { queued.push("Foto final"); return thirdAvatar.promise; };
  const firstWrite = updateUsuarioRequest(account.userId, { name: "Primer cambio" });
  const secondWrite = updateUsuarioRequest(account.userId, { name: "Segundo cambio" });
  const thirdWrite = uploadCuentaAvatar(file);
  assert.deepEqual(queued, ["Primer cambio"]);
  firstName.resolve({ user: { userId: account.userId, name: "Primer cambio" } });
  await firstWrite;
  assert.deepEqual(queued, ["Primer cambio", "Segundo cambio"], "self writes keep invocation order across both API owners");
  secondName.resolve({ user: { userId: account.userId, name: "Segundo cambio" } });
  await secondWrite;
  assert.deepEqual(queued, ["Primer cambio", "Segundo cambio", "Foto final"]);
  thirdAvatar.resolve({ ok: true, avatarUrl: "/avatar-final.svg" });
  await thirdWrite;
  assert.equal(current().name, "Segundo cambio");
  assert.equal(current().avatarUrl, "/avatar-final.svg");

  for (const operation of ["upload", "delete", "password", "deactivate"]) {
    login();
    const pending = deferred();
    Http.post = Http.del = () => pending.promise;
    const before = notifications;
    const result = operation === "upload" ? uploadCuentaAvatar(file)
      : operation === "delete" ? deleteCuentaAvatar()
        : operation === "password" ? changePassword({ currentPassword: "FixtureOld1!", newPassword: "FixtureNew2!" })
          : deactivateCuenta({ password: "FixtureOld1!" });
    login(other);
    pending.resolve({ ok: true, avatarUrl: "/avatar-late.svg", deactivated: true });
    assert.equal(await result, null, `${operation}: the old session's result must be discarded`);
    assert.equal(current().userId, other.userId);
    assert.equal(current().avatarUrl, other.avatarUrl);
    assert.equal(notifications, before, "a stale result cannot invalidate the new session's consumers");
  }

  login();
  let before = notifications;
  Http.del = async () => ({ ok: false, code: "REJECTED", message: "Rejected fixture" });
  await assert.rejects(deleteCuentaAvatar(), /Rejected fixture/);
  assert.equal(current().avatarUrl, account.avatarUrl);
  assert.equal(notifications, before);
  Http.del = async () => ({ ok: true, user: other });
  await assert.rejects(deleteCuentaAvatar(), (error) => error.code === "CUENTA_IDENTITY_MISMATCH");
  assert.equal(current().userId, account.userId);
  assert.equal(current().avatarUrl, account.avatarUrl);
  Http.post = async () => ({ ok: true });
  await assert.rejects(uploadCuentaAvatar(file), (error) => error.code === "CUENTA_AVATAR_INVALID_RESPONSE");
  assert.equal(current().avatarUrl, account.avatarUrl);
  Http.get = async () => ({ ok: true });
  await assert.rejects(loadCuenta(), (error) => error.code === "CUENTA_ME_INVALID_RESPONSE");
  assert.equal(notifications, before);
  console.log("Private profile: PASS · Cuenta/Usuarios shared confirmed identity · explicit deletion · ordered writes/reads · session scope · ACL preserved · no network");
} finally {
  unsubscribe();
  Object.assign(Http, original);
  delete globalThis.window;
  delete globalThis.document;
  AppCore.clearSession();
}
