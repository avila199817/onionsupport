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

  const status = text(user.status || user.estado, "").toLowerCase();

  return Boolean(
    user.disabled === true ||
      user.deleted === true ||
      user.archived === true ||
      user.active === false ||
      status === "disabled" ||
      status === "deleted" ||
      status === "archived"
  );
}

export function hasSidebarUserIdentity(user = null) {
  if (!isObject(user)) return false;

  return Boolean(
    text(user.id, "") ||
      text(user.userId, "") ||
      text(user.username, "") ||
      text(user.slug, "") ||
      text(user.lookup?.slug, "")
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
    payload.session?.user,
    payload.data?.user,
    payload.payload?.user,
    payload.me,
    payload.account
  );

  if (isUsableSidebarUser(direct)) return direct;
  if (isUsableSidebarUser(payload)) return payload;

  return null;
}

/* =========================================================
   SOURCES
========================================================= */

function safeCall(fn = null) {
  if (!isFunction(fn)) return null;

  try {
    return fn();
  } catch {
    return null;
  }
}

function getUserFromAuth(Auth = null) {
  if (!isObject(Auth)) return null;

  const candidates = [
    safeCall(Auth.getUser?.bind?.(Auth) || Auth.getUser),
    safeCall(Auth.getCurrentUser?.bind?.(Auth) || Auth.getCurrentUser),
    Auth.user,
    Auth.currentUser,
    Auth.session?.user,
    Auth.state?.user,
  ];

  return candidates.map(unwrapSidebarUser).find(isUsableSidebarUser) || null;
}

function getUserFromCore(AppCore = null) {
  if (!isObject(AppCore)) return null;

  const state = isObject(AppCore.state) ? AppCore.state : {};

  const candidates = [
    state.user,
    state.currentUser,
    state.authUser,
    state.sessionUser,
    state.session?.user,
    state.auth?.user,
    AppCore.user,
    AppCore.currentUser,
  ];

  return candidates.map(unwrapSidebarUser).find(isUsableSidebarUser) || null;
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

function normalizeRoleValue(value = null) {
  if (Array.isArray(value)) {
    const roles = value
      .map((role) => normalizeRoleValue(role))
      .filter(Boolean);

    if (roles.includes(SIDEBAR_ROLE_ADMIN)) return SIDEBAR_ROLE_ADMIN;
    if (roles.includes(SIDEBAR_ROLE_USER)) return SIDEBAR_ROLE_USER;

    return "";
  }

  const role = normalizeSidebarRole(value);

  if (role === SIDEBAR_ROLE_ADMIN) return SIDEBAR_ROLE_ADMIN;
  if (role === SIDEBAR_ROLE_USER) return SIDEBAR_ROLE_USER;

  return "";
}

function firstRole(...values) {
  for (const value of values) {
    const role = normalizeRoleValue(value);

    if (role) return role;
  }

  return SIDEBAR_ROLE_USER;
}

function getRoleFromAuth(Auth = null) {
  if (!isObject(Auth)) return "";

  return firstRole(
    safeCall(Auth.getRole?.bind?.(Auth) || Auth.getRole),
    safeCall(Auth.getCurrentRole?.bind?.(Auth) || Auth.getCurrentRole),
    Auth.role,
    Auth.currentRole,
    Auth.user?.role,
    Auth.currentUser?.role
  );
}

export function getSidebarUserRole(context = {}) {
  const user =
    unwrapSidebarUser(context.user) ||
    getSidebarUserSource(context) ||
    null;

  const AppCore = context.AppCore || null;
  const state = isObject(AppCore?.state) ? AppCore.state : {};

  return firstRole(
    context.role,
    user?.role,
    user?.rol,
    user?.roles,
    getRoleFromAuth(context.Auth),
    state.role,
    state.user?.role,
    state.user?.rol,
    state.user?.roles
  );
}

export function isSidebarAdmin(context = {}) {
  return getSidebarUserRole(context) === SIDEBAR_ROLE_ADMIN;
}

/* =========================================================
   DISPLAY
========================================================= */

export function getSidebarDisplayName(user = null) {
  if (!isUsableSidebarUser(user)) return DEFAULT_NAME;

  const profile = isObject(user.profile) ? user.profile : {};

  return text(
    first(
      user.displayName,
      user.fullName,
      user.name,
      user.nombre,
      profile.displayName,
      profile.fullName,
      profile.name,
      profile.nombre,
      user.username,
      user.slug,
      user.lookup?.slug
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
      user.lookup?.slug,
      user.userId,
      user.id
    ),
    ""
  );

  return raw
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

  const displayName = hasUser
    ? getSidebarDisplayName(user)
    : DEFAULT_NAME;

  const role = hasUser
    ? getSidebarUserRole({
        ...context,
        user,
      })
    : SIDEBAR_ROLE_USER;

  const id = hasUser ? text(user.id || user.userId, "") : "";
  const userId = hasUser ? text(user.userId || user.id, "") : "";
  const slug = hasUser ? text(user.slug || user.lookup?.slug, "") : "";

  return {
    hasUser,

    id: id || null,
    userId: userId || null,
    slug: slug || null,

    displayName,
    name: displayName,
    username: hasUser ? getSidebarUsername(user) : "",

    initials: getSidebarInitials(displayName),

    role,
    roles: [role],
    roleLabel: role === SIDEBAR_ROLE_ADMIN ? "Administrador" : "Usuario",
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
