/* =========================================================
   Onion SPA - Incidencias Actions
   Archivo: src/views/incidencias/incidencias.actions.js

   Responsabilidades:
   - centralizar acciones operativas del módulo
   - abrir detalle del ticket EN MODAL REAL
   - copiar id / código
   - exportar CSV
   - desacoplar vista de lógica

   FIX CRÍTICO:
   - openTicket ahora abre modal visual real
   - soporta store + api
   - fallback robusto
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

function escapeHtml(
  value = ""
) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
    const textarea =
      document.createElement(
        "textarea"
      );

    textarea.value = value;
    textarea.style.position =
      "fixed";
    textarea.style.opacity =
      "0";

    document.body.appendChild(
      textarea
    );

    textarea.select();

    const ok =
      document.execCommand(
        "copy"
      );

    textarea.remove();

    return Boolean(ok);
  } catch {
    return false;
  }
}

/* =========================================================
   MODAL CORE
========================================================= */

function removeTicketModal() {
  try {
    document
      .getElementById(
        "ticket-detail-modal"
      )
      ?.remove();
  } catch {}
}

function bindCloseEvents(
  root
) {
  if (!root) return;

  const close =
    () => removeTicketModal();

  root
    .querySelectorAll(
      '[data-close-modal="true"]'
    )
    .forEach((el) =>
      el.addEventListener(
        "click",
        close
      )
    );

  root.addEventListener(
    "click",
    (e) => {
      if (e.target === root) {
        close();
      }
    }
  );

  document.addEventListener(
    "keydown",
    function esc(ev) {
      if (
        ev.key === "Escape"
      ) {
        close();
        document.removeEventListener(
          "keydown",
          esc
        );
      }
    }
  );
}

