/* =========================================================
   Onion SPA - Store State
   Archivo: src/store/state.js

   ONION SUPPORT · STORE STATE
   INITIAL STATE · STRICT AUTH · UI SNAPSHOTS · 14/10

   Responsabilidades:
   - construir estado inicial del Store
   - exponer snapshots raíz seguros
   - resolver títulos desde DOM / AppCore
   - tocar metadata reactiva
   - clonar slices sin referencias peligrosas
   - resolver tema inicial desde sistema / navegador / preboot
   - evitar estados auth fantasma
   - mantener session/ui/app coherentes durante boot
   - tolerar AppCore parcial durante arranque
   - preservar route/publicPath y contexto visible
   - normalizar entities/flags/meta
   - no depender de Core completo para arrancar

   HARDENING:
   - browser/server safe
   - token sin user NO autentica
   - user sin token NO autentica
   - usuario inactivo/bloqueado NO autentica
   - theme: system/light/dark robusto
   - no referencias mutables peligrosas en snapshots
   - títulos tolerantes a DOM parcial
   - compatible con AppCore.config/state/dom/storage parcial
========================================================= */

import {
  isBrowser,
  deepClone,
  normalizeCollection,
} from "./helpers.js";

/* =========================================================
   VERSION
========================================================= */

export const STORE_STATE_VERSION =
  "14.0.0";

/* =========================================================
   CONSTANTS
========================================================= */

const APP_NAME_FALLBACK =
  "Onion Support";

const LANG_FALLBACK =
  "es";

const THEME_LIGHT =
  "light";

const THEME_DARK =
  "dark";

const THEME_SYSTEM =
  "system";

const DEFAULT_ROUTE =
  "/";

