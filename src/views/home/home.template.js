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
   - La identidad relacional procede sólo de los DTO ya cargados por cada dominio.
   - El piloto de bienvenida es visual, admin-only y no persiste progreso.
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
import {
  HOME_ENTITY_RELATION_VERSION,
} from "./home.template.relation.js";

export {
  HOME_ACTIONS,
  HOME_ENTITY_RELATION_VERSION,
  HOME_TEMPLATE_VERSION,
};

const HOME_ONBOARDING_PILOT_VERSION = "welcome-v1";

function welcomeFirstName(vm = {}) {
  const displayName = cleanText(vm?.user?.displayName, "Usuario");
  const [firstName = "Usuario"] = displayName.split(/\s+/).filter(Boolean);
  return cleanText(firstName, "Usuario").slice(0, 48);
}

function welcomePilot(vm = {}) {
  if (vm.loading || vm.error || vm.admin !== true) return "";

  const firstName = welcomeFirstName(vm);
  const incidenciasRoute = cleanText(vm?.routes?.incidencias, "/incidencias");

  return `
    <dialog
      class="home-welcome-pilot"
      data-home-onboarding-pilot="${attr(HOME_ONBOARDING_PILOT_VERSION)}"
      aria-labelledby="home-welcome-pilot-title"
      aria-describedby="home-welcome-pilot-copy"
      open
    >
      <form method="dialog" class="home-welcome-pilot__surface">
        <div class="home-welcome-pilot__meta">
          <span class="home-welcome-pilot__eyebrow">Onion Support · Bienvenida</span>
          <span class="home-welcome-pilot__step" aria-label="Paso 1 de 5">1 de 5</span>
        </div>

        <div class="home-welcome-pilot__copy">
          <h2 id="home-welcome-pilot-title">
            Hola, ${attr(firstName)} <span aria-hidden="true">👋</span>
          </h2>
          <p id="home-welcome-pilot-copy">
            ¿Necesitas ayuda? Empieza creando una incidencia. Desde ahí podrás contarnos qué ocurre, adjuntar archivos y seguir el estado.
          </p>
        </div>

        <div class="home-welcome-pilot__actions">
          <button
            type="submit"
            value="dismiss"
            class="home-btn home-welcome-pilot__dismiss"
          >
            Ahora no
          </button>
          <button
            type="button"
            class="home-btn home-welcome-pilot__primary"
            data-home-action="${attr(HOME_ACTIONS.NAVIGATE)}"
            data-route="${attr(incidenciasRoute)}"
            data-onboarding-pilot-primary="true"
          >
            Ir a Incidencias
          </button>
        </div>

        <p class="home-welcome-pilot__note">Vista piloto · todavía no guarda progreso.</p>
      </form>
    </dialog>
  `;
}

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
      data-home-relation-version="${attr(HOME_ENTITY_RELATION_VERSION)}"
      data-home-role="${vm.admin ? "admin" : "user"}"
      data-home-admin="${vm.admin ? "true" : "false"}"
      aria-busy="${vm.loading || vm.refreshing ? "true" : "false"}"
    >
      ${errorBanner(vm.error)}
      ${staleBanner(vm.stale)}
      ${header(vm)}
      ${welcomePilot(vm)}
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
    relationVersion: HOME_ENTITY_RELATION_VERSION,
    onboardingPilotVersion: HOME_ONBOARDING_PILOT_VERSION,
    actions: HOME_ACTIONS,
    policy: {
      templateOnly: true,
      greetingLocked: true,
      onboardingPilotAdminOnly: true,
      onboardingPilotVisualOnly: true,
      onboardingPilotPersistsProgress: false,
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
      canonicalRelationIdentity: true,
      relationIdentitySource: "loaded_domain_dto",
      relationIdentityAddsNoRequests: true,
      syntheticRelationData: false,
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
