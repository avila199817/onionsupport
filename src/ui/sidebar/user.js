/* =========================================================
   Onion SPA - Sidebar User
   Archivo: src/ui/sidebar/user.js

   SIDEBAR USER · SIMPLE
   - resuelve usuario desde contexto/AppCore/Auth
   - footer/greetings priorizan user.name real
   - pinta nombre, plan y avatar
   - avatar seguro con fallback Unicode
   - admin por rol/permiso/flags
   - snapshots sin tokens ni DOM pesado
   - sin storage fallback ni lógica paralela
========================================================= */

import {
  getElements,
  sanitizeFooterTooltipState,
} from "./dom.js";

import {
  SIDEBAR_AVATAR_IMAGE_ID,
  SIDEBAR_AVATAR_FALLBACK_ID,
  SIDEBAR_USER_PLAN_ID,
  SIDEBAR_EVENTS,
  SIDEBAR_ADMIN_ROLE_KEYS,
  SIDEBAR_ADMIN_PERMISSION_KEYS,
  SIDEBAR_ADMIN_FLAG_KEYS,
} from "./constants.js";

export const SIDEBAR_USER_VERSION = "sidebar-user-v17-simple";

const DEFAULT_DISPLAY_NAME = "Usuario";
const DEFAULT_AVATAR_TEXT = "ON";
const DEFAULT_PLAN_LABEL = "Go Plan";

const SOURCE = "SidebarUser";
const OWNER = "user.js";
const LOG_PREFIX = "[SidebarUser]";

const AVATAR_RENDER_SEQ_DATASET_KEY = "avatarRenderSeq";
const AVATAR_URL_HASH_DATASET_KEY = "avatarUrlHash";

const AVATAR_GRADIENTS = Object.freeze([
  "linear-gradient(135deg, #6f59d9, #38bdf8)",
  "linear-gradient(135deg, #ec4899, #8b5cf6)",
  "linear-gradient(135deg, #22c55e, #14b8a6)",
  "linear-gradient(135deg, #f97316, #ef4444)",
  "linear-gradient(135deg, #0ea5e9, #6366f1)",
  "linear-gradient(135deg, #a855f7, #f43f5e)",
  "linear-gradient(135deg, #14b8a6, #6366f1)",
  "linear-gradient(135deg, #f59e0b, #ec4899)",
  "linear-gradient(135deg, #64748b, #0f172a)",
]);

const DEFAULT_ADMIN_ROLE_KEYS = Object.freeze([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "owner",
  "root",
]);

const DEFAULT_ADMIN_PERMISSION_KEYS = Object.freeze([
  "*",
  "admin",
  "admin:*",
  "admin:manage",
  "users:manage",
  "usuarios:manage",
  "server:manage",
  "servidor:manage",
  "settings:manage",
  "ajustes:manage",
  "billing:manage",
  "facturas:manage",
]);

const DEFAULT_ADMIN_FLAG_KEYS = Object.freeze([
  "isAdmin",
  "admin",
  "is_admin",
  "isSuperAdmin",
  "superAdmin",
  "super_admin",
  "canManageUsers",
  "canAccessUsers",
  "canManageServer",
  "canAccessServer",
  "canManageSettings",
  "canAccessSettings",
  "canManageBilling",
]);

const ADMIN_ROLE_KEYS = Array.isArray(SIDEBAR_ADMIN_ROLE_KEYS) && SIDEBAR_ADMIN_ROLE_KEYS.length
  ? SIDEBAR_ADMIN_ROLE_KEYS
  : DEFAULT_ADMIN_ROLE_KEYS;

const ADMIN_PERMISSION_KEYS = Array.isArray(SIDEBAR_ADMIN_PERMISSION_KEYS) && SIDEBAR_ADMIN_PERMISSION_KEYS.length
  ? SIDEBAR_ADMIN_PERMISSION_KEYS
  : DEFAULT_ADMIN_PERMISSION_KEYS;

const ADMIN_FLAG_KEYS = Array.isArray(SIDEBAR_ADMIN_FLAG_KEYS) && SIDEBAR_ADMIN_FLAG_KEYS.length
  ? SIDEBAR_ADMIN_FLAG_KEYS
  : DEFAULT_ADMIN_FLAG_KEYS;

const INACTIVE_STATUSES = Object.freeze([
  "disabled",
  "inactive",
  "deleted",
  "blocked",
  "suspended",
  "banned",
  "revoked",
  "archived",
  "deactivated",
  "desactivado",
  "inactivo",
  "eliminado",
  "bloqueado",
  "suspendido",
  "archivado",
]);

const SAFE_DATA_IMAGE_PREFIXES = Object.freeze([
  "data:image/png",
  "data:image/jpeg",
  "data:image/jpg",
  "data:image/gif",
  "data:image/webp",
  "data:image/avif",
  "data:image/bmp",
]);

const EVENTS = Object.freeze({
  userRendered: SIDEBAR_EVENTS?.userRendered || "sidebar:user:rendered",
  userAvatarLoaded: SIDEBAR_EVENTS?.userAvatarLoaded || "sidebar:user:avatar:loaded",
  userAvatarError: SIDEBAR_EVENTS?.userAvatarError || "sidebar:user:avatar:error",
  userFallbackRendered: "sidebar:user:avatar:fallback",
  userAvatarColorReset: "sidebar:user:avatar:color:reset",
});

let memoryAvatarGradient = "";
let memoryAvatarGradientScope = "";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return [...value];
  if (value === null || value === undefined) return [];
  return [value];
}

function safeBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;

  const key = safeText(value, "").toLowerCase();
  if (["true", "yes", "si", "sí", "ok", "on", "active", "enabled"].includes(key)) return true;
  if (["false", "no", "off", "inactive", "disabled"].includes(key)) return false;

  return Boolean(fallback);
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) continue;
    return value;
  }

  return null;
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function normalizeString(value = "") {
  return safeText(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flat(Infinity)
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    ),
  ];
}

