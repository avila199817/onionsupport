/* =========================================================
   Onion SPA - Incidencias Table Template
   Archivo: src/views/incidencias/incidencias.table.template.js

   Responsabilidades:
   - render header premium de la vista
   - render estados loading / error / empty
   - render tabla premium de incidencias
   - render cards mobile de incidencias
   - mantener compatibilidad con incidenciasView.js
   - chips visuales de estado / prioridad
   - densidad visual pro SaaS
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
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "—") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/* =========================================================
   LABELS
========================================================= */

function getStatusLabel(status = "") {
  const key = String(status || "").trim().toLowerCase();

  switch (key) {
    case "open":
      return "Abierta";

    case "pending":
      return "Pendiente";

    case "in_progress":
    case "in-progress":
    case "progress":
      return "En proceso";

    case "resolved":
      return "Resuelta";

    case "closed":
      return "Cerrada";

    default:
      return safeText(status, "Abierta");
  }
}

function getPriorityLabel(priority = "") {
  const key = String(priority || "").trim().toLowerCase();

  switch (key) {
    case "low":
      return "Baja";

    case "medium":
      return "Media";

    case "high":
      return "Alta";

    case "urgent":
      return "Urgente";

    default:
      return safeText(priority, "Media");
  }
}

/* =========================================================
   CHIPS
========================================================= */

function getStatusChipStyle(status = "") {
  const key = String(status || "").trim().toLowerCase();

  if (key === "open") {
    return `
      color:#60a5fa;
      background:rgba(59,130,246,.14);
      border:1px solid rgba(59,130,246,.28);
    `;
  }

  if (key === "pending") {
    return `
      color:#f59e0b;
      background:rgba(245,158,11,.14);
      border:1px solid rgba(245,158,11,.28);
    `;
  }

  if (
    key === "in_progress" ||
    key === "in-progress" ||
    key === "progress"
  ) {
    return `
      color:#c084fc;
      background:rgba(168,85,247,.14);
      border:1px solid rgba(168,85,247,.28);
    `;
  }

  if (key === "resolved") {
    return `
      color:#34d399;
      background:rgba(16,185,129,.14);
      border:1px solid rgba(16,185,129,.28);
    `;
  }

  if (key === "closed") {
    return `
      color:#cbd5e1;
      background:rgba(148,163,184,.12);
      border:1px solid rgba(148,163,184,.22);
    `;
  }

  return `
    color:var(--text-soft);
    background:var(--surface-glass);
    border:1px solid var(--border-soft);
  `;
}

