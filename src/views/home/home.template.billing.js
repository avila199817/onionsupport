/* =========================================================
   Onion Support - Home Template · generated domain module
   Shared by /src/views/home/home.template.js
========================================================= */

import {
  attr,
  cleanText,
  escapeHtml,
  first,
  formatDate,
  formatMoney,
  hasAmount,
  icon,
  invoiceDisplayId,
  isGenericInvoiceTitle,
  isObject,
  safeRoute,
} from "./home.template.foundation.js";
import {
  actionButton,
  emptyState,
  entityIdBadge,
  freshness,
  panelLoadingRows,
  statusBadge,
} from "./home.template.shared.js";
import {
  entityOpenAffordance,
  entityTriggerAttributes,
} from "./home.template.activity.js";

import { billingOverview } from "./home.template.billing-overview.js";

function invoiceItem(invoice = {}) {
  const source = isObject(invoice) ? invoice : {};
  const id = invoiceDisplayId(source);
  const interactive = Boolean(id);

  const concept = cleanText(
    first(source.concepto, source.title, source.titulo, source.name, source.nombre, ""),
    ""
  );

  const usefulConcept = Boolean(concept && !isGenericInvoiceTitle(concept));
  const label = usefulConcept ? concept : "Factura";

  const rawStatus = cleanText(
    first(
      source.paymentStatus,
      source.estadoPago,
      source.status,
      source.estado,
      source.paid ? "paid" : "issued"
    ),
    "issued"
  );

  const amount = first(
    source.total,
    source.totalFactura,
    source.invoiceAmount,
    source.amount,
    source.importe,
    source.paidAmount,
    null
  );

  const currency = cleanText(first(source.currency, source.moneda, "EUR"), "EUR");
  const date = first(
    source.updatedAt,
    source.issuedAt,
    source.fechaEmision,
    source.createdAt,
    ""
  );

  const content = `
    <span class="home-entity-leading home-entity-leading--factura" aria-hidden="true">
      ${icon("facturas")}
    </span>

    <span class="home-entity-copy">
      <span class="home-entity-eyebrow">
        <span class="home-entity-kind">Factura</span>
        ${id ? entityIdBadge("ID", id) : ""}
      </span>

      <strong class="home-entity-title">${escapeHtml(label)}</strong>

      <span class="home-entity-meta">
        ${statusBadge(rawStatus, "Emitida")}
        ${date ? `<time datetime="${attr(date)}">${escapeHtml(formatDate(date))}</time>` : ""}
      </span>
    </span>

    <span class="home-invoice-summary">
      <strong class="home-invoice-amount">${hasAmount(amount) ? escapeHtml(formatMoney(amount, currency)) : "—"}</strong>
      ${interactive ? entityOpenAffordance("Abrir") : ""}
    </span>
  `;

  return `
    <li
      class="home-invoice-item ${interactive ? "home-invoice-item--interactive" : ""}"
      data-home-entity-type="factura"
      data-home-entity-id="${attr(id)}"
    >
      ${interactive
        ? `<button type="button" class="home-entity-row home-entity-row--invoice" ${entityTriggerAttributes("factura", id, "home.invoices")}>${content}</button>`
        : `<div class="home-entity-row home-entity-row--invoice home-entity-row--static">${content}</div>`}
    </li>
  `;
}

export function invoices(vm) {
  const items = vm.facturas.slice(0, 5);
  const route = safeRoute(vm.routes.facturas, "/facturas");

  return `
    <section class="home-panel home-panel--invoices" data-home-section="invoices">
      <div class="home-panel-header">
        <div class="home-panel-heading">
          <p class="home-panel-kicker">Facturación</p>
          <h2>Facturas</h2>
          <p class="home-panel-description">Estado económico y documentos recientes.</p>
        </div>

        <div class="home-panel-actions">
          ${actionButton({
            label: "Ver facturas",
            route,
            ariaLabel: "Abrir la vista de facturas",
          })}
        </div>
      </div>

      ${billingOverview(vm)}

      ${vm.loading
        ? panelLoadingRows("invoice", 4)
        : items.length
          ? `<ul class="home-invoice-list">${items.map(invoiceItem).join("")}</ul>`
          : emptyState("Sin facturas visibles", "Cuando haya facturas disponibles aparecerán aquí.", "facturas")}
    </section>
  `;
}

/* =========================================================
   STATES / MAIN TEMPLATE
========================================================= */
