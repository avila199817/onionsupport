/* =========================================================
   Onion SPA - Clientes Table Template
   Archivo: src/views/clientes/clientes.table.template.js

   FINAL PRODUCTION TEMPLATE · CLIENTES VIEW · CLON 1:1 USUARIOS

   RESPONSABILIDADES:
   - render del hero/header de clientes
   - render de tabla productiva con paginación real
   - compatibilidad con clientesView.js
   - estado loading visual en "Ver detalle"
   - estado loading visual en "Nuevo cliente"
   - soporte para payloads backend heterogéneos
   - soporte para envelope backend { ok, count, clientes }
   - lenguaje visual alineado con usuarios
   - versión desktop + cards mobile
   - columna email dedicada
   - columna responsable dedicada
   - columna nivel dedicada
   - actividad mostrando última actualización
========================================================= */

import { clientesState } from "./clientes.state.js";

import {
  getClientes,
  sortClientesByUpdatedDesc,
} from "./clientes.store.js";

import {
  escapeHtml,
  formatDate,
  formatRelativeDate,
  truncate,
} from "./clientes.utils.js";

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

function looksLikeClientesEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    Array.isArray(obj?.clientes) ||
      Array.isArray(obj?.clients) ||
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

  if (Array.isArray(obj?.clientes)) {
    return obj.clientes;
  }

  if (Array.isArray(obj?.clients)) {
    return obj.clients;
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

  if (looksLikeClientesEnvelope(obj?.data)) {
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
    return sortClientesByUpdatedDesc(direct);
  }

  const fromEnvelope = unwrapItemsEnvelope(items);

  if (fromEnvelope.length) {
    return sortClientesByUpdatedDesc(fromEnvelope);
  }

  try {
    return sortClientesByUpdatedDesc(getClientes());
  } catch {
    return [];
  }
}

/* =========================================================
   DOMAIN HELPERS
========================================================= */

function getClienteId(item = {}) {
  return safeText(
    first(
      item.clientId,
      item.clienteId,
      item.id,
      item.code,
      item.clientCode,
      item.clienteCode
    ),
    ""
  );
}

function getClienteCode(item = {}) {
  return safeText(
    first(
      item.clientCode,
      item.clienteCode,
      item.clientId,
      item.clienteId,
      item.id,
      item.code
    ),
    "CLI-SIN-ID"
  );
}

function getClienteName(item = {}) {
  return safeText(
    first(
      item?.cliente?.nombre,
      item?.cliente?.name,
      item?.profile?.name,
      item?.profile?.displayName,
      item.clientName,
      item.nombre,
      item.name,
      item.company,
      item.empresa,
      item.businessName
    ),
    "Cliente"
  );
}

function getClienteEmail(item = {}) {
  return safeText(
    first(
      item?.cliente?.email,
      item?.profile?.email,
      item.clientEmail,
      item.email,
      item.mail
    ),
    "Sin email"
  );
}

function getClientePhone(item = {}) {
  return safeText(
    first(
      item?.cliente?.phone,
      item?.profile?.phone,
      item.phone,
      item.telefono,
      item.mobile
    ),
    "Sin teléfono"
  );
}

