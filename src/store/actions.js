/* =========================================================
   Onion SPA - Store Actions
   Archivo: src/store/actions.js

   ONION SUPPORT · STORE ACTIONS
   SEMANTIC MUTATIONS · STRICT SESSION · COLLECTION SAFE · 14/10

   Responsabilidades:
   - exponer acciones semánticas del store
   - agrupar mutaciones de app / session / ui / flags
   - centralizar operaciones sobre colecciones
   - hidratar slices desde AppCore
   - validaciones defensivas
   - evitar estados session fantasma
   - normalizar theme/lang/route antes de guardar
   - mantener Store sincronizable con AppCore sin romper si AppCore es parcial
   - conservar contrato con selectors/core-sync/index
   - devolver resultados estables

   HARDENING EXTREMO:
   - authenticated sólo true con token usable + user usable + user activo
   - token/accessToken coherentes
   - refresh/session context persistente dentro del slice session
   - role/roles/permisos normalizados y sin acentos
   - hydrateFromCore tolerante a AppCore parcial
   - colecciones siempre normalizadas
   - ensureCollectionKey siempre respetado
   - flags saneados
   - rutas visibles preservan query/hash cuando proceda
   - route canónica sin query/hash cuando aplica
   - cero throws accidentales salvo uso incorrecto real
========================================================= */

import {
  deepClone,
  isFunction,
  normalizeCollection,
} from "./helpers.js";

import {
  ensureCollectionKey,
  normalizeMatcher,
} from "./collections.js";

import {
  safeTitle,
  safeTopbarTitle,
} from "./state.js";

/* =========================================================
   VERSION
========================================================= */

export const STORE_ACTIONS_VERSION =
  "14.0.0";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_ROUTE =
  "/";

const DEFAULT_LANG =
  "es";

const DEFAULT_THEME =
  "system";

const APP_NAME_FALLBACK =
  "Onion Support";

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

const ADMIN_ROLE_KEYS =
  new Set([
    "admin",
    "administrator",
    "administrador",
    "superadmin",
    "super_admin",
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
    "particular",
    "empresa",
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

const DEFAULT_ENTITY_KEYS =
  Object.freeze([
    "incidencias",
    "facturas",
    "usuarios",
    "clientes",
    "recientes",
  ]);

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

function cloneIfAny(value, fallback = null) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
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

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

/* =========================================================
   APPCORE SAFE
========================================================= */

function getCoreState(AppCore) {
  try {
    if (
      AppCore &&
      typeof AppCore.state === "object"
    ) {
      return AppCore.state;
    }
  } catch {}

  return {};
}

function getConfig(AppCore) {
  try {
    if (
      AppCore &&
      typeof AppCore.config === "object"
    ) {
      return AppCore.config;
    }
  } catch {}

  return {};
}

function getAppName(AppCore) {
  return (
    safeText(getConfig(AppCore).appName, "") ||
    safeText(getConfig(AppCore).name, "") ||
    APP_NAME_FALLBACK
  );
}

function getDefaultTheme(AppCore) {
  return normalizeTheme(
    first(
      getConfig(AppCore).defaultTheme,
      getConfig(AppCore).ui?.defaultTheme,
      getCoreState(AppCore).theme,
      DEFAULT_THEME
    )
  );
}

function getDefaultLang(AppCore) {
  return normalizeLang(
    first(
      getConfig(AppCore).defaultLang,
      getConfig(AppCore).i18n?.defaultLang,
      getCoreState(AppCore).lang,
      DEFAULT_LANG
    )
  );
}

function safeResolveTitle(AppCore) {
  try {
    return safeText(
      safeTitle(AppCore),
      getAppName(AppCore)
    );
  } catch {
    return getAppName(AppCore);
  }
}

function safeResolveTopbarTitle(AppCore) {
  try {
    return safeText(
      safeTopbarTitle(AppCore),
      safeResolveTitle(AppCore)
    );
  } catch {
    return safeResolveTitle(AppCore);
  }
}

function safeEmit(AppCore, eventName, payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(
      name,
      payload
    );

    return true;
  } catch {}

  return false;
}

/* =========================================================
   PATH NORMALIZERS
========================================================= */

function normalizeSearch(search = "") {
  const raw =
    safeText(search, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("?")
    ? raw
    : `?${raw.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const raw =
    safeText(hash, "");

  if (!raw) {
    return "";
  }

  return raw.startsWith("#")
    ? raw
    : `#${raw.replace(/^#+/, "")}`;
}

function splitFullPath(path = DEFAULT_ROUTE) {
  const raw =
    safeText(path, DEFAULT_ROUTE);

  let pathname =
    raw;

  let search =
    "";

  let hash =
    "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash =
      pathname.slice(hashIndex);

    pathname =
      pathname.slice(0, hashIndex) ||
      DEFAULT_ROUTE;
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) ||
      DEFAULT_ROUTE;
  }

  return {
    pathname,
    search:
      normalizeSearch(search),
    hash:
      normalizeHash(hash),
  };
}

function normalizePathname(pathname = DEFAULT_ROUTE) {
  let path =
    safeText(pathname, DEFAULT_ROUTE)
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!path.startsWith("/")) {
    path =
      `/${path}`;
  }

  const segments =
    path
      .split("/")
      .filter(Boolean);

  const normalized = [];

  for (const segment of segments) {
    if (segment === ".") {
      continue;
    }

    if (segment === "..") {
      normalized.pop();
      continue;
    }

    normalized.push(segment);
  }

  path =
    `/${normalized.join("/")}`;

  if (
    path.length > 1 &&
    path.endsWith("/")
  ) {
    path =
      path.replace(/\/+$/g, "") ||
      DEFAULT_ROUTE;
  }

  return path || DEFAULT_ROUTE;
}

