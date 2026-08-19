/* =========================================================
   Onion Support - Usuarios Template
   Archivo: /src/views/usuarios/usuarios.template.js

   PRODUCTIVO · TEMPLATE PURO · CANONICAL UI · V21

   Responsabilidad:
   - Emitir exclusivamente HTML/presentación de /usuarios.
   - Mantener el contrato de seis columnas sin columna de acciones.
   - Mantener filtros, búsqueda, estados, skeletons y load-more.
   - Aceptar avatares HTTPS seguros y SAS de Azure Blob en runtime.
   - Sin HTTP, Store, Router, Auth, localStorage ni DOM operativo.
========================================================= */

export const USUARIOS_TEMPLATE_VERSION =
  "usuarios.template.canonical.v21.system-ui-safe-avatar";
export const USUARIOS_TABLE_TEMPLATE_VERSION = USUARIOS_TEMPLATE_VERSION;
export const USUARIOS_VIEW_TEMPLATE_VERSION = USUARIOS_TEMPLATE_VERSION;

export const USUARIOS_ACTIONS = Object.freeze({
  DETAIL: "detail",
  CREATE: "create",
  REFRESH: "refresh",
  RETRY: "retry",
  EXPORT: "export",
  FILTER: "filter",
  CLEAR_SEARCH: "clear-search",
  CLEAR_FILTERS: "clear-filters",
  LOAD_MORE: "load-more",
});
export const USUARIOS_TABLE_ACTIONS = USUARIOS_ACTIONS;

export const USUARIOS_DEFAULT_VISIBLE_ROWS = 20;
export const USUARIOS_DEFAULT_PAGE_SIZE = 20;

const DEFAULT_VISIBLE_ROWS = 20;
const TABLE_SCALE = "110";
const AVATAR_TONE_COUNT = 10;

const FILTERS = Object.freeze([
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "pending", label: "Pendientes" },
  { key: "blocked", label: "Bloqueados" },
]);

export const USUARIOS_TABLE_COLUMNS = Object.freeze([
  {
    key: "main",
    label: "Usuario",
    colClass: "usuarios-col usuarios-col--main",
    thClass: "usuarios-th usuarios-th--main usuarios-col usuarios-col--main",
    cellClass: "usuarios-cell usuarios-cell--main",
  },
  {
    key: "status",
    label: "Estado",
    colClass: "usuarios-col usuarios-col--status",
    thClass: "usuarios-th usuarios-th--status usuarios-col usuarios-col--status",
    cellClass: "usuarios-cell usuarios-cell--status",
  },
  {
    key: "date",
    label: "Alta",
    colClass: "usuarios-col usuarios-col--date",
    thClass: "usuarios-th usuarios-th--date usuarios-col usuarios-col--date",
    cellClass: "usuarios-cell usuarios-cell--date",
  },
  {
    key: "email",
    label: "Email",
    colClass: "usuarios-col usuarios-col--email",
    thClass: "usuarios-th usuarios-th--email usuarios-col usuarios-col--email",
    cellClass: "usuarios-cell usuarios-cell--email",
  },
  {
    key: "location",
    label: "Ciudad",
    colClass: "usuarios-col usuarios-col--location",
    thClass: "usuarios-th usuarios-th--location usuarios-col usuarios-col--location",
    cellClass: "usuarios-cell usuarios-cell--location",
  },
  {
    key: "activity",
    label: "Última conexión",
    colClass: "usuarios-col usuarios-col--activity",
    thClass: "usuarios-th usuarios-th--activity usuarios-col usuarios-col--activity",
    cellClass: "usuarios-cell usuarios-cell--activity",
  },
]);

/* =========================================================
   SAFE HELPERS
========================================================= */

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value, fallback = {}) {
  return isObject(value)
    ? value
    : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    typeof value.length === "number" &&
    typeof value !== "string"
  ) {
    try {
      return Array.from(value);
    } catch {
      return [];
    }
  }

  return [];
}

