import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getIncidenciasStatsScopePresentation,
  getIncidenciasStatsScopeSnapshot,
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
assert.equal(snapshot.policy.canonicalCopyRestoredWhenComplete, true);
assert.equal(snapshot.policy.valuesRemainControllerOwned, true);

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
  /Http|fetch\(|XMLHttpRequest|\/api\/tickets\/stats/,
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
  "Incidencias stats scope OK · partial => loaded labels · complete => canonical labels · zero HTTP"
);
