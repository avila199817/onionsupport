/* =========================================================
   Onion SPA - Ajustes Model
   Archivo: src/views/ajustes/ajustes.model.js

   FULL PRO 10/10

   RESPONSABILIDADES:
   - normalizar payloads heterogéneos backend/store
   - exponer modelo consistente Ajuste
   - labels estado / tipo / visibilidad
   - flags computados
   - avatars / initials por categoría
   - fechas base
   - collections helpers
   - sorting helpers
   - stats helpers
   - defensive parsing enterprise ready

   USO:
   import {
     normalizeAjusteModel,
     normalizeAjustesCollection,
     computeAjustesStats
   } from "./ajustes.model.js";
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_PAGE_SIZE = 8;

export const STATUS = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive",
  DRAFT: "draft",
  ERROR: "error",
});

export const TYPE = Object.freeze({
  TEXT: "text",
  NUMBER: "number",
  BOOLEAN: "boolean",
  SELECT: "select",
  JSON: "json",
  PAYMENT_METHOD: "payment_method",
  EMAIL: "email",
  URL: "url",
});

export const VISIBILITY = Object.freeze({
  PRIVATE: "private",
  INTERNAL: "internal",
  PUBLIC: "public",
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
   IDS / HASH
========================================================= */

function hashString(value = "") {
  const str = String(value || "onion");
  let hash = 0;

  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

/* =========================================================
   LABEL MAPS
========================================================= */

export function normalizeStatus(value = "") {
  const key = safeText(value).toLowerCase();

  switch (key) {
    case "active":
    case "activo":
    case "activa":
    case "enabled":
    case "enable":
    case "habilitado":
    case "habilitada":
      return STATUS.ACTIVE;

    case "inactive":
    case "inactivo":
    case "inactiva":
    case "disabled":
    case "disable":
    case "deshabilitado":
    case "deshabilitada":
      return STATUS.INACTIVE;

    case "draft":
    case "borrador":
      return STATUS.DRAFT;

    case "error":
    case "failed":
    case "invalid":
    case "invalido":
    case "inválido":
      return STATUS.ERROR;

    default:
      return STATUS.ACTIVE;
  }
}

export function normalizeType(value = "") {
  const key = safeText(value).toLowerCase();

  switch (key) {
    case "text":
    case "string":
      return TYPE.TEXT;

    case "number":
    case "numeric":
    case "integer":
    case "float":
    case "decimal":
      return TYPE.NUMBER;

    case "boolean":
    case "bool":
    case "switch":
    case "toggle":
      return TYPE.BOOLEAN;

    case "select":
    case "option":
    case "options":
    case "dropdown":
      return TYPE.SELECT;

    case "json":
    case "object":
    case "map":
      return TYPE.JSON;

    case "payment_method":
    case "payment-method":
    case "payment":
    case "metodo_pago":
    case "método_pago":
    case "metodo de pago":
    case "método de pago":
      return TYPE.PAYMENT_METHOD;

    case "email":
    case "mail":
      return TYPE.EMAIL;

    case "url":
    case "link":
      return TYPE.URL;

    default:
      return TYPE.TEXT;
  }
}

export function normalizeVisibility(value = "") {
  const key = safeText(value).toLowerCase();

  switch (key) {
    case "private":
    case "privado":
    case "privada":
      return VISIBILITY.PRIVATE;

    case "internal":
    case "interno":
    case "interna":
      return VISIBILITY.INTERNAL;

    case "public":
    case "publico":
    case "público":
    case "publica":
    case "pública":
      return VISIBILITY.PUBLIC;

    default:
      return VISIBILITY.PRIVATE;
  }
}

export function getStatusLabel(value = "") {
  switch (normalizeStatus(value)) {
    case STATUS.ACTIVE:
      return "Activo";

    case STATUS.INACTIVE:
      return "Inactivo";

    case STATUS.DRAFT:
      return "Borrador";

    case STATUS.ERROR:
      return "Error";

    default:
      return "Activo";
  }
}

export function getTypeLabel(value = "") {
  switch (normalizeType(value)) {
    case TYPE.TEXT:
      return "Texto";

    case TYPE.NUMBER:
      return "Número";

    case TYPE.BOOLEAN:
      return "Booleano";

    case TYPE.SELECT:
      return "Selección";

    case TYPE.JSON:
      return "JSON";

    case TYPE.PAYMENT_METHOD:
      return "Método de pago";

    case TYPE.EMAIL:
      return "Email";

    case TYPE.URL:
      return "URL";

    default:
      return "Texto";
  }
}

export function getVisibilityLabel(value = "") {
  switch (normalizeVisibility(value)) {
    case VISIBILITY.PRIVATE:
      return "Privado";

    case VISIBILITY.INTERNAL:
      return "Interno";

    case VISIBILITY.PUBLIC:
      return "Público";

    default:
      return "Privado";
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
   INITIALS / AVATAR
========================================================= */

export function getInitials(value = "") {
  const text = safeText(value, "AJ");

  const parts = text.split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return "AJ";
  }

  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (initials || "AJ").toUpperCase();
}

export function getAvatarTheme(seed = "") {
  const themes = [
    "violet",
    "emerald",
    "blue",
    "amber",
    "rose",
    "purple",
    "cyan",
    "orange",
  ];

  return themes[
    hashString(seed) % themes.length
  ];
}

/* =========================================================
   OPTIONS
========================================================= */

function normalizeOption(option = {}) {
  const item = safeObject(option);

  return {
    id: safeText(
      first(
        item.id,
        item.value,
        item.key,
        item.code
      ),
      ""
    ),

    label: safeText(
      first(
        item.label,
        item.title,
        item.name,
        item.nombre,
        item.value
      ),
      ""
    ),

    value: safeText(
      first(
        item.value,
        item.id,
        item.key,
        item.code,
        item.slug
      ),
      ""
    ),

    raw: item,
  };
}

function normalizeOptions(value) {
  return safeArray(value).map(
    (entry) => {
      if (
        entry &&
        typeof entry === "object" &&
        !Array.isArray(entry)
      ) {
        return normalizeOption(entry);
      }

      return {
        id: safeText(entry, ""),
        label: safeText(entry, ""),
        value: safeText(entry, ""),
        raw: entry,
      };
    }
  );
}

/* =========================================================
   HISTORY
========================================================= */

function normalizeHistoryEntry(row = {}) {
  const item = safeObject(row);

  return {
    id: safeText(
      first(item.id),
      ""
    ),

    title: safeText(
      first(
        item.title,
        item.action,
        item.message,
        item.text
      ),
      "Evento"
    ),

    createdAt: first(
      item.createdAt,
      item.date,
      item.timestamp
    ),

    user: safeText(
      first(
        item.user,
        item.author,
        item.name
      ),
      ""
    ),

    raw: item,
  };
}

function normalizeHistory(value) {
  return safeArray(value).map(
    normalizeHistoryEntry
  );
}

/* =========================================================
   VALUE HELPERS
========================================================= */

export function stringifyValue(value = null) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return safeText(value, "");
  }
}