function safeText(value = "", fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function safeNumber(value = 0, fallback = 0) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function first(...values) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    if (
      isObject(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const attr = (value = "") =>
  escapeHtml(
    safeText(value, "")
  );

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
    .replace(/[^\w:.]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function clamp(value, min, max) {
  return Math.min(
    Math.max(
      safeNumber(value, min),
      min
    ),
    max
  );
}

function truncate(value = "", max = 96) {
  const text = safeText(value, "");
  const limit = Math.max(1, safeNumber(max, 96));

  if (
    !text ||
    text.length <= limit
  ) {
    return text;
  }

  return `${text.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function hashString(value = "") {
  const text = safeText(value, "onion");
  let hash = 2166136261;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    hash ^= text.charCodeAt(index);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return Math.abs(hash >>> 0);
}

function htmlAttrs(attributes = {}) {
  return Object.entries(
    safeObject(attributes)
  )
    .map(([name, value]) => {
      if (
        !name ||
        value === false ||
        value === null ||
        value === undefined
      ) {
        return "";
      }

      if (value === true) {
        return escapeHtml(name);
      }

      return `${escapeHtml(name)}="${escapeHtml(value)}"`;
    })
    .filter(Boolean)
    .join(" ");
}

/* =========================================================
   AVATAR URL POLICY
   Misma política de runtime que usuarios.api.js:
   - rechaza credenciales de aplicación;
   - permite SAS sólo si procede de Azure Blob;
   - blob: sólo vive en runtime.
========================================================= */

function isAzureBlobHost(hostname = "") {
  const host =
    safeText(hostname, "")
      .toLowerCase();

  return (
    host === "blob.core.windows.net" ||
    host.endsWith(".blob.core.windows.net")
  );
}

function isSensitiveQueryParam(key = "") {
  return [
    "access_token",
    "accesstoken",
    "refresh_token",
    "refreshtoken",
    "id_token",
    "idtoken",
    "token",
    "code",
    "secret",
    "session",
    "sessionid",
    "password",
    "pwd",
    "key",
    "jwt",
    "authorization",
    "reset_token",
    "resettoken",
    "activation_token",
    "activationtoken",
  ].includes(
    normalizeKey(key)
  );
}

function safeAvatarUrl(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  if (
    raw.startsWith("//") ||
    /[\r\n\t\\]/.test(raw) ||
    /^(javascript|data|vbscript|file):/i.test(raw)
  ) {
    return "";
  }

  if (/^blob:/i.test(raw)) {
    return raw;
  }

  if (raw.startsWith("/")) {
    return raw.replace(/\/{2,}/g, "/");
  }

  const localHttp =
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(
      raw
    );

  if (
    !/^https:\/\//i.test(raw) &&
    !localHttp
  ) {
    return "";
  }

  try {
    const url = new URL(raw);
    const queryKeys = [
      ...url.searchParams.keys(),
    ];

    if (
      queryKeys.some(
        isSensitiveQueryParam
      )
    ) {
      return "";
    }

    const hasSas =
      queryKeys.some((key) =>
        [
          "sig",
          "se",
          "sp",
          "sv",
          "sr",
          "spr",
          "st",
          "skoid",
          "sktid",
          "skt",
          "ske",
          "sks",
          "skv",
        ].includes(
          String(key).toLowerCase()
        )
      );

    if (
      hasSas &&
      !isAzureBlobHost(url.hostname)
    ) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

/* =========================================================
   DATE / FORMATTERS
========================================================= */

function toTimestamp(value = null) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms)
      ? ms
      : 0;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    if (value <= 0) {
      return 0;
    }

    return value > 9_999_999_999
      ? value
      : value * 1000;
  }

  const raw = safeText(value, "");
  if (!raw) {
    return 0;
  }

  const numeric = Number(raw);

  if (
    Number.isFinite(numeric) &&
    numeric > 0
  ) {
    return numeric > 9_999_999_999
      ? numeric
      : numeric * 1000;
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatDateTime(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "—";
  }
}

function formatDateShort(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(timestamp));
  } catch {
    return "—";
  }
}

function formatRelativeDate(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) {
    return "Sin fecha";
  }

  const diffMinutes =
    Math.round(
      (timestamp - Date.now()) /
      60_000
    );

  const absMinutes =
    Math.abs(diffMinutes);

  if (absMinutes < 1) {
    return "Ahora mismo";
  }

  if (absMinutes < 60) {
    return diffMinutes > 0
      ? `En ${absMinutes} min`
      : `Hace ${absMinutes} min`;
  }

  const hours =
    Math.round(absMinutes / 60);

  if (hours < 24) {
    return diffMinutes > 0
      ? `En ${hours} h`
      : `Hace ${hours} h`;
  }

  const days =
    Math.round(hours / 24);

  if (days <= 7) {
    return diffMinutes > 0
      ? `En ${days} día${days === 1 ? "" : "s"}`
      : `Hace ${days} día${days === 1 ? "" : "s"}`;
  }

  return formatDateShort(value);
}

function formatLastAccess(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) {
    return "Sin acceso";
  }

  const diffHours =
    Math.abs(Date.now() - timestamp) /
    3_600_000;

  return diffHours <= 72
    ? formatRelativeDate(value)
    : formatDateTime(value);
}

function formatNumber(value = 0) {
  try {
    return new Intl.NumberFormat("es-ES")
      .format(
        safeNumber(value, 0)
      );
  } catch {
    return String(
      safeNumber(value, 0)
    );
  }
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common =
    `aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    refresh:
      `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,
    export:
      `<svg ${common}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
    plus:
      `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
    users:
      `<svg ${common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    search:
      `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    close:
      `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    shield:
      `<svg ${common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    clock:
      `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
    alert:
      `<svg ${common}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    chevronDown:
      `<svg ${common}><path d="m6 9 6 6 6-6"/></svg>`,
  };

  return icons[name] || icons.users;
}

/* =========================================================
   CANONICAL USER READERS
========================================================= */

function getResolvedItems(input = {}) {
  if (Array.isArray(input)) {
    return input.filter(isObject);
  }

  const data = safeObject(input);

  for (const candidate of [
    data.items,
    data.users,
    data.usuarios,
    data.rows,
    data.results,
  ]) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isObject);
    }
  }

  return [];
}

function getUsuarioId(item = {}) {
  return safeText(
    first(
      item.userId,
      item.id,
      item.usuarioId,
      item.uid,
      ""
    ),
    ""
  );
}

function getUsuarioCode(item = {}) {
  return safeText(
    first(
      item.code,
      item.username,
      getUsuarioId(item),
      item.email,
      "USR-SIN-ID"
    ),
    "USR-SIN-ID"
  );
}

function getUsuarioName(item = {}) {
  return safeText(
    first(
      item.fullName,
      item.displayName,
      item.name,
      item.nombre,
      item.username,
      item.email,
      getUsuarioId(item),
      "Usuario"
    ),
    "Usuario"
  );
}

function getUsuarioDescription(item = {}) {
  const phone =
    safeText(
      first(
        item.phone,
        item.telefono,
        ""
      ),
      ""
    );

  const tipo =
    normalizeKey(
      first(
        item.tipo,
        ""
      )
    );

  const nif =
    safeText(item.nif, "");

  const parts = [];

  if (tipo === "empresa") {
    parts.push("Empresa");
  } else if (tipo === "particular") {
    parts.push("Particular");
  }

  if (phone) {
    parts.push(phone);
  }

  if (nif) {
    parts.push(nif);
  }

  return parts.join(" · ") ||
    "Usuario Onion Support";
}

function getUsuarioEmail(item = {}) {
  return (
    safeText(
      first(
        item.email,
        item.emailLower,
        item.mail,
        ""
      ),
      ""
    ).toLowerCase() ||
    "Sin email"
  );
}

function getUsuarioLocation(item = {}) {
  return (
    safeText(
      first(
        item.city,
        item.ciudad,
        item.direccion?.ciudad,
        item.address?.ciudad,
        ""
      ),
      ""
    ) ||
    "Sin ciudad"
  );
}

function getUsuarioAvatarUrl(item = {}) {
  return safeAvatarUrl(
    first(
      item.avatarUrl,
      item.avatar,
      item.photoUrl,
      item.picture,
      ""
    )
  );
}

function getUsuarioInitials(item = {}) {
  const parts =
    getUsuarioName(item)
      .split(/\s+/)
      .filter(Boolean);

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase() ||
      "US";
  }

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`
    .toUpperCase() ||
    "US";
}

function getUsuarioRoleValue(item = {}) {
  return normalizeKey(
    first(
      item.role,
      item.rol,
      "user"
    )
  ) === "admin"
    ? "admin"
    : "user";
}

function getUsuarioRoleLabel(item = {}) {
  return getUsuarioRoleValue(item) === "admin"
    ? "Admin"
    : "Usuario";
}

function getStatusKey(value = "") {
  const key = normalizeKey(value);

  if (key === "pending") {
    return "pending";
  }

  if (key === "blocked") {
    return "blocked";
  }

  if (key === "inactive") {
    return "inactive";
  }

  return "active";
}

function getStatusValue(item = {}) {
  return getStatusKey(
    first(
      item.status,
      item.estado,
      item.state,
      item.active === false
        ? "inactive"
        : "active"
    )
  );
}

function getStatusLabel(value = "") {
  const key = getStatusKey(value);

  if (key === "pending") {
    return "Pendiente";
  }

  if (key === "blocked") {
    return "Bloqueado";
  }

  if (key === "inactive") {
    return "Inactivo";
  }

  return "Activo";
}

function getCreatedAt(item = {}) {
  return first(
    item.createdAt,
    null
  );
}

function getUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.lastActivityAt,
    item.lastLoginAt,
    item.createdAt,
    null
  );
}

function getLastLoginAt(item = {}) {
  return first(
    item.lastLoginAt,
    item.lastAccessAt,
    null
  );
}

const isActiveLike =
  (item = {}) =>
    getStatusValue(item) === "active";

const isPendingLike =
  (item = {}) =>
    getStatusValue(item) === "pending";

const isBlockedLike =
  (item = {}) =>
    [
      "blocked",
      "inactive",
    ].includes(
      getStatusValue(item)
    );

const hasAccessLike =
  (item = {}) =>
    Boolean(
      toTimestamp(
        getLastLoginAt(item)
      )
    );

/* =========================================================
   FILTER / SEARCH / STATS
========================================================= */

function normalizeFilter(value = "") {
  const key = normalizeKey(value);

  return [
    "active",
    "pending",
    "blocked",
  ].includes(key)
    ? key
    : "all";
}

function getActiveFilter(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  return normalizeFilter(
    first(
      data.filter,
      data.activeFilter,
      data.statusFilter,
      state.filter,
      state.activeFilter,
      state.statusFilter,
      "all"
    )
  );
}

function getSearchQuery(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  return safeText(
    first(
      data.search,
      data.searchQuery,
      state.search,
      state.searchQuery,
      ""
    ),
    ""
  );
}

function itemMatchesFilter(item = {}, filter = "all") {
  if (filter === "active") {
    return isActiveLike(item);
  }

  if (filter === "pending") {
    return isPendingLike(item);
  }

  if (filter === "blocked") {
    return isBlockedLike(item);
  }

  return true;
}

function getSearchHaystack(item = {}) {
  return normalizeText(
    [
      getUsuarioId(item),
      getUsuarioCode(item),
      getUsuarioName(item),
      getUsuarioDescription(item),
      getUsuarioEmail(item),
      getUsuarioLocation(item),
      getUsuarioRoleLabel(item),
      getStatusLabel(
        getStatusValue(item)
      ),
      item.username,
      item.clienteId,
      item.phone,
      item.telefono,
      item.nif,
      item.tipo,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function itemMatchesSearch(item = {}, query = "") {
  const terms =
    normalizeText(query)
      .split(" ")
      .filter(Boolean);

  if (!terms.length) {
    return true;
  }

  const haystack =
    getSearchHaystack(item);

  return terms.every(
    (term) =>
      haystack.includes(term)
  );
}

function filterUsuariosForView(items = [], input = {}) {
  const filter = getActiveFilter(input);
  const search = getSearchQuery(input);

  return safeArray(items)
    .filter(
      (item) =>
        itemMatchesFilter(item, filter) &&
        itemMatchesSearch(item, search)
    );
}

function isFilterActive(input = {}) {
  return (
    getActiveFilter(input) !== "all" ||
    Boolean(
      getSearchQuery(input)
    )
  );
}

function computeFilterCounts(items = [], input = {}) {
  const search = getSearchQuery(input);

  const searchable =
    safeArray(items)
      .filter(
        (item) =>
          itemMatchesSearch(item, search)
      );

  return {
    all: searchable.length,
    active:
      searchable.filter(isActiveLike).length,
    pending:
      searchable.filter(isPendingLike).length,
    blocked:
      searchable.filter(isBlockedLike).length,
  };
}

function getFilterLabel(filter = "all") {
  return (
    FILTERS.find(
      (item) =>
        item.key ===
        normalizeFilter(filter)
    )?.label ||
    "Todos"
  );
}

function computeStats(items = []) {
  const rows = safeArray(items);

  return {
    total: rows.length,
    activeCount:
      rows.filter(isActiveLike).length,
    pendingCount:
      rows.filter(isPendingLike).length,
    blockedCount:
      rows.filter(isBlockedLike).length,
    withAccessCount:
      rows.filter(hasAccessLike).length,
  };
}

function resolveRemoteCount(input = {}, items = []) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  return Math.max(
    safeArray(items).length,
    safeNumber(
      first(
        data.remoteCount,
        data.totalCount,
        data.total,
        state.remoteCount,
        state.totalCount,
        state.total,
        safeArray(items).length
      ),
      safeArray(items).length
    )
  );
}

function getPagination(items = [], input = {}) {
  const allItems =
    filterUsuariosForView(
      items,
      input
    );

  const data = safeObject(input);
  const state = safeObject(data.state);

  const visibleLimit =
    clamp(
      first(
        data.visibleLimit,
        data.usuariosVisibleLimit,
        state.visibleLimit,
        state.usuariosVisibleLimit,
        DEFAULT_VISIBLE_ROWS
      ),
      1,
      500
    );

  const filtering =
    isFilterActive(input);

  const remoteTotal =
    resolveRemoteCount(
      input,
      items
    );

  const totalCount =
    filtering
      ? allItems.length
      : remoteTotal;

  const pageItems =
    allItems.slice(
      0,
      visibleLimit
    );

  const visibleCount =
    pageItems.length;

  const remainingCount =
    Math.max(
      0,
      allItems.length -
      visibleCount
    );

  return {
    allItems,
    pageItems,
    visibleItems: pageItems,
    visibleLimit,
    visibleCount,
    remainingCount,
    totalCount,
    remoteTotal,
    rangeStart:
      totalCount && visibleCount
        ? 1
        : 0,
    rangeEnd:
      visibleCount,
    hasMore:
      remainingCount > 0,
    filtering,
    activeFilter:
      getActiveFilter(input),
    searchQuery:
      getSearchQuery(input),
  };
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderSpinner(label = "") {
  return `
    <span class="usuarios-inline-loading">
      <span class="usuarios-inline-spinner" aria-hidden="true"></span>
      ${
        label
          ? `<span class="usuarios-inline-loading-text">${escapeHtml(label)}</span>`
          : ""
      }
    </span>
  `;
}

function getAvatarTone(item = {}) {
  const seed =
    `${getUsuarioId(item)}|${getUsuarioEmail(item)}|${getUsuarioName(item)}`;

  return hashString(seed) %
    AVATAR_TONE_COUNT;
}

function renderAvatar(item = {}) {
  const name = getUsuarioName(item);
  const src = getUsuarioAvatarUrl(item);
  const tone = getAvatarTone(item);

  return `
    <span
      class="usuarios-avatar${src ? " has-image" : " is-fallback"} usuarios-avatar-tone-${attr(String(tone))}"
      data-avatar-tone="${attr(String(tone))}"
      data-has-avatar="${src ? "true" : "false"}"
      data-fallback="${src ? "false" : "true"}"
      data-tooltip="${attr(name)}"
      aria-label="${attr(name)}"
    >
      ${
        src
          ? `<img
              class="usuarios-avatar-img"
              src="${attr(src)}"
              alt=""
              width="48"
              height="48"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              draggable="false"
            >`
          : ""
      }

      <span class="usuarios-avatar-fallback">
        ${escapeHtml(getUsuarioInitials(item))}
      </span>
    </span>
  `;
}

function renderStatusChip(item = {}) {
  const status = getStatusValue(item);

  return `
    <span
      class="usuarios-chip usuarios-status-chip usuarios-chip--${attr(status)} usuarios-status-chip--${attr(status)} is-${attr(status)}"
      data-status-chip="${attr(status)}"
      data-status="${attr(status)}"
    >
      <span class="usuarios-chip-dot usuarios-status-dot" aria-hidden="true"></span>
      <span>${escapeHtml(getStatusLabel(status))}</span>
    </span>
  `;
}

function renderRow(item = {}, state = {}) {
  const runtime = safeObject(state);
  const userId = getUsuarioId(item);
  const name = getUsuarioName(item);
  const status = getStatusValue(item);

  const openingUserId =
    safeText(
      first(
        runtime.openingUserId,
        runtime.detailUserId,
        runtime.loadingUserId,
        ""
      ),
      ""
    );

  const isOpening =
    Boolean(
      openingUserId &&
      openingUserId === userId
    );

  const interactive =
    Boolean(userId);

  const createdRaw =
    getCreatedAt(item);

  const lastLoginRaw =
    getLastLoginAt(item);

  return `
    <tr
      class="usuarios-row${interactive ? " usuarios-row--clickable" : ""} usuarios-row--${attr(status)}${isOpening ? " is-loading" : ""}"
      data-user-row="true"
      data-user-id="${attr(userId)}"
      data-usuario-id="${attr(userId)}"
      data-detail-target="${interactive ? "true" : "false"}"
      ${
        interactive
          ? `data-usuarios-action="${USUARIOS_ACTIONS.DETAIL}" data-action="open-user" tabindex="0" role="button" aria-label="Abrir detalle de ${attr(name)}"`
          : `aria-disabled="true"`
      }
      ${htmlAttrs({
        "aria-busy":
          isOpening
            ? "true"
            : false,
      })}
    >
      <td class="usuarios-cell usuarios-cell--main" data-column="main">
        <div class="usuarios-main">
          ${renderAvatar(item)}

          <div class="usuarios-main-copy">
            <div class="usuarios-user-line">
              <span class="usuarios-user-id">${escapeHtml(getUsuarioCode(item))}</span>
              <span class="usuarios-role-pill usuarios-role-pill--${attr(getUsuarioRoleValue(item))}">
                ${escapeHtml(getUsuarioRoleLabel(item))}
              </span>
            </div>

            <div class="usuarios-user-subject">
              ${escapeHtml(name)}
            </div>

            <div class="usuarios-user-description">
              ${escapeHtml(truncate(getUsuarioDescription(item), 96))}
            </div>
          </div>
        </div>
      </td>

      <td class="usuarios-cell usuarios-cell--status" data-column="status">
        ${renderStatusChip(item)}
      </td>

      <td class="usuarios-cell usuarios-cell--date" data-column="date">
        <span class="usuarios-date-inline" title="${attr(formatDateTime(createdRaw))}">
          ${escapeHtml(formatDateShort(createdRaw))}
        </span>
      </td>

      <td class="usuarios-cell usuarios-cell--email" data-column="email">
        <span class="usuarios-email-inline" title="${attr(getUsuarioEmail(item))}">
          ${escapeHtml(getUsuarioEmail(item))}
        </span>
      </td>

      <td class="usuarios-cell usuarios-cell--location" data-column="location">
        <span class="usuarios-location-inline" title="${attr(getUsuarioLocation(item))}">
          ${escapeHtml(getUsuarioLocation(item))}
        </span>
      </td>

      <td class="usuarios-cell usuarios-cell--activity" data-column="activity">
        <span
          class="usuarios-activity-inline"
          title="${attr(lastLoginRaw ? formatDateTime(lastLoginRaw) : "Sin acceso")}"
        >
          ${escapeHtml(lastLoginRaw ? formatLastAccess(lastLoginRaw) : "Sin acceso")}
        </span>
      </td>
    </tr>
  `;
}

/* =========================================================
   FILTERS / SEARCH
========================================================= */

function renderSearch(input = {}) {
  const search = getSearchQuery(input);

  return `
    <div class="usuarios-search" role="search" aria-label="Buscar usuarios">
      <span class="usuarios-search-icon" aria-hidden="true">
        ${icon("search")}
      </span>

      <input
        id="usuarios-search-input"
        class="usuarios-search-input"
        type="search"
        value="${attr(search)}"
        placeholder="Buscar nombre, email, ciudad, teléfono, ID..."
        autocomplete="off"
        spellcheck="false"
        data-usuarios-search-input="true"
        data-usuarios-field="search"
        data-field="search"
        aria-label="Buscar usuarios por nombre, email, ciudad, teléfono o identificador"
      >

      ${
        search
          ? `<button
              type="button"
              class="usuarios-search-clear"
              data-usuarios-action="${USUARIOS_ACTIONS.CLEAR_SEARCH}"
              data-action="clear-search"
              aria-label="Limpiar búsqueda"
            >${icon("close")}</button>`
          : ""
      }
    </div>
  `;
}

function renderFilters(input = {}, pagination = {}) {
  const data = safeObject(input);
  const items = getResolvedItems(data);
  const counts = computeFilterCounts(items, data);

  const active =
    normalizeFilter(
      pagination.activeFilter ||
      getActiveFilter(data)
    );

  return `
    <div class="usuarios-filters" data-usuarios-filters="true">
      <div class="usuarios-filter-pills" role="tablist" aria-label="Filtrar usuarios por estado">
        ${FILTERS
          .map((filter) => {
            const selected =
              filter.key === active;

            return `
              <button
                type="button"
                role="tab"
                class="usuarios-filter-pill${selected ? " is-active" : ""}"
                data-usuarios-action="${USUARIOS_ACTIONS.FILTER}"
                data-action="filter-usuarios"
                data-filter="${attr(filter.key)}"
                data-filter-status="${attr(filter.key)}"
                aria-selected="${selected ? "true" : "false"}"
                aria-pressed="${selected ? "true" : "false"}"
              >
                <span>${escapeHtml(filter.label)}</span>
                <strong>${escapeHtml(formatNumber(counts[filter.key] || 0))}</strong>
              </button>
            `;
          })
          .join("")}
      </div>

      ${renderSearch(data)}
    </div>
  `;
}

/* =========================================================
   HEADER
========================================================= */

function shouldRenderRestricted(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);

  return Boolean(
    first(
      data.forbidden,
      data.restricted,
      data.accessDenied,
      state.forbidden,
      state.restricted,
      state.accessDenied,
      false
    )
  );
}

export function renderHeader(input = {}) {
  const data = safeObject(input);
  const items = getResolvedItems(data);
  const state = safeObject(data.state);
  const stats = computeStats(items);
  const remoteCount = resolveRemoteCount(data, items);

  const updatedAt =
    first(
      data.lastUpdatedAt,
      data.updatedAt,
      state.lastSyncAt,
      state.lastUpdatedAt,
      state.updatedAt,
      ...items.map(getUpdatedAt)
    );

  const title =
    safeText(
      first(
        data.title,
        state.title,
        "Centro de control de usuarios"
      ),
      "Centro de control de usuarios"
    );

  const subtitle =
    safeText(
      first(
        data.subtitle,
        state.subtitle,
        "Consulta usuarios registrados, revisa su estado, ubicación y última conexión desde una vista clara y alineada con el resto del panel."
      ),
      ""
    );

  const creating =
    Boolean(
      first(
        state.creating,
        data.creating,
        false
      )
    );

  const refreshing =
    Boolean(
      first(
        state.refreshing,
        data.refreshing,
        false
      )
    );

  const loading =
    Boolean(
      first(
        state.loading,
        data.loading,
        false
      )
    );

  const exporting =
    Boolean(
      first(
        state.exporting,
        data.exporting,
        false
      )
    );

  const admin =
    data.admin !== false &&
    !shouldRenderRestricted(data);

  const busy =
    creating ||
    refreshing ||
    loading ||
    exporting;

  return `
    <section
      class="usuarios-hero${busy ? " is-busy" : ""}"
      data-usuarios-hero="true"
      aria-busy="${busy ? "true" : "false"}"
    >
      <div class="usuarios-hero-top">
        <div class="usuarios-hero-copy">
          <h1 class="usuarios-page-title usuarios-title">
            ${escapeHtml(title)}
          </h1>

          <p class="usuarios-page-subtitle usuarios-subtitle">
            ${escapeHtml(subtitle)}
          </p>
        </div>

        ${
          admin
            ? `<div class="usuarios-hero-actions">
                <button
                  type="button"
                  id="usuarios-create-btn"
                  class="usuarios-btn usuarios-btn--primary usuarios-btn--create${creating ? " is-loading" : ""}"
                  data-usuarios-action="${USUARIOS_ACTIONS.CREATE}"
                  data-action="create-user"
                  ${htmlAttrs({
                    disabled:
                      creating || loading,
                    "aria-disabled":
                      creating || loading
                        ? "true"
                        : false,
                    "aria-busy":
                      creating
                        ? "true"
                        : false,
                  })}
                >
                  ${
                    creating
                      ? renderSpinner("Abriendo...")
                      : `${icon("plus")}<span class="usuarios-btn-text">Nuevo usuario</span>`
                  }
                </button>

                <button
                  type="button"
                  id="usuarios-refresh-btn"
                  class="usuarios-btn${refreshing ? " is-loading" : ""}"
                  data-usuarios-action="${USUARIOS_ACTIONS.REFRESH}"
                  data-action="refresh"
                  ${htmlAttrs({
                    disabled:
                      refreshing || loading,
                    "aria-disabled":
                      refreshing || loading
                        ? "true"
                        : false,
                    "aria-busy":
                      refreshing
                        ? "true"
                        : false,
                  })}
                >
                  ${
                    refreshing
                      ? renderSpinner("Actualizando...")
                      : `${icon("refresh")}<span class="usuarios-btn-text">Actualizar</span>`
                  }
                </button>

                <button
                  type="button"
                  id="usuarios-export-btn"
                  class="usuarios-btn usuarios-btn--export${exporting ? " is-loading" : ""}"
                  data-usuarios-action="${USUARIOS_ACTIONS.EXPORT}"
                  data-action="export-csv"
                  ${htmlAttrs({
                    disabled:
                      loading ||
                      refreshing ||
                      exporting ||
                      !items.length,
                    "aria-disabled":
                      loading ||
                      refreshing ||
                      exporting ||
                      !items.length
                        ? "true"
                        : false,
                    "aria-busy":
                      exporting
                        ? "true"
                        : false,
                  })}
                >
                  ${
                    exporting
                      ? renderSpinner("Exportando...")
                      : `${icon("export")}<span class="usuarios-btn-text">Exportar CSV</span>`
                  }
                </button>
              </div>`
            : ""
        }
      </div>

      <div class="usuarios-hero-meta">
        ${
          admin
            ? `<span class="usuarios-meta-pill">${icon("shield")}<span>Panel admin</span></span>`
            : ""
        }

        <span class="usuarios-meta-pill">
          ${icon("users")}
          <span>${escapeHtml(`${formatNumber(remoteCount)} usuarios registrados`)}</span>
        </span>

        <span class="usuarios-meta-pill">
          ${icon("refresh")}
          <span>
            ${
              updatedAt
                ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`)
                : "Sin sincronización reciente"
            }
          </span>
        </span>

        <span class="usuarios-meta-pill">
          ${icon("clock")}
          <span>${escapeHtml(`${formatNumber(stats.withAccessCount)} con actividad`)}</span>
        </span>
      </div>

      <div class="usuarios-stats">
        <article class="usuarios-stat-card usuarios-stat-card--total" data-stat="total">
          <div class="usuarios-stat-label">Usuarios visibles</div>
          <div class="usuarios-stat-value">${escapeHtml(formatNumber(stats.total))}</div>
          <div class="usuarios-stat-text">Cuentas cargadas en la colección actual.</div>
        </article>

        <article class="usuarios-stat-card usuarios-stat-card--active" data-stat="active">
          <div class="usuarios-stat-label">Activos</div>
          <div class="usuarios-stat-value">${escapeHtml(formatNumber(stats.activeCount))}</div>
          <div class="usuarios-stat-text">Usuarios operativos o habilitados actualmente.</div>
        </article>

        <article class="usuarios-stat-card usuarios-stat-card--pending" data-stat="pending">
          <div class="usuarios-stat-label">Pendientes</div>
          <div class="usuarios-stat-value">${escapeHtml(formatNumber(stats.pendingCount))}</div>
          <div class="usuarios-stat-text">Cuentas pendientes de completar su activación.</div>
        </article>

        <article class="usuarios-stat-card usuarios-stat-card--blocked" data-stat="blocked">
          <div class="usuarios-stat-label">Bloqueados</div>
          <div class="usuarios-stat-value">${escapeHtml(formatNumber(stats.blockedCount))}</div>
          <div class="usuarios-stat-text">Cuentas bloqueadas o inactivas.</div>
        </article>
      </div>
    </section>
  `;
}

/* =========================================================
   TABLE / STATES
========================================================= */

function renderColgroup() {
  return `
    <colgroup>
      ${USUARIOS_TABLE_COLUMNS
        .map(
          (column) =>
            `<col class="${attr(column.colClass)}">`
        )
        .join("")}
    </colgroup>
  `;
}

function renderThead() {
  return `
    <thead>
      <tr>
        ${USUARIOS_TABLE_COLUMNS
          .map(
            (column) => `
              <th
                class="${attr(column.thClass)}"
                scope="col"
                data-column="${attr(column.key)}"
              >${escapeHtml(column.label)}</th>
            `
          )
          .join("")}
      </tr>
    </thead>
  `;
}

function renderTableLoading(rows = DEFAULT_VISIBLE_ROWS) {
  const count =
    clamp(rows, 4, 20);

  return `
    <div class="usuarios-table-wrap is-loading" data-usuarios-table-wrap="true">
      <div class="usuarios-table-loading" aria-hidden="true">
        <div class="usuarios-table-shell">
          <table
            class="usuarios-table usuarios-table--no-actions usuarios-table--scale-110"
            role="table"
            aria-label="Cargando usuarios"
            data-table-columns="${attr(String(USUARIOS_TABLE_COLUMNS.length))}"
            data-table-actions="false"
            data-table-scale="${TABLE_SCALE}"
          >
            ${renderColgroup()}
            ${renderThead()}

            <tbody>
              ${Array
                .from({ length: count })
                .map(
                  (_, index) => `
                    <tr
                      class="usuarios-row usuarios-row--skeleton"
                      aria-hidden="true"
                      data-skeleton-row="${index + 1}"
                    >
                      ${USUARIOS_TABLE_COLUMNS
                        .map(
                          (column) => `
                            <td
                              class="${attr(column.cellClass)}"
                              data-column="${attr(column.key)}"
                            >
                              <span class="usuarios-skeleton usuarios-skeleton--${attr(column.key)}"></span>
                            </td>
                          `
                        )
                        .join("")}
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderRefreshOverlay() {
  return `
    <div
      class="usuarios-refresh-overlay"
      aria-live="polite"
      aria-busy="true"
    >
      <div class="usuarios-refresh-card">
        ${renderSpinner("Actualizando usuarios...")}
      </div>
    </div>
  `;
}

function renderEmptyContent({
  hasError = false,
  filtering = false,
  searchQuery = "",
  message = "",
  restricted = false,
  allowCreate = true,
} = {}) {
  if (restricted) {
    return `
      <div class="usuarios-empty usuarios-empty--forbidden" data-usuarios-empty="true">
        <div class="usuarios-empty-icon" aria-hidden="true">${icon("shield")}</div>
        <h3 class="usuarios-empty-title">Acceso restringido</h3>
        <p class="usuarios-empty-text">La vista de usuarios está reservada para administradores.</p>
      </div>
    `;
  }

  const title =
    hasError
      ? "No se pudieron cargar los usuarios"
      : filtering
        ? "No hay usuarios con este criterio"
        : "No hay usuarios para mostrar";

  const text =
    hasError
      ? safeText(
          message,
          "Puedes reintentar la carga desde el botón de actualizar."
        )
      : filtering
        ? searchQuery
          ? `No se encontraron usuarios para “${searchQuery}”. Prueba con otro nombre, email, ciudad o identificador.`
          : "Cambia el filtro activo para volver al listado completo."
        : "Cuando haya usuarios registrados aparecerán aquí con su estado, alta, email, ubicación y última conexión.";

  return `
    <div class="usuarios-empty" data-usuarios-empty="true">
      <div class="usuarios-empty-icon" aria-hidden="true">
        ${hasError ? icon("alert") : icon("users")}
      </div>

      <h3 class="usuarios-empty-title">${escapeHtml(title)}</h3>
      <p class="usuarios-empty-text">${escapeHtml(text)}</p>

      ${
        hasError
          ? `<button
              type="button"
              class="usuarios-btn usuarios-btn--primary"
              data-usuarios-action="${USUARIOS_ACTIONS.RETRY}"
              data-action="retry"
            >
              ${icon("refresh")}
              <span class="usuarios-btn-text">Reintentar</span>
            </button>`
          : filtering
            ? `<button
                type="button"
                class="usuarios-btn"
                data-usuarios-action="${USUARIOS_ACTIONS.CLEAR_FILTERS}"
                data-action="clear-filters"
              >
                ${icon("close")}
                <span class="usuarios-btn-text">Limpiar filtros</span>
              </button>`
            : allowCreate
              ? `<button
                  type="button"
                  class="usuarios-btn usuarios-btn--primary usuarios-btn--create"
                  data-usuarios-action="${USUARIOS_ACTIONS.CREATE}"
                  data-action="create-user"
                >
                  ${icon("plus")}
                  <span class="usuarios-btn-text">Crear usuario</span>
                </button>`
              : ""
      }
    </div>
  `;
}

function renderFeedFooter(pagination = {}, state = {}) {
  const runtime = safeObject(state);
  const disabled =
    Boolean(
      runtime.loading ||
      runtime.refreshing
    );

  if (
    !pagination.totalCount ||
    !pagination.visibleCount
  ) {
    return `<div class="usuarios-feed-sentinel" data-usuarios-load-more="true" aria-hidden="true"></div>`;
  }

  if (!pagination.hasMore) {
    return `
      <div class="usuarios-feed-end" data-usuarios-feed-end="true">
        <span class="usuarios-feed-end-text">
          Has visto todos los usuarios disponibles.
        </span>
      </div>
    `;
  }

  const nextLimit =
    Math.max(
      pagination.visibleLimit +
      DEFAULT_VISIBLE_ROWS,
      pagination.visibleCount +
      DEFAULT_VISIBLE_ROWS
    );

  return `
    <div class="usuarios-feed-more" data-usuarios-feed-more="true">
      <button
        type="button"
        class="usuarios-load-more-btn"
        data-usuarios-action="${USUARIOS_ACTIONS.LOAD_MORE}"
        data-action="load-more"
        data-visible-limit="${attr(String(nextLimit))}"
        data-limit="${attr(String(nextLimit))}"
        ${htmlAttrs({
          disabled,
          "aria-disabled":
            disabled
              ? "true"
              : false,
        })}
      >
        ${icon("chevronDown")}
        <span>Mostrar más</span>
        <span class="usuarios-load-more-count">
          ${escapeHtml(`${formatNumber(pagination.remainingCount)} restantes`)}
        </span>
      </button>

      <span class="usuarios-feed-progress">
        ${escapeHtml(`Mostrando ${formatNumber(pagination.visibleCount)} de ${formatNumber(pagination.totalCount)}`)}
      </span>
    </div>
  `;
}

export function renderLoadingState() {
  return `
    <section
      class="usuarios-history is-loading"
      data-usuarios-history="true"
      aria-live="polite"
      aria-busy="true"
    >
      <div class="usuarios-history-head">
        <div class="usuarios-history-copy">
          <h2 class="usuarios-history-title">Historial de usuarios</h2>
          <p class="usuarios-history-subtitle">Cargando usuarios...</p>
        </div>
      </div>

      ${renderTableLoading(DEFAULT_VISIBLE_ROWS)}
    </section>
  `;
}

export function renderErrorState(
  message = "No se pudieron cargar los usuarios."
) {
  return `
    <section class="usuarios-error" role="alert" aria-live="assertive">
      <div class="usuarios-error-icon" aria-hidden="true">
        ${icon("alert")}
      </div>

      <div class="usuarios-error-copy">
        <h3 class="usuarios-error-title">No se pudo cargar la vista de usuarios</h3>
        <p class="usuarios-error-text">
          ${escapeHtml(safeText(message, "Error desconocido al cargar la vista."))}
        </p>
      </div>

      <button
        type="button"
        class="usuarios-btn usuarios-btn--primary"
        data-usuarios-action="${USUARIOS_ACTIONS.RETRY}"
        data-action="retry"
      >
        ${icon("refresh")}
        <span class="usuarios-btn-text">Reintentar</span>
      </button>
    </section>
  `;
}

export function renderAccessDeniedState() {
  return `
    <section class="usuarios-history" data-usuarios-history="true">
      ${renderEmptyContent({
        restricted: true,
        allowCreate: false,
      })}
    </section>
  `;
}

export function renderEmptyUsuariosState(options = {}) {
  return `
    <section class="usuarios-history">
      ${renderEmptyContent(options)}
    </section>
  `;
}

export function renderTable(input = {}) {
  const data = safeObject(input);
  const items = getResolvedItems(data);
  const state = safeObject(data.state);
  const pagination = getPagination(items, data);

  const loading =
    Boolean(
      first(
        state.loading,
        data.loading,
        false
      )
    );

  const refreshing =
    Boolean(
      first(
        state.refreshing,
        data.refreshing,
        false
      )
    );

  const errorMessage =
    safeText(
      first(
        state.error,
        data.error,
        ""
      ),
      ""
    );

  const hasError =
    Boolean(errorMessage);

  const initialLoading =
    loading &&
    !pagination.pageItems.length;

  const refreshOverlay =
    refreshing &&
    pagination.pageItems.length;

  const search =
    pagination.searchQuery;

  const criteria = [
    pagination.activeFilter !== "all"
      ? getFilterLabel(
          pagination.activeFilter
        )
      : "",
    search
      ? `búsqueda “${search}”`
      : "",
  ].filter(Boolean);

  const subtitle =
    initialLoading
      ? "Cargando usuarios..."
      : pagination.filtering
        ? `Mostrando ${formatNumber(pagination.visibleCount)} de ${formatNumber(pagination.totalCount)} · ${criteria.join(" · ")}`
        : `Mostrando ${formatNumber(pagination.visibleCount)} de ${formatNumber(pagination.totalCount)}`;

  const admin =
    data.admin !== false &&
    !shouldRenderRestricted(data);

  return `
    <section
      class="usuarios-history${loading ? " is-loading" : ""}${refreshing ? " is-refreshing" : ""}${hasError ? " has-error" : ""}"
      data-usuarios-history="true"
      data-usuarios-scroll-host="true"
      data-usuarios-scroll-mode="infinite"
      data-visible-limit="${attr(String(pagination.visibleLimit))}"
      data-visible="${attr(String(pagination.visibleCount))}"
      data-has-more="${pagination.hasMore ? "true" : "false"}"
      data-remaining="${attr(String(pagination.remainingCount))}"
      data-filter="${attr(pagination.activeFilter)}"
      data-search-active="${search ? "true" : "false"}"
      aria-live="polite"
      aria-busy="${loading || refreshing ? "true" : "false"}"
    >
      <div class="usuarios-history-head" data-usuarios-history-head="true">
        <div class="usuarios-history-copy">
          <h2 class="usuarios-history-title">Historial de usuarios</h2>
          <p class="usuarios-history-subtitle">${escapeHtml(subtitle)}</p>
        </div>

        ${renderFilters(data, pagination)}
      </div>

      ${
        initialLoading
          ? renderTableLoading(
              pagination.visibleLimit
            )
          : `<div
              class="usuarios-table-wrap${refreshing ? " is-refreshing" : ""}"
              data-usuarios-table-wrap="true"
            >
              ${refreshOverlay ? renderRefreshOverlay() : ""}

              ${
                pagination.pageItems.length
                  ? `<div class="usuarios-table-shell">
                      <table
                        class="usuarios-table usuarios-table--no-actions usuarios-table--scale-110"
                        role="table"
                        aria-label="Listado de usuarios"
                        data-table-columns="${attr(String(USUARIOS_TABLE_COLUMNS.length))}"
                        data-table-actions="false"
                        data-table-scale="${TABLE_SCALE}"
                      >
                        ${renderColgroup()}
                        ${renderThead()}
                        <tbody>
                          ${pagination.pageItems
                            .map(
                              (item) =>
                                renderRow(item, state)
                            )
                            .join("")}
                        </tbody>
                      </table>
                    </div>

                    ${renderFeedFooter(pagination, state)}`
                  : renderEmptyContent({
                      hasError,
                      filtering:
                        pagination.filtering,
                      searchQuery:
                        search,
                      message:
                        errorMessage,
                      allowCreate:
                        admin,
                    })
              }
            </div>`
      }
    </section>
  `;
}

/* =========================================================
   PUBLIC / COMPAT
========================================================= */

export function renderEmptyState(options = {}) {
  return `
    <section class="usuarios-history">
      ${renderEmptyContent({
        hasError:
          Boolean(options?.hasError),
        filtering:
          Boolean(options?.filtering),
        searchQuery:
          safeText(options?.searchQuery, ""),
        message:
          safeText(options?.message, ""),
        restricted:
          Boolean(options?.restricted),
        allowCreate:
          options?.allowCreate !== false,
      })}
    </section>
  `;
}

export const renderCards =
  renderTable;

export function renderUsuariosTableTemplate(input = {}) {
  const data = safeObject(input);
  const items = getResolvedItems(data);
  const state = safeObject(data.state);

  const error =
    safeText(
      first(
        state.error,
        data.error,
        ""
      ),
      ""
    );

  const loading =
    Boolean(
      first(
        state.loading,
        data.loading,
        false
      )
    );

  const refreshing =
    Boolean(
      first(
        state.refreshing,
        data.refreshing,
        false
      )
    );

  const pagination =
    getPagination(
      items,
      data
    );

  const rootAttrs = `
    data-usuarios-scope="true"
    data-template-version="${attr(USUARIOS_TABLE_TEMPLATE_VERSION)}"
    data-total="${attr(String(pagination.totalCount))}"
    data-visible="${attr(String(pagination.visibleCount))}"
    data-visible-limit="${attr(String(pagination.visibleLimit))}"
    data-has-more="${pagination.hasMore ? "true" : "false"}"
    data-filter="${attr(pagination.activeFilter)}"
    data-search-active="${pagination.searchQuery ? "true" : "false"}"
    data-loading="${loading ? "true" : "false"}"
    data-refreshing="${refreshing ? "true" : "false"}"
    data-canonical-model="true"
    data-table-columns="${attr(String(USUARIOS_TABLE_COLUMNS.length))}"
    data-table-actions="false"
    data-table-scale="${TABLE_SCALE}"
  `;

  if (shouldRenderRestricted(data)) {
    return `
      <section class="usuarios-view-root is-restricted" ${rootAttrs} aria-busy="false">
        ${renderAccessDeniedState()}
      </section>
    `;
  }

  if (
    error &&
    !items.length
  ) {
    return `
      <section class="usuarios-view-root has-error" ${rootAttrs} aria-busy="false">
        ${renderErrorState(error)}
      </section>
    `;
  }

  const payload = {
    ...data,
    items,
    state,
  };

  return `
    <section
      class="usuarios-view-root${loading ? " is-loading" : ""}${refreshing ? " is-refreshing" : ""}${error ? " has-error" : ""}"
      ${rootAttrs}
      aria-busy="${loading || refreshing ? "true" : "false"}"
    >
      ${renderHeader(payload)}
      ${renderTable(payload)}
    </section>
  `;
}

export function getUsuariosTableTemplateSnapshot(input = {}) {
  const data = safeObject(input);
  const items = getResolvedItems(data);
  const pagination = getPagination(items, data);

  return {
    version:
      USUARIOS_TABLE_TEMPLATE_VERSION,
    actions:
      USUARIOS_TABLE_ACTIONS,
    columns:
      USUARIOS_TABLE_COLUMNS
        .map(
          (column) =>
            column.key
        ),
    tableColumns:
      USUARIOS_TABLE_COLUMNS.length,
    tableActions:
      false,
    tableScale:
      TABLE_SCALE,
    total:
      pagination.totalCount,
    visible:
      pagination.visibleCount,
    visibleLimit:
      pagination.visibleLimit,
    remainingCount:
      pagination.remainingCount,
    hasMore:
      pagination.hasMore,
    filter:
      pagination.activeFilter,
    searchLength:
      pagination.searchQuery.length,
    restricted:
      shouldRenderRestricted(data),
    canonicalModel:
      true,
    architecture: {
      http: false,
      store: false,
      router: false,
      auth: false,
      dom: false,
      backendSorting: false,
      presentationFiltering: true,
      presentationLoadMore: true,
      paginationUi: false,
      rowDetailAction: true,
      actionsColumn: false,
      safeAvatarUrls: true,
      azureBlobSasRuntimeAllowed: true,
      externalSasRejected: true,
      dataImageAvatarAllowed: false,
      escapeHtml: true,
    },
    cssContract: {
      root: "usuarios-view-root",
      header: "usuarios-hero",
      history: "usuarios-history",
      filters: "usuarios-filters",
      table: "usuarios-table",
      row: "usuarios-row",
      columns:
        "main,status,date,email,location,activity",
      avatarTone:
        "usuarios-avatar-tone-0..9 + data-avatar-tone",
    },
  };
}

export const renderTemplate =
  renderUsuariosTableTemplate;
export const renderUsuariosTemplate =
  renderUsuariosTableTemplate;
export const getSnapshot =
  getUsuariosTableTemplateSnapshot;

export default renderUsuariosTableTemplate;
