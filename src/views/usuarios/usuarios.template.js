/* =========================================================
   Onion Support - Usuarios Template
   Archivo: /src/views/usuarios/usuarios.template.js

   PRODUCTIVO · CLIENTES VISUAL PARITY · V23 · 2026-08-22

   Contrato:
   - Template puro: sin HTTP, Store, Router ni side effects.
   - Misma gramática visual que Clientes para hero, KPIs, filtros y tabla.
   - KPIs superiores interactivos reutilizando el filtro canónico existente.
   - Avatares deterministas de 10 tonos, 42px y radio suave como Clientes.
   - Seis columnas propias: Usuario / Estado / Alta / Email / Ciudad / Última conexión.
   - Fila completa interactiva; sin columna de acciones.
========================================================= */

export const USUARIOS_TEMPLATE_VERSION =
  "usuarios.template.productivo.v23.clientes-visual-parity";
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
const MAX_VISIBLE_ROWS = 500;
const TABLE_SCALE = "100";

const FILTERS = Object.freeze([
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "pending", label: "Pendientes" },
  { key: "blocked", label: "Bloqueados" },
]);

export const USUARIOS_TABLE_COLUMNS = Object.freeze([
  { key: "main", label: "Usuario", colClass: "usuarios-col--main", thClass: "usuarios-th usuarios-th--main", cellClass: "usuarios-cell usuarios-cell--main" },
  { key: "status", label: "Estado", colClass: "usuarios-col--status", thClass: "usuarios-th usuarios-th--status", cellClass: "usuarios-cell usuarios-cell--status" },
  { key: "date", label: "Alta", colClass: "usuarios-col--date", thClass: "usuarios-th usuarios-th--date", cellClass: "usuarios-cell usuarios-cell--date" },
  { key: "email", label: "Email", colClass: "usuarios-col--email", thClass: "usuarios-th usuarios-th--email", cellClass: "usuarios-cell usuarios-cell--email" },
  { key: "location", label: "Ciudad", colClass: "usuarios-col--location", thClass: "usuarios-th usuarios-th--location", cellClass: "usuarios-cell usuarios-cell--location" },
  { key: "activity", label: "Última conexión", colClass: "usuarios-col--activity", thClass: "usuarios-th usuarios-th--activity", cellClass: "usuarios-cell usuarios-cell--activity" },
]);

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && typeof value.length === "number" && typeof value !== "string") {
    try { return Array.from(value); } catch { return []; }
  }
  return [];
}

function cleanText(value = "", fallback = "") {
  const text = String(value ?? "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
  return text || fallback;
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

function clamp(value, min, max) {
  return Math.min(Math.max(number(value, min), min), max);
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

function normalizeSearch(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@._+\-\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTimestamp(value = null) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return 0;
    return value > 9_999_999_999 ? value : value * 1000;
  }
  const raw = cleanText(value, "");
  if (!raw) return 0;
  if (/^[+\-]?\d+(?:\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) return numeric > 9_999_999_999 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value = 0) {
  try { return new Intl.NumberFormat("es-ES").format(number(value, 0)); }
  catch { return String(number(value, 0)); }
}

function formatDateTime(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "—";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date(timestamp));
  } catch { return "—"; }
}

function formatDateShort(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "—";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit", month: "short", year: "numeric",
    }).format(new Date(timestamp));
  } catch { return "—"; }
}

