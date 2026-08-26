/* =========================================================
   Onion Support - Clientes Template
   Server-backed cursor pagination · loaded-record semantics
========================================================= */

import {
  normalizeClienteModel,
  normalizeClientesCollection,
} from "./clientes.template.legacy.js";

export {
  normalizeClienteModel,
  normalizeClientesCollection,
} from "./clientes.template.legacy.js";

export const CLIENTES_TEMPLATE_VERSION =
  "clientes.template.cursor.v11.continuous-scroll";
export const CLIENTES_TABLE_TEMPLATE_VERSION = CLIENTES_TEMPLATE_VERSION;
export const CLIENTES_VIEW_TEMPLATE_VERSION = CLIENTES_TEMPLATE_VERSION;

export const CLIENTES_ACTIONS = Object.freeze({
  REFRESH: "refresh",
  CREATE_OPEN: "create-open",
  CREATE: "create-open",
  FILTER: "filter",
  SORT_TOGGLE: "sort-toggle",
  CLEAR_FILTERS: "clear-filters",
  CLEAR_SEARCH: "clear-search",
  OPEN_DETAIL: "open-detail",
  DETAIL: "open-detail",
  RETRY_PAGE: "retry-page",
  EXPORT: "export",
});

export const CLIENTES_TABLE_ACTIONS = CLIENTES_ACTIONS;
export const CLIENTES_DEFAULT_VISIBLE_ROWS = 50;
export const CLIENTES_DEFAULT_PAGE_SIZE = 50;
export const CLIENTES_MAX_VISIBLE_ROWS = Number.POSITIVE_INFINITY;

export const CLIENTES_TABLE_COLUMNS = Object.freeze([
  { key: "main", label: "Cliente" },
  { key: "status", label: "Estado" },
  { key: "created", label: "Alta" },
  { key: "contact", label: "Contacto" },
  { key: "amount", label: "Importe" },
]);

const FILTERS = Object.freeze([
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "pending", label: "Pendientes" },
  { key: "blocked", label: "Bloqueados" },
]);

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function cleanText(value = "", fallback = "") {
  const text = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return null;
}

function number(value = 0, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(value = "") {
  return escapeHtml(cleanText(value, ""));
}

function attrExact(value = "") {
  return escapeHtml(String(value ?? "").replace(/[\r\n\t]/g, " "));
}

function formatNumber(value = 0) {
  try {
    return new Intl.NumberFormat("es-ES").format(number(value, 0));
  } catch {
    return String(number(value, 0));
  }
}

function formatMoney(value = 0) {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(number(value, 0));
  } catch {
    return `${number(value, 0).toFixed(2).replace(".", ",")} €`;
  }
}

function toTimestamp(value = null) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9_999_999_999 ? value : value * 1000;
  }
  const raw = cleanText(value, "");
  if (!raw) return 0;
  const numeric = Number(raw);
  if (/^[+-]?\d+(?:\.\d+)?$/.test(raw) && Number.isFinite(numeric)) {
    return numeric > 9_999_999_999 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateShort(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "—";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
}

function formatDateTime(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "—";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString();
  }
}

function formatRelativeDate(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "Sin actualización";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Ahora mismo";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `Hace ${days} día${days === 1 ? "" : "s"}`;
}

function statusBucket(item = {}) {
  const current = normalizeClienteModel(item);
  const status = normalizeKey(first(current.status, current.estado, "active"));
  if (["pending", "pendiente", "new", "nuevo", "invited"].includes(status)) {
    return "pending";
  }
  if (
    ["blocked", "bloqueado", "suspended", "locked", "inactive", "inactivo", "disabled"].includes(status) ||
    current.blocked === true ||
    current.active === false
  ) {
    return "blocked";
  }
  return "active";
}

function statusLabel(item = {}) {
  return {
    active: "Activo",
    pending: "Pendiente",
    blocked: "Bloqueado",
  }[statusBucket(item)] || "Activo";
}

function typeLabel(item = {}) {
  const type = normalizeKey(first(item?.tipo, item?.type, ""));
  if (type === "empresa") return "Empresa";
  if (type === "particular") return "Particular";
  return "Cliente";
}

