/* =========================================================
   Onion SPA - Cuenta Actions
   Archivo: src/views/cuenta/cuenta.actions.js

   FINAL PRO SYSTEM · ACCOUNT ACTIONS · EXTREME 10/10

   RESPONSABILIDADES:
   - centralizar acciones operativas del módulo de cuenta
   - resolver detalle de cuenta desde store + backend
   - soportar single resource mode real y colección legacy
   - abrir detalle a nivel de datos, no de UI
   - copiar id / email / username de usuario
   - exportar cuenta o colección a CSV
   - navegar a edición / seguridad si existen rutas
   - desacoplar cuentaView.js de lógica operativa auxiliar
   - mantener compatibilidad con index.js y imports antiguos

   HARDENING PRO:
   - namespace imports para no romper por named exports ausentes
   - tolerancia a payloads heterogéneos
   - fallback store -> backend -> cache
   - soporte envelope backend profundo
   - normalización premium del modelo de cuenta
   - export CSV seguro con BOM + escape CSV
   - clipboard robusto con fallback legacy
   - descarga segura en navegador
   - eventos opcionales vía AppCore.events + window CustomEvent
   - navegación tolerante a Router/AppCore/window
========================================================= */

import { AppCore } from "../../core/index.js";

import * as CuentaApi from "./cuenta.api.js";
import * as CuentaStore from "./cuenta.store.js";
import * as CuentaUtils from "./cuenta.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const CUENTA_ACTIONS_MODULE = "cuenta.actions";
export const CUENTA_ACTIONS_VERSION = "12.0.0";

const CSV_FILENAME = "cuenta.csv";
const CSV_MIME = "text/csv;charset=utf-8;";
const CSV_BOM = "\uFEFF";

const DEFAULT_LANG = "es";
const DEFAULT_THEME = "light";
const DEFAULT_STATUS = "active";
const DEFAULT_ROLE = "user";

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

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function safeText(value, fallback = "") {
  try {
    if (isFn(CuentaUtils.safeText)) {
      return CuentaUtils.safeText(value, fallback);
    }
  } catch {}

  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  try {
    if (isFn(CuentaUtils.safeNumber)) {
      return CuentaUtils.safeNumber(value, fallback);
    }
  } catch {}

  if (value === null || value === undefined || value === "") return fallback;

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

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized = normalizeKey(value);

    if (["true", "1", "yes", "si", "sí", "on", "enabled", "activo"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off", "disabled", "inactivo"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function safeArray(value, fallback = []) {
  try {
    if (isFn(CuentaUtils.safeArray)) {
      return CuentaUtils.safeArray(value, fallback);
    }
  } catch {}

  return Array.isArray(value) ? value : fallback;
}

function safeObject(value, fallback = {}) {
  try {
    if (isFn(CuentaUtils.safeObject)) {
      return CuentaUtils.safeObject(value, fallback);
    }
  } catch {}

  return isObject(value) ? value : fallback;
}

function first(...values) {
  try {
    if (isFn(CuentaUtils.first)) {
      return CuentaUtils.first(...values);
    }
  } catch {}

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

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();
}

function normalizeEmail(value = "") {
  return safeText(value, "").toLowerCase();
}

function isValidEmail(value = "") {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeLang(value = DEFAULT_LANG) {
  const key = normalizeKey(value);

  if (["en", "english", "en_us", "en_gb"].includes(key)) return "en";
  if (["ca", "cat", "catala", "catalan", "ca_es"].includes(key)) return "ca";

  return "es";
}

function normalizeTheme(value = DEFAULT_THEME) {
  const key = normalizeKey(value);

  if (["dark", "oscuro", "night"].includes(key)) return "dark";
  if (["light", "claro", "day"].includes(key)) return "light";

  return safeBoolean(value, false) ? "dark" : "light";
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

function normalizeRole(value = DEFAULT_ROLE) {
  const roleObject = safeObject(value, null);

  const raw = roleObject
    ? first(roleObject.name, roleObject.nombre, roleObject.code, roleObject.id, DEFAULT_ROLE)
    : value;

  const key = normalizeKey(raw);

  if (["admin", "administrator", "superadmin", "super_admin", "root", "owner"].includes(key)) {
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

function formatDateIso(value = null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString();
}

function showToast(message = "", type = "info") {
  const text = safeText(message, "");

  if (!text) return false;

  try {
    if (isFn(CuentaUtils.showToast)) {
      CuentaUtils.showToast(text, type);
      return true;
    }
  } catch {}

  const normalizedType = normalizeKey(type) || "info";

  try {
    if (isFn(AppCore?.toast?.[normalizedType])) {
      AppCore.toast[normalizedType](text);
      return true;
    }
  } catch {}

  try {
    if (isFn(AppCore?.toast?.show)) {
      AppCore.toast.show(text, normalizedType);
      return true;
    }
  } catch {}

  try {
    if (isFn(AppCore?.ui?.toast?.[normalizedType])) {
      AppCore.ui.toast[normalizedType](text);
      return true;
    }
  } catch {}

  try {
    if (isFn(window?.Toast?.[normalizedType])) {
      window.Toast[normalizedType](text);
      return true;
    }
  } catch {}

  try {
    if (isFn(window?.Toast?.show)) {
      window.Toast.show(text, normalizedType);
      return true;
    }
  } catch {}

  return false;
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
    if (typeof window !== "undefined") {
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

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[CuentaActions]", ...args);
  } catch {}

  try {
    console.warn("[CuentaActions]", ...args);
  } catch {}
}

/* =========================================================
   ENVELOPE / MODEL DETECTION
========================================================= */

function isLikelyCuenta(value) {
  if (!isObject(value)) return false;

  return Boolean(
    first(
      value.userId,
      value.id,
      value.accountId,
      value.profileId,
      value.username,
      value.usernameLower,
      value.email,
      value.emailLower,
      value.name,
      value.nombre,
      value.displayName,
      value.fullName,
      value.darkMode,
      value.lang,
      value.language,
      value.locale,
      value.preferences,
      value.settings
    )
  );
}

function looksLikeEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    obj.account ||
      obj.cuenta ||
      obj.profile ||
      obj.user ||
      obj.usuario ||
      obj.item ||
      obj.data ||
      obj.result ||
      obj.payload ||
      obj.detail ||
      obj.preferences ||
      obj.settings
  );
}

function pickDetail(payload = null, depth = 0) {
  if (!payload || depth > 6) return null;

  if (isLikelyCuenta(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  const candidates = [
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
    obj.preferences,
    obj.settings,
    obj.response,
  ];

  for (const candidate of candidates) {
    if (isLikelyCuenta(candidate)) {
      return candidate;
    }

    if (looksLikeEnvelope(candidate)) {
      const nested = pickDetail(candidate, depth + 1);

      if (nested) return nested;
    }
  }

  if (Array.isArray(obj.items) && obj.items.length) {
    const found = obj.items.find(isLikelyCuenta);

    if (found) return found;
  }

  if (Array.isArray(obj.data) && obj.data.length) {
    const found = obj.data.find(isLikelyCuenta);

    if (found) return found;
  }

  return null;
}

function pickList(payload = null, depth = 0) {
  if (!payload || depth > 6) return [];

  if (Array.isArray(payload)) {
    return payload.filter(isLikelyCuenta);
  }

  const obj = safeObject(payload);

  const candidates = [
    obj.accounts,
    obj.cuentas,
    obj.profiles,
    obj.users,
    obj.usuarios,
    obj.items,
    obj.data,
    obj.results,
    obj.payload,
    obj.collection,
    obj.list,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const list = candidate.filter(isLikelyCuenta);

      if (list.length) return list;
    }

    if (looksLikeEnvelope(candidate)) {
      const nested = pickList(candidate, depth + 1);

      if (nested.length) return nested;
    }
  }

  const detail = pickDetail(payload);

  return detail ? [detail] : [];
}

/* =========================================================
   FIELD GETTERS
========================================================= */

function getId(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.userId,
      raw.id,
      raw.accountId,
      raw.profileId,
      raw.uid,
      raw.sub,
      raw.user_id,
      raw.raw?.userId,
      raw.raw?.id,
      raw.raw?.uid,
      ""
    ),
    ""
  );
}

function getClienteId(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.cliente?.id,
      raw.cliente?.clienteId,
      raw.raw?.clienteId,
      ""
    ),
    ""
  );
}

function getUsername(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.username,
      raw.usernameLower,
      raw.userName,
      raw.nick,
      raw.alias,
      raw.slug,
      raw.raw?.username,
      raw.raw?.usernameLower,
      ""
    ),
    "Sin usuario"
  );
}

