/* =========================================================
   Onion SPA - Usuarios Table Template
   Archivo: src/views/usuarios/usuarios.table.template.js

   FINAL PRODUCTION TEMPLATE · USERS VIEW · CLON 1:1 INCIDENCIAS

   RESPONSABILIDADES:
   - render del hero/header de usuarios
   - render de tabla productiva con paginación real
   - compatibilidad con usuariosView.js
   - estado loading visual en "Ver detalle"
   - estado loading visual en "Nuevo usuario"
   - soporte para payloads backend heterogéneos
   - soporte para envelope backend { ok, count, users }
   - lenguaje visual alineado con incidencias
   - versión desktop + cards mobile
   - sin columna rol
   - sin columna equipo
   - sin columna contacto duplicada
   - columna email dedicada
   - columna ubicación solo ciudad
   - actividad mostrando solo última conexión
========================================================= */

import { usuariosState } from "./usuarios.state.js";

import {
  getUsuarios,
  sortUsuariosByUpdatedDesc,
} from "./usuarios.store.js";

import {
  escapeHtml,
  formatDate,
  formatRelativeDate,
  truncate,
} from "./usuarios.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

const PAGE_SIZE = 5;

/* =========================================================
   SAFE HELPERS
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
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
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

function normalizeWhitespace(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

/* =========================================================
   ENVELOPE / BACKEND RESOLVE
========================================================= */

function looksLikeUsuariosEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    Array.isArray(obj?.usuarios) ||
      Array.isArray(obj?.users) ||
      Array.isArray(obj?.items) ||
      Array.isArray(obj?.data) ||
      Array.isArray(obj?.results)
  );
}

function unwrapItemsEnvelope(value) {
  const obj = safeObject(value);

  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(obj?.usuarios)) {
    return obj.usuarios;
  }

  if (Array.isArray(obj?.users)) {
    return obj.users;
  }

  if (Array.isArray(obj?.items)) {
    return obj.items;
  }

  if (Array.isArray(obj?.data)) {
    return obj.data;
  }

  if (Array.isArray(obj?.results)) {
    return obj.results;
  }

  if (looksLikeUsuariosEnvelope(obj?.data)) {
    return unwrapItemsEnvelope(obj.data);
  }

  return [];
}

function resolveRemoteCount(items, state = {}) {
  const localState = safeObject(state);

  return safeNumber(
    first(
      localState.remoteCount,
      localState.count,
      localState.totalCount,
      localState.total,
      safeObject(localState.stats)?.total,
      safeObject(localState.response)?.count,
      safeObject(localState.payload)?.count,
      safeObject(localState.lastResponse)?.count
    ),
    safeArray(items).length
  );
}

function getResolvedItems(items) {
  const direct = safeArray(items);

  if (direct.length) {
    return sortUsuariosByUpdatedDesc(direct);
  }

  const fromEnvelope = unwrapItemsEnvelope(items);

  if (fromEnvelope.length) {
    return sortUsuariosByUpdatedDesc(fromEnvelope);
  }

  try {
    return sortUsuariosByUpdatedDesc(getUsuarios());
  } catch {
    return [];
  }
}

/* =========================================================
   DOMAIN HELPERS
========================================================= */

function getUsuarioId(item = {}) {
  return safeText(
    first(
      item.userId,
      item.usuarioId,
      item.id,
      item.code,
      item.username,
      item.userName
    ),
    ""
  );
}

function getUsuarioCode(item = {}) {
  return safeText(
    first(
      item.username,
      item.userName,
      item.userId,
      item.usuarioId,
      item.id,
      item.code
    ),
    "USR-SIN-ID"
  );
}

function getUsuarioName(item = {}) {
  return safeText(
    first(
      item?.usuario?.nombre,
      item?.usuario?.name,
      item?.profile?.name,
      item?.profile?.displayName,
      item.fullName,
      item.displayName,
      item.nombre,
      item.name,
      [
        safeText(item.firstName, ""),
        safeText(item.lastName, ""),
      ].filter(Boolean).join(" ")
    ),
    "Usuario"
  );
}

function getUsuarioEmail(item = {}) {
  return safeText(
    first(
      item?.usuario?.email,
      item?.profile?.email,
      item.userEmail,
      item.email,
      item.mail
    ),
    "Sin email"
  );
}

function getUsuarioPhone(item = {}) {
  return safeText(
    first(
      item?.usuario?.phone,
      item?.profile?.phone,
      item.phone,
      item.telefono,
      item.mobile
    ),
    "Sin teléfono"
  );
}

function getUsuarioStatusValue(item = {}) {
  return safeText(
    first(
      item.status,
      item.estado,
      item.state,
      typeof item.isActive === "boolean"
        ? item.isActive
          ? "active"
          : "inactive"
        : null,
      typeof item.enabled === "boolean"
        ? item.enabled
          ? "active"
          : "inactive"
        : null
    ),
    "active"
  );
}

function getCreatedAt(item = {}) {
  return first(
    item.createdAt,
    item.created_at,
    item.fechaCreacion,
    item.registeredAt,
    item.updatedAt
  );
}

function getUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.updated_at,
    item.lastLoginAt,
    item.last_login_at,
    item.modifiedAt,
    item.createdAt,
    item.created_at
  );
}

function getLastLoginAt(item = {}) {
  return first(
    item.lastLoginAt,
    item.last_login_at,
    item.lastAccessAt,
    item.ultimoAcceso,
    item?.raw?.lastLoginAt,
    item?.raw?.last_login_at,
    item?.raw?.lastAccessAt,
    item?.raw?.ultimoAcceso
  );
}

