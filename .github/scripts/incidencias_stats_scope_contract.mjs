import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getIncidenciasStatsScopePresentation,
  getIncidenciasStatsScopeSnapshot,
  installIncidenciasStatsScope,
} from "../../src/views/incidencias/incidencias.stats-scope.js";

const partial = getIncidenciasStatsScopePresentation({ partial: true });
assert.equal(partial.scope, "loaded");
assert.equal(partial.cards.open.label, "Abiertas cargadas");
assert.equal(partial.cards.closed.label, "Cerradas cargadas");
assert.equal(partial.cards.urgent.label, "Urgentes cargadas");
assert.equal(partial.cards.amount.label, "Importe cargado");
assert.equal(partial.attachmentsSuffix, " en cargadas");

const complete = getIncidenciasStatsScopePresentation({ partial: false });
assert.equal(complete.scope, "complete");
assert.equal(complete.cards.open.label, "Abiertas");
assert.equal(complete.cards.closed.label, "Cerradas");
assert.equal(complete.cards.urgent.label, "Urgentes");
assert.equal(complete.cards.amount.label, "Importe asociado");
assert.equal(complete.attachmentsSuffix, "");

const snapshot = getIncidenciasStatsScopeSnapshot();
assert.equal(snapshot.policy.zeroHttp, true);
assert.equal(snapshot.policy.zeroMetricRecalculation, true);
assert.equal(snapshot.policy.loadedMetricsExplicitWhenPartial, true);
assert.equal(snapshot.policy.attributeTransitionsObserved, true);
assert.equal(snapshot.policy.canonicalCopyRestoredWhenComplete, true);
assert.equal(snapshot.policy.valuesRemainControllerOwned, true);

let mutationCallback = null;
let observerOptions = null;
let observerDisconnected = false;

class FakeMutationObserver {
  constructor(callback) {
    mutationCallback = callback;
  }

  observe(_target, options) {
    observerOptions = options;
  }

  disconnect() {
    observerDisconnected = true;
  }
}

const runtimeRoot = {
  dataset: {
    totalGreaterThanItems: "false",
  },
  querySelector() {
    return null;
  },
};
const runtimeHost = {
  querySelector(selector) {
    return selector === "[data-incidencias-scope='true']" ? runtimeRoot : null;
  },
};
const runtimeDocument = {
  defaultView: {
    MutationObserver: FakeMutationObserver,
  },
  querySelector() {
    return null;
  },
};

const uninstallRuntimeScope = installIncidenciasStatsScope({
  host: runtimeHost,
  document: runtimeDocument,
});

assert.equal(runtimeRoot.dataset.statsScope, "complete");
assert.equal(observerOptions?.attributes, true);
assert.deepEqual(observerOptions?.attributeFilter, [
  "data-total-greater-than-items",
]);
assert.equal(observerOptions?.childList, true);
assert.equal(observerOptions?.subtree, true);

runtimeRoot.dataset.totalGreaterThanItems = "true";
mutationCallback?.([
  {
    type: "attributes",
    attributeName: "data-total-greater-than-items",
    target: runtimeRoot,
  },
]);
await Promise.resolve();
assert.equal(
  runtimeRoot.dataset.statsScope,
  "loaded",
  "el cambio 8/22 debe etiquetar inmediatamente las métricas como cargadas"
);

runtimeRoot.dataset.totalGreaterThanItems = "false";
mutationCallback?.([
  {
    type: "attributes",
    attributeName: "data-total-greater-than-items",
    target: runtimeRoot,
  },
]);
await Promise.resolve();
assert.equal(
  runtimeRoot.dataset.statsScope,
  "complete",
  "el cambio 22/22 debe restaurar el copy canónico"
);

uninstallRuntimeScope();
assert.equal(observerDisconnected, true);

const scopeSource = await readFile(
  new URL("../../src/views/incidencias/incidencias.stats-scope.js", import.meta.url),
  "utf8"
);
const boundarySource = await readFile(
  new URL("../../src/views/incidencias/index.js", import.meta.url),
  "utf8"
);
const templateSource = await readFile(
  new URL("../../src/views/incidencias/incidencias.template.js", import.meta.url),
  "utf8"
);
const apiSource = await readFile(
  new URL("../../src/views/incidencias/incidencias.api.impl.js", import.meta.url),
  "utf8"
);

assert.match(
  templateSource,
  /data-total-greater-than-items="\$\{vm\.diagnostics\.totalGreaterThanItems \? "true" : "false"\}"/,
  "la vista debe publicar una señal explícita de historial remoto incompleto"
);
assert.match(
  scopeSource,
  /root\.dataset\?\.totalGreaterThanItems === "true"/,
  "el enhancement debe consumir la señal canónica, no inferirla del DOM visible"
);
assert.doesNotMatch(
  scopeSource,
  /(?:from\s+["'][^"']*core\/http\.js["']|\bHttp\.(?:get|post|put|patch|delete)\s*\(|\bfetch\s*\(|XMLHttpRequest|\/api\/tickets\/stats)/,
  "el etiquetado de alcance no puede añadir una segunda consulta de stats"
);
assert.match(
  apiSource,
  /export function computeIncidenciasStats\(items = lastList\.items\)/,
  "las métricas siguen calculándose sobre la colección cargada"
);
assert.match(
  boundarySource,
  /installIncidenciasStatsScope/,
  "la frontera de Incidencias debe instalar el scope de métricas"
);
assert.match(
  boundarySource,
  /uninstallStatsScope\?\.\(\)/,
  "el scope de métricas debe desmontarse junto al controller"
);

console.log(
  "Incidencias stats scope OK · attribute-synced 8/22 => loaded · 22/22 => complete · zero HTTP"
);