function formatRelativeDate(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "Sin actividad";
  const diffMinutes = Math.round((timestamp - Date.now()) / 60_000);
  const absolute = Math.abs(diffMinutes);
  if (absolute < 1) return "Ahora mismo";
  if (absolute < 60) return diffMinutes > 0 ? `En ${absolute} min` : `Hace ${absolute} min`;
  const hours = Math.round(absolute / 60);
  if (hours < 24) return diffMinutes > 0 ? `En ${hours} h` : `Hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days <= 7) return diffMinutes > 0 ? `En ${days} día${days === 1 ? "" : "s"}` : `Hace ${days} día${days === 1 ? "" : "s"}`;
  return formatDateShort(timestamp);
}

function formatLastAccess(value = null) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "Sin acceso";
  const ageHours = Math.abs(Date.now() - timestamp) / 3_600_000;
  return ageHours <= 72 ? formatRelativeDate(timestamp) : formatDateTime(timestamp);
}

function safeAvatarUrl(value = "") {
  const raw = cleanText(value, "");
  if (!raw || raw.startsWith("//") || /[\r\n\t\\]/.test(raw) || /^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (/^blob:/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");
  const localHttp = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw);
  if (!/^https:\/\//i.test(raw) && !localHttp) return "";
  try {
    const url = new URL(raw);
    const keys = [...url.searchParams.keys()].map((key) => key.toLowerCase());
    const sensitive = ["access_token", "refresh_token", "id_token", "token", "code", "secret", "session", "password", "pwd", "jwt", "authorization", "reset_token", "activation_token"];
    if (keys.some((key) => sensitive.includes(key))) return "";
    const sasKeys = ["sig", "se", "sp", "sv", "sr", "spr", "st", "skoid", "sktid", "skt", "ske", "sks", "skv"];
    const hasSas = keys.some((key) => sasKeys.includes(key));
    const azureBlob = url.hostname.toLowerCase().endsWith(".blob.core.windows.net");
    if (hasSas && !azureBlob) return "";
    return url.href;
  } catch { return ""; }
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
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
  };
  return `<svg ${common}>${paths[name] || paths.chevron}</svg>`;
}

function getResolvedItems(input = {}) {
  if (Array.isArray(input)) return input.filter(isObject);
  const data = safeObject(input);
  for (const candidate of [data.items, data.users, data.usuarios, data.rows, data.results]) {
    if (Array.isArray(candidate)) return candidate.filter(isObject);
  }
  return [];
}

function getUsuarioId(item = {}) {
  return cleanText(first(item.userId, item.id, item.usuarioId, item.uid, item.email, ""), "");
}

function getUsuarioCode(item = {}) {
  return cleanText(first(item.code, item.username, getUsuarioId(item), item.email, "USR-SIN-ID"), "USR-SIN-ID");
}

function getUsuarioName(item = {}) {
  return cleanText(first(item.fullName, item.displayName, item.name, item.nombre, item.username, item.email, getUsuarioId(item), "Usuario"), "Usuario");
}

function getUsuarioEmail(item = {}) {
  return cleanText(first(item.email, item.emailLower, item.mail, ""), "").toLowerCase() || "Sin email";
}

function getUsuarioPhone(item = {}) {
  return cleanText(first(item.phone, item.telefono, item.mobile, ""), "");
}

function getUsuarioLocation(item = {}) {
  return cleanText(first(item.city, item.ciudad, item.direccion?.ciudad, item.address?.ciudad, ""), "") || "Sin ciudad";
}

function getUsuarioDescription(item = {}) {
  const parts = [];
  const phone = getUsuarioPhone(item);
  const nif = cleanText(item.nif, "");
  const tipo = normalizeKey(item.tipo);
  if (tipo === "empresa") parts.push("Empresa");
  else if (tipo === "particular") parts.push("Particular");
  if (phone) parts.push(phone);
  if (nif) parts.push(nif);
  return parts.join(" · ") || "Usuario Onion Support";
}

function getUsuarioRoleValue(item = {}) {
  return normalizeKey(first(item.role, item.rol, "user")) === "admin" ? "admin" : "user";
}

function getUsuarioRoleLabel(item = {}) {
  return getUsuarioRoleValue(item) === "admin" ? "Admin" : "Usuario";
}

function getStatusValue(item = {}) {
  const key = normalizeKey(first(item.status, item.estado, item.state, item.active === false ? "inactive" : "active"));
  if (["pending", "pendiente", "new", "nuevo", "invited"].includes(key)) return "pending";
  if (["blocked", "bloqueado", "suspended", "locked"].includes(key)) return "blocked";
  if (["inactive", "inactivo", "disabled", "archived", "deleted"].includes(key)) return "inactive";
  return "active";
}

function statusBucket(item = {}) {
  const status = getStatusValue(item);
  return status === "pending" ? "pending" : ["blocked", "inactive"].includes(status) ? "blocked" : "active";
}

function statusLabel(item = {}) {
  const status = getStatusValue(item);
  if (status === "pending") return "Pendiente";
  if (status === "blocked") return "Bloqueado";
  if (status === "inactive") return "Inactivo";
  return "Activo";
}

function getCreatedAt(item = {}) {
  return first(item.createdAt, null);
}

function getUpdatedAt(item = {}) {
  return first(item.updatedAt, item.lastActivityAt, item.lastLoginAt, item.createdAt, null);
}

function getLastLoginAt(item = {}) {
  return first(item.lastLoginAt, item.lastAccessAt, null);
}

function getAvatarUrl(item = {}) {
  return safeAvatarUrl(first(item.avatarUrl, item.avatar, item.photoUrl, item.picture, ""));
}

function initials(value = "") {
  const words = cleanText(value, "US").split(/\s+/).filter(Boolean);
  return (words.length >= 2 ? `${words[0][0]}${words[1][0]}` : words[0].slice(0, 2)).toUpperCase();
}

function avatarTone(item = {}) {
  const seed = cleanText(first(item.email, item.emailLower, item.mail, getUsuarioName(item), getUsuarioId(item), "usuario"), "usuario");
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 10;
}

function getActiveFilter(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  const key = normalizeKey(first(data.filter, data.activeFilter, state.filter, state.activeFilter, "all"));
  return ["active", "pending", "blocked"].includes(key) ? key : "all";
}

function getSearchQuery(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  return cleanText(first(data.search, data.searchQuery, state.search, state.searchQuery, ""), "");
}

function searchText(item = {}) {
  return normalizeSearch([
    getUsuarioId(item), getUsuarioCode(item), getUsuarioName(item), getUsuarioDescription(item),
    getUsuarioEmail(item), getUsuarioLocation(item), getUsuarioRoleLabel(item), statusLabel(item),
    item.username, item.clienteId, item.phone, item.telefono, item.nif, item.tipo,
  ].filter(Boolean).join(" "));
}

function filterItems(items = [], input = {}) {
  const filter = getActiveFilter(input);
  const terms = normalizeSearch(getSearchQuery(input)).split(" ").filter(Boolean);
  return safeArray(items).filter((item) => {
    if (filter !== "all" && statusBucket(item) !== filter) return false;
    if (!terms.length) return true;
    const haystack = searchText(item);
    return terms.every((term) => haystack.includes(term));
  });
}

function computeStats(items = []) {
  const rows = safeArray(items);
  return {
    total: rows.length,
    activeCount: rows.filter((item) => statusBucket(item) === "active").length,
    pendingCount: rows.filter((item) => statusBucket(item) === "pending").length,
    blockedCount: rows.filter((item) => statusBucket(item) === "blocked").length,
    withAccessCount: rows.filter((item) => Boolean(toTimestamp(getLastLoginAt(item)))).length,
  };
}

function resolveRemoteCount(input = {}, items = []) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  return Math.max(safeArray(items).length, number(first(data.remoteCount, data.totalCount, data.total, state.remoteCount, state.totalCount, state.total, safeArray(items).length), safeArray(items).length));
}

function getPagination(items = [], input = {}) {
  const filteredItems = filterItems(items, input);
  const data = safeObject(input);
  const state = safeObject(data.state);
  const visibleLimit = clamp(first(data.visibleLimit, data.usuariosVisibleLimit, state.visibleLimit, state.usuariosVisibleLimit, DEFAULT_VISIBLE_ROWS), 1, MAX_VISIBLE_ROWS);
  const filter = getActiveFilter(input);
  const search = getSearchQuery(input);
  const filtering = filter !== "all" || Boolean(search);
  const remoteTotal = resolveRemoteCount(input, items);
  const totalCount = filtering ? filteredItems.length : remoteTotal;
  const pageItems = filteredItems.slice(0, visibleLimit);
  return {
    filteredItems,
    pageItems,
    visibleLimit,
    visibleCount: pageItems.length,
    remainingCount: Math.max(0, filteredItems.length - pageItems.length),
    totalCount,
    remoteTotal,
    hasMore: filteredItems.length > pageItems.length,
    filtering,
    activeFilter: filter,
    searchQuery: search,
  };
}

function isRestricted(input = {}) {
  const data = safeObject(input);
  const state = safeObject(data.state);
  return Boolean(first(data.forbidden, data.restricted, data.accessDenied, state.forbidden, state.restricted, state.accessDenied, false));
}

function renderSpinner(label = "") {
  return `<span class="usuarios-inline-loading"><span class="usuarios-inline-spinner" aria-hidden="true"></span>${label ? `<span>${escapeHtml(label)}</span>` : ""}</span>`;
}

function renderAvatar(item = {}) {
  const name = getUsuarioName(item);
  const src = getAvatarUrl(item);
  const tone = avatarTone(item);
  return `
    <span class="usuarios-avatar usuarios-avatar--tone-${tone}${src ? " has-image" : ""}" data-has-avatar="${src ? "true" : "false"}" aria-hidden="true">
      ${src ? `<img class="usuarios-avatar-img" src="${attr(src)}" alt="" width="42" height="42" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">` : ""}
      <span class="usuarios-avatar-fallback">${escapeHtml(initials(name))}</span>
    </span>
  `;
}

function renderStatusChip(item = {}) {
  const bucket = statusBucket(item);
  return `<span class="usuarios-chip usuarios-chip--${attr(bucket)}"><span class="usuarios-chip-dot" aria-hidden="true"></span><span>${escapeHtml(statusLabel(item))}</span></span>`;
}

function renderRow(item = {}, state = {}) {
  const id = getUsuarioId(item);
  const name = getUsuarioName(item);
  const status = statusBucket(item);
  const openingId = cleanText(first(state.openingUserId, state.detailUserId, state.loadingUserId, ""), "");
  const opening = Boolean(id && openingId === id);
  const interactive = Boolean(id);
  const createdAt = getCreatedAt(item);
  const lastLoginAt = getLastLoginAt(item);

  return `
    <tr class="usuarios-table-row usuarios-table-row--${attr(status)}${opening ? " is-loading" : ""}"
      data-user-row="true" data-user-id="${attr(id)}" data-usuario-id="${attr(id)}"
      data-detail-target="${interactive ? "true" : "false"}"
      ${interactive ? `data-usuarios-action="${USUARIOS_ACTIONS.DETAIL}" data-action="open-user" tabindex="0" role="button" aria-label="Abrir usuario ${attr(name)}"` : 'aria-disabled="true"'}
      aria-busy="${opening ? "true" : "false"}">
      <td class="usuarios-cell usuarios-cell--main" data-column="main">
        <div class="usuarios-main">
          ${renderAvatar(item)}
          <div class="usuarios-main-copy">
            <div class="usuarios-user-line-top">
              <span class="usuarios-user-id">${escapeHtml(getUsuarioCode(item))}</span>
              <span class="usuarios-role-pill usuarios-role-pill--${attr(getUsuarioRoleValue(item))}">${escapeHtml(getUsuarioRoleLabel(item))}</span>
            </div>
            <div class="usuarios-user-name">${escapeHtml(name)}</div>
            <div class="usuarios-user-description">${escapeHtml(getUsuarioDescription(item))}</div>
          </div>
        </div>
      </td>
      <td class="usuarios-cell usuarios-cell--status" data-column="status">${renderStatusChip(item)}</td>
      <td class="usuarios-cell usuarios-cell--date" data-column="date"><span class="usuarios-date-inline" title="${attr(formatDateTime(createdAt))}">${escapeHtml(formatDateShort(createdAt))}</span></td>
      <td class="usuarios-cell usuarios-cell--email" data-column="email"><span class="usuarios-email-inline" title="${attr(getUsuarioEmail(item))}">${escapeHtml(getUsuarioEmail(item))}</span></td>
      <td class="usuarios-cell usuarios-cell--location" data-column="location"><span class="usuarios-location-inline" title="${attr(getUsuarioLocation(item))}">${escapeHtml(getUsuarioLocation(item))}</span></td>
      <td class="usuarios-cell usuarios-cell--activity" data-column="activity"><span class="usuarios-activity-inline" title="${attr(lastLoginAt ? formatDateTime(lastLoginAt) : "Sin acceso")}">${escapeHtml(lastLoginAt ? formatLastAccess(lastLoginAt) : "Sin acceso")}</span></td>
    </tr>
  `;
}

function renderStatCard({ filter, tone, iconName, label, value, description, activeFilter } = {}) {
  const active = activeFilter === filter;
  return `
    <button type="button"
      class="usuarios-stat-card usuarios-stat-card--${attr(tone)}${active ? " is-active" : ""}"
      data-usuarios-action="${USUARIOS_ACTIONS.FILTER}" data-action="filter" data-filter="${attr(filter)}"
      aria-pressed="${active ? "true" : "false"}" aria-label="Filtrar usuarios: ${attr(label)}">
      <span class="usuarios-stat-topline"><span class="usuarios-stat-label">${escapeHtml(label)}</span><span class="usuarios-stat-icon" aria-hidden="true">${icon(iconName)}</span></span>
      <span class="usuarios-stat-value">${escapeHtml(formatNumber(value))}</span>
      <span class="usuarios-stat-text">${escapeHtml(description)}</span>
    </button>
  `;
}

export function renderHeader(input = {}) {
  const data = safeObject(input);
  const items = getResolvedItems(data);
  const state = safeObject(data.state);
  const stats = computeStats(items);
  const activeFilter = getActiveFilter(data);
  const remoteCount = resolveRemoteCount(data, items);
  const updatedAt = Math.max(number(first(data.lastSyncAt, state.lastSyncAt, 0), 0), ...items.map((item) => toTimestamp(getUpdatedAt(item))));
  const title = cleanText(first(data.title, state.title, "Usuarios"), "Usuarios");
  const subtitle = cleanText(first(data.subtitle, state.subtitle, "Gestiona usuarios, estados, accesos y contactos desde un único historial."), "");
  const creating = Boolean(first(state.creating, data.creating, false));
  const loading = Boolean(first(state.loading, data.loading, false));
  const exporting = Boolean(first(state.exporting, data.exporting, false));
  const admin = data.admin !== false && !isRestricted(data);

  return `
    <section class="usuarios-hero" data-usuarios-hero="true">
      <div class="usuarios-hero-top">
        <div class="usuarios-hero-copy">
          <h1 class="usuarios-page-title">${escapeHtml(title)}</h1>
          <p class="usuarios-page-subtitle">${escapeHtml(subtitle)}</p>
        </div>
        ${admin ? `<div class="usuarios-hero-actions">
          <button type="button" id="usuarios-export-btn" class="usuarios-btn" data-usuarios-action="${USUARIOS_ACTIONS.EXPORT}" data-action="export" ${!items.length || loading || exporting ? 'disabled aria-disabled="true"' : ""}>
            ${exporting ? renderSpinner("Exportando...") : `${icon("export")}<span>Exportar CSV</span>`}
          </button>
          <button type="button" id="usuarios-create-btn" class="usuarios-btn usuarios-btn--create" data-usuarios-action="${USUARIOS_ACTIONS.CREATE}" data-action="create" ${creating || loading ? 'disabled aria-disabled="true"' : ""}>
            ${creating ? renderSpinner("Abriendo...") : `${icon("plus")}<span>Nuevo usuario</span>`}
          </button>
        </div>` : ""}
      </div>

      <div class="usuarios-hero-meta">
        <span class="usuarios-meta-pill">${icon("users")}<span>${escapeHtml(`${formatNumber(remoteCount)} usuarios`)}</span></span>
        <span class="usuarios-meta-pill">${icon("refresh")}<span>${updatedAt ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`) : "Sin actualizaciones recientes"}</span></span>
        <span class="usuarios-meta-pill">${icon("activity")}<span>${escapeHtml(`${formatNumber(stats.withAccessCount)} con actividad`)}</span></span>
      </div>

      <div class="usuarios-stats" role="group" aria-label="Filtrar usuarios por resumen">
        ${renderStatCard({ filter: "all", tone: "accent", iconName: "users", label: "Usuarios", value: stats.total, description: "Todos los registros disponibles.", activeFilter })}
        ${renderStatCard({ filter: "active", tone: "success", iconName: "check", label: "Activos", value: stats.activeCount, description: "Usuarios operativos.", activeFilter })}
        ${renderStatCard({ filter: "pending", tone: "warning", iconName: "clock", label: "Pendientes", value: stats.pendingCount, description: "Altas o validaciones pendientes.", activeFilter })}
        ${renderStatCard({ filter: "blocked", tone: "danger", iconName: "lock", label: "Bloqueados", value: stats.blockedCount, description: "Cuentas restringidas o inactivas.", activeFilter })}
      </div>
    </section>
  `;
}

function renderSearch(input = {}) {
  const search = getSearchQuery(input);
  return `
    <div class="usuarios-search" role="search" aria-label="Buscar usuarios">
      <span class="usuarios-search-icon" aria-hidden="true">${icon("search")}</span>
      <input id="usuarios-search-input" class="usuarios-search-input" type="search" value="${attr(search)}"
        placeholder="Buscar usuario, email, ciudad..." autocomplete="off" spellcheck="false"
        data-usuarios-search-input="true" data-usuarios-field="search" data-field="search"
        aria-label="Buscar usuarios por nombre, email, ciudad, teléfono o identificador">
      ${search ? `<button type="button" class="usuarios-search-clear" data-usuarios-action="${USUARIOS_ACTIONS.CLEAR_SEARCH}" data-action="clear-search" aria-label="Limpiar búsqueda">${icon("close")}</button>` : ""}
    </div>
  `;
}

function renderFilters(input = {}) {
  const items = getResolvedItems(input);
  const stats = computeStats(items);
  const active = getActiveFilter(input);
  const counts = { all: stats.total, active: stats.activeCount, pending: stats.pendingCount, blocked: stats.blockedCount };
  return `
    <div class="usuarios-filters" aria-label="Filtros y búsqueda de usuarios">
      <div class="usuarios-filter-pills" role="group" aria-label="Filtrar usuarios por estado">
        ${FILTERS.map((filter) => `<button type="button" class="usuarios-filter-pill${filter.key === active ? " is-active" : ""}"
          data-usuarios-action="${USUARIOS_ACTIONS.FILTER}" data-action="filter" data-filter="${attr(filter.key)}"
          aria-pressed="${filter.key === active ? "true" : "false"}"><span>${escapeHtml(filter.label)}</span><strong>${escapeHtml(formatNumber(counts[filter.key] || 0))}</strong></button>`).join("")}
      </div>
      ${renderSearch(input)}
    </div>
  `;
}

function renderColgroup() {
  return `<colgroup>${USUARIOS_TABLE_COLUMNS.map((column) => `<col class="${attr(column.colClass)}">`).join("")}</colgroup>`;
}

function renderThead() {
  return `<thead><tr>${USUARIOS_TABLE_COLUMNS.map((column) => `<th scope="col" class="${attr(column.thClass)}" data-column="${attr(column.key)}">${escapeHtml(column.label)}</th>`).join("")}</tr></thead>`;
}

function renderTableLoading(rows = 6) {
  const count = clamp(rows, 4, 8);
  return `
    <div class="usuarios-table-loading" aria-hidden="true">
      ${Array.from({ length: count }).map(() => `<div class="usuarios-table-loading-row">
        <span class="usuarios-skeleton usuarios-skeleton--avatar"></span>
        <div class="usuarios-table-loading-copy"><span class="usuarios-skeleton usuarios-skeleton--xs"></span><span class="usuarios-skeleton usuarios-skeleton--lg"></span><span class="usuarios-skeleton usuarios-skeleton--md"></span></div>
        <span class="usuarios-skeleton usuarios-skeleton--pill"></span>
        <span class="usuarios-skeleton usuarios-skeleton--date"></span>
        <span class="usuarios-skeleton usuarios-skeleton--email"></span>
        <span class="usuarios-skeleton usuarios-skeleton--location"></span>
        <span class="usuarios-skeleton usuarios-skeleton--activity"></span>
      </div>`).join("")}
    </div>
  `;
}

function renderEmptyContent({ hasError = false, filtering = false, searchQuery = "", message = "", restricted = false, allowCreate = true } = {}) {
  if (restricted) {
    return `<div class="usuarios-empty usuarios-empty--forbidden"><div class="usuarios-empty-icon">${icon("shield")}</div><h3>Acceso restringido</h3><p>La vista de usuarios está reservada para administradores.</p></div>`;
  }
  const title = hasError ? "No se pudieron cargar los usuarios" : filtering ? "No hay usuarios con esos filtros" : "Todavía no hay usuarios";
  const text = hasError ? cleanText(message, "Puedes reintentar la carga.") : filtering ? (searchQuery ? `No se encontraron usuarios para “${searchQuery}”. Prueba con otro criterio.` : "Cambia el filtro activo para volver al listado completo.") : "Cuando haya usuarios registrados aparecerán aquí.";
  return `<div class="usuarios-empty">
    <div class="usuarios-empty-icon">${icon(hasError ? "alert" : filtering ? "search" : "users")}</div>
    <h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p>
    ${hasError ? `<button type="button" class="usuarios-btn usuarios-btn--create" data-usuarios-action="${USUARIOS_ACTIONS.RETRY}" data-action="retry">${icon("refresh")}<span>Reintentar</span></button>` : filtering ? `<button type="button" class="usuarios-btn" data-usuarios-action="${USUARIOS_ACTIONS.CLEAR_FILTERS}" data-action="clear-filters">${icon("close")}<span>Limpiar filtros</span></button>` : allowCreate ? `<button type="button" class="usuarios-btn usuarios-btn--create" data-usuarios-action="${USUARIOS_ACTIONS.CREATE}" data-action="create">${icon("plus")}<span>Crear usuario</span></button>` : ""}
  </div>`;
}

function renderFooter(pagination = {}, state = {}) {
  if (!pagination.visibleCount) return "";
  if (!pagination.hasMore) return `<div class="usuarios-list-footer"><span>Has visto todos los usuarios disponibles.</span></div>`;
  const next = Math.min(MAX_VISIBLE_ROWS, pagination.visibleLimit + DEFAULT_VISIBLE_ROWS);
  return `<div class="usuarios-list-footer">
    <button type="button" class="usuarios-load-more-btn" data-usuarios-action="${USUARIOS_ACTIONS.LOAD_MORE}" data-action="load-more" data-visible-limit="${attr(String(next))}" ${state.loading ? 'disabled aria-disabled="true"' : ""}>
      <span>Cargar ${Math.min(DEFAULT_VISIBLE_ROWS, pagination.remainingCount)} más</span>
    </button>
    <span>${escapeHtml(`${formatNumber(pagination.visibleCount)} de ${formatNumber(pagination.totalCount)}`)}</span>
  </div>`;
}

export function renderTable(input = {}) {
  const data = safeObject(input);
  const items = getResolvedItems(data);
  const state = safeObject(data.state);
  const pagination = getPagination(items, data);
  const loading = Boolean(first(state.loading, data.loading, false));
  const errorMessage = cleanText(first(state.error, data.error, ""), "");
  const admin = data.admin !== false && !isRestricted(data);
  const criteria = [pagination.activeFilter !== "all" ? FILTERS.find((entry) => entry.key === pagination.activeFilter)?.label : "", pagination.searchQuery ? `búsqueda “${pagination.searchQuery}”` : ""].filter(Boolean);
  const subtitle = loading && !items.length ? "Cargando usuarios..." : pagination.filtering ? `Mostrando ${formatNumber(pagination.visibleCount)} de ${formatNumber(pagination.totalCount)} · ${criteria.join(" · ")}` : `Mostrando ${formatNumber(pagination.visibleCount)} de ${formatNumber(pagination.totalCount)}`;

  return `
    <section class="usuarios-history${loading ? " is-loading" : ""}${errorMessage ? " has-error" : ""}" data-usuarios-history="true" aria-live="polite" aria-busy="${loading ? "true" : "false"}">
      <div class="usuarios-history-head">
        <div class="usuarios-history-copy"><h2 class="usuarios-history-title">Historial de usuarios</h2><p class="usuarios-history-subtitle">${escapeHtml(subtitle)}</p></div>
        ${renderFilters(data)}
      </div>
      ${errorMessage && items.length ? `<div class="usuarios-inline-error" role="status">No se pudo sincronizar ahora. Se muestran los últimos datos disponibles.</div>` : ""}
      ${loading && !items.length ? renderTableLoading() : pagination.pageItems.length ? `<div class="usuarios-table-shell"><table class="usuarios-table" data-table-columns="6" data-table-scale="${TABLE_SCALE}">${renderColgroup()}${renderThead()}<tbody>${pagination.pageItems.map((item) => renderRow(item, state)).join("")}</tbody></table></div>${renderFooter(pagination, state)}` : renderEmptyContent({ hasError: Boolean(errorMessage), filtering: pagination.filtering, searchQuery: pagination.searchQuery, message: errorMessage, allowCreate: admin })}
    </section>
  `;
}

export function renderLoadingState(input = {}) {
  return renderUsuariosTableTemplate({ ...safeObject(input), loading: true });
}

export function renderErrorState(message = "No se pudieron cargar los usuarios.") {
  return renderUsuariosTableTemplate({ items: [], error: cleanText(message, "No se pudieron cargar los usuarios."), loading: false });
}

export function renderAccessDeniedState() {
  return `<section class="usuarios-history">${renderEmptyContent({ restricted: true, allowCreate: false })}</section>`;
}

export function renderEmptyUsuariosState(options = {}) {
  return `<section class="usuarios-history">${renderEmptyContent(options)}</section>`;
}

export function renderEmptyState(options = {}) {
  return renderEmptyUsuariosState(options);
}

export const renderCards = renderTable;

export function renderUsuariosTableTemplate(input = {}) {
  const data = safeObject(input);
  const items = getResolvedItems(data);
  const state = safeObject(data.state);
  const loading = Boolean(first(state.loading, data.loading, false));
  const error = cleanText(first(state.error, data.error, ""), "");
  const pagination = getPagination(items, data);
  const rootAttrs = `data-usuarios-scope="true" data-template-version="${attr(USUARIOS_TEMPLATE_VERSION)}" data-total="${attr(String(pagination.totalCount))}" data-visible="${attr(String(pagination.visibleCount))}" data-visible-limit="${attr(String(pagination.visibleLimit))}" data-filter="${attr(pagination.activeFilter)}" data-loading="${loading ? "true" : "false"}" data-table-columns="6" data-table-scale="${TABLE_SCALE}"`;

  if (isRestricted(data)) return `<section class="usuarios-view-root is-restricted" ${rootAttrs}>${renderAccessDeniedState()}</section>`;
  if (error && !items.length) return `<section class="usuarios-view-root has-error" ${rootAttrs}>${renderErrorStateInline(error, data)}</section>`;

  const payload = { ...data, items, state };
  return `<section class="usuarios-view-root${loading ? " is-loading" : ""}${error ? " has-error" : ""}" ${rootAttrs} aria-busy="${loading ? "true" : "false"}">${renderHeader(payload)}${renderTable(payload)}</section>`;
}

function renderErrorStateInline(message = "", data = {}) {
  const admin = data.admin !== false;
  return `<section class="usuarios-history">${renderEmptyContent({ hasError: true, message, allowCreate: admin })}</section>`;
}

export function getUsuariosTableTemplateSnapshot(input = {}) {
  const items = getResolvedItems(input);
  const pagination = getPagination(items, input);
  return {
    version: USUARIOS_TEMPLATE_VERSION,
    actions: USUARIOS_ACTIONS,
    columns: USUARIOS_TABLE_COLUMNS.map((column) => column.key),
    tableColumns: 6,
    tableActions: false,
    tableScale: TABLE_SCALE,
    total: pagination.totalCount,
    visible: pagination.visibleCount,
    visibleLimit: pagination.visibleLimit,
    remainingCount: pagination.remainingCount,
    hasMore: pagination.hasMore,
    filter: pagination.activeFilter,
    restricted: isRestricted(input),
    architecture: {
      pureTemplate: true,
      http: false,
      store: false,
      router: false,
      dom: false,
      interactiveStatCards: true,
      deterministicAvatarPalette: true,
      clientesVisualParity: true,
      rowDetailAction: true,
      actionsColumn: false,
      safeAvatarUrls: true,
    },
    cssContract: {
      root: "usuarios-view-root",
      header: "usuarios-hero",
      history: "usuarios-history",
      filters: "usuarios-filters",
      table: "usuarios-table",
      row: "usuarios-table-row",
      columns: "main,status,date,email,location,activity",
      avatar: "usuarios-avatar 42px / radius-sm / 10 tones",
    },
  };
}

export const renderTemplate = renderUsuariosTableTemplate;
export const renderUsuariosTemplate = renderUsuariosTableTemplate;
export const getSnapshot = getUsuariosTableTemplateSnapshot;
export default renderUsuariosTableTemplate;
