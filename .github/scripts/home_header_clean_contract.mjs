import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  HOME_TEMPLATE_VERSION,
  getHomeTemplateSnapshot,
  renderHomeTemplate,
} from "../../src/views/home/home.template.js";

const html = renderHomeTemplate({
  user: {
    displayName: "Cristian Ávila Luque",
    role: "admin",
  },
  role: "admin",
  dashboard: {
    admin: true,
    updatedAt: "2026-09-02T01:00:00Z",
    summary: {
      incidencias: 23,
      facturas: 15,
      clientes: 4,
      usuarios: 12,
      invoiceStatsAvailable: true,
      totalInvoiced: 971.6,
      paidTotal: 700,
      outstandingAmount: 271.6,
      currency: "EUR",
    },
    activity: [
      {
        type: "ticket",
        entityId: "INC-20260001-ABC123",
        title: "Incidencia de contrato",
        status: "pending",
        date: "2026-09-01T10:00:00Z",
      },
    ],
    facturas: [
      {
        numeroFacturaLegal: "202600052",
        concepto: "Integración de interfaz",
        paymentStatus: "paid",
        total: 48.4,
        currency: "EUR",
        updatedAt: "2026-09-01T10:00:00Z",
      },
    ],
  },
});

assert.match(
  HOME_TEMPLATE_VERSION,
  /extreme-shared-icons/,
  "Home must expose the extreme shared-icon template contract"
);

assert.match(html, /Hola, Cristian Ávila Luque/);
assert.match(
  html,
  /Resumen operativo de incidencias, facturas, clientes y usuarios\./
);
assert.doesNotMatch(html, /<p class="home-panel-kicker">Inicio<\/p>/);
assert.doesNotMatch(html, />Inicio<\/p>/);

assert.doesNotMatch(
  html,
  /<svg\b/i,
  "Home must never embed a competing SVG geometry"
);

for (const icon of [
  "incidencias",
  "facturas",
  "clientes",
  "usuarios",
]) {
  assert.match(
    html,
    new RegExp(`data-app-icon="${icon}"`),
    `Home must consume the canonical ${icon} icon`
  );
}

const navigationControls =
  html.match(/<button\b[^>]*data-home-navigation-control="true"[^>]*>/g) || [];

assert.equal(
  navigationControls.length,
  5,
  "Four stat cards and Ver facturas must be explicit pure-navigation controls"
);

for (const control of navigationControls) {
  assert.match(control, /data-home-action="navigate"/);
  assert.match(control, /data-router-link="true"/);
  assert.match(control, /data-entity-overlay-ignore="true"/);
  assert.match(control, /data-route="\/(?:incidencias|facturas|clientes|usuarios)"/);
  assert.doesNotMatch(control, /data-entity-overlay-trigger="true"/);
}

assert.match(
  html,
  /data-home-stat="facturas"[\s\S]*?<button\b[^>]*data-home-navigation-control="true"[^>]*data-entity-overlay-ignore="true"[^>]*data-route="\/facturas"/,
  "The large Facturas card must navigate and must never be interpreted as an invoice"
);

const entityTriggers =
  html.match(/<button\b[^>]*data-entity-overlay-trigger="true"[^>]*>/g) || [];

assert.equal(
  entityTriggers.length,
  2,
  "Home must expose one semantic modal trigger per sample entity"
);
assert.equal(
  (html.match(/aria-haspopup="dialog"/g) || []).length,
  2,
  "Home entity targets must announce their dialog behavior"
);
assert.equal(
  (html.match(/data-entity-stay-view="home"/g) || []).length,
  2,
  "Every Home entity modal must preserve the Home as visible route"
);

for (const trigger of entityTriggers) {
  assert.match(trigger, /data-entity-open-mode="in-place"/);
  assert.match(trigger, /data-entity-preload="detail"/);
  assert.match(trigger, /data-home-entity-source="home\.(?:activity|invoices)"/);
  assert.doesNotMatch(trigger, /data-router-link="true"/);
  assert.doesNotMatch(trigger, /data-route=/);
}

assert.match(html, /class="home-entity-row home-entity-row--activity"/);
assert.match(html, /class="home-entity-row home-entity-row--invoice"/);
assert.match(
  html,
  /class="home-entity-row home-entity-row--activity"[^>]*data-entity-type="incidencia"[^>]*data-entity-stay-view="home"[^>]*data-entity-open-mode="in-place"/,
  "Incidencia rows must open their canonical modal without owner-route navigation"
);
assert.match(
  html,
  /class="home-entity-row home-entity-row--invoice"[^>]*data-entity-type="factura"[^>]*data-entity-stay-view="home"[^>]*data-entity-open-mode="in-place"[^>]*data-entity-preload="detail"/,
  "Invoice rows must open in-place and retain bounded detail intent preload"
);
assert.match(html, /<progress max="100"/);
assert.match(html, />Pagado</);
assert.match(html, />Pendiente</);

