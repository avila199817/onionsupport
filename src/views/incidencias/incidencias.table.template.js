/* =========================================================
   Onion SPA - Incidencias Template (FINAL PRO TABLE GOD MODE)
   Archivo: src/views/incidencias/incidencias.table.template.js

   Responsabilidades:
   - renderizar header premium de la vista
   - renderizar estados loading / error / empty
   - renderizar tabla premium de incidencias
   - mantener compatibilidad directa con incidenciasView.js
   - compartir lenguaje visual y densidad con Facturas

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - helpers de lectura consistentes
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
    ["in_progress", "in-progress", "progress", "en_proceso", "en proceso"].includes(key)
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
    return direct;
  }

  try {
    return sortIncidenciasByUpdatedDesc(
      getIncidencias()
    );
  } catch {
    return [];
  }
}

function getTicketId(item = {}) {
  return safeText(
    first(
      item.ticketId,
      item.id,
      item.code
    ),
    ""
  );
}

function getTicketCode(item = {}) {
  return safeText(
    first(
      item.code,
      item.ticketCode,
      item.ticketId,
      item.id
    ),
    "—"
  );
}

function getClientName(item = {}) {
  return safeText(
    first(
      item.client,
      item.clientName,
      item.cliente,
      item.empresa,
      item.company
    ),
    "Cliente"
  );
}

function getClientEmail(item = {}) {
  return safeText(
    first(
      item.clientEmail,
      item.email,
      item.clienteEmail
    ),
    "Sin email"
  );
}

function getTitle(item = {}) {
  return safeText(
    first(
      item.title,
      item.subject,
      item.asunto,
      item.name
    ),
    "Incidencia sin título"
  );
}

function getPreview(item = {}) {
  return safeText(
    first(
      item.preview,
      item.description,
      item.descripcion,
      item.message
    ),
    "Sin descripción"
  );
}

function getAssigned(item = {}) {
  return safeText(
    first(
      item.assignedTo,
      item.assignee,
      item.tecnico
    ),
    "No asignado"
  );
}

function getClientInitials(item = {}) {
  const raw =
    item?.clientInitials ||
    item?.client ||
    item?.clientName ||
    item?.cliente ||
    item?.empresa ||
    item?.company ||
    "ON";

  const clean = String(raw).trim();

  if (!clean) return "ON";

  const parts = clean.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]).join("");

  return (initials || clean.slice(0, 2) || "ON").toUpperCase();
}

/* =========================================================
   STATS
========================================================= */

