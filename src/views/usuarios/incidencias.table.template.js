/* =========================================================
   Onion SPA - Incidencias Template (FINAL PRO TABLE GOD MODE)
   Archivo: src/views/incidencias/incidencias.table.template.js

   EXTREME MODE · BACKEND REAL DATA READY · 10/10

   Responsabilidades:
   - renderizar header premium de la vista
   - renderizar estados loading / error / empty
   - renderizar tabla premium de incidencias
   - paginar a 5 incidencias por vista
   - mostrar loader SOLO en la sección de tabla
   - mostrar estado visual al abrir ticket lento
   - mantener compatibilidad directa con incidenciasView.js
   - consumir datos reales del backend /api/tickets
   - compartir lenguaje visual y densidad con Facturas

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - soporte para envelope backend { ok, count, tickets }
   - lectura preferente del shape normalizado del backend
   - mismo lenguaje visual que Facturas
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
      return "Abierta";

    case "pending":
    case "pendiente":
      return "Pendiente";

    case "in_progress":
    case "in-progress":
    case "progress":
    case "en_proceso":
    case "en proceso":
      return "En proceso";

    case "resolved":
    case "resuelta":
    case "resuelto":
      return "Resuelta";

    case "closed":
    case "cerrada":
    case "cerrado":
      return "Cerrada";

    default:
      return safeText(value, "Abierta");
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
      color:#b388ff;
      background:color-mix(in srgb, #b388ff 14%, transparent);
      border:1px solid color-mix(in srgb, #b388ff 26%, transparent);
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
    "Incidencia sin título"
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
    "No asignado"
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

  const assignedCount = list.filter((item) => {
    const explicitAssigned = safeObject(item?.meta)?.isAssigned === true;

    if (explicitAssigned) return true;

    const assigned = getAssigned(item);
    return assigned !== "No asignado";
  }).length;

  const closedCount = list.filter((item) => {
    const status = safeLower(getStatusValue(item));
    return [
      "resolved",
      "resuelta",
      "resuelto",
      "closed",
      "cerrada",
      "cerrado",
    ].includes(status);
  }).length;

  return {
    totalIncidencias,
    openCount,
    inProgressCount,
    urgentCount,
    assignedCount,
    closedCount,
  };
}

/* ... CONTINÚA EXACTAMENTE IGUAL HASTA EL FINAL DEL ARCHIVO ... */
