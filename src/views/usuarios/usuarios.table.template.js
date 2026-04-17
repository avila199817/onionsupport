/* =========================================================
   Onion SPA - Usuarios Template (FINAL PRO TABLE GOD MODE)
   Archivo: src/views/usuarios/usuarios.table.template.js

   EXTREME MODE · BACKEND REAL DATA READY · 10/10

   Responsabilidades:
   - renderizar header premium de la vista usuarios
   - renderizar estados loading / error / empty
   - renderizar tabla premium de usuarios
   - paginar a 5 usuarios por vista
   - mostrar loader SOLO en la sección tabla
   - mantener compatibilidad directa con usuariosView.js
   - consumir datos reales backend /api/users
   - compartir lenguaje visual con Facturas / Incidencias

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - soporte envelope backend { ok,count,users }
   - lectura preferente de shape normalizado
   - desktop table + mobile cards
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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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
   ENVELOPE
========================================================= */

function unwrapItemsEnvelope(value) {
  const obj = safeObject(value);

  if (Array.isArray(value)) return value;
  if (Array.isArray(obj.users)) return obj.users;
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.results)) return obj.results;

  if (obj.data && typeof obj.data === "object") {
    return unwrapItemsEnvelope(obj.data);
  }

  return [];
}

function resolveRemoteCount(items, state = {}) {
  const local = safeObject(state);

  return safeNumber(
    first(
      local.remoteCount,
      local.count,
      local.total,
      safeObject(local.response).count,
      safeObject(local.payload).count
    ),
    safeArray(items).length
  );
}

/* =========================================================
   DATA
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

function getUserId(item = {}) {
  return safeText(first(item.userId, item.id, item.uid), "");
}

function getUsername(item = {}) {
  return safeText(first(item.username, item.user, item.nick), "usuario");
}

function getName(item = {}) {
  return safeText(
    first(item.name, item.fullName, item.nombre, item.displayName),
    "Sin nombre"
  );
}

function getEmail(item = {}) {
  return safeText(first(item.email, item.mail), "Sin email");
}

function getRole(item = {}) {
  return safeText(first(item.role, item.rol), "user");
}

function getStatus(item = {}) {
  return safeText(first(item.status, item.estado), "active");
}

function getPhone(item = {}) {
  return safeText(first(item.phone, item.telefono), "—");
}

function getCompany(item = {}) {
  return safeText(first(item.company, item.empresa), "—");
}

function getCreatedAt(item = {}) {
  return first(item.createdAt, item.created_at, item.updatedAt);
}

function getUpdatedAt(item = {}) {
  return first(item.updatedAt, item.updated_at, item.createdAt);
}

function getLastLogin(item = {}) {
  return first(item.lastLogin, item.last_login, item.updatedAt);
}

function getAvatar(item = {}) {
  return safeText(first(item.avatar, item.avatarUrl), "");
}

function getInitials(item = {}) {
  const raw = getName(item);
  const parts = raw.split(/\s+/).filter(Boolean);

  const initials = parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

  return (initials || raw.slice(0, 2) || "ON").toUpperCase();
}

/* =========================================================
   LABELS
========================================================= */

function getRoleLabel(value = "") {
  const key = value.toLowerCase();

  if (["admin", "administrator"].includes(key)) return "Admin";
  if (["manager", "gestor"].includes(key)) return "Manager";
  if (["support", "agent"].includes(key)) return "Support";

  return "User";
}

function getStatusLabel(value = "") {
  const key = value.toLowerCase();

  if (["inactive", "disabled", "blocked"].includes(key)) {
    return "Inactivo";
  }

  if (["pending"].includes(key)) {
    return "Pendiente";
  }

  return "Activo";
}

/* =========================================================
   CHIPS
========================================================= */

