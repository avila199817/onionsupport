/* =========================================================
   Onion SPA - Usuarios Template
   Archivo: src/views/usuarios/usuarios.table.template.js

   FINAL PRODUCTION TEMPLATE · USERS VIEW · 10/10

   RESPONSABILIDADES:
   - render del hero/header de usuarios
   - render de estados loading / error / empty
   - render de tabla productiva con paginación real
   - compatibilidad con usuariosView.js
   - estado loading visual en "Ver detalle"
   - estado loading visual en "Nuevo usuario"
   - soporte para payloads backend heterogéneos
   - soporte para envelope backend { ok, count, users }
   - lenguaje visual alineado con incidencias
   - versión desktop + cards mobile
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

function getUsuarioRoleValue(item = {}) {
  return safeText(
    first(
      item.role,
      item.rol,
      item.userRole,
      item.profile,
      item.tipo
    ),
    "user"
  );
}

function getDepartment(item = {}) {
  return safeText(
    first(
      item?.department?.name,
      item?.team?.name,
      item?.area?.name,
      item.department,
      item.team,
      item.area
    ),
    "Sin equipo"
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
    item.ultimoAcceso
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

function getAvatarToneSeed(item = {}) {
  return safeText(
    first(
      getUsuarioId(item),
      getUsuarioName(item),
      getUsuarioEmail(item),
      getUsuarioCode(item)
    ),
    "onion"
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

function getRoleKey(value = "") {
  const key = safeLower(value);

  if (["superadmin", "super_admin", "root"].includes(key)) return "superadmin";
  if (["admin", "administrator", "administrador"].includes(key)) return "admin";
  if (["support", "soporte", "agent", "agente"].includes(key)) return "support";
  if (["manager", "gestor", "gerente"].includes(key)) return "manager";
  return "user";
}

function getRoleLabel(value = "") {
  const key = getRoleKey(value);

  if (key === "superadmin") return "Superadmin";
  if (key === "admin") return "Admin";
  if (key === "support") return "Soporte";
  if (key === "manager") return "Manager";
  return "Usuario";
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

function isAdminLike(item = {}) {
  return ["superadmin", "admin"].includes(
    getRoleKey(getUsuarioRoleValue(item))
  );
}

function hasDepartment(item = {}) {
  return getDepartment(item) !== "Sin equipo";
}

function computeStats(items = []) {
  const list = safeArray(items);

  return {
    totalUsuarios: list.length,
    activeCount: list.filter((item) => isActiveLike(item)).length,
    pendingCount: list.filter((item) => isPendingLike(item)).length,
    adminCount: list.filter((item) => isAdminLike(item)).length,
    assignedCount: list.filter((item) => hasDepartment(item)).length,
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

function getStatusChipClass(value = "") {
  const key = getStatusKey(value);
  return `usuarios-chip usuarios-chip--${key}`;
}

function getRoleChipClass(value = "") {
  const key = getRoleKey(value);
  return `usuarios-chip usuarios-chip--role usuarios-chip--role-${key}`;
}

function renderSpinner(label = "") {
  return `
    <span class="usuarios-inline-loading">
      <span class="usuarios-inline-spinner" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderAvatar(item = {}, { size = 48, radius = 16 } = {}) {
  const initials = getUsuarioInitials(item);
  const avatarUrl = getUsuarioAvatarUrl(item);
  const theme = getFallbackAvatarTheme(getAvatarToneSeed(item));

  if (avatarUrl) {
    return `
      <div
        class="usuarios-avatar"
        style="
          --avatar-size:${size}px;
          --avatar-radius:${radius}px;
          --avatar-fallback-bg:${theme.bg};
          --avatar-fallback-border:${theme.border};
          --avatar-fallback-text:${theme.text};
        "
        title="${escapeHtml(getUsuarioName(item))}"
        aria-label="${escapeHtml(getUsuarioName(item))}"
      >
        <img
          src="${escapeHtml(avatarUrl)}"
          alt="${escapeHtml(getUsuarioName(item))}"
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
        --avatar-size:${size}px;
        --avatar-radius:${radius}px;
        --avatar-fallback-bg:${theme.bg};
        --avatar-fallback-border:${theme.border};
        --avatar-fallback-text:${theme.text};
      "
      title="${escapeHtml(getUsuarioName(item))}"
      aria-label="${escapeHtml(getUsuarioName(item))}"
    >
      <span class="usuarios-avatar-fallback">${escapeHtml(initials)}</span>
    </div>
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
        gap:24px;
      }

      .usuarios-hero{
        position:relative;
        overflow:hidden;
        border-radius:28px;
        border:1px solid var(--panel-border, rgba(255,255,255,.08));
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 34%),
          linear-gradient(180deg, var(--panel-bg, rgba(255,255,255,.84)), var(--panel-bg, rgba(255,255,255,.84)));
        box-shadow:var(--shadow-soft, 0 20px 50px rgba(0,0,0,.08));
        padding:28px 32px 30px;
      }

      .usuarios-hero-top{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:20px;
        align-items:start;
      }

      .usuarios-hero-copy{
        min-width:0;
        display:grid;
        gap:12px;
      }

      .usuarios-page-title{
        margin:0;
        max-width:100%;
        font-size:clamp(32px, 4.2vw, 58px);
        line-height:.95;
        letter-spacing:-.055em;
        font-weight:800;
        color:var(--text-strong, #0f172a);
        white-space:nowrap;
      }

      .usuarios-page-subtitle{
        margin:0;
        max-width:980px;
        font-size:16px;
        line-height:1.62;
        color:var(--text-dim, #6b7280);
      }

      .usuarios-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:12px;
        flex-wrap:wrap;
      }

      .usuarios-btn{
        min-height:50px;
        padding:0 18px;
        border-radius:16px;
        border:1px solid var(--border-soft, rgba(15,23,42,.08));
        background:var(--surface-1, rgba(255,255,255,.74));
        color:var(--text-strong, #111827);
        font-size:14px;
        font-weight:700;
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        box-shadow:0 10px 24px rgba(15,23,42,.04);
        transition:
          transform .18s ease,
          box-shadow .18s ease,
          border-color .18s ease,
          background .18s ease,
          opacity .18s ease;
      }

      .usuarios-btn:hover{
        transform:translateY(-1px);
        box-shadow:0 16px 32px rgba(15,23,42,.08);
      }

      .usuarios-btn--primary{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent);
        background:var(--accent, #7c5cff);
        color:#fff;
        box-shadow:0 14px 30px color-mix(in srgb, var(--accent, #7c5cff) 22%, transparent);
      }

      .usuarios-btn.is-loading,
      .usuarios-open-btn.is-loading{
        cursor:wait;
        opacity:.9;
      }

      .usuarios-hero-meta{
        margin-top:18px;
        display:flex;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;
      }

      .usuarios-meta-pill{
        min-height:34px;
        padding:0 14px;
        border-radius:999px;
        border:1px solid var(--border-soft, rgba(15,23,42,.08));
        background:var(--surface-1, rgba(255,255,255,.72));
        color:var(--text-dim, #6b7280);
        font-size:12px;
        font-weight:800;
        letter-spacing:.05em;
        text-transform:uppercase;
        display:inline-flex;
        align-items:center;
        white-space:nowrap;
      }

      .usuarios-stats{
        margin-top:22px;
        display:grid;
        grid-template-columns:repeat(4, minmax(0, 1fr));
        gap:16px;
      }

      .usuarios-stat-card{
        display:grid;
        gap:10px;
        min-height:150px;
        padding:22px 22px 20px;
        border-radius:24px;
        border:1px solid var(--border-soft, rgba(15,23,42,.08));
        background:
          linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,.08)),
          var(--surface-1, rgba(255,255,255,.68));
      }

      .usuarios-stat-card--accent{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 22%, var(--border-soft, rgba(15,23,42,.08)));
      }

      .usuarios-stat-label{
        font-size:12px;
        font-weight:800;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:var(--text-dim, #6b7280);
      }

      .usuarios-stat-value{
        font-size:52px;
        line-height:.9;
        letter-spacing:-.05em;
        font-weight:800;
        color:var(--text-strong, #111827);
      }

      .usuarios-stat-text{
        font-size:14px;
        line-height:1.5;
        color:var(--text-dim, #6b7280);
      }

      .usuarios-history{
        overflow:hidden;
        border-radius:28px;
        border:1px solid var(--panel-border, rgba(255,255,255,.08));
        background:var(--panel-bg, rgba(255,255,255,.84));
        box-shadow:var(--shadow-soft, 0 20px 50px rgba(0,0,0,.08));
      }

      .usuarios-history-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:18px;
        align-items:start;
        padding:18px 20px 16px;
        border-bottom:1px solid var(--border-soft, rgba(15,23,42,.08));
      }

      .usuarios-history-copy{
        min-width:0;
        display:grid;
        gap:4px;
      }

      .usuarios-history-title{
        margin:0;
        font-size:18px;
        line-height:1.2;
        font-weight:800;
        color:var(--text-strong, #111827);
      }

      .usuarios-history-subtitle{
        margin:0;
        font-size:13px;
        line-height:1.45;
        color:var(--text-dim, #6b7280);
      }

      .usuarios-pagination{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
      }

      .usuarios-pagination-btn{
        min-height:42px;
        padding:0 16px;
        border-radius:14px;
        border:1px solid var(--border-soft, rgba(15,23,42,.08));
        background:var(--surface-1, rgba(255,255,255,.72));
        color:var(--text-strong, #111827);
        font-size:13px;
        font-weight:700;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
      }

      .usuarios-pagination-btn[disabled],
      .usuarios-pagination-btn[aria-disabled="true"]{
        opacity:.48;
        cursor:not-allowed;
      }

      .usuarios-table-shell{
        position:relative;
        width:100%;
        overflow-x:auto;
        overflow-y:hidden;
      }

      .usuarios-table{
        width:100%;
        border-collapse:separate;
        border-spacing:0;
        min-width:1240px;
      }

      .usuarios-table thead th{
        padding:16px 18px;
        text-align:left;
        font-size:12px;
        font-weight:800;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:var(--text-faint, #8a91a0);
        background:color-mix(in srgb, var(--surface-1, #fff) 88%, transparent);
        border-bottom:1px solid var(--border-soft, rgba(15,23,42,.08));
        white-space:nowrap;
      }

      .usuarios-table tbody td{
        padding:18px 18px;
        vertical-align:middle;
        border-bottom:1px solid var(--border-soft, rgba(15,23,42,.08));
      }

      .usuarios-table tbody tr:last-child td{
        border-bottom:none;
      }

      .usuarios-row{
        transition:background .18s ease, opacity .18s ease;
      }

      .usuarios-row:hover{
        background:color-mix(in srgb, var(--accent, #7c5cff) 2.5%, transparent);
      }

      .usuarios-row.is-opening:hover{
        background:color-mix(in srgb, var(--warning-strong, #ffbc42) 3.5%, transparent);
      }

      .usuarios-main{
        display:grid;
        grid-template-columns:48px minmax(0, 1fr);
        gap:14px;
        align-items:center;
        min-width:0;
      }

      .usuarios-avatar{
        position:relative;
        width:var(--avatar-size, 48px);
        height:var(--avatar-size, 48px);
        border-radius:var(--avatar-radius, 16px);
        overflow:hidden;
        flex:0 0 var(--avatar-size, 48px);
        background:var(--avatar-fallback-bg, rgba(124,92,255,.16));
        border:1px solid var(--avatar-fallback-border, rgba(124,92,255,.20));
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
        font-weight:800;
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
        gap:4px;
      }

      .usuarios-user-id{
        font-size:12px;
        line-height:1.2;
        font-weight:800;
        letter-spacing:.06em;
        color:#4b5563;
        text-transform:uppercase;
      }

      .usuarios-user-subject{
        font-size:16px;
        line-height:1.18;
        font-weight:800;
        letter-spacing:-.03em;
        color:var(--text-strong, #111827);
        overflow:hidden;
        text-overflow:ellipsis;
        display:-webkit-box;
        -webkit-line-clamp:2;
        -webkit-box-orient:vertical;
      }

      .usuarios-user-description{
        font-size:13px;
        line-height:1.35;
        color:var(--text-dim, #6b7280);
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .usuarios-chip{
        min-height:34px;
        padding:0 14px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:12px;
        font-weight:800;
        letter-spacing:.05em;
        text-transform:uppercase;
        white-space:nowrap;
        border:1px solid transparent;
      }

      .usuarios-chip--active{
        color:#1f7a4d;
        background:rgba(54,198,144,.14);
        border-color:rgba(54,198,144,.28);
      }

      .usuarios-chip--pending{
        color:#c57a13;
        background:rgba(255,188,66,.14);
        border-color:rgba(255,188,66,.30);
      }

      .usuarios-chip--blocked{
        color:#c24a4a;
        background:rgba(255,107,107,.14);
        border-color:rgba(255,107,107,.28);
      }

      .usuarios-chip--inactive{
        color:#7b8494;
        background:rgba(15,23,42,.03);
        border-color:rgba(15,23,42,.08);
      }

      .usuarios-chip--role-superadmin{
        color:#8f63ff;
        background:rgba(179,136,255,.14);
        border-color:rgba(179,136,255,.28);
      }

      .usuarios-chip--role-admin{
        color:#c24a4a;
        background:rgba(255,107,107,.12);
        border-color:rgba(255,107,107,.24);
      }

      .usuarios-chip--role-support{
        color:#2563eb;
        background:rgba(96,165,250,.12);
        border-color:rgba(96,165,250,.24);
      }

      .usuarios-chip--role-manager{
        color:#b7791f;
        background:rgba(255,188,66,.12);
        border-color:rgba(255,188,66,.24);
      }

      .usuarios-chip--role-user{
        color:#6b7280;
        background:rgba(15,23,42,.03);
        border-color:rgba(15,23,42,.08);
      }

      .usuarios-date-inline{
        display:inline-block;
        white-space:nowrap;
        font-size:13px;
        line-height:1.2;
        font-weight:700;
        font-variant-numeric:tabular-nums;
        color:#2f3747;
      }

      .usuarios-contact-block,
      .usuarios-activity-block{
        display:grid;
        gap:4px;
        min-width:0;
      }

      .usuarios-contact-primary,
      .usuarios-activity-primary{
        color:var(--text-strong, #111827);
        font-size:13px;
        line-height:1.3;
        font-weight:700;
        word-break:break-word;
      }

      .usuarios-contact-secondary,
      .usuarios-activity-secondary{
        color:var(--text-dim, #6b7280);
        font-size:12px;
        line-height:1.35;
        word-break:break-word;
      }

      .usuarios-cell--actions{
        width:1%;
        white-space:nowrap;
      }

      .usuarios-actions{
        display:flex;
        justify-content:flex-end;
        gap:8px;
        flex-wrap:wrap;
      }

      .usuarios-open-btn,
      .usuarios-copy-btn{
        width:auto;
        min-width:0;
        min-height:40px;
        padding:0 14px;
        border-radius:14px;
        font-size:13px;
        font-weight:700;
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        white-space:nowrap;
        transition:
          border-color .18s ease,
          background .18s ease,
          transform .18s ease,
          opacity .18s ease;
      }

      .usuarios-open-btn{
        border:1px solid var(--border-soft, rgba(15,23,42,.08));
        background:var(--surface-1, rgba(255,255,255,.74));
        color:var(--text-strong, #111827);
      }

      .usuarios-copy-btn{
        border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent);
        background:var(--accent, #7c5cff);
        color:#fff;
      }

      .usuarios-open-btn:hover,
      .usuarios-copy-btn:hover{
        transform:translateY(-1px);
      }

      .usuarios-inline-loading{
        display:inline-flex;
        align-items:center;
        gap:8px;
      }

      .usuarios-inline-spinner{
        width:14px;
        height:14px;
        border-radius:999px;
        border:2px solid rgba(255,255,255,.28);
        border-top-color:currentColor;
        animation:usuariosSpin .78s linear infinite;
      }

      .usuarios-open-btn .usuarios-inline-spinner{
        border-color:rgba(15,23,42,.18);
        border-top-color:currentColor;
      }

      .usuarios-empty{
        display:grid;
        justify-items:center;
        gap:8px;
        padding:54px 24px 58px;
        text-align:center;
      }

      .usuarios-empty-title{
        margin:0;
        font-size:20px;
        font-weight:800;
        color:var(--text-strong, #111827);
      }

      .usuarios-empty-text{
        margin:0;
        font-size:14px;
        line-height:1.6;
        color:var(--text-dim, #6b7280);
      }

      .usuarios-mobile-list{
        display:none;
        gap:14px;
        padding:14px;
      }

      .usuarios-mobile-card{
        display:grid;
        gap:14px;
        padding:18px;
        border-radius:18px;
        border:1px solid var(--border-soft, rgba(15,23,42,.08));
        background:var(--surface-1, rgba(255,255,255,.76));
      }

      .usuarios-mobile-top{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
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
        border:1px solid var(--border-soft, rgba(15,23,42,.08));
        background:var(--surface-glass, rgba(255,255,255,.56));
      }

      .usuarios-mobile-meta-label{
        font-size:11px;
        color:var(--text-faint, #8a91a0);
        font-weight:800;
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

      .usuarios-table-overlay{
        position:absolute;
        inset:0;
        display:grid;
        place-items:center;
        padding:18px;
        background:color-mix(in srgb, var(--surface-1, #fff) 74%, transparent);
        backdrop-filter:blur(4px);
        -webkit-backdrop-filter:blur(4px);
        z-index:4;
      }

      .usuarios-table-shell::-webkit-scrollbar{
        height:10px;
        width:10px;
      }

      .usuarios-table-shell::-webkit-scrollbar-thumb{
        background:color-mix(in srgb, var(--accent, #7c5cff) 18%, var(--border-soft));
        border-radius:999px;
      }

      .usuarios-table-shell::-webkit-scrollbar-track{
        background:transparent;
      }

      @keyframes usuariosSpin{
        to{ transform:rotate(360deg); }
      }

      @keyframes usuariosPulse{
        0% { transform:scale(.92); opacity:.75; }
        50% { transform:scale(1.08); opacity:1; }
        100% { transform:scale(.92); opacity:.75; }
      }

      [data-theme="light"] .usuarios-hero,
      [data-theme="light"] .usuarios-history{
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,.96), rgba(249,250,252,.94));
        box-shadow:
          0 16px 38px rgba(15,23,42,.05),
          0 0 0 1px rgba(255,255,255,.74) inset;
      }

      [data-theme="light"] .usuarios-stat-card,
      [data-theme="light"] .usuarios-mobile-card{
        background:
          linear-gradient(180deg, rgba(255,255,255,.72), rgba(255,255,255,.42)),
          rgba(255,255,255,.58);
      }

      @media (max-width: 1240px){
        .usuarios-hero{
          padding:24px 24px 26px;
        }

        .usuarios-page-title{
          font-size:clamp(30px, 4vw, 52px);
        }
      }

      @media (max-width: 1180px){
        .usuarios-hero-top{
          grid-template-columns:1fr;
        }

        .usuarios-hero-actions{
          justify-content:flex-start;
        }

        .usuarios-page-title{
          white-space:normal;
        }

        .usuarios-stats{
          grid-template-columns:repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 980px){
        .usuarios-desktop-table{
          display:none;
        }

        .usuarios-mobile-list{
          display:grid;
        }
      }

      @media (max-width: 760px){
        .usuarios-view-root{
          gap:18px;
        }

        .usuarios-hero{
          padding:22px 18px 20px;
          border-radius:22px;
        }

        .usuarios-history{
          border-radius:22px;
        }

        .usuarios-history-head{
          grid-template-columns:1fr;
          padding:16px 16px 14px;
        }

        .usuarios-pagination{
          justify-content:flex-start;
        }

        .usuarios-stats{
          grid-template-columns:1fr;
        }

        .usuarios-page-title{
          font-size:clamp(28px, 8.5vw, 44px);
          line-height:.98;
          white-space:normal;
        }

        .usuarios-page-subtitle{
          font-size:15px;
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
  accent = false,
} = {}) {
  return `
    <article class="usuarios-stat-card ${accent ? "usuarios-stat-card--accent" : ""}">
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
  const loading = Boolean(localState.loading);
  const refreshing = Boolean(localState.refreshing);

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
            Supervisa usuarios, estado de acceso, rol operativo, equipo y actividad reciente desde una vista limpia, clara y pensada para administración.
          </p>
        </div>

        <div class="usuarios-hero-actions">
          <button
            id="usuarios-export-btn"
            type="button"
            class="usuarios-btn"
          >
            <span>Exportar CSV</span>
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
                : "<span>Nuevo usuario</span>"
            }
          </button>
        </div>
      </div>

      <div class="usuarios-hero-meta">
        <span class="usuarios-meta-pill">
          ${escapeHtml(`${remoteCount} registros remotos`)}
        </span>

        <span class="usuarios-meta-pill">
          ${escapeHtml(`Última sync · ${lastSyncText}`)}
        </span>

        ${
          loading || refreshing
            ? `
              <span class="usuarios-meta-pill">
                <span
                  aria-hidden="true"
                  style="
                    width:8px;
                    height:8px;
                    border-radius:999px;
                    background:var(--accent, #7c5cff);
                    margin-right:8px;
                    display:inline-block;
                    animation:usuariosPulse 1.25s ease-in-out infinite;
                  "
                ></span>
                Sincronizando
              </span>
            `
            : ""
        }
      </div>

      <div class="usuarios-stats">
        ${renderStatCard({
          label: "Usuarios visibles",
          value: String(stats.totalUsuarios),
          caption: `${remoteCount} registros totales cargados en la colección.`,
          accent: true,
        })}

        ${renderStatCard({
          label: "Activos",
          value: String(stats.activeCount),
          caption: "Cuentas habilitadas y operativas.",
        })}

        ${renderStatCard({
          label: "Pendientes / admins",
          value: `${stats.pendingCount} / ${stats.adminCount}`,
          caption: "Invitaciones pendientes y perfiles con privilegios elevados.",
        })}

        ${renderStatCard({
          label: "Con equipo / bloqueados",
          value: `${stats.assignedCount} / ${stats.blockedCount}`,
          caption: "Cobertura organizativa y cuentas con acceso restringido.",
        })}
      </div>
    </section>
  `;
}

/* =========================================================
   LOADING / ERROR / EMPTY
========================================================= */

