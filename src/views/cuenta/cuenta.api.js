/* =========================================================
   Onion SPA - Cuenta API
   Archivo: src/views/cuenta/cuenta.api.js

   EXTREME PRO SYSTEM · API LAYER · FULL PATCH 12/10
   USER PREFERENCES CONTRACT · PROFILE PRESERVER · AVATAR READY
   SINGLE RESOURCE MODE · RACE SAFE · STORE/STATE SYNC

   BACKEND CONTRACT:
   - GET    /api/user/preferences
   - PATCH  /api/user/preferences
   - PUT    /api/user/preferences
   - PATCH  /api/user/preferences/theme
   - PATCH  /api/user/preferences/theme/toggle
   - PATCH  /api/user/preferences/privacy
   - PATCH  /api/user/preferences/privacy/toggle
   - PATCH  /api/user/preferences/language
   - PATCH  /api/user/preferences/lang
   - GET    /api/user/preferences/_meta

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo cuenta
   - detalle + update + theme + privacy + language + meta
   - hidratar store/state
   - normalizar payloads backend heterogéneos
   - preservar perfil visible: name/email/username/phone/avatar/role/status
   - preservar preferencias: darkMode/privacyMode/theme/lang
   - fusionar preferencias backend con usuario autenticado de AppCore
   - soportar múltiples adapters de request
   - prevenir race conditions blandas
   - mantener compatibilidad con cuentaView.js / cuenta.actions.js
   - registrar API pública en AppCore.modules/window
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  cuentaState,
  setLoading,
  setRefreshing,
  setSaving,
  setError,
  setItem,
  setLastSyncAt,
  setLoaded,
  setHydrated,
  setMeta,
} from "./cuenta.state.js";

import {
  getCuentaStore,
  replaceCuentaStore,
  upsertCuentaStore,
} from "./cuenta.store.js";

/* =========================================================
   CONFIG
========================================================= */

export const CUENTA_RESOURCE = "cuenta";

export const CUENTA_ENDPOINT = "/api/user/preferences";
export const CUENTA_ALT_ENDPOINT = "/api/user/settings";

export const CUENTA_THEME_ENDPOINT = "/api/user/preferences/theme";
export const CUENTA_THEME_TOGGLE_ENDPOINT = "/api/user/preferences/theme/toggle";

export const CUENTA_PRIVACY_ENDPOINT = "/api/user/preferences/privacy";
export const CUENTA_PRIVACY_TOGGLE_ENDPOINT = "/api/user/preferences/privacy/toggle";

export const CUENTA_LANGUAGE_ENDPOINT = "/api/user/preferences/language";
export const CUENTA_LANG_ENDPOINT = "/api/user/preferences/lang";

export const CUENTA_META_ENDPOINT = "/api/user/preferences/_meta";

export const CUENTA_TIMEOUT = 15000;
export const CUENTA_DETAIL_TIMEOUT = 25000;

const CACHE_KEY = "onion:cuenta:cache:v12";
const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 6;

const DEFAULT_LANG = "es";
const DEFAULT_THEME = "light";
const DEFAULT_ROLE = "user";
const DEFAULT_STATUS = "active";

let lastLoadToken = 0;

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function hasOwnKeys(value = {}) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length
  );
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return null;
}

function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cleanPayload(payload = {}) {
  const source = safeObject(payload);
  const next = {};

  Object.entries(source).forEach(([key, value]) => {
    if (value === undefined) return;
    next[key] = value;
  });

  return next;
}

function callSafe(fn, ...args) {
  try {
    if (typeof fn === "function") {
      return fn(...args);
    }
  } catch {}

  return undefined;
}

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFormData(value) {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isArrayBuffer(value) {
  return typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer;
}

function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(safeText(value, ""));
}

function encodeUrlPathSegment(value = "") {
  return encodeURIComponent(safeText(value, ""));
}

function safeEmit(event = "", payload = {}) {
  const eventName = safeText(event, "");
  if (!eventName) return false;

  let emitted = false;

  try {
    AppCore?.events?.emit?.(eventName, payload);
    emitted = true;
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        })
      );

      emitted = true;
    }
  } catch {}

  return emitted;
}

/* =========================================================
   TOKENS / RACE
========================================================= */

function nextLoadToken() {
  lastLoadToken += 1;
  return lastLoadToken;
}

function isActiveLoadToken(token) {
  return token === lastLoadToken;
}

/* =========================================================
   URL / AUTH HELPERS
========================================================= */

function getApiBase() {
  const apiBase = safeText(
    first(
      AppCore?.config?.apiBase,
      AppCore?.config?.api?.baseUrl,
      AppCore?.state?.apiBase,
      isBrowser() ? window.ONION_API_BASE : "",
      isBrowser() ? window.API_BASE : ""
    ),
    ""
  );

  return apiBase.replace(/\/+$/, "");
}

