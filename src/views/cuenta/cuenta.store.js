/* =========================================================
   Onion SPA - Cuenta Store
   Archivo: src/views/cuenta/cuenta.store.js

   EXTREME PRO SYSTEM · STORE LAYER · FULL PATCH 12/10
   SINGLE RESOURCE STORE · ACCOUNT PREFS · LEGACY SAFE

   RESPONSABILIDADES:
   - encapsular Store global
   - leer / escribir recurso único cuenta
   - mantener fallback colección
   - helpers para API / View / Actions / Modal
   - búsquedas robustas por id lógico
   - replace / update / upsert
   - persistencia estable para modal / bindings / view
   - fallback memoria/localStorage si Store no está listo
   - normalización completa de preferencias: theme/lang/darkMode/privacyMode

   HARDENING EXTREME:
   - soporta Store.get / Store.set / Store.actions
   - soporta paths legacy y modernos
   - no muta estructuras originales
   - dedupe por ids lógicos
   - preserva userId/email/username
   - preserva preferences/settings
   - single resource + collection bridge
   - ordenación consistente por updatedAt/_ts
========================================================= */

import { Store } from "../../store/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const STORE_PATH = "entities.cuenta";
export const STORE_COLLECTION_PATH = "entities.cuentaItems";

export const STORE_KEY = "cuenta";
export const STORE_COLLECTION_KEY = "cuentaItems";

export const STORE_ALT_PATHS = [
  "entities.cuenta",
  "cuenta",
  "account",
  "profile",
  "user.preferences",
  "preferences.cuenta",
];

export const STORE_COLLECTION_ALT_PATHS = [
  "entities.cuentaItems",
  "cuentaItems",
  "cuentas",
  "accounts",
  "profiles",
];

export const DEFAULT_RESOURCE_ID = "cuenta";
export const DEFAULT_LANG = "es";
export const DEFAULT_THEME = "light";
export const DEFAULT_ROLE = "user";
export const DEFAULT_STATUS = "active";

const LOCAL_CACHE_KEY = "onion:cuenta:store:v12";

/* =========================================================
   MEMORY FALLBACK
========================================================= */

let memoryItem = null;
let memoryCollection = [];

/* =========================================================
   SAFE HELPERS
========================================================= */

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

  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function safeBoolean(value, fallback = false) {
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

  return Boolean(fallback);
}

function safeTimestamp(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }

  const text = safeText(value, "");
  if (!text) return fallback;

  const date = new Date(text.includes("T") ? text : `${text}T00:00:00`);
  const ts = date.getTime();

  return Number.isFinite(ts) ? ts : fallback;
}

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

function clonePlain(value) {
  if (value === null || value === undefined) return value;

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
   PATH HELPERS
========================================================= */

function getPath(source = {}, path = "") {
  const cleanPath = safeText(path, "");
  if (!cleanPath) return undefined;

  const parts = cleanPath.split(".").filter(Boolean);
  let current = source;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}

function setPath(source = {}, path = "", value = null) {
  const cleanPath = safeText(path, "");
  if (!cleanPath) return source;

  const parts = cleanPath.split(".").filter(Boolean);
  if (!parts.length) return source;

  let current = source;

  parts.slice(0, -1).forEach((part) => {
    if (
      !current[part] ||
      typeof current[part] !== "object" ||
      Array.isArray(current[part])
    ) {
      current[part] = {};
    }

    current = current[part];
  });

  current[parts[parts.length - 1]] = value;

  return source;
}

/* =========================================================
   LOCAL CACHE
========================================================= */

function readLocalCache() {
  try {
    if (typeof localStorage === "undefined") return null;

    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    return safeObject(parsed, null);
  } catch {
    return null;
  }
}

function writeLocalCache({ item = memoryItem, collection = memoryCollection } = {}) {
  try {
    if (typeof localStorage === "undefined") return false;

    localStorage.setItem(
      LOCAL_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        item: item || null,
        collection: safeArray(collection),
      })
    );

    return true;
  } catch {
    return false;
  }
}