function normalizePathValue(value = DEFAULT_ROUTE) {
  const {
    pathname,
    search,
    hash,
  } = splitFullPath(
    safeText(value, DEFAULT_ROUTE)
  );

  return `${normalizePathname(pathname)}${search}${hash}`;
}

function normalizeCanonicalRoute(value = DEFAULT_ROUTE) {
  const normalized =
    normalizePathValue(value);

  const { pathname } =
    splitFullPath(normalized);

  const withoutUser =
    normalizePathname(pathname).replace(
      /^\/@[^/]+(?=\/|$)/i,
      ""
    ) || DEFAULT_ROUTE;

  const canonical =
    normalizePathname(withoutUser);

  if (
    canonical === "/activate-account" ||
    canonical.startsWith("/activate-account/")
  ) {
    return "/activate-account";
  }

  if (
    canonical === "/reset-password/confirm" ||
    canonical.startsWith("/reset-password/confirm/")
  ) {
    return "/reset-password/confirm";
  }

  return canonical;
}

/* =========================================================
   THEME / LANG / ROLE NORMALIZERS
========================================================= */

function normalizeTheme(theme = DEFAULT_THEME) {
  const value =
    safeLower(theme, DEFAULT_THEME);

  if (value === "dark") {
    return "dark";
  }

  if (value === "light") {
    return "light";
  }

  if (
    value === "system" ||
    value === "auto" ||
    value === "browser" ||
    value === "os" ||
    value === "device"
  ) {
    return "system";
  }

  return DEFAULT_THEME;
}