function icon(name = "") {
  const common =
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const paths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    export: '<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    euro: '<path d="M4 10h10M4 14h9"/><path d="M18 6.5A7 7 0 1 0 18 17.5"/>',
    refresh: '<path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/>',
  };
  return `<svg ${common}>${paths[name] || paths.users}</svg>`;
}

function initials(value = "") {
  const words = cleanText(value, "CL").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0].slice(0, 2)).toUpperCase();
}

function safeAvatarUrl(value = "") {
  const raw = cleanText(value, "");
  if (!raw || raw.startsWith("//") || /[\r\n\t\\]/.test(raw) || /^(javascript|data|vbscript|file):/i.test(raw)) {
    return "";
  }
  if (raw.startsWith("/")) return raw;
  if (!/^https:\/\//i.test(raw)) return "";
  try {
    const url = new URL(raw);
    if (/[?&#](?:access_token|refresh_token|id_token|token|secret|session|password|jwt|authorization)=/i.test(url.href)) {
      return "";
    }
    return url.href;
  } catch {
    return "";
  }
}

function renderAvatar(item = {}) {
  const current = normalizeClienteModel(item);
  const label = cleanText(first(current.contactoNombre, current.nombreFiscal, "Cliente"), "Cliente");
  const src = safeAvatarUrl(first(current.avatar, current.avatarUrl, ""));
  return `
    <span class="clientes-avatar${src ? " has-image" : ""}" aria-hidden="true">
      ${src ? `<img class="clientes-avatar-img" src="${attr(src)}" alt="" width="42" height="42" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}
      <span class="clientes-avatar-fallback">${escapeHtml(initials(label))}</span>
    </span>
  `;
}

function renderContact(item = {}) {
  const current = normalizeClienteModel(item);
  const email = cleanText(current.email, "");
  const phone = cleanText(first(current.phone, current.telefono, ""), "");
  if (!email && !phone) return '<span class="clientes-contact-empty">Sin contacto</span>';
  return `
    <div class="clientes-contact-stack">
      ${email ? `<a class="clientes-contact-link" href="mailto:${attr(encodeURIComponent(email))}" data-stop-row="true">${icon("mail")}<span>${escapeHtml(email)}</span></a>` : ""}
      ${phone ? `<a class="clientes-contact-link" href="tel:${attr(phone.replace(/[^\d+]/g, ""))}" data-stop-row="true">${icon("phone")}<span>${escapeHtml(phone)}</span></a>` : ""}
    </div>
  `;
}

function renderRow(item = {}, vm = {}) {
  const current = normalizeClienteModel(item);
  const id = cleanText(first(current.clienteId, current.id, ""), "");
  const opening = Boolean(id && vm.openingClienteId === id);
  const code = cleanText(first(current.code, current.codigo, id, "CLI-SIN-ID"), "CLI-SIN-ID");
  const name = cleanText(first(current.nombreFiscal, current.razonSocial, current.displayName, "Cliente"), "Cliente");
  const secondary = [current.email, current.nif].filter(Boolean).join(" · ") || "Sin datos fiscales";
  return `
    <tr
      class="clientes-table-row clientes-table-row--${attr(statusBucket(current))}${opening ? " is-loading" : ""}"
      data-client-row="true"
      data-cliente-row="true"
      data-client-id="${attr(id)}"
      data-cliente-id="${attr(id)}"
      data-clientes-action="${CLIENTES_ACTIONS.OPEN_DETAIL}"
      data-action="${CLIENTES_ACTIONS.OPEN_DETAIL}"
      tabindex="0"
      role="button"
      aria-label="Abrir cliente ${attr(name)}"
      aria-busy="${opening ? "true" : "false"}"
    >
      <td class="clientes-cell clientes-cell--main">
        <div class="clientes-main">
          ${renderAvatar(current)}
          <div class="clientes-main-copy">
            <div class="clientes-client-line-top">
              <span class="clientes-client-id">${escapeHtml(code)}</span>
              <span class="clientes-category-pill">${escapeHtml(typeLabel(current))}</span>
            </div>
            <div class="clientes-client-name">${escapeHtml(name)}</div>
            <div class="clientes-client-description">${escapeHtml(secondary)}</div>
            <div class="clientes-client-meta">
              <span>${escapeHtml(cleanText(first(current.city, current.ciudad, "Sin ciudad"), "Sin ciudad"))}</span>
              ${current.nif ? `<span class="clientes-mini-badge">${escapeHtml(current.nif)}</span>` : ""}
            </div>
          </div>
        </div>
      </td>
      <td class="clientes-cell clientes-cell--status">
        <span class="clientes-chip clientes-chip--${attr(statusBucket(current))}">
          <span class="clientes-chip-dot" aria-hidden="true"></span>
          <span>${escapeHtml(statusLabel(current))}</span>
        </span>
      </td>
      <td class="clientes-cell clientes-cell--date">
        <span class="clientes-date-inline" title="${attr(formatDateTime(current.createdAt))}">
          ${escapeHtml(formatDateShort(current.createdAt))}
        </span>
      </td>
      <td class="clientes-cell clientes-cell--contact">${renderContact(current)}</td>
      <td class="clientes-cell clientes-cell--amount">
        <div class="clientes-total-stack">
          <span class="clientes-total-value">${escapeHtml(formatMoney(first(current.totalAmount, current.totalImporte, 0)))}</span>
          <span class="clientes-total-caption">Facturación cargada</span>
        </div>
      </td>
    </tr>
  `;
}

function renderSpinner(label = "Cargando...") {
  return `<span class="clientes-inline-loading"><span class="clientes-inline-spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span></span>`;
}

function buildVm(input = {}) {
  const data = safeObject(input);
  const sourceItems =
    Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.clientes)
        ? data.clientes
        : [];
  const items = sourceItems.map((item) => normalizeClienteModel(item));
  const filterKey = normalizeKey(data.filter);
  const filter = FILTERS.some((entry) => entry.key === filterKey) ? filterKey : "all";
  const sortOrder = normalizeKey(data.sortOrder) === "asc" ? "asc" : "desc";
  const counts = { all: items.length, active: 0, pending: 0, blocked: 0 };
  let amount = 0;
  for (const item of items) {
    counts[statusBucket(item)] += 1;
    amount += number(first(item.totalAmount, item.totalImporte, 0), 0);
  }
  return {
    ...data,
    items,
    filter,
    search: cleanText(data.search, ""),
    searchDraft: String(
      Object.prototype.hasOwnProperty.call(data, "searchDraft")
        ? data.searchDraft ?? ""
        : data.search ?? ""
    ).replace(/[\r\n\t]/g, " "),
    sortOrder,
    nextSortOrder: sortOrder === "asc" ? "desc" : "asc",
    admin: data.admin === true || normalizeKey(data.role) === "admin",
    hasMore: data.hasMore === true && Boolean(cleanText(data.nextCursor, "")),
    nextCursor: cleanText(data.nextCursor, ""),
    loading: data.loading === true,
    refreshing: data.refreshing === true,
    loadingMore: data.loadingMore === true,
    searchPending: data.searchPending === true,
    creating: data.creating === true,
    error: cleanText(data.error, ""),
    loadMoreError: cleanText(data.loadMoreError, ""),
    openingClienteId: cleanText(data.openingClienteId, ""),
    lastSyncAt: number(data.lastSyncAt, 0),
    totalKnown: data.totalKnown === true,
    total: data.totalKnown === true && Number.isFinite(Number(data.total)) ? Number(data.total) : null,
    counts,
    amount,
  };
}

