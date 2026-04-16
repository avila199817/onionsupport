/* =========================================================
   Onion SPA - Usuarios Template (FINAL PRO TABLE GOD MODE)
   Archivo: src/views/usuarios/usuarios.template.js

   EXTREME MODE · ADMIN USERS TABLE · 10/10

   Responsabilidades:
   - renderizar header premium de la vista de usuarios
   - renderizar estados loading / error / empty
   - renderizar tabla premium de usuarios
   - paginar a 5 usuarios por vista
   - mostrar loader SOLO en la sección de tabla
   - mostrar estado visual al abrir detalle lento
   - mantener compatibilidad directa con usuarios.view.js
   - consumir datos reales del backend /api/users
   - compartir lenguaje visual y densidad con Facturas e Incidencias

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - soporte para envelope backend { ok, count, users }
   - lectura preferente del shape normalizado del backend
   - mismo lenguaje visual que Incidencias
   - toolbar / skeleton / mobile cards consistentes
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   SAFE
========================================================= */

const PAGE_SIZE = 5;

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeText(value, fallback = "—") {
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

function truncate(value = "", max = 96) {
  const text = safeText(value, "");

  if (!text) return "—";
  if (text.length <= max) return text;

  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function formatNumber(value = 0) {
  try {
    return new Intl.NumberFormat("es-ES").format(safeNumber(value, 0));
  } catch {
    return String(safeNumber(value, 0));
  }
}

function formatDate(value = "") {
  try {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return "—";
  }
}

function formatDateTime(value = "") {
  try {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return "—";
  }
}

function formatRelativeDate(value = "") {
  try {
    if (!value) return "Sin fecha";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Sin fecha";

    const diffMs = date.getTime() - Date.now();
    const absMs = Math.abs(diffMs);

    const minute = 1000 * 60;
    const hour = minute * 60;
    const day = hour * 24;

    if (absMs < minute) {
      return diffMs >= 0 ? "En segundos" : "Ahora mismo";
    }

    if (absMs < hour) {
      const minutes = Math.round(absMs / minute);
      return diffMs >= 0 ? `En ${minutes} min` : `Hace ${minutes} min`;
    }

    if (absMs < day) {
      const hours = Math.round(absMs / hour);
      return diffMs >= 0 ? `En ${hours} h` : `Hace ${hours} h`;
    }

    if (absMs < day * 7) {
      const days = Math.round(absMs / day);
      return diffMs >= 0 ? `En ${days} días` : `Hace ${days} días`;
    }

    return formatDate(value);
  } catch {
    return "—";
  }
}

/* =========================================================
   BACKEND ENVELOPE / REAL DATA RESOLVE
========================================================= */

function looksLikeUsersEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    Array.isArray(obj?.users) ||
      Array.isArray(obj?.items) ||
      Array.isArray(obj?.data) ||
      Array.isArray(obj?.results) ||
      Array.isArray(obj?.usuarios) ||
      Array.isArray(obj?.rows)
  );
}

function unwrapItemsEnvelope(value) {
  const obj = safeObject(value);

  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(obj?.users)) {
    return obj.users;
  }

  if (Array.isArray(obj?.usuarios)) {
    return obj.usuarios;
  }

  if (Array.isArray(obj?.rows)) {
    return obj.rows;
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

  if (looksLikeUsersEnvelope(obj?.data)) {
    return unwrapItemsEnvelope(obj.data);
  }

  return [];
}

function resolveRemoteCount(items, state = {}) {
  const localState = safeObject(state);

  return safeNumber(
    first(
      localState?.remoteCount,
      localState?.count,
      localState?.total,
      safeObject(localState?.stats)?.total,
      safeObject(localState?.meta)?.total,
      safeObject(localState?.response)?.count,
      safeObject(localState?.payload)?.count,
      safeObject(localState?.lastResponse)?.count,
      safeObject(items)?.count
    ),
    safeArray(items).length
  );
}

/* =========================================================
   USER RESOLVE
========================================================= */

function sortUsers(items = []) {
  return safeArray(items)
    .slice()
    .sort((a, b) => {
      const aDate = new Date(
        first(a?.updatedAt, a?.lastLoginAt, a?.createdAt, 0)
      ).getTime();
      const bDate = new Date(
        first(b?.updatedAt, b?.lastLoginAt, b?.createdAt, 0)
      ).getTime();

      return (Number.isFinite(bDate) ? bDate : 0) - (Number.isFinite(aDate) ? aDate : 0);
    });
}

function getResolvedItems(items, state = {}) {
  const direct = safeArray(items);

  if (direct.length) {
    return sortUsers(direct);
  }

  const stateRows = safeArray(
    first(
      safeObject(state)?.rows,
      safeObject(state)?.items,
      safeObject(state)?.usuarios,
      safeObject(state)?.data?.rows,
      safeObject(state)?.data?.items,
      safeObject(state)?.data?.usuarios
    )
  );

  if (stateRows.length) {
    return sortUsers(stateRows);
  }

  const fromEnvelope = unwrapItemsEnvelope(items);

  if (fromEnvelope.length) {
    return sortUsers(fromEnvelope);
  }

  return [];
}

function getUserId(item = {}) {
  return safeText(first(item.userId, item.id, item._id), "");
}

function getUsername(item = {}) {
  return safeText(
    first(item.username, item.userName, item.nick, item.handle, item.slug),
    "usuario"
  );
}

function getDisplayName(item = {}) {
  try {
    const byCore =
      typeof AppCore?.getUserDisplayName === "function"
        ? AppCore.getUserDisplayName(item)
        : "";

    if (String(byCore || "").trim()) {
      return String(byCore).trim();
    }
  } catch {}

  return safeText(
    first(
      item.displayName,
      item.name,
      item.fullName,
      item.nombre,
      item.username,
      item.email
    ),
    "Usuario"
  );
}

function getEmail(item = {}) {
  return safeText(
    first(item.email, item.mail, item.userEmail),
    "Sin email"
  );
}

function getPhone(item = {}) {
  return safeText(
    first(item.phone, item.telefono, item.mobile, item.telefonoMovil),
    "Sin teléfono"
  );
}

function getRoleValue(item = {}) {
  return safeText(first(item.role, item.rol, item.userRole), "user");
}

function getStatusValue(item = {}) {
  if (typeof item?.active === "boolean") {
    return item.active ? "active" : "inactive";
  }

  return safeText(first(item.status, item.estado), "inactive");
}

function getCreatedAt(item = {}) {
  return first(item.createdAt, item.created_at, item.fechaAlta, item.insertedAt);
}

function getLastLoginAt(item = {}) {
  return first(item.lastLoginAt, item.lastSeenAt, item.updatedAt, item.lastAccessAt);
}

function getAvatarUrl(item = {}) {
  return safeText(
    first(
      item.avatar,
      item.avatarUrl,
      item.photoURL,
      item.photoUrl,
      item.profileImage,
      item.image,
      item.picture
    ),
    ""
  );
}

function hasAvatar(item = {}) {
  return Boolean(item?.hasAvatar === true || getAvatarUrl(item));
}

function getUserInitials(item = {}) {
  const raw = getDisplayName(item);
  const clean = String(raw).trim();

  if (!clean) return "US";

  const parts = clean.split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (initials || clean.slice(0, 2) || "US").toUpperCase();
}

function getPreview(item = {}) {
  return safeText(
    first(
      item.bio,
      item.about,
      item.descripcion,
      item.description,
      item.notes,
      `${getEmail(item)} · ${getPhone(item)}`
    ),
    "Sin descripción"
  );
}

function getAvatarToneSeed(item = {}) {
  return safeText(
    first(getUserId(item), getDisplayName(item), getEmail(item), getUsername(item)),
    "onion-user"
  );
}