function isPlaceholderText(value = "") {
  const text = safeText(value, "").toLowerCase();
  return !text || ["null", "undefined", "false", "true", "nan", "none", "[object object]", "object object"].includes(text);
}

function coerceDisplayValue(value = "") {
  const text = safeText(value, "");
  return isPlaceholderText(text) ? "" : text;
}

function hashString(value = "") {
  const text = safeText(value, "");
  if (!text) return "";

  let hash = 2166136261;

  try {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `h${(hash >>> 0).toString(36)}`;
  } catch {
    return `h${text.length.toString(36)}`;
  }
}

function safeCssIdSelector(id = "") {
  const clean = safeText(id, "");
  if (!clean) return "";

  try {
    if (isBrowser() && window.CSS && isFn(window.CSS.escape)) return `#${window.CSS.escape(clean)}`;
  } catch {}

  return `#${clean.replace(/[^A-Za-z0-9_-]/g, "\\$&")}`;
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
      .querySelectorAll("[title], [data-tooltip], [data-i18n-data-tooltip], [aria-describedby]")
      .forEach((node) => removeTooltipAttributes(node));
    return true;
  } catch {
    return false;
  }
}

function setDatasetValue(element = null, key = "", value = "") {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined || value === "") delete element.dataset[key];
    else element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   REDACTION / EVENTS
========================================================= */

function redactSensitiveText(value = "") {
  const text = safeText(value, "");
  if (!text) return "";

  return text
    .replace(/([?&#](token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token|tempToken|temp_token|sig|signature)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function sanitizePayload(value, depth = 0) {
  if (depth > 5) return "[MaxDepth]";
  if (typeof value === "string") return redactSensitiveText(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "function") return "[Function]";

  if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizePayload(item, depth + 1));

  if (value instanceof Error) {
    return {
      name: safeText(value.name, "Error"),
      message: redactSensitiveText(value.message || ""),
      code: value.code || null,
      status: value.status || value.statusCode || null,
      stack: value.stack ? "[stack]" : null,
    };
  }

  if (value && typeof value === "object") {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      output[key] = /token|secret|password|authorization|credential|jwt|bearer|otp|code|sig|signature/i.test(key)
        ? item ? "***" : item
        : sanitizePayload(item, depth + 1);
    }

    return output;
  }

  return String(value);
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(LOG_PREFIX, ...args.map((item) => sanitizePayload(item)));
    return;
  } catch {}

  try {
    console.warn(LOG_PREFIX, ...args.map((item) => sanitizePayload(item)));
  } catch {}
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  const data = safeObject(payload);
  const finalPayload = sanitizePayload({
    ...data,
    source: safeText(data.source, SOURCE),
    owner: OWNER,
    version: SIDEBAR_USER_VERSION,
    at: safeText(data.at, safeIsoDate()),
    ts: data.ts || nowMs(),
  });

  try {
    if (isFn(AppCore?.events?.emit)) {
      AppCore.events.emit(name, finalPayload);
      return true;
    }
  } catch (error) {
    safeWarn(AppCore, `AppCore.events.emit("${name}") falló.`, error);
  }

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail: finalPayload }));
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   USER SOURCES
========================================================= */

function callGetter(source = null, methodName = "") {
  if (!source || !methodName) return null;

  try {
    if (isFn(source?.[methodName])) return source[methodName]();
  } catch {}

  return null;
}

function getModule(AppCore = null, name = "") {
  const clean = safeText(name, "");
  if (!AppCore || !clean) return null;

  try {
    return AppCore?.modules?.get?.(clean) || null;
  } catch {}

  try {
    return AppCore?.modules?.[clean] || null;
  } catch {
    return null;
  }
}

function getGlobalCandidate(name = "") {
  if (typeof window === "undefined") return null;

  try {
    return window?.[name] || null;
  } catch {
    return null;
  }
}

function uniqueObjects(values = []) {
  const seen = new Set();
  const output = [];

  values.forEach((value) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    output.push(value);
  });

  return output;
}

function getAuthLikeSources(AppCore = null) {
  return uniqueObjects([
    AppCore?.Auth,
    AppCore?.auth,
    AppCore?.features?.auth,
    getModule(AppCore, "Auth"),
    getModule(AppCore, "auth"),
    getGlobalCandidate("Auth"),
    getGlobalCandidate("OnionAuth"),
  ]);
}

function unwrapUserPayload(payload = null) {
  const value = safeObject(payload);
  if (!Object.keys(value).length) return {};

  return safeObject(first(
    value.user,
    value.usuario,
    value.currentUser,
    value.authUser,
    value.sessionUser,
    value.profile,
    value.account?.user,
    value.account,
    value.session?.user,
    value.sessionData?.user,
    value.data?.user,
    value.data?.usuario,
    value.payload?.user,
    value.result?.user,
    value.me,
    value
  ));
}

function getUserFromAuthLikeSources(AppCore = null) {
  for (const source of getAuthLikeSources(AppCore)) {
    const user = first(
      callGetter(source, "getUser"),
      callGetter(source, "getCurrentUser"),
      callGetter(source, "getProfile"),
      callGetter(source, "getSessionUser"),
      source?.user,
      source?.usuario,
      source?.currentUser,
      source?.profile,
      source?.state?.user,
      source?.state?.currentUser,
      source?.session?.user
    );

    const unwrapped = unwrapUserPayload(user);
    if (hasUsableUserIdentity(unwrapped)) return unwrapped;
  }

  return {};
}

