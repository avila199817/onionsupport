/* =========================================================
   Onion Support - Home Template
   Archivo: /src/views/home/home.template.js

   PRODUCTIVO · PRIVATE HOME EXTREME · SHARED ICON AUTHORITY

   Contrato:
   - Fachada estable y síncrona para el Home privado.
   - El greeting aprobado permanece intacto en home.template.stats.js.
   - Sin DOM, listeners, Auth, Router, HTTP, Store ni Storage.
   - Sin CSS, SVG ni handlers inline.
   - Todos los iconos consumen components/app-icons.css.
   - Filas de entidad usan botones semánticos y abren el owner modal canónico.
   - Incidencias y Facturas permanecen sobre el Home, sin owner-route handoff.
========================================================= */

import {
  HOME_ACTIONS,
  HOME_TEMPLATE_VERSION,
  attr,
  cleanText,
} from "./home.template.foundation.js";
import { buildVm } from "./home.template.viewmodel.js";
import {
  emptyState,
  errorBanner,
  staleBanner,
} from "./home.template.shared.js";
import { header, stats } from "./home.template.stats.js";
import { activity } from "./home.template.activity.js";
import { invoices } from "./home.template.billing.js";

export { HOME_ACTIONS, HOME_TEMPLATE_VERSION };

export function renderHomeLoadingState(input = {}) {
  return renderHomeTemplate({ ...input, loading: true });
}

export function renderHomeErrorState(message = "No se pudo cargar el inicio.") {
  const safeMessage = cleanText(message, "No se pudo cargar el inicio.");

  return `
    <section class="home-view-root home-view-root--error" data-home-scope="true" data-home-template-version="${attr(HOME_TEMPLATE_VERSION)}" aria-busy="false">
      ${errorBanner(safeMessage)}
      <section class="home-panel home-panel--error">
        ${emptyState("No se pudo cargar el inicio", safeMessage, "alert")}
      </section>
    </section>
  `;
}

export function renderHomeTemplate(input = {}) {
  const vm = buildVm(input);

  const stateClasses = [
    vm.admin ? "home-view-root--admin" : "home-view-root--user",
    vm.loading ? "is-loading" : "",
    vm.refreshing ? "is-refreshing" : "",
    vm.error ? "has-error" : "",
    vm.stale ? "is-stale" : "",
    vm.partial ? "is-partial" : "",
  ].filter(Boolean).join(" ");

  return `
    <section
      class="home-view-root ${stateClasses}"
      data-home-scope="true"
      data-home-template-version="${attr(HOME_TEMPLATE_VERSION)}"
      data-home-role="${vm.admin ? "admin" : "user"}"
      data-home-admin="${vm.admin ? "true" : "false"}"
      aria-busy="${vm.loading || vm.refreshing ? "true" : "false"}"
    >
      ${errorBanner(vm.error)}
      ${staleBanner(vm.stale)}
      ${header(vm)}
      ${stats(vm)}
      <section class="home-grid" data-home-section="main-grid">
        ${activity(vm)}
        ${invoices(vm)}
      </section>
    </section>
  `;
}

export function getHomeTemplateSnapshot() {
  return {
    version: HOME_TEMPLATE_VERSION,
    actions: HOME_ACTIONS,
    policy: {
      templateOnly: true,
      greetingLocked: true,
      sharedIconAuthority: "/src/css/components/app-icons.css",
      sidebarFirstIconContract: true,
      noInlineSvg: true,
      semanticEntityButtons: true,
      canonicalEntityOwnerModals: true,
      ownerModalsStayInHome: true,
      entityRowsHaveNoOwnerRoute: true,
      ownerModalFallbackNavigation: false,
      focusRestorationReady: true,
      visibleEntityIds: true,
      invoiceTotalMeaning: "total_invoiced",
      invoiceStatsSource: "/api/facturas/stats",
      neverAggregateVisibleInvoiceRows: true,
      cachedIntlFormatters: true,
      noDomApi: true,
      noListeners: true,
      noAuth: true,
      noRouter: true,
      noHttp: true,
      noStore: true,
      noStorage: true,
      noCssInline: true,
      noInlineHandlers: true,
    },
  };
}

export default renderHomeTemplate;