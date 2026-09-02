#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { resolveRouteLookupPath } from "../../src/router/routes.js";

import {
  inferEntityIntent,
  normalizeEntityId,
  normalizeEntityType,
} from "../../src/features/entity-overlay/intent.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

assert.equal(normalizeEntityType("Facturas"), "factura");
assert.equal(normalizeEntityType("tickets"), "incidencia");
assert.equal(normalizeEntityType("customers"), "cliente");
assert.equal(normalizeEntityType("users"), "usuario");

assert.equal(normalizeEntityId("incidencia", "inc-20260827-d03089"), "INC-20260827-D03089");
assert.equal(normalizeEntityId("factura", "2026000052"), "2026000052");
assert.equal(normalizeEntityId("factura", "../../secret"), "");

assert.deepEqual(
  inferEntityIntent({
    route: "/facturas",
    text: "Factura ID 2026000052 · Pendiente",
  }),
  {
    type: "factura",
    id: "2026000052",
    source: "route",
  }
);

assert.deepEqual(
  inferEntityIntent({
    route: "/incidencias/INC-20260827-D03089",
  }),
  {
    type: "incidencia",
    id: "INC-20260827-D03089",
    source: "route",
  }
);

assert.deepEqual(
  inferEntityIntent({
    type: "cliente",
    id: "client-01",
    source: "test",
  }),
  {
    type: "cliente",
    id: "client-01",
    source: "test",
  }
);

const [overlay, privateRuntime, app, main, html, deeplink, spaContract] = await Promise.all([
  read("src/features/entity-overlay/index.js"),
  read("src/features/private-runtime-ui/index.js"),
  read("src/app/index.js"),
  read("src/main.js"),
  read("index.html"),
  read("src/features/ticket-deeplink/index.js"),
  read(".github/ci/validate_spa_contracts.sh"),
]);

for (const type of ["cliente", "usuario"]) {
  assert.match(overlay, new RegExp(`${type}:\\s*\\(\\)\\s*=>\\s*import`));
}

