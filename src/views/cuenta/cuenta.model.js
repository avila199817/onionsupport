/* =========================================================
   Onion SPA - Cuenta Model
   Archivo: src/views/cuenta/cuenta.model.js

   FULL PRO 10/10

   RESPONSABILIDADES:
   - normalizar payloads heterogéneos backend/store
   - exponer modelo consistente Cuenta/Preferencias
   - labels de theme / privacy / estado
   - flags computados
   - fechas base
   - collections helpers
   - sorting helpers
   - stats helpers
   - defensive parsing enterprise ready

   USO:
   import {
     normalizeCuentaModel,
     normalizeCuentaCollection,
     computeCuentaStats
   } from "./cuenta.model.js";
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_PAGE_SIZE = 1;

export const THEME = Object.freeze({
  DARK: "dark",
  LIGHT: "light",
});

export const PRIVACY = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive",
});

export const ACCOUNT_STATUS = Object.freeze({
  STANDARD: "standard",
  PRIVACY: "privacy",
  HARDENED: "hardened",
});

/* =========================================================
   SAFE CORE
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return null;
}

/* =========================================================
   LABEL MAPS
========================================================= */

export function normalizeTheme(value = null) {
  if (typeof value === "boolean") {
    return value ? THEME.DARK : THEME.LIGHT;
  }

  const key = safeText(value, "").toLowerCase();

  switch (key) {
    case "dark":
    case "darkmode":
    case "dark_mode":
    case "oscuro":
    case "modo_oscuro":
    case "modo oscuro":
      return THEME.DARK;

    case "light":
    case "claro":
    case "lightmode":
    case "light_mode":
    case "modo_claro":
    case "modo claro":
      return THEME.LIGHT;

    default:
      return THEME.DARK;
  }
}

export function normalizePrivacy(value = null) {
  if (typeof value === "boolean") {
    return value
      ? PRIVACY.ACTIVE
      : PRIVACY.INACTIVE;
  }

  const key = safeText(value, "").toLowerCase();

  switch (key) {
    case "true":
    case "1":
    case "active":
    case "enabled":
    case "on":
    case "privacy":
    case "private":
    case "activo":
    case "activa":
    case "habilitado":
    case "habilitada":
      return PRIVACY.ACTIVE;

    case "false":
    case "0":
    case "inactive":
    case "disabled":
    case "off":
    case "public":
    case "inactivo":
    case "inactiva":
    case "deshabilitado":
    case "deshabilitada":
      return PRIVACY.INACTIVE;

    default:
      return PRIVACY.INACTIVE;
  }
}

export function normalizeAccountStatus(value = null, context = {}) {
  const key = safeText(value, "").toLowerCase();

  if (key) {
    switch (key) {
      case "standard":
      case "default":
      case "normal":
      case "estandar":
      case "estándar":
        return ACCOUNT_STATUS.STANDARD;

      case "privacy":
      case "private":
      case "privado":
      case "privacidad":
        return ACCOUNT_STATUS.PRIVACY;

      case "hardened":
      case "secure":
      case "protected":
      case "fortified":
      case "reforzado":
      case "seguro":
        return ACCOUNT_STATUS.HARDENED;

      default:
        break;
    }
  }

  const detail = safeObject(context);

  const darkMode = Boolean(detail.darkMode);
  const privacyMode = Boolean(detail.privacyMode);

  if (darkMode && privacyMode) {
    return ACCOUNT_STATUS.HARDENED;
  }

  if (privacyMode) {
    return ACCOUNT_STATUS.PRIVACY;
  }

  return ACCOUNT_STATUS.STANDARD;
}

export function getThemeLabel(value = null) {
  switch (normalizeTheme(value)) {
    case THEME.DARK:
      return "Dark mode";

    case THEME.LIGHT:
      return "Light mode";

    default:
      return "Dark mode";
  }
}

export function getPrivacyLabel(value = null) {
  switch (normalizePrivacy(value)) {
    case PRIVACY.ACTIVE:
      return "Privacidad activa";

    case PRIVACY.INACTIVE:
      return "Privacidad desactivada";

    default:
      return "Privacidad desactivada";
  }
}

