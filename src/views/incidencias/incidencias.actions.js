/* =========================================================
   Onion SPA - Incidencias Actions
   Archivo: src/views/incidencias/incidencias.actions.js

   RESPONSABILIDADES:
   - centralizar acciones operativas del módulo
   - abrir detalle ticket REAL
   - pintar modal premium
   - copiar id / código
   - export csv
   - desacoplar view de lógica

   FIX CRÍTICO:
   - apiClient devuelve payload directo
   - openTicket recibía string pero esperaba object
   - no existía modal renderer real
   - fallback store/api robusto

   HARDENING PRO:
   - cero throws UI
   - modal idempotente
   - cleanup seguro
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
  escapeHtml,
  formatDate,
  showToast,
} from "./incidencias.utils.js";

/* =========================================================
   HELPERS
========================================================= */

function safeEmit(
  eventName = "",
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

function getBody() {
  try {
    return document.body || null;
  } catch {
    return null;
  }
}

function getModalId() {
  return "incidencias-ticket-modal";
}

function removeExistingModal() {
  try {
    document
      .getElementById(
        getModalId()
      )
      ?.remove?.();
  } catch {}
}

async function copyText(
  text = ""
) {
  const value =
    safeText(text, "");

  if (!value) {
    return false;
  }

  try {
    if (
      navigator?.clipboard
        ?.writeText
    ) {
      await navigator.clipboard.writeText(
        value
      );
      return true;
    }
  } catch {}

  try {
    const el =
      document.createElement(
        "textarea"
      );

    el.value = value;
    el.style.position =
      "fixed";
    el.style.opacity =
      "0";

    document.body.appendChild(
      el
    );

    el.select();

    const ok =
      document.execCommand(
        "copy"
      );

    el.remove();

    return Boolean(ok);
  } catch {
    return false;
  }
}

/* =========================================================
   DETAIL HELPERS
========================================================= */

function pickDetail(
  payload = null
) {
  if (!payload) {
    return null;
  }

  if (payload.ticket) {
    return payload.ticket;
  }

  if (payload.data) {
    return payload.data;
  }

  return payload;
}

function resolveId(
  item = {}
) {
  return safeText(
    item.ticketId ||
      item.id ||
      item.code,
    "—"
  );
}

function resolveTitle(
  item = {}
) {
  return safeText(
    item.title ||
      item.subject ||
      item.asunto,
    "Incidencia"
  );
}

function resolveDescription(
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

function resolveClient(
  item = {}
) {
  return safeText(
    item.client ||
      item.clientName ||
      item.cliente ||
      item?.cliente?.nombre,
    "Cliente"
  );
}

function resolveEmail(
  item = {}
) {
  return safeText(
    item.clientEmail ||
      item.email ||
      item?.cliente?.email,
    "Sin email"
  );
}

function resolveStatus(
  item = {}
) {
  return safeText(
    item.status ||
      item.estado,
    "open"
  );
}

function resolvePriority(
  item = {}
) {
  return safeText(
    item.priority ||
      item.prioridad,
    "medium"
  );
}

function resolveAssigned(
  item = {}
) {
  return safeText(
    item.assignedTo ||
      item.assignee ||
      item?.tecnico?.name,
    "No asignado"
  );
}

/* =========================================================
   MODAL
========================================================= */

export function closeTicketModal() {
  removeExistingModal();

  try {
    document.body.classList.remove(
      "modal-open"
    );
  } catch {}

  return true;
}

export function renderTicketModal(
  detail = {}
) {
  const body = getBody();

  if (!body) {
    return false;
  }

  closeTicketModal();

  const id =
    resolveId(detail);

  const title =
    resolveTitle(detail);

  const description =
    resolveDescription(
      detail
    );

  const client =
    resolveClient(detail);

  const email =
    resolveEmail(detail);

  const status =
    resolveStatus(detail);

  const priority =
    resolvePriority(
      detail
    );

  const assigned =
    resolveAssigned(
      detail
    );

  const createdAt =
    formatDate(
      detail.createdAt
    );

  const updatedAt =
    formatDate(
      detail.updatedAt
    );

  const modal =
    document.createElement(
      "div"
    );

  modal.id =
    getModalId();

  modal.innerHTML = `
    <div
      data-role="overlay"
      style="
        position:fixed;
        inset:0;
        z-index:9999;
        display:grid;
        place-items:center;
        padding:24px;
        background:rgba(0,0,0,.62);
        backdrop-filter:blur(8px);
      "
    >
      <div
        style="
          width:min(860px,100%);
          max-height:90vh;
          overflow:auto;
          border-radius:24px;
          border:1px solid var(--border-soft,#2a2a2a);
          background:var(--surface-1,#111);
          box-shadow:0 30px 80px rgba(0,0,0,.45);
        "
      >
        <div
          style="
            display:flex;
            justify-content:space-between;
            gap:16px;
            padding:24px;
            border-bottom:1px solid var(--border-soft,#2a2a2a);
          "
        >
          <div style="display:grid;gap:8px;">
            <span style="font-size:12px;color:#999;text-transform:uppercase;">
              Ticket
            </span>

            <h2 style="margin:0;font-size:28px;">
              ${escapeHtml(id)}
            </h2>

            <strong style="font-size:18px;">
              ${escapeHtml(title)}
            </strong>
          </div>

          <button
            data-close-modal="1"
            style="
              width:42px;
              height:42px;
              border:none;
              border-radius:12px;
              cursor:pointer;
            "
          >
            ✕
          </button>
        </div>

        <div
          style="
            padding:24px;
            display:grid;
            gap:18px;
          "
        >
          <div>
            <strong>Descripción</strong>
            <p>${escapeHtml(description)}</p>
          </div>

          <div
            style="
              display:grid;
              grid-template-columns:repeat(2,minmax(0,1fr));
              gap:14px;
            "
          >
            <div><strong>Cliente:</strong> ${escapeHtml(client)}</div>
            <div><strong>Email:</strong> ${escapeHtml(email)}</div>
            <div><strong>Estado:</strong> ${escapeHtml(status)}</div>
            <div><strong>Prioridad:</strong> ${escapeHtml(priority)}</div>
            <div><strong>Asignado:</strong> ${escapeHtml(assigned)}</div>
            <div><strong>Creado:</strong> ${escapeHtml(createdAt)}</div>
            <div><strong>Actualizado:</strong> ${escapeHtml(updatedAt)}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  body.appendChild(modal);

  body.classList.add(
    "modal-open"
  );

  modal.addEventListener(
    "click",
    (event) => {
      const closeBtn =
        event.target.closest(
          "[data-close-modal]"
        );

      const overlay =
        event.target.closest(
          '[data-role="overlay"]'
        );

      const panel =
        event.target.closest(
          '[style*="max-height:90vh"]'
        );

      if (closeBtn) {
        closeTicketModal();
        return;
      }

      if (
        overlay &&
        !panel
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
   OPEN DETAIL
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

    if (!detail) {
      detail =
        await getIncidenciaByIdRequest(
          id
        );
    }

    detail =
      pickDetail(detail);

    if (!detail) {
      throw new Error(
        "DETAIL_EMPTY"
      );
    }

    renderTicketModal(
      detail
    );

    safeEmit(
      "incidencias:detail:ready",
      {
        ticketId: id,
        detail,
      }
    );

    return detail;
  } catch (error) {
    console.error(
      "❌ openTicket:",
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
   COPY
========================================================= */

export async function copyTicketIdAction({
  ticketId = "",
  ticketCode = "",
} = {}) {
  const value =
    safeText(
      ticketCode,
      ""
    ) ||
    safeText(
      ticketId,
      ""
    );

  if (!value) {
    return false;
  }

  const ok =
    await copyText(value);

  showToast(
    ok
      ? "Identificador copiado."
      : "No se pudo copiar.",
    ok
      ? "success"
      : "error"
  );

  return ok;
}

/* =========================================================
   EXPORT CSV
========================================================= */

export function exportIncidenciasCsvAction() {
  const items =
    getSortedIncidenciasStore();

  if (!items.length) {
    showToast(
      "No hay incidencias para exportar.",
      "info"
    );
    return false;
  }

  const rows =
    items.map((item) =>
      [
        resolveId(item),
        resolveTitle(item),
        resolveStatus(item),
        resolvePriority(item),
      ].join(",")
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
  a.download = `incidencias_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  document.body.appendChild(
    a
  );

  a.click();
  a.remove();

  URL.revokeObjectURL(url);

  showToast(
    "CSV exportado.",
    "success"
  );

  return true;
}
