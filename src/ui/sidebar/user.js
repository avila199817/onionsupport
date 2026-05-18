/* =========================================================
   Onion Support - Sidebar User
   Archivo: /src/ui/sidebar/user.js

   Responsabilidad:
   - Normalizar usuario para el sidebar.
   - Resolver rol admin/user.
   - Crear view-model mínimo para template.js.
   - No pintar DOM.
   - No hacer eventos.
   - No leer storage.
   - No hacer HTTP.
   - No tocar dropdown.
   - No gestionar avatar avanzado.
   - No inventar permisos.
========================================================= */

import {
  SIDEBAR_ROLE_ADMIN,
  SIDEBAR_ROLE_USER,
  normalizeSidebarRole,
} from "./constants.js";

export const SIDEBAR_USER_VERSION = "sidebar.user.v1";

const DEFAULT_NAME = "Usuario";
const DEFAULT_INITIALS = "U";

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

/* =========================================================
   USER VALIDATION
========================================================= */

export function isSidebarUserDisabled(user = null) {
  if (!isObject(user)) return true;

  const status = String(user.status || user.estado || "").toLowerCase();

  return (
    user.disabled === true ||
    user.deleted === true ||
    status === "disabled" ||
    status === "deleted"
  );
}

export function hasSidebarUserIdentity(user = null) {
  if (!isObject(user)) return false;

  return Boolean(
    user.id ||
      user.userId ||
      user.username ||
      user.slug ||
      user.email
  );
}

export function isUsableSidebarUser(user = null) {
  return Boolean(
    isObject(user) &&
      !isSidebarUserDisabled(user) &&
      hasSidebarUserIdentity(user)
  );
}

/* =========================================================
   UNWRAP
========================================================= */

export function unwrapSidebarUser(payload = null) {
  if (!isObject(payload)) return null;

  const direct = first(
    payload.user,
    payload.usuario,
    payload.currentUser,
    payload.authUser,
    payload.sessionUser,
    payload.me,
    payload.account,
    payload.profile,
    payload.session?.user,
    payload.data?.user,
    payload.payload?.user
  );

  if (isUsableSidebarUser(direct)) return direct;
  if (isUsableSidebarUser(payload)) return payload;

  return null;
}

/* =========================================================
   SOURCES
========================================================= */

function getUserFromAuth(Auth = null) {
  if (!Auth) return null;

  const candidates = [];

  try {
    if (isFunction(Auth.getUser)) candidates.push(Auth.getUser());
    if (isFunction(Auth.getCurrentUser)) candidates.push(Auth.getCurrentUser());

    candidates.push(Auth.user);
    candidates.push(Auth.currentUser);
  } catch {
    // noop
  }

  return candidates.map(unwrapSidebarUser).find(isUsableSidebarUser) || null;
}

function getUserFromCore(AppCore = null) {
  const state = isObject(AppCore?.state) ? AppCore.state : {};

  return (
    unwrapSidebarUser(state.user) ||
    unwrapSidebarUser(state.currentUser) ||
    unwrapSidebarUser(state.authUser) ||
    unwrapSidebarUser(state.sessionUser) ||
    unwrapSidebarUser(state.session) ||
    unwrapSidebarUser(state)
  );
}

export function getSidebarUserSource(context = {}) {
  const explicit = unwrapSidebarUser(context.user);

  if (isUsableSidebarUser(explicit)) return explicit;

  const authUser = getUserFromAuth(context.Auth);

  if (isUsableSidebarUser(authUser)) return authUser;

  const coreUser = getUserFromCore(context.AppCore);

  if (isUsableSidebarUser(coreUser)) return coreUser;

  return null;
}

/* =========================================================
   ROLE
========================================================= */

export function getSidebarUserRole(context = {}) {
  const user = context.user || getSidebarUserSource(context);
  const AppCore = context.AppCore;
  const Auth = context.Auth;

  try {
    const authRole =
      (isFunction(Auth?.getRole) && Auth.getRole()) ||
      (isFunction(Auth?.getCurrentRole) && Auth.getCurrentRole());

    if (authRole) return normalizeSidebarRole(authRole);
  } catch {
    // noop
  }

  const role = first(
    context.role,
    AppCore?.state?.role,
    user?.role,
    user?.rol,
    user?.roles,
    SIDEBAR_ROLE_USER
  );

  return normalizeSidebarRole(role);
}

export function isSidebarAdmin(context = {}) {
  return getSidebarUserRole(context) === SIDEBAR_ROLE_ADMIN;
}

/* =========================================================
   DISPLAY
========================================================= */

export function getSidebarDisplayName(user = null) {
  if (!isUsableSidebarUser(user)) return DEFAULT_NAME;

  return text(
    first(
      user.displayName,
      user.fullName,
      user.name,
      user.nombre,
      user.username,
      user.slug,
      user.email
    ),
    DEFAULT_NAME
  );
}

export function getSidebarUsername(user = null) {
  if (!isUsableSidebarUser(user)) return "";

  const raw = text(
    first(
      user.username,
      user.slug,
      user.userName,
      user.user_name,
      user.email,
      user.userId,
      user.id
    ),
    ""
  );

  const base = raw.includes("@") ? raw.split("@")[0] : raw;

  return base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

export function getSidebarInitials(value = "") {
  const name = text(value, DEFAULT_NAME);
  const parts = name.split(/\s+/).filter(Boolean);

  if (!parts.length) return DEFAULT_INITIALS;

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

/* =========================================================
   VIEW MODEL
========================================================= */

export function getSidebarUser(context = {}) {
  const user = getSidebarUserSource(context);
  const hasUser = isUsableSidebarUser(user);
  const displayName = hasUser ? getSidebarDisplayName(user) : DEFAULT_NAME;
  const role = hasUser ? getSidebarUserRole({ ...context, user }) : SIDEBAR_ROLE_USER;

  return {
    hasUser,

    id: hasUser ? user.id || user.userId || null : null,
    userId: hasUser ? user.userId || user.id || null : null,

    displayName,
    name: displayName,
    username: hasUser ? getSidebarUsername(user) : "",

    initials: getSidebarInitials(displayName),

    role,
    roles: [role],
    roleLabel: role === SIDEBAR_ROLE_ADMIN ? "Admin" : "Usuario",
    isAdmin: role === SIDEBAR_ROLE_ADMIN,
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSidebarUserSnapshot(context = {}) {
  const user = getSidebarUser(context);

  return {
    version: SIDEBAR_USER_VERSION,
    hasUser: user.hasUser,
    user: user.hasUser
      ? {
          id: user.id,
          userId: user.userId,
          username: user.username || null,
          displayName: user.displayName,
          role: user.role,
        }
      : null,
    isAdmin: user.isAdmin,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_USER_VERSION,

  isSidebarUserDisabled,
  hasSidebarUserIdentity,
  isUsableSidebarUser,
  unwrapSidebarUser,

  getSidebarUserSource,
  getSidebarUserRole,
  isSidebarAdmin,

  getSidebarDisplayName,
  getSidebarUsername,
  getSidebarInitials,

  getSidebarUser,
  getSidebarUserSnapshot,
};