function getUsuarioInitials(item = {}) {
  const raw =
    item?.userInitials ||
    item?.usuario?.nombre ||
    item?.usuario?.name ||
    item?.profile?.name ||
    item?.fullName ||
    item?.displayName ||
    item?.nombre ||
    item?.name ||
    item?.username ||
    item?.userName ||
    "US";

  const clean = normalizeWhitespace(raw);
  if (!clean) return "US";

  const parts = clean.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function getUsuarioAvatarUrl(item = {}) {
  return safeText(
    first(
      item?.usuario?.avatar,
      item?.usuario?.avatarUrl,
      item?.profile?.avatar,
      item?.profile?.avatarUrl,
      item.userAvatar,
      item.userAvatarUrl,
      item.avatar,
      item.avatarUrl,
      item.photo,
      item.photoUrl,
      item.image,
      item.imageUrl
    ),
    ""
  );
}

function getUsuarioLocation(item = {}) {
  return safeText(
    first(
      item.city,
      item.ciudad,
      item.locationCity,
      item.ubicacion?.ciudad,
      item.ubicacion?.city,
      item.address?.city,
      item.direccion?.ciudad,
      item.profile?.city,
      item.profile?.ciudad,
      item.usuario?.city,
      item.usuario?.ciudad,
      item?.raw?.city,
      item?.raw?.ciudad,
      item?.raw?.locationCity,
      item?.raw?.ubicacion?.ciudad,
      item?.raw?.ubicacion?.city,
      item?.raw?.address?.city,
      item?.raw?.direccion?.ciudad,
      item?.raw?.profile?.city,
      item?.raw?.profile?.ciudad
    ),
    "Sin ciudad"
  );
}

/* =========================================================
   LABELS / STATUS
========================================================= */

function getStatusKey(value = "") {
  const key = safeLower(value);

  if (["active", "activo", "activa", "enabled", "habilitado"].includes(key)) {
    return "active";
  }

  if (["pending", "pendiente", "invited", "invitado"].includes(key)) {
    return "pending";
  }

  if (["blocked", "bloqueado", "bloqueada", "suspended", "suspendido"].includes(key)) {
    return "blocked";
  }

  if (["disabled", "inactive", "inactivo", "deshabilitado"].includes(key)) {
    return "inactive";
  }

  return "active";
}

function getStatusLabel(value = "") {
  const key = getStatusKey(value);

  if (key === "active") return "Activo";
  if (key === "pending") return "Pendiente";
  if (key === "blocked") return "Bloqueado";
  if (key === "inactive") return "Inactivo";

  return safeText(value, "Activo");
}

/* =========================================================
   STATS
========================================================= */

function isActiveLike(item = {}) {
  return getStatusKey(getUsuarioStatusValue(item)) === "active";
}

function isPendingLike(item = {}) {
  return getStatusKey(getUsuarioStatusValue(item)) === "pending";
}

function isBlockedLike(item = {}) {
  return ["blocked", "inactive"].includes(
    getStatusKey(getUsuarioStatusValue(item))
  );
}

function computeStats(items = []) {
  const list = safeArray(items);

  return {
    totalUsuarios: list.length,
    activeCount: list.filter((item) => isActiveLike(item)).length,
    pendingCount: list.filter((item) => isPendingLike(item)).length,
    blockedCount: list.filter((item) => isBlockedLike(item)).length,
  };
}

/* =========================================================
   PAGINATION
========================================================= */

function clampPage(page = 1, totalPages = 1) {
  const current = safeNumber(page, 1);
  return Math.min(Math.max(current, 1), Math.max(totalPages, 1));
}

function getPagination(items = [], state = {}) {
  const list = safeArray(items);
  const localState = safeObject(state);

  const pageSize = Math.max(1, safeNumber(localState.pageSize, PAGE_SIZE));
  const totalItems = list.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = clampPage(localState.page || 1, totalPages);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    start,
    end,
    items: list.slice(start, end),
    from: totalItems ? start + 1 : 0,
    to: Math.min(end, totalItems),
  };
}

/* =========================================================
   VISUAL HELPERS
========================================================= */

