/* =========================================================
   Onion SPA - Incidencias Actions
   Archivo: src/views/incidencias/incidencias.actions.js

   RESPONSABILIDADES:
   - abrir detalle ticket PRO
   - modal premium enterprise
   - soportar updates reales
   - timeline / metadata
   - adjuntos
   - copiar id
   - export csv
   - cerrar limpio
   - tolerancia payloads heterogéneos

   FIX CRÍTICO:
   - cliente object => nombre real
   - attachments reales
   - comments/history opcional
   - botones update listos
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  getIncidenciaByIdRequest,
} from "./incidencias.api.js";

import {
  getIncidenciaByIdStore,
  getSortedIncidenciasStore,
} from "./incidencias.store.js";

import {
  safeText,
  safeNumber,
  safeArray,
  safeObject,
  escapeHtml,
  formatDate,
  formatRelativeDate,
  showToast,
} from "./incidencias.utils.js";

/* =========================================================
   HELPERS
========================================================= */

function safeEmit(
  event = "",
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      event,
      payload
    );
  } catch {}
}

function modalId() {
  return "incidencias-modal";
}

function getBody() {
  return document.body;
}

function closeTicketModal() {
  try {
    document
      .getElementById(
        modalId()
      )
      ?.remove();
  } catch {}

  try {
    document.body.classList.remove(
      "modal-open"
    );
  } catch {}

  return true;
}

function pickDetail(
  payload = null
) {
  if (!payload) return null;
  if (payload.ticket) return payload.ticket;
  if (payload.data) return payload.data;
  if (payload.item) return payload.item;
  return payload;
}

function getId(item = {}) {
  return safeText(
    item.ticketId ||
      item.id ||
      item.code,
    "—"
  );
}

function getTitle(item = {}) {
  return safeText(
    item.title ||
      item.subject ||
      item.asunto,
    "Incidencia"
  );
}

function getDescription(
  item = {}
) {
  return safeText(
    item.description ||
      item.descripcion ||
      item.message ||
      item.preview,
    "Sin descripción."
  );
}

function getClient(
  item = {}
) {
  const c =
    item.client ||
    item.cliente ||
    item.customer;

  if (
    c &&
    typeof c === "object"
  ) {
    return safeText(
      c.name ||
        c.nombre ||
        c.company,
      "Cliente"
    );
  }

  return safeText(
    item.clientName ||
      c,
    "Cliente"
  );
}

function getEmail(
  item = {}
) {
  const c =
    item.client ||
    item.cliente;

  if (
    c &&
    typeof c === "object"
  ) {
    return safeText(
      c.email,
      "Sin email"
    );
  }

  return safeText(
    item.clientEmail ||
      item.email,
    "Sin email"
  );
}

function getAssigned(
  item = {}
) {
  const a =
    item.assignedTo ||
    item.assignee ||
    item.tecnico;

  if (
    a &&
    typeof a === "object"
  ) {
    return safeText(
      a.name,
      "No asignado"
    );
  }

  return safeText(
    a,
    "No asignado"
  );
}

function getStatus(
  item = {}
) {
  return safeText(
    item.status ||
      item.estado,
    "open"
  );
}

function getPriority(
  item = {}
) {
  return safeText(
    item.priority ||
      item.prioridad,
    "medium"
  );
}

function getAttachments(
  item = {}
) {
  return safeArray(
    item.attachments ||
      item.files ||
      item.adjuntos
  );
}

function getHistory(
  item = {}
) {
  return safeArray(
    item.history ||
      item.timeline ||
      item.logs ||
      item.comments
  );
}

function renderField(
  label,
  value
) {
  return `
    <div style="display:grid;gap:6px;">
      <span style="
        font-size:11px;
        color:var(--text-faint,#8b8b8b);
        text-transform:uppercase;
        letter-spacing:.08em;
        font-weight:700;
      ">
        ${escapeHtml(label)}
      </span>

      <strong style="
        color:var(--text-strong,#fff);
        font-size:15px;
        line-height:1.35;
      ">
        ${escapeHtml(value)}
      </strong>
    </div>
  `;
}