export function getUser(AppCore, explicitUser = null) {
  const explicit = unwrapUserPayload(explicitUser);
  if (hasUsableUserIdentity(explicit)) return explicit;

  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session);
  const sessionData = safeObject(state.sessionData);

  const user = unwrapUserPayload(first(
    state.user,
    state.currentUser,
    state.authUser,
    state.sessionUser,
    state.profile,
    state.account,
    session.user,
    session.currentUser,
    session.profile,
    sessionData.user,
    state.auth?.user,
    callGetter(AppCore, "getUser"),
    callGetter(AppCore, "getCurrentUser"),
    callGetter(AppCore, "getProfile")
  ));

  if (hasUsableUserIdentity(user)) return user;

  const authUser = getUserFromAuthLikeSources(AppCore);
  if (hasUsableUserIdentity(authUser)) return authUser;

  return {};
}

function getProfileBranches(user = null) {
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
    safeObject(current.raw),
    safeObject(current.raw?.profile),
    safeObject(current.raw?.account),
  ].filter((item) => item && Object.keys(item).length);
}

function branchInactive(branch = null) {
  const current = safeObject(branch);
  if (!Object.keys(current).length) return false;

  const status = safeText(current.status || current.estado || current.state || current.accountStatus || "", "").toLowerCase();
  if (INACTIVE_STATUSES.includes(status)) return true;

  if (
    current.disabled === true ||
    current.isDisabled === true ||
    current.deleted === true ||
    current.isDeleted === true ||
    current.blocked === true ||
    current.isBlocked === true ||
    current.suspended === true ||
    current.revoked === true ||
    current.archived === true
  ) {
    return true;
  }

  const active = first(current.active, current.isActive, current.is_active, current.enabled, current.isEnabled);
  return active === null || active === undefined || active === "" ? false : !safeBoolean(active, true);
}

function hasUsableUserIdentity(user = null) {
  const current = safeObject(user);
  if (!Object.keys(current).length) return false;

  const branches = getProfileBranches(current);
  if (branches.some(branchInactive)) return false;

  return branches.some((branch) => Boolean(
    safeText(branch.id, "") ||
      safeText(branch.userId, "") ||
      safeText(branch.user_id, "") ||
      safeText(branch._id, "") ||
      safeText(branch.uid, "") ||
      safeText(branch.sub, "") ||
      safeText(branch.username, "") ||
      safeText(branch.userName, "") ||
      safeText(branch.user_name, "") ||
      safeText(branch.email, "") ||
      safeText(branch.mail, "") ||
      safeText(branch.phone, "") ||
      safeText(branch.telefono, "") ||
      safeText(branch.name, "") ||
      safeText(branch.nombre, "") ||
      safeText(branch.displayName, "") ||
      safeText(branch.display_name, "") ||
      safeText(branch.fullName, "") ||
      safeText(branch.full_name, "")
  ));
}

/* =========================================================
   DISPLAY / USERNAME
========================================================= */

export function getDisplayName(AppCore, user = null) {
  const current = safeObject(user || getUser(AppCore));
  if (!hasUsableUserIdentity(current)) return DEFAULT_DISPLAY_NAME;

  const branches = getProfileBranches(current);

  const value = first(
    ...branches.flatMap((branch) => [
      branch.name,
      branch.nombre,
      branch.fullName,
      branch.full_name,
      branch.displayName,
      branch.display_name,
      branch.firstName && branch.lastName ? `${branch.firstName} ${branch.lastName}` : null,
      branch.first_name && branch.last_name ? `${branch.first_name} ${branch.last_name}` : null,
      branch.given_name && branch.family_name ? `${branch.given_name} ${branch.family_name}` : null,
      branch.username,
      branch.userName,
      branch.user_name,
      branch.email,
      branch.mail,
      branch.phone,
      branch.telefono,
    ])
  );

  return coerceDisplayValue(value) || DEFAULT_DISPLAY_NAME;
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
  return text.includes("@") ? sanitizeUsername(text.split("@")[0]) : "";
}

export function getUsername(AppCore, user = null) {
  const current = safeObject(user || getUser(AppCore));
  if (!hasUsableUserIdentity(current)) return "";

  const branches = getProfileBranches(current);
  const direct = sanitizeUsername(first(
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
      branch.uid,
      branch.sub,
    ])
  ));

  if (direct) return direct;

  return usernameFromEmail(first(...branches.flatMap((branch) => [branch.email, branch.mail, branch.upn])));
}

/* =========================================================
   AVATAR TEXT / URL
========================================================= */

function keepAvatarLettersAndNumbers(value = "") {
  const text = safeText(value, "");
  if (!text) return "";

  try {
    return Array.from(text).filter((char) => /[\p{L}\p{N}]/u.test(char)).join("");
  } catch {
    return text.replace(/[^a-zA-Z0-9À-ÖØ-öø-ÿĀ-ſ]/g, "");
  }
}

function normalizeAvatarText(value = "") {
  const clean = keepAvatarLettersAndNumbers(safeText(value, DEFAULT_AVATAR_TEXT));
  const compact = Array.from(clean).slice(0, 2).join("");

  try {
    return compact.toLocaleUpperCase("es-ES") || DEFAULT_AVATAR_TEXT;
  } catch {
    return compact.toUpperCase() || DEFAULT_AVATAR_TEXT;
  }
}