function getStableHash(value = "") {
  const source = String(value || "onion");
  let hash = 0;

  for (let i = 0; i < source.length; i += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

function getFallbackAvatarTheme(seed = "") {
  const themes = [
    {
      bg: "linear-gradient(135deg, rgba(124,92,255,.22), rgba(88,72,200,.10))",
      border: "rgba(124,92,255,.20)",
      text: "#f3eeff",
    },
    {
      bg: "linear-gradient(135deg, rgba(54,198,144,.22), rgba(35,131,95,.10))",
      border: "rgba(54,198,144,.20)",
      text: "#e7fff4",
    },
    {
      bg: "linear-gradient(135deg, rgba(96,165,250,.22), rgba(37,99,235,.10))",
      border: "rgba(96,165,250,.20)",
      text: "#edf5ff",
    },
    {
      bg: "linear-gradient(135deg, rgba(255,188,66,.22), rgba(217,119,6,.10))",
      border: "rgba(255,188,66,.20)",
      text: "#fff6df",
    },
    {
      bg: "linear-gradient(135deg, rgba(255,107,107,.22), rgba(190,24,93,.10))",
      border: "rgba(255,107,107,.20)",
      text: "#fff0f0",
    },
    {
      bg: "linear-gradient(135deg, rgba(179,136,255,.22), rgba(109,40,217,.10))",
      border: "rgba(179,136,255,.20)",
      text: "#f7efff",
    },
  ];

  return themes[getStableHash(seed) % themes.length];
}

function renderSpinner(label = "") {
  return `
    <span class="usuarios-inline-loading">
      <span class="usuarios-inline-spinner" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderAvatar(item = {}) {
  const fullName = getUsuarioName(item);
  const initials = getUsuarioInitials(item);
  const avatarUrl = getUsuarioAvatarUrl(item);
  const theme = getFallbackAvatarTheme(
    first(getUsuarioId(item), fullName, getUsuarioEmail(item), getUsuarioCode(item))
  );

  if (avatarUrl) {
    return `
      <div
        class="usuarios-avatar"
        style="
          --avatar-fallback-bg:${theme.bg};
          --avatar-fallback-border:${theme.border};
          --avatar-fallback-text:${theme.text};
        "
        title="${escapeHtml(fullName)}"
        aria-label="${escapeHtml(fullName)}"
      >
        <img
          src="${escapeHtml(avatarUrl)}"
          alt="${escapeHtml(fullName)}"
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror="this.style.display='none'; this.parentNode.setAttribute('data-fallback','true');"
        />
        <span class="usuarios-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    `;
  }

  return `
    <div
      class="usuarios-avatar usuarios-avatar--fallback"
      style="
        --avatar-fallback-bg:${theme.bg};
        --avatar-fallback-border:${theme.border};
        --avatar-fallback-text:${theme.text};
      "
      title="${escapeHtml(fullName)}"
      aria-label="${escapeHtml(fullName)}"
    >
      <span class="usuarios-avatar-fallback">${escapeHtml(initials)}</span>
    </div>
  `;
}

function renderStatusChip(item = {}) {
  const rawStatus = first(
    item.status,
    item.estado,
    item.state,
    item?.raw?.status,
    item?.raw?.estado,
    item?.raw?.state,
    typeof item.isActive === "boolean"
      ? item.isActive
        ? "active"
        : "inactive"
      : null
  );

  const key = getStatusKey(rawStatus);
  const label = getStatusLabel(rawStatus);

  return `
    <span class="usuarios-chip usuarios-chip--${escapeHtml(key)}">
      ${escapeHtml(label)}
    </span>
  `;
}

/* =========================================================
   STYLES
========================================================= */

function renderStyles() {
  return `
    <style>
      .usuarios-view-root{
        display:grid;
        gap:18px;
      }

      .usuarios-hero{
        position:relative;
        overflow:hidden;
        border-radius:24px;
        border:1px solid color-mix(in srgb, var(--border-soft, rgba(15,23,42,.08)) 88%, transparent);
        background:
          linear-gradient(180deg, rgba(255,255,255,.58), rgba(255,255,255,.36)),
          color-mix(in srgb, var(--panel-bg, #ffffff) 92%, transparent);
        box-shadow:
          0 10px 30px rgba(15,23,42,.04),
          0 1px 0 rgba(255,255,255,.55) inset;
        padding:22px 24px 22px;
      }

      .usuarios-hero-top{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:18px;
        align-items:start;
      }

      .usuarios-hero-copy{
        min-width:0;
        display:grid;
        gap:10px;
      }

      .usuarios-page-title{
        margin:0;
        max-width:100%;
        font-size:clamp(26px, 2.6vw, 42px);
        line-height:.98;
        letter-spacing:-.05em;
        font-weight:780;
        color:var(--text-strong, #0f172a);
        white-space:nowrap;
      }

      .usuarios-page-subtitle{
        margin:0;
        max-width:860px;
        font-size:15px;
        line-height:1.58;
        color:var(--text-dim, #6b7280);
      }

      .usuarios-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:10px;
        flex-wrap:wrap;
      }

      .usuarios-btn{
        min-height:44px;
        padding:0 16px;
        border-radius:14px;
        border:1px solid color-mix(in srgb, var(--border-soft, rgba(15,23,42,.08)) 92%, transparent);
        background:rgba(255,255,255,.72);
        color:var(--text-strong, #111827);
        font-size:13px;
        font-weight:680;
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        box-shadow:0 4px 14px rgba(15,23,42,.04);
        transition:
          transform .16s ease,
          box-shadow .16s ease,
          border-color .16s ease,
          background .16s ease,
          opacity .16s ease;
      }

      .usuarios-btn:hover{
        transform:translateY(-1px);
        box-shadow:0 8px 18px rgba(15,23,42,.06);
      }

      .usuarios-btn--primary{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 16%, rgba(15,23,42,.06));
        background:linear-gradient(
          180deg,
          color-mix(in srgb, var(--accent, #7c5cff) 86%, white 14%),
          color-mix(in srgb, var(--accent, #7c5cff) 92%, black 8%)
        );
        color:#fff;
        box-shadow:0 8px 20px color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
      }

      .usuarios-btn.is-loading,
      .usuarios-detail-btn.is-loading{
        cursor:wait;
        opacity:.9;
      }

      .usuarios-btn:disabled,
      .usuarios-detail-btn:disabled{
        pointer-events:none;
      }

      .usuarios-hero-meta{
        margin-top:14px;
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
      }

      .usuarios-meta-pill{
        min-height:30px;
        padding:0 12px;
        border-radius:999px;
        border:1px solid rgba(15,23,42,.06);
        background:rgba(255,255,255,.52);
        color:#7a8392;
        font-size:11px;
        font-weight:760;
        letter-spacing:.045em;
        text-transform:uppercase;
        display:inline-flex;
        align-items:center;
        white-space:nowrap;
      }

      .usuarios-stats{
        margin-top:16px;
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 280px));
        gap:12px;
      }

      .usuarios-stat-card{
        display:grid;
        gap:8px;
        min-height:124px;
        padding:16px 18px;
        border-radius:20px;
        border:1px solid rgba(15,23,42,.06);
        background:
          linear-gradient(180deg, rgba(255,255,255,.58), rgba(255,255,255,.22)),
          rgba(255,255,255,.46);
        box-shadow:0 6px 20px rgba(15,23,42,.03);
      }

      .usuarios-stat-card--active{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 16%, rgba(15,23,42,.06));
      }

      .usuarios-stat-card--blocked{
        border-color:color-mix(in srgb, var(--success-strong, #36c690) 18%, rgba(15,23,42,.06));
      }

      .usuarios-stat-label{
        font-size:11px;
        font-weight:760;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:#7b8494;
      }

      .usuarios-stat-value{
        font-size:42px;
        line-height:.92;
        letter-spacing:-.045em;
        font-weight:780;
        color:var(--text-strong, #111827);
      }

      .usuarios-stat-text{
        font-size:14px;
        line-height:1.45;
        color:var(--text-dim, #6b7280);
      }

      .usuarios-history{
        overflow:hidden;
        border-radius:24px;
        border:1px solid color-mix(in srgb, var(--border-soft, rgba(15,23,42,.08)) 88%, transparent);
        background:
          linear-gradient(180deg, rgba(255,255,255,.6), rgba(255,255,255,.4)),
          color-mix(in srgb, var(--panel-bg, #ffffff) 94%, transparent);
        box-shadow:
          0 10px 30px rgba(15,23,42,.04),
          0 1px 0 rgba(255,255,255,.5) inset;
      }

      .usuarios-history-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:14px;
        align-items:start;
        padding:14px 18px 12px;
        border-bottom:1px solid rgba(15,23,42,.06);
      }

      .usuarios-history-copy{
        min-width:0;
        display:grid;
        gap:2px;
      }

      .usuarios-history-title{
        margin:0;
        font-size:16px;
        line-height:1.2;
        font-weight:760;
        color:var(--text-strong, #111827);
      }

      .usuarios-history-subtitle{
        margin:0;
        font-size:12px;
        line-height:1.4;
        color:var(--text-dim, #7b8494);
      }

      .usuarios-pagination{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }

      .usuarios-pagination-btn{
        min-height:38px;
        padding:0 14px;
        border-radius:13px;
        border:1px solid rgba(15,23,42,.06);
        background:rgba(255,255,255,.66);
        color:#273142;
        font-size:12px;
        font-weight:680;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        transition:
          background .16s ease,
          border-color .16s ease,
          opacity .16s ease;
      }

      .usuarios-pagination-btn:hover{
        background:rgba(255,255,255,.9);
        border-color:rgba(15,23,42,.10);
      }

      .usuarios-pagination-btn[disabled],
      .usuarios-pagination-btn[aria-disabled="true"]{
        opacity:.48;
        cursor:not-allowed;
      }

      .usuarios-table-wrap{
        position:relative;
      }

      .usuarios-table-wrap.is-refreshing .usuarios-table-shell{
        opacity:.58;
        filter:blur(.8px);
        transition:opacity .18s ease, filter .18s ease;
      }

      .usuarios-table-shell{
        width:100%;
        overflow-x:auto;
        overflow-y:hidden;
        transition:opacity .18s ease, filter .18s ease;
      }

      .usuarios-table{
        width:100%;
        border-collapse:separate;
        border-spacing:0;
        min-width:1120px;
      }

      .usuarios-table thead th{
        padding:12px 18px;
        text-align:left;
        font-size:11px;
        font-weight:760;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:#97a0af;
        background:rgba(248,250,252,.62);
        border-bottom:1px solid rgba(15,23,42,.06);
        white-space:nowrap;
      }

      .usuarios-table tbody td{
        padding:14px 18px;
        vertical-align:middle;
        border-bottom:1px solid rgba(15,23,42,.055);
      }

      .usuarios-table tbody tr:last-child td{
        border-bottom:none;
      }

      .usuarios-row{
        transition:background .16s ease;
      }

      .usuarios-row:hover{
        background:rgba(124,92,255,.018);
      }

      .usuarios-main{
        display:grid;
        grid-template-columns:44px minmax(0, 1fr);
        gap:12px;
        align-items:center;
        min-width:0;
      }

      .usuarios-avatar{
        position:relative;
        width:44px;
        height:44px;
        border-radius:999px;
        overflow:hidden;
        flex:0 0 44px;
        background:var(--avatar-fallback-bg, linear-gradient(135deg, rgba(124,92,255,.12), rgba(139,92,246,.24)));
        border:1px solid var(--avatar-fallback-border, rgba(124,92,255,.18));
      }

      .usuarios-avatar img{
        display:block;
        width:100%;
        height:100%;
        object-fit:cover;
      }

      .usuarios-avatar-fallback{
        position:absolute;
        inset:0;
        display:none;
        align-items:center;
        justify-content:center;
        font-size:18px;
        font-weight:780;
        color:var(--avatar-fallback-text, #fff);
        letter-spacing:-.03em;
      }

      .usuarios-avatar[data-fallback="true"] .usuarios-avatar-fallback{
        display:flex;
      }

      .usuarios-avatar[data-fallback="true"] img{
        display:none !important;
      }

      .usuarios-avatar--fallback .usuarios-avatar-fallback{
        display:flex;
      }

      .usuarios-main-copy{
        min-width:0;
        display:grid;
        gap:3px;
      }

      .usuarios-user-id{
        font-size:12px;
        line-height:1.15;
        font-weight:760;
        letter-spacing:.055em;
        color:#667084;
        text-transform:uppercase;
      }

      .usuarios-user-subject{
        font-size:15px;
        line-height:1.14;
        font-weight:760;
        letter-spacing:-.025em;
        color:var(--text-strong, #111827);
        overflow:hidden;
        text-overflow:ellipsis;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
      }

      .usuarios-user-description{
        font-size:13px;
        line-height:1.3;
        color:#8a93a3;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .usuarios-chip{
        min-height:32px;
        padding:0 12px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:11px;
        font-weight:760;
        letter-spacing:.045em;
        text-transform:uppercase;
        white-space:nowrap;
        border:1px solid transparent;
      }

      .usuarios-chip--pending{
        color:#b7791f;
        background:rgba(255,188,66,.11);
        border-color:rgba(255,188,66,.22);
      }

      .usuarios-chip--active{
        color:#6d53d7;
        background:rgba(124,92,255,.09);
        border-color:rgba(124,92,255,.18);
      }

      .usuarios-chip--blocked{
        color:#1778ab;
        background:rgba(125,211,252,.12);
        border-color:rgba(125,211,252,.24);
      }

      .usuarios-chip--inactive{
        color:#258a59;
        background:rgba(54,198,144,.10);
        border-color:rgba(54,198,144,.22);
      }

      .usuarios-date-inline{
        display:inline-block;
        white-space:nowrap;
        font-size:13px;
        line-height:1.2;
        font-weight:650;
        font-variant-numeric:tabular-nums;
        color:#344054;
      }

      .usuarios-email-inline,
      .usuarios-location-inline,
      .usuarios-activity-inline{
        display:inline-block;
        font-size:13px;
        line-height:1.2;
        font-weight:650;
        color:#344054;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        max-width:100%;
      }

      .usuarios-cell--actions{
        width:1%;
        white-space:nowrap;
      }

      .usuarios-detail-btn{
        width:auto;
        min-width:0;
        min-height:34px;
        padding:0 12px;
        border-radius:12px;
        border:1px solid rgba(15,23,42,.07);
        background:rgba(255,255,255,.68);
        color:#1f2937;
        font-size:13px;
        font-weight:700;
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        white-space:nowrap;
        box-shadow:none;
        transition:
          border-color .16s ease,
          background .16s ease,
          transform .16s ease,
          opacity .16s ease;
      }

      .usuarios-detail-btn:hover{
        border-color:rgba(15,23,42,.11);
        background:rgba(255,255,255,.9);
        transform:translateY(-1px);
      }

      .usuarios-inline-loading{
        display:inline-flex;
        align-items:center;
        gap:7px;
        white-space:nowrap;
      }

      .usuarios-inline-spinner{
        width:13px;
        height:13px;
        border-radius:999px;
        border:2px solid rgba(255,255,255,.30);
        border-top-color:currentColor;
        animation:usuariosSpin .78s linear infinite;
        flex:0 0 auto;
      }

      .usuarios-btn:not(.usuarios-btn--primary) .usuarios-inline-spinner,
      .usuarios-detail-btn .usuarios-inline-spinner{
        border-color:rgba(15,23,42,.16);
        border-top-color:currentColor;
      }

      .usuarios-table-loading{
        padding:12px 18px 16px;
        display:grid;
        gap:12px;
      }

      .usuarios-table-loading-row{
        display:grid;
        grid-template-columns:44px minmax(220px, 1.5fr) 120px 140px 180px 130px 130px 120px;
        gap:12px;
        align-items:center;
      }

      .usuarios-table-loading-copy{
        display:grid;
        gap:7px;
      }

      .usuarios-skeleton{
        position:relative;
        overflow:hidden;
        border-radius:999px;
        background:rgba(148,163,184,.14);
      }

      .usuarios-skeleton::after{
        content:"";
        position:absolute;
        inset:0;
        transform:translateX(-100%);
        background:linear-gradient(
          90deg,
          transparent,
          rgba(255,255,255,.55),
          transparent
        );
        animation:usuariosSkeleton 1.2s ease-in-out infinite;
      }

      .usuarios-skeleton--avatar{
        width:44px;
        height:44px;
        border-radius:999px;
      }

      .usuarios-skeleton--xs{
        width:120px;
        height:10px;
      }

      .usuarios-skeleton--lg{
        width:74%;
        height:14px;
      }

      .usuarios-skeleton--md{
        width:56%;
        height:12px;
      }

      .usuarios-skeleton--pill{
        width:86px;
        height:30px;
      }

      .usuarios-skeleton--date{
        width:124px;
        height:12px;
      }

      .usuarios-skeleton--email{
        width:160px;
        height:12px;
      }

      .usuarios-skeleton--btn{
        width:98px;
        height:34px;
      }

      .usuarios-empty{
        display:grid;
        justify-items:center;
        gap:8px;
        padding:44px 20px 48px;
        text-align:center;
      }

      .usuarios-empty-title{
        margin:0;
        font-size:18px;
        font-weight:760;
        color:var(--text-strong, #111827);
      }

      .usuarios-empty-text{
        margin:0;
        font-size:13px;
        line-height:1.55;
        color:var(--text-dim, #6b7280);
      }

      .usuarios-mobile-list{
        display:none;
        gap:12px;
        padding:12px;
      }

      .usuarios-mobile-card{
        display:grid;
        gap:12px;
        padding:16px;
        border-radius:18px;
        border:1px solid rgba(15,23,42,.06);
        background:
          linear-gradient(180deg, rgba(255,255,255,.58), rgba(255,255,255,.22)),
          rgba(255,255,255,.46);
      }

      .usuarios-mobile-top{
        display:flex;
        gap:12px;
        align-items:flex-start;
        justify-content:space-between;
      }

      .usuarios-mobile-meta{
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:10px;
      }

      .usuarios-mobile-meta-card{
        display:grid;
        gap:4px;
        padding:12px;
        border-radius:14px;
        border:1px solid rgba(15,23,42,.06);
        background:rgba(255,255,255,.52);
      }

      .usuarios-mobile-meta-label{
        font-size:11px;
        color:#97a0af;
        font-weight:760;
        letter-spacing:.05em;
        text-transform:uppercase;
      }

      .usuarios-mobile-meta-value{
        color:var(--text-strong, #111827);
        font-size:13px;
        line-height:1.35;
        font-weight:700;
        word-break:break-word;
      }

      .usuarios-mobile-actions{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }

      @keyframes usuariosSpin{
        to{ transform:rotate(360deg); }
      }

      @keyframes usuariosSkeleton{
        to{ transform:translateX(100%); }
      }

      [data-theme="light"] .usuarios-hero,
      [data-theme="light"] .usuarios-history{
        background:
          linear-gradient(180deg, rgba(255,255,255,.82), rgba(248,250,252,.74)),
          rgba(255,255,255,.82);
        box-shadow:
          0 12px 28px rgba(15,23,42,.035),
          0 0 0 1px rgba(255,255,255,.72) inset;
      }

      [data-theme="light"] .usuarios-stat-card,
      [data-theme="light"] .usuarios-mobile-card{
        background:
          linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.48)),
          rgba(255,255,255,.56);
      }

      @media (max-width: 1240px){
        .usuarios-page-title{
          font-size:clamp(24px, 2.4vw, 36px);
        }
      }

      @media (max-width: 1180px){
        .usuarios-hero{
          padding:20px;
        }

        .usuarios-hero-top{
          grid-template-columns:1fr;
        }

        .usuarios-hero-actions{
          justify-content:flex-start;
        }

        .usuarios-page-title{
          white-space:normal;
        }
      }

      @media (max-width: 980px){
        .usuarios-stats{
          grid-template-columns:1fr 1fr;
        }

        .usuarios-desktop-table{
          display:none;
        }

        .usuarios-mobile-list{
          display:grid;
        }
      }

      @media (max-width: 760px){
        .usuarios-view-root{
          gap:16px;
        }

        .usuarios-hero{
          padding:18px 16px;
          border-radius:20px;
        }

        .usuarios-history{
          border-radius:20px;
        }

        .usuarios-history-head{
          grid-template-columns:1fr;
          padding:14px 14px 12px;
        }

        .usuarios-pagination{
          justify-content:flex-start;
        }

        .usuarios-stats{
          grid-template-columns:1fr;
        }

        .usuarios-page-title{
          font-size:clamp(24px, 8vw, 34px);
          line-height:1;
          white-space:normal;
        }

        .usuarios-page-subtitle{
          font-size:14px;
        }

        .usuarios-mobile-meta{
          grid-template-columns:1fr;
        }
      }
    </style>
  `;
}

/* =========================================================
   HEADER
========================================================= */

function renderStatCard({
  label = "",
  value = "0",
  caption = "",
  type = "active",
} = {}) {
  return `
    <article class="usuarios-stat-card usuarios-stat-card--${escapeHtml(type)}">
      <div class="usuarios-stat-label">${escapeHtml(label)}</div>
      <div class="usuarios-stat-value">${escapeHtml(value)}</div>
      <div class="usuarios-stat-text">${escapeHtml(caption)}</div>
    </article>
  `;
}

export function renderHeader({ items = [], state = {} } = {}) {
  const list = getResolvedItems(items);
  const localState = state || usuariosState || {};
  const stats = computeStats(list);

  const creating = Boolean(localState.creating);
  const remoteCount = resolveRemoteCount(items, localState);
  const lastSyncText = localState.lastSyncAt
    ? formatRelativeDate(localState.lastSyncAt)
    : "Sin sincronización reciente";

  return `
    ${renderStyles()}

    <section class="usuarios-hero">
      <div class="usuarios-hero-top">
        <div class="usuarios-hero-copy">
          <h1 class="usuarios-page-title">Usuarios y accesos</h1>
          <p class="usuarios-page-subtitle">
            Consulta usuarios registrados, revisa su estado, ubicación y última conexión desde una vista clara, compacta y alineada con el sistema.
          </p>
        </div>

        <div class="usuarios-hero-actions">
          <button
            id="usuarios-export-btn"
            type="button"
            class="usuarios-btn"
          >
            <span class="usuarios-btn-text">Exportar historial</span>
          </button>

          <button
            id="usuarios-create-btn"
            type="button"
            class="usuarios-btn usuarios-btn--primary${creating ? " is-loading" : ""}"
            ${creating ? 'disabled aria-busy="true"' : ""}
          >
            ${
              creating
                ? renderSpinner("Abriendo...")
                : '<span class="usuarios-btn-text">Nuevo usuario</span>'
            }
          </button>
        </div>
      </div>

      <div class="usuarios-hero-meta">
        <span class="usuarios-meta-pill">
          ${escapeHtml(`${remoteCount} usuarios registrados`)}
        </span>

        <span class="usuarios-meta-pill">
          ${escapeHtml(`Última actualización · ${lastSyncText}`)}
        </span>
      </div>

      <div class="usuarios-stats">
        ${renderStatCard({
          label: "Usuarios activos",
          value: String(stats.activeCount),
          caption: "Cuentas operativas o habilitadas actualmente.",
          type: "active",
        })}

        ${renderStatCard({
          label: "Bloqueados / pendientes",
          value: `${stats.blockedCount} / ${stats.pendingCount}`,
          caption: "Usuarios restringidos y accesos pendientes.",
          type: "blocked",
        })}
      </div>
    </section>
  `;
}

/* =========================================================
   LOADING / ERROR / EMPTY
========================================================= */

export function renderLoadingState(rows = PAGE_SIZE) {
  return `
    ${renderStyles()}

    <section class="usuarios-history">
      <div class="usuarios-history-head">
        <div class="usuarios-history-copy">
          <h2 class="usuarios-history-title">Historial de usuarios</h2>
          <p class="usuarios-history-subtitle">Cargando colección...</p>
        </div>
      </div>

      <div class="usuarios-table-loading" aria-hidden="true">
        ${Array.from({ length: rows })
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
    </section>
  `;
}

export function renderErrorState(message = "No se pudo cargar la colección.") {
  return `
    ${renderStyles()}

    <section class="usuarios-history">
      <div class="usuarios-empty">
        <h3 class="usuarios-empty-title">No se pudo cargar la vista de usuarios</h3>
        <p class="usuarios-empty-text">
          ${escapeHtml(safeText(message, "Error desconocido al cargar la vista."))}
        </p>

        <button
          id="usuarios-retry-btn"
          type="button"
          class="usuarios-btn usuarios-btn--primary"
        >
          Reintentar
        </button>
      </div>
    </section>
  `;
}

export function renderEmptyState() {
  return `
    ${renderStyles()}

    <section class="usuarios-history">
      <div class="usuarios-empty">
        <h3 class="usuarios-empty-title">No hay usuarios para mostrar</h3>
        <p class="usuarios-empty-text">
          Todavía no hay usuarios disponibles en la colección actual.
        </p>

        <button
          id="usuarios-create-btn"
          type="button"
          class="usuarios-btn usuarios-btn--primary"
        >
          Crear usuario
        </button>
      </div>
    </section>
  `;
}

/* =========================================================
   TABLE PARTIALS
========================================================= */

function renderOpenUsuarioButton({ userId = "", isOpening = false } = {}) {
  return `
    <button
      type="button"
      class="usuarios-detail-btn${isOpening ? " is-loading" : ""}"
      data-action="open-user"
      data-user-id="${escapeHtml(userId)}"
      ${isOpening ? 'disabled aria-busy="true"' : ""}
    >
      ${
        isOpening
          ? renderSpinner("Cargando...")
          : '<span class="usuarios-btn-text">Ver detalle</span>'
      }
    </button>
  `;
}

function renderUsuarioRow(item = {}, state = {}) {
  const localState = safeObject(state);
  const openingUserId = safeText(localState.openingUserId, "");
  const userId = getUsuarioId(item);
  const code = getUsuarioCode(item);
  const name = getUsuarioName(item);
  const preview = truncate(getUsuarioPhone(item), 96);
  const email = getUsuarioEmail(item);
  const city = getUsuarioLocation(item);
  const createdAt = formatDate(getCreatedAt(item));
  const lastLoginAtRaw = getLastLoginAt(item);
  const lastLoginAt = lastLoginAtRaw
    ? formatRelativeDate(lastLoginAtRaw)
    : "Sin acceso";

  const isOpening = Boolean(openingUserId && openingUserId === userId);

  return `
    <tr class="usuarios-row" data-user-id="${escapeHtml(userId)}">
      <td class="usuarios-cell usuarios-cell--main">
        <div class="usuarios-main">
          ${renderAvatar(item)}

          <div class="usuarios-main-copy">
            <div class="usuarios-user-id">${escapeHtml(code)}</div>
            <div class="usuarios-user-subject">${escapeHtml(name)}</div>
            <div class="usuarios-user-description">${escapeHtml(preview)}</div>
          </div>
        </div>
      </td>

      <td class="usuarios-cell usuarios-cell--status">
        ${renderStatusChip(item)}
      </td>

      <td class="usuarios-cell usuarios-cell--date">
        <span class="usuarios-date-inline">${escapeHtml(createdAt)}</span>
      </td>

      <td class="usuarios-cell usuarios-cell--email">
        <span class="usuarios-email-inline">${escapeHtml(email)}</span>
      </td>

      <td class="usuarios-cell usuarios-cell--location">
        <span class="usuarios-location-inline">${escapeHtml(city)}</span>
      </td>

      <td class="usuarios-cell usuarios-cell--activity">
        <span class="usuarios-activity-inline">${escapeHtml(lastLoginAt)}</span>
      </td>

      <td class="usuarios-cell usuarios-cell--actions">
        ${renderOpenUsuarioButton({ userId, isOpening })}
      </td>
    </tr>
  `;
}

function renderMobileUsuarioCard(item = {}, state = {}) {
  const localState = safeObject(state);
  const openingUserId = safeText(localState.openingUserId, "");
  const userId = getUsuarioId(item);
  const code = getUsuarioCode(item);
  const name = getUsuarioName(item);
  const preview = truncate(getUsuarioPhone(item), 120);
  const email = getUsuarioEmail(item);
  const city = getUsuarioLocation(item);
  const createdAt = formatDate(getCreatedAt(item));
  const lastLoginAtRaw = getLastLoginAt(item);
  const lastLoginAt = lastLoginAtRaw
    ? formatRelativeDate(lastLoginAtRaw)
    : "Sin acceso";

  const isOpening = Boolean(openingUserId && openingUserId === userId);

  return `
    <article class="usuarios-mobile-card" data-user-id="${escapeHtml(userId)}">
      <div class="usuarios-mobile-top">
        <div style="display:flex; gap:12px; min-width:0; flex:1;">
          ${renderAvatar(item)}

          <div class="usuarios-main-copy" style="flex:1;">
            <div class="usuarios-user-id">${escapeHtml(code)}</div>
            <div class="usuarios-user-subject">${escapeHtml(name)}</div>
            <div class="usuarios-user-description">${escapeHtml(preview)}</div>
          </div>
        </div>

        ${renderStatusChip(item)}
      </div>

      <div class="usuarios-mobile-meta">
        <div class="usuarios-mobile-meta-card">
          <span class="usuarios-mobile-meta-label">Alta</span>
          <strong class="usuarios-mobile-meta-value">${escapeHtml(createdAt)}</strong>
        </div>

        <div class="usuarios-mobile-meta-card">
          <span class="usuarios-mobile-meta-label">Email</span>
          <strong class="usuarios-mobile-meta-value">${escapeHtml(email)}</strong>
        </div>

        <div class="usuarios-mobile-meta-card">
          <span class="usuarios-mobile-meta-label">Ubicación</span>
          <strong class="usuarios-mobile-meta-value">${escapeHtml(city)}</strong>
        </div>

        <div class="usuarios-mobile-meta-card">
          <span class="usuarios-mobile-meta-label">Última conexión</span>
          <strong class="usuarios-mobile-meta-value">${escapeHtml(lastLoginAt)}</strong>
        </div>
      </div>

      <div class="usuarios-mobile-actions">
        ${renderOpenUsuarioButton({ userId, isOpening })}
      </div>
    </article>
  `;
}

function renderDesktopTable(items = [], state = {}) {
  return `
    <div class="usuarios-desktop-table">
      <div class="usuarios-table-shell">
        <table class="usuarios-table" role="table" aria-label="Listado de usuarios">
          <colgroup>
            <col style="width:36%;">
            <col style="width:12%;">
            <col style="width:14%;">
            <col style="width:16%;">
            <col style="width:10%;">
            <col style="width:12%;">
            <col style="width:10%;">
          </colgroup>

          <thead>
            <tr>
              <th>Usuario</th>
              <th>Estado</th>
              <th>Fecha de creación</th>
              <th>Email</th>
              <th>Ubicación</th>
              <th>Última conexión</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            ${safeArray(items).map((item) => renderUsuarioRow(item, state)).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderMobileCards(items = [], state = {}) {
  return `
    <div class="usuarios-mobile-list">
      ${safeArray(items).map((item) => renderMobileUsuarioCard(item, state)).join("")}
    </div>
  `;
}

function renderTableLoadingOverlay(message = "Actualizando usuarios...") {
  return `
    <div class="usuarios-table-loading" aria-hidden="true">
      ${Array.from({ length: 3 })
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

/* =========================================================
   TABLE
========================================================= */

function renderTableToolbar({
  total = 0,
  page = 1,
  totalPages = 1,
  from = 0,
  to = 0,
  refreshing = false,
} = {}) {
  return `
    <div class="usuarios-history-head">
      <div class="usuarios-history-copy">
        <h2 class="usuarios-history-title">Historial de usuarios</h2>
        <p class="usuarios-history-subtitle">
          ${escapeHtml(`Mostrando ${from}-${to} de ${total} · página ${page} de ${totalPages}`)}
        </p>
      </div>

      <div class="usuarios-pagination">
        <button
          type="button"
          class="usuarios-pagination-btn"
          data-action="prev-page"
          ${page <= 1 || refreshing ? 'disabled aria-disabled="true"' : ""}
        >
          Anterior
        </button>

        <button
          type="button"
          class="usuarios-pagination-btn"
          data-action="next-page"
          ${page >= totalPages || refreshing ? 'disabled aria-disabled="true"' : ""}
        >
          Siguiente
        </button>
      </div>
    </div>
  `;
}

export function renderTable({ items = [], state = {} } = {}) {
  const localState = state || usuariosState || {};
  const list = getResolvedItems(items);
  const refreshing = Boolean(localState.refreshing);
  const loading = Boolean(localState.loading);

  if (loading && !list.length) {
    return renderLoadingState(Math.max(3, safeNumber(localState.pageSize, PAGE_SIZE)));
  }

  if (localState.error && !list.length) {
    return renderErrorState(localState.error);
  }

  if (!list.length) {
    return renderEmptyState();
  }

  const pagination = getPagination(list, localState);

  return `
    <section class="usuarios-history">
      ${renderTableToolbar({
        total: pagination.totalItems,
        page: pagination.page,
        totalPages: pagination.totalPages,
        from: pagination.from,
        to: pagination.to,
        refreshing,
      })}

      <div class="usuarios-table-wrap${refreshing ? " is-refreshing" : ""}">
        ${refreshing ? renderTableLoadingOverlay("Actualizando usuarios...") : ""}

        ${renderDesktopTable(pagination.items, localState)}
        ${renderMobileCards(pagination.items, localState)}
      </div>
    </section>
  `;
}

export function renderCards({ items = [], state = {} } = {}) {
  return renderTable({ items, state });
}

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function renderUsuariosTableTemplate(input = {}) {
  const data = safeObject(input);

  return `
    <section class="usuarios-view-root">
      ${renderHeader(data)}
      ${renderTable(data)}
    </section>
  `;
}

export default renderUsuariosTableTemplate;
