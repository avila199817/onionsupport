/* =========================================================
   Onion SPA - Incidencias Table Template
   Archivo: src/views/incidencias/incidencias.table.template.js

   Responsabilidades:
   - render header premium PRO
   - render estados loading / error / empty
   - render tabla enterprise SaaS level
   - chips visuales de estado / prioridad
   - densidad profesional
   - compatibilidad total con incidenciasView.js
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
   LABELS
========================================================= */

function getStatusLabel(status) {
  const map = {
    open: "Abierta",
    pending: "Pendiente",
    in_progress: "En proceso",
    resolved: "Resuelta",
    closed: "Cerrada",
  };

  return map[status] || "Abierta";
}

function getPriorityLabel(priority) {
  const map = {
    low: "Baja",
    medium: "Media",
    high: "Alta",
    urgent: "Urgente",
  };

  return map[priority] || "Media";
}

/* =========================================================
   TONES
========================================================= */

function getStatusTone(status) {
  const map = {
    open:
      "background:rgba(59,130,246,.14);color:#60a5fa;border-color:rgba(59,130,246,.28);",

    pending:
      "background:rgba(245,158,11,.14);color:#f59e0b;border-color:rgba(245,158,11,.28);",

    in_progress:
      "background:rgba(168,85,247,.14);color:#c084fc;border-color:rgba(168,85,247,.28);",

    resolved:
      "background:rgba(16,185,129,.14);color:#34d399;border-color:rgba(16,185,129,.28);",

    closed:
      "background:rgba(148,163,184,.12);color:#cbd5e1;border-color:rgba(148,163,184,.22);",
  };

  return map[status] || map.open;
}

function getPriorityTone(priority) {
  const map = {
    low:
      "background:rgba(16,185,129,.14);color:#34d399;border-color:rgba(16,185,129,.28);",

    medium:
      "background:rgba(59,130,246,.14);color:#60a5fa;border-color:rgba(59,130,246,.28);",

    high:
      "background:rgba(245,158,11,.14);color:#f59e0b;border-color:rgba(245,158,11,.28);",

    urgent:
      "background:rgba(239,68,68,.14);color:#f87171;border-color:rgba(239,68,68,.28);",
  };

  return map[priority] || map.medium;
}

/* =========================================================
   HEADER
========================================================= */

export function renderHeader() {
  const items = getIncidencias();

  const openCount = items.filter(
    (item) => item.status === "open"
  ).length;

  const pendingCount = items.filter(
    (item) =>
      item.status === "pending" ||
      item.status === "in_progress"
  ).length;

  const closedCount = items.filter(
    (item) =>
      item.status === "resolved" ||
      item.status === "closed"
  ).length;

  return `
    <header class="view-header">
      <div class="view-header-main">
        <h1 class="view-title">
          Incidencias
        </h1>

        <p class="view-subtitle">
          Panel operativo de tickets y soporte técnico.
        </p>
      </div>

      <div class="view-header-actions">
        <button
          type="button"
          id="incidencias-refresh-btn"
          class="btn btn-secondary"
        >
          ${
            incidenciasState.loading
              ? "Actualizando..."
              : "Actualizar"
          }
        </button>
      </div>
    </header>

    <section
      class="stats-strip"
      style="
        display:grid;
        grid-template-columns:
          repeat(auto-fit,minmax(180px,1fr));
        gap:14px;
        margin-bottom:18px;
      "
    >
      <div class="stat-card">
        <span class="stat-label">Total</span>
        <strong class="stat-value">
          ${items.length}
        </strong>
      </div>

      <div class="stat-card">
        <span class="stat-label">
          Abiertas
        </span>
        <strong class="stat-value">
          ${openCount}
        </strong>
      </div>

      <div class="stat-card">
        <span class="stat-label">
          En curso
        </span>
        <strong class="stat-value">
          ${pendingCount}
        </strong>
      </div>

      <div class="stat-card">
        <span class="stat-label">
          Cerradas
        </span>
        <strong class="stat-value">
          ${closedCount}
        </strong>
      </div>

      <div class="stat-card">
        <span class="stat-label">
          Última sync
        </span>
        <strong class="stat-value">
          ${
            incidenciasState.lastSyncAt
              ? escapeHtml(
                  formatRelativeDate(
                    incidenciasState.lastSyncAt
                  )
                )
              : "—"
          }
        </strong>
      </div>
    </section>
  `;
}

