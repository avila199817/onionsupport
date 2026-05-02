/* =========================================================
   Onion SPA - Sidebar User
   Archivo: src/ui/sidebar/user.js

   FINAL EXTREME SYSTEM · SIDEBAR USER / AVATAR · 10/10

   RESPONSABILIDADES:
   - resolver usuario actual desde AppCore/Auth-like sources
   - obtener display name robusto
   - obtener username normalizado
   - construir iniciales del avatar
   - resolver URL de avatar
   - detectar rol admin con aliases/flags/permisos
   - renderizar usuario en el footer
   - pintar avatar real o fallback
   - soportar hasAvatar / avatarUpdatedAt
   - evitar que una URL vacía o rota rompa el footer
   - evitar carreras de carga de avatar
   - respetar la estructura DOM del template
   - evitar tooltips nativos en avatar/footer
   - evitar title/data-tooltip residuales
   - emitir snapshot estable del usuario renderizado

   HARDENING EXTREMO:
   - no depende de una única forma de user
   - soporta user/profile/account/meta/claims/raw/account/customer
   - soporta avatarUrl/photoUrl/picture/profileImage anidados
   - bloquea protocolos peligrosos
   - cache bust con avatarUpdatedAt/avatarVersion
   - fallback inmediato mientras carga imagen real
   - onload/onerror con token anti-race
   - admin por rol, permiso o flags
   - safeEmit no duplica bus + window
   - no deja avatar viejo si cambia usuario
   - cero throws hacia la UI
========================================================= */

import {
  getElements,
  sanitizeFooterTooltipState,
} from "./dom.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_DISPLAY_NAME = "Usuario";
const DEFAULT_AVATAR_TEXT = "ON";
const DEFAULT_PLAN_LABEL = "Go Plan";

const LOG_PREFIX = "[SidebarUser]";

const AVATAR_CACHE_PARAM = "v";
const AVATAR_RENDER_SEQ_DATASET_KEY = "avatarRenderSeq";

const SIDEBAR_AVATAR_IMAGE_ID = "sidebarAvatarImage";
const SIDEBAR_AVATAR_FALLBACK_ID = "sidebarAvatarFallback";
const SIDEBAR_USER_PLAN_ID = "sidebarUserPlan";

const EVENTS = Object.freeze({
  userRendered: "sidebar:user:rendered",
  userAvatarLoaded: "sidebar:user:avatar:loaded",
  userAvatarError: "sidebar:user:avatar:error",
});

const ADMIN_ROLE_KEYS = new Set([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super_administrador",
  "owner",
  "root",
  "staff",
  "support",
]);

const ADMIN_PERMISSION_KEYS = new Set([
  "admin:*",
  "admin.all",
  "admin.full",
  "admin.manage",
  "admin:manage",

  "users.manage",
  "users:manage",
  "users.write",
  "users:write",
  "users.admin",
  "users:admin",

  "usuarios.manage",
  "usuarios:manage",
  "usuarios.write",
  "usuarios:write",
  "usuarios.admin",
  "usuarios:admin",

  "manage_users",
  "can_manage_users",
  "access_users",
  "can_access_users",

  "clients.manage",
  "clients:manage",
  "clientes.manage",
  "clientes:manage",

  "server.manage",
  "server:manage",
  "servidor.manage",
  "servidor:manage",

  "tickets.manage",
  "tickets:manage",
  "incidencias.manage",
  "incidencias:manage",

  "facturas.manage",
  "facturas:manage",
  "invoices.manage",
  "invoices:manage",
]);

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function hasWindow() {
  return typeof window !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "ok", "on"].includes(key)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(key)) {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(LOG_PREFIX, ...args);
  } catch {}

  try {
    console.warn(LOG_PREFIX, ...args);
  } catch {}
}