function renderAttachments(
  files = []
) {
  if (!files.length) {
    return `
      <div style="
        padding:14px;
        border-radius:16px;
        border:1px solid var(--border-soft,#2b2b2b);
        background:var(--surface-glass,#171717);
        color:#9a9a9a;
      ">
        Sin adjuntos
      </div>
    `;
  }

  return `
    <div style="
      display:grid;
      gap:10px;
    ">
      ${files
        .map((file, i) => {
          const item =
            safeObject(file);

          const name =
            safeText(
              item.name ||
                item.filename ||
                item.fileName,
              `archivo_${i + 1}`
            );

          const url =
            safeText(
              item.url ||
                item.href ||
                item.path,
              "#"
            );

          const size =
            safeNumber(
              item.size,
              0
            );

          return `
            <a
              href="${escapeHtml(url)}"
              target="_blank"
              rel="noopener"
              style="
                display:flex;
                justify-content:space-between;
                gap:14px;
                padding:14px;
                border-radius:16px;
                border:1px solid var(--border-soft,#2b2b2b);
                background:var(--surface-glass,#171717);
                text-decoration:none;
                color:#fff;
              "
            >
              <span>${escapeHtml(name)}</span>
              <span style="color:#8d8d8d;">
                ${size ? `${size} bytes` : ""}
              </span>
            </a>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderHistory(
  logs = []
) {
  if (!logs.length) {
    return "";
  }

  return `
    <section style="display:grid;gap:12px;">
      <h3 style="margin:0;">Actividad</h3>

      <div style="
        display:grid;
        gap:10px;
      ">
        ${logs
          .map((row) => {
            const item =
              safeObject(row);

            return `
              <div style="
                padding:14px;
                border-radius:16px;
                border:1px solid var(--border-soft,#2b2b2b);
                background:var(--surface-glass,#171717);
              ">
                <strong>${escapeHtml(
                  safeText(
                    item.title ||
                      item.action ||
                      item.message,
                    "Evento"
                  )
                )}</strong>

                <div style="
                  margin-top:6px;
                  color:#8f8f8f;
                  font-size:13px;
                ">
                  ${escapeHtml(
                    formatDate(
                      item.createdAt ||
                        item.date
                    )
                  )}
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

/* =========================================================
   MODAL
========================================================= */

export function renderTicketModal(
  detail = {}
) {
  closeTicketModal();

  const id =
    getId(detail);

  const title =
    getTitle(detail);

  const desc =
    getDescription(
      detail
    );

  const client =
    getClient(detail);

  const email =
    getEmail(detail);

  const status =
    getStatus(detail);

  const priority =
    getPriority(
      detail
    );

  const assigned =
    getAssigned(
      detail
    );

  const created =
    formatDate(
      detail.createdAt
    );

  const updated =
    formatDate(
      detail.updatedAt
    );

  const updatedAgo =
    formatRelativeDate(
      detail.updatedAt
    );

  const files =
    getAttachments(
      detail
    );

  const history =
    getHistory(detail);

  const root =
    document.createElement(
      "div"
    );

  root.id =
    modalId();

  root.innerHTML = `
    <div style="
      position:fixed;
      inset:0;
      z-index:9999;
      padding:28px;
      display:grid;
      place-items:center;
      background:rgba(0,0,0,.68);
      backdrop-filter:blur(10px);
    ">
      <div
        data-panel="1"
        style="
          width:min(1100px,100%);
          max-height:92vh;
          overflow:auto;
          border-radius:28px;
          border:1px solid var(--border-soft,#2b2b2b);
          background:#151515;
          box-shadow:0 40px 100px rgba(0,0,0,.45);
        "
      >

        <div style="
          padding:26px;
          border-bottom:1px solid var(--border-soft,#2b2b2b);
          display:flex;
          justify-content:space-between;
          gap:20px;
        ">
          <div style="display:grid;gap:8px;">
            <span style="
              color:#8d8d8d;
              font-size:12px;
              text-transform:uppercase;
              letter-spacing:.08em;
            ">
              Ticket ${escapeHtml(id)}
            </span>

            <h2 style="
              margin:0;
              font-size:42px;
              line-height:1;
              letter-spacing:-.04em;
            ">
              ${escapeHtml(title)}
            </h2>

            <span style="
              color:#9d9d9d;
              font-size:14px;
            ">
              Actualizado ${escapeHtml(updatedAgo)}
            </span>
          </div>

          <button
            data-close="1"
            style="
              width:54px;
              height:54px;
              border:none;
              border-radius:16px;
              cursor:pointer;
              font-size:22px;
              background:#242424;
              color:#fff;
            "
          >✕</button>
        </div>

        <div style="
          padding:26px;
          display:grid;
          gap:26px;
        ">

          <div style="
            display:grid;
            grid-template-columns:repeat(3,minmax(0,1fr));
            gap:18px;
          ">
            ${renderField("Estado", status)}
            ${renderField("Prioridad", priority)}
            ${renderField("Asignado", assigned)}
            ${renderField("Cliente", client)}
            ${renderField("Email", email)}
            ${renderField("Creado", created)}
          </div>

          <section style="display:grid;gap:10px;">
            <h3 style="margin:0;">Descripción</h3>

            <div style="
              padding:18px;
              border-radius:18px;
              background:#1f1f1f;
              border:1px solid #2a2a2a;
              line-height:1.65;
            ">
              ${escapeHtml(desc)}
            </div>
          </section>

          <section style="display:grid;gap:10px;">
            <h3 style="margin:0;">
              Adjuntos (${files.length})
            </h3>

            ${renderAttachments(files)}
          </section>

          ${renderHistory(history)}

          <div style="
            display:flex;
            justify-content:space-between;
            gap:12px;
            flex-wrap:wrap;
            padding-top:6px;
          ">
            <div style="
              display:flex;
              gap:10px;
              flex-wrap:wrap;
            ">
              <button
                data-action-modal="refresh"
                data-ticket-id="${escapeHtml(id)}"
                style="
                  min-height:44px;
                  padding:0 16px;
                  border:none;
                  border-radius:14px;
                  cursor:pointer;
                "
              >
                Actualizar
              </button>

              <button
                data-action-modal="copy"
                data-ticket-id="${escapeHtml(id)}"
                style="
                  min-height:44px;
                  padding:0 16px;
                  border:none;
                  border-radius:14px;
                  cursor:pointer;
                "
              >
                Copiar ID
              </button>
            </div>

            <button
              data-close="1"
              style="
                min-height:44px;
                padding:0 16px;
                border:none;
                border-radius:14px;
                cursor:pointer;
              "
            >
              Cerrar
            </button>
          </div>

        </div>
      </div>
    </div>
  `;

  getBody().appendChild(
    root
  );

  root.addEventListener(
    "click",
    async (event) => {
      const close =
        event.target.closest(
          "[data-close]"
        );

      const panel =
        event.target.closest(
          "[data-panel]"
        );

      const refresh =
        event.target.closest(
          '[data-action-modal="refresh"]'
        );

      const copy =
        event.target.closest(
          '[data-action-modal="copy"]'
        );

      if (close) {
        closeTicketModal();
        return;
      }

      if (
        refresh
      ) {
        const ticketId =
          refresh.dataset.ticketId;

        await openTicket(
          ticketId
        );
        return;
      }

      if (copy) {
        await navigator.clipboard.writeText(
          copy.dataset.ticketId
        );

        showToast(
          "ID copiado",
          "success"
        );

        return;
      }

      if (
        !panel &&
        event.target ===
          root.firstElementChild
      ) {
        closeTicketModal();
      }
    }
  );

  document.addEventListener(
    "keydown",
    function esc(ev) {
      if (
        ev.key === "Escape"
      ) {
        closeTicketModal();
        document.removeEventListener(
          "keydown",
          esc
        );
      }
    }
  );

  return true;
}

/* =========================================================
   OPEN
========================================================= */

export async function openTicket(
  payload = {}
) {
  const ticketId =
    typeof payload ===
    "string"
      ? payload
      : payload?.ticketId;

  const id =
    safeText(
      ticketId,
      ""
    );

  if (!id) {
    return null;
  }

  try {
    safeEmit(
      "incidencias:open",
      { ticketId: id }
    );

    let detail =
      getIncidenciaByIdStore(
        id
      );

    detail =
      await getIncidenciaByIdRequest(
        id
      ).catch(
        () => detail
      );

    detail =
      pickDetail(detail);

    if (!detail) {
      throw new Error(
        "EMPTY_DETAIL"
      );
    }

    renderTicketModal(
      detail
    );

    return detail;
  } catch (error) {
    console.error(
      error
    );

    showToast(
      "No se pudo abrir la incidencia.",
      "error"
    );

    return null;
  }
}

/* =========================================================
   COPY ID
========================================================= */

export async function copyTicketIdAction({
  ticketId = "",
} = {}) {
  const id =
    safeText(
      ticketId,
      ""
    );

  if (!id) return false;

  await navigator.clipboard.writeText(
    id
  );

  showToast(
    "ID copiado",
    "success"
  );

  return true;
}

/* =========================================================
   EXPORT
========================================================= */

export function exportIncidenciasCsvAction() {
  const items =
    getSortedIncidenciasStore();

  if (!items.length) {
    showToast(
      "No hay incidencias.",
      "info"
    );
    return false;
  }

  const rows =
    items.map(
      (item) =>
        `"${getId(item)}","${getTitle(item)}","${getStatus(item)}","${getPriority(item)}"`
    );

  const csv = [
    "ticketId,title,status,priority",
    ...rows,
  ].join("\n");

  const blob =
    new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

  const url =
    URL.createObjectURL(
      blob
    );

  const a =
    document.createElement(
      "a"
    );

  a.href = url;
  a.download =
    "incidencias.csv";

  document.body.appendChild(
    a
  );

  a.click();
  a.remove();

  URL.revokeObjectURL(
    url
  );

  showToast(
    "CSV exportado",
    "success"
  );

  return true;
}