function initialsFromText(value = "") {
  const text = safeText(value, "")
    .replace(/@.*/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";

  const parts = text
    .split(/[\s._-]+/u)
    .map((part) => keepAvatarLettersAndNumbers(part))
    .filter(Boolean);

  return normalizeAvatarText(parts.slice(0, 2).map((part) => Array.from(part)[0] || "").join(""));
}

export function getAvatarText(AppCore, user = null) {
  const current = safeObject(user || getUser(AppCore));
  if (!hasUsableUserIdentity(current)) return DEFAULT_AVATAR_TEXT;

  const branches = getProfileBranches(current);
  const explicit = safeText(first(...branches.flatMap((branch) => [branch.avatarText, branch.avatar_text, branch.initials, branch.iniciales])), "");

  if (explicit) return normalizeAvatarText(explicit);

  return initialsFromText(getDisplayName(AppCore, current)) || initialsFromText(getUsername(AppCore, current)) || DEFAULT_AVATAR_TEXT;
}

function getBaseOrigin() {
  try {
    if (isBrowser() && window.location?.origin) return window.location.origin;
  } catch {}

  return "http://localhost";
}

function coerceAvatarUrlValue(value = "") {
  if (value === null || value === undefined) return "";

  if (typeof value === "object") {
    return safeText(first(value.url, value.href, value.src, value.uri, value.path, value.downloadUrl, value.publicUrl, value.secureUrl), "");
  }

  return safeText(value, "");
}

function isLocalHttpUrl(url = "") {
  try {
    const parsed = new URL(url, getBaseOrigin());
    return parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function sanitizeAvatarUrl(value = "") {
  const raw = safeText(coerceAvatarUrlValue(value), "");
  if (!raw || /[\r\n\t]/.test(raw)) return "";

  const compact = raw.replace(/\s+/g, "");
  const lower = compact.toLowerCase();

  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("filesystem:") ||
    lower.startsWith("data:text/") ||
    lower.startsWith("data:application/") ||
    lower.startsWith("data:image/svg") ||
    lower.startsWith("//")
  ) {
    return "";
  }

  if (lower.startsWith("data:")) return SAFE_DATA_IMAGE_PREFIXES.some((prefix) => lower.startsWith(prefix)) ? raw : "";
  if (lower.startsWith("blob:")) return raw;
  if (lower.startsWith("/") || lower.startsWith("./") || lower.startsWith("../")) return raw;

  if (lower.startsWith("http://")) {
    if (!isLocalHttpUrl(raw)) return "";
    try {
      return new URL(raw, getBaseOrigin()).toString();
    } catch {
      return "";
    }
  }

  if (lower.startsWith("https://")) {
    try {
      return new URL(raw, getBaseOrigin()).toString();
    } catch {
      return "";
    }
  }

  return /^[a-zA-Z0-9._~:/?#@!$&'()*+,;=%-]+$/.test(raw) ? `/${raw.replace(/^\/+/, "")}` : "";
}

function avatarVersion(user = null) {
  const branches = getProfileBranches(user);
  return safeText(first(...branches.flatMap((branch) => [
    branch.avatarUpdatedAt,
    branch.avatar_updated_at,
    branch.pictureUpdatedAt,
    branch.picture_updated_at,
    branch.avatarVersion,
    branch.avatar_version,
    branch.updatedAt,
    branch.updated_at,
    branch.version,
    branch._etag,
  ])), "");
}

function userHasAvatar(user = null) {
  const branches = getProfileBranches(user);
  const raw = first(...branches.flatMap((branch) => [branch.hasAvatar, branch.has_avatar, branch.avatarEnabled, branch.hasPhoto, branch.hasPicture]));
  return raw === null || raw === undefined || raw === "" ? true : safeBoolean(raw, false);
}

function appendAvatarCacheBust(url = "", version = "") {
  const cleanUrl = sanitizeAvatarUrl(url);
  const cleanVersion = safeText(version, "");

  if (!cleanUrl || !cleanVersion || cleanUrl.startsWith("data:") || cleanUrl.startsWith("blob:")) return cleanUrl;

  try {
    const parsed = new URL(cleanUrl, getBaseOrigin());
    parsed.searchParams.set("v", cleanVersion);
    return cleanUrl.startsWith("/") || cleanUrl.startsWith("./") || cleanUrl.startsWith("../")
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : parsed.toString();
  } catch {
    return cleanUrl;
  }
}

export function getAvatarUrl(user = null) {
  const current = safeObject(user);
  if (!hasUsableUserIdentity(current) || !userHasAvatar(current)) return "";

  const branches = getProfileBranches(current);
  const explicitAvatar = first(...branches.flatMap((branch) => [
    branch.avatar,
    branch.avatarUrl,
    branch.avatar_url,
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
    branch.logo,
    branch.logoUrl,
    branch.logo_url,
  ]));

  return appendAvatarCacheBust(explicitAvatar, avatarVersion(current));
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
  if (depth > 6 || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenRoleValue(item, depth + 1));
  if (typeof value === "string") return value.split(/[,\s|;]+/).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "number" || typeof value === "boolean") return [value];

  if (typeof value === "object") {
    const truthyKeys = Object.entries(value).filter(([, entryValue]) => safeBoolean(entryValue, false)).map(([key]) => key);
    return [value.role, value.rol, value.name, value.key, value.value, value.id, value.code, value.slug, value.type, value.scope, value.permission, value.authority, value.roles, value.permissions, value.scopes, value.groups, value.authorities, ...truthyKeys].flatMap((item) => flattenRoleValue(item, depth + 1));
  }

  return [];
}

function normalizeRoles(value) {
  return flattenRoleValue(value).map(normalizeRole).filter(Boolean);
}

function adminRoleSet() {
  return new Set(safeArray(ADMIN_ROLE_KEYS).map(normalizeRole).filter(Boolean));
}

function adminPermissionSet() {
  return new Set(safeArray(ADMIN_PERMISSION_KEYS).map(normalizeRole).filter(Boolean));
}

function isAdminRole(value = "") {
  return adminRoleSet().has(normalizeRole(value));
}

function isAdminPermission(value = "") {
  const key = normalizeRole(value);
  if (!key) return false;
  if (adminPermissionSet().has(key)) return true;

  return key === "*" || key.startsWith("admin:") || key.startsWith("admin.") || key.includes(":admin") || key.includes(".admin") || key.endsWith(":manage") || key.endsWith(".manage");
}

export function getUserRoles(AppCore, user = null) {
  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session);
  const current = safeObject(user || getUser(AppCore));
  const branches = getProfileBranches(current);

  const values = [
    state.role,
    state.rol,
    state.userRole,
    state.roles,
    state.permissions,
    state.permisos,
    state.scopes,
    session.role,
    session.rol,
    session.roles,
    session.permissions,
    ...branches.flatMap((branch) => [
      branch.role,
      branch.rol,
      branch.userRole,
      branch.user_role,
      branch.type,
      branch.perfil,
      branch.roles,
      branch.permissions,
      branch.permisos,
      branch.scopes,
      branch.groups,
      branch.authorities,
    ]),
  ];

  const roles = normalizeRoles(values);
  const expanded = new Set(roles);

  if (roles.some(isAdminRole) || roles.some(isAdminPermission)) expanded.add("admin");
  if (!expanded.size && hasUsableUserIdentity(current)) expanded.add("user");

  return [...expanded].filter(Boolean);
}

function hasAdminFlag(AppCore, user = null) {
  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session);
  const current = safeObject(user || getUser(AppCore));
  const branches = getProfileBranches(current);

  const values = [
    ...safeArray(ADMIN_FLAG_KEYS).flatMap((key) => [state?.[key], session?.[key], current?.[key]]),
    ...branches.flatMap((branch) => safeArray(ADMIN_FLAG_KEYS).map((key) => branch?.[key])),
  ];

  return values.some((value) => safeBoolean(value, false));
}

