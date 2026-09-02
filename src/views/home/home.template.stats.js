/* =========================================================
   Onion Support - Home Template · generated domain module
   Shared by /src/views/home/home.template.js
========================================================= */

import {
  HOME_ACTIONS,
  attr,
  escapeHtml,
  formatMoney,
  formatNumber,
  icon,
  normalizeKey,
  safeRoute,
} from "./home.template.foundation.js";
import { avatar, loadingCards } from "./home.template.shared.js";

export function header(vm) {
  return `
    <header class="home-header" data-home-section="header">
      <div class="home-header-main">
        ${avatar(vm.user)}
        <div class="home-header-copy">
          <h1 class="home-title">Hola, ${escapeHtml(vm.user.displayName)}</h1>
          <p class="home-subtitle">${vm.admin
            ? "Resumen operativo de incidencias, facturas, clientes y usuarios."
            : "Resumen de tus incidencias y facturas."}</p>
        </div>
      </div>
    </header>
  `;
}

function statCard({ label, value, text, iconName, route, modifier }) {
  const href = safeRoute(route, "/");
  const key = normalizeKey(modifier || label || "stat");
  const formattedValue = formatNumber(value);

  return `
    <article class="home-stat-card" data-home-stat="${attr(key)}">
      <button
        type="button"
        class="home-stat-card-button"
        data-home-action="${HOME_ACTIONS.NAVIGATE}"
        data-route="${attr(href)}"
        aria-label="${attr(`${label}: ${formattedValue}. ${text}`)}"
      >
        <span class="home-stat-card-top">
          <span class="home-stat-icon" aria-hidden="true">${icon(iconName)}</span>
          <span class="home-stat-open" aria-hidden="true">${icon("arrow-right")}</span>
        </span>
        <span class="home-stat-content">
          <span class="home-stat-label">${escapeHtml(label)}</span>
          <strong class="home-stat-value">${escapeHtml(formattedValue)}</strong>
          <span class="home-stat-text">${escapeHtml(text)}</span>
        </span>
      </button>
    </article>
  `;
}

export function stats(vm) {
  if (vm.loading) {
    return `<section class="home-stats" data-home-section="stats">${loadingCards(vm.admin ? 4 : 2)}</section>`;
  }

  const billedText = vm.counts.invoiceStatsAvailable
    ? `Facturado: ${formatMoney(vm.counts.totalInvoiced, vm.counts.currency)}`
    : "Facturado pendiente de sincronizar";

  const cards = [
    {
      label: "Incidencias",
      value: vm.counts.incidencias,
      text: "Tickets visibles en el panel",
      iconName: "incidencias",
      route: vm.routes.incidencias,
      modifier: "incidencias",
    },
    {
      label: "Facturas",
      value: vm.counts.facturas,
      text: billedText,
      iconName: "facturas",
      route: vm.routes.facturas,
      modifier: "facturas",
    },
  ];

  if (vm.admin) {
    cards.push(
      {
        label: "Clientes",
        value: vm.counts.clientes,
        text: "Clientes registrados",
        iconName: "clientes",
        route: vm.routes.clientes,
        modifier: "clientes",
      },
      {
        label: "Usuarios",
        value: vm.counts.usuarios,
        text: "Usuarios registrados",
        iconName: "usuarios",
        route: vm.routes.usuarios,
        modifier: "usuarios",
      }
    );
  }

  return `<section class="home-stats" data-home-section="stats">${cards.map(statCard).join("")}</section>`;
}

/* =========================================================
   ENTITY INTERACTION
========================================================= */
