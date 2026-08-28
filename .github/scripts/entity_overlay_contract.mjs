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

for (const type of ["factura", "incidencia", "cliente", "usuario"]) {
  assert.match(overlay, new RegExp(`${type}:\\s*\\(\\)\\s*=>\\s*import`));
}

assert.match(overlay, /document\.addEventListener\("click",\s*onDocumentClick,\s*true\)/);
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

console.log(
  "Entity overlay contract: PASS · lazy overlays · canonical incidencia owner deeplinks"
);