function renderHeader(vm) {
  const totalLabel = vm.totalKnown ? `${formatNumber(vm.total)} clientes` : `${formatNumber(vm.items.length)} cargados`;
  return `
    <section class="clientes-hero" data-clientes-hero="true">
      <div class="clientes-hero-top">
        <div class="clientes-hero-copy">
          <h1 class="clientes-page-title">Clientes</h1>
          <p class="clientes-page-subtitle">Gestiona clientes, altas, facturación y contactos desde un historial paginado.</p>
        </div>
        <div class="clientes-hero-actions">
          <button type="button" id="clientes-export-btn" class="clientes-btn" data-clientes-action="${CLIENTES_ACTIONS.EXPORT}" data-action="${CLIENTES_ACTIONS.EXPORT}" ${vm.items.length ? "" : 'disabled aria-disabled="true"'}>
            ${icon("export")}<span>Exportar cargados</span>
          </button>
          ${vm.admin ? `<button type="button" id="clientes-create-btn" class="clientes-btn clientes-btn--create" data-clientes-action="${CLIENTES_ACTIONS.CREATE_OPEN}" data-action="${CLIENTES_ACTIONS.CREATE_OPEN}" ${vm.creating ? 'disabled aria-busy="true"' : ""}>${vm.creating ? renderSpinner("Abriendo...") : `${icon("plus")}<span>Nuevo cliente</span>`}</button>` : ""}
        </div>
      </div>
      <div class="clientes-hero-meta">
        <span class="clientes-meta-pill">${icon("users")}<span>${escapeHtml(totalLabel)}</span></span>
        <span class="clientes-meta-pill">${icon("refresh")}<span>${escapeHtml(vm.lastSyncAt ? `Última actualización · ${formatRelativeDate(vm.lastSyncAt)}` : "Sin actualizaciones recientes")}</span></span>
        <span class="clientes-meta-pill">${icon("euro")}<span>${escapeHtml(`${formatMoney(vm.amount)} · registros cargados`)}</span></span>
      </div>
      <div class="clientes-stats" role="group" aria-label="Resumen de registros cargados">
        ${FILTERS.map((entry) => {
          const tone = { all: "accent", active: "success", pending: "warning", blocked: "danger" }[entry.key];
          const iconName = { all: "users", active: "check", pending: "clock", blocked: "lock" }[entry.key];
          return `<button type="button" class="clientes-stat-card clientes-stat-card--${tone}${vm.filter === entry.key ? " is-active" : ""}" data-clientes-action="${CLIENTES_ACTIONS.FILTER}" data-action="${CLIENTES_ACTIONS.FILTER}" data-filter="${entry.key}" aria-pressed="${vm.filter === entry.key ? "true" : "false"}">
            <span class="clientes-stat-topline"><span class="clientes-stat-label">${escapeHtml(entry.label)}</span><span class="clientes-stat-icon" aria-hidden="true">${icon(iconName)}</span></span>
            <span class="clientes-stat-value">${escapeHtml(formatNumber(vm.counts[entry.key] || 0))}</span>
            <span class="clientes-stat-text">Registros cargados en esta consulta.</span>
          </button>`;
        }).join("")}
      </div>
    </section>
  `;
}