function getDisplayName(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.displayName,
      raw.name,
      raw.nombre,
      raw.fullName,
      raw.full_name,
      raw.nombreCompleto,
      raw.contacto?.nombre,
      raw.raw?.displayName,
      raw.raw?.name,
      raw.raw?.nombre,
      raw.raw?.fullName,
      getUsername(raw),
      getEmail(raw)
    ),
    "Sin nombre"
  );
}

function getEmail(item = {}) {
  const raw = safeObject(item);

  return normalizeEmail(
    first(
      raw.email,
      raw.emailLower,
      raw.mail,
      raw.userEmail,
      raw.contacto?.email,
      raw.raw?.email,
      raw.raw?.emailLower,
      ""
    )
  ) || "Sin email";
}

function getPhone(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.phone,
      raw.telefono,
      raw.mobile,
      raw.telefonoMovil,
      raw.contacto?.telefono,
      raw.contacto?.phone,
      raw.raw?.phone,
      raw.raw?.telefono,
      ""
    ),
    "Sin teléfono"
  );
}

function getRole(item = {}) {
  const raw = safeObject(item);

  return normalizeRole(
    first(
      raw.role,
      raw.rol,
      raw.accountRole,
      raw.profileRole,
      raw.raw?.role,
      raw.raw?.rol,
      DEFAULT_ROLE
    )
  );
}

function getPlan(item = {}) {
  const raw = safeObject(item);

  const planObject = first(
    raw.plan,
    raw.subscription,
    raw.suscripcion,
    raw.membership,
    raw.billing?.plan,
    raw.raw?.plan
  );

  if (isObject(planObject)) {
    return safeText(
      first(
        planObject.name,
        planObject.nombre,
        planObject.code,
        planObject.id,
        planObject.label
      ),
      "Sin plan"
    );
  }

  return safeText(
    first(
      raw.planName,
      raw.subscriptionName,
      raw.planLabel,
      planObject
    ),
    "Sin plan"
  );
}

function getStatus(item = {}) {
  const raw = safeObject(item);

  return normalizeStatus(
    first(
      raw.status,
      raw.estado,
      raw.accountStatus,
      raw.profileStatus,
      raw.raw?.status,
      raw.raw?.estado,
      DEFAULT_STATUS
    )
  );
}

