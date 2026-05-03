/* =========================================================
   Onion SPA - Cuenta API
   Archivo: src/views/cuenta/cuenta.api.js

   EXTREME PRO SYSTEM · API LAYER · FULL PATCH 12/10
   ACCOUNT BACKEND CONTRACT · PREFERENCES PRESERVER · RACE SAFE

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo cuenta
   - adaptar contrato backend /api/user/preferences al frontend
   - soportar fallback /api/user/settings / profile / legacy
   - exponer detalle + update + theme + language + password + meta
   - hidratar state/store/cache de forma coherente
   - normalizar payloads backend heterogéneos
   - preservar datos visibles del usuario cuando backend solo devuelve prefs
   - soportar múltiples adapters de request
   - prevenir race conditions blandas en cargas de detalle
   - registrar API pública en AppCore.modules/window
   - mantener surface pública estable para cuentaView.js / cuenta.actions.js

   BACKEND CONTRACT PRINCIPAL:
   - GET    /api/user/preferences
   - PATCH  /api/user/preferences
   - PATCH  /api/user/preferences/theme
   - PATCH  /api/user/preferences/language
   - GET    /api/user/preferences/_meta

   FALLBACK CONTRACT:
   - GET/PATCH /api/user/settings
   - GET/PATCH /api/user/profile
   - GET/PATCH /api/account/preferences
   - GET/PATCH /api/me/preferences

   HARDENING EXTREME:
   - get detalle devuelve objeto limpio y rico
   - soporta envelopes heterogéneos:
       data / payload / result / item / detail / preferences
       user / account / cuenta / profile / settings
   - fallback AppCore.apiClient -> AppCore.request -> Http -> fetch
   - fetch soporta JSON, FormData, Blob, ArrayBuffer, texto
   - query params reales
   - Content-Type seguro para FormData
   - update theme/language tienen fallback PATCH real
   - persistencia coherente en store/state/cache
   - errores con mensaje consistente
   - aliases públicos para actions legacy
========================================================= */

import { AppCore } from "../../core/index.js";

import * as CuentaState from "./cuenta.state.js";
import * as CuentaStore from "./cuenta.store.js";

/* =========================================================
   CONFIG
========================================================= */

export const CUENTA_RESOURCE = "cuenta";

export const CUENTA_ENDPOINT = "/api/user/preferences";
export const CUENTA_ALT_ENDPOINT = "/api/user/settings";
export const CUENTA_PROFILE_ENDPOINT = "/api/user/profile";
export const CUENTA_ACCOUNT_ENDPOINT = "/api/account/preferences";
export const CUENTA_ME_ENDPOINT = "/api/me/preferences";

export const CUENTA_THEME_ENDPOINT = "/api/user/preferences/theme";
export const CUENTA_LANGUAGE_ENDPOINT = "/api/user/preferences/language";
export const CUENTA_META_ENDPOINT = "/api/user/preferences/_meta";
export const CUENTA_PASSWORD_ENDPOINT = "/api/user/password";

export const CUENTA_TIMEOUT = 15000;
export const CUENTA_DETAIL_TIMEOUT = 25000;
export const CUENTA_MUTATION_TIMEOUT = 30000;

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

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFn(value) {
  return typeof value === "function";
}

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
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "string") {
    let normalized = value
      .trim()
      .replace(/€/g, "")
      .replace(/%/g, "")
      .replace(/\s/g, "");

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
    } else if (hasComma) {
      normalized = normalized.replace(/,/g, ".");
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

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

function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    ),
  ];
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

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return value !== 0;
  }

  const key = normalizeText(value);

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
      "activo",
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
      "inactivo",
      "light",
      "claro",
    ].includes(key)
  ) {
    return false;
  }

  return fallback;
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