function clearLocalCache() {
  try {
    if (typeof localStorage === "undefined") return false;

    localStorage.removeItem(LOCAL_CACHE_KEY);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ID HELPERS
========================================================= */

export function getCuentaItemId(item = {}) {
  const row = safeObject(item);

  return safeText(
    first(
      row.resourceId,
      row.userId,
      row.uid,
      row.sub,
      row.accountId,
      row.profileId,
      row.id,
      row.email,
      row.username,
      DEFAULT_RESOURCE_ID
    ),
    DEFAULT_RESOURCE_ID
  );
}

export function getCuentaIdentityKeys(item = {}) {
  const row = safeObject(item);

  return [
    row.resourceId,
    row.userId,
    row.uid,
    row.sub,
    row.accountId,
    row.profileId,
    row.id,
    row.email,
    row.emailLower,
    row.username,
    row.usernameLower,
    row.name,
    row.displayName,
  ]
    .map((value) => safeText(value, ""))
    .filter(Boolean);
}

function isSameCuentaItemId(item = {}, id = "") {
  const target = safeText(id, "");
  if (!target) return false;

  const targetLower = target.toLowerCase();

  return getCuentaIdentityKeys(item).some((key) => {
    const value = safeText(key, "");
    return value === target || value.toLowerCase() === targetLower;
  });
}

/* =========================================================
   NORMALIZERS
========================================================= */

export function normalizeCuentaStoreItem(item = {}) {
  const row = safeObject(item);

  if (!hasOwnKeys(row)) {
    return null;
  }

  const preferences = safeObject(
    first(
      row.preferences,
      row.prefs,
      row.settings,
      {}
    )
  );

  const settings = safeObject(
    first(
      row.settings,
      row.preferences,
      {}
    )
  );

  const rawTheme = first(
    row.theme,
    row.mode,
    row.appearance,
    preferences.theme,
    preferences.mode,
    settings.theme,
    settings.mode,
    ""
  );

  const darkMode = safeBoolean(
    first(
      row.darkMode,
      row.isDark,
      preferences.darkMode,
      preferences.isDark,
      settings.darkMode,
      settings.isDark,
      rawTheme === "dark" ? true : null,
      rawTheme === "light" ? false : null,
      false
    ),
    false
  );

  const theme = normalizeTheme(rawTheme, darkMode);

  const privacyMode = safeBoolean(
    first(
      row.privacyMode,
      row.privateMode,
      preferences.privacyMode,
      preferences.privateMode,
      settings.privacyMode,
      settings.privateMode,
      false
    ),
    false
  );

  const lang = normalizeLang(
    first(
      row.lang,
      row.language,
      row.locale,
      row.idioma,
      preferences.lang,
      preferences.language,
      preferences.locale,
      settings.lang,
      settings.language,
      settings.locale,
      DEFAULT_LANG
    )
  );

  const userId = safeText(
    first(
      row.userId,
      row.uid,
      row.sub,
      row.user_id,
      row.user?.userId,
      row.user?.id,
      ""
    ),
    ""
  );

  const id = safeText(
    first(
      row.id,
      row.resourceId,
      userId,
      row.accountId,
      row.profileId,
      row.email,
      DEFAULT_RESOURCE_ID
    ),
    DEFAULT_RESOURCE_ID
  );

  const resourceId = safeText(
    first(
      row.resourceId,
      userId,
      row.uid,
      row.sub,
      row.accountId,
      row.profileId,
      row.id,
      row.email,
      DEFAULT_RESOURCE_ID
    ),
    DEFAULT_RESOURCE_ID
  );

  const email = safeLower(
    first(
      row.email,
      row.emailLower,
      row.mail,
      row.userEmail,
      row.user?.email,
      ""
    ),
    ""
  );

  const username = safeText(
    first(
      row.username,
      row.usernameLower,
      row.userName,
      row.nick,
      row.alias,
      row.user?.username,
      ""
    ),
    ""
  );

  const name = safeText(
    first(
      row.name,
      row.nombre,
      row.fullName,
      row.displayName,
      row.user?.name,
      row.user?.nombre,
      row.user?.fullName,
      row.user?.displayName,
      username,
      email,
      "Usuario Onion"
    ),
    "Usuario Onion"
  );

  const updatedAt = first(
    row.updatedAt,
    row.updated_at,
    row.modifiedAt,
    row.lastUpdate,
    row.lastUpdatedAt,
    preferences.updatedAt,
    settings.updatedAt,
    ""
  );

  const createdAt = first(
    row.createdAt,
    row.created_at,
    row.fechaCreacion,
    row.date,
    null
  );

  const lastLoginAt = first(
    row.lastLoginAt,
    row.lastLogin,
    row.ultimoLogin,
    row.lastAccessAt,
    row.lastSeenAt,
    null
  );

  return {
    ...clonePlain(row),

    id,
    resourceId,

    userId,
    uid: safeText(first(row.uid, userId), userId),
    sub: safeText(first(row.sub, userId), userId),

    accountId: safeText(first(row.accountId, row.profileId, resourceId), resourceId),
    profileId: safeText(first(row.profileId, row.accountId, resourceId), resourceId),

    email,
    emailLower: safeLower(first(row.emailLower, email), email),

    username,
    usernameLower: safeLower(first(row.usernameLower, username), username),

    name,
    nombre: safeText(first(row.nombre, name), name),
    fullName: safeText(first(row.fullName, name), name),
    displayName: safeText(first(row.displayName, name, username, email), name),

    phone: safeText(
      first(
        row.phone,
        row.telefono,
        row.mobile,
        row.telefonoMovil,
        row.user?.phone,
        ""
      ),
      ""
    ),

    telefono: safeText(
      first(
        row.telefono,
        row.phone,
        row.mobile,
        row.telefonoMovil,
        row.user?.telefono,
        ""
      ),
      ""
    ),

    avatar: first(row.avatar, row.avatarUrl, row.photoURL, row.photoUrl, null),
    avatarUrl: first(row.avatarUrl, row.avatar, row.photoURL, row.photoUrl, null),

    role: normalizeRole(first(row.role, row.rol, DEFAULT_ROLE)),
    rol: normalizeRole(first(row.rol, row.role, DEFAULT_ROLE)),

    status: normalizeStatus(first(row.status, row.estado, DEFAULT_STATUS)),
    estado: normalizeStatus(first(row.estado, row.status, DEFAULT_STATUS)),

    active: safeBoolean(first(row.active, row.enabled, true), true),

    darkMode,
    privacyMode,

    theme,
    mode: theme,
    appearance: theme,

    lang,
    language: lang,
    locale: lang,

    createdAt,
    updatedAt: updatedAt || null,
    updated_at: updatedAt || null,
    updatedAtMs: safeTimestamp(
      first(row.updatedAtMs, row.updatedAtTs, row.meta?.updatedAtMs, updatedAt),
      0
    ),

    lastLoginAt,

    preferences: {
      ...clonePlain(preferences),
      darkMode,
      privacyMode,
      theme,
      mode: theme,
      appearance: theme,
      lang,
      language: lang,
      locale: lang,
      updatedAt: updatedAt || null,
    },

    settings: {
      ...clonePlain(settings),
      darkMode,
      privacyMode,
      theme,
      mode: theme,
      appearance: theme,
      lang,
      language: lang,
      locale: lang,
      updatedAt: updatedAt || null,
    },

    meta: {
      ...safeObject(row.meta),
      storeResourceId: resourceId,
      storeId: id,
      timestampMs: safeTimestamp(
        first(
          row.meta?.timestampMs,
          row.meta?.updatedAtMs,
          row.updatedAtMs,
          updatedAt,
          row._ts ? safeNumber(row._ts, 0) * 1000 : 0
        ),
        0
      ),
    },
  };
}

export function mergeCuentaStoreItem(base = {}, patch = {}) {
  const current = normalizeCuentaStoreItem(base) || {};
  const incoming = safeObject(patch);

  const mergedPreferences = {
    ...safeObject(current.preferences),
    ...safeObject(incoming.preferences),
  };

  const mergedSettings = {
    ...safeObject(current.settings),
    ...safeObject(incoming.settings),
  };

  const next = {
    ...current,
    ...clonePlain(incoming),

    preferences: mergedPreferences,
    settings: mergedSettings,
  };

  const normalized = normalizeCuentaStoreItem(next);

  return normalized || null;
}

function dedupeCuentaItems(items = []) {
  const map = new Map();
  const anonymous = [];

  safeArray(items).forEach((rawItem) => {
    const item = normalizeCuentaStoreItem(rawItem);

    if (!item) return;

    const id = getCuentaItemId(item);

    if (!id) {
      anonymous.push(item);
      return;
    }

    const key = id.toLowerCase();

    if (!map.has(key)) {
      map.set(key, item);
      return;
    }

    map.set(key, mergeCuentaStoreItem(map.get(key), item));
  });

  return [...map.values(), ...anonymous];
}

export function normalizeCuentaCollection(items = []) {
  return dedupeCuentaItems(safeArray(items));
}

/* =========================================================
   TIMESTAMP HELPERS
========================================================= */

function getUpdatedTimestamp(item = {}) {
  const row = safeObject(item);

  return safeTimestamp(
    first(
      row.updatedAtMs,
      row.updatedAtTs,
      row.meta?.timestampMs,
      row.meta?.updatedAtMs,
      row.updatedAt,
      row.updated_at,
      row.lastUpdate,
      row.modifiedAt,
      row.lastUpdatedAt,
      row.createdAt,
      row._ts ? safeNumber(row._ts, 0) * 1000 : 0,
      0
    ),
    0
  );
}

/* =========================================================
   LOW LEVEL STORE ACCESS
========================================================= */

function readStorePath(path = "") {
  const cleanPath = safeText(path, "");
  if (!cleanPath) return undefined;

  try {
    if (typeof Store?.get === "function") {
      const value = Store.get(cleanPath);
      if (value !== undefined && value !== null) return value;
    }
  } catch {}

  try {
    if (typeof Store?.select === "function") {
      const value = Store.select(cleanPath);
      if (value !== undefined && value !== null) return value;
    }
  } catch {}

  try {
    const state = Store?.state || Store?.getState?.();
    const value = getPath(state, cleanPath);
    if (value !== undefined && value !== null) return value;
  } catch {}

  return undefined;
}

function writeStorePath(path = "", key = "", value = null) {
  const cleanPath = safeText(path, "");
  const cleanKey = safeText(key, "");

  let written = false;

  try {
    if (typeof Store?.set === "function" && cleanPath) {
      Store.set(cleanPath, value);
      written = true;
    }
  } catch {}

  try {
    if (typeof Store?.set === "function" && cleanKey && cleanKey !== cleanPath) {
      Store.set(cleanKey, value);
      written = true;
    }
  } catch {}

  try {
    if (typeof Store?.actions?.set === "function" && cleanPath) {
      Store.actions.set(cleanPath, value);
      written = true;
    }
  } catch {}

  try {
    if (typeof Store?.actions?.set === "function" && cleanKey && cleanKey !== cleanPath) {
      Store.actions.set(cleanKey, value);
      written = true;
    }
  } catch {}

  try {
    if (typeof Store?.actions?.patch === "function" && cleanPath) {
      Store.actions.patch(cleanPath, value);
      written = true;
    }
  } catch {}

  try {
    if (Store?.state && cleanPath) {
      setPath(Store.state, cleanPath, value);
      written = true;
    }
  } catch {}

  return written;
}

function readStoreItem() {
  for (const path of STORE_ALT_PATHS) {
    const value = readStorePath(path);

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const normalized = normalizeCuentaStoreItem(value);
      if (normalized) return normalized;
    }
  }

  if (memoryItem) {
    const normalized = normalizeCuentaStoreItem(memoryItem);
    if (normalized) return normalized;
  }

  const local = readLocalCache();

  if (local?.item) {
    const normalized = normalizeCuentaStoreItem(local.item);
    if (normalized) return normalized;
  }

  return null;
}

function writeStoreItem(item = null) {
  const value = item ? normalizeCuentaStoreItem(item) : null;

  memoryItem = value;

  writeStorePath(STORE_PATH, STORE_KEY, value);

  STORE_ALT_PATHS.forEach((path) => {
    if (path !== STORE_PATH && path !== STORE_KEY) {
      writeStorePath(path, path, value);
    }
  });

  writeLocalCache({
    item: value,
    collection: memoryCollection,
  });

  return value;
}

function readStoreCollection() {
  for (const path of STORE_COLLECTION_ALT_PATHS) {
    const value = readStorePath(path);

    if (Array.isArray(value)) {
      return normalizeCuentaCollection(value);
    }
  }

  if (memoryCollection.length) {
    return normalizeCuentaCollection(memoryCollection);
  }

  const local = readLocalCache();

  if (Array.isArray(local?.collection)) {
    return normalizeCuentaCollection(local.collection);
  }

  return [];
}

function writeStoreCollection(items = []) {
  const list = normalizeCuentaCollection(items);

  memoryCollection = list;

  writeStorePath(STORE_COLLECTION_PATH, STORE_COLLECTION_KEY, list);

  STORE_COLLECTION_ALT_PATHS.forEach((path) => {
    if (path !== STORE_COLLECTION_PATH && path !== STORE_COLLECTION_KEY) {
      writeStorePath(path, path, list);
    }
  });

  writeLocalCache({
    item: memoryItem,
    collection: list,
  });

  return list;
}

/* =========================================================
   COLLECTION HELPERS
========================================================= */

function upsertIntoCollection(collection = [], item = null) {
  const incoming = normalizeCuentaStoreItem(item);
  const current = normalizeCuentaCollection(collection);

  if (!incoming) {
    return current;
  }

  const targetId = getCuentaItemId(incoming);

  if (!targetId) {
    return normalizeCuentaCollection([incoming, ...current]);
  }

  const targetKey = targetId.toLowerCase();

  const index = current.findIndex((row) => {
    const rowId = getCuentaItemId(row);
    return rowId && rowId.toLowerCase() === targetKey;
  });

  if (index === -1) {
    return normalizeCuentaCollection([incoming, ...current]);
  }

  const next = [...current];
  next[index] = mergeCuentaStoreItem(next[index], incoming);

  return normalizeCuentaCollection(next);
}

/* =========================================================
   GETTERS
========================================================= */

export function getCuentaStore() {
  const item = readStoreItem();

  if (item) {
    return item;
  }

  const list = readStoreCollection();

  return sortCuentasByUpdatedDesc(list)[0] || null;
}

export function getCuentaByIdStore(id = DEFAULT_RESOURCE_ID) {
  const target = safeText(id, "");

  if (!target || target === DEFAULT_RESOURCE_ID) {
    return getCuentaStore();
  }

  const item = getCuentaStore();

  if (item && isSameCuentaItemId(item, target)) {
    return item;
  }

  return getCuentasStore().find((row) => isSameCuentaItemId(row, target)) || null;
}

export function getCuentaById(id = DEFAULT_RESOURCE_ID) {
  return getCuentaByIdStore(id);
}

export function hasCuentaStore() {
  return Boolean(getCuentaStore());
}

export function getCuentasStore() {
  const item = readStoreItem();
  const list = readStoreCollection();

  if (item) {
    return normalizeCuentaCollection([item, ...list]);
  }

  return normalizeCuentaCollection(list);
}

export function getSortedCuentasStore() {
  return sortCuentasByUpdatedDesc(getCuentasStore());
}

export function getCuentasCount() {
  return getCuentasStore().length;
}

export function countCuentasStore() {
  return getCuentasCount();
}

export function getCuentaPreferencesStore(id = DEFAULT_RESOURCE_ID) {
  const item = getCuentaByIdStore(id);

  if (!item) return null;

  return {
    darkMode: Boolean(item.darkMode),
    privacyMode: Boolean(item.privacyMode),
    theme: safeText(item.theme, DEFAULT_THEME),
    mode: safeText(item.mode, item.theme || DEFAULT_THEME),
    appearance: safeText(item.appearance, item.theme || DEFAULT_THEME),
    lang: safeText(item.lang, DEFAULT_LANG),
    language: safeText(item.language, item.lang || DEFAULT_LANG),
    locale: safeText(item.locale, item.lang || DEFAULT_LANG),
    preferences: {
      ...safeObject(item.preferences),
    },
  };
}

export function getCuentaStoreSnapshot() {
  const item = getCuentaStore();
  const items = getCuentasStore();

  return {
    hasItem: Boolean(item),
    item,
    items,
    count: items.length,
    sorted: sortCuentasByUpdatedDesc(items),
    memory: {
      hasMemoryItem: Boolean(memoryItem),
      memoryCollectionCount: memoryCollection.length,
    },
    paths: {
      item: STORE_PATH,
      collection: STORE_COLLECTION_PATH,
      key: STORE_KEY,
      collectionKey: STORE_COLLECTION_KEY,
    },
  };
}

/* =========================================================
   SETTERS
========================================================= */

export function setCuentaStore(item = null) {
  const normalized = item ? normalizeCuentaStoreItem(item) : null;

  writeStoreItem(normalized);

  if (normalized) {
    const currentList = readStoreCollection();
    const nextList = upsertIntoCollection(currentList, normalized);
    writeStoreCollection(nextList);
  }

  return normalized;
}

export function replaceCuentaStore(item = null) {
  return setCuentaStore(item);
}

export function clearCuentaStore() {
  memoryItem = null;
  memoryCollection = [];

  writeStoreItem(null);
  writeStoreCollection([]);
  clearLocalCache();

  return null;
}

export function setCuentasStore(items = []) {
  const next = sortCuentasByUpdatedDesc(normalizeCuentaCollection(items));

  writeStoreCollection(next);

  if (next.length > 0) {
    writeStoreItem(next[0]);
  } else {
    writeStoreItem(null);
  }

  return next;
}

export function replaceCuentasStore(items = []) {
  return setCuentasStore(items);
}

export function appendCuentasStore(items = []) {
  const current = getCuentasStore();
  const incoming = normalizeCuentaCollection(items);
  const next = sortCuentasByUpdatedDesc(normalizeCuentaCollection([...incoming, ...current]));

  writeStoreCollection(next);

  if (next[0]) {
    writeStoreItem(next[0]);
  }

  return next;
}

/* =========================================================
   UPDATE / UPSERT
========================================================= */

export function updateCuentaStore(id = DEFAULT_RESOURCE_ID, patch = {}) {
  let target = safeText(id, "");
  let incomingPatch = safeObject(patch);

  if (typeof id === "object" && id !== null && !Array.isArray(id)) {
    incomingPatch = safeObject(id);
    target = getCuentaItemId(incomingPatch);
  }

  if (!target) {
    target = getCuentaItemId(incomingPatch) || DEFAULT_RESOURCE_ID;
  }

  const currentItem =
    getCuentaByIdStore(target) ||
    getCuentaStore() ||
    normalizeCuentaStoreItem({
      resourceId: target,
      id: target,
    });

  const nextItem = mergeCuentaStoreItem(currentItem, incomingPatch);

  writeStoreItem(nextItem);

  const nextList = upsertIntoCollection(readStoreCollection(), nextItem);
  writeStoreCollection(nextList);

  return nextItem;
}

export function patchCuentaStore(patch = {}) {
  const current = getCuentaStore();

  if (!current) {
    return updateCuentaStore(DEFAULT_RESOURCE_ID, patch);
  }

  return updateCuentaStore(getCuentaItemId(current), patch);
}

export function upsertCuentaStore(item = null) {
  const incoming = normalizeCuentaStoreItem(item);

  if (!incoming) {
    return getCuentaStore();
  }

  const targetId = getCuentaItemId(incoming);

  const current = targetId
    ? getCuentaByIdStore(targetId)
    : getCuentaStore();

  const nextItem = current
    ? mergeCuentaStoreItem(current, incoming)
    : incoming;

  writeStoreItem(nextItem);

  const nextList = upsertIntoCollection(readStoreCollection(), nextItem);
  writeStoreCollection(nextList);

  return nextItem;
}

export function upsertCuentasStore(items = []) {
  let list = getCuentasStore();

  safeArray(items).forEach((item) => {
    const normalized = normalizeCuentaStoreItem(item);
    if (!normalized) return;

    list = upsertIntoCollection(list, normalized);
  });

  list = sortCuentasByUpdatedDesc(list);

  writeStoreCollection(list);

  if (list[0]) {
    writeStoreItem(list[0]);
  }

  return list;
}

export function setCuentaPreferencesStore(id = DEFAULT_RESOURCE_ID, preferences = {}) {
  const target = safeText(id, DEFAULT_RESOURCE_ID);
  const prefs = safeObject(preferences);

  const darkMode = safeBoolean(
    first(
      prefs.darkMode,
      prefs.theme === "dark" ? true : null,
      prefs.theme === "light" ? false : null,
      false
    ),
    false
  );

  const theme = normalizeTheme(first(prefs.theme, darkMode ? "dark" : "light"), darkMode);
  const lang = normalizeLang(first(prefs.lang, prefs.language, prefs.locale, DEFAULT_LANG));

  return updateCuentaStore(target, {
    ...prefs,
    darkMode,
    privacyMode: safeBoolean(prefs.privacyMode, false),
    theme,
    mode: theme,
    appearance: theme,
    lang,
    language: lang,
    locale: lang,
    preferences: {
      ...prefs,
      darkMode,
      privacyMode: safeBoolean(prefs.privacyMode, false),
      theme,
      mode: theme,
      appearance: theme,
      lang,
      language: lang,
      locale: lang,
      updatedAt: first(prefs.updatedAt, new Date().toISOString()),
    },
  });
}

/* =========================================================
   REMOVE
========================================================= */

export function removeCuentaStore(id = DEFAULT_RESOURCE_ID) {
  const target = safeText(id, "");

  if (!target) {
    return getCuentaStore();
  }

  const currentItem = getCuentaStore();

  if (currentItem && isSameCuentaItemId(currentItem, target)) {
    writeStoreItem(null);
  }

  const nextList = getCuentasStore().filter(
    (item) => !isSameCuentaItemId(item, target)
  );

  writeStoreCollection(nextList);

  const fallback = sortCuentasByUpdatedDesc(nextList)[0] || null;
  writeStoreItem(fallback);

  return fallback;
}

export function removeCuentaByIdStore(id = DEFAULT_RESOURCE_ID) {
  return removeCuentaStore(id);
}

/* =========================================================
   SORT / FILTER
========================================================= */

export function sortCuentasByUpdatedDesc(items = []) {
  return [...safeArray(items)]
    .map(normalizeCuentaStoreItem)
    .filter(Boolean)
    .sort((a, b) => {
      const aTime = getUpdatedTimestamp(a);
      const bTime = getUpdatedTimestamp(b);

      if (aTime !== bTime) {
        return bTime - aTime;
      }

      return safeText(a.displayName || a.name || a.email, "").localeCompare(
        safeText(b.displayName || b.name || b.email, ""),
        "es",
        { numeric: true }
      );
    });
}

export function sortCuentasBySecurityDesc(items = []) {
  const weight = {
    hardened: 5,
    secure: 4,
    privacy: 3,
    active: 2,
    standard: 1,
    inactive: 0,
  };

  return [...safeArray(items)]
    .map(normalizeCuentaStoreItem)
    .filter(Boolean)
    .sort((a, b) => {
      const aStatus = normalizeKey(first(a.securityStatus, a.status, "standard"));
      const bStatus = normalizeKey(first(b.securityStatus, b.status, "standard"));

      return (weight[bStatus] || 0) - (weight[aStatus] || 0);
    });
}

export function filterCuentasStore(predicate = null) {
  const list = getCuentasStore();

  if (typeof predicate !== "function") {
    return list;
  }

  return list.filter((item, index) => {
    try {
      return Boolean(predicate(item, index));
    } catch {
      return false;
    }
  });
}

export function searchCuentasStore(query = "") {
  const q = normalizeText(query);

  if (!q) {
    return getCuentasStore();
  }

  return getCuentasStore().filter((item) => {
    const haystack = normalizeText(
      [
        item.id,
        item.resourceId,
        item.userId,
        item.accountId,
        item.profileId,
        item.email,
        item.username,
        item.name,
        item.displayName,
        item.role,
        item.status,
        item.lang,
        item.theme,
      ]
        .filter(Boolean)
        .join(" ")
    );

    return haystack.includes(q);
  });
}

/* =========================================================
   BOOTSTRAP / HYDRATION
========================================================= */

export function hydrateCuentaStoreFromCache() {
  const local = readLocalCache();

  if (!local) {
    return null;
  }

  const item = normalizeCuentaStoreItem(local.item);
  const collection = normalizeCuentaCollection(local.collection);

  if (item) {
    memoryItem = item;
    writeStoreItem(item);
  }

  if (collection.length) {
    memoryCollection = collection;
    writeStoreCollection(collection);
  }

  return {
    item,
    collection,
  };
}

export function primeCuentaStore({
  item = null,
  items = [],
} = {}) {
  const normalizedItem = normalizeCuentaStoreItem(item);
  const normalizedItems = normalizeCuentaCollection(items);

  if (normalizedItems.length) {
    writeStoreCollection(normalizedItems);
  }

  if (normalizedItem) {
    writeStoreItem(normalizedItem);

    const list = upsertIntoCollection(readStoreCollection(), normalizedItem);
    writeStoreCollection(list);

    return normalizedItem;
  }

  if (normalizedItems[0]) {
    writeStoreItem(normalizedItems[0]);
    return normalizedItems[0];
  }

  return getCuentaStore();
}

/* =========================================================
   LEGACY ALIASES
========================================================= */

export const getCuenta = getCuentaStore;
export const getCuentaItem = getCuentaStore;
export const getCuentaCurrentStore = getCuentaStore;

export const setCuenta = setCuentaStore;
export const replaceCuenta = replaceCuentaStore;
export const updateCuenta = updateCuentaStore;
export const upsertCuenta = upsertCuentaStore;
export const removeCuenta = removeCuentaStore;

export const getAccountsStore = getCuentasStore;
export const setAccountsStore = setCuentasStore;
export const replaceAccountsStore = replaceCuentasStore;

export const clearCuentaItemsStore = () => {
  writeStoreCollection([]);
  return [];
};

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  STORE_PATH,
  STORE_COLLECTION_PATH,
  STORE_KEY,
  STORE_COLLECTION_KEY,
  STORE_ALT_PATHS,
  STORE_COLLECTION_ALT_PATHS,

  DEFAULT_RESOURCE_ID,
  DEFAULT_LANG,
  DEFAULT_THEME,
  DEFAULT_ROLE,
  DEFAULT_STATUS,

  getCuentaItemId,
  getCuentaIdentityKeys,

  normalizeCuentaStoreItem,
  normalizeCuentaCollection,
  mergeCuentaStoreItem,

  getCuentaStore,
  getCuentaByIdStore,
  getCuentaById,
  hasCuentaStore,

  getCuentasStore,
  getSortedCuentasStore,
  getCuentasCount,
  countCuentasStore,

  getCuentaPreferencesStore,
  getCuentaStoreSnapshot,

  setCuentaStore,
  replaceCuentaStore,
  clearCuentaStore,

  setCuentasStore,
  replaceCuentasStore,
  appendCuentasStore,

  updateCuentaStore,
  patchCuentaStore,
  upsertCuentaStore,
  upsertCuentasStore,
  setCuentaPreferencesStore,

  removeCuentaStore,
  removeCuentaByIdStore,

  sortCuentasByUpdatedDesc,
  sortCuentasBySecurityDesc,
  filterCuentasStore,
  searchCuentasStore,

  hydrateCuentaStoreFromCache,
  primeCuentaStore,

  getCuenta,
  getCuentaItem,
  getCuentaCurrentStore,

  setCuenta,
  replaceCuenta,
  updateCuenta,
  upsertCuenta,
  removeCuenta,

  getAccountsStore,
  setAccountsStore,
  replaceAccountsStore,

  clearCuentaItemsStore,
};
