/* =========================================================
   Onion Support · Facturas · Paid Confirmation Experience
   Archivo: /src/features/facturas-paid-confirm/index.js

   PRODUCTIVO · CUSTOM CONFIRM · DEFINITIVE PDF · V1

   Objetivos:
   - eliminar el window.confirm nativo del flujo "Marcar pagada";
   - mostrar una confirmación visual propia, accesible y responsive;
   - explicar que el cobro genera/sobrescribe el PDF definitivo pagado;
   - ejecutar el comando canónico de pago del backend;
   - reabrir/sincronizar el detalle tras completar la operación;
   - permitir reparar una factura ya pagada cuya finalización documental
     no esté completada, sin duplicar el cobro.

   Esta feature se carga sólo en la ruta Facturas mediante el enhancement
   facturas-autorefresh ya existente.
========================================================= */

"use strict";

import {
  getFacturaById,
  markFacturaPaid,
} from "../../views/facturas/facturas.api.js";

export const FACTURAS_PAID_CONFIRM_VERSION =
  "facturas.paid-confirm.v1.definitive-document";

const CONTROLLER_KEY = Symbol.for("onion.support.facturas.controller");
const ACTION = "mark-factura-paid";
const STYLE_ID = "onion-facturas-paid-confirm-style";
const ROOT_ID = "onion-facturas-paid-confirm-root";
const DETAIL_SELECTOR =
  "[data-facturas-detail-root='true'], [data-facturas-detail-modal='true'], [data-role='facturas-detail-modal']";
const ACTIONS_SELECTOR = ".facturas-detail-actions";
const ROUTE_ROOT_SELECTOR = ".facturas-view-root, [data-facturas-scope='true']";
const VIEW_HOST_SELECTOR = "[data-view-container='true'], #view-container";
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let installed = false;
let observer = null;
let renderFrame = 0;
let detailLookupSeq = 0;
let state = null;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }
  return null;
}

