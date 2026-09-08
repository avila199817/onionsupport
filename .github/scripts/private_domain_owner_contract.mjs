import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

export const readOwnerSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
export const directDomainOwners = (await readOwnerSource("src/features/entity-overlay/index.js"))
  .includes('"entity-overlay.v5-single-detail-session"');

// One owner session must replace every older route/quick-view dispatcher.
export async function assertDirectDomainOwners() {
  assert.ok(directDomainOwners, "Explicit central domain detail architecture required");
  const [overlay, runtime, preload, router, home, facturas, incidencias, implementation, detail, clientes, usuarios] = await Promise.all([
    "src/features/entity-overlay/index.js", "src/features/private-runtime-ui/index.js",
    "src/features/entity-intent-preload/index.js", "src/router/index.js",
    "src/views/home/home.template.activity.js", "src/views/facturas/index.js",
    "src/views/incidencias/index.js", "src/views/incidencias/index.impl.js",
    "src/views/incidencias/incidencias.template.modal.impl.js",
    "src/views/clientes/index.js", "src/views/usuarios/index.js",
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
  for (const type of ["cliente", "usuario", "generic-record", "adapter-utils"]) {
    await assert.rejects(access(new URL(`../../src/features/entity-overlay/adapters/${type}.js`, import.meta.url)),
      { code: "ENOENT" }, "Read-only adapters must not remain as another detail implementation");
  }
  assert.match(overlay, /createClienteDetailController/);
  assert.match(overlay, /createUsuarioDetailController/);
  assert.doesNotMatch(overlay, /ADAPTER_LOADERS|adapterPromises|hydrateEntry|renderTop|let stack|isCanonicalOwnerRoute|routeOpenName/);
  assert.match(overlay, /createAsyncScope/);
  assert.match(overlay, /export function releaseOrigin/);
  assert.match(overlay, /session\.scope\.onDispose/);
  assert.match(overlay, /session\.controller\?\.destroy\?\.\(/);
  assert.match(overlay, /onDetailShell\(detail = \{\}\)/);
  assert.match(overlay, /session\.modalHost = detail\.modalHost \|\| detail\.host/);
  assert.match(overlay, /if \(ownerSession\?\.modalHost\?\.contains\(target\)\) return;/);
  assert.match(overlay, /onDetailClosed\(\)/);
  assert.match(overlay, /ownerIsCurrent\(session\)/);
  assert.match(overlay, /onDocumentClick, true/);
  assert.doesNotMatch(overlay, /MutationObserver|navigateWithRouter|Router\.navigate|returnPath|history\.|addEventListener\("popstate"/);
  assert.match(overlay, /export function subscribe/);
  assert.match(overlay, /export function isOriginOpen/);
  assert.match(overlay, /export function activateOrigin/);
  assert.match(overlay, /notify\("closed", session\)/);
  assert.match(overlay, /ownerSession = null;[\s\S]*notify\("closed", session\)/);
  assert.match(overlay, /if \(ownerSession && !close\(\)\) return false;[\s\S]*if \(ownerSession\) return false;/);
  const ownerOpen = overlay.slice(overlay.indexOf("async function openCanonicalOwner"), overlay.indexOf("async function open(input"));
  assert.ok(ownerOpen.indexOf("ownerSession = session") < ownerOpen.indexOf("await preload(type)"), "Origin must own pending imports");
  assert.doesNotMatch(ownerOpen, /history\.|writeUrlForEntry|location\.(?:assign|replace)/);
  assert.equal((router.match(/releaseOrigin\?\.\(previousHost\)/g) || []).length, 2, "Both route replacement and teardown must dispose owned detail");
  assert.match(router, /activateOrigin\?\.\(nextHost\)/);
  assert.match(runtime, /await initModule\(EntityOverlayUI, payload\);[\s\S]*await initModule\(EntityIntentPreloadUI, payload\);/);
  assert.match(runtime, /isAuthenticated\(context\)/);
  assert.match(preload, /authenticated\(\)/);
  assert.match(preload, /EntityOverlay\.preload\(intent\.type\)/);
  assert.match(preload, /HOVER_DWELL_MS = 64/);
  assert.doesNotMatch(preload, /addEventListener\("click"|\bfetch\s*\(|localStorage|sessionStorage|indexedDB/);
  assert.match(facturas, /export async function createFacturaDetailController/);
  assert.match(facturas, /createFacturasController\(null, \{ \.\.\.context, detailOnly: true \}\)\.mount\(\)/);
  assert.match(facturas, /if \(detailOnly\) return controller/);
  assert.doesNotMatch(facturas, /let routeOwnerController = null/);
  assert.match(facturas, /if \(!detailOnly\) return openFacturaDetailById\(id, openerNode\)/);
  assert.match(facturas, /openEntityDetail\(\{ type: "incidencia", id, opener \}\)/);
  assert.match(facturas, /onDetailClosed/);
  assert.match(facturas, /onDetailShell/);
  assert.match(facturas, /createModalLifecycle/);
  for (const [source, factory] of [[clientes, "createClienteDetailController"], [usuarios, "createUsuarioDetailController"]]) {
    assert.match(source, new RegExp(`export async function ${factory}`));
    assert.match(source, /openDetail:/);
    assert.match(source, /closeDetailModal/);
    assert.match(source, /detailOnly/);
    assert.match(source, /onDetailShell/);
    assert.match(source, /onDetailClosed/);
  }
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
  console.log("Central domain owner contract: PASS · four canonical controllers · no adapter/history/route bypass · origin disposal · one session");
}
