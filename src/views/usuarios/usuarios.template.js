/* =========================================================
   Onion Support - Usuarios Template
   Archivo: /src/views/usuarios/usuarios.template.js

   PRODUCTIVO · TEMPLATE PURO · CANONICAL MODEL · V19

   Contrato:
   - Recibe usuarios ya normalizados por usuarios.api.js.
   - No interpreta raw/profile/usuario/lifecycle/audit.
   - No hace HTTP, Store, Auth ni Router.
   - Mantiene filtros/búsqueda/load-more de PRESENTACIÓN.
   - Mantiene clases/data-attributes del CSS/controlador actual.
   - Rechaza URLs de avatar peligrosas.
   - Escapa todo contenido dinámico.
   - Sin CSS inyectado ni handlers inline.
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const USUARIOS_TEMPLATE_VERSION =
  "usuarios.template.canonical.v19.api-boundary";

export const USUARIOS_TABLE_TEMPLATE_VERSION =
  USUARIOS_TEMPLATE_VERSION;

export const USUARIOS_VIEW_TEMPLATE_VERSION =
  USUARIOS_TEMPLATE_VERSION;

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

export const USUARIOS_TABLE_ACTIONS =
  USUARIOS_ACTIONS;

export const USUARIOS_DEFAULT_VISIBLE_ROWS = 20;
export const USUARIOS_DEFAULT_PAGE_SIZE =
  USUARIOS_DEFAULT_VISIBLE_ROWS;

const DEFAULT_VISIBLE_ROWS =
  USUARIOS_DEFAULT_VISIBLE_ROWS;

const DEFAULT_PAGE_SIZE =
  USUARIOS_DEFAULT_VISIBLE_ROWS;

const AVATAR_TONE_COUNT = 10;

const FILTERS = Object.freeze([
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "pending", label: "Pendientes" },
  { key: "blocked", label: "Bloqueados" },
]);

export const USUARIOS_TABLE_COLUMNS =
  Object.freeze([
    {
      key: "main",
      label: "Usuario",
      colClass:
        "usuarios-col usuarios-col--main",
    },
    {
      key: "status",
      label: "Estado",
      colClass:
        "usuarios-col usuarios-col--status",
    },
    {
      key: "date",
      label: "Alta",
      colClass:
        "usuarios-col usuarios-col--date",
    },
    {
      key: "email",
      label: "Email",
      colClass:
        "usuarios-col usuarios-col--email",
    },
    {
      key: "location",
      label: "Ciudad",
      colClass:
        "usuarios-col usuarios-col--location",
    },
    {
      key: "activity",
      label: "Última conexión",
      colClass:
        "usuarios-col usuarios-col--activity",
    },
    {
      key: "actions",
      label: "Acciones",
      colClass:
        "usuarios-col usuarios-col--actions",
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
  return Array.isArray(value)
    ? value
    : [];
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
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
  const limit = Math.max(
    1,
    safeNumber(max, 96)
  );

  if (!text) return "";
  if (text.length <= limit) {
    return text;
  }

  return `${text
    .slice(
      0,
      Math.max(0, limit - 1)
    )
    .trim()}…`;
}

function hashString(value = "") {
  const text =
    safeText(value, "onion");

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

/*
  usuarios.api.js ya sanea avatarUrl, pero el template
  mantiene defensa en profundidad.
*/
function safeAvatarUrl(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) return "";

  if (
    raw.startsWith("//") ||
    /[\r\n\t\\]/.test(raw) ||
    /^(javascript|data|vbscript|file):/i.test(
      raw
    )
  ) {
    return "";
  }

  if (
    /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token|sas)=/i.test(
      raw
    )
  ) {
    return "";
  }

  if (/^blob:/i.test(raw)) {
    return raw;
  }

  if (raw.startsWith("/")) {
    return raw.replace(
      /\/{2,}/g,
      "/"
    );
  }

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  if (
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(
      raw
    )
  ) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

/* =========================================================
   DATE HELPERS
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
    if (value <= 0) return 0;

    return value > 9_999_999_999
      ? value
      : value * 1000;
  }

  const raw =
    safeText(value, "");

  if (!raw) return 0;

  const numeric = Number(raw);

  if (
    Number.isFinite(numeric) &&
    numeric > 0
  ) {
    return numeric > 9_999_999_999
      ? numeric
      : numeric * 1000;
  }

  const parsed =
    Date.parse(raw);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatDateTime(value = null) {
  const timestamp =
    toTimestamp(value);

  if (!timestamp) return "—";

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
    ).format(
      new Date(timestamp)
    );
  } catch {
    return "—";
  }
}

function formatDateShort(value = null) {
  const timestamp =
    toTimestamp(value);

  if (!timestamp) return "—";

  try {
    return new Intl.DateTimeFormat(
      "es-ES",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }
    ).format(
      new Date(timestamp)
    );
  } catch {
    return "—";
  }
}

function formatRelativeDate(value = null) {
  const timestamp =
    toTimestamp(value);

  if (!timestamp) {
    return "Sin fecha";
  }

  const diffMs =
    timestamp - Date.now();

  const diffMinutes =
    Math.round(
      diffMs / 60_000
    );

  const absoluteMinutes =
    Math.abs(diffMinutes);

  if (absoluteMinutes < 1) {
    return "Ahora mismo";
  }

  if (absoluteMinutes < 60) {
    return diffMinutes > 0
      ? `En ${absoluteMinutes} min`
      : `Hace ${absoluteMinutes} min`;
  }

  const hours =
    Math.round(
      absoluteMinutes / 60
    );

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

function formatLastUpdate(value = null) {
  const timestamp =
    toTimestamp(value);

  if (!timestamp) {
    return "Sin acceso";
  }

  const diffHours =
    Math.abs(
      Date.now() - timestamp
    ) / 3_600_000;

  return diffHours <= 72
    ? formatRelativeDate(value)
    : formatDateTime(value);
}

/* =========================================================
   ICONS
========================================================= */