function computeStats(items = []) {
  const list = safeArray(items);

  const totalIncidencias = list.length;

  const openCount = list.filter((item) => {
    const status = String(item?.status || "").toLowerCase();
    return ["open", "abierta", "abierto"].includes(status);
  }).length;

  const inProgressCount = list.filter((item) => {
    const status = String(item?.status || "").toLowerCase();
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
    const priority = String(item?.priority || "").toLowerCase();
    return ["urgent", "urgente", "critical", "critica", "crítica"].includes(priority);
  }).length;

  const assignedCount = list.filter((item) => {
    const assigned = getAssigned(item);
    return assigned !== "No asignado";
  }).length;

  const closedCount = list.filter((item) => {
    const status = String(item?.status || "").toLowerCase();
    return ["resolved", "resuelta", "resuelto", "closed", "cerrada", "cerrado"].includes(status);
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
        border:1px solid ${accent ? "color-mix(in srgb, var(--accent, #7c5cff) 24%, var(--border-soft))" : "var(--border-soft)"};
        background:${accent ? "linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent), transparent 72%), var(--surface-1, var(--surface-glass))" : "var(--surface-1, var(--surface-glass))"};
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
  const remoteCount = safeNumber(localState?.remoteCount, list.length);
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
              Soporte técnico
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
                Centro de control de incidencias
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
                Supervisa tickets, prioridades, asignaciones y tiempos de actualización
                desde una tabla premium diseñada para operación, seguimiento y respuesta rápida.
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
              Exportar CSV
            </button>

            <button
              id="incidencias-refresh-btn"
              type="button"
              ${loading || refreshing ? "disabled" : ""}
              style="
                min-height:42px;
                padding:0 14px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
                background:var(--btn-primary-bg, var(--accent, #7c5cff));
                color:var(--btn-primary-text, #fff);
                font-weight:var(--weight-bold);
                cursor:${loading || refreshing ? "not-allowed" : "pointer"};
                opacity:${loading || refreshing ? ".72" : "1"};
              "
            >
              ${refreshing || loading ? "Actualizando..." : "Actualizar"}
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
            label: "Tickets visibles",
            value: String(stats.totalIncidencias),
            caption: `${remoteCount} registros totales cargados en la colección.`,
            accent: true,
          })}

          ${renderStatCard({
            label: "Abiertas",
            value: String(stats.openCount),
            caption: "Tickets pendientes de atención inicial.",
          })}

          ${renderStatCard({
            label: "En curso / urgentes",
            value: `${stats.inProgressCount} / ${stats.urgentCount}`,
            caption: "Balance rápido entre seguimiento activo y prioridad crítica.",
          })}

          ${renderStatCard({
            label: "Asignadas / cerradas",
            value: `${stats.assignedCount} / ${stats.closedCount}`,
            caption: "Cobertura operativa y cierre del conjunto visible.",
          })}
        </div>
      </div>

      <style>
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
        <div
          style="
            min-width:1180px;
          "
        >
          <div
            style="
              display:grid;
              grid-template-columns: 1.6fr .9fr .8fr .8fr .8fr 1fr 1.2fr;
              gap:0;
              border-bottom:1px solid var(--border-soft);
              background:var(--surface-2, var(--surface-glass));
            "
          >
            ${Array.from({ length: 7 })
              .map(
                () => `
                  <div style="padding:16px 18px;">
                    <div style="height:12px; width:70%; border-radius:999px; background:var(--surface-glass);"></div>
                  </div>
                `
              )
              .join("")}
          </div>

          ${Array.from({ length: 8 })
            .map(
              () => `
                <div
                  style="
                    display:grid;
                    grid-template-columns: 1.6fr .9fr .8fr .8fr .8fr 1fr 1.2fr;
                    gap:0;
                    border-bottom:1px solid var(--border-soft);
                  "
                >
                  <div style="padding:18px;">
                    <div style="display:flex; gap:12px; align-items:center;">
                      <div style="width:42px; height:42px; border-radius:14px; background:var(--surface-glass);"></div>
                      <div style="display:grid; gap:8px; flex:1;">
                        <div style="height:14px; width:130px; border-radius:999px; background:var(--surface-glass);"></div>
                        <div style="height:12px; width:200px; border-radius:999px; background:var(--surface-glass);"></div>
                        <div style="height:12px; width:170px; border-radius:999px; background:var(--surface-glass);"></div>
                      </div>
                    </div>
                  </div>

                  <div style="padding:18px;"><div style="height:34px; width:96px; border-radius:999px; background:var(--surface-glass);"></div></div>
                  <div style="padding:18px;"><div style="height:34px; width:92px; border-radius:999px; background:var(--surface-glass);"></div></div>
                  <div style="padding:18px;"><div style="height:14px; width:86px; border-radius:999px; background:var(--surface-glass);"></div></div>
                  <div style="padding:18px;"><div style="height:14px; width:116px; border-radius:999px; background:var(--surface-glass);"></div></div>
                  <div style="padding:18px;"><div style="height:14px; width:92px; border-radius:999px; background:var(--surface-glass);"></div></div>

                  <div style="padding:18px;">
                    <div style="display:flex; gap:8px; justify-content:flex-end;">
                      <div style="height:38px; width:82px; border-radius:12px; background:var(--surface-glass);"></div>
                      <div style="height:38px; width:82px; border-radius:12px; background:var(--surface-glass);"></div>
                    </div>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
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
          No se pudo renderizar la vista de incidencias
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
          Reintentar
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
          No hay incidencias para mostrar
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
          Todavía no hay tickets disponibles en la colección actual.
        </p>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button
          id="incidencias-refresh-btn"
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
          Recargar
        </button>
      </div>
    </section>
  `;
}

function renderTableToolbar({ total = 0 } = {}) {
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
          Tabla de incidencias
        </strong>

        <span
          style="
            color:var(--text-dim);
            font-size:var(--font-sm);
          "
        >
          ${escapeHtml(String(total))} registro${total === 1 ? "" : "s"} visible${total === 1 ? "" : "s"} en pantalla.
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
      </div>
    </div>
  `;
}

/* =========================================================
   ROW
========================================================= */

function renderIncidenciaRow(item = {}) {
  const ticketId = getTicketId(item);
  const code = getTicketCode(item);
  const title = getTitle(item);
  const preview = truncate(getPreview(item), 110);
  const client = getClientName(item);
  const email = getClientEmail(item);
  const status = getStatusLabel(item?.status);
  const priority = getPriorityLabel(item?.priority);
  const assignedTo = getAssigned(item);
  const updatedAt = formatRelativeDate(item?.updatedAt);
  const updatedAtDate = formatDate(item?.updatedAt);
  const createdAt = formatDate(item?.createdAt);
  const initials = getClientInitials(item);

  return `
    <tr
      class="incidencias-row"
      data-ticket-id="${escapeHtml(ticketId)}"
      style="
        transition:background .18s ease, transform .18s ease;
      "
    >
      <td
        style="
          padding:18px;
          border-bottom:1px solid var(--border-soft);
          vertical-align:middle;
        "
      >
        <div style="display:flex; gap:14px; align-items:center; min-width:280px;">
          <div
            aria-hidden="true"
            style="
              flex:0 0 44px;
              width:44px;
              height:44px;
              border-radius:14px;
              display:grid;
              place-items:center;
              background:
                linear-gradient(135deg, color-mix(in srgb, var(--accent, #7c5cff) 22%, transparent), transparent),
                var(--surface-glass);
              border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 18%, var(--border-soft));
              color:var(--text-strong);
              font-weight:var(--weight-black);
              letter-spacing:.03em;
              box-shadow:var(--shadow-xs, 0 4px 14px rgba(0,0,0,.08));
            "
          >
            ${escapeHtml(initials)}
          </div>

          <div style="display:grid; gap:5px; min-width:0;">
            <button
              type="button"
              data-action="open-ticket"
              data-ticket-id="${escapeHtml(ticketId)}"
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
                cursor:pointer;
              "
              title="Abrir detalle de incidencia"
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
              ${escapeHtml(title)}
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
      </td>

      <td
        style="
          padding:18px;
          border-bottom:1px solid var(--border-soft);
          vertical-align:middle;
          white-space:nowrap;
        "
      >
        ${renderStatusChip(status, getStatusChipStyle(item?.status))}
      </td>

      <td
        style="
          padding:18px;
          border-bottom:1px solid var(--border-soft);
          vertical-align:middle;
          white-space:nowrap;
        "
      >
        ${renderStatusChip(priority, getPriorityChipStyle(item?.priority))}
      </td>

      <td
        style="
          padding:18px;
          border-bottom:1px solid var(--border-soft);
          vertical-align:middle;
          white-space:nowrap;
        "
      >
        <div style="display:grid; gap:4px;">
          <strong
            style="
              color:var(--text-strong);
              font-size:var(--font-sm);
              line-height:1.2;
            "
          >
            ${escapeHtml(createdAt)}
          </strong>

          <span
            style="
              color:var(--text-dim);
              font-size:12px;
              line-height:1.2;
            "
          >
            Creación
          </span>
        </div>
      </td>

      <td
        style="
          padding:18px;
          border-bottom:1px solid var(--border-soft);
          vertical-align:middle;
        "
      >
        <div style="display:grid; gap:4px; min-width:180px;">
          <strong
            style="
              color:var(--text-strong);
              font-size:var(--font-sm);
              line-height:1.2;
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
          padding:18px;
          border-bottom:1px solid var(--border-soft);
          vertical-align:middle;
        "
      >
        <div style="display:grid; gap:4px;">
          <strong
            style="
              color:var(--text-strong);
              font-size:var(--font-sm);
              line-height:1.2;
            "
          >
            ${escapeHtml(assignedTo)}
          </strong>

          <span
            style="
              color:var(--text-dim);
              font-size:12px;
              line-height:1.2;
            "
          >
            Responsable
          </span>
        </div>
      </td>

      <td
        style="
          padding:18px;
          border-bottom:1px solid var(--border-soft);
          vertical-align:middle;
          white-space:nowrap;
        "
      >
        <div style="display:grid; gap:6px;">
          <span
            style="
              color:var(--text-soft);
              font-size:var(--font-sm);
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
          padding:18px;
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
            data-action="open-ticket"
            data-ticket-id="${escapeHtml(ticketId)}"
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
            Ver
          </button>

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
            Copiar ID
          </button>
        </div>
      </td>
    </tr>
  `;
}

function renderMobileIncidenciaCard(item = {}) {
  const ticketId = getTicketId(item);
  const code = getTicketCode(item);
  const title = getTitle(item);
  const preview = truncate(getPreview(item), 120);
  const client = getClientName(item);
  const email = getClientEmail(item);
  const status = getStatusLabel(item?.status);
  const priority = getPriorityLabel(item?.priority);
  const assignedTo = getAssigned(item);
  const updatedAt = formatRelativeDate(item?.updatedAt);
  const createdAt = formatDate(item?.createdAt);
  const initials = getClientInitials(item);

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
          <div
            aria-hidden="true"
            style="
              flex:0 0 42px;
              width:42px;
              height:42px;
              border-radius:14px;
              display:grid;
              place-items:center;
              background:
                linear-gradient(135deg, color-mix(in srgb, var(--accent, #7c5cff) 22%, transparent), transparent),
                var(--surface-glass);
              border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 18%, var(--border-soft));
              color:var(--text-strong);
              font-weight:var(--weight-black);
            "
          >
            ${escapeHtml(initials)}
          </div>

          <div style="display:grid; gap:5px; min-width:0;">
            <button
              type="button"
              data-action="open-ticket"
              data-ticket-id="${escapeHtml(ticketId)}"
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
                cursor:pointer;
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
              ${escapeHtml(title)}
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
          ${renderStatusChip(status, getStatusChipStyle(item?.status))}
          ${renderStatusChip(priority, getPriorityChipStyle(item?.priority))}
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
            Cliente
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
            Asignado
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
            Creada
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
        <button
          type="button"
          data-action="open-ticket"
          data-ticket-id="${escapeHtml(ticketId)}"
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
          Ver detalle
        </button>

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
          Copiar ID
        </button>
      </div>
    </article>
  `;
}

function renderDesktopTable(items = []) {
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
          min-width:1180px;
          border-collapse:separate;
          border-spacing:0;
        "
      >
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
              Ticket / detalle
            </th>

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
              Estado
            </th>

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
              Prioridad
            </th>

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
              Creación
            </th>

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
              Cliente
            </th>

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
              Asignado
            </th>

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
          ${safeArray(items).map((item) => renderIncidenciaRow(item)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMobileCards(items = []) {
  return `
    <div
      class="incidencias-mobile-list"
      style="
        display:none;
        gap:14px;
        padding:14px;
      "
    >
      ${safeArray(items).map((item) => renderMobileIncidenciaCard(item)).join("")}
    </div>
  `;
}

/* =========================================================
   MAIN
========================================================= */

export function renderTable({ items = [], state = {} } = {}) {
  const localState = state || incidenciasState || {};
  const list = getResolvedItems(items);

  if (localState.loading && !list.length) {
    return renderLoadingState();
  }

  if (localState.error && !list.length) {
    return renderErrorState(localState.error);
  }

  if (!list.length) {
    return renderEmptyState();
  }

  return `
    <section
      class="incidencias-table-wrap panel-surface"
      style="
        overflow:hidden;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--surface-2, transparent) 60%, transparent), transparent),
          var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-sm);
      "
    >
      ${renderTableToolbar({ total: list.length })}

      <div class="incidencias-desktop-table">
        ${renderDesktopTable(list)}
      </div>

      ${renderMobileCards(list)}

      <style>
        .incidencias-table tbody tr:hover {
          background: color-mix(in srgb, var(--accent, #7c5cff) 4%, transparent);
        }

        .incidencias-table tbody tr:last-child td {
          border-bottom: none;
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
