/* =========================================================
   Onion SPA - Store Selectors
   Archivo: src/store/selectors.js

   Selectors limpios:
   - auth estricta = token usable + user activo usable
   - roles reales: admin / user
   - snapshots sin token crudo por defecto
   - colecciones clonadas salvo collectionRaw()
   - compatible con state por slices y state plano
========================================================= */

import {
  deepClone,
  deepEqual,
  getByPath,
  isFunction,
  safeArray,
  safeNumber,
  safeObject,
  safeText,
  unique,
} from "./helpers.js";

import {
  ensureCollectionKey,
} from "./collections.js";

export const STORE_SELECTORS_VERSION = "15.0.0-clean";

/* =========================================================
   CONSTANTS
========================================================= */

const BAD_TOKEN_VALUES = new Set([
  "",
  "null",
  "undefined",
  "false",
  "true",
  "nan",
  "none",
  "empty",
  "[object object]",
  "{}",
  "[]",
  "\"\"",
  "''",
]);

const DISABLED_STATUS = new Set([
  "disabled",
  "inactive",
  "deleted",
  "blocked",
  "suspended",
  "banned",
  "revoked",
  "deactivated",
  "desactivado",
  "inactivo",
  "eliminado",
  "bloqueado",
  "suspendido",
  "baneado",
  "revocado",
]);

const ADMIN_ALIASES = new Set([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super-administrador",
  "super_administrador",
  "owner",
  "root",
]);

const USER_ALIASES = new Set([
  "user",
  "usuario",
  "member",
  "miembro",
  "client",
  "cliente",
  "customer",
  "account",
  "particular",
  "empresa",
]);

const ENTITY_ID_KEYS = Object.freeze([
  "id",
  "_id",
  "uuid",

  "userId",
  "user_id",
  "uid",
  "sub",

  "ticketId",
  "ticket_id",
  "incidenciaId",
  "incidencia_id",

  "clienteId",
  "cliente_id",
  "clientId",
  "client_id",
  "customerId",
  "customer_id",

  "facturaId",
  "factura_id",
  "invoiceId",
  "invoice_id",
  "numeroFacturaLegal",
  "numero_factura_legal",
]);

const SENSITIVE_TOKEN_RE =
  /(bearer\s+[a-z0-9._~+/=-]+)|([a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)|([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|access_token|refresh_token|id_token|tempToken|temp_token|code|t)=)[^&#\s]+/gi;

/* =========================================================
   BASICS
========================================================= */

function clone(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null) return null;

  try {
    return deepClone(value);
  } catch {}

  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {}

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback === null ? value : fallback;
  }
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return value;
  }

  return null;
}

