/* =========================================================
   Onion SPA - Cuenta State
   Archivo: src/views/cuenta/cuenta.state.js

   EXTREME PRO SYSTEM · STATE LAYER · FULL PATCH 12/10
   SINGLE RESOURCE MODE · ACCOUNT PREFS · RACE SAFE

   RESPONSABILIDADES:
   - estado local centralizado del módulo cuenta
   - single resource real para /api/user/preferences
   - loading / refreshing / saving / loaded / hydrated
   - errores globales y errores de formulario
   - cache temporal
   - request tokens anti-race
   - inflight load/save/update/theme/language/password
   - draft de preferencias
   - form state compatible con cuentaView.js
   - compatibilidad View / API / Bindings / Modal / Index
   - preservar theme/lang/darkMode/privacyMode
   - snapshot debug estable

   HARDENING EXTREME:
   - setters robustos
   - no loading infinito
   - estado preparado para edición inline
   - estado preparado para preferencias parciales
   - acepta timestamps number / string / ISO
   - normaliza lang/theme/boolean
   - expone aliases legacy
   - default export estable
========================================================= */

export const CACHE_KEY = "cuenta.cache";
export const CACHE_TTL = 1000 * 60 * 3;
export const DEFAULT_PAGE_SIZE = 1;

export const DEFAULT_LANG = "es";
export const DEFAULT_THEME = "light";
export const DEFAULT_ROLE = "user";
export const DEFAULT_STATUS = "active";

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
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

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
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

function nowIso() {
  return new Date().toISOString();
}

function toTimestampMs(value = null) {
  if (!value) return 0;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }

  const raw = safeText(value, "");
  if (!raw) return 0;

  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
  const ms = date.getTime();

  return Number.isFinite(ms) ? ms : 0;
}

function normalizeSyncValue(value = null) {
  const direct = first(value, nowIso());

  if (typeof direct === "number" && Number.isFinite(direct)) {
    return direct;
  }

  const text = safeText(direct, "");

  if (!text) return nowIso();

  return text;
}

function getSyncMs(value = null) {
  return toTimestampMs(value);
}

/* =========================================================
   DEFAULTS
========================================================= */

export function createDefaultCuentaDraft() {
  return {
    darkMode: false,
    privacyMode: false,
    lang: DEFAULT_LANG,
    language: DEFAULT_LANG,
    locale: DEFAULT_LANG,
    theme: DEFAULT_THEME,
    mode: DEFAULT_THEME,
    appearance: DEFAULT_THEME,
  };
}

export function createDefaultCuentaViewState() {
  return {
    form: createDefaultCuentaDraft(),

    errors: {},
    dirty: false,
    touched: {},

    submitting: false,
    serverError: "",
    successMessage: "",

    updatedAt: "",
    updatedAtMs: 0,

    activeSection: "preferences",
    lastAction: "",
  };
}

export function createInitialCuentaState() {
  return {
    hydrated: false,
    loading: false,
    refreshing: false,
    loaded: false,
    saving: false,

    error: "",

    item: null,
    items: [],

    lastSyncAt: 0,
    lastSyncAtMs: 0,

    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    remoteCount: 0,

    requestId: 0,
    loadToken: 0,
    mutationToken: 0,

    draft: createDefaultCuentaDraft(),
    view: createDefaultCuentaViewState(),

    meta: null,

    action: {
      savingPreferences: false,
      savingTheme: false,
      savingLanguage: false,
      changingPassword: false,
      openingModal: false,
    },

    debug: {
      source: "cuenta.state",
      version: "12.0.0",
      createdAt: nowIso(),
      lastMutationAt: "",
    },
  };
}

/* =========================================================
   STATE
========================================================= */

export const cuentaState = createInitialCuentaState();

let inflightLoad = null;
let inflightSave = null;
let inflightUpdate = null;
let inflightTheme = null;
let inflightLanguage = null;
let inflightPassword = null;

/* =========================================================
   INTERNAL MUTATION HELPERS
========================================================= */

function markMutation() {
  cuentaState.debug = {
    ...safeObject(cuentaState.debug),
    lastMutationAt: nowIso(),
  };

  return cuentaState;
}

function touchRequestId() {
  cuentaState.requestId += 1;
  markMutation();

  return cuentaState.requestId;
}

function touchLoadToken() {
  cuentaState.loadToken += 1;
  cuentaState.requestId += 1;
  markMutation();

  return cuentaState.loadToken;
}

function touchMutationToken() {
  cuentaState.mutationToken += 1;
  cuentaState.requestId += 1;
  markMutation();

  return cuentaState.mutationToken;
}