function cleanPayload(payload = {}) {
  const obj = safeObject(payload);
  const next = {};

  Object.entries(obj).forEach(([key, value]) => {
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

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[CuentaApi]", ...args);
  } catch {}

  try {
    console.warn("[CuentaApi]", ...args);
  } catch {}
}

/* =========================================================
   LOAD TOKEN
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

export function getCuentaProfileEndpoint() {
  return CUENTA_PROFILE_ENDPOINT;
}

export function getCuentaAccountEndpoint() {
  return CUENTA_ACCOUNT_ENDPOINT;
}

export function getCuentaMeEndpoint() {
  return CUENTA_ME_ENDPOINT;
}

export function getCuentaThemeEndpoint() {
  return CUENTA_THEME_ENDPOINT;
}

export function getCuentaLanguageEndpoint() {
  return CUENTA_LANGUAGE_ENDPOINT;
}

export function getCuentaMetaEndpoint() {
  return CUENTA_META_ENDPOINT;
}

export function getCuentaPasswordEndpoint() {
  return CUENTA_PASSWORD_ENDPOINT;
}

export function normalizeCuentaId(id = "") {
  const value = safeText(id, "");

  if (!value) {
    throw new Error("CUENTA_ID_REQUIRED");
  }

  return value;
}

export function getCuentaByIdEndpoint(id = "") {
  const userId = normalizeCuentaId(id);
  return `/api/users/${encodeUrlPathSegment(userId)}`;
}

export function getCuentaByIdPreferencesEndpoint(id = "") {
  const userId = normalizeCuentaId(id);
  return `/api/users/${encodeUrlPathSegment(userId)}/preferences`;
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

function normalizeLang(value = DEFAULT_LANG) {
  const key = normalizeKey(value);

  if (["en", "eng", "english", "en_us", "en_gb"].includes(key)) {
    return "en";
  }

  if (
    [
      "ca",
      "cat",
      "catala",
      "catalan",
      "ca_es",
      "catalunya",
    ].includes(key)
  ) {
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
  const roleObject = safeObject(value, null);

  const raw = roleObject
    ? first(roleObject.name, roleObject.nombre, roleObject.code, roleObject.id, DEFAULT_ROLE)
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

  if (["support", "soporte"].includes(key)) {
    return "support";
  }

  if (["technician", "tecnico", "técnico"].includes(key)) {
    return "technician";
  }

  if (["client", "cliente", "customer"].includes(key)) {
    return "client";
  }

  return "user";
}

function normalizeStatus(value = DEFAULT_STATUS) {
  const key = normalizeKey(value);

  if (["inactive", "inactivo", "disabled", "bloqueado", "blocked"].includes(key)) {
    return "inactive";
  }

  if (["pending", "pendiente"].includes(key)) {
    return "pending";
  }

  if (["deleted", "eliminado", "removed"].includes(key)) {
    return "deleted";
  }

  if (["suspended", "suspendido"].includes(key)) {
    return "suspended";
  }

  return "active";
}

function toIsoDate(value = null) {
  if (!value) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value > 9999999999 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const raw = safeText(value, "");
  if (!raw) return null;

  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/* =========================================================
   CACHE SOURCE
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

function writeCache(item = {}) {
  if (!isBrowser() || !hasOwnKeys(item)) return false;

  try {
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

function getStateObject() {
  return safeObject(CuentaState.cuentaState);
}

function getCachedCuenta() {
  try {
    const fromStore = CuentaStore.getCuentaStore?.();

    if (hasOwnKeys(fromStore)) {
      return fromStore;
    }
  } catch {}

  try {
    const fromState = safeObject(getStateObject()?.item);

    if (hasOwnKeys(fromState)) {
      return fromState;
    }
  } catch {}

  try {
    const cached = readCache();

    if (hasOwnKeys(cached?.item)) {
      return cached.item;
    }
  } catch {}

  return {};
}

/* =========================================================
   RESPONSE SOURCE COLLECTION
========================================================= */

function looksLikeCuenta(value = null) {
  const obj = safeObject(value);

  return Boolean(
    Object.prototype.hasOwnProperty.call(obj, "darkMode") ||
      Object.prototype.hasOwnProperty.call(obj, "privacyMode") ||
      Object.prototype.hasOwnProperty.call(obj, "theme") ||
      Object.prototype.hasOwnProperty.call(obj, "lang") ||
      Object.prototype.hasOwnProperty.call(obj, "language") ||
      Object.prototype.hasOwnProperty.call(obj, "locale") ||
      obj.updatedAt ||
      obj.updated_at ||
      obj.userId ||
      obj.id ||
      obj.uid ||
      obj.sub ||
      obj.preferences ||
      obj.settings ||
      obj.account ||
      obj.cuenta ||
      obj.profile ||
      obj.user ||
      obj.usuario ||
      obj.email ||
      obj.emailLower ||
      obj.username ||
      obj.name ||
      obj.displayName
  );
}

function unwrapResponseEnvelope(payload = null, depth = 0) {
  if (payload === null || payload === undefined || depth > 8) {
    return null;
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (!Object.keys(obj).length) {
    return payload;
  }

  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.rows)) return obj.rows;
  if (Array.isArray(obj.data)) return obj.data;

  if (obj.preferences) return obj.preferences;
  if (obj.settings) return obj.settings;
  if (obj.account) return obj.account;
  if (obj.cuenta) return obj.cuenta;
  if (obj.profile) return obj.profile;
  if (obj.user) return obj.user;
  if (obj.usuario) return obj.usuario;
  if (obj.item) return obj.item;
  if (obj.result) return obj.result;
  if (obj.detail) return obj.detail;

  if (obj.payload) {
    return unwrapResponseEnvelope(obj.payload, depth + 1);
  }

  if (obj.data && typeof obj.data === "object") {
    return unwrapResponseEnvelope(obj.data, depth + 1);
  }

  return obj;
}