export function getAccountStatusLabel(value = null, context = {}) {
  switch (normalizeAccountStatus(value, context)) {
    case ACCOUNT_STATUS.HARDENED:
      return "Protección reforzada";

    case ACCOUNT_STATUS.PRIVACY:
      return "Privacidad activa";

    case ACCOUNT_STATUS.STANDARD:
      return "Configuración estándar";

    default:
      return "Configuración estándar";
  }
}

/* =========================================================
   DATES
========================================================= */

export function toDate(value = null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function toTimestamp(value = null) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

/* =========================================================
   CORE NORMALIZER
========================================================= */

export function normalizeCuentaModel(
  payload = {}
) {
  const item = safeObject(payload);

  const preferencesObject = safeObject(
    first(
      item.preferences,
      item.preference,
      item.settings,
      item.config,
      item.data
    )
  );

  const darkModeRaw = first(
    item.darkMode,
    preferencesObject.darkMode,
    item.theme === "dark"
      ? true
      : item.theme === "light"
      ? false
      : null,
    preferencesObject.theme === "dark"
      ? true
      : preferencesObject.theme === "light"
      ? false
      : null
  );

  const privacyModeRaw = first(
    item.privacyMode,
    preferencesObject.privacyMode,
    item.privateMode,
    preferencesObject.privateMode
  );

  const darkMode =
    typeof darkModeRaw === "boolean"
      ? darkModeRaw
      : normalizeTheme(darkModeRaw) === THEME.DARK;

  const privacyMode =
    typeof privacyModeRaw === "boolean"
      ? privacyModeRaw
      : normalizePrivacy(privacyModeRaw) === PRIVACY.ACTIVE;

  const theme = normalizeTheme(
    first(
      item.theme,
      preferencesObject.theme,
      darkMode
    )
  );

  const privacy = normalizePrivacy(
    first(
      item.privacy,
      preferencesObject.privacy,
      privacyMode
    )
  );

  const updatedAt = first(
    item.updatedAt,
    item.updated_at,
    preferencesObject.updatedAt,
    item.lastUpdate,
    item.modifiedAt,
    null
  );

  const status = normalizeAccountStatus(
    first(
      item.status,
      item.accountStatus,
      preferencesObject.status
    ),
    {
      darkMode,
      privacyMode,
    }
  );

  const themeLabel =
    getThemeLabel(theme);

  const privacyLabel =
    getPrivacyLabel(privacy);

  const statusLabel =
    getAccountStatusLabel(status, {
      darkMode,
      privacyMode,
    });

  const updatedAtTs =
    toTimestamp(updatedAt);

  const isDarkMode =
    theme === THEME.DARK;

  const isLightMode =
    theme === THEME.LIGHT;

  const isPrivacyMode =
    privacy === PRIVACY.ACTIVE;

  const isPrivacyOff =
    privacy === PRIVACY.INACTIVE;

  const isHardened =
    status === ACCOUNT_STATUS.HARDENED;

  const isStandard =
    status === ACCOUNT_STATUS.STANDARD;

  const isPrivacyFocused =
    status === ACCOUNT_STATUS.PRIVACY;

  return {
    /* identity */
    id: "cuenta",
    resourceId: safeText(
      first(
        item.id,
        item.userId,
        item.accountId,
        "cuenta"
      ),
      "cuenta"
    ),

    /* preferences */
    darkMode,
    privacyMode,
    theme,
    privacy,
    status,

    /* labels */
    themeLabel,
    privacyLabel,
    statusLabel,

    /* dates */
    updatedAt,
    updatedAtTs,

    /* flags */
    isDarkMode,
    isLightMode,
    isPrivacyMode,
    isPrivacyOff,
    isHardened,
    isStandard,
    isPrivacyFocused,

    /* misc */
    endpoint: safeText(
      first(
        item.endpoint,
        item.api,
        "/api/user/preferences"
      ),
      "/api/user/preferences"
    ),

    /* raw */
    raw: item,
  };
}

/* =========================================================
   COLLECTION NORMALIZER
========================================================= */

export function unwrapCuentaPayload(
  payload = null
) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (
    Array.isArray(obj.items)
  ) {
    return obj.items;
  }

  if (
    Array.isArray(obj.results)
  ) {
    return obj.results;
  }

  if (
    Array.isArray(obj.rows)
  ) {
    return obj.rows;
  }

  if (
    Array.isArray(obj.data)
  ) {
    return obj.data;
  }

  if (obj.preferences) {
    return [obj.preferences];
  }

  if (obj.account) {
    return [obj.account];
  }

  if (obj.cuenta) {
    return [obj.cuenta];
  }

  if (obj.user) {
    return [obj.user];
  }

  if (obj.item) {
    return [obj.item];
  }

  if (obj.result) {
    return [obj.result];
  }

  if (
    obj.data &&
    typeof obj.data === "object"
  ) {
    return unwrapCuentaPayload(
      obj.data
    );
  }

  if (Object.keys(obj).length) {
    return [obj];
  }

  return [];
}