function icon(name = "") {
  const common = [
    'aria-hidden="true"',
    'focusable="false"',
    'width="16"',
    'height="16"',
    'viewBox="0 0 24 24"',
    'fill="none"',
    'stroke="currentColor"',
    'stroke-width="2"',
    'stroke-linecap="round"',
    'stroke-linejoin="round"',
  ].join(" ");

  const icons = {
    refresh:
      `<svg ${common}><path d="M21 12a9 9 0 0 1-15.5 6.3"/><path d="M3 12a9 9 0 0 1 15.5-6.3"/><path d="M21 4v6h-6"/><path d="M3 20v-6h6"/></svg>`,

    export:
      `<svg ${common}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,

    plus:
      `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,

    users:
      `<svg ${common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,

    eye:
      `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,

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
  };

  return (
    icons[name] ||
    icons.users
  );
}

/* =========================================================
   CANONICAL USER READERS
========================================================= */

function getResolvedItems(input = {}) {
  if (Array.isArray(input)) {
    return input.filter(isObject);
  }

  const data =
    safeObject(input);

  for (const candidate of [
    data.items,
    data.users,
    data.usuarios,
    data.rows,
    data.results,
  ]) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        isObject
      );
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
    safeText(
      item.nif,
      ""
    );

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
  const email =
    safeText(
      first(
        item.email,
        item.emailLower,
        item.mail,
        ""
      ),
      ""
    ).toLowerCase();

  return email ||
    "Sin email";
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
  const text =
    getUsuarioName(item);

  const parts = text
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 1) {
    return (
      parts[0]
        .slice(0, 2)
        .toUpperCase() ||
      "US"
    );
  }

  return (
    `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`
      .toUpperCase() ||
    "US"
  );
}

function getUsuarioRoleValue(item = {}) {
  const role =
    normalizeKey(
      first(
        item.role,
        item.rol,
        "user"
      )
    );

  return role === "admin"
    ? "admin"
    : "user";
}

function getUsuarioRoleLabel(item = {}) {
  return getUsuarioRoleValue(item) ===
    "admin"
    ? "Admin"
    : "Usuario";
}