export function renderLoadingState() {
  return `
    ${renderStyles()}

    <section class="usuarios-history">
      <div class="usuarios-history-head">
        <div class="usuarios-history-copy">
          <h2 class="usuarios-history-title">Tabla de usuarios</h2>
          <p class="usuarios-history-subtitle">Cargando colección...</p>
        </div>
      </div>

      <div style="min-width:1180px;">
        <div
          style="
            display:grid;
            grid-template-columns:2.4fr .9fr .9fr .95fr 1.2fr 1fr 1fr .95fr;
            border-bottom:1px solid var(--border-soft);
            background:color-mix(in srgb, var(--surface-1, #fff) 88%, transparent);
          "
        >
          ${Array.from({ length: 8 })
            .map(
              () => `
                <div style="padding:16px 18px;">
                  <div
                    style="
                      height:12px;
                      width:68%;
                      border-radius:999px;
                      background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 8%, var(--surface-glass)), var(--surface-glass));
                      background-size:200% 100%;
                      animation:usuariosSkeleton 1.2s linear infinite;
                    "
                  ></div>
                </div>
              `
            )
            .join("")}
        </div>

        ${Array.from({ length: PAGE_SIZE })
          .map(
            () => `
              <div
                style="
                  display:grid;
                  grid-template-columns:2.4fr .9fr .9fr .95fr 1.2fr 1fr 1fr .95fr;
                  border-bottom:1px solid var(--border-soft);
                "
              >
                <div style="padding:18px;">
                  <div style="display:flex; gap:14px; align-items:center;">
                    <div
                      style="
                        width:48px;
                        height:48px;
                        border-radius:16px;
                        background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 8%, var(--surface-glass)), var(--surface-glass));
                        background-size:200% 100%;
                        animation:usuariosSkeleton 1.2s linear infinite;
                      "
                    ></div>

                    <div style="display:grid; gap:8px; flex:1;">
                      <div style="height:13px; width:120px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 8%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:usuariosSkeleton 1.2s linear infinite;"></div>
                      <div style="height:14px; width:180px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 8%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:usuariosSkeleton 1.2s linear infinite;"></div>
                      <div style="height:12px; width:150px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 8%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:usuariosSkeleton 1.2s linear infinite;"></div>
                    </div>
                  </div>
                </div>

                ${Array.from({ length: 6 })
                  .map(
                    () => `
                      <div style="padding:18px;">
                        <div style="height:34px; width:92px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 8%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:usuariosSkeleton 1.2s linear infinite;"></div>
                      </div>
                    `
                  )
                  .join("")}

                <div style="padding:18px;">
                  <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <div style="height:40px; width:88px; border-radius:14px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 8%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:usuariosSkeleton 1.2s linear infinite;"></div>
                  </div>
                </div>
              </div>
            `
          )
          .join("")}
      </div>

      <style>
        @keyframes usuariosSkeleton {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      </style>
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
      class="usuarios-open-btn${isOpening ? " is-loading" : ""}"
      data-action="open-user"
      data-user-id="${escapeHtml(userId)}"
      ${isOpening ? 'disabled aria-busy="true"' : ""}
    >
      ${
        isOpening
          ? renderSpinner("Abriendo...")
          : "<span>Ver detalle</span>"
      }
    </button>
  `;
}

