/* =========================================================
   Onion Support - Usuarios Template
   Archivo: /src/views/usuarios/usuarios.template.js

   CURSOR-FIRST · SERVER FILTERED · INFINITE SCROLL · CLIENTES VISUAL PARITY V26

   Contrato:
   - Template puro: sin HTTP, Store, Router ni side effects.
   - items ya representan la consulta server-side actual.
   - state.hasMore controla el cursor remoto; no se infiere de filas ocultas.
   - state.totalKnown distingue total exacto de conteo cargado.
   - Ningún contador de subconjunto cargado se presenta como total global.
========================================================= */


import { resolveAvatarPresentation } from "../../features/avatar-system/identity.js";
export const USUARIOS_TEMPLATE_VERSION =
  "usuarios.template.v27.private-admin-visual-parity";
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
  RETRY_PAGE: "retry-page",
});
export const USUARIOS_TABLE_ACTIONS = USUARIOS_ACTIONS;

export const USUARIOS_DEFAULT_VISIBLE_ROWS = 50;
export const USUARIOS_DEFAULT_PAGE_SIZE = 50;

export const USUARIOS_TABLE_COLUMNS = Object.freeze([
  { key: "main", label: "Usuario", colClass: "usuarios-col--main", thClass: "usuarios-th usuarios-th--main", cellClass: "usuarios-cell usuarios-cell--main" },
  { key: "status", label: "Estado", colClass: "usuarios-col--status", thClass: "usuarios-th usuarios-th--status", cellClass: "usuarios-cell usuarios-cell--status" },
  { key: "date", label: "Alta", colClass: "usuarios-col--date", thClass: "usuarios-th usuarios-th--date", cellClass: "usuarios-cell usuarios-cell--date" },
  { key: "email", label: "Email", colClass: "usuarios-col--email", thClass: "usuarios-th usuarios-th--email", cellClass: "usuarios-cell usuarios-cell--email" },
  { key: "location", label: "Ciudad", colClass: "usuarios-col--location", thClass: "usuarios-th usuarios-th--location", cellClass: "usuarios-cell usuarios-cell--location" },
  { key: "activity", label: "Última conexión", colClass: "usuarios-col--activity", thClass: "usuarios-th usuarios-th--activity", cellClass: "usuarios-cell usuarios-cell--activity" },
]);

const FILTERS = Object.freeze([
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "pending", label: "Pendientes" },
  { key: "blocked", label: "Bloqueados" },
]);