/*
  Importante:
  No emitimos por AppCore.events Y window a la vez.
  Si el bus existe, usamos bus. Window solo fallback.
*/
function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  try {
    if (isFn(AppCore?.events?.emit)) {
      AppCore.events.emit(name, payload);
      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.emit("${name}") falló.`,
      error
    );
  }

  try {
    if (
      isBrowser() &&
      typeof CustomEvent !== "undefined"
    ) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      return true;
    }
  } catch {}

  return false;
}

function removeTooltipAttributes(element = null) {
  if (!element) return false;

  try {
    element.removeAttribute("title");
    element.removeAttribute("data-tooltip");
    element.removeAttribute("data-i18n-data-tooltip");
    element.removeAttribute("aria-describedby");
    return true;
  } catch {
    return false;
  }
}

function removeTooltipAttributesDeep(element = null) {
  if (!element) return false;

  removeTooltipAttributes(element);

  try {
    element
      .querySelectorAll(
        "[title], [data-tooltip], [data-i18n-data-tooltip], [aria-describedby]"
      )
      .forEach((node) => {
        removeTooltipAttributes(node);
      });

    return true;
  } catch {
    return false;
  }
}

function normalizeString(value = "") {
  return safeText(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getBaseOrigin() {
  try {
    if (
      isBrowser() &&
      window.location?.origin
    ) {
      return window.location.origin;
    }
  } catch {}

  return "http://localhost";
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function setDatasetValue(element = null, key = "", value = "") {
  if (!element || !key) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete element.dataset[key];
      return true;
    }

    element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   MODULE / AUTH-LIKE SOURCES
========================================================= */

function callUserGetter(source = null, methodName = "") {
  if (!source || !methodName) {
    return null;
  }

  try {
    if (isFn(source?.[methodName])) {
      return source[methodName]();
    }
  } catch {}

  return null;
}

function getModule(AppCore = null, name = "") {
  const cleanName = safeText(name, "");

  if (!AppCore || !cleanName) {
    return null;
  }

  try {
    if (isFn(AppCore?.modules?.get)) {
      const value = AppCore.modules.get(cleanName);
      if (value) return value;
    }
  } catch {}

  try {
    return AppCore?.modules?.[cleanName] || null;
  } catch {
    return null;
  }
}

function getAuthLikeSources(AppCore = null) {
  return [
    AppCore?.Auth,
    AppCore?.auth,
    AppCore?.features?.auth,
    AppCore?.state?.auth,

    getModule(AppCore, "Auth"),
    getModule(AppCore, "auth"),
    getModule(AppCore, "Session"),
    getModule(AppCore, "session"),
  ].filter(Boolean);
}

function getUserFromAuthLikeSources(AppCore = null) {
  const sources = getAuthLikeSources(AppCore);

  for (const source of sources) {
    const user = first(
      callUserGetter(source, "getUser"),
      callUserGetter(source, "getCurrentUser"),
      callUserGetter(source, "currentUser"),

      source?.user,
      source?.currentUser,
      source?.state?.user,
      source?.state?.currentUser,
      source?.session?.user
    );

    if (user && typeof user === "object") {
      return safeObject(user);
    }
  }

  return {};
}

/* =========================================================
   STORAGE USER FALLBACK
========================================================= */

function tryParseJson(value = "") {
  const text = safeText(value, "");

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readStorageValue(key = "") {
  if (!isBrowser()) {
    return "";
  }

  const cleanKey = safeText(key, "");

  if (!cleanKey) {
    return "";
  }

  try {
    return safeText(window.localStorage?.getItem?.(cleanKey), "");
  } catch {}

  try {
    return safeText(window.sessionStorage?.getItem?.(cleanKey), "");
  } catch {}

  return "";
}

function getStoragePrefix(AppCore = null) {
  return safeText(
    AppCore?.config?.storagePrefix,
    "onion"
  );
}

function getStoredUserFallback(AppCore = null) {
  const prefix = getStoragePrefix(AppCore);

  const keys = [
    "user",
    "currentUser",
    "auth.user",
    "session.user",
    "auth:user",
    "session:user",

    "onion:user",
    "onion_user",
    "onion:auth:user",
    "onion:session:user",

    `${prefix}:user`,
    `${prefix}_user`,
    `${prefix}:auth:user`,
    `${prefix}:session:user`,
  ];

  for (const key of keys) {
    const raw = readStorageValue(key);
    const parsed = tryParseJson(raw);

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed;
    }
  }

  return {};
}

/* =========================================================
   USER RESOLUTION
========================================================= */

export function getUser(AppCore) {
  const state = safeObject(AppCore?.state);

  let user = first(
    state.user,
    state.currentUser,
    state.sessionUser,
    state.authUser,
    state.profile,

    state.session?.user,
    state.session?.currentUser,
    state.session?.profile,

    state.auth?.user,
    state.auth?.currentUser
  );

  if (!user || typeof user !== "object") {
    try {
      user = first(
        callUserGetter(AppCore, "getUser"),
        callUserGetter(AppCore, "getCurrentUser"),
        callUserGetter(AppCore, "currentUser")
      );
    } catch {}
  }

  if (!user || typeof user !== "object") {
    user = getUserFromAuthLikeSources(AppCore);
  }

  if (!user || typeof user !== "object") {
    user = getStoredUserFallback(AppCore);
  }

  return safeObject(user);
}

function getProfileLikeBranches(user = null) {
  const current = safeObject(user);

  return [
    current,

    safeObject(current.profile),
    safeObject(current.account),
    safeObject(current.customer),
    safeObject(current.client),
    safeObject(current.cliente),
    safeObject(current.meta),
    safeObject(current.claims),
    safeObject(current.permissions),

    safeObject(current.raw),
    safeObject(current.raw?.profile),
    safeObject(current.raw?.account),
    safeObject(current.raw?.customer),
    safeObject(current.raw?.client),
    safeObject(current.raw?.cliente),
    safeObject(current.raw?.meta),
    safeObject(current.raw?.claims),
    safeObject(current.raw?.permissions),

    safeObject(current.profile?.account),
    safeObject(current.account?.profile),
    safeObject(current.meta?.profile),
    safeObject(current.claims?.profile),
  ];
}

/* =========================================================
   DISPLAY / USERNAME
========================================================= */

export function getDisplayName(AppCore, user = null) {
  const currentUser = safeObject(user || getUser(AppCore));
  const branches = getProfileLikeBranches(currentUser);

  try {
    if (isFn(AppCore?.getUserDisplayName)) {
      const value = safeText(
        AppCore.getUserDisplayName(currentUser),
        ""
      );

      if (value) return value;
    }
  } catch {}

  try {
    if (isFn(AppCore?.utils?.getUserDisplayName)) {
      const value = safeText(
        AppCore.utils.getUserDisplayName(currentUser),
        ""
      );

      if (value) return value;
    }
  } catch {}

  const value = first(
    ...branches.flatMap((branch) => [
      branch.displayName,
      branch.display_name,
      branch.fullName,
      branch.full_name,
      branch.name,
      branch.nombre,
      branch.razonSocial,
      branch.razon_social,
      branch.company,
      branch.companyName,
      branch.company_name,

      branch.firstName && branch.lastName
        ? `${branch.firstName} ${branch.lastName}`
        : null,

      branch.first_name && branch.last_name
        ? `${branch.first_name} ${branch.last_name}`
        : null,

      branch.given_name && branch.family_name
        ? `${branch.given_name} ${branch.family_name}`
        : null,

      branch.username,
      branch.userName,
      branch.user_name,
      branch.preferred_username,
      branch.email,
      branch.mail,
      branch.phone,
      branch.telefono,
    ])
  );

  return safeText(
    value,
    DEFAULT_DISPLAY_NAME
  );
}

function sanitizeUsername(value = "") {
  return normalizeString(value)
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

function usernameFromEmail(email = "") {
  const text = safeText(email, "");

  if (!text.includes("@")) {
    return "";
  }

  return sanitizeUsername(
    text.split("@")[0]
  );
}

export function getUsername(AppCore, user = null) {
  const currentUser = safeObject(user || getUser(AppCore));
  const branches = getProfileLikeBranches(currentUser);

  try {
    if (isFn(AppCore?.getUserUsername)) {
      const value = sanitizeUsername(
        AppCore.getUserUsername(currentUser)
      );

      if (value) return value;
    }
  } catch {}

  try {
    if (isFn(AppCore?.utils?.getUserUsername)) {
      const value = sanitizeUsername(
        AppCore.utils.getUserUsername(currentUser)
      );

      if (value) return value;
    }
  } catch {}

  const direct = sanitizeUsername(
    first(
      ...branches.flatMap((branch) => [
        branch.username,
        branch.userName,
        branch.user_name,
        branch.preferred_username,
        branch.slug,
        branch.nick,
        branch.alias,
        branch.handle,
        branch.userId,
        branch.user_id,
      ])
    )
  );

  if (direct) {
    return direct;
  }

  return usernameFromEmail(
    first(
      ...branches.flatMap((branch) => [
        branch.email,
        branch.mail,
        branch.upn,
      ])
    )
  );
}

/* =========================================================
   AVATAR TEXT
========================================================= */

function extractInitialsFromText(value = "") {
  const text = safeText(value, "");

  if (!text) {
    return "";
  }

  const parts = normalizeString(text)
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 2);

  return initials;
}

export function getAvatarText(AppCore, user = null) {
  const currentUser = safeObject(user || getUser(AppCore));

  const explicit = safeText(
    first(
      currentUser.avatarText,
      currentUser.avatar_text,
      currentUser.initials,
      currentUser.iniciales,
      currentUser.raw?.avatarText,
      currentUser.raw?.initials,
      currentUser.profile?.avatarText,
      currentUser.profile?.initials
    ),
    ""
  );

  if (explicit) {
    return explicit
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 2)
      .toUpperCase() || DEFAULT_AVATAR_TEXT;
  }

  const displayName = getDisplayName(
    AppCore,
    currentUser
  );

  const username = getUsername(
    AppCore,
    currentUser
  );

  const email = safeText(
    first(
      currentUser.email,
      currentUser.mail,
      currentUser.raw?.email,
      currentUser.profile?.email,
      currentUser.claims?.email
    ),
    ""
  );

  const initials =
    extractInitialsFromText(displayName) ||
    extractInitialsFromText(username) ||
    extractInitialsFromText(email);

  if (initials) {
    return initials;
  }

  return DEFAULT_AVATAR_TEXT;
}

/* =========================================================
   AVATAR URL
========================================================= */

function getAvatarUpdatedAt(user = null) {
  const currentUser = safeObject(user);
  const branches = getProfileLikeBranches(currentUser);

  return safeText(
    first(
      ...branches.flatMap((branch) => [
        branch.avatarUpdatedAt,
        branch.avatar_updated_at,
        branch.pictureUpdatedAt,
        branch.picture_updated_at,
        branch.photoUpdatedAt,
        branch.photo_updated_at,
        branch.imageUpdatedAt,
        branch.image_updated_at,

        branch.avatarVersion,
        branch.avatar_version,
        branch.pictureVersion,
        branch.picture_version,
        branch.photoVersion,
        branch.photo_version,

        branch.updatedAt,
        branch.updated_at,
        branch.modifiedAt,
        branch.modified_at,
        branch.version,
        branch.etag,
        branch._etag,
      ])
    ),
    ""
  );
}

function userHasAvatar(user = null) {
  const currentUser = safeObject(user);
  const branches = getProfileLikeBranches(currentUser);

  const rawValue = first(
    ...branches.flatMap((branch) => [
      branch.hasAvatar,
      branch.has_avatar,
      branch.avatarEnabled,
      branch.avatar_enabled,
      branch.hasPhoto,
      branch.has_photo,
      branch.hasPicture,
      branch.has_picture,
    ])
  );

  if (rawValue === null || rawValue === undefined) {
    return true;
  }

  return safeBoolean(rawValue, false);
}

function sanitizeAvatarUrl(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  const compact = raw.replace(/\s+/g, "");
  const lower = compact.toLowerCase();

  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("data:text/") ||
    lower.startsWith("data:application/") ||
    lower.startsWith("data:audio/") ||
    lower.startsWith("data:video/")
  ) {
    return "";
  }

  if (
    lower.startsWith("data:") &&
    !lower.startsWith("data:image/")
  ) {
    return "";
  }

  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("/") ||
    lower.startsWith("./") ||
    lower.startsWith("../") ||
    lower.startsWith("blob:") ||
    lower.startsWith("data:image/")
  ) {
    return raw;
  }

  /*
    Ruta relativa simple tipo "uploads/avatar.png".
  */
  if (/^[a-zA-Z0-9._~:/?#@!$&'()*+,;=%-]+$/.test(raw)) {
    return raw.startsWith("/")
      ? raw
      : `/${raw}`;
  }

  return "";
}

function appendAvatarCacheBust(url = "", updatedAt = "") {
  const cleanUrl = sanitizeAvatarUrl(url);
  const cleanUpdatedAt = safeText(updatedAt, "");

  if (!cleanUrl || !cleanUpdatedAt) {
    return cleanUrl;
  }

  const lower = cleanUrl.toLowerCase();

  if (
    lower.startsWith("data:") ||
    lower.startsWith("blob:")
  ) {
    return cleanUrl;
  }

  try {
    const parsed = new URL(
      cleanUrl,
      getBaseOrigin()
    );

    parsed.searchParams.set(
      AVATAR_CACHE_PARAM,
      cleanUpdatedAt
    );

    if (
      cleanUrl.startsWith("/") ||
      cleanUrl.startsWith("./") ||
      cleanUrl.startsWith("../")
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    return parsed.toString();
  } catch {
    return cleanUrl;
  }
}

export function getAvatarUrl(user = null) {
  const currentUser = safeObject(user);

  if (!Object.keys(currentUser).length) {
    return "";
  }

  if (!userHasAvatar(currentUser)) {
    return "";
  }

  const branches = getProfileLikeBranches(currentUser);

  const explicitAvatar = first(
    ...branches.flatMap((branch) => [
      branch.avatar,
      branch.avatarUrl,
      branch.avatar_url,
      branch.avatarURI,
      branch.avatar_uri,

      branch.photo,
      branch.photoUrl,
      branch.photo_url,

      branch.image,
      branch.imageUrl,
      branch.image_url,

      branch.profileImage,
      branch.profileImageUrl,
      branch.profile_image,
      branch.profile_image_url,

      branch.picture,
      branch.pictureUrl,
      branch.picture_url,
      branch.pictureURI,
      branch.picture_uri,

      branch.logo,
      branch.logoUrl,
      branch.logo_url,
    ])
  );

  const avatar = sanitizeAvatarUrl(explicitAvatar);

  if (!avatar) {
    return "";
  }

  return appendAvatarCacheBust(
    avatar,
    getAvatarUpdatedAt(currentUser)
  );
}

/* =========================================================
   ROLE HELPERS
========================================================= */

function normalizeRole(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.*/-]/g, "")
    .trim();
}

function flattenRoleValue(value, depth = 0) {
  if (depth > 8) {
    return [];
  }

  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      flattenRoleValue(item, depth + 1)
    );
  }

  if (typeof value === "string") {
    return value
      .split(/[,\s|;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return [value];
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);

    const truthyKeys = entries
      .filter(([, entryValue]) => safeBoolean(entryValue, false))
      .map(([key]) => key);

    return [
      value.role,
      value.rol,
      value.name,
      value.key,
      value.value,
      value.id,
      value.code,
      value.slug,
      value.type,
      value.scope,
      value.permission,
      value.authority,

      value.roles,
      value.roleList,
      value.role_list,
      value.permissions,
      value.scopes,
      value.groups,
      value.authorities,
      value.items,
      value.list,

      ...truthyKeys,
    ].flatMap((item) =>
      flattenRoleValue(item, depth + 1)
    );
  }

  return [];
}

function normalizeRoles(value) {
  return flattenRoleValue(value)
    .flat(Infinity)
    .map(normalizeRole)
    .filter(Boolean);
}

function isAdminRole(value = "") {
  return ADMIN_ROLE_KEYS.has(normalizeRole(value));
}

function isAdminPermission(value = "") {
  const key = normalizeRole(value);

  if (!key) {
    return false;
  }

  if (ADMIN_PERMISSION_KEYS.has(key)) {
    return true;
  }

  return (
    key.startsWith("admin:") ||
    key.startsWith("admin.") ||
    key.includes(":admin") ||
    key.includes(".admin") ||
    key.endsWith(":manage") ||
    key.endsWith(".manage")
  );
}

function collectRoleCandidates(AppCore, user = null) {
  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session);
  const current = safeObject(user || getUser(AppCore));
  const branches = getProfileLikeBranches(current);

  const authLikeSources = getAuthLikeSources(AppCore);

  const authRoleCandidates = authLikeSources.flatMap((source) => {
    return [
      source?.role,
      source?.rol,
      source?.userRole,
      source?.roles,
      source?.permissions,
      source?.scopes,

      source?.state?.role,
      source?.state?.roles,
      source?.state?.permissions,

      callUserGetter(source, "getRole"),
      callUserGetter(source, "getCurrentRole"),
      callUserGetter(source, "getRoles"),
      callUserGetter(source, "getPermissions"),
      callUserGetter(source, "getScopes"),
    ];
  });

  const directRoles = [
    state.role,
    state.rol,
    state.userRole,
    state.user_role,
    state.type,
    state.userType,
    state.user_type,

    session.role,
    session.rol,
    session.userRole,
    session.user_role,
    session.type,
    session.userType,
    session.user_type,

    ...branches.flatMap((branch) => [
      branch.role,
      branch.rol,
      branch.userRole,
      branch.user_role,
      branch.type,
      branch.userType,
      branch.user_type,
      branch.perfil,
      branch.scope,
      branch.permission,
      branch.authority,

      branch["custom:role"],
      branch["custom:roles"],
      branch["custom:permissions"],

      branch["https://onion/role"],
      branch["https://onion/roles"],
      branch["https://onion/permissions"],
    ]),
  ];

  const arrayRoles = [
    state.roles,
    state.roleList,
    state.role_list,
    state.permissions,
    state.scopes,
    state.groups,
    state.authorities,

    session.roles,
    session.roleList,
    session.role_list,
    session.permissions,
    session.scopes,
    session.groups,
    session.authorities,

    ...branches.flatMap((branch) => [
      branch.roles,
      branch.roleList,
      branch.role_list,
      branch.permissions,
      branch.scopes,
      branch.groups,
      branch.authorities,
      branch.items,
      branch.list,
    ]),
  ];

  return normalizeRoles([
    ...directRoles,
    ...arrayRoles,
    ...authRoleCandidates,
  ]);
}

function hasAdminFlag(AppCore, user = null) {
  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session);
  const current = safeObject(user || getUser(AppCore));
  const branches = getProfileLikeBranches(current);

  const authLikeSources = getAuthLikeSources(AppCore);

  const authFlags = authLikeSources.flatMap((source) => [
    source?.isAdmin,
    source?.admin,
    source?.isSuperAdmin,
    source?.superAdmin,
    source?.canManageUsers,
    source?.canAccessUsers,

    callUserGetter(source, "isAdmin"),
    callUserGetter(source, "isCurrentUserAdmin"),
    callUserGetter(source, "canManageUsers"),
    callUserGetter(source, "canAccessUsers"),
  ]);

  return [
    state.isAdmin,
    state.admin,
    state.isSuperAdmin,
    state.superAdmin,
    state.canManageUsers,
    state.canAccessUsers,

    session.isAdmin,
    session.admin,
    session.isSuperAdmin,
    session.superAdmin,
    session.canManageUsers,
    session.canAccessUsers,

    ...branches.flatMap((branch) => [
      branch.isAdmin,
      branch.admin,
      branch.is_admin,
      branch.isSuperAdmin,
      branch.superAdmin,
      branch.is_super_admin,
      branch.canManageUsers,
      branch.can_manage_users,
      branch.canAccessUsers,
      branch.can_access_users,
    ]),

    ...authFlags,
  ].some((value) => safeBoolean(value, false));
}

export function isAdmin(AppCore, user = null) {
  const currentUser = safeObject(user || getUser(AppCore));

  if (hasAdminFlag(AppCore, currentUser)) {
    return true;
  }

  return collectRoleCandidates(AppCore, currentUser).some((role) => {
    return isAdminRole(role) || isAdminPermission(role);
  });
}

/* =========================================================
   AVATAR DOM HELPERS
========================================================= */

function getAvatarNodes(avatarEl) {
  if (!avatarEl) {
    return {
      imgEl: null,
      fallbackEl: null,
    };
  }

  let imgEl = null;
  let fallbackEl = null;

  try {
    imgEl =
      avatarEl.querySelector(`#${SIDEBAR_AVATAR_IMAGE_ID}`) ||
      avatarEl.querySelector(".avatar-image") ||
      avatarEl.querySelector("img") ||
      null;
  } catch {}

  try {
    fallbackEl =
      avatarEl.querySelector(`#${SIDEBAR_AVATAR_FALLBACK_ID}`) ||
      avatarEl.querySelector(".avatar-fallback") ||
      null;
  } catch {}

  return {
    imgEl,
    fallbackEl,
  };
}