const TOKEN_BAD_VALUES =
  Object.freeze([
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

const USER_ID_KEYS =
  Object.freeze([
    "id",
    "userId",
    "user_id",
    "_id",
    "uid",
    "sub",
    "username",
    "userName",
    "user_name",
    "email",
    "mail",
    "phone",
    "telefono",
    "mobile",
  ]);

const USER_INACTIVE_STATUSES =
  Object.freeze([
    "disabled",
    "inactive",
    "deleted",
    "blocked",
    "suspended",
    "banned",
    "revoked",
    "desactivado",
    "inactivo",
    "eliminado",
    "bloqueado",
    "suspendido",
  ]);

const ADMIN_ROLES =
  Object.freeze([
    "admin",
    "administrator",
    "administrador",
    "superadmin",
    "super_admin",
    "owner",
    "root",
  ]);

const SENSITIVE_KEY_RE =
  /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code/i;

const DEFAULT_ENTITY_KEYS =
  Object.freeze([
    "incidencias",
    "tickets",
    "facturas",
    "usuarios",
    "clientes",
    "hardware",
    "recientes",
  ]);

const DEFAULT_FETCH_FLAGS =
  Object.freeze([
    "Dashboard",
    "Incidencias",
    "Tickets",
    "Facturas",
    "Usuarios",
    "Clientes",
    "Hardware",
    "Search",
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
  return safeText(
    value,
    fallback
  ).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;

  if (value === 1) return true;
  if (value === 0) return false;

  if (typeof value === "string") {
    const clean =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "on",
        "enabled",
        "active",
      ].includes(clean)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
        "disabled",
        "inactive",
      ].includes(clean)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

function safeObject(value, fallback = {}) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function isFunction(value) {
  return typeof value === "function";
}

function hasOwn(obj, key) {
  try {
    return Object.prototype.hasOwnProperty.call(
      obj,
      key
    );
  } catch {
    return false;
  }
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
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return value;
  }
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function nowIso(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
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

function flatten(values = []) {
  const output = [];

  for (const value of safeArray(values)) {
    if (Array.isArray(value)) {
      output.push(
        ...flatten(value)
      );
    } else {
      output.push(value);
    }
  }

  return output;
}

function unique(values = []) {
  return Array.from(
    new Set(
      safeArray(values)
        .filter((value) =>
          value !== null &&
          value !== undefined &&
          value !== ""
        )
    )
  );
}

/* =========================================================
   APPCORE SAFE ACCESS
========================================================= */

function getCoreConfig(AppCore) {
  return safeObject(
    AppCore?.config
  );
}

function getCoreState(AppCore) {
  return safeObject(
    AppCore?.state
  );
}

function getCoreDom(AppCore) {
  return safeObject(
    AppCore?.dom
  );
}

function getCoreStorage(AppCore) {
  return safeObject(
    AppCore?.storage
  );
}

function getCoreUtils(AppCore) {
  return safeObject(
    AppCore?.utils
  );
}

function getAppName(AppCore) {
  const config =
    getCoreConfig(AppCore);

  return (
    safeText(config.appName, "") ||
    safeText(config.name, "") ||
    APP_NAME_FALLBACK
  );
}

/* =========================================================
   PATH / LOCATION
========================================================= */

function isHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return DEFAULT_ROUTE;
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || DEFAULT_ROUTE;
  }

  return raw.replace(/^#\/?/, "/") || DEFAULT_ROUTE;
}

function normalizePathnameOnly(pathname = DEFAULT_ROUTE) {
  let value =
    safeText(pathname, DEFAULT_ROUTE)
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) {
    value =
      `/${value}`;
  }

  const segments =
    value
      .split("/")
      .filter(Boolean);

  const output = [];

  for (const segment of segments) {
    if (segment === ".") {
      continue;
    }

    if (segment === "..") {
      output.pop();
      continue;
    }

    output.push(segment);
  }

  value =
    `/${output.join("/")}`;

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") ||
      DEFAULT_ROUTE;
  }

  return value || DEFAULT_ROUTE;
}

function normalizeSearch(search = "") {
  const value =
    safeText(search, "");

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value =
    safeText(hash, "");

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function splitFullPath(value = DEFAULT_ROUTE) {
  const raw =
    safeText(value, DEFAULT_ROUTE);

  if (isHashRouterPath(raw)) {
    return splitFullPath(
      normalizeHashRouterPath(raw)
    );
  }

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
    pathname:
      normalizePathnameOnly(pathname),

    search:
      normalizeSearch(search),

    hash:
      normalizeHash(hash),
  };
}

function normalizePublicPath(path = DEFAULT_ROUTE) {
  const raw =
    safeText(path, DEFAULT_ROUTE);

  if (isHashRouterPath(raw)) {
    return normalizePublicPath(
      normalizeHashRouterPath(raw)
    );
  }

  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) {
      const parsed =
        new URL(
          raw,
          "http://localhost"
        );

      if (
        parsed.hash &&
        isHashRouterPath(parsed.hash)
      ) {
        return normalizePublicPath(
          normalizeHashRouterPath(parsed.hash)
        );
      }

      return normalizePublicPath(
        `${parsed.pathname || DEFAULT_ROUTE}${parsed.search || ""}${parsed.hash || ""}`
      );
    }
  } catch {}

  const {
    pathname,
    search,
    hash,
  } =
    splitFullPath(raw);

  return `${pathname}${search}${hash}`;
}

function stripUsernamePrefix(path = DEFAULT_ROUTE) {
  const normalized =
    normalizePublicPath(path);

  const {
    pathname,
    search,
    hash,
  } =
    splitFullPath(normalized);

  const cleanPathname =
    pathname.replace(
      /^\/@[^/]+(?=\/|$)/i,
      ""
    ) || DEFAULT_ROUTE;

  return `${normalizePathnameOnly(cleanPathname)}${search}${hash}`;
}

function normalizeCanonicalPath(path = DEFAULT_ROUTE) {
  const publicPath =
    stripUsernamePrefix(path);

  const {
    pathname,
  } =
    splitFullPath(publicPath);

  if (
    pathname === "/activate-account" ||
    pathname.startsWith("/activate-account/")
  ) {
    return "/activate-account";
  }

  if (
    pathname === "/reset-password/confirm" ||
    pathname.startsWith("/reset-password/confirm/")
  ) {
    return "/reset-password/confirm";
  }

  return pathname || DEFAULT_ROUTE;
}