/* =========================================================
   STATES
========================================================= */

export function renderLoadingState() {
  return `
    <section class="table-shell">
      <div class="table-empty">
        Cargando incidencias...
      </div>
    </section>
  `;
}

export function renderErrorState() {
  return `
    <section class="table-shell">
      <div class="table-empty">
        <p>
          ${
            escapeHtml(
              incidenciasState.error ||
              "Error cargando incidencias."
            )
          }
        </p>

        <button
          type="button"
          id="incidencias-retry-btn"
          class="btn btn-primary"
        >
          Reintentar
        </button>
      </div>
    </section>
  `;
}

export function renderEmptyState() {
  return `
    <section class="table-shell">
      <div class="table-empty">
        No hay incidencias registradas.
      </div>
    </section>
  `;
}

/* =========================================================
   TABLE
========================================================= */

export function renderTable() {
  const items =
    sortIncidenciasByUpdatedDesc(
      getIncidencias()
    );

  if (
    incidenciasState.loading &&
    !items.length
  ) {
    return renderLoadingState();
  }

  if (
    incidenciasState.error &&
    !items.length
  ) {
    return renderErrorState();
  }

  if (!items.length) {
    return renderEmptyState();
  }

  return `
    <section class="table-shell">
      <div class="table-wrap">
        <table class="data-table incidencia-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Asunto</th>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Prioridad</th>
              <th>Asignado</th>
              <th>Actualizada</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            ${items
              .map(
                (item) => `
              <tr>
                <td>
                  <strong>
                    ${escapeHtml(
                      item.code ||
                      item.id ||
                      "—"
                    )}
                  </strong>
                </td>

                <td>
                  <div class="table-main-cell">
                    <strong>
                      ${escapeHtml(
                        item.title
                      )}
                    </strong>

                    <span>
                      ${escapeHtml(
                        truncate(
                          item.preview ||
                          item.description ||
                          "",
                          95
                        )
                      )}
                    </span>
                  </div>
                </td>

                <td>
                  <div class="table-main-cell">
                    <strong>
                      ${escapeHtml(
                        item.client
                      )}
                    </strong>

                    <span>
                      ${escapeHtml(
                        item.clientEmail ||
                        "-"
                      )}
                    </span>
                  </div>
                </td>

                <td>
                  <span
                    style="
                      display:inline-flex;
                      align-items:center;
                      justify-content:center;
                      min-height:30px;
                      padding:6px 10px;
                      border-radius:999px;
                      border:1px solid;
                      font-size:12px;
                      font-weight:700;
                      ${getStatusTone(
                        item.status
                      )}
                    "
                  >
                    ${escapeHtml(
                      getStatusLabel(
                        item.status
                      )
                    )}
                  </span>
                </td>

                <td>
                  <span
                    style="
                      display:inline-flex;
                      align-items:center;
                      justify-content:center;
                      min-height:30px;
                      padding:6px 10px;
                      border-radius:999px;
                      border:1px solid;
                      font-size:12px;
                      font-weight:700;
                      ${getPriorityTone(
                        item.priority
                      )}
                    "
                  >
                    ${escapeHtml(
                      getPriorityLabel(
                        item.priority
                      )
                    )}
                  </span>
                </td>

                <td>
                  ${escapeHtml(
                    item.assignedTo ||
                    "No asignado"
                  )}
                </td>

                <td>
                  <div class="table-main-cell">
                    <strong>
                      ${escapeHtml(
                        formatRelativeDate(
                          item.updatedAt
                        )
                      )}
                    </strong>

                    <span>
                      ${escapeHtml(
                        formatDate(
                          item.updatedAt
                        )
                      )}
                    </span>
                  </div>
                </td>

                <td>
                  <button
                    type="button"
                    class="btn btn-secondary"
                    data-action="open-ticket"
                    data-ticket-id="${escapeHtml(
                      item.ticketId ||
                      item.id ||
                      ""
                    )}"
                  >
                    Ver
                  </button>
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}
