/* =========================================================
   Onion SPA - Facturas Actions
   Archivo: src/views/facturas/facturas.actions.js

   FINAL PRO SYSTEM · ACTIONS REAL · 10/10

   RESPONSABILIDADES:
   - centralizar acciones operativas del módulo de facturas
   - resolver detalle desde store + loader/backend
   - abrir detalle a nivel de datos, no de UI
   - abrir pdf inline / descarga
   - enviar factura al cliente
   - copiar identificadores
   - exportar colección a CSV
   - desacoplar facturasView.js de la lógica operativa

   FULL PRO 10/10:
   - misma filosofía que incidencias.actions.js
   - sin acoplar modal global en actions
   - fallback store -> loader
   - export CSV robusto
   - clipboard con fallback legacy
   - eventos opcionales vía AppCore.events
   - tolerancia a payloads heterogéneos
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  fetchFacturaPdfUrlRequest,
  sendFacturaRequest,
} from "./facturas.api.js";

import {
  getFacturaByIdStore,
  getSortedFacturasStore,
} from "./facturas.store.js";

import {
  safeText,
  safeNumber,
  safeArray,
  safeObject,
  showToast,
} from "./facturas.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

const CSV_FILENAME_PREFIX = "facturas";

/* =========================================================
   HELPERS
========================================================= */

function safeEmit(eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, payload);
  } catch {}
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

function normalizeFacturaId(value = "") {
  return safeText(value, "");
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isLikelyFactura(value) {
  if (!isObject(value)) return false;

  return Boolean(
    value.id ||
      value._id ||
      value.facturaId ||
      value.numero ||
      value.code ||
      value.cliente ||
      value.client ||
      value.customer ||
      value.total !== undefined ||
      value.amount !== undefined ||
      value.importe !== undefined
  );
}

function looksLikeEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    obj.factura ||
      obj.item ||
      obj.data ||
      obj.result ||
      obj.payload
  );
}