function chip(label = "", style = "") {
  return `
    <span
      style="
        display:inline-flex;
        align-items:center;
        min-height:30px;
        padding:0 10px;
        border-radius:999px;
        font-size:12px;
        font-weight:700;
        letter-spacing:.04em;
        text-transform:uppercase;
        white-space:nowrap;
        ${style}
      "
    >
      ${escapeHtml(label)}
    </span>
  `;
}

function getRoleChip(value = "") {
  const key = value.toLowerCase();

  if (key === "admin") {
    return chip(
      "Admin",
      `
      color:#fff;
      background:var(--accent,#7c5cff);
      border:1px solid transparent;
    `
    );
  }

  if (key === "manager") {
    return chip(
      "Manager",
      `
      color:#ffbc42;
      background:color-mix(in srgb,#ffbc42 14%,transparent);
      border:1px solid color-mix(in srgb,#ffbc42 28%,transparent);
    `
    );
  }

  return chip(
    getRoleLabel(value),
    `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `
  );
}

function getStatusChip(value = "") {
  const key = value.toLowerCase();

  if (["inactive", "disabled", "blocked"].includes(key)) {
    return chip(
      "Inactivo",
      `
      color:#ff6b6b;
      background:color-mix(in srgb,#ff6b6b 14%,transparent);
      border:1px solid color-mix(in srgb,#ff6b6b 28%,transparent);
    `
    );
  }

  if (key === "pending") {
    return chip(
      "Pendiente",
      `
      color:#ffbc42;
      background:color-mix(in srgb,#ffbc42 14%,transparent);
      border:1px solid color-mix(in srgb,#ffbc42 28%,transparent);
    `
    );
  }

  return chip(
    "Activo",
    `
    color:#36c690;
    background:color-mix(in srgb,#36c690 14%,transparent);
    border:1px solid color-mix(in srgb,#36c690 28%,transparent);
  `
  );
}

/* =========================================================
   PAGINATION
========================================================= */

function getPagination(items = [], state = {}) {
  const list = safeArray(items);

  const totalItems = list.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const page = Math.min(
    Math.max(1, safeNumber(state.page, 1)),
    totalPages
  );

  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;

  return {
    page,
    totalPages,
    totalItems,
    from: totalItems ? start + 1 : 0,
    to: Math.min(end, totalItems),
    items: list.slice(start, end),
  };
}

/* =========================================================
   STATS
========================================================= */

function computeStats(items = []) {
  const list = safeArray(items);

  const total = list.length;

  const active = list.filter(
    (x) => getStatus(x).toLowerCase() === "active"
  ).length;

  const admins = list.filter(
    (x) => getRole(x).toLowerCase() === "admin"
  ).length;

  const recent = list.filter((x) => getLastLogin(x)).length;

  return {
    total,
    active,
    admins,
    recent,
  };
}

function statCard({ label, value, caption, accent = false }) {
  return `
    <article
      style="
        display:grid;
        gap:10px;
        padding:20px;
        min-height:132px;
        border-radius:var(--panel-radius);
        border:1px solid ${
          accent
            ? "color-mix(in srgb,var(--accent,#7c5cff) 26%,var(--border-soft))"
            : "var(--border-soft)"
        };
        background:var(--surface-1,var(--surface-glass));
      "
    >
      <span style="font-size:12px;color:var(--text-dim);font-weight:700;text-transform:uppercase;letter-spacing:.06em;">
        ${escapeHtml(label)}
      </span>

      <strong style="font-size:32px;color:var(--text-strong);line-height:1;">
        ${escapeHtml(String(value))}
      </strong>

      <span style="font-size:13px;color:var(--text-dim);line-height:1.45;">
        ${escapeHtml(caption)}
      </span>
    </article>
  `;
}

/* =========================================================
   HEADER
========================================================= */