function syncAvatarBaseAttrs(avatarEl, displayName) {
  if (!avatarEl) return;

  const finalDisplayName = safeText(
    displayName,
    DEFAULT_DISPLAY_NAME
  );

  try {
    avatarEl.setAttribute(
      "aria-label",
      `Avatar de ${finalDisplayName}`
    );

    avatarEl.dataset.displayName = finalDisplayName;
  } catch {}

  removeTooltipAttributesDeep(avatarEl);
}

function clearImageNode(imgEl = null) {
  if (!imgEl) return;

  try {
    imgEl.onload = null;
    imgEl.onerror = null;

    imgEl.hidden = true;
    imgEl.removeAttribute("src");
    imgEl.removeAttribute("srcset");
    imgEl.removeAttribute("sizes");
    imgEl.removeAttribute("title");
    imgEl.removeAttribute("data-tooltip");
    imgEl.removeAttribute("data-i18n-data-tooltip");
    imgEl.removeAttribute("aria-describedby");
  } catch {}
}

function normalizeAvatarText(value = "") {
  return safeText(value, DEFAULT_AVATAR_TEXT)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase() || DEFAULT_AVATAR_TEXT;
}

function setFallbackNode({
  avatarEl,
  fallbackEl,
  text,
  visible,
}) {
  const finalText = normalizeAvatarText(text);

  if (fallbackEl) {
    try {
      fallbackEl.hidden = !visible;
      fallbackEl.textContent = finalText;
      fallbackEl.setAttribute("aria-hidden", "true");
      removeTooltipAttributes(fallbackEl);
    } catch {}

    return true;
  }

  /*
    Solo escribimos textContent directo si no hay nodos hijos estructurales.
    Evita destruir <img> + <span> del template.
  */
  if (avatarEl && visible) {
    try {
      if (!avatarEl.querySelector?.("img,.avatar-fallback")) {
        avatarEl.textContent = finalText;
        return true;
      }
    } catch {}
  }

  return false;
}