function appendQueryParams(url = "", query = {}) {
  const cleanUrl = safeText(url, "");
  const params = safeObject(query);
  const pairs = [];

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === "string" && value.trim() === "") return;

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item === undefined || item === null) return;
        if (typeof item === "string" && item.trim() === "") return;

        pairs.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`
        );
      });

      return;
    }

    pairs.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    );
  });

  if (!pairs.length) return cleanUrl;

  const separator = cleanUrl.includes("?") ? "&" : "?";
  return `${cleanUrl}${separator}${pairs.join("&")}`;
}

function buildAbsoluteUrl(path = "", query = {}) {
  const cleanPath = safeText(path, "");

  if (!cleanPath) {
    return appendQueryParams(getApiBase(), query);
  }

  if (isAbsoluteUrl(cleanPath)) {
    return appendQueryParams(cleanPath, query);
  }

  const apiBase = getApiBase();
  const finalPath = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;

  if (!apiBase) {
    return appendQueryParams(finalPath, query);
  }

  return appendQueryParams(`${apiBase}${finalPath}`, query);
}

function getStorageValue(key = "") {
  const cleanKey = safeText(key, "");
  if (!cleanKey || !isBrowser()) return "";

  try {
    const localValue = localStorage.getItem(cleanKey);
    if (localValue) return localValue;
  } catch {}

  try {
    const sessionValue = sessionStorage.getItem(cleanKey);
    if (sessionValue) return sessionValue;
  } catch {}

  return "";
}

function tryParseJson(value = null) {
  if (!value || typeof value !== "string") return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getAuthToken() {
  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.auth?.getToken?.(),
      AppCore?.Auth?.getToken?.(),
      isBrowser() ? window.Auth?.getToken?.() : "",
      getStorageValue("token"),
      getStorageValue("accessToken"),
      getStorageValue("access_token"),
      getStorageValue("onion:token")
    ),
    ""
  );
}

function getRequestHeaders(extraHeaders = {}, body = null) {
  const token = getAuthToken();

  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...safeObject(extraHeaders),
  };

  if (isFormData(body)) {
    delete headers["Content-Type"];
    delete headers["content-type"];
  }

  return headers;
}

function getApiClient() {
  return AppCore?.apiClient || null;
}

function getHttpModule() {
  return (
    AppCore?.modules?.Http ||
    AppCore?.Http ||
    (isBrowser() ? window.Http : null) ||
    null
  );
}

/* =========================================================
   ENDPOINT HELPERS
========================================================= */

export function getCuentaEndpoint() {
  return CUENTA_ENDPOINT;
}

export function getCuentaAltEndpoint() {
  return CUENTA_ALT_ENDPOINT;
}

export function getCuentaThemeEndpoint() {
  return CUENTA_THEME_ENDPOINT;
}

export function getCuentaThemeToggleEndpoint() {
  return CUENTA_THEME_TOGGLE_ENDPOINT;
}

export function getCuentaPrivacyEndpoint() {
  return CUENTA_PRIVACY_ENDPOINT;
}

export function getCuentaPrivacyToggleEndpoint() {
  return CUENTA_PRIVACY_TOGGLE_ENDPOINT;
}

export function getCuentaLanguageEndpoint() {
  return CUENTA_LANGUAGE_ENDPOINT;
}

export function getCuentaLangEndpoint() {
  return CUENTA_LANG_ENDPOINT;
}

export function getCuentaMetaEndpoint() {
  return CUENTA_META_ENDPOINT;
}

export function getCuentaByIdEndpoint(id = "") {
  const cleanId = safeText(id, "");
  if (!cleanId) return CUENTA_ENDPOINT;

  return `${CUENTA_ENDPOINT}/${encodeUrlPathSegment(cleanId)}`;
}

/* =========================================================
   ERROR HELPERS
========================================================= */

function normalizeErrorMessage(error = null, fallback = "Error de API.") {
  return safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.data?.message,
      error?.response?.error,
      error?.data?.error,
      error?.error,
      error?.detail,
      error?.code,
      fallback
    ),
    fallback
  );
}

function getErrorStatus(error = null) {
  return safeNumber(
    first(
      error?.status,
      error?.statusCode,
      error?.response?.status,
      error?.data?.status
    ),
    0
  );
}

function shouldTryNextEndpoint(error = null) {
  const status = getErrorStatus(error);

  if (!status) return true;

  return [404, 405, 409, 415, 422, 500, 502, 503, 504].includes(status);
}

/* =========================================================
   DOMAIN NORMALIZATION
========================================================= */

function normalizeBoolean(value = undefined, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return value !== 0;
  }

  const key = normalizeKey(value);

  if (
    [
      "true",
      "1",
      "yes",
      "y",
      "si",
      "sí",
      "on",
      "enabled",
      "active",
      "activo",
      "activa",
      "dark",
      "oscuro",
    ].includes(key)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "n",
      "off",
      "disabled",
      "inactive",
      "inactivo",
      "inactiva",
      "light",
      "claro",
    ].includes(key)
  ) {
    return false;
  }

  return Boolean(fallback);
}

function normalizeLang(value = DEFAULT_LANG) {
  const key = normalizeKey(value);

  if (["en", "eng", "english", "en_us", "en_gb"].includes(key)) {
    return "en";
  }

  if (["ca", "cat", "catala", "catalan", "ca_es", "catalunya"].includes(key)) {
    return "ca";
  }

  return "es";
}

function normalizeTheme(value = "", fallbackDarkMode = false) {
  const key = normalizeKey(value);

  if (["dark", "oscuro", "night", "theme_dark"].includes(key)) {
    return "dark";
  }

  if (["light", "claro", "day", "theme_light"].includes(key)) {
    return "light";
  }

  return fallbackDarkMode ? "dark" : "light";
}

function normalizeRole(value = DEFAULT_ROLE) {
  const obj = safeObject(value, null);

  const raw = obj
    ? first(obj.name, obj.nombre, obj.code, obj.id, DEFAULT_ROLE)
    : value;

  const key = normalizeKey(raw);

  if (
    [
      "admin",
      "administrator",
      "superadmin",
      "super_admin",
      "root",
      "owner",
    ].includes(key)
  ) {
    return "admin";
  }

  if (["support", "soporte"].includes(key)) return "support";
  if (["technician", "tecnico", "técnico"].includes(key)) return "technician";
  if (["client", "cliente", "customer"].includes(key)) return "client";

  return "user";
}

function normalizeStatus(value = DEFAULT_STATUS) {
  const key = normalizeKey(value);

  if (["inactive", "inactivo", "disabled", "bloqueado", "blocked"].includes(key)) {
    return "inactive";
  }

  if (["pending", "pendiente"].includes(key)) return "pending";
  if (["deleted", "eliminado", "removed"].includes(key)) return "deleted";
  if (["suspended", "suspendido"].includes(key)) return "suspended";

  return "active";
}

/* =========================================================
   SESSION / FALLBACK USER PRESERVER
========================================================= */

function getSessionUserFromStorage() {
  const candidates = [
    "user",
    "sessionUser",
    "currentUser",
    "onion:user",
    "onion:session:user",
    "auth:user",
  ];

  for (const key of candidates) {
    const parsed = tryParseJson(getStorageValue(key));

    if (hasOwnKeys(parsed)) {
      return parsed;
    }
  }

  return {};
}

function getSessionUserFallback() {
  const authUser = callSafe(AppCore?.auth?.getUser);
  const AuthUser = callSafe(AppCore?.Auth?.getUser);
  const windowUser = isBrowser() ? callSafe(window?.Auth?.getUser) : null;

  const stateUser = safeObject(
    first(
      AppCore?.state?.user,
      AppCore?.state?.currentUser,
      AppCore?.state?.session?.user,
      AppCore?.state?.auth?.user,
      {}
    )
  );

  const storedUser = getSessionUserFromStorage();

  const source = {
    ...safeObject(storedUser),
    ...safeObject(stateUser),
    ...safeObject(AuthUser),
    ...safeObject(authUser),
    ...safeObject(windowUser),
  };

  if (!hasOwnKeys(source)) return {};

  return source;
}

function hasProfileEvidence(value = {}) {
  const obj = safeObject(value);

  return Boolean(
    obj.userId ||
      obj.uid ||
      obj.sub ||
      obj.id ||
      obj.email ||
      obj.emailLower ||
      obj.mail ||
      obj.username ||
      obj.usernameLower ||
      obj.userName ||
      obj.name ||
      obj.nombre ||
      obj.fullName ||
      obj.displayName ||
      obj.avatar ||
      obj.avatarUrl ||
      obj.photoURL ||
      obj.photoUrl ||
      obj.picture ||
      obj.pictureUrl ||
      obj.profilePicture ||
      obj.profilePictureUrl ||
      obj.profile ||
      obj.user ||
      obj.account
  );
}

function hasPreferenceEvidence(value = {}) {
  const obj = safeObject(value);

  return Boolean(
    Object.prototype.hasOwnProperty.call(obj, "darkMode") ||
      Object.prototype.hasOwnProperty.call(obj, "privacyMode") ||
      Object.prototype.hasOwnProperty.call(obj, "theme") ||
      Object.prototype.hasOwnProperty.call(obj, "mode") ||
      Object.prototype.hasOwnProperty.call(obj, "appearance") ||
      Object.prototype.hasOwnProperty.call(obj, "lang") ||
      Object.prototype.hasOwnProperty.call(obj, "language") ||
      Object.prototype.hasOwnProperty.call(obj, "locale") ||
      obj.preferences ||
      obj.settings
  );
}

function hasCuentaEvidence(value = {}) {
  return hasProfileEvidence(value) || hasPreferenceEvidence(value);
}

function getCachedCuenta() {
  const sessionUser = getSessionUserFallback();

  try {
    const fromStore = getCuentaStore?.();

    if (hasCuentaEvidence(fromStore)) {
      return {
        ...safeObject(sessionUser),
        ...safeObject(fromStore),
      };
    }
  } catch {}

  try {
    const fromState = safeObject(cuentaState?.item);

    if (hasCuentaEvidence(fromState)) {
      return {
        ...safeObject(sessionUser),
        ...fromState,
      };
    }
  } catch {}

  if (hasCuentaEvidence(sessionUser)) {
    return sessionUser;
  }

  return {};
}

/* =========================================================
   RESPONSE SOURCE COLLECTOR
========================================================= */

function collectCuentaSource(payload = null, fallback = {}) {
  const root = safeObject(payload);
  const baseFallback = safeObject(fallback);

  const data = safeObject(root.data);
  const item = safeObject(root.item);
  const cuenta = safeObject(root.cuenta);
  const account = safeObject(root.account);
  const user = safeObject(root.user);
  const profile = safeObject(root.profile);
  const result = safeObject(root.result);
  const payloadObj = safeObject(root.payload);

  const dataUser = safeObject(data.user);
  const dataAccount = safeObject(data.account);
  const dataItem = safeObject(data.item);
  const dataProfile = safeObject(data.profile);

  const payloadUser = safeObject(payloadObj.user);
  const payloadAccount = safeObject(payloadObj.account);
  const payloadProfile = safeObject(payloadObj.profile);

  const resultUser = safeObject(result.user);
  const resultAccount = safeObject(result.account);
  const resultProfile = safeObject(result.profile);

  const preferences = safeObject(
    first(
      root.preferences,
      data.preferences,
      item.preferences,
      cuenta.preferences,
      account.preferences,
      user.preferences,
      profile.preferences,
      payloadObj.preferences,
      result.preferences,
      dataUser.preferences,
      dataAccount.preferences,
      payloadUser.preferences,
      payloadAccount.preferences,
      baseFallback.preferences
    )
  );

  const primary = safeObject(
    first(
      item,
      cuenta,
      account,
      user,
      profile,
      dataItem,
      dataAccount,
      dataUser,
      dataProfile,
      payloadObj.item,
      payloadObj.cuenta,
      payloadAccount,
      payloadUser,
      payloadProfile,
      result.item,
      result.cuenta,
      resultAccount,
      resultUser,
      resultProfile,
      data,
      payloadObj,
      result,
      root
    )
  );

  return {
    ...baseFallback,
    ...primary,
    ...preferences,

    user: hasOwnKeys(user)
      ? user
      : hasOwnKeys(primary.user)
        ? primary.user
        : safeObject(baseFallback.user),

    account: hasOwnKeys(account)
      ? account
      : hasOwnKeys(primary.account)
        ? primary.account
        : safeObject(baseFallback.account),

    profile: {
      ...safeObject(baseFallback.profile),
      ...safeObject(profile),
      ...safeObject(primary.profile),
    },

    preferences: {
      ...safeObject(baseFallback.preferences),
      ...preferences,
    },

    raw: payload,
  };
}

export function normalizeCuentaDetail(detail = {}, fallback = {}) {
  const fallbackObj = safeObject(fallback);
  const source = collectCuentaSource(detail, fallbackObj);

  const hasRealSource =
    hasCuentaEvidence(detail) ||
    hasCuentaEvidence(source) ||
    hasCuentaEvidence(fallbackObj);

  if (!hasRealSource) {
    return null;
  }

  const rawTheme = first(
    source.theme,
    source.mode,
    source.appearance,
    source.colorMode,
    source.preferences?.theme,
    source.preferences?.mode,
    source.preferences?.appearance,
    fallbackObj.theme,
    fallbackObj.mode,
    fallbackObj.appearance
  );

  const darkMode = normalizeBoolean(
    first(
      source.darkMode,
      source.isDark,
      source.preferences?.darkMode,
      source.preferences?.isDark,
      rawTheme === "dark" ? true : null,
      rawTheme === "light" ? false : null,
      fallbackObj.darkMode,
      fallbackObj.preferences?.darkMode,
      DEFAULT_THEME === "dark"
    ),
    normalizeTheme(rawTheme, Boolean(fallbackObj.darkMode)) === "dark"
  );

  const theme = normalizeTheme(
    first(rawTheme, darkMode ? "dark" : "light"),
    darkMode
  );

  const privacyMode = normalizeBoolean(
    first(
      source.privacyMode,
      source.privateMode,
      source.isPrivate,
      source.preferences?.privacyMode,
      source.preferences?.privateMode,
      fallbackObj.privacyMode,
      fallbackObj.preferences?.privacyMode,
      false
    ),
    false
  );

  const lang = normalizeLang(
    first(
      source.lang,
      source.language,
      source.locale,
      source.idioma,
      source.preferences?.lang,
      source.preferences?.language,
      source.preferences?.locale,
      fallbackObj.lang,
      fallbackObj.language,
      fallbackObj.locale,
      fallbackObj.preferences?.lang,
      DEFAULT_LANG
    )
  );

  const userId = safeText(
    first(
      source.userId,
      source.uid,
      source.sub,
      source.user_id,
      source.user?.userId,
      source.user?.id,
      source.account?.userId,
      source.preferences?.userId,
      fallbackObj.userId,
      fallbackObj.uid,
      fallbackObj.sub,
      fallbackObj.id
    ),
    ""
  );

  const id = safeText(
    first(
      source.id,
      source._id,
      userId,
      fallbackObj.id,
      fallbackObj._id,
      CUENTA_RESOURCE
    ),
    CUENTA_RESOURCE
  );

  const email = safeLower(
    first(
      source.email,
      source.emailLower,
      source.mail,
      source.userEmail,
      source.profile?.email,
      source.user?.email,
      source.account?.email,
      fallbackObj.email,
      fallbackObj.emailLower,
      fallbackObj.mail
    ),
    ""
  );

  const username = safeText(
    first(
      source.username,
      source.usernameLower,
      source.userName,
      source.handle,
      source.slug,
      source.profile?.username,
      source.user?.username,
      source.account?.username,
      fallbackObj.username,
      fallbackObj.usernameLower,
      fallbackObj.userName
    ),
    ""
  );

  const name = safeText(
    first(
      source.name,
      source.nombre,
      source.fullName,
      source.displayName,
      source.profile?.name,
      source.profile?.nombre,
      source.profile?.fullName,
      source.profile?.displayName,
      source.user?.name,
      source.user?.nombre,
      source.user?.fullName,
      source.user?.displayName,
      source.account?.name,
      source.account?.displayName,
      fallbackObj.name,
      fallbackObj.nombre,
      fallbackObj.fullName,
      fallbackObj.displayName,
      username,
      email,
      "Usuario Onion"
    ),
    "Usuario Onion"
  );

  const phone = safeText(
    first(
      source.phone,
      source.telefono,
      source.mobile,
      source.tel,
      source.profile?.phone,
      source.profile?.telefono,
      source.user?.phone,
      source.user?.telefono,
      fallbackObj.phone,
      fallbackObj.telefono,
      fallbackObj.mobile
    ),
    ""
  );

  const avatarUrl = safeText(
    first(
      source.avatarUrl,
      source.avatarURL,
      source.avatar_url,
      source.avatar,
      source.photoUrl,
      source.photoURL,
      source.photo_url,
      source.photo,
      source.imageUrl,
      source.image,
      source.picture,
      source.pictureUrl,
      source.profilePicture,
      source.profilePictureUrl,

      source.profile?.avatarUrl,
      source.profile?.avatar,
      source.profile?.photoUrl,
      source.profile?.photoURL,
      source.profile?.imageUrl,
      source.profile?.image,
      source.profile?.picture,
      source.profile?.pictureUrl,

      source.user?.avatarUrl,
      source.user?.avatar,
      source.user?.photoUrl,
      source.user?.photoURL,
      source.user?.imageUrl,
      source.user?.image,
      source.user?.picture,
      source.user?.pictureUrl,

      source.account?.avatarUrl,
      source.account?.avatar,
      source.account?.photoUrl,
      source.account?.imageUrl,

      fallbackObj.avatarUrl,
      fallbackObj.avatar,
      fallbackObj.photoUrl,
      fallbackObj.photoURL,
      fallbackObj.picture,
      fallbackObj.pictureUrl,
      ""
    ),
    ""
  );

  const role = normalizeRole(
    first(
      source.role,
      source.rol,
      source.accountRole,
      source.profileRole,
      source.user?.role,
      source.user?.rol,
      source.account?.role,
      fallbackObj.role,
      fallbackObj.rol,
      DEFAULT_ROLE
    )
  );

  const status = normalizeStatus(
    first(
      source.status,
      source.estado,
      source.accountStatus,
      source.profileStatus,
      source.user?.status,
      source.account?.status,
      fallbackObj.status,
      fallbackObj.estado,
      DEFAULT_STATUS
    )
  );

  const clienteId = safeText(
    first(
      source.clienteId,
      source.clientId,
      source.customerId,
      source.cliente?.clienteId,
      source.cliente?.id,
      source.user?.clienteId,
      source.account?.clienteId,
      fallbackObj.clienteId,
      fallbackObj.clientId,
      fallbackObj.customerId,
      ""
    ),
    ""
  );

  const nif = safeText(
    first(
      source.nif,
      source.taxId,
      source.cif,
      fallbackObj.nif,
      fallbackObj.taxId,
      ""
    ),
    ""
  );

  const createdAt = first(
    source.createdAt,
    source.created_at,
    source.created,
    source.registeredAt,
    fallbackObj.createdAt,
    fallbackObj.created_at,
    null
  );

  const updatedAt = first(
    source.updatedAt,
    source.updated_at,
    source.modifiedAt,
    source.lastUpdatedAt,
    source.preferences?.updatedAt,
    fallbackObj.updatedAt,
    fallbackObj.updated_at,
    fallbackObj.preferences?.updatedAt,
    null
  );

  const lastLoginAt = first(
    source.lastLoginAt,
    source.lastLogin,
    source.lastSeenAt,
    source.lastAccessAt,
    source.session?.lastLoginAt,
    fallbackObj.lastLoginAt,
    fallbackObj.lastSeenAt,
    null
  );

  const active = normalizeBoolean(
    first(
      source.active,
      source.enabled,
      status === "active" ? true : null,
      fallbackObj.active,
      true
    ),
    true
  );

  const preferences = {
    ...safeObject(fallbackObj.preferences),
    ...safeObject(source.preferences),

    darkMode,
    privacyMode,

    theme,
    mode: theme,
    appearance: theme,

    lang,
    language: lang,
    locale: lang,

    updatedAt,
  };

  const profile = {
    ...safeObject(fallbackObj.profile),
    ...safeObject(source.profile),

    name,
    nombre: safeText(first(source.profile?.nombre, name), name),
    fullName: safeText(first(source.profile?.fullName, name), name),
    displayName: safeText(first(source.profile?.displayName, name), name),

    email,
    username,

    phone,
    telefono: phone,

    avatar: avatarUrl,
    avatarUrl,
    photoUrl: avatarUrl,
    photoURL: avatarUrl,
    picture: avatarUrl,
    pictureUrl: avatarUrl,
  };

  return {
    ...fallbackObj,
    ...source,

    id,
    _id: safeText(first(source._id, id), id),

    userId,
    uid: safeText(first(source.uid, userId), userId),
    sub: safeText(first(source.sub, userId), userId),

    email,
    emailLower: safeLower(first(source.emailLower, email), email),

    username,
    usernameLower: safeLower(first(source.usernameLower, username), username),

    name,
    nombre: safeText(first(source.nombre, name), name),
    fullName: safeText(first(source.fullName, name), name),
    displayName: safeText(first(source.displayName, name, username, email), name),

    phone,
    telefono: safeText(first(source.telefono, phone), phone),
    mobile: safeText(first(source.mobile, phone), phone),

    avatar: avatarUrl,
    avatarUrl,
    avatarURL: avatarUrl,
    avatar_url: avatarUrl,
    photoUrl: avatarUrl,
    photoURL: avatarUrl,
    photo_url: avatarUrl,
    picture: avatarUrl,
    pictureUrl: avatarUrl,
    image: avatarUrl,
    imageUrl: avatarUrl,
    profilePicture: avatarUrl,
    profilePictureUrl: avatarUrl,

    role,
    rol: role,

    status,
    estado: status,
    active,

    clienteId,
    clientId: safeText(first(source.clientId, clienteId), clienteId),
    customerId: safeText(first(source.customerId, clienteId), clienteId),

    nif,

    darkMode,
    privacyMode,

    theme,
    mode: theme,
    appearance: theme,
    colorMode: theme,

    lang,
    language: lang,
    locale: lang,
    idioma: lang,

    createdAt,
    created_at: createdAt,

    updatedAt,
    updated_at: updatedAt,

    lastLoginAt,

    preferences,

    settings: {
      ...safeObject(fallbackObj.settings),
      ...safeObject(source.settings),
      ...preferences,
    },

    profile,

    user: {
      ...safeObject(source.user),
      id,
      userId,
      email,
      username,
      name,
      displayName: name,
      phone,
      avatarUrl,
      role,
      status,
      ...preferences,
    },

    account: {
      ...safeObject(source.account),
      id,
      userId,
      email,
      username,
      name,
      displayName: name,
      phone,
      avatarUrl,
      role,
      status,
      clienteId,
      ...preferences,
    },

    raw: detail,
  };
}

function looksLikeCuenta(value = null) {
  const obj = safeObject(value);

  return Boolean(
    Object.prototype.hasOwnProperty.call(obj, "darkMode") ||
      Object.prototype.hasOwnProperty.call(obj, "privacyMode") ||
      Object.prototype.hasOwnProperty.call(obj, "theme") ||
      Object.prototype.hasOwnProperty.call(obj, "appearance") ||
      Object.prototype.hasOwnProperty.call(obj, "lang") ||
      Object.prototype.hasOwnProperty.call(obj, "language") ||
      Object.prototype.hasOwnProperty.call(obj, "locale") ||
      obj.updatedAt ||
      obj.updated_at ||
      obj.userId ||
      obj.uid ||
      obj.sub ||
      obj.id ||
      obj.preferences ||
      obj.profile ||
      obj.account ||
      obj.cuenta ||
      obj.user ||
      obj.email ||
      obj.username ||
      obj.name ||
      obj.displayName ||
      obj.avatarUrl ||
      obj.avatar
  );
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function unwrapResponseEnvelope(payload = null) {
  if (payload === null || payload === undefined) return null;
  if (Array.isArray(payload)) return payload;

  const obj = safeObject(payload);

  if (!Object.keys(obj).length) return payload;

  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.rows)) return obj.rows;
  if (Array.isArray(obj.data)) return obj.data;

  if (obj.item) return obj.item;
  if (obj.cuenta) return obj.cuenta;
  if (obj.account) return obj.account;
  if (obj.user) return obj.user;
  if (obj.profile) return obj.profile;
  if (obj.detail) return obj.detail;
  if (obj.result) return obj.result;

  if (obj.payload) return unwrapResponseEnvelope(obj.payload);

  if (obj.data && typeof obj.data === "object") {
    return unwrapResponseEnvelope(obj.data);
  }

  if (obj.preferences) return obj;

  return obj;
}

function pickDetail(payload = null) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload[0] || null;
  if (looksLikeCuenta(payload)) return payload;

  const obj = safeObject(payload);

  if (looksLikeCuenta(obj.item)) return obj.item;
  if (looksLikeCuenta(obj.cuenta)) return obj.cuenta;
  if (looksLikeCuenta(obj.account)) return obj.account;
  if (looksLikeCuenta(obj.user)) return obj.user;
  if (looksLikeCuenta(obj.profile)) return obj.profile;
  if (looksLikeCuenta(obj.detail)) return obj.detail;
  if (looksLikeCuenta(obj.result)) return obj.result;
  if (looksLikeCuenta(obj.payload)) return obj.payload;
  if (looksLikeCuenta(obj.data)) return obj.data;

  if (obj.data && typeof obj.data === "object") {
    return pickDetail(obj.data);
  }

  if (obj.payload && typeof obj.payload === "object") {
    return pickDetail(obj.payload);
  }

  return Object.keys(obj).length ? obj : null;
}

function normalizeCuentaResponse(response = null, fallback = {}) {
  const source =
    pickDetail(response) ||
    unwrapResponseEnvelope(response) ||
    response ||
    {};

  return normalizeCuentaDetail(source, fallback);
}

function pickMeta(payload = null) {
  const obj = safeObject(payload);
  const data = safeObject(obj.data);
  const payloadObj = safeObject(obj.payload);
  const meta = safeObject(first(obj.meta, data.meta, payloadObj.meta, obj));

  return {
    ok: Boolean(first(obj.ok, data.ok, payloadObj.ok, true)),
    service: safeText(
      first(
        meta.service,
        obj.service,
        data.service,
        payloadObj.service,
        "user-preferences"
      ),
      "user-preferences"
    ),
    version: safeText(
      first(meta.version, obj.version, data.version, payloadObj.version),
      ""
    ),
    container: safeText(
      first(meta.container, obj.container, data.container, payloadObj.container),
      ""
    ),
    partitionKey: safeText(
      first(
        meta.partitionKey,
        obj.partitionKey,
        data.partitionKey,
        payloadObj.partitionKey
      ),
      ""
    ),
    defaults: safeObject(
      first(meta.defaults, obj.defaults, data.defaults, payloadObj.defaults)
    ),
    endpoints: safeArray(
      first(meta.endpoints, obj.endpoints, data.endpoints, payloadObj.endpoints)
    ),
    accepts: safeObject(
      first(meta.accepts, obj.accepts, data.accepts, payloadObj.accepts)
    ),
    user: safeObject(
      first(meta.user, obj.user, data.user, payloadObj.user)
    ),
    raw: payload,
  };
}

/* =========================================================
   REQUEST ADAPTERS
========================================================= */

async function requestViaApiClient(method = "GET", path = "", options = {}) {
  const client = getApiClient();

  if (!client) {
    throw new Error("CUENTA_API_CLIENT_UNAVAILABLE");
  }

  const verb = safeText(method, "GET").toLowerCase();
  const timeout = safeNumber(options.timeout, CUENTA_TIMEOUT);

  if (verb === "get" && typeof client.get === "function") {
    return client.get(path, {
      timeout,
      auth: true,
      headers: options.headers,
      query: options.query,
      params: options.params,
    });
  }

  if (verb === "post" && typeof client.post === "function") {
    return client.post(path, options.body, {
      timeout,
      auth: true,
      headers: options.headers,
      query: options.query,
      params: options.params,
    });
  }

  if (verb === "patch" && typeof client.patch === "function") {
    return client.patch(path, options.body, {
      timeout,
      auth: true,
      headers: options.headers,
      query: options.query,
      params: options.params,
    });
  }

  if (verb === "put" && typeof client.put === "function") {
    return client.put(path, options.body, {
      timeout,
      auth: true,
      headers: options.headers,
      query: options.query,
      params: options.params,
    });
  }

  if (typeof client.request === "function") {
    return client.request(path, {
      method: method.toUpperCase(),
      timeout,
      auth: true,
      headers: options.headers,
      query: options.query,
      params: options.params,
      body: options.body,
    });
  }

  throw new Error("CUENTA_API_CLIENT_METHOD_UNAVAILABLE");
}

async function requestViaAppCoreRequest(method = "GET", path = "", options = {}) {
  if (typeof AppCore?.request !== "function") {
    throw new Error("APP_CORE_REQUEST_UNAVAILABLE");
  }

  return AppCore.request(path, {
    method: method.toUpperCase(),
    timeout: options.timeout,
    headers: options.headers,
    query: options.query,
    params: options.params,
    body: options.body,
  });
}

async function requestViaHttpModule(method = "GET", path = "", options = {}) {
  const Http = getHttpModule();

  if (!Http) {
    throw new Error("HTTP_MODULE_UNAVAILABLE");
  }

  const verb = safeText(method, "GET").toLowerCase();

  if (verb === "get" && typeof Http.get === "function") {
    return Http.get(path, {
      headers: options.headers,
      query: options.query,
      params: options.params,
      timeout: options.timeout,
    });
  }

  if (verb === "post" && typeof Http.post === "function") {
    return Http.post(path, options.body, {
      headers: options.headers,
      query: options.query,
      params: options.params,
      timeout: options.timeout,
    });
  }

  if (verb === "patch" && typeof Http.patch === "function") {
    return Http.patch(path, options.body, {
      headers: options.headers,
      query: options.query,
      params: options.params,
      timeout: options.timeout,
    });
  }

  if (verb === "put" && typeof Http.put === "function") {
    return Http.put(path, options.body, {
      headers: options.headers,
      query: options.query,
      params: options.params,
      timeout: options.timeout,
    });
  }

  if (typeof Http.request === "function") {
    return Http.request(path, {
      method: method.toUpperCase(),
      headers: options.headers,
      query: options.query,
      params: options.params,
      timeout: options.timeout,
      body: options.body,
    });
  }

  throw new Error("HTTP_MODULE_METHOD_UNAVAILABLE");
}

async function requestViaFetch(method = "GET", path = "", options = {}) {
  const body = options.body;
  const url = buildAbsoluteUrl(path, options.query || options.params || {});
  const controller = new AbortController();

  const timeout = safeNumber(options.timeout, CUENTA_TIMEOUT);

  const timeoutId = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, timeout);

  const headers = getRequestHeaders(options.headers, body);

  const finalOptions = {
    method: method.toUpperCase(),
    headers,
    credentials: "include",
    signal: controller.signal,
  };

  if (body !== undefined && body !== null) {
    if (isFormData(body)) {
      finalOptions.body = body;
    } else if (
      typeof body === "string" ||
      isBlob(body) ||
      isArrayBuffer(body)
    ) {
      finalOptions.body = body;
    } else {
      finalOptions.headers = {
        ...headers,
        "Content-Type": headers["Content-Type"] || "application/json",
      };

      finalOptions.body = JSON.stringify(body);
    }
  }

  try {
    const response = await fetch(url, finalOptions);
    const contentType = safeText(response.headers.get("content-type"), "");

    let data = null;

    if (response.status !== 204) {
      if (contentType.includes("application/json")) {
        try {
          data = await response.json();
        } catch {
          data = null;
        }
      } else {
        const text = await response.text();

        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = text ? { raw: text } : null;
        }
      }
    }

    if (!response.ok) {
      const error = new Error(
        normalizeErrorMessage(
          data,
          `HTTP ${response.status} en ${method.toUpperCase()} ${path}`
        )
      );

      error.response = data;
      error.status = response.status;
      error.statusCode = response.status;
      error.url = url;

      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request(method = "GET", path = "", options = {}) {
  const body = options.body;

  const requestOptions = {
    timeout: safeNumber(options.timeout, CUENTA_TIMEOUT),
    query: safeObject(options.query),
    params: safeObject(options.params),
    body,
    headers: getRequestHeaders(
      {
        ...(!isFormData(body) &&
        body !== undefined &&
        body !== null &&
        !isBlob(body) &&
        !isArrayBuffer(body)
          ? { "Content-Type": "application/json" }
          : {}),
        ...safeObject(options.headers),
      },
      body
    ),
  };

  const adapters = isFormData(body)
    ? [
        requestViaFetch,
        requestViaApiClient,
        requestViaAppCoreRequest,
        requestViaHttpModule,
      ]
    : [
        requestViaApiClient,
        requestViaAppCoreRequest,
        requestViaHttpModule,
        requestViaFetch,
      ];

  let lastError = null;

  for (const adapter of adapters) {
    try {
      return await adapter(method, path, requestOptions);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("CUENTA_REQUEST_FAILED");
}

async function requestFirst(method = "GET", paths = [], options = {}) {
  const candidates = safeArray(paths)
    .map((path) => safeText(path, ""))
    .filter(Boolean);

  let lastError = null;

  for (const path of candidates) {
    try {
      return await request(method, path, options);
    } catch (error) {
      lastError = error;

      if (!shouldTryNextEndpoint(error)) {
        break;
      }
    }
  }

  throw lastError || new Error("CUENTA_REQUEST_CANDIDATES_FAILED");
}

/* =========================================================
   PAYLOAD BUILDERS
========================================================= */

function normalizeCuentaUpdatePayload(payload = {}) {
  const body = safeObject(payload);

  const hasDarkMode =
    Object.prototype.hasOwnProperty.call(body, "darkMode") ||
    Object.prototype.hasOwnProperty.call(body, "isDark") ||
    Object.prototype.hasOwnProperty.call(body, "theme") ||
    Object.prototype.hasOwnProperty.call(body, "mode") ||
    Object.prototype.hasOwnProperty.call(body, "appearance");

  const hasPrivacyMode =
    Object.prototype.hasOwnProperty.call(body, "privacyMode") ||
    Object.prototype.hasOwnProperty.call(body, "privateMode") ||
    Object.prototype.hasOwnProperty.call(body, "privacy");

  const hasLang =
    Object.prototype.hasOwnProperty.call(body, "lang") ||
    Object.prototype.hasOwnProperty.call(body, "language") ||
    Object.prototype.hasOwnProperty.call(body, "locale") ||
    Object.prototype.hasOwnProperty.call(body, "idioma");

  const hasName =
    Object.prototype.hasOwnProperty.call(body, "name") ||
    Object.prototype.hasOwnProperty.call(body, "displayName") ||
    Object.prototype.hasOwnProperty.call(body, "fullName") ||
    Object.prototype.hasOwnProperty.call(body, "nombre");

  const hasPhone =
    Object.prototype.hasOwnProperty.call(body, "phone") ||
    Object.prototype.hasOwnProperty.call(body, "telefono") ||
    Object.prototype.hasOwnProperty.call(body, "mobile");

  const rawTheme = first(
    body.theme,
    body.mode,
    body.appearance,
    body.darkMode === true ? "dark" : null,
    body.darkMode === false ? "light" : null
  );

  const darkMode = normalizeBoolean(
    first(
      body.darkMode,
      body.isDark,
      rawTheme === "dark" ? true : null,
      rawTheme === "light" ? false : null
    ),
    false
  );

  const privacyMode = normalizeBoolean(
    first(body.privacyMode, body.privateMode, body.privacy),
    false
  );

  const lang = normalizeLang(
    first(body.lang, body.language, body.locale, body.idioma, DEFAULT_LANG)
  );

  const name = safeText(
    first(body.name, body.displayName, body.fullName, body.nombre),
    ""
  );

  const phone = safeText(
    first(body.phone, body.telefono, body.mobile),
    ""
  );

  return cleanPayload({
    ...body,

    ...(hasName
      ? {
          name,
          displayName: name,
          fullName: name,
          nombre: name,
        }
      : {}),

    ...(hasPhone
      ? {
          phone,
          telefono: phone,
          mobile: phone,
        }
      : {}),

    ...(hasDarkMode
      ? {
          darkMode,
          theme: darkMode ? "dark" : "light",
          mode: darkMode ? "dark" : "light",
          appearance: darkMode ? "dark" : "light",
        }
      : {}),

    ...(hasPrivacyMode
      ? {
          privacyMode,
        }
      : {}),

    ...(hasLang
      ? {
          lang,
          language: lang,
          locale: lang,
        }
      : {}),
  });
}

function normalizeThemePayload(darkMode = true) {
  const nextDarkMode = normalizeBoolean(darkMode, true);

  return {
    darkMode: nextDarkMode,
    theme: nextDarkMode ? "dark" : "light",
    mode: nextDarkMode ? "dark" : "light",
    appearance: nextDarkMode ? "dark" : "light",
  };
}

function normalizePrivacyPayload(privacyMode = false) {
  return {
    privacyMode: normalizeBoolean(privacyMode, false),
  };
}

function normalizeLanguagePayload(lang = DEFAULT_LANG) {
  const nextLang = normalizeLang(lang);

  return {
    lang: nextLang,
    language: nextLang,
    locale: nextLang,
  };
}

/* =========================================================
   RAW REQUESTS
========================================================= */

export async function fetchCuentaRequest({
  timeout = CUENTA_TIMEOUT,
  query = {},
} = {}) {
  const response = await requestFirst(
    "GET",
    [
      CUENTA_ENDPOINT,
      CUENTA_ALT_ENDPOINT,
    ],
    {
      timeout,
      query,
    }
  );

  return normalizeCuentaResponse(response, getCachedCuenta());
}

export async function getCuentaByIdRequest(
  id = "",
  {
    timeout = CUENTA_DETAIL_TIMEOUT,
  } = {}
) {
  const cleanId = safeText(id, "");

  const response = await requestFirst(
    "GET",
    cleanId
      ? [
          getCuentaByIdEndpoint(cleanId),
          CUENTA_ENDPOINT,
          CUENTA_ALT_ENDPOINT,
        ]
      : [
          CUENTA_ENDPOINT,
          CUENTA_ALT_ENDPOINT,
        ],
    {
      timeout,
    }
  );

  return normalizeCuentaResponse(response, getCachedCuenta());
}

export async function updateCuentaRequest(
  payload = {},
  {
    timeout = CUENTA_TIMEOUT,
    method = "PATCH",
  } = {}
) {
  const body = normalizeCuentaUpdatePayload(payload);
  const httpMethod = safeText(method, "PATCH").toUpperCase() === "PUT" ? "PUT" : "PATCH";

  const response = await requestFirst(
    httpMethod,
    [
      CUENTA_ENDPOINT,
      CUENTA_ALT_ENDPOINT,
    ],
    {
      timeout,
      body,
    }
  );

  return normalizeCuentaResponse(response, {
    ...getCachedCuenta(),
    ...body,
  });
}

export async function updateCuentaThemeRequest(
  darkMode = true,
  {
    timeout = CUENTA_TIMEOUT,
  } = {}
) {
  const body = normalizeThemePayload(darkMode);

  const response = await requestFirst(
    "PATCH",
    [
      CUENTA_THEME_ENDPOINT,
      CUENTA_ENDPOINT,
      CUENTA_ALT_ENDPOINT,
    ],
    {
      timeout,
      body,
    }
  );

  return normalizeCuentaResponse(response, {
    ...getCachedCuenta(),
    ...body,
  });
}

export async function toggleCuentaThemeRequest({
  timeout = CUENTA_TIMEOUT,
} = {}) {
  try {
    const response = await requestFirst(
      "PATCH",
      [
        CUENTA_THEME_TOGGLE_ENDPOINT,
      ],
      {
        timeout,
        body: {},
      }
    );

    return normalizeCuentaResponse(response, getCachedCuenta());
  } catch (error) {
    if (!shouldTryNextEndpoint(error)) {
      throw error;
    }

    const current = normalizeCuentaDetail(getCachedCuenta(), {}) || {};
    const nextDarkMode = !normalizeBoolean(current.darkMode, false);

    return updateCuentaThemeRequest(nextDarkMode, {
      timeout,
    });
  }
}

export async function updateCuentaPrivacyRequest(
  privacyMode = false,
  {
    timeout = CUENTA_TIMEOUT,
  } = {}
) {
  const body = normalizePrivacyPayload(privacyMode);

  const response = await requestFirst(
    "PATCH",
    [
      CUENTA_PRIVACY_ENDPOINT,
      CUENTA_ENDPOINT,
      CUENTA_ALT_ENDPOINT,
    ],
    {
      timeout,
      body,
    }
  );

  return normalizeCuentaResponse(response, {
    ...getCachedCuenta(),
    ...body,
  });
}

export async function toggleCuentaPrivacyRequest({
  timeout = CUENTA_TIMEOUT,
} = {}) {
  try {
    const response = await requestFirst(
      "PATCH",
      [
        CUENTA_PRIVACY_TOGGLE_ENDPOINT,
      ],
      {
        timeout,
        body: {},
      }
    );

    return normalizeCuentaResponse(response, getCachedCuenta());
  } catch (error) {
    if (!shouldTryNextEndpoint(error)) {
      throw error;
    }

    const current = normalizeCuentaDetail(getCachedCuenta(), {}) || {};
    const nextPrivacyMode = !normalizeBoolean(current.privacyMode, false);

    return updateCuentaPrivacyRequest(nextPrivacyMode, {
      timeout,
    });
  }
}

export async function updateCuentaLanguageRequest(
  lang = DEFAULT_LANG,
  {
    timeout = CUENTA_TIMEOUT,
  } = {}
) {
  const body = normalizeLanguagePayload(lang);

  const response = await requestFirst(
    "PATCH",
    [
      CUENTA_LANGUAGE_ENDPOINT,
      CUENTA_LANG_ENDPOINT,
      CUENTA_ENDPOINT,
      CUENTA_ALT_ENDPOINT,
    ],
    {
      timeout,
      body,
    }
  );

  return normalizeCuentaResponse(response, {
    ...getCachedCuenta(),
    ...body,
  });
}

export async function fetchCuentaMetaRequest({
  timeout = CUENTA_TIMEOUT,
} = {}) {
  const response = await requestFirst(
    "GET",
    [
      CUENTA_META_ENDPOINT,
      `${CUENTA_ENDPOINT}/_meta`,
      `${CUENTA_ALT_ENDPOINT}/_meta`,
    ],
    {
      timeout,
    }
  );

  return pickMeta(response);
}

/* =========================================================
   CACHE
========================================================= */

function readCache() {
  if (!isBrowser()) return null;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const createdAt = safeNumber(parsed?.createdAt, 0);

    if (!createdAt || Date.now() - createdAt > CACHE_MAX_AGE_MS) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeCache(item = null) {
  if (!isBrowser()) return false;

  try {
    if (!hasCuentaEvidence(item)) return false;

    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        createdAt: Date.now(),
        item,
      })
    );

    return true;
  } catch {
    return false;
  }
}

export function hydrateCuentaFromCache() {
  try {
    const sessionFallback = getSessionUserFallback();

    const current = safeObject(cuentaState?.item);

    if (hasCuentaEvidence(current)) {
      const normalized = normalizeCuentaDetail(current, sessionFallback);

      if (normalized) {
        replaceCuentaStore(normalized);
        callSafe(setItem, normalized);
        callSafe(setHydrated, true);
        callSafe(setLoaded, true);

        return normalized;
      }
    }

    const stored = safeObject(getCuentaStore?.());

    if (hasCuentaEvidence(stored)) {
      const normalized = normalizeCuentaDetail(stored, sessionFallback);

      if (normalized) {
        replaceCuentaStore(normalized);
        callSafe(setItem, normalized);
        callSafe(setHydrated, true);
        callSafe(setLoaded, true);

        return normalized;
      }
    }

    const cached = readCache();

    if (hasCuentaEvidence(cached?.item)) {
      const normalized = normalizeCuentaDetail(cached.item, sessionFallback);

      if (normalized) {
        replaceCuentaStore(normalized);
        callSafe(setItem, normalized);
        callSafe(setHydrated, true);
        callSafe(setLoaded, true);

        return normalized;
      }
    }

    if (hasCuentaEvidence(sessionFallback)) {
      const normalized = normalizeCuentaDetail(sessionFallback, {});

      if (normalized) {
        replaceCuentaStore(normalized);
        callSafe(setItem, normalized);
        callSafe(setHydrated, true);

        return normalized;
      }
    }

    return {};
  } catch {
    return {};
  }
}

/* =========================================================
   STATE HYDRATION
========================================================= */

function applyLoadedDetailToState(detail = null, { replace = true } = {}) {
  const normalized = normalizeCuentaDetail(detail, getCachedCuenta());

  if (!normalized) return null;

  if (replace) {
    replaceCuentaStore(normalized);
  } else {
    try {
      upsertCuentaStore?.(normalized);
    } catch {
      replaceCuentaStore(normalized);
    }
  }

  callSafe(setItem, normalized);
  callSafe(setLastSyncAt, Date.now());
  callSafe(setLoaded, true);
  callSafe(setHydrated, true);
  callSafe(setError, null);

  writeCache(normalized);

  safeEmit("cuenta:api:state:applied", {
    detail: normalized,
    replace,
  });

  return normalized;
}

/* =========================================================
   LOAD DETAIL
========================================================= */

export async function loadCuenta({
  force = false,
  query = {},
  silent = false,
} = {}) {
  const loadToken = nextLoadToken();

  const cached = getCachedCuenta();

  const firstLoad =
    !Boolean(cuentaState?.hydrated) &&
    !hasCuentaEvidence(cuentaState?.item) &&
    !hasCuentaEvidence(cached);

  const shouldShowLoading = firstLoad && !force && !silent;

  try {
    callSafe(setError, null);

    if (shouldShowLoading) {
      callSafe(setLoading, true);
    } else if (!silent) {
      callSafe(setRefreshing, true);
    }

    const detail = await fetchCuentaRequest({
      timeout: CUENTA_TIMEOUT,
      query: {
        ...safeObject(query),
        ...(force ? { _t: Date.now() } : {}),
      },
    });

    if (!isActiveLoadToken(loadToken)) {
      return normalizeCuentaDetail(cuentaState?.item, getCachedCuenta());
    }

    return applyLoadedDetailToState(detail, {
      replace: true,
    });
  } catch (error) {
    const message = normalizeErrorMessage(
      error,
      "No se pudo cargar la cuenta."
    );

    if (!isActiveLoadToken(loadToken)) {
      return normalizeCuentaDetail(cuentaState?.item, getCachedCuenta());
    }

    console.error("❌ CUENTA LOAD:", error);

    callSafe(setError, message);
    callSafe(setLoaded, true);
    callSafe(setHydrated, true);

    throw error;
  } finally {
    if (isActiveLoadToken(loadToken)) {
      callSafe(setLoading, false);
      callSafe(setRefreshing, false);
    }
  }
}

/* =========================================================
   MUTATIONS
========================================================= */

export async function updateCuenta(payload = {}, options = {}) {
  try {
    callSafe(setSaving, true);
    callSafe(setError, null);

    const updated = await updateCuentaRequest(payload, options);

    return applyLoadedDetailToState(updated, {
      replace: false,
    });
  } catch (error) {
    console.error("❌ CUENTA UPDATE:", error);

    callSafe(
      setError,
      normalizeErrorMessage(
        error,
        "No se pudo actualizar la cuenta."
      )
    );

    throw error;
  } finally {
    callSafe(setSaving, false);
  }
}

export async function updateCuentaTheme(darkMode = true, options = {}) {
  try {
    callSafe(setSaving, true);
    callSafe(setError, null);

    const updated = await updateCuentaThemeRequest(darkMode, options);

    return applyLoadedDetailToState(updated, {
      replace: false,
    });
  } catch (error) {
    console.error("❌ CUENTA THEME UPDATE:", error);

    callSafe(
      setError,
      normalizeErrorMessage(
        error,
        "No se pudo actualizar el tema."
      )
    );

    throw error;
  } finally {
    callSafe(setSaving, false);
  }
}

export async function toggleCuentaTheme(options = {}) {
  try {
    callSafe(setSaving, true);
    callSafe(setError, null);

    const updated = await toggleCuentaThemeRequest(options);

    return applyLoadedDetailToState(updated, {
      replace: false,
    });
  } catch (error) {
    console.error("❌ CUENTA THEME TOGGLE:", error);

    callSafe(
      setError,
      normalizeErrorMessage(
        error,
        "No se pudo alternar el tema."
      )
    );

    throw error;
  } finally {
    callSafe(setSaving, false);
  }
}

export async function updateCuentaPrivacy(privacyMode = false, options = {}) {
  try {
    callSafe(setSaving, true);
    callSafe(setError, null);

    const updated = await updateCuentaPrivacyRequest(privacyMode, options);

    return applyLoadedDetailToState(updated, {
      replace: false,
    });
  } catch (error) {
    console.error("❌ CUENTA PRIVACY UPDATE:", error);

    callSafe(
      setError,
      normalizeErrorMessage(
        error,
        "No se pudo actualizar la privacidad."
      )
    );

    throw error;
  } finally {
    callSafe(setSaving, false);
  }
}

export async function toggleCuentaPrivacy(options = {}) {
  try {
    callSafe(setSaving, true);
    callSafe(setError, null);

    const updated = await toggleCuentaPrivacyRequest(options);

    return applyLoadedDetailToState(updated, {
      replace: false,
    });
  } catch (error) {
    console.error("❌ CUENTA PRIVACY TOGGLE:", error);

    callSafe(
      setError,
      normalizeErrorMessage(
        error,
        "No se pudo alternar la privacidad."
      )
    );

    throw error;
  } finally {
    callSafe(setSaving, false);
  }
}

export async function updateCuentaLanguage(lang = DEFAULT_LANG, options = {}) {
  try {
    callSafe(setSaving, true);
    callSafe(setError, null);

    const updated = await updateCuentaLanguageRequest(lang, options);

    return applyLoadedDetailToState(updated, {
      replace: false,
    });
  } catch (error) {
    console.error("❌ CUENTA LANGUAGE UPDATE:", error);

    callSafe(
      setError,
      normalizeErrorMessage(
        error,
        "No se pudo actualizar el idioma."
      )
    );

    throw error;
  } finally {
    callSafe(setSaving, false);
  }
}

export async function loadCuentaMeta() {
  try {
    const meta = await fetchCuentaMetaRequest({
      timeout: CUENTA_TIMEOUT,
    });

    callSafe(setMeta, meta);

    return meta;
  } catch (error) {
    console.error("❌ CUENTA META:", error);
    throw error;
  }
}

/* =========================================================
   PUBLIC BRIDGE
========================================================= */

function registerCuentaApiBridge(api) {
  try {
    if (!AppCore.modules || typeof AppCore.modules !== "object") {
      AppCore.modules = {};
    }

    AppCore.modules.CuentaApi = api;
    AppCore.modules.OnionCuentaApi = api;
    AppCore.modules.UserPreferencesApi = api;
  } catch {}

  try {
    if (isBrowser()) {
      window.OnionCuentaApi = api;
      window.CuentaApi = api;
      window.UserPreferencesApi = api;
    }
  } catch {}

  return api;
}

/* =========================================================
   PUBLIC API
========================================================= */

export const CuentaApi = Object.freeze({
  resource: CUENTA_RESOURCE,

  endpoint: CUENTA_ENDPOINT,
  altEndpoint: CUENTA_ALT_ENDPOINT,

  themeEndpoint: CUENTA_THEME_ENDPOINT,
  themeToggleEndpoint: CUENTA_THEME_TOGGLE_ENDPOINT,

  privacyEndpoint: CUENTA_PRIVACY_ENDPOINT,
  privacyToggleEndpoint: CUENTA_PRIVACY_TOGGLE_ENDPOINT,

  languageEndpoint: CUENTA_LANGUAGE_ENDPOINT,
  langEndpoint: CUENTA_LANG_ENDPOINT,

  metaEndpoint: CUENTA_META_ENDPOINT,

  timeout: CUENTA_TIMEOUT,
  detailTimeout: CUENTA_DETAIL_TIMEOUT,

  getCuentaEndpoint,
  getCuentaAltEndpoint,
  getCuentaThemeEndpoint,
  getCuentaThemeToggleEndpoint,
  getCuentaPrivacyEndpoint,
  getCuentaPrivacyToggleEndpoint,
  getCuentaLanguageEndpoint,
  getCuentaLangEndpoint,
  getCuentaMetaEndpoint,
  getCuentaByIdEndpoint,

  normalizeCuentaDetail,

  hydrateCuentaFromCache,

  fetchCuentaRequest,
  getCuentaByIdRequest,
  updateCuentaRequest,
  updateCuentaThemeRequest,
  toggleCuentaThemeRequest,
  updateCuentaPrivacyRequest,
  toggleCuentaPrivacyRequest,
  updateCuentaLanguageRequest,
  fetchCuentaMetaRequest,

  loadCuenta,
  updateCuenta,
  updateCuentaTheme,
  toggleCuentaTheme,
  updateCuentaPrivacy,
  toggleCuentaPrivacy,
  updateCuentaLanguage,
  loadCuentaMeta,
});

registerCuentaApiBridge(CuentaApi);

export default CuentaApi;