export function isTruthySettingValue(value = null) {
  if (typeof value === "boolean") {
    return value;
  }

  const text = safeText(value, "").toLowerCase();

  return [
    "1",
    "true",
    "yes",
    "on",
    "enabled",
    "active",
    "si",
    "sí",
  ].includes(text);
}

/* =========================================================
   CORE NORMALIZER
========================================================= */

export function normalizeAjusteModel(
  payload = {}
) {
  const item = safeObject(payload);

  const categoryObject = safeObject(
    first(
      item.category,
      item.categoria,
      item.group,
      item.section
    )
  );

  const updatedByObject = safeObject(
    first(
      item.updatedBy,
      item.modifiedBy,
      item.lastEditor,
      item.user,
      item.usuario
    )
  );

  const settingId = safeText(
    first(
      item.settingId,
      item.ajusteId,
      item.paymentMethodId,
      item.metodoPagoId,
      item.id,
      item.key,
      item.slug,
      item.code
    ),
    ""
  );

  const key = safeText(
    first(
      item.key,
      item.settingKey,
      item.slug,
      item.code,
      item.id
    ),
    ""
  );

  const title = safeText(
    first(
      item.title,
      item.titulo,
      item.label,
      item.name,
      item.nombre,
      key
    ),
    "Ajuste"
  );

  const description = safeText(
    first(
      item.description,
      item.descripcion,
      item.helpText,
      item.help,
      item.summary,
      item.resumen
    ),
    "Sin descripción."
  );

  const category = safeText(
    first(
      categoryObject.name,
      categoryObject.nombre,
      categoryObject.label,
      categoryObject.title,
      item.categoryName,
      item.categoriaNombre,
      item.category,
      item.categoria,
      item.group,
      item.section
    ),
    "General"
  );

  const rawValue = first(
    item.value,
    item.valor,
    item.currentValue,
    item.defaultValue
  );

  const value =
    rawValue === null ||
    rawValue === undefined
      ? ""
      : rawValue;

  const valueText =
    stringifyValue(value);

  const type =
    normalizeType(
      first(
        item.type,
        item.tipo,
        item.valueType,
        item.inputType
      )
    );

  const status =
    normalizeStatus(
      first(
        item.status,
        item.estado,
        item.state
      )
    );

  const visibility =
    normalizeVisibility(
      first(
        item.visibility,
        item.visibilidad,
        item.scope
      )
    );

  const updatedByName =
    safeText(
      first(
        updatedByObject.name,
        updatedByObject.nombre,
        updatedByObject.displayName,
        updatedByObject.username,
        updatedByObject.email,
        item.updatedByName,
        item.modifiedByName
      ),
      "Sistema"
    );

  const createdAt = first(
    item.createdAt,
    item.createdAtES,
    item.date,
    item.fechaCreacion
  );

  const updatedAt = first(
    item.updatedAt,
    item.modifiedAt,
    item.lastUpdate,
    item.fechaActualizacion,
    createdAt
  );

  const options =
    normalizeOptions(
      first(
        item.options,
        item.opciones,
        item.choices,
        item.values
      )
    );

  const history =
    normalizeHistory(
      first(
        item.history,
        item.timeline,
        item.logs,
        item.audit,
        item.changelog
      )
    );

  const initials =
    getInitials(category);

  const avatarTheme =
    getAvatarTheme(
      settingId ||
      key ||
      category ||
      title
    );

  const createdAtTs =
    toTimestamp(createdAt);

  const updatedAtTs =
    toTimestamp(updatedAt);

  const isActive =
    status === STATUS.ACTIVE;

  const isInactive =
    status === STATUS.INACTIVE;

  const isDraft =
    status === STATUS.DRAFT;

  const isError =
    status === STATUS.ERROR;

  const isPublic =
    visibility === VISIBILITY.PUBLIC;

  const isInternal =
    visibility === VISIBILITY.INTERNAL;

  const isPrivate =
    visibility === VISIBILITY.PRIVATE;

  const isBoolean =
    type === TYPE.BOOLEAN;

  const isSelect =
    type === TYPE.SELECT;

  const isJson =
    type === TYPE.JSON;

  const isPaymentMethod =
    type === TYPE.PAYMENT_METHOD;

  const hasOptions =
    options.length > 0;

  const hasHistory =
    history.length > 0;

  const hasValue =
    valueText !== "";

  const isEnabled =
    isTruthySettingValue(value) ||
    isActive;

  return {
    /* identity */
    settingId,
    id: settingId,
    key,

    /* content */
    title,
    description,
    category,

    /* value */
    value,
    valueText,

    /* enums */
    type,
    typeLabel:
      getTypeLabel(type),

    status,
    statusLabel:
      getStatusLabel(status),

    visibility,
    visibilityLabel:
      getVisibilityLabel(
        visibility
      ),

    /* dates */
    createdAt,
    updatedAt,
    createdAtTs,
    updatedAtTs,

    /* relations */
    updatedByName,

    /* visuals */
    initials,
    avatarTheme,

    /* collections */
    options,
    optionsCount:
      options.length,

    history,
    historyCount:
      history.length,

    /* flags */
    isActive,
    isInactive,
    isDraft,
    isError,
    isPublic,
    isInternal,
    isPrivate,
    isBoolean,
    isSelect,
    isJson,
    isPaymentMethod,
    hasOptions,
    hasHistory,
    hasValue,
    isEnabled,

    /* raw */
    raw: item,
  };
}