function pickDetail(payload = null, depth = 0) {
  if (!payload || depth > 8) return null;

  if (Array.isArray(payload)) {
    return payload[0] || null;
  }

  if (looksLikeCuenta(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  const candidates = [
    obj.preferences,
    obj.settings,
    obj.account,
    obj.cuenta,
    obj.profile,
    obj.user,
    obj.usuario,
    obj.item,
    obj.detail,
    obj.result,
    obj.payload,
    obj.data,
    obj.response,
  ];

  for (const candidate of candidates) {
    if (looksLikeCuenta(candidate)) {
      return candidate;
    }

    if (candidate && typeof candidate === "object") {
      const nested = pickDetail(candidate, depth + 1);

      if (nested) return nested;
    }
  }

  return Object.keys(obj).length ? obj : null;
}

function collectCuentaSource(payload = null, fallback = {}) {
  const root = safeObject(payload);
  const baseFallback = safeObject(fallback);

  const data = safeObject(root.data);
  const payloadObj = safeObject(root.payload);
  const result = safeObject(root.result);
  const item = safeObject(root.item);
  const detail = safeObject(root.detail);

  const nestedDataPayload = safeObject(data.payload);
  const nestedDataResult = safeObject(data.result);
  const nestedPayloadData = safeObject(payloadObj.data);

  const preferences = safeObject(
    first(
      root.preferences,
      root.settings,
      data.preferences,
      data.settings,
      payloadObj.preferences,
      payloadObj.settings,
      result.preferences,
      result.settings,
      item.preferences,
      item.settings,
      detail.preferences,
      detail.settings,
      nestedDataPayload.preferences,
      nestedDataPayload.settings,
      nestedDataResult.preferences,
      nestedDataResult.settings,
      nestedPayloadData.preferences,
      nestedPayloadData.settings
    )
  );

  const user = safeObject(
    first(
      root.user,
      root.usuario,
      root.account,
      root.cuenta,
      root.profile,

      data.user,
      data.usuario,
      data.account,
      data.cuenta,
      data.profile,

      payloadObj.user,
      payloadObj.usuario,
      payloadObj.account,
      payloadObj.cuenta,
      payloadObj.profile,

      result.user,
      result.usuario,
      result.account,
      result.cuenta,
      result.profile,

      item.user,
      item.usuario,
      item.account,
      item.cuenta,
      item.profile,

      detail.user,
      detail.usuario,
      detail.account,
      detail.cuenta,
      detail.profile,

      preferences.user,
      preferences.usuario,
      preferences.account,
      preferences.profile
    )
  );

  const direct = safeObject(
    first(
      root.preferences,
      root.settings,
      root.account,
      root.cuenta,
      root.profile,
      root.user,
      root.usuario,
      root.item,
      root.detail,
      root.result,
      root.payload,
      root.data,
      payload
    )
  );

  return {
    ...baseFallback,
    ...user,
    ...preferences,
    ...direct,

    user: hasOwnKeys(user) ? user : safeObject(baseFallback.user),
    usuario: hasOwnKeys(user) ? user : safeObject(baseFallback.usuario),
    account: hasOwnKeys(user) ? user : safeObject(baseFallback.account),
    profile: hasOwnKeys(user) ? user : safeObject(baseFallback.profile),

    preferences: hasOwnKeys(preferences)
      ? preferences
      : safeObject(baseFallback.preferences),

    settings: hasOwnKeys(preferences)
      ? preferences
      : safeObject(baseFallback.settings),

    raw: payload,
  };
}

function normalizeSecurity(source = {}, fallback = {}) {
  const security = safeObject(
    first(
      source.security,
      source.seguridad,
      source.securitySettings,
      fallback.security,
      {}
    )
  );

  return {
    twoFactorEnabled: parseBoolean(
      first(
        security.twoFactorEnabled,
        security.twoFA,
        security.mfaEnabled,
        source.twoFactorEnabled,
        source.mfaEnabled,
        fallback.twoFactorEnabled,
        false
      ),
      false
    ),

    emailVerified: parseBoolean(
      first(
        security.emailVerified,
        source.emailVerified,
        fallback.emailVerified,
        false
      ),
      false
    ),

    phoneVerified: parseBoolean(
      first(
        security.phoneVerified,
        source.phoneVerified,
        fallback.phoneVerified,
        false
      ),
      false
    ),

    passwordUpdatedAt:
      first(
        security.passwordUpdatedAt,
        security.passwordChangedAt,
        source.passwordUpdatedAt,
        source.passwordChangedAt,
        fallback.passwordUpdatedAt,
        fallback.passwordChangedAt,
        ""
      ) || "",
  };
}

function normalizeCuentaDetail(detail = {}, fallback = {}) {
  const source = collectCuentaSource(detail, fallback);
  const fallbackObj = safeObject(fallback);

  const rawTheme = first(
    source.theme,
    source.mode,
    source.colorMode,
    source.appearance,
    source.preferences?.theme,
    source.preferences?.mode,
    source.preferences?.appearance,
    fallbackObj.theme,
    fallbackObj.mode,
    fallbackObj.appearance
  );

  const darkMode = parseBoolean(
    first(
      source.darkMode,
      source.isDark,
      source.theme === "dark" ? true : null,
      source.theme === "light" ? false : null,
      source.appearance === "dark" ? true : null,
      source.appearance === "light" ? false : null,
      source.preferences?.darkMode,
      source.preferences?.isDark,
      source.settings?.darkMode,
      fallbackObj.darkMode
    ),
    normalizeTheme(rawTheme, Boolean(fallbackObj.darkMode)) === "dark"
  );

  const privacyMode = parseBoolean(
    first(
      source.privacyMode,
      source.privateMode,
      source.preferences?.privacyMode,
      source.preferences?.privateMode,
      source.settings?.privacyMode,
      fallbackObj.privacyMode
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
      source.settings?.lang,
      source.settings?.language,
      fallbackObj.lang,
      fallbackObj.language,
      fallbackObj.locale,
      DEFAULT_LANG
    )
  );

  const theme = normalizeTheme(
    first(rawTheme, darkMode ? "dark" : "light"),
    darkMode
  );

  const userId = safeText(
    first(
      source.userId,
      source.id,
      source._id,
      source.uid,
      source.sub,
      source.user_id,
      source.user?.userId,
      source.user?.id,
      source.user?.uid,
      source.usuario?.userId,
      source.usuario?.id,
      source.preferences?.userId,
      fallbackObj.userId,
      fallbackObj.id
    ),
    ""
  );

  const clienteId = safeText(
    first(
      source.clienteId,
      source.clientId,
      source.customerId,
      source.cliente?.id,
      source.cliente?.clienteId,
      source.user?.clienteId,
      source.usuario?.clienteId,
      fallbackObj.clienteId,
      ""
    ),
    ""
  );

  const email = safeLower(
    first(
      source.email,
      source.emailLower,
      source.mail,
      source.userEmail,
      source.user?.email,
      source.user?.emailLower,
      source.usuario?.email,
      source.usuario?.emailLower,
      fallbackObj.email,
      fallbackObj.emailLower
    ),
    ""
  );

  const username = safeText(
    first(
      source.username,
      source.usernameLower,
      source.userName,
      source.slug,
      source.alias,
      source.user?.username,
      source.user?.usernameLower,
      source.usuario?.username,
      source.usuario?.usernameLower,
      fallbackObj.username,
      fallbackObj.usernameLower
    ),
    ""
  );

  const name = safeText(
    first(
      source.name,
      source.fullName,
      source.displayName,
      source.nombre,
      source.nombreCompleto,
      source.user?.name,
      source.user?.fullName,
      source.user?.displayName,
      source.user?.nombre,
      source.usuario?.name,
      source.usuario?.fullName,
      source.usuario?.displayName,
      source.usuario?.nombre,
      fallbackObj.name,
      fallbackObj.fullName,
      fallbackObj.displayName,
      fallbackObj.nombre
    ),
    ""
  );

  const phone = safeText(
    first(
      source.phone,
      source.telefono,
      source.mobile,
      source.telefonoMovil,
      source.user?.phone,
      source.user?.telefono,
      source.usuario?.phone,
      source.usuario?.telefono,
      fallbackObj.phone,
      fallbackObj.telefono
    ),
    ""
  );

  const avatar = safeText(
    first(
      source.avatar,
      source.avatarUrl,
      source.photoURL,
      source.photoUrl,
      source.picture,
      source.image,
      source.user?.avatar,
      source.user?.avatarUrl,
      source.usuario?.avatar,
      source.usuario?.avatarUrl,
      fallbackObj.avatar,
      fallbackObj.avatarUrl
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
      source.usuario?.role,
      source.usuario?.rol,
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
      source.usuario?.status,
      fallbackObj.status,
      fallbackObj.estado,
      DEFAULT_STATUS
    )
  );

  const updatedAt = first(
    source.updatedAt,
    source.updated_at,
    source.modifiedAt,
    source.lastUpdatedAt,
    source.preferences?.updatedAt,
    source.preferences?.updated_at,
    source.settings?.updatedAt,
    fallbackObj.updatedAt,
    fallbackObj.updated_at,
    null
  );

  const createdAt = first(
    source.createdAt,
    source.created_at,
    source.fechaCreacion,
    fallbackObj.createdAt,
    fallbackObj.created_at,
    null
  );

  const lastLoginAt = first(
    source.lastLoginAt,
    source.lastLogin,
    source.ultimoLogin,
    source.lastAccessAt,
    source.lastSeenAt,
    fallbackObj.lastLoginAt,
    null
  );

  const security = normalizeSecurity(source, fallbackObj);

  const finalDisplayName = safeText(
    first(
      source.displayName,
      name,
      username,
      email,
      "Usuario Onion"
    ),
    "Usuario Onion"
  );

  return {
    ...fallbackObj,
    ...source,

    id: safeText(first(source.id, source._id, userId, fallbackObj.id), userId),
    userId,
    uid: safeText(first(source.uid, userId), userId),
    sub: safeText(first(source.sub, userId), userId),

    clienteId,
    clientId: safeText(first(source.clientId, clienteId), clienteId),
    customerId: safeText(first(source.customerId, clienteId), clienteId),

    email,
    emailLower: safeLower(first(source.emailLower, email), email),

    username,
    usernameLower: safeLower(first(source.usernameLower, username), username),

    name: safeText(first(source.name, name, finalDisplayName), finalDisplayName),
    nombre: safeText(first(source.nombre, name, finalDisplayName), finalDisplayName),
    fullName: safeText(first(source.fullName, name, finalDisplayName), finalDisplayName),
    displayName: finalDisplayName,

    phone,
    telefono: safeText(first(source.telefono, phone), phone),
    mobile: safeText(first(source.mobile, phone), phone),

    avatar: avatar || null,
    avatarUrl: avatar || null,

    role,
    rol: role,
    status,
    estado: status,
    active: parseBoolean(
      first(source.active, source.enabled, status === "active"),
      status === "active"
    ),

    tipo: safeText(first(source.tipo, source.type, fallbackObj.tipo), ""),
    nif: safeText(first(source.nif, source.taxId, fallbackObj.nif), ""),

    direccion: safeObject(
      first(source.direccion, source.address, fallbackObj.direccion),
      {}
    ),

    darkMode,
    privacyMode,

    theme,
    mode: theme,
    appearance: theme,

    lang,
    language: lang,
    locale: lang,

    createdAt: createdAt || null,
    createdAtIso: toIsoDate(createdAt),

    updatedAt: updatedAt || null,
    updated_at: updatedAt || null,
    updatedAtIso: toIsoDate(updatedAt),

    lastLoginAt: lastLoginAt || null,
    lastLoginAtIso: toIsoDate(lastLoginAt),

    security,
    twoFactorEnabled: security.twoFactorEnabled,
    emailVerified: security.emailVerified,
    phoneVerified: security.phoneVerified,

    preferences: {
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
    },

    settings: {
      ...safeObject(fallbackObj.settings),
      ...safeObject(source.settings),
      darkMode,
      privacyMode,
      theme,
      mode: theme,
      appearance: theme,
      lang,
      language: lang,
      locale: lang,
      updatedAt,
    },

    meta: {
      ...safeObject(fallbackObj.meta),
      ...safeObject(source.meta),
      normalizedBy: "cuenta.api",
      normalizedVersion: "12.0.0",
      hasUserId: Boolean(userId),
      hasClienteId: Boolean(clienteId),
      hasEmail: Boolean(email),
      hasAvatar: Boolean(avatar),
      role,
      status,
      darkMode,
      theme,
      lang,
    },

    raw: detail,
  };
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
  const result = safeObject(obj.result);

  const meta = safeObject(
    first(
      obj.meta,
      data.meta,
      payloadObj.meta,
      result.meta,
      obj
    )
  );

  return {
    ok: Boolean(first(obj.ok, data.ok, payloadObj.ok, result.ok, true)),

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

    endpoints: safeArray(
      first(meta.endpoints, obj.endpoints, data.endpoints, payloadObj.endpoints)
    ),

    defaults: safeObject(
      first(meta.defaults, obj.defaults, data.defaults, payloadObj.defaults)
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

  if (verb === "delete" && typeof client.delete === "function") {
    return client.delete(path, {
      timeout,
      auth: true,
      headers: options.headers,
      query: options.query,
      params: options.params,
      body: options.body,
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

  if (verb === "delete" && typeof Http.delete === "function") {
    return Http.delete(path, {
      headers: options.headers,
      query: options.query,
      params: options.params,
      timeout: options.timeout,
      body: options.body,
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
    Object.prototype.hasOwnProperty.call(body, "theme") ||
    Object.prototype.hasOwnProperty.call(body, "appearance");

  const hasPrivacyMode =
    Object.prototype.hasOwnProperty.call(body, "privacyMode") ||
    Object.prototype.hasOwnProperty.call(body, "privateMode");

  const hasLang =
    Object.prototype.hasOwnProperty.call(body, "lang") ||
    Object.prototype.hasOwnProperty.call(body, "language") ||
    Object.prototype.hasOwnProperty.call(body, "locale");

  const darkMode = parseBoolean(
    first(
      body.darkMode,
      body.theme === "dark" ? true : null,
      body.theme === "light" ? false : null,
      body.appearance === "dark" ? true : null,
      body.appearance === "light" ? false : null
    ),
    false
  );

  const privacyMode = parseBoolean(
    first(body.privacyMode, body.privateMode),
    false
  );

  const lang = normalizeLang(
    first(body.lang, body.language, body.locale, DEFAULT_LANG)
  );

  return cleanPayload({
    ...body,

    ...(hasDarkMode
      ? {
          darkMode,
          theme: darkMode ? "dark" : "light",
          appearance: darkMode ? "dark" : "light",
        }
      : {}),

    ...(hasPrivacyMode
      ? {
          privacyMode,
          privateMode: privacyMode,
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
  const nextDarkMode = parseBoolean(darkMode, true);

  return {
    darkMode: nextDarkMode,
    theme: nextDarkMode ? "dark" : "light",
    appearance: nextDarkMode ? "dark" : "light",
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

function normalizePasswordPayload(payload = {}) {
  const source = safeObject(payload);

  return cleanPayload({
    currentPassword: safeText(
      first(
        source.currentPassword,
        source.password,
        source.actual,
        source.oldPassword,
        ""
      ),
      ""
    ),

    newPassword: safeText(
      first(
        source.newPassword,
        source.nextPassword,
        source.nueva,
        source.passwordNew,
        ""
      ),
      ""
    ),

    confirmPassword: safeText(
      first(
        source.confirmPassword,
        source.repeatPassword,
        source.confirmacion,
        source.passwordConfirm,
        ""
      ),
      ""
    ),

    source: safeText(source.source, "cuenta.api"),
  });
}

/* =========================================================
   RAW REQUESTS
========================================================= */

export async function fetchCuentaRequest({
  timeout = CUENTA_TIMEOUT,
  query = {},
  force = false,
} = {}) {
  const response = await requestFirst(
    "GET",
    [
      CUENTA_ENDPOINT,
      CUENTA_ALT_ENDPOINT,
      CUENTA_PROFILE_ENDPOINT,
      CUENTA_ACCOUNT_ENDPOINT,
      CUENTA_ME_ENDPOINT,
    ],
    {
      timeout,
      query: {
        ...safeObject(query),
        ...(force ? { _t: Date.now() } : {}),
      },
    }
  );

  return normalizeCuentaResponse(response, getCachedCuenta());
}

export async function getCuentaByIdRequest(
  id = "",
  {
    timeout = CUENTA_DETAIL_TIMEOUT,
    query = {},
  } = {}
) {
  const userId = normalizeCuentaId(id);

  const response = await requestFirst(
    "GET",
    [
      getCuentaByIdEndpoint(userId),
      getCuentaByIdPreferencesEndpoint(userId),
      CUENTA_ENDPOINT,
      CUENTA_ALT_ENDPOINT,
      CUENTA_PROFILE_ENDPOINT,
    ],
    {
      timeout,
      query: {
        ...safeObject(query),
        userId,
      },
    }
  );

  return normalizeCuentaResponse(response, getCachedCuenta());
}

export async function fetchCuentaDetailRequest(id = "", options = {}) {
  if (id) {
    return getCuentaByIdRequest(id, options);
  }

  return fetchCuentaRequest(options);
}

export async function fetchCuentaByIdRequest(id = "", options = {}) {
  return getCuentaByIdRequest(id, options);
}

export async function updateCuentaRequest(
  payload = {},
  {
    timeout = CUENTA_MUTATION_TIMEOUT,
  } = {}
) {
  const body = normalizeCuentaUpdatePayload(payload);

  const response = await requestFirst(
    "PATCH",
    [
      CUENTA_ENDPOINT,
      CUENTA_ALT_ENDPOINT,
      CUENTA_PROFILE_ENDPOINT,
      CUENTA_ACCOUNT_ENDPOINT,
      CUENTA_ME_ENDPOINT,
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

export async function saveCuentaRequest(payload = {}, options = {}) {
  return updateCuentaRequest(payload, options);
}

export async function updateCuentaPreferencesRequest(payload = {}, options = {}) {
  return updateCuentaRequest(payload, options);
}

export async function saveCuentaPreferencesRequest(payload = {}, options = {}) {
  return updateCuentaRequest(payload, options);
}

export async function updateCuentaThemeRequest(
  darkMode = true,
  {
    timeout = CUENTA_MUTATION_TIMEOUT,
  } = {}
) {
  const body = normalizeThemePayload(darkMode);

  const response = await requestFirst(
    "PATCH",
    [
      CUENTA_THEME_ENDPOINT,
      CUENTA_ENDPOINT,
      CUENTA_ALT_ENDPOINT,
      CUENTA_PROFILE_ENDPOINT,
      CUENTA_ACCOUNT_ENDPOINT,
      CUENTA_ME_ENDPOINT,
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

export async function updateCuentaLanguageRequest(
  lang = DEFAULT_LANG,
  {
    timeout = CUENTA_MUTATION_TIMEOUT,
  } = {}
) {
  const body = normalizeLanguagePayload(lang);

  const response = await requestFirst(
    "PATCH",
    [
      CUENTA_LANGUAGE_ENDPOINT,
      CUENTA_ENDPOINT,
      CUENTA_ALT_ENDPOINT,
      CUENTA_PROFILE_ENDPOINT,
      CUENTA_ACCOUNT_ENDPOINT,
      CUENTA_ME_ENDPOINT,
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
      `${CUENTA_PROFILE_ENDPOINT}/_meta`,
      `${CUENTA_ACCOUNT_ENDPOINT}/_meta`,
      `${CUENTA_ME_ENDPOINT}/_meta`,
    ],
    {
      timeout,
    }
  );

  return pickMeta(response);
}

export async function changePasswordRequest(
  payload = {},
  {
    timeout = CUENTA_MUTATION_TIMEOUT,
  } = {}
) {
  const body = normalizePasswordPayload(payload);

  if (!body.currentPassword || !body.newPassword) {
    throw new Error("CUENTA_PASSWORD_PAYLOAD_INCOMPLETE");
  }

  const response = await requestFirst(
    "PATCH",
    [
      CUENTA_PASSWORD_ENDPOINT,
      "/api/auth/password",
      "/api/user/change-password",
      "/api/me/password",
    ],
    {
      timeout,
      body,
    }
  );

  return response || { ok: true };
}

export async function updatePasswordRequest(payload = {}, options = {}) {
  return changePasswordRequest(payload, options);
}

export async function changeCuentaPasswordRequest(payload = {}, options = {}) {
  return changePasswordRequest(payload, options);
}

export async function updateCuentaPasswordRequest(payload = {}, options = {}) {
  return changePasswordRequest(payload, options);
}

/* =========================================================
   CACHE HYDRATION
========================================================= */

export function hydrateCuentaFromCache() {
  try {
    const current = safeObject(getStateObject()?.item);

    if (hasOwnKeys(current)) {
      const normalized = normalizeCuentaDetail(current, getCachedCuenta());

      callSafe(CuentaStore.replaceCuentaStore, normalized);
      callSafe(CuentaState.setItem, normalized);
      callSafe(CuentaState.setLoaded, true);
      callSafe(CuentaState.setHydrated, true);

      writeCache(normalized);

      return normalized;
    }

    const stored = safeObject(CuentaStore.getCuentaStore?.());

    if (hasOwnKeys(stored)) {
      const normalized = normalizeCuentaDetail(stored, {});

      callSafe(CuentaStore.replaceCuentaStore, normalized);
      callSafe(CuentaState.setItem, normalized);
      callSafe(CuentaState.setLoaded, true);
      callSafe(CuentaState.setHydrated, true);

      writeCache(normalized);

      return normalized;
    }

    const cached = readCache();

    if (hasOwnKeys(cached?.item)) {
      const normalized = normalizeCuentaDetail(cached.item, {});

      callSafe(CuentaStore.replaceCuentaStore, normalized);
      callSafe(CuentaState.setItem, normalized);
      callSafe(CuentaState.setLoaded, true);
      callSafe(CuentaState.setHydrated, true);

      return normalized;
    }

    return {};
  } catch {
    return {};
  }
}

export function hydrateFromCache() {
  return hydrateCuentaFromCache();
}

/* =========================================================
   STATE HYDRATION
========================================================= */

function applyLoadedDetailToState(detail = null, { replace = true } = {}) {
  if (!detail) return null;

  const normalized = normalizeCuentaDetail(detail, getCachedCuenta());
  const nowIso = new Date().toISOString();

  if (replace) {
    callSafe(CuentaStore.replaceCuentaStore, normalized);
  } else {
    try {
      callSafe(CuentaStore.upsertCuentaStore, normalized);
    } catch {
      callSafe(CuentaStore.replaceCuentaStore, normalized);
    }
  }

  callSafe(CuentaState.setItem, normalized);
  callSafe(CuentaState.setLastSyncAt, nowIso);
  callSafe(CuentaState.setLoaded, true);
  callSafe(CuentaState.setHydrated, true);
  callSafe(CuentaState.setError, null);

  writeCache(normalized);

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

  const currentState = getStateObject();
  const firstLoad = !Boolean(currentState?.hydrated);
  const shouldShowLoading = firstLoad && !force && !silent;

  try {
    callSafe(CuentaState.setError, null);

    if (shouldShowLoading) {
      callSafe(CuentaState.setLoading, true);
    } else if (!silent) {
      callSafe(CuentaState.setRefreshing, true);
    }

    const detail = await fetchCuentaRequest({
      timeout: CUENTA_TIMEOUT,
      force,
      query: {
        ...safeObject(query),
        ...(force ? { _t: Date.now() } : {}),
      },
    });

    if (!isActiveLoadToken(loadToken)) {
      return safeObject(getStateObject()?.item);
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
      return safeObject(getStateObject()?.item);
    }

    console.error("❌ CUENTA LOAD:", error);

    callSafe(CuentaState.setError, message);
    callSafe(CuentaState.setLoaded, true);
    callSafe(CuentaState.setHydrated, true);

    throw error;
  } finally {
    if (isActiveLoadToken(loadToken)) {
      callSafe(CuentaState.setLoading, false);
      callSafe(CuentaState.setRefreshing, false);
    }
  }
}

export async function loadCuentaById(id = "", options = {}) {
  try {
    const detail = await getCuentaByIdRequest(id, options);

    return applyLoadedDetailToState(detail, {
      replace: false,
    });
  } catch (error) {
    console.error("❌ CUENTA DETAIL:", error);
    throw error;
  }
}

/* =========================================================
   UPDATE
========================================================= */

export async function updateCuenta(payload = {}) {
  try {
    callSafe(CuentaState.setSaving, true);
    callSafe(CuentaState.setError, null);

    const updated = await updateCuentaRequest(payload);

    return applyLoadedDetailToState(updated, {
      replace: false,
    });
  } catch (error) {
    console.error("❌ CUENTA UPDATE:", error);

    callSafe(
      CuentaState.setError,
      normalizeErrorMessage(
        error,
        "No se pudo actualizar la cuenta."
      )
    );

    throw error;
  } finally {
    callSafe(CuentaState.setSaving, false);
  }
}

export async function saveCuenta(payload = {}) {
  return updateCuenta(payload);
}

export async function updateCuentaPreferences(payload = {}) {
  return updateCuenta(payload);
}

export async function saveCuentaPreferences(payload = {}) {
  return updateCuenta(payload);
}

export async function updateCuentaTheme(darkMode = true) {
  try {
    callSafe(CuentaState.setSaving, true);
    callSafe(CuentaState.setError, null);

    const updated = await updateCuentaThemeRequest(darkMode);

    return applyLoadedDetailToState(updated, {
      replace: false,
    });
  } catch (error) {
    console.error("❌ CUENTA THEME UPDATE:", error);

    callSafe(
      CuentaState.setError,
      normalizeErrorMessage(
        error,
        "No se pudo actualizar el tema."
      )
    );

    throw error;
  } finally {
    callSafe(CuentaState.setSaving, false);
  }
}

export async function updateCuentaLanguage(lang = DEFAULT_LANG) {
  try {
    callSafe(CuentaState.setSaving, true);
    callSafe(CuentaState.setError, null);

    const updated = await updateCuentaLanguageRequest(lang);

    return applyLoadedDetailToState(updated, {
      replace: false,
    });
  } catch (error) {
    console.error("❌ CUENTA LANGUAGE UPDATE:", error);

    callSafe(
      CuentaState.setError,
      normalizeErrorMessage(
        error,
        "No se pudo actualizar el idioma."
      )
    );

    throw error;
  } finally {
    callSafe(CuentaState.setSaving, false);
  }
}

export async function changeCuentaPassword(payload = {}) {
  try {
    callSafe(CuentaState.setSaving, true);
    callSafe(CuentaState.setError, null);

    const response = await changePasswordRequest(payload);

    return response || { ok: true };
  } catch (error) {
    console.error("❌ CUENTA PASSWORD UPDATE:", error);

    callSafe(
      CuentaState.setError,
      normalizeErrorMessage(
        error,
        "No se pudo actualizar la contraseña."
      )
    );

    throw error;
  } finally {
    callSafe(CuentaState.setSaving, false);
  }
}

/* =========================================================
   META
========================================================= */

export async function loadCuentaMeta() {
  try {
    return await fetchCuentaMetaRequest({
      timeout: CUENTA_TIMEOUT,
    });
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
    AppCore.modules.AccountApi = api;
    AppCore.modules.UserPreferencesApi = api;
    AppCore.modules.OnionCuentaApi = api;
  } catch {}

  try {
    if (isBrowser()) {
      window.OnionCuentaApi = api;
      window.CuentaApi = api;
      window.AccountApi = api;
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
  profileEndpoint: CUENTA_PROFILE_ENDPOINT,
  accountEndpoint: CUENTA_ACCOUNT_ENDPOINT,
  meEndpoint: CUENTA_ME_ENDPOINT,
  themeEndpoint: CUENTA_THEME_ENDPOINT,
  languageEndpoint: CUENTA_LANGUAGE_ENDPOINT,
  metaEndpoint: CUENTA_META_ENDPOINT,
  passwordEndpoint: CUENTA_PASSWORD_ENDPOINT,

  timeout: CUENTA_TIMEOUT,
  detailTimeout: CUENTA_DETAIL_TIMEOUT,
  mutationTimeout: CUENTA_MUTATION_TIMEOUT,

  getCuentaEndpoint,
  getCuentaAltEndpoint,
  getCuentaProfileEndpoint,
  getCuentaAccountEndpoint,
  getCuentaMeEndpoint,
  getCuentaThemeEndpoint,
  getCuentaLanguageEndpoint,
  getCuentaMetaEndpoint,
  getCuentaPasswordEndpoint,
  getCuentaByIdEndpoint,
  getCuentaByIdPreferencesEndpoint,

  normalizeCuentaId,
  normalizeCuentaDetail,
  normalizeCuentaResponse,

  hydrateCuentaFromCache,
  hydrateFromCache,

  fetchCuentaRequest,
  getCuentaByIdRequest,
  fetchCuentaDetailRequest,
  fetchCuentaByIdRequest,

  updateCuentaRequest,
  saveCuentaRequest,
  updateCuentaPreferencesRequest,
  saveCuentaPreferencesRequest,

  updateCuentaThemeRequest,
  updateCuentaLanguageRequest,

  fetchCuentaMetaRequest,

  changePasswordRequest,
  updatePasswordRequest,
  changeCuentaPasswordRequest,
  updateCuentaPasswordRequest,

  loadCuenta,
  loadCuentaById,

  updateCuenta,
  saveCuenta,
  updateCuentaPreferences,
  saveCuentaPreferences,

  updateCuentaTheme,
  updateCuentaLanguage,

  changeCuentaPassword,

  loadCuentaMeta,
});

registerCuentaApiBridge(CuentaApi);

export default CuentaApi;