function getStableHash(value = "") {
  const source = String(value || "onion-user");
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
      bg: "linear-gradient(135deg, rgba(124,92,255,.28), rgba(88,72,200,.12))",
      border: "rgba(124,92,255,.28)",
      text: "#efeaff",
      glow: "rgba(124,92,255,.22)",
    },
    {
      bg: "linear-gradient(135deg, rgba(54,198,144,.28), rgba(35,131,95,.12))",
      border: "rgba(54,198,144,.28)",
      text: "#ddfff1",
      glow: "rgba(54,198,144,.22)",
    },
    {
      bg: "linear-gradient(135deg, rgba(96,165,250,.28), rgba(37,99,235,.12))",
      border: "rgba(96,165,250,.28)",
      text: "#e7f2ff",
      glow: "rgba(96,165,250,.22)",
    },
    {
      bg: "linear-gradient(135deg, rgba(255,188,66,.28), rgba(217,119,6,.12))",
      border: "rgba(255,188,66,.28)",
      text: "#fff4d8",
      glow: "rgba(255,188,66,.22)",
    },
    {
      bg: "linear-gradient(135deg, rgba(255,107,107,.28), rgba(190,24,93,.12))",
      border: "rgba(255,107,107,.28)",
      text: "#ffe4e4",
      glow: "rgba(255,107,107,.22)",
    },
    {
      bg: "linear-gradient(135deg, rgba(179,136,255,.28), rgba(109,40,217,.12))",
      border: "rgba(179,136,255,.28)",
      text: "#f3e8ff",
      glow: "rgba(179,136,255,.22)",
    },
  ];

  return themes[getStableHash(seed) % themes.length];
}

/* =========================================================
   LABELS
========================================================= */

function getStatusLabel(value = "") {
  const key = String(value || "").trim().toLowerCase();

  switch (key) {
    case "active":
    case "activo":
    case "activa":
      return "Activo";

    case "inactive":
    case "inactivo":
    case "inactiva":
      return "Inactivo";

    case "blocked":
    case "bloqueado":
    case "bloqueada":
      return "Bloqueado";

    case "pending":
    case "pendiente":
      return "Pendiente";

    default:
      return safeText(value, "Inactivo");
  }
}

function getRoleLabel(value = "") {
  const key = String(value || "").trim().toLowerCase();

  switch (key) {
    case "admin":
    case "administrator":
      return "Admin";

    case "support":
    case "agent":
    case "tecnico":
    case "técnico":
      return "Soporte";

    case "manager":
    case "gestor":
      return "Manager";

    case "user":
    case "usuario":
      return "User";

    default:
      return safeText(value, "User");
  }
}

/* =========================================================
   CHIPS
========================================================= */

