/* =========================================================
   Onion SPA - Incidencias Actions
   Archivo: src/views/incidencias/incidencias.actions.js

   Responsabilidades:
   - centralizar acciones operativas del módulo de incidencias
   - abrir detalle del ticket
   - copiar id / código del ticket
   - exportar colección a CSV
   - desacoplar la vista principal de la lógica de acciones
   - dejar base limpia para futuras acciones de update / assign / close
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

function safeEmit(eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

async function copyText(text = "") {
  const value = safeText(text, "");

  if (!value) {
    return false;
  }

  try {
    if (
      navigator?.clipboard?.writeText
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
    textarea.setAttribute(
      "readonly",
      "true"
    );
    textarea.style.position =
      "fixed";
    textarea.style.opacity =
      "0";
    textarea.style.pointerEvents =
      "none";

    document.body.appendChild(
      textarea
    );
    textarea.select();
    textarea.setSelectionRange(
      0,
      textarea.value.length
    );

    const success =
      document.execCommand(
        "copy"
      );

    textarea.remove();

    return Boolean(success);
  } catch {
    return false;
  }
}

/* =========================================================
   OPEN DETAIL
========================================================= */

export async function openTicket({
  ticketId = "",
  emitOpenEvent = true,
  loadTicketDetail,
  useStoreFirst = true,
} = {}) {
  const id = safeText(
    ticketId,
    ""
  );

  if (!id) {
    return null;
  }

  try {
    if (
      emitOpenEvent &&
      typeof AppCore?.events?.emit ===
        "function"
    ) {
      safeEmit(
        "incidencias:open",
        {
          ticketId: id,
        }
      );
    }

    if (
      typeof loadTicketDetail ===
      "function"
    ) {
      return await loadTicketDetail(
        id
      );
    }

    if (useStoreFirst) {
      const local =
        getIncidenciaByIdStore(
          id
        );

      if (local) {
        safeEmit(
          "incidencias:detail:ready",
          {
            ticketId: id,
            detail: local,
            source: "store",
          }
        );

        return local;
      }
    }

    const response =
      await getIncidenciaByIdRequest(
        id
      );

    safeEmit(
      "incidencias:detail:ready",
      {
        ticketId: id,
        detail: response,
        source: "api",
      }
    );

    return response;
  } catch (error) {
    console.error(
      "❌ INCIDENCIAS OPEN DETAIL:",
      error
    );

    showToast(
      "No se pudo abrir el detalle de la incidencia.",
      "error"
    );

    return null;
  }
}

/* =========================================================
   COPY ID / CODE
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
    showToast(
      "No se encontró identificador para copiar.",
      "info"
    );
    return false;
  }

  try {
    const ok =
      await copyText(raw);

    if (!ok) {
      throw new Error(
        "COPY_FAILED"
      );
    }

    showToast(
      "Identificador copiado al portapapeles.",
      "success"
    );

    safeEmit(
      "incidencias:copied",
      {
        ticketId: safeText(
          ticketId,
          ""
        ),
        ticketCode: safeText(
          ticketCode,
          ""
        ),
        value: raw,
      }
    );

    return true;
  } catch (error) {
    console.error(
      "❌ INCIDENCIAS COPY ID:",
      error
    );

    showToast(
      "No se pudo copiar el identificador.",
      "error"
    );

    return false;
  }
}

/* =========================================================
   EXPORT CSV
========================================================= */

export function exportIncidenciasCsvAction({
  items = null,
  filenamePrefix = "incidencias",
} = {}) {
  const list =
    Array.isArray(items)
      ? items
      : getSortedIncidenciasStore();

  if (!list.length) {
    showToast(
      "No hay incidencias para exportar.",
      "info"
    );
    return false;
  }

  const headers = [
    "ticketId",
    "code",
    "title",
    "description",
    "client",
    "clientEmail",
    "status",
    "priority",
    "assignedTo",
    "createdAt",
    "updatedAt",
    "attachmentsCount",
  ];

  const rows = list.map(
    (item) => ({
      ticketId:
        item?.ticketId ||
        item?.id ||
        "",
      code:
        item?.code ||
        item?.ticketId ||
        item?.id ||
        "",
      title:
        item?.title ||
        item?.subject ||
        "",
      description:
        item?.description ||
        item?.preview ||
        "",
      client:
        item?.client ||
        item?.clientName ||
        item?.cliente ||
        "",
      clientEmail:
        item?.clientEmail ||
        item?.email ||
        "",
      status:
        item?.status || "",
      priority:
        item?.priority || "",
      assignedTo:
        item?.assignedTo ||
        "",
      createdAt:
        item?.createdAt ||
        "",
      updatedAt:
        item?.updatedAt ||
        "",
      attachmentsCount:
        safeNumber(
          item?.attachmentsCount,
          0
        ),
    })
  );

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map(
          (key) =>
            `"${String(
              row[key] ?? ""
            ).replaceAll(
              '"',
              '""'
            )}"`
        )
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob(
    [csv],
    {
      type: "text/csv;charset=utf-8;",
    }
  );

  const url =
    URL.createObjectURL(
      blob
    );

  const anchor =
    document.createElement(
      "a"
    );

  anchor.href = url;
  anchor.download = `${safeText(
    filenamePrefix,
    "incidencias"
  )}_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  document.body.appendChild(
    anchor
  );
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);

  showToast(
    "Exportación CSV generada.",
    "success"
  );

  safeEmit(
    "incidencias:exported",
    {
      total: list.length,
      filenamePrefix:
        safeText(
          filenamePrefix,
          "incidencias"
        ),
    }
  );

  return true;
}
