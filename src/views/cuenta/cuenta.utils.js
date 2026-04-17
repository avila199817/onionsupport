/* =========================================================
   Onion SPA - Cuenta Utils
   Archivo: src/views/cuenta/cuenta.utils.js

   EXTREME MODE · 10/10

   Responsabilidades:
   - helpers puros reutilizables
   - sanitización robusta
   - fechas seguras
   - números
   - texto
   - normalización
   - helpers de preferencias de cuenta
   - cero dependencias frágiles
   - compatibilidad total con template / actions / api / modal
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   BASE
========================================================= */

/**
 * FIX CRÍTICO:
 * Igual que en incidencias:
 * si AppCore.utils.escapeHtml no existe o falla,
 * usamos fallback local seguro.
 */
export function escapeHtml(value = "") {
  const text = String(value ?? "");

  try {
    const coreEscape =
      AppCore?.utils?.escapeHtml;

    if (
      typeof coreEscape ===
      "function"
    ) {
      const result =
        coreEscape(text);

      if (
        result !== undefined &&
        result !== null
      ) {
        return String(result);
      }
    }
  } catch {}

  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function safeString(
  value,
  fallback = ""
) {
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

export function safeText(
  value,
  fallback = ""
) {
  return safeString(
    value,
    fallback
  );
}

export function safeArray(
  value,
  fallback = []
) {
  return Array.isArray(value)
    ? value
    : fallback;
}

export function safeNumber(
  value,
  fallback = 0
) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

export function safeObject(
  value,
  fallback = {}
) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : fallback;
}

export function safeBoolean(
  value,
  fallback = false
) {
  if (
    typeof value ===
    "boolean"
  ) {
    return value;
  }

  return fallback;
}

export function first(
  ...values
) {
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
   UI
========================================================= */

export function showToast(
  message = "",
  type = "info",
  options = {}
) {
  const text =
    safeText(message, "");

  if (!text) {
    return false;
  }

  try {
    if (
      typeof AppCore?.modules?.get ===
      "function"
    ) {
      const toastModule =
        AppCore.modules.get(
          "toast"
        );

      if (
        typeof toastModule?.show ===
        "function"
      ) {
        toastModule.show({
          message: text,
          type,
          ...options,
        });
        return true;
      }
    }
  } catch {}

  try {
    if (
      typeof AppCore?.ui?.toast?.show ===
      "function"
    ) {
      AppCore.ui.toast.show({
        message: text,
        type,
        ...options,
      });
      return true;
    }
  } catch {}

  try {
    if (
      typeof AppCore?.toast?.show ===
      "function"
    ) {
      AppCore.toast.show({
        message: text,
        type,
        ...options,
      });
      return true;
    }
  } catch {}

  try {
    if (
      typeof window !==
        "undefined" &&
      typeof window.Toast?.show ===
        "function"
    ) {
      window.Toast.show({
        message: text,
        type,
        ...options,
      });
      return true;
    }
  } catch {}

  try {
    const logger =
      type === "error"
        ? console.error
        : type === "warning"
          ? console.warn
          : console.log;

    logger(
      `[CuentaToast:${type}]`,
      text
    );
  } catch {}

  return false;
}

/* =========================================================
   TEXT
========================================================= */

export function normalizeText(
  value = ""
) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim();
}

export function truncate(
  value = "",
  max = 160
) {
  const text =
    safeString(value, "");

  const limit =
    Math.max(
      1,
      safeNumber(max, 160)
    );

  if (!text) {
    return "";
  }

  if (text.length <= limit) {
    return text;
  }

  return `${text
    .slice(0, limit)
    .trim()}…`;
}

export function getInitials(
  value = ""
) {
  const text =
    safeString(value, "");

  if (!text) {
    return "ON";
  }

  const initials = text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) =>
      part
        .charAt(0)
        .toUpperCase()
    )
    .join("")
    .slice(0, 2);

  return initials || "ON";
}

/* =========================================================
   DATE
========================================================= */

export function toMs(value) {
  if (!value) {
    return 0;
  }

  const ms =
    new Date(value).getTime();

  return Number.isFinite(ms)
    ? ms
    : 0;
}

export function formatDate(
  value
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "es-ES",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    ).format(date);
  } catch {
    return "—";
  }
}

export function formatRelativeDate(
  value
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  const diff =
    Date.now() -
    date.getTime();

  const minute =
    60 * 1000;

  const hour =
    60 * minute;

  const day =
    24 * hour;

  if (diff < minute) {
    return "Hace un momento";
  }

  if (diff < hour) {
    return `Hace ${Math.floor(
      diff / minute
    )} min`;
  }

  if (diff < day) {
    return `Hace ${Math.floor(
      diff / hour
    )} h`;
  }

  if (diff < day * 7) {
    return `Hace ${Math.floor(
      diff / day
    )} d`;
  }

  return formatDate(value);
}

