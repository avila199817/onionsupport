import { getFinalization, reconcilePaymentResult } from "./payment-state.js";
import { renderReviewPanel } from "./review-panel.js";
import { getFacturaReviews, requestFacturaReviews } from "../../views/facturas/facturas.reviews.api.js";
import { AppCore } from "../../core/index.js";
import { createModalLifecycle, restoreModalFocus } from "../entity-overlay/modal-lifecycle.js";
import { createModalHost, renderModalContent } from "../entity-overlay/modal-host.js";
/* =========================================================
   Onion Support · Facturas · Paid Confirmation Experience
   Archivo: /src/features/facturas-paid-confirm/index.js

   PRODUCTIVO · CUSTOM CONFIRM · DEFINITIVE PDF · V1.1
========================================================= */

"use strict";

import {
  getFacturaById,
  markFacturaPaid,
} from "../../views/facturas/facturas.api.js";

export const FACTURAS_PAID_CONFIRM_VERSION =
  "facturas.paid-confirm.v2.verified-resumable";

const CONTROLLER_KEY = Symbol.for("onion.support.facturas.controller");
const ACTION = "mark-factura-paid";
const ROOT_ID = "onion-facturas-paid-confirm-root";
const STYLE_ID = "onion-facturas-paid-confirm-style";
const VIEW_HOST_SELECTOR = "[data-view-container='true'], #view-container";
const VIEW_ROOT_SELECTOR = ".facturas-view-root, [data-facturas-scope='true']";
const DETAIL_ROOT_SELECTOR = "[data-facturas-detail-root='true']";
const DETAIL_PANEL_SELECTOR =
  "[data-facturas-detail-modal='true'], [data-role='facturas-detail-modal']";
const ACTIONS_SELECTOR = ".facturas-detail-actions";
let installed = false;
let observer = null;
let reconcileFrame = 0;
let retryPollTimer = 0;
let dialogLookupSeq = 0;
let reconcileLookupSeq = 0;
let state = null;
let reviewPollTimer = 0;
const confirmationHost = createModalHost({
  id: ROOT_ID,
  attributes: { "data-fpc-root": "true" },
  onMount: root => root.addEventListener("click", onRootClick),
  onRemove: root => root.removeEventListener("click", onRootClick),
});
const modalLifecycle = createModalLifecycle({
  getPanel: () => document.querySelector(`#${ROOT_ID} [data-fpc-dialog='true']`),
  onEscape: () => { if (!state?.submitting) closeDialog(); },
  onDetached: () => closeDialog({ restoreFocus: false }),
  bodyClasses: ['facturas-payment-confirm-open'],
});

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

function formatMoney(value = 0, currency = "EUR") {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const safeCurrency = safeString(currency, "EUR").toUpperCase();

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    return `${safeAmount.toFixed(2).replace(".", ",")} ${safeCurrency}`;
  }
}