assert.doesNotMatch(
  html,
  /<span>ID<\/span>/,
  "The literal ID prefix must not be painted in entity badges"
);
assert.doesNotMatch(
  html,
  /class="home-entity-id"[^>]*>[\s\S]*?<code>/,
  "Entity identifiers must be one visual pill, never a card inside another card"
);
assert.equal(
  (html.match(/data-home-id-kind="id"/g) || []).length,
  2,
  "Entity identifiers must retain non-visual ID semantics"
);
assert.match(
  html,
  /class="home-entity-id"[^>]*data-home-id-kind="id"[^>]*>INC-20260001-ABC123<\/span>/
);
assert.match(
  html,
  /class="home-entity-id"[^>]*data-home-id-kind="id"[^>]*>202600052<\/span>/
);

const [
  appIconCss,
  sidebarIconCss,
  homeExtremeEntryCss,
  homeExtremeFoundationCss,
  homeExtremeEntitiesCss,
  homeExtremeInteractionsCss,
  homeExtremeBillingCss,
  homeExtremeStatesCss,
  homeExtremeResponsiveCss,
  appCss,
  privateRuntimeSource,
  homeEntityModalSource,
  entityIntentPreloadSource,
  facturaModalBridgeSource,
  facturasApiSource,
  ...templateModules
] = await Promise.all([
  readFile("src/css/components/app-icons.css", "utf8"),
  readFile("src/css/layout/sidebar.icons.css", "utf8"),
  readFile("src/css/compositions/home-extreme.css", "utf8"),
  readFile("src/css/compositions/home-extreme-foundation.css", "utf8"),
  readFile("src/css/compositions/home-extreme-entities.css", "utf8"),
  readFile("src/css/compositions/home-extreme-interactions.css", "utf8"),
  readFile("src/css/compositions/home-extreme-billing.css", "utf8"),
  readFile("src/css/compositions/home-extreme-states.css", "utf8"),
  readFile("src/css/compositions/home-extreme-responsive.css", "utf8"),
  readFile("src/css/app.css", "utf8"),
  readFile("src/features/private-runtime-ui/index.js", "utf8"),
  readFile("src/features/home-entity-modal/index.js", "utf8"),
  readFile("src/features/entity-intent-preload/index.js", "utf8"),
  readFile("src/features/factura-modal-bridge/index.js", "utf8"),
  readFile("src/views/facturas/facturas.api.js", "utf8"),
  readFile("src/views/home/home.template.js", "utf8"),
  readFile("src/views/home/home.template.foundation.js", "utf8"),
  readFile("src/views/home/home.template.viewmodel.js", "utf8"),
  readFile("src/views/home/home.template.shared.js", "utf8"),
  readFile("src/views/home/home.template.stats.js", "utf8"),
  readFile("src/views/home/home.template.activity.js", "utf8"),
  readFile("src/views/home/home.template.billing.js", "utf8"),
  readFile("src/views/home/home.template.billing-overview.js", "utf8"),
]);

const homeExtremeCss = [
  homeExtremeFoundationCss,
  homeExtremeEntitiesCss,
  homeExtremeInteractionsCss,
  homeExtremeBillingCss,
  homeExtremeStatesCss,
  homeExtremeResponsiveCss,
].join("\n");
const templateSource = templateModules.join("\n");

for (const icon of [
  "home",
  "incidencias",
  "facturas",
  "clientes",
  "usuarios",
  "correo",
  "servidor",
]) {
  assert.match(
    appIconCss,
    new RegExp(`--app-icon-${icon}:`),
    `Shared icon authority must define ${icon}`
  );
}

for (const icon of [
  "home",
  "incidencias",
  "facturas",
  "clientes",
  "usuarios",
  "correo",
  "servidor",
]) {
  assert.match(
    sidebarIconCss,
    new RegExp(
      `--sb-icon-${icon}:\\s*var\\(--app-icon-${icon}\\)`
    ),
    `Sidebar must consume --app-icon-${icon}`
  );
}

assert.doesNotMatch(
  sidebarIconCss,
  /data:image\/svg\+xml/i,
  "Sidebar consumer must not duplicate SVG data"
);
assert.doesNotMatch(
  templateSource,
  /<svg\b/i,
  "Home template source must not retain inline SVGs"
);

assert.doesNotMatch(
  homeExtremeCss,
  /\.home-(?:header|header-main|header-copy|title|subtitle|current-user-avatar)\b/,
  "Extreme composition must not touch the approved greeting"
);
assert.doesNotMatch(
  homeExtremeCss,
  /!important/,
  "Extreme Home composition must remain layer-native"
);

