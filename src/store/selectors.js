/* =========================================================
   Onion SPA - Store Selectors
   Archivo: src/store/selectors.js

   ONION SUPPORT · STORE SELECTORS
   SEMANTIC READ MODEL · STRICT AUTH · ROLE SAFE · 14/10

   Responsabilidades:
   - exponer selectores semánticos del store
   - leer estado derivado app / session / ui
   - leer colecciones de forma segura
   - devolver datos desacoplados mediante clone
   - centralizar lecturas frecuentes
   - evitar estados auth fantasma
   - normalizar roles / permisos
   - soportar aliases admin/support/manager/client/user
   - tolerar slices parciales durante boot
   - blindaje enterprise sin throws accidentales
   - no filtrar tokens en snapshots públicos
   - compatibilidad con colecciones heterogéneas
   - compatibilidad con AppCore parcial durante arranque

   HARDENING EXTREMO:
   - authenticated estricto = token usable + usuario usable + usuario activo
   - token() disponible para uso interno controlado
   - sessionSnapshot() no expone token crudo
   - authHeader() construye Authorization sólo si hay token usable
   - roles/permissions normalizados sin acentos
   - selectors sin dependencia de this para evitar rotura al destructurar métodos
   - colecciones siempre clonadas salvo collectionRaw()
   - entity lookup por aliases id/userId/ticketId/clienteId/facturaId
   - snapshots seguros y estables
========================================================= */

import {
  deepClone,
  isFunction,
} from "./helpers.js";

import {
  ensureCollectionKey,
} from "./collections.js";

/* =========================================================
   VERSION
========================================================= */

export const STORE_SELECTORS_VERSION =
  "14.0.0";

/* =========================================================
   ROLE CONSTANTS
========================================================= */

const ADMIN_ROLE_KEYS =
  new Set([
    "admin",
    "administrator",
    "administrador",
    "superadmin",
    "super_admin",
    "super_administrador",
    "owner",
    "root",
  ]);

const SUPPORT_ROLE_KEYS =
  new Set([
    "support",
    "soporte",
    "agent",
    "agente",
    "helpdesk",
    "operator",
    "operador",
    "technician",
    "technical",
    "tecnico",
    "tecnica",
    "técnico",
    "técnica",
    "it_support",
    "support_agent",
    "service_desk",
  ]);

const MANAGER_ROLE_KEYS =
  new Set([
    "manager",
    "gestor",
    "gerente",
    "lead",
    "team_lead",
    "supervisor",
    "responsable",
  ]);

const CLIENT_ROLE_KEYS =
  new Set([
    "client",
    "cliente",
    "customer",
    "account",
    "particular",
    "empresa",
  ]);

const USER_ROLE_KEYS =
  new Set([
    "user",
    "usuario",
    "member",
    "miembro",
  ]);

const DISABLED_STATUS_KEYS =
  new Set([
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

const BAD_TOKEN_VALUES =
  new Set([
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

const ENTITY_ID_KEYS =
  Object.freeze([
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

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback)
    .toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeObject(value, fallback = {}) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  return [value];
}

function clone(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  try {
    return deepClone(value);
  } catch {}

  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return value;
  }
}

function first(...values) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function hasOwn(obj, key) {
  try {
    return Boolean(
      obj &&
        typeof obj === "object" &&
        Object.prototype.hasOwnProperty.call(
          obj,
          key
        )
    );
  } catch {
    return false;
  }
}

function unique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .flat(Infinity)
        .map((item) =>
          safeText(item, "")
        )
        .filter(Boolean)
    )
  );
}

function safeNowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function redactTokenInText(value = "") {
  const text =
    safeText(value, "");

  if (!text) {
    return "";
  }

  try {
    return text.replace(
      SENSITIVE_TOKEN_RE,
      (match) => {
        if (/^bearer\s+/i.test(match)) {
          return "Bearer ***";
        }

        if (/^[?&#]/.test(match)) {
          return match.replace(/=.+$/g, "=***");
        }

        return "***";
      }
    );
  } catch {
    return text;
  }
}

/* =========================================================
   STATE SLICES
========================================================= */

function getAppSlice(state) {
  return safeObject(
    state?.app
  );
}

function getSessionSlice(state) {
  return safeObject(
    state?.session
  );
}

function getUiSlice(state) {
  return safeObject(
    state?.ui
  );
}

function getEntitiesSlice(state) {
  return safeObject(
    state?.entities
  );
}

function getFlagsSlice(state) {
  return safeObject(
    state?.flags
  );
}

function getMetaSlice(state) {
  return safeObject(
    state?.meta
  );
}

/* =========================================================
   TOKEN / USER
========================================================= */

function stripBearerPrefix(token = "") {
  return safeText(token, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function hasUsableToken(token = "") {
  const value =
    stripBearerPrefix(token);

  if (!value) {
    return false;
  }

  const lower =
    value.toLowerCase();

  if (BAD_TOKEN_VALUES.has(lower)) {
    return false;
  }

  if (/[\s\r\n\t]/.test(value)) {
    return false;
  }

  return true;
}

function isDisabledUser(user = null) {
  const current =
    safeObject(user);

  const status =
    safeLower(
      first(
        current.status,
        current.estado,
        current.state,
        current.accountStatus,
        current.account_status,
        current.raw?.status,
        current.raw?.estado
      ),
      ""
    );

  if (DISABLED_STATUS_KEYS.has(status)) {
    return true;
  }

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
  const current =
    safeObject(user);

  if (!current || isDisabledUser(current)) {
    return false;
  }

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

function getTokenFromSession(session = {}) {
  return stripBearerPrefix(
    first(
      session.token,
      session.accessToken,
      session.access_token,
      session.jwt,
      session.bearer,
      session.auth?.token,
      session.auth?.accessToken,
      session.auth?.access_token
    ) || ""
  );
}

function getUserFromSession(session = {}) {
  const user =
    first(
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
      session.auth?.me
    );

  return hasUsableUser(user)
    ? safeObject(user)
    : null;
}

function getUserIdentity(user = null) {
  const current =
    safeObject(user);

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

function getUserUsername(user = null) {
  const current =
    safeObject(user);

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
  const current =
    safeObject(user);

  const profile =
    safeObject(current.profile);

  const raw =
    safeObject(current.raw);

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

function getUserAvatar(user = null) {
  const current =
    safeObject(user);

  const profile =
    safeObject(current.profile);

  const raw =
    safeObject(current.raw);

  const rawProfile =
    safeObject(raw.profile);

  const hasAvatar =
    current.hasAvatar ??
    current.has_avatar ??
    profile.hasAvatar ??
    profile.has_avatar ??
    raw.hasAvatar ??
    raw.has_avatar;

  if (hasAvatar === false) {
    return "";
  }

  return (
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
    ""
  );
}

/* =========================================================
   ROLE NORMALIZATION
========================================================= */

function normalizeRole(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function normalizeRoles(value) {
  return toArray(value)
    .flat(Infinity)
    .map(normalizeRole)
    .filter(Boolean);
}

function isAdminRole(value = "") {
  return ADMIN_ROLE_KEYS.has(
    normalizeRole(value)
  );
}

function isSupportRole(value = "") {
  return SUPPORT_ROLE_KEYS.has(
    normalizeRole(value)
  );
}

function isManagerRole(value = "") {
  return MANAGER_ROLE_KEYS.has(
    normalizeRole(value)
  );
}

function isClientRole(value = "") {
  return CLIENT_ROLE_KEYS.has(
    normalizeRole(value)
  );
}

function isUserRole(value = "") {
  return USER_ROLE_KEYS.has(
    normalizeRole(value)
  );
}

function expandRoleAliases(roles = []) {
  const normalized =
    normalizeRoles(roles);

  const result =
    new Set(normalized);

  if (normalized.some(isAdminRole)) {
    for (const role of ADMIN_ROLE_KEYS) {
      result.add(role);
    }

    result.add("admin");
  }

  if (normalized.some(isSupportRole)) {
    for (const role of SUPPORT_ROLE_KEYS) {
      result.add(role);
    }

    result.add("support");
    result.add("agent");
  }

  if (normalized.some(isManagerRole)) {
    for (const role of MANAGER_ROLE_KEYS) {
      result.add(role);
    }

    result.add("manager");
  }

  if (normalized.some(isClientRole)) {
    for (const role of CLIENT_ROLE_KEYS) {
      result.add(role);
    }

    result.add("client");
    result.add("cliente");
  }

  if (normalized.some(isUserRole)) {
    for (const role of USER_ROLE_KEYS) {
      result.add(role);
    }

    result.add("user");
    result.add("usuario");
  }

  return Array.from(result)
    .filter(Boolean);
}

function resolveCanonicalRole(roles = []) {
  const expanded =
    expandRoleAliases(roles);

  if (expanded.some(isAdminRole)) {
    return "admin";
  }

  if (expanded.some(isSupportRole)) {
    return "support";
  }

  if (expanded.some(isManagerRole)) {
    return "manager";
  }

  if (expanded.some(isClientRole)) {
    return "client";
  }

  if (expanded.some(isUserRole)) {
    return "user";
  }

  return expanded[0] || null;
}

function collectRolesFromUser(user = null) {
  const current =
    safeObject(user);

  const raw =
    safeObject(current.raw);

  const profile =
    safeObject(current.profile);

  const meta =
    safeObject(current.meta);

  const claims =
    safeObject(current.claims);

  const account =
    safeObject(current.account);

  const roleCandidates = [
    current.role,
    current.rol,
    current.userRole,
    current.user_role,
    current.type,
    current.userType,
    current.user_type,
    current.perfil,

    profile.role,
    profile.rol,
    profile.userRole,
    profile.user_role,
    profile.type,
    profile.perfil,

    account.role,
    account.rol,
    account.userRole,
    account.type,

    meta.role,
    meta.rol,
    meta.userRole,

    claims.role,
    claims.rol,
    claims.userRole,
    claims["custom:role"],
    claims["https://onion/role"],

    raw.role,
    raw.rol,
    raw.userRole,
    raw.user_role,
    raw.type,
    raw.userType,
    raw.user_type,
    raw.perfil,

    raw?.profile?.role,
    raw?.profile?.rol,
    raw?.profile?.userRole,
    raw?.profile?.type,

    raw?.meta?.role,
    raw?.meta?.rol,

    raw?.claims?.role,
    raw?.claims?.rol,
    raw?.claims?.["custom:role"],
    raw?.claims?.["https://onion/role"],
  ];

  const roleArrays = [
    current.roles,
    current.roleList,
    current.role_list,
    current.permissions,
    current.scopes,
    current.groups,
    current.authorities,

    profile.roles,
    profile.permissions,
    profile.scopes,
    profile.groups,
    profile.authorities,

    account.roles,
    account.permissions,
    account.scopes,
    account.groups,

    meta.roles,
    meta.permissions,
    meta.scopes,
    meta.groups,

    claims.roles,
    claims.permissions,
    claims.scopes,
    claims.groups,

    raw.roles,
    raw.roleList,
    raw.role_list,
    raw.permissions,
    raw.scopes,
    raw.groups,
    raw.authorities,

    raw?.profile?.roles,
    raw?.profile?.permissions,
    raw?.profile?.scopes,

    raw?.meta?.roles,
    raw?.meta?.permissions,
    raw?.meta?.scopes,

    raw?.claims?.roles,
    raw?.claims?.permissions,
    raw?.claims?.scopes,
  ];

  const roles = [
    ...roleCandidates,
    ...roleArrays.flatMap((value) =>
      toArray(value)
    ),
  ];

  const adminFlag =
    [
      current.isAdmin,
      current.admin,
      current.isSuperAdmin,
      current.superAdmin,
      current.is_super_admin,
      current.canManageUsers,
      current.can_manage_users,
      current.canAccessUsers,
      current.can_access_users,

      profile.isAdmin,
      profile.admin,
      profile.isSuperAdmin,
      profile.superAdmin,
      profile.canManageUsers,
      profile.canAccessUsers,

      account.isAdmin,
      account.admin,
      account.isSuperAdmin,
      account.superAdmin,

      meta.isAdmin,
      meta.admin,
      meta.isSuperAdmin,
      meta.superAdmin,
      meta.canManageUsers,
      meta.canAccessUsers,

      claims.isAdmin,
      claims.admin,
      claims.isSuperAdmin,
      claims.superAdmin,
      claims.canManageUsers,
      claims.canAccessUsers,

      raw.isAdmin,
      raw.admin,
      raw.isSuperAdmin,
      raw.superAdmin,
      raw.canManageUsers,
      raw.canAccessUsers,

      raw?.profile?.isAdmin,
      raw?.profile?.admin,
      raw?.profile?.isSuperAdmin,
      raw?.profile?.superAdmin,

      raw?.meta?.isAdmin,
      raw?.meta?.admin,

      raw?.claims?.isAdmin,
      raw?.claims?.admin,
    ].some((value) => value === true);

  const supportFlag =
    [
      current.isSupport,
      current.support,
      current.isAgent,
      current.agent,
      current.isTechnician,
      current.technician,
      current.tecnico,
      current.técnico,

      profile.isSupport,
      profile.support,
      profile.isAgent,
      profile.agent,

      meta.isSupport,
      meta.support,
      meta.isAgent,
      meta.agent,

      raw.isSupport,
      raw.support,
      raw.isAgent,
      raw.agent,
      raw.isTechnician,
      raw.technician,
    ].some((value) => value === true);

  if (adminFlag) {
    roles.push("admin");
  }

  if (supportFlag) {
    roles.push("support");
  }

  return expandRoleAliases(roles);
}

function collectSessionRoles(session = {}) {
  const user =
    getUserFromSession(session);

  return expandRoleAliases([
    session.role,
    session.rol,
    session.userRole,
    session.user_role,
    session.roles,
    session.permissions,
    session.scopes,
    ...collectRolesFromUser(user),
  ]);
}

function collectPermissionsFromUser(user = null) {
  const current =
    safeObject(user);

  const raw =
    safeObject(current.raw);

  const profile =
    safeObject(current.profile);

  const meta =
    safeObject(current.meta);

  const claims =
    safeObject(current.claims);

  const account =
    safeObject(current.account);

  return unique([
    ...normalizeRoles(current.permissions),
    ...normalizeRoles(current.permisos),
    ...normalizeRoles(current.scopes),
    ...normalizeRoles(current.authorities),
    ...normalizeRoles(current.claims),

    ...normalizeRoles(profile.permissions),
    ...normalizeRoles(profile.permisos),
    ...normalizeRoles(profile.scopes),
    ...normalizeRoles(profile.authorities),

    ...normalizeRoles(account.permissions),
    ...normalizeRoles(account.permisos),
    ...normalizeRoles(account.scopes),

    ...normalizeRoles(meta.permissions),
    ...normalizeRoles(meta.permisos),
    ...normalizeRoles(meta.scopes),

    ...normalizeRoles(claims.permissions),
    ...normalizeRoles(claims.permisos),
    ...normalizeRoles(claims.scopes),

    ...normalizeRoles(raw.permissions),
    ...normalizeRoles(raw.permisos),
    ...normalizeRoles(raw.scopes),
    ...normalizeRoles(raw.authorities),

    ...normalizeRoles(raw?.profile?.permissions),
    ...normalizeRoles(raw?.profile?.permisos),
    ...normalizeRoles(raw?.profile?.scopes),

    ...normalizeRoles(raw?.meta?.permissions),
    ...normalizeRoles(raw?.meta?.permisos),
    ...normalizeRoles(raw?.meta?.scopes),

    ...normalizeRoles(raw?.claims?.permissions),
    ...normalizeRoles(raw?.claims?.permisos),
    ...normalizeRoles(raw?.claims?.scopes),
  ]);
}

/* =========================================================
   UI NORMALIZATION
========================================================= */

function normalizeTheme(value = "") {
  const theme =
    safeLower(value, "");

  if (theme === "light") {
    return "light";
  }

  if (theme === "dark") {
    return "dark";
  }

  if (theme === "system") {
    return "system";
  }

  return "";
}

function getSystemThemeFallback() {
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      return window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches
        ? "dark"
        : "light";
    }
  } catch {}

  return "light";
}

function normalizeLang(value = "") {
  const lang =
    safeLower(value, "")
      .replace(/_/g, "-");

  if (!lang) {
    return "";
  }

  const firstPart =
    lang.split("-")[0];

  if (
    firstPart === "spa" ||
    firstPart === "spanish" ||
    firstPart === "castellano"
  ) {
    return "es";
  }

  if (
    firstPart === "eng" ||
    firstPart === "english"
  ) {
    return "en";
  }

  if (
    firstPart === "cat" ||
    firstPart === "catalan" ||
    firstPart === "català" ||
    firstPart === "catalán"
  ) {
    return "ca";
  }

  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(lang)
    ? lang
    : "";
}

/* =========================================================
   COLLECTION HELPERS
========================================================= */

function safeEnsureCollectionKey(state, key) {
  const rawKey =
    safeText(key, "");

  if (!rawKey) {
    return "";
  }

  try {
    return ensureCollectionKey(
      state,
      rawKey
    );
  } catch {
    return rawKey;
  }
}

function getEntityId(entity = null) {
  const item =
    safeObject(entity);

  for (const key of ENTITY_ID_KEYS) {
    const value =
      safeText(item?.[key], "");

    if (value) {
      return value;
    }
  }

  return "";
}

function compareEntityId(entity = null, id = "") {
  const target =
    safeText(id, "");

  if (!target) {
    return false;
  }

  const item =
    safeObject(entity);

  return ENTITY_ID_KEYS.some((key) =>
    safeText(item?.[key], "") === target
  );
}

function normalizeCollectionValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) =>
      clone(item)
    );
  }

  return clone(value);
}

/* =========================================================
   FACTORY
========================================================= */

export function createSelectors({
  AppCore,
  state,
} = {}) {
  const rootState =
    state || {};

  function app() {
    return getAppSlice(rootState);
  }

  function session() {
    return getSessionSlice(rootState);
  }

  function ui() {
    return getUiSlice(rootState);
  }

  function entities() {
    return getEntitiesSlice(rootState);
  }

  function flags() {
    return getFlagsSlice(rootState);
  }

  function meta() {
    return getMetaSlice(rootState);
  }

  function cloneUser() {
    const user =
      getUserFromSession(session());

    return hasUsableUser(user)
      ? clone(user)
      : null;
  }

  function currentTokenValue() {
    return getTokenFromSession(
      session()
    );
  }

  function authenticatedStrict() {
    const currentSession =
      session();

    const token =
      currentTokenValue();

    const user =
      getUserFromSession(
        currentSession
      );

    return Boolean(
      currentSession.authenticated === true &&
        hasUsableToken(token) &&
        hasUsableUser(user)
    );
  }

  function currentRolesValue() {
    if (!authenticatedStrict()) {
      return [];
    }

    return collectSessionRoles(
      session()
    );
  }

  function currentRoleValue() {
    if (!authenticatedStrict()) {
      return null;
    }

    return resolveCanonicalRole(
      currentRolesValue()
    );
  }

  function currentPermissionsValue() {
    if (!authenticatedStrict()) {
      return [];
    }

    return collectPermissionsFromUser(
      getUserFromSession(
        session()
      )
    );
  }

  function hasRoleSelector(...roles) {
    if (!authenticatedStrict()) {
      return false;
    }

    const allowed =
      expandRoleAliases(
        roles.flat()
      );

    if (!allowed.length) {
      return true;
    }

    const current =
      new Set(
        currentRolesValue()
      );

    return allowed.some((role) =>
      current.has(role)
    );
  }

  function hasAllRolesSelector(roles = []) {
    if (!authenticatedStrict()) {
      return false;
    }

    const required =
      expandRoleAliases(
        toArray(roles).flat()
      );

    if (!required.length) {
      return true;
    }

    const current =
      new Set(
        currentRolesValue()
      );

    return required.every((role) =>
      current.has(role)
    );
  }

  function hasPermissionSelector(...permissions) {
    if (!authenticatedStrict()) {
      return false;
    }

    const required =
      normalizeRoles(
        permissions.flat()
      );

    if (!required.length) {
      return true;
    }

    const current =
      new Set(
        currentPermissionsValue()
      );

    return required.some((permission) =>
      current.has(permission)
    );
  }

  function getCollectionRaw(key) {
    const finalKey =
      safeEnsureCollectionKey(
        rootState,
        key
      );

    if (!finalKey) {
      return undefined;
    }

    return entities()[finalKey];
  }

  function getCollection(key) {
    return normalizeCollectionValue(
      getCollectionRaw(key)
    );
  }

  function getCollectionList(key) {
    const value =
      getCollectionRaw(key);

    return Array.isArray(value)
      ? value
      : [];
  }

  function currentThemeValue() {
    const fromState =
      normalizeTheme(
        ui().theme
      );

    const fromCore =
      normalizeTheme(
        AppCore?.state?.theme
      );

    const fromConfig =
      normalizeTheme(
        AppCore?.config?.defaultTheme
      );

    const resolved =
      fromState ||
      fromCore ||
      fromConfig ||
      getSystemThemeFallback();

    return resolved === "system"
      ? getSystemThemeFallback()
      : resolved;
  }

  function currentThemePreferenceValue() {
    return (
      normalizeTheme(ui().themePreference) ||
      normalizeTheme(ui().themeMode) ||
      normalizeTheme(AppCore?.state?.themeMode) ||
      normalizeTheme(AppCore?.state?.appearance) ||
      normalizeTheme(AppCore?.config?.defaultTheme) ||
      "system"
    );
  }

  function currentLangValue() {
    return (
      normalizeLang(ui().lang) ||
      normalizeLang(AppCore?.state?.lang) ||
      normalizeLang(AppCore?.config?.defaultLang) ||
      "es"
    );
  }

  function getAppName() {
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
      const current =
        app();

      return Boolean(
        current.ready &&
          current.booted
      );
    },

    isInitialized() {
      return Boolean(
        app().initialized
      );
    },

    isBooting() {
      return Boolean(
        app().booting
      );
    },

    isLoading() {
      return Boolean(
        app().loading
      );
    },

    isFatal() {
      return Boolean(
        app().fatal ||
          app().appFatal
      );
    },

    lastError() {
      const error =
        app().lastError ||
        app().error ||
        null;

      return error
        ? clone(error)
        : null;
    },

    currentRoute() {
      return (
        safeText(
          app().route,
          "/"
        ) || "/"
      );
    },

    currentCanonicalPath() {
      return (
        safeText(
          app().canonicalPath,
          ""
        ) ||
        selectors.currentRoute()
      );
    },

    currentPublicPath() {
      return (
        safeText(
          app().publicPath,
          ""
        ) ||
        selectors.currentRoute()
      );
    },

    routeSnapshot() {
      return {
        route:
          selectors.currentRoute(),

        canonicalPath:
          selectors.currentCanonicalPath(),

        publicPath:
          redactTokenInText(
            selectors.currentPublicPath()
          ),
      };
    },

    appSnapshot() {
      return {
        ...clone(app()),

        route:
          selectors.currentRoute(),

        canonicalPath:
          selectors.currentCanonicalPath(),

        publicPath:
          redactTokenInText(
            selectors.currentPublicPath()
          ),
      };
    },

    /* =====================================
       SESSION
    ===================================== */

    isAuthenticated() {
      return authenticatedStrict();
    },

    hasToken() {
      return hasUsableToken(
        currentTokenValue()
      );
    },

    hasUser() {
      return hasUsableUser(
        getUserFromSession(
          session()
        )
      );
    },

    currentUser() {
      return cloneUser();
    },

    currentUserRaw() {
      return getUserFromSession(
        session()
      );
    },

    currentUserIdentity() {
      return getUserIdentity(
        getUserFromSession(
          session()
        )
      ) || null;
    },

    currentUserId() {
      const user =
        getUserFromSession(
          session()
        );

      return (
        safeText(user?.userId, "") ||
        safeText(user?.user_id, "") ||
        safeText(user?.id, "") ||
        safeText(user?._id, "") ||
        safeText(user?.uid, "") ||
        null
      );
    },

    currentUsername() {
      const user =
        getUserFromSession(
          session()
        );

      return getUserUsername(user) || null;
    },

    currentDisplayName() {
      const user =
        getUserFromSession(
          session()
        );

      return hasUsableUser(user)
        ? getUserDisplayName(user)
        : null;
    },

    currentAvatar() {
      const user =
        getUserFromSession(
          session()
        );

      const avatar =
        getUserAvatar(user);

      return avatar || null;
    },

    currentRole() {
      return currentRoleValue();
    },

    currentRoles() {
      return [
        ...currentRolesValue(),
      ];
    },

    currentPermissions() {
      return [
        ...currentPermissionsValue(),
      ];
    },

    isAdmin() {
      return currentRolesValue()
        .some(isAdminRole);
    },

    isSupport() {
      return currentRolesValue()
        .some(isSupportRole);
    },

    isManager() {
      return currentRolesValue()
        .some(isManagerRole);
    },

    isClient() {
      return currentRolesValue()
        .some(isClientRole);
    },

    isUser() {
      return currentRolesValue()
        .some(isUserRole);
    },

    hasRole(...roles) {
      return hasRoleSelector(
        ...roles
      );
    },

    hasAnyRole(roles = []) {
      return hasRoleSelector(
        ...toArray(roles).flat()
      );
    },

    hasAllRoles(roles = []) {
      return hasAllRolesSelector(
        roles
      );
    },

    hasPermission(...permissions) {
      return hasPermissionSelector(
        ...permissions
      );
    },

    hasAnyPermission(permissions = []) {
      return hasPermissionSelector(
        ...toArray(permissions).flat()
      );
    },

    hasAllPermissions(permissions = []) {
      if (!authenticatedStrict()) {
        return false;
      }

      const required =
        normalizeRoles(
          toArray(permissions).flat()
        );

      if (!required.length) {
        return true;
      }

      const current =
        new Set(
          currentPermissionsValue()
        );

      return required.every((permission) =>
        current.has(permission)
      );
    },

    token() {
      const token =
        currentTokenValue();

      return hasUsableToken(token)
        ? token
        : null;
    },

    authHeader() {
      const token =
        selectors.token();

      const headerName =
        safeText(
          AppCore?.config?.auth?.tokenHeader,
          "Authorization"
        );

      const bearerPrefix =
        safeText(
          AppCore?.config?.auth?.bearerPrefix,
          "Bearer"
        );

      return token
        ? {
            [headerName]: `${bearerPrefix} ${token}`,
          }
        : {};
    },

    sessionSnapshot(options = {}) {
      const opts =
        safeObject(options);

      const rawToken =
        selectors.token();

      const exposeToken =
        opts.includeToken === true;

      return {
        version:
          STORE_SELECTORS_VERSION,

        authenticated:
          authenticatedStrict(),

        hasToken:
          Boolean(rawToken),

        token:
          exposeToken
            ? rawToken
            : null,

        accessToken:
          exposeToken
            ? rawToken
            : null,

        user:
          cloneUser(),

        role:
          currentRoleValue(),

        roles:
          currentRolesValue(),

        permissions:
          currentPermissionsValue(),

        isAdmin:
          selectors.isAdmin(),

        isSupport:
          selectors.isSupport(),

        isManager:
          selectors.isManager(),

        isClient:
          selectors.isClient(),

        isUser:
          selectors.isUser(),

        userIdentity:
          selectors.currentUserIdentity(),

        userId:
          selectors.currentUserId(),

        username:
          selectors.currentUsername(),

        displayName:
          selectors.currentDisplayName(),

        avatar:
          selectors.currentAvatar(),

        raw:
          opts.includeRaw === true
            ? clone(session())
            : null,

        at:
          safeNowIso(),
      };
    },

    /* =====================================
       UI
    ===================================== */

    currentTheme() {
      return currentThemeValue();
    },

    themePreference() {
      return currentThemePreferenceValue();
    },

    currentLang() {
      return currentLangValue();
    },

    isSidebarOpen() {
      return Boolean(
        ui().sidebarOpen
      );
    },

    pageTitle() {
      return (
        safeText(
          ui().pageTitle,
          ""
        ) ||
        getAppName()
      );
    },

    topbarTitle() {
      return (
        safeText(
          ui().topbarTitle,
          ""
        ) ||
        safeText(
          ui().pageTitle,
          ""
        ) ||
        getAppName()
      );
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
      const opts =
        safeObject(options);

      return {
        theme:
          selectors.currentTheme(),

        themePreference:
          selectors.themePreference(),

        lang:
          selectors.currentLang(),

        sidebarOpen:
          selectors.isSidebarOpen(),

        density:
          selectors.density(),

        pageTitle:
          selectors.pageTitle(),

        topbarTitle:
          selectors.topbarTitle(),

        raw:
          opts.includeRaw === true
            ? clone(ui())
            : null,
      };
    },

    /* =====================================
       FLAGS
    ===================================== */

    flag(key, fallback = false) {
      const name =
        safeText(key, "");

      if (!name) {
        return fallback;
      }

      if (!hasOwn(flags(), name)) {
        return fallback;
      }

      return Boolean(
        flags()[name]
      );
    },

    flags() {
      return clone(flags());
    },

    isHydrating() {
      return selectors.flag(
        "hydrating",
        false
      );
    },

    isFetching(key = "") {
      const clean =
        safeText(key, "");

      if (!clean) {
        return false;
      }

      const direct =
        `fetching${clean[0]?.toUpperCase() || ""}${clean.slice(1)}`;

      return selectors.flag(
        direct,
        false
      );
    },

    /* =====================================
       ENTITIES
    ===================================== */

    collection(key) {
      return getCollection(key);
    },

    collectionRaw(key) {
      return getCollectionRaw(key);
    },

    collectionList(key) {
      return getCollectionList(key)
        .map((item) =>
          clone(item)
        );
    },

    count(key) {
      const value =
        getCollectionRaw(key);

      if (Array.isArray(value)) {
        return value.length;
      }

      return value
        ? 1
        : 0;
    },

    isEmpty(key) {
      return selectors.count(key) === 0;
    },

    first(key) {
      const value =
        getCollectionRaw(key);

      if (Array.isArray(value)) {
        return value.length
          ? clone(value[0])
          : null;
      }

      return value
        ? clone(value)
        : null;
    },

    last(key) {
      const value =
        getCollectionRaw(key);

      if (Array.isArray(value)) {
        return value.length
          ? clone(value[value.length - 1])
          : null;
      }

      return value
        ? clone(value)
        : null;
    },

    find(key, predicate) {
      const list =
        getCollectionRaw(key);

      if (
        !Array.isArray(list) ||
        !isFunction(predicate)
      ) {
        return null;
      }

      for (let index = 0; index < list.length; index += 1) {
        const item =
          list[index];

        let matched =
          false;

        try {
          matched =
            Boolean(
              predicate(
                clone(item),
                index,
                clone(list)
              )
            );
        } catch {
          matched =
            false;
        }

        if (matched) {
          return clone(item);
        }
      }

      return null;
    },

    filter(key, predicate) {
      const list =
        getCollectionRaw(key);

      if (
        !Array.isArray(list) ||
        !isFunction(predicate)
      ) {
        return [];
      }

      const output =
        [];

      for (let index = 0; index < list.length; index += 1) {
        const item =
          list[index];

        let matched =
          false;

        try {
          matched =
            Boolean(
              predicate(
                clone(item),
                index,
                clone(list)
              )
            );
        } catch {
          matched =
            false;
        }

        if (matched) {
          output.push(
            clone(item)
          );
        }
      }

      return output;
    },

    map(key, mapper) {
      const list =
        getCollectionRaw(key);

      if (
        !Array.isArray(list) ||
        !isFunction(mapper)
      ) {
        return [];
      }

      return list.map((entry, index) => {
        try {
          return clone(
            mapper(
              clone(entry),
              index,
              clone(list)
            )
          );
        } catch {
          return null;
        }
      });
    },

    byId(key, id) {
      const targetId =
        safeText(id, "");

      if (!targetId) {
        return null;
      }

      return selectors.find(
        key,
        (item) =>
          compareEntityId(
            item,
            targetId
          )
      );
    },

    ids(key) {
      const list =
        getCollectionRaw(key);

      if (!Array.isArray(list)) {
        const id =
          getEntityId(list);

        return id
          ? [id]
          : [];
      }

      return list
        .map(getEntityId)
        .filter(Boolean);
    },

    entityMap(key) {
      const list =
        getCollectionRaw(key);

      const map =
        new Map();

      if (!Array.isArray(list)) {
        const id =
          getEntityId(list);

        if (id) {
          map.set(
            id,
            clone(list)
          );
        }

        return map;
      }

      for (const item of list) {
        const id =
          getEntityId(item);

        if (id) {
          map.set(
            id,
            clone(item)
          );
        }
      }

      return map;
    },

    entitiesSnapshot() {
      return clone(
        entities()
      );
    },

    incidencias() {
      return selectors.collectionList(
        "incidencias"
      );
    },

    tickets() {
      return selectors.collectionList(
        "incidencias"
      );
    },

    facturas() {
      return selectors.collectionList(
        "facturas"
      );
    },

    usuarios() {
      return selectors.collectionList(
        "usuarios"
      );
    },

    clientes() {
      return selectors.collectionList(
        "clientes"
      );
    },

    recientes() {
      return selectors.collectionList(
        "recientes"
      );
    },

    dashboard() {
      return clone(
        entities().dashboard || null
      );
    },

    /* =====================================
       META
    ===================================== */

    meta() {
      return clone(meta());
    },

    hydrated() {
      return Boolean(
        meta().hydrated
      );
    },

    revision() {
      return safeNumber(
        meta().revision,
        0
      );
    },

    createdAt() {
      return (
        meta().createdAt ||
        null
      );
    },

    updatedAt() {
      return (
        meta().updatedAt ||
        null
      );
    },

    /* =====================================
       FULL SNAPSHOT
    ===================================== */

    snapshot(options = {}) {
      const opts =
        safeObject(options);

      return {
        version:
          STORE_SELECTORS_VERSION,

        app:
          selectors.appSnapshot(),

        session:
          selectors.sessionSnapshot({
            includeToken:
              opts.includeToken === true,
            includeRaw:
              opts.includeRawSession === true,
          }),

        ui:
          selectors.uiSnapshot({
            includeRaw:
              opts.includeRawUi === true,
          }),

        flags:
          clone(flags()),

        entities:
          opts.includeEntities === false
            ? null
            : clone(entities()),

        meta:
          clone(meta()),

        at:
          safeNowIso(),
      };
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
