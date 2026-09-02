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

assert.equal(
  (html.match(/data-entity-overlay-trigger="true"/g) || []).length,
  2,
  "Home must expose one semantic canonical-modal trigger per sample entity"
);
assert.equal(
  (html.match(/aria-haspopup="dialog"/g) || []).length,
  2,
  "Home entity targets must announce their dialog behavior"
);
assert.match(html, /class="home-entity-row home-entity-row--activity"/);
assert.match(html, /class="home-entity-row home-entity-row--invoice"/);
assert.match(html, /<progress max="100"/);
assert.match(html, />Pagado</);
assert.match(html, />Pendiente</);

assert.doesNotMatch(
  html,
  /<span>ID<\/span>/,
  "The literal ID prefix must not be painted in entity badges"
);
assert.equal(
  (html.match(/data-home-id-kind="id"/g) || []).length,
  2,
  "Entity identifiers must retain non-visual ID semantics"
);
assert.match(html, /<code>INC-20260001-ABC123<\/code>/);
assert.match(html, /<code>202600052<\/code>/);

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
  "Home extreme contract OK · greeting locked · shared Sidebar icons · clickable owner modals · clean entity IDs · billing overview"
);