function normalizeCuentaDraft(value = {}) {
  const draft = safeObject(value);
  const base = createDefaultCuentaDraft();

  const rawTheme = first(
    draft.theme,
    draft.mode,
    draft.appearance,
    base.theme
  );

  const darkMode = safeBoolean(
    first(
      draft.darkMode,
      rawTheme === "dark" ? true : null,
      rawTheme === "light" ? false : null,
      base.darkMode
    ),
    base.darkMode
  );

  const theme = normalizeTheme(rawTheme, darkMode);
  const lang = normalizeLang(
    first(
      draft.lang,
      draft.language,
      draft.locale,
      base.lang
    )
  );

  return {
    ...base,
    ...draft,

    darkMode,
    privacyMode: safeBoolean(draft.privacyMode, base.privacyMode),

    lang,
    language: lang,
    locale: lang,

    theme,
    mode: theme,
    appearance: theme,
  };
}

function normalizeCuentaViewState(value = {}) {
  const state = safeObject(value);
  const base = createDefaultCuentaViewState();

  const updatedAt = safeText(
    first(state.updatedAt, base.updatedAt),
    base.updatedAt
  );

  return {
    ...base,
    ...state,

    form: normalizeCuentaDraft(firstDefined(state.form, base.form)),

    errors: safeObject(state.errors),
    touched: safeObject(state.touched),

    dirty: safeBoolean(state.dirty, base.dirty),
    submitting: safeBoolean(state.submitting, base.submitting),

    serverError: safeText(state.serverError, base.serverError),
    successMessage: safeText(state.successMessage, base.successMessage),

    updatedAt,
    updatedAtMs: safeNumber(
      first(state.updatedAtMs, getSyncMs(updatedAt)),
      0
    ),

    activeSection: safeText(state.activeSection, base.activeSection),
    lastAction: safeText(state.lastAction, base.lastAction),
  };
}

function normalizeCuentaItem(value = null) {
  if (!value) return null;

  const item = safeObject(value);

  if (!hasOwnKeys(item)) return null;

  const rawTheme = first(
    item.theme,
    item.mode,
    item.appearance,
    item.preferences?.theme,
    item.settings?.theme,
    ""
  );

  const darkMode = safeBoolean(
    first(
      item.darkMode,
      item.isDark,
      item.preferences?.darkMode,
      item.settings?.darkMode,
      rawTheme === "dark" ? true : null,
      rawTheme === "light" ? false : null,
      false
    ),
    false
  );

  const theme = normalizeTheme(rawTheme, darkMode);

  const lang = normalizeLang(
    first(
      item.lang,
      item.language,
      item.locale,
      item.idioma,
      item.preferences?.lang,
      item.preferences?.language,
      item.settings?.lang,
      DEFAULT_LANG
    )
  );

  const userId = safeText(
    first(
      item.userId,
      item.id,
      item.uid,
      item.sub,
      item.user_id,
      item.raw?.userId,
      item.raw?.id,
      ""
    ),
    ""
  );

  const email = safeText(
    first(
      item.email,
      item.emailLower,
      item.mail,
      item.raw?.email,
      item.raw?.emailLower,
      ""
    ),
    ""
  ).toLowerCase();

  const username = safeText(
    first(
      item.username,
      item.usernameLower,
      item.userName,
      item.raw?.username,
      item.raw?.usernameLower,
      ""
    ),
    ""
  );

  const name = safeText(
    first(
      item.name,
      item.nombre,
      item.fullName,
      item.displayName,
      item.raw?.name,
      item.raw?.nombre,
      item.raw?.fullName,
      item.raw?.displayName,
      username,
      email,
      "Usuario Onion"
    ),
    "Usuario Onion"
  );

  const updatedAt = first(
    item.updatedAt,
    item.updated_at,
    item.modifiedAt,
    item.lastUpdatedAt,
    item.preferences?.updatedAt,
    item.settings?.updatedAt,
    item.raw?.updatedAt,
    ""
  );

  const createdAt = first(
    item.createdAt,
    item.created_at,
    item.raw?.createdAt,
    null
  );

  const lastLoginAt = first(
    item.lastLoginAt,
    item.lastLogin,
    item.ultimoLogin,
    item.lastAccessAt,
    item.raw?.lastLoginAt,
    null
  );

  return {
    ...item,

    id: safeText(first(item.id, userId), userId),
    userId,
    uid: safeText(first(item.uid, userId), userId),
    sub: safeText(first(item.sub, userId), userId),

    email,
    emailLower: safeText(first(item.emailLower, email), email),

    username,
    usernameLower: safeText(first(item.usernameLower, username), username).toLowerCase(),

    name,
    nombre: safeText(first(item.nombre, name), name),
    fullName: safeText(first(item.fullName, name), name),
    displayName: safeText(first(item.displayName, name, username, email), name),

    phone: safeText(first(item.phone, item.telefono, item.mobile, ""), ""),
    telefono: safeText(first(item.telefono, item.phone, item.mobile, ""), ""),

    avatar: first(item.avatar, item.avatarUrl, item.photoURL, item.photoUrl, null),
    avatarUrl: first(item.avatarUrl, item.avatar, item.photoURL, item.photoUrl, null),

    role: normalizeRole(first(item.role, item.rol, DEFAULT_ROLE)),
    rol: normalizeRole(first(item.rol, item.role, DEFAULT_ROLE)),

    status: normalizeStatus(first(item.status, item.estado, DEFAULT_STATUS)),
    estado: normalizeStatus(first(item.estado, item.status, DEFAULT_STATUS)),

    active: safeBoolean(first(item.active, item.enabled, true), true),

    darkMode,
    privacyMode: safeBoolean(
      first(
        item.privacyMode,
        item.privateMode,
        item.preferences?.privacyMode,
        item.settings?.privacyMode,
        false
      ),
      false
    ),

    theme,
    mode: theme,
    appearance: theme,

    lang,
    language: lang,
    locale: lang,

    createdAt,
    updatedAt: updatedAt || null,
    updated_at: updatedAt || null,
    lastLoginAt,

    preferences: {
      ...safeObject(item.preferences),
      darkMode,
      privacyMode: safeBoolean(
        first(
          item.privacyMode,
          item.privateMode,
          item.preferences?.privacyMode,
          item.settings?.privacyMode,
          false
        ),
        false
      ),
      theme,
      mode: theme,
      appearance: theme,
      lang,
      language: lang,
      locale: lang,
      updatedAt: updatedAt || null,
    },

    settings: {
      ...safeObject(item.settings),
      darkMode,
      privacyMode: safeBoolean(
        first(
          item.privacyMode,
          item.privateMode,
          item.preferences?.privacyMode,
          item.settings?.privacyMode,
          false
        ),
        false
      ),
      theme,
      mode: theme,
      appearance: theme,
      lang,
      language: lang,
      locale: lang,
      updatedAt: updatedAt || null,
    },
  };
}