const TABLE_SCALE = "110";

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}
function safeArray(value) {
  return Array.isArray(value) ? value : [];
}
function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return output || fallback;
}
function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (isObject(value) && !Object.keys(value).length) continue;
    return value;
  }
  return null;
}
function number(value = 0, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}
function toTimestamp(value = null) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 9_999_999_999 ? value : value * 1000;
  }
  const parsed = Date.parse(cleanText(value, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
function formatNumber(value = 0) {
  try {
    return new Intl.NumberFormat("es-ES").format(number(value, 0));
  } catch {
    return String(number(value, 0));
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
    return "—";
  }
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
    return "—";
  }
}
function formatRelativeDate(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "Sin actividad";
  const diffMinutes = Math.round((Date.now() - timestamp) / 60_000);
  if (diffMinutes < 1) return "Ahora mismo";
  if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days <= 7) return `Hace ${days} día${days === 1 ? "" : "s"}`;
  return formatDateShort(timestamp);
}
function safeAvatarUrl(value = "") {
  const raw = cleanText(value, "");
  if (!raw || raw.startsWith("//") || /[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (/^blob:/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");
  if (!/^https:\/\//i.test(raw) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw)) return "";
  try {
    const url = new URL(raw);
    const keys = [...url.searchParams.keys()].map((key) => key.toLowerCase());
    const sensitive = ["access_token", "refresh_token", "id_token", "token", "code", "secret", "session", "password", "pwd", "jwt", "authorization", "reset_token", "activation_token"];
    if (keys.some((key) => sensitive.includes(key))) return "";
    return url.href;
  } catch {
    return "";
  }
}
function icon(name = "") {
  const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const paths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    export: '<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    refresh: '<path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/>',
    activity: '<path d="M3 12h4l2.5-7 5 14 2.5-7h4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  };
  return `<svg ${common}>${paths[name] || paths.users}</svg>`;
}

function itemsFrom(input = {}) {
  if (Array.isArray(input)) return input.filter(isObject);
  const data = safeObject(input);
  for (const candidate of [data.items, data.users, data.usuarios, data.rows, data.results]) {
    if (Array.isArray(candidate)) return candidate.filter(isObject);
  }
  return [];
}
function stateFrom(input = {}) {
  return safeObject(safeObject(input).state);
}
function getId(item = {}) {
  return cleanText(first(item.userId, item.usuarioId, item.id, item.uid, item.email, ""), "");
}
function getName(item = {}) {
  return cleanText(first(item.fullName, item.displayName, item.name, item.nombre, item.username, item.email, "Usuario"), "Usuario");
}
function getCode(item = {}) {
  return cleanText(first(item.code, item.username, getId(item), "USR-SIN-ID"), "USR-SIN-ID");
}
function getEmail(item = {}) {
  return cleanText(first(item.email, item.emailLower, item.mail, ""), "").toLowerCase() || "Sin email";
}
function getCity(item = {}) {
  return cleanText(first(item.city, item.ciudad, item.direccion?.ciudad, item.address?.city, item.address?.ciudad, ""), "") || "Sin ciudad";
}
function getStatus(item = {}) {
  const explicit = normalizeKey(first(item.status, item.estado, item.state, ""));
  if (["pending", "pendiente", "invited", "invitado", "new", "unverified", "awaiting_activation"].includes(explicit)) return "pending";
  if (["blocked", "bloqueado", "inactive", "inactivo", "disabled", "archived", "deleted", "suspended", "banned", "revoked"].includes(explicit)) return "blocked";
  if (item.blocked === true || item.disabled === true) return "blocked";
  if (item.active === false && item.emailVerified !== true && !item.activatedAt && !item.deactivatedAt) return "pending";
  if (item.active === false || item.enabled === false || item.isActive === false) return "blocked";
  return "active";
}
function statusLabel(item = {}) {
  const status = getStatus(item);
  if (status === "pending") return "Pendiente";
  if (status === "blocked") return "Bloqueado";
  return "Activo";
}
function roleLabel(item = {}) {
  return normalizeKey(first(item.role, item.rol, "user")) === "admin" ? "Admin" : "Usuario";
}
function avatarPresentation(item = {}) {
  const name = getName(item);
  const email = cleanText(first(item.email, item.emailLower, item.mail, ""), "").toLowerCase();
  return resolveAvatarPresentation({
    ...item,
    displayName: name,
    name,
    email,
    userId: getId(item),
    username: first(item.username, item.userName, item.slug, ""),
  });
}
function renderAvatar(item = {}) {
  const name = getName(item);
  const src = safeAvatarUrl(first(item.avatarUrl, item.avatar, item.photoUrl, item.picture, ""));
  const presentation = avatarPresentation(item);
  return `<span class="usuarios-avatar${src ? " has-image" : " is-fallback"}" aria-hidden="true" data-avatar-system="true" data-avatar-host="true" data-avatar-name="${attr(presentation.name)}" data-avatar-email="${attr(presentation.email)}" data-avatar-user-id="${attr(presentation.userId)}" data-avatar-username="${attr(presentation.username)}" data-avatar-tone="${attr(String(presentation.tone))}" data-avatar-identity="${attr(presentation.fingerprint)}" data-avatar-initials="${attr(presentation.initials)}" data-has-avatar="${src ? "true" : "false"}">${src ? `<img class="usuarios-avatar-img" data-avatar-image="true" src="${attr(src)}" alt="" width="42" height="42" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">` : ""}<span class="usuarios-avatar-fallback" data-avatar-fallback="true">${escapeHtml(presentation.initials)}</span></span>`;
}
function renderStatusChip(item = {}) {
  const status = getStatus(item);
  return `<span class="usuarios-chip usuarios-chip--${attr(status)}"><span class="usuarios-chip-dot" aria-hidden="true"></span><span>${escapeHtml(statusLabel(item))}</span></span>`;
}
function renderRow(item = {}, state = {}) {
  const id = getId(item);
  const name = getName(item);
  const opening = Boolean(id && cleanText(state.openingUserId, "") === id);
  const lastLoginAt = first(item.lastLoginAt, item.lastAccessAt, null);
  return `<tr class="usuarios-table-row usuarios-table-row--${attr(getStatus(item))}${opening ? " is-loading" : ""}" data-user-row="true" data-user-id="${attr(id)}" ${id ? `data-usuarios-action="${USUARIOS_ACTIONS.DETAIL}" data-action="open-user" tabindex="0" role="button" aria-label="Abrir usuario ${attr(name)}"` : 'aria-disabled="true"'} aria-busy="${opening ? "true" : "false"}">
    <td class="usuarios-cell usuarios-cell--main" data-column="main"><div class="usuarios-main">${renderAvatar(item)}<div class="usuarios-main-copy"><div class="usuarios-user-line-top"><span class="usuarios-user-id">${escapeHtml(getCode(item))}</span><span class="usuarios-role-pill usuarios-role-pill--${normalizeKey(roleLabel(item)) === "admin" ? "admin" : "user"}">${escapeHtml(roleLabel(item))}</span></div><div class="usuarios-user-name">${escapeHtml(name)}</div><div class="usuarios-user-description">${escapeHtml(cleanText(first(item.phone, item.telefono, item.tipo, "Usuario Onion Support"), "Usuario Onion Support"))}</div></div></div></td>
    <td class="usuarios-cell usuarios-cell--status" data-column="status">${renderStatusChip(item)}</td>
    <td class="usuarios-cell usuarios-cell--date" data-column="date"><span class="usuarios-date-inline" title="${attr(formatDateTime(item.createdAt))}">${escapeHtml(formatDateShort(item.createdAt))}</span></td>
    <td class="usuarios-cell usuarios-cell--email" data-column="email"><span class="usuarios-email-inline" title="${attr(getEmail(item))}">${escapeHtml(getEmail(item))}</span></td>
    <td class="usuarios-cell usuarios-cell--location" data-column="location"><span class="usuarios-location-inline" title="${attr(getCity(item))}">${escapeHtml(getCity(item))}</span></td>
    <td class="usuarios-cell usuarios-cell--activity" data-column="activity"><span class="usuarios-activity-inline" title="${attr(formatDateTime(lastLoginAt))}">${escapeHtml(lastLoginAt ? formatRelativeDate(lastLoginAt) : "Sin acceso")}</span></td>
  </tr>`;
}
function renderColgroup() {
  return `<colgroup>${USUARIOS_TABLE_COLUMNS.map((column) => `<col class="${attr(column.colClass)}">`).join("")}</colgroup>`;
}
function renderThead() {
  return `<thead><tr>${USUARIOS_TABLE_COLUMNS.map((column) => `<th scope="col" class="${attr(column.thClass)}" data-column="${attr(column.key)}">${escapeHtml(column.label)}</th>`).join("")}</tr></thead>`;
}
function loadedStats(items = []) {
  const rows = safeArray(items);
  return {
    total: rows.length,
    active: rows.filter((item) => getStatus(item) === "active").length,
    pending: rows.filter((item) => getStatus(item) === "pending").length,
    blocked: rows.filter((item) => getStatus(item) === "blocked").length,
    withAccess: rows.filter((item) => Boolean(toTimestamp(first(item.lastLoginAt, item.lastAccessAt, null)))).length,
  };
}
function renderSpinner(label = "") {
  return `<span class="usuarios-inline-loading"><span class="usuarios-inline-spinner" aria-hidden="true"></span>${label ? `<span>${escapeHtml(label)}</span>` : ""}</span>`;
}

function renderRefreshOverlay() {
  return `<div class="usuarios-refresh-overlay" aria-hidden="true">${renderSpinner("Actualizando usuarios...")}</div>`;
}
function filterValue(input = {}) {
  const data = safeObject(input);
  const state = stateFrom(data);
  const value = normalizeKey(first(data.filter, data.activeFilter, state.filter, state.activeFilter, "all"));
  return ["active", "pending", "blocked"].includes(value) ? value : "all";
}
function searchValue(input = {}) {
  const data = safeObject(input);
  const state = stateFrom(data);
  // This value is written back into the live search input. Preserve its exact
  // spacing so a synchronous pending-state render cannot move the caret.
  return String(
    data.search ?? data.searchQuery ?? state.search ?? state.searchQuery ?? ""
  );
}
function totalInfo(input = {}, items = []) {
  const data = safeObject(input);
  const state = stateFrom(data);
  const totalKnown = Boolean(first(state.totalKnown, data.totalKnown, false));
  const totalCount = totalKnown
    ? Math.max(items.length, number(first(state.totalCount, state.remoteCount, data.totalCount, data.remoteCount, items.length), items.length))
    : null;
  return { totalKnown, totalCount };
}
function isRestricted(input = {}) {
  const data = safeObject(input);
  const state = stateFrom(data);
  return Boolean(first(data.forbidden, data.restricted, data.accessDenied, state.forbidden, state.restricted, state.accessDenied, false));
}

export function renderHeader(input = {}) {
  const data = safeObject(input);
  const state = stateFrom(data);
  const items = itemsFrom(data);
  const stats = loadedStats(items);
  const filter = filterValue(data);
  const { totalKnown, totalCount } = totalInfo(data, items);
  const loading = Boolean(first(state.loading, data.loading, false));
  const creating = Boolean(first(state.creating, data.creating, false));
  const exporting = Boolean(first(state.exporting, data.exporting, false));
  const admin = data.admin !== false && !isRestricted(data);
  const countText = totalKnown ? `${formatNumber(totalCount)} usuarios` : `${formatNumber(items.length)}${state.hasMore ? "+" : ""} cargados`;
  const updatedAt = number(first(state.lastSyncAt, data.lastSyncAt, 0), 0);

  return `<section class="usuarios-hero" data-usuarios-hero="true">
    <div class="usuarios-hero-top"><div class="usuarios-hero-copy"><h1 class="usuarios-page-title">Usuarios</h1><p class="usuarios-page-subtitle">Gestiona usuarios con paginación remota y búsqueda global.</p></div>
    ${admin ? `<div class="usuarios-hero-actions"><button type="button" id="usuarios-export-btn" class="usuarios-btn" data-usuarios-action="${USUARIOS_ACTIONS.EXPORT}" data-action="export" ${!items.length || loading || exporting ? 'disabled aria-disabled="true"' : ""}>${exporting ? renderSpinner("Exportando...") : `${icon("export")}<span>Exportar cargados</span>`}</button><button type="button" id="usuarios-create-btn" class="usuarios-btn usuarios-btn--create" data-usuarios-action="${USUARIOS_ACTIONS.CREATE}" data-action="create" ${creating || loading ? 'disabled aria-disabled="true"' : ""}>${creating ? renderSpinner("Abriendo...") : `${icon("plus")}<span>Nuevo usuario</span>`}</button></div>` : ""}</div>
    <div class="usuarios-hero-meta"><span class="usuarios-meta-pill">${icon("users")}<span>${escapeHtml(countText)}</span></span><span class="usuarios-meta-pill">${icon("refresh")}<span>${updatedAt ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`) : "Sin actualizaciones recientes"}</span></span><span class="usuarios-meta-pill">${icon("activity")}<span>${escapeHtml(`${formatNumber(stats.withAccess)} con actividad cargada`)}</span></span></div>
    <div class="usuarios-stats" role="group" aria-label="Resumen de filas cargadas">
      ${[
        ["all", "accent", "users", "Cargados", stats.total],
        ["active", "success", "check", "Activos cargados", stats.active],
        ["pending", "warning", "clock", "Pendientes cargados", stats.pending],
        ["blocked", "danger", "lock", "Bloqueados cargados", stats.blocked],
      ].map(([key, tone, iconName, label, value]) => `<button type="button" class="usuarios-stat-card usuarios-stat-card--${tone}${filter === key ? " is-active" : ""}" data-usuarios-action="${USUARIOS_ACTIONS.FILTER}" data-action="filter" data-filter="${key}" aria-pressed="${filter === key ? "true" : "false"}"><span class="usuarios-stat-topline"><span class="usuarios-stat-label">${escapeHtml(label)}</span><span class="usuarios-stat-icon" aria-hidden="true">${icon(iconName)}</span></span><span class="usuarios-stat-value">${escapeHtml(formatNumber(value))}</span><span class="usuarios-stat-text">Consulta actual · filas ya cargadas.</span></button>`).join("")}
    </div>
  </section>`;
}

function renderFilters(input = {}) {
  const active = filterValue(input);
  const search = searchValue(input);
  return `<div class="usuarios-filters" aria-label="Filtros y búsqueda de usuarios"><div class="usuarios-filter-pills" role="group" aria-label="Filtrar usuarios por estado">${FILTERS.map((filter) => `<button type="button" class="usuarios-filter-pill${filter.key === active ? " is-active" : ""}" data-usuarios-action="${USUARIOS_ACTIONS.FILTER}" data-action="filter" data-filter="${filter.key}" aria-pressed="${filter.key === active ? "true" : "false"}"><span>${escapeHtml(filter.label)}</span></button>`).join("")}</div><div class="usuarios-search" role="search" aria-label="Buscar usuarios"><span class="usuarios-search-icon" aria-hidden="true">${icon("search")}</span><input id="usuarios-search-input" class="usuarios-search-input" type="search" value="${escapeHtml(search)}" placeholder="Buscar usuario, email, ciudad..." autocomplete="off" spellcheck="false" data-usuarios-search-input="true" data-usuarios-field="search" data-field="search" aria-label="Buscar usuarios">${search ? `<button type="button" class="usuarios-search-clear" data-usuarios-action="${USUARIOS_ACTIONS.CLEAR_SEARCH}" data-action="clear-search" aria-label="Limpiar búsqueda">${icon("close")}</button>` : ""}</div></div>`;
}

function renderEmptyContent({ error = "", filtering = false, restricted = false, admin = true } = {}) {
  if (restricted) return `<div class="usuarios-empty usuarios-empty--forbidden"><div class="usuarios-empty-icon">${icon("shield")}</div><h3>Acceso restringido</h3><p>La vista de usuarios está reservada para administradores.</p></div>`;
  if (error) return `<div class="usuarios-empty"><div class="usuarios-empty-icon">${icon("alert")}</div><h3>No se pudieron cargar los usuarios</h3><p>${escapeHtml(error)}</p><button type="button" class="usuarios-btn" data-usuarios-action="${USUARIOS_ACTIONS.RETRY}" data-action="retry">${icon("refresh")}<span>Reintentar</span></button></div>`;
  if (filtering) return `<div class="usuarios-empty"><div class="usuarios-empty-icon">${icon("search")}</div><h3>No hay usuarios con esos filtros</h3><p>Prueba con otra búsqueda o estado.</p><button type="button" class="usuarios-btn" data-usuarios-action="${USUARIOS_ACTIONS.CLEAR_FILTERS}" data-action="clear-filters">${icon("close")}<span>Limpiar filtros</span></button></div>`;
  return `<div class="usuarios-empty"><div class="usuarios-empty-icon">${icon("users")}</div><h3>Todavía no hay usuarios</h3><p>Cuando haya usuarios registrados aparecerán aquí.</p>${admin ? `<button type="button" class="usuarios-btn usuarios-btn--create" data-usuarios-action="${USUARIOS_ACTIONS.CREATE}" data-action="create">${icon("plus")}<span>Crear usuario</span></button>` : ""}</div>`;
}

function getFinalUsersMessage(totalKnown = false, totalCount = 0) {
  if (!totalKnown) return "Has visto todos los usuarios de la consulta.";
  const count = Math.max(0, number(totalCount, 0));
  return count === 1
    ? "Has visto el único usuario de la consulta."
    : `Has visto los ${formatNumber(count)} usuarios de la consulta.`;
}

function renderFooter(input = {}, items = []) {
  const state = stateFrom(input);
  if (!items.length) return "";
  const { totalKnown, totalCount } = totalInfo(input, items);
  const loaded = items.length;
  const label = totalKnown ? `${formatNumber(loaded)} de ${formatNumber(totalCount)}` : `${formatNumber(loaded)} cargados`;
  const loadMoreError = cleanText(state.loadMoreError, "");
  if (state.searchPending) return "";
  if (loadMoreError) {
    return `<div class="usuarios-list-footer usuarios-feed-error" data-usuarios-infinite="true"><span class="usuarios-feed-error-icon" aria-hidden="true">${icon("alert")}</span><span class="usuarios-feed-status">${escapeHtml(loadMoreError)}</span><button type="button" class="usuarios-feed-retry" data-usuarios-action="${USUARIOS_ACTIONS.RETRY_PAGE}" data-action="${USUARIOS_ACTIONS.RETRY_PAGE}">${icon("refresh")}<span>Reintentar</span></button><span class="usuarios-feed-count">${escapeHtml(label)}</span></div>`;
  }
  if (!state.hasMore) {
    return `<div class="usuarios-list-footer usuarios-feed-end" data-usuarios-infinite="true"><span class="usuarios-feed-status">${escapeHtml(getFinalUsersMessage(totalKnown, totalCount))}</span></div>`;
  }
  return `<div class="usuarios-list-footer usuarios-feed-more" data-usuarios-infinite="true" data-has-more="true" aria-busy="${state.loadingMore || state.refreshing ? "true" : "false"}">${state.loadingMore || state.refreshing ? "" : '<div class="usuarios-feed-sentinel" data-usuarios-infinite-sentinel="true" aria-hidden="true"></div>'}<span class="usuarios-feed-status">${state.loadingMore ? renderSpinner("Cargando más usuarios...") : state.refreshing ? renderSpinner("Actualizando usuarios...") : "Continúa desplazándote para cargar usuarios automáticamente."}</span><span class="usuarios-feed-count">${escapeHtml(label)}</span></div>`;
}

function renderTableLoading(rows = 6) {
  return `<div class="usuarios-table-loading" aria-hidden="true">${Array.from({ length: rows }).map(() => `<div class="usuarios-table-loading-row"><span class="usuarios-skeleton usuarios-skeleton--avatar"></span><div class="usuarios-table-loading-copy"><span class="usuarios-skeleton usuarios-skeleton--xs"></span><span class="usuarios-skeleton usuarios-skeleton--lg"></span><span class="usuarios-skeleton usuarios-skeleton--md"></span></div><span class="usuarios-skeleton usuarios-skeleton--pill"></span><span class="usuarios-skeleton usuarios-skeleton--date"></span><span class="usuarios-skeleton usuarios-skeleton--email"></span><span class="usuarios-skeleton usuarios-skeleton--location"></span><span class="usuarios-skeleton usuarios-skeleton--activity"></span></div>`).join("")}</div>`;
}

export function renderTable(input = {}) {
  const data = safeObject(input);
  const state = stateFrom(data);
  const items = itemsFrom(data);
  const loading = Boolean(first(state.loading, data.loading, false));
  const error = cleanText(first(state.error, data.error, ""), "");
  const filter = filterValue(data);
  const search = searchValue(data);
  const filtering = filter !== "all" || Boolean(cleanText(search, ""));
  const { totalKnown, totalCount } = totalInfo(data, items);
  const loadMoreError = cleanText(state.loadMoreError, "");
  const loadingMore = state.loadingMore === true;
  const refreshing = state.refreshing === true;
  const searchPending = state.searchPending === true;
  const busy = loading || loadingMore || refreshing || searchPending;
  const finalSummary = getFinalUsersMessage(totalKnown, totalCount);
  const subtitle = error
    ? error
    : loadMoreError
      ? loadMoreError
      : loading && !items.length
        ? "Cargando usuarios..."
        : searchPending
          ? "Preparando la búsqueda de usuarios..."
        : loadingMore
          ? `Cargando usuarios automáticamente · ${formatNumber(items.length)} cargados`
          : refreshing
            ? `Actualizando ${formatNumber(items.length)} usuarios cargados...`
            : !state.hasMore && items.length
              ? finalSummary
              : totalKnown
                ? `Mostrando ${formatNumber(items.length)} de ${formatNumber(totalCount)}`
                : `Mostrando ${formatNumber(items.length)} usuarios cargados`;

  const inlineError = error && items.length
    ? `<div class="usuarios-inline-error" role="alert" aria-atomic="true"><span class="usuarios-inline-error-icon" aria-hidden="true">${icon("alert")}</span><span>${escapeHtml(error)}</span></div>`
    : "";
  const content = loading && !items.length
    ? renderTableLoading()
    : items.length
      ? `<div class="usuarios-table-wrap${refreshing ? " is-refreshing" : ""}">${refreshing ? renderRefreshOverlay() : ""}<div class="usuarios-table-shell"><table class="usuarios-table" data-table-columns="6" data-table-scale="${TABLE_SCALE}">${renderColgroup()}${renderThead()}<tbody>${items.map((item) => renderRow(item, state)).join("")}</tbody></table></div></div>${renderFooter(data, items)}`
      : renderEmptyContent({ error, filtering, restricted: isRestricted(data), admin: data.admin !== false });

  return `<section class="usuarios-history${loading ? " is-loading" : ""}${error ? " has-error" : ""}" data-usuarios-history="true" aria-busy="${busy ? "true" : "false"}"><div class="usuarios-history-head"><div class="usuarios-history-copy"><h2 class="usuarios-history-title">Historial de usuarios</h2><p class="usuarios-history-subtitle" tabindex="-1" role="status" aria-live="polite" aria-atomic="true">${escapeHtml(subtitle)}</p></div>${renderFilters(data)}</div>${inlineError}${content}</section>`;
}

export function renderUsuariosTableTemplate(input = {}) {
  const data = safeObject(input);
  const state = stateFrom(data);
  const items = itemsFrom(data);
  const loading = Boolean(first(state.loading, data.loading, false));
  const error = cleanText(first(state.error, data.error, ""), "");
  const rootAttrs = `data-usuarios-scope="true" data-template-version="${attr(USUARIOS_TEMPLATE_VERSION)}" data-loaded="${attr(String(items.length))}" data-total-known="${state.totalKnown ? "true" : "false"}" data-has-more="${state.hasMore ? "true" : "false"}" data-filter="${attr(filterValue(data))}" data-loading="${loading ? "true" : "false"}" data-table-columns="6" data-table-scale="${TABLE_SCALE}"`;
  if (isRestricted(data)) return `<section class="usuarios-view-root is-restricted" ${rootAttrs}>${renderAccessDeniedState()}</section>`;
  if (error && !items.length) return `<section class="usuarios-view-root has-error" ${rootAttrs}>${renderTable(data)}</section>`;
  return `<section class="usuarios-view-root${loading ? " is-loading" : ""}${error ? " has-error" : ""}" ${rootAttrs} aria-busy="${loading ? "true" : "false"}">${renderHeader(data)}${renderTable(data)}</section>`;
}

export function renderLoadingState(input = {}) {
  return renderUsuariosTableTemplate({ ...safeObject(input), state: { ...stateFrom(input), loading: true } });
}
export function renderErrorState(message = "No se pudieron cargar los usuarios.") {
  return renderUsuariosTableTemplate({ items: [], error: cleanText(message, "No se pudieron cargar los usuarios."), state: { error: cleanText(message, "No se pudieron cargar los usuarios.") } });
}
export function renderAccessDeniedState() {
  return `<section class="usuarios-history">${renderEmptyContent({ restricted: true, admin: false })}</section>`;
}
export function renderEmptyUsuariosState(options = {}) {
  return `<section class="usuarios-history">${renderEmptyContent(options)}</section>`;
}
export const renderEmptyState = renderEmptyUsuariosState;
export const renderCards = renderTable;

export function getUsuariosTableTemplateSnapshot(input = {}) {
  const items = itemsFrom(input);
  const state = stateFrom(input);
  return {
    version: USUARIOS_TEMPLATE_VERSION,
    actions: USUARIOS_ACTIONS,
    columns: USUARIOS_TABLE_COLUMNS.map((column) => column.key),
    tableColumns: 6,
    tableActions: false,
    tableScale: TABLE_SCALE,
    loaded: items.length,
    totalKnown: Boolean(state.totalKnown),
    totalCount: state.totalKnown ? number(state.totalCount, items.length) : null,
    hasMore: Boolean(state.hasMore),
    filter: filterValue(input),
    restricted: isRestricted(input),
    architecture: {
      pureTemplate: true,
      serverFiltered: true,
      cursorDriven: true,
      localDatasetCeiling: false,
      http: false,
      store: false,
      router: false,
      dom: false,
      rowDetailAction: true,
      safeAvatarUrls: true,
    },
  };
}

export const renderTemplate = renderUsuariosTableTemplate;
export const renderUsuariosTemplate = renderUsuariosTableTemplate;
export const getSnapshot = getUsuariosTableTemplateSnapshot;
export default renderUsuariosTableTemplate;