function getStatusKey(value = "") {
  const key =
    normalizeKey(value);

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
  const key =
    getStatusKey(value);

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

function isActiveLike(item = {}) {
  return (
    getStatusValue(item) ===
    "active"
  );
}

function isPendingLike(item = {}) {
  return (
    getStatusValue(item) ===
    "pending"
  );
}

function isBlockedLike(item = {}) {
  return [
    "blocked",
    "inactive",
  ].includes(
    getStatusValue(item)
  );
}

function hasAccessLike(item = {}) {
  return Boolean(
    toTimestamp(
      getLastLoginAt(item)
    )
  );
}

/* =========================================================
   FILTERS / SEARCH
========================================================= */

function normalizeFilter(value = "") {
  const key =
    normalizeKey(value);

  if (
    key === "active" ||
    key === "pending" ||
    key === "blocked"
  ) {
    return key;
  }

  return "all";
}

function getActiveFilter(input = {}) {
  const data =
    safeObject(input);

  const state =
    safeObject(data.state);

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
  const data =
    safeObject(input);

  const state =
    safeObject(data.state);

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

function itemMatchesFilter(
  item = {},
  filter = "all"
) {
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

function itemMatchesSearch(
  item = {},
  query = ""
) {
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

function filterUsuariosForView(
  items = [],
  input = {}
) {
  const filter =
    getActiveFilter(input);

  const search =
    getSearchQuery(input);

  /*
    NO se vuelve a ordenar.
    usuarios.api.js ya entrega el orden canónico.
  */
  return safeArray(items).filter(
    (item) =>
      itemMatchesFilter(
        item,
        filter
      ) &&
      itemMatchesSearch(
        item,
        search
      )
  );
}

function isFilterActive(input = {}) {
  return (
    getActiveFilter(input) !==
      "all" ||
    Boolean(
      getSearchQuery(input)
    )
  );
}

function computeFilterCounts(
  items = [],
  input = {}
) {
  const search =
    getSearchQuery(input);

  const searchable =
    safeArray(items).filter(
      (item) =>
        itemMatchesSearch(
          item,
          search
        )
    );

  return {
    all: searchable.length,

    active:
      searchable.filter(
        isActiveLike
      ).length,

    pending:
      searchable.filter(
        isPendingLike
      ).length,

    blocked:
      searchable.filter(
        isBlockedLike
      ).length,
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

/* =========================================================
   STATS / PAGINATION
========================================================= */

function computeStats(items = []) {
  const rows =
    safeArray(items);

  return {
    total:
      rows.length,

    activeCount:
      rows.filter(
        isActiveLike
      ).length,

    pendingCount:
      rows.filter(
        isPendingLike
      ).length,

    blockedCount:
      rows.filter(
        isBlockedLike
      ).length,

    withAccessCount:
      rows.filter(
        hasAccessLike
      ).length,
  };
}

function resolveRemoteCount(
  input = {},
  items = []
) {
  const data =
    safeObject(input);

  const state =
    safeObject(data.state);

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

function normalizeVisibleLimit(
  input = {}
) {
  const data =
    safeObject(input);

  const state =
    safeObject(data.state);

  return clamp(
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
}

function getPagination(
  items = [],
  input = {}
) {
  const allItems =
    filterUsuariosForView(
      items,
      input
    );

  const visibleLimit =
    normalizeVisibleLimit(
      input
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
    visibleItems:
      pageItems,

    pageSize:
      visibleLimit,
    visibleLimit,
    visibleCount,
    remainingCount,

    currentPage: 1,
    totalPages: 1,

    totalCount,

    unfilteredCount:
      safeArray(items).length,

    remoteTotal,

    rangeStart:
      totalCount &&
      visibleCount
        ? 1
        : 0,

    rangeEnd:
      visibleCount,

    hasPrev: false,
    hasNext: false,

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
      <span
        class="usuarios-inline-spinner"
        aria-hidden="true"
      ></span>
      ${
        label
          ? `<span class="usuarios-inline-loading-text">${escapeHtml(label)}</span>`
          : ""
      }
    </span>
  `;
}

function renderLoaderOnly(
  label = "Cargando"
) {
  return `
    <span
      class="usuarios-loader-only"
      role="status"
      aria-label="${escapeHtml(label)}"
    >
      <span
        class="usuarios-inline-spinner"
        aria-hidden="true"
      ></span>
    </span>
  `;
}

function getAvatarToneClass(item = {}) {
  const seed =
    `${getUsuarioId(item)}|${getUsuarioEmail(item)}|${getUsuarioName(item)}`;

  const tone =
    (
      hashString(seed) %
      AVATAR_TONE_COUNT
    ) + 1;

  return (
    `usuarios-avatar--tone-${tone}`
  );
}

function renderAvatar(item = {}) {
  const fullName =
    getUsuarioName(item);

  const initials =
    getUsuarioInitials(item);

  const avatarUrl =
    getUsuarioAvatarUrl(item);

  const hasAvatar =
    Boolean(avatarUrl);

  const toneClass =
    getAvatarToneClass(item);

  return `
    <div
      class="usuarios-avatar ${toneClass}${hasAvatar ? " has-image" : " usuarios-avatar--fallback"}"
      aria-label="${escapeHtml(fullName)}"
      data-tooltip="${escapeHtml(fullName)}"
      data-has-avatar="${hasAvatar ? "true" : "false"}"
    >
      ${
        hasAvatar
          ? `
            <img
              class="usuarios-avatar-img"
              src="${escapeHtml(avatarUrl)}"
              alt=""
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              draggable="false"
            />
          `
          : ""
      }

      <span class="usuarios-avatar-fallback">
        ${escapeHtml(initials)}
      </span>
    </div>
  `;
}

function renderStatusChip(item = {}) {
  const status =
    getStatusValue(item);

  return `
    <span class="usuarios-chip usuarios-chip--${escapeHtml(status)}">
      <span
        class="usuarios-chip-dot"
        aria-hidden="true"
      ></span>
      ${escapeHtml(
        getStatusLabel(status)
      )}
    </span>
  `;
}

function renderActionButton({
  action = "detail",
  userId = "",
  label = "Detalle",
  loadingLabel = "Cargando detalle",
  loading = false,
  disabled = false,
  iconName = "eye",
  tooltip = "",
} = {}) {
  const finalDisabled =
    disabled || loading;

  const finalTooltip =
    tooltip || label;

  return `
    <button
      type="button"
      class="usuarios-detail-btn${loading ? " is-loading" : ""}"
      data-usuarios-action="${escapeHtml(action)}"
      data-action="${escapeHtml(
        action === "detail"
          ? "open-user"
          : action
      )}"
      data-user-id="${escapeHtml(userId)}"
      data-tooltip="${escapeHtml(finalTooltip)}"
      aria-label="${escapeHtml(finalTooltip)}"
      ${
        finalDisabled
          ? 'disabled aria-disabled="true"'
          : ""
      }
      ${
        loading
          ? 'aria-busy="true"'
          : ""
      }
    >
      ${
        loading
          ? renderLoaderOnly(
              loadingLabel
            )
          : `
            <span class="usuarios-action-icon">
              ${icon(iconName)}
            </span>
            <span class="usuarios-btn-text">
              ${escapeHtml(label)}
            </span>
          `
      }
    </button>
  `;
}

function renderRow(
  item = {},
  state = {}
) {
  const runtime =
    safeObject(state);

  const userId =
    getUsuarioId(item);

  const code =
    getUsuarioCode(item);

  const name =
    getUsuarioName(item);

  const role =
    getUsuarioRoleLabel(item);

  const preview =
    truncate(
      getUsuarioDescription(item),
      96
    );

  const email =
    getUsuarioEmail(item);

  const city =
    getUsuarioLocation(item);

  const createdRaw =
    getCreatedAt(item);

  const createdAt =
    formatDateShort(
      createdRaw
    );

  const createdTooltip =
    formatDateTime(
      createdRaw
    );

  const lastLoginRaw =
    getLastLoginAt(item);

  const lastLogin =
    lastLoginRaw
      ? formatLastUpdate(
          lastLoginRaw
        )
      : "Sin acceso";

  const lastLoginTooltip =
    lastLoginRaw
      ? formatDateTime(
          lastLoginRaw
        )
      : "Sin acceso";

  const status =
    getStatusValue(item);

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
      openingUserId ===
        userId
    );

  return `
    <tr
      class="usuarios-row usuarios-row--${escapeHtml(status)}${isOpening ? " is-loading" : ""}"
      data-user-row="true"
      data-user-id="${escapeHtml(userId)}"
      data-usuario-id="${escapeHtml(userId)}"
      data-usuarios-action="${USUARIOS_TABLE_ACTIONS.DETAIL}"
      data-action="open-user"
      tabindex="0"
      role="button"
      aria-label="Abrir detalle de ${escapeHtml(name)}"
      ${
        isOpening
          ? 'aria-busy="true"'
          : ""
      }
    >
      <td class="usuarios-cell usuarios-cell--main">
        <div class="usuarios-main">
          ${renderAvatar(item)}

          <div class="usuarios-main-copy">
            <div class="usuarios-user-line">
              <span class="usuarios-user-id">
                ${escapeHtml(code)}
              </span>

              <span class="usuarios-role-pill">
                ${escapeHtml(role)}
              </span>
            </div>

            <div class="usuarios-user-subject">
              ${escapeHtml(name)}
            </div>

            <div class="usuarios-user-description">
              ${escapeHtml(preview)}
            </div>
          </div>
        </div>
      </td>

      <td class="usuarios-cell usuarios-cell--status">
        ${renderStatusChip(item)}
      </td>

      <td class="usuarios-cell usuarios-cell--date">
        <span
          class="usuarios-date-inline"
          data-tooltip="${escapeHtml(createdTooltip)}"
        >
          ${escapeHtml(createdAt)}
        </span>
      </td>

      <td class="usuarios-cell usuarios-cell--email">
        <span
          class="usuarios-email-inline"
          data-tooltip="${escapeHtml(email)}"
        >
          ${escapeHtml(email)}
        </span>
      </td>

      <td class="usuarios-cell usuarios-cell--location">
        <span
          class="usuarios-location-inline"
          data-tooltip="${escapeHtml(city)}"
        >
          ${escapeHtml(city)}
        </span>
      </td>

      <td class="usuarios-cell usuarios-cell--activity">
        <span
          class="usuarios-activity-inline"
          data-tooltip="${escapeHtml(lastLoginTooltip)}"
        >
          ${escapeHtml(lastLogin)}
        </span>
      </td>

      <td class="usuarios-cell usuarios-cell--actions">
        ${renderActionButton({
          userId,
          loading: isOpening,
          label: "Detalle",
          loadingLabel:
            "Cargando detalle",
          iconName: "eye",
          tooltip:
            "Abrir detalle de usuario",
        })}
      </td>
    </tr>
  `;
}

function renderPagination(
  pagination = {},
  state = {}
) {
  const runtime =
    safeObject(state);

  const loading =
    Boolean(runtime.loading);

  const refreshing =
    Boolean(runtime.refreshing);

  if (!pagination.hasMore) {
    return "";
  }

  const disabled =
    loading || refreshing;

  const nextLimit =
    Math.max(
      pagination.visibleLimit +
        DEFAULT_VISIBLE_ROWS,
      pagination.visibleCount +
        DEFAULT_VISIBLE_ROWS
    );

  return `
    <div
      class="usuarios-load-more"
      aria-label="Cargar más usuarios"
    >
      <button
        type="button"
        class="usuarios-load-more-btn usuarios-pagination-btn usuarios-pagination-btn--next"
        data-usuarios-action="load-more"
        data-action="load-more"
        data-visible-limit="${escapeHtml(String(nextLimit))}"
        ${
          disabled
            ? 'disabled aria-disabled="true"'
            : ""
        }
      >
        Cargar más
      </button>

      <span class="usuarios-load-more-status usuarios-pagination-status">
        ${escapeHtml(
          `Mostrando ${pagination.visibleCount} de ${pagination.totalCount}`
        )}
      </span>
    </div>
  `;
}

function renderSearch(input = {}) {
  const searchQuery =
    getSearchQuery(input);

  return `
    <div
      class="usuarios-search"
      role="search"
      aria-label="Buscar usuarios"
    >
      <span
        class="usuarios-search-icon"
        aria-hidden="true"
      >
        ${icon("search")}
      </span>

      <input
        id="usuarios-search-input"
        class="usuarios-search-input"
        type="search"
        value="${escapeHtml(searchQuery)}"
        placeholder="Buscar nombre, email, ciudad, teléfono, ID..."
        autocomplete="off"
        spellcheck="false"
        data-usuarios-search-input="true"
        data-usuarios-field="search"
        data-field="search"
        aria-label="Buscar usuarios por nombre, email, ciudad, teléfono o identificador"
      />

      ${
        searchQuery
          ? `
            <button
              type="button"
              class="usuarios-search-clear"
              data-usuarios-action="clear-search"
              data-action="clear-search"
              data-tooltip="Limpiar búsqueda"
              aria-label="Limpiar búsqueda"
            >
              ${icon("close")}
            </button>
          `
          : ""
      }
    </div>
  `;
}

function renderFilters(
  input = {},
  pagination = {}
) {
  const data =
    safeObject(input);

  const items =
    getResolvedItems(data);

  const counts =
    computeFilterCounts(
      items,
      data
    );

  const activeFilter =
    normalizeFilter(
      pagination.activeFilter ||
      getActiveFilter(data)
    );

  return `
    <div
      class="usuarios-filters"
      aria-label="Filtros y búsqueda de usuarios"
    >
      <div class="usuarios-filter-pills">
        ${FILTERS.map(
          (filter) => {
            const isActive =
              filter.key ===
              activeFilter;

            const count =
              counts[filter.key] ??
              0;

            return `
              <button
                type="button"
                class="usuarios-filter-pill${isActive ? " is-active" : ""}"
                data-usuarios-action="filter"
                data-action="filter-usuarios"
                data-filter="${escapeHtml(filter.key)}"
                data-filter-status="${escapeHtml(filter.key)}"
                aria-pressed="${isActive ? "true" : "false"}"
              >
                <span>
                  ${escapeHtml(filter.label)}
                </span>
                <strong>
                  ${escapeHtml(String(count))}
                </strong>
              </button>
            `;
          }
        ).join("")}
      </div>

      ${renderSearch(data)}
    </div>
  `;
}

function shouldRenderRestricted(
  input = {}
) {
  const data =
    safeObject(input);

  const state =
    safeObject(data.state);

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
      <div class="usuarios-empty usuarios-empty--forbidden">
        <div
          class="usuarios-empty-icon"
          aria-hidden="true"
        >
          ${icon("shield")}
        </div>

        <h3 class="usuarios-empty-title">
          Acceso restringido
        </h3>

        <p class="usuarios-empty-text">
          La vista de usuarios está reservada para administradores.
        </p>
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
        : "Cuando haya usuarios registrados aparecerán aquí con su estado, alta, email, ubicación, última conexión y acciones disponibles.";

  return `
    <div class="usuarios-empty">
      <div
        class="usuarios-empty-icon"
        aria-hidden="true"
      >
        ${
          hasError
            ? icon("alert")
            : icon("users")
        }
      </div>

      <h3 class="usuarios-empty-title">
        ${escapeHtml(title)}
      </h3>

      <p class="usuarios-empty-text">
        ${escapeHtml(text)}
      </p>

      ${
        hasError
          ? `
            <button
              type="button"
              class="usuarios-btn usuarios-btn--primary"
              data-usuarios-action="retry"
              data-action="retry"
            >
              ${icon("refresh")}
              <span class="usuarios-btn-text">
                Reintentar
              </span>
            </button>
          `
          : filtering
            ? `
              <button
                type="button"
                class="usuarios-btn"
                data-usuarios-action="clear-filters"
                data-action="clear-filters"
              >
                ${icon("close")}
                <span class="usuarios-btn-text">
                  Limpiar filtros
                </span>
              </button>
            `
            : allowCreate
              ? `
                <button
                  type="button"
                  class="usuarios-btn usuarios-btn--primary usuarios-btn--create"
                  data-usuarios-action="create"
                  data-action="create-user"
                >
                  ${icon("plus")}
                  <span class="usuarios-btn-text">
                    Crear usuario
                  </span>
                </button>
              `
              : ""
      }
    </div>
  `;
}

function renderTableLoading(
  rows = DEFAULT_PAGE_SIZE
) {
  const amount =
    clamp(rows, 1, 20);

  return `
    <div
      class="usuarios-table-loading"
      aria-hidden="true"
    >
      ${Array.from({
        length: amount,
      })
        .map(
          () => `
            <div class="usuarios-table-loading-row">
              <div class="usuarios-skeleton usuarios-skeleton--avatar"></div>

              <div class="usuarios-table-loading-copy">
                <div class="usuarios-skeleton usuarios-skeleton--xs"></div>
                <div class="usuarios-skeleton usuarios-skeleton--lg"></div>
                <div class="usuarios-skeleton usuarios-skeleton--md"></div>
              </div>

              <div class="usuarios-skeleton usuarios-skeleton--pill"></div>
              <div class="usuarios-skeleton usuarios-skeleton--date"></div>
              <div class="usuarios-skeleton usuarios-skeleton--email"></div>
              <div class="usuarios-skeleton usuarios-skeleton--date"></div>
              <div class="usuarios-skeleton usuarios-skeleton--date"></div>
              <div class="usuarios-skeleton usuarios-skeleton--btn"></div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderRefreshOverlay() {
  return `
    <div
      class="usuarios-refresh-overlay"
      aria-live="polite"
    >
      <div class="usuarios-refresh-card">
        ${renderSpinner(
          "Actualizando usuarios..."
        )}
      </div>
    </div>
  `;
}

/* =========================================================
   HEADER
========================================================= */

export function renderHeader(input = {}) {
  const data =
    safeObject(input);

  const items =
    getResolvedItems(data);

  const state =
    safeObject(data.state);

  const stats =
    computeStats(items);

  const remoteCount =
    resolveRemoteCount(
      data,
      items
    );

  const updatedAt =
    first(
      data.lastUpdatedAt,
      data.updatedAt,
      state.lastSyncAt,
      state.lastUpdatedAt,
      state.updatedAt,
      ...items.map(
        getUpdatedAt
      )
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
        "Consulta usuarios registrados, revisa su estado, ubicación y última conexión desde una vista clara, compacta y alineada con el sistema."
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

  return `
    <section
      class="usuarios-hero${loading || refreshing || creating || exporting ? " is-busy" : ""}"
      data-usuarios-hero="true"
      aria-busy="${loading || refreshing || creating || exporting ? "true" : "false"}"
    >
      <div class="usuarios-hero-top">
        <div class="usuarios-hero-copy">
          <h1 class="usuarios-page-title">
            ${escapeHtml(title)}
          </h1>

          <p class="usuarios-page-subtitle">
            ${escapeHtml(subtitle)}
          </p>
        </div>

        ${
          admin
            ? `
              <div class="usuarios-hero-actions">
                <button
                  type="button"
                  id="usuarios-refresh-btn"
                  class="usuarios-btn${refreshing ? " is-loading" : ""}"
                  data-usuarios-action="refresh"
                  data-action="refresh"
                  ${
                    refreshing || loading
                      ? 'disabled aria-busy="true"'
                      : ""
                  }
                >
                  ${
                    refreshing
                      ? renderSpinner(
                          "Actualizando..."
                        )
                      : `${icon("refresh")}<span class="usuarios-btn-text">Actualizar</span>`
                  }
                </button>

                <button
                  type="button"
                  id="usuarios-export-btn"
                  class="usuarios-btn${exporting ? " is-loading" : ""}"
                  data-usuarios-action="export"
                  data-action="export-csv"
                  ${
                    loading ||
                    refreshing ||
                    exporting ||
                    !items.length
                      ? 'disabled aria-disabled="true"'
                      : ""
                  }
                >
                  ${
                    exporting
                      ? renderSpinner(
                          "Exportando..."
                        )
                      : `${icon("export")}<span class="usuarios-btn-text">Exportar CSV</span>`
                  }
                </button>

                <button
                  type="button"
                  id="usuarios-create-btn"
                  class="usuarios-btn usuarios-btn--primary usuarios-btn--create${creating ? " is-loading" : ""}"
                  data-usuarios-action="create"
                  data-action="create-user"
                  ${
                    creating
                      ? 'disabled aria-busy="true"'
                      : ""
                  }
                >
                  ${
                    creating
                      ? renderSpinner(
                          "Abriendo..."
                        )
                      : `${icon("plus")}<span class="usuarios-btn-text">Nuevo usuario</span>`
                  }
                </button>
              </div>
            `
            : ""
        }
      </div>

      <div class="usuarios-hero-meta">
        ${
          admin
            ? `<span class="usuarios-meta-pill">${icon("shield")}Panel admin</span>`
            : ""
        }

        <span class="usuarios-meta-pill">
          ${icon("users")}
          ${escapeHtml(
            `${remoteCount} usuarios registrados`
          )}
        </span>

        <span class="usuarios-meta-pill">
          ${icon("refresh")}
          ${
            updatedAt
              ? escapeHtml(
                  `Última actualización · ${formatRelativeDate(updatedAt)}`
                )
              : "Sin sincronización reciente"
          }
        </span>

        <span class="usuarios-meta-pill">
          ${icon("clock")}
          ${escapeHtml(
            `${stats.withAccessCount} con actividad`
          )}
        </span>
      </div>

      <div class="usuarios-stats">
        <article class="usuarios-stat-card usuarios-stat-card--total">
          <div class="usuarios-stat-label">
            Usuarios visibles
          </div>

          <div class="usuarios-stat-value">
            ${escapeHtml(
              String(stats.total)
            )}
          </div>

          <div class="usuarios-stat-text">
            Cuentas cargadas en la colección actual.
          </div>
        </article>

        <article class="usuarios-stat-card usuarios-stat-card--active">
          <div class="usuarios-stat-label">
            Activos
          </div>

          <div class="usuarios-stat-value">
            ${escapeHtml(
              String(
                stats.activeCount
              )
            )}
          </div>

          <div class="usuarios-stat-text">
            Usuarios operativos o habilitados actualmente.
          </div>
        </article>

        <article class="usuarios-stat-card usuarios-stat-card--pending">
          <div class="usuarios-stat-label">
            Pendientes
          </div>

          <div class="usuarios-stat-value">
            ${escapeHtml(
              String(
                stats.pendingCount
              )
            )}
          </div>

          <div class="usuarios-stat-text">
            Cuentas pendientes de completar su activación.
          </div>
        </article>

        <article class="usuarios-stat-card usuarios-stat-card--blocked">
          <div class="usuarios-stat-label">
            Bloqueados
          </div>

          <div class="usuarios-stat-value">
            ${escapeHtml(
              String(
                stats.blockedCount
              )
            )}
          </div>

          <div class="usuarios-stat-text">
            Cuentas bloqueadas o inactivas.
          </div>
        </article>
      </div>
    </section>
  `;
}

/* =========================================================
   STATES
========================================================= */

export function renderLoadingState() {
  return `
    <section
      class="usuarios-history is-loading"
      data-usuarios-history="true"
      aria-live="polite"
      aria-busy="true"
    >
      ${renderTableLoading(
        DEFAULT_PAGE_SIZE
      )}
    </section>
  `;
}

export function renderErrorState(
  message =
    "No se pudieron cargar los usuarios."
) {
  return `
    <section
      class="usuarios-error"
      role="alert"
      aria-live="assertive"
    >
      <h3 class="usuarios-error-title">
        No se pudo cargar la vista de usuarios
      </h3>

      <p class="usuarios-error-text">
        ${escapeHtml(
          safeText(
            message,
            "Error desconocido al cargar la vista."
          )
        )}
      </p>

      <button
        type="button"
        class="usuarios-btn usuarios-btn--primary"
        data-usuarios-action="${USUARIOS_TABLE_ACTIONS.RETRY}"
        data-action="retry"
      >
        ${icon("refresh")}
        <span class="usuarios-btn-text">
          Reintentar
        </span>
      </button>
    </section>
  `;
}

export function renderAccessDeniedState() {
  return `
    <section
      class="usuarios-history"
      data-usuarios-history="true"
    >
      ${renderEmptyContent({
        restricted: true,
        allowCreate: false,
      })}
    </section>
  `;
}

export function renderEmptyUsuariosState(
  options = {}
) {
  return `
    <section class="usuarios-history">
      ${renderEmptyContent(
        options
      )}
    </section>
  `;
}

/* =========================================================
   TABLE
========================================================= */

export function renderTable(input = {}) {
  const data =
    safeObject(input);

  const items =
    getResolvedItems(data);

  const state =
    safeObject(data.state);

  const pagination =
    getPagination(
      items,
      data
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

  const showInitialLoading =
    loading &&
    !pagination.pageItems.length;

  const showRefreshOverlay =
    refreshing &&
    pagination.pageItems.length;

  const activeFilterLabel =
    getFilterLabel(
      pagination.activeFilter
    );

  const searchQuery =
    pagination.searchQuery;

  const activeCriteria = [
    pagination.activeFilter !==
    "all"
      ? activeFilterLabel
      : "",

    searchQuery
      ? `búsqueda “${searchQuery}”`
      : "",
  ].filter(Boolean);

  const subtitle =
    showInitialLoading
      ? "Cargando usuarios..."
      : pagination.filtering
        ? `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount} · ${activeCriteria.join(" · ")}`
        : `Mostrando ${pagination.rangeStart}-${pagination.rangeEnd} de ${pagination.totalCount}`;

  const admin =
    data.admin !== false &&
    !shouldRenderRestricted(data);

  return `
    <section
      class="usuarios-history${loading ? " is-loading" : ""}${refreshing ? " is-refreshing" : ""}${hasError ? " has-error" : ""}"
      data-usuarios-history="true"
      data-visible-limit="${escapeHtml(String(pagination.visibleLimit))}"
      data-visible="${escapeHtml(String(pagination.pageItems.length))}"
      data-has-more="${pagination.hasMore ? "true" : "false"}"
      data-remaining="${escapeHtml(String(pagination.remainingCount))}"
      data-filter="${escapeHtml(pagination.activeFilter)}"
      data-search-active="${searchQuery ? "true" : "false"}"
      aria-live="polite"
      aria-busy="${loading || refreshing ? "true" : "false"}"
    >
      <div class="usuarios-history-head">
        <div class="usuarios-history-copy">
          <h2 class="usuarios-history-title">
            Historial de usuarios
          </h2>

          <p class="usuarios-history-subtitle">
            ${escapeHtml(subtitle)}
          </p>
        </div>

        ${renderPagination(
          pagination,
          state
        )}

        ${renderFilters(
          data,
          pagination
        )}
      </div>

      ${
        showInitialLoading
          ? renderTableLoading(
              Math.max(
                3,
                pagination.pageSize ||
                  DEFAULT_PAGE_SIZE
              )
            )
          : `
            <div class="usuarios-table-wrap${refreshing ? " is-refreshing" : ""}">
              ${
                showRefreshOverlay
                  ? renderRefreshOverlay()
                  : ""
              }

              ${
                pagination.pageItems.length
                  ? `
                    <div class="usuarios-table-shell">
                      <table
                        class="usuarios-table"
                        role="table"
                        aria-label="Listado de usuarios"
                      >
                        <colgroup>
                          ${USUARIOS_TABLE_COLUMNS
                            .map(
                              (column) =>
                                `<col class="${escapeHtml(column.colClass)}">`
                            )
                            .join("")}
                        </colgroup>

                        <thead>
                          <tr>
                            ${USUARIOS_TABLE_COLUMNS
                              .map(
                                (column) =>
                                  `<th scope="col">${escapeHtml(column.label)}</th>`
                              )
                              .join("")}
                          </tr>
                        </thead>

                        <tbody>
                          ${pagination.pageItems
                            .map(
                              (item) =>
                                renderRow(
                                  item,
                                  state
                                )
                            )
                            .join("")}
                        </tbody>
                      </table>
                    </div>
                  `
                  : renderEmptyContent({
                      hasError,
                      filtering:
                        pagination.filtering,
                      searchQuery,
                      message:
                        errorMessage,
                      allowCreate:
                        admin,
                    })
              }
            </div>
          `
      }
    </section>
  `;
}

/* =========================================================
   BACKWARD COMPAT EXPORTS
========================================================= */

export function renderEmptyState(
  options = {}
) {
  return `
    <section class="usuarios-history">
      ${renderEmptyContent({
        hasError:
          Boolean(
            options?.hasError
          ),

        filtering:
          Boolean(
            options?.filtering
          ),

        searchQuery:
          safeText(
            options?.searchQuery,
            ""
          ),

        message:
          safeText(
            options?.message,
            ""
          ),

        restricted:
          Boolean(
            options?.restricted
          ),

        allowCreate:
          options?.allowCreate !==
          false,
      })}
    </section>
  `;
}

export const renderCards =
  renderTable;

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function renderUsuariosTableTemplate(
  input = {}
) {
  const data =
    safeObject(input);

  const items =
    getResolvedItems(data);

  const state =
    safeObject(data.state);

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
    data-template-version="${escapeHtml(USUARIOS_TABLE_TEMPLATE_VERSION)}"
    data-total="${escapeHtml(String(pagination.totalCount))}"
    data-visible="${escapeHtml(String(pagination.pageItems.length))}"
    data-visible-limit="${escapeHtml(String(pagination.visibleLimit))}"
    data-has-more="${pagination.hasMore ? "true" : "false"}"
    data-filter="${escapeHtml(pagination.activeFilter)}"
    data-search-active="${pagination.searchQuery ? "true" : "false"}"
    data-loading="${loading ? "true" : "false"}"
    data-refreshing="${refreshing ? "true" : "false"}"
    data-canonical-model="true"
  `;

  if (
    shouldRenderRestricted(data)
  ) {
    return `
      <section
        class="usuarios-view-root is-restricted"
        ${rootAttrs}
        aria-busy="false"
      >
        ${renderAccessDeniedState()}
      </section>
    `;
  }

  if (
    error &&
    !items.length
  ) {
    return `
      <section
        class="usuarios-view-root has-error"
        ${rootAttrs}
        aria-busy="false"
      >
        ${renderErrorState(
          error
        )}
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

/* =========================================================
   SNAPSHOT / COMPATIBILITY
========================================================= */

export function getUsuariosTableTemplateSnapshot(
  input = {}
) {
  const data =
    safeObject(input);

  const items =
    getResolvedItems(data);

  const pagination =
    getPagination(
      items,
      data
    );

  return {
    version:
      USUARIOS_TABLE_TEMPLATE_VERSION,

    actions:
      USUARIOS_TABLE_ACTIONS,

    total:
      pagination.totalCount,

    visible:
      pagination.pageItems.length,

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
      shouldRenderRestricted(
        data
      ),

    canonicalModel: true,

    architecture: {
      http: false,
      store: false,
      router: false,
      auth: false,
      rawModelParsing: false,
      backendSorting: false,
      presentationFiltering: true,
      presentationLoadMore: true,
      safeAvatarUrls: true,
      dataImageAvatarAllowed: false,
      escapeHtml: true,
    },

    cssContract: {
      root:
        "usuarios-view-root",

      header:
        "usuarios-hero",

      history:
        "usuarios-history",

      table:
        "usuarios-table",

      row:
        "usuarios-row",
    },
  };
}

export const renderTemplate =
  renderUsuariosTableTemplate;

export const renderUsuariosTemplate =
  renderUsuariosTableTemplate;

export const getSnapshot =
  getUsuariosTableTemplateSnapshot;

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default renderUsuariosTableTemplate;