function normalizeLang(lang = DEFAULT_LANG) {
  const value =
    safeLower(lang, DEFAULT_LANG)
      .replace(/_/g, "-");

  const firstPart =
    value.split("-")[0] || value;

  if (
    firstPart === "spa" ||
    firstPart === "spanish" ||
    firstPart === "castellano" ||
    firstPart === "español"
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

  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(value)
    ? value
    : DEFAULT_LANG;
}

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

function expandRoleAliases(roles = []) {
  const normalized =
    normalizeRoles(roles);

  const result =
    new Set(normalized);

  if (
    normalized.some((role) =>
      ADMIN_ROLE_KEYS.has(role)
    )
  ) {
    for (const role of ADMIN_ROLE_KEYS) {
      result.add(role);
    }

    result.add("admin");
  }

  if (
    normalized.some((role) =>
      SUPPORT_ROLE_KEYS.has(role)
    )
  ) {
    for (const role of SUPPORT_ROLE_KEYS) {
      result.add(role);
    }

    result.add("support");
    result.add("agent");
  }

  if (
    normalized.some((role) =>
      MANAGER_ROLE_KEYS.has(role)
    )
  ) {
    for (const role of MANAGER_ROLE_KEYS) {
      result.add(role);
    }

    result.add("manager");
  }

  if (
    normalized.some((role) =>
      CLIENT_ROLE_KEYS.has(role)
    )
  ) {
    for (const role of CLIENT_ROLE_KEYS) {
      result.add(role);
    }

    result.add("client");
    result.add("cliente");
  }

  return Array.from(result)
    .filter(Boolean);
}

function resolveCanonicalRole(roles = []) {
  const expanded =
    expandRoleAliases(roles);

  if (
    expanded.some((role) =>
      ADMIN_ROLE_KEYS.has(role)
    )
  ) {
    return "admin";
  }

  if (
    expanded.some((role) =>
      SUPPORT_ROLE_KEYS.has(role)
    )
  ) {
    return "support";
  }

  if (
    expanded.some((role) =>
      MANAGER_ROLE_KEYS.has(role)
    )
  ) {
    return "manager";
  }

  if (
    expanded.some((role) =>
      CLIENT_ROLE_KEYS.has(role)
    )
  ) {
    return "client";
  }

  return expanded[0] || null;
}

/* =========================================================
   USER / TOKEN NORMALIZATION
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

function normalizeTokenValue(token = null) {
  const clean =
    stripBearerPrefix(token);

  return hasUsableToken(clean)
    ? clean
    : null;
}

function isDisabledUser(user = null) {
  const value =
    safeObject(user);

  const status =
    safeLower(
      first(
        value.status,
        value.estado,
        value.state,
        value.accountStatus,
        value.account_status,
        value.raw?.status,
        value.raw?.estado
      ),
      ""
    );

  if (DISABLED_STATUS_KEYS.has(status)) {
    return true;
  }

  return Boolean(
    value.active === false ||
      value.enabled === false ||
      value.isEnabled === false ||
      value.disabled === true ||
      value.isDisabled === true ||
      value.deleted === true ||
      value.isDeleted === true ||
      value.blocked === true ||
      value.isBlocked === true ||
      value.banned === true ||
      value.suspended === true ||
      value.revoked === true ||
      value.deactivated === true ||
      value.deletedAt ||
      value.disabledAt ||
      value.blockedAt
  );
}

function hasUsableUser(user = null) {
  const value =
    safeObject(user);

  if (!value || isDisabledUser(value)) {
    return false;
  }

  return Boolean(
    safeText(value.id, "") ||
      safeText(value.userId, "") ||
      safeText(value.user_id, "") ||
      safeText(value._id, "") ||
      safeText(value.uid, "") ||
      safeText(value.sub, "") ||
      safeText(value.username, "") ||
      safeText(value.userName, "") ||
      safeText(value.user_name, "") ||
      safeText(value.email, "") ||
      safeText(value.mail, "") ||
      safeText(value.phone, "") ||
      safeText(value.telefono, "") ||
      safeText(value.mobile, "")
  );
}

function normalizeUserValue(user = null) {
  const candidate =
    user
      ? cloneIfAny(user)
      : null;

  return hasUsableUser(candidate)
    ? candidate
    : null;
}

function collectUserRoles(user = null) {
  const cleanUser =
    safeObject(user);

  const raw =
    safeObject(cleanUser.raw);

  const profile =
    safeObject(cleanUser.profile);

  const meta =
    safeObject(cleanUser.meta);

  const claims =
    safeObject(cleanUser.claims);

  const roles = [
    cleanUser.role,
    cleanUser.rol,
    cleanUser.userRole,
    cleanUser.user_role,
    cleanUser.type,
    cleanUser.userType,
    cleanUser.user_type,
    cleanUser.perfil,
    cleanUser.roles,
    cleanUser.permissions,
    cleanUser.scopes,

    profile.role,
    profile.rol,
    profile.userRole,
    profile.type,
    profile.roles,
    profile.permissions,
    profile.scopes,

    meta.role,
    meta.rol,
    meta.roles,
    meta.permissions,
    meta.scopes,

    claims.role,
    claims.rol,
    claims.roles,
    claims.permissions,
    claims.scopes,

    raw.role,
    raw.rol,
    raw.userRole,
    raw.user_role,
    raw.type,
    raw.userType,
    raw.user_type,
    raw.perfil,
    raw.roles,
    raw.permissions,
    raw.scopes,
    raw?.profile?.role,
    raw?.profile?.roles,
    raw?.meta?.role,
    raw?.meta?.roles,
    raw?.claims?.role,
    raw?.claims?.roles,
  ];

  if (
    cleanUser.isAdmin === true ||
    cleanUser.admin === true ||
    cleanUser.isSuperAdmin === true ||
    raw.isAdmin === true ||
    raw.admin === true
  ) {
    roles.push("admin");
  }

  if (
    cleanUser.isSupport === true ||
    cleanUser.support === true ||
    cleanUser.isAgent === true ||
    cleanUser.agent === true ||
    raw.isSupport === true ||
    raw.support === true ||
    raw.isAgent === true
  ) {
    roles.push("support");
  }

  return expandRoleAliases(roles);
}

function collectUserPermissions(user = null) {
  const cleanUser =
    safeObject(user);

  const raw =
    safeObject(cleanUser.raw);

  const profile =
    safeObject(cleanUser.profile);

  const meta =
    safeObject(cleanUser.meta);

  const claims =
    safeObject(cleanUser.claims);

  return unique([
    ...normalizeRoles(cleanUser.permissions),
    ...normalizeRoles(cleanUser.permisos),
    ...normalizeRoles(cleanUser.scopes),
    ...normalizeRoles(cleanUser.authorities),

    ...normalizeRoles(profile.permissions),
    ...normalizeRoles(profile.permisos),
    ...normalizeRoles(profile.scopes),

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

function normalizeSessionPatch({
  state,
  authenticated = undefined,
  token = undefined,
  accessToken = undefined,
  refreshToken = undefined,
  tempToken = undefined,
  sessionId = undefined,
  sessionUserId = undefined,
  user = undefined,
  role = undefined,
  roles = undefined,
  permissions = undefined,
} = {}) {
  const currentSession =
    safeObject(state?.session);

  const incomingToken =
    token !== undefined
      ? token
      : accessToken !== undefined
        ? accessToken
        : first(
            currentSession.token,
            currentSession.accessToken,
            null
          );

  const finalToken =
    normalizeTokenValue(incomingToken);

  const finalUser =
    user !== undefined
      ? normalizeUserValue(user)
      : normalizeUserValue(currentSession.user);

  const usableToken =
    Boolean(finalToken);

  const usableUser =
    Boolean(finalUser);

  const finalAuthenticated =
    authenticated === false
      ? false
      : Boolean(
          usableToken &&
            usableUser
        );

  const userRoles =
    finalUser
      ? collectUserRoles(finalUser)
      : [];

  const explicitRoles =
    normalizeRoles(
      first(
        roles,
        currentSession.roles,
        []
      )
    );

  const mergedRoles =
    finalAuthenticated
      ? expandRoleAliases([
          explicitRoles,
          userRoles,
          role,
          currentSession.role,
        ])
      : [];

  const finalRole =
    finalAuthenticated
      ? (
          resolveCanonicalRole([
            role,
            currentSession.role,
            mergedRoles,
          ]) || null
        )
      : null;

  const mergedPermissions =
    finalAuthenticated
      ? unique([
          ...normalizeRoles(currentSession.permissions),
          ...normalizeRoles(permissions),
          ...collectUserPermissions(finalUser),
        ])
      : [];

  return {
    authenticated:
      finalAuthenticated,

    token:
      finalAuthenticated
        ? finalToken
        : null,

    accessToken:
      finalAuthenticated
        ? finalToken
        : null,

    refreshToken:
      refreshToken !== undefined
        ? normalizeTokenValue(refreshToken)
        : normalizeTokenValue(currentSession.refreshToken),

    tempToken:
      tempToken !== undefined
        ? normalizeTokenValue(tempToken)
        : normalizeTokenValue(currentSession.tempToken),

    sessionId:
      sessionId !== undefined
        ? safeText(sessionId, "") || null
        : currentSession.sessionId || null,

    sessionUserId:
      sessionUserId !== undefined
        ? safeText(sessionUserId, "") || null
        : currentSession.sessionUserId || null,

    user:
      finalAuthenticated
        ? finalUser
        : null,

    role:
      finalRole,

    roles:
      mergedRoles,

    permissions:
      mergedPermissions,

    isAdmin:
      mergedRoles.some((item) =>
        ADMIN_ROLE_KEYS.has(item)
      ),

    isSupport:
      mergedRoles.some((item) =>
        SUPPORT_ROLE_KEYS.has(item)
      ),

    isManager:
      mergedRoles.some((item) =>
        MANAGER_ROLE_KEYS.has(item)
      ),

    isClient:
      mergedRoles.some((item) =>
        CLIENT_ROLE_KEYS.has(item)
      ),
  };
}

function normalizeFlagKey(flag = "") {
  const value =
    safeText(flag, "");

  if (!value) {
    return "";
  }

  return value
    .replace(/^\.+|\.+$/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.:-]/g, "");
}

/* =========================================================
   COLLECTION HELPERS
========================================================= */

function safeEnsureCollectionKey(state, key) {
  const rawKey =
    safeText(key, "");

  if (!rawKey) {
    throw new Error(
      "Store collection key requerido."
    );
  }

  try {
    return ensureCollectionKey(
      state,
      rawKey
    );
  } catch {
    if (!state.entities) {
      state.entities = {};
    }

    if (!Array.isArray(state.entities[rawKey])) {
      state.entities[rawKey] = [];
    }

    return rawKey;
  }
}

function getEntityId(item = null) {
  const source =
    safeObject(item);

  for (const key of ENTITY_ID_KEYS) {
    const value =
      safeText(source?.[key], "");

    if (value) {
      return value;
    }
  }

  return "";
}

function buildDefaultMatcher(item = null) {
  const nextId =
    getEntityId(item);

  if (!nextId) {
    return () => false;
  }

  return (current) =>
    getEntityId(current) === nextId;
}

function safeNormalizeMatcher(matcher, fallbackItem = null) {
  if (matcher) {
    try {
      return normalizeMatcher(matcher);
    } catch {}
  }

  return buildDefaultMatcher(fallbackItem);
}

function normalizeCollectionInput(items = []) {
  if (Array.isArray(items)) {
    return normalizeCollection(items);
  }

  if (
    items === null ||
    items === undefined
  ) {
    return [];
  }

  return normalizeCollection([
    items,
  ]);
}

function normalizeDashboardValue(value = null) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  return cloneIfAny(value);
}

