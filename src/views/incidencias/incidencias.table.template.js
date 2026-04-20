/* =========================================================
   Onion SPA - Incidencias Template (CLIENT EXPERIENCE MODE)
   Archivo: src/views/incidencias/incidencias.table.template.js

   FINAL PRO TABLE · CLIENT FIRST EDITION · 10/10

   Responsabilidades:
   - renderizar header premium orientado a clientes/usuarios
   - renderizar estados loading / error / empty
   - renderizar tabla premium de incidencias con lenguaje claro
   - paginar a 5 incidencias por vista
   - mostrar loader SOLO en la sección de tabla
   - mostrar estado visual al abrir ticket lento
   - mantener compatibilidad directa con incidenciasView.js
   - consumir datos reales del backend /api/tickets
   - priorizar claridad, confianza y seguimiento para cliente final

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - soporte para envelope backend { ok, count, tickets }
   - lectura preferente del shape normalizado del backend
   - lenguaje menos técnico y más humano
   - toolbar / skeleton / mobile cards consistentes
========================================================= */

import { incidenciasState } from "./incidencias.state.js";

import {
  getIncidencias,
  sortIncidenciasByUpdatedDesc,
} from "./incidencias.store.js";

import {
  escapeHtml,
  formatDate,
  formatRelativeDate,
  truncate,
} from "./incidencias.utils.js";

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

function looksLikeTicketsEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    Array.isArray(obj?.tickets) ||
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

  if (Array.isArray(obj?.tickets)) {
    return obj.tickets;
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

  if (looksLikeTicketsEnvelope(obj?.data)) {
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
    case "open":
    case "abierta":
    case "abierto":
      return "Recibida";

    case "pending":
    case "pendiente":
      return "Pendiente";

    case "in_progress":
    case "in-progress":
    case "progress":
    case "en_proceso":
    case "en proceso":
      return "En revisión";

    case "resolved":
    case "resuelta":
    case "resuelto":
      return "Resuelta";

    case "closed":
    case "cerrada":
    case "cerrado":
      return "Cerrada";

    default:
      return safeText(value, "Recibida");
  }
}

function getPriorityLabel(value = "") {
  const key = String(value || "").trim().toLowerCase();

  switch (key) {
    case "low":
    case "baja":
      return "Baja";

    case "medium":
    case "media":
    case "normal":
      return "Media";

    case "high":
    case "alta":
      return "Alta";

    case "urgent":
    case "urgente":
    case "critical":
    case "critica":
    case "crítica":
      return "Urgente";

    default:
      return safeText(value, "Media");
  }
}

/* =========================================================
   CHIPS
========================================================= */

