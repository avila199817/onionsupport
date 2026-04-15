/* =========================================================
   Onion SPA - Incidencias Table Template
   Archivo: src/views/incidencias/incidencias.table.template.js

   EXTREME MODE · 10/10
   Responsabilidades:
   - render header premium
   - render loading / error / empty
   - render tabla desktop ultra limpia
   - render cards mobile premium
   - compatibilidad total con incidenciasView.js
   - tolerancia máxima a datos inconsistentes
   - corregido problema de textos no visibles
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
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n)
    ? n
    : fallback;
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

function getStatusLabel(status = "") {
  const key = String(status || "")
    .trim()
    .toLowerCase();

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
  const key = String(priority || "")
    .trim()
    .toLowerCase();

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
  const key = String(status || "")
    .trim()
    .toLowerCase();

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
  const key = String(priority || "")
    .trim()
    .toLowerCase();

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

function chip(label = "", style = "") {
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
        font-weight:800;
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

function getCode(item = {}) {
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

function getId(item = {}) {
  return safeText(
    first(
      item.ticketId,
      item.id
    ),
    ""
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

function getClient(item = {}) {
  return safeText(
    first(
      item.client,
      item.cliente,
      item.clientName,
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

function getInitials(item = {}) {
  const base = getClient(item);

  const parts = base
    .split(/\s+/)
    .filter(Boolean);

  const initials = parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

  return (
    initials ||
    base.slice(0, 2) ||
    "ON"
  ).toUpperCase();
}

/* =========================================================
   STATS
========================================================= */

function computeStats(items = []) {
  const list = safeArray(items);

  return {
    total: list.length,

    openCount: list.filter(
      (x) => x?.status === "open"
    ).length,

    inProgressCount: list.filter((x) =>
      [
        "pending",
        "in_progress",
        "in-progress",
      ].includes(x?.status)
    ).length,

    closedCount: list.filter((x) =>
      ["resolved", "closed"].includes(
        x?.status
      )
    ).length,

    urgentCount: list.filter(
      (x) => x?.priority === "urgent"
    ).length,

    assignedCount: list.filter(
      (x) =>
        getAssigned(x) !==
        "No asignado"
    ).length,
  };
}

/* =========================================================
   HEADER
========================================================= */

function statCard({
  label = "",
  value = "0",
  caption = "",
} = {}) {
  return `
    <article
      style="
        display:grid;
        gap:10px;
        min-height:126px;
        padding:20px;
        border-radius:22px;
        border:1px solid var(--border-soft);
        background:var(--surface-1,var(--surface-glass));
      "
    >
      <span
        style="
          font-size:12px;
          color:var(--text-dim);
          text-transform:uppercase;
          letter-spacing:.08em;
          font-weight:800;
        "
      >
        ${escapeHtml(label)}
      </span>

      <strong
        style="
          font-size:34px;
          line-height:1;
          color:var(--text-strong);
          letter-spacing:-.04em;
          font-weight:900;
        "
      >
        ${escapeHtml(value)}
      </strong>

      <span
        style="
          color:var(--text-dim);
          font-size:13px;
          line-height:1.45;
        "
      >
        ${escapeHtml(caption)}
      </span>
    </article>
  `;
}