assert.match(
  homeExtremeFoundationCss,
  /\.home-view-root--user\s+\.home-stats,\s*\.home-view-root--user\s+\.home-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
  "Standard user Home must keep its two summary cards and two lower panels on identical 50/50 tracks"
);
assert.match(
  homeExtremeFoundationCss,
  /\.home-view-root--admin\s+\.home-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
  "Admin Home lower split must align exactly with the boundary between stat cards 2 and 3"
);
assert.match(
  homeExtremeResponsiveCss,
  /@container \(max-width: 1180px\)[\s\S]*?\.home-view-root\s+\.home-grid\s*\{\s*grid-template-columns:\s*1fr;/,
  "Home symmetry must still collapse safely below the desktop breakpoint"
);

assert.match(
  homeExtremeEntryCss,
  /home-extreme-entities\.css"\);[\s\S]*home-extreme-interactions\.css"\);[\s\S]*home-extreme-billing\.css"\);/,
  "Semantic interaction ownership must load after entity geometry and before billing"
);
assert.match(
  homeExtremeInteractionsCss,
  /\.home-view-root\s+:is\([\s\S]*\.home-activity-item--interactive,[\s\S]*\.home-invoice-item--interactive[\s\S]*\)\s*>\s*\.home-entity-row\s*\{[\s\S]*pointer-events:\s*auto;/,
  "Interactive Home rows must explicitly restore pointer events after the legacy view layer"
);
assert.match(
  homeExtremeInteractionsCss,
  /\.home-view-root\s+\.home-entity-hit-target\s*\{[\s\S]*display:\s*none;[\s\S]*pointer-events:\s*none;/,
  "The retired absolute hit target must never cover semantic row buttons"
);

assert.match(
  privateRuntimeSource,
  /import\("\.\.\/home-entity-modal\/index\.js"\)/,
  "Authenticated runtime must load the Home modal authority"
);
assert.match(
  privateRuntimeSource,
  /initModule\(HomeEntityModalUI, payload\);[\s\S]*initModule\(EntityOverlayUI, payload\);/,
  "Home modal authority must register before the global EntityOverlay capture listener"
);
assert.match(
  homeEntityModalSource,
  /document\.addEventListener\("click", onDocumentClick, true\)/
);
assert.match(homeEntityModalSource, /stopImmediatePropagation/);
assert.match(homeEntityModalSource, /openFacturaModalFromCurrentView/);
assert.match(homeEntityModalSource, /openIncidenciaModalFromCurrentView/);
assert.doesNotMatch(homeEntityModalSource, /Router\.navigate|history\.(?:pushState|replaceState)|location\.(?:assign|replace)/);

assert.match(
  privateRuntimeSource,
  /import\("\.\.\/entity-intent-preload\/index\.js"\)/,
  "Authenticated runtime must own entity detail intent preload"
);
assert.match(entityIntentPreloadSource, /data-entity-preload='detail'/);
assert.match(entityIntentPreloadSource, /factura-modal-bridge/);
assert.match(entityIntentPreloadSource, /incidencia-modal-bridge/);
assert.match(entityIntentPreloadSource, /HOVER_DWELL_MS = 64/);
assert.doesNotMatch(entityIntentPreloadSource, /document\.addEventListener\("click"/);
assert.doesNotMatch(entityIntentPreloadSource, /(^|[^A-Za-z0-9_$])fetch\s*\(/m);
assert.doesNotMatch(entityIntentPreloadSource, /localStorage|sessionStorage|indexedDB/);

assert.match(facturaModalBridgeSource, /module\?\.FacturasView/);
assert.match(facturaModalBridgeSource, /controller\.openFactura/);
assert.match(facturaModalBridgeSource, /prefetchFacturaDetail/);
assert.match(facturaModalBridgeSource, /data-entity-modal-origin/);
assert.match(facturaModalBridgeSource, /openIncidenciaModalFromCurrentView/);
assert.doesNotMatch(facturaModalBridgeSource, /Router\.navigate|history\.(?:pushState|replaceState)|location\.(?:assign|replace)/);

assert.match(facturasApiSource, /FACTURAS_DETAIL_PREFETCH_VERSION/);
assert.match(facturasApiSource, /DETAIL_PREFETCH_TTL_MS = 20_000/);
assert.match(facturasApiSource, /DETAIL_PREFETCH_MAX_ENTRIES = 32/);
assert.match(facturasApiSource, /export async function prefetchFacturaDetail/);
assert.match(facturasApiSource, /export function clearFacturaDetailPrefetchCache/);
assert.match(facturasApiSource, /options\?\.force !== true && options\?\.preferCache !== false/);

assert.match(
  appCss,
  /@import url\("\.\/components\/app-icons\.css"\) layer\(components\);/
);
assert.match(
  appCss,
  /@import url\("\.\/compositions\/home-extreme\.css"\) layer\(compositions\);/
);

const snapshot = getHomeTemplateSnapshot();
assert.equal(snapshot.policy.greetingLocked, true);
assert.equal(snapshot.policy.sidebarFirstIconContract, true);
assert.equal(snapshot.policy.semanticEntityButtons, true);
assert.equal(snapshot.policy.canonicalEntityOwnerModals, true);
assert.equal(snapshot.policy.noInlineSvg, true);

console.log(
  "Home extreme contract OK · greeting locked · admin/user grid symmetry · pure card navigation · single-pill IDs · owner modals stay in Home"
);
