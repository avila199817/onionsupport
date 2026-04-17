/* =========================================================
   Onion SPA - Clientes Template (FINAL PRO TABLE GOD MODE)
   Archivo: src/views/clientes/clientes.table.template.js

   EXTREME MODE · BACKEND REAL DATA READY · 10/10

   Responsabilidades:
   - renderizar header premium de la vista
   - renderizar estados loading / error / empty
   - renderizar tabla premium de clientes
   - paginar a 5 clientes por vista
   - mostrar loader SOLO en la sección de tabla
   - mostrar estado visual al abrir cliente lento
   - mantener compatibilidad directa con clientesView.js
   - consumir datos reales del backend /api/clientes
   - compartir lenguaje visual y densidad con Facturas

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - soporte para envelope backend { ok, count, clientes }
   - lectura preferente del shape normalizado del backend
   - mismo lenguaje visual que Facturas
   - toolbar / skeleton / mobile cards consistentes
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
      return "Activo";

    case "pending":
    case "pendiente":
      return "Pendiente";

    case "blocked":
    case "bloqueado":
    case "bloqueada":
      return "Bloqueado";

    case "disabled":
    case "inactive":
    case "inactivo":
    case "deshabilitado":
      return "Deshabilitado";

    default:
      return safeText(value, "Activo");
  }
}

function getTierLabel(value = "") {
  const key = String(value || "").trim().toLowerCase();

  switch (key) {
    case "vip":
      return "VIP";

    case "enterprise":
      return "Enterprise";

    case "pro":
    case "premium":
      return "Pro";

    case "starter":
    case "basic":
    case "basico":
    case "básico":
      return "Starter";

    default:
      return safeText(value, "Estándar");
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

  if (["pending", "pendiente"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["blocked", "bloqueado", "bloqueada"].includes(key)) {
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

function getTierChipStyle(value = "") {
  const key = String(value || "").trim().toLowerCase();

  if (["vip"].includes(key)) {
    return `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
    `;
  }

  if (["enterprise"].includes(key)) {
    return `
      color:#b388ff;
      background:color-mix(in srgb, #b388ff 14%, transparent);
      border:1px solid color-mix(in srgb, #b388ff 26%, transparent);
    `;
  }

  if (["pro", "premium"].includes(key)) {
    return `
      color:#60a5fa;
      background:color-mix(in srgb, #60a5fa 14%, transparent);
      border:1px solid color-mix(in srgb, #60a5fa 26%, transparent);
    `;
  }

  if (["starter", "basic", "basico", "básico"].includes(key)) {
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
    "—"
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
  return safeText(first(item.status, item.estado, item.state), "active");
}

function getClienteTierValue(item = {}) {
  return safeText(
    first(item.tier, item.plan, item.segment, item.category, item.tipo),
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

function getUpdatedAt(item = {}) {
  return first(item.updatedAt, item.lastContactAt, item.modifiedAt, item.createdAt);
}

function getCreatedAt(item = {}) {
  return first(item.createdAt, item.createdAtES, item.registeredAt, item.updatedAt);
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

  const clean = String(raw).trim();

  if (!clean) return "CL";

  const parts = clean.split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (initials || clean.slice(0, 2) || "CL").toUpperCase();
}

function getClienteAvatarUrl(item = {}) {
  return safeText(
    first(
      item?.cliente?.avatar,
      item?.cliente?.avatarUrl,
      item?.profile?.avatar,
      item?.profile?.avatarUrl,
      item?.clientAvatar,
      item?.clientAvatarUrl,
      item?.avatar,
      item?.avatarUrl,
      item?.logo,
      item?.logoUrl
    ),
    ""
  );
}

function getAvatarToneSeed(item = {}) {
  return safeText(
    first(
      getClienteId(item),
      getClienteName(item),
      getClienteEmail(item),
      getClienteCode(item)
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

  const totalClientes = list.length;

  const activeCount = list.filter((item) => {
    const status = safeLower(getClienteStatusValue(item));
    return ["active", "activo", "activa"].includes(status);
  }).length;

  const pendingCount = list.filter((item) => {
    const status = safeLower(getClienteStatusValue(item));
    return ["pending", "pendiente"].includes(status);
  }).length;

  const vipCount = list.filter((item) => {
    const tier = safeLower(getClienteTierValue(item));
    return ["vip", "enterprise"].includes(tier);
  }).length;

  const assignedCount = list.filter((item) => {
    const manager = getManager(item);
    return manager !== "No asignado";
  }).length;

  const blockedCount = list.filter((item) => {
    const status = safeLower(getClienteStatusValue(item));
    return ["blocked", "bloqueado", "bloqueada", "disabled", "inactive", "inactivo", "deshabilitado"].includes(status);
  }).length;

  return {
    totalClientes,
    activeCount,
    pendingCount,
    vipCount,
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
      class="clientes-stat-card panel-surface"
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
  const localState = state || clientesState || {};
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
      class="clientes-hero"
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
              Gestión comercial
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
                Centro de control de clientes
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
                Supervisa cuentas, estado comercial, nivel de servicio, responsables y
                tiempos de actualización desde una tabla premium orientada a operación.
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
              id="clientes-export-btn"
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
              id="clientes-create-btn"
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
              ${creating ? "Creando..." : "Nuevo cliente"}
            </button>
          </div>
        </div>

        <div
          class="clientes-hero-meta"
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
                      background:var(--accent, #7c5cff);
                      box-shadow:0 0 0 0 color-mix(in srgb, var(--accent, #7c5cff) 30%, transparent);
                      animation:clientesPulse 1.35s ease-in-out infinite;
                    "
                  ></span>
                  Sincronizando
                </span>
              `
              : ""
          }
        </div>

        <div
          class="clientes-hero-stats"
          style="
            display:grid;
            grid-template-columns:repeat(4, minmax(0, 1fr));
            gap:var(--space-md);
          "
        >
          ${renderStatCard({
            label: "Clientes visibles",
            value: String(stats.totalClientes),
            caption: `${remoteCount} registros totales cargados en la colección.`,
            accent: true,
          })}

          ${renderStatCard({
            label: "Activos",
            value: String(stats.activeCount),
            caption: "Cuentas operativas en seguimiento normal.",
          })}

          ${renderStatCard({
            label: "Pendientes / VIP",
            value: `${stats.pendingCount} / ${stats.vipCount}`,
            caption: "Balance rápido entre onboarding y cuentas prioritarias.",
          })}

          ${renderStatCard({
            label: "Asignados / bloqueados",
            value: `${stats.assignedCount} / ${stats.blockedCount}`,
            caption: "Cobertura comercial y cuentas con fricción operativa.",
          })}
        </div>
      </div>

      <style>
        @keyframes clientesPulse {
          0% { transform:scale(.92); opacity:.75; }
          50% { transform:scale(1.08); opacity:1; }
          100% { transform:scale(.92); opacity:.75; }
        }

        @media (max-width: 1100px) {
          .clientes-hero-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 720px) {
          .clientes-hero-stats {
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
      class="panel-surface clientes-table-shell"
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
        <div style="min-width:1120px;">
          <div
            style="
              display:grid;
              grid-template-columns: 2.2fr .85fr .85fr .9fr 1.05fr 1fr 1fr .95fr;
              gap:0;
              border-bottom:1px solid var(--border-soft);
              background:var(--surface-2, var(--surface-glass));
            "
          >
            ${Array.from({ length: 8 })
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
                        animation:clientesSkeleton 1.25s linear infinite;
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
                    grid-template-columns: 2.2fr .85fr .85fr .9fr 1.05fr 1fr 1fr .95fr;
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
                          animation:clientesSkeleton 1.25s linear infinite;
                        "
                      ></div>
                      <div style="display:grid; gap:8px; flex:1;">
                        <div style="height:14px; width:140px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:clientesSkeleton 1.25s linear infinite;"></div>
                        <div style="height:12px; width:220px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:clientesSkeleton 1.25s linear infinite;"></div>
                        <div style="height:12px; width:170px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:clientesSkeleton 1.25s linear infinite;"></div>
                      </div>
                    </div>
                  </div>

                  <div style="padding:16px 18px;"><div style="height:34px; width:96px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:clientesSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:16px 18px;"><div style="height:34px; width:92px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:clientesSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:16px 18px;"><div style="height:14px; width:86px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:clientesSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:16px 18px;"><div style="height:14px; width:116px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:clientesSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:16px 18px;"><div style="height:14px; width:92px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:clientesSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:16px 18px;"><div style="height:14px; width:92px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:clientesSkeleton 1.25s linear infinite;"></div></div>

                  <div style="padding:16px 18px;">
                    <div style="display:flex; gap:8px; justify-content:flex-end;">
                      <div style="height:38px; width:82px; border-radius:12px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:clientesSkeleton 1.25s linear infinite;"></div>
                    </div>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>

      <style>
        @keyframes clientesSkeleton {
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
      class="panel-surface clientes-error-state"
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
          No se pudo renderizar la vista de clientes
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
          id="clientes-retry-btn"
          type="button"
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
      class="panel-surface clientes-empty-state"
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
          No hay clientes para mostrar
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
          Todavía no hay clientes disponibles en la colección actual.
        </p>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button
          id="clientes-create-btn"
          type="button"
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
          Crear cliente
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
} = {}) {
  return `
    <div
      class="clientes-table-toolbar"
      style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:14px;
        padding:16px 18px;
        border-bottom:1px solid var(--border-soft);
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 6%, transparent), transparent),
          var(--surface-1, var(--surface-glass));
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
          Tabla de clientes
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
                    animation:clientesPulse 1.25s ease-in-out infinite;
                  "
                ></span>
                Actualizando
              </span>
            `
            : ""
        }

        <button
          type="button"
          data-action="prev-page"
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
          data-action="next-page"
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
  `;
}

/* =========================================================
   AVATAR
========================================================= */

