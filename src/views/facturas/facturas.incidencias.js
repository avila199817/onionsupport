/* =========================================================
   Onion SPA - Facturas Incidencias Bridge
   Archivo: src/views/facturas/facturas.incidencias.js

   RESPONSABILIDADES:
   - abrir el modal de incidencias desde la tabla de facturas
   - evitar navegación a rutas inexistentes
   - importar lazy incidencias.modal.js
   - abrir con fallback inmediato
   - cargar detalle real desde API y actualizar modal
========================================================= */

import { AppCore } from "../../core/index.js";
import { getFacturaByIdStore } from "./facturas.store.js";

/* =========================================================
   CONSTANTS
========================================================= */

const INCIDENCIA_DETAIL_TIMEOUT = 90000;

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    return value;
  }

  return null;
}

function encodeSegment(value = "") {
  return encodeURIComponent(safeText(value, ""));
}

function getApiClient() {
  return (
    AppCore?.apiClient ||
    AppCore?.modules?.Http ||
    AppCore?.Http ||
    window?.Http ||
    null
  );
}

function getAuthToken() {
  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.auth?.getToken?.(),
      AppCore?.Auth?.getToken?.(),
      window?.Auth?.getToken?.(),
      localStorage.getItem("token"),
      localStorage.getItem("accessToken"),
      sessionStorage.getItem("token"),
      sessionStorage.getItem("accessToken")
    ),
    ""
  );
}