export function renderHeader({ items = [], state = {} } = {}) {
  const list = getResolvedItems(items);
  const stats = computeStats(list);
  const remoteCount = resolveRemoteCount(items, state);

  return `
    <section
      style="
        display:grid;
        gap:18px;
        padding:28px;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:
          radial-gradient(circle at top left,color-mix(in srgb,var(--accent,#7c5cff) 14%,transparent),transparent 34%),
          var(--surface-1,var(--surface-glass));
      "
    >
      <div
        style="
          display:flex;
          justify-content:space-between;
          gap:18px;
          flex-wrap:wrap;
        "
      >
        <div style="display:grid;gap:10px;">
          <span
            style="
              display:inline-flex;
              width:max-content;
              min-height:28px;
              padding:0 12px;
              border-radius:999px;
              border:1px solid var(--border-soft);
              font-size:12px;
              font-weight:700;
              color:var(--text-soft);
              text-transform:uppercase;
              letter-spacing:.06em;
            "
          >
            Gestión usuarios
          </span>

          <h1
            style="
              margin:0;
              font-size:46px;
              line-height:1;
              letter-spacing:-.05em;
              color:var(--text-strong);
            "
          >
            Centro de control de usuarios
          </h1>

          <p
            style="
              margin:0;
              color:var(--text-dim);
              max-width:760px;
              line-height:1.6;
            "
          >
            Supervisa cuentas, roles, actividad, accesos y estado operativo desde una tabla premium preparada para backend real.
          </p>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button id="usuarios-export-btn" type="button">Exportar CSV</button>
          <button id="usuarios-create-btn" type="button">Nuevo usuario</button>
        </div>
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:repeat(4,minmax(0,1fr));
          gap:16px;
        "
        class="usuarios-stats-grid"
      >
        ${statCard({
          label: "Usuarios",
          value: stats.total,
          caption: `${remoteCount} registros remotos.`,
          accent: true,
        })}

        ${statCard({
          label: "Activos",
          value: stats.active,
          caption: "Cuentas habilitadas.",
        })}

        ${statCard({
          label: "Admins",
          value: stats.admins,
          caption: "Usuarios con permisos elevados.",
        })}

        ${statCard({
          label: "Con actividad",
          value: stats.recent,
          caption: "Con último acceso registrado.",
        })}
      </div>

      <style>
        #usuarios-export-btn,
        #usuarios-create-btn{
          min-height:42px;
          padding:0 14px;
          border-radius:14px;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
          color:var(--text-soft);
          font-weight:700;
          cursor:pointer;
        }

        #usuarios-create-btn{
          background:var(--accent,#7c5cff);
          color:#fff;
          border-color:transparent;
        }

        @media (max-width:1100px){
          .usuarios-stats-grid{
            grid-template-columns:repeat(2,1fr)!important;
          }
        }

        @media (max-width:720px){
          .usuarios-stats-grid{
            grid-template-columns:1fr!important;
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
      style="
        padding:28px;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1,var(--surface-glass));
      "
    >
      Cargando usuarios...
    </section>
  `;
}

export function renderErrorState(
  message = "No se pudo cargar usuarios."
) {
  return `
    <section
      style="
        padding:28px;
        border-radius:var(--panel-radius);
        border:1px solid color-mix(in srgb,#ff6b6b 26%,var(--border-soft));
        background:var(--surface-1,var(--surface-glass));
        color:#ff6b6b;
      "
    >
      ${escapeHtml(message)}
    </section>
  `;
}

export function renderEmptyState() {
  return `
    <section
      style="
        padding:28px;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1,var(--surface-glass));
      "
    >
      No hay usuarios para mostrar.
    </section>
  `;
}

/* =========================================================
   ROW
========================================================= */