function getCurrentItemUnsafe() {
  return normalizeCuentaItem(cuentaState.item);
}

function buildDraftFromItem(item = null) {
  const detail = normalizeCuentaItem(item);

  if (!detail) {
    return createDefaultCuentaDraft();
  }

  return normalizeCuentaDraft({
    darkMode: detail.darkMode,
    privacyMode: detail.privacyMode,
    lang: detail.lang,
    language: detail.language,
    locale: detail.locale,
    theme: detail.theme,
    mode: detail.mode,
    appearance: detail.appearance,
  });
}

function syncDraftAndViewFromItem(item = null) {
  const detail = normalizeCuentaItem(item);

  if (!detail) {
    cuentaState.draft = createDefaultCuentaDraft();

    cuentaState.view = normalizeCuentaViewState({
      ...cuentaState.view,
      form: cuentaState.draft,
      updatedAt: "",
      updatedAtMs: 0,
    });

    return cuentaState.draft;
  }

  const draft = buildDraftFromItem(detail);
  const updatedAt = safeText(detail.updatedAt, "");

  cuentaState.draft = draft;

  cuentaState.view = normalizeCuentaViewState({
    ...cuentaState.view,
    form: draft,
    updatedAt,
    updatedAtMs: getSyncMs(updatedAt),
  });

  return cuentaState.draft;
}

/* =========================================================
   INFLIGHT
========================================================= */

export function getInflightLoad() {
  return inflightLoad;
}

export function setInflightLoad(value) {
  inflightLoad = value || null;
  return inflightLoad;
}

export function clearInflightLoad() {
  inflightLoad = null;
  return inflightLoad;
}

export function getInflightSave() {
  return inflightSave;
}

export function setInflightSave(value) {
  inflightSave = value || null;
  return inflightSave;
}

export function clearInflightSave() {
  inflightSave = null;
  return inflightSave;
}

export function getInflightUpdate() {
  return inflightUpdate;
}

export function setInflightUpdate(value) {
  inflightUpdate = value || null;
  return inflightUpdate;
}

export function clearInflightUpdate() {
  inflightUpdate = null;
  return inflightUpdate;
}

export function getInflightTheme() {
  return inflightTheme;
}

export function setInflightTheme(value) {
  inflightTheme = value || null;
  return inflightTheme;
}

export function clearInflightTheme() {
  inflightTheme = null;
  return inflightTheme;
}

export function getInflightLanguage() {
  return inflightLanguage;
}

export function setInflightLanguage(value) {
  inflightLanguage = value || null;
  return inflightLanguage;
}

export function clearInflightLanguage() {
  inflightLanguage = null;
  return inflightLanguage;
}

export function getInflightPassword() {
  return inflightPassword;
}

export function setInflightPassword(value) {
  inflightPassword = value || null;
  return inflightPassword;
}

export function clearInflightPassword() {
  inflightPassword = null;
  return inflightPassword;
}

export function clearAllInflight() {
  inflightLoad = null;
  inflightSave = null;
  inflightUpdate = null;
  inflightTheme = null;
  inflightLanguage = null;
  inflightPassword = null;

  return true;
}

/* =========================================================
   RESET
========================================================= */