/* =========================================================
   COLLECTION NORMALIZER
========================================================= */

export function unwrapAjustesPayload(
  payload = null
) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (
    Array.isArray(obj.settings)
  ) {
    return obj.settings;
  }

  if (
    Array.isArray(obj.ajustes)
  ) {
    return obj.ajustes;
  }

  if (
    Array.isArray(
      obj.paymentMethods
    )
  ) {
    return obj.paymentMethods;
  }

  if (
    Array.isArray(
      obj.metodosPago
    )
  ) {
    return obj.metodosPago;
  }

  if (
    Array.isArray(obj.items)
  ) {
    return obj.items;
  }

  if (
    Array.isArray(obj.data)
  ) {
    return obj.data;
  }

  if (
    Array.isArray(obj.results)
  ) {
    return obj.results;
  }

  if (
    obj.data &&
    typeof obj.data ===
      "object"
  ) {
    return unwrapAjustesPayload(
      obj.data
    );
  }

  return [];
}

export function normalizeAjustesCollection(
  payload = []
) {
  return unwrapAjustesPayload(
    payload
  ).map(
    normalizeAjusteModel
  );
}

/* =========================================================
   SORT
========================================================= */

export function sortAjustesByUpdatedDesc(
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

export function sortAjustesByTitleAsc(
  items = []
) {
  return [...safeArray(items)].sort(
    (a, b) =>
      safeText(a.title).localeCompare(
        safeText(b.title),
        "es"
      )
  );
}

export function sortAjustesByCategoryAsc(
  items = []
) {
  return [...safeArray(items)].sort(
    (a, b) => {
      const categoryCmp =
        safeText(
          a.category
        ).localeCompare(
          safeText(
            b.category
          ),
          "es"
        );

      if (categoryCmp !== 0) {
        return categoryCmp;
      }

      return safeText(
        a.title
      ).localeCompare(
        safeText(b.title),
        "es"
      );
    }
  );
}

/* =========================================================
   PAGINATION
========================================================= */

export function paginateAjustes(
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

export function computeAjustesStats(
  items = []
) {
  const list =
    safeArray(items);

  return {
    total:
      list.length,

    active:
      list.filter(
        (x) => x.isActive
      ).length,

    inactive:
      list.filter(
        (x) => x.isInactive
      ).length,

    draft:
      list.filter(
        (x) => x.isDraft
      ).length,

    error:
      list.filter(
        (x) => x.isError
      ).length,

    paymentMethods:
      list.filter(
        (x) =>
          x.isPaymentMethod
      ).length,

    boolean:
      list.filter(
        (x) =>
          x.isBoolean
      ).length,

    select:
      list.filter(
        (x) =>
          x.isSelect
      ).length,

    withOptions:
      list.filter(
        (x) =>
          x.hasOptions
      ).length,

    public:
      list.filter(
        (x) =>
          x.isPublic
      ).length,
  };
}

/* =========================================================
   FINDERS
========================================================= */

export function findAjusteById(
  items = [],
  settingId = ""
) {
  const id = safeText(
    settingId,
    ""
  );

  if (!id) return null;

  return (
    safeArray(items).find(
      (item) =>
        safeText(
          item.settingId
        ) === id
    ) || null
  );
}

export function findAjusteByKey(
  items = [],
  key = ""
) {
  const finalKey = safeText(
    key,
    ""
  );

  if (!finalKey) return null;

  return (
    safeArray(items).find(
      (item) =>
        safeText(
          item.key
        ) === finalKey
    ) || null
  );
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  DEFAULT_PAGE_SIZE,
  normalizeAjusteModel,
  normalizeAjustesCollection,
  unwrapAjustesPayload,
  sortAjustesByUpdatedDesc,
  sortAjustesByTitleAsc,
  sortAjustesByCategoryAsc,
  paginateAjustes,
  computeAjustesStats,
  findAjusteById,
  findAjusteByKey,
  getStatusLabel,
  getTypeLabel,
  getVisibilityLabel,
  normalizeStatus,
  normalizeType,
  normalizeVisibility,
  stringifyValue,
  isTruthySettingValue,
};
