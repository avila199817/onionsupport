/* =========================================================
   Onion SPA - Facturas Actions
   Archivo: src/views/facturas/facturas.actions.js

   Responsabilidades:
   - centralizar acciones operativas del módulo de facturas
   - abrir detalle, pdf y descarga
   - enviar factura al cliente
   - exportar colección a CSV
   - desacoplar la vista principal de la lógica de acciones
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
  showToast,
} from "./facturas.utils.js";

export async function openFacturaAction({
  facturaId = "",
  emitOpenEvent = true,
  loadFacturaDetail,
} = {}) {
  const id = safeText(facturaId, "");
  if (!id || typeof loadFacturaDetail !== "function") return null;

  try {
    if (emitOpenEvent && typeof AppCore?.events?.emit === "function") {
      AppCore.events.emit("facturas:open", { facturaId: id });
    }

    return await loadFacturaDetail(id);
  } catch (error) {
    console.error("❌ FACTURAS OPEN DETAIL:", error);
    showToast("No se pudo abrir el detalle de la factura.", "error");
    return null;
  }
}

export async function openFacturaPdfAction({
  facturaId = "",
  onStart,
  onEnd,
} = {}) {
  const id = safeText(facturaId, "");
  if (!id) return null;

  try {
    onStart?.(id);

    const response = await fetchFacturaPdfUrlRequest(id, "inline");
    const url = safeText(response?.file?.url, "");

    if (!url) {
      throw new Error("PDF_URL_MISSING");
    }

    window.open(url, "_blank", "noopener,noreferrer");
    showToast("Abriendo PDF de la factura.", "success");

    return response;
  } catch (error) {
    console.error("❌ FACTURAS VIEW PDF:", error);
    showToast("No se pudo abrir el PDF.", "error");
    return null;
  } finally {
    onEnd?.(id);
  }
}

export async function downloadFacturaPdfAction({
  facturaId = "",
  onStart,
  onEnd,
} = {}) {
  const id = safeText(facturaId, "");
  if (!id) return null;

  try {
    onStart?.(id);

    const response = await fetchFacturaPdfUrlRequest(id, "attachment");
    const url = safeText(response?.file?.url, "");

    if (!url) {
      throw new Error("DOWNLOAD_URL_MISSING");
    }

    window.open(url, "_blank", "noopener,noreferrer");
    showToast("Preparando descarga de factura.", "success");

    return response;
  } catch (error) {
    console.error("❌ FACTURAS DOWNLOAD PDF:", error);
    showToast("No se pudo descargar la factura.", "error");
    return null;
  } finally {
    onEnd?.(id);
  }
}

export async function sendFacturaToClientAction({
  facturaId = "",
  detail = null,
  onStart,
  onEnd,
  onSent,
  reloadFacturas,
  confirmSend = true,
} = {}) {
  const id = safeText(facturaId, "");
  if (!id) return null;

  const factura =
    detail?.id === id
      ? detail
      : getFacturaByIdStore(id);

  const targetEmail =
    factura?.cliente?.email ||
    factura?.enviadoA ||
    "el cliente";

  if (confirmSend) {
    const confirmed = window.confirm(
      `Se va a enviar la factura ${factura?.numero || id} a ${targetEmail}. ¿Continuar?`
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

    showToast("Factura enviada correctamente.", "success");

    if (typeof reloadFacturas === "function") {
      await reloadFacturas();
    }

    return response;
  } catch (error) {
    console.error("❌ FACTURAS SEND:", error);
    showToast("No se pudo enviar la factura.", "error");
    return null;
  } finally {
    onEnd?.(id);
  }
}

export function exportFacturasCsvAction({
  items = null,
  filenamePrefix = "facturas",
} = {}) {
  const list = Array.isArray(items) ? items : getSortedFacturasStore();

  if (!list.length) {
    showToast("No hay facturas para exportar.", "info");
    return false;
  }

  const headers = [
    "numero",
    "cliente",
    "email",
    "fecha",
    "estadoPago",
    "estado",
    "formaPago",
    "total",
    "moneda",
  ];

  const rows = list.map((item) => ({
    numero: item?.numero || "",
    cliente: item?.cliente?.empresa || item?.cliente?.nombre || "",
    email: item?.cliente?.email || "",
    fecha: item?.fecha || "",
    estadoPago: item?.estadoPago || "",
    estado: item?.estado || "",
    formaPago: item?.formaPago || "",
    total: safeNumber(item?.total, 0),
    moneda: item?.moneda || "EUR",
  }));

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`)
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `${safeText(filenamePrefix, "facturas")}_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  showToast("Exportación CSV generada.", "success");
  return true;
}