function renderFilters(vm) {
  return `
    <div class="clientes-filters" aria-label="Filtros, orden y búsqueda de clientes">
      <div class="clientes-filter-pills" role="group" aria-label="Filtrar clientes por estado">
        ${FILTERS.map((entry) => `<button type="button" class="clientes-filter-pill${vm.filter === entry.key ? " is-active" : ""}" data-clientes-action="${CLIENTES_ACTIONS.FILTER}" data-action="${CLIENTES_ACTIONS.FILTER}" data-filter="${entry.key}" aria-pressed="${vm.filter === entry.key ? "true" : "false"}"><span>${escapeHtml(entry.label)}</span></button>`).join("")}
      </div>
      <div class="clientes-sort-pills" role="group" aria-label="Ordenar listado">
        <button type="button" class="clientes-sort-pill is-active" data-clientes-action="${CLIENTES_ACTIONS.SORT_TOGGLE}" data-action="${CLIENTES_ACTIONS.SORT_TOGGLE}" data-next-sort-order="${vm.nextSortOrder}" aria-pressed="true">
          ${icon("calendar")}<span>${vm.sortOrder === "asc" ? "Fecha ↑" : "Fecha ↓"}</span>
        </button>
      </div>
      <div class="clientes-search" role="search" aria-label="Buscar clientes">
        <span class="clientes-search-icon" aria-hidden="true">${icon("search")}</span>
        <input id="clientes-search-input" class="clientes-search-input" type="search" value="${attrExact(vm.searchDraft)}" placeholder="Buscar cliente, email, NIF..." autocomplete="off" spellcheck="false" data-clientes-search-input="true" data-search-input="clientes" aria-label="Buscar clientes">
        ${vm.search ? `<button type="button" class="clientes-search-clear" data-clientes-action="${CLIENTES_ACTIONS.CLEAR_SEARCH}" data-action="${CLIENTES_ACTIONS.CLEAR_SEARCH}" aria-label="Limpiar búsqueda">${icon("close")}</button>` : ""}
      </div>
    </div>
  `;
}

