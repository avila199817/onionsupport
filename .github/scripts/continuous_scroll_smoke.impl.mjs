import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  renderIncidenciasErrorState,
  renderIncidenciasTemplate,
} from "../../src/views/incidencias/incidencias.template.js";
import {
  renderFacturasErrorState,
  renderFacturasLoadingState,
  renderFacturasTemplate,
} from "../../src/views/facturas/facturas.template.js";
import {
  clearFacturasCache,
  getFacturasListContextKey,
  hydrateFacturasFromCache,
  normalizeFacturasListResponse,
  syncFacturasListCache,
} from "../../src/views/facturas/facturas.api.js";
import {
  facturasCanOptimisticallyInsertCreated,
  facturasFirstPageIdentityMatches,
  mergeFacturasFreshPageFirst,
} from "../../src/views/facturas/index.js";
import { renderClientesTemplate } from "../../src/views/clientes/clientes.template.js";
import {
  mergeFreshPageWithLoaded,
  mergeFreshReconciliationPage,
} from "../../src/views/clientes/index.js";
import { renderUsuariosTableTemplate } from "../../src/views/usuarios/usuarios.template.js";
import { mergeUsuariosCursorItems } from "../../src/views/usuarios/usuarios.cursor.js";

const MANUAL_CONTINUATION_COPY = />\s*(?:Mostrar|Ver|Cargar(?:\s+\d+)?)\s+m[aá]s\s*</iu;
const MANUAL_CONTINUATION_CLASS = /(?:load-more-btn|load-more-button)/iu;
const MANUAL_CONTINUATION_ACTION = /data-(?:[\w-]+-)?action="(?:load-more|load_more)"/iu;

function politeRegionCount(html) {
  return (html.match(/aria-live="polite"/gu) || []).length;
}

function assertContinuousMarkup(name, html, sentinel) {
  assert.match(html, sentinel, `${name}: falta el sentinel de continuación`);
  assert.match(html, /aria-live="polite"/u, `${name}: falta el estado aria-live`);
  assert.equal(politeRegionCount(html), 1, `${name}: debe anunciar desde una sola región viva`);
  assert.doesNotMatch(html, MANUAL_CONTINUATION_COPY, `${name}: conserva copy de continuación manual`);
  assert.doesNotMatch(html, MANUAL_CONTINUATION_CLASS, `${name}: conserva un botón de continuación manual`);
  assert.doesNotMatch(html, MANUAL_CONTINUATION_ACTION, `${name}: conserva una acción manual oculta`);
  assert.doesNotMatch(html, />Reintentar</u, `${name}: muestra retry sin existir un error incremental`);
}

function assertRetryMarkup(name, html, loadedId, sentinel) {
  assert.match(html, />Reintentar</u, `${name}: falta el reintento de página incremental`);
  assert.match(html, new RegExp(loadedId, "u"), `${name}: el fallo incremental elimina filas cargadas`);
  assert.doesNotMatch(html, MANUAL_CONTINUATION_COPY, `${name}: el error recupera copy manual`);
  assert.doesNotMatch(html, MANUAL_CONTINUATION_ACTION, `${name}: el error recupera una acción manual oculta`);
  assert.doesNotMatch(html, sentinel, `${name}: mantiene activo el sentinel durante el error`);
  assert.equal(politeRegionCount(html), 1, `${name}: el error debe usar una sola región viva`);
}

function assertPassiveState(name, html, sentinel, expectedCopy) {
  assert.equal(politeRegionCount(html), 1, `${name}: el estado debe usar una sola región viva`);
  assert.doesNotMatch(html, sentinel, `${name}: mantiene un sentinel activo mientras la lista está bloqueada`);
  assert.match(html, expectedCopy, `${name}: no anuncia el estado real del feed`);
  assert.doesNotMatch(html, MANUAL_CONTINUATION_COPY, `${name}: recupera copy de continuación manual`);
  assert.doesNotMatch(html, MANUAL_CONTINUATION_ACTION, `${name}: recupera una acción manual oculta`);
}

function assertObserverContract(name, relativePath, pageStatePattern) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  assert.match(source, /IntersectionObserver/u, `${name}: falta IntersectionObserver`);
  assert.match(source, /disconnectInfiniteObserver/u, `${name}: falta teardown del observer`);
  assert.match(source, /takeRecords/u, `${name}: no vacía callbacks encolados del observer`);
  assert.match(source, /infiniteObserver !== observer/u, `${name}: no invalida observers obsoletos por identidad`);
  assert.match(source, /main-content/u, `${name}: no usa el scroll host de la aplicación`);
  assert.match(source, /loadingMore/u, `${name}: no protege solicitudes concurrentes`);
  assert.match(source, /hasMore/u, `${name}: no respeta el final confirmado por backend`);
  assert.match(source, /(?:loadMoreError|incrementalError)/u, `${name}: no separa el error incremental`);
  assert.match(source, pageStatePattern, `${name}: no conserva la continuación remota`);
}

