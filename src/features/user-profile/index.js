/* Private profile reconciliation. Core owns the user/session; this module
 * retains only a session revision and pending write, never a profile cache. */
import { AppCore } from "../../core/index.js";
import { userNameFromIdentity } from "../../core/user-identity.js";
import { notifyDomainChanged } from "../../core/domain-events.js";

const photoFields = ["avatarUrl", "avatar", "photoUrl", "picture"];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key) && value[key] !== undefined;
const userKey = (value) => String(value?.userId || value?.id || "").trim().toLowerCase();
let epoch = -1;
let revision = 0;
let pending = null;

export function captureUserProfileScope() {
  const nextEpoch = AppCore.getSessionEpoch();
  if (nextEpoch !== epoch) { epoch = nextEpoch; revision = 0; pending = null; }
  const state = AppCore.runtimeState.read();
  return { epoch, revision, userId: state.authenticated ? userKey(state.user) : "" };
}

export function isUserProfileScopeCurrent(scope, { unchanged = false } = {}) {
  const current = captureUserProfileScope();
  return Boolean(scope?.userId && current.userId === scope.userId && current.epoch === scope.epoch &&
    (!unchanged || current.revision === scope.revision));
}

export function mergeConfirmedUserProfile(previous = {}, source = {}) {
  const merged = { ...previous };
  for (const [key, value] of Object.entries(source || {})) if (value !== undefined) merged[key] = value;
  // Empty/null photos are a deletion; missing photos are a partial response.
  const photoKey = photoFields.find((key) => own(source, key));
  if (source.hasAvatar === false || photoKey) {
    // URL validation belongs to the existing model/Core boundary. A pure merge
    // must not turn a URL into a tombstone because its browser origin is absent.
    const photo = source.hasAvatar === false ? "" : (source[photoKey] ?? "");
    for (const key of photoFields) merged[key] = photo;
    merged.hasAvatar = Boolean(photo);
  }
  return merged;
}

export function applyConfirmedUserProfile(source, scope, { read = false, owner = "" } = {}) {
  if (!isUserProfileScopeCurrent(scope, { unchanged: read })) return null;
  const returnedId = userKey(source);
  if (returnedId && returnedId !== scope.userId) return null;
  const current = AppCore.runtimeState.read().user;
  const patch = {};
  const name = userNameFromIdentity(source);
  if (name) Object.assign(patch, { name, displayName: name, fullName: name });
  for (const key of ["email", "emailLower", "phone", "telefono", "avatarUpdatedAt", "hasAvatar", ...photoFields]) {
    if (own(source, key)) patch[key] = source[key];
  }
  // Profile endpoints cannot redefine IDs, ACL, tokens or routing identity.
  const user = mergeConfirmedUserProfile(current, patch);
  try { AppCore.setUser(user); }
  catch { return null; } // A UI failure never retries a committed mutation.
  if (!read) revision += 1;
  if (owner !== "usuarios") {
    try { AppCore.getModule("usuarios.session")?.onProfileConfirmed?.({ ...patch, userId: current.userId || current.id }); }
    catch { /* A cache owner cannot undo the confirmed profile. */ }
  }
  try { AppCore.getModule("sidebar")?.sync?.(); } catch { /* Existing chrome owns its DOM. */ }
  const confirmed = AppCore.runtimeState.read().user;
  if (read && ["name", "email", "avatarUrl"].some((key) => current[key] !== confirmed[key])) {
    notifyDomainChanged("usuarios");
  }
  return confirmed;
}

export async function runUserProfileMutation(scope, operation) {
  const execute = () => isUserProfileScopeCurrent(scope) ? operation() : null;
  const predecessor = pending;
  const task = predecessor ? predecessor.then(execute, () => {
    if (!isUserProfileScopeCurrent(scope)) return null;
    throw Object.assign(new Error("Revisa el resultado del cambio anterior antes de continuar."), {
      code: "PROFILE_WRITE_QUEUE_STOPPED", status: 409,
    });
  }) : Promise.resolve(execute());
  pending = task;
  try { return await task; }
  finally { if (pending === task) pending = null; }
}