function setAvatarState(
  avatarEl,
  {
    hasImage = false,
    loading = false,
    url = "",
    error = false,
  } = {}
) {
  if (!avatarEl) {
    return false;
  }

  try {
    avatarEl.classList.toggle("has-image", Boolean(hasImage));
    avatarEl.classList.toggle("has-fallback", !hasImage);
    avatarEl.classList.toggle("is-loading", Boolean(loading));
    avatarEl.classList.toggle("has-error", Boolean(error));

    avatarEl.dataset.hasImage = hasImage ? "true" : "false";
    avatarEl.dataset.loading = loading ? "true" : "false";
    avatarEl.dataset.avatarError = error ? "true" : "false";

    if (url) {
      avatarEl.dataset.avatarUrl = url;
    } else {
      delete avatarEl.dataset.avatarUrl;
    }

    return true;
  } catch {
    return false;
  }
}

function nextAvatarRenderSeq(avatarEl = null) {
  if (!avatarEl) {
    return "0";
  }

  const current =
    Number(avatarEl.dataset?.[AVATAR_RENDER_SEQ_DATASET_KEY] || 0);

  const next =
    Number.isFinite(current)
      ? current + 1
      : nowMs();

  try {
    avatarEl.dataset[AVATAR_RENDER_SEQ_DATASET_KEY] = String(next);
  } catch {}

  return String(next);
}