function getPriorityChipStyle(priority = "") {
  const key = String(priority || "").trim().toLowerCase();

  if (key === "low") {
    return `
      color:#34d399;
      background:rgba(16,185,129,.14);
      border:1px solid rgba(16,185,129,.28);
    `;
  }

  if (key === "medium") {
    return `
      color:#60a5fa;
      background:rgba(59,130,246,.14);
      border:1px solid rgba(59,130,246,.28);
    `;
  }

  if (key === "high") {
    return `
      color:#f59e0b;
      background:rgba(245,158,11,.14);
      border:1px solid rgba(245,158,11,.28);
    `;
  }

  if (key === "urgent") {
    return `
      color:#f87171;
      background:rgba(239,68,68,.14);
      border:1px solid rgba(239,68,68,.28);
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
   STATS
========================================================= */

function computeStats(items = []) {
  const list = safeArray(items);

  const total = list.length;

  const openCount = list.filter(
    (item) => String(item?.status || "").toLowerCase() === "open"
  ).length;

  const inProgressCount = list.filter((item) => {
    const key = String(item?.status || "").toLowerCase();
    return key === "pending" || key === "in_progress" || key === "in-progress";
  }).length;

  const closedCount = list.filter((item) => {
    const key = String(item?.status || "").toLowerCase();
    return key === "resolved" || key === "closed";
  }).length;

  const urgentCount = list.filter(
    (item) => String(item?.priority || "").toLowerCase() === "urgent"
  ).length;

  const assignedCount = list.filter((item) => {
    const assigned = safeText(item?.assignedTo, "");
    return assigned && assigned !== "—" && assigned.toLowerCase() !== "no asignado";
  }).length;

  return {
    total,
    openCount,
    inProgressCount,
    closedCount,
    urgentCount,
    assignedCount,
  };
}

/* =========================================================
   UI HELPERS
========================================================= */

function getClientInitials(item = {}) {
  const raw =
    item?.clientInitials ||
    item?.client ||
    item?.cliente ||
    item?.company ||
    "ON";

  const clean = String(raw).trim();

  if (!clean) return "ON";

  const parts = clean.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]).join("");

  return (initials || clean.slice(0, 2) || "ON").toUpperCase();
}

function getTicketCode(item = {}) {
  return safeText(
    item?.code ||
      item?.ticketCode ||
      item?.ticketId ||
      item?.id,
    "—"
  );
}

function getTicketId(item = {}) {
  return safeText(
    item?.ticketId || item?.id || "",
    ""
  );
}

function getClientName(item = {}) {
  return safeText(
    item?.client ||
      item?.cliente ||
      item?.clientName ||
      item?.empresa,
    "Cliente"
  );
}

function getClientEmail(item = {}) {
  return safeText(
    item?.clientEmail ||
      item?.clienteEmail ||
      item?.email,
    "Sin email"
  );
}

function getTitle(item = {}) {
  return safeText(
    item?.title ||
      item?.subject ||
      item?.asunto,
    "Incidencia sin título"
  );
}

function getPreview(item = {}) {
  return safeText(
    item?.preview ||
      item?.description ||
      item?.descripcion,
    "Sin descripción"
  );
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

export function renderHeader({ items, state } = {}) {
  const list = safeArray(items).length
    ? safeArray(items)
    : sortIncidenciasByUpdatedDesc(getIncidencias());

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
            grid-template-columns:repeat(5, minmax(0, 1fr));
            gap:var(--space-md);
          "
        >
          ${renderStatCard({
            label: "Tickets visibles",
            value: String(stats.total),
            caption: `${remoteCount} registros disponibles en la colección actual.`,
            accent: true,
          })}

          ${renderStatCard({
            label: "Abiertas",
            value: String(stats.openCount),
            caption: "Tickets pendientes de atención inicial.",
          })}

          ${renderStatCard({
            label: "En curso",
            value: String(stats.inProgressCount),
            caption: "Incidencias en seguimiento o trabajo activo.",
          })}

          ${renderStatCard({
            label: "Urgentes",
            value: String(stats.urgentCount),
            caption: "Máxima prioridad operativa en la bandeja actual.",
          })}

          ${renderStatCard({
            label: "Asignadas",
            value: String(stats.assignedCount),
            caption: `${stats.closedCount} cerradas o resueltas en el conjunto visible.`,
          })}
        </div>
      </div>

      <style>
        @media (max-width: 1180px) {
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
        <div style="min-width:1240px;">
          <div
            style="
              display:grid;
              grid-template-columns:1.1fr 2.1fr 1.2fr .9fr .9fr 1fr 1fr 1fr;
              gap:0;
              border-bottom:1px solid var(--border-soft);
              background:var(--surface-2, var(--surface-glass));
            "
          >
            ${Array.from({ length: 8 })
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
                    grid-template-columns:1.1fr 2.1fr 1.2fr .9fr .9fr 1fr 1fr 1fr;
                    gap:0;
                    border-bottom:1px solid var(--border-soft);
                  "
                >
                  <div style="padding:18px;">
                    <div style="display:grid; gap:8px;">
                      <div style="height:14px; width:90px; border-radius:999px; background:var(--surface-glass);"></div>
                      <div style="height:12px; width:120px; border-radius:999px; background:var(--surface-glass);"></div>
                    </div>
                  </div>

                  <div style="padding:18px;">
                    <div style="display:flex; gap:12px; align-items:center;">
                      <div style="width:42px; height:42px; border-radius:14px; background:var(--surface-glass);"></div>
                      <div style="display:grid; gap:8px; flex:1;">
                        <div style="height:14px; width:220px; border-radius:999px; background:var(--surface-glass);"></div>
                        <div style="height:12px; width:90%; border-radius:999px; background:var(--surface-glass);"></div>
                      </div>
                    </div>
                  </div>

                  <div style="padding:18px;">
                    <div style="display:grid; gap:8px;">
                      <div style="height:14px; width:120px; border-radius:999px; background:var(--surface-glass);"></div>
                      <div style="height:12px; width:150px; border-radius:999px; background:var(--surface-glass);"></div>
                    </div>
                  </div>

                  <div style="padding:18px;"><div style="height:34px; width:96px; border-radius:999px; background:var(--surface-glass);"></div></div>
                  <div style="padding:18px;"><div style="height:34px; width:92px; border-radius:999px; background:var(--surface-glass);"></div></div>
                  <div style="padding:18px;"><div style="height:14px; width:120px; border-radius:999px; background:var(--surface-glass);"></div></div>
                  <div style="padding:18px;"><div style="height:14px; width:110px; border-radius:999px; background:var(--surface-glass);"></div></div>

                  <div style="padding:18px;">
                    <div style="display:flex; gap:8px; justify-content:flex-end;">
                      <div style="height:38px; width:82px; border-radius:12px; background:var(--surface-glass);"></div>
                      <div style="height:38px; width:96px; border-radius:12px; background:var(--surface-glass);"></div>
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

export function renderErrorState(message = "") {
  const text =
    safeText(
      message || incidenciasState?.error,
      "Error desconocido al cargar la vista."
    );

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
          ${escapeHtml(text)}
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

/* =========================================================
   TABLE
========================================================= */

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

function renderIncidenciaRow(item = {}) {
  const ticketId = getTicketId(item);
  const code = getTicketCode(item);
  const title = getTitle(item);
  const preview = truncate(getPreview(item), 110);
  const client = getClientName(item);
  const email = getClientEmail(item);
  const status = getStatusLabel(item?.status);
  const priority = getPriorityLabel(item?.priority);
  const assignedTo = safeText(item?.assignedTo, "No asignado");
  const updatedAtRelative = safeText(
    formatRelativeDate(item?.updatedAt),
    "Sin fecha"
  );
  const updatedAtDate = safeText(
    formatDate(item?.updatedAt),
    "—"
  );
  const createdAtDate = safeText(
    formatDate(item?.createdAt),
    "—"
  );
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
          white-space:nowrap;
        "
      >
        <div style="display:grid; gap:4px;">
          <strong
            style="
              color:var(--text-strong);
              font-size:var(--font-sm);
              line-height:1.2;
              letter-spacing:-.02em;
            "
          >
            ${escapeHtml(code)}
          </strong>

          <span
            style="
              color:var(--text-dim);
              font-size:12px;
              line-height:1.2;
            "
          >
            Ticket
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
        <div style="display:flex; gap:14px; align-items:flex-start; min-width:320px;">
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

          <div style="display:grid; gap:5px; min-width:0; flex:1;">
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
              ${escapeHtml(title)}
            </button>

            <span
              style="
                color:var(--text-dim);
                font-size:var(--font-sm);
                line-height:1.5;
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
        "
      >
        <div style="display:grid; gap:5px; min-width:180px;">
          <strong
            style="
              color:var(--text-soft);
              font-size:var(--font-sm);
              font-weight:var(--weight-semibold);
              line-height:1.35;
              word-break:break-word;
            "
          >
            ${escapeHtml(client)}
          </strong>

          <span
            style="
              color:var(--text-dim);
              font-size:12px;
              line-height:1.35;
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
            ${escapeHtml(updatedAtRelative)}
          </span>

          <span
            style="
              color:var(--text-dim);
              font-size:12px;
              line-height:1.2;
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
  const assignedTo = safeText(item?.assignedTo, "No asignado");
  const updatedAtRelative = safeText(formatRelativeDate(item?.updatedAt), "Sin fecha");
  const updatedAtDate = safeText(formatDate(item?.updatedAt), "—");
  const createdAtDate = safeText(formatDate(item?.createdAt), "—");
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
            <span
              style="
                color:var(--text-dim);
                font-size:12px;
                font-weight:var(--weight-bold);
                letter-spacing:.05em;
                text-transform:uppercase;
              "
            >
              ${escapeHtml(code)}
            </span>

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
              ${escapeHtml(title)}
            </button>

            <span
              style="
                color:var(--text-dim);
                font-size:12px;
                line-height:1.45;
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
            Actualizada
          </span>
          <strong style="color:var(--text-strong); font-size:var(--font-sm);">
            ${escapeHtml(updatedAtRelative)}
          </strong>
          <span style="color:var(--text-dim); font-size:12px; line-height:1.35;">
            ${escapeHtml(updatedAtDate)}
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
            Creada
          </span>
          <strong style="color:var(--text-strong); font-size:var(--font-sm);">
            ${escapeHtml(createdAtDate)}
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
          min-width:1240px;
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
              ID
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
              Incidencia
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
   MAIN TABLE RENDER
========================================================= */

export function renderTable({ items, state } = {}) {
  const localState = state || incidenciasState || {};
  const list = safeArray(items).length
    ? safeArray(items)
    : sortIncidenciasByUpdatedDesc(getIncidencias());

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

/* =========================================================
   API DE COMPATIBILIDAD
========================================================= */

export function renderCards({ items, state } = {}) {
  return renderTable({ items, state });
}
