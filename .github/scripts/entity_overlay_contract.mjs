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

const [overlay, app, main, html, deeplink, spaContract] = await Promise.all([
  read("src/features/entity-overlay/index.js"),
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
assert.match(app, /import\("\.\.\/features\/entity-overlay\/index\.js"\)/);
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

const [homeTemplate, homeCss] = await Promise.all([
  read("src/views/home/home.template.js"),
  read("src/css/views/home/index.css"),
]);

assert.match(homeTemplate, /data-entity-overlay-trigger="true"/);
assert.match(homeTemplate, /function activityEntityId/);
assert.match(homeTemplate, /raw\.clientId/);
assert.match(homeTemplate, /raw\.userId/);
assert.match(homeTemplate, /function entityHitTarget/);
assert.match(homeTemplate, /class="home-entity-hit-target"/);
assert.match(homeTemplate, /entityHitTarget\(entityType, entityId\)/);
assert.match(homeTemplate, /entityHitTarget\("factura", id\)/);
assert.doesNotMatch(homeTemplate, /home-activity-entity-button/);
assert.doesNotMatch(homeTemplate, /home-invoice-entity-button/);
assert.match(homeCss, /HOME ENTITY INTERACTION LAYER/);
assert.match(
  homeCss,
  /\.home-activity-item\s*\{[\s\S]*?grid-template-columns:\s*38px minmax\(0,\s*1fr\) auto;/
);
assert.match(
  homeCss,
  /\.home-entity-hit-target\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;/
);
assert.doesNotMatch(homeCss, /home-activity-entity-button/);
assert.doesNotMatch(homeCss, /home-invoice-entity-button/);

console.log(
  "Entity overlay contract: PASS · factura/incidencia owner authority · lazy simple overlays · canonical deeplinks"
);
