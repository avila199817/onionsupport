/* =========================================================
   Onion SPA - Server Utils
   Archivo: src/views/server/server.utils.js

   EXTREME MODE · 10/10

   Responsabilidades:
   - helpers puros reutilizables del módulo server
   - sanitización robusta
   - fechas seguras
   - números
   - texto
   - normalización
   - métricas técnicas (ms / MB / GB / %)
   - cero dependencias frágiles
   - compatibilidad total con template / actions / api / view / modal
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   BASE
========================================================= */

/**
 * FIX CRÍTICO:
 * Fallback interno si AppCore.utils.escapeHtml no existe.
 * Evita textos invisibles o rotos en cards técnicas.
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

export function first(...values) {
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

export function clamp(
  value,
  min = 0,
  max = 100
) {
  const n = safeNumber(
    value,
    min
  );

  return Math.max(
    min,
    Math.min(max, n)
  );
}

export function round2(
  value,
  fallback = 0
) {
  const n = safeNumber(
    value,
    fallback
  );

  return (
    Math.round(
      (n + Number.EPSILON) * 100
    ) / 100
  );
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
      `[ServerToast:${type}]`,
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
    safeNumber(max, 160);

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
    return "SV";
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

  return initials || "SV";
}

export function slugify(
  value = ""
) {
  return normalizeText(value)
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );
}

/* =========================================================
   NUMBER / METRICS
========================================================= */

export function formatNumber(
  value,
  locale = "es-ES"
) {
  const n =
    safeNumber(value, 0);

  try {
    return new Intl.NumberFormat(
      locale
    ).format(n);
  } catch {
    return String(n);
  }
}

export function formatMoney(
  value,
  currency = "EUR",
  locale = "es-ES"
) {
  const amount =
    safeNumber(value, 0);

  try {
    return new Intl.NumberFormat(
      locale,
      {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }
    ).format(amount);
  } catch {
    return `${amount.toFixed(
      2
    )} ${currency}`;
  }
}

export function percent(
  value,
  digits = 0
) {
  const n =
    safeNumber(value, 0);

  return `${n.toFixed(
    digits
  )}%`;
}

export function formatMs(
  value,
  fallback = "—"
) {
  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }

  return `${round2(n)} ms`;
}

export function formatMB(
  value,
  locale = "es-ES",
  fallback = "—"
) {
  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }

  try {
    return `${new Intl.NumberFormat(
      locale,
      {
        maximumFractionDigits: 2,
      }
    ).format(n)} MB`;
  } catch {
    return `${round2(n)} MB`;
  }
}

export function formatGB(
  value,
  locale = "es-ES",
  fallback = "—"
) {
  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }

  try {
    return `${new Intl.NumberFormat(
      locale,
      {
        minimumFractionDigits:
          n < 10 ? 2 : 1,
        maximumFractionDigits: 2,
      }
    ).format(n)} GB`;
  } catch {
    return `${round2(n)} GB`;
  }
}

export function formatBytes(
  value,
  locale = "es-ES",
  fallback = "—"
) {
  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }

  if (n < 1024) {
    return `${formatNumber(
      n,
      locale
    )} B`;
  }

  if (n < 1024 ** 2) {
    return `${round2(
      n / 1024
    )} KB`;
  }

  if (n < 1024 ** 3) {
    return `${round2(
      n / 1024 / 1024
    )} MB`;
  }

  return `${round2(
    n / 1024 / 1024 / 1024
  )} GB`;
}

/* =========================================================
   STATUS / HEALTH
========================================================= */

export function normalizeStatus(
  value = ""
) {
  const key =
    safeText(value, "")
      .toLowerCase();

  if (
    [
      "ok",
      "up",
      "healthy",
      "online",
      "success",
      "operativa",
      "operativo",
    ].includes(key)
  ) {
    return "ok";
  }

  if (
    [
      "warning",
      "pending",
      "degraded",
      "slow",
      "revisar",
    ].includes(key)
  ) {
    return "warning";
  }

  if (
    [
      "error",
      "critical",
      "down",
      "offline",
      "failed",
    ].includes(key)
  ) {
    return "error";
  }

  if (
    [
      "disabled",
      "off",
    ].includes(key)
  ) {
    return "disabled";
  }

  return "unknown";
}

export function getStatusLabel(
  value = ""
) {
  switch (
    normalizeStatus(value)
  ) {
    case "ok":
      return "Operativo";

    case "warning":
      return "Atención";

    case "error":
      return "Error";

    case "disabled":
      return "Desactivado";

    default:
      return "Desconocido";
  }
}

export function getLatencyLabel(
  value
) {
  const n =
    safeNumber(value, 0);

  if (!n) {
    return "No disponible";
  }

  if (n <= 200) {
    return "Muy rápida";
  }

  if (n <= 500) {
    return "Operativa";
  }

  if (n <= 1000) {
    return "Revisar";
  }

  return "Lenta";
}

export function getPercentTone(
  value
) {
  const n = clamp(
    value,
    0,
    100
  );

  if (n >= 85) {
    return "error";
  }

  if (n >= 70) {
    return "warning";
  }

  return "success";
}

export function getCpuStatusLabel(
  value
) {
  const n = clamp(
    value,
    0,
    100
  );

  if (n >= 85) {
    return "Alta";
  }

  if (n >= 70) {
    return "Elevada";
  }

  if (n >= 40) {
    return "Normal";
  }

  return "Baja";
}

export function getRamStatusLabel(
  value
) {
  const n = clamp(
    value,
    0,
    100
  );

  if (n >= 90) {
    return "Crítica";
  }

  if (n >= 80) {
    return "Muy alta";
  }

  if (n >= 65) {
    return "Moderada";
  }

  return "Estable";
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
        second: "2-digit",
      }
    ).format(date);
  } catch {
    return "—";
  }
}

export function formatClock(
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
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
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
   COLLECTION
========================================================= */

export function sortByUpdatedDesc(
  items = []
) {
  return safeArray(items)
    .slice()
    .sort(
      (a, b) =>
        toMs(
          b?.updatedAt ||
            b?.createdAt ||
            b?.timestamp
        ) -
        toMs(
          a?.updatedAt ||
            a?.createdAt ||
            a?.timestamp
        )
    );
}

export function sortByLatencyDesc(
  items = []
) {
  return safeArray(items)
    .slice()
    .sort(
      (a, b) =>
        safeNumber(
          b?.latencyMs,
          Number.NEGATIVE_INFINITY
        ) -
        safeNumber(
          a?.latencyMs,
          Number.NEGATIVE_INFINITY
        )
    );
}

export function uniqueBy(
  items = [],
  key = "id"
) {
  const map =
    new Map();

  for (const item of safeArray(
    items
  )) {
    const id = safeText(
      item?.[key],
      ""
    );

    if (!id) continue;

    if (!map.has(id)) {
      map.set(id, item);
    }
  }

  return Array.from(
    map.values()
  );
}

/* =========================================================
   METRIC FLAGS
========================================================= */

export function isHighUsage(
  value,
  threshold = 85
) {
  return safeNumber(
    value,
    0
  ) >= safeNumber(
    threshold,
    85
  );
}

export function isWarningUsage(
  value,
  threshold = 70
) {
  return safeNumber(
    value,
    0
  ) >= safeNumber(
    threshold,
    70
  );
}

export function hasLatency(
  value
) {
  return Number.isFinite(
    Number(value)
  ) && Number(value) > 0;
}