export function isAdmin(AppCore, user = null) {
  const current = safeObject(user || getUser(AppCore));
  if (!hasUsableUserIdentity(current)) return false;
  if (hasAdminFlag(AppCore, current)) return true;

  return getUserRoles(AppCore, current).some((role) => isAdminRole(role) || isAdminPermission(role));
}

/* =========================================================
   AVATAR COLOR
========================================================= */

function avatarColorScope(AppCore = null, user = null) {
  const state = safeObject(AppCore?.state);
  const current = safeObject(user || getUser(AppCore));

  return safeText(first(
    state.sessionId,
    state.session_id,
    current.sessionId,
    current.session_id,
    current.userId,
    current.user_id,
    current.id,
    current.uid,
    current.sub,
    current.username,
    current.email,
    getDisplayName(AppCore, current)
  ), "anonymous");
}

export function getSessionAvatarGradient(AppCore = null, user = null) {
  const scope = avatarColorScope(AppCore, user);

  if (memoryAvatarGradient && memoryAvatarGradientScope === scope) return memoryAvatarGradient;

  const hash = parseInt(hashString(scope).replace(/^h/, ""), 36) || 0;
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;

  memoryAvatarGradient = AVATAR_GRADIENTS[index] || AVATAR_GRADIENTS[0];
  memoryAvatarGradientScope = scope;

  return memoryAvatarGradient;
}

export function resetSidebarAvatarColor(AppCore = null) {
  memoryAvatarGradient = "";
  memoryAvatarGradientScope = "";

  safeEmit(AppCore, EVENTS.userAvatarColorReset, { reset: true });
  return true;
}

function applyAvatarColor(avatarEl = null, fallbackEl = null, AppCore = null, user = null) {
  const gradient = getSessionAvatarGradient(AppCore, user);

  [avatarEl, fallbackEl].forEach((node) => {
    if (!node) return;

    try {
      node.style.setProperty("--sidebar-avatar-bg", gradient);
      node.style.setProperty("--avatar-bg", gradient);
      node.style.setProperty("--user-avatar-bg", gradient);
    } catch {}
  });

  try {
    if (avatarEl) {
      avatarEl.dataset.avatarColor = gradient;
      avatarEl.dataset.avatarColorHash = hashString(gradient);
    }
  } catch {}

  return gradient;
}

/* =========================================================
   AVATAR DOM
========================================================= */

function getAvatarNodes(avatarEl = null) {
  if (!avatarEl) return { imgEl: null, fallbackEl: null };

  let imgEl = null;
  let fallbackEl = null;

  try {
    const imageId = safeText(SIDEBAR_AVATAR_IMAGE_ID, "");
    imgEl = (imageId ? avatarEl.querySelector(safeCssIdSelector(imageId)) : null) || avatarEl.querySelector(".avatar-image") || avatarEl.querySelector("img") || null;
  } catch {}

  try {
    const fallbackId = safeText(SIDEBAR_AVATAR_FALLBACK_ID, "");
    fallbackEl = (fallbackId ? avatarEl.querySelector(safeCssIdSelector(fallbackId)) : null) || avatarEl.querySelector(".avatar-fallback") || null;
  } catch {}

  return { imgEl, fallbackEl };
}

function syncAvatarBaseAttrs(avatarEl = null, displayName = DEFAULT_DISPLAY_NAME) {
  if (!avatarEl) return false;

  const finalDisplayName = safeText(displayName, DEFAULT_DISPLAY_NAME);

  try {
    avatarEl.setAttribute("aria-label", `Avatar de ${finalDisplayName}`);
    avatarEl.dataset.displayName = finalDisplayName;
    removeTooltipAttributesDeep(avatarEl);
    return true;
  } catch {
    return false;
  }
}

function clearImageNode(imgEl = null) {
  if (!imgEl) return false;

  try {
    imgEl.onload = null;
    imgEl.onerror = null;
    imgEl.hidden = true;
    imgEl.removeAttribute("src");
    imgEl.removeAttribute("srcset");
    imgEl.removeAttribute("sizes");
    removeTooltipAttributes(imgEl);
    return true;
  } catch {
    return false;
  }
}

function setFallbackNode({ avatarEl, fallbackEl, text, visible }) {
  const finalText = normalizeAvatarText(text);

  if (fallbackEl) {
    try {
      fallbackEl.hidden = !visible;
      fallbackEl.textContent = finalText;
      fallbackEl.setAttribute("aria-hidden", "true");
      removeTooltipAttributes(fallbackEl);
      return true;
    } catch {
      return false;
    }
  }

  if (avatarEl && visible) {
    try {
      if (!avatarEl.querySelector?.("img,.avatar-fallback")) avatarEl.textContent = finalText;
      return true;
    } catch {}
  }

  return false;
}