function renderTicketModal(
  detail = {}
) {
  removeTicketModal();

  const ticketId =
    safeText(
      detail.ticketId ||
        detail.id,
      "—"
    );

  const code =
    safeText(
      detail.code ||
        ticketId,
      ticketId
    );

  const title =
    safeText(
      detail.title ||
        detail.subject,
      "Incidencia"
    );

  const description =
    safeText(
      detail.description ||
        detail.preview ||
        detail.message,
      "Sin descripción."
    );

  const client =
    safeText(
      detail.client ||
        detail.clientName ||
        detail.cliente,
      "Cliente"
    );

  const email =
    safeText(
      detail.clientEmail ||
        detail.email,
      "Sin email"
    );

  const status =
    safeText(
      detail.status,
      "open"
    );

  const priority =
    safeText(
      detail.priority,
      "medium"
    );

  const assigned =
    safeText(
      detail.assignedTo,
      "No asignado"
    );

  const createdAt =
    safeText(
      detail.createdAt,
      "—"
    );

  const updatedAt =
    safeText(
      detail.updatedAt,
      "—"
    );

  const wrapper =
    document.createElement(
      "div"
    );

  wrapper.id =
    "ticket-detail-modal";

  wrapper.innerHTML = `
    <div
      style="
        position:fixed;
        inset:0;
        z-index:99999;
        display:grid;
        place-items:center;
        padding:20px;
        background:rgba(0,0,0,.68);
        backdrop-filter:blur(8px);
      "
    >
      <section
        style="
          width:min(920px,100%);
          max-height:90vh;
          overflow:auto;
          border-radius:24px;
          border:1px solid var(--border-soft,#2a2a2a);
          background:var(--surface-1,#111827);
          color:var(--text-strong,#fff);
          box-shadow:0 30px 80px rgba(0,0,0,.45);
        "
      >
        <header
          style="
            display:flex;
            justify-content:space-between;
            gap:12px;
            padding:22px;
            border-bottom:1px solid var(--border-soft,#2a2a2a);
          "
        >
          <div style="display:grid;gap:6px;">
            <span style="font-size:12px;opacity:.7;text-transform:uppercase;">
              Ticket ${escapeHtml(code)}
            </span>

            <h3 style="margin:0;font-size:24px;">
              ${escapeHtml(title)}
            </h3>
          </div>

          <button
            data-close-modal="true"
            type="button"
            style="
              width:42px;
              height:42px;
              border:none;
              border-radius:12px;
              cursor:pointer;
              background:rgba(255,255,255,.08);
              color:#fff;
              font-size:18px;
            "
          >
            ✕
          </button>
        </header>

        <div
          style="
            display:grid;
            gap:18px;
            padding:22px;
          "
        >
          <div
            style="
              display:grid;
              grid-template-columns:repeat(3,minmax(0,1fr));
              gap:12px;
            "
          >
            <div><strong>Estado:</strong><br>${escapeHtml(status)}</div>
            <div><strong>Prioridad:</strong><br>${escapeHtml(priority)}</div>
            <div><strong>Asignado:</strong><br>${escapeHtml(assigned)}</div>
          </div>

          <div
            style="
              display:grid;
              grid-template-columns:repeat(2,minmax(0,1fr));
              gap:12px;
            "
          >
            <div><strong>Cliente:</strong><br>${escapeHtml(client)}</div>
            <div><strong>Email:</strong><br>${escapeHtml(email)}</div>
          </div>

          <div>
            <strong>Descripción</strong>
            <div
              style="
                margin-top:8px;
                padding:16px;
                border-radius:16px;
                background:rgba(255,255,255,.04);
                line-height:1.6;
              "
            >
              ${escapeHtml(description)}
            </div>
          </div>

          <div
            style="
              display:grid;
              grid-template-columns:repeat(2,minmax(0,1fr));
              gap:12px;
              font-size:14px;
              opacity:.8;
            "
          >
            <div>Creado: ${escapeHtml(createdAt)}</div>
            <div>Actualizado: ${escapeHtml(updatedAt)}</div>
          </div>

          <div
            style="
              display:flex;
              gap:10px;
              justify-content:flex-end;
              flex-wrap:wrap;
            "
          >
            <button
              data-close-modal="true"
              type="button"
              style="
                min-height:42px;
                padding:0 16px;
                border-radius:12px;
                border:1px solid var(--border-soft,#333);
                background:transparent;
                color:#fff;
                cursor:pointer;
              "
            >
              Cerrar
            </button>
          </div>
        </div>
      </section>
    </div>
  `;

  document.body.appendChild(
    wrapper
  );

  bindCloseEvents(
    wrapper.firstElementChild
  );
}

/* =========================================================
   OPEN DETAIL
========================================================= */

export async function openTicket(
  ticketIdOrOptions = {}
) {
  const options =
    typeof ticketIdOrOptions ===
    "string"
      ? {
          ticketId:
            ticketIdOrOptions,
        }
      : ticketIdOrOptions;

  const id =
    safeText(
      options.ticketId,
      ""
    );

  if (!id) {
    return null;
  }

  try {
    safeEmit(
      "incidencias:open",
      {
        ticketId: id,
      }
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

    if (!detail) {
      throw new Error(
        "NOT_FOUND"
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
      "❌ OPEN TICKET:",
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
  ticketCode = "",
} = {}) {
  const raw =
    safeText(
      ticketCode,
      ""
    ) ||
    safeText(
      ticketId,
      ""
    );

  if (!raw) {
    return false;
  }

  const ok =
    await copyText(raw);

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
  const list =
    getSortedIncidenciasStore();

  if (!list.length) {
    showToast(
      "No hay incidencias para exportar.",
      "info"
    );
    return false;
  }

  const csv = JSON.stringify(
    list,
    null,
    2
  );

  const blob =
    new Blob(
      [csv],
      {
        type: "application/json",
      }
    );

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
    "incidencias.json";

  document.body.appendChild(
    a
  );

  a.click();
  a.remove();

  URL.revokeObjectURL(
    url
  );

  showToast(
    "Exportación generada.",
    "success"
  );

  return true;
}