function getBrowserPublicPath() {
  if (!isBrowser()) {
    return DEFAULT_ROUTE;
  }

  try {
    const hash =
      window.location.hash || "";

    if (isHashRouterPath(hash)) {
      return normalizePublicPath(hash);
    }

    return normalizePublicPath(
      `${window.location.pathname || DEFAULT_ROUTE}${window.location.search || ""}${hash}`
    );
  } catch {
    return DEFAULT_ROUTE;
  }
}

function resolveRoute(AppCore) {
  const state =
    getCoreState(AppCore);

  const publicPath =
    normalizePublicPath(
      first(
        state.publicPath,
        state.lastPublicPath,
        getBrowserPublicPath(),
        state.route,
        DEFAULT_ROUTE
      )
    );

  const canonicalPath =
    normalizeCanonicalPath(
      first(
        state.route,
        state.canonicalPath,
        publicPath,
        DEFAULT_ROUTE
      )
    );

  return {
    route:
      canonicalPath,

    canonicalPath,

    publicPath:
      publicPath || canonicalPath || DEFAULT_ROUTE,
  };
}

/* =========================================================
   USER / TOKEN VALIDATION
========================================================= */

function stripBearer(token = "") {
  return safeText(token, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function hasUsableToken(token = "") {
  const value =
    stripBearer(token);

  if (!value) {
    return false;
  }

  const lower =
    value.toLowerCase();

  if (TOKEN_BAD_VALUES.includes(lower)) {
    return false;
  }

  if (/[\s\r\n\t]/.test(value)) {
    return false;
  }

  return true;
}

function hasUsableUser(user = null) {
  const current =
    safeObject(user);

  if (!Object.keys(current).length) {
    return false;
  }

  if (
    current.active === false ||
    current.disabled === true ||
    current.isDisabled === true ||
    current.deleted === true ||
    current.isDeleted === true ||
    current.blocked === true ||
    current.isBlocked === true ||
    current.suspended === true ||
    current.revoked === true
  ) {
    return false;
  }

  const status =
    safeLower(
      current.status ||
        current.estado ||
        current.state ||
        current.accountStatus ||
        ""
    );

  if (USER_INACTIVE_STATUSES.includes(status)) {
    return false;
  }

  return USER_ID_KEYS.some((key) =>
    Boolean(
      safeText(current?.[key], "")
    )
  );
}

function getStateToken(AppCore) {
  const state =
    getCoreState(AppCore);

  const session =
    safeObject(state.session);

  return stripBearer(
    first(
      state.token,
      state.accessToken,
      state.access_token,
      state.jwt,
      state.bearer,
      session.token,
      session.accessToken,
      session.access_token,
      session.jwt,
      session.bearer
    ) || ""
  );
}

function getStateUser(AppCore) {
  const state =
    getCoreState(AppCore);

  const session =
    safeObject(state.session);

  const user =
    first(
      state.user,
      state.currentUser,
      state.authUser,
      state.sessionUser,
      state.account,
      state.profile,
      state.me,
      state.usuario,
      session.user,
      session.currentUser,
      session.authUser,
      session.sessionUser,
      session.account,
      session.profile,
      session.me,
      session.usuario
    );

  return hasUsableUser(user)
    ? clone(user)
    : null;
}

function normalizeRole(value = "") {
  if (
    value === null ||
    value === undefined ||
    typeof value === "object"
  ) {
    return "";
  }

  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function normalizeRoles(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  return flatten(
    Array.isArray(value)
      ? value
      : [value]
  )
    .map(normalizeRole)
    .filter(Boolean);
}

function collectRolesFromState(AppCore, user = null) {
  const state =
    getCoreState(AppCore);

  const session =
    safeObject(state.session);

  const currentUser =
    safeObject(user);

  const raw =
    safeObject(currentUser.raw);

  const profile =
    safeObject(currentUser.profile);

  const roles = [
    state.role,
    state.rol,
    state.userRole,
    state.user_role,
    state.roles,
    state.permissions,
    state.permisos,
    state.scopes,

    session.role,
    session.rol,
    session.roles,
    session.permissions,
    session.permisos,
    session.scopes,

    currentUser.role,
    currentUser.rol,
    currentUser.userRole,
    currentUser.user_role,
    currentUser.type,
    currentUser.userType,
    currentUser.user_type,
    currentUser.perfil,
    currentUser.roles,
    currentUser.permissions,
    currentUser.permisos,
    currentUser.scopes,

    profile.role,
    profile.rol,
    profile.roles,
    profile.permissions,
    profile.permisos,

    raw.role,
    raw.rol,
    raw.userRole,
    raw.user_role,
    raw.type,
    raw.userType,
    raw.user_type,
    raw.roles,
    raw.permissions,
    raw.permisos,
    raw.scopes,
  ];

  if (
    state.isAdmin === true ||
    state.admin === true ||
    currentUser.isAdmin === true ||
    currentUser.admin === true ||
    raw.isAdmin === true ||
    raw.admin === true
  ) {
    roles.push("admin");
  }

  return Array.from(
    new Set(
      roles
        .flatMap((role) =>
          normalizeRoles(role)
        )
        .filter(Boolean)
    )
  );
}

function resolveDisplayName(user = null) {
  const current =
    safeObject(user);

  const profile =
    safeObject(current.profile);

  const raw =
    safeObject(current.raw);

  return safeText(
    first(
      current.displayName,
      current.display_name,
      current.fullName,
      current.full_name,
      current.name,
      current.nombre,
      profile.displayName,
      profile.display_name,
      profile.fullName,
      profile.full_name,
      profile.name,
      raw.displayName,
      raw.display_name,
      raw.fullName,
      raw.full_name,
      raw.name,
      current.username,
      current.email,
      "Usuario"
    ),
    "Usuario"
  );
}

function resolveUsername(user = null) {
  const current =
    safeObject(user);

  const profile =
    safeObject(current.profile);

  const raw =
    safeObject(current.raw);

  return safeText(
    first(
      current.username,
      current.userName,
      current.user_name,
      current.slug,
      current.login,
      current.alias,
      profile.username,
      profile.userName,
      profile.slug,
      raw.username,
      raw.userName,
      raw.slug,
      current.email
    ),
    ""
  );
}

function resolveAvatarUrl(user = null) {
  const current =
    safeObject(user);

  const profile =
    safeObject(current.profile);

  const raw =
    safeObject(current.raw);

  const rawProfile =
    safeObject(raw.profile);

  if (
    current.hasAvatar === false ||
    current.has_avatar === false ||
    profile.hasAvatar === false ||
    raw.hasAvatar === false
  ) {
    return "";
  }

  return safeText(
    first(
      current.avatarUrl,
      current.avatarURL,
      current.avatar_url,
      current.avatar,
      current.photo,
      current.photoUrl,
      current.photoURL,
      current.photo_url,
      current.image,
      current.imageUrl,
      current.imageURL,
      current.image_url,
      current.picture,
      current.pictureUrl,
      current.pictureURL,
      current.picture_url,

      profile.avatarUrl,
      profile.avatarURL,
      profile.avatar_url,
      profile.avatar,
      profile.photo,
      profile.photoUrl,
      profile.photoURL,
      profile.photo_url,
      profile.image,
      profile.imageUrl,
      profile.picture,
      profile.pictureUrl,

      raw.avatarUrl,
      raw.avatarURL,
      raw.avatar_url,
      raw.avatar,
      raw.photo,
      raw.photoUrl,
      raw.photoURL,
      raw.photo_url,
      raw.image,
      raw.imageUrl,
      raw.picture,
      raw.pictureUrl,

      rawProfile.avatarUrl,
      rawProfile.avatarURL,
      rawProfile.avatar_url,
      rawProfile.avatar,
      rawProfile.photo,
      rawProfile.photoUrl,
      rawProfile.picture,
      rawProfile.pictureUrl
    ),
    ""
  );
}

function buildUserSnapshot(user = null) {
  if (!hasUsableUser(user)) {
    return null;
  }

  const current =
    safeObject(user);

  const id =
    first(
      current.id,
      current.userId,
      current.user_id,
      current._id,
      current.uid,
      current.sub
    );

  const displayName =
    resolveDisplayName(current);

  const username =
    resolveUsername(current);

  const avatarUrl =
    resolveAvatarUrl(current);

  return {
    ...clone(current),

    id:
      id || null,

    userId:
      current.userId ||
      current.user_id ||
      id ||
      null,

    username:
      username || null,

    displayName,

    name:
      current.name ||
      current.nombre ||
      displayName,

    email:
      current.email ||
      current.mail ||
      null,

    avatar:
      avatarUrl || null,

    avatarUrl:
      avatarUrl || null,

    hasAvatar:
      Boolean(avatarUrl),

    active:
      current.active !== false,
  };
}

function resolveSession(AppCore) {
  const state =
    getCoreState(AppCore);

  const token =
    getStateToken(AppCore);

  const user =
    getStateUser(AppCore);

  const tokenValid =
    hasUsableToken(token);

  const userValid =
    hasUsableUser(user);

  const authenticated =
    Boolean(
      state.authenticated === true &&
        tokenValid &&
        userValid
    );

  const roles =
    authenticated
      ? collectRolesFromState(
          AppCore,
          user
        )
      : [];

  const role =
    authenticated
      ? (
          normalizeRole(
            first(
              state.role,
              state.rol,
              state.session?.role,
              state.session?.rol,
              user?.role,
              user?.rol,
              roles[0]
            )
          ) || null
        )
      : null;

  const userSnapshot =
    authenticated
      ? buildUserSnapshot(user)
      : null;

  const username =
    authenticated
      ? (
          safeText(
            state.username,
            ""
          ) ||
          resolveUsername(userSnapshot)
        )
      : null;

  const displayName =
    authenticated
      ? resolveDisplayName(userSnapshot)
      : null;

  const avatarUrl =
    authenticated
      ? resolveAvatarUrl(userSnapshot)
      : "";

  return {
    authenticated,

    hasToken:
      tokenValid,

    token:
      authenticated
        ? token
        : null,

    accessToken:
      authenticated
        ? token
        : null,

    user:
      userSnapshot,

    role,
    roles,

    username:
      username || null,

    displayName:
      displayName || null,

    avatarUrl:
      avatarUrl || null,

    currentResolvedUsername:
      authenticated
        ? (
            safeText(state.currentResolvedUsername, "") ||
            safeText(state.resolvedUsername, "") ||
            username ||
            null
          )
        : null,

    isAdmin:
      roles.some((candidate) =>
        ADMIN_ROLES.includes(candidate)
      ),
  };
}

/* =========================================================
   THEME
========================================================= */

function normalizeTheme(value = "") {
  const theme =
    safeLower(value, "");

  if (theme === THEME_LIGHT) {
    return THEME_LIGHT;
  }

  if (theme === THEME_DARK) {
    return THEME_DARK;
  }

  if (theme === THEME_SYSTEM) {
    return THEME_SYSTEM;
  }

  return "";
}

function getSystemTheme() {
  if (!isBrowser()) {
    return THEME_LIGHT;
  }

  try {
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return THEME_DARK;
    }
  } catch {}

  return THEME_LIGHT;
}

function getBootThemeSnapshot() {
  if (!isBrowser()) {
    return {};
  }

  try {
    return safeObject(window.__ONION_BOOT_THEME__);
  } catch {
    return {};
  }
}

function getDocumentTheme() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return normalizeTheme(
      document.documentElement?.dataset?.theme ||
        document.documentElement?.getAttribute("data-theme") ||
        document.body?.dataset?.theme ||
        document.body?.getAttribute("data-theme") ||
        ""
    );
  } catch {
    return "";
  }
}

