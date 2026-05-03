/* =========================================================
   Onion SPA - Cuenta Utils
   Archivo: src/views/cuenta/cuenta.utils.js

   EXTREME PRO SYSTEM · UTILS LAYER · FULL PATCH 12/10
   ACCOUNT PREFS · SANITIZE · FORMAT · EVENTS · STORAGE SAFE

   Responsabilidades:
   - helpers puros reutilizables
   - sanitización robusta
   - escape HTML seguro con fallback local
   - fechas seguras
   - números / moneda
   - texto / normalización
   - helpers de preferencias de cuenta
   - helpers de idioma / tema / privacidad / rol / estado
   - helpers de eventos / toast / clipboard / CSV
   - cero dependencias frágiles
   - compatibilidad total con template / actions / api / modal / view
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_LANG = "es";
export const DEFAULT_THEME = "light";
export const DEFAULT_CURRENCY = "EUR";
export const DEFAULT_ACCOUNT_STATUS = "active";
export const DEFAULT_ACCOUNT_ROLE = "user";
export const DEFAULT_INITIALS = "ON";

/* =========================================================
   GLOBAL / TYPE HELPERS
========================================================= */

export function getGlobalRoot() {
  try {
    if (typeof globalThis !== "undefined") {
      return globalThis;
    }
  } catch {}

  try {
    if (typeof window !== "undefined") {
      return window;
    }
  } catch {}

  return {};
}

export function isBrowser() {
  return Boolean(
    typeof window !== "undefined" &&
      typeof document !== "undefined"
  );
}

export function isFn(value) {
  return typeof value === "function";
}

export function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

export function hasOwnKeys(value = {}) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length
  );
}

export function isFormData(value) {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

export function isBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

export function isFile(value) {
  return typeof File !== "undefined" && value instanceof File;
}

export function isArrayBuffer(value) {
  return typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer;
}

/* =========================================================
   SAFE BASE
========================================================= */

export function safeString(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

export function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

export function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

export function safeUpper(value, fallback = "") {
  return safeText(value, fallback).toUpperCase();
}

export function safeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

export function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

export function safeBoolean(value, fallback = false) {
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

export function safeNumber(value, fallback = 0) {
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

export function safeInteger(value, fallback = 0) {
  const n = Number.parseInt(value, 10);

  return Number.isFinite(n) ? n : fallback;
}

export function safePositiveInteger(value, fallback = 1) {
  return Math.max(1, safeInteger(value, fallback));
}

export function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    return value;
  }

  return null;
}

export function clonePlain(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    if (Array.isArray(value)) {
      return [...value];
    }

    if (typeof value === "object") {
      return { ...value };
    }

    return value;
  }
}

/* =========================================================
   HTML / TEXT
========================================================= */

export function escapeHtml(value = "") {
  const text = String(value ?? "");

  try {
    const coreEscape = AppCore?.utils?.escapeHtml;

    if (typeof coreEscape === "function") {
      const result = coreEscape(text);

      if (result !== undefined && result !== null) {
        return String(result);
      }
    }
  } catch {}

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function unescapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

export function normalizeWhitespace(value = "") {
  return safeText(value, "");
}

export function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function slugify(value = "", fallback = "") {
  const slug = normalizeText(value)
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

export function truncate(value = "", max = 160) {
  const text = safeText(value, "");
  const limit = Math.max(1, safeNumber(max, 160));

  if (!text) return "";
  if (text.length <= limit) return text;

  return `${text.slice(0, limit).trim()}…`;
}

export function capitalize(value = "") {
  const text = safeText(value, "");

  if (!text) return "";

  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

export function getInitials(value = "", fallback = DEFAULT_INITIALS) {
  const text = normalizeWhitespace(value);

  if (!text) return fallback;

  const parts = text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return fallback;

  const initials = parts
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2);

  return initials || fallback;
}

/* =========================================================
   DATE / TIME
========================================================= */

export function toMs(value, fallback = 0) {
  if (!value) return fallback;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }

  const raw = safeText(value, "");
  if (!raw) return fallback;

  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
  const ms = date.getTime();

  return Number.isFinite(ms) ? ms : fallback;
}

export function toIsoDate(value = null, fallback = "") {
  const ms = toMs(value, 0);

  if (!ms) return fallback;

  try {
    return new Date(ms).toISOString();
  } catch {
    return fallback;
  }
}

export function formatDate(value, options = {}) {
  const ms = toMs(value, 0);

  if (!ms) return "—";

  const opts = safeObject(options);

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      ...(opts.time === false
        ? {}
        : {
            hour: "2-digit",
            minute: "2-digit",
          }),
      ...safeObject(opts.intl),
    }).format(new Date(ms));
  } catch {
    return "—";
  }
}