assert.match(overlay, /document\.addEventListener\("click",\s*onDocumentClick,\s*true\)/);
assert.match(overlay, /OWNER_DEFINITIONS/);
assert.match(overlay, /factura:\s*Object\.freeze\(\{/);
assert.match(overlay, /incidencia:\s*Object\.freeze\(\{/);
assert.match(overlay, /openFacturaDetailById/);
assert.match(overlay, /openCanonicalOwner/);
assert.match(overlay, /openIncidenciaDetailById/);
assert.match(overlay, /ownerModalOpen/);
assert.match(overlay, /context\?\.Router \|\| context\?\.router/);
assert.match(overlay, /navigateWithRouter\(target,/);
assert.match(
  overlay,
  /navigateBack:\s*Boolean\(session\.returnPath\)\s*&&\s*isOwnerRoute\(session\.type\)/
);
assert.doesNotMatch(overlay, /adapters\/incidencia\.js/);
assert.doesNotMatch(overlay, /adapters\/factura\.js/);
assert.match(overlay, /pushState|writeUrlForEntry/);
assert.match(overlay, /data-entity-overlay-panel/);
assert.match(overlay, /isCanonicalOwnerRoute/);
assert.match(overlay, /hasExplicitOverlayTrigger/);
assert.match(overlay, /syncUrl: options\?\.syncUrl !== false/);
assert.match(privateRuntime, /import\("\.\.\/entity-overlay\/index\.js"\)/);
assert.doesNotMatch(app, /features\/entity-overlay\/index\.js/);
assert.doesNotMatch(main, /features\/entity-overlay\/index\.js/);
assert.doesNotMatch(html, /features\/entity-overlay\/index\.js/);
assert.match(deeplink, /canonical-owner-modal/);
assert.match(deeplink, /openIncidenciaDetailById/);
assert.match(deeplink, /SCOPED_DETAIL_PATTERN/);
assert.doesNotMatch(deeplink, /\.click\(\)/);
assert.equal(
  resolveRouteLookupPath("/@cristian/incidencias/INC-20260827-D03089"),
  "/incidencias"
);
assert.equal(
  resolveRouteLookupPath("/incidencias/INC-20260827-D03089"),
  "/incidencias"
);
assert.equal(
  resolveRouteLookupPath("/tickets/INC-20260827-D03089"),
  "/incidencias"
);
assert.match(spaContract, /entity_overlay_contract\.mjs/);

const overlayStyles = await read("src/features/entity-overlay/styles.generated.js");
assert.doesNotMatch(overlayStyles, /^\s*incidencia:/m);
assert.doesNotMatch(overlayStyles, /^\s*factura:/m);

const facturasIndex = await read("src/views/facturas/index.js");
assert.match(facturasIndex, /export async function openFacturaDetailById/);
assert.match(facturasIndex, /const DEFAULT_BATCH_SIZE = 50;/);

/*
  Home is a synchronous facade backed by domain modules. The entity contract
  validates the complete reachable template surface rather than assuming every
  trigger remains physically embedded in home.template.js.
*/
const [
  homeTemplateFacade,
  homeTemplateActivity,
  homeTemplateBilling,
  homeCss,
  homeExtremeEntitiesCss,
] = await Promise.all([
  read("src/views/home/home.template.js"),
  read("src/views/home/home.template.activity.js"),
  read("src/views/home/home.template.billing.js"),
  read("src/css/views/home/index.css"),
  read("src/css/compositions/home-extreme-entities.css"),
]);

const homeTemplate = [
  homeTemplateFacade,
  homeTemplateActivity,
  homeTemplateBilling,
].join("\n");

assert.match(homeTemplateFacade, /import \{ activity \} from "\.\/home\.template\.activity\.js"/);
assert.match(homeTemplateFacade, /import \{ invoices \} from "\.\/home\.template\.billing\.js"/);
assert.match(homeTemplate, /data-entity-overlay-trigger="true"/);
assert.match(homeTemplate, /data-entity-overlay-open="true"/);
assert.match(homeTemplate, /aria-haspopup="dialog"/);
assert.match(homeTemplate, /function activityEntityId/);
assert.match(homeTemplate, /raw\.clientId/);
assert.match(homeTemplate, /raw\.userId/);
assert.match(homeTemplate, /function entityTriggerAttributes/);
assert.match(
  homeTemplate,
  /entityTriggerAttributes\(entityType, entityId, "home\.activity"\)/
);
assert.match(
  homeTemplate,
  /entityTriggerAttributes\("factura", id, "home\.invoices"\)/
);
assert.match(homeTemplate, /class="home-entity-row home-entity-row--activity"/);
assert.match(homeTemplate, /class="home-entity-row home-entity-row--invoice"/);
assert.doesNotMatch(homeTemplate, /class="home-entity-hit-target"/);
assert.doesNotMatch(homeTemplate, /home-activity-entity-button/);
assert.doesNotMatch(homeTemplate, /home-invoice-entity-button/);

assert.match(homeCss, /HOME ENTITY INTERACTION LAYER/);
assert.match(
  homeExtremeEntitiesCss,
  /\.home-view-root \.home-entity-row\s*\{[\s\S]*?appearance:\s*none;[\s\S]*?display:\s*grid;/
);
assert.match(
  homeExtremeEntitiesCss,
  /\.home-view-root \.home-entity-row:focus-visible\s*\{[\s\S]*?box-shadow:\s*var\(--focus-ring\);/
);
assert.match(
  homeExtremeEntitiesCss,
  /\.home-view-root \.home-entity-row:hover\s*\{[\s\S]*?transform:\s*translateX\(2px\);/
);
assert.doesNotMatch(homeExtremeEntitiesCss, /home-entity-hit-target/);
assert.doesNotMatch(homeExtremeEntitiesCss, /home-activity-entity-button/);
assert.doesNotMatch(homeExtremeEntitiesCss, /home-invoice-entity-button/);

console.log(
  "Entity overlay contract: PASS · factura/incidencia owner authority · modular Home semantic triggers · canonical deeplinks"
);