assertObserverContract("Incidencias", "../../src/views/incidencias/index.js", /nextCursor/u);
assertObserverContract("Facturas", "../../src/views/facturas/index.js", /nextPage/u);
assertObserverContract("Clientes", "../../src/views/clientes/index.js", /nextCursor/u);
assertObserverContract("Usuarios", "../../src/views/usuarios/index.js", /continuationToken/u);

const facturasController = readFileSync(
  new URL("../../src/views/facturas/index.js", import.meta.url),
  "utf8"
);
const clientesController = readFileSync(
  new URL("../../src/views/clientes/index.js", import.meta.url),
  "utf8"
);
assert.match(
  clientesController,
  /if \(!append\) \{\s*loadMoreError = "";\s*error = "";\s*\}/u,
  "Clientes: reintentar una revalidación conserva el error y deja el retry activo"
);
assert.match(
  facturasController,
  /silent && items\.length/u,
  "Facturas: una revalidación silenciosa debe bloquear continuaciones concurrentes"
);
assert.match(
  facturasController,
  /mergeFacturasFreshPageFirst/u,
  "Facturas: revalidar la primera página colapsa el historial acumulado"
);
assert.match(
  facturasController,
  /previousPageState\.nextPage/u,
  "Facturas: revalidar pierde la continuación capturada"
);

for (const [name, relativePath, mergePattern] of [
  ["Incidencias", "../../src/views/incidencias/index.js", /mergeTicketPage/u],
  ["Facturas", "../../src/views/facturas/index.js", /mergeFacturas/u],
  ["Clientes", "../../src/views/clientes/index.js", /appendUnique/u],
  ["Usuarios", "../../src/views/usuarios/index.js", /mergeUsuariosCursorItems/u],
]) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  assert.match(source, mergePattern, `${name}: la unión de páginas debe deduplicar por identidad`);
}

for (const [name, relativePath, progressPattern] of [
  ["Incidencias", "../../src/views/incidencias/index.js", /INCIDENCIAS_PAGE_WITHOUT_ID_PROGRESS/u],
  ["Facturas", "../../src/views/facturas/index.js", /FACTURAS_PAGE_DID_NOT_ADVANCE/u],
  ["Clientes", "../../src/views/clientes/index.js", /CLIENTES_PAGE_DID_NOT_ADVANCE/u],
  ["Usuarios", "../../src/views/usuarios/index.js", /USUARIOS_PAGE_DID_NOT_ADVANCE/u],
]) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  assert.match(source, progressPattern, `${name}: no detiene páginas sin progreso por ID`);
  assert.match(source, /(?:capture|captureStable).*Focus|captureDomState/u, `${name}: no captura el foco antes de reemplazar filas`);
  assert.match(source, /(?:restore|restoreStable).*Focus|restoreDomState/u, `${name}: no restaura el foco tras reemplazar filas`);
}