function resolveApiUrl(path = "") {
  const value = safeText(path, "");
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const apiBase = safeText(
    first(
      AppCore?.config?.apiBase,
      AppCore?.config?.api?.baseUrl,
      window?.ONION_API_BASE,
      window?.API_BASE
    ),
    ""
  ).replace(/\/+$/, "");

  if (!apiBase) {
    return value.startsWith("/") ? value : `/${value}`;
  }

  const normalizedPath = value.startsWith("/") ? value : `/${value}`;

  if (apiBase.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${apiBase}${normalizedPath.slice(4)}`;
  }

  return `${apiBase}${normalizedPath}`;
}

function createTimeoutSignal(timeoutMs = INCIDENCIA_DETAIL_TIMEOUT) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, timeoutMs);

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
    },
  };
}

function isRecoverableDetailError(error = null) {
  const status = safeNumber(
    first(error?.status, error?.statusCode, error?.response?.status),
    0
  );

  return status === 404 || status === 405;
}

/* =========================================================
   MODAL RESOLUTION
========================================================= */

async function getIncidenciasModal() {
  const module = await import("../incidencias/incidencias.modal.js");

  const modal =
    module?.OnionIncidenciasModal ||
    module?.default ||
    window?.OnionIncidenciasModal ||
    null;

  if (!modal || typeof modal.open !== "function") {
    throw new Error("INCIDENCIAS_MODAL_UNAVAILABLE");
  }

  return modal;
}

/* =========================================================
   API DETAIL
========================================================= */

async function apiGet(path = "") {
  const client = getApiClient();

  if (client?.get) {
    return client.get(path, {
      timeout: INCIDENCIA_DETAIL_TIMEOUT,
      auth: true,
    });
  }

  if (client?.request) {
    return client.request(path, {
      method: "GET",
      timeout: INCIDENCIA_DETAIL_TIMEOUT,
      auth: true,
    });
  }

  const finalUrl = resolveApiUrl(path);
  const token = getAuthToken();
  const timeout = createTimeoutSignal(INCIDENCIA_DETAIL_TIMEOUT);

  try {
    const response = await fetch(finalUrl, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: timeout.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const error = new Error(
        safeText(
          first(payload?.message, payload?.error, `HTTP ${response.status}`),
          `HTTP ${response.status}`
        )
      );

      error.status = response.status;
      error.statusCode = response.status;
      error.response = payload;

      throw error;
    }

    return payload;
  } finally {
    timeout.clear();
  }
}

function extractDetailPayload(response = null) {
  const obj = safeObject(response);

  return (
    obj.detail ||
    obj.ticket ||
    obj.incidencia ||
    obj.item ||
    obj.data?.detail ||
    obj.data?.ticket ||
    obj.data?.incidencia ||
    obj.data?.item ||
    obj.data ||
    obj.result?.detail ||
    obj.result?.ticket ||
    obj.result?.incidencia ||
    obj.result?.item ||
    obj.result ||
    obj.payload?.detail ||
    obj.payload?.ticket ||
    obj.payload?.incidencia ||
    obj.payload?.item ||
    obj.payload ||
    obj ||
    null
  );
}

async function fetchIncidenciaDetail(ticketId = "") {
  const id = safeText(ticketId, "");

  if (!id) {
    throw new Error("INCIDENCIA_ID_REQUIRED");
  }

  const encodedId = encodeSegment(id);

  const candidates = [
    `/api/tickets/${encodedId}`,
    `/api/incidencias/${encodedId}`,
  ];

  let lastError = null;

  for (const path of candidates) {
    try {
      const response = await apiGet(path);
      return extractDetailPayload(response);
    } catch (error) {
      lastError = error;

      if (!isRecoverableDetailError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error("INCIDENCIA_DETAIL_NOT_FOUND");
}

/* =========================================================
   FACTURA → INCIDENCIA FALLBACK DETAIL
========================================================= */

function getFacturaId(item = {}) {
  const factura = safeObject(item);
  const raw = safeObject(factura.raw);

  return safeText(
    first(
      factura.id,
      factura._id,
      factura.facturaId,
      factura.invoiceId,
      factura.numero,
      factura.numeroFacturaLegal,
      factura.numeroFacturaSistema,

      raw.id,
      raw._id,
      raw.facturaId,
      raw.invoiceId,
      raw.numero,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema
    ),
    ""
  );
}

function getFacturaNumero(item = {}) {
  const factura = safeObject(item);
  const raw = safeObject(factura.raw);

  return safeText(
    first(
      factura.numero,
      factura.invoiceNumber,
      factura.code,
      factura.numeroFacturaLegal,
      factura.numeroFacturaSistema,
      factura.id,

      raw.numero,
      raw.invoiceNumber,
      raw.code,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.id
    ),
    ""
  );
}

function getFacturaClientName(item = {}) {
  const factura = safeObject(item);
  const raw = safeObject(factura.raw);

  return safeText(
    first(
      factura.clienteNombre,
      factura.cliente?.nombre,
      factura.cliente?.nombreContacto,
      factura.clientName,
      factura.client?.name,

      raw.clienteNombre,
      raw.cliente?.nombre,
      raw.cliente?.nombreContacto,
      raw.clientName,
      raw.client?.name
    ),
    "Cliente"
  );
}

function getFacturaClientEmail(item = {}) {
  const factura = safeObject(item);
  const raw = safeObject(factura.raw);

  return safeText(
    first(
      factura.clienteEmail,
      factura.emailCliente,
      factura.cliente?.email,
      factura.clientEmail,
      factura.client?.email,

      raw.clienteEmail,
      raw.emailCliente,
      raw.cliente?.email,
      raw.clientEmail,
      raw.client?.email
    ),
    ""
  );
}

function getFacturaClienteId(item = {}) {
  const factura = safeObject(item);
  const raw = safeObject(factura.raw);

  return safeText(
    first(
      factura.clienteId,
      factura.cliente?.id,
      factura.clientId,
      factura.client?.id,

      raw.clienteId,
      raw.cliente?.id,
      raw.clientId,
      raw.client?.id
    ),
    ""
  );
}

function getRelationObject(item = {}) {
  const factura = safeObject(item);
  const raw = safeObject(factura.raw);

  return safeObject(
    first(
      factura.incidencia,
      factura.ticket,
      factura.linkedTicket,
      raw.incidencia,
      raw.ticket,
      raw.linkedTicket
    )
  );
}

function getIncidenciaIdFromFactura(item = {}) {
  const factura = safeObject(item);
  const raw = safeObject(factura.raw);
  const relation = getRelationObject(factura);

  return safeText(
    first(
      factura.ticketId,
      factura.incidenciaId,

      relation.ticketId,
      relation.incidenciaId,
      relation.id,

      factura.relatedTicketId,
      factura.relatedIncidentId,
      factura.supportTicketId,
      factura.caseId,

      factura.meta?.ticketId,
      factura.meta?.incidenciaId,

      raw.ticketId,
      raw.incidenciaId,

      raw.incidencia?.ticketId,
      raw.incidencia?.incidenciaId,
      raw.incidencia?.id,

      raw.ticket?.ticketId,
      raw.ticket?.incidenciaId,
      raw.ticket?.id,

      raw.relatedTicketId,
      raw.relatedIncidentId,
      raw.supportTicketId,
      raw.caseId,

      raw.meta?.ticketId,
      raw.meta?.incidenciaId
    ),
    ""
  );
}

function buildFallbackDetail({
  ticketId = "",
  factura = {},
} = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);
  const relation = getRelationObject(item);

  const id = safeText(
    first(
      ticketId,
      getIncidenciaIdFromFactura(item),
      relation.ticketId,
      relation.incidenciaId,
      relation.id
    ),
    ""
  );

  const facturaId = getFacturaId(item);
  const facturaNumero = getFacturaNumero(item);
  const clientName = getFacturaClientName(item);
  const clientEmail = getFacturaClientEmail(item);
  const clienteId = getFacturaClienteId(item);

  const subject = safeText(
    first(
      relation.subject,
      relation.asunto,
      relation.title,
      relation.nombre,
      item.subject,
      item.asunto,
      raw.subject,
      raw.asunto,
      facturaNumero
        ? `Incidencia vinculada a factura ${facturaNumero}`
        : `Incidencia ${id}`
    ),
    `Incidencia ${id}`
  );

  return {
    id,
    ticketId: id,
    code: id,
    ticketCode: id,

    title: subject,
    subject,
    asunto: subject,

    status: safeText(
      first(
        relation.status,
        relation.estado,
        raw.incidencia?.status,
        raw.incidencia?.estado,
        "open"
      ),
      "open"
    ),

    estado: safeText(
      first(
        relation.estado,
        relation.status,
        raw.incidencia?.estado,
        raw.incidencia?.status,
        "open"
      ),
      "open"
    ),

    priority: safeText(
      first(
        relation.priority,
        relation.prioridad,
        raw.incidencia?.priority,
        raw.incidencia?.prioridad,
        "medium"
      ),
      "medium"
    ),

    prioridad: safeText(
      first(
        relation.prioridad,
        relation.priority,
        raw.incidencia?.prioridad,
        raw.incidencia?.priority,
        "medium"
      ),
      "medium"
    ),

    description: safeText(
      first(
        relation.description,
        relation.descripcion,
        relation.message,
        relation.preview,
        raw.incidencia?.description,
        raw.incidencia?.descripcion,
        raw.incidencia?.message,
        raw.incidencia?.preview,
        facturaNumero
          ? `Incidencia relacionada con la factura ${facturaNumero}.`
          : "Incidencia relacionada con una factura."
      ),
      "Incidencia relacionada con una factura."
    ),

    message: safeText(
      first(
        relation.message,
        relation.description,
        relation.descripcion,
        ""
      ),
      ""
    ),

    clientName,
    clienteId,
    clienteNombre: clientName,

    cliente: {
      id: clienteId || null,
      nombre: clientName,
      name: clientName,
      email: clientEmail,
      avatar: safeText(
        first(item.cliente?.avatar, raw.cliente?.avatar, relation.clienteAvatar),
        ""
      ),
    },

    client: {
      id: clienteId || null,
      name: clientName,
      email: clientEmail,
      avatar: safeText(
        first(item.cliente?.avatar, raw.cliente?.avatar, relation.clienteAvatar),
        ""
      ),
    },

    facturaId,
    invoiceId: facturaId,
    factura: facturaNumero || facturaId,
    invoiceCode: facturaNumero || facturaId,
    facturaRelacionada: facturaNumero || facturaId,

    createdAt: first(
      relation.createdAt,
      raw.incidencia?.createdAt,
      item.createdAt,
      raw.createdAt,
      item.fecha,
      raw.fecha,
      null
    ),

    updatedAt: first(
      relation.updatedAt,
      relation.linkedAt,
      raw.incidencia?.updatedAt,
      raw.incidencia?.linkedAt,
      item.updatedAt,
      raw.updatedAt,
      null
    ),

    attachments: first(
      relation.attachments,
      relation.files,
      relation.adjuntos,
      raw.incidencia?.attachments,
      raw.incidencia?.files,
      raw.incidencia?.adjuntos,
      []
    ),

    raw: {
      ...relation,
      ticketId: id,
      id,
      incidenciaId: id,

      facturaId,
      invoiceId: facturaId,
      factura: facturaNumero || facturaId,
      invoiceCode: facturaNumero || facturaId,

      clienteId,
      clienteNombre: clientName,

      factura: {
        ...safeObject(raw.factura),
        id: facturaId,
        numero: facturaNumero,
      },

      invoice: {
        ...safeObject(raw.invoice),
        id: facturaId,
        code: facturaNumero,
      },
    },
  };
}

function mergeDetailWithFallback(fallback = {}, detail = {}) {
  const base = safeObject(fallback);
  const next = safeObject(detail);

  const id = safeText(
    first(
      next.ticketId,
      next.id,
      next.code,
      next.incidenciaId,
      base.ticketId,
      base.id
    ),
    ""
  );

  return {
    ...base,
    ...next,

    id,
    ticketId: id,
    code: safeText(first(next.code, next.ticketCode, id), id),
    ticketCode: safeText(first(next.ticketCode, next.code, id), id),

    facturaId: safeText(first(next.facturaId, next.invoiceId, base.facturaId), ""),
    invoiceId: safeText(first(next.invoiceId, next.facturaId, base.invoiceId), ""),

    factura: safeText(first(next.factura, next.facturaRelacionada, base.factura), ""),
    invoiceCode: safeText(first(next.invoiceCode, base.invoiceCode), ""),

    raw: {
      ...safeObject(base.raw),
      ...safeObject(next.raw || next),

      ticketId: id,
      id,
      incidenciaId: id,

      facturaId: safeText(first(next.facturaId, next.invoiceId, base.facturaId), ""),
      invoiceId: safeText(first(next.invoiceId, next.facturaId, base.invoiceId), ""),
    },
  };
}

/* =========================================================
   PUBLIC ACTION
========================================================= */

export async function openFacturaIncidenciaModal({
  ticketId = "",
  incidenciaId = "",
  facturaId = "",
  factura = null,
} = {}) {
  const storedFactura =
    safeObject(factura, null) ||
    getFacturaByIdStore(facturaId) ||
    {};

  const finalTicketId = safeText(
    first(
      ticketId,
      incidenciaId,
      getIncidenciaIdFromFactura(storedFactura)
    ),
    ""
  );

  if (!finalTicketId) {
    try {
      AppCore?.toast?.error?.("No se pudo identificar la incidencia vinculada.");
    } catch {}

    return false;
  }

  const modal = await getIncidenciasModal();

  const fallbackDetail = buildFallbackDetail({
    ticketId: finalTicketId,
    factura: storedFactura,
  });

  modal.open(fallbackDetail);

  try {
    AppCore?.events?.emit?.("facturas:incidencia:opening", {
      ticketId: finalTicketId,
      facturaId: getFacturaId(storedFactura) || facturaId,
      factura: storedFactura,
    });
  } catch {}

  try {
    const remoteDetail = await fetchIncidenciaDetail(finalTicketId);

    const nextDetail = mergeDetailWithFallback(
      fallbackDetail,
      remoteDetail
    );

    modal.update(nextDetail);

    try {
      AppCore?.events?.emit?.("incidencias:open:success", {
        detail: nextDetail,
        ticketId: finalTicketId,
      });
    } catch {}

    return true;
  } catch (error) {
    try {
      modal.setFeedback(
        "La incidencia se ha abierto con los datos vinculados a la factura, pero no se pudo cargar el detalle completo desde la API.",
        "info"
      );
    } catch {}

    try {
      AppCore?.events?.emit?.("facturas:incidencia:open:fallback", {
        ticketId: finalTicketId,
        facturaId: getFacturaId(storedFactura) || facturaId,
        error,
      });
    } catch {}

    return true;
  }
}

export default {
  openFacturaIncidenciaModal,
};