function renderBody(vm) {
  if (vm.loading && !vm.items.length) {
    return `<div class="clientes-table-loading">${renderSpinner("Cargando clientes...")}</div>`;
  }
  if (!vm.items.length) {
    const filtering = vm.filter !== "all" || Boolean(vm.search);
    const emptyAttributes = vm.error
      ? 'data-clientes-fatal-error="true" role="alert" aria-atomic="true" tabindex="-1"'
      : 'data-clientes-empty-state="true" tabindex="-1"';
    return `
      <div class="clientes-empty${vm.error ? " clientes-fatal-error" : ""}" ${emptyAttributes}>
        <div class="clientes-empty-icon" aria-hidden="true">${icon(filtering ? "search" : "users")}</div>
        <h3>${escapeHtml(vm.error ? "No se pudieron cargar los clientes" : filtering ? "No hay clientes con esos filtros" : "Todavía no hay clientes")}</h3>
        <p>${escapeHtml(vm.error || (filtering ? "Prueba con otro estado o cambia la búsqueda." : "Cuando haya clientes registrados aparecerán aquí."))}</p>
        ${vm.error ? `<button type="button" class="clientes-btn" data-clientes-action="${CLIENTES_ACTIONS.REFRESH}" data-action="${CLIENTES_ACTIONS.REFRESH}">${icon("refresh")}<span>Reintentar</span></button>` : filtering ? `<button type="button" class="clientes-btn" data-clientes-action="${CLIENTES_ACTIONS.CLEAR_FILTERS}" data-action="${CLIENTES_ACTIONS.CLEAR_FILTERS}">${icon("close")}<span>Limpiar filtros</span></button>` : ""}
      </div>
    `;
  }
  return `
    ${vm.error ? `<div class="clientes-inline-error" role="alert" aria-atomic="true"><span>${escapeHtml(vm.error)}</span><button type="button" class="clientes-btn clientes-inline-retry" data-clientes-action="${CLIENTES_ACTIONS.REFRESH}" data-action="${CLIENTES_ACTIONS.REFRESH}">${icon("refresh")}<span>Reintentar</span></button></div>` : ""}
    <div class="clientes-table-shell">
      <table class="clientes-table">
        <colgroup><col class="clientes-col--main"><col class="clientes-col--status"><col class="clientes-col--date"><col class="clientes-col--contact"><col class="clientes-col--amount"></colgroup>
        <thead><tr>${CLIENTES_TABLE_COLUMNS.map((column) => `<th scope="col" class="clientes-th clientes-th--${column.key}">${escapeHtml(column.label)}</th>`).join("")}</tr></thead>
        <tbody>${vm.items.map((item) => renderRow(item, vm)).join("")}</tbody>
      </table>
    </div>
    <div class="clientes-infinite" data-clientes-infinite="true" data-has-more="${vm.hasMore ? "true" : "false"}" tabindex="-1">
      ${vm.hasMore && !vm.loadingMore && !vm.refreshing && !vm.searchPending && !vm.error && !vm.loadMoreError ? '<div class="clientes-infinite-sentinel" data-clientes-infinite-sentinel="true" aria-hidden="true"></div>' : ""}
      ${vm.error
        ? '<div class="clientes-infinite-status is-error">Actualización detenida. Reintenta para continuar.</div>'
        : vm.loadMoreError
        ? `<div class="clientes-infinite-status is-error"><span>${escapeHtml(vm.loadMoreError)}</span><button type="button" class="clientes-btn clientes-infinite-retry" data-clientes-action="${CLIENTES_ACTIONS.RETRY_PAGE}" data-action="${CLIENTES_ACTIONS.RETRY_PAGE}">${icon("refresh")}<span>Reintentar</span></button></div>`
        : vm.searchPending
          ? '<div class="clientes-infinite-status is-loading">Preparando la búsqueda...</div>'
          : vm.refreshing
            ? `<div class="clientes-infinite-status is-loading">${renderSpinner("Actualizando clientes...")}</div>`
            : vm.loadingMore
              ? `<div class="clientes-infinite-status is-loading">${renderSpinner("Cargando clientes...")}</div>`
              : vm.hasMore
                ? '<div class="clientes-infinite-status">Sigue bajando: incorporaremos clientes automáticamente.</div>'
                : '<div class="clientes-infinite-status is-complete">Has visto todos los clientes de esta consulta.</div>'}
      <span class="clientes-infinite-count">${escapeHtml(`${formatNumber(vm.items.length)} registros cargados${vm.totalKnown ? ` de ${formatNumber(vm.total)}` : ""}`)}</span>
    </div>
  `;
}