function parseStoredValue(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (typeof value !== "string") {
    return value;
  }

  const raw =
    value.trim();

  if (!raw) {
    return "";
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function getStorageCandidate(AppCore, key = "") {
  const storage =
    getCoreStorage(AppCore);

  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return "";
  }

  try {
    if (isFunction(storage?.get)) {
      return parseStoredValue(
        storage.get(cleanKey)
      );
    }
  } catch {}

  try {
    if (isFunction(storage?.getRaw)) {
      return parseStoredValue(
        storage.getRaw(cleanKey)
      );
    }
  } catch {}

  if (!isBrowser()) {
    return "";
  }

  try {
    return parseStoredValue(
      window.localStorage?.getItem?.(cleanKey)
    );
  } catch {
    return "";
  }
}

function readStoredTheme(AppCore) {
  const config =
    getCoreConfig(AppCore);

  const prefix =
    safeText(
      config.storagePrefix ||
        config.appKey,
      "onion"
    ).replace(/:+$/g, "");

  const candidates =
    unique([
      "theme",
      "themeMode",
      "appearance",
      `${prefix}:theme`,
      `${prefix}:themeMode`,
      `${prefix}:appearance`,
      "onion:theme",
      "onion:themeMode",
      "onion:appearance",
      "ui.theme",
      "ui.themeMode",
      `${prefix}:ui.theme`,
      `${prefix}:ui.themeMode`,
    ]);

  for (const key of candidates) {
    const value =
      normalizeTheme(
        getStorageCandidate(
          AppCore,
          key
        )
      );

    if (value) {
      return value;
    }
  }

  return "";
}

function resolveThemePreference(AppCore) {
  const state =
    getCoreState(AppCore);

  const config =
    getCoreConfig(AppCore);

  const bootTheme =
    getBootThemeSnapshot();

  return (
    normalizeTheme(state.themePreference) ||
    normalizeTheme(state.themeMode) ||
    normalizeTheme(state.appearance) ||
    normalizeTheme(state.theme) ||
    normalizeTheme(bootTheme.mode) ||
    normalizeTheme(bootTheme.themeMode) ||
    normalizeTheme(bootTheme.theme) ||
    readStoredTheme(AppCore) ||
    normalizeTheme(config.defaultTheme) ||
    normalizeTheme(config.ui?.defaultTheme) ||
    THEME_SYSTEM
  );
}

function resolveTheme(AppCore) {
  const preference =
    resolveThemePreference(AppCore);

  const bootTheme =
    getBootThemeSnapshot();

  if (preference === THEME_SYSTEM) {
    return (
      normalizeTheme(bootTheme.theme) ||
      getDocumentTheme() ||
      getSystemTheme()
    );
  }

  return (
    normalizeTheme(preference) ||
    normalizeTheme(bootTheme.theme) ||
    getDocumentTheme() ||
    getSystemTheme()
  );
}

/* =========================================================
   LANG
========================================================= */

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

  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(lang)
    ? lang
    : "";
}

