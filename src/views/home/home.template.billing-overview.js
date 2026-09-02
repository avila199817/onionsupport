/* =========================================================
   Onion Support - Home Template · generated billing overview module
   Shared by /src/views/home/home.template.billing.js
========================================================= */

import {
  attr,
  clamp,
  escapeHtml,
  formatMoney,
  formatPercent,
  icon,
} from "./home.template.foundation.js";

function billingValue(value = null, currency = "EUR") {
  return value === null ? "—" : formatMoney(value, currency);
}

export function billingOverview(vm) {
  if (vm.loading) {
    return `
      <div class="home-billing-overview home-billing-overview--loading" role="status" aria-live="polite">
        <span class="home-skeleton home-skeleton--billing-icon"></span>
        <span class="home-billing-loading-copy">
          <span class="home-skeleton home-skeleton--billing-value"></span>
          <span class="home-skeleton home-skeleton--billing-line"></span>
        </span>
      </div>
    `;
  }

  if (!vm.billing.available) {
    return `
      <div class="home-billing-overview home-billing-overview--pending" role="status">
        <span class="home-billing-primary-icon" aria-hidden="true">${icon("clock")}</span>
        <span class="home-billing-pending-copy">
          <strong>Total pendiente de sincronización</strong>
          <small>La facturación global aparecerá cuando las estadísticas estén disponibles.</small>
        </span>
      </div>
    `;
  }

  const hasRate = vm.billing.collectionRate !== null;
  const rate = hasRate ? clamp(vm.billing.collectionRate, 0, 100) : 0;

  return `
    <div class="home-billing-overview" data-home-billing-state="ready">
      <div class="home-billing-primary">
        <span class="home-billing-primary-icon" aria-hidden="true">${icon("facturas")}</span>
        <span class="home-billing-primary-copy">
          <span>Importe total facturado</span>
          <strong>${escapeHtml(formatMoney(vm.billing.totalInvoiced, vm.billing.currency))}</strong>
          <small>Resumen global de facturación</small>
        </span>
      </div>

      <dl class="home-billing-breakdown">
        <div class="home-billing-breakdown-item home-billing-breakdown-item--paid">
          <dt>Pagado</dt>
          <dd>${escapeHtml(billingValue(vm.billing.paidTotal, vm.billing.currency))}</dd>
        </div>
        <div class="home-billing-breakdown-item home-billing-breakdown-item--pending">
          <dt>Pendiente</dt>
          <dd>${escapeHtml(billingValue(vm.billing.outstandingAmount, vm.billing.currency))}</dd>
        </div>
      </dl>

      ${hasRate
        ? `
          <div class="home-billing-progress">
            <span>
              <span>Progreso de cobro</span>
              <strong>${escapeHtml(formatPercent(rate))}</strong>
            </span>
            <progress max="100" value="${attr(rate.toFixed(2))}">${escapeHtml(formatPercent(rate))}</progress>
          </div>
        `
        : ""}
    </div>
  `;
}