function buildEmptyEntities(previous = {}) {
  const output = {};

  for (const key of DEFAULT_ENTITY_KEYS) {
    output[key] =
      [];
  }

  if (hasOwn(previous, "dashboard")) {
    output.dashboard =
      null;
  }

  return output;
}

/* =========================================================
   CORE HYDRATION HELPERS
========================================================= */

function getCoreToken(coreState = {}) {
  return first(
    coreState.token,
    coreState.accessToken,
    coreState.access_token,
    coreState.session?.token,
    coreState.session?.accessToken,
    coreState.session?.access_token,
    null
  );
}

function getCoreUser(coreState = {}) {
  return first(
    coreState.user,
    coreState.currentUser,
    coreState.sessionUser,
    coreState.authUser,
    coreState.account,
    coreState.profile,
    coreState.me,
    coreState.session?.user,
    coreState.session?.usuario,
    coreState.session?.me,
    null
  );
}

function getCoreRoute(coreState = {}) {
  return first(
    coreState.route,
    coreState.canonicalPath,
    coreState.session?.route,
    DEFAULT_ROUTE
  );
}

function getCorePublicPath(coreState = {}) {
  return first(
    coreState.publicPath,
    coreState.session?.publicPath,
    coreState.route,
    DEFAULT_ROUTE
  );
}

/* =========================================================
   FACTORY
========================================================= */