function isCurrentAvatarRenderSeq(avatarEl = null, seq = "") {
  if (!avatarEl) {
    return false;
  }

  try {
    return avatarEl.dataset?.[AVATAR_RENDER_SEQ_DATASET_KEY] === String(seq);
  } catch {
    return false;
  }
}

/* =========================================================
   AVATAR RENDER
========================================================= */

export function renderAvatarFallback(
  avatarEl,
  displayName = DEFAULT_DISPLAY_NAME,
  avatarText = DEFAULT_AVATAR_TEXT
) {
  if (!avatarEl) return false;

  const finalDisplayName = safeText(
    displayName,
    DEFAULT_DISPLAY_NAME
  );

  const finalAvatarText = normalizeAvatarText(
    avatarText
  );

  const {
    imgEl,
    fallbackEl,
  } = getAvatarNodes(avatarEl);

  nextAvatarRenderSeq(avatarEl);

  syncAvatarBaseAttrs(
    avatarEl,
    finalDisplayName
  );

  clearImageNode(imgEl);

  setFallbackNode({
    avatarEl,
    fallbackEl,
    text: finalAvatarText,
    visible: true,
  });

  setAvatarState(avatarEl, {
    hasImage: false,
    loading: false,
    url: "",
    error: false,
  });

  return true;
}