function getStatusChipStyle(value = "") {
  const key = String(value || "").trim().toLowerCase();

  if (["active", "activo", "activa"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["inactive", "inactivo", "inactiva"].includes(key)) {
    return `
      color:var(--text-dim);
      background:var(--surface-glass);
      border:1px solid var(--border-soft);
    `;
  }

  if (["blocked", "bloqueado", "bloqueada"].includes(key)) {
    return `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
    `;
  }

  if (["pending", "pendiente"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function getRoleChipStyle(value = "") {
  const key = String(value || "").trim().toLowerCase();

  if (["admin", "administrator"].includes(key)) {
    return `
      color:#d8b4fe;
      background:color-mix(in srgb, #a855f7 14%, transparent);
      border:1px solid color-mix(in srgb, #a855f7 26%, transparent);
    `;
  }

  if (["support", "agent", "tecnico", "técnico"].includes(key)) {
    return `
      color:#93c5fd;
      background:color-mix(in srgb, #60a5fa 14%, transparent);
      border:1px solid color-mix(in srgb, #60a5fa 26%, transparent);
    `;
  }

  if (["manager", "gestor"].includes(key)) {
    return `
      color:#fcd34d;
      background:color-mix(in srgb, #f59e0b 14%, transparent);
      border:1px solid color-mix(in srgb, #f59e0b 26%, transparent);
    `;
  }

  return `
    color:var(--accent-strong, var(--accent, #7c5cff));
    background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
    border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
  `;
}

function renderChip(label = "", style = "") {
  return `
    <span
      style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:30px;
        padding:0 10px;
        border-radius:999px;
        font-size:12px;
        font-weight:var(--weight-bold);
        letter-spacing:.05em;
        text-transform:uppercase;
        white-space:nowrap;
        ${style}
      "
    >
      ${escapeHtml(label)}
    </span>
  `;
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
  const meta = safeObject(localState.meta);
  const params = safeObject(localState.params);

  const pageSize = Math.max(
    1,
    safeNumber(
      first(localState.pageSize, params.pageSize, meta.pageSize, PAGE_SIZE),
      PAGE_SIZE
    )
  );

  const totalItems = list.length;
  const totalPages = Math.max(
    1,
    safeNumber(meta.totalPages, Math.ceil(totalItems / pageSize))
  );

  const page = clampPage(
    first(localState.page, params.page, meta.page, 1),
    totalPages
  );

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
    hasPrevPage: page > 1,
    hasNextPage: page < totalPages,
  };
}

/* =========================================================
   STATS
========================================================= */

function computeStats(items = []) {
  const list = safeArray(items);

  const totalUsuarios = list.length;

  const activeCount = list.filter((item) => {
    const status = safeLower(getStatusValue(item));
    return ["active", "activo", "activa"].includes(status);
  }).length;

  const inactiveCount = list.filter((item) => {
    const status = safeLower(getStatusValue(item));
    return ["inactive", "inactivo", "inactiva"].includes(status);
  }).length;

  const adminsCount = list.filter((item) => {
    const role = safeLower(getRoleValue(item));
    return ["admin", "administrator"].includes(role);
  }).length;

  const withAvatarCount = list.filter((item) => hasAvatar(item)).length;

  const blockedCount = list.filter((item) => {
    const status = safeLower(getStatusValue(item));
    return ["blocked", "bloqueado", "bloqueada"].includes(status);
  }).length;

  return {
    totalUsuarios,
    activeCount,
    inactiveCount,
    adminsCount,
    withAvatarCount,
    blockedCount,
  };
}

function renderStatCard({
  label = "",
  value = "0",
  caption = "",
  accent = false,
} = {}) {
  return `
    <article
      class="usuarios-stat-card panel-surface"
      style="
        position:relative;
        overflow:hidden;
        display:grid;
        gap:10px;
        min-height:132px;
        padding:20px;
        border-radius:var(--panel-radius);
        border:1px solid ${
          accent
            ? "color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft))"
            : "var(--border-soft)"
        };
        background:${
          accent
            ? "linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 72%), var(--surface-1, var(--surface-glass))"
            : "var(--surface-1, var(--surface-glass))"
        };
        box-shadow:var(--shadow-sm);
      "
    >
      <span
        style="
          font-size:12px;
          line-height:1;
          letter-spacing:.08em;
          text-transform:uppercase;
          color:var(--text-dim);
          font-weight:var(--weight-bold);
        "
      >
        ${escapeHtml(label)}
      </span>

      <strong
        style="
          font-size:clamp(24px, 3vw, 34px);
          line-height:1;
          letter-spacing:-.04em;
          color:var(--text-strong);
          font-weight:var(--weight-black);
        "
      >
        ${escapeHtml(value)}
      </strong>

      <p
        style="
          margin:0;
          color:var(--text-dim);
          font-size:var(--font-sm);
          line-height:1.45;
        "
      >
        ${escapeHtml(caption)}
      </p>
    </article>
  `;
}

/* =========================================================
   VIEW STATE RESOLUTION
========================================================= */

function resolveUsuariosState(state = {}) {
  const localState = safeObject(state);
  const data = safeObject(localState.data);
  const ui = safeObject(localState.ui);
  const meta = safeObject(localState.meta);
  const params = safeObject(localState.params);

  return {
    ...localState,
    loading: Boolean(localState.loading),
    loaded: Boolean(localState.loaded),
    refreshing: Boolean(localState.refreshing),
    creating: Boolean(localState.creating),
    degraded: Boolean(localState.degraded),
    cacheHit: Boolean(localState.cacheHit),
    remoteOk: Boolean(localState.remoteOk),
    error: localState.error || null,
    source: safeText(localState.source, "idle"),
    lastSyncAt: safeText(localState.lastSyncAt, ""),
    openingUserId: safeText(first(localState.openingUserId, ui.openingUserId), ""),
    selectedUserId: safeText(first(localState.selectedUserId, ui.selectedUserId), ""),
    searchDraft: safeText(first(ui.searchDraft, params.q), ""),
    rows: safeArray(
      first(localState.rows, data.rows, localState.items, data.items, data.usuarios)
    ),
    meta: {
      total: safeNumber(first(meta.total, localState.total), 0),
      page: Math.max(1, safeNumber(meta.page, 1)),
      pageSize: Math.max(1, safeNumber(meta.pageSize, PAGE_SIZE)),
      totalPages: Math.max(1, safeNumber(meta.totalPages, 1)),
      count: Math.max(0, safeNumber(meta.count, 0)),
      hasNextPage: Boolean(meta.hasNextPage),
      hasPrevPage: Boolean(meta.hasPrevPage),
    },
    params: {
      q: safeText(params.q, ""),
      role: safeText(params.role, ""),
      status: safeText(params.status, ""),
      sortBy: safeText(params.sortBy, "createdAt"),
      sortDir: safeText(params.sortDir, "desc").toLowerCase() === "asc" ? "asc" : "desc",
      page: Math.max(1, safeNumber(params.page, 1)),
      pageSize: Math.max(1, safeNumber(params.pageSize, PAGE_SIZE)),
    },
    ui,
  };
}

/* =========================================================
   HEADER
========================================================= */

function resolveSessionAdminLabel(user = null) {
  try {
    const byCore =
      typeof AppCore?.getUserDisplayName === "function"
        ? AppCore.getUserDisplayName(user)
        : "";

    if (String(byCore || "").trim()) {
      return String(byCore).trim();
    }
  } catch {}

  return safeText(
    first(user?.displayName, user?.name, user?.username, user?.email),
    "admin"
  );
}

function getSourceLabel(state = {}) {
  const source = safeText(state?.source, "idle");

  if (source === "remote") return "Live";
  if (source === "cache:fresh") return "Cache fresca";
  if (source === "cache:stale") return "Cache stale";
  if (source === "fallback:local") return "Modo local";
  if (source === "error") return "Error";

  return "Idle";
}

export function renderHeader({ items = [], state = {}, user = null } = {}) {
  const localState = resolveUsuariosState(state);
  const list = getResolvedItems(items, localState);
  const stats = computeStats(list);

  const loading = Boolean(localState?.loading);
  const refreshing = Boolean(localState?.refreshing);
  const creating = Boolean(localState?.creating);
  const remoteCount = resolveRemoteCount(items, localState);
  const lastSyncText = localState?.lastSyncAt
    ? formatRelativeDate(localState.lastSyncAt)
    : "Sin sincronización reciente";

  return `
    <section
      class="usuarios-hero"
      style="
        position:relative;
        overflow:hidden;
        border-radius:calc(var(--panel-radius) + 6px);
        border:1px solid var(--border-soft);
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent), transparent 34%),
          linear-gradient(180deg, var(--surface-2, var(--surface-glass)), var(--surface-1, var(--surface-glass)));
        box-shadow:var(--shadow-md);
      "
    >
      <div
        style="
          display:grid;
          gap:var(--space-lg);
          padding:clamp(20px, 3vw, 30px);
        "
      >
        <div
          style="
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:18px;
            flex-wrap:wrap;
          "
        >
          <div style="display:grid; gap:10px; min-width:min(100%, 560px);">
            <span
              style="
                display:inline-flex;
                align-items:center;
                width:max-content;
                min-height:28px;
                padding:0 12px;
                border-radius:999px;
                border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft));
                background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
                color:var(--text-soft);
                font-size:12px;
                font-weight:var(--weight-bold);
                letter-spacing:.06em;
                text-transform:uppercase;
              "
            >
              Administración de usuarios
            </span>

            <div style="display:grid; gap:8px;">
              <h1
                class="page-title"
                style="
                  margin:0;
                  font-size:clamp(30px, 5vw, 48px);
                  line-height:.98;
                  letter-spacing:-.05em;
                  color:var(--text-strong);
                "
              >
                Centro de control de usuarios
              </h1>

              <p
                class="page-subtitle"
                style="
                  margin:0;
                  max-width:860px;
                  color:var(--text-dim);
                  font-size:clamp(14px, 2vw, 16px);
                  line-height:1.6;
                "
              >
                Supervisa cuentas, roles, estado operativo y actividad reciente
                desde una tabla premium diseñada para administración, revisión y gestión rápida.
              </p>
            </div>
          </div>

          <div
            style="
              display:flex;
              gap:10px;
              flex-wrap:wrap;
              align-items:center;
            "
          >
            <button
              id="usuarios-export-btn"
              type="button"
              data-usuarios-action="export"
              style="
                min-height:42px;
                padding:0 14px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-secondary-border, var(--border-soft));
                background:var(--btn-secondary-bg, var(--surface-glass));
                color:var(--btn-secondary-text, var(--text-soft));
                font-weight:var(--weight-bold);
                cursor:pointer;
              "
            >
              Exportar CSV
            </button>

            <button
              id="usuarios-create-btn"
              type="button"
              data-usuarios-action="create-user"
              ${creating ? "disabled" : ""}
              style="
                min-height:42px;
                padding:0 16px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
                background:var(--btn-primary-bg, var(--accent, #7c5cff));
                color:var(--btn-primary-text, #fff);
                font-weight:var(--weight-bold);
                cursor:${creating ? "not-allowed" : "pointer"};
                opacity:${creating ? ".78" : "1"};
                box-shadow:0 10px 24px color-mix(in srgb, var(--accent, #7c5cff) 22%, transparent);
              "
            >
              ${creating ? "Creando..." : "Nuevo usuario"}
            </button>
          </div>
        </div>

        <div
          class="usuarios-hero-meta"
          style="
            display:flex;
            align-items:center;
            gap:10px;
            flex-wrap:wrap;
          "
        >
          <span
            style="
              display:inline-flex;
              align-items:center;
              min-height:30px;
              padding:0 10px;
              border-radius:999px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
              color:var(--text-dim);
              font-size:12px;
              font-weight:var(--weight-bold);
              letter-spacing:.04em;
              text-transform:uppercase;
            "
          >
            Admin · ${escapeHtml(resolveSessionAdminLabel(user))}
          </span>

          <span
            style="
              display:inline-flex;
              align-items:center;
              min-height:30px;
              padding:0 10px;
              border-radius:999px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
              color:var(--text-dim);
              font-size:12px;
              font-weight:var(--weight-bold);
              letter-spacing:.04em;
              text-transform:uppercase;
            "
          >
            ${escapeHtml(String(remoteCount))} registros remotos
          </span>

          <span
            style="
              display:inline-flex;
              align-items:center;
              min-height:30px;
              padding:0 10px;
              border-radius:999px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
              color:var(--text-dim);
              font-size:12px;
              font-weight:var(--weight-bold);
              letter-spacing:.04em;
              text-transform:uppercase;
            "
          >
            Fuente · ${escapeHtml(getSourceLabel(localState))}
          </span>

          <span
            style="
              display:inline-flex;
              align-items:center;
              min-height:30px;
              padding:0 10px;
              border-radius:999px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
              color:var(--text-dim);
              font-size:12px;
              font-weight:var(--weight-bold);
              letter-spacing:.04em;
              text-transform:uppercase;
            "
          >
            Última sync · ${escapeHtml(lastSyncText)}
          </span>

          ${
            refreshing || loading
              ? `
                <span
                  style="
                    display:inline-flex;
                    align-items:center;
                    gap:8px;
                    min-height:30px;
                    padding:0 10px;
                    border-radius:999px;
                    border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft));
                    background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
                    color:var(--text-soft);
                    font-size:12px;
                    font-weight:var(--weight-bold);
                    letter-spacing:.04em;
                    text-transform:uppercase;
                  "
                >
                  <span
                    aria-hidden="true"
                    style="
                      width:10px;
                      height:10px;
                      border-radius:999px;
                      background:var(--accent, #7c5cff);
                      box-shadow:0 0 0 0 color-mix(in srgb, var(--accent, #7c5cff) 30%, transparent);
                      animation:usuariosPulse 1.35s ease-in-out infinite;
                    "
                  ></span>
                  Sincronizando
                </span>
              `
              : ""
          }
        </div>

        <div
          class="usuarios-hero-stats"
          style="
            display:grid;
            grid-template-columns:repeat(4, minmax(0, 1fr));
            gap:var(--space-md);
          "
        >
          ${renderStatCard({
            label: "Usuarios visibles",
            value: String(stats.totalUsuarios),
            caption: `${remoteCount} registros totales cargados en la colección.`,
            accent: true,
          })}

          ${renderStatCard({
            label: "Activos",
            value: String(stats.activeCount),
            caption: "Cuentas con acceso operativo en este momento.",
          })}

          ${renderStatCard({
            label: "Admins / bloqueados",
            value: `${stats.adminsCount} / ${stats.blockedCount}`,
            caption: "Balance rápido entre privilegios altos y cuentas restringidas.",
          })}

          ${renderStatCard({
            label: "Con avatar / inactivos",
            value: `${stats.withAvatarCount} / ${stats.inactiveCount}`,
            caption: "Madurez visual del directorio y usuarios sin actividad.",
          })}
        </div>
      </div>

      <style>
        @keyframes usuariosPulse {
          0% { transform:scale(.92); opacity:.75; }
          50% { transform:scale(1.08); opacity:1; }
          100% { transform:scale(.92); opacity:.75; }
        }

        @media (max-width: 1100px) {
          .usuarios-hero-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 720px) {
          .usuarios-hero-stats {
            grid-template-columns: 1fr !important;
          }
        }
      </style>
    </section>
  `;
}

/* =========================================================
   STATES
========================================================= */

export function renderLoadingState() {
  return `
    <section
      class="panel-surface usuarios-table-shell"
      style="
        overflow:hidden;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      <div
        style="
          display:grid;
          gap:0;
          overflow:auto;
        "
      >
        <div style="min-width:1180px;">
          <div
            style="
              display:grid;
              grid-template-columns: 2.2fr 1.2fr .85fr .95fr 1fr 1fr 1fr;
              gap:0;
              border-bottom:1px solid var(--border-soft);
              background:var(--surface-2, var(--surface-glass));
            "
          >
            ${Array.from({ length: 7 })
              .map(
                () => `
                  <div style="padding:16px 18px;">
                    <div
                      style="
                        height:12px;
                        width:70%;
                        border-radius:999px;
                        background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass));
                        background-size:200% 100%;
                        animation:usuariosSkeleton 1.25s linear infinite;
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
                    grid-template-columns: 2.2fr 1.2fr .85fr .95fr 1fr 1fr 1fr;
                    gap:0;
                    border-bottom:1px solid var(--border-soft);
                  "
                >
                  <div style="padding:16px 18px;">
                    <div style="display:flex; gap:12px; align-items:center;">
                      <div
                        style="
                          width:44px;
                          height:44px;
                          border-radius:14px;
                          background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass));
                          background-size:200% 100%;
                          animation:usuariosSkeleton 1.25s linear infinite;
                        "
                      ></div>
                      <div style="display:grid; gap:8px; flex:1;">
                        <div style="height:14px; width:140px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:usuariosSkeleton 1.25s linear infinite;"></div>
                        <div style="height:12px; width:180px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:usuariosSkeleton 1.25s linear infinite;"></div>
                        <div style="height:12px; width:220px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:usuariosSkeleton 1.25s linear infinite;"></div>
                      </div>
                    </div>
                  </div>

                  <div style="padding:16px 18px;"><div style="height:14px; width:170px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:usuariosSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:16px 18px;"><div style="height:34px; width:92px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:usuariosSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:16px 18px;"><div style="height:34px; width:96px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:usuariosSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:16px 18px;"><div style="height:14px; width:116px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:usuariosSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:16px 18px;"><div style="height:14px; width:92px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:usuariosSkeleton 1.25s linear infinite;"></div></div>

                  <div style="padding:16px 18px;">
                    <div style="display:flex; gap:8px; justify-content:flex-end;">
                      <div style="height:38px; width:112px; border-radius:12px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:usuariosSkeleton 1.25s linear infinite;"></div>
                    </div>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
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
    <section
      class="panel-surface usuarios-error-state"
      style="
        display:grid;
        gap:18px;
        padding:28px;
        border-radius:var(--panel-radius);
        border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, var(--border-soft));
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--danger-strong, #ff6b6b) 10%, transparent), transparent 72%),
          var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      <div style="display:grid; gap:8px;">
        <span
          style="
            display:inline-flex;
            width:max-content;
            min-height:28px;
            align-items:center;
            padding:0 12px;
            border-radius:999px;
            border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
            background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 12%, transparent);
            color:var(--danger-strong, #ff6b6b);
            font-size:12px;
            letter-spacing:.06em;
            text-transform:uppercase;
            font-weight:var(--weight-bold);
          "
        >
          Error de carga
        </span>

        <h3
          style="
            margin:0;
            font-size:clamp(24px, 3vw, 34px);
            line-height:1.05;
            color:var(--text-strong);
            letter-spacing:-.04em;
          "
        >
          No se pudo renderizar la vista de usuarios
        </h3>

        <p
          style="
            margin:0;
            color:var(--text-dim);
            font-size:var(--font-base);
            line-height:1.65;
            max-width:780px;
          "
        >
          ${escapeHtml(safeText(message, "Error desconocido al cargar la vista."))}
        </p>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button
          id="usuarios-retry-btn"
          type="button"
          data-usuarios-action="refresh"
          style="
            min-height:42px;
            padding:0 14px;
            border-radius:var(--btn-radius);
            border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
            background:var(--btn-primary-bg, var(--accent, #7c5cff));
            color:var(--btn-primary-text, #fff);
            font-weight:var(--weight-bold);
            cursor:pointer;
          "
        >
          Reintentar
        </button>
      </div>
    </section>
  `;
}

export function renderEmptyState() {
  return `
    <section
      class="panel-surface usuarios-empty-state"
      style="
        display:grid;
        gap:18px;
        padding:28px;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      <div style="display:grid; gap:8px;">
        <span
          style="
            display:inline-flex;
            width:max-content;
            min-height:28px;
            align-items:center;
            padding:0 12px;
            border-radius:999px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            color:var(--text-dim);
            font-size:12px;
            letter-spacing:.06em;
            text-transform:uppercase;
            font-weight:var(--weight-bold);
          "
        >
          Sin resultados
        </span>

        <h3
          style="
            margin:0;
            font-size:clamp(24px, 3vw, 34px);
            line-height:1.05;
            color:var(--text-strong);
            letter-spacing:-.04em;
          "
        >
          No hay usuarios para mostrar
        </h3>

        <p
          style="
            margin:0;
            color:var(--text-dim);
            font-size:var(--font-base);
            line-height:1.65;
            max-width:760px;
          "
        >
          Ajusta los filtros, la búsqueda o la paginación para intentar encontrar resultados.
        </p>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button
          id="usuarios-reset-filters-btn"
          type="button"
          data-usuarios-action="reset-filters"
          style="
            min-height:42px;
            padding:0 14px;
            border-radius:var(--btn-radius);
            border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
            background:var(--btn-primary-bg, var(--accent, #7c5cff));
            color:var(--btn-primary-text, #fff);
            font-weight:var(--weight-bold);
            cursor:pointer;
          "
        >
          Resetear filtros
        </button>
      </div>
    </section>
  `;
}

function renderTableToolbar({
  total = 0,
  page = 1,
  totalPages = 1,
  from = 0,
  to = 0,
  refreshing = false,
  state = {},
} = {}) {
  const localState = resolveUsuariosState(state);
  const params = safeObject(localState.params);
  const searchValue = safeText(localState.searchDraft || params.q, "");

  return `
    <div
      class="usuarios-table-toolbar"
      style="
        display:grid;
        gap:14px;
        padding:16px 18px;
        border-bottom:1px solid var(--border-soft);
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 6%, transparent), transparent),
          var(--surface-1, var(--surface-glass));
      "
    >
      <div
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:14px;
          flex-wrap:wrap;
        "
      >
        <div style="display:grid; gap:4px;">
          <strong
            style="
              color:var(--text-strong);
              font-size:var(--font-base);
              letter-spacing:-.02em;
            "
          >
            Tabla de usuarios
          </strong>

          <span
            style="
              color:var(--text-dim);
              font-size:var(--font-sm);
            "
          >
            Mostrando ${escapeHtml(String(from))}-${escapeHtml(String(to))} de ${escapeHtml(String(total))} · página ${escapeHtml(String(page))} de ${escapeHtml(String(totalPages))}
          </span>
        </div>

        <div
          style="
            display:flex;
            align-items:center;
            gap:8px;
            flex-wrap:wrap;
          "
        >
          <span
            style="
              display:inline-flex;
              align-items:center;
              min-height:30px;
              padding:0 10px;
              border-radius:999px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
              color:var(--text-dim);
              font-size:12px;
              font-weight:var(--weight-bold);
              letter-spacing:.04em;
              text-transform:uppercase;
            "
          >
            Vista tabla
          </span>

          ${
            refreshing
              ? `
                <span
                  style="
                    display:inline-flex;
                    align-items:center;
                    gap:8px;
                    min-height:30px;
                    padding:0 10px;
                    border-radius:999px;
                    border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 22%, var(--border-soft));
                    background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
                    color:var(--text-soft);
                    font-size:12px;
                    font-weight:var(--weight-bold);
                    letter-spacing:.04em;
                    text-transform:uppercase;
                  "
                >
                  <span
                    aria-hidden="true"
                    style="
                      width:8px;
                      height:8px;
                      border-radius:999px;
                      background:var(--accent, #7c5cff);
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
            data-usuarios-action="prev-page"
            ${page <= 1 ? "disabled" : ""}
            style="
              min-height:34px;
              padding:0 12px;
              border-radius:12px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
              color:var(--text-soft);
              font-weight:var(--weight-bold);
              cursor:${page <= 1 ? "not-allowed" : "pointer"};
              opacity:${page <= 1 ? ".55" : "1"};
            "
          >
            Anterior
          </button>

          <button
            type="button"
            data-usuarios-action="next-page"
            ${page >= totalPages ? "disabled" : ""}
            style="
              min-height:34px;
              padding:0 12px;
              border-radius:12px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
              color:var(--text-soft);
              font-weight:var(--weight-bold);
              cursor:${page >= totalPages ? "not-allowed" : "pointer"};
              opacity:${page >= totalPages ? ".55" : "1"};
            "
          >
            Siguiente
          </button>
        </div>
      </div>

      <div
        class="usuarios-toolbar-filters"
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          flex-wrap:wrap;
        "
      >
        <div
          style="
            display:flex;
            align-items:center;
            gap:10px;
            flex-wrap:wrap;
            flex:1 1 620px;
          "
        >
          <div
            style="
              display:flex;
              align-items:center;
              gap:10px;
              flex-wrap:wrap;
              width:100%;
              max-width:640px;
            "
          >
            <input
              type="search"
              value="${escapeHtml(searchValue)}"
              placeholder="Buscar por nombre, email o username"
              data-usuarios-input="search"
              aria-label="Buscar usuarios"
              style="
                flex:1 1 320px;
                min-width:220px;
                min-height:42px;
                border-radius:14px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-strong);
                padding:0 14px;
                outline:none;
              "
            />

            <button
              type="button"
              data-usuarios-action="submit-search"
              style="
                min-height:42px;
                padding:0 14px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-secondary-border, var(--border-soft));
                background:var(--btn-secondary-bg, var(--surface-glass));
                color:var(--btn-secondary-text, var(--text-soft));
                font-weight:var(--weight-bold);
                cursor:pointer;
              "
            >
              Buscar
            </button>
          </div>
        </div>

        <div
          style="
            display:flex;
            align-items:center;
            gap:10px;
            flex-wrap:wrap;
          "
        >
          <select
            data-usuarios-filter="role"
            aria-label="Filtrar por rol"
            style="
              min-height:42px;
              min-width:150px;
              border-radius:14px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
              color:var(--text-strong);
              padding:0 12px;
              outline:none;
            "
          >
            <option value="" ${!params.role ? "selected" : ""}>Todos los roles</option>
            <option value="admin" ${params.role === "admin" ? "selected" : ""}>Admin</option>
            <option value="support" ${params.role === "support" ? "selected" : ""}>Soporte</option>
            <option value="user" ${params.role === "user" ? "selected" : ""}>User</option>
          </select>

          <select
            data-usuarios-filter="status"
            aria-label="Filtrar por estado"
            style="
              min-height:42px;
              min-width:150px;
              border-radius:14px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
              color:var(--text-strong);
              padding:0 12px;
              outline:none;
            "
          >
            <option value="" ${!params.status ? "selected" : ""}>Todos los estados</option>
            <option value="active" ${params.status === "active" ? "selected" : ""}>Activo</option>
            <option value="inactive" ${params.status === "inactive" ? "selected" : ""}>Inactivo</option>
            <option value="blocked" ${params.status === "blocked" ? "selected" : ""}>Bloqueado</option>
          </select>

          <select
            data-usuarios-page-size="true"
            aria-label="Tamaño de página"
            style="
              min-height:42px;
              min-width:140px;
              border-radius:14px;
              border:1px solid var(--border-soft);
              background:var(--surface-glass);
              color:var(--text-strong);
              padding:0 12px;
              outline:none;
            "
          >
            ${[5, 10, 20, 50]
              .map(
                (size) => `
                  <option value="${size}" ${
                    safeNumber(params.pageSize || PAGE_SIZE, PAGE_SIZE) === size
                      ? "selected"
                      : ""
                  }>
                    ${size} por página
                  </option>
                `
              )
              .join("")}
          </select>

          <button
            type="button"
            data-usuarios-action="reset-filters"
            style="
              min-height:42px;
              padding:0 14px;
              border-radius:var(--btn-radius);
              border:1px solid var(--btn-secondary-border, var(--border-soft));
              background:var(--btn-secondary-bg, var(--surface-glass));
              color:var(--btn-secondary-text, var(--text-soft));
              font-weight:var(--weight-bold);
              cursor:pointer;
            "
          >
            Resetear filtros
          </button>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   AVATAR
========================================================= */

function renderIdentityAvatar({
  avatarUrl = "",
  initials = "US",
  seed = "onion-user",
  size = 44,
  radius = 14,
} = {}) {
  const theme = getFallbackAvatarTheme(seed);
  const safeUrl = safeText(avatarUrl, "");

  if (safeUrl) {
    return `
      <div
        aria-hidden="true"
        style="
          position:relative;
          flex:0 0 ${size}px;
          width:${size}px;
          height:${size}px;
          border-radius:${radius}px;
          overflow:hidden;
          border:1px solid var(--border-soft);
          box-shadow:0 8px 24px rgba(0,0,0,.18);
          background:var(--surface-glass);
        "
      >
        <img
          src="${escapeHtml(safeUrl)}"
          alt=""
          loading="lazy"
          referrerpolicy="no-referrer"
          style="
            display:block;
            width:100%;
            height:100%;
            object-fit:cover;
          "
          onerror="this.style.display='none'; this.parentNode.setAttribute('data-avatar-fallback','true');"
        />
        <span
          style="
            position:absolute;
            inset:0;
            display:none;
            place-items:center;
            background:${theme.bg};
            color:${theme.text};
            font-weight:var(--weight-black);
            letter-spacing:.03em;
            backdrop-filter:blur(8px);
          "
        >
          ${escapeHtml(initials)}
        </span>
      </div>
    `;
  }

  return `
    <div
      aria-hidden="true"
      style="
        position:relative;
        flex:0 0 ${size}px;
        width:${size}px;
        height:${size}px;
        border-radius:${radius}px;
        display:grid;
        place-items:center;
        background:${theme.bg};
        border:1px solid ${theme.border};
        color:${theme.text};
        font-weight:var(--weight-black);
        letter-spacing:.03em;
        box-shadow:0 8px 24px ${theme.glow};
      "
    >
      ${escapeHtml(initials)}
    </div>
  `;
}

/* =========================================================
   ROW
========================================================= */

function getSortIndicator(state = {}, sortBy = "") {
  const localState = resolveUsuariosState(state);
  const currentBy = safeText(localState.params?.sortBy, "createdAt");
  const currentDir = safeText(localState.params?.sortDir, "desc");

  if (currentBy !== sortBy) {
    return "";
  }

  return currentDir === "asc" ? "↑" : "↓";
}

function renderOpenUserButton({ userId = "", isOpening = false } = {}) {
  return `
    <button
      type="button"
      data-usuarios-action="open-detail"
      data-usuarios-user-id="${escapeHtml(userId)}"
      ${isOpening ? "disabled" : ""}
      style="
        min-height:38px;
        min-width:96px;
        padding:0 12px;
        border-radius:12px;
        border:1px solid var(--btn-secondary-border, var(--border-soft));
        background:var(--btn-secondary-bg, var(--surface-glass));
        color:var(--btn-secondary-text, var(--text-soft));
        font-weight:var(--weight-bold);
        cursor:${isOpening ? "wait" : "pointer"};
        white-space:nowrap;
        opacity:${isOpening ? ".88" : "1"};
      "
    >
      ${
        isOpening
          ? `
            <span style="display:inline-flex; align-items:center; gap:8px;">
              <span
                aria-hidden="true"
                style="
                  width:14px;
                  height:14px;
                  border-radius:999px;
                  border:2px solid color-mix(in srgb, var(--text-soft) 22%, transparent);
                  border-top-color:var(--text-soft);
                  animation:usuariosSpin .8s linear infinite;
                "
              ></span>
              Abriendo...
            </span>
          `
          : "Ver"
      }
    </button>
  `;
}

function renderUsuarioRow(item = {}, state = {}) {
  const localState = resolveUsuariosState(state);
  const openingUserId = safeText(localState?.openingUserId, "");
  const selectedUserId = safeText(localState?.selectedUserId, "");
  const userId = getUserId(item);
  const username = getUsername(item);
  const displayName = getDisplayName(item);
  const preview = truncate(getPreview(item), 96);
  const email = getEmail(item);
  const roleValue = getRoleValue(item);
  const statusValue = getStatusValue(item);
  const role = getRoleLabel(roleValue);
  const status = getStatusLabel(statusValue);
  const createdAtRaw = getCreatedAt(item);
  const lastLoginAtRaw = getLastLoginAt(item);
  const createdAt = formatDate(createdAtRaw);
  const lastLoginAt = formatRelativeDate(lastLoginAtRaw);
  const lastLoginDate = formatDateTime(lastLoginAtRaw);
  const initials = getUserInitials(item);
  const avatarUrl = getAvatarUrl(item);
  const avatarSeed = getAvatarToneSeed(item);
  const isOpening = Boolean(openingUserId && openingUserId === userId);
  const isSelected = Boolean(selectedUserId && selectedUserId === userId);

  return `
    <tr
      class="usuarios-row ${isOpening ? "is-opening" : ""} ${isSelected ? "is-selected" : ""}"
      data-user-id="${escapeHtml(userId)}"
      style="
        transition:background .18s ease, opacity .18s ease, transform .18s ease;
        opacity:${isOpening ? ".72" : "1"};
      "
    >
      <td
        style="
          padding:14px 18px;
          border-bottom:1px solid var(--border-soft);
          vertical-align:middle;
        "
      >
        <div style="display:flex; gap:12px; align-items:center; min-width:320px;">
          ${renderIdentityAvatar({
            avatarUrl,
            initials,
            seed: avatarSeed,
            size: 44,
            radius: 14,
          })}

          <div style="display:grid; gap:4px; min-width:0; flex:1;">
            <button
              type="button"
              data-usuarios-action="open-detail"
              data-usuarios-user-id="${escapeHtml(userId)}"
              ${isOpening ? "disabled" : ""}
              style="
                margin:0;
                padding:0;
                border:none;
                background:transparent;
                text-align:left;
                color:var(--text-strong);
                font-size:15px;
                font-weight:var(--weight-black);
                letter-spacing:-.02em;
                line-height:1.2;
                cursor:${isOpening ? "wait" : "pointer"};
              "
              title="Abrir detalle de usuario"
            >
              ${escapeHtml(displayName)}
            </button>

            <span
              style="
                color:var(--text-soft);
                font-size:13px;
                font-weight:var(--weight-semibold);
                line-height:1.32;
                word-break:break-word;
              "
            >
              @${escapeHtml(username)}
            </span>

            <span
              style="
                color:var(--text-dim);
                font-size:12px;
                line-height:1.32;
                word-break:break-word;
              "
            >
              ${escapeHtml(preview)}
            </span>
          </div>
        </div>
      </td>

      <td
        style="
          padding:14px 14px;
          border-bottom:1px solid var(--border-soft);
          vertical-align:middle;
        "
      >
        <div style="display:grid; gap:4px; min-width:180px;">
          <strong
            style="
              color:var(--text-strong);
              font-size:13px;
              line-height:1.2;
              word-break:break-word;
            "
          >
            ${escapeHtml(email)}
          </strong>

          <span
            style="
              color:var(--text-dim);
              font-size:12px;
              line-height:1.2;
              word-break:break-word;
            "
          >
            ${escapeHtml(getPhone(item))}
          </span>
        </div>
      </td>

      <td
        style="
          padding:14px 14px;
          border-bottom:1px solid var(--border-soft);
          vertical-align:middle;
          white-space:nowrap;
        "
      >
        ${renderChip(role, getRoleChipStyle(roleValue))}
      </td>

      <td
        style="
          padding:14px 14px;
          border-bottom:1px solid var(--border-soft);
          vertical-align:middle;
          white-space:nowrap;
        "
      >
        ${renderChip(status, getStatusChipStyle(statusValue))}
      </td>

      <td
        style="
          padding:14px 14px;
          border-bottom:1px solid var(--border-soft);
          vertical-align:middle;
          white-space:nowrap;
        "
      >
        <div style="display:grid; gap:4px;">
          <strong
            style="
              color:var(--text-strong);
              font-size:13px;
              line-height:1.2;
            "
          >
            ${escapeHtml(createdAt)}
          </strong>

          <span
            style="
              color:var(--text-dim);
              font-size:11px;
              line-height:1.2;
              text-transform:uppercase;
              letter-spacing:.04em;
            "
          >
            Alta
          </span>
        </div>
      </td>

      <td
        style="
          padding:14px 14px;
          border-bottom:1px solid var(--border-soft);
          vertical-align:middle;
          white-space:nowrap;
        "
      >
        <div style="display:grid; gap:6px;">
          <span
            style="
              color:var(--text-soft);
              font-size:13px;
              line-height:1.2;
              font-weight:var(--weight-semibold);
            "
          >
            ${escapeHtml(lastLoginAt)}
          </span>

          <span
            style="
              display:inline-flex;
              align-items:center;
              width:max-content;
              min-height:24px;
              padding:0 8px;
              border-radius:999px;
              border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 20%, var(--border-soft));
              background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
              color:var(--text-soft);
              font-size:11px;
              font-weight:var(--weight-bold);
              letter-spacing:.04em;
              text-transform:uppercase;
            "
          >
            ${escapeHtml(lastLoginDate)}
          </span>
        </div>
      </td>

      <td
        style="
          padding:14px 18px;
          border-bottom:1px solid var(--border-soft);
          vertical-align:middle;
          text-align:right;
        "
      >
        <div
          style="
            display:flex;
            justify-content:flex-end;
            gap:8px;
            flex-wrap:wrap;
          "
        >
          <button
            type="button"
            data-usuarios-action="select-user"
            data-usuarios-user-id="${escapeHtml(userId)}"
            style="
              min-height:38px;
              padding:0 12px;
              border-radius:12px;
              border:1px solid var(--btn-secondary-border, var(--border-soft));
              background:var(--btn-secondary-bg, var(--surface-glass));
              color:var(--btn-secondary-text, var(--text-soft));
              font-weight:var(--weight-bold);
              cursor:pointer;
              white-space:nowrap;
            "
          >
            ${isSelected ? "En foco" : "Seleccionar"}
          </button>

          ${renderOpenUserButton({ userId, isOpening })}
        </div>
      </td>
    </tr>
  `;
}

function renderMobileUsuarioCard(item = {}, state = {}) {
  const localState = resolveUsuariosState(state);
  const openingUserId = safeText(localState?.openingUserId, "");
  const selectedUserId = safeText(localState?.selectedUserId, "");
  const userId = getUserId(item);
  const username = getUsername(item);
  const displayName = getDisplayName(item);
  const preview = truncate(getPreview(item), 120);
  const email = getEmail(item);
  const phone = getPhone(item);
  const roleValue = getRoleValue(item);
  const statusValue = getStatusValue(item);
  const role = getRoleLabel(roleValue);
  const status = getStatusLabel(statusValue);
  const createdAt = formatDate(getCreatedAt(item));
  const lastLoginAt = formatRelativeDate(getLastLoginAt(item));
  const initials = getUserInitials(item);
  const avatarUrl = getAvatarUrl(item);
  const avatarSeed = getAvatarToneSeed(item);
  const isOpening = Boolean(openingUserId && openingUserId === userId);
  const isSelected = Boolean(selectedUserId && selectedUserId === userId);

  return `
    <article
      class="usuarios-mobile-card panel-surface ${isSelected ? "is-selected" : ""}"
      data-user-id="${escapeHtml(userId)}"
      style="
        display:grid;
        gap:16px;
        padding:18px;
        border-radius:18px;
        border:1px solid ${isSelected ? "color-mix(in srgb, var(--accent, #7c5cff) 28%, var(--border-soft))" : "var(--border-soft)"};
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
        opacity:${isOpening ? ".72" : "1"};
      "
    >
      <div
        style="
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
        "
      >
        <div style="display:flex; gap:12px; min-width:0; flex:1;">
          ${renderIdentityAvatar({
            avatarUrl,
            initials,
            seed: avatarSeed,
            size: 42,
            radius: 14,
          })}

          <div style="display:grid; gap:5px; min-width:0;">
            <button
              type="button"
              data-usuarios-action="open-detail"
              data-usuarios-user-id="${escapeHtml(userId)}"
              ${isOpening ? "disabled" : ""}
              style="
                margin:0;
                padding:0;
                border:none;
                background:transparent;
                text-align:left;
                color:var(--text-strong);
                font-size:var(--font-base);
                font-weight:var(--weight-black);
                letter-spacing:-.02em;
                line-height:1.2;
                cursor:${isOpening ? "wait" : "pointer"};
              "
            >
              ${escapeHtml(displayName)}
            </button>

            <span
              style="
                color:var(--text-soft);
                font-size:var(--font-sm);
                font-weight:var(--weight-semibold);
                line-height:1.35;
                word-break:break-word;
              "
            >
              @${escapeHtml(username)}
            </span>

            <span
              style="
                color:var(--text-dim);
                font-size:12px;
                line-height:1.35;
                word-break:break-word;
              "
            >
              ${escapeHtml(preview)}
            </span>
          </div>
        </div>

        <div style="display:grid; gap:8px; justify-items:end;">
          ${renderChip(role, getRoleChipStyle(roleValue))}
          ${renderChip(status, getStatusChipStyle(statusValue))}
        </div>
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:repeat(2, minmax(0, 1fr));
          gap:10px;
        "
      >
        <div
          style="
            display:grid;
            gap:4px;
            padding:12px;
            border-radius:14px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
          "
        >
          <span
            style="
              font-size:11px;
              color:var(--text-faint);
              font-weight:var(--weight-bold);
              letter-spacing:.05em;
              text-transform:uppercase;
            "
          >
            Email
          </span>
          <strong style="color:var(--text-strong); font-size:var(--font-sm); word-break:break-word;">
            ${escapeHtml(email)}
          </strong>
          <span style="color:var(--text-dim); font-size:12px; line-height:1.35;">
            ${escapeHtml(phone)}
          </span>
        </div>

        <div
          style="
            display:grid;
            gap:4px;
            padding:12px;
            border-radius:14px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
          "
        >
          <span
            style="
              font-size:11px;
              color:var(--text-faint);
              font-weight:var(--weight-bold);
              letter-spacing:.05em;
              text-transform:uppercase;
            "
          >
            Estado
          </span>
          <strong style="color:var(--text-strong); font-size:var(--font-sm);">
            ${escapeHtml(status)}
          </strong>
        </div>

        <div
          style="
            display:grid;
            gap:4px;
            padding:12px;
            border-radius:14px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
          "
        >
          <span
            style="
              font-size:11px;
              color:var(--text-faint);
              font-weight:var(--weight-bold);
              letter-spacing:.05em;
              text-transform:uppercase;
            "
          >
            Alta
          </span>
          <strong style="color:var(--text-strong); font-size:var(--font-sm);">
            ${escapeHtml(createdAt)}
          </strong>
        </div>

        <div
          style="
            display:grid;
            gap:4px;
            padding:12px;
            border-radius:14px;
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
          "
        >
          <span
            style="
              font-size:11px;
              color:var(--text-faint);
              font-weight:var(--weight-bold);
              letter-spacing:.05em;
              text-transform:uppercase;
            "
          >
            Último acceso
          </span>
          <strong style="color:var(--text-strong); font-size:var(--font-sm);">
            ${escapeHtml(lastLoginAt)}
          </strong>
        </div>
      </div>

      <div
        style="
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          justify-content:flex-start;
        "
      >
        <button
          type="button"
          data-usuarios-action="select-user"
          data-usuarios-user-id="${escapeHtml(userId)}"
          style="
            min-height:38px;
            padding:0 12px;
            border-radius:12px;
            border:1px solid var(--btn-secondary-border, var(--border-soft));
            background:var(--btn-secondary-bg, var(--surface-glass));
            color:var(--btn-secondary-text, var(--text-soft));
            font-weight:var(--weight-bold);
            cursor:pointer;
          "
        >
          ${isSelected ? "En foco" : "Seleccionar"}
        </button>

        ${renderOpenUserButton({ userId, isOpening })}
      </div>
    </article>
  `;
}

function renderDesktopTable(items = [], state = {}) {
  return `
    <div
      class="usuarios-table-scroll"
      style="
        width:100%;
        overflow:auto;
      "
    >
      <table
        class="usuarios-table"
        style="
          width:100%;
          min-width:1180px;
          border-collapse:separate;
          border-spacing:0;
          table-layout:fixed;
        "
      >
        <colgroup>
          <col style="width:28%">
          <col style="width:18%">
          <col style="width:10%">
          <col style="width:10%">
          <col style="width:12%">
          <col style="width:12%">
          <col style="width:10%">
        </colgroup>

        <thead>
          <tr
            style="
              background:var(--surface-2, var(--surface-glass));
            "
          >
            <th
              style="
                padding:16px 18px;
                text-align:left;
                font-size:12px;
                letter-spacing:.08em;
                text-transform:uppercase;
                color:var(--text-dim);
                font-weight:var(--weight-bold);
                border-bottom:1px solid var(--border-soft);
                white-space:nowrap;
              "
            >
              Usuario / detalle
            </th>

            <th
              style="
                padding:16px 14px;
                text-align:left;
                font-size:12px;
                letter-spacing:.08em;
                text-transform:uppercase;
                color:var(--text-dim);
                font-weight:var(--weight-bold);
                border-bottom:1px solid var(--border-soft);
                white-space:nowrap;
              "
            >
              <button
                type="button"
                data-usuarios-sort="email"
                style="
                  border:none;
                  background:transparent;
                  padding:0;
                  color:inherit;
                  font:inherit;
                  font-weight:inherit;
                  letter-spacing:inherit;
                  text-transform:inherit;
                  cursor:pointer;
                "
              >
                Email ${escapeHtml(getSortIndicator(state, "email"))}
              </button>
            </th>

            <th
              style="
                padding:16px 14px;
                text-align:left;
                font-size:12px;
                letter-spacing:.08em;
                text-transform:uppercase;
                color:var(--text-dim);
                font-weight:var(--weight-bold);
                border-bottom:1px solid var(--border-soft);
                white-space:nowrap;
              "
            >
              Rol
            </th>

            <th
              style="
                padding:16px 14px;
                text-align:left;
                font-size:12px;
                letter-spacing:.08em;
                text-transform:uppercase;
                color:var(--text-dim);
                font-weight:var(--weight-bold);
                border-bottom:1px solid var(--border-soft);
                white-space:nowrap;
              "
            >
              Estado
            </th>

            <th
              style="
                padding:16px 14px;
                text-align:left;
                font-size:12px;
                letter-spacing:.08em;
                text-transform:uppercase;
                color:var(--text-dim);
                font-weight:var(--weight-bold);
                border-bottom:1px solid var(--border-soft);
                white-space:nowrap;
              "
            >
              <button
                type="button"
                data-usuarios-sort="createdAt"
                style="
                  border:none;
                  background:transparent;
                  padding:0;
                  color:inherit;
                  font:inherit;
                  font-weight:inherit;
                  letter-spacing:inherit;
                  text-transform:inherit;
                  cursor:pointer;
                "
              >
                Alta ${escapeHtml(getSortIndicator(state, "createdAt"))}
              </button>
            </th>

            <th
              style="
                padding:16px 14px;
                text-align:left;
                font-size:12px;
                letter-spacing:.08em;
                text-transform:uppercase;
                color:var(--text-dim);
                font-weight:var(--weight-bold);
                border-bottom:1px solid var(--border-soft);
                white-space:nowrap;
              "
            >
              Último acceso
            </th>

            <th
              style="
                padding:16px 18px;
                text-align:right;
                font-size:12px;
                letter-spacing:.08em;
                text-transform:uppercase;
                color:var(--text-dim);
                font-weight:var(--weight-bold);
                border-bottom:1px solid var(--border-soft);
                white-space:nowrap;
              "
            >
              Acciones
            </th>
          </tr>
        </thead>

        <tbody>
          ${safeArray(items)
            .map((item) => renderUsuarioRow(item, state))
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMobileCards(items = [], state = {}) {
  return `
    <div
      class="usuarios-mobile-list"
      style="
        display:none;
        gap:14px;
        padding:14px;
      "
    >
      ${safeArray(items)
        .map((item) => renderMobileUsuarioCard(item, state))
        .join("")}
    </div>
  `;
}

function renderTableLoadingOverlay(message = "Actualizando usuarios...") {
  return `
    <div
      class="usuarios-table-overlay"
      aria-live="polite"
      aria-busy="true"
      style="
        position:absolute;
        inset:0;
        display:grid;
        place-items:center;
        padding:18px;
        background:color-mix(in srgb, var(--surface-1, #0f1115) 74%, transparent);
        backdrop-filter:blur(4px);
        z-index:4;
      "
    >
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
   MAIN TABLE
========================================================= */

export function renderTable({ items = [], state = {} } = {}) {
  const localState = resolveUsuariosState(state);
  const list = getResolvedItems(items, localState);
  const refreshing = Boolean(localState?.refreshing);
  const loading = Boolean(localState?.loading);

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
    <section
      class="usuarios-table-wrap panel-surface"
      style="
        position:relative;
        overflow:hidden;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--surface-2, transparent) 60%, transparent), transparent),
          var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      ${renderTableToolbar({
        total: pagination.totalItems,
        page: pagination.page,
        totalPages: pagination.totalPages,
        from: pagination.from,
        to: pagination.to,
        refreshing,
        state: localState,
      })}

      <div class="usuarios-desktop-table">
        ${renderDesktopTable(pagination.items, localState)}
      </div>

      ${renderMobileCards(pagination.items, localState)}

      ${refreshing ? renderTableLoadingOverlay("Actualizando usuarios...") : ""}

      <style>
        @keyframes usuariosSpin {
          to { transform:rotate(360deg); }
        }

        .usuarios-table tbody tr:hover {
          background: color-mix(in srgb, var(--accent, #7c5cff) 4%, transparent);
        }

        .usuarios-table tbody tr:last-child td {
          border-bottom: none;
        }

        .usuarios-table tbody tr.is-opening:hover {
          background: color-mix(in srgb, var(--warning-strong, #ffbc42) 5%, transparent);
        }

        .usuarios-table tbody tr.is-selected {
          background: color-mix(in srgb, var(--accent, #7c5cff) 7%, transparent);
          box-shadow: inset 3px 0 0 color-mix(in srgb, var(--accent, #7c5cff) 68%, transparent);
        }

        .usuarios-table-scroll::-webkit-scrollbar {
          height: 10px;
          width: 10px;
        }

        .usuarios-table-scroll::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--accent, #7c5cff) 20%, var(--border-soft));
          border-radius: 999px;
        }

        .usuarios-table-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .usuarios-table img + span {
          display:none;
        }

        .usuarios-table [data-avatar-fallback="true"] > img {
          display:none !important;
        }

        .usuarios-table [data-avatar-fallback="true"] > span {
          display:grid !important;
        }

        .usuarios-mobile-list [data-avatar-fallback="true"] > img {
          display:none !important;
        }

        .usuarios-mobile-list [data-avatar-fallback="true"] > span {
          display:grid !important;
        }

        @media (max-width: 980px) {
          .usuarios-desktop-table {
            display: none !important;
          }

          .usuarios-mobile-list {
            display: grid !important;
          }
        }

        @media (max-width: 760px) {
          .usuarios-toolbar-filters {
            align-items:stretch !important;
          }
        }
      </style>
    </section>
  `;
}

export function renderCards({ items = [], state = {} } = {}) {
  return renderTable({ items, state });
}

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function getUsuariosTemplate(options = {}) {
  const user = options?.user || null;
  const state = resolveUsuariosState(options?.state || options?.usuarios || options || {});
  const explicitItems = safeArray(first(options?.items, options?.data?.items, options?.data?.rows));
  const items = explicitItems.length ? explicitItems : state.rows;
  const list = getResolvedItems(items, state);

  let body = "";

  if (state.error && !list.length) {
    body = renderErrorState(state.error);
  } else if (state.loading && !list.length) {
    body = renderLoadingState();
  } else {
    body = renderTable({ items: list, state });
  }

  return `
    <section
      class="usuarios-view"
      data-view="usuarios"
      data-usuarios-view="true"
      data-usuarios-source="${escapeHtml(safeText(state.source, "idle"))}"
      data-usuarios-degraded="${state.degraded === true ? "true" : "false"}"
      style="
        width:100%;
        display:grid;
        gap:24px;
      "
    >
      ${renderHeader({
        items: list,
        state,
        user,
      })}

      ${body}
    </section>
  `;
}

export {
  getUsuariosTemplate as UsuariosTemplate,
};

export default getUsuariosTemplate;