function readStoredLang(AppCore) {
  const config =
    getCoreConfig(AppCore);

  const prefix =
    safeText(
      config.storagePrefix ||
        config.appKey,
      "onion"
    ).replace(/:+$/g, "");

  const candidates =
    unique([
      "lang",
      `${prefix}:lang`,
      "onion:lang",
      "ui.lang",
      `${prefix}:ui.lang`,
    ]);

  for (const key of candidates) {
    const value =
      normalizeLang(
        getStorageCandidate(
          AppCore,
          key
        )
      );

    if (value) {
      return value;
    }
  }

  return "";
}

function resolveLang(AppCore) {
  const state =
    getCoreState(AppCore);

  const config =
    getCoreConfig(AppCore);

  return (
    normalizeLang(state.lang) ||
    readStoredLang(AppCore) ||
    normalizeLang(config.defaultLang) ||
    normalizeLang(config.i18n?.defaultLang) ||
    LANG_FALLBACK
  );
}

/* =========================================================
   TITLES
========================================================= */

export function safeTitle(AppCore) {
  const fallback =
    getAppName(AppCore);

  if (!isBrowser()) {
    return fallback;
  }

  try {
    return (
      safeText(document.title, "") ||
      fallback
    );
  } catch {
    return fallback;
  }
}