export function resetCuentaState() {
  const next = createInitialCuentaState();

  Object.keys(cuentaState).forEach((key) => {
    delete cuentaState[key];
  });

  Object.assign(cuentaState, next);

  clearAllInflight();

  return cuentaState;
}

export function resetCuentaViewState() {
  cuentaState.view = createDefaultCuentaViewState();
  markMutation();

  return cuentaState.view;
}

export function resetCuentaInflightState() {
  clearAllInflight();
  markMutation();

  return true;
}

export function resetCuentaActionState() {
  cuentaState.action = {
    savingPreferences: false,
    savingTheme: false,
    savingLanguage: false,
    changingPassword: false,
    openingModal: false,
  };

  markMutation();

  return cuentaState.action;
}

/* =========================================================
   FLAGS
========================================================= */

export function setLoading(value) {
  cuentaState.loading = Boolean(value);

  if (cuentaState.loading) {
    touchLoadToken();
  } else {
    markMutation();
  }

  return cuentaState.loading;
}

export function setRefreshing(value) {
  cuentaState.refreshing = Boolean(value);

  if (cuentaState.refreshing) {
    touchRequestId();
  } else {
    markMutation();
  }

  return cuentaState.refreshing;
}

export function setLoaded(value) {
  cuentaState.loaded = Boolean(value);
  markMutation();

  return cuentaState.loaded;
}

export function setHydrated(value) {
  cuentaState.hydrated = Boolean(value);
  markMutation();

  return cuentaState.hydrated;
}

export function setSaving(value) {
  cuentaState.saving = Boolean(value);

  if (cuentaState.saving) {
    touchMutationToken();
  } else {
    markMutation();
  }

  return cuentaState.saving;
}

export function isCuentaHydrated() {
  return Boolean(cuentaState.hydrated);
}

export function isCuentaLoading() {
  return Boolean(cuentaState.loading);
}

export function isCuentaRefreshing() {
  return Boolean(cuentaState.refreshing);
}

export function isCuentaLoaded() {
  return Boolean(cuentaState.loaded);
}

export function isCuentaSaving() {
  return Boolean(cuentaState.saving);
}

/* =========================================================
   ACTION FLAGS
========================================================= */

export function patchActionState(patch = {}) {
  cuentaState.action = {
    ...safeObject(cuentaState.action),
    ...safeObject(patch),
  };

  markMutation();

  return cuentaState.action;
}

export function setSavingPreferences(value) {
  return patchActionState({
    savingPreferences: Boolean(value),
  });
}

export function setSavingTheme(value) {
  return patchActionState({
    savingTheme: Boolean(value),
  });
}

export function setSavingLanguage(value) {
  return patchActionState({
    savingLanguage: Boolean(value),
  });
}

export function setChangingPassword(value) {
  return patchActionState({
    changingPassword: Boolean(value),
  });
}

export function setOpeningModal(value) {
  return patchActionState({
    openingModal: Boolean(value),
  });
}

/* =========================================================
   PAGINATION / COLLECTION COMPAT
========================================================= */

export function setPage(value = 1) {
  cuentaState.page = Math.max(1, safeNumber(value, 1));
  markMutation();

  return cuentaState.page;
}

export function setPageSize(value = DEFAULT_PAGE_SIZE) {
  cuentaState.pageSize = Math.max(1, safeNumber(value, DEFAULT_PAGE_SIZE));
  markMutation();

  return cuentaState.pageSize;
}

export function getPage() {
  return cuentaState.page;
}

export function getPageSize() {
  return cuentaState.pageSize;
}

export function setRemoteCount(value = 0) {
  cuentaState.remoteCount = Math.max(0, safeNumber(value, 0));
  markMutation();

  return cuentaState.remoteCount;
}

export function getRemoteCount() {
  return safeNumber(cuentaState.remoteCount, 0);
}

export function setItems(items = []) {
  const list = safeArray(items)
    .map(normalizeCuentaItem)
    .filter(Boolean);

  cuentaState.items = list;
  cuentaState.remoteCount = list.length;
  cuentaState.loaded = true;
  cuentaState.error = "";

  if (!cuentaState.item && list[0]) {
    setItem(list[0]);
  }

  markMutation();

  return cuentaState.items;
}

export function getItems() {
  return safeArray(cuentaState.items)
    .map(normalizeCuentaItem)
    .filter(Boolean);
}

export function clearItems() {
  cuentaState.items = [];
  cuentaState.remoteCount = 0;
  markMutation();

  return cuentaState.items;
}

/* =========================================================
   DATA
========================================================= */

export function setItem(item = null) {
  const normalized = normalizeCuentaItem(item);

  cuentaState.item = normalized;
  cuentaState.loaded = true;
  cuentaState.hydrated = true;
  cuentaState.error = "";

  cuentaState.items = normalized ? [normalized] : [];

  cuentaState.remoteCount = normalized ? 1 : 0;

  if (normalized) {
    syncDraftAndViewFromItem(normalized);
  }

  markMutation();

  return cuentaState.item;
}

