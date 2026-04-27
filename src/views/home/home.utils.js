/* =========================================================
   Onion SPA - Home Utils
   Archivo: src/views/home/home.utils.js

   EXTREME MODE · FINAL PRO · 10/10

   Responsabilidades:
   - helpers puros reutilizables del módulo Home
   - sanitización robusta
   - fechas seguras
   - números / dinero / porcentajes
   - texto / slug / normalización
   - colecciones / dedupe / ordenación
   - clipboard / descarga CSV
   - toast bridge tolerante
   - cero dependencias frágiles
   - compatibilidad total con template / actions / api / view

   HARDENING:
   - tolera AppCore incompleto
   - tolera Toast global / módulo registrado / ui.toast / AppCore.toast
   - soporta fechas futuras en relative date
   - evita fallos con objetos en first()
   - CSP clean: sin HTML/eventos inline
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   RUNTIME
========================================================= */

export function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

export function now() {
  return Date.now();
}

export function noop() {}

/* =========================================================
   BASE SAFE HELPERS
========================================================= */

export function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

export function isFunction(value) {
  return typeof value === "function";
}

export function isEmptyString(value) {
  return (
    typeof value === "string" &&
    value.trim() === ""
  );
}

export function isNil(value) {
  return (
    value === null ||
    value === undefined
  );
}

export function safeString(
  value,
  fallback = ""
) {
  if (isNil(value)) {
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
  if (Array.isArray(value)) {
    return value;
  }

  return Array.isArray(fallback)
    ? fallback
    : [];
}

export function safeObject(
  value,
  fallback = {}
) {
  if (isObject(value)) {
    return value;
  }

  return isObject(fallback)
    ? fallback
    : {};
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

export function safeInteger(
  value,
  fallback = 0
) {
  const n = Number.parseInt(
    value,
    10
  );

  return Number.isFinite(n)
    ? n
    : fallback;
}

export function safeBoolean(
  value,
  fallback = false
) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const key = value
      .trim()
      .toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "y",
        "si",
        "sí",
        "on",
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
      ].includes(key)
    ) {
      return false;
    }
  }

  return fallback;
}

export function first(...values) {
  for (const value of values) {
    if (isNil(value)) {
      continue;
    }

    if (typeof value === "string") {
      if (value.trim() === "") {
        continue;
      }

      return value;
    }

    if (Array.isArray(value)) {
      if (!value.length) {
        continue;
      }

      return value;
    }

    if (isObject(value)) {
      if (!Object.keys(value).length) {
        continue;
      }

      return value;
    }

    return value;
  }

  return null;
}

export function clamp(
  value,
  min = 0,
  max = 100
) {
  const n =
    safeNumber(value, min);

  return Math.min(
    Math.max(n, min),
    max
  );
}

/* =========================================================
   CLONE / JSON
========================================================= */