function setAvatarState(avatarEl, { hasImage = false, loading = false, url = "", error = false } = {}) {
  if (!avatarEl) return false;

  const cleanUrl = safeText(url, "");

  try {
    avatarEl.classList.toggle("has-image", Boolean(hasImage));
    avatarEl.classList.toggle("has-fallback", !hasImage);
    avatarEl.classList.toggle("is-loading", Boolean(loading));
    avatarEl.classList.toggle("has-error", Boolean(error));
    avatarEl.dataset.hasImage = hasImage ? "true" : "false";
    avatarEl.dataset.loading = loading ? "true" : "false";
    avatarEl.dataset.avatarError = error ? "true" : "false";

    if (cleanUrl) {
      avatarEl.dataset.avatarUrl = redactSensitiveText(cleanUrl);
      avatarEl.dataset[AVATAR_URL_HASH_DATASET_KEY] = hashString(cleanUrl);
    } else {
      delete avatarEl.dataset.avatarUrl;
      delete avatarEl.dataset[AVATAR_URL_HASH_DATASET_KEY];
    }

    return true;
  } catch {
    return false;
  }
}

function nextAvatarRenderSeq(avatarEl = null) {
  if (!avatarEl) return "0";

  const current = Number(avatarEl.dataset?.avatarRenderSeq || 0);
  const next = Number.isFinite(current) ? current + 1 : nowMs();

  try {
    avatarEl.dataset[AVATAR_RENDER_SEQ_DATASET_KEY] = String(next);
  } catch {}

  return String(next);
}

function isCurrentAvatarRenderSeq(avatarEl = null, seq = "") {
  try {
    return avatarEl?.dataset?.[AVATAR_RENDER_SEQ_DATASET_KEY] === String(seq);
  } catch {
    return false;
  }
}

export function renderAvatarFallback(avatarEl, displayName = DEFAULT_DISPLAY_NAME, avatarText = DEFAULT_AVATAR_TEXT, options = {}) {
  if (!avatarEl) return false;

  const AppCore = options?.AppCore || null;
  const user = options?.user || null;
  const finalDisplayName = safeText(displayName, DEFAULT_DISPLAY_NAME);
  const finalAvatarText = normalizeAvatarText(avatarText);
  const { imgEl, fallbackEl } = getAvatarNodes(avatarEl);

  const avatarColor = applyAvatarColor(avatarEl, fallbackEl, AppCore, user);

  nextAvatarRenderSeq(avatarEl);
  syncAvatarBaseAttrs(avatarEl, finalDisplayName);
  clearImageNode(imgEl);
  setFallbackNode({ avatarEl, fallbackEl, text: finalAvatarText, visible: true });
  setAvatarState(avatarEl, { hasImage: false, loading: false, url: "", error: false });

  safeEmit(AppCore, EVENTS.userFallbackRendered, {
    displayName: finalDisplayName,
    avatarText: finalAvatarText,
    avatarColor,
  });

  return true;
}

export function renderAvatarImage(avatarEl, avatarUrl, displayName = DEFAULT_DISPLAY_NAME, avatarText = DEFAULT_AVATAR_TEXT, options = {}) {
  if (!avatarEl) return false;

  const AppCore = options?.AppCore || null;
  const user = options?.user || null;
  const safeUrl = sanitizeAvatarUrl(avatarUrl);

  if (!safeUrl) return renderAvatarFallback(avatarEl, displayName, avatarText, { AppCore, user });

  const finalDisplayName = safeText(displayName, DEFAULT_DISPLAY_NAME);
  const finalAvatarText = normalizeAvatarText(avatarText);
  const { imgEl, fallbackEl } = getAvatarNodes(avatarEl);
  const avatarColor = applyAvatarColor(avatarEl, fallbackEl, AppCore, user);

  if (!imgEl) return renderAvatarFallback(avatarEl, finalDisplayName, finalAvatarText, { AppCore, user });

  const urlHash = hashString(safeUrl);
  const existingUrlHash = safeText(avatarEl.dataset?.[AVATAR_URL_HASH_DATASET_KEY], "");

  if (existingUrlHash === urlHash && imgEl.complete === true && Number(imgEl.naturalWidth || 0) > 0 && avatarEl.dataset?.hasImage === "true") {
    syncAvatarBaseAttrs(avatarEl, finalDisplayName);

    try {
      imgEl.alt = `Avatar de ${finalDisplayName}`;
      imgEl.hidden = false;
    } catch {}

    setFallbackNode({ avatarEl, fallbackEl, text: finalAvatarText, visible: false });
    setAvatarState(avatarEl, { hasImage: true, loading: false, url: safeUrl, error: false });
    return true;
  }

  const renderSeq = nextAvatarRenderSeq(avatarEl);

  syncAvatarBaseAttrs(avatarEl, finalDisplayName);
  setFallbackNode({ avatarEl, fallbackEl, text: finalAvatarText, visible: true });
  setAvatarState(avatarEl, { hasImage: false, loading: true, url: safeUrl, error: false });

  try {
    imgEl.hidden = true;
    imgEl.alt = `Avatar de ${finalDisplayName}`;
    imgEl.loading = "eager";
    imgEl.decoding = "async";
    imgEl.draggable = false;
    imgEl.referrerPolicy = "no-referrer";
    removeTooltipAttributes(imgEl);

    imgEl.onload = () => {
      if (!isCurrentAvatarRenderSeq(avatarEl, renderSeq)) return;

      try {
        imgEl.hidden = false;
      } catch {}

      setFallbackNode({ avatarEl, fallbackEl, text: finalAvatarText, visible: false });
      setAvatarState(avatarEl, { hasImage: true, loading: false, url: safeUrl, error: false });
      safeEmit(AppCore, EVENTS.userAvatarLoaded, { url: redactSensitiveText(safeUrl), urlHash, displayName: finalDisplayName, avatarColor });
    };

    imgEl.onerror = () => {
      if (!isCurrentAvatarRenderSeq(avatarEl, renderSeq)) return;

      setAvatarState(avatarEl, { hasImage: false, loading: false, url: "", error: true });
      safeEmit(AppCore, EVENTS.userAvatarError, { url: redactSensitiveText(safeUrl), urlHash, displayName: finalDisplayName, avatarColor });
      renderAvatarFallback(avatarEl, finalDisplayName, finalAvatarText, { AppCore, user });
    };

    imgEl.removeAttribute("src");
    imgEl.removeAttribute("srcset");
    imgEl.src = safeUrl;

    if (imgEl.complete === true && Number(imgEl.naturalWidth || 0) > 0) imgEl.onload?.();
  } catch {
    return renderAvatarFallback(avatarEl, finalDisplayName, finalAvatarText, { AppCore, user });
  }

  return true;
}

