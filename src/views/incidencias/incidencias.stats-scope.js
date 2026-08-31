/* =========================================================
   Onion Support - Incidencias Stats Scope
   Archivo: /src/views/incidencias/incidencias.stats-scope.js

   TRUTHFUL UI · DOM ENHANCEMENT · ZERO HTTP

   La vista recibe facetas exactas de Abiertas/Cerradas/Urgentes para el
   universo de búsqueda activo. Adjuntos e Importe pueden seguir basándose
   en los tickets cargados mientras existe historial remoto pendiente.

   Este enhancement no inventa métricas ni añade consultas:
   - conserva el copy global de las facetas cuando son exactas;
   - etiqueta sólo las métricas agregadas parciales como "cargadas";
   - no toca valores, filtros, acciones, cursor, HTTP ni Cosmos.
========================================================= */

export const INCIDENCIAS_STATS_SCOPE_VERSION =
  "incidencias.stats-scope.v3.facet-aware";

const ROOT_SELECTOR = "[data-incidencias-scope='true']";

const COPY = Object.freeze({
  open: Object.freeze({
    completeLabel: "Abiertas",
    loadedLabel: "Abiertas cargadas",
    completeText: "Solicitudes activas, pendientes o en proceso.",
    loadedText: "Solicitudes activas entre las incidencias ya cargadas.",
  }),
  closed: Object.freeze({
    completeLabel: "Cerradas",
    loadedLabel: "Cerradas cargadas",
    completeText: "Casos resueltos o cerrados.",
    loadedText: "Casos cerrados entre las incidencias ya cargadas.",
  }),
  urgent: Object.freeze({
    completeLabel: "Urgentes",
    loadedLabel: "Urgentes cargadas",
    completeText: "Incidencias marcadas como urgentes o críticas.",
    loadedText: "Prioridades altas o urgentes entre las incidencias ya cargadas.",
  }),
  amount: Object.freeze({
    completeLabel: "Importe asociado",
    loadedLabel: "Importe cargado",
    completeText: "Ordenar incidencias de mayor a menor importe.",
    loadedText: "Suma asociada únicamente a las incidencias ya cargadas.",
  }),
});

function setText(node = null, value = "") {
  if (!node || node.textContent === value) return false;
  node.textContent = value;
  return true;
}

export function getIncidenciasStatsScopePresentation({
  partial = false,
  facetsExact = false,
} = {}) {
  const loaded = partial === true;
  const exactFacets = facetsExact === true;
  const facetKeys = new Set(["open", "closed", "urgent"]);

  return Object.freeze({
    scope: loaded ? "loaded" : "complete",
    partial: loaded,
    facetsExact: exactFacets,
    cards: Object.freeze(
      Object.fromEntries(
        Object.entries(COPY).map(([key, copy]) => {
          const useLoadedCopy =
            loaded && !(exactFacets && facetKeys.has(key));
          return [
            key,
            Object.freeze({
              scope: useLoadedCopy ? "loaded" : "complete",
              label: useLoadedCopy ? copy.loadedLabel : copy.completeLabel,
              text: useLoadedCopy ? copy.loadedText : copy.completeText,
            }),
          ];
        })
      )
    ),
    attachmentsSuffix: loaded ? " en cargadas" : "",
  });
}

export function getIncidenciasStatsScopeSnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_STATS_SCOPE_VERSION,
    sourceOfTruth: "data-total-greater-than-items",
    policy: Object.freeze({
      zeroHttp: true,
      zeroMetricRecalculation: true,
      loadedMetricsExplicitWhenPartial: true,
      exactFacetCountsRemainGlobal: true,
      attributeTransitionsObserved: true,
      canonicalCopyRestoredWhenComplete: true,
      valuesRemainControllerOwned: true,
      filtersRemainControllerOwned: true,
    }),
  });
}

export function applyIncidenciasStatsScope(root = null) {
  if (!root?.querySelector) return false;

  const partial = root.dataset?.totalGreaterThanItems === "true";
  const facetsExact = root.dataset?.filterFacetsExact === "true";
  const presentation = getIncidenciasStatsScopePresentation({
    partial,
    facetsExact,
  });

  root.dataset.statsScope = presentation.scope;

  for (const key of ["open", "closed", "urgent", "amount"]) {
    const card = root.querySelector(`[data-stat="${key}"]`);
    if (!card) continue;

    card.dataset.statScope = presentation.cards[key].scope;
    setText(
      card.querySelector(".incidencias-stat-label"),
      presentation.cards[key].label
    );
    setText(
      card.querySelector(".incidencias-stat-text"),
      presentation.cards[key].text
    );
  }

  const attachments = root.querySelector('[data-meta="attachments"] span:last-child');
  if (attachments) {
    const current = String(attachments.textContent || "")
      .replace(/\s+en cargadas$/u, "")
      .trim();
    const desired = `${current}${presentation.attachmentsSuffix}`;
    setText(attachments, desired);
  }

  return true;
}

export function installIncidenciasStatsScope({
  host = null,
  document: documentLike = host?.ownerDocument ||
    (typeof document !== "undefined" ? document : null),
} = {}) {
  if (!documentLike?.querySelector) return () => false;

  let destroyed = false;
  let queued = false;

  const scopeRoot = () =>
    host?.querySelector?.(ROOT_SELECTOR) || documentLike.querySelector(ROOT_SELECTOR);

  const apply = () => {
    queued = false;
    if (destroyed) return false;
    return applyIncidenciasStatsScope(scopeRoot());
  };

  const schedule = () => {
    if (destroyed || queued) return false;
    queued = true;

    if (typeof queueMicrotask === "function") queueMicrotask(apply);
    else Promise.resolve().then(apply);

    return true;
  };

  const MutationObserverCtor =
    documentLike.defaultView?.MutationObserver ||
    (typeof MutationObserver !== "undefined" ? MutationObserver : null);

  const observer = MutationObserverCtor
    ? new MutationObserverCtor(schedule)
    : null;

  observer?.observe?.(host || documentLike.body || documentLike.documentElement, {
    attributes: true,
    attributeFilter: [
      "data-total-greater-than-items",
      "data-filter-facets-exact",
    ],
    childList: true,
    subtree: true,
  });

  apply();

  return function uninstallIncidenciasStatsScope() {
    if (destroyed) return false;
    destroyed = true;
    observer?.disconnect?.();
    return true;
  };
}

export default installIncidenciasStatsScope;