export function deepClone(value) {
  if (value === undefined) {
    return undefined;
  }

  try {
    if (
      typeof structuredClone ===
      "function"
    ) {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return value;
  }
}

export function parseJson(
  value,
  fallback = null
) {
  if (isObject(value) || Array.isArray(value)) {
    return value;
  }

  const text =
    safeText(value, "");

  if (!text) {
    return fallback;
  }

  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function stringifyJson(
  value,
  fallback = "{}"
) {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

/* =========================================================
   HTML / TEXT SANITIZE
========================================================= */

export function escapeHtml(value = "") {
  const text = String(value ?? "");

  try {
    const coreEscape =
      AppCore?.utils?.escapeHtml;

    if (isFunction(coreEscape)) {
      const result =
        coreEscape(text);

      if (!isNil(result)) {
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

export function normalizeKey(
  value = ""
) {
  return normalizeText(value)
    .replace(
      /[\s-]+/g,
      "_"
    )
    .replace(
      /[^a-z0-9_:.]/g,
      ""
    )
    .replace(
      /^_+|_+$/g,
      ""
    );
}

export function normalizeWhitespace(
  value = ""
) {
  return safeText(value, "")
    .replace(/\s+/g, " ")
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
      safeInteger(max, 160)
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
  value = "",
  fallback = "ON"
) {
  const text =
    normalizeWhitespace(value);

  if (!text) {
    return fallback;
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

  return initials || fallback;
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
   NUMBER / MONEY
========================================================= */

export function formatNumber(
  value,
  locale = "es-ES",
  options = {}
) {
  const n =
    safeNumber(value, 0);

  try {
    return new Intl.NumberFormat(
      safeText(locale, "es-ES"),
      safeObject(options)
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

  const code =
    safeText(currency, "EUR")
      .toUpperCase();

  try {
    return new Intl.NumberFormat(
      safeText(locale, "es-ES"),
      {
        style: "currency",
        currency: code,
        maximumFractionDigits: 2,
      }
    ).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

export function percent(
  value,
  digits = 0
) {
  const n =
    safeNumber(value, 0);

  const precision =
    clamp(
      safeInteger(digits, 0),
      0,
      6
    );

  return `${n.toFixed(precision)}%`;
}

export function isPositiveTrend(
  value
) {
  return safeNumber(value, 0) > 0;
}

export function isNegativeTrend(
  value
) {
  return safeNumber(value, 0) < 0;
}

/* =========================================================
   DATE
========================================================= */

export function toDate(value) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
}

export function toMs(value) {
  const date =
    toDate(value);

  return date
    ? date.getTime()
    : 0;
}

export function formatDate(
  value,
  {
    locale = "es-ES",
    fallback = "—",
    withTime = true,
  } = {}
) {
  const date =
    toDate(value);

  if (!date) {
    return fallback;
  }

  try {
    return new Intl.DateTimeFormat(
      safeText(locale, "es-ES"),
      withTime
        ? {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }
        : {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          }
    ).format(date);
  } catch {
    return fallback;
  }
}

export function formatRelativeDate(
  value,
  {
    fallback = "—",
    nowMs = Date.now(),
  } = {}
) {
  const date =
    toDate(value);

  if (!date) {
    return fallback;
  }

  const diff =
    date.getTime() - nowMs;

  const abs =
    Math.abs(diff);

  const minute =
    60 * 1000;

  const hour =
    60 * minute;

  const day =
    24 * hour;

  const future =
    diff > 0;

  if (abs < minute) {
    return future
      ? "En un momento"
      : "Hace un momento";
  }

  if (abs < hour) {
    const valueMin =
      Math.floor(abs / minute);

    return future
      ? `En ${valueMin} min`
      : `Hace ${valueMin} min`;
  }

  if (abs < day) {
    const valueHour =
      Math.floor(abs / hour);

    return future
      ? `En ${valueHour} h`
      : `Hace ${valueHour} h`;
  }

  if (abs < day * 7) {
    const valueDay =
      Math.floor(abs / day);

    return future
      ? `En ${valueDay} d`
      : `Hace ${valueDay} d`;
  }

  return formatDate(value);
}

export function formatDateTime(
  value
) {
  return formatDate(
    value,
    {
      withTime: true,
    }
  );
}

export function formatDateOnly(
  value
) {
  return formatDate(
    value,
    {
      withTime: false,
    }
  );
}

/* =========================================================
   COLLECTION
========================================================= */

export function normalizeCollection(
  value,
  fallback = []
) {
  if (Array.isArray(value)) {
    return value;
  }

  const object =
    safeObject(value, null);

  if (!object) {
    return safeArray(fallback);
  }

  return safeArray(
    first(
      object.items,
      object.rows,
      object.data,
      object.results,
      object.value,
      object.docs,
      fallback
    )
  );
}

export function sortByUpdatedDesc(
  items = []
) {
  return safeArray(items)
    .slice()
    .sort(
      (a, b) =>
        toMs(
          b?.updatedAt ||
            b?.lastUpdate ||
            b?.modifiedAt ||
            b?.createdAt
        ) -
        toMs(
          a?.updatedAt ||
            a?.lastUpdate ||
            a?.modifiedAt ||
            a?.createdAt
        )
    );
}

export function sortByCreatedDesc(
  items = []
) {
  return safeArray(items)
    .slice()
    .sort(
      (a, b) =>
        toMs(
          b?.createdAt ||
            b?.date ||
            b?.timestamp
        ) -
        toMs(
          a?.createdAt ||
            a?.date ||
            a?.timestamp
        )
    );
}

export function uniqueBy(
  items = [],
  key = "id"
) {
  const map =
    new Map();

  for (const item of safeArray(items)) {
    const row =
      safeObject(item, null);

    if (!row) {
      continue;
    }

    const id =
      isFunction(key)
        ? safeText(key(row), "")
        : safeText(row?.[key], "");

    if (!id) {
      continue;
    }

    if (!map.has(id)) {
      map.set(id, row);
    }
  }

  return Array.from(
    map.values()
  );
}

export function uniqueById(
  items = []
) {
  return uniqueBy(
    items,
    (item) =>
      first(
        item?.id,
        item?._id,
        item?.widgetId,
        item?.ticketId,
        item?.invoiceId,
        item?.code,
        item?.slug
      )
  );
}

export function paginate(
  items = [],
  page = 1,
  pageSize = 10
) {
  const list =
    safeArray(items);

  const size =
    Math.max(
      1,
      safeInteger(pageSize, 10)
    );

  const total =
    list.length;

  const totalPages =
    Math.max(
      1,
      Math.ceil(total / size)
    );

  const currentPage =
    clamp(
      safeInteger(page, 1),
      1,
      totalPages
    );

  const start =
    (currentPage - 1) * size;

  const end =
    start + size;

  return {
    page: currentPage,
    pageSize: size,
    total,
    totalPages,
    items: list.slice(start, end),
    from: total ? start + 1 : 0,
    to: Math.min(end, total),
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

/* =========================================================
   DOM / FILE HELPERS
========================================================= */

export async function copyTextToClipboard(
  value = ""
) {
  const text =
    safeText(value, "");

  if (!text || !isBrowser()) {
    return false;
  }

  try {
    if (
      navigator?.clipboard?.writeText
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  try {
    const textarea =
      document.createElement("textarea");

    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";

    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();

    const ok =
      document.execCommand("copy");

    textarea.remove();

    return Boolean(ok);
  } catch {
    return false;
  }
}

export function downloadTextFile({
  filename = "download.txt",
  content = "",
  mimeType = "text/plain;charset=utf-8;",
} = {}) {
  if (!isBrowser()) {
    return false;
  }

  try {
    const blob =
      new Blob(
        [String(content ?? "")],
        {
          type: safeText(
            mimeType,
            "text/plain;charset=utf-8;"
          ),
        }
      );

    const url =
      URL.createObjectURL(blob);

    const anchor =
      document.createElement("a");

    anchor.href = url;
    anchor.download =
      safeText(filename, "download.txt");

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
   CSV
========================================================= */

export function escapeCsvCell(value = "") {
  const text =
    isNil(value)
      ? ""
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv(
  rows = []
) {
  return safeArray(rows)
    .map((row) =>
      safeArray(row)
        .map(escapeCsvCell)
        .join(",")
    )
    .join("\n");
}

/* =========================================================
   TOAST BRIDGE
========================================================= */

function normalizeToastType(
  type = "info"
) {
  const key =
    normalizeKey(type);

  if (
    [
      "success",
      "error",
      "warning",
      "warn",
      "info",
      "loading",
    ].includes(key)
  ) {
    return key === "warn"
      ? "warning"
      : key;
  }

  return "info";
}

function getToastCandidates() {
  const candidates = [];

  try {
    if (
      isFunction(AppCore?.modules?.get)
    ) {
      candidates.push(
        AppCore.modules.get("toast")
      );
    }
  } catch {}

  try {
    if (AppCore?.toast) {
      candidates.push(AppCore.toast);
    }
  } catch {}

  try {
    if (AppCore?.ui?.toast) {
      candidates.push(AppCore.ui.toast);
    }
  } catch {}

  try {
    if (isBrowser() && window.Toast) {
      candidates.push(window.Toast);
    }
  } catch {}

  try {
    if (isBrowser() && window.OnionToast) {
      candidates.push(window.OnionToast);
    }
  } catch {}

  return candidates.filter(Boolean);
}

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

  const toastType =
    normalizeToastType(type);

  const opts =
    safeObject(options);

  const payload = {
    ...opts,
    type: toastType,
    message: text,
  };

  const candidates =
    getToastCandidates();

  for (const toast of candidates) {
    try {
      const directMethod =
        toastType === "warning"
          ? toast.warning || toast.warn
          : toast?.[toastType];

      if (isFunction(directMethod)) {
        const result =
          directMethod.call(
            toast,
            text,
            opts
          );

        return result || true;
      }
    } catch {}

    try {
      if (isFunction(toast?.show)) {
        const result =
          toast.show(payload);

        return result || true;
      }
    } catch {}
  }

  try {
    AppCore?.events?.emit?.(
      `toast:${toastType}`,
      payload
    );

    return true;
  } catch {}

  try {
    const logger =
      toastType === "error"
        ? console.error
        : toastType === "warning"
          ? console.warn
          : console.log;

    logger(
      `[HomeToast:${toastType}]`,
      text
    );
  } catch {}

  return false;
}

/* =========================================================
   ASYNC / TIMING
========================================================= */

export function sleep(ms = 0) {
  return new Promise((resolve) => {
    try {
      window.setTimeout(
        resolve,
        Math.max(0, safeNumber(ms, 0))
      );
    } catch {
      setTimeout(
        resolve,
        Math.max(0, safeNumber(ms, 0))
      );
    }
  });
}

export function nextFrame() {
  return new Promise((resolve) => {
    try {
      if (
        isBrowser() &&
        isFunction(window.requestAnimationFrame)
      ) {
        window.requestAnimationFrame(
          () => resolve()
        );

        return;
      }
    } catch {}

    try {
      setTimeout(resolve, 0);
    } catch {
      resolve();
    }
  });
}

export function debounce(
  fn,
  wait = 120
) {
  let timer = null;

  return (...args) => {
    try {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(
        () => {
          timer = null;
          fn?.(...args);
        },
        Math.max(0, safeNumber(wait, 120))
      );
    } catch {
      fn?.(...args);
    }
  };
}

export function throttle(
  fn,
  wait = 120
) {
  let last = 0;
  let timer = null;

  return (...args) => {
    const current =
      Date.now();

    const delay =
      Math.max(0, safeNumber(wait, 120));

    const remaining =
      delay - (current - last);

    if (remaining <= 0) {
      last = current;
      fn?.(...args);
      return;
    }

    if (timer) {
      return;
    }

    timer = setTimeout(
      () => {
        timer = null;
        last = Date.now();
        fn?.(...args);
      },
      remaining
    );
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  isBrowser,
  now,
  noop,

  isObject,
  isFunction,
  isEmptyString,
  isNil,

  safeString,
  safeText,
  safeArray,
  safeObject,
  safeNumber,
  safeInteger,
  safeBoolean,
  first,
  clamp,

  deepClone,
  parseJson,
  stringifyJson,

  escapeHtml,
  normalizeText,
  normalizeKey,
  normalizeWhitespace,
  truncate,
  getInitials,
  slugify,

  formatNumber,
  formatMoney,
  percent,
  isPositiveTrend,
  isNegativeTrend,

  toDate,
  toMs,
  formatDate,
  formatDateTime,
  formatDateOnly,
  formatRelativeDate,

  normalizeCollection,
  sortByUpdatedDesc,
  sortByCreatedDesc,
  uniqueBy,
  uniqueById,
  paginate,

  copyTextToClipboard,
  downloadTextFile,

  escapeCsvCell,
  buildCsv,

  showToast,

  sleep,
  nextFrame,
  debounce,
  throttle,
};