export function renderAvatarImage(
  avatarEl,
  avatarUrl,
  displayName = DEFAULT_DISPLAY_NAME,
  avatarText = DEFAULT_AVATAR_TEXT,
  options = {}
) {
  if (!avatarEl) return false;

  const AppCore = options?.AppCore || null;
  const safeUrl = sanitizeAvatarUrl(avatarUrl);

  if (!safeUrl) {
    return renderAvatarFallback(
      avatarEl,
      displayName,
      avatarText
    );
  }

  const finalDisplayName = safeText(
    displayName,
    DEFAULT_DISPLAY_NAME
  );

  const finalAvatarText = normalizeAvatarText(
    avatarText
  );

  const {
    imgEl,
    fallbackEl,
  } = getAvatarNodes(avatarEl);

  if (!imgEl) {
    return renderAvatarFallback(
      avatarEl,
      finalDisplayName,
      finalAvatarText
    );
  }

  const renderSeq =
    nextAvatarRenderSeq(avatarEl);

  syncAvatarBaseAttrs(
    avatarEl,
    finalDisplayName
  );

  /*
    Fallback visible mientras carga.
    Así una imagen lenta/rota no deja avatar vacío.
  */
  setFallbackNode({
    avatarEl,
    fallbackEl,
    text: finalAvatarText,
    visible: true,
  });

  setAvatarState(avatarEl, {
    hasImage: false,
    loading: true,
    url: safeUrl,
    error: false,
  });

  try {
    imgEl.hidden = true;
    imgEl.alt = `Avatar de ${finalDisplayName}`;
    imgEl.loading = "eager";
    imgEl.decoding = "async";
    imgEl.draggable = false;

    /*
      Evita mandar referrer a avatares externos.
      No rompe rutas internas.
    */
    try {
      imgEl.referrerPolicy = "no-referrer";
    } catch {}

    removeTooltipAttributes(imgEl);

    imgEl.onload = () => {
      if (!isCurrentAvatarRenderSeq(avatarEl, renderSeq)) {
        return;
      }

      try {
        imgEl.hidden = false;
      } catch {}

      setFallbackNode({
        avatarEl,
        fallbackEl,
        text: finalAvatarText,
        visible: false,
      });

      setAvatarState(avatarEl, {
        hasImage: true,
        loading: false,
        url: safeUrl,
        error: false,
      });

      safeEmit(
        AppCore,
        EVENTS.userAvatarLoaded,
        {
          url: safeUrl,
          displayName: finalDisplayName,
        }
      );
    };

    imgEl.onerror = () => {
      if (!isCurrentAvatarRenderSeq(avatarEl, renderSeq)) {
        return;
      }

      setAvatarState(avatarEl, {
        hasImage: false,
        loading: false,
        url: "",
        error: true,
      });

      safeEmit(
        AppCore,
        EVENTS.userAvatarError,
        {
          url: safeUrl,
          displayName: finalDisplayName,
        }
      );

      renderAvatarFallback(
        avatarEl,
        finalDisplayName,
        finalAvatarText
      );
    };

    /*
      Limpiamos primero para forzar recarga si cambia token SAS/cache-bust.
    */
    try {
      imgEl.removeAttribute("src");
    } catch {}

    imgEl.src = safeUrl;

    /*
      Si la imagen ya está en caché y naturalWidth existe,
      forzamos commit sin esperar evento.
    */
    if (
      imgEl.complete === true &&
      Number(imgEl.naturalWidth || 0) > 0
    ) {
      imgEl.onload?.();
    }
  } catch {
    return renderAvatarFallback(
      avatarEl,
      finalDisplayName,
      finalAvatarText
    );
  }

  return true;
}