export function renderHeader({
  items,
  state,
} = {}) {
  const list = safeArray(items).length
    ? safeArray(items)
    : sortIncidenciasByUpdatedDesc(
        getIncidencias()
      );

  const localState =
    state ||
    incidenciasState ||
    {};

  const stats =
    computeStats(list);

  const lastSync =
    localState?.lastSyncAt
      ? formatRelativeDate(
          localState.lastSyncAt
        )
      : "Sin sincronización";

  return `
    <section
      style="
        display:grid;
        gap:22px;
        padding:26px;
        border-radius:28px;
        border:1px solid var(--border-soft);
        background:
          linear-gradient(
            180deg,
            color-mix(in srgb,var(--accent,#7c5cff) 7%,transparent),
            transparent
          ),
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
              width:max-content;
              min-height:28px;
              padding:0 12px;
              border-radius:999px;
              border:1px solid var(--border-soft);
              display:inline-flex;
              align-items:center;
              font-size:12px;
              font-weight:800;
              letter-spacing:.06em;
              text-transform:uppercase;
              color:var(--text-dim);
            "
          >
            Soporte técnico
          </span>

          <h1
            style="
              margin:0;
              font-size:clamp(30px,5vw,48px);
              line-height:.96;
              letter-spacing:-.05em;
              color:var(--text-strong);
            "
          >
            Centro de control de incidencias
          </h1>

          <p
            style="
              margin:0;
              color:var(--text-dim);
              max-width:760px;
              line-height:1.65;
            "
          >
            Supervisa tickets,
            prioridades,
            asignaciones y actividad
            operativa en tiempo real.
          </p>
        </div>

        <div
          style="
            display:flex;
            gap:10px;
            flex-wrap:wrap;
            align-items:start;
          "
        >
          <button
            id="incidencias-export-btn"
            type="button"
            class="btn-secondary"
          >
            Exportar CSV
          </button>

          <button
            id="incidencias-refresh-btn"
            type="button"
            class="btn-primary"
          >
            Actualizar
          </button>
        </div>
      </div>

      <div
        style="
          display:flex;
          gap:10px;
          flex-wrap:wrap;
        "
      >
        ${chip(
          `${list.length} visibles`,
          `
            color:var(--text-soft);
            background:var(--surface-glass);
            border:1px solid var(--border-soft);
          `
        )}

        ${chip(
          `Última sync · ${lastSync}`,
          `
            color:var(--text-soft);
            background:var(--surface-glass);
            border:1px solid var(--border-soft);
          `
        )}
      </div>

      <div
        class="inc-grid-hero"
        style="
          display:grid;
          grid-template-columns:repeat(5,minmax(0,1fr));
          gap:16px;
        "
      >
        ${statCard({
          label: "Visibles",
          value: String(
            stats.total
          ),
          caption:
            "Registros cargados en pantalla.",
        })}

        ${statCard({
          label: "Abiertas",
          value: String(
            stats.openCount
          ),
          caption:
            "Pendientes de atención.",
        })}

        ${statCard({
          label: "En curso",
          value: String(
            stats.inProgressCount
          ),
          caption:
            "Seguimiento activo.",
        })}

        ${statCard({
          label: "Urgentes",
          value: String(
            stats.urgentCount
          ),
          caption:
            "Máxima prioridad.",
        })}

        ${statCard({
          label: "Asignadas",
          value: String(
            stats.assignedCount
          ),
          caption:
            `${stats.closedCount} cerradas.`,
        })}
      </div>

      <style>
        @media (max-width:1180px){
          .inc-grid-hero{
            grid-template-columns:repeat(2,minmax(0,1fr)) !important;
          }
        }

        @media (max-width:720px){
          .inc-grid-hero{
            grid-template-columns:1fr !important;
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
        border-radius:24px;
        border:1px solid var(--border-soft);
        background:var(--surface-1,var(--surface-glass));
        color:var(--text-dim);
      "
    >
      Cargando incidencias...
    </section>
  `;
}

export function renderErrorState(
  message = ""
) {
  return `
    <section
      style="
        padding:28px;
        border-radius:24px;
        border:1px solid rgba(239,68,68,.22);
        background:rgba(239,68,68,.06);
        color:#fca5a5;
      "
    >
      ${escapeHtml(
        safeText(
          message,
          "Error cargando incidencias."
        )
      )}
    </section>
  `;
}

export function renderEmptyState() {
  return `
    <section
      style="
        padding:28px;
        border-radius:24px;
        border:1px dashed var(--border-soft);
        background:var(--surface-1,var(--surface-glass));
        color:var(--text-dim);
      "
    >
      No hay incidencias disponibles.
    </section>
  `;
}

/* =========================================================
   ROW
========================================================= */