/* =========================================================
   FOOTER / RENDER
========================================================= */

function getPlanLabel(AppCore, user = null) {
  const state = safeObject(AppCore?.state);
  const current = safeObject(user || getUser(AppCore));
  const branches = getProfileBranches(current);

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

function getPlanElement(userToggle = null, explicitPlanEl = null) {
  if (explicitPlanEl) return explicitPlanEl;
  if (!userToggle) return null;

  try {
    const planId = safeText(SIDEBAR_USER_PLAN_ID, "");
    return (planId ? userToggle.querySelector(safeCssIdSelector(planId)) : null) ||
      userToggle.querySelector(".plan") ||
      userToggle.querySelector(".sidebar-user-plan") ||
      userToggle.querySelector("[data-sidebar-user-plan]") ||
      null;
  } catch {
    return null;
  }
}

function setUserDataset(element = null, { username = "", displayName = "", admin = false, avatarUrl = "", avatarText = "", avatarColor = "", hasUser = false } = {}) {
  if (!element) return false;

  setDatasetValue(element, "username", username || "");
  setDatasetValue(element, "displayName", displayName || "");
  setDatasetValue(element, "footerName", displayName || "");
  setDatasetValue(element, "greetingName", displayName || "");
  setDatasetValue(element, "admin", admin ? "true" : "false");
  setDatasetValue(element, "avatarUrl", avatarUrl ? redactSensitiveText(avatarUrl) : "");
  setDatasetValue(element, "avatarUrlHash", avatarUrl ? hashString(avatarUrl) : "");
  setDatasetValue(element, "avatarText", avatarText || "");
  setDatasetValue(element, "avatarColor", avatarColor || "");
  setDatasetValue(element, "avatarColorHash", avatarColor ? hashString(avatarColor) : "");
  setDatasetValue(element, "hasUser", hasUser ? "true" : "false");

  return true;
}

function publicUserSnapshot({ user, hasUser, displayName, avatarText, avatarUrl, avatarColor, username, planLabel, admin, roles } = {}) {
  const current = safeObject(user);

  return sanitizePayload({
    hasUser: Boolean(hasUser),
    user: {
      id: safeText(first(current.id, current.userId, current.user_id, current.uid, current.sub), "") || null,
      email: safeText(first(current.email, current.mail, current.profile?.email, current.raw?.email), "") || null,
      username: username || null,
      displayName: displayName || DEFAULT_DISPLAY_NAME,
      name: displayName || DEFAULT_DISPLAY_NAME,
      fullName: displayName || DEFAULT_DISPLAY_NAME,
      footerName: displayName || DEFAULT_DISPLAY_NAME,
      greetingName: displayName || DEFAULT_DISPLAY_NAME,
    },
    displayName: displayName || DEFAULT_DISPLAY_NAME,
    footerName: displayName || DEFAULT_DISPLAY_NAME,
    greetingName: displayName || DEFAULT_DISPLAY_NAME,
    avatarText: avatarText || DEFAULT_AVATAR_TEXT,
    avatarUrl: avatarUrl ? redactSensitiveText(avatarUrl) : null,
    avatarUrlHash: avatarUrl ? hashString(avatarUrl) : null,
    avatarColor: avatarColor || "",
    avatarColorHash: avatarColor ? hashString(avatarColor) : null,
    username: username || null,
    planLabel: planLabel || DEFAULT_PLAN_LABEL,
    isAdmin: Boolean(admin),
    roles: Array.isArray(roles) ? roles : [],
  });
}

export function renderUser(AppCore, context = {}) {
  const { nameEl, avatarEl, userToggle, userDropdown, planEl } = getElements(AppCore);

  const explicitUser = safeObject(context)?.user || null;
  const user = getUser(AppCore, explicitUser);
  const hasUser = hasUsableUserIdentity(user);

  const displayName = hasUser ? getDisplayName(AppCore, user) : DEFAULT_DISPLAY_NAME;
  const avatarText = hasUser ? getAvatarText(AppCore, user) : DEFAULT_AVATAR_TEXT;
  const username = hasUser ? getUsername(AppCore, user) : "";
  const avatarUrl = hasUser ? getAvatarUrl(user) : "";
  const admin = hasUser ? isAdmin(AppCore, user) : false;
  const roles = hasUser ? getUserRoles(AppCore, user) : [];
  const planLabel = hasUser ? getPlanLabel(AppCore, user) : DEFAULT_PLAN_LABEL;
  const avatarColor = getSessionAvatarGradient(AppCore, hasUser ? user : {});

  if (nameEl) {
    try {
      nameEl.textContent = displayName;
      setUserDataset(nameEl, { username, displayName, admin, avatarUrl, avatarText, avatarColor, hasUser });
      removeTooltipAttributes(nameEl);
    } catch {}
  }

  if (avatarEl) {
    if (avatarUrl) renderAvatarImage(avatarEl, avatarUrl, displayName, avatarText, { AppCore, user });
    else renderAvatarFallback(avatarEl, displayName, avatarText, { AppCore, user: hasUser ? user : {} });

    setUserDataset(avatarEl, { username, displayName, admin, avatarUrl, avatarText, avatarColor, hasUser });
    removeTooltipAttributesDeep(avatarEl);
  }

  if (userToggle) {
    try {
      userToggle.setAttribute("aria-label", `Abrir menú de usuario de ${displayName}`);
      userToggle.setAttribute("aria-haspopup", "menu");
      if (!userToggle.getAttribute("aria-expanded")) userToggle.setAttribute("aria-expanded", "false");
      setUserDataset(userToggle, { username, displayName, admin, avatarUrl, avatarText, avatarColor, hasUser });
      removeTooltipAttributes(userToggle);
    } catch {}
  }

  const resolvedPlanEl = getPlanElement(userToggle, planEl);
  if (resolvedPlanEl) {
    try {
      resolvedPlanEl.textContent = planLabel;
      setDatasetValue(resolvedPlanEl, "hasUser", hasUser ? "true" : "false");
      removeTooltipAttributes(resolvedPlanEl);
    } catch {}
  }

  if (userDropdown) {
    setUserDataset(userDropdown, { username, displayName, admin, avatarUrl, avatarText, avatarColor, hasUser });
    removeTooltipAttributes(userDropdown);
  }

  try {
    sanitizeFooterTooltipState(AppCore);
  } catch (error) {
    safeWarn(AppCore, "sanitizeFooterTooltipState falló tras renderUser.", error);
  }

  const snapshot = publicUserSnapshot({ user, hasUser, displayName, avatarText, avatarUrl, avatarColor, username, planLabel, admin, roles });
  safeEmit(AppCore, EVENTS.userRendered, snapshot);

  return snapshot;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function sanitizeDataset(dataset = {}) {
  const output = {};

  try {
    for (const [key, value] of Object.entries(dataset || {})) {
      output[key] = typeof value === "string" ? redactSensitiveText(value) : value;
    }
  } catch {}

  return output;
}

export function getSidebarUserSnapshot(AppCore) {
  const { nameEl, avatarEl, userToggle, userDropdown, planEl } = getElements(AppCore);
  const user = getUser(AppCore);
  const hasUser = hasUsableUserIdentity(user);
  const displayName = hasUser ? getDisplayName(AppCore, user) : DEFAULT_DISPLAY_NAME;
  const username = hasUser ? getUsername(AppCore, user) : "";
  const avatarText = hasUser ? getAvatarText(AppCore, user) : DEFAULT_AVATAR_TEXT;
  const avatarUrl = hasUser ? getAvatarUrl(user) : "";
  const avatarColor = getSessionAvatarGradient(AppCore, hasUser ? user : {});
  const roles = hasUser ? getUserRoles(AppCore, user) : [];
  const admin = hasUser ? isAdmin(AppCore, user) : false;
  const planLabel = getPlanLabel(AppCore, user);

  return sanitizePayload({
    version: SIDEBAR_USER_VERSION,
    hasUser,
    user: publicUserSnapshot({ user, hasUser, displayName, avatarText, avatarUrl, avatarColor, username, planLabel, admin, roles }).user,
    displayName,
    footerName: displayName,
    greetingName: displayName,
    username: username || null,
    avatarText,
    avatarUrl: avatarUrl ? redactSensitiveText(avatarUrl) : null,
    avatarUrlHash: avatarUrl ? hashString(avatarUrl) : null,
    avatarColor,
    avatarColorHash: avatarColor ? hashString(avatarColor) : null,
    planLabel,
    isAdmin: admin,
    roles,
    authSourcesCount: getAuthLikeSources(AppCore).length,
    dom: {
      hasName: Boolean(nameEl),
      nameText: nameEl?.textContent || "",
      nameDataset: sanitizeDataset(nameEl?.dataset || {}),
      hasAvatar: Boolean(avatarEl),
      avatarClasses: avatarEl?.className || "",
      avatarHasImage: avatarEl?.dataset?.hasImage || "",
      avatarLoading: avatarEl?.dataset?.loading || "",
      avatarError: avatarEl?.dataset?.avatarError || "",
      avatarUrl: avatarEl?.dataset?.avatarUrl || "",
      avatarUrlHash: avatarEl?.dataset?.[AVATAR_URL_HASH_DATASET_KEY] || "",
      avatarText: avatarEl?.dataset?.avatarText || "",
      avatarColor: avatarEl?.dataset?.avatarColor || "",
      avatarColorHash: avatarEl?.dataset?.avatarColorHash || "",
      avatarSeq: avatarEl?.dataset?.[AVATAR_RENDER_SEQ_DATASET_KEY] || "",
      hasUserToggle: Boolean(userToggle),
      userToggleAriaLabel: userToggle?.getAttribute?.("aria-label") || "",
      userToggleAriaExpanded: userToggle?.getAttribute?.("aria-expanded") || "",
      userToggleDataset: sanitizeDataset(userToggle?.dataset || {}),
      hasUserDropdown: Boolean(userDropdown),
      userDropdownAriaHidden: userDropdown?.getAttribute?.("aria-hidden") || "",
      userDropdownDataset: sanitizeDataset(userDropdown?.dataset || {}),
      hasPlan: Boolean(planEl),
      planText: planEl?.textContent || "",
    },
  });
}

export default {
  SIDEBAR_USER_VERSION,

  getUser,
  getDisplayName,
  getUsername,
  getAvatarText,
  getAvatarUrl,
  getSessionAvatarGradient,
  getUserRoles,
  isAdmin,

  renderAvatarFallback,
  renderAvatarImage,
  renderUser,

  resetSidebarAvatarColor,
  getSidebarUserSnapshot,
};