export function normalizeCuentaCollection(
  payload = []
) {
  return unwrapCuentaPayload(
    payload
  ).map(
    normalizeCuentaModel
  );
}

/* =========================================================
   SORT
========================================================= */

export function sortCuentaByUpdatedDesc(
  items = []
) {
  return [...safeArray(items)].sort(
    (a, b) =>
      safeNumber(
        b.updatedAtTs
      ) -
      safeNumber(
        a.updatedAtTs
      )
  );
}

export function sortCuentaBySecurityDesc(
  items = []
) {
  const weight = {
    hardened: 3,
    privacy: 2,
    standard: 1,
  };

  return [...safeArray(items)].sort(
    (a, b) =>
      safeNumber(
        weight[b.status]
      ) -
      safeNumber(
        weight[a.status]
      )
  );
}

/* =========================================================
   PAGINATION
========================================================= */

export function paginateCuenta(
  items = [],
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE
) {
  const list =
    safeArray(items);

  const size = Math.max(
    1,
    safeNumber(
      pageSize,
      DEFAULT_PAGE_SIZE
    )
  );

  const total =
    list.length;

  const totalPages =
    Math.max(
      1,
      Math.ceil(total / size)
    );

  const current = Math.min(
    Math.max(
      1,
      safeNumber(page, 1)
    ),
    totalPages
  );

  const start =
    (current - 1) * size;

  const end =
    start + size;

  return {
    page: current,
    pageSize: size,
    total,
    totalPages,
    items:
      list.slice(
        start,
        end
      ),
    from:
      total === 0
        ? 0
        : start + 1,
    to: Math.min(
      end,
      total
    ),
  };
}

/* =========================================================
   STATS
========================================================= */

export function computeCuentaStats(
  items = []
) {
  const list =
    safeArray(items);

  return {
    total:
      list.length,

    darkMode:
      list.filter(
        (x) => x.isDarkMode
      ).length,

    lightMode:
      list.filter(
        (x) => x.isLightMode
      ).length,

    privacyOn:
      list.filter(
        (x) => x.isPrivacyMode
      ).length,

    privacyOff:
      list.filter(
        (x) => x.isPrivacyOff
      ).length,

    hardened:
      list.filter(
        (x) => x.isHardened
      ).length,

    standard:
      list.filter(
        (x) => x.isStandard
      ).length,
  };
}

/* =========================================================
   FINDERS
========================================================= */

export function findCuentaById(
  items = [],
  id = ""
) {
  const target = safeText(
    id,
    ""
  );

  if (!target) return null;

  return (
    safeArray(items).find(
      (item) =>
        safeText(
          first(
            item.resourceId,
            item.id
          )
        ) === target
    ) || null
  );
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  DEFAULT_PAGE_SIZE,
  THEME,
  PRIVACY,
  ACCOUNT_STATUS,
  normalizeCuentaModel,
  normalizeCuentaCollection,
  unwrapCuentaPayload,
  sortCuentaByUpdatedDesc,
  sortCuentaBySecurityDesc,
  paginateCuenta,
  computeCuentaStats,
  findCuentaById,
  getThemeLabel,
  getPrivacyLabel,
  getAccountStatusLabel,
  normalizeTheme,
  normalizePrivacy,
  normalizeAccountStatus,
};