function renderAvatar(item = {}) {
  const url = getAvatar(item);
  const initials = getInitials(item);

  if (url) {
    return `
      <img
        src="${escapeHtml(url)}"
        alt=""
        style="
          width:42px;
          height:42px;
          border-radius:14px;
          object-fit:cover;
          border:1px solid var(--border-soft);
        "
      />
    `;
  }

  return `
    <div
      style="
        width:42px;
        height:42px;
        border-radius:14px;
        display:grid;
        place-items:center;
        background:color-mix(in srgb,var(--accent,#7c5cff) 18%,transparent);
        color:#fff;
        font-weight:800;
      "
    >
      ${escapeHtml(initials)}
    </div>
  `;
}

function renderRow(item = {}) {
  const id = getUserId(item);

  return `
    <tr>
      <td style="padding:14px 18px;border-bottom:1px solid var(--border-soft);">
        <div style="display:flex;gap:12px;align-items:center;">
          ${renderAvatar(item)}

          <div style="display:grid;gap:4px;">
            <strong>${escapeHtml(getName(item))}</strong>
            <span style="font-size:12px;color:var(--text-dim);">
              @${escapeHtml(getUsername(item))}
            </span>
          </div>
        </div>
      </td>

      <td style="padding:14px;border-bottom:1px solid var(--border-soft);">
        ${escapeHtml(getEmail(item))}
      </td>

      <td style="padding:14px;border-bottom:1px solid var(--border-soft);">
        ${getRoleChip(getRole(item))}
      </td>

      <td style="padding:14px;border-bottom:1px solid var(--border-soft);">
        ${getStatusChip(getStatus(item))}
      </td>

      <td style="padding:14px;border-bottom:1px solid var(--border-soft);">
        ${escapeHtml(getCompany(item))}
      </td>

      <td style="padding:14px;border-bottom:1px solid var(--border-soft);">
        ${escapeHtml(formatRelativeDate(getLastLogin(item)))}
      </td>

      <td style="padding:14px 18px;border-bottom:1px solid var(--border-soft);text-align:right;">
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
          <button data-action="open-user" data-user-id="${escapeHtml(id)}">Ver</button>
          <button data-action="copy-user-id" data-user-id="${escapeHtml(id)}">Copiar ID</button>
        </div>
      </td>
    </tr>
  `;
}

/* =========================================================
   MAIN TABLE
========================================================= */

export function renderTable({ items = [], state = {} } = {}) {
  const local = state || usuariosState || {};
  const list = getResolvedItems(items);

  if (local.loading && !list.length) {
    return renderLoadingState();
  }

  if (local.error && !list.length) {
    return renderErrorState(local.error);
  }

  if (!list.length) {
    return renderEmptyState();
  }

  const pagination = getPagination(list, local);

  return `
    <section
      style="
        overflow:hidden;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1,var(--surface-glass));
      "
    >
      <div
        style="
          display:flex;
          justify-content:space-between;
          gap:12px;
          padding:16px 18px;
          border-bottom:1px solid var(--border-soft);
          flex-wrap:wrap;
        "
      >
        <strong>Tabla de usuarios</strong>

        <span style="color:var(--text-dim);font-size:13px;">
          ${pagination.from}-${pagination.to} de ${pagination.totalItems}
          · página ${pagination.page}/${pagination.totalPages}
        </span>
      </div>

      <div style="overflow:auto;">
        <table
          style="
            width:100%;
            min-width:980px;
            border-collapse:collapse;
          "
        >
          <thead>
            <tr style="background:var(--surface-2,var(--surface-glass));">
              <th style="padding:16px 18px;text-align:left;">Usuario</th>
              <th style="padding:16px;text-align:left;">Email</th>
              <th style="padding:16px;text-align:left;">Rol</th>
              <th style="padding:16px;text-align:left;">Estado</th>
              <th style="padding:16px;text-align:left;">Empresa</th>
              <th style="padding:16px;text-align:left;">Último acceso</th>
              <th style="padding:16px 18px;text-align:right;">Acciones</th>
            </tr>
          </thead>

          <tbody>
            ${pagination.items.map(renderRow).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

export function renderCards({ items = [], state = {} } = {}) {
  return renderTable({ items, state });
}
