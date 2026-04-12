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

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function showToast(message = "", type = "info") {
  const text = safeText(message, "Acción completada");

  try {
    if (typeof AppCore?.showToast === "function") {
      AppCore.showToast(text, type);
      return;
    }
  } catch {
    /* noop */
  }

  try {
    if (typeof window.showToast === "function") {
      window.showToast(text, type);
      return;
    }
  } catch {
    /* noop */
  }

  console.log(`[${type.toUpperCase()}] ${text}`);
}

export async function openFacturaAction({
  facturaId = "",
  emitOpenEvent = true,
  loadFacturaDetail,
} = {}) {
  const id = safeText(facturaId, "");
  if (!id || typeof loadFacturaDetail !== "function") return;

  try {
    if (emitOpenEvent && typeof AppCore?.events?.emit === "function") {
      AppCore.events.emit("facturas:open", { facturaId: id });
    }

    await loadFacturaDetail(id);
  } catch (error) {
    console.error("❌ FACTURAS OPEN DETAIL:", error);
    showToast("No se pudo abrir el detalle de la factura.", "error");
  }
}

export async function openFacturaPdfAction({
  facturaId = "",
  onStart,
  onEnd,
} = {}) {
  const id = safeText(facturaId, "");
  if (!id) return;

  try {
    if (typeof onStart === "function") {
      onStart(id);
    }

    const response = await fetchFacturaPdfUrlRequest(id, "inline");
    const url = safeText(response?.file?.url, "");

    if (!url) {
      throw new Error("PDF_URL_MISSING");
    }

    window.open(url, "_blank", "noopener,noreferrer");
    showToast("Abriendo PDF de la factura.", "success");
  } catch (error) {
    console.error("❌ FACTURAS VIEW PDF:", error);
    showToast("No se pudo abrir el PDF.", "error");
  } finally {
    if (typeof onEnd === "function") {
      onEnd(id);
    }
  }
}

export async function downloadFacturaPdfAction({
  facturaId = "",
  onStart,
  onEnd,
} = {}) {
  const id = safeText(facturaId, "");
  if (!id) return;

  try {
    if (typeof onStart === "function") {
      onStart(id);
    }

    const response = await fetchFacturaPdfUrlRequest(id, "attachment");
    const url = safeText(response?.file?.url, "");

    if (!url) {
      throw new Error("DOWNLOAD_URL_MISSING");
    }

    window.open(url, "_blank", "noopener,noreferrer");
    showToast("Preparando descarga de factura.", "success");
  } catch (error) {
    console.error("❌ FACTURAS DOWNLOAD PDF:", error);
    showToast("No se pudo descargar la factura.", "error");
  } finally {
    if (typeof onEnd === "function") {
      onEnd(id);
    }
  }
}

export async function sendFacturaToClientAction({
  facturaId = "",
  detail = null,
  onStart,
  onEnd,
  onSent,
  reloadFacturas,
} = {}) {
  const id = safeText(facturaId, "");
  if (!id) return;

  const factura =
    detail?.id === id
      ? detail
      : getFacturaByIdStore(id);

  const targetEmail =
    factura?.cliente?.email ||
    factura?.enviadoA ||
    "el cliente";

  const confirmed = window.confirm(
    `Se va a enviar la factura ${factura?.numero || id} a ${targetEmail}. ¿Continuar?`
  );

  if (!confirmed) return;

  try {
    if (typeof onStart === "function") {
      onStart(id);
    }

    const response = await sendFacturaRequest(id);

    if (typeof onSent === "function") {
      onSent({
        facturaId: id,
        response,
      });
    }

    showToast("Factura enviada correctamente.", "success");

    if (typeof reloadFacturas === "function") {
      await reloadFacturas();
    }
  } catch (error) {
    console.error("❌ FACTURAS SEND:", error);
    showToast("No se pudo enviar la factura.", "error");
  } finally {
    if (typeof onEnd === "function") {
      onEnd(id);
    }
  }
}

export function exportFacturasCsvAction() {
  const items = getSortedFacturasStore();

  if (!items.length) {
    showToast("No hay facturas para exportar.", "info");
    return;
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

  const rows = items.map((item) => ({
    numero: item.numero || "",
    cliente: item.cliente?.empresa || item.cliente?.nombre || "",
    email: item.cliente?.email || "",
    fecha: item.fecha || "",
    estadoPago: item.estadoPago || "",
    estado: item.estado || "",
    formaPago: item.formaPago || "",
    total: safeNumber(item.total, 0),
    moneda: item.moneda || "EUR",
  }));

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`)
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `facturas_${new Date().toISOString().slice(0, 10)}.csv`;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  showToast("Exportación CSV generada.", "success");
}