function getAvatarUrl(item = {}) {
  const raw = safeObject(item);

  return safeText(
    first(
      raw.avatar,
      raw.avatarUrl,
      raw.photoURL,
      raw.photoUrl,
      raw.image,
      raw.imagen,
      raw.picture,
      raw.raw?.avatar,
      raw.raw?.avatarUrl,
      ""
    ),
    ""
  );
}

function getLanguage(item = {}) {
  const raw = safeObject(item);

  return normalizeLang(
    first(
      raw.lang,
      raw.language,
      raw.locale,
      raw.idioma,
      raw.preferences?.lang,
      raw.preferences?.language,
      raw.settings?.lang,
      raw.settings?.language,
      raw.raw?.lang,
      raw.raw?.language,
      raw.raw?.locale,
      DEFAULT_LANG
    )
  );
}

function getTheme(item = {}) {
  const raw = safeObject(item);

  const explicitTheme = first(
    raw.theme,
    raw.tema,
    raw.appearance,
    raw.preferences?.theme,
    raw.preferences?.appearance,
    raw.settings?.theme,
    raw.settings?.appearance,
    raw.raw?.theme,
    raw.raw?.appearance
  );

  if (explicitTheme !== null && explicitTheme !== undefined) {
    return normalizeTheme(explicitTheme);
  }

  return safeBoolean(
    first(
      raw.darkMode,
      raw.isDark,
      raw.preferences?.darkMode,
      raw.settings?.darkMode,
      raw.raw?.darkMode,
      false
    ),
    false
  )
    ? "dark"
    : "light";
}

function getDarkMode(item = {}) {
  return getTheme(item) === "dark";
}

function getCreatedAt(item = {}) {
  const raw = safeObject(item);

  return first(
    raw.createdAt,
    raw.created_at,
    raw.fechaCreacion,
    raw.date,
    raw.raw?.createdAt,
    raw.raw?.created_at,
    ""
  );
}

function getUpdatedAt(item = {}) {
  const raw = safeObject(item);

  return first(
    raw.updatedAt,
    raw.updated_at,
    raw.modifiedAt,
    raw.lastUpdate,
    raw.fechaActualizacion,
    raw.preferences?.updatedAt,
    raw.settings?.updatedAt,
    raw.raw?.updatedAt,
    raw.raw?.modifiedAt,
    getCreatedAt(raw),
    ""
  );
}

function getLastLoginAt(item = {}) {
  const raw = safeObject(item);

  return first(
    raw.lastLoginAt,
    raw.lastLogin,
    raw.ultimoLogin,
    raw.lastAccessAt,
    raw.lastSeenAt,
    raw.raw?.lastLoginAt,
    raw.raw?.lastSeenAt,
    ""
  );
}

function getSecurity(item = {}) {
  const raw = safeObject(item);

  const security = safeObject(
    first(
      raw.security,
      raw.seguridad,
      raw.securitySettings,
      raw.raw?.security,
      {}
    )
  );

  return {
    twoFactorEnabled: safeBoolean(
      first(
        security.twoFactorEnabled,
        security.twoFA,
        security.mfaEnabled,
        security.mfa,
        raw.twoFactorEnabled,
        raw.mfaEnabled,
        raw.raw?.twoFactorEnabled,
        false
      ),
      false
    ),

    emailVerified: safeBoolean(
      first(
        security.emailVerified,
        raw.emailVerified,
        raw.raw?.emailVerified,
        false
      ),
      false
    ),

    phoneVerified: safeBoolean(
      first(
        security.phoneVerified,
        raw.phoneVerified,
        raw.raw?.phoneVerified,
        false
      ),
      false
    ),

    passwordUpdatedAt: first(
      security.passwordUpdatedAt,
      security.passwordChangedAt,
      raw.passwordUpdatedAt,
      raw.passwordChangedAt,
      ""
    ) || "",
  };
}

function getAddressLine(row = {}) {
  return safeText(
    first(
      row.address,
      row.direccion,
      row.line1,
      row.fullAddress,
      [
        row.calle,
        row.cp,
        row.ciudad,
        row.provincia,
        row.pais,
      ]
        .filter(Boolean)
        .join(", ")
    ),
    "Sin dirección"
  );
}

function getAddresses(item = {}) {
  const raw = safeObject(item);

  return safeArray(
    first(
      raw.addresses,
      raw.direcciones,
      raw.addressBook,
      raw.raw?.addresses,
      []
    )
  ).map((entry, index) => {
    const row = safeObject(entry);

    return {
      id: safeText(first(row.id, row.addressId), `address-${index + 1}`),
      label: safeText(first(row.label, row.tipo, row.name), "Dirección"),
      address: getAddressLine(row),
      city: safeText(first(row.city, row.ciudad), ""),
      postalCode: safeText(first(row.postalCode, row.cp, row.zip), ""),
      province: safeText(first(row.province, row.provincia), ""),
      country: safeText(first(row.country, row.pais), ""),
      raw: row,
    };
  });
}

function getSessions(item = {}) {
  const raw = safeObject(item);

  return safeArray(
    first(
      raw.sessions,
      raw.activeSessions,
      raw.devices,
      raw.dispositivos,
      raw.raw?.sessions,
      []
    )
  ).map((entry, index) => {
    const row = safeObject(entry);

    return {
      id: safeText(first(row.id, row.sessionId, row.deviceId), `session-${index + 1}`),
      label: safeText(first(row.label, row.name, row.deviceName, row.browser), "Sesión"),
      lastSeenAt: first(row.lastSeenAt, row.lastAccessAt, row.updatedAt, ""),
      ip: safeText(first(row.ip, row.ipAddress), ""),
      userAgent: safeText(first(row.userAgent, row.ua), ""),
      current: safeBoolean(first(row.current, row.isCurrent, false), false),
      raw: row,
    };
  });
}