export function safeTopbarTitle(AppCore) {
  const dom =
    getCoreDom(AppCore);

  const candidates = [
    dom.topbarTitle?.textContent,
    dom.topbarViewTitle?.textContent,
    dom.title?.textContent,
  ];

  if (isBrowser()) {
    try {
      candidates.push(
        document.querySelector?.("#topbar-title")?.textContent,
        document.querySelector?.("[data-topbar-title]")?.textContent,
        document.querySelector?.(".topbar-title")?.textContent
      );
    } catch {}
  }

  return (
    safeText(first(...candidates), "") ||
    safeTitle(AppCore) ||
    getAppName(AppCore)
  );
}

/* =========================================================
   META
========================================================= */

export function touchMeta(state, extra = {}) {
  if (
    !state ||
    typeof state !== "object"
  ) {
    return false;
  }

  if (
    !state.meta ||
    typeof state.meta !== "object" ||
    Array.isArray(state.meta)
  ) {
    state.meta = {};
  }

  const now =
    nowMs();

  state.meta.updatedAt =
    now;

  state.meta.updatedAtIso =
    nowIso(now);

  state.meta.revision =
    safeNumber(
      state.meta.revision,
      0
    ) + 1;

  if (extra && typeof extra === "object") {
    Object.assign(
      state.meta,
      clone(extra)
    );
  }

  return true;
}

