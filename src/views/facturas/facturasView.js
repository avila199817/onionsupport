/* =========================================================
   Onion SPA - Facturas View (FULL PRO SAAS PANEL · GOD MODE)
   Archivo: src/views/facturas/facturasView.js

   Responsabilidades:
   - renderizar la vista de facturas sobre el shell real
   - cargar facturas desde backend
   - guardar facturas normalizadas en Store
   - soportar loading / refresh / error / vacío
   - bind de acciones reales: refresh / retry / open / ver pdf / descargar / enviar
   - abrir detalle premium en modal
   - usar AppCore / Store / showToast
   - mantener arquitectura limpia y escalable
========================================================= */

import { AppCore } from "../../core/index.js";
import { Store } from "../../store/index.js";

import {
  extractFacturas,
  normalizeFactura,
  getRemoteCount,
  formatMoney,
  formatDate,
  formatDateTime,
} from "./facturas.model.js";

import {
  renderHeader,
  renderCards,
  renderLoadingState,
  renderErrorState,
} from "./facturas.template.js";

export const FacturasView = (() => {
  "use strict";

  const SCOPE = "view:facturas";
  const ENDPOINT = "/api/facturas";

  const localState = {
    hydrated: false,
    loading: false,
    loaded: false,
    error: null,
    refreshing: false,
    bootstrapped: false,
    remoteCount: 0,

    detailOpen: false,
    detailLoading: false,
    detail: null,

    sendingFacturaId: "",
    downloadingFacturaId: "",
    viewingFacturaId: "",
  };

  let inflightLoad = null;
  let inflightDetail = null;

  /* =========================================================
     HELPERS BASE
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

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function escapeHtml(value = "") {
    try {
      return AppCore.utils.escapeHtml(String(value ?? ""));
    } catch {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }
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

  function getContainer() {
    return AppCore.dom.viewContainer;
  }

  function getApiClient() {
    return AppCore.apiClient;
  }

  function safeGet(path, fallback = []) {
    try {
      if (typeof Store?.get === "function") {
        return Store.get(path) ?? fallback;
      }
    } catch {
      /* noop */
    }

    return fallback;
  }

  function safeSet(path, value) {
    try {
      if (typeof Store?.set === "function") {
        Store.set(path, value);
        return true;
      }
    } catch {
      /* noop */
    }

    return false;
  }

  function safeSetCollection(name, value) {
    try {
      if (typeof Store?.actions?.setCollection === "function") {
        Store.actions.setCollection(name, value);
        return true;
      }
    } catch {
      /* noop */
    }

    return false;
  }

  function getFacturas() {
    return safeArray(safeGet("entities.facturas", []));
  }

  function getSortedFacturas() {
    return [...getFacturas()].sort(
      (a, b) => (b.meta?.timestampMs || 0) - (a.meta?.timestampMs || 0)
    );
  }

  function getFacturaById(id = "") {
    const facturaId = safeText(id, "");
    if (!facturaId) return null;

    return (
      getFacturas().find((item) => String(item?.id) === String(facturaId)) || null
    );
  }

  function setFacturas(items = []) {
    if (safeSetCollection("facturas", items)) return;
    safeSet("entities.facturas", items);
  }

  function setDetail(factura = null) {
    localState.detail = factura || null;
  }

  function closeDetail() {
    localState.detailOpen = false;
    localState.detailLoading = false;
    localState.detail = null;
  }

  /* =========================================================
     API
  ========================================================= */
  async function fetchFacturas() {
    return getApiClient().get(ENDPOINT, {
      timeout: 15000,
      auth: true,
    });
  }

  async function fetchFacturaDetail(id) {
    return getApiClient().get(`${ENDPOINT}/${encodeURIComponent(id)}`, {
      timeout: 15000,
      auth: true,
    });
  }

  async function fetchFacturaPdfUrl(id, disposition = "attachment") {
    const endpoint =
      disposition === "inline"
        ? `${ENDPOINT}/${encodeURIComponent(id)}/pdf?disposition=inline`
        : `${ENDPOINT}/${encodeURIComponent(id)}/descargar?disposition=attachment`;

    return getApiClient().get(endpoint, {
      timeout: 15000,
      auth: true,
    });
  }

  async function sendFactura(id) {
    return getApiClient().post(
      `${ENDPOINT}/${encodeURIComponent(id)}/enviar`,
      {},
      {
        timeout: 20000,
        auth: true,
      }
    );
  }

  /* =========================================================
     LOADERS
  ========================================================= */
  async function loadFacturas({ silent = false } = {}) {
    if (inflightLoad) return inflightLoad;

    if (!silent) {
      localState.loading = true;
      localState.error = null;
      render();
    } else {
      localState.refreshing = true;
      render();
    }

    inflightLoad = (async () => {
      try {
        const response = await fetchFacturas();
        const items = extractFacturas(response).map(normalizeFactura);

        setFacturas(items);

        localState.remoteCount = getRemoteCount(response, items.length);
        localState.loading = false;
        localState.refreshing = false;
        localState.loaded = true;
        localState.error = null;

        render();
        return items;
      } catch (error) {
        localState.loading = false;
        localState.refreshing = false;
        localState.loaded = true;
        localState.error =
          error?.data?.message ||
          error?.message ||
          "No se pudieron cargar las facturas.";

        render();
        throw error;
      } finally {
        inflightLoad = null;
      }
    })();

    return inflightLoad;
  }

  async function loadFacturaDetail(id) {
    const facturaId = safeText(id, "");
    if (!facturaId) return null;

    if (inflightDetail) return inflightDetail;

    localState.detailOpen = true;
    localState.detailLoading = true;
    render();

    inflightDetail = (async () => {
      try {
        const response = await fetchFacturaDetail(facturaId);
        const factura = normalizeFactura(response?.factura || {});
        setDetail(factura);
        localState.detailLoading = false;
        render();
        return factura;
      } catch (error) {
        localState.detailLoading = false;
        render();
        throw error;
      } finally {
        inflightDetail = null;
      }
    })();

    return inflightDetail;
  }

  /* =========================================================
     ACTIONS
  ========================================================= */
  async function openFactura(id) {
    const facturaId = safeText(id, "");
    if (!facturaId) return;

    try {
      if (typeof AppCore.events?.emit === "function") {
        AppCore.events.emit("facturas:open", { facturaId });
      }

      await loadFacturaDetail(facturaId);
    } catch (error) {
      console.error("❌ FACTURAS OPEN DETAIL:", error);
      showToast("No se pudo abrir el detalle de la factura.", "error");
    }
  }

  async function openFacturaPdf(id) {
    const facturaId = safeText(id, "");
    if (!facturaId) return;

    try {
      localState.viewingFacturaId = facturaId;
      const response = await fetchFacturaPdfUrl(facturaId, "inline");
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
      localState.viewingFacturaId = "";
      renderDetailOnly();
    }
  }

  async function downloadFacturaPdf(id) {
    const facturaId = safeText(id, "");
    if (!facturaId) return;

    try {
      localState.downloadingFacturaId = facturaId;
      const response = await fetchFacturaPdfUrl(facturaId, "attachment");
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
      localState.downloadingFacturaId = "";
      renderDetailOnly();
    }
  }

  async function sendFacturaToClient(id) {
    const facturaId = safeText(id, "");
    if (!facturaId) return;

    const factura = localState.detail?.id === facturaId
      ? localState.detail
      : getFacturaById(facturaId);

    const targetEmail =
      factura?.cliente?.email ||
      factura?.enviadoA ||
      "el cliente";

    const confirmed = window.confirm(
      `Se va a enviar la factura ${factura?.numero || facturaId} a ${targetEmail}. ¿Continuar?`
    );

    if (!confirmed) return;

    try {
      localState.sendingFacturaId = facturaId;
      renderDetailOnly();

      const response = await sendFactura(facturaId);

      if (localState.detail?.id === facturaId) {
        localState.detail.enviadoA = safeText(
          response?.sent?.to,
          localState.detail.enviadoA
        );
        localState.detail.fechaEnvio = safeText(
          response?.sent?.at,
          localState.detail.fechaEnvio
        );
      }

      showToast("Factura enviada correctamente.", "success");
      await loadFacturas({ silent: true });
      render();
    } catch (error) {
      console.error("❌ FACTURAS SEND:", error);
      showToast("No se pudo enviar la factura.", "error");
    } finally {
      localState.sendingFacturaId = "";
      renderDetailOnly();
    }
  }

  function exportFacturasCsv() {
    const items = getSortedFacturas();

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

  /* =========================================================
     DETAIL MODAL
  ========================================================= */
  function renderMiniMeta(label = "", value = "") {
    return `
      <div
        style="
          display:grid;
          gap:4px;
          padding:12px;
          border-radius:14px;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
        "
      >
        <span
          style="
            font-size:11px;
            color:var(--text-faint);
            font-weight:var(--weight-bold);
            letter-spacing:.04em;
            text-transform:uppercase;
          "
        >
          ${escapeHtml(label)}
        </span>

        <span style="color:var(--text-strong); font-weight:var(--weight-semibold);">
          ${escapeHtml(value)}
        </span>
      </div>
    `;
  }

  function renderDetailStat(label = "", value = "") {
    return `
      <article
        style="
          display:grid;
          gap:6px;
          min-height:96px;
          padding:16px;
          border-radius:20px;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
        "
      >
        <span
          style="
            font-size:12px;
            color:var(--text-dim);
            font-weight:var(--weight-bold);
            letter-spacing:.05em;
            text-transform:uppercase;
          "
        >
          ${escapeHtml(label)}
        </span>

        <strong
          style="
            font-size:var(--font-xl);
            line-height:1.1;
            color:var(--text-strong);
            font-weight:var(--weight-black);
          "
        >
          ${escapeHtml(value)}
        </strong>
      </article>
    `;
  }

  function renderDetailContent() {
    const factura = localState.detail;

    if (localState.detailLoading) {
      return `
        <div style="padding:24px; display:grid; gap:16px;">
          <div style="height:30px; width:220px; border-radius:12px; background:var(--surface-glass);"></div>
          <div style="height:90px; border-radius:18px; background:var(--surface-glass);"></div>
          <div style="height:220px; border-radius:18px; background:var(--surface-glass);"></div>
        </div>
      `;
    }

    if (!factura) {
      return `
        <div style="padding:24px;">
          <p style="margin:0; color:var(--text-dim);">No hay detalle disponible.</p>
        </div>
      `;
    }

    const lineas = safeArray(factura.lineas);
    const impuestos = safeArray(factura.impuestos);

    return `
      <div style="display:grid; gap:var(--space-lg); padding:24px;">
        <div
          style="
            display:flex;
            justify-content:space-between;
            gap:16px;
            align-items:flex-start;
            flex-wrap:wrap;
          "
        >
          <div style="display:grid; gap:8px;">
            <span
              style="
                display:inline-flex;
                align-items:center;
                min-height:28px;
                padding:0 10px;
                border-radius:999px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-dim);
                font-size:12px;
                font-weight:var(--weight-bold);
                letter-spacing:.05em;
                text-transform:uppercase;
                width:max-content;
              "
            >
              Factura ${escapeHtml(factura.numero)}
            </span>

            <h2
              style="
                margin:0;
                font-size:clamp(26px, 4vw, 36px);
                line-height:1.05;
                color:var(--text-strong);
                letter-spacing:-.03em;
              "
            >
              ${escapeHtml(factura.cliente?.empresa || factura.cliente?.nombre || "Cliente")}
            </h2>

            <p style="margin:0; color:var(--text-muted);">
              ${escapeHtml(factura.preview || "Documento fiscal listo para consulta.")}
            </p>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button
              type="button"
              data-action="view-factura-pdf"
              data-factura-id="${escapeHtml(factura.id)}"
              style="
                min-height:40px;
                padding:0 14px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-secondary-border);
                background:var(--btn-secondary-bg);
                color:var(--btn-secondary-text);
                font-weight:var(--weight-bold);
                cursor:pointer;
              "
            >
              Ver PDF
            </button>

            <button
              type="button"
              data-action="download-factura"
              data-factura-id="${escapeHtml(factura.id)}"
              style="
                min-height:40px;
                padding:0 14px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-primary-border);
                background:var(--btn-primary-bg);
                color:var(--btn-primary-text);
                font-weight:var(--weight-bold);
                cursor:pointer;
              "
            >
              Descargar
            </button>

            <button
              type="button"
              data-action="send-factura"
              data-factura-id="${escapeHtml(factura.id)}"
              style="
                min-height:40px;
                padding:0 14px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-secondary-border);
                background:var(--btn-secondary-bg);
                color:var(--btn-secondary-text);
                font-weight:var(--weight-bold);
                cursor:pointer;
              "
            >
              ${localState.sendingFacturaId === factura.id ? "Enviando..." : "Enviar"}
            </button>

            <button
              type="button"
              data-action="close-factura-detail"
              style="
                min-height:40px;
                padding:0 14px;
                border-radius:var(--btn-radius);
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-soft);
                font-weight:var(--weight-bold);
                cursor:pointer;
              "
            >
              Cerrar
            </button>
          </div>
        </div>

        <div
          style="
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
            gap:var(--space-md);
          "
        >
          ${renderDetailStat("Fecha", formatDate(factura.fecha))}
          ${renderDetailStat("Estado pago", safeText(factura.estadoPago, "—"))}
          ${renderDetailStat("Estado", safeText(factura.estado, "—"))}
          ${renderDetailStat("Método pago", safeText(factura.formaPago, "—"))}
          ${renderDetailStat("Total", formatMoney(factura.total, factura.moneda))}
          ${renderDetailStat("Base", formatMoney(factura.baseImponible, factura.moneda))}
        </div>

        <div
          class="facturas-detail-grid"
          style="
            display:grid;
            grid-template-columns:1.15fr .85fr;
            gap:var(--space-lg);
          "
        >
          <section
            class="panel-surface"
            style="padding:20px; border-radius:var(--panel-radius);"
          >
            <div style="display:grid; gap:var(--space-md);">
              <div>
                <h3 style="margin:0 0 6px; color:var(--text-strong);">Líneas</h3>
                <p style="margin:0; color:var(--text-dim); font-size:var(--font-sm);">
                  Desglose principal del documento.
                </p>
              </div>

              ${
                lineas.length
                  ? `
                    <div style="display:grid; gap:12px;">
                      ${lineas
                        .map(
                          (linea) => `
                            <article
                              style="
                                display:grid;
                                gap:10px;
                                padding:16px;
                                border-radius:18px;
                                border:1px solid var(--border-soft);
                                background:var(--surface-glass);
                              "
                            >
                              <div
                                style="
                                  display:flex;
                                  justify-content:space-between;
                                  gap:12px;
                                  align-items:flex-start;
                                  flex-wrap:wrap;
                                "
                              >
                                <div style="display:grid; gap:4px;">
                                  <strong style="color:var(--text-strong); font-size:var(--font-base);">
                                    ${escapeHtml(linea.concepto || "Línea")}
                                  </strong>
                                  <span style="color:var(--text-dim); font-size:var(--font-sm);">
                                    ${escapeHtml(linea.descripcion || "Sin descripción")}
                                  </span>
                                </div>

                                <strong style="color:var(--text-strong); font-size:var(--font-lg);">
                                  ${escapeHtml(formatMoney(linea.totalLinea, factura.moneda))}
                                </strong>
                              </div>

                              <div
                                style="
                                  display:grid;
                                  grid-template-columns:repeat(auto-fit, minmax(120px,1fr));
                                  gap:10px;
                                "
                              >
                                ${renderMiniMeta("Cantidad", String(linea.cantidad))}
                                ${renderMiniMeta("Unitario", formatMoney(linea.precioUnitario, factura.moneda))}
                                ${renderMiniMeta("Subtotal", formatMoney(linea.subtotal, factura.moneda))}
                                ${renderMiniMeta("Impuesto", formatMoney(linea.impuesto, factura.moneda))}
                              </div>
                            </article>
                          `
                        )
                        .join("")}
                    </div>
                  `
                  : `
                    <p style="margin:0; color:var(--text-dim);">No hay líneas disponibles.</p>
                  `
              }
            </div>
          </section>

          <div style="display:grid; gap:var(--space-lg);">
            <section
              class="panel-surface"
              style="padding:20px; border-radius:var(--panel-radius);"
            >
              <div style="display:grid; gap:var(--space-md);">
                <div>
                  <h3 style="margin:0 0 6px; color:var(--text-strong);">Cliente</h3>
                  <p style="margin:0; color:var(--text-dim); font-size:var(--font-sm);">
                    Datos de facturación del destinatario.
                  </p>
                </div>

                ${renderMiniMeta("Empresa", factura.cliente?.empresa || factura.cliente?.nombre || "—")}
                ${renderMiniMeta("Email", factura.cliente?.email || "—")}
                ${renderMiniMeta("NIF", factura.cliente?.nif || "—")}
                ${renderMiniMeta("Teléfono", factura.cliente?.telefono || "—")}
                ${renderMiniMeta(
                  "Dirección",
                  [
                    factura.cliente?.direccion?.calle,
                    factura.cliente?.direccion?.linea2,
                    factura.cliente?.direccion?.cp,
                    factura.cliente?.direccion?.ciudad,
                    factura.cliente?.direccion?.provincia,
                    factura.cliente?.direccion?.pais,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"
                )}
              </div>
            </section>

            <section
              class="panel-surface"
              style="padding:20px; border-radius:var(--panel-radius);"
            >
              <div style="display:grid; gap:var(--space-md);">
                <div>
                  <h3 style="margin:0 0 6px; color:var(--text-strong);">Resumen</h3>
                  <p style="margin:0; color:var(--text-dim); font-size:var(--font-sm);">
                    Totales y trazabilidad.
                  </p>
                </div>

                ${renderMiniMeta("Subtotal", formatMoney(factura.subtotal || factura.baseImponible, factura.moneda))}
                ${renderMiniMeta("Impuestos", formatMoney(factura.impuestosTotal || factura.iva, factura.moneda))}
                ${renderMiniMeta("Descuento", formatMoney(factura.descuentoTotal, factura.moneda))}
                ${renderMiniMeta("Total", formatMoney(factura.total, factura.moneda))}
                ${renderMiniMeta("Actualizado", formatDateTime(factura.updatedAt))}
                ${renderMiniMeta("Enviado a", factura.enviadoA || "—")}

                ${
                  impuestos.length
                    ? `
                      <div style="display:grid; gap:10px;">
                        <strong style="color:var(--text-strong);">Impuestos</strong>
                        ${impuestos
                          .map(
                            (item) => `
                              <div
                                style="
                                  display:flex;
                                  justify-content:space-between;
                                  gap:12px;
                                  padding:12px;
                                  border-radius:14px;
                                  border:1px solid var(--border-soft);
                                  background:var(--surface-glass);
                                "
                              >
                                <span style="color:var(--text-soft);">
                                  ${escapeHtml(item.nombre || item.tipo || "Impuesto")} · ${escapeHtml(String(item.porcentaje || 0))}%
                                </span>
                                <strong style="color:var(--text-strong);">
                                  ${escapeHtml(formatMoney(item.importe, factura.moneda))}
                                </strong>
                              </div>
                            `
                          )
                          .join("")}
                      </div>
                    `
                    : ""
                }
              </div>
            </section>
          </div>
        </div>
      </div>

      <style>
        @media (max-width: 980px) {
          .facturas-detail-grid {
            grid-template-columns: 1fr !important;
          }
        }
      </style>
    `;
  }

  function renderDetailModal() {
    if (!localState.detailOpen) return "";

    return `
      <div
        class="facturas-detail-overlay"
        data-action="close-factura-detail"
        style="
          position:fixed;
          inset:0;
          z-index:var(--z-modal);
          background:var(--backdrop-bg);
          display:grid;
          place-items:center;
          padding:24px;
        "
      >
        <div
          class="facturas-detail-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Detalle de factura"
          style="
            width:min(1080px, 100%);
            max-height:min(90vh, 920px);
            overflow:auto;
            border-radius:var(--modal-radius);
            border:1px solid var(--border-soft);
            background:var(--modal-bg);
            box-shadow:var(--shadow-lg);
          "
        >
          ${renderDetailContent()}
        </div>
      </div>
    `;
  }

  /* =========================================================
     RENDER
  ========================================================= */
  function render() {
    const container = getContainer();
    if (!container) return;

    const items = getSortedFacturas();

    AppCore.cleanup.run(SCOPE);
    AppCore.setDocumentTitle("Facturas");
    AppCore.clearDynamicContainers?.();

    let bodyHtml = "";

    if (localState.loading && !items.length) {
      bodyHtml = renderLoadingState();
    } else if (localState.error && !items.length) {
      bodyHtml = renderErrorState(localState.error);
    } else {
      bodyHtml = renderCards({
        items,
        state: localState,
      });
    }

    container.innerHTML = `
      <section class="panel-content dashboard ready" data-facturas-scope="${escapeHtml(SCOPE)}">
        <div class="content-wrapper" style="display:grid; gap:var(--space-lg);">
          ${renderHeader({ items, state: localState })}
          ${bodyHtml}
        </div>
      </section>

      ${renderDetailModal()}
    `;

    localState.hydrated = true;
    bind();
  }

  function renderDetailOnly() {
    if (!localState.hydrated) return;
    render();
  }

  /* =========================================================
     EVENTS
  ========================================================= */
  function bind() {
    const scope = AppCore.cleanup.scope(SCOPE);
    const root = document.querySelector(`[data-facturas-scope="${SCOPE}"]`);

    if (!root) return;

    const refreshBtn = document.getElementById("facturas-refresh-btn");
    const retryBtn = document.getElementById("facturas-retry-btn");
    const exportBtn = document.getElementById("facturas-export-btn");

    if (refreshBtn) {
      AppCore.cleanup.on(scope, refreshBtn, "click", async () => {
        if (localState.loading || localState.refreshing) return;

        try {
          await loadFacturas({ silent: true });
          showToast("Facturas actualizadas correctamente.", "success");
        } catch {
          showToast("No se pudo actualizar el listado.", "error");
        }
      });
    }

    if (retryBtn) {
      AppCore.cleanup.on(scope, retryBtn, "click", async () => {
        try {
          await loadFacturas();
        } catch {
          showToast("No se pudo recargar la facturación.", "error");
        }
      });
    }

    if (exportBtn) {
      AppCore.cleanup.on(scope, exportBtn, "click", () => {
        exportFacturasCsv();
      });
    }

    AppCore.cleanup.on(scope, root, "click", async (event) => {
      const actionEl = event.target.closest("[data-action]");
      const cardEl = event.target.closest(".factura-card");

      if (actionEl) {
        const action = safeText(actionEl.getAttribute("data-action"), "");
        const facturaId = safeText(actionEl.getAttribute("data-factura-id"), "");

        if (action === "open-factura") {
          event.preventDefault();
          event.stopPropagation();
          await openFactura(facturaId);
          return;
        }

        if (action === "view-factura-pdf") {
          event.preventDefault();
          event.stopPropagation();
          await openFacturaPdf(facturaId);
          return;
        }

        if (action === "download-factura") {
          event.preventDefault();
          event.stopPropagation();
          await downloadFacturaPdf(facturaId);
          return;
        }

        if (action === "send-factura") {
          event.preventDefault();
          event.stopPropagation();
          await sendFacturaToClient(facturaId);
          return;
        }

        if (action === "close-factura-detail") {
          event.preventDefault();
          closeDetail();
          render();
          return;
        }
      }

      if (cardEl && !event.target.closest("button")) {
        const facturaId = safeText(cardEl.getAttribute("data-factura-id"), "");
        await openFactura(facturaId);
      }
    });

    AppCore.cleanup.on(scope, document, "keydown", (event) => {
      if (event.key === "Escape" && localState.detailOpen) {
        closeDetail();
        render();
      }
    });

    if (!localState.bootstrapped) {
      localState.bootstrapped = true;
      loadFacturas().catch(() => {
        showToast("No se pudieron cargar las facturas.", "error");
      });
    }
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */
  return {
    render,
    loadFacturas,
    openFactura,
    closeDetail,
  };
})();