function hasOwn(obj, key) {
  try {
    return Object.prototype.hasOwnProperty.call(obj, key);
  } catch {
    return false;
  }
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function redactTokenInText(value = "") {
  const text = safeText(value, "");
  if (!text) return "";

  try {
    return text.replace(SENSITIVE_TOKEN_RE, (match) => {
      if (/^bearer\s+/i.test(match)) return "Bearer ***";
      if (/^[?&#]/.test(match)) return match.replace(/=.+$/g, "=***");
      return "***";
    });
  } catch {
    return text;
  }
}

function stripBearer(token = "") {
  return safeText(token, "").replace(/^Bearer\s+/i, "").trim();
}

function hasUsableToken(token = "") {
  const value = stripBearer(token);
  if (!value) return false;

  if (BAD_TOKEN_VALUES.has(value.toLowerCase())) return false;
  if (/[\s\r\n\t]/.test(value)) return false;

  return true;
}

/* =========================================================
   USER / ROLE
========================================================= */

function lowerKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function normalizeRole(value = "") {
  const key = lowerKey(value);

  if (ADMIN_ALIASES.has(key)) return "admin";
  if (USER_ALIASES.has(key)) return "user";

  return "";
}

function normalizePermission(value = "") {
  return lowerKey(value);
}

function isDisabledUser(user = null) {
  const current = safeObject(user);

  const status = lowerKey(
    first(
      current.status,
      current.estado,
      current.state,
      current.accountStatus,
      current.account_status,
      current.raw?.status,
      current.raw?.estado
    ) || ""
  );

  if (DISABLED_STATUS.has(status)) return true;

  return Boolean(
    current.active === false ||
      current.enabled === false ||
      current.isEnabled === false ||
      current.disabled === true ||
      current.isDisabled === true ||
      current.deleted === true ||
      current.isDeleted === true ||
      current.blocked === true ||
      current.isBlocked === true ||
      current.banned === true ||
      current.suspended === true ||
      current.revoked === true ||
      current.deactivated === true ||
      current.deletedAt ||
      current.disabledAt ||
      current.blockedAt
  );
}

function hasUsableUser(user = null) {
  const current = safeObject(user);

  if (!current || isDisabledUser(current)) return false;

  return Boolean(
    safeText(current.id, "") ||
      safeText(current.userId, "") ||
      safeText(current.user_id, "") ||
      safeText(current._id, "") ||
      safeText(current.uid, "") ||
      safeText(current.sub, "") ||
      safeText(current.username, "") ||
      safeText(current.userName, "") ||
      safeText(current.user_name, "") ||
      safeText(current.email, "") ||
      safeText(current.mail, "") ||
      safeText(current.phone, "") ||
      safeText(current.telefono, "") ||
      safeText(current.mobile, "")
  );
}

function getSessionUser(session = {}, rootState = {}) {
  const user = first(
    session.user,
    session.usuario,
    session.currentUser,
    session.authUser,
    session.sessionUser,
    session.account,
    session.profile,
    session.me,
    session.auth?.user,
    session.auth?.usuario,
    session.auth?.me,

    rootState.user,
    rootState.usuario,
    rootState.currentUser,
    rootState.authUser,
    rootState.sessionUser,
    rootState.account,
    rootState.profile,
    rootState.me
  );

  return hasUsableUser(user) ? safeObject(user) : null;
}

function getSessionToken(session = {}, rootState = {}) {
  return stripBearer(
    first(
      session.token,
      session.accessToken,
      session.access_token,
      session.jwt,
      session.bearer,
      session.auth?.token,
      session.auth?.accessToken,
      session.auth?.access_token,

      rootState.token,
      rootState.accessToken,
      rootState.access_token,
      rootState.jwt,
      rootState.bearer
    ) || ""
  );
}

function getUserIdentity(user = null) {
  const current = safeObject(user);

  return (
    safeText(current.userId, "") ||
    safeText(current.user_id, "") ||
    safeText(current.id, "") ||
    safeText(current._id, "") ||
    safeText(current.uid, "") ||
    safeText(current.sub, "") ||
    safeText(current.email, "") ||
    safeText(current.mail, "") ||
    safeText(current.username, "") ||
    safeText(current.userName, "") ||
    safeText(current.user_name, "") ||
    safeText(current.phone, "") ||
    safeText(current.telefono, "") ||
    ""
  );
}

function getUserId(user = null) {
  const current = safeObject(user);

  return (
    safeText(current.userId, "") ||
    safeText(current.user_id, "") ||
    safeText(current.id, "") ||
    safeText(current._id, "") ||
    safeText(current.uid, "") ||
    safeText(current.sub, "") ||
    null
  );
}

function getUserUsername(user = null) {
  const current = safeObject(user);

  return (
    safeText(current.username, "") ||
    safeText(current.userName, "") ||
    safeText(current.user_name, "") ||
    safeText(current.nick, "") ||
    safeText(current.alias, "") ||
    safeText(current.login, "") ||
    safeText(current.slug, "") ||
    safeText(current.email, "") ||
    safeText(current.mail, "") ||
    ""
  );
}

function getUserDisplayName(user = null) {
  const current = safeObject(user);
  const profile = safeObject(current.profile);
  const raw = safeObject(current.raw);

  return (
    safeText(current.displayName, "") ||
    safeText(current.display_name, "") ||
    safeText(current.name, "") ||
    safeText(current.nombre, "") ||
    safeText(current.fullName, "") ||
    safeText(current.full_name, "") ||

    safeText(profile.displayName, "") ||
    safeText(profile.display_name, "") ||
    safeText(profile.name, "") ||
    safeText(profile.nombre, "") ||
    safeText(profile.fullName, "") ||
    safeText(profile.full_name, "") ||

    safeText(raw.displayName, "") ||
    safeText(raw.display_name, "") ||
    safeText(raw.name, "") ||
    safeText(raw.nombre, "") ||

    safeText(current.username, "") ||
    safeText(current.userName, "") ||
    safeText(current.email, "") ||
    safeText(current.phone, "") ||
    "Usuario"
  );
}

function isSafeAvatarUrl(url = "") {
  const value = safeText(url, "");
  if (!value) return false;

  const lower = value.toLowerCase();

  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("data:text/html") ||
    lower.startsWith("data:application/") ||
    lower.startsWith("data:image/svg")
  ) {
    return false;
  }

  if (lower.startsWith("data:")) {
    return /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(value);
  }

  return true;
}

function getUserAvatar(user = null) {
  const current = safeObject(user);
  const profile = safeObject(current.profile);
  const raw = safeObject(current.raw);
  const rawProfile = safeObject(raw.profile);

  const hasAvatar =
    current.hasAvatar ??
    current.has_avatar ??
    profile.hasAvatar ??
    profile.has_avatar ??
    raw.hasAvatar ??
    raw.has_avatar;

  if (hasAvatar === false) return "";

  const avatar =
    safeText(current.avatarUrl, "") ||
    safeText(current.avatarURL, "") ||
    safeText(current.avatar_url, "") ||
    safeText(current.avatar, "") ||
    safeText(current.photoUrl, "") ||
    safeText(current.photoURL, "") ||
    safeText(current.photo_url, "") ||
    safeText(current.photo, "") ||
    safeText(current.pictureUrl, "") ||
    safeText(current.pictureURL, "") ||
    safeText(current.picture_url, "") ||
    safeText(current.picture, "") ||
    safeText(current.imageUrl, "") ||
    safeText(current.imageURL, "") ||
    safeText(current.image_url, "") ||
    safeText(current.image, "") ||

    safeText(profile.avatarUrl, "") ||
    safeText(profile.avatarURL, "") ||
    safeText(profile.avatar_url, "") ||
    safeText(profile.avatar, "") ||
    safeText(profile.photoUrl, "") ||
    safeText(profile.photoURL, "") ||
    safeText(profile.photo_url, "") ||
    safeText(profile.photo, "") ||
    safeText(profile.pictureUrl, "") ||
    safeText(profile.pictureURL, "") ||
    safeText(profile.picture_url, "") ||
    safeText(profile.picture, "") ||
    safeText(profile.imageUrl, "") ||
    safeText(profile.imageURL, "") ||
    safeText(profile.image_url, "") ||
    safeText(profile.image, "") ||

    safeText(raw.avatarUrl, "") ||
    safeText(raw.avatarURL, "") ||
    safeText(raw.avatar_url, "") ||
    safeText(raw.avatar, "") ||
    safeText(raw.photoUrl, "") ||
    safeText(raw.photoURL, "") ||
    safeText(raw.photo_url, "") ||
    safeText(raw.photo, "") ||
    safeText(raw.pictureUrl, "") ||
    safeText(raw.pictureURL, "") ||
    safeText(raw.picture_url, "") ||
    safeText(raw.picture, "") ||
    safeText(raw.imageUrl, "") ||
    safeText(raw.imageURL, "") ||
    safeText(raw.image_url, "") ||
    safeText(raw.image, "") ||

    safeText(rawProfile.avatarUrl, "") ||
    safeText(rawProfile.avatar_url, "") ||
    safeText(rawProfile.avatar, "") ||
    "";

  return isSafeAvatarUrl(avatar) ? avatar : "";
}

function collectRoles(user = null, session = {}, rootState = {}) {
  const current = safeObject(user);
  const profile = safeObject(current.profile);
  const raw = safeObject(current.raw);

  const roles = [
    rootState.role,
    rootState.rol,
    rootState.userRole,
    rootState.user_role,
    rootState.roles,

    session.role,
    session.rol,
    session.userRole,
    session.user_role,
    session.roles,

    current.role,
    current.rol,
    current.userRole,
    current.user_role,
    current.type,
    current.userType,
    current.user_type,
    current.perfil,
    current.roles,

    profile.role,
    profile.rol,
    profile.userRole,
    profile.user_role,
    profile.type,
    profile.perfil,
    profile.roles,

    raw.role,
    raw.rol,
    raw.userRole,
    raw.user_role,
    raw.type,
    raw.userType,
    raw.user_type,
    raw.perfil,
    raw.roles,

    raw?.profile?.role,
    raw?.profile?.rol,
    raw?.profile?.userRole,
    raw?.profile?.roles,
  ]
    .flat(Infinity)
    .map(normalizeRole)
    .filter(Boolean);

  const adminFlag = [
    current.isAdmin,
    current.admin,
    current.isSuperAdmin,
    current.superAdmin,
    current.canManageUsers,
    current.canAccessUsers,
    profile.isAdmin,
    profile.admin,
    raw.isAdmin,
    raw.admin,
    rootState.isAdmin,
    rootState.admin,
    session.isAdmin,
    session.admin,
  ].some((value) => value === true);

  if (adminFlag) roles.push("admin");

  const finalRoles = unique(roles);
  return finalRoles.length ? finalRoles : ["user"];
}

function collectPermissions(user = null, session = {}, rootState = {}) {
  const current = safeObject(user);
  const profile = safeObject(current.profile);
  const raw = safeObject(current.raw);

  return unique([
    rootState.permissions,
    rootState.permisos,
    rootState.scopes,

    session.permissions,
    session.permisos,
    session.scopes,

    current.permissions,
    current.permisos,
    current.scopes,
    current.authorities,

    profile.permissions,
    profile.permisos,
    profile.scopes,
    profile.authorities,

    raw.permissions,
    raw.permisos,
    raw.scopes,
    raw.authorities,

    raw?.profile?.permissions,
    raw?.profile?.permisos,
    raw?.profile?.scopes,
  ]
    .flat(Infinity)
    .map(normalizePermission)
    .filter(Boolean));
}

function canonicalRole(roles = []) {
  return roles.includes("admin") ? "admin" : "user";
}

/* =========================================================
   UI
========================================================= */

function normalizeTheme(value = "") {
  const theme = safeText(value, "").toLowerCase();

  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  if (theme === "system") return "system";

  return "";
}

function systemTheme() {
  try {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
  } catch {}

  return "dark";
}

function normalizeLang(value = "") {
  const lang = safeText(value, "").toLowerCase().replace(/_/g, "-");
  if (!lang) return "";

  const base = lang.split("-")[0];

  if (["spa", "spanish", "castellano", "español"].includes(base)) return "es";
  if (["eng", "english"].includes(base)) return "en";
  if (["cat", "catalan", "català", "catalán"].includes(base)) return "ca";

  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(lang) ? lang : "";
}

/* =========================================================
   COLLECTIONS
========================================================= */

function safeEnsureCollectionKey(state, key) {
  const raw = safeText(key, "");
  if (!raw) return "";

  try {
    return ensureCollectionKey(state, raw);
  } catch {
    return raw;
  }
}

function getEntityId(entity = null) {
  const item = safeObject(entity);

  for (const key of ENTITY_ID_KEYS) {
    const value = safeText(item?.[key], "");
    if (value) return value;
  }

  return "";
}

function sameEntityId(entity = null, id = "") {
  const target = safeText(id, "");
  if (!target) return false;

  const item = safeObject(entity);

  return ENTITY_ID_KEYS.some((key) => safeText(item?.[key], "") === target);
}

function cloneCollection(value) {
  if (Array.isArray(value)) return value.map((item) => clone(item));
  return clone(value);
}

/* =========================================================
   FACTORY
========================================================= */

export function createSelectors({
  AppCore,
  state,
} = {}) {
  const rootState = state || {};

  function root() {
    return safeObject(rootState);
  }

  function app() {
    return safeObject(root().app);
  }

  function session() {
    const slice = safeObject(root().session);

    return {
      ...slice,

      token: slice.token ?? root().token ?? null,
      accessToken: slice.accessToken ?? root().accessToken ?? root().access_token ?? null,
      access_token: slice.access_token ?? slice.accessToken ?? root().access_token ?? root().accessToken ?? null,

      user: slice.user ?? root().user ?? root().currentUser ?? root().authUser ?? root().sessionUser ?? null,
      usuario: slice.usuario ?? root().usuario ?? null,

      role: slice.role ?? root().role ?? root().rol ?? root().userRole ?? null,
      roles: slice.roles ?? root().roles ?? [],
      permissions: slice.permissions ?? root().permissions ?? root().permisos ?? [],
    };
  }

  function ui() {
    return {
      ...safeObject(root().ui),

      theme: root().ui?.theme ?? root().theme ?? null,
      themeMode: root().ui?.themeMode ?? root().themeMode ?? root().appearance ?? null,
      lang: root().ui?.lang ?? root().lang ?? root().language ?? null,
      sidebarOpen: root().ui?.sidebarOpen ?? root().sidebarOpen ?? false,
    };
  }

  function entities() {
    return safeObject(root().entities || root().collections);
  }

  function flags() {
    return safeObject(root().flags);
  }

  function meta() {
    return safeObject(root().meta);
  }

  function tokenValue() {
    return getSessionToken(session(), root());
  }

  function userValue() {
    return getSessionUser(session(), root());
  }

  function authenticated() {
    return Boolean(
      (session().authenticated === true || root().authenticated === true) &&
        hasUsableToken(tokenValue()) &&
        hasUsableUser(userValue())
    );
  }

  function rolesValue() {
    if (!authenticated()) return [];
    return collectRoles(userValue(), session(), root());
  }

  function roleValue() {
    if (!authenticated()) return null;
    return canonicalRole(rolesValue());
  }

  function permissionsValue() {
    if (!authenticated()) return [];
    return collectPermissions(userValue(), session(), root());
  }

  function collectionRaw(key) {
    const finalKey = safeEnsureCollectionKey(root(), key);
    if (!finalKey) return undefined;

    if (hasOwn(entities(), finalKey)) return entities()[finalKey];
    if (hasOwn(root(), finalKey)) return root()[finalKey];
    if (hasOwn(safeObject(root().collections), finalKey)) return root().collections[finalKey];

    return undefined;
  }

  function collectionListRaw(key) {
    const value = collectionRaw(key);
    return Array.isArray(value) ? value : [];
  }

  function appName() {
    return (
      safeText(AppCore?.config?.appName, "") ||
      safeText(AppCore?.config?.name, "") ||
      "Onion Support"
    );
  }

  const selectors = {
    /* =====================================
       APP
    ===================================== */

    isReady() {
      return Boolean(
        app().ready ||
          app().booted ||
          root().ready ||
          root().booted
      );
    },

    isInitialized() {
      return Boolean(app().initialized || root().initialized);
    },

    isBooting() {
      return Boolean(app().booting || root().booting);
    },

    isLoading() {
      return Boolean(app().loading || root().loading);
    },

    isFatal() {
      return Boolean(app().fatal || app().appFatal || root().fatal || root().appFatal);
    },

    lastError() {
      const error = app().lastError || app().error || root().lastError || root().error || null;
      return error ? clone(error) : null;
    },

    currentRoute() {
      return safeText(app().route || root().route, "/") || "/";
    },

    currentCanonicalPath() {
      return safeText(app().canonicalPath || root().canonicalPath || root().route, selectors.currentRoute());
    },

    currentPublicPath() {
      return safeText(app().publicPath || root().publicPath || root().route, selectors.currentRoute());
    },

    routeSnapshot() {
      return {
        route: selectors.currentRoute(),
        canonicalPath: selectors.currentCanonicalPath(),
        publicPath: redactTokenInText(selectors.currentPublicPath()),
      };
    },

    appSnapshot() {
      return {
        ...clone(app(), {}),
        initialized: selectors.isInitialized(),
        ready: selectors.isReady(),
        booting: selectors.isBooting(),
        loading: selectors.isLoading(),
        fatal: selectors.isFatal(),
        route: selectors.currentRoute(),
        canonicalPath: selectors.currentCanonicalPath(),
        publicPath: redactTokenInText(selectors.currentPublicPath()),
      };
    },

    /* =====================================
       SESSION
    ===================================== */

    isAuthenticated() {
      return authenticated();
    },

    hasToken() {
      return hasUsableToken(tokenValue());
    },

    hasUser() {
      return hasUsableUser(userValue());
    },

    currentUser() {
      return authenticated() ? clone(userValue()) : null;
    },

    currentUserRaw() {
      return authenticated() ? userValue() : null;
    },

    currentUserIdentity() {
      return authenticated() ? getUserIdentity(userValue()) || null : null;
    },

    currentUserId() {
      return authenticated() ? getUserId(userValue()) : null;
    },

    currentUsername() {
      return authenticated() ? getUserUsername(userValue()) || null : null;
    },

    currentDisplayName() {
      return authenticated() ? getUserDisplayName(userValue()) : null;
    },

    currentAvatar() {
      return authenticated() ? getUserAvatar(userValue()) || null : null;
    },

    currentRole() {
      return roleValue();
    },

    currentRoles() {
      return [...rolesValue()];
    },

    currentPermissions() {
      return [...permissionsValue()];
    },

    isAdmin() {
      return roleValue() === "admin";
    },

    isUser() {
      return roleValue() === "user";
    },

    /*
      Compat legacy. El sistema real sólo usa admin/user.
    */
    isSupport() {
      return false;
    },

    isManager() {
      return false;
    },

    isClient() {
      return false;
    },

    hasRole(...roles) {
      if (!authenticated()) return false;

      const requested = roles
        .flat(Infinity)
        .map(normalizeRole)
        .filter(Boolean);

      if (!requested.length) return true;

      const current = new Set(rolesValue());

      return requested.some((role) => current.has(role));
    },

    hasAnyRole(roles = []) {
      return selectors.hasRole(...toArray(roles).flat(Infinity));
    },

    hasAllRoles(roles = []) {
      if (!authenticated()) return false;

      const requested = toArray(roles)
        .flat(Infinity)
        .map(normalizeRole)
        .filter(Boolean);

      if (!requested.length) return true;

      const current = new Set(rolesValue());

      return requested.every((role) => current.has(role));
    },

    hasPermission(...permissions) {
      if (!authenticated()) return false;

      const requested = permissions
        .flat(Infinity)
        .map(normalizePermission)
        .filter(Boolean);

      if (!requested.length) return true;

      const current = new Set(permissionsValue());

      return requested.some((permission) => current.has(permission));
    },

    hasAnyPermission(permissions = []) {
      return selectors.hasPermission(...toArray(permissions).flat(Infinity));
    },

    hasAllPermissions(permissions = []) {
      if (!authenticated()) return false;

      const requested = toArray(permissions)
        .flat(Infinity)
        .map(normalizePermission)
        .filter(Boolean);

      if (!requested.length) return true;

      const current = new Set(permissionsValue());

      return requested.every((permission) => current.has(permission));
    },

    token() {
      const token = tokenValue();
      return hasUsableToken(token) ? token : null;
    },

    authHeader() {
      const token = selectors.token();

      if (!token) return {};

      const headerName = safeText(AppCore?.config?.auth?.tokenHeader, "Authorization");
      const bearerPrefix = safeText(AppCore?.config?.auth?.bearerPrefix, "Bearer");

      return {
        [headerName]: `${bearerPrefix} ${token}`,
      };
    },

    sessionSnapshot(options = {}) {
      const opts = safeObject(options);
      const token = selectors.token();

      return {
        version: STORE_SELECTORS_VERSION,

        authenticated: authenticated(),
        hasToken: Boolean(token),

        token: opts.includeToken === true ? token : null,
        accessToken: opts.includeToken === true ? token : null,

        user: selectors.currentUser(),
        userIdentity: selectors.currentUserIdentity(),
        userId: selectors.currentUserId(),
        username: selectors.currentUsername(),
        displayName: selectors.currentDisplayName(),
        avatar: selectors.currentAvatar(),

        role: roleValue(),
        roles: rolesValue(),
        permissions: permissionsValue(),

        isAdmin: selectors.isAdmin(),
        isUser: selectors.isUser(),
        isSupport: false,
        isManager: false,
        isClient: false,

        raw: opts.includeRaw === true ? clone(session(), {}) : null,
        at: nowIso(),
      };
    },

    /* =====================================
       UI
    ===================================== */

    currentTheme() {
      const resolved =
        normalizeTheme(ui().theme) ||
        normalizeTheme(AppCore?.state?.theme) ||
        normalizeTheme(AppCore?.config?.defaultTheme) ||
        "dark";

      return resolved === "system" ? systemTheme() : resolved;
    },

    themePreference() {
      return (
        normalizeTheme(ui().themePreference) ||
        normalizeTheme(ui().themeMode) ||
        normalizeTheme(AppCore?.state?.themeMode) ||
        normalizeTheme(AppCore?.state?.appearance) ||
        normalizeTheme(AppCore?.config?.defaultTheme) ||
        "system"
      );
    },

    currentLang() {
      return (
        normalizeLang(ui().lang) ||
        normalizeLang(AppCore?.state?.lang) ||
        normalizeLang(AppCore?.config?.defaultLang) ||
        "es"
      );
    },

    isSidebarOpen() {
      return Boolean(ui().sidebarOpen);
    },

    pageTitle() {
      return safeText(ui().pageTitle || root().pageTitle, appName());
    },

    topbarTitle() {
      return safeText(ui().topbarTitle || ui().pageTitle || root().topbarTitle || root().pageTitle, appName());
    },

    density() {
      return (
        safeText(ui().density, "") ||
        safeText(AppCore?.state?.density, "") ||
        safeText(AppCore?.config?.ui?.density, "") ||
        "default"
      );
    },

    uiSnapshot(options = {}) {
      const opts = safeObject(options);

      return {
        theme: selectors.currentTheme(),
        themePreference: selectors.themePreference(),
        lang: selectors.currentLang(),
        sidebarOpen: selectors.isSidebarOpen(),
        density: selectors.density(),
        pageTitle: selectors.pageTitle(),
        topbarTitle: selectors.topbarTitle(),
        raw: opts.includeRaw === true ? clone(ui(), {}) : null,
      };
    },

    /* =====================================
       FLAGS
    ===================================== */

    flag(key, fallback = false) {
      const name = safeText(key, "");
      if (!name) return fallback;
      if (!hasOwn(flags(), name)) return fallback;
      return Boolean(flags()[name]);
    },

    flags() {
      return clone(flags(), {});
    },

    isHydrating() {
      return selectors.flag("hydrating", false);
    },

    isFetching(key = "") {
      const clean = safeText(key, "");
      if (!clean) return false;

      const flagName = `fetching${clean[0]?.toUpperCase() || ""}${clean.slice(1)}`;
      return selectors.flag(flagName, false);
    },

    /* =====================================
       ENTITIES / COLLECTIONS
    ===================================== */

    collection(key) {
      return cloneCollection(collectionRaw(key));
    },

    collectionRaw(key) {
      return collectionRaw(key);
    },

    collectionList(key) {
      return collectionListRaw(key).map((item) => clone(item));
    },

    count(key) {
      const value = collectionRaw(key);
      if (Array.isArray(value)) return value.length;
      return value ? 1 : 0;
    },

    isEmpty(key) {
      return selectors.count(key) === 0;
    },

    first(key) {
      const value = collectionRaw(key);

      if (Array.isArray(value)) {
        return value.length ? clone(value[0]) : null;
      }

      return value ? clone(value) : null;
    },

    last(key) {
      const value = collectionRaw(key);

      if (Array.isArray(value)) {
        return value.length ? clone(value[value.length - 1]) : null;
      }

      return value ? clone(value) : null;
    },

    find(key, predicate) {
      const list = collectionListRaw(key);

      if (!Array.isArray(list) || !isFunction(predicate)) return null;

      for (let index = 0; index < list.length; index += 1) {
        const item = list[index];

        try {
          if (predicate(clone(item), index, clone(list, []))) {
            return clone(item);
          }
        } catch {}
      }

      return null;
    },

    filter(key, predicate) {
      const list = collectionListRaw(key);

      if (!Array.isArray(list) || !isFunction(predicate)) return [];

      const output = [];

      list.forEach((item, index) => {
        try {
          if (predicate(clone(item), index, clone(list, []))) {
            output.push(clone(item));
          }
        } catch {}
      });

      return output;
    },

    map(key, mapper) {
      const list = collectionListRaw(key);

      if (!Array.isArray(list) || !isFunction(mapper)) return [];

      return list.map((item, index) => {
        try {
          return clone(mapper(clone(item), index, clone(list, [])));
        } catch {
          return null;
        }
      });
    },

    byId(key, id) {
      const targetId = safeText(id, "");
      if (!targetId) return null;

      return selectors.find(key, (item) => sameEntityId(item, targetId));
    },

    ids(key) {
      const value = collectionRaw(key);

      if (!Array.isArray(value)) {
        const id = getEntityId(value);
        return id ? [id] : [];
      }

      return value.map(getEntityId).filter(Boolean);
    },

    entityMap(key) {
      const value = collectionRaw(key);
      const map = new Map();

      if (!Array.isArray(value)) {
        const id = getEntityId(value);
        if (id) map.set(id, clone(value));
        return map;
      }

      value.forEach((item) => {
        const id = getEntityId(item);
        if (id) map.set(id, clone(item));
      });

      return map;
    },

    entitiesSnapshot() {
      return clone(entities(), {});
    },

    get(path, fallback = undefined) {
      return clone(getByPath(root(), path, fallback), fallback);
    },

    incidencias() {
      return selectors.collectionList("incidencias");
    },

    tickets() {
      return selectors.collectionList("incidencias");
    },

    facturas() {
      return selectors.collectionList("facturas");
    },

    usuarios() {
      return selectors.collectionList("usuarios");
    },

    clientes() {
      return selectors.collectionList("clientes");
    },

    recientes() {
      return selectors.collectionList("recientes");
    },

    dashboard() {
      return clone(entities().dashboard || root().dashboard || null);
    },

    /* =====================================
       META
    ===================================== */

    meta() {
      return clone(meta(), {});
    },

    hydrated() {
      return Boolean(meta().hydrated || root().hydrated);
    },

    revision() {
      return safeNumber(meta().revision ?? root().revision, 0);
    },

    createdAt() {
      return meta().createdAt || root().createdAt || null;
    },

    updatedAt() {
      return meta().updatedAt || root().updatedAt || null;
    },

    /* =====================================
       FULL SNAPSHOT
    ===================================== */

    snapshot(options = {}) {
      const opts = safeObject(options);

      return {
        version: STORE_SELECTORS_VERSION,

        app: selectors.appSnapshot(),

        session: selectors.sessionSnapshot({
          includeToken: opts.includeToken === true,
          includeRaw: opts.includeRawSession === true,
        }),

        ui: selectors.uiSnapshot({
          includeRaw: opts.includeRawUi === true,
        }),

        flags: selectors.flags(),

        entities: opts.includeEntities === false
          ? null
          : clone(entities(), {}),

        meta: selectors.meta(),

        at: nowIso(),
      };
    },

    getSnapshot(options = {}) {
      return selectors.snapshot(options);
    },

    getDebugSnapshot(options = {}) {
      return selectors.snapshot(options);
    },
  };

  return selectors;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  STORE_SELECTORS_VERSION,
  createSelectors,
};
