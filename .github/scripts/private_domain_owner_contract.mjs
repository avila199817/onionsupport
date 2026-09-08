import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

export const readOwnerSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
export const directDomainOwners = (await readOwnerSource("src/features/entity-overlay/index.js"))
  .includes('"entity-overlay.v4-central-domain-detail"');

// Forward-compatible foundation: old candidates retain their full legacy
// contracts; direct owners must prove the replacement and remove every bridge.
export async function assertDirectDomainOwners() {
  assert.ok(directDomainOwners, "Explicit central domain detail architecture required");
  const [overlay, runtime, preload, router, home, facturas, incidencias, implementation, detail] = await Promise.all([
    "src/features/entity-overlay/index.js", "src/features/private-runtime-ui/index.js",
    "src/features/entity-intent-preload/index.js", "src/router/index.js",
    "src/views/home/home.template.activity.js", "src/views/facturas/index.js",
    "src/views/incidencias/index.js", "src/views/incidencias/index.impl.js",
    "src/views/incidencias/incidencias.template.modal.impl.js",
  ].map(readOwnerSource));
  for (const feature of ["home-entity-modal", "factura-modal-bridge", "incidencia-modal-bridge", "facturas-incidencia-modal"]) {
    await assert.rejects(access(new URL(`../../src/features/${feature}/index.js`, import.meta.url)),
      { code: "ENOENT" }, `${feature} must be removed, not left as a second modal authority`);
    for (const source of [overlay, runtime, preload]) assert.ok(!source.includes(feature));
  }
  assert.match(home, /data-entity-stay-view="home"/);
  assert.match(home, /data-entity-open-mode="in-place"/);
  assert.match(home, /data-entity-preload="detail"/);
  assert.doesNotMatch(home.slice(home.indexOf("export function entityTriggerAttributes")), /data-router-link="true"|data-route=|data-entity-overlay-ignore="true"/);
  assert.match(overlay, /createFacturaDetailController/);
  assert.match(overlay, /createIncidenciaDetailController/);
  assert.match(overlay, /createAsyncScope/);
  assert.match(overlay, /export function releaseOrigin/);
  assert.match(overlay, /session\.scope\.onDispose/);
  assert.match(overlay, /session\.controller\?\.destroy\?\.\(/);
  assert.match(overlay, /onDetailShell\(\)/);
  assert.match(overlay, /onDetailClosed\(\)/);
  assert.match(overlay, /ownerIsCurrent\(session\)/);
  assert.match(overlay, /onDocumentClick, true/);
  assert.doesNotMatch(overlay, /MutationObserver|navigateWithRouter|Router\.navigate|returnPath/);
  const ownerOpen = overlay.slice(overlay.indexOf("async function openCanonicalOwner"), overlay.indexOf("async function open(input"));
  assert.ok(ownerOpen.indexOf("ownerSession = session") < ownerOpen.indexOf("await preload(type)"), "Origin must own pending imports");
  assert.doesNotMatch(ownerOpen, /history\.|writeUrlForEntry|location\.(?:assign|replace)/);
  assert.equal((router.match(/releaseOrigin\?\.\(previousHost\)/g) || []).length, 2, "Both route replacement and teardown must dispose owned detail");
  assert.match(runtime, /await initModule\(EntityOverlayUI, payload\);[\s\S]*await initModule\(EntityIntentPreloadUI, payload\);/);
  assert.match(runtime, /isAuthenticated\(context\)/);
  assert.match(preload, /authenticated\(\)/);
  assert.match(preload, /EntityOverlay\.preload\(intent\.type\)/);
  assert.match(preload, /HOVER_DWELL_MS = 64/);
  assert.doesNotMatch(preload, /addEventListener\("click"|\bfetch\s*\(|localStorage|sessionStorage|indexedDB/);
  assert.match(facturas, /export async function createFacturaDetailController/);
  assert.match(facturas, /createFacturasController\(null, \{ \.\.\.context, detailOnly: true \}\)\.mount\(\)/);
  assert.match(facturas, /if \(detailOnly\) return controller/);
  assert.match(facturas, /let routeOwnerController = null/);
  assert.match(facturas, /openEntityDetail\(\{ type: "incidencia", id, opener \}\)/);
  assert.match(facturas, /onDetailClosed/);
  assert.match(facturas, /onDetailShell/);
  assert.match(facturas, /createModalLifecycle/);
  assert.match(incidencias, /export async function createIncidenciaDetailController/);
  assert.match(incidencias, /prepareIncidenciaDetail/);
  assert.match(incidencias, /let routeOwnerController = null/);
  assert.match(incidencias, /modalHost: lease\?\.modalHost \|\| null/);
  assert.match(incidencias, /detailOnly \? null : installIncidenciasHotList/);
  assert.match(incidencias, /ENTITY_OVERLAY_IGNORE_ATTRIBUTE/);
  assert.match(incidencias, /isActiveModalHost/);
  assert.match(incidencias, /controller\.closeDetailModal\(\)/);
  assert.match(implementation, /detailOnly/);
  assert.match(implementation, /onDetailShell/);
  assert.match(implementation, /onDetailClosed/);
  assert.match(detail, /Reintentar/);
  assert.match(detail, /detail-retry/);
  console.log("Central domain owner contract: PASS · canonical detail controllers · no hidden views · origin disposal · one dispatcher");
}