function row(item = {}) {
  const id = getId(item);
  const code = getCode(item);
  const title = getTitle(item);
  const preview = truncate(
    getPreview(item),
    100
  );
  const client = getClient(item);
  const email =
    getClientEmail(item);
  const assigned =
    getAssigned(item);

  const status =
    getStatusLabel(item.status);

  const priority =
    getPriorityLabel(
      item.priority
    );

  return `
    <tr>
      <td class="inc-td">
        <strong>${escapeHtml(code)}</strong>
        <div class="inc-sub">
          Ticket
        </div>
      </td>

      <td class="inc-td">
        <div class="inc-main">
          <div class="inc-avatar">
            ${escapeHtml(
              getInitials(item)
            )}
          </div>

          <div class="inc-copy">
            <button
              type="button"
              data-action="open-ticket"
              data-ticket-id="${escapeHtml(id)}"
              class="inc-link"
            >
              ${escapeHtml(title)}
            </button>

            <span class="inc-sub">
              ${escapeHtml(preview)}
            </span>
          </div>
        </div>
      </td>

      <td class="inc-td">
        <strong>
          ${escapeHtml(client)}
        </strong>

        <div class="inc-sub">
          ${escapeHtml(email)}
        </div>
      </td>

      <td class="inc-td">
        ${chip(
          status,
          getStatusChipStyle(
            item.status
          )
        )}
      </td>

      <td class="inc-td">
        ${chip(
          priority,
          getPriorityChipStyle(
            item.priority
          )
        )}
      </td>

      <td class="inc-td">
        ${escapeHtml(
          assigned
        )}
      </td>

      <td class="inc-td">
        <strong>
          ${escapeHtml(
            safeText(
              formatRelativeDate(
                item.updatedAt
              ),
              "Sin fecha"
            )
          )}
        </strong>

        <div class="inc-sub">
          ${escapeHtml(
            safeText(
              formatDate(
                item.updatedAt
              ),
              "—"
            )
          )}
        </div>
      </td>

      <td class="inc-td inc-right">
        <button
          type="button"
          data-action="open-ticket"
          data-ticket-id="${escapeHtml(id)}"
          class="btn-secondary btn-sm"
        >
          Ver
        </button>

        <button
          type="button"
          data-action="copy-ticket-id"
          data-ticket-id="${escapeHtml(id)}"
          data-ticket-code="${escapeHtml(code)}"
          class="btn-primary btn-sm"
        >
          Copiar ID
        </button>
      </td>
    </tr>
  `;
}

/* =========================================================
   TABLE
========================================================= */