function normalizeCuentaDetail(detail = {}) {
  const raw = safeObject(detail);
  const security = getSecurity(raw);

  const userId = getId(raw);
  const username = getUsername(raw);
  const displayName = getDisplayName(raw);
  const email = getEmail(raw);
  const phone = getPhone(raw);
  const role = getRole(raw);
  const status = getStatus(raw);
  const lang = getLanguage(raw);
  const theme = getTheme(raw);
  const darkMode = theme === "dark";

  return {
    ...raw,

    id: safeText(first(raw.id, userId), userId),
    userId,
    accountId: safeText(first(raw.accountId, userId), userId),
    profileId: safeText(first(raw.profileId, userId), userId),
    clienteId: getClienteId(raw),

    username,
    usernameLower: username.toLowerCase(),

    displayName,
    name: safeText(first(raw.name, displayName), displayName),
    nombre: safeText(first(raw.nombre, displayName), displayName),
    fullName: safeText(first(raw.fullName, displayName), displayName),

    email,
    emailLower: normalizeEmail(email),

    phone,
    telefono: phone,

    role,
    rol: role,
    plan: getPlan(raw),
    status,
    estado: status,

    avatar: getAvatarUrl(raw),
    avatarUrl: getAvatarUrl(raw),

    lang,
    language: lang,
    locale: lang,

    theme,
    appearance: theme,
    darkMode,

    createdAt: getCreatedAt(raw) || null,
    createdAtIso: formatDateIso(getCreatedAt(raw)) || null,

    updatedAt: getUpdatedAt(raw) || null,
    updatedAtIso: formatDateIso(getUpdatedAt(raw)) || null,

    lastLoginAt: getLastLoginAt(raw) || null,
    lastLoginAtIso: formatDateIso(getLastLoginAt(raw)) || null,

    security,
    twoFactorEnabled: security.twoFactorEnabled,
    emailVerified: security.emailVerified,
    phoneVerified: security.phoneVerified,

    addresses: getAddresses(raw),
    sessions: getSessions(raw),

    meta: {
      ...safeObject(raw.meta),
      normalizedBy: CUENTA_ACTIONS_MODULE,
      normalizedVersion: CUENTA_ACTIONS_VERSION,
      hasUserId: Boolean(userId),
      hasEmail: isValidEmail(email),
      hasAvatar: Boolean(getAvatarUrl(raw)),
      isAdmin: role === "admin",
      isActive: status === "active",
      darkMode,
      lang,
      theme,
    },

    raw,
  };
}

/* =========================================================
   STORE RESOLUTION
========================================================= */

function getStoreList() {
  const candidates = [
    ["getSortedCuentasStore", []],
    ["getCuentasStore", []],
    ["getCuentaCollectionStore", []],
    ["getItemsStore", []],
    ["getCuentaStore", []],
  ];

  for (const [method, args] of candidates) {
    try {
      const fn = CuentaStore?.[method];

      if (!isFn(fn)) continue;

      const result = fn(...args);
      const list = pickList(result);

      if (list.length) {
        return list;
      }

      const detail = pickDetail(result);

      if (detail) {
        return [detail];
      }
    } catch {}
  }

  return [];
}

function getStoreSingle() {
  const candidates = [
    "getCuentaStore",
    "getCurrentCuentaStore",
    "getAccountStore",
    "getProfileStore",
  ];

  for (const method of candidates) {
    try {
      const fn = CuentaStore?.[method];

      if (!isFn(fn)) continue;

      const detail = pickDetail(fn());

      if (detail) return detail;
    } catch {}
  }

  return null;
}

function findCuentaInList(list = [], id = "") {
  const target = safeText(id, "");

  if (!target) return null;

  const normalizedTarget = normalizeKey(target);
  const targetEmail = normalizeEmail(target);

  return (
    safeArray(list).find((item) => {
      const row = safeObject(item);

      const ids = [
        getId(row),
        row.id,
        row.userId,
        row.accountId,
        row.profileId,
        row.uid,
        row.sub,
        getUsername(row),
        getEmail(row),
      ]
        .filter(Boolean)
        .map((value) => safeText(value, ""));

      return ids.some((value) => {
        return (
          value === target ||
          normalizeKey(value) === normalizedTarget ||
          normalizeEmail(value) === targetEmail
        );
      });
    }) || null
  );
}

/* =========================================================
   API RESOLUTION
========================================================= */

async function callApiCandidate(method = "", args = []) {
  const fn = CuentaApi?.[method];

  if (!isFn(fn)) {
    return {
      ok: false,
      skipped: true,
      reason: "MISSING_METHOD",
      method,
    };
  }

  try {
    const response = await fn(...safeArray(args));
    const detail = pickDetail(response);
    const list = pickList(response);

    return {
      ok: true,
      method,
      response,
      detail,
      list,
    };
  } catch (error) {
    return {
      ok: false,
      method,
      error,
    };
  }
}