export function getItem() {
  return getCurrentItemUnsafe();
}

export function getCuentaItem() {
  return getItem();
}

export function hasItem() {
  return Boolean(getItem());
}

export function clearItem() {
  cuentaState.item = null;
  cuentaState.items = [];
  cuentaState.page = 1;
  cuentaState.remoteCount = 0;

  syncDraftAndViewFromItem(null);
  markMutation();

  return cuentaState.item;
}

export function patchItem(patch = {}) {
  const current = safeObject(getItem());
  const next = normalizeCuentaItem({
    ...current,
    ...safeObject(patch),
  });

  return setItem(next);
}

export function getCuentaByIdState(id = "") {
  const target = safeText(id, "");

  if (!target) return null;

  const direct = getItem();

  if (
    direct &&
    [
      direct.id,
      direct.userId,
      direct.uid,
      direct.sub,
      direct.email,
      direct.username,
    ]
      .map((value) => safeText(value, ""))
      .filter(Boolean)
      .includes(target)
  ) {
    return direct;
  }

  return (
    getItems().find((item) =>
      [
        item.id,
        item.userId,
        item.uid,
        item.sub,
        item.email,
        item.username,
      ]
        .map((value) => safeText(value, ""))
        .filter(Boolean)
        .includes(target)
    ) || null
  );
}

/* =========================================================
   META
========================================================= */

export function setMeta(value = null) {
  cuentaState.meta = value ? safeObject(value) : null;
  markMutation();

  return cuentaState.meta;
}

export function getMeta() {
  return cuentaState.meta ? { ...safeObject(cuentaState.meta) } : null;
}

export function clearMeta() {
  cuentaState.meta = null;
  markMutation();

  return cuentaState.meta;
}

/* =========================================================
   ERROR / SYNC
========================================================= */

export function setError(value = null) {
  cuentaState.error = value ? String(value).trim() : "";
  markMutation();

  return cuentaState.error;
}

export function getError() {
  return safeText(cuentaState.error, "");
}

export function clearError() {
  cuentaState.error = "";
  markMutation();

  return cuentaState.error;
}

export function setLastSyncAt(value = null) {
  const normalized = normalizeSyncValue(value);

  cuentaState.lastSyncAt = normalized;
  cuentaState.lastSyncAtMs = getSyncMs(normalized);

  markMutation();

  return cuentaState.lastSyncAt;
}

export function getLastSyncAt() {
  return cuentaState.lastSyncAt;
}

export function getLastSyncAtMs() {
  return safeNumber(
    first(cuentaState.lastSyncAtMs, getSyncMs(cuentaState.lastSyncAt)),
    0
  );
}

/* =========================================================
   DRAFT
========================================================= */

export function setDraft(value = {}) {
  cuentaState.draft = normalizeCuentaDraft(value);
  markMutation();

  return cuentaState.draft;
}

export function patchDraft(patch = {}) {
  cuentaState.draft = normalizeCuentaDraft({
    ...safeObject(cuentaState.draft),
    ...safeObject(patch),
  });

  markMutation();

  return cuentaState.draft;
}

export function getDraft() {
  return normalizeCuentaDraft(cuentaState.draft);
}

export function clearDraft() {
  cuentaState.draft = createDefaultCuentaDraft();
  markMutation();

  return cuentaState.draft;
}

export function syncDraftFromItem() {
  const item = getItem();

  cuentaState.draft = buildDraftFromItem(item);

  markMutation();

  return cuentaState.draft;
}

/* =========================================================
   VIEW STATE
========================================================= */

export function setViewState(value = {}) {
  cuentaState.view = normalizeCuentaViewState(value);
  markMutation();

  return cuentaState.view;
}

export function patchViewState(patch = {}) {
  const current = normalizeCuentaViewState(cuentaState.view);
  const nextPatch = safeObject(patch);

  cuentaState.view = normalizeCuentaViewState({
    ...current,
    ...nextPatch,
    form:
      nextPatch.form !== undefined
        ? nextPatch.form
        : current.form,
    errors:
      nextPatch.errors !== undefined
        ? nextPatch.errors
        : current.errors,
    touched:
      nextPatch.touched !== undefined
        ? nextPatch.touched
        : current.touched,
  });

  markMutation();

  return cuentaState.view;
}

export function getViewState() {
  return normalizeCuentaViewState(cuentaState.view);
}

export function setViewForm(form = {}) {
  const current = normalizeCuentaViewState(cuentaState.view);
  const nextForm = normalizeCuentaDraft(form);

  cuentaState.view = {
    ...current,
    form: nextForm,
    dirty: true,
  };

  cuentaState.draft = nextForm;

  markMutation();

  return cuentaState.view.form;
}

export function patchViewForm(patch = {}) {
  const current = normalizeCuentaViewState(cuentaState.view);
  const nextForm = normalizeCuentaDraft({
    ...current.form,
    ...safeObject(patch),
  });

  cuentaState.view = {
    ...current,
    form: nextForm,
    dirty: true,
  };

  cuentaState.draft = nextForm;

  markMutation();

  return cuentaState.view.form;
}