function historyStatus(vm) {
  const loaded = formatNumber(vm.items.length);
  const filtering = vm.filter !== "all" || Boolean(vm.search);
  if (vm.searchPending) return "Preparando la búsqueda de clientes...";
  if (vm.error) return vm.error;
  if (vm.loadMoreError) return vm.loadMoreError;
  if (vm.loading && !vm.items.length) return "Cargando clientes...";
  if (vm.loadingMore) return `Cargando clientes automáticamente · ${loaded} cargados`;
  if (vm.refreshing) return `Actualizando ${loaded} clientes cargados...`;
  if (!vm.items.length) {
    return filtering
      ? "No hay clientes con esos filtros."
      : "Todavía no hay clientes.";
  }
  if (!vm.hasMore) return `Has visto todos los clientes de esta consulta · ${loaded} cargados`;
  return `Mostrando ${loaded} registros cargados · orden fecha ${vm.sortOrder === "asc" ? "↑" : "↓"}`;
}

export function renderClientesTemplate(input = {}) {
  const vm = buildVm(input);
  return `
    <section class="clientes-view-root" data-clientes-scope="true" data-template-version="${CLIENTES_TEMPLATE_VERSION}" data-filter="${attr(vm.filter)}" data-loading="${vm.loading ? "true" : "false"}" data-refreshing="${vm.refreshing ? "true" : "false"}" data-search-pending="${vm.searchPending ? "true" : "false"}">
      ${renderHeader(vm)}
      <section class="clientes-history" data-clientes-history="true">
        <div class="clientes-history-head">
          <div class="clientes-history-copy">
            <h2 class="clientes-history-title">Historial de clientes</h2>
            <p class="clientes-history-subtitle" tabindex="-1" ${vm.error ? "" : 'role="status" aria-live="polite" aria-atomic="true"'}>${escapeHtml(historyStatus(vm))}</p>
          </div>
          ${renderFilters(vm)}
        </div>
        <div class="clientes-history-results" aria-busy="${vm.loading || vm.refreshing || vm.loadingMore || vm.searchPending ? "true" : "false"}">${renderBody(vm)}</div>
      </section>
    </section>
  `;
}

export function renderClientesLoadingState(input = {}) {
  return renderClientesTemplate({ ...safeObject(input), loading: true });
}

export function renderClientesErrorState(input = {}) {
  const data = typeof input === "string" ? { error: input } : safeObject(input);
  return renderClientesTemplate({
    ...data,
    loading: false,
    error: cleanText(data.error, "No se pudieron cargar los clientes."),
  });
}

export const renderClientesViewTemplate = renderClientesTemplate;

export function getClientesTemplateSnapshot() {
  return {
    version: CLIENTES_TEMPLATE_VERSION,
    actions: CLIENTES_ACTIONS,
    policy: {
      serverBackedSearchFilterOrder: true,
      remoteCursorPagination: true,
      noInventedGlobalTotal: true,
      loadedRecordStats: true,
      pureTemplate: true,
    },
  };
}

export default {
  CLIENTES_TEMPLATE_VERSION,
  CLIENTES_ACTIONS,
  CLIENTES_TABLE_COLUMNS,
  normalizeClienteModel,
  normalizeClientesCollection,
  renderClientesTemplate,
  renderClientesViewTemplate,
  renderClientesLoadingState,
  renderClientesErrorState,
  getClientesTemplateSnapshot,
};