async function fetchCuentaDetailFromBackend(id = "", options = {}) {
  const userId = normalizeCuentaId(id);
  const opts = safeObject(options);

  const candidates = [
    ["getCuentaByIdRequest", [userId]],
    ["fetchCuentaDetailRequest", [userId]],
    ["fetchCuentaByIdRequest", [userId]],
    ["loadCuentaById", [userId]],
    ["loadCuenta", [{ userId, id: userId, force: true, ...opts }]],
    ["fetchCuentaRequest", [{ userId, id: userId, force: true, ...opts }]],
  ];

  let lastError = null;

  for (const [method, args] of candidates) {
    const result = await callApiCandidate(method, args);

    if (result.ok && result.detail) {
      return result.detail;
    }

    if (result.ok && result.list?.length) {
      const found = findCuentaInList(result.list, userId) || result.list[0];

      if (found) return found;
    }

    if (result.error) {
      lastError = result.error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

/* =========================================================
   ID / PAYLOAD NORMALIZATION
========================================================= */

function normalizeCuentaId(value = "") {
  if (isObject(value)) {
    return safeText(
      first(
        value.userId,
        value.id,
        value.accountId,
        value.profileId,
        value.uid,
        value.sub,
        value.email,
        value.username,
        ""
      ),
      ""
    );
  }

  return safeText(value, "");
}

function resolveActionId(payload = {}) {
  const obj = safeObject(payload);

  return normalizeCuentaId(
    first(
      obj.userId,
      obj.id,
      obj.accountId,
      obj.profileId,
      obj.uid,
      obj.email,
      obj.username,
      obj.item,
      obj.detail,
      obj.cuenta,
      obj.account,
      obj.user,
      ""
    )
  );
}

function resolveActionItem(payload = {}) {
  const direct = pickDetail(payload);

  if (direct) return direct;

  const obj = safeObject(payload);

  return pickDetail(
    first(
      obj.item,
      obj.detail,
      obj.cuenta,
      obj.account,
      obj.profile,
      obj.user,
      obj.payload,
      obj.data,
      null
    )
  );
}

/* =========================================================
   CSV
========================================================= */

function escapeCsvCell(value = "") {
  const text =
    value === null || value === undefined
      ? ""
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvRows(items = []) {
  const header = [
    "userId",
    "clienteId",
    "username",
    "displayName",
    "email",
    "phone",
    "role",
    "plan",
    "status",
    "lang",
    "theme",
    "darkMode",
    "emailVerified",
    "phoneVerified",
    "twoFactorEnabled",
    "createdAt",
    "updatedAt",
    "lastLoginAt",
  ];

  const rows = safeArray(items).map((item) => {
    const normalized = normalizeCuentaDetail(item);

    return [
      normalized.userId,
      normalized.clienteId,
      normalized.username,
      normalized.displayName,
      normalized.email,
      normalized.phone,
      normalized.role,
      normalized.plan,
      normalized.status,
      normalized.lang,
      normalized.theme,
      String(normalized.darkMode),
      String(normalized.emailVerified),
      String(normalized.phoneVerified),
      String(normalized.twoFactorEnabled),
      normalized.createdAt || "",
      normalized.updatedAt || "",
      normalized.lastLoginAt || "",
    ];
  });

  return [
    header.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\n");
}

function sanitizeFilename(value = "", fallback = CSV_FILENAME) {
  const text = safeText(value, fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);

  return text || fallback;
}

function downloadTextFile({
  filename = CSV_FILENAME,
  content = "",
  mimeType = "text/plain;charset=utf-8;",
} = {}) {
  if (!isBrowser()) {
    return false;
  }

  try {
    const blob = new Blob([String(content || "")], {
      type: mimeType,
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = sanitizeFilename(filename, CSV_FILENAME);
    anchor.rel = "noopener";

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    safeWarn("downloadTextFile falló:", error);
    return false;
  }
}

/* =========================================================
   CLIPBOARD
========================================================= */

async function writeClipboardText(text = "") {
  const value = safeText(text, "");

  if (!value || !isBrowser()) return false;

  try {
    if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}

  try {
    const textarea = document.createElement("textarea");

    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
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

/* =========================================================
   NAVIGATION
========================================================= */

async function navigateSafe(route = "", payload = {}) {
  const targetRoute = safeText(route, "");

  if (!targetRoute) return false;

  safeEmit("cuenta:navigate:request", {
    route: targetRoute,
    payload,
  });

  const candidates = [
    AppCore?.router?.navigate,
    AppCore?.Router?.navigate,
    AppCore?.navigate,
    window?.Router?.navigate,
    window?.AppRouter?.navigate,
  ];

  for (const candidate of candidates) {
    try {
      if (isFn(candidate)) {
        await candidate(targetRoute);
        return true;
      }
    } catch {}
  }

  try {
    if (isBrowser() && window.history?.pushState) {
      window.history.pushState({}, "", targetRoute);

      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: {},
        })
      );

      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   DETAIL ACTIONS
========================================================= */

export function getCuentaDetailFromStoreAction(payload = {}) {
  const directItem = resolveActionItem(payload);

  if (directItem) {
    return normalizeCuentaDetail(directItem);
  }

  const id = resolveActionId(payload);

  try {
    if (id && isFn(CuentaStore.getCuentaByIdStore)) {
      const detail = CuentaStore.getCuentaByIdStore(id);
      const picked = pickDetail(detail);

      if (picked) {
        return normalizeCuentaDetail(picked);
      }
    }
  } catch {}

  try {
    const list = getStoreList();
    const found = id ? findCuentaInList(list, id) : null;

    if (found) {
      return normalizeCuentaDetail(found);
    }
  } catch {}

  try {
    const single = getStoreSingle();

    if (single) {
      if (!id || findCuentaInList([single], id)) {
        return normalizeCuentaDetail(single);
      }
    }
  } catch {}

  return null;
}

export async function getCuentaDetailAction(payload = {}) {
  const options = safeObject(payload);

  const id = resolveActionId(options);
  const preferFresh = options.preferFresh !== false;
  const silent = safeBoolean(options.silent, false);

  const fallbackStoreDetail = getCuentaDetailFromStoreAction(options);

  if (!preferFresh && fallbackStoreDetail) {
    return fallbackStoreDetail;
  }

  if (!id && fallbackStoreDetail) {
    return fallbackStoreDetail;
  }

  if (!id) {
    if (!silent) {
      showToast("No se pudo resolver la cuenta.", "error");
    }

    return null;
  }

  try {
    safeEmit("cuenta:detail:request", {
      userId: id,
      source: "backend",
    });

    const response = await fetchCuentaDetailFromBackend(id, options);
    const detail = pickDetail(response) || response;

    if (!detail) {
      if (fallbackStoreDetail) {
        safeEmit("cuenta:detail:fallback", {
          userId: id,
          source: "store",
        });

        return fallbackStoreDetail;
      }

      throw new Error("EMPTY_CUENTA_DETAIL");
    }

    const normalized = normalizeCuentaDetail(detail);

    safeEmit("cuenta:detail:success", {
      userId: id,
      source: "backend",
      detail: normalized,
    });

    return normalized;
  } catch (error) {
    if (fallbackStoreDetail) {
      safeEmit("cuenta:detail:fallback", {
        userId: id,
        source: "store",
        error,
      });

      return fallbackStoreDetail;
    }

    safeEmit("cuenta:detail:error", {
      userId: id,
      error,
    });

    if (!silent) {
      showToast("No se pudo cargar el detalle de la cuenta.", "error");
    }

    return null;
  }
}

export async function openCuentaAction(payload = {}) {
  const options = safeObject(payload);
  const id = resolveActionId(options);
  const silent = safeBoolean(options.silent, false);

  if (!id && !resolveActionItem(options)) {
    if (!silent) {
      showToast("Cuenta inválida.", "error");
    }

    return null;
  }

  safeEmit("cuenta:open", {
    userId: id,
    payload: options,
  });

  const detail = await getCuentaDetailAction({
    ...options,
    userId: id,
  });

  if (!detail) {
    return null;
  }

  safeEmit("cuenta:open:success", {
    userId: detail.userId || id,
    detail,
  });

  return detail;
}

export async function refreshCuentaDetailAction(payload = {}) {
  return getCuentaDetailAction({
    ...safeObject(payload),
    preferFresh: true,
    silent: payload?.silent !== false,
  });
}

/* =========================================================
   COPY ACTIONS
========================================================= */

export async function copyCuentaIdAction(payload = {}) {
  const options = safeObject(payload);
  const silent = safeBoolean(options.silent, false);

  const detail =
    resolveActionItem(options) ||
    getCuentaDetailFromStoreAction(options) ||
    {};

  const id = safeText(
    first(
      options.userId,
      options.id,
      getId(detail)
    ),
    ""
  );

  if (!id) {
    if (!silent) {
      showToast("No hay ID para copiar.", "error");
    }

    return false;
  }

  const copied = await writeClipboardText(id);

  if (!copied) {
    if (!silent) {
      showToast("No se pudo copiar el ID.", "error");
    }

    return false;
  }

  safeEmit("cuenta:copy-id", {
    userId: id,
  });

  if (!silent) {
    showToast("ID copiado", "success");
  }

  return true;
}

export async function copyCuentaEmailAction(payload = {}) {
  const options = safeObject(payload);
  const silent = safeBoolean(options.silent, false);

  const detail =
    resolveActionItem(options) ||
    getCuentaDetailFromStoreAction(options) ||
    {};

  const email = normalizeEmail(
    first(
      options.email,
      getEmail(detail)
    )
  );

  if (!isValidEmail(email)) {
    if (!silent) {
      showToast("No hay email válido para copiar.", "error");
    }

    return false;
  }

  const copied = await writeClipboardText(email);

  if (!copied) {
    if (!silent) {
      showToast("No se pudo copiar el email.", "error");
    }

    return false;
  }

  safeEmit("cuenta:copy-email", {
    email,
    userId: getId(detail),
  });

  if (!silent) {
    showToast("Email copiado", "success");
  }

  return true;
}

export async function copyCuentaUsernameAction(payload = {}) {
  const options = safeObject(payload);
  const silent = safeBoolean(options.silent, false);

  const detail =
    resolveActionItem(options) ||
    getCuentaDetailFromStoreAction(options) ||
    {};

  const username = safeText(
    first(
      options.username,
      getUsername(detail)
    ),
    ""
  );

  if (!username || username === "Sin usuario") {
    if (!silent) {
      showToast("No hay usuario para copiar.", "error");
    }

    return false;
  }

  const copied = await writeClipboardText(username);

  if (!copied) {
    if (!silent) {
      showToast("No se pudo copiar el usuario.", "error");
    }

    return false;
  }

  safeEmit("cuenta:copy-username", {
    username,
    userId: getId(detail),
  });

  if (!silent) {
    showToast("Usuario copiado", "success");
  }

  return true;
}

/* =========================================================
   EXPORT
========================================================= */

function resolveExportItems(payload = {}) {
  const options = safeObject(payload);

  if (Array.isArray(options.items)) {
    return options.items;
  }

  if (Array.isArray(options.cuentas)) {
    return options.cuentas;
  }

  if (Array.isArray(options.accounts)) {
    return options.accounts;
  }

  const directDetail = resolveActionItem(options);

  if (directDetail) {
    return [directDetail];
  }

  const storeList = getStoreList();

  if (storeList.length) {
    return storeList;
  }

  const single = getStoreSingle();

  return single ? [single] : [];
}

export function exportCuentaCsvAction(payload = {}) {
  const options = safeObject(payload);

  const filename = sanitizeFilename(
    first(
      options.filename,
      options.fileName,
      CSV_FILENAME
    ),
    CSV_FILENAME
  );

  const silent = safeBoolean(options.silent, false);
  const list = safeArray(resolveExportItems(options)).filter(isLikelyCuenta);

  if (!list.length) {
    if (!silent) {
      showToast("No hay datos de cuenta para exportar.", "info");
    }

    return false;
  }

  try {
    const csv = `${CSV_BOM}${buildCsvRows(list)}`;

    const ok = downloadTextFile({
      filename,
      content: csv,
      mimeType: CSV_MIME,
    });

    if (!ok) {
      throw new Error("CSV_DOWNLOAD_NOT_AVAILABLE");
    }

    safeEmit("cuenta:export:csv", {
      total: list.length,
      filename,
    });

    if (!silent) {
      showToast("CSV exportado", "success");
    }

    return true;
  } catch (error) {
    safeEmit("cuenta:export:error", {
      type: "csv",
      error,
    });

    if (!silent) {
      showToast("No se pudo exportar el CSV.", "error");
    }

    return false;
  }
}

/* =========================================================
   NAVIGATION ACTIONS
========================================================= */

export async function editCuentaAction(payload = {}) {
  const options = safeObject(payload);

  const route = safeText(
    first(
      options.route,
      options.href,
      "/cuenta/editar"
    ),
    "/cuenta/editar"
  );

  const fallbackEvent = safeText(options.fallbackEvent, "cuenta:edit");
  const silent = safeBoolean(options.silent, false);

  try {
    safeEmit(fallbackEvent, {
      route,
      payload: options,
    });

    const navigated = await navigateSafe(route, options);

    if (!navigated) {
      safeEmit("cuenta:edit:fallback", {
        route,
        payload: options,
      });
    }

    return true;
  } catch (error) {
    safeEmit("cuenta:edit:error", {
      route,
      error,
    });

    if (!silent) {
      showToast("No se pudo abrir la edición de cuenta.", "error");
    }

    return false;
  }
}

export async function openCuentaSecurityAction(payload = {}) {
  const options = safeObject(payload);

  const route = safeText(
    first(
      options.route,
      options.href,
      "/cuenta/seguridad"
    ),
    "/cuenta/seguridad"
  );

  const fallbackEvent = safeText(options.fallbackEvent, "cuenta:security");
  const silent = safeBoolean(options.silent, false);

  try {
    safeEmit(fallbackEvent, {
      route,
      payload: options,
    });

    const navigated = await navigateSafe(route, options);

    if (!navigated) {
      safeEmit("cuenta:security:fallback", {
        route,
        payload: options,
      });
    }

    return true;
  } catch (error) {
    safeEmit("cuenta:security:error", {
      route,
      error,
    });

    if (!silent) {
      showToast("No se pudo abrir la sección de seguridad.", "error");
    }

    return false;
  }
}

/* =========================================================
   PREFERENCES / PASSWORD AUX ACTIONS
========================================================= */

export async function saveCuentaPreferencesAction(payload = {}) {
  const options = safeObject(payload);
  const silent = safeBoolean(options.silent, false);

  const updatePayload = {
    ...safeObject(options.preferences),
    ...safeObject(options.payload),

    name: safeText(first(options.name, options.displayName, options.payload?.name, ""), ""),
    displayName: safeText(first(options.displayName, options.name, options.payload?.displayName, ""), ""),

    phone: safeText(first(options.phone, options.telefono, options.payload?.phone, ""), ""),
    telefono: safeText(first(options.telefono, options.phone, options.payload?.telefono, ""), ""),

    lang: normalizeLang(first(options.lang, options.language, options.locale, options.payload?.lang, DEFAULT_LANG)),
    language: normalizeLang(first(options.language, options.lang, options.locale, options.payload?.language, DEFAULT_LANG)),
    locale: normalizeLang(first(options.locale, options.lang, options.language, options.payload?.locale, DEFAULT_LANG)),

    darkMode: safeBoolean(first(options.darkMode, options.payload?.darkMode, false), false),
    privacyMode: safeBoolean(first(options.privacyMode, options.payload?.privacyMode, false), false),
  };

  updatePayload.theme = updatePayload.darkMode ? "dark" : "light";
  updatePayload.appearance = updatePayload.theme;

  const candidates = [
    ["updateCuenta", [updatePayload]],
    ["saveCuenta", [updatePayload]],
    ["updateCuentaPreferences", [updatePayload]],
    ["saveCuentaPreferences", [updatePayload]],
  ];

  let lastError = null;

  for (const [method, args] of candidates) {
    const fn = CuentaApi?.[method];

    if (!isFn(fn)) continue;

    try {
      const response = await fn(...args);
      const detail = pickDetail(response) || response;

      safeEmit("cuenta:preferences:save:success", {
        payload: updatePayload,
        detail,
      });

      if (!silent) {
        showToast("Preferencias guardadas", "success");
      }

      return detail ? normalizeCuentaDetail(detail) : true;
    } catch (error) {
      lastError = error;
    }
  }

  safeEmit("cuenta:preferences:save:error", {
    payload: updatePayload,
    error: lastError,
  });

  if (!silent) {
    showToast("No se pudieron guardar las preferencias.", "error");
  }

  return null;
}

export async function changeCuentaPasswordAction(payload = {}) {
  const options = safeObject(payload);
  const silent = safeBoolean(options.silent, false);

  const currentPassword = safeText(
    first(
      options.currentPassword,
      options.password,
      options.actual,
      ""
    ),
    ""
  );

  const newPassword = safeText(
    first(
      options.newPassword,
      options.nextPassword,
      options.nueva,
      ""
    ),
    ""
  );

  const confirmPassword = safeText(
    first(
      options.confirmPassword,
      options.repeatPassword,
      options.confirmacion,
      ""
    ),
    ""
  );

  if (!currentPassword || !newPassword) {
    if (!silent) {
      showToast("Faltan datos para cambiar la contraseña.", "error");
    }

    return false;
  }

  if (confirmPassword && confirmPassword !== newPassword) {
    if (!silent) {
      showToast("La confirmación de contraseña no coincide.", "error");
    }

    return false;
  }

  const requestPayload = {
    currentPassword,
    newPassword,
    confirmPassword,
    source: "cuenta.actions",
  };

  const candidates = [
    ["changePasswordRequest", [requestPayload]],
    ["updatePasswordRequest", [requestPayload]],
    ["changeCuentaPasswordRequest", [requestPayload]],
    ["updateCuentaPasswordRequest", [requestPayload]],
  ];

  let hasApiCandidate = false;
  let lastError = null;

  for (const [method, args] of candidates) {
    const fn = CuentaApi?.[method];

    if (!isFn(fn)) continue;

    hasApiCandidate = true;

    try {
      const response = await fn(...args);

      safeEmit("cuenta:password:success", {
        response,
      });

      if (!silent) {
        showToast("Contraseña actualizada", "success");
      }

      return true;
    } catch (error) {
      lastError = error;
    }
  }

  if (!hasApiCandidate) {
    safeEmit("cuenta:password:change", requestPayload);

    if (!silent) {
      showToast("Solicitud de cambio de contraseña enviada.", "info");
    }

    return true;
  }

  safeEmit("cuenta:password:error", {
    error: lastError,
  });

  if (!silent) {
    showToast("No se pudo cambiar la contraseña.", "error");
  }

  return false;
}

/* =========================================================
   DETAIL HELPERS EXPORT
========================================================= */

export {
  getId as getCuentaIdAction,
  getClienteId as getCuentaClienteIdAction,
  getUsername as getCuentaUsernameAction,
  getDisplayName as getCuentaDisplayNameAction,
  getEmail as getCuentaEmailAction,
  getPhone as getCuentaPhoneAction,
  getRole as getCuentaRoleAction,
  getPlan as getCuentaPlanAction,
  getStatus as getCuentaStatusAction,
  getAvatarUrl as getCuentaAvatarUrlAction,
  getLanguage as getCuentaLanguageAction,
  getTheme as getCuentaThemeAction,
  getDarkMode as getCuentaDarkModeAction,
  getCreatedAt as getCuentaCreatedAtAction,
  getUpdatedAt as getCuentaUpdatedAtAction,
  getLastLoginAt as getCuentaLastLoginAtAction,
  getSecurity as getCuentaSecurityAction,
  getAddresses as getCuentaAddressesAction,
  getSessions as getCuentaSessionsAction,
  normalizeCuentaDetail as normalizeCuentaDetailAction,
  pickDetail as pickCuentaDetailAction,
  pickList as pickCuentaListAction,
};

/* =========================================================
   DEFAULT API
========================================================= */

export default {
  getCuentaDetailFromStoreAction,
  getCuentaDetailAction,
  openCuentaAction,
  refreshCuentaDetailAction,

  copyCuentaIdAction,
  copyCuentaEmailAction,
  copyCuentaUsernameAction,

  exportCuentaCsvAction,

  editCuentaAction,
  openCuentaSecurityAction,

  saveCuentaPreferencesAction,
  changeCuentaPasswordAction,

  getCuentaIdAction: getId,
  getCuentaClienteIdAction: getClienteId,
  getCuentaUsernameAction: getUsername,
  getCuentaDisplayNameAction: getDisplayName,
  getCuentaEmailAction: getEmail,
  getCuentaPhoneAction: getPhone,
  getCuentaRoleAction: getRole,
  getCuentaPlanAction: getPlan,
  getCuentaStatusAction: getStatus,
  getCuentaAvatarUrlAction: getAvatarUrl,
  getCuentaLanguageAction: getLanguage,
  getCuentaThemeAction: getTheme,
  getCuentaDarkModeAction: getDarkMode,
  getCuentaCreatedAtAction: getCreatedAt,
  getCuentaUpdatedAtAction: getUpdatedAt,
  getCuentaLastLoginAtAction: getLastLoginAt,
  getCuentaSecurityAction: getSecurity,
  getCuentaAddressesAction: getAddresses,
  getCuentaSessionsAction: getSessions,
  normalizeCuentaDetailAction: normalizeCuentaDetail,
  pickCuentaDetailAction: pickDetail,
  pickCuentaListAction: pickList,
};
