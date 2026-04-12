/* =========================================================
   Onion SPA - Incidencias Table Template
   Archivo: src/views/incidencias/incidencias.table.template.js

   Responsabilidades:
   - render header premium
   - render estados loading / error / empty
   - render tabla profesional incidencias
   - mantener compatibilidad con incidenciasView.js
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
   HEADER
========================================================= */

export function renderHeader() {
  const items = getIncidencias();

  return `
    <header class="view-header">
      <div class="view-header-main">
        <h1 class="view-title">Incidencias</h1>
        <p class="view-subtitle">
          Gestión centralizada de tickets e incidencias.
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

    <section class="stats-strip">
      <div class="stat-card">
        <span class="stat-label">Total</span>
        <strong class="stat-value">
          ${items.length}
        </strong>
      </div>

      <div class="stat-card">
        <span class="stat-label">
          Última sincronización
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
  const items = sortIncidenciasByUpdatedDesc(
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
        <table class="data-table">
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
                    ${escapeHtml(
                      item.code ||
                      item.id ||
                      "—"
                    )}
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
                            90
                          )
                        )}
                      </span>
                    </div>
                  </td>

                  <td>
                    ${escapeHtml(
                      item.client
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      getStatusLabel(
                        item.status
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      getPriorityLabel(
                        item.priority
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      item.assignedTo
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