/* =========================================================
   INITIAL SLICES
========================================================= */

function buildAppSlice(AppCore) {
  const coreState =
    getCoreState(AppCore);

  const route =
    resolveRoute(AppCore);

  return {
    ready:
      Boolean(
        coreState.ready ||
          coreState.appReady
      ),

    booted:
      Boolean(
        coreState.booted ||
          coreState.initialized
      ),

    initialized:
      Boolean(
        coreState.initialized
      ),

    booting:
      Boolean(
        coreState.booting ||
          coreState.coreInitializing
      ),

    loading:
      Boolean(
        coreState.loading
      ),

    fatal:
      Boolean(
        coreState.appFatal
      ),

    route:
      route.route,

    canonicalPath:
      route.canonicalPath,

    publicPath:
      route.publicPath,

    lastRoute:
      coreState.lastRoute || null,

    lastPublicPath:
      coreState.lastPublicPath || null,

    routeMode:
      coreState.routeMode || "boot",

    lastError:
      clone(
        coreState.lastError ||
          coreState.error ||
          null
      ),
  };
}

function buildSessionSlice(AppCore) {
  const session =
    resolveSession(AppCore);

  return {
    authenticated:
      session.authenticated,

    hasToken:
      session.hasToken,

    token:
      session.token,

    accessToken:
      session.accessToken,

    user:
      session.user,

    role:
      session.role,

    roles:
      session.roles,

    username:
      session.username,

    displayName:
      session.displayName,

    avatarUrl:
      session.avatarUrl,

    currentResolvedUsername:
      session.currentResolvedUsername,

    isAdmin:
      Boolean(session.isAdmin),
  };
}

function buildUiSlice(AppCore) {
  const coreState =
    getCoreState(AppCore);

  const appName =
    getAppName(AppCore);

  const themePreference =
    resolveThemePreference(AppCore);

  const theme =
    resolveTheme(AppCore);

  const lang =
    resolveLang(AppCore);

  return {
    theme,

    themePreference,

    themeMode:
      themePreference,

    lang,

    sidebarOpen:
      coreState.sidebarOpen !== undefined
        ? Boolean(coreState.sidebarOpen)
        : true,

    shellVisible:
      coreState.shellVisible !== undefined
        ? Boolean(coreState.shellVisible)
        : true,

    chromeVisible:
      coreState.chromeVisible !== undefined
        ? Boolean(coreState.chromeVisible)
        : true,

    authScreen:
      Boolean(coreState.authScreen),

    density:
      coreState.density || "default",

    pageTitle:
      safeTitle(AppCore) ||
      appName,

    topbarTitle:
      safeTopbarTitle(AppCore) ||
      appName,
  };
}

function buildEntitiesSlice() {
  return {
    incidencias: [],
    tickets: [],
    facturas: [],
    usuarios: [],
    clientes: [],
    hardware: [],
    recientes: [],

    dashboard:
      null,

    search: {
      query:
        "",

      results:
        [],

      lastResults:
        [],

      loading:
        false,

      error:
        null,
    },

    byId: {
      incidencias: {},
      tickets: {},
      facturas: {},
      usuarios: {},
      clientes: {},
      hardware: {},
    },
  };
}