export function formatDateOnly(value) {
  return formatDate(value, {
    time: false,
  });
}

export function formatDateTime(value) {
  return formatDate(value, {
    time: true,
  });
}

export function formatRelativeDate(value) {
  const ms = toMs(value, 0);

  if (!ms) return "—";

  const diff = Date.now() - ms;
  const future = diff < 0;
  const abs = Math.abs(diff);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < minute) {
    return "Hace un momento";
  }

  if (abs < hour) {
    const amount = Math.max(1, Math.floor(abs / minute));
    return future ? `En ${amount} min` : `Hace ${amount} min`;
  }

  if (abs < day) {
    const amount = Math.max(1, Math.floor(abs / hour));
    return future ? `En ${amount} h` : `Hace ${amount} h`;
  }

  if (abs < day * 7) {
    const amount = Math.max(1, Math.floor(abs / day));
    return future
      ? `En ${amount} día${amount === 1 ? "" : "s"}`
      : `Hace ${amount} día${amount === 1 ? "" : "s"}`;
  }

  return formatDate(value);
}

/* =========================================================
   NUMBER / MONEY
========================================================= */

export function round2(value = 0) {
  return Math.round((safeNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

export function clampNumber(value = 0, min = 0, max = 100) {
  const n = safeNumber(value, min);

  return Math.min(Math.max(n, min), max);
}

export function formatNumber(value = 0, options = {}) {
  const amount = safeNumber(value, 0);

  try {
    return new Intl.NumberFormat("es-ES", {
      maximumFractionDigits: 2,
      ...safeObject(options),
    }).format(amount);
  } catch {
    return String(amount);
  }
}

export function formatMoney(value = 0, currency = DEFAULT_CURRENCY) {
  const amount = safeNumber(value, 0);
  const code = safeText(currency, DEFAULT_CURRENCY).toUpperCase();

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} ${code}`;
  }
}

export function parseMoney(value = null, fallback = 0) {
  return safeNumber(value, fallback);
}

/* =========================================================
   EMAIL / URL / STORAGE
========================================================= */

export function normalizeEmail(value = "") {
  return safeLower(value, "");
}

export function isValidEmail(value = "") {
  const email = normalizeEmail(value);

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isHttpUrl(value = "") {
  const raw = safeText(value, "");

  if (!raw) return false;

  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizePublicUrl(value = "") {
  const raw = safeText(value, "");

  return isHttpUrl(raw) ? raw : "";
}

export function getStorageValue(key = "", fallback = "") {
  const cleanKey = safeText(key, "");

  if (!cleanKey) return fallback;

  try {
    const value = localStorage.getItem(cleanKey);
    if (value !== null && value !== undefined) return value;
  } catch {}

  try {
    const value = sessionStorage.getItem(cleanKey);
    if (value !== null && value !== undefined) return value;
  } catch {}

  return fallback;
}

export function setStorageValue(key = "", value = "", storage = "local") {
  const cleanKey = safeText(key, "");

  if (!cleanKey) return false;

  try {
    const target =
      storage === "session"
        ? sessionStorage
        : localStorage;

    target.setItem(cleanKey, String(value ?? ""));
    return true;
  } catch {
    return false;
  }
}

export function removeStorageValue(key = "", storage = "local") {
  const cleanKey = safeText(key, "");

  if (!cleanKey) return false;

  try {
    const target =
      storage === "session"
        ? sessionStorage
        : localStorage;

    target.removeItem(cleanKey);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ACCOUNT / PREFERENCES NORMALIZATION
========================================================= */

export function normalizeLang(value = DEFAULT_LANG) {
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

export function getLangLabel(value = DEFAULT_LANG) {
  const lang = normalizeLang(value);

  if (lang === "en") return "English";
  if (lang === "ca") return "Català";

  return "Español";
}

export function normalizeTheme(value = null, fallback = DEFAULT_THEME) {
  if (typeof value === "boolean") {
    return value ? "dark" : "light";
  }

  const key = normalizeKey(value);

  if (
    [
      "dark",
      "darkmode",
      "dark_mode",
      "oscuro",
      "modo_oscuro",
      "night",
      "theme_dark",
    ].includes(key)
  ) {
    return "dark";
  }

  if (
    [
      "light",
      "lightmode",
      "light_mode",
      "claro",
      "modo_claro",
      "day",
      "theme_light",
    ].includes(key)
  ) {
    return "light";
  }

  return normalizeKey(fallback) === "dark" ? "dark" : "light";
}

export function normalizeDarkMode(value = null, fallback = false) {
  if (typeof value === "boolean") return value;

  const theme = normalizeTheme(value, fallback ? "dark" : "light");

  return theme === "dark";
}

export function normalizePrivacyMode(value = null, fallback = false) {
  if (typeof value === "boolean") return value;

  const key = normalizeKey(value);

  if (
    [
      "true",
      "1",
      "active",
      "enabled",
      "on",
      "privacy",
      "private",
      "activo",
      "activa",
      "habilitado",
      "habilitada",
    ].includes(key)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "inactive",
      "disabled",
      "off",
      "public",
      "inactivo",
      "inactiva",
      "deshabilitado",
      "deshabilitada",
    ].includes(key)
  ) {
    return false;
  }

  return Boolean(fallback);
}

export function normalizeRole(value = DEFAULT_ACCOUNT_ROLE) {
  const obj = safeObject(value, null);

  const raw = obj
    ? first(obj.name, obj.nombre, obj.code, obj.id, DEFAULT_ACCOUNT_ROLE)
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

export function getRoleLabel(value = DEFAULT_ACCOUNT_ROLE) {
  const role = normalizeRole(value);

  const map = {
    admin: "Administrador",
    support: "Soporte",
    technician: "Técnico",
    client: "Cliente",
    user: "Usuario",
  };

  return map[role] || "Usuario";
}

export function normalizeAccountStatus(value = DEFAULT_ACCOUNT_STATUS) {
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

export function getAccountStatusText(value = DEFAULT_ACCOUNT_STATUS) {
  const status = normalizeAccountStatus(value);

  const map = {
    active: "Activa",
    inactive: "Inactiva",
    pending: "Pendiente",
    suspended: "Suspendida",
    deleted: "Eliminada",
  };

  return map[status] || "Activa";
}

export function getThemeLabel(value = null) {
  return normalizeTheme(value) === "dark" ? "Dark mode" : "Light mode";
}

export function getThemeStatusLabel(value = null) {
  return normalizeTheme(value) === "dark"
    ? "Tema oscuro activo"
    : "Tema claro activo";
}

export function getPrivacyLabel(value = null) {
  return normalizePrivacyMode(value)
    ? "Privacidad activa"
    : "Privacidad desactivada";
}

export function getAccountStatusLabel({
  darkMode = false,
  privacyMode = false,
  status = DEFAULT_ACCOUNT_STATUS,
} = {}) {
  const normalizedStatus = normalizeAccountStatus(status);

  if (normalizedStatus !== "active") {
    return getAccountStatusText(normalizedStatus);
  }

  const isDark = safeBoolean(darkMode, false);
  const isPrivacy = safeBoolean(privacyMode, false);

  if (isDark && isPrivacy) {
    return "Protección reforzada";
  }

  if (isPrivacy) {
    return "Privacidad activa";
  }

  return "Configuración estándar";
}

export function getSecurityLevel({
  privacyMode = false,
  twoFactorEnabled = false,
  emailVerified = false,
  phoneVerified = false,
} = {}) {
  const score = [
    privacyMode,
    twoFactorEnabled,
    emailVerified,
    phoneVerified,
  ].filter(Boolean).length;

  if (score >= 3) return "hardened";
  if (score >= 2) return "secure";
  if (score >= 1) return "standard";

  return "basic";
}

export function getSecurityLevelLabel(value = "standard") {
  const key = normalizeKey(value);

  const map = {
    hardened: "Protección reforzada",
    secure: "Seguridad alta",
    standard: "Configuración estándar",
    basic: "Configuración básica",
  };

  return map[key] || "Configuración estándar";
}

/* =========================================================
   ACCOUNT FIELD RESOLVERS
========================================================= */

export function getCuentaId(payload = {}) {
  const row = safeObject(payload);

  return safeText(
    first(
      row.userId,
      row.uid,
      row.sub,
      row.accountId,
      row.profileId,
      row.id,
      row.raw?.userId,
      row.raw?.id,
      ""
    ),
    ""
  );
}

export function getCuentaEmail(payload = {}) {
  const row = safeObject(payload);

  return normalizeEmail(
    first(
      row.email,
      row.emailLower,
      row.mail,
      row.userEmail,
      row.raw?.email,
      row.raw?.emailLower,
      ""
    )
  );
}

export function getCuentaUsername(payload = {}) {
  const row = safeObject(payload);

  return safeText(
    first(
      row.username,
      row.usernameLower,
      row.userName,
      row.nick,
      row.alias,
      row.raw?.username,
      row.raw?.usernameLower,
      ""
    ),
    ""
  );
}

export function getCuentaDisplayName(payload = {}) {
  const row = safeObject(payload);

  return safeText(
    first(
      row.displayName,
      row.name,
      row.nombre,
      row.fullName,
      row.full_name,
      row.raw?.displayName,
      row.raw?.name,
      row.raw?.nombre,
      getCuentaUsername(row),
      getCuentaEmail(row),
      "Usuario Onion"
    ),
    "Usuario Onion"
  );
}

export function getCuentaPhone(payload = {}) {
  const row = safeObject(payload);

  return safeText(
    first(
      row.phone,
      row.telefono,
      row.mobile,
      row.telefonoMovil,
      row.raw?.phone,
      row.raw?.telefono,
      ""
    ),
    ""
  );
}

export function getCuentaUpdatedAt(payload = {}) {
  const row = safeObject(payload);

  return first(
    row.updatedAt,
    row.updated_at,
    row.modifiedAt,
    row.lastUpdate,
    row.lastUpdatedAt,
    row.preferences?.updatedAt,
    row.settings?.updatedAt,
    row.raw?.updatedAt,
    row.raw?.updated_at,
    null
  );
}

/* =========================================================
   PAYLOAD NORMALIZATION
========================================================= */

export function normalizeCuentaPayload(payload = {}, fallback = {}) {
  const raw = safeObject(payload);
  const base = safeObject(fallback);

  const preferences = safeObject(
    first(
      raw.preferences,
      raw.preference,
      raw.settings,
      raw.config,
      raw.data?.preferences,
      raw.data?.settings,
      base.preferences,
      base.settings,
      {}
    )
  );

  const rawTheme = first(
    raw.theme,
    raw.mode,
    raw.appearance,
    preferences.theme,
    preferences.mode,
    base.theme,
    base.mode,
    DEFAULT_THEME
  );

  const darkMode = safeBoolean(
    first(
      raw.darkMode,
      raw.isDark,
      preferences.darkMode,
      preferences.isDark,
      rawTheme === "dark" ? true : null,
      rawTheme === "light" ? false : null,
      base.darkMode,
      false
    ),
    normalizeTheme(rawTheme, DEFAULT_THEME) === "dark"
  );

  const theme = normalizeTheme(rawTheme, darkMode ? "dark" : "light");

  const privacyMode = normalizePrivacyMode(
    first(
      raw.privacyMode,
      raw.privateMode,
      raw.privacy,
      preferences.privacyMode,
      preferences.privateMode,
      preferences.privacy,
      base.privacyMode,
      false
    ),
    false
  );

  const lang = normalizeLang(
    first(
      raw.lang,
      raw.language,
      raw.locale,
      raw.idioma,
      preferences.lang,
      preferences.language,
      preferences.locale,
      base.lang,
      base.language,
      base.locale,
      DEFAULT_LANG
    )
  );

  const updatedAt =
    first(
      raw.updatedAt,
      raw.updated_at,
      preferences.updatedAt,
      raw.lastUpdate,
      raw.modifiedAt,
      base.updatedAt,
      base.updated_at,
      ""
    ) || "";

  const id = safeText(first(getCuentaId(raw), getCuentaId(base), ""), "");
  const email = safeText(first(getCuentaEmail(raw), getCuentaEmail(base), ""), "");
  const username = safeText(
    first(getCuentaUsername(raw), getCuentaUsername(base), ""),
    ""
  );

  const displayName = safeText(
    first(
      getCuentaDisplayName(raw),
      getCuentaDisplayName(base),
      username,
      email,
      "Usuario Onion"
    ),
    "Usuario Onion"
  );

  const role = normalizeRole(first(raw.role, raw.rol, base.role, DEFAULT_ACCOUNT_ROLE));
  const status = normalizeAccountStatus(
    first(raw.status, raw.estado, base.status, DEFAULT_ACCOUNT_STATUS)
  );

  const securityLevel = getSecurityLevel({
    privacyMode,
    twoFactorEnabled: safeBoolean(
      first(raw.twoFactorEnabled, raw.mfaEnabled, raw.security?.twoFactorEnabled, false),
      false
    ),
    emailVerified: safeBoolean(
      first(raw.emailVerified, raw.security?.emailVerified, false),
      false
    ),
    phoneVerified: safeBoolean(
      first(raw.phoneVerified, raw.security?.phoneVerified, false),
      false
    ),
  });

  return {
    ...clonePlain(base, {}),
    ...clonePlain(raw, {}),

    id: safeText(first(raw.id, id), id),
    userId: safeText(first(raw.userId, id), id),

    email,
    emailLower: normalizeEmail(first(raw.emailLower, email)),

    username,
    usernameLower: safeLower(first(raw.usernameLower, username), username),

    name: safeText(first(raw.name, raw.nombre, displayName), displayName),
    nombre: safeText(first(raw.nombre, raw.name, displayName), displayName),
    fullName: safeText(first(raw.fullName, raw.full_name, displayName), displayName),
    displayName,

    phone: getCuentaPhone(raw),
    telefono: safeText(first(raw.telefono, raw.phone, getCuentaPhone(raw)), ""),

    role,
    rol: role,
    roleLabel: getRoleLabel(role),

    status,
    estado: status,
    statusLabel: getAccountStatusText(status),

    darkMode,
    privacyMode,

    theme,
    mode: theme,
    appearance: theme,

    lang,
    language: lang,
    locale: lang,

    themeLabel: getThemeLabel(theme),
    themeStatusLabel: getThemeStatusLabel(theme),
    langLabel: getLangLabel(lang),
    privacyLabel: getPrivacyLabel(privacyMode),

    accountStatusLabel: getAccountStatusLabel({
      darkMode,
      privacyMode,
      status,
    }),

    securityLevel,
    securityLevelLabel: getSecurityLevelLabel(securityLevel),

    updatedAt,
    updated_at: updatedAt,
    updatedAtMs: toMs(updatedAt, 0),

    preferences: {
      ...safeObject(base.preferences),
      ...preferences,
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
      ...safeObject(base.settings),
      ...safeObject(raw.settings),
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

    raw: hasOwnKeys(raw.raw) ? raw.raw : raw,
  };
}

export function buildCuentaSnapshot(payload = {}) {
  const item = normalizeCuentaPayload(payload);

  return {
    id: safeText(first(item.userId, item.id), ""),
    userId: safeText(first(item.userId, item.id), ""),

    displayName: safeText(item.displayName, "Usuario Onion"),
    name: safeText(item.name, item.displayName),
    username: safeText(item.username, ""),
    email: safeText(item.email, ""),
    phone: safeText(first(item.phone, item.telefono), ""),

    role: safeText(item.role, DEFAULT_ACCOUNT_ROLE),
    roleLabel: getRoleLabel(item.role),

    status: safeText(item.status, DEFAULT_ACCOUNT_STATUS),
    statusLabel: getAccountStatusText(item.status),

    darkMode: Boolean(item.darkMode),
    privacyMode: Boolean(item.privacyMode),

    theme: safeText(item.theme, item.darkMode ? "dark" : "light"),
    themeLabel: safeText(item.themeLabel, getThemeLabel(item.theme)),
    themeStatusLabel: safeText(
      item.themeStatusLabel,
      getThemeStatusLabel(item.theme)
    ),

    lang: safeText(item.lang, DEFAULT_LANG),
    language: safeText(item.language, item.lang || DEFAULT_LANG),
    locale: safeText(item.locale, item.lang || DEFAULT_LANG),
    langLabel: getLangLabel(item.lang),

    privacyLabel: safeText(
      item.privacyLabel,
      getPrivacyLabel(item.privacyMode)
    ),

    accountStatusLabel: safeText(
      item.accountStatusLabel,
      getAccountStatusLabel({
        darkMode: item.darkMode,
        privacyMode: item.privacyMode,
        status: item.status,
      })
    ),

    securityLevel: safeText(item.securityLevel, "standard"),
    securityLevelLabel: getSecurityLevelLabel(item.securityLevel),

    initials: getInitials(
      first(item.displayName, item.name, item.username, item.email),
      DEFAULT_INITIALS
    ),

    updatedAt: safeText(item.updatedAt, ""),
    updatedAtLabel: item.updatedAt ? formatDate(item.updatedAt) : "—",
    updatedAtRelative: item.updatedAt ? formatRelativeDate(item.updatedAt) : "—",

    preferences: {
      ...safeObject(item.preferences),
    },

    raw: item.raw,
  };
}

/* =========================================================
   EVENTS / TOAST
========================================================= */

export function safeEmit(event = "", payload = {}) {
  const eventName = safeText(event, "");

  if (!eventName) return false;

  let emitted = false;

  try {
    if (typeof AppCore?.events?.emit === "function") {
      AppCore.events.emit(eventName, payload);
      emitted = true;
    }
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

export function showToast(message = "", type = "info", options = {}) {
  const text = safeText(message, "");

  if (!text) return false;

  const normalizedType = normalizeKey(type || "info") || "info";

  try {
    if (typeof AppCore?.modules?.get === "function") {
      const toastModule = AppCore.modules.get("toast") || AppCore.modules.get("Toast");

      if (typeof toastModule?.show === "function") {
        toastModule.show({
          message: text,
          type: normalizedType,
          ...safeObject(options),
        });
        return true;
      }
    }
  } catch {}

  try {
    if (typeof AppCore?.toast?.[normalizedType] === "function") {
      AppCore.toast[normalizedType](text, safeObject(options));
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.toast?.show === "function") {
      AppCore.toast.show(text, normalizedType, safeObject(options));
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.ui?.toast?.[normalizedType] === "function") {
      AppCore.ui.toast[normalizedType](text, safeObject(options));
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.ui?.toast?.show === "function") {
      AppCore.ui.toast.show({
        message: text,
        type: normalizedType,
        ...safeObject(options),
      });
      return true;
    }
  } catch {}

  try {
    const root = getGlobalRoot();

    if (typeof root?.Toast?.show === "function") {
      root.Toast.show({
        message: text,
        type: normalizedType,
        ...safeObject(options),
      });
      return true;
    }
  } catch {}

  try {
    const logger =
      normalizedType === "error"
        ? console.error
        : normalizedType === "warning" || normalizedType === "warn"
          ? console.warn
          : console.log;

    logger(`[CuentaToast:${normalizedType}]`, text);
  } catch {}

  return false;
}

/* =========================================================
   CLIPBOARD / CSV / DOWNLOAD
========================================================= */

export async function writeClipboardText(text = "") {
  const value = safeText(text, "");

  if (!value) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}

  try {
    const textarea = document.createElement("textarea");

    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";

    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();

    const ok = document.execCommand("copy");

    textarea.remove();

    return Boolean(ok);
  } catch {
    return false;
  }
}

export function escapeCsvCell(value = "") {
  const text =
    value === null || value === undefined
      ? ""
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv(rows = []) {
  return safeArray(rows)
    .map((row) => safeArray(row).map(escapeCsvCell).join(","))
    .join("\n");
}

export function downloadTextFile({
  filename = "archivo.txt",
  content = "",
  mimeType = "text/plain;charset=utf-8;",
} = {}) {
  if (!isBrowser()) return false;

  try {
    const blob = new Blob([String(content ?? "")], {
      type: mimeType,
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = safeText(filename, "archivo.txt");

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   JSON / ERROR
========================================================= */

export function safeJsonParse(value = "", fallback = null) {
  try {
    if (typeof value !== "string") {
      return value ?? fallback;
    }

    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function safeJsonStringify(value, fallback = "{}") {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return fallback;
  }
}

export function normalizeErrorMessage(error = null, fallback = "Error desconocido.") {
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

export function getErrorStatus(error = null) {
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

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  DEFAULT_LANG,
  DEFAULT_THEME,
  DEFAULT_CURRENCY,
  DEFAULT_ACCOUNT_STATUS,
  DEFAULT_ACCOUNT_ROLE,
  DEFAULT_INITIALS,

  getGlobalRoot,
  isBrowser,
  isFn,
  isObject,
  hasOwnKeys,
  isFormData,
  isBlob,
  isFile,
  isArrayBuffer,

  safeString,
  safeText,
  safeLower,
  safeUpper,
  safeArray,
  safeObject,
  safeBoolean,
  safeNumber,
  safeInteger,
  safePositiveInteger,
  first,
  clonePlain,

  escapeHtml,
  unescapeHtml,
  normalizeWhitespace,
  normalizeText,
  normalizeKey,
  slugify,
  truncate,
  capitalize,
  getInitials,

  toMs,
  toIsoDate,
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatRelativeDate,

  round2,
  clampNumber,
  formatNumber,
  formatMoney,
  parseMoney,

  normalizeEmail,
  isValidEmail,
  isHttpUrl,
  normalizePublicUrl,
  getStorageValue,
  setStorageValue,
  removeStorageValue,

  normalizeLang,
  getLangLabel,
  normalizeTheme,
  normalizeDarkMode,
  normalizePrivacyMode,
  normalizeRole,
  getRoleLabel,
  normalizeAccountStatus,
  getAccountStatusText,
  getThemeLabel,
  getThemeStatusLabel,
  getPrivacyLabel,
  getAccountStatusLabel,
  getSecurityLevel,
  getSecurityLevelLabel,

  getCuentaId,
  getCuentaEmail,
  getCuentaUsername,
  getCuentaDisplayName,
  getCuentaPhone,
  getCuentaUpdatedAt,
  normalizeCuentaPayload,
  buildCuentaSnapshot,

  safeEmit,
  showToast,

  writeClipboardText,
  escapeCsvCell,
  buildCsv,
  downloadTextFile,

  safeJsonParse,
  safeJsonStringify,
  normalizeErrorMessage,
  getErrorStatus,
};