function normalizeKey(value = "") {
  return safeString(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(value = "") {
  return escapeHtml(value);
}

function formatMoney(value = 0, currency = "EUR") {
  const amount = number(value, 0);
  const safeCurrency = safeString(currency, "EUR").toUpperCase();

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} ${safeCurrency}`;
  }
}

function getFacturaId(factura = {}) {
  return safeString(
    first(
      factura?.id,
      factura?.facturaId,
      factura?.invoiceId,
      factura?.numeroFacturaLegal,
      factura?.numeroFactura
    ),
    ""
  );
}

function getFacturaNumber(factura = {}) {
  return safeString(
    first(
      factura?.numeroFacturaLegal,
      factura?.numeroFactura,
      factura?.invoiceNumber,
      factura?.numeroFacturaSistema,
      getFacturaId(factura)
    ),
    "Factura"
  );
}

function getFacturaTotal(factura = {}) {
  return number(
    first(
      factura?.total,
      factura?.totalFactura,
      factura?.amount,
      factura?.importeTotal,
      factura?.importe,
      factura?.totals?.total,
      factura?.resumen?.total,
      0
    ),
    0
  );
}

function getFacturaCurrency(factura = {}) {
  return safeString(
    first(
      factura?.currency,
      factura?.moneda,
      factura?.payment?.currency,
      "EUR"
    ),
    "EUR"
  ).toUpperCase();
}

function getFacturaEmail(factura = {}) {
  return safeString(
    first(
      factura?.clienteSnapshot?.email,
      factura?.cliente?.email,
      factura?.emailCliente,
      factura?.clienteEmail,
      factura?.clientEmail,
      factura?.customer?.email,
      ""
    ),
    ""
  ).toLowerCase();
}

function getClientName(factura = {}) {
  return safeString(
    first(
      factura?.clienteSnapshot?.razonSocial,
      factura?.cliente?.razonSocial,
      factura?.clienteSnapshot?.empresa,
      factura?.cliente?.empresa,
      factura?.clienteSnapshot?.displayName,
      factura?.cliente?.displayName,
      factura?.clienteSnapshot?.nombreContacto,
      factura?.cliente?.nombreContacto,
      factura?.customer?.name,
      "Cliente"
    ),
    "Cliente"
  );
}

function getPaymentMethod(factura = {}) {
  return safeString(
    first(
      factura?.payment?.method,
      factura?.payment?.formaPago,
      factura?.metodoPago,
      factura?.formaPago,
      ""
    ),
    ""
  );
}

function isPaid(factura = {}) {
  const status = normalizeKey(
    first(
      factura?.paymentStatus,
      factura?.estadoPago,
      factura?.payment?.status,
      factura?.payment?.estadoPago,
      ""
    )
  );

  return [
    "paid",
    "pagada",
    "pagado",
    "cobrada",
    "cobrado",
    "abonada",
    "abonado",
  ].includes(status);
}

function finalizationState(factura = {}) {
  const finalization = safeObject(
    first(
      factura?.payment?.finalization,
      factura?.paymentFinalization,
      factura?.finalization,
      {}
    ),
    {}
  );

  const status = normalizeKey(finalization?.status || "");
  const documentStatus = normalizeKey(finalization?.document?.status || "");
  const deliveryStatus = normalizeKey(finalization?.delivery?.status || "");

  return {
    raw: finalization,
    status,
    documentStatus,
    deliveryStatus,
    completed:
      status === "completed" &&
      documentStatus === "ready" &&
      ["sent", "skipped"].includes(deliveryStatus),
    processing: status === "processing",
    documentReady: documentStatus === "ready",
    emailSent: deliveryStatus === "sent",
    emailSkipped: deliveryStatus === "skipped",
  };
}

function ensureStyle() {
  if (!isBrowser()) return false;
  if (document.getElementById(STYLE_ID)) return true;

  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = new URL("./style.css", import.meta.url).href;
  document.head.appendChild(link);
  return true;
}

function routeRoot() {
  if (!isBrowser()) return null;
  return document.querySelector(ROUTE_ROOT_SELECTOR);
}

function findController() {
  const root = routeRoot();
  const viewHost = document.querySelector(VIEW_HOST_SELECTOR);
  const candidates = [root, viewHost].filter(Boolean);

  for (const candidate of candidates) {
    let node = candidate;

    while (node) {
      try {
        if (node[CONTROLLER_KEY]) return node[CONTROLLER_KEY];
      } catch {}
      node = node.parentElement;
    }
  }

  try {
    return viewHost?.[CONTROLLER_KEY] || null;
  } catch {
    return null;
  }
}

function detailRoot() {
  if (!isBrowser()) return null;
  return document.querySelector(DETAIL_SELECTOR);
}

function facturaIdFromNode(node = null) {
  return safeString(
    first(
      node?.dataset?.facturaId,
      node?.closest?.("[data-factura-id]")?.dataset?.facturaId,
      detailRoot()?.dataset?.facturaId,
      ""
    ),
    ""
  );
}

function actionFromNode(node = null) {
  return safeString(
    first(
      node?.dataset?.facturasAction,
      node?.dataset?.action,
      ""
    ),
    ""
  );
}

function isPaymentActionNode(node = null) {
  return Boolean(node && actionFromNode(node) === ACTION);
}

function icon(name = "check") {
  if (name === "mail") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.8 5.5h16.4v13H3.8z"/><path d="m4.6 6.5 7.4 6 7.4-6"/></svg>`;
  }

  if (name === "file") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2.8h8l4 4V21H6z"/><path d="M14 2.8V7h4"/><path d="M9 12h6M9 16h6"/></svg>`;
  }

  if (name === "close") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>`;
  }

  if (name === "warning") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4z"/><path d="M12 9v4.5M12 17h.01"/></svg>`;
  }

  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>`;
}

function renderLoadingCard() {
  return `
    <div class="fpc-loading" aria-live="polite" aria-busy="true">
      <span class="fpc-spinner" aria-hidden="true"></span>
      <div>
        <strong>Cargando factura…</strong>
        <span>Comprobando el estado actual antes de registrar el cobro.</span>
      </div>
    </div>
  `;
}

function renderSummary(factura = {}) {
  const currency = getFacturaCurrency(factura);
  const email = getFacturaEmail(factura);
  const method = getPaymentMethod(factura);

  return `
    <div class="fpc-summary" aria-label="Resumen de la factura">
      <div class="fpc-summary-item">
        <span>Factura</span>
        <strong>${escapeHtml(getFacturaNumber(factura))}</strong>
      </div>
      <div class="fpc-summary-item fpc-summary-item--amount">
        <span>Importe</span>
        <strong>${escapeHtml(formatMoney(getFacturaTotal(factura), currency))}</strong>
      </div>
      <div class="fpc-summary-item">
        <span>Cliente</span>
        <strong>${escapeHtml(getClientName(factura))}</strong>
      </div>
      <div class="fpc-summary-item">
        <span>Destinatario</span>
        <strong>${escapeHtml(email || "Sin email disponible")}</strong>
      </div>
      ${
        method
          ? `<div class="fpc-summary-item fpc-summary-item--wide"><span>Forma de pago</span><strong>${escapeHtml(method)}</strong></div>`
          : ""
      }
    </div>
  `;
}

function renderFlow() {
  return `
    <div class="fpc-flow" aria-label="Proceso que se realizará">
      <div class="fpc-flow-item">
        <span class="fpc-flow-icon" aria-hidden="true">${icon("check")}</span>
        <div>
          <strong>Cobro completo</strong>
          <small>Estado Pagada y pendiente 0,00 €.</small>
        </div>
      </div>
      <span class="fpc-flow-line" aria-hidden="true"></span>
      <div class="fpc-flow-item">
        <span class="fpc-flow-icon" aria-hidden="true">${icon("file")}</span>
        <div>
          <strong>PDF definitivo</strong>
          <small>Se regenera y sustituye el PDF pendiente.</small>
        </div>
      </div>
      <span class="fpc-flow-line" aria-hidden="true"></span>
      <div class="fpc-flow-item">
        <span class="fpc-flow-icon" aria-hidden="true">${icon("mail")}</span>
        <div>
          <strong>Entrega al cliente</strong>
          <small>Se envía la factura pagada actualizada.</small>
        </div>
      </div>
    </div>
  `;
}

function resultCopy(factura = {}) {
  const finalization = finalizationState(factura);

  if (finalization.completed && finalization.emailSent) {
    return {
      tone: "success",
      title: "Factura pagada y enviada",
      text:
        "El cobro está registrado, el PDF definitivo ya muestra el estado Pagada y se ha enviado al cliente.",
    };
  }

  if (finalization.completed && finalization.emailSkipped) {
    return {
      tone: "warning",
      title: "Factura pagada y actualizada",
      text:
        "El PDF definitivo ya está actualizado. El envío automático se omitió porque no había un destinatario o servicio de correo disponible.",
    };
  }

  if (finalization.processing) {
    return {
      tone: "info",
      title: "Finalización en curso",
      text:
        "El cobro ya está registrado y el backend está terminando la versión definitiva de la factura.",
    };
  }

  if (finalization.documentReady) {
    return {
      tone: "warning",
      title: "PDF pagado listo; envío pendiente",
      text:
        "El documento definitivo ya está actualizado en el sistema, pero el correo al cliente necesita reintento.",
    };
  }

  if (isPaid(factura)) {
    return {
      tone: "error",
      title: "Cobro registrado; falta finalizar el documento",
      text:
        "La factura ya consta como pagada, pero el PDF definitivo no quedó completado. Puedes reintentar la finalización sin duplicar el cobro.",
    };
  }

  return {
    tone: "error",
    title: "No se pudo completar la operación",
    text: "No se ha podido confirmar el estado final de la factura.",
  };
}

function renderResult(factura = {}) {
  const copy = resultCopy(factura);
  const finalization = finalizationState(factura);
  const retryable =
    isPaid(factura) &&
    !finalization.completed &&
    !finalization.processing;

  return `
    <div class="fpc-result fpc-result--${attr(copy.tone)}" role="status" aria-live="polite">
      <span class="fpc-result-icon" aria-hidden="true">
        ${icon(copy.tone === "error" || copy.tone === "warning" ? "warning" : "check")}
      </span>
      <div>
        <strong>${escapeHtml(copy.title)}</strong>
        <p>${escapeHtml(copy.text)}</p>
      </div>
    </div>
    <div class="fpc-actions">
      ${
        retryable
          ? `<button type="button" class="fpc-btn fpc-btn--secondary" data-fpc-action="retry">Reintentar finalización</button>`
          : ""
      }
      <button type="button" class="fpc-btn fpc-btn--primary" data-fpc-action="done">Cerrar</button>
    </div>
  `;
}

function renderDialog() {
  if (!state?.open) return "";

  const factura = safeObject(state.factura, {});
  const alreadyPaid = isPaid(factura);
  const title = alreadyPaid
    ? "Finalizar factura pagada"
    : "Confirmar cobro completo";
  const intro = alreadyPaid
    ? "El cobro ya consta registrado. Vamos a completar o reparar la factura definitiva sin volver a registrar el pago."
    : "Al confirmar, se registrará el cobro completo y se generará la versión definitiva de la factura.";
  const email = getFacturaEmail(factura);
  const busy = state.loading || state.submitting;

  return `
    <div class="fpc-overlay" data-fpc-overlay="true">
      <section
        class="fpc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fpc-title"
        aria-describedby="fpc-description"
        tabindex="-1"
        data-fpc-dialog="true"
      >
        <header class="fpc-header">
          <span class="fpc-hero-icon" aria-hidden="true">${icon("check")}</span>
          <div class="fpc-header-copy">
            <span class="fpc-eyebrow">Facturación · Confirmación</span>
            <h2 id="fpc-title">${escapeHtml(title)}</h2>
            <p id="fpc-description">${escapeHtml(intro)}</p>
          </div>
          <button
            type="button"
            class="fpc-close"
            data-fpc-action="cancel"
            aria-label="Cerrar confirmación"
            title="Cerrar"
            ${busy ? "disabled aria-disabled=\"true\"" : ""}
          >${icon("close")}</button>
        </header>

        <div class="fpc-body">
          ${state.loading ? renderLoadingCard() : ""}
          ${!state.loading && state.factura ? renderSummary(factura) : ""}
          ${!state.loading && state.factura ? renderFlow() : ""}

          ${
            !state.loading && state.factura && !email
              ? `<div class="fpc-note" role="note"><span aria-hidden="true">${icon("warning")}</span><p><strong>Sin email de cliente</strong><small>El cobro y el PDF definitivo se completarán igualmente, pero no podrá hacerse la entrega automática por correo.</small></p></div>`
              : ""
          }

          ${
            state.error
              ? `<div class="fpc-error" role="alert"><strong>No se pudo preparar la operación</strong><span>${escapeHtml(state.error)}</span></div>`
              : ""
          }

          ${
            state.result && state.factura
              ? renderResult(factura)
              : !state.loading
                ? `
                  <div class="fpc-actions">
                    <button
                      type="button"
                      class="fpc-btn fpc-btn--secondary"
                      data-fpc-action="cancel"
                      ${state.submitting ? "disabled aria-disabled=\"true\"" : ""}
                    >Cancelar</button>
                    <button
                      type="button"
                      class="fpc-btn fpc-btn--primary"
                      data-fpc-action="confirm"
                      ${state.submitting || !state.factura ? "disabled aria-disabled=\"true\"" : ""}
                    >
                      ${
                        state.submitting
                          ? `<span class="fpc-spinner fpc-spinner--button" aria-hidden="true"></span><span>Finalizando…</span>`
                          : `<span aria-hidden="true">${icon("check")}</span><span>${alreadyPaid ? "Finalizar y enviar" : "Marcar pagada y enviar"}</span>`
                      }
                    </button>
                  </div>
                `
                : ""
          }
        </div>
      </section>
    </div>
  `;
}

function ensureRoot() {
  if (!isBrowser()) return null;

  let root = document.getElementById(ROOT_ID);

  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.dataset.fpcRoot = "true";
    document.body.appendChild(root);
  }

  return root;
}

function focusDialogPrimary() {
  const root = document.getElementById(ROOT_ID);
  const dialog = root?.querySelector?.("[data-fpc-dialog='true']");
  if (!dialog) return false;

  const target =
    dialog.querySelector("[data-fpc-action='confirm']:not([disabled])") ||
    dialog.querySelector("[data-fpc-action='done']:not([disabled])") ||
    dialog.querySelector("[data-fpc-action='cancel']:not([disabled])") ||
    dialog;

  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus?.();
  }

  return true;
}

function render({ focus = false } = {}) {
  const root = ensureRoot();
  if (!root) return false;

  root.innerHTML = renderDialog();
  document.body?.classList.toggle("facturas-payment-confirm-open", Boolean(state?.open));

  if (focus && state?.open) {
    requestAnimationFrame(() => focusDialogPrimary());
  }

  return true;
}

function closeDialog({ restoreFocus = true } = {}) {
  const opener = state?.opener || null;
  state = null;
  render();

  if (restoreFocus && opener?.isConnected && typeof opener.focus === "function") {
    requestAnimationFrame(() => {
      try {
        opener.focus({ preventScroll: true });
      } catch {
        opener.focus?.();
      }
    });
  }

  return true;
}

async function openDialog(node = null) {
  const facturaId = facturaIdFromNode(node);
  if (!facturaId || state?.submitting) return false;

  const seq = ++detailLookupSeq;

  state = {
    open: true,
    facturaId,
    factura: null,
    loading: true,
    submitting: false,
    result: false,
    error: "",
    opener: node,
  };

  render({ focus: true });

  try {
    const factura = await getFacturaById(facturaId);

    if (!state?.open || seq !== detailLookupSeq || state.facturaId !== facturaId) {
      return false;
    }

    if (!factura) {
      throw new Error("No se pudo cargar la factura antes de confirmar el cobro.");
    }

    state.factura = factura;
    state.loading = false;
    state.error = "";
    render({ focus: true });
    return true;
  } catch (error) {
    if (!state?.open || seq !== detailLookupSeq) return false;

    state.loading = false;
    state.error = safeString(
      first(error?.message, error?.data?.message, "No se pudo cargar la factura."),
      "No se pudo cargar la factura."
    );
    render({ focus: true });
    return false;
  }
}

async function syncControllerAfterPayment(facturaId = "") {
  const controller = findController();
  if (!controller) return false;

  try {
    if (typeof controller.closeDetailModal === "function") {
      controller.closeDetailModal();
    }

    if (typeof controller.refresh === "function") {
      await controller.refresh();
    }

    if (typeof controller.openFactura === "function") {
      await controller.openFactura(facturaId);
    }

    return true;
  } catch {
    return false;
  }
}

async function executePayment() {
  if (!state?.open || state.loading || state.submitting || !state.facturaId) {
    return false;
  }

  const facturaId = state.facturaId;
  state.submitting = true;
  state.error = "";
  render({ focus: true });

  try {
    await markFacturaPaid(
      facturaId,
      {},
      { timeout: 120_000 }
    );

    const latest = await getFacturaById(facturaId, {
      force: true,
      cache: false,
    });

    if (!state?.open || state.facturaId !== facturaId) return false;

    state.factura = latest || state.factura;
    state.submitting = false;
    state.result = true;
    state.error = "";

    await syncControllerAfterPayment(facturaId);
    render({ focus: true });
    scheduleReconcile();
    return true;
  } catch (error) {
    if (!state?.open || state.facturaId !== facturaId) return false;

    state.submitting = false;
    state.error = safeString(
      first(
        error?.message,
        error?.data?.message,
        error?.payload?.message,
        "No se pudo completar la operación."
      ),
      "No se pudo completar la operación."
    );

    try {
      const latest = await getFacturaById(facturaId, {
        force: true,
        cache: false,
      });

      if (latest && state?.open && state.facturaId === facturaId) {
        state.factura = latest;
        state.result = isPaid(latest);
      }
    } catch {}

    render({ focus: true });
    scheduleReconcile();
    return false;
  }
}

async function reconcileRetryAction() {
  renderFrame = 0;

  const detail = detailRoot();
  if (!detail?.isConnected) return false;

  const facturaId = safeString(
    first(
      detail?.dataset?.facturaId,
      detail?.closest?.("[data-factura-id]")?.dataset?.facturaId,
      ""
    ),
    ""
  );

  if (!facturaId) return false;

  const actions = detail.querySelector(ACTIONS_SELECTOR);
  if (!actions) return false;

  const existingRetry = actions.querySelector("[data-fpc-retry-action='true']");
  const existingCanonical = actions.querySelector(
    `[data-facturas-action="${ACTION}"], [data-action="${ACTION}"]`
  );

  if (existingCanonical && !existingRetry) {
    return true;
  }

  const seq = ++detailLookupSeq;

  try {
    const factura = await getFacturaById(facturaId);
    if (seq !== detailLookupSeq || !detail?.isConnected) return false;

    const fin = finalizationState(factura || {});
    const shouldRetry = isPaid(factura || {}) && !fin.completed;

    if (!shouldRetry) {
      existingRetry?.remove?.();
      return true;
    }

    if (existingRetry?.isConnected) {
      existingRetry.dataset.facturaId = facturaId;
      existingRetry.disabled = fin.processing;
      existingRetry.setAttribute("aria-disabled", fin.processing ? "true" : "false");
      existingRetry.querySelector("span:last-child").textContent =
        fin.processing ? "Finalizando…" : "Finalizar factura";
      return true;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "facturas-detail-btn facturas-detail-btn--primary";
    button.dataset.action = ACTION;
    button.dataset.facturasAction = ACTION;
    button.dataset.facturaId = facturaId;
    button.dataset.fpcRetryAction = "true";
    button.title = "Completar el PDF definitivo pagado y su envío";
    button.setAttribute("aria-label", "Finalizar factura pagada");
    button.disabled = fin.processing;
    button.setAttribute("aria-disabled", fin.processing ? "true" : "false");
    button.innerHTML = `
      <span class="facturas-detail-btn-icon" aria-hidden="true">${icon("check")}</span>
      <span>${fin.processing ? "Finalizando…" : "Finalizar factura"}</span>
    `;

    const closeButton = actions.querySelector(".facturas-detail-btn--close");
    actions.insertBefore(button, closeButton || null);
    return true;
  } catch {
    return false;
  }
}

function scheduleReconcile() {
  if (!isBrowser() || renderFrame) return false;

  renderFrame = window.requestAnimationFrame(() => {
    void reconcileRetryAction();
  });

  return true;
}

function onDocumentClick(event) {
  const target = event.target?.nodeType === 3
    ? event.target.parentElement
    : event.target;

  if (!target?.closest) return;

  const actionNode = target.closest(
    `[data-facturas-action="${ACTION}"], [data-action="${ACTION}"]`
  );

  if (actionNode && actionNode.closest(DETAIL_SELECTOR)) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void openDialog(actionNode);
    return;
  }

  const localAction = target.closest("[data-fpc-action]");
  if (!localAction || !document.getElementById(ROOT_ID)?.contains(localAction)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const action = safeString(localAction.dataset.fpcAction, "");

  if (action === "cancel") {
    if (!state?.submitting) closeDialog();
    return;
  }

  if (action === "confirm" || action === "retry") {
    void executePayment();
    return;
  }

  if (action === "done") {
    closeDialog({ restoreFocus: false });
  }
}

function onDocumentKeydown(event) {
  if (!state?.open) return;

  const root = document.getElementById(ROOT_ID);
  const dialog = root?.querySelector?.("[data-fpc-dialog='true']");
  if (!dialog) return;

  if (event.key === "Escape") {
    if (!state.submitting) {
      event.preventDefault();
      event.stopPropagation();
      closeDialog();
    }
    return;
  }

  if (event.key !== "Tab") return;

  const focusables = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((node) => !node.disabled && node.getAttribute("aria-disabled") !== "true");

  if (!focusables.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const firstNode = focusables[0];
  const lastNode = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (!dialog.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? lastNode : firstNode).focus();
    return;
  }

  if (event.shiftKey && active === firstNode) {
    event.preventDefault();
    lastNode.focus();
  } else if (!event.shiftKey && active === lastNode) {
    event.preventDefault();
    firstNode.focus();
  }
}

function onRootClick(event) {
  if (!state?.open || state.submitting) return;
  const overlay = event.target?.closest?.("[data-fpc-overlay='true']");
  const dialog = event.target?.closest?.("[data-fpc-dialog='true']");

  if (overlay && !dialog && event.target === overlay) {
    closeDialog();
  }
}

export function installFacturasPaidConfirm() {
  if (!isBrowser() || installed) return false;

  ensureStyle();
  ensureRoot();

  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onDocumentKeydown, true);
  document.getElementById(ROOT_ID)?.addEventListener("click", onRootClick);

  observer = new MutationObserver(() => scheduleReconcile());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  installed = true;
  scheduleReconcile();
  return true;
}

export function destroyFacturasPaidConfirm() {
  if (!isBrowser() || !installed) return false;

  installed = false;
  document.removeEventListener("click", onDocumentClick, true);
  document.removeEventListener("keydown", onDocumentKeydown, true);
  document.getElementById(ROOT_ID)?.removeEventListener("click", onRootClick);
  observer?.disconnect?.();
  observer = null;

  if (renderFrame) {
    window.cancelAnimationFrame(renderFrame);
    renderFrame = 0;
  }

  closeDialog({ restoreFocus: false });
  return true;
}

installFacturasPaidConfirm();

export const FacturasPaidConfirm = Object.freeze({
  version: FACTURAS_PAID_CONFIRM_VERSION,
  install: installFacturasPaidConfirm,
  destroy: destroyFacturasPaidConfirm,
  reconcile: reconcileRetryAction,
  getSnapshot() {
    return Object.freeze({
      installed,
      dialogOpen: Boolean(state?.open),
      submitting: Boolean(state?.submitting),
      facturaId: state?.facturaId ? "***" : "",
      retryObserver: Boolean(observer),
      policy: Object.freeze({
        noNativeConfirm: true,
        definitivePdf: true,
        paymentIdempotentRetry: true,
        accessibleDialog: true,
        focusTrap: true,
        escapeClose: true,
      }),
    });
  },
});

export default FacturasPaidConfirm;