function facturaId(factura = {}) {
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

function facturaNumber(factura = {}) {
  return safeString(
    first(
      factura?.numeroFacturaLegal,
      factura?.numeroFactura,
      factura?.invoiceNumber,
      factura?.numeroFacturaSistema,
      facturaId(factura)
    ),
    "Factura"
  );
}

function facturaTotal(factura = {}) {
  const value = Number(
    first(
      factura?.total,
      factura?.totalFactura,
      factura?.amount,
      factura?.importeTotal,
      factura?.importe,
      factura?.totals?.total,
      factura?.resumen?.total,
      0
    )
  );
  return Number.isFinite(value) ? value : 0;
}

function facturaCurrency(factura = {}) {
  return safeString(
    first(factura?.currency, factura?.moneda, factura?.payment?.currency, "EUR"),
    "EUR"
  ).toUpperCase();
}

function facturaEmail(factura = {}) {
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

function facturaClient(factura = {}) {
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

function facturaPaymentMethod(factura = {}) {
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

function facturaIsPaid(factura = {}) {
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

function ensureStyle() {
  if (!isBrowser() || document.getElementById(STYLE_ID)) return true;

  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = new URL("./style.css", import.meta.url).href;
  document.head.appendChild(link);
  return true;
}

function ensureRoot() {
  return isBrowser() ? confirmationHost.ensure() : null;
}

function viewRoot() {
  return isBrowser() ? document.querySelector(VIEW_ROOT_SELECTOR) : null;
}

function detailRoot() {
  if (!isBrowser()) return null;
  return document.querySelector(DETAIL_ROOT_SELECTOR) ||
    document.querySelector(DETAIL_PANEL_SELECTOR);
}

function findController() {
  const viewHost = document.querySelector(VIEW_HOST_SELECTOR);
  const candidates = [viewRoot(), viewHost].filter(Boolean);

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

function nodeFacturaId(node = null) {
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
    first(node?.dataset?.facturasAction, node?.dataset?.action, ""),
    ""
  );
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

function renderSummary(factura = {}) {
  const method = facturaPaymentMethod(factura);

  return `
    <div class="fpc-summary" aria-label="Resumen de la factura">
      <div class="fpc-summary-item"><span>Factura</span><strong>${escapeHtml(facturaNumber(factura))}</strong></div>
      <div class="fpc-summary-item fpc-summary-item--amount"><span>Importe</span><strong>${escapeHtml(formatMoney(facturaTotal(factura), facturaCurrency(factura)))}</strong></div>
      <div class="fpc-summary-item"><span>Cliente</span><strong>${escapeHtml(facturaClient(factura))}</strong></div>
      <div class="fpc-summary-item"><span>Destinatario</span><strong>${escapeHtml(facturaEmail(factura) || "Sin email disponible")}</strong></div>
      ${method ? `<div class="fpc-summary-item fpc-summary-item--wide"><span>Forma de pago</span><strong>${escapeHtml(method)}</strong></div>` : ""}
    </div>
  `;
}

function renderFlow() {
  return `
    <div class="fpc-flow" aria-label="Proceso que se realizará">
      <div class="fpc-flow-item"><span class="fpc-flow-icon" aria-hidden="true">${icon("check")}</span><div><strong>Cobro completo</strong><small>Estado Pagada y pendiente 0,00 €.</small></div></div>
      <span class="fpc-flow-line" aria-hidden="true"></span>
      <div class="fpc-flow-item"><span class="fpc-flow-icon" aria-hidden="true">${icon("file")}</span><div><strong>PDF definitivo</strong><small>Se valida, se conserva una copia y se verifica el PDF guardado.</small></div></div>
      <span class="fpc-flow-line" aria-hidden="true"></span>
      <div class="fpc-flow-item"><span class="fpc-flow-icon" aria-hidden="true">${icon("mail")}</span><div><strong>Entrega al cliente</strong><small>Se registra el envío y se consulta su aceptación.</small></div></div>
    </div>
  `;
}

function getResultCopy(factura = {}) {
  const fin = getFinalization(factura);

  if (fin.completed && fin.emailSent) {
    return ["success", "Factura pagada; envío aceptado", "El cobro está registrado, el PDF definitivo se ha verificado y el proveedor ha aceptado el correo. La entrega al buzón depende del servicio de correo."];
  }
  if (fin.blocked || fin.emailSkipped) {
    return ["warning", "Factura pagada y actualizada", "El envío no está completado: falta un destinatario o configuración de correo. El cobro permanece registrado."];
  }
  if (fin.uncertain) {
    return ["warning", "Envío pendiente de confirmación", "El cobro está registrado. Consultaremos al proveedor sin reenviar a ciegas un correo que podría estar aceptado."];
  }
  if (fin.processing) {
    return ["info", "Finalización en curso", "El cobro ya está registrado y el backend está terminando la versión definitiva de la factura."];
  }
  if (fin.documentReady) {
    return ["warning", "PDF pagado listo; envío pendiente", "El documento definitivo ya está actualizado en el sistema, pero el correo al cliente necesita reintento."];
  }
  if (facturaIsPaid(factura) && !fin.known) {
    return ["warning", "Cobro registrado; estado documental no disponible", "La consulta no incluye el estado del PDF y del correo. Esto no confirma un fallo ni justifica reenviar. Actualiza el estado antes de reintentar."];
  }
  if (facturaIsPaid(factura)) {
    return ["error", "Cobro registrado; falta finalizar el documento", "La factura consta como pagada, pero el PDF definitivo no quedó completado. Puedes reintentar sin duplicar el cobro."];
  }
  return ["error", "No se pudo completar la operación", "No se ha podido confirmar el estado final de la factura."];
}

function renderResult(factura = {}) {
  const [tone, title, text] = getResultCopy(factura);
  const fin = getFinalization(factura);
  const retryable = facturaIsPaid(factura) && fin.known && !fin.completed && !fin.processing;

  return `
    <div class="fpc-result fpc-result--${escapeHtml(tone)}" role="status" aria-live="polite">
      <span class="fpc-result-icon" aria-hidden="true">${icon(tone === "success" || tone === "info" ? "check" : "warning")}</span>
      <div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div>
    </div>
    <div class="fpc-actions">
      ${facturaIsPaid(factura) && !fin.known ? `<button type="button" class="fpc-btn fpc-btn--secondary" data-fpc-action="refresh-status">Actualizar estado</button>` : ""}
      ${retryable ? `<button type="button" class="fpc-btn fpc-btn--secondary" data-fpc-action="retry">Reintentar finalización</button>` : ""}
      <button type="button" class="fpc-btn fpc-btn--primary" data-fpc-action="done">Cerrar</button>
    </div>
  `;
}

function renderDialog() {
  if (!state?.open) return "";

  const factura = safeObject(state.factura, {});
  const alreadyPaid = facturaIsPaid(factura);
  const busy = state.loading || state.submitting;
  const complete = getFinalization(factura).completed;
  const title = complete ? "Factura pagada" : alreadyPaid ? "Finalizar factura pagada" : "Confirmar cobro completo";
  const intro = complete ? "Cobro y envío de factura confirmados. Aquí puedes consultar las valoraciones del servicio." : alreadyPaid
    ? "El cobro ya consta registrado. Se completará o reparará la factura definitiva sin volver a registrar el pago."
    : "Al confirmar, se registrará el cobro completo y se generará la versión definitiva de la factura.";

  return `
    <div class="fpc-overlay" data-fpc-overlay="true">
      <section class="fpc-dialog" role="dialog" aria-modal="true" aria-labelledby="fpc-title" aria-describedby="fpc-description" tabindex="-1" data-fpc-dialog="true">
        <header class="fpc-header">
          <span class="fpc-hero-icon" aria-hidden="true">${icon("check")}</span>
          <div class="fpc-header-copy"><span class="fpc-eyebrow">Facturación · Confirmación</span><h2 id="fpc-title">${escapeHtml(title)}</h2><p id="fpc-description">${escapeHtml(intro)}</p></div>
          <button type="button" class="fpc-close" data-fpc-action="cancel" aria-label="Cerrar confirmación" title="Cerrar" ${busy ? "disabled aria-disabled=\"true\"" : ""}>${icon("close")}</button>
        </header>

        <div class="fpc-body">
          ${state.loading ? `<div class="fpc-loading" aria-live="polite" aria-busy="true"><span class="fpc-spinner" aria-hidden="true"></span><div><strong>Cargando factura…</strong><span>Comprobando el estado actual antes de continuar.</span></div></div>` : ""}
          ${!state.loading && state.factura ? renderSummary(factura) : ""}
          ${!state.loading && state.factura ? renderFlow() : ""}
          ${!state.loading && state.factura && !facturaEmail(factura) ? `<div class="fpc-note" role="note"><span aria-hidden="true">${icon("warning")}</span><p><strong>Sin email de cliente</strong><small>El cobro y el PDF definitivo se completarán igualmente, pero no podrá hacerse la entrega automática por correo.</small></p></div>` : ""}
          ${state.error ? `<div class="fpc-error" role="alert"><strong>No se pudo completar la acción</strong><span>${escapeHtml(state.error)}</span></div>` : ""}
          ${state.result && state.factura
            ? renderResult(factura)
            : !state.loading
              ? `<div class="fpc-actions">
                  <button type="button" class="fpc-btn fpc-btn--secondary" data-fpc-action="cancel" ${state.submitting ? "disabled aria-disabled=\"true\"" : ""}>Cancelar</button>
                  <button type="button" class="fpc-btn fpc-btn--primary" data-fpc-action="confirm" ${state.submitting || !state.factura ? "disabled aria-disabled=\"true\"" : ""}>
                    ${state.submitting ? `<span class="fpc-spinner fpc-spinner--button" aria-hidden="true"></span><span>Finalizando…</span>` : `<span aria-hidden="true">${icon("check")}</span><span>${alreadyPaid ? "Finalizar y enviar" : "Marcar pagada y enviar"}</span>`}
                  </button>
                </div>`
              : ""}
          ${!state.loading && state.result && facturaIsPaid(factura) && AppCore.getState()?.role === "admin" ? renderReviewPanel({ data: state.reviews, loading: state.reviewsLoading, error: state.reviewsError, canRequest: complete }) : ""}
        </div>
      </section>
    </div>
  `;
}

function focusDialog() {
  const dialog = document.querySelector(`#${ROOT_ID} [data-fpc-dialog='true']`);
  if (!dialog) return false;

  const target =
    dialog.querySelector("[data-fpc-action='confirm']:not([disabled])") ||
    dialog.querySelector("[data-fpc-action='retry']:not([disabled])") ||
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
  const root = state?.open ? ensureRoot() : confirmationHost.get();
  if (!root) return false;

  renderModalContent(root, renderDialog(), {
    rootSelector: "[data-fpc-overlay='true']",
    panelSelector: "[data-fpc-dialog='true']",
    focusAttributes: ["id", "data-fpc-action"],
    scrollSelector: ".fpc-body",
  });
  if (state?.open) modalLifecycle.activate({ opener: state.opener });
  else modalLifecycle.deactivate({ restoreFocus: false });
  if (focus && state?.open) requestAnimationFrame(focusDialog);
  return true;
}

function closeDialog({ restoreFocus = true } = {}) {
  const opener = state?.opener || null;
  clearTimeout(reviewPollTimer); reviewPollTimer = 0;
  state?.reviewController?.abort();
  state = null;
  dialogLookupSeq += 1;
  render();

  if (restoreFocus) requestAnimationFrame(() => restoreModalFocus(opener));
  return true;
}

async function openDialog(node = null) {
  const id = nodeFacturaId(node);
  if (!id || state?.submitting) return false;

  clearTimeout(reviewPollTimer); reviewPollTimer = 0;
  state?.reviewController?.abort();
  const seq = ++dialogLookupSeq;
  state = {
    open: true,
    facturaId: id,
    factura: null,
    loading: true,
    submitting: false,
    result: false,
    error: "",
    opener: node,
    reviews: null, reviewsLoading: false, reviewsError: "", reviewPolls: 0,
  };
  render({ focus: true });

  try {
    const factura = await getFacturaById(id);
    if (!state?.open || seq !== dialogLookupSeq || state.facturaId !== id) return false;
    if (!factura) throw new Error("No se pudo cargar la factura antes de confirmar el cobro.");

    state.factura = factura;
    state.loading = false;
    state.result = facturaIsPaid(factura);
    render({ focus: true });
    if (state.result) void loadReviews();
    return true;
  } catch (error) {
    if (!state?.open || seq !== dialogLookupSeq) return false;
    state.loading = false;
    state.error = safeString(
      first(error?.message, error?.data?.message, "No se pudo cargar la factura."),
      "No se pudo cargar la factura."
    );
    render({ focus: true });
    return false;
  }
}

async function syncController(id = "") {
  const controller = findController();
  if (!controller) return false;

  try {
    controller.closeDetailModal?.();
    if (typeof controller.refresh === "function") await controller.refresh();
    if (typeof controller.openFactura === "function") await controller.openFactura(id);
    return true;
  } catch {
    return false;
  }
}

async function executePayment() {
  if (!state?.open || state.loading || state.submitting || !state.facturaId) {
    return false;
  }

  if (AppCore.getState()?.role !== "admin") return false;
  const id = state.facturaId;
  state.submitting = true;
  state.error = "";
  render({ focus: true });

  try {
    const committed = await markFacturaPaid(id, {}, { timeout: 120_000 });
    // The financial command succeeded. A refresh failure must not turn it into
    // another payment command or discard its authoritative finalization state.
    let latest = null;
    try { latest = await getFacturaById(id, { force: true, cache: false }); } catch {}
    const resolved = reconcilePaymentResult(committed, latest);

    if (!state?.open || state.facturaId !== id) return false;

    state.factura = resolved || state.factura;
    state.submitting = false;
    state.result = true;
    await syncController(id);
    render({ focus: true });
    scheduleReconcile();
    void loadReviews();
    return true;
  } catch (error) {
    if (!state?.open || state.facturaId !== id) return false;

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
      const latest = await getFacturaById(id, { force: true, cache: false });
      if (latest && state?.open && state.facturaId === id) {
        state.factura = latest;
        state.result = facturaIsPaid(latest);
      }
    } catch {}

    render({ focus: true });
    scheduleReconcile();
    return false;
  }
}

async function refreshPaymentStatus() {
  if (!state?.open || state.submitting) return false;
  const currentState = state;
  state.submitting = true;
  state.error = "";
  render();
  try {
    const latest = await getFacturaById(state.facturaId, { force: true, cache: false });
    if (state !== currentState) return false;
    state.factura = reconcilePaymentResult(state.factura, latest);
    state.result = true;
    return true;
  } catch {
    if (state === currentState) state.error = "No se pudo consultar el estado. No se ha reenviado ningún correo ni registrado otro pago.";
    return false;
  } finally {
    if (state === currentState) { state.submitting = false; render({ focus: true }); }
  }
}

async function loadReviews(request = false) {
  if (!state?.open || state.reviewsLoading || AppCore.getState()?.role !== "admin" || !facturaIsPaid(state.factura)) return false;
  if (request && (!getFinalization(state.factura).completed || state.reviews?.summary?.status !== "not_requested")) return false;
  const current = state;
  clearTimeout(reviewPollTimer); reviewPollTimer = 0;
  current.reviewsLoading = true; current.reviewsError = "";
  current.reviewController = new AbortController();
  render();
  try {
    const result = await (request ? requestFacturaReviews : getFacturaReviews)(current.facturaId, { signal: current.reviewController.signal });
    if (state !== current) return false;
    current.reviews = result;
    return true;
  } catch {
    if (state === current && request) current.reviews = null;
    if (state === current) current.reviewsError = request
      ? "No se ha confirmado la solicitud. Actualiza el estado antes de intentarlo de nuevo. El pago no se ha modificado."
      : "No se han podido consultar las valoraciones. El estado de la factura no cambia.";
    return false;
  } finally {
    if (state === current) {
      current.reviewsLoading = false; render();
      if (["pending", "preparing", "sending", "uncertain"].includes(current.reviews?.summary?.status) && current.reviewPolls++ < 12) {
        reviewPollTimer = setTimeout(() => void loadReviews(), 10000);
      }
    }
  }
}

async function reconcileRetryAction() {
  reconcileFrame = 0;

  clearTimeout(retryPollTimer);
  retryPollTimer = 0;
  const detail = detailRoot();
  if (AppCore.getState()?.role !== "admin") { detail?.querySelector("[data-fpc-retry-action='true']")?.remove(); return false; }
  if (!detail?.isConnected) return false;

  const id = safeString(
    first(detail.dataset?.facturaId, detail.closest?.("[data-factura-id]")?.dataset?.facturaId, ""),
    ""
  );
  if (!id) return false;

  const actions = detail.querySelector(ACTIONS_SELECTOR);
  if (!actions) return false;

  const retry = actions.querySelector("[data-fpc-retry-action='true']");
  const canonical = actions.querySelector(
    `[data-facturas-action="${ACTION}"], [data-action="${ACTION}"]`
  );

  /* Factura todavía pendiente: el botón canónico ya existe. */
  if (canonical && !retry) return true;

  const seq = ++reconcileLookupSeq;

  try {
    const factura = await getFacturaById(id);
    if (seq !== reconcileLookupSeq || !detail?.isConnected) return false;

    const fin = getFinalization(factura || {});
    if (fin.processing) retryPollTimer = setTimeout(scheduleReconcile, Math.min(15000, fin.remainingMs + 100));
    const shouldRetry = facturaIsPaid(factura || {});

    if (!shouldRetry) {
      retry?.remove?.();
      return true;
    }

    if (retry?.isConnected) {
      retry.dataset.facturaId = id;
      retry.disabled = fin.processing;
      retry.setAttribute("aria-disabled", fin.processing ? "true" : "false");
      const label = retry.querySelector("span:last-child");
      const retryLabel = fin.completed ? "Valoraciones" : fin.processing ? "Finalizando…" : fin.uncertain ? "Consultar envío" : "Finalizar factura";
      if (label && label.textContent !== retryLabel) label.textContent = retryLabel;
      return true;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "facturas-detail-btn facturas-detail-btn--primary";
    button.dataset.action = ACTION;
    button.dataset.facturasAction = ACTION;
    button.dataset.facturaId = id;
    button.dataset.fpcRetryAction = "true";
    button.title = fin.completed ? "Consultar las valoraciones del servicio" : "Completar el PDF definitivo pagado y su envío";
    button.setAttribute("aria-label", fin.completed ? "Consultar valoraciones" : "Finalizar factura pagada");
    button.disabled = fin.processing;
    button.setAttribute("aria-disabled", fin.processing ? "true" : "false");
    button.innerHTML = `<span class="facturas-detail-btn-icon" aria-hidden="true">${icon("check")}</span><span>${fin.completed ? "Valoraciones" : fin.processing ? "Finalizando…" : "Finalizar factura"}</span>`;

    const closeButton = actions.querySelector(".facturas-detail-btn--close");
    actions.insertBefore(button, closeButton || null);
    return true;
  } catch {
    return false;
  }
}

function scheduleReconcile() {
  if (!isBrowser() || reconcileFrame) return false;
  reconcileFrame = requestAnimationFrame(() => void reconcileRetryAction());
  return true;
}

function onDocumentClick(event) {
  const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target;
  if (!target?.closest) return;

  const paymentNode = target.closest(
    `[data-facturas-action="${ACTION}"], [data-action="${ACTION}"]`
  );

  if (paymentNode && paymentNode.closest(`${DETAIL_ROOT_SELECTOR}, ${DETAIL_PANEL_SELECTOR}`)) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void openDialog(paymentNode);
    return;
  }

  const local = target.closest("[data-fpc-action]");
  if (!local || !document.getElementById(ROOT_ID)?.contains(local)) return;

  event.preventDefault();
  event.stopPropagation();

  const action = safeString(local.dataset.fpcAction, "");
  if (action === "cancel") {
    if (!state?.submitting) closeDialog();
    return;
  }
  if (action === "confirm" || action === "retry") {
    void executePayment();
    return;
  }
  if (action === "refresh-status") {
    void refreshPaymentStatus();
    return;
  }
  if (action === "refresh-reviews" || action === "request-reviews") {
    void loadReviews(action === "request-reviews");
    return;
  }
  if (action === "done") {
    closeDialog({ restoreFocus: false });
  }
}

function onRootClick(event) {
  if (!state?.open || state.submitting) return;
  const overlay = event.target?.closest?.("[data-fpc-overlay='true']");
  const dialog = event.target?.closest?.("[data-fpc-dialog='true']");
  if (overlay && !dialog && event.target === overlay) closeDialog();
}

export function installFacturasPaidConfirm() {
  if (!isBrowser() || installed) return false;

  ensureStyle();
  const root = ensureRoot();
  if (!root) return false;

  document.addEventListener("click", onDocumentClick, true);

  observer = new MutationObserver(scheduleReconcile);
  observer.observe(document.body, { childList: true, subtree: true });

  installed = true;
  scheduleReconcile();
  return true;
}

export function destroyFacturasPaidConfirm() {
  if (!isBrowser() || !installed) return false;

  installed = false;
  clearTimeout(retryPollTimer); retryPollTimer = 0;
  document.removeEventListener("click", onDocumentClick, true);
  observer?.disconnect?.();
  observer = null;

  if (reconcileFrame) cancelAnimationFrame(reconcileFrame);
  reconcileFrame = 0;
  closeDialog({ restoreFocus: false });
  confirmationHost.remove();
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
      retryObserver: Boolean(observer),
      policy: Object.freeze({
        noNativeConfirm: true,
        definitivePdf: true,
        paymentIdempotentRetry: true,
        accessibleDialog: true,
        focusTrap: true,
      }),
    });
  },
});

export default FacturasPaidConfirm;