function desktop(items = []) {
  return `
    <div class="inc-scroll">
      <table class="inc-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Incidencia</th>
            <th>Cliente</th>
            <th>Estado</th>
            <th>Prioridad</th>
            <th>Asignado</th>
            <th>Actualización</th>
            <th class="inc-right">
              Acciones
            </th>
          </tr>
        </thead>

        <tbody>
          ${safeArray(items)
            .map(row)
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function mobile(items = []) {
  return `
    <div class="inc-mobile">
      ${safeArray(items)
        .map((item) => `
          <article class="inc-card">
            <div class="inc-card-top">
              <div>
                <div class="inc-sub">
                  ${escapeHtml(
                    getCode(item)
                  )}
                </div>

                <strong class="inc-card-title">
                  ${escapeHtml(
                    getTitle(item)
                  )}
                </strong>
              </div>

              <div class="inc-stack">
                ${chip(
                  getStatusLabel(
                    item.status
                  ),
                  getStatusChipStyle(
                    item.status
                  )
                )}

                ${chip(
                  getPriorityLabel(
                    item.priority
                  ),
                  getPriorityChipStyle(
                    item.priority
                  )
                )}
              </div>
            </div>

            <div class="inc-card-body">
              <div>
                <span class="inc-sub">
                  Cliente
                </span>
                <strong>
                  ${escapeHtml(
                    getClient(item)
                  )}
                </strong>
              </div>

              <div>
                <span class="inc-sub">
                  Asignado
                </span>
                <strong>
                  ${escapeHtml(
                    getAssigned(item)
                  )}
                </strong>
              </div>
            </div>
          </article>
        `)
        .join("")}
    </div>
  `;
}

/* =========================================================
   MAIN
========================================================= */

export function renderTable({
  items,
  state,
} = {}) {
  const localState =
    state ||
    incidenciasState ||
    {};

  const list = safeArray(items).length
    ? safeArray(items)
    : sortIncidenciasByUpdatedDesc(
        getIncidencias()
      );

  if (
    localState.loading &&
    !list.length
  ) {
    return renderLoadingState();
  }

  if (
    localState.error &&
    !list.length
  ) {
    return renderErrorState(
      localState.error
    );
  }

  if (!list.length) {
    return renderEmptyState();
  }

  return `
    <section
      style="
        overflow:hidden;
        border-radius:26px;
        border:1px solid var(--border-soft);
        background:var(--surface-1,var(--surface-glass));
      "
    >
      <div
        style="
          padding:18px 20px;
          border-bottom:1px solid var(--border-soft);
          display:flex;
          justify-content:space-between;
          gap:12px;
          flex-wrap:wrap;
        "
      >
        <div>
          <strong
            style="
              color:var(--text-strong);
            "
          >
            Tabla de incidencias
          </strong>

          <div class="inc-sub">
            ${list.length}
            registros visibles
          </div>
        </div>

        ${chip(
          "Vista tabla",
          `
            color:var(--text-soft);
            background:var(--surface-glass);
            border:1px solid var(--border-soft);
          `
        )}
      </div>

      <div class="inc-desktop">
        ${desktop(list)}
      </div>

      ${mobile(list)}

      <style>
        .inc-scroll{
          overflow:auto;
          width:100%;
        }

        .inc-table{
          width:100%;
          min-width:1240px;
          border-collapse:separate;
          border-spacing:0;
        }

        .inc-table th{
          padding:16px 18px;
          text-align:left;
          font-size:12px;
          letter-spacing:.08em;
          text-transform:uppercase;
          color:var(--text-dim);
          border-bottom:1px solid var(--border-soft);
          white-space:nowrap;
        }

        .inc-td{
          padding:18px;
          border-bottom:1px solid var(--border-soft);
          vertical-align:middle;
          color:var(--text-soft);
        }

        .inc-right{
          text-align:right;
          white-space:nowrap;
        }

        .inc-sub{
          color:var(--text-dim);
          font-size:12px;
          line-height:1.4;
        }

        .inc-main{
          display:flex;
          gap:14px;
          min-width:320px;
          align-items:flex-start;
        }

        .inc-avatar{
          width:44px;
          height:44px;
          border-radius:14px;
          display:grid;
          place-items:center;
          font-weight:900;
          color:var(--text-strong);
          background:
            linear-gradient(
              135deg,
              color-mix(in srgb,var(--accent,#7c5cff) 22%,transparent),
              transparent
            ),
            var(--surface-glass);
          border:1px solid var(--border-soft);
          flex:0 0 auto;
        }

        .inc-copy{
          display:grid;
          gap:5px;
          min-width:0;
          flex:1;
        }

        .inc-link{
          margin:0;
          padding:0;
          border:none;
          background:transparent;
          text-align:left;
          color:var(--text-strong);
          font-weight:900;
          cursor:pointer;
          font-size:15px;
          line-height:1.25;
        }

        .inc-table tbody tr:hover{
          background:
            color-mix(
              in srgb,
              var(--accent,#7c5cff) 4%,
              transparent
            );
        }

        .inc-mobile{
          display:none;
          gap:14px;
          padding:14px;
        }

        .inc-card{
          display:grid;
          gap:14px;
          padding:18px;
          border-radius:18px;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
        }

        .inc-card-top{
          display:flex;
          justify-content:space-between;
          gap:12px;
        }

        .inc-card-title{
          color:var(--text-strong);
          display:block;
          margin-top:4px;
        }

        .inc-card-body{
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:12px;
        }

        .inc-stack{
          display:grid;
          gap:8px;
          justify-items:end;
        }

        @media (max-width:980px){
          .inc-desktop{
            display:none !important;
          }

          .inc-mobile{
            display:grid !important;
          }
        }

        @media (max-width:680px){
          .inc-card-body{
            grid-template-columns:1fr;
          }
        }
      </style>
    </section>
  `;
}

export function renderCards({
  items,
  state,
} = {}) {
  return renderTable({
    items,
    state,
  });
}