function getClienteStatusValue(item = {}) {
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

function getClienteTierValue(item = {}) {
  return safeText(
    first(
      item.tier,
      item.plan,
      item.segment,
      item.category,
      item.tipo
    ),
    "standard"
  );
}

function getManager(item = {}) {
  return safeText(
    first(
      item?.manager?.name,
      item?.assignedTo?.name,
      item?.owner?.name,
      item?.responsable?.name,
      item?.manager,
      item?.assignedTo,
      item?.owner,
      item?.responsable
    ),
    "No asignado"
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
    item.lastContactAt,
    item.modifiedAt,
    item.createdAt,
    item.created_at
  );
}

function getClienteInitials(item = {}) {
  const raw =
    item?.clientInitials ||
    item?.cliente?.nombre ||
    item?.cliente?.name ||
    item?.profile?.name ||
    item?.clientName ||
    item?.nombre ||
    item?.name ||
    item?.company ||
    item?.empresa ||
    "CL";

  const clean = normalizeWhitespace(raw);
  if (!clean) return "CL";

  const parts = clean.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function getClienteAvatarUrl(item = {}) {
  return safeText(
    first(
      item?.cliente?.avatar,
      item?.cliente?.avatarUrl,
      item?.profile?.avatar,
      item?.profile?.avatarUrl,
      item.clientAvatar,
      item.clientAvatarUrl,
      item.avatar,
      item.avatarUrl,
      item.logo,
      item.logoUrl,
      item.image,
      item.imageUrl
    ),
    ""
  );
}

/* =========================================================
   LABELS / STATUS / TIER
========================================================= */

function getStatusKey(value = "") {
  const key = safeLower(value);

  if (["active", "activo", "activa", "enabled", "habilitado"].includes(key)) {
    return "active";
  }

  if (["pending", "pendiente"].includes(key)) {
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

function getTierKey(value = "") {
  const key = safeLower(value);

  if (["vip"].includes(key)) return "vip";
  if (["enterprise"].includes(key)) return "enterprise";
  if (["pro", "premium"].includes(key)) return "pro";
  if (["starter", "basic", "basico", "básico"].includes(key)) return "starter";

  return "standard";
}

function getTierLabel(value = "") {
  const key = getTierKey(value);

  if (key === "vip") return "VIP";
  if (key === "enterprise") return "Enterprise";
  if (key === "pro") return "Pro";
  if (key === "starter") return "Starter";

  return safeText(value, "Estándar");
}

/* =========================================================
   STATS
========================================================= */

function isActiveLike(item = {}) {
  return getStatusKey(getClienteStatusValue(item)) === "active";
}

function isPendingLike(item = {}) {
  return getStatusKey(getClienteStatusValue(item)) === "pending";
}

function isBlockedLike(item = {}) {
  return ["blocked", "inactive"].includes(
    getStatusKey(getClienteStatusValue(item))
  );
}

function isVipLike(item = {}) {
  return ["vip", "enterprise"].includes(
    getTierKey(getClienteTierValue(item))
  );
}

function computeStats(items = []) {
  const list = safeArray(items);

  return {
    totalClientes: list.length,
    activeCount: list.filter((item) => isActiveLike(item)).length,
    pendingCount: list.filter((item) => isPendingLike(item)).length,
    blockedCount: list.filter((item) => isBlockedLike(item)).length,
    vipCount: list.filter((item) => isVipLike(item)).length,
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
    <span class="clientes-inline-loading">
      <span class="clientes-inline-spinner" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderAvatar(item = {}) {
  const fullName = getClienteName(item);
  const initials = getClienteInitials(item);
  const avatarUrl = getClienteAvatarUrl(item);
  const theme = getFallbackAvatarTheme(
    first(getClienteId(item), fullName, getClienteEmail(item), getClienteCode(item))
  );

  if (avatarUrl) {
    return `
      <div
        class="clientes-avatar"
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
        <span class="clientes-avatar-fallback">${escapeHtml(initials)}</span>
      </div>
    `;
  }

  return `
    <div
      class="clientes-avatar clientes-avatar--fallback"
      style="
        --avatar-fallback-bg:${theme.bg};
        --avatar-fallback-border:${theme.border};
        --avatar-fallback-text:${theme.text};
      "
      title="${escapeHtml(fullName)}"
      aria-label="${escapeHtml(fullName)}"
    >
      <span class="clientes-avatar-fallback">${escapeHtml(initials)}</span>
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
    <span class="clientes-chip clientes-chip--${escapeHtml(key)}">
      ${escapeHtml(label)}
    </span>
  `;
}

function renderTierChip(item = {}) {
  const rawTier = first(
    item.tier,
    item.plan,
    item.segment,
    item.category,
    item.tipo,
    item?.raw?.tier,
    item?.raw?.plan,
    item?.raw?.segment
  );

  const key = getTierKey(rawTier);
  const label = getTierLabel(rawTier);

  return `
    <span class="clientes-chip clientes-chip--tier-${escapeHtml(key)}">
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
      .clientes-view-root{
        display:grid;
        gap:18px;
      }

      .clientes-hero{
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

      .clientes-hero-top{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:18px;
        align-items:start;
      }

      .clientes-hero-copy{
        min-width:0;
        display:grid;
        gap:10px;
      }

      .clientes-page-title{
        margin:0;
        max-width:100%;
        font-size:clamp(26px, 2.6vw, 42px);
        line-height:.98;
        letter-spacing:-.05em;
        font-weight:780;
        color:var(--text-strong, #0f172a);
        white-space:nowrap;
      }

      .clientes-page-subtitle{
        margin:0;
        max-width:860px;
        font-size:15px;
        line-height:1.58;
        color:var(--text-dim, #6b7280);
      }

      .clientes-hero-actions{
        display:flex;
        align-items:flex-start;
        justify-content:flex-end;
        gap:10px;
        flex-wrap:wrap;
      }

      .clientes-btn{
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

      .clientes-btn:hover{
        transform:translateY(-1px);
        box-shadow:0 8px 18px rgba(15,23,42,.06);
      }

      .clientes-btn--primary{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 16%, rgba(15,23,42,.06));
        background:linear-gradient(
          180deg,
          color-mix(in srgb, var(--accent, #7c5cff) 86%, white 14%),
          color-mix(in srgb, var(--accent, #7c5cff) 92%, black 8%)
        );
        color:#fff;
        box-shadow:0 8px 20px color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
      }

      .clientes-btn.is-loading,
      .clientes-detail-btn.is-loading{
        cursor:wait;
        opacity:.9;
      }

      .clientes-btn:disabled,
      .clientes-detail-btn:disabled{
        pointer-events:none;
      }

      .clientes-hero-meta{
        margin-top:14px;
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
      }

      .clientes-meta-pill{
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

      .clientes-stats{
        margin-top:16px;
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 280px));
        gap:12px;
      }

      .clientes-stat-card{
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

      .clientes-stat-card--active{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 16%, rgba(15,23,42,.06));
      }

      .clientes-stat-card--blocked{
        border-color:color-mix(in srgb, var(--success-strong, #36c690) 18%, rgba(15,23,42,.06));
      }

      .clientes-stat-label{
        font-size:11px;
        font-weight:760;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:#7b8494;
      }

      .clientes-stat-value{
        font-size:42px;
        line-height:.92;
        letter-spacing:-.045em;
        font-weight:780;
        color:var(--text-strong, #111827);
      }

      .clientes-stat-text{
        font-size:14px;
        line-height:1.45;
        color:var(--text-dim, #6b7280);
      }

      .clientes-history{
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

      .clientes-history-head{
        display:grid;
        grid-template-columns:minmax(0, 1fr) auto;
        gap:14px;
        align-items:start;
        padding:14px 18px 12px;
        border-bottom:1px solid rgba(15,23,42,.06);
      }

      .clientes-history-copy{
        min-width:0;
        display:grid;
        gap:2px;
      }

      .clientes-history-title{
        margin:0;
        font-size:16px;
        line-height:1.2;
        font-weight:760;
        color:var(--text-strong, #111827);
      }

      .clientes-history-subtitle{
        margin:0;
        font-size:12px;
        line-height:1.4;
        color:var(--text-dim, #7b8494);
      }

      .clientes-pagination{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }

      .clientes-pagination-btn{
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

      .clientes-pagination-btn:hover{
        background:rgba(255,255,255,.9);
        border-color:rgba(15,23,42,.10);
      }

      .clientes-pagination-btn[disabled],
      .clientes-pagination-btn[aria-disabled="true"]{
        opacity:.48;
        cursor:not-allowed;
      }

      .clientes-table-wrap{
        position:relative;
      }

      .clientes-table-wrap.is-refreshing .clientes-table-shell{
        opacity:.58;
        filter:blur(.8px);
        transition:opacity .18s ease, filter .18s ease;
      }

      .clientes-table-shell{
        width:100%;
        overflow-x:auto;
        overflow-y:hidden;
        transition:opacity .18s ease, filter .18s ease;
      }

      .clientes-table{
        width:100%;
        border-collapse:separate;
        border-spacing:0;
        min-width:1120px;
      }

      .clientes-table thead th{
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

      .clientes-table tbody td{
        padding:14px 18px;
        vertical-align:middle;
        border-bottom:1px solid rgba(15,23,42,.055);
      }

      .clientes-table tbody tr:last-child td{
        border-bottom:none;
      }

      .clientes-row{
        transition:background .16s ease;
      }

      .clientes-row:hover{
        background:rgba(124,92,255,.018);
      }

      .clientes-main{
        display:grid;
        grid-template-columns:44px minmax(0, 1fr);
        gap:12px;
        align-items:center;
        min-width:0;
      }

      .clientes-avatar{
        position:relative;
        width:44px;
        height:44px;
        border-radius:999px;
        overflow:hidden;
        flex:0 0 44px;
        background:var(--avatar-fallback-bg, linear-gradient(135deg, rgba(124,92,255,.12), rgba(139,92,246,.24)));
        border:1px solid var(--avatar-fallback-border, rgba(124,92,255,.18));
      }

      .clientes-avatar img{
        display:block;
        width:100%;
        height:100%;
        object-fit:cover;
      }

      .clientes-avatar-fallback{
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

      .clientes-avatar[data-fallback="true"] .clientes-avatar-fallback{
        display:flex;
      }

      .clientes-avatar[data-fallback="true"] img{
        display:none !important;
      }

      .clientes-avatar--fallback .clientes-avatar-fallback{
        display:flex;
      }

      .clientes-main-copy{
        min-width:0;
        display:grid;
        gap:3px;
      }

      .clientes-user-id{
        font-size:12px;
        line-height:1.15;
        font-weight:760;
        letter-spacing:.055em;
        color:#667084;
        text-transform:uppercase;
      }

      .clientes-user-subject{
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

      .clientes-user-description{
        font-size:13px;
        line-height:1.3;
        color:#8a93a3;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .clientes-chip{
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

      .clientes-chip--pending{
        color:#b7791f;
        background:rgba(255,188,66,.11);
        border-color:rgba(255,188,66,.22);
      }

      .clientes-chip--active{
        color:#6d53d7;
        background:rgba(124,92,255,.09);
        border-color:rgba(124,92,255,.18);
      }

      .clientes-chip--blocked{
        color:#1778ab;
        background:rgba(125,211,252,.12);
        border-color:rgba(125,211,252,.24);
      }

      .clientes-chip--inactive{
        color:#258a59;
        background:rgba(54,198,144,.10);
        border-color:rgba(54,198,144,.22);
      }

      .clientes-chip--tier-vip{
        color:#c2410c;
        background:rgba(251,146,60,.12);
        border-color:rgba(251,146,60,.22);
      }

      .clientes-chip--tier-enterprise{
        color:#6d28d9;
        background:rgba(167,139,250,.12);
        border-color:rgba(167,139,250,.24);
      }

      .clientes-chip--tier-pro{
        color:#0369a1;
        background:rgba(56,189,248,.12);
        border-color:rgba(56,189,248,.24);
      }

      .clientes-chip--tier-starter{
        color:#a16207;
        background:rgba(250,204,21,.12);
        border-color:rgba(250,204,21,.24);
      }

      .clientes-chip--tier-standard{
        color:#475569;
        background:rgba(148,163,184,.10);
        border-color:rgba(148,163,184,.20);
      }

      .clientes-date-inline{
        display:inline-block;
        white-space:nowrap;
        font-size:13px;
        line-height:1.2;
        font-weight:650;
        font-variant-numeric:tabular-nums;
        color:#344054;
      }

      .clientes-email-inline,
      .clientes-manager-inline,
      .clientes-activity-inline{
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

      .clientes-cell--actions{
        width:1%;
        white-space:nowrap;
      }

      .clientes-detail-btn{
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

      .clientes-detail-btn:hover{
        border-color:rgba(15,23,42,.11);
        background:rgba(255,255,255,.9);
        transform:translateY(-1px);
      }

      .clientes-copy-btn{
        width:auto;
        min-width:0;
        min-height:34px;
        padding:0 12px;
        border-radius:12px;
        border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 16%, rgba(15,23,42,.06));
        background:linear-gradient(
          180deg,
          color-mix(in srgb, var(--accent, #7c5cff) 86%, white 14%),
          color-mix(in srgb, var(--accent, #7c5cff) 92%, black 8%)
        );
        color:#fff;
        font-size:13px;
        font-weight:700;
        line-height:1;
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        white-space:nowrap;
        box-shadow:0 8px 20px color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent);
      }

      .clientes-inline-loading{
        display:inline-flex;
        align-items:center;
        gap:7px;
        white-space:nowrap;
      }

      .clientes-inline-spinner{
        width:13px;
        height:13px;
        border-radius:999px;
        border:2px solid rgba(255,255,255,.30);
        border-top-color:currentColor;
        animation:clientesSpin .78s linear infinite;
        flex:0 0 auto;
      }

      .clientes-btn:not(.clientes-btn--primary) .clientes-inline-spinner,
      .clientes-detail-btn .clientes-inline-spinner{
        border-color:rgba(15,23,42,.16);
        border-top-color:currentColor;
      }

      .clientes-table-loading{
        padding:12px 18px 16px;
        display:grid;
        gap:12px;
      }

      .clientes-table-loading-row{
        display:grid;
        grid-template-columns:44px minmax(220px, 1.5fr) 120px 120px 140px 180px 130px 130px 120px;
        gap:12px;
        align-items:center;
      }

      .clientes-table-loading-copy{
        display:grid;
        gap:7px;
      }

      .clientes-skeleton{
        position:relative;
        overflow:hidden;
        border-radius:999px;
        background:rgba(148,163,184,.14);
      }

      .clientes-skeleton::after{
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
        animation:clientesSkeleton 1.2s ease-in-out infinite;
      }

      .clientes-skeleton--avatar{
        width:44px;
        height:44px;
        border-radius:999px;
      }

      .clientes-skeleton--xs{
        width:120px;
        height:10px;
      }

      .clientes-skeleton--lg{
        width:74%;
        height:14px;
      }

      .clientes-skeleton--md{
        width:56%;
        height:12px;
      }

      .clientes-skeleton--pill{
        width:86px;
        height:30px;
      }

      .clientes-skeleton--date{
        width:124px;
        height:12px;
      }

      .clientes-skeleton--email{
        width:160px;
        height:12px;
      }

      .clientes-skeleton--btn{
        width:98px;
        height:34px;
      }

      .clientes-empty{
        display:grid;
        justify-items:center;
        gap:8px;
        padding:44px 20px 48px;
        text-align:center;
      }

      .clientes-empty-title{
        margin:0;
        font-size:18px;
        font-weight:760;
        color:var(--text-strong, #111827);
      }

      .clientes-empty-text{
        margin:0;
        font-size:13px;
        line-height:1.55;
        color:var(--text-dim, #6b7280);
      }

      .clientes-mobile-list{
        display:none;
        gap:12px;
        padding:12px;
      }

      .clientes-mobile-card{
        display:grid;
        gap:12px;
        padding:16px;
        border-radius:18px;
        border:1px solid rgba(15,23,42,.06);
        background:
          linear-gradient(180deg, rgba(255,255,255,.58), rgba(255,255,255,.22)),
          rgba(255,255,255,.46);
      }

      .clientes-mobile-top{
        display:flex;
        gap:12px;
        align-items:flex-start;
        justify-content:space-between;
      }

      .clientes-mobile-meta{
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:10px;
      }

      .clientes-mobile-meta-card{
        display:grid;
        gap:4px;
        padding:12px;
        border-radius:14px;
        border:1px solid rgba(15,23,42,.06);
        background:rgba(255,255,255,.52);
      }

      .clientes-mobile-meta-label{
        font-size:11px;
        color:#97a0af;
        font-weight:760;
        letter-spacing:.05em;
        text-transform:uppercase;
      }

      .clientes-mobile-meta-value{
        color:var(--text-strong, #111827);
        font-size:13px;
        line-height:1.35;
        font-weight:700;
        word-break:break-word;
      }

      .clientes-mobile-actions{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }

      @keyframes clientesSpin{
        to{ transform:rotate(360deg); }
      }

      @keyframes clientesSkeleton{
        to{ transform:translateX(100%); }
      }

      [data-theme="light"] .clientes-hero,
      [data-theme="light"] .clientes-history{
        background:
          linear-gradient(180deg, rgba(255,255,255,.82), rgba(248,250,252,.74)),
          rgba(255,255,255,.82);
        box-shadow:
          0 12px 28px rgba(15,23,42,.035),
          0 0 0 1px rgba(255,255,255,.72) inset;
      }

      [data-theme="light"] .clientes-stat-card,
      [data-theme="light"] .clientes-mobile-card{
        background:
          linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.48)),
          rgba(255,255,255,.56);
      }

      @media (max-width: 1240px){
        .clientes-page-title{
          font-size:clamp(24px, 2.4vw, 36px);
        }
      }

      @media (max-width: 1180px){
        .clientes-hero{
          padding:20px;
        }

        .clientes-hero-top{
          grid-template-columns:1fr;
        }

        .clientes-hero-actions{
          justify-content:flex-start;
        }

        .clientes-page-title{
          white-space:normal;
        }
      }

      @media (max-width: 980px){
        .clientes-stats{
          grid-template-columns:1fr 1fr;
        }

        .clientes-desktop-table{
          display:none;
        }

        .clientes-mobile-list{
          display:grid;
        }
      }

      @media (max-width: 760px){
        .clientes-view-root{
          gap:16px;
        }

        .clientes-hero{
          padding:18px 16px;
          border-radius:20px;
        }

        .clientes-history{
          border-radius:20px;
        }

        .clientes-history-head{
          grid-template-columns:1fr;
          padding:14px 14px 12px;
        }

        .clientes-pagination{
          justify-content:flex-start;
        }

        .clientes-stats{
          grid-template-columns:1fr;
        }

        .clientes-page-title{
          font-size:clamp(24px, 8vw, 34px);
          line-height:1;
          white-space:normal;
        }

        .clientes-page-subtitle{
          font-size:14px;
        }

        .clientes-mobile-meta{
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
    <article class="clientes-stat-card clientes-stat-card--${escapeHtml(type)}">
      <div class="clientes-stat-label">${escapeHtml(label)}</div>
      <div class="clientes-stat-value">${escapeHtml(value)}</div>
      <div class="clientes-stat-text">${escapeHtml(caption)}</div>
    </article>
  `;
}

export function renderHeader({ items = [], state = {} } = {}) {
  const list = getResolvedItems(items);
  const localState = state || clientesState || {};
  const stats = computeStats(list);

  const creating = Boolean(localState.creating);
  const remoteCount = resolveRemoteCount(items, localState);
  const lastSyncText = localState.lastSyncAt
    ? formatRelativeDate(localState.lastSyncAt)
    : "Sin sincronización reciente";

  return `
    ${renderStyles()}

    <section class="clientes-hero">
      <div class="clientes-hero-top">
        <div class="clientes-hero-copy">
          <h1 class="clientes-page-title">Clientes y cuentas</h1>
          <p class="clientes-page-subtitle">
            Consulta clientes registrados, revisa su estado, responsable, nivel de cuenta y última actualización desde una vista clara, compacta y alineada con el sistema.
          </p>
        </div>

        <div class="clientes-hero-actions">
          <button
            id="clientes-export-btn"
            type="button"
            class="clientes-btn"
          >
            <span class="clientes-btn-text">Exportar historial</span>
          </button>

          <button
            id="clientes-create-btn"
            type="button"
            class="clientes-btn clientes-btn--primary${creating ? " is-loading" : ""}"
            ${creating ? 'disabled aria-busy="true"' : ""}
          >
            ${
              creating
                ? renderSpinner("Abriendo...")
                : '<span class="clientes-btn-text">Nuevo cliente</span>'
            }
          </button>
        </div>
      </div>

      <div class="clientes-hero-meta">
        <span class="clientes-meta-pill">
          ${escapeHtml(`${remoteCount} clientes registrados`)}
        </span>

        <span class="clientes-meta-pill">
          ${escapeHtml(`Última actualización · ${lastSyncText}`)}
        </span>
      </div>

      <div class="clientes-stats">
        ${renderStatCard({
          label: "Clientes activos",
          value: String(stats.activeCount),
          caption: "Cuentas operativas o habilitadas actualmente.",
          type: "active",
        })}

        ${renderStatCard({
          label: "Bloqueados / pendientes",
          value: `${stats.blockedCount} / ${stats.pendingCount}`,
          caption: "Cuentas restringidas y seguimientos pendientes.",
          type: "blocked",
        })}

        ${renderStatCard({
          label: "VIP / Enterprise",
          value: String(stats.vipCount),
          caption: "Cuentas prioritarias o de alto valor.",
          type: "active",
        })}

        ${renderStatCard({
          label: "Clientes visibles",
          value: String(stats.totalClientes),
          caption: "Registros actualmente visibles en la colección.",
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

    <section class="clientes-history">
      <div class="clientes-history-head">
        <div class="clientes-history-copy">
          <h2 class="clientes-history-title">Historial de clientes</h2>
          <p class="clientes-history-subtitle">Cargando colección...</p>
        </div>
      </div>

      <div class="clientes-table-loading" aria-hidden="true">
        ${Array.from({ length: rows })
          .map(
            () => `
              <div class="clientes-table-loading-row">
                <div class="clientes-skeleton clientes-skeleton--avatar"></div>
                <div class="clientes-table-loading-copy">
                  <div class="clientes-skeleton clientes-skeleton--xs"></div>
                  <div class="clientes-skeleton clientes-skeleton--lg"></div>
                  <div class="clientes-skeleton clientes-skeleton--md"></div>
                </div>
                <div class="clientes-skeleton clientes-skeleton--pill"></div>
                <div class="clientes-skeleton clientes-skeleton--pill"></div>
                <div class="clientes-skeleton clientes-skeleton--date"></div>
                <div class="clientes-skeleton clientes-skeleton--email"></div>
                <div class="clientes-skeleton clientes-skeleton--date"></div>
                <div class="clientes-skeleton clientes-skeleton--date"></div>
                <div class="clientes-skeleton clientes-skeleton--btn"></div>
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

    <section class="clientes-history">
      <div class="clientes-empty">
        <h3 class="clientes-empty-title">No se pudo cargar la vista de clientes</h3>
        <p class="clientes-empty-text">
          ${escapeHtml(safeText(message, "Error desconocido al cargar la vista."))}
        </p>

        <button
          id="clientes-retry-btn"
          type="button"
          class="clientes-btn clientes-btn--primary"
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

    <section class="clientes-history">
      <div class="clientes-empty">
        <h3 class="clientes-empty-title">No hay clientes para mostrar</h3>
        <p class="clientes-empty-text">
          Todavía no hay clientes disponibles en la colección actual.
        </p>

        <button
          id="clientes-create-btn"
          type="button"
          class="clientes-btn clientes-btn--primary"
        >
          Crear cliente
        </button>
      </div>
    </section>
  `;
}

/* =========================================================
   TABLE PARTIALS
========================================================= */

function renderOpenClienteButton({ clienteId = "", isOpening = false } = {}) {
  return `
    <button
      type="button"
      class="clientes-detail-btn${isOpening ? " is-loading" : ""}"
      data-action="open-cliente"
      data-cliente-id="${escapeHtml(clienteId)}"
      ${isOpening ? 'disabled aria-busy="true"' : ""}
    >
      ${
        isOpening
          ? renderSpinner("Cargando...")
          : '<span class="clientes-btn-text">Ver detalle</span>'
      }
    </button>
  `;
}

function renderCopyClienteButton({ clienteId = "", code = "" } = {}) {
  return `
    <button
      type="button"
      class="clientes-copy-btn"
      data-action="copy-cliente-id"
      data-cliente-id="${escapeHtml(clienteId)}"
      data-cliente-code="${escapeHtml(code)}"
    >
      Copiar ID
    </button>
  `;
}

function renderClienteRow(item = {}, state = {}) {
  const localState = safeObject(state);
  const openingClienteId = safeText(localState.openingClienteId, "");
  const clienteId = getClienteId(item);
  const code = getClienteCode(item);
  const name = getClienteName(item);
  const preview = truncate(getClientePhone(item), 96);
  const email = getClienteEmail(item);
  const manager = getManager(item);
  const createdAt = formatDate(getCreatedAt(item));
  const updatedAtRaw = getUpdatedAt(item);
  const updatedAt = updatedAtRaw
    ? formatRelativeDate(updatedAtRaw)
    : "Sin actualización";

  const isOpening = Boolean(openingClienteId && openingClienteId === clienteId);

  return `
    <tr class="clientes-row" data-cliente-id="${escapeHtml(clienteId)}">
      <td class="clientes-cell clientes-cell--main">
        <div class="clientes-main">
          ${renderAvatar(item)}

          <div class="clientes-main-copy">
            <div class="clientes-user-id">${escapeHtml(code)}</div>
            <div class="clientes-user-subject">${escapeHtml(name)}</div>
            <div class="clientes-user-description">${escapeHtml(preview)}</div>
          </div>
        </div>
      </td>

      <td class="clientes-cell clientes-cell--status">
        ${renderStatusChip(item)}
      </td>

      <td class="clientes-cell clientes-cell--tier">
        ${renderTierChip(item)}
      </td>

      <td class="clientes-cell clientes-cell--date">
        <span class="clientes-date-inline">${escapeHtml(createdAt)}</span>
      </td>

      <td class="clientes-cell clientes-cell--email">
        <span class="clientes-email-inline">${escapeHtml(email)}</span>
      </td>

      <td class="clientes-cell clientes-cell--manager">
        <span class="clientes-manager-inline">${escapeHtml(manager)}</span>
      </td>

      <td class="clientes-cell clientes-cell--activity">
        <span class="clientes-activity-inline">${escapeHtml(updatedAt)}</span>
      </td>

      <td class="clientes-cell clientes-cell--actions">
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
          ${renderOpenClienteButton({ clienteId, isOpening })}
          ${renderCopyClienteButton({ clienteId, code })}
        </div>
      </td>
    </tr>
  `;
}

function renderMobileClienteCard(item = {}, state = {}) {
  const localState = safeObject(state);
  const openingClienteId = safeText(localState.openingClienteId, "");
  const clienteId = getClienteId(item);
  const code = getClienteCode(item);
  const name = getClienteName(item);
  const preview = truncate(getClientePhone(item), 120);
  const email = getClienteEmail(item);
  const manager = getManager(item);
  const createdAt = formatDate(getCreatedAt(item));
  const updatedAtRaw = getUpdatedAt(item);
  const updatedAt = updatedAtRaw
    ? formatRelativeDate(updatedAtRaw)
    : "Sin actualización";

  const isOpening = Boolean(openingClienteId && openingClienteId === clienteId);

  return `
    <article class="clientes-mobile-card" data-cliente-id="${escapeHtml(clienteId)}">
      <div class="clientes-mobile-top">
        <div style="display:flex; gap:12px; min-width:0; flex:1;">
          ${renderAvatar(item)}

          <div class="clientes-main-copy" style="flex:1;">
            <div class="clientes-user-id">${escapeHtml(code)}</div>
            <div class="clientes-user-subject">${escapeHtml(name)}</div>
            <div class="clientes-user-description">${escapeHtml(preview)}</div>
          </div>
        </div>

        ${renderStatusChip(item)}
      </div>

      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${renderTierChip(item)}
      </div>

      <div class="clientes-mobile-meta">
        <div class="clientes-mobile-meta-card">
          <span class="clientes-mobile-meta-label">Alta</span>
          <strong class="clientes-mobile-meta-value">${escapeHtml(createdAt)}</strong>
        </div>

        <div class="clientes-mobile-meta-card">
          <span class="clientes-mobile-meta-label">Email</span>
          <strong class="clientes-mobile-meta-value">${escapeHtml(email)}</strong>
        </div>

        <div class="clientes-mobile-meta-card">
          <span class="clientes-mobile-meta-label">Responsable</span>
          <strong class="clientes-mobile-meta-value">${escapeHtml(manager)}</strong>
        </div>

        <div class="clientes-mobile-meta-card">
          <span class="clientes-mobile-meta-label">Actualización</span>
          <strong class="clientes-mobile-meta-value">${escapeHtml(updatedAt)}</strong>
        </div>
      </div>

      <div class="clientes-mobile-actions">
        ${renderOpenClienteButton({ clienteId, isOpening })}
        ${renderCopyClienteButton({ clienteId, code })}
      </div>
    </article>
  `;
}

function renderDesktopTable(items = [], state = {}) {
  return `
    <div class="clientes-desktop-table">
      <div class="clientes-table-shell">
        <table class="clientes-table" role="table" aria-label="Listado de clientes">
          <colgroup>
            <col style="width:32%;">
            <col style="width:11%;">
            <col style="width:11%;">
            <col style="width:12%;">
            <col style="width:14%;">
            <col style="width:10%;">
            <col style="width:12%;">
            <col style="width:14%;">
          </colgroup>

          <thead>
            <tr>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Nivel</th>
              <th>Fecha de alta</th>
              <th>Email</th>
              <th>Responsable</th>
              <th>Actualización</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            ${safeArray(items).map((item) => renderClienteRow(item, state)).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderMobileCards(items = [], state = {}) {
  return `
    <div class="clientes-mobile-list">
      ${safeArray(items).map((item) => renderMobileClienteCard(item, state)).join("")}
    </div>
  `;
}

function renderTableLoadingOverlay(message = "Actualizando clientes...") {
  return `
    <div class="clientes-table-loading" aria-hidden="true">
      ${Array.from({ length: 3 })
        .map(
          () => `
            <div class="clientes-table-loading-row">
              <div class="clientes-skeleton clientes-skeleton--avatar"></div>
              <div class="clientes-table-loading-copy">
                <div class="clientes-skeleton clientes-skeleton--xs"></div>
                <div class="clientes-skeleton clientes-skeleton--lg"></div>
                <div class="clientes-skeleton clientes-skeleton--md"></div>
              </div>
              <div class="clientes-skeleton clientes-skeleton--pill"></div>
              <div class="clientes-skeleton clientes-skeleton--pill"></div>
              <div class="clientes-skeleton clientes-skeleton--date"></div>
              <div class="clientes-skeleton clientes-skeleton--email"></div>
              <div class="clientes-skeleton clientes-skeleton--date"></div>
              <div class="clientes-skeleton clientes-skeleton--date"></div>
              <div class="clientes-skeleton clientes-skeleton--btn"></div>
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
    <div class="clientes-history-head">
      <div class="clientes-history-copy">
        <h2 class="clientes-history-title">Historial de clientes</h2>
        <p class="clientes-history-subtitle">
          ${escapeHtml(`Mostrando ${from}-${to} de ${total} · página ${page} de ${totalPages}`)}
        </p>
      </div>

      <div class="clientes-pagination">
        <button
          type="button"
          class="clientes-pagination-btn"
          data-action="prev-page"
          ${page <= 1 || refreshing ? 'disabled aria-disabled="true"' : ""}
        >
          Anterior
        </button>

        <button
          type="button"
          class="clientes-pagination-btn"
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
  const localState = state || clientesState || {};
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
    <section class="clientes-history">
      ${renderTableToolbar({
        total: pagination.totalItems,
        page: pagination.page,
        totalPages: pagination.totalPages,
        from: pagination.from,
        to: pagination.to,
        refreshing,
      })}

      <div class="clientes-table-wrap${refreshing ? " is-refreshing" : ""}">
        ${refreshing ? renderTableLoadingOverlay("Actualizando clientes...") : ""}

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

export function renderClientesTableTemplate(input = {}) {
  const data = safeObject(input);

  return `
    <section class="clientes-view-root">
      ${renderHeader(data)}
      ${renderTable(data)}
    </section>
  `;
}

export default renderClientesTableTemplate;