export function getViewForm() {
  return normalizeCuentaDraft(cuentaState.view?.form);
}

export function setViewErrors(errors = {}) {
  const current = normalizeCuentaViewState(cuentaState.view);

  cuentaState.view = {
    ...current,
    errors: safeObject(errors),
  };

  markMutation();

  return cuentaState.view.errors;
}

export function patchViewErrors(patch = {}) {
  const current = normalizeCuentaViewState(cuentaState.view);

  cuentaState.view = {
    ...current,
    errors: {
      ...safeObject(current.errors),
      ...safeObject(patch),
    },
  };

  markMutation();

  return cuentaState.view.errors;
}

export function getViewErrors() {
  return safeObject(cuentaState.view?.errors);
}

export function clearViewErrors() {
  return setViewErrors({});
}

export function setViewTouched(touched = {}) {
  const current = normalizeCuentaViewState(cuentaState.view);

  cuentaState.view = {
    ...current,
    touched: safeObject(touched),
  };

  markMutation();

  return cuentaState.view.touched;
}

export function patchViewTouched(patch = {}) {
  const current = normalizeCuentaViewState(cuentaState.view);

  cuentaState.view = {
    ...current,
    touched: {
      ...safeObject(current.touched),
      ...safeObject(patch),
    },
  };

  markMutation();

  return cuentaState.view.touched;
}

export function setViewDirty(value = true) {
  const current = normalizeCuentaViewState(cuentaState.view);

  cuentaState.view = {
    ...current,
    dirty: Boolean(value),
  };

  markMutation();

  return cuentaState.view.dirty;
}

export function setViewSubmitting(value = false) {
  const current = normalizeCuentaViewState(cuentaState.view);

  cuentaState.view = {
    ...current,
    submitting: Boolean(value),
  };

  markMutation();

  return cuentaState.view.submitting;
}

export function setViewServerError(value = "") {
  const current = normalizeCuentaViewState(cuentaState.view);

  cuentaState.view = {
    ...current,
    serverError: safeText(value, ""),
  };

  markMutation();

  return cuentaState.view.serverError;
}

export function getViewServerError() {
  return safeText(cuentaState.view?.serverError, "");
}

export function clearViewServerError() {
  return setViewServerError("");
}

export function setViewSuccess({
  successMessage = "",
  updatedAt = "",
} = {}) {
  const current = normalizeCuentaViewState(cuentaState.view);
  const finalUpdatedAt = safeText(updatedAt, current.updatedAt || nowIso());

  cuentaState.view = {
    ...current,
    successMessage: safeText(successMessage, ""),
    updatedAt: finalUpdatedAt,
    updatedAtMs: getSyncMs(finalUpdatedAt),
  };

  markMutation();

  return cuentaState.view;
}

export function getViewSuccessMessage() {
  return safeText(cuentaState.view?.successMessage, "");
}

export function clearViewSuccess() {
  const current = normalizeCuentaViewState(cuentaState.view);

  cuentaState.view = {
    ...current,
    successMessage: "",
  };

  markMutation();

  return cuentaState.view;
}

export function setViewActiveSection(value = "preferences") {
  const current = normalizeCuentaViewState(cuentaState.view);

  cuentaState.view = {
    ...current,
    activeSection: safeText(value, "preferences"),
  };

  markMutation();

  return cuentaState.view.activeSection;
}

export function setViewLastAction(value = "") {
  const current = normalizeCuentaViewState(cuentaState.view);

  cuentaState.view = {
    ...current,
    lastAction: safeText(value, ""),
  };

  markMutation();

  return cuentaState.view.lastAction;
}

export function resetViewState() {
  cuentaState.view = createDefaultCuentaViewState();
  markMutation();

  return cuentaState.view;
}

export function syncViewFormFromItem() {
  const item = getItem();

  syncDraftAndViewFromItem(item);
  markMutation();

  return cuentaState.view.form;
}

/* =========================================================
   CACHE HELPERS
========================================================= */

export function getCachePayload() {
  return {
    savedAt: Date.now(),
    item: getItem(),
    items: getItems(),
    lastSyncAt: cuentaState.lastSyncAt,
    lastSyncAtMs: getLastSyncAtMs(),
    page: cuentaState.page,
    pageSize: cuentaState.pageSize,
    remoteCount: cuentaState.remoteCount,
    meta: cuentaState.meta ? { ...safeObject(cuentaState.meta) } : null,
  };
}

export function isCacheFresh(savedAt = 0) {
  const ts = safeNumber(savedAt, 0);

  if (!ts) return false;

  return Date.now() - ts < CACHE_TTL;
}