/* =========================================================
   ACCOUNT / PREFERENCES HELPERS
========================================================= */

export function normalizeTheme(
  value = null
) {
  if (
    typeof value ===
    "boolean"
  ) {
    return value
      ? "dark"
      : "light";
  }

  const key =
    normalizeText(value);

  switch (key) {
    case "dark":
    case "darkmode":
    case "dark_mode":
    case "oscuro":
    case "modo_oscuro":
    case "modo oscuro":
      return "dark";

    case "light":
    case "lightmode":
    case "light_mode":
    case "claro":
    case "modo_claro":
    case "modo claro":
      return "light";

    default:
      return "dark";
  }
}

export function normalizePrivacyMode(
  value = null
) {
  if (
    typeof value ===
    "boolean"
  ) {
    return value;
  }

  const key =
    normalizeText(value);

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
      return true;

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
      return false;

    default:
      return false;
  }
}

export function getThemeLabel(
  value = null
) {
  return normalizeTheme(value) ===
    "dark"
    ? "Dark mode"
    : "Light mode";
}

export function getPrivacyLabel(
  value = null
) {
  return normalizePrivacyMode(
    value
  )
    ? "Privacidad activa"
    : "Privacidad desactivada";
}

export function getAccountStatusLabel(
  {
    darkMode = true,
    privacyMode = false,
  } = {}
) {
  const isDark =
    safeBoolean(
      darkMode,
      true
    );

  const isPrivacy =
    safeBoolean(
      privacyMode,
      false
    );

  if (
    isDark &&
    isPrivacy
  ) {
    return "Protección reforzada";
  }

  if (isPrivacy) {
    return "Privacidad activa";
  }

  return "Configuración estándar";
}

export function normalizeCuentaPayload(
  payload = {}
) {
  const raw =
    safeObject(payload);

  const preferences =
    safeObject(
      first(
        raw.preferences,
        raw.preference,
        raw.settings,
        raw.config,
        raw.data
      )
    );

  const darkMode =
    typeof raw.darkMode ===
    "boolean"
      ? raw.darkMode
      : typeof preferences.darkMode ===
        "boolean"
        ? preferences.darkMode
        : normalizeTheme(
            first(
              raw.theme,
              preferences.theme,
              true
            )
          ) === "dark";

  const privacyMode =
    typeof raw.privacyMode ===
    "boolean"
      ? raw.privacyMode
      : typeof preferences.privacyMode ===
        "boolean"
        ? preferences.privacyMode
        : normalizePrivacyMode(
            first(
              raw.privacy,
              raw.privateMode,
              preferences.privacy,
              preferences.privateMode,
              false
            )
          );

  const updatedAt =
    first(
      raw.updatedAt,
      raw.updated_at,
      preferences.updatedAt,
      raw.lastUpdate,
      raw.modifiedAt
    ) || "";

  return {
    ...raw,
    darkMode,
    privacyMode,
    theme:
      darkMode
        ? "dark"
        : "light",
    themeLabel:
      getThemeLabel(
        darkMode
      ),
    privacyLabel:
      getPrivacyLabel(
        privacyMode
      ),
    statusLabel:
      getAccountStatusLabel({
        darkMode,
        privacyMode,
      }),
    updatedAt,
  };
}

export function buildCuentaSnapshot(
  payload = {}
) {
  const item =
    normalizeCuentaPayload(
      payload
    );

  return {
    darkMode: Boolean(
      item.darkMode
    ),
    privacyMode: Boolean(
      item.privacyMode
    ),
    theme: safeText(
      item.theme,
      item.darkMode
        ? "dark"
        : "light"
    ),
    themeLabel: safeText(
      item.themeLabel,
      getThemeLabel(
        item.theme
      )
    ),
    privacyLabel: safeText(
      item.privacyLabel,
      getPrivacyLabel(
        item.privacyMode
      )
    ),
    statusLabel: safeText(
      item.statusLabel,
      getAccountStatusLabel({
        darkMode:
          item.darkMode,
        privacyMode:
          item.privacyMode,
      })
    ),
    updatedAt: safeText(
      item.updatedAt,
      ""
    ),
  };
}

/* =========================================================
   DEBUG / SERIALIZATION
========================================================= */

export function safeJsonStringify(
  value,
  fallback = "{}"
) {
  try {
    return JSON.stringify(
      value ?? {},
      null,
      2
    );
  } catch {
    return fallback;
  }
}

export default {
  escapeHtml,
  safeString,
  safeText,
  safeArray,
  safeNumber,
  safeObject,
  safeBoolean,
  first,

  showToast,

  normalizeText,
  truncate,
  getInitials,

  toMs,
  formatDate,
  formatRelativeDate,

  normalizeTheme,
  normalizePrivacyMode,
  getThemeLabel,
  getPrivacyLabel,
  getAccountStatusLabel,
  normalizeCuentaPayload,
  buildCuentaSnapshot,

  safeJsonStringify,
};