export function createActions({
  AppCore,
  state,
  set,
  patch,
  update,
} = {}) {
  if (
    !state ||
    typeof state !== "object"
  ) {
    throw new Error(
      "createActions requiere state válido."
    );
  }

  if (!isFunction(set)) {
    throw new Error(
      "createActions requiere set(path, value)."
    );
  }

  if (!isFunction(patch)) {
    throw new Error(
      "createActions requiere patch(partialState)."
    );
  }

  if (!isFunction(update)) {
    throw new Error(
      "createActions requiere update(path, updater)."
    );
  }

  /* =======================================================
     LOW LEVEL WRAPPERS
  ======================================================= */

  function setAppPatch(value = {}) {
    return patch({
      app: {
        ...safeObject(value),
      },
    });
  }

  function setSessionPatch(value = {}) {
    const sessionPatch =
      normalizeSessionPatch({
        state,
        ...safeObject(value),
      });

    return patch({
      session:
        sessionPatch,
    });
  }

  function getCurrentToken() {
    return first(
      state?.session?.token,
      state?.session?.accessToken,
      null
    );
  }

  function getCurrentUser() {
    return first(
      state?.session?.user,
      null
    );
  }

  function setUiPatch(value = {}) {
    return patch({
      ui: {
        ...safeObject(value),
      },
    });
  }

  function getCollectionPath(key) {
    const finalKey =
      safeEnsureCollectionKey(
        state,
        key
      );

    return {
      key:
        finalKey,
      path:
        `entities.${finalKey}`,
    };
  }

  /* =======================================================
     API
  ======================================================= */

  const api = {
    version:
      STORE_ACTIONS_VERSION,

    /* =====================================================
       APP
    ===================================================== */

    markReady(value = true) {
      const ready =
        Boolean(value);

      return setAppPatch({
        ready,

        loading:
          ready
            ? false
            : Boolean(state.app?.loading),

        booting:
          ready
            ? false
            : Boolean(state.app?.booting),
      });
    },

    markBooted(value = true) {
      const booted =
        Boolean(value);

      return setAppPatch({
        booted,

        booting:
          booted
            ? false
            : Boolean(state.app?.booting),

        loading:
          booted
            ? false
            : Boolean(state.app?.loading),
      });
    },

    setInitialized(value = true) {
      return set(
        "app.initialized",
        Boolean(value)
      );
    },

    setBooting(value = false) {
      const booting =
        Boolean(value);

      return setAppPatch({
        booting,

        loading:
          booting
            ? true
            : Boolean(state.app?.loading),
      });
    },

    setRoute(route = DEFAULT_ROUTE) {
      return set(
        "app.route",
        normalizeCanonicalRoute(route)
      );
    },

    setCanonicalPath(route = DEFAULT_ROUTE) {
      return api.setRoute(route);
    },

    setPublicPath(publicPath = DEFAULT_ROUTE) {
      return set(
        "app.publicPath",
        normalizePathValue(publicPath)
      );
    },

    setRouteSnapshot({
      route = undefined,
      canonicalPath = undefined,
      publicPath = undefined,
    } = {}) {
      const nextRoute =
        normalizeCanonicalRoute(
          first(
            route,
            canonicalPath,
            publicPath,
            state.app?.route,
            DEFAULT_ROUTE
          )
        );

      const nextPublicPath =
        normalizePathValue(
          first(
            publicPath,
            state.app?.publicPath,
            route,
            canonicalPath,
            DEFAULT_ROUTE
          )
        );

      return setAppPatch({
        route:
          nextRoute,

        canonicalPath:
          nextRoute,

        publicPath:
          nextPublicPath,
      });
    },

    setLoading(value = false) {
      return set(
        "app.loading",
        Boolean(value)
      );
    },

    setError(error = null) {
      return setAppPatch({
        lastError:
          error || null,

        error:
          error || null,

        hasError:
          Boolean(error),
      });
    },

    clearError() {
      return setAppPatch({
        lastError:
          null,

        error:
          null,

        hasError:
          false,
      });
    },

    setAppReady(value = true) {
      const ready =
        Boolean(value);

      return setAppPatch({
        ready,
        booted:
          ready ? true : Boolean(state.app?.booted),
        loading:
          ready ? false : Boolean(state.app?.loading),
        booting:
          ready ? false : Boolean(state.app?.booting),
      });
    },

    /* =====================================================
       SESSION
    ===================================================== */

    setSession({
      authenticated = undefined,
      token = undefined,
      accessToken = undefined,
      refreshToken = undefined,
      tempToken = undefined,
      sessionId = undefined,
      sessionUserId = undefined,
      user = undefined,
      role = undefined,
      roles = undefined,
      permissions = undefined,
    } = {}) {
      return setSessionPatch({
        authenticated,
        token,
        accessToken,
        refreshToken,
        tempToken,
        sessionId,
        sessionUserId,
        user,
        role,
        roles,
        permissions,
      });
    },

    applySession(payload = {}) {
      const source =
        safeObject(payload);

      const data =
        safeObject(source.data);

      const auth =
        safeObject(source.auth);

      const sessionData =
        safeObject(
          first(
            source.session,
            source.sessionData,
            data.session,
            data.sessionData,
            auth.session,
            auth.sessionData,
            {}
          )
        );

      const token =
        first(
          source.token,
          source.accessToken,
          source.access_token,
          data.token,
          data.accessToken,
          data.access_token,
          auth.token,
          auth.accessToken,
          auth.access_token,
          sessionData.token,
          sessionData.accessToken,
          sessionData.access_token,
          null
        );

      const refreshToken =
        first(
          source.refreshToken,
          source.refresh_token,
          data.refreshToken,
          data.refresh_token,
          auth.refreshToken,
          auth.refresh_token,
          sessionData.refreshToken,
          sessionData.refresh_token,
          undefined
        );

      const user =
        first(
          source.user,
          source.usuario,
          source.me,
          source.account,
          source.profile,
          data.user,
          data.usuario,
          data.me,
          data.account,
          data.profile,
          auth.user,
          auth.usuario,
          auth.me,
          sessionData.user,
          sessionData.usuario,
          sessionData.me,
          null
        );

      return api.setSession({
        authenticated:
          first(
            source.authenticated,
            data.authenticated,
            auth.authenticated,
            undefined
          ),

        token,

        accessToken:
          token,

        refreshToken,

        tempToken:
          first(
            source.tempToken,
            source.temp_token,
            source.temporaryToken,
            source.temporary_token,
            data.tempToken,
            data.temp_token,
            auth.tempToken,
            auth.temp_token,
            undefined
          ),

        sessionId:
          first(
            source.sessionId,
            source.session_id,
            data.sessionId,
            data.session_id,
            auth.sessionId,
            auth.session_id,
            sessionData.sessionId,
            sessionData.session_id,
            sessionData.id,
            undefined
          ),

        sessionUserId:
          first(
            source.sessionUserId,
            source.session_user_id,
            data.sessionUserId,
            data.session_user_id,
            auth.sessionUserId,
            auth.session_user_id,
            sessionData.sessionUserId,
            sessionData.session_user_id,
            sessionData.userId,
            undefined
          ),

        user,

        role:
          first(
            source.role,
            source.rol,
            data.role,
            data.rol,
            auth.role,
            auth.rol,
            user?.role,
            user?.rol,
            undefined
          ),

        roles:
          first(
            source.roles,
            data.roles,
            auth.roles,
            user?.roles,
            undefined
          ),

        permissions:
          first(
            source.permissions,
            source.permisos,
            data.permissions,
            data.permisos,
            auth.permissions,
            auth.permisos,
            user?.permissions,
            user?.permisos,
            undefined
          ),
      });
    },

    clearSession() {
      return patch({
        session: {
          authenticated:
            false,

          token:
            null,

          accessToken:
            null,

          refreshToken:
            null,

          tempToken:
            null,

          sessionId:
            null,

          sessionUserId:
            null,

          user:
            null,

          role:
            null,

          roles:
            [],

          permissions:
            [],

          isAdmin:
            false,

          isSupport:
            false,

          isManager:
            false,

          isClient:
            false,
        },
      });
    },

    setAuthenticated(value = false) {
      if (!value) {
        return setSessionPatch({
          authenticated:
            false,
        });
      }

      return setSessionPatch({
        authenticated:
          true,

        token:
          getCurrentToken(),

        user:
          getCurrentUser(),
      });
    },

    setToken(token = null) {
      return setSessionPatch({
        token,
        accessToken:
          token,

        user:
          getCurrentUser(),
      });
    },

    setAccessToken(token = null) {
      return api.setToken(token);
    },

    setRefreshToken(refreshToken = null) {
      return setSessionPatch({
        refreshToken,
      });
    },

    setTempToken(tempToken = null) {
      return setSessionPatch({
        tempToken,
      });
    },

    setSessionId(sessionId = null) {
      return setSessionPatch({
        sessionId,
      });
    },

    setSessionUserId(sessionUserId = null) {
      return setSessionPatch({
        sessionUserId,
      });
    },

    setUser(user = null) {
      return setSessionPatch({
        token:
          getCurrentToken(),

        user,

        role:
          user?.role ??
          user?.rol ??
          state.session?.role ??
          null,

        roles:
          first(
            user?.roles,
            state.session?.roles,
            []
          ),

        permissions:
          first(
            user?.permissions,
            user?.permisos,
            state.session?.permissions,
            []
          ),
      });
    },

    setRole(role = null) {
      return setSessionPatch({
        token:
          getCurrentToken(),

        user:
          getCurrentUser(),

        role:
          normalizeRole(role) || null,
      });
    },

    setRoles(roles = []) {
      return setSessionPatch({
        token:
          getCurrentToken(),

        user:
          getCurrentUser(),

        roles:
          normalizeRoles(roles),
      });
    },

    setPermissions(permissions = []) {
      return setSessionPatch({
        token:
          getCurrentToken(),

        user:
          getCurrentUser(),

        permissions:
          normalizeRoles(permissions),
      });
    },

    /* =====================================================
       UI
    ===================================================== */

    setTheme(theme = getDefaultTheme(AppCore)) {
      return setUiPatch({
        theme:
          normalizeTheme(theme),
      });
    },

    setThemePreference(theme = DEFAULT_THEME) {
      return setUiPatch({
        themePreference:
          normalizeTheme(theme),
      });
    },

    setLang(lang = getDefaultLang(AppCore)) {
      return setUiPatch({
        lang:
          normalizeLang(lang),
      });
    },

    setSidebarOpen(value = false) {
      return set(
        "ui.sidebarOpen",
        Boolean(value)
      );
    },

    toggleSidebar() {
      return api.setSidebarOpen(
        !Boolean(state.ui?.sidebarOpen)
      );
    },

    setPageTitle(title = getAppName(AppCore)) {
      const finalTitle =
        safeText(
          title,
          getAppName(AppCore)
        );

      return setUiPatch({
        pageTitle:
          finalTitle,

        topbarTitle:
          finalTitle,
      });
    },

    setTopbarTitle(title = getAppName(AppCore)) {
      return set(
        "ui.topbarTitle",
        safeText(
          title,
          getAppName(AppCore)
        )
      );
    },

    setDensity(density = "default") {
      return set(
        "ui.density",
        safeText(density, "default")
      );
    },

    resetTitles() {
      const title =
        getAppName(AppCore);

      return setUiPatch({
        pageTitle:
          title,

        topbarTitle:
          title,
      });
    },

    hydrateTitles() {
      return setUiPatch({
        pageTitle:
          safeResolveTitle(AppCore),

        topbarTitle:
          safeResolveTopbarTitle(AppCore),
      });
    },

    /* =====================================================
       FLAGS
    ===================================================== */

    setFlag(flag, value) {
      const key =
        normalizeFlagKey(flag);

      if (!key) {
        throw new Error(
          "actions.setFlag(flag, value) requiere flag válido."
        );
      }

      return set(
        `flags.${key}`,
        Boolean(value)
      );
    },

    clearFlag(flag) {
      const key =
        normalizeFlagKey(flag);

      if (!key) {
        throw new Error(
          "actions.clearFlag(flag) requiere flag válido."
        );
      }

      return set(
        `flags.${key}`,
        false
      );
    },

    toggleFlag(flag) {
      const key =
        normalizeFlagKey(flag);

      if (!key) {
        throw new Error(
          "actions.toggleFlag(flag) requiere flag válido."
        );
      }

      return set(
        `flags.${key}`,
        !Boolean(state.flags?.[key])
      );
    },

    setFlags(flags = {}) {
      const source =
        safeObject(flags);

      const next =
        {};

      Object.entries(source).forEach(([key, value]) => {
        const flagKey =
          normalizeFlagKey(key);

        if (!flagKey) {
          return;
        }

        next[flagKey] =
          Boolean(value);
      });

      return patch({
        flags:
          next,
      });
    },

    resetFlags() {
      return patch({
        flags:
          {},
      });
    },

    setFetching(key = "", value = true) {
      const clean =
        normalizeFlagKey(key);

      if (!clean) {
        throw new Error(
          "actions.setFetching(key, value) requiere key válido."
        );
      }

      const flagKey =
        `fetching${clean[0]?.toUpperCase() || ""}${clean.slice(1)}`;

      return api.setFlag(
        flagKey,
        value
      );
    },

    /* =====================================================
       COLLECTIONS
    ===================================================== */

    setCollection(key, items = []) {
      const resolved =
        getCollectionPath(key);

      return set(
        resolved.path,
        normalizeCollectionInput(items)
      );
    },

    appendToCollection(key, item) {
      const resolved =
        getCollectionPath(key);

      return update(
        resolved.path,
        (list = []) => {
          const next =
            Array.isArray(list)
              ? [...list]
              : [];

          next.push(
            cloneIfAny(item)
          );

          return normalizeCollection(next);
        }
      );
    },

    prependToCollection(key, item) {
      const resolved =
        getCollectionPath(key);

      return update(
        resolved.path,
        (list = []) => {
          const next =
            Array.isArray(list)
              ? [...list]
              : [];

          next.unshift(
            cloneIfAny(item)
          );

          return normalizeCollection(next);
        }
      );
    },

    replaceCollectionItem(key, matcher, nextItem) {
      const resolved =
        getCollectionPath(key);

      const match =
        safeNormalizeMatcher(
          matcher,
          nextItem
        );

      return update(
        resolved.path,
        (list = []) => {
          if (!Array.isArray(list)) {
            return [];
          }

          return normalizeCollection(
            list.map((item) =>
              match(item)
                ? cloneIfAny(nextItem)
                : item
            )
          );
        }
      );
    },

    updateCollectionItem(key, matcher, updater) {
      const resolved =
        getCollectionPath(key);

      if (!isFunction(updater)) {
        throw new Error(
          "actions.updateCollectionItem(key, matcher, updater) requiere updater function."
        );
      }

      const match =
        safeNormalizeMatcher(matcher);

      return update(
        resolved.path,
        (list = []) => {
          if (!Array.isArray(list)) {
            return [];
          }

          return normalizeCollection(
            list.map((item) => {
              if (!match(item)) {
                return item;
              }

              const next =
                updater(
                  cloneIfAny(item)
                );

              return next === undefined
                ? item
                : next;
            })
          );
        }
      );
    },

    patchCollectionItem(key, matcher, partial = {}) {
      const source =
        safeObject(partial);

      return api.updateCollectionItem(
        key,
        matcher,
        (item) => ({
          ...safeObject(item),
          ...cloneIfAny(source, {}),
        })
      );
    },

    upsertCollectionItem(key, item, matcher = null) {
      const resolved =
        getCollectionPath(key);

      const cleanItem =
        cloneIfAny(item);

      const match =
        safeNormalizeMatcher(
          matcher,
          cleanItem
        );

      return update(
        resolved.path,
        (list = []) => {
          const next =
            Array.isArray(list)
              ? [...list]
              : [];

          const index =
            next.findIndex((current) =>
              match(current)
            );

          if (index >= 0) {
            next[index] =
              cleanItem;
          } else {
            next.push(
              cleanItem
            );
          }

          return normalizeCollection(next);
        }
      );
    },

    removeCollectionItem(key, matcher) {
      const resolved =
        getCollectionPath(key);

      const match =
        safeNormalizeMatcher(matcher);

      return update(
        resolved.path,
        (list = []) => {
          if (!Array.isArray(list)) {
            return [];
          }

          return normalizeCollection(
            list.filter((item) =>
              !match(item)
            )
          );
        }
      );
    },

    clearCollection(key) {
      const resolved =
        getCollectionPath(key);

      return set(
        resolved.path,
        []
      );
    },

    clearCollections(options = {}) {
      const opts =
        safeObject(options);

      if (opts.full === true) {
        return patch({
          entities:
            buildEmptyEntities(
              state.entities
            ),
        });
      }

      const next =
        {};

      for (const key of Object.keys(
        safeObject(state.entities)
      )) {
        next[key] =
          key === "dashboard"
            ? null
            : [];
      }

      for (const key of DEFAULT_ENTITY_KEYS) {
        if (!hasOwn(next, key)) {
          next[key] =
            [];
        }
      }

      return patch({
        entities:
          next,
      });
    },

    setDashboard(value = null) {
      return set(
        "entities.dashboard",
        normalizeDashboardValue(value)
      );
    },

    clearDashboard() {
      return set(
        "entities.dashboard",
        null
      );
    },

    /* =====================================================
       COMMON ENTITY ALIASES
    ===================================================== */

    setIncidencias(items = []) {
      return api.setCollection(
        "incidencias",
        items
      );
    },

    setTickets(items = []) {
      return api.setCollection(
        "incidencias",
        items
      );
    },

    setFacturas(items = []) {
      return api.setCollection(
        "facturas",
        items
      );
    },

    setUsuarios(items = []) {
      return api.setCollection(
        "usuarios",
        items
      );
    },

    setClientes(items = []) {
      return api.setCollection(
        "clientes",
        items
      );
    },

    setRecientes(items = []) {
      return api.setCollection(
        "recientes",
        items
      );
    },

    upsertIncidencia(item, matcher = null) {
      return api.upsertCollectionItem(
        "incidencias",
        item,
        matcher
      );
    },

    upsertTicket(item, matcher = null) {
      return api.upsertCollectionItem(
        "incidencias",
        item,
        matcher
      );
    },

    upsertFactura(item, matcher = null) {
      return api.upsertCollectionItem(
        "facturas",
        item,
        matcher
      );
    },

    upsertUsuario(item, matcher = null) {
      return api.upsertCollectionItem(
        "usuarios",
        item,
        matcher
      );
    },

    upsertCliente(item, matcher = null) {
      return api.upsertCollectionItem(
        "clientes",
        item,
        matcher
      );
    },

    /* =====================================================
       HYDRATE
    ===================================================== */

    hydrateFromCore() {
      const coreState =
        getCoreState(AppCore);

      const token =
        getCoreToken(coreState);

      const user =
        getCoreUser(coreState);

      const sessionPatch =
        normalizeSessionPatch({
          state,

          authenticated:
            first(
              coreState.authenticated,
              coreState.session?.authenticated,
              false
            ),

          token,

          accessToken:
            token,

          refreshToken:
            first(
              coreState.refreshToken,
              coreState.refresh_token,
              coreState.session?.refreshToken,
              coreState.session?.refresh_token,
              state.session?.refreshToken,
              undefined
            ),

          tempToken:
            first(
              coreState.tempToken,
              coreState.temp_token,
              coreState.temporaryToken,
              coreState.temporary_token,
              coreState.session?.tempToken,
              coreState.session?.temp_token,
              state.session?.tempToken,
              undefined
            ),

          sessionId:
            first(
              coreState.sessionId,
              coreState.session_id,
              coreState.session?.sessionId,
              coreState.session?.session_id,
              state.session?.sessionId,
              undefined
            ),

          sessionUserId:
            first(
              coreState.sessionUserId,
              coreState.session_user_id,
              coreState.session?.sessionUserId,
              coreState.session?.session_user_id,
              state.session?.sessionUserId,
              undefined
            ),

          user,

          role:
            first(
              coreState.role,
              coreState.rol,
              coreState.userRole,
              coreState.session?.role,
              coreState.session?.rol,
              user?.role,
              user?.rol,
              undefined
            ),

          roles:
            first(
              coreState.roles,
              coreState.session?.roles,
              user?.roles,
              undefined
            ),

          permissions:
            first(
              coreState.permissions,
              coreState.permisos,
              coreState.session?.permissions,
              coreState.session?.permisos,
              user?.permissions,
              user?.permisos,
              undefined
            ),
        });

      const route =
        normalizeCanonicalRoute(
          getCoreRoute(coreState)
        );

      const publicPath =
        normalizePathValue(
          getCorePublicPath(coreState)
        );

      const title =
        safeResolveTitle(AppCore);

      const topbarTitle =
        safeResolveTopbarTitle(AppCore);

      const result =
        patch({
          app: {
            ready:
              Boolean(
                first(
                  coreState.ready,
                  coreState.appReady,
                  state.app?.ready,
                  false
                )
              ),

            booted:
              Boolean(
                first(
                  coreState.booted,
                  state.app?.booted,
                  false
                )
              ),

            route,

            canonicalPath:
              route,

            publicPath,

            loading:
              Boolean(
                first(
                  coreState.loading,
                  state.app?.loading,
                  false
                )
              ),

            initialized:
              Boolean(
                first(
                  coreState.initialized,
                  state.app?.initialized,
                  false
                )
              ),

            booting:
              Boolean(
                first(
                  coreState.booting,
                  state.app?.booting,
                  false
                )
              ),

            lastError:
              first(
                coreState.lastError,
                coreState.error,
                state.app?.lastError,
                null
              ),

            error:
              first(
                coreState.error,
                coreState.lastError,
                state.app?.error,
                null
              ),

            hasError:
              Boolean(
                first(
                  coreState.hasError,
                  coreState.error,
                  coreState.lastError,
                  state.app?.hasError,
                  false
                )
              ),
          },

          session:
            sessionPatch,

          ui: {
            theme:
              normalizeTheme(
                first(
                  coreState.theme,
                  state.ui?.theme,
                  getDefaultTheme(AppCore)
                )
              ),

            themePreference:
              normalizeTheme(
                first(
                  coreState.themeMode,
                  coreState.appearance,
                  state.ui?.themePreference,
                  getDefaultTheme(AppCore)
                )
              ),

            lang:
              normalizeLang(
                first(
                  coreState.lang,
                  state.ui?.lang,
                  getDefaultLang(AppCore)
                )
              ),

            sidebarOpen:
              Boolean(
                first(
                  coreState.sidebarOpen,
                  state.ui?.sidebarOpen,
                  true
                )
              ),

            pageTitle:
              title,

            topbarTitle:
              topbarTitle || title,

            density:
              safeText(
                first(
                  coreState.density,
                  state.ui?.density,
                  getConfig(AppCore).ui?.density,
                  "default"
                ),
                "default"
              ),
          },

          meta: {
            ...safeObject(state.meta),

            hydrated:
              true,

            lastHydratedAt:
              safeNow(),

            lastHydratedAtIso:
              safeIsoDate(),

            updatedAt:
              safeNow(),
          },
        });

      safeEmit(
        AppCore,
        "store:hydrated-from-core",
        {
          authenticated:
            Boolean(sessionPatch.authenticated),

          hasToken:
            Boolean(sessionPatch.token),

          hasUser:
            Boolean(sessionPatch.user),

          route,
          publicPath,

          at:
            safeIsoDate(),
        }
      );

      return result;
    },
  };

  return api;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  STORE_ACTIONS_VERSION,
  createActions,
};