function renderCopyUsuarioButton({ userId = "", username = "" } = {}) {
  return `
    <button
      type="button"
      class="usuarios-copy-btn"
      data-action="copy-user-id"
      data-user-id="${escapeHtml(userId)}"
      data-username="${escapeHtml(username)}"
    >
      Copiar ID
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
  const statusValue = getUsuarioStatusValue(item);
  const roleValue = getUsuarioRoleValue(item);
  const department = getDepartment(item);
  const createdAt = formatDate(getCreatedAt(item));
  const updatedAtDate = formatDate(getUpdatedAt(item));
  const lastLoginAtRaw = getLastLoginAt(item);
  const lastLoginAt = lastLoginAtRaw
    ? formatRelativeDate(lastLoginAtRaw)
    : "Sin acceso";

  const isOpening = Boolean(openingUserId && openingUserId === userId);

  return `
    <tr class="usuarios-row ${isOpening ? "is-opening" : ""}" data-user-id="${escapeHtml(userId)}">
      <td>
        <div class="usuarios-main">
          ${renderAvatar(item, { size: 48, radius: 16 })}

          <div class="usuarios-main-copy">
            <div class="usuarios-user-id">${escapeHtml(code)}</div>
            <div class="usuarios-user-subject">${escapeHtml(name)}</div>
            <div class="usuarios-user-description">${escapeHtml(preview)}</div>
          </div>
        </div>
      </td>

      <td>
        <span class="${getStatusChipClass(statusValue)}">
          ${escapeHtml(getStatusLabel(statusValue))}
        </span>
      </td>

      <td>
        <span class="${getRoleChipClass(roleValue)}">
          ${escapeHtml(getRoleLabel(roleValue))}
        </span>
      </td>

      <td>
        <span class="usuarios-date-inline">${escapeHtml(createdAt)}</span>
      </td>

      <td>
        <div class="usuarios-contact-block">
          <span class="usuarios-contact-primary">${escapeHtml(email)}</span>
          <span class="usuarios-contact-secondary">${escapeHtml(getUsuarioPhone(item))}</span>
        </div>
      </td>

      <td>
        <div class="usuarios-contact-block">
          <span class="usuarios-contact-primary">${escapeHtml(department)}</span>
          <span class="usuarios-contact-secondary">Equipo</span>
        </div>
      </td>

      <td>
        <div class="usuarios-activity-block">
          <span class="usuarios-activity-primary">${escapeHtml(lastLoginAt)}</span>
          <span class="usuarios-activity-secondary">${escapeHtml(updatedAtDate)}</span>
        </div>
      </td>

      <td class="usuarios-cell--actions">
        <div class="usuarios-actions">
          ${renderOpenUsuarioButton({ userId, isOpening })}
          ${renderCopyUsuarioButton({ userId, username: code })}
        </div>
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
  const statusValue = getUsuarioStatusValue(item);
  const roleValue = getUsuarioRoleValue(item);
  const department = getDepartment(item);
  const createdAt = formatDate(getCreatedAt(item));
  const lastLoginAtRaw = getLastLoginAt(item);
  const lastLoginAt = lastLoginAtRaw
    ? formatRelativeDate(lastLoginAtRaw)
    : "Sin acceso";

  const isOpening = Boolean(openingUserId && openingUserId === userId);

  return `
    <article class="usuarios-mobile-card" data-user-id="${escapeHtml(userId)}" style="opacity:${isOpening ? ".72" : "1"};">
      <div class="usuarios-mobile-top">
        <div style="display:flex; gap:12px; min-width:0; flex:1;">
          ${renderAvatar(item, { size: 44, radius: 16 })}

          <div class="usuarios-main-copy" style="flex:1;">
            <div class="usuarios-user-id">${escapeHtml(code)}</div>
            <div class="usuarios-user-subject">${escapeHtml(name)}</div>
            <div class="usuarios-user-description">${escapeHtml(preview)}</div>
          </div>
        </div>

        <div style="display:grid; gap:8px; justify-items:end;">
          <span class="${getStatusChipClass(statusValue)}">
            ${escapeHtml(getStatusLabel(statusValue))}
          </span>

          <span class="${getRoleChipClass(roleValue)}">
            ${escapeHtml(getRoleLabel(roleValue))}
          </span>
        </div>
      </div>

      <div class="usuarios-mobile-meta">
        <div class="usuarios-mobile-meta-card">
          <span class="usuarios-mobile-meta-label">Email</span>
          <strong class="usuarios-mobile-meta-value">${escapeHtml(email)}</strong>
          <span class="usuarios-contact-secondary">${escapeHtml(getUsuarioPhone(item))}</span>
        </div>

        <div class="usuarios-mobile-meta-card">
          <span class="usuarios-mobile-meta-label">Equipo</span>
          <strong class="usuarios-mobile-meta-value">${escapeHtml(department)}</strong>
        </div>

        <div class="usuarios-mobile-meta-card">
          <span class="usuarios-mobile-meta-label">Alta</span>
          <strong class="usuarios-mobile-meta-value">${escapeHtml(createdAt)}</strong>
        </div>

        <div class="usuarios-mobile-meta-card">
          <span class="usuarios-mobile-meta-label">Último acceso</span>
          <strong class="usuarios-mobile-meta-value">${escapeHtml(lastLoginAt)}</strong>
        </div>
      </div>

      <div class="usuarios-mobile-actions">
        ${renderOpenUsuarioButton({ userId, isOpening })}
        ${renderCopyUsuarioButton({ userId, username: code })}
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
            <col style="width:30%;">
            <col style="width:10%;">
            <col style="width:10%;">
            <col style="width:10%;">
            <col style="width:14%;">
            <col style="width:10%;">
            <col style="width:10%;">
            <col style="width:16%;">
          </colgroup>

          <thead>
            <tr>
              <th>Usuario</th>
              <th>Estado</th>
              <th>Rol</th>
              <th>Alta</th>
              <th>Contacto</th>
              <th>Equipo</th>
              <th>Actividad</th>
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
    <div class="usuarios-table-overlay" aria-live="polite" aria-busy="true">
      <div
        style="
          display:grid;
          justify-items:center;
          gap:12px;
          min-width:min(100%, 240px);
          padding:18px 20px;
          border-radius:18px;
          border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 22%, var(--border-soft));
          background:linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 12%, transparent), transparent), var(--surface-1, var(--surface-glass));
          box-shadow:0 20px 40px rgba(0,0,0,.22);
        "
      >
        <span
          aria-hidden="true"
          style="
            width:28px;
            height:28px;
            border-radius:999px;
            border:3px solid color-mix(in srgb, var(--accent, #7c5cff) 16%, transparent);
            border-top-color:var(--accent, #7c5cff);
            animation:usuariosSpin .8s linear infinite;
          "
        ></span>

        <strong
          style="
            color:var(--text-strong);
            font-size:14px;
            letter-spacing:-.02em;
          "
        >
          ${escapeHtml(message)}
        </strong>

        <span
          style="
            color:var(--text-dim);
            font-size:12px;
          "
        >
          Solo se está actualizando la tabla
        </span>
      </div>
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
        ${
          refreshing
            ? `
              <span class="usuarios-meta-pill">
                <span
                  aria-hidden="true"
                  style="
                    width:8px;
                    height:8px;
                    border-radius:999px;
                    background:var(--accent, #7c5cff);
                    margin-right:8px;
                    display:inline-block;
                    animation:usuariosPulse 1.25s ease-in-out infinite;
                  "
                ></span>
                Actualizando
              </span>
            `
            : ""
        }

        <button
          type="button"
          class="usuarios-pagination-btn"
          data-action="prev-page"
          ${page <= 1 ? 'disabled aria-disabled="true"' : ""}
        >
          Anterior
        </button>

        <button
          type="button"
          class="usuarios-pagination-btn"
          data-action="next-page"
          ${page >= totalPages ? 'disabled aria-disabled="true"' : ""}
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
    return renderLoadingState();
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

      ${renderDesktopTable(pagination.items, localState)}
      ${renderMobileCards(pagination.items, localState)}

      ${refreshing ? renderTableLoadingOverlay("Actualizando usuarios...") : ""}
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
