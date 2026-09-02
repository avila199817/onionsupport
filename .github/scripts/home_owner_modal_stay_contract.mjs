#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");

const [
  homeModal,
  facturaBridge,
  incidenciaBridge,
  preload,
  runtime,
  template,
  overlayIntent,
] = await Promise.all([
  read("src/features/home-entity-modal/index.js"),
  read("src/features/factura-modal-bridge/index.js"),
  read("src/features/incidencia-modal-bridge/index.js"),
  read("src/features/entity-intent-preload/index.js"),
  read("src/features/private-runtime-ui/index.js"),
  read("src/views/home/home.template.activity.js"),
  read("src/features/entity-overlay/intent.js"),
]);

/* El template no comunica intención de ruta para entidades concretas. */
assert.match(template, /data-entity-stay-view="home"/);
assert.match(template, /data-entity-open-mode="in-place"/);
assert.match(template, /data-entity-preload="detail"/);
assert.match(template, /data-entity-overlay-ignore="true"/);
assert.doesNotMatch(
  template.slice(template.indexOf("export function entityTriggerAttributes")),
  /data-router-link="true"|data-route=/
);

/* Home gana la captura antes que el overlay global y corta toda navegación. */
assert.match(homeModal, /document\.addEventListener\("click", onDocumentClick, true\)/);
assert.match(homeModal, /event\?\.stopImmediatePropagation\?\.\(\)/);
assert.match(homeModal, /event\[ROUTER_EVENT_HANDLED_KEY\] = true/);
assert.match(homeModal, /openFacturaModalFromCurrentView/);
assert.match(homeModal, /openIncidenciaModalFromCurrentView/);
assert.match(homeModal, /watchOriginLease\(intent\.originHost, intent\.type\)/);
assert.match(homeModal, /BRIDGE_BOUNDARY_SELECTOR/);
assert.match(homeModal, /sealBridgeBoundaries/);
assert.match(homeModal, /optimizeIncidenciaBridgeFeedback/);
assert.doesNotMatch(
  homeModal,
  /Router\.navigate|AppCore\.navigate|history\.(?:pushState|replaceState)|location\.(?:assign|replace)|window\.location\s*=/
);

const homeInit = runtime.indexOf("await initModule(HomeEntityModalUI, payload)");
const overlayInit = runtime.indexOf("await initModule(EntityOverlayUI, payload)");
assert.ok(homeInit >= 0, "HomeEntityModal must be initialized");
assert.ok(overlayInit > homeInit, "HomeEntityModal must register before EntityOverlay");

/* Facturas conserva el controller canónico y muestra shell antes de red. */
assert.match(facturaBridge, /module\?\.FacturasView/);
assert.match(facturaBridge, /controller\.openFactura/);
assert.match(facturaBridge, /prefetchFacturaDetail/);
assert.match(facturaBridge, /const openTask = Promise\.resolve/);
assert.match(facturaBridge, /const shell = await waitForModalShell/);
assert.match(facturaBridge, /data-entity-modal-origin/);
assert.match(facturaBridge, /data-factura-modal-bridge/);
assert.match(facturaBridge, /openIncidenciaModalFromCurrentView/);
assert.doesNotMatch(
  facturaBridge,
  /Router\.navigate|AppCore\.navigate|history\.(?:pushState|replaceState)|location\.(?:assign|replace)|window\.location\s*=/
);

/* Incidencias ya dispone de bridge owner sin navegación. */
assert.match(incidenciaBridge, /module\?\.IncidenciasView/);
assert.match(incidenciaBridge, /controller\.openDetail/);
assert.doesNotMatch(
  incidenciaBridge,
  /Router\.navigate|AppCore\.navigate|history\.(?:pushState|replaceState)|location\.(?:assign|replace)|window\.location\s*=/
);

/* La precarga prepara ambos owners, pero nunca captura click ni navega. */
assert.match(preload, /factura-modal-bridge/);
assert.match(preload, /incidencia-modal-bridge/);
assert.match(preload, /primeFacturaModalBridge/);
assert.match(preload, /primeIncidenciaModalBridge/);
assert.doesNotMatch(preload, /document\.addEventListener\("click"/);
assert.doesNotMatch(
  preload,
  /Router\.navigate|AppCore\.navigate|history\.(?:pushState|replaceState)|location\.(?:assign|replace)/
);

/* Los roots, hosts y feedback bloquean la reinferencia del overlay global. */
assert.match(overlayIntent, /\[data-entity-overlay-ignore='true'\]/);
assert.match(facturaBridge, /ENTITY_OVERLAY_IGNORE_ATTRIBUTE/);
assert.match(homeModal, /data-incidencias-modal-bridge-feedback/);
assert.match(homeModal, /data-facturas-modal-bridge-feedback/);

console.log(
  "Home owner modal stay contract: PASS · Home retained · origin lease · sealed owner controllers · instant in-place flow"
);