export function hydrateCuentaStateFromCachePayload(payload = {}) {
  const source = safeObject(payload);

  if (!isCacheFresh(source.savedAt)) {
    return false;
  }

  if (hasOwnKeys(source.item)) {
    setItem(source.item);
  }

  if (Array.isArray(source.items)) {
    setItems(source.items);
  }

  setLastSyncAt(first(source.lastSyncAt, source.savedAt, Date.now()));
  setPage(source.page || 1);
  setPageSize(source.pageSize || DEFAULT_PAGE_SIZE);
  setRemoteCount(source.remoteCount || getItems().length);

  if (source.meta) {
    setMeta(source.meta);
  }

  setHydrated(true);
  setLoaded(true);

  return true;
}

/* =========================================================
   VALIDATION HELPERS
========================================================= */

export function validateViewForm(form = null) {
  const source = normalizeCuentaDraft(form || getViewForm());
  const errors = {};

  if (!["es", "en", "ca"].includes(source.lang)) {
    errors.lang = "Idioma no válido.";
  }

  if (!["light", "dark"].includes(source.theme)) {
    errors.theme = "Tema no válido.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    form: source,
  };
}

export function applyValidationToView(form = null) {
  const result = validateViewForm(form);

  setViewErrors(result.errors);

  return result;
}

/* =========================================================
   DEBUG / SNAPSHOT
========================================================= */

export function getCuentaStateSnapshot() {
  const view = normalizeCuentaViewState(cuentaState.view);
  const item = getItem();
  const draft = normalizeCuentaDraft(cuentaState.draft);

  return {
    hydrated: cuentaState.hydrated,
    loading: cuentaState.loading,
    refreshing: cuentaState.refreshing,
    loaded: cuentaState.loaded,
    saving: cuentaState.saving,

    error: cuentaState.error,

    hasItem: Boolean(item),
    itemsCount: getItems().length,
    remoteCount: getRemoteCount(),

    lastSyncAt: cuentaState.lastSyncAt,
    lastSyncAtMs: getLastSyncAtMs(),

    page: cuentaState.page,
    pageSize: cuentaState.pageSize,

    requestId: cuentaState.requestId,
    loadToken: cuentaState.loadToken,
    mutationToken: cuentaState.mutationToken,

    hasInflightLoad: Boolean(inflightLoad),
    hasInflightSave: Boolean(inflightSave),
    hasInflightUpdate: Boolean(inflightUpdate),
    hasInflightTheme: Boolean(inflightTheme),
    hasInflightLanguage: Boolean(inflightLanguage),
    hasInflightPassword: Boolean(inflightPassword),

    action: {
      ...safeObject(cuentaState.action),
    },

    draft: {
      darkMode: Boolean(draft.darkMode),
      privacyMode: Boolean(draft.privacyMode),
      theme: safeText(draft.theme, DEFAULT_THEME),
      lang: safeText(draft.lang, DEFAULT_LANG),
    },

    view: {
      submitting: view.submitting,
      dirty: view.dirty,
      serverError: view.serverError,
      successMessage: view.successMessage,
      updatedAt: view.updatedAt,
      updatedAtMs: view.updatedAtMs,
      activeSection: view.activeSection,
      lastAction: view.lastAction,
      errorCount: Object.keys(safeObject(view.errors)).length,
      touchedCount: Object.keys(safeObject(view.touched)).length,
      darkMode: Boolean(view?.form?.darkMode),
      privacyMode: Boolean(view?.form?.privacyMode),
      theme: safeText(view?.form?.theme, DEFAULT_THEME),
      lang: safeText(view?.form?.lang, DEFAULT_LANG),
    },

    item: item
      ? {
          id: safeText(item.id, ""),
          userId: safeText(item.userId, ""),
          email: safeText(item.email, ""),
          username: safeText(item.username, ""),
          displayName: safeText(item.displayName, ""),
          role: safeText(item.role, DEFAULT_ROLE),
          status: safeText(item.status, DEFAULT_STATUS),
          darkMode: Boolean(item.darkMode),
          privacyMode: Boolean(item.privacyMode),
          theme: safeText(item.theme, DEFAULT_THEME),
          lang: safeText(item.lang, DEFAULT_LANG),
          updatedAt: safeText(item.updatedAt, ""),
        }
      : null,

    meta: cuentaState.meta ? { ...safeObject(cuentaState.meta) } : null,

    debug: {
      ...safeObject(cuentaState.debug),
    },
  };
}

export function getCuentaTemplateState() {
  return {
    item: getItem(),
    items: getItems(),
    state: cuentaState,
    view: getViewState(),
    draft: getDraft(),
    snapshot: getCuentaStateSnapshot(),
  };
}

export function getCuentaActionsState() {
  return {
    ...safeObject(cuentaState.action),
    saving: cuentaState.saving,
    loading: cuentaState.loading,
    refreshing: cuentaState.refreshing,
  };
}

export function getCuentaViewState() {
  return getViewState();
}

export function getCuentaInflightState() {
  return {
    load: inflightLoad,
    save: inflightSave,
    update: inflightUpdate,
    theme: inflightTheme,
    language: inflightLanguage,
    password: inflightPassword,
  };
}