function getStatusChipStyle(value = "") {
  const key = String(value || "").trim().toLowerCase();

  if (["open", "abierta", "abierto"].includes(key)) {
    return `
      color:var(--accent-strong, var(--accent, #7c5cff));
      background:color-mix(in srgb, var(--accent, #7c5cff) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 26%, transparent);
    `;
  }

  if (["pending", "pendiente"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (
    ["in_progress", "in-progress", "progress", "en_proceso", "en proceso"].includes(
      key
    )
  ) {
    return `
      color:#7dd3fc;
      background:color-mix(in srgb, #7dd3fc 14%, transparent);
      border:1px solid color-mix(in srgb, #7dd3fc 26%, transparent);
    `;
  }

  if (["resolved", "resuelta", "resuelto"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["closed", "cerrada", "cerrado"].includes(key)) {
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

function getPriorityChipStyle(value = "") {
  const key = String(value || "").trim().toLowerCase();

  if (["low", "baja"].includes(key)) {
    return `
      color:var(--success-strong, #36c690);
      background:color-mix(in srgb, var(--success-strong, #36c690) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, transparent);
    `;
  }

  if (["medium", "media", "normal"].includes(key)) {
    return `
      color:#60a5fa;
      background:color-mix(in srgb, #60a5fa 14%, transparent);
      border:1px solid color-mix(in srgb, #60a5fa 26%, transparent);
    `;
  }

  if (["high", "alta"].includes(key)) {
    return `
      color:var(--warning-strong, #ffbc42);
      background:color-mix(in srgb, var(--warning-strong, #ffbc42) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--warning-strong, #ffbc42) 26%, transparent);
    `;
  }

  if (["urgent", "urgente", "critical", "critica", "crítica"].includes(key)) {
    return `
      color:var(--danger-strong, #ff6b6b);
      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 14%, transparent);
      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, transparent);
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
    return sortIncidenciasByUpdatedDesc(direct);
  }

  const fromEnvelope = unwrapItemsEnvelope(items);

  if (fromEnvelope.length) {
    return sortIncidenciasByUpdatedDesc(fromEnvelope);
  }

  try {
    return sortIncidenciasByUpdatedDesc(getIncidencias());
  } catch {
    return [];
  }
}

function getTicketId(item = {}) {
  return safeText(first(item.ticketId, item.id, item.code), "");
}

function getTicketCode(item = {}) {
  return safeText(
    first(item.ticketId, item.id, item.code, item.ticketCode),
    "—"
  );
}

function getClientName(item = {}) {
  return safeText(
    first(
      item?.cliente?.nombre,
      item?.cliente?.name,
      item.client,
      item.clientName,
      item.cliente,
      item.empresa,
      item.company,
      item.name,
      item?.receptor?.name,
      item?.createdBy?.name
    ),
    "Cliente"
  );
}

function getClientEmail(item = {}) {
  return safeText(
    first(
      item?.cliente?.email,
      item.clientEmail,
      item.email,
      item.clienteEmail,
      item?.receptor?.email,
      item?.createdBy?.email
    ),
    "Sin email"
  );
}

function getTitle(item = {}) {
  return safeText(
    first(item.subject, item.title, item.asunto, item.name),
    "Incidencia sin asunto"
  );
}

function getPreview(item = {}) {
  return safeText(
    first(item.preview, item.descripcion, item.description, item.message),
    "Sin descripción"
  );
}

function getStatusValue(item = {}) {
  return safeText(first(item.status, item.estado), "open");
}

function getPriorityValue(item = {}) {
  return safeText(first(item.priority, item.prioridad), "medium");
}

function getAssigned(item = {}) {
  return safeText(
    first(
      item?.tecnico?.name,
      item?.assignedTo?.name,
      item?.assignedTo,
      item?.assignee,
      item?.tecnico,
      item?.meta?.assignedTo
    ),
    "Equipo de soporte"
  );
}

function getUpdatedAt(item = {}) {
  return first(item.updatedAt, item.closedAt, item.createdAt);
}

function getCreatedAt(item = {}) {
  return first(item.createdAt, item.createdAtES, item.updatedAt);
}

function getClientInitials(item = {}) {
  const raw =
    item?.clientInitials ||
    item?.cliente?.nombre ||
    item?.cliente?.name ||
    item?.client ||
    item?.clientName ||
    item?.cliente ||
    item?.empresa ||
    item?.company ||
    item?.name ||
    "ON";

  const clean = String(raw).trim();

  if (!clean) return "ON";

  const parts = clean.split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (initials || clean.slice(0, 2) || "ON").toUpperCase();
}

function getClientAvatarUrl(item = {}) {
  return safeText(
    first(
      item?.cliente?.avatar,
      item?.cliente?.avatarUrl,
      item?.clientAvatar,
      item?.clientAvatarUrl,
      item?.avatar,
      item?.avatarUrl,
      item?.createdBy?.avatar,
      item?.createdBy?.avatarUrl,
      item?.receptor?.avatar,
      item?.receptor?.avatarUrl
    ),
    ""
  );
}

function getAvatarToneSeed(item = {}) {
  return safeText(
    first(
      getTicketId(item),
      getClientName(item),
      getClientEmail(item),
      getTicketCode(item)
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

  const totalIncidencias = list.length;

  const openCount = list.filter((item) => {
    const status = safeLower(getStatusValue(item));
    return ["open", "abierta", "abierto"].includes(status);
  }).length;

  const inProgressCount = list.filter((item) => {
    const status = safeLower(getStatusValue(item));
    return [
      "pending",
      "pendiente",
      "in_progress",
      "in-progress",
      "progress",
      "en_proceso",
      "en proceso",
    ].includes(status);
  }).length;

  const urgentCount = list.filter((item) => {
    const priority = safeLower(getPriorityValue(item));
    return ["urgent", "urgente", "critical", "critica", "crítica"].includes(
      priority
    );
  }).length;

  const resolvedCount = list.filter((item) => {
    const status = safeLower(getStatusValue(item));
    return ["resolved", "resuelta", "resuelto"].includes(status);
  }).length;

  const closedCount = list.filter((item) => {
    const status = safeLower(getStatusValue(item));
    return ["closed", "cerrada", "cerrado"].includes(status);
  }).length;

  return {
    totalIncidencias,
    openCount,
    inProgressCount,
    urgentCount,
    resolvedCount,
    closedCount,
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
      class="incidencias-stat-card panel-surface"
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
  const localState = state || incidenciasState || {};
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
      class="incidencias-hero"
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
              Ayuda y seguimiento
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
                Tus incidencias y solicitudes
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
                Consulta el estado de tus incidencias, revisa las actualizaciones más recientes
                y crea nuevas solicitudes desde una vista clara, cercana y fácil de seguir.
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
              id="incidencias-export-btn"
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
              Exportar historial
            </button>

            <button
              id="incidencias-create-btn"
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
              ${creating ? "Abriendo..." : "Crear nueva incidencia"}
            </button>
          </div>
        </div>

        <div
          class="incidencias-hero-meta"
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
            ${escapeHtml(String(remoteCount))} solicitudes registradas
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
            Última actualización · ${escapeHtml(lastSyncText)}
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
                      animation:incidenciasPulse 1.35s ease-in-out infinite;
                    "
                  ></span>
                  Actualizando
                </span>
              `
              : ""
          }
        </div>

        <div
          class="incidencias-hero-stats"
          style="
            display:grid;
            grid-template-columns:repeat(4, minmax(0, 1fr));
            gap:var(--space-md);
          "
        >
          ${renderStatCard({
            label: "Total visible",
            value: String(stats.totalIncidencias),
            caption: `${remoteCount} incidencias disponibles en tu historial actual.`,
            accent: true,
          })}

          ${renderStatCard({
            label: "Recibidas",
            value: String(stats.openCount),
            caption: "Casos que ya hemos recibido y están pendientes de atención.",
          })}

          ${renderStatCard({
            label: "En revisión / urgentes",
            value: `${stats.inProgressCount} / ${stats.urgentCount}`,
            caption: "Seguimiento activo y solicitudes con prioridad alta.",
          })}

          ${renderStatCard({
            label: "Resueltas / cerradas",
            value: `${stats.resolvedCount} / ${stats.closedCount}`,
            caption: "Incidencias ya solucionadas o cerradas definitivamente.",
          })}
        </div>
      </div>

      <style>
        @keyframes incidenciasPulse {
          0% { transform:scale(.92); opacity:.75; }
          50% { transform:scale(1.08); opacity:1; }
          100% { transform:scale(.92); opacity:.75; }
        }

        @media (max-width: 1100px) {
          .incidencias-hero-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 720px) {
          .incidencias-hero-stats {
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
      class="panel-surface incidencias-table-shell"
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
              grid-template-columns: 2.25fr .9fr .9fr 1fr 1.1fr 1fr 1fr 1fr;
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
                        animation:incidenciasSkeleton 1.25s linear infinite;
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
                    grid-template-columns: 2.25fr .9fr .9fr 1fr 1.1fr 1fr 1fr 1fr;
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
                          animation:incidenciasSkeleton 1.25s linear infinite;
                        "
                      ></div>
                      <div style="display:grid; gap:8px; flex:1;">
                        <div style="height:14px; width:140px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:incidenciasSkeleton 1.25s linear infinite;"></div>
                        <div style="height:12px; width:220px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:incidenciasSkeleton 1.25s linear infinite;"></div>
                        <div style="height:12px; width:170px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:incidenciasSkeleton 1.25s linear infinite;"></div>
                      </div>
                    </div>
                  </div>

                  <div style="padding:16px 18px;"><div style="height:34px; width:96px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:incidenciasSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:16px 18px;"><div style="height:34px; width:92px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:incidenciasSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:16px 18px;"><div style="height:14px; width:86px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:incidenciasSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:16px 18px;"><div style="height:14px; width:116px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:incidenciasSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:16px 18px;"><div style="height:14px; width:92px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:incidenciasSkeleton 1.25s linear infinite;"></div></div>
                  <div style="padding:16px 18px;"><div style="height:14px; width:92px; border-radius:999px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:incidenciasSkeleton 1.25s linear infinite;"></div></div>

                  <div style="padding:16px 18px;">
                    <div style="display:flex; gap:8px; justify-content:flex-end;">
                      <div style="height:38px; width:96px; border-radius:12px; background:linear-gradient(90deg, var(--surface-glass), color-mix(in srgb, var(--accent, #7c5cff) 10%, var(--surface-glass)), var(--surface-glass)); background-size:200% 100%; animation:incidenciasSkeleton 1.25s linear infinite;"></div>
                    </div>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>

      <style>
        @keyframes incidenciasSkeleton {
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
      class="panel-surface incidencias-error-state"
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
          No se ha podido cargar
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
          No se ha podido mostrar tu historial de incidencias
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
          ${escapeHtml(safeText(message, "Ha ocurrido un error al cargar las incidencias."))}
        </p>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button
          id="incidencias-retry-btn"
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
          Volver a intentar
        </button>
      </div>
    </section>
  `;
}

export function renderEmptyState() {
  return `
    <section
      class="panel-surface incidencias-empty-state"
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
          Sin incidencias
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
          Aún no tienes incidencias registradas
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
          Cuando envíes una nueva solicitud, podrás seguir aquí su estado y las actualizaciones del equipo.
        </p>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button
          id="incidencias-create-btn"
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
          Crear incidencia
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
      class="incidencias-table-toolbar"
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
          Historial de incidencias
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
          Vista resumida
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
                    animation:incidenciasPulse 1.25s ease-in-out infinite;
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
  initials = "ON",
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

function renderOpenTicketButton({ ticketId = "", isOpening = false } = {}) {
  return `
    <button
      type="button"
      data-action="open-ticket"
      data-ticket-id="${escapeHtml(ticketId)}"
      ${isOpening ? "disabled" : ""}
      style="
        min-height:38px;
        min-width:108px;
        padding:0 12px;
        border-radius:12px;
        border:1px solid var(--btn-secondary-border, var(--border-soft));
        background:var(--btn-secondary-bg, var(--surface-glass));
        color:var(--btn-secondary-text, var(--text-soft));
        font-weight:var(--weight-bold);
        cursor:${isOpening ? "wait" : "pointer"};
        white-space:nowrap;
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
                  animation:incidenciasSpin .8s linear infinite;
                "
              ></span>
              Abriendo...
            </span>
          `
          : "Ver detalle"
      }
    </button>
  `;
}

function renderIncidenciaRow(item = {}, state = {}) {
  const localState = safeObject(state);
  const openingTicketId = safeText(localState?.openingTicketId, "");
  const ticketId = getTicketId(item);
  const code = getTicketCode(item);
  const title = getTitle(item);
  const preview = truncate(getPreview(item), 96);
  const client = getClientName(item);
  const email = getClientEmail(item);
  const statusValue = getStatusValue(item);
  const priorityValue = getPriorityValue(item);
  const status = getStatusLabel(statusValue);
  const priority = getPriorityLabel(priorityValue);
  const assignedTo = getAssigned(item);
  const updatedAtRaw = getUpdatedAt(item);
  const createdAtRaw = getCreatedAt(item);
  const updatedAt = formatRelativeDate(updatedAtRaw);
  const updatedAtDate = formatDate(updatedAtRaw);
  const createdAt = formatDate(createdAtRaw);
  const initials = getClientInitials(item);
  const avatarUrl = getClientAvatarUrl(item);
  const avatarSeed = getAvatarToneSeed(item);
  const isOpening = Boolean(openingTicketId && openingTicketId === ticketId);

  return `
    <tr
      class="incidencias-row ${isOpening ? "is-opening" : ""}"
      data-ticket-id="${escapeHtml(ticketId)}"
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
              data-action="open-ticket"
              data-ticket-id="${escapeHtml(ticketId)}"
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
              title="Abrir detalle de la incidencia"
            >
              ${escapeHtml(title)}
            </button>

            <span
              style="
                color:var(--text-soft);
                font-size:12px;
                font-weight:var(--weight-bold);
                line-height:1.3;
                text-transform:uppercase;
                letter-spacing:.04em;
              "
            >
              ${escapeHtml(code)}
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
        ${renderStatusChip(priority, getPriorityChipStyle(priorityValue))}
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
            Fecha de envío
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
            ${escapeHtml(client)}
          </strong>

          <span
            style="
              color:var(--text-dim);
              font-size:12px;
              line-height:1.2;
              word-break:break-word;
            "
          >
            ${escapeHtml(email)}
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
            ${escapeHtml(assignedTo)}
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
            Seguimiento
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
          ${renderOpenTicketButton({ ticketId, isOpening })}

          <button
            type="button"
            data-action="copy-ticket-id"
            data-ticket-id="${escapeHtml(ticketId)}"
            data-ticket-code="${escapeHtml(code)}"
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
            Copiar referencia
          </button>
        </div>
      </td>
    </tr>
  `;
}

function renderMobileIncidenciaCard(item = {}, state = {}) {
  const localState = safeObject(state);
  const openingTicketId = safeText(localState?.openingTicketId, "");
  const ticketId = getTicketId(item);
  const code = getTicketCode(item);
  const title = getTitle(item);
  const preview = truncate(getPreview(item), 120);
  const client = getClientName(item);
  const email = getClientEmail(item);
  const statusValue = getStatusValue(item);
  const priorityValue = getPriorityValue(item);
  const status = getStatusLabel(statusValue);
  const priority = getPriorityLabel(priorityValue);
  const assignedTo = getAssigned(item);
  const updatedAt = formatRelativeDate(getUpdatedAt(item));
  const createdAt = formatDate(getCreatedAt(item));
  const initials = getClientInitials(item);
  const avatarUrl = getClientAvatarUrl(item);
  const avatarSeed = getAvatarToneSeed(item);
  const isOpening = Boolean(openingTicketId && openingTicketId === ticketId);

  return `
    <article
      class="incidencias-mobile-card panel-surface"
      data-ticket-id="${escapeHtml(ticketId)}"
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
              data-action="open-ticket"
              data-ticket-id="${escapeHtml(ticketId)}"
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
              ${escapeHtml(title)}
            </button>

            <span
              style="
                color:var(--text-soft);
                font-size:12px;
                font-weight:var(--weight-bold);
                line-height:1.35;
                text-transform:uppercase;
                letter-spacing:.04em;
              "
            >
              ${escapeHtml(code)}
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
          ${renderStatusChip(priority, getPriorityChipStyle(priorityValue))}
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
            Solicitante
          </span>
          <strong style="color:var(--text-strong); font-size:var(--font-sm);">
            ${escapeHtml(client)}
          </strong>
          <span style="color:var(--text-dim); font-size:12px; line-height:1.35;">
            ${escapeHtml(email)}
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
            Seguimiento
          </span>
          <strong style="color:var(--text-strong); font-size:var(--font-sm);">
            ${escapeHtml(assignedTo)}
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
            Enviada
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
        ${renderOpenTicketButton({ ticketId, isOpening })}

        <button
          type="button"
          data-action="copy-ticket-id"
          data-ticket-id="${escapeHtml(ticketId)}"
          data-ticket-code="${escapeHtml(code)}"
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
          Copiar referencia
        </button>
      </div>
    </article>
  `;
}

function renderDesktopTable(items = [], state = {}) {
  return `
    <div
      class="incidencias-table-scroll"
      style="
        width:100%;
        overflow:auto;
      "
    >
      <table
        class="incidencias-table"
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
              Incidencia
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
              Prioridad
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
              Enviada
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
              Usuario
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
              Seguimiento
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
              Última novedad
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
            .map((item) => renderIncidenciaRow(item, state))
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMobileCards(items = [], state = {}) {
  return `
    <div
      class="incidencias-mobile-list"
      style="
        display:none;
        gap:14px;
        padding:14px;
      "
    >
      ${safeArray(items)
        .map((item) => renderMobileIncidenciaCard(item, state))
        .join("")}
    </div>
  `;
}

function renderTableLoadingOverlay(message = "Actualizando incidencias...") {
  return `
    <div
      class="incidencias-table-overlay"
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
            animation:incidenciasSpin .8s linear infinite;
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
          Solo se está actualizando el historial
        </span>
      </div>
    </div>
  `;
}

/* =========================================================
   MAIN
========================================================= */

export function renderTable({ items = [], state = {} } = {}) {
  const localState = state || incidenciasState || {};
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
      class="incidencias-table-wrap panel-surface"
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

      <div class="incidencias-desktop-table">
        ${renderDesktopTable(pagination.items, localState)}
      </div>

      ${renderMobileCards(pagination.items, localState)}

      ${refreshing ? renderTableLoadingOverlay("Actualizando incidencias...") : ""}

      <style>
        @keyframes incidenciasSpin {
          to { transform:rotate(360deg); }
        }

        .incidencias-table tbody tr:hover {
          background: color-mix(in srgb, var(--accent, #7c5cff) 4%, transparent);
        }

        .incidencias-table tbody tr:last-child td {
          border-bottom: none;
        }

        .incidencias-table tbody tr.is-opening:hover {
          background: color-mix(in srgb, var(--warning-strong, #ffbc42) 5%, transparent);
        }

        .incidencias-table-scroll::-webkit-scrollbar {
          height: 10px;
          width: 10px;
        }

        .incidencias-table-scroll::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--accent, #7c5cff) 20%, var(--border-soft));
          border-radius: 999px;
        }

        .incidencias-table-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .incidencias-table img + span {
          display:none;
        }

        .incidencias-table [data-avatar-fallback="true"] > img {
          display:none !important;
        }

        .incidencias-table [data-avatar-fallback="true"] > span {
          display:grid !important;
        }

        .incidencias-mobile-list [data-avatar-fallback="true"] > img {
          display:none !important;
        }

        .incidencias-mobile-list [data-avatar-fallback="true"] > span {
          display:grid !important;
        }

        @media (max-width: 980px) {
          .incidencias-desktop-table {
            display: none !important;
          }

          .incidencias-mobile-list {
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