/* =========================================================
   USER PLAN / FOOTER HELPERS
========================================================= */

function getPlanLabel(AppCore, user = null) {
  const state = safeObject(AppCore?.state);
  const currentUser = safeObject(user || getUser(AppCore));
  const branches = getProfileLikeBranches(currentUser);

  const value = first(
    state.plan,
    state.subscriptionPlan,
    state.subscription?.plan,
    state.account?.plan,

    ...branches.flatMap((branch) => [
      branch.plan,
      branch.planName,
      branch.plan_name,
      branch.subscriptionPlan,
      branch.subscription_plan,
      branch.subscription?.plan,
      branch.account?.plan,
      branch.billing?.plan,
    ])
  );

  return safeText(value, DEFAULT_PLAN_LABEL);
}

function getPlanElement(userToggle = null) {
  if (!userToggle) {
    return null;
  }

  try {
    return (
      userToggle.querySelector(`#${SIDEBAR_USER_PLAN_ID}`) ||
      userToggle.querySelector(".plan") ||
      null
    );
  } catch {
    return null;
  }
}

function setUserDataset(element = null, {
  username = "",
  displayName = "",
  admin = false,
  avatarUrl = "",
} = {}) {
  if (!element) {
    return false;
  }

  setDatasetValue(element, "username", username || "");
  setDatasetValue(element, "displayName", displayName || "");
  setDatasetValue(element, "admin", admin ? "true" : "false");
  setDatasetValue(element, "avatarUrl", avatarUrl || "");

  return true;
}

/* =========================================================
   USER UI
========================================================= */