function buildFlagsSlice() {
  const flags = {
    hydrating:
      false,

    hydrated:
      false,

    syncingCore:
      false,

    refreshing:
      false,

    saving:
      false,
  };

  for (const name of DEFAULT_FETCH_FLAGS) {
    flags[`fetching${name}`] =
      false;
  }

  return flags;
}

function buildMetaSlice() {
  const createdAt =
    nowMs();

  return {
    version:
      STORE_STATE_VERSION,

    hydrated:
      false,

    revision:
      0,

    createdAt,

    createdAtIso:
      nowIso(createdAt),

    updatedAt:
      createdAt,

    updatedAtIso:
      nowIso(createdAt),

    source:
      "store:state",

    entityKeys:
      [...DEFAULT_ENTITY_KEYS],
  };
}

/* =========================================================
   INITIAL STATE
========================================================= */

export function buildInitialState(AppCore) {
  return {
    app:
      buildAppSlice(AppCore),

    session:
      buildSessionSlice(AppCore),

    ui:
      buildUiSlice(AppCore),

    entities:
      buildEntitiesSlice(),

    flags:
      buildFlagsSlice(),

    meta:
      buildMetaSlice(),
  };
}

/* =========================================================
   SNAPSHOT SANITIZE
========================================================= */

function sanitizeValue(value, keyHint = "", depth = 0) {
  if (depth > 8) {
    return "[depth-limit]";
  }

  if (SENSITIVE_KEY_RE.test(safeText(keyHint, ""))) {
    return value
      ? "***"
      : null;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "function") {
    return "[function]";
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeValue(
        item,
        keyHint,
        depth + 1
      )
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      output[key] =
        sanitizeValue(
          item,
          key,
          depth + 1
        );
    }

    return output;
  }

  return String(value);
}

export function buildSafeSnapshot(state = {}) {
  return sanitizeValue(
    shallowCloneRoot(state)
  );
}

/* =========================================================
   SAFE ROOT SNAPSHOT
========================================================= */

function cloneEntitySlice(entities = {}) {
  const source =
    safeObject(entities);

  return {
    incidencias:
      normalizeCollection(
        source.incidencias
      ),

    tickets:
      normalizeCollection(
        source.tickets
      ),

    facturas:
      normalizeCollection(
        source.facturas
      ),

    usuarios:
      normalizeCollection(
        source.usuarios
      ),

    clientes:
      normalizeCollection(
        source.clientes
      ),

    hardware:
      normalizeCollection(
        source.hardware
      ),

    recientes:
      normalizeCollection(
        source.recientes
      ),

    dashboard:
      source.dashboard
        ? clone(source.dashboard)
        : null,

    search:
      {
        ...safeObject(source.search),

        results:
          normalizeCollection(
            source.search?.results
          ),

        lastResults:
          normalizeCollection(
            source.search?.lastResults
          ),
      },

    byId:
      clone(
        source.byId || {}
      ),
  };
}

export function shallowCloneRoot(state) {
  const source =
    safeObject(state);

  const app =
    safeObject(source.app);

  const session =
    safeObject(source.session);

  const ui =
    safeObject(source.ui);

  const entities =
    safeObject(source.entities);

  const flags =
    safeObject(source.flags);

  const meta =
    safeObject(source.meta);

  return {
    app: {
      ...app,

      lastError:
        clone(app.lastError || null),
    },

    session: {
      ...session,

      user:
        session.user
          ? clone(session.user)
          : null,

      roles:
        safeArray(session.roles),

      /*
        Store interno conserva token para compatibilidad,
        pero snapshots públicos deben usar buildSafeSnapshot().
      */
      token:
        session.token || null,

      accessToken:
        session.accessToken || null,
    },

    ui: {
      ...ui,
    },

    entities:
      cloneEntitySlice(entities),

    flags: {
      ...flags,
    },

    meta: {
      ...meta,
    },
  };
}

/* =========================================================
   EXPORT DEFAULT
========================================================= */

export default {
  STORE_STATE_VERSION,

  safeTitle,
  safeTopbarTitle,

  touchMeta,

  buildInitialState,
  shallowCloneRoot,
  buildSafeSnapshot,
};
