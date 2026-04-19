/* =========================================================
   Onion SPA - Usuarios Template (FINAL PRO TABLE GOD MODE)
   Archivo: src/views/usuarios/usuarios.table.template.js

   EXTREME MODE · BACKEND REAL DATA READY · 10/10

   Responsabilidades:
   - renderizar header premium de la vista
   - renderizar estados loading / error / empty
   - renderizar tabla premium de usuarios
   - paginar a 5 usuarios por vista
   - mostrar loader SOLO en la sección de tabla
   - mostrar estado visual al abrir usuario lento
   - mantener compatibilidad directa con usuariosView.js
   - consumir datos reales del backend /api/users
   - compartir lenguaje visual y densidad con Facturas

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - soporte para envelope backend { ok, count, users }
   - lectura preferente del shape normalizado del backend
   - mismo lenguaje visual que Facturas
   - toolbar / skeleton / mobile cards consistentes
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
   SAFE
========================================================= */

const PAGE_SIZE = 5;

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

/* =========================================================
   BACKEND ENVELOPE / REAL DATA RESOLVE
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
      localState?.remoteCount,
      localState?.count,
      localState?.total,
      safeObject(localState?.stats)?.total,
      safeObject(localState?.response)?.count,
      safeObject(localState?.payload)?.count,
      safeObject(localState?.lastResponse)?.count,
      safeObject(items)?.count
    ),
    safeArray(items).length
  );
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
    case "enabled":
    case "habilitado":
      return "Activo";

    case "pending":
    case "pendiente":
    case "invited":
    case "invitado":
      return "Pendiente";

    case "blocked":
    case "bloqueado":
    case "bloqueada":
    case "suspended":
    case "suspendido":
      return "Bloqueado";

    case "disabled":
    case "inactive":
    case "inactivo":
    case "deshabilitado":
      return "Inactivo";

    default:
      return safeText(value, "Activo");
  }
}

function getRoleLabel(value = "") {
  const key = String(value || "").trim().toLowerCase();

  switch (key) {
    case "superadmin":
    case "super_admin":
    case "root":
      return "Superadmin";

    case "admin":
    case "administrator":
    case "administrador":
      return "Admin";

    case "support":
    case "soporte":
    case "agent":
    case "agente":
      return "Soporte";

    case "manager":
    case "gestor":
    case "gerente":
      return "Manager";

    case "user":
    case "usuario":
      return "Usuario";

    default:
      return safeText(value, "Usuario");
  }
}

/* =========================================================
   CHIPS
========================================================= */

function getStatusChipStyle(value = "") {
  const key = String(value || "").trim().toLowerCase();

  if (["active", "activo", "activa", "enabled", "habilitado"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["pending", "pendiente", "invited", "invitado"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["blocked", "bloqueado", "bloqueada", "suspended", "suspendido"].includes(key)) {
    return `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
    `;
  }

  if (["disabled", "inactive", "inactivo", "deshabilitado"].includes(key)) {
    return `
      color:var(--text-dim);
      background:var(--surface-glass);
      border:1px solid var(--border-soft);
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

  if (["superadmin", "super_admin", "root"].includes(key)) {
    return `
      color:#b388ff;
      background:color-mix(in srgb, #b388ff 14%, transparent);
      border:1px solid color-mix(in srgb, #b388ff 26%, transparent);
    `;
  }

  if (["admin", "administrator", "administrador"].includes(key)) {
    return `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
    `;
  }

  if (["support", "soporte", "agent", "agente"].includes(key)) {
    return `
      color:#60a5fa;
      background:color-mix(in srgb, #60a5fa 14%, transparent);
      border:1px solid color-mix(in srgb, #60a5fa 26%, transparent);
    `;
  }

  if (["manager", "gestor", "gerente"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["user", "usuario"].includes(key)) {
    return `
      color:var(--text-soft);
      background:var(--surface-glass);
      border:1px solid var(--border-soft);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function renderStatusChip(label = "", style = "") {
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
   DATA RESOLVE
========================================================= */

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
    "—"
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
      item?.department,
      item?.team,
      item?.area
    ),
    "Sin equipo"
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

function getCreatedAt(item = {}) {
  return first(
    item.createdAt,
    item.created_at,
    item.fechaCreacion,
    item.registeredAt,
    item.updatedAt
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

  const clean = String(raw).trim();

  if (!clean) return "US";

  const parts = clean.split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (initials || clean.slice(0, 2) || "US").toUpperCase();
}

function getUsuarioAvatarUrl(item = {}) {
  return safeText(
    first(
      item?.usuario?.avatar,
      item?.usuario?.avatarUrl,
      item?.profile?.avatar,
      item?.profile?.avatarUrl,
      item?.userAvatar,
      item?.userAvatarUrl,
      item?.avatar,
      item?.avatarUrl,
      item?.photo,
      item?.photoUrl,
      item?.image,
      item?.imageUrl
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
   STATS
========================================================= */

function computeStats(items = []) {
  const list = safeArray(items);

  const totalUsuarios = list.length;

  const activeCount = list.filter((item) => {
    const status = safeLower(getUsuarioStatusValue(item));
    return ["active", "activo", "activa", "enabled", "habilitado"].includes(status);
  }).length;

  const pendingCount = list.filter((item) => {
    const status = safeLower(getUsuarioStatusValue(item));
    return ["pending", "pendiente", "invited", "invitado"].includes(status);
  }).length;

  const adminCount = list.filter((item) => {
    const role = safeLower(getUsuarioRoleValue(item));
    return ["admin", "administrator", "administrador", "superadmin", "super_admin", "root"].includes(role);
  }).length;

  const assignedCount = list.filter((item) => {
    const department = getDepartment(item);
    return department !== "Sin equipo";
  }).length;

  const blockedCount = list.filter((item) => {
    const status = safeLower(getUsuarioStatusValue(item));
    return ["blocked", "bloqueado", "bloqueada", "suspended", "suspendido", "disabled", "inactive", "inactivo", "deshabilitado"].includes(status);
  }).length;

  return {
    totalUsuarios,
    activeCount,
    pendingCount,
    adminCount,
    assignedCount,
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
   HEADER
========================================================= */

export function renderHeader({ items = [], state = {} } = {}) {
  const list = getResolvedItems(items);
  const localState = state || usuariosState || {};
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
              Gestión de usuarios
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
                Supervisa usuarios, estado de acceso, rol operativo, equipo y actividad reciente
                desde una tabla premium orientada a administración y soporte.
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
                      background:var(--accent