for (const [name, relativePath] of [
  ["Incidencias", "../../src/views/incidencias/incidencias.template.js"],
  ["Facturas", "../../src/views/facturas/facturas.template.js"],
  ["Clientes", "../../src/views/clientes/clientes.template.js"],
  ["Usuarios", "../../src/views/usuarios/usuarios.template.js"],
]) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  assert.doesNotMatch(source, /LOAD_MORE\s*:\s*["']load-more["']/u, `${name}: exporta una acción manual oculta`);
}

const incidencia = {
  ticketId: "INC-20260826-SMOKE",
  subject: "Prueba de continuidad",
  status: "open",
  priority: "normal",
  createdAt: "2026-08-26T08:00:00.000Z",
  updatedAt: "2026-08-26T08:00:00.000Z",
};
const incidenciasBase = {
  canonical: true,
  items: [incidencia],
  total: 2,
  nextCursor: "opaque-incidencias-cursor",
  hasMore: true,
  visibleLimit: 20,
};
assertContinuousMarkup(
  "Incidencias",
  renderIncidenciasTemplate(incidenciasBase),
  /data-incidencias-infinite-sentinel="true"/u
);
assertRetryMarkup(
  "Incidencias",
  renderIncidenciasTemplate({ ...incidenciasBase, incrementalError: "Fallo de página" }),
  "INC-20260826-SMOKE",
  /data-incidencias-infinite-sentinel="true"/u
);
assert.match(
  renderIncidenciasTemplate(incidenciasBase),
  /<button[^>]*data-sort-mode="date"[^>]*disabled/u,
  "Incidencias: permite reordenar páginas parciales mientras existe cursor remoto"
);
assertPassiveState(
  "Incidencias preparando consulta",
  renderIncidenciasTemplate({ ...incidenciasBase, listQueryPending: true }),
  /data-incidencias-infinite-sentinel="true"/u,
  /Cargando incidencias con los filtros seleccionados/u
);
assertPassiveState(
  "Incidencias actualizando",
  renderIncidenciasTemplate({ ...incidenciasBase, refreshing: true }),
  /data-incidencias-infinite-sentinel="true"/u,
  /Actualizando incidencias/u
);
assertPassiveState(
  "Incidencias cargando página",
  renderIncidenciasTemplate({ ...incidenciasBase, loadingMore: true }),
  /data-incidencias-infinite-sentinel="true"/u,
  /Cargando la siguiente página de incidencias/u
);
assertPassiveState(
  "Incidencias final",
  renderIncidenciasTemplate({
    ...incidenciasBase,
    total: 1,
    nextCursor: "",
    hasMore: false,
  }),
  /data-incidencias-infinite-sentinel="true"/u,
  /Has visto todas las incidencias disponibles/u
);
const incidenciasFatal = renderIncidenciasErrorState("Fallo de primera página");
assert.match(
  incidenciasFatal,
  /role="alert" aria-live="assertive" aria-atomic="true"/u,
  "Incidencias: el fallo fatal no se anuncia de forma atómica"
);
assert.match(
  incidenciasFatal,
  /data-incidencias-focus-fallback="true" tabindex="-1"/u,
  "Incidencias: el fallo fatal no ofrece un destino de foco programático"
);
assert.match(
  incidenciasFatal,
  /data-incidencias-action="refresh"[^>]*>[^]*Reintentar/u,
  "Incidencias: el fallo fatal no conserva un reintento accesible"
);
const incidenciasDateButton = renderIncidenciasTemplate({
  ...incidenciasBase,
  total: 1,
  nextCursor: "",
  hasMore: false,
  filter: "date",
  sortMode: "date",
}).match(/<button[^>]*data-sort-mode="date"[^>]*>/u)?.[0] || "";
assert.match(
  incidenciasDateButton,
  /data-incidencias-action="sort-toggle"/u,
  "Incidencias: el control Fecha no entra en modo de alternar orden"
);
assert.match(
  incidenciasDateButton,
  /aria-pressed="true"/u,
  "Incidencias: el control Fecha no refleja su selección"
);
assert.doesNotMatch(
  incidenciasDateButton,
  /\sdisabled(?:\s|>)/u,
  "Incidencias: Fecha sigue bloqueado tras completar el historial"
);

const factura = {
  facturaId: "FAC-SMOKE-1",
  numero: "FAC-SMOKE-1",
  clienteNombre: "Cliente de prueba",
  estadoPago: "pending",
  total: 100,
  createdAt: "2026-08-26T08:00:00.000Z",
};
const facturasBase = {
  items: [factura],
  hasMore: true,
  nextPage: 2,
  state: { hasMore: true, nextPage: 2 },
};
const facturasLoading = renderFacturasLoadingState(facturasBase);
assert.equal(
  politeRegionCount(facturasLoading),
  1,
  "Facturas: la carga inicial debe anunciarse desde una región viva"
);
assert.match(
  renderFacturasErrorState("Fallo inicial"),
  /role="alert"[^>]*aria-atomic="true"/u,
  "Facturas: el error fatal debe anunciarse como alerta atómica"
);
const facturasInitialEmpty = renderFacturasTemplate({
  items: [],
  hasMore: false,
  nextPage: null,
  state: { hasMore: false, nextPage: null },
});
assert.equal(
  politeRegionCount(facturasInitialEmpty),
  1,
  "Facturas: el historial vacío inicial no se anuncia"
);
assert.match(
  facturasInitialEmpty,
  /id="facturas-empty-state"[^>]*role="status"[^>]*aria-live="polite"/u,
  "Facturas: el vacío inicial no expone un estado vivo estable"
);
const facturasFilteredEmpty = renderFacturasTemplate({
  items: [],
  filter: "pending",
  search: "sin coincidencias",
  hasMore: false,
  nextPage: null,
  state: { hasMore: false, nextPage: null },
});
assert.equal(
  politeRegionCount(facturasFilteredEmpty),
  1,
  "Facturas: el resultado filtrado vacío no se anuncia"
);
assert.match(
  facturasFilteredEmpty,
  /No hay facturas con esos filtros/u,
  "Facturas: el resultado filtrado vacío no explica el estado"
);
assertContinuousMarkup(
  "Facturas",
  renderFacturasTemplate(facturasBase),
  /data-facturas-infinite-sentinel="true"/u
);
assertRetryMarkup(
  "Facturas",
  renderFacturasTemplate({
    ...facturasBase,
    loadMoreError: "Fallo de página",
    state: { ...facturasBase.state, loadMoreError: "Fallo de página" },
  }),
  "FAC-SMOKE-1",
  /data-facturas-infinite-sentinel="true"/u
);
const facturasFirstPageError = renderFacturasTemplate({
  ...facturasBase,
  error: "Página sin identidades estables",
  state: {
    ...facturasBase.state,
    error: "Página sin identidades estables",
  },
});
assert.match(
  facturasFirstPageError,
  /role="alert"/u,
  "Facturas: el error de primera página no se anuncia"
);
assert.doesNotMatch(
  facturasFirstPageError,
  /data-facturas-infinite-sentinel="true"/u,
  "Facturas: un error de primera página deja activa la continuación"
);
assertPassiveState(
  "Facturas actualizando",
  renderFacturasTemplate({
    ...facturasBase,
    state: { ...facturasBase.state, refreshing: true },
  }),
  /data-facturas-infinite-sentinel="true"/u,
  /Actualizando facturas/u
);
assertPassiveState(
  "Facturas cargando página",
  renderFacturasTemplate({
    ...facturasBase,
    state: { ...facturasBase.state, loadingMore: true },
  }),
  /data-facturas-infinite-sentinel="true"/u,
  /Cargando más facturas/u
);
assertPassiveState(
  "Facturas final",
  renderFacturasTemplate({
    ...facturasBase,
    hasMore: false,
    nextPage: null,
    state: { hasMore: false, nextPage: null },
  }),
  /data-facturas-infinite-sentinel="true"/u,
  /Has visto todas las facturas disponibles/u
);
const previousFacturas = Array.from({ length: 205 }, (_, index) => ({
  facturaId: `FAC-${index + 1}`,
  numero: `FAC-${index + 1}`,
}));
const freshFacturasPage = [
  { facturaId: "FAC-NEW", numero: "FAC-NEW" },
  ...Array.from({ length: 99 }, (_, index) => ({
    facturaId: `FAC-${index + 1}`,
    numero: `FAC-${index + 1}`,
  })),
];
const reconciledFacturas = mergeFacturasFreshPageFirst(
  previousFacturas,
  freshFacturasPage,
  100
);
assert.equal(
  facturasFirstPageIdentityMatches(
    previousFacturas,
    freshFacturasPage,
    100
  ),
  false,
  "Facturas: un cambio de frontera en P1 conserva un offset inseguro"
);
assert.equal(
  facturasFirstPageIdentityMatches(
    [{ facturaId: "FAC-NEW" }, ...previousFacturas],
    freshFacturasPage,
    100
  ),
  true,
  "Facturas: un alta optimista ya reconciliada invalida páginas seguras"
);
assert.equal(
  facturasCanOptimisticallyInsertCreated({
    created: { facturaId: "FAC-NEW" },
    filter: "all",
    search: "",
    hasMore: true,
    sort: "date_asc",
    currentQuery: true,
  }),
  false,
  "Facturas: un alta optimista ASC se intercala antes de páginas todavía no cargadas"
);
assert.equal(
  facturasCanOptimisticallyInsertCreated({
    created: { facturaId: "FAC-NEW" },
    filter: "all",
    search: "",
    hasMore: false,
    sort: "date_asc",
    currentQuery: true,
  }),
  true,
  "Facturas: un historial ASC completo puede insertar el alta al final"
);
assert.equal(
  reconciledFacturas[0].facturaId,
  "FAC-NEW",
  "Facturas: la primera página fresca no conserva el orden del backend"
);
assert.equal(
  reconciledFacturas.some((item) => item.facturaId === "FAC-100"),
  false,
  "Facturas: la revalidación conserva una fila obsoleta de la primera página"
);
assert.equal(
  reconciledFacturas.some((item) => item.facturaId === "FAC-205"),
  true,
  "Facturas: la revalidación colapsa páginas acumuladas posteriores"
);
for (const customPageSize of [20, 200]) {
  const previous = Array.from(
    { length: customPageSize * 3 },
    (_, index) => ({ facturaId: `FAC-${customPageSize}-${index + 1}` })
  );
  const fresh = [
    { facturaId: `FAC-${customPageSize}-NEW` },
    ...Array.from(
      { length: customPageSize - 1 },
      (_, index) => ({ facturaId: `FAC-${customPageSize}-${index + 1}` })
    ),
  ];
  const reconciled = mergeFacturasFreshPageFirst(
    previous,
    fresh,
    customPageSize
  );
  assert.equal(
    reconciled.some((item) => item.facturaId === `FAC-${customPageSize}-${customPageSize}`),
    false,
    `Facturas: pageSize=${customPageSize} conserva el borde obsoleto de P1`
  );
  assert.equal(
    reconciled.some((item) => item.facturaId === `FAC-${customPageSize}-${customPageSize * 3}`),
    true,
    `Facturas: pageSize=${customPageSize} elimina páginas acumuladas`
  );
}

const cliente = {
  clienteId: "CLI-SMOKE-1",
  displayName: "Cliente de prueba",
  status: "active",
  createdAt: "2026-08-26T08:00:00.000Z",
};
const clientesBase = {
  items: [cliente],
  hasMore: true,
  nextCursor: "opaque-clientes-cursor",
};
assertContinuousMarkup(
  "Clientes",
  renderClientesTemplate(clientesBase),
  /data-clientes-infinite-sentinel="true"/u
);
assertRetryMarkup(
  "Clientes",
  renderClientesTemplate({ ...clientesBase, loadMoreError: "Fallo de página" }),
  "CLI-SMOKE-1",
  /data-clientes-infinite-sentinel="true"/u
);
const clientesPreservedPageError = renderClientesTemplate({
  ...clientesBase,
  error: "Página sin identidades estables",
});
assert.equal(
  politeRegionCount(clientesPreservedPageError),
  0,
  "Clientes: un error assertive no debe duplicarse en la región polite"
);
assert.match(
  clientesPreservedPageError,
  /class="clientes-inline-error" role="alert"[^>]*>.*Página sin identidades estables.*>Reintentar</su,
  "Clientes: el error con filas no se anuncia o no permite reintentar"
);
assert.match(
  clientesPreservedPageError,
  /Actualización detenida\. Reintenta para continuar\./u,
  "Clientes: el pie sugiere continuar aunque el error bloquea el observer"
);
assert.doesNotMatch(
  clientesPreservedPageError,
  /data-clientes-infinite-sentinel="true"/u,
  "Clientes: el error mantiene activo el sentinel"
);
const clientesFatalError = renderClientesTemplate({
  items: [],
  error: "No se pudo abrir la primera página",
  hasMore: false,
  nextCursor: "",
});
assert.match(
  clientesFatalError,
  /data-clientes-fatal-error="true" role="alert" aria-atomic="true" tabindex="-1"/u,
  "Clientes: el error fatal no se anuncia ni acepta foco"
);
assert.equal(
  politeRegionCount(clientesFatalError),
  0,
  "Clientes: el error fatal se anuncia dos veces"
);
assertPassiveState(
  "Clientes preparando búsqueda",
  renderClientesTemplate({ ...clientesBase, searchPending: true }),
  /data-clientes-infinite-sentinel="true"/u,
  /Preparando la búsqueda de clientes/u
);
assertPassiveState(
  "Clientes actualizando",
  renderClientesTemplate({ ...clientesBase, refreshing: true }),
  /data-clientes-infinite-sentinel="true"/u,
  /Actualizando 1 clientes cargados/u
);
assertPassiveState(
  "Clientes cargando página",
  renderClientesTemplate({ ...clientesBase, loadingMore: true }),
  /data-clientes-infinite-sentinel="true"/u,
  /Cargando clientes automáticamente/u
);
assertPassiveState(
  "Clientes final",
  renderClientesTemplate({ ...clientesBase, hasMore: false, nextCursor: "" }),
  /data-clientes-infinite-sentinel="true"/u,
  /Has visto todos los clientes de esta consulta/u
);
assert.match(
  renderClientesTemplate({
    ...clientesBase,
    search: "Ana López",
    searchDraft: "  Ana   López ",
    searchPending: true,
  }),
  /value="  Ana   López "/u,
  "Clientes: el borrador visual colapsa espacios antes de completar la búsqueda"
);
const previousClientes = Array.from({ length: 120 }, (_, index) => ({
  clienteId: `CLI-${index + 1}`,
  displayName: `Cliente ${index + 1}`,
}));
const freshClientesPage = [
  { clienteId: "CLI-NEW", displayName: "Cliente nuevo" },
  ...Array.from({ length: 49 }, (_, index) => ({
    clienteId: `CLI-${index + 1}`,
    displayName: `Cliente ${index + 1} actualizado`,
  })),
  { displayName: "Fila sin identidad" },
];
const reconciledClientes = mergeFreshPageWithLoaded(
  previousClientes,
  freshClientesPage
);
assert.equal(
  reconciledClientes[0].clienteId,
  "CLI-NEW",
  "Clientes: la primera página fresca no conserva el orden del backend"
);
assert.equal(
  reconciledClientes.some((item) => item.clienteId === "CLI-50"),
  true,
  "Clientes: una fila desplazada fuera de P1 desaparece antes de recorrer el cursor fresco"
);
assert.equal(
  reconciledClientes.some((item) => item.clienteId === "CLI-120"),
  true,
  "Clientes: la revalidación colapsa páginas acumuladas posteriores"
);
assert.equal(
  reconciledClientes.every((item) => Boolean(item.clienteId)),
  true,
  "Clientes: una fila sin ID cuenta como progreso y puede duplicarse entre páginas"
);
const freshClientesSecondPage = Array.from({ length: 50 }, (_, index) => ({
  clienteId: `CLI-${index + 51}`,
  displayName: `Cliente ${index + 51} fresco`,
}));
const clientesReconciliationStep = mergeFreshReconciliationPage(
  freshClientesPage,
  freshClientesSecondPage,
  reconciledClientes
);
assert.equal(
  clientesReconciliationStep.progressed,
  true,
  "Clientes: una página fresca cuyos IDs ya eran visibles no cuenta como progreso"
);
assert.equal(
  clientesReconciliationStep.visibleItems.length,
  reconciledClientes.length,
  "Clientes: reconciliar IDs ya visibles duplica o elimina filas antes del final"
);
assert.equal(
  clientesReconciliationStep.visibleItems.find(
    (item) => item.clienteId === "CLI-51"
  )?.displayName,
  "Cliente 51 fresco",
  "Clientes: la colección fresca no actualiza una fila visible existente"
);
const clientesReconciliationWithoutProgress = mergeFreshReconciliationPage(
  clientesReconciliationStep.freshItems,
  freshClientesSecondPage,
  clientesReconciliationStep.visibleItems
);
assert.equal(
  clientesReconciliationWithoutProgress.progressed,
  false,
  "Clientes: repetir una página fresca se considera avance estable"
);
const clientesTerminalReconciliation = mergeFreshReconciliationPage(
  clientesReconciliationStep.freshItems,
  Array.from({ length: 19 }, (_, index) => ({
    clienteId: `CLI-${index + 101}`,
    displayName: `Cliente ${index + 101} fresco`,
  })),
  clientesReconciliationStep.visibleItems
);
assert.equal(
  clientesTerminalReconciliation.freshItems.some(
    (item) => item.clienteId === "CLI-120"
  ),
  false,
  "Clientes: la colección fresca terminal conserva una fila eliminada"
);
assert.equal(
  clientesTerminalReconciliation.visibleItems.some(
    (item) => item.clienteId === "CLI-120"
  ),
  true,
  "Clientes: una fila visible desaparece antes de que el backend confirme el final"
);
const previousPartialClientesDesc = Array.from({ length: 50 }, (_, index) => ({
  clienteId: `CLI-DESC-${index + 1}`,
  displayName: `Cliente DESC ${index + 1}`,
}));
const freshPartialClientesPage = [
  { clienteId: "CLI-DESC-NEW", displayName: "Cliente DESC nuevo" },
  ...Array.from({ length: 49 }, (_, index) => ({
    clienteId: `CLI-DESC-${index + 1}`,
    displayName: `Cliente DESC ${index + 1} fresco`,
  })),
];
const visiblePartialClientes = mergeFreshPageWithLoaded(
  previousPartialClientesDesc,
  freshPartialClientesPage
);
assert.equal(
  visiblePartialClientes.some((item) => item.clienteId === "CLI-DESC-50"),
  true,
  "Clientes: la nueva frontera DESC oculta una fila antes de confirmar si se desplazó o eliminó"
);
const recoveredPartialClientes = mergeFreshReconciliationPage(
  freshPartialClientesPage,
  Array.from({ length: 50 }, (_, index) => ({
    clienteId: `CLI-DESC-${index + 50}`,
    displayName: `Cliente DESC ${index + 50} fresco`,
  })),
  visiblePartialClientes
);
assert.equal(
  recoveredPartialClientes.progressed,
  true,
  "Clientes: la continuación fresca de un historial parcial no avanza"
);
assert.equal(
  recoveredPartialClientes.freshItems.some(
    (item) => item.clienteId === "CLI-DESC-50"
  ),
  true,
  "Clientes: conservar el cursor viejo pierde el registro desplazado fuera de P1"
);
assert.deepEqual(
  recoveredPartialClientes.freshItems.slice(0, 3).map((item) => item.clienteId),
  ["CLI-DESC-NEW", "CLI-DESC-1", "CLI-DESC-2"],
  "Clientes: la reconciliación fresca altera el orden DESC de la consulta"
);

const usuario = {
  userId: "USR-SMOKE-1",
  displayName: "Usuario de prueba",
  email: "smoke@example.com",
  status: "active",
  createdAt: "2026-08-26T08:00:00.000Z",
};
const usuariosBase = {
  items: [usuario],
  admin: true,
  state: { hasMore: true, totalKnown: false },
};
assertContinuousMarkup(
  "Usuarios",
  renderUsuariosTableTemplate(usuariosBase),
  /data-usuarios-infinite-sentinel="true"/u
);
assertRetryMarkup(
  "Usuarios",
  renderUsuariosTableTemplate({
    ...usuariosBase,
    state: { ...usuariosBase.state, loadMoreError: "Fallo de página" },
  }),
  "USR-SMOKE-1",
  /data-usuarios-infinite-sentinel="true"/u
);
assertPassiveState(
  "Usuarios preparando búsqueda",
  renderUsuariosTableTemplate({
    ...usuariosBase,
    state: { ...usuariosBase.state, hasMore: false, searchPending: true },
  }),
  /data-usuarios-infinite-sentinel="true"/u,
  /Preparando la búsqueda de usuarios/u
);
const usuariosSpacedSearch = renderUsuariosTableTemplate({
  ...usuariosBase,
  state: {
    ...usuariosBase.state,
    search: "  Ana   López ",
    searchPending: true,
  },
});
assert.match(
  usuariosSpacedSearch,
  /value="  Ana   López "/u,
  "Usuarios: el rerender pendiente debe conservar espacios y caret de la búsqueda"
);
assertPassiveState(
  "Usuarios cargando página",
  renderUsuariosTableTemplate({
    ...usuariosBase,
    state: { ...usuariosBase.state, loadingMore: true },
  }),
  /data-usuarios-infinite-sentinel="true"/u,
  /Cargando usuarios automáticamente/u
);
assertPassiveState(
  "Usuarios actualizando",
  renderUsuariosTableTemplate({
    ...usuariosBase,
    state: { ...usuariosBase.state, refreshing: true },
  }),
  /data-usuarios-infinite-sentinel="true"/u,
  /Actualizando usuarios/u
);
assertPassiveState(
  "Usuarios final",
  renderUsuariosTableTemplate({
    ...usuariosBase,
    state: { hasMore: false, totalKnown: true, totalCount: 1 },
  }),
  /data-usuarios-infinite-sentinel="true"/u,
  /Has visto el único usuario de la consulta/u
);

const mergedUsuarios = mergeUsuariosCursorItems(
  [
    { userId: "USR-ORDER-1", displayName: "Antiguo", updatedAt: "2026-08-24T08:00:00.000Z" },
    { userId: "USR-ORDER-2", displayName: "Cola", updatedAt: "2026-08-23T08:00:00.000Z" },
  ],
  [
    { userId: "USR-ORDER-1", displayName: "Actualizado", updatedAt: "2026-08-26T08:00:00.000Z" },
    { userId: "USR-ORDER-3", displayName: "Nuevo", updatedAt: "2026-08-25T08:00:00.000Z" },
  ]
);
assert.deepEqual(
  mergedUsuarios.map((item) => item.userId),
  ["USR-ORDER-1", "USR-ORDER-3", "USR-ORDER-2"],
  "Usuarios: la revalidación fresca no restaura el orden DESC global"
);
assert.equal(
  mergedUsuarios[0].displayName,
  "Actualizado",
  "Usuarios: la revalidación fresca no actualiza duplicados"
);

assert.equal(
  getFacturasListContextKey({ page: 1, limit: 50, filters: { estadoPago: "paid" } }),
  getFacturasListContextKey({ page: 2, limit: 50, filters: { estadoPago: "paid" } }),
  "Facturas: una misma consulta cambia de identidad entre páginas"
);
assert.notEqual(
  getFacturasListContextKey({ page: 1, limit: 50, filters: { estadoPago: "paid" } }),
  getFacturasListContextKey({ page: 1, limit: 50, filters: { estadoPago: "pending" } }),
  "Facturas: dos filtros distintos comparten contexto de caché"
);
assert.equal(
  normalizeFacturasListResponse(
    { items: [factura], total: 8, page: 1, hasMore: true },
    { page: 1, limit: 1 }
  ).totalKnown,
  true,
  "Facturas: un total explícito no se conserva como exacto"
);
assert.equal(
  normalizeFacturasListResponse(
    { items: [factura], page: 1, hasMore: false },
    { page: 1, limit: 1 }
  ).totalKnown,
  false,
  "Facturas: el tamaño de una página se confunde con un total exacto"
);
assert.equal(
  normalizeFacturasListResponse(
    { items: [factura], total: 1, page: 1, hasMore: "false" },
    { page: 1, limit: 1 }
  ).hasMore,
  false,
  "Facturas: hasMore='false' crea una página fantasma"
);
assert.equal(
  normalizeFacturasListResponse(
    { items: [factura], total: 1, page: 1, hasMore: "0" },
    { page: 1, limit: 1 }
  ).hasMore,
  false,
  "Facturas: hasMore='0' crea una página fantasma"
);
const facturasDataEnvelope = normalizeFacturasListResponse(
  {
    data: [{ facturaId: "FAC-DATA-1", numero: "FAC-DATA-1" }],
    meta: { total: 5, hasMore: true, nextPage: 2, page: 1 },
  },
  { page: 1, limit: 1 }
);
assert.deepEqual(
  {
    ids: facturasDataEnvelope.items.map((item) => item.facturaId),
    total: facturasDataEnvelope.total,
    totalKnown: facturasDataEnvelope.totalKnown,
    hasMore: facturasDataEnvelope.hasMore,
    nextPage: facturasDataEnvelope.nextPage,
  },
  {
    ids: ["FAC-DATA-1"],
    total: 5,
    totalKnown: true,
    hasMore: true,
    nextPage: 2,
  },
  "Facturas: un envelope data[] pierde filas o metadatos de paginación"
);
const facturasMixedEnvelope = normalizeFacturasListResponse(
  {
    items: [{ facturaId: "FAC-MIXED-1", numero: "FAC-MIXED-1" }],
    page: 1,
    meta: { hasMore: true, nextPage: 2 },
  },
  { page: 1, limit: 1 }
);
assert.deepEqual(
  {
    ids: facturasMixedEnvelope.items.map((item) => item.facturaId),
    totalKnown: facturasMixedEnvelope.totalKnown,
    hasMore: facturasMixedEnvelope.hasMore,
    nextPage: facturasMixedEnvelope.nextPage,
  },
  {
    ids: ["FAC-MIXED-1"],
    totalKnown: false,
    hasMore: true,
    nextPage: 2,
  },
  "Facturas: un page numérico eclipsa la continuación confirmada en meta"
);

clearFacturasCache();
const facturasContextKey = getFacturasListContextKey({
  limit: 1,
  filters: { estadoPago: "paid" },
});
const facturaPage2 = { ...factura, facturaId: "FAC-SMOKE-2", numero: "FAC-SMOKE-2" };
const facturaPage3 = { ...factura, facturaId: "FAC-SMOKE-3", numero: "FAC-SMOKE-3" };
const facturaPage4 = { ...factura, facturaId: "FAC-SMOKE-4", numero: "FAC-SMOKE-4" };
syncFacturasListCache({
  items: [factura, facturaPage2, facturaPage3],
  total: 8,
  totalKnown: true,
  contextKey: facturasContextKey,
  page: 3,
  nextPage: 4,
  hasMore: true,
});
syncFacturasListCache({
  items: [{ ...factura, clienteNombre: "Cliente actualizado" }, facturaPage2, facturaPage3],
  total: 8,
  totalKnown: true,
  contextKey: facturasContextKey,
  page: 3,
  nextPage: 4,
  hasMore: true,
});
syncFacturasListCache({
  items: [
    { ...factura, clienteNombre: "Cliente actualizado" },
    facturaPage2,
    facturaPage3,
    facturaPage4,
  ],
  total: 8,
  totalKnown: true,
  contextKey: facturasContextKey,
  page: 4,
  nextPage: 5,
  hasMore: true,
});
const hydratedFacturas = hydrateFacturasFromCache();
assert.deepEqual(
  hydratedFacturas.items.map((item) => item.facturaId),
  ["FAC-SMOKE-1", "FAC-SMOKE-2", "FAC-SMOKE-3", "FAC-SMOKE-4"],
  "Facturas: refresh seguido de append pierde páginas intermedias al hidratar"
);
assert.equal(hydratedFacturas.page, 4, "Facturas: el cache pierde la página acumulada");
assert.equal(hydratedFacturas.nextPage, 5, "Facturas: el cache pierde la continuación acumulada");
assert.equal(
  hydratedFacturas.items[0].clienteNombre,
  "Cliente actualizado",
  "Facturas: el cache no conserva los valores frescos de la primera página"
);
clearFacturasCache();

console.log("continuous-scroll-smoke: ok");