function renderIdentityAvatar({
  avatarUrl = "",
  initials = "CL",
  seed = "onion",
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

function renderOpenClienteButton({ clienteId = "", isOpening = false } = {}) {
  return `
    <button
      type="button"
      data-action="open-cliente"
      data-cliente-id="${escapeHtml(clienteId)}"
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
                  animation:clientesSpin .8s linear infinite;
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

function renderClienteRow(item = {}, state = {}) {
  const localState = safeObject(state);
  const openingClienteId = safeText(localState?.openingClienteId, "");
  const clienteId = getClienteId(item);
  const code = getClienteCode(item);
  const name = getClienteName(item);
  const preview = truncate(getClientePhone(item), 96);
  const email = getClienteEmail(item);
  const statusValue = getClienteStatusValue(item);
  const tierValue = getClienteTierValue(item);
  const status = getStatusLabel(statusValue);
  const tier = getTierLabel(tierValue);
  const manager = getManager(item);
  const updatedAtRaw = getUpdatedAt(item);
  const createdAtRaw = getCreatedAt(item);
  const updatedAt = formatRelativeDate(updatedAtRaw);
  const updatedAtDate = formatDate(updatedAtRaw);
  const createdAt = formatDate(createdAtRaw);
  const initials = getClienteInitials(item);
  const avatarUrl = getClienteAvatarUrl(item);
  const avatarSeed = getAvatarToneSeed(item);
  const isOpening = Boolean(openingClienteId && openingClienteId === clienteId);

  return `
    <tr
      class="clientes-row ${isOpening ? "is-opening" : ""}"
      data-cliente-id="${escapeHtml(clienteId)}"
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
              data-action="open-cliente"
              data-cliente-id="${escapeHtml(clienteId)}"
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
              title="Abrir detalle de cliente"
            >
              ${escapeHtml(code)}
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
              ${escapeHtml(name)}
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
          white-space:nowrap;
        "
      >
        ${renderStatusChip(status, getStatusChipStyle(statusValue))}
      </td>

      <td
        style="
          padding:14px 14px;
          border-bottom:1px solid var(--border-soft);
          vertical-align:middle;
          white-space:nowrap;
        "
      >
        ${renderStatusChip(tier, getTierChipStyle(tierValue))}
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
        "
      >
        <div style="display:grid; gap:4px; min-width:170px;">
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
            ${escapeHtml(getClientePhone(item))}
          </span>
        </div>
      </td>

      <td
        style="
          padding:14px 14px;
          border-bottom:1px solid var(--border-soft);
          vertical-align:middle;
        "
      >
        <div style="display:grid; gap:4px; min-width:120px;">
          <strong
            style="
              color:var(--text-strong);
              font-size:13px;
              line-height:1.2;
              word-break:break-word;
            "
          >
            ${escapeHtml(manager)}
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
            Responsable
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
            ${escapeHtml(updatedAt)}
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
            ${escapeHtml(updatedAtDate)}
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
          ${renderOpenClienteButton({ clienteId, isOpening })}

          <button
            type="button"
            data-action="copy-cliente-id"
            data-cliente-id="${escapeHtml(clienteId)}"
            data-cliente-code="${escapeHtml(code)}"
            style="
              min-height:38px;
              padding:0 12px;
              border-radius:12px;
              border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
              background:var(--btn-primary-bg, var(--accent, #7c5cff));
              color:var(--btn-primary-text, #fff);
              font-weight:var(--weight-bold);
              cursor:pointer;
              white-space:nowrap;
            "
          >
            Copiar ID
          </button>
        </div>
      </td>
    </tr>
  `;
}

function renderMobileClienteCard(item = {}, state = {}) {
  const localState = safeObject(state);
  const openingClienteId = safeText(localState?.openingClienteId, "");
  const clienteId = getClienteId(item);
  const code = getClienteCode(item);
  const name = getClienteName(item);
  const preview = truncate(getClientePhone(item), 120);
  const email = getClienteEmail(item);
  const statusValue = getClienteStatusValue(item);
  const tierValue = getClienteTierValue(item);
  const status = getStatusLabel(statusValue);
  const tier = getTierLabel(tierValue);
  const manager = getManager(item);
  const updatedAt = formatRelativeDate(getUpdatedAt(item));
  const createdAt = formatDate(getCreatedAt(item));
  const initials = getClienteInitials(item);
  const avatarUrl = getClienteAvatarUrl(item);
  const avatarSeed = getAvatarToneSeed(item);
  const isOpening = Boolean(openingClienteId && openingClienteId === clienteId);

  return `
    <article
      class="clientes-mobile-card panel-surface"
      data-cliente-id="${escapeHtml(clienteId)}"
      style="
        display:grid;
        gap:16px;
        padding:18px;
        border-radius:18px;
        border:1px solid var(--border-soft);
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
              data-action="open-cliente"
              data-cliente-id="${escapeHtml(clienteId)}"
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
              ${escapeHtml(code)}
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
              ${escapeHtml(name)}
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
          ${renderStatusChip(status, getStatusChipStyle(statusValue))}
          ${renderStatusChip(tier, getTierChipStyle(tierValue))}
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
          <strong style="color:var(--text-strong); font-size:var(--font-sm);">
            ${escapeHtml(email)}
          </strong>
          <span style="color:var(--text-dim); font-size:12px; line-height:1.35;">
            ${escapeHtml(getClientePhone(item))}
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
            Responsable
          </span>
          <strong style="color:var(--text-strong); font-size:var(--font-sm);">
            ${escapeHtml(manager)}
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
            Actualizada
          </span>
          <strong style="color:var(--text-strong); font-size:var(--font-sm);">
            ${escapeHtml(updatedAt)}
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
        ${renderOpenClienteButton({ clienteId, isOpening })}

        <button
          type="button"
          data-action="copy-cliente-id"
          data-cliente-id="${escapeHtml(clienteId)}"
          data-cliente-code="${escapeHtml(code)}"
          style="
            min-height:38px;
            padding:0 12px;
            border-radius:12px;
            border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
            background:var(--btn-primary-bg, var(--accent, #7c5cff));
            color:var(--btn-primary-text, #fff);
            font-weight:var(--weight-bold);
            cursor:pointer;
          "
        >
          Copiar ID
        </button>
      </div>
    </article>
  `;
}

function renderDesktopTable(items = [], state = {}) {
  return `
    <div
      class="clientes-table-scroll"
      style="
        width:100%;
        overflow:auto;
      "
    >
      <table
        class="clientes-table"
        style="
          width:100%;
          min-width:1120px;
          border-collapse:separate;
          border-spacing:0;
          table-layout:fixed;
        "
      >
        <colgroup>
          <col style="width:31%">
          <col style="width:10%">
          <col style="width:10%">
          <col style="width:11%">
          <col style="width:14%">
          <col style="width:12%">
          <col style="width:12%">
          <col style="width:14%">
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
              Cliente / detalle
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
              Nivel
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
              Alta
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
              Contacto
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
              Responsable
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
              Actualización
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
            .map((item) => renderClienteRow(item, state))
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMobileCards(items = [], state = {}) {
  return `
    <div
      class="clientes-mobile-list"
      style="
        display:none;
        gap:14px;
        padding:14px;
      "
    >
      ${safeArray(items)
        .map((item) => renderMobileClienteCard(item, state))
        .join("")}
    </div>
  `;
}

function renderTableLoadingOverlay(message = "Actualizando clientes...") {
  return `
    <div
      class="clientes-table-overlay"
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
            animation:clientesSpin .8s linear infinite;
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
   MAIN
========================================================= */

export function renderTable({ items = [], state = {} } = {}) {
  const localState = state || clientesState || {};
  const list = getResolvedItems(items);
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
      class="clientes-table-wrap panel-surface"
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
      })}

      <div class="clientes-desktop-table">
        ${renderDesktopTable(pagination.items, localState)}
      </div>

      ${renderMobileCards(pagination.items, localState)}

      ${refreshing ? renderTableLoadingOverlay("Actualizando clientes...") : ""}

      <style>
        @keyframes clientesSpin {
          to { transform:rotate(360deg); }
        }

        .clientes-table tbody tr:hover {
          background: color-mix(in srgb, var(--accent, #7c5cff) 4%, transparent);
        }

        .clientes-table tbody tr:last-child td {
          border-bottom: none;
        }

        .clientes-table tbody tr.is-opening:hover {
          background: color-mix(in srgb, var(--warning-strong, #ffbc42) 5%, transparent);
        }

        .clientes-table-scroll::-webkit-scrollbar {
          height: 10px;
          width: 10px;
        }

        .clientes-table-scroll::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--accent, #7c5cff) 20%, var(--border-soft));
          border-radius: 999px;
        }

        .clientes-table-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .clientes-table img + span {
          display:none;
        }

        .clientes-table [data-avatar-fallback="true"] > img {
          display:none !important;
        }

        .clientes-table [data-avatar-fallback="true"] > span {
          display:grid !important;
        }

        .clientes-mobile-list [data-avatar-fallback="true"] > img {
          display:none !important;
        }

        .clientes-mobile-list [data-avatar-fallback="true"] > span {
          display:grid !important;
        }

        @media (max-width: 980px) {
          .clientes-desktop-table {
            display: none !important;
          }

          .clientes-mobile-list {
            display: grid !important;
          }
        }
      </style>
    </section>
  `;
}

export function renderCards({ items = [], state = {} } = {}) {
  return renderTable({ items, state });
}
