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
  homeLabelKey,
  isObject,
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

/* CUATRO ESTADOS, NO DOS.
 *
 * La tarjeta distinguía sólo «hay número» y «no hay número», y pintaba una raya
 * para todo lo demás. Una raya que no se puede distinguir de una carga --ni de
 * un dato que de verdad no existe-- no dice nada y no se recupera.
 *
 * - `cargando`      lo resuelve la sección con sus esqueletos, más arriba.
 * - `dato`          un número, el CERO incluido: `value >= 0` ya lo admite.
 * - `actualizando`  se conserva el número anterior y se marca el refresco.
 * - `error`         el dominio no contestó: se dice, y se ofrece reintentar
 *                   con el control que Home ya tiene.
 *
 * El estado viaja también en `data-home-stat-state`, para que se pueda
 * comprobar sin leer texto traducido. */
function statCard({ label, value, text, iconName, route, modifier, failed = false, refreshing = false }) {
  const href = safeRoute(route, "/");
  const key = homeLabelKey(modifier || label || "stat");
  const available = typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  const state = available
    ? (refreshing ? "updating" : "value")
    : (failed ? "error" : "unavailable");
  const formattedValue = available ? formatNumber(value) : "—";
  const description = available
    ? (refreshing ? `${text} · Actualizando` : text)
    : (failed ? "No se pudo cargar" : "No disponible");
  const ariaLabel = available
    ? `${label}: ${formattedValue}. ${description}`
    : `${label}: ${description}`;
  const onboardingTarget = key === "incidencias"
    ? ' data-home-onboarding-target="step-1"'
    : "";

  return `
    <article class="home-stat-card" data-home-stat="${attr(key)}" data-home-stat-state="${attr(state)}"${onboardingTarget}>
      <button
        type="button"
        class="home-stat-card-button"
        data-home-action="${HOME_ACTIONS.NAVIGATE}"
        data-home-navigation-control="true"
        data-router-link="true"
        data-entity-overlay-ignore="true"
        data-route="${attr(href)}"
        aria-label="${attr(ariaLabel)}"
      >
        <span class="home-stat-card-top">
          <span class="home-stat-icon" aria-hidden="true">${icon(iconName)}</span>
          <span class="home-stat-open" aria-hidden="true">${icon("arrow-right")}</span>
        </span>
        <span class="home-stat-content">
          <span class="home-stat-label">${escapeHtml(label)}</span>
          <strong class="home-stat-value">${escapeHtml(formattedValue)}</strong>
          <span class="home-stat-text">${escapeHtml(description)}</span>
        </span>
      </button>
    </article>
  `;
}

export function stats(vm) {
  if (vm.loading) {
    return `<section class="home-stats" data-home-section="stats">${loadingCards(vm.admin ? 4 : 2)}</section>`;
  }

  const invoiceText = vm.counts.invoiceStatsAvailable
    ? `Facturado: ${formatMoney(vm.counts.totalInvoiced, vm.counts.currency)}`
    : "Facturación no disponible";

  const failed = isObject(vm.counts.failed) ? vm.counts.failed : {};
  const refreshing = vm.refreshing === true;

  const cards = [
    {
      label: "Incidencias",
      value: vm.counts.incidencias,
      text: vm.admin ? "Incidencias registradas" : "Tus incidencias",
      iconName: "incidencias",
      route: vm.routes.incidencias,
      modifier: "incidencias",
      failed: failed.incidencias === true,
      refreshing,
    },
    {
      label: "Facturas",
      value: vm.counts.facturas,
      text: invoiceText,
      iconName: "facturas",
      route: vm.routes.facturas,
      modifier: "facturas",
      failed: failed.facturas === true,
      refreshing,
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
        failed: failed.clientes === true,
        refreshing,
      },
      {
        label: "Usuarios",
        value: vm.counts.usuarios,
        text: "Usuarios registrados",
        iconName: "usuarios",
        route: vm.routes.usuarios,
        modifier: "usuarios",
        failed: failed.usuarios === true,
        refreshing,
      }
    );
  }

  return `<section class="home-stats" data-home-section="stats">${cards.map(statCard).join("")}</section>`;
}