export function renderUser(AppCore) {
  const {
    nameEl,
    avatarEl,
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  const user = getUser(AppCore);

  const displayName = getDisplayName(
    AppCore,
    user
  );

  const avatarText = getAvatarText(
    AppCore,
    user
  );

  const username = getUsername(
    AppCore,
    user
  );

  const avatarUrl = getAvatarUrl(user);

  const admin = isAdmin(AppCore, user);

  const planLabel = getPlanLabel(
    AppCore,
    user
  );

  if (nameEl) {
    try {
      nameEl.textContent = displayName;

      setUserDataset(nameEl, {
        username,
        displayName,
        admin,
        avatarUrl,
      });

      removeTooltipAttributes(nameEl);
    } catch {}
  }

  if (avatarEl) {
    if (avatarUrl) {
      renderAvatarImage(
        avatarEl,
        avatarUrl,
        displayName,
        avatarText,
        {
          AppCore,
        }
      );
    } else {
      renderAvatarFallback(
        avatarEl,
        displayName,
        avatarText
      );
    }

    try {
      setUserDataset(avatarEl, {
        username,
        displayName,
        admin,
        avatarUrl,
      });

      removeTooltipAttributesDeep(avatarEl);
    } catch {}
  }

  if (userToggle) {
    try {
      userToggle.setAttribute(
        "aria-label",
        `Abrir menú de usuario de ${displayName}`
      );

      userToggle.setAttribute(
        "aria-haspopup",
        "menu"
      );

      if (!userToggle.getAttribute("aria-expanded")) {
        userToggle.setAttribute("aria-expanded", "false");
      }

      setUserDataset(userToggle, {
        username,
        displayName,
        admin,
        avatarUrl,
      });

      removeTooltipAttributes(userToggle);

      const planEl =
        getPlanElement(userToggle);

      if (planEl) {
        planEl.textContent = planLabel;
        removeTooltipAttributes(planEl);
      }
    } catch {}
  }

  if (userDropdown) {
    try {
      setUserDataset(userDropdown, {
        username,
        displayName,
        admin,
        avatarUrl,
      });

      removeTooltipAttributes(userDropdown);
    } catch {}
  }

  try {
    sanitizeFooterTooltipState(AppCore);
  } catch (error) {
    safeWarn(
      AppCore,
      "sanitizeFooterTooltipState falló tras renderUser.",
      error
    );
  }

  const snapshot = {
    user,
    displayName,
    avatarText,
    avatarUrl: avatarUrl || null,
    username: username || null,
    planLabel,
    isAdmin: admin,
    roles: collectRoleCandidates(AppCore, user),
  };

  safeEmit(
    AppCore,
    EVENTS.userRendered,
    snapshot
  );

  return snapshot;
}

/* =========================================================
   DEBUG
========================================================= */

export function getSidebarUserSnapshot(AppCore) {
  const {
    nameEl,
    avatarEl,
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  const user = getUser(AppCore);
  const displayName = getDisplayName(AppCore, user);
  const username = getUsername(AppCore, user);
  const avatarText = getAvatarText(AppCore, user);
  const avatarUrl = getAvatarUrl(user);

  const roles = collectRoleCandidates(AppCore, user);

  return {
    hasWindow: hasWindow(),

    hasUser:
      Boolean(Object.keys(user).length),

    user,

    displayName,
    username: username || null,
    avatarText,
    avatarUrl: avatarUrl || null,
    planLabel:
      getPlanLabel(AppCore, user),

    isAdmin:
      isAdmin(AppCore, user),

    roles,

    dom: {
      hasName:
        Boolean(nameEl),

      nameText:
        nameEl?.textContent || "",

      nameDataset:
        { ...(nameEl?.dataset || {}) },

      hasAvatar:
        Boolean(avatarEl),

      avatarClasses:
        avatarEl?.className || "",

      avatarHasImage:
        avatarEl?.dataset?.hasImage || "",

      avatarLoading:
        avatarEl?.dataset?.loading || "",

      avatarError:
        avatarEl?.dataset?.avatarError || "",

      avatarUrl:
        avatarEl?.dataset?.avatarUrl || "",

      avatarSeq:
        avatarEl?.dataset?.[AVATAR_RENDER_SEQ_DATASET_KEY] || "",

      hasUserToggle:
        Boolean(userToggle),

      userToggleAriaLabel:
        userToggle?.getAttribute?.("aria-label") || "",

      userToggleAriaExpanded:
        userToggle?.getAttribute?.("aria-expanded") || "",

      userToggleDataset:
        { ...(userToggle?.dataset || {}) },

      hasUserDropdown:
        Boolean(userDropdown),

      userDropdownAriaHidden:
        userDropdown?.getAttribute?.("aria-hidden") || "",

      userDropdownDataset:
        { ...(userDropdown?.dataset || {}) },
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  getUser,
  getDisplayName,
  getUsername,
  getAvatarText,
  getAvatarUrl,
  isAdmin,

  renderAvatarFallback,
  renderAvatarImage,
  renderUser,

  getSidebarUserSnapshot,
};