function pickDetail(payload = null) {
  if (!payload) return null;

  if (isLikelyFactura(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (isLikelyFactura(obj.factura)) {
    return obj.factura;
  }

  if (isLikelyFactura(obj.item)) {
    return obj.item;
  }

  if (isLikelyFactura(obj.result)) {
    return obj.result;
  }

  if (isLikelyFactura(obj.payload)) {
    return obj.payload;
  }

  if (isLikelyFactura(obj.data)) {
    return obj.data;
  }

  if (looksLikeEnvelope(obj.data)) {
    return pickDetail(obj.data);
  }

  return null;
}

function resolvePdfUrl(response = null) {
  return safeText(
    response?.file?.url ||
      response?.url ||
      response?.data?.file?.url ||
      response?.data?.url,
    ""
  );
}

function resolveFacturaId(detail = null) {
  return safeText(
    detail?.id ||
      detail?._id ||
      detail?.facturaId,
    ""
  );
}

function getFacturaId(item = {}) {
  return safeText(
    first(
      item.id,
      item._id,
      item.facturaId
    ),
    ""
  );
}

function getFacturaNumber(item = {}) {
  return safeText(
    first(
      item.numero,
      item.code,
      item.facturaCode,
      item.facturaNumero
    ),
    "—"
  );
}

function getFacturaClientObject(item = {}) {
  const client = first(
    item.cliente,
    item.client,
    item.customer
  );

  return isObject(client) ? client : {};
}

function getFacturaClient(item = {}) {
  const client = getFacturaClientObject(item);

  if (Object.keys(client).length) {
    return safeText(
      first(
        client.empresa,
        client.nombre,
        client.name,
        client.company,
        client.displayName
      ),
      "Cliente"
    );
  }

  return safeText(
    first(
      item.clienteNombre,
      item.clientName,
      item.customerName
    ),
    "Cliente"
  );
}

function getFacturaEmail(item = {}) {
  const client = getFacturaClientObject(item);

  if (Object.keys(client).length) {
    return safeText(
      first(
        client.email,
        client.mail
      ),
      "Sin email"
    );
  }

  return safeText(
    first(
      item.email,
      item.clienteEmail,
      item.clientEmail
    ),
    "Sin email"
  );
}

function getFacturaDate(item = {}) {
  return first(
    item.fecha,
    item.date,
    item.createdAt,
    item.updatedAt
  );
}

function getFacturaEstadoPago(item = {}) {
  return safeText(
    first(
      item.estadoPago,
      item.paymentStatus
    ),
    "pending"
  );
}

function getFacturaEstado(item = {}) {
  return safeText(
    first(
      item.estado,
      item.status
    ),
    "emitida"
  );
}

function getFacturaFormaPago(item = {}) {
  return safeText(
    first(
      item.formaPago,
      item.paymentMethod
    ),
    "—"
  );
}

function getFacturaMoneda(item = {}) {
  return safeText(
    first(
      item.moneda,
      item.currency
    ),
    "EUR"
  );
}

function getFacturaTotal(item = {}) {
  return safeNumber(
    first(
      item.total,
      item.amount,
      item.importe
    ),
    0
  );
}

function getFacturaSentTo(item = {}) {
  return safeText(
    first(
      item.enviadoA,
      item.sentTo,
      item?.cliente?.email,
      item?.client?.email
    ),
    ""
  );
}

function getFacturaSentAt(item = {}) {
  return first(
    item.fechaEnvio,
    item.sentAt,
    item.updatedAt
  );
}

function normalizeFacturaDetail(detail = {}) {
  const raw = safeObject(detail);
  const facturaId = getFacturaId(raw);

  return {
    ...raw,
    id: facturaId,
    facturaId,
    numero: getFacturaNumber(raw),
    cliente: isObject(raw.cliente)
      ? raw.cliente
      : isObject(raw.client)
        ? raw.client
        : {
            empresa: getFacturaClient(raw),
            email: getFacturaEmail(raw),
          },
    fecha: getFacturaDate(raw),
    estadoPago: getFacturaEstadoPago(raw),
    estado: getFacturaEstado(raw),
    formaPago: getFacturaFormaPago(raw),
    moneda: getFacturaMoneda(raw),
    total: getFacturaTotal(raw),
    enviadoA: getFacturaSentTo(raw),
    fechaEnvio: getFacturaSentAt(raw),
    raw,
  };
}

function safeErrorMessage(error = null, fallback = "") {
  return safeText(
    error?.data?.message ||
      error?.response?.data?.message ||
      error?.response?.message ||
      error?.message,
    fallback
  );
}

function escapeCsvCell(value = "") {
  const text =
    value === null || value === undefined
      ? ""
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvRows(items = []) {
  const header = [
    "id",
    "numero",
    "cliente",
    "email",
    "fecha",
    "estadoPago",
    "estado",
    "formaPago",
    "total",
    "moneda",
    "enviadoA",
    "fechaEnvio",
  ];

  const rows = safeArray(items).map((item) => [
    getFacturaId(item),
    getFacturaNumber(item),
    getFacturaClient(item),
    getFacturaEmail(item),
    getFacturaDate(item) || "",
    getFacturaEstadoPago(item),
    getFacturaEstado(item),
    getFacturaFormaPago(item),
    getFacturaTotal(item),
    getFacturaMoneda(item),
    getFacturaSentTo(item),
    getFacturaSentAt(item) || "",
  ]);

  return [
    header.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\n");
}

async function writeClipboardText(text = "") {
  const value = safeText(text, "");

  if (!value) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const ok = document.execCommand("copy");

    textarea.remove();

    return Boolean(ok);
  } catch {
    return false;
  }
}

function downloadTextFile({
  filename = "",
  content = "",
  mimeType = "text/plain;charset=utf-8;",
} = {}) {
  const blob = new Blob([String(content || "")], {
    type: mimeType,
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);

  return true;
}

/* =========================================================
   DETAIL ACTIONS
========================================================= */

export function getFacturaDetailFromStoreAction({
  facturaId = "",
} = {}) {
  const id = normalizeFacturaId(facturaId);

  if (!id) return null;

  try {
    const detail = getFacturaByIdStore(id);
    const picked = pickDetail(detail);

    if (!picked) return null;

    return normalizeFacturaDetail(picked);
  } catch {
    return null;
  }
}

export async function getFacturaDetailAction({
  facturaId = "",
  loadFacturaDetail,
  preferFresh = true,
  silent = false,
} = {}) {
  const id = normalizeFacturaId(facturaId);

  if (!id) {
    if (!silent) {
      showToast("No se pudo resolver la factura.", "error");
    }
    return null;
  }

  const fallbackStoreDetail = getFacturaDetailFromStoreAction({
    facturaId: id,
  });

  if (!preferFresh && fallbackStoreDetail) {
    return fallbackStoreDetail;
  }

  try {
    safeEmit("facturas:detail:request", {
      facturaId: id,
      source: typeof loadFacturaDetail === "function" ? "loader" : "store",
    });

    let detail = null;

    if (typeof loadFacturaDetail === "function") {
      detail = await loadFacturaDetail(id);
    } else {
      detail = fallbackStoreDetail;
    }

    const picked = pickDetail(detail);

    if (!picked) {
      if (fallbackStoreDetail) {
        safeEmit("facturas:detail:fallback", {
          facturaId: id,
          source: "store",
        });
        return fallbackStoreDetail;
      }

      throw new Error("EMPTY_FACTURA_DETAIL");
    }

    const normalized = normalizeFacturaDetail(picked);

    safeEmit("facturas:detail:success", {
      facturaId: id,
      source: typeof loadFacturaDetail === "function" ? "loader" : "store",
      detail: normalized,
    });

    return normalized;
  } catch (error) {
    if (fallbackStoreDetail) {
      safeEmit("facturas:detail:fallback", {
        facturaId: id,
        source: "store",
        error,
      });

      return fallbackStoreDetail;
    }

    safeEmit("facturas:detail:error", {
      facturaId: id,
      error,
    });

    if (!silent) {
      showToast(
        "No se pudo cargar el detalle de la factura.",
        "error"
      );
    }

    return null;
  }
}

export async function openFacturaAction({
  facturaId = "",
  loadFacturaDetail,
  preferFresh = true,
  silent = false,
} = {}) {
  const id = normalizeFacturaId(facturaId);

  if (!id) {
    if (!silent) {
      showToast("Factura inválida.", "error");
    }
    return null;
  }

  safeEmit("facturas:open", {
    facturaId: id,
  });

  const detail = await getFacturaDetailAction({
    facturaId: id,
    loadFacturaDetail,
    preferFresh,
    silent,
  });

  if (!detail) {
    return null;
  }

  safeEmit("facturas:open:success", {
    facturaId: id,
    detail,
  });

  return detail;
}

export async function refreshFacturaDetailAction({
  facturaId = "",
  loadFacturaDetail,
  silent = true,
} = {}) {
  return getFacturaDetailAction({
    facturaId,
    loadFacturaDetail,
    preferFresh: true,
    silent,
  });
}

/* =========================================================
   PDF INLINE
========================================================= */

export async function openFacturaPdfAction({
  facturaId = "",
  onStart,
  onEnd,
  silent = false,
} = {}) {
  const id = normalizeFacturaId(facturaId);

  if (!id) {
    if (!silent) {
      showToast("Factura inválida.", "error");
    }
    return null;
  }

  try {
    onStart?.(id);

    const response = await fetchFacturaPdfUrlRequest(id, "inline");
    const url = resolvePdfUrl(response);

    if (!url) {
      throw new Error("PDF_URL_MISSING");
    }

    window.open(url, "_blank", "noopener,noreferrer");

    safeEmit("facturas:pdf:opened", {
      facturaId: id,
      url,
    });

    if (!silent) {
      showToast("Abriendo PDF de la factura.", "success");
    }

    return response;
  } catch (error) {
    safeEmit("facturas:pdf:error", {
      facturaId: id,
      error,
      mode: "inline",
    });

    if (!silent) {
      showToast("No se pudo abrir el PDF.", "error");
    }

    return null;
  } finally {
    onEnd?.(id);
  }
}

/* =========================================================
   PDF DOWNLOAD
========================================================= */

export async function downloadFacturaPdfAction({
  facturaId = "",
  onStart,
  onEnd,
  silent = false,
} = {}) {
  const id = normalizeFacturaId(facturaId);

  if (!id) {
    if (!silent) {
      showToast("Factura inválida.", "error");
    }
    return null;
  }

  try {
    onStart?.(id);

    const response = await fetchFacturaPdfUrlRequest(id, "attachment");
    const url = resolvePdfUrl(response);

    if (!url) {
      throw new Error("DOWNLOAD_URL_MISSING");
    }

    window.open(url, "_blank", "noopener,noreferrer");

    safeEmit("facturas:pdf:download", {
      facturaId: id,
      url,
    });

    if (!silent) {
      showToast("Preparando descarga de factura.", "success");
    }

    return response;
  } catch (error) {
    safeEmit("facturas:pdf:error", {
      facturaId: id,
      error,
      mode: "download",
    });

    if (!silent) {
      showToast("No se pudo descargar la factura.", "error");
    }

    return null;
  } finally {
    onEnd?.(id);
  }
}

/* =========================================================
   SEND
========================================================= */

export async function sendFacturaToClientAction({
  facturaId = "",
  detail = null,
  onStart,
  onEnd,
  onSent,
  reloadFacturas,
  confirmSend = true,
  silent = false,
} = {}) {
  const id = normalizeFacturaId(facturaId);

  if (!id) {
    if (!silent) {
      showToast("Factura inválida.", "error");
    }
    return null;
  }

  const selectedDetail =
    resolveFacturaId(detail) === id
      ? detail
      : getFacturaByIdStore(id) || detail || {};

  const factura = normalizeFacturaDetail(selectedDetail);
  const targetEmail =
    factura?.cliente?.email ||
    factura?.enviadoA ||
    "el cliente";

  if (confirmSend) {
    const confirmed = window.confirm(
      `Se va a enviar la factura ${getFacturaNumber(factura)} a ${targetEmail}. ¿Continuar?`
    );

    if (!confirmed) {
      return null;
    }
  }

  try {
    onStart?.(id);

    const response = await sendFacturaRequest(id);

    onSent?.({
      facturaId: id,
      response,
      factura,
    });

    safeEmit("facturas:sent", {
      facturaId: id,
      response,
    });

    if (typeof reloadFacturas === "function") {
      await reloadFacturas();
    }

    if (!silent) {
      showToast("Factura enviada correctamente.", "success");
    }

    return response;
  } catch (error) {
    safeEmit("facturas:send:error", {
      facturaId: id,
      error,
    });

    if (!silent) {
      showToast("No se pudo enviar la factura.", "error");
    }

    return null;
  } finally {
    onEnd?.(id);
  }
}

/* =========================================================
   COPY
========================================================= */

export async function copyFacturaIdAction({
  facturaId = "",
  numero = "",
  silent = false,
} = {}) {
  const value =
    safeText(numero, "") ||
    safeText(facturaId, "");

  if (!value) {
    if (!silent) {
      showToast(
        "No se encontró identificador para copiar.",
        "info"
      );
    }
    return false;
  }

  const ok = await writeClipboardText(value);

  if (!ok) {
    if (!silent) {
      showToast(
        "No se pudo copiar el identificador.",
        "error"
      );
    }
    return false;
  }

  safeEmit("facturas:copied", {
    facturaId: safeText(facturaId, ""),
    numero: safeText(numero, ""),
    value,
  });

  if (!silent) {
    showToast("Identificador copiado.", "success");
  }

  return true;
}

/* =========================================================
   EXPORT CSV
========================================================= */

export function exportFacturasCsvAction({
  items = null,
  filenamePrefix = CSV_FILENAME_PREFIX,
  silent = false,
} = {}) {
  const list = Array.isArray(items)
    ? items
    : getSortedFacturasStore();

  const safeList = safeArray(list);

  if (!safeList.length) {
    if (!silent) {
      showToast("No hay facturas para exportar.", "info");
    }
    return false;
  }

  try {
    const csv = buildCsvRows(safeList);
    const filename = `${safeText(
      filenamePrefix,
      CSV_FILENAME_PREFIX
    )}_${new Date().toISOString().slice(0, 10)}.csv`;

    downloadTextFile({
      filename,
      content: csv,
      mimeType: "text/csv;charset=utf-8;",
    });

    safeEmit("facturas:exported", {
      total: safeList.length,
      filename,
      filenamePrefix: safeText(
        filenamePrefix,
        CSV_FILENAME_PREFIX
      ),
    });

    if (!silent) {
      showToast("Exportación CSV generada.", "success");
    }

    return true;
  } catch (error) {
    safeEmit("facturas:export:error", {
      type: "csv",
      error,
    });

    if (!silent) {
      showToast("No se pudo exportar el CSV.", "error");
    }

    return false;
  }
}

/* =========================================================
   HELPERS EXPORT
========================================================= */

export {
  getFacturaId as getFacturaIdAction,
  getFacturaNumber as getFacturaNumberAction,
  getFacturaClient as getFacturaClientAction,
  getFacturaEmail as getFacturaEmailAction,
  getFacturaDate as getFacturaDateAction,
  getFacturaEstadoPago as getFacturaEstadoPagoAction,
  getFacturaEstado as getFacturaEstadoAction,
  getFacturaFormaPago as getFacturaFormaPagoAction,
  getFacturaMoneda as getFacturaMonedaAction,
  getFacturaTotal as getFacturaTotalAction,
  normalizeFacturaDetail as normalizeFacturaDetailAction,
};

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  getFacturaDetailFromStoreAction,
  getFacturaDetailAction,
  openFacturaAction,
  refreshFacturaDetailAction,
  openFacturaPdfAction,
  downloadFacturaPdfAction,
  sendFacturaToClientAction,
  copyFacturaIdAction,
  exportFacturasCsvAction,
};