/* =========================================================
   LEGACY ALIASES
========================================================= */

export const clearCuentaError = clearError;
export const setCuentaError = setError;

export const setCuentaItem = setItem;
export const getCuentaItemState = getItem;
export const clearCuentaItem = clearItem;
export const patchCuentaItem = patchItem;

export const setCuentaLoaded = setLoaded;
export const setCuentaLoading = setLoading;
export const setCuentaRefreshing = setRefreshing;
export const setCuentaSaving = setSaving;
export const setCuentaHydrated = setHydrated;

export const setCuentaPage = setPage;
export const setCuentaPageSize = setPageSize;
export const setCuentaRemoteCount = setRemoteCount;

export const getCuentaPage = getPage;
export const getCuentaPageSize = getPageSize;
export const getCuentaRemoteCount = getRemoteCount;

export const setCuentaDraft = setDraft;
export const patchCuentaDraft = patchDraft;
export const clearCuentaDraft = clearDraft;

export const setCuentaViewState = setViewState;
export const patchCuentaViewState = patchViewState;
export const resetCuentaViewState = resetViewState;

export const setCuentaViewForm = setViewForm;
export const patchCuentaViewForm = patchViewForm;

export const getCuentaState = () => cuentaState;
export const getState = () => cuentaState;

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  CACHE_KEY,
  CACHE_TTL,
  DEFAULT_PAGE_SIZE,
  DEFAULT_LANG,
  DEFAULT_THEME,
  DEFAULT_ROLE,
  DEFAULT_STATUS,

  cuentaState,

  createDefaultCuentaDraft,
  createDefaultCuentaViewState,
  createInitialCuentaState,

  getInflightLoad,
  setInflightLoad,
  clearInflightLoad,

  getInflightSave,
  setInflightSave,
  clearInflightSave,

  getInflightUpdate,
  setInflightUpdate,
  clearInflightUpdate,

  getInflightTheme,
  setInflightTheme,
  clearInflightTheme,

  getInflightLanguage,
  setInflightLanguage,
  clearInflightLanguage,

  getInflightPassword,
  setInflightPassword,
  clearInflightPassword,

  clearAllInflight,

  resetCuentaState,
  resetCuentaViewState,
  resetCuentaInflightState,
  resetCuentaActionState,

  setLoading,
  setRefreshing,
  setLoaded,
  setHydrated,
  setSaving,

  isCuentaHydrated,
  isCuentaLoading,
  isCuentaRefreshing,
  isCuentaLoaded,
  isCuentaSaving,

  patchActionState,
  setSavingPreferences,
  setSavingTheme,
  setSavingLanguage,
  setChangingPassword,
  setOpeningModal,

  setPage,
  setPageSize,
  getPage,
  getPageSize,

  setRemoteCount,
  getRemoteCount,

  setItems,
  getItems,
  clearItems,

  setItem,
  getItem,
  getCuentaItem,
  hasItem,
  clearItem,
  patchItem,
  getCuentaByIdState,

  setMeta,
  getMeta,
  clearMeta,

  setError,
  getError,
  clearError,

  setLastSyncAt,
  getLastSyncAt,
  getLastSyncAtMs,

  setDraft,
  patchDraft,
  getDraft,
  clearDraft,
  syncDraftFromItem,

  setViewState,
  patchViewState,
  getViewState,

  setViewForm,
  patchViewForm,
  getViewForm,

  setViewErrors,
  patchViewErrors,
  getViewErrors,
  clearViewErrors,

  setViewTouched,
  patchViewTouched,

  setViewDirty,
  setViewSubmitting,

  setViewServerError,
  getViewServerError,
  clearViewServerError,

  setViewSuccess,
  getViewSuccessMessage,
  clearViewSuccess,

  setViewActiveSection,
  setViewLastAction,

  resetViewState,
  syncViewFormFromItem,

  getCachePayload,
  isCacheFresh,
  hydrateCuentaStateFromCachePayload,

  validateViewForm,
  applyValidationToView,

  getCuentaStateSnapshot,
  getCuentaTemplateState,
  getCuentaActionsState,
  getCuentaViewState,
  getCuentaInflightState,

  clearCuentaError,
  setCuentaError,

  setCuentaItem,
  getCuentaItemState,
  clearCuentaItem,
  patchCuentaItem,

  setCuentaLoaded,
  setCuentaLoading,
  setCuentaRefreshing,
  setCuentaSaving,
  setCuentaHydrated,

  setCuentaPage,
  setCuentaPageSize,
  setCuentaRemoteCount,

  getCuentaPage,
  getCuentaPageSize,
  getCuentaRemoteCount,

  setCuentaDraft,
  patchCuentaDraft,
  clearCuentaDraft,

  setCuentaViewState,
  patchCuentaViewState,

  setCuentaViewForm,
  patchCuentaViewForm,

  getCuentaState,
  getState,
};
