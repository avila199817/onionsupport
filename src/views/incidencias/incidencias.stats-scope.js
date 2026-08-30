/* =========================================================
   Onion Support - Incidencias Stats Scope
   Archivo: /src/views/incidencias/incidencias.stats-scope.js

   TRUTHFUL UI · DOM ENHANCEMENT · ZERO HTTP

   La vista calcula hoy Abiertas/Cerradas/Urgentes, Adjuntos e Importe sobre
   los tickets que ya están cargados en memoria. Mientras existe historial
   remoto pendiente, esas cifras NO son globales y no deben parecerlo.

   Este enhancement no inventa métricas ni añade consultas:
   - si total > items cargados, etiqueta esas métricas como "cargadas";
   - cuando el feed está completo, restaura el copy canónico;
   - no toca valores, filtros, acciones, cursor, HTTP ni Cosmos.
========================================================= */

export const INCIDENCIAS_STATS_SCOPE_VERSION =
  "incidencias.stats-scope.v1.truthful-loaded-metrics";

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

export function getIncidenciasStatsScopePresentation({ partial = false } = {}) {
  const loaded = partial === true;

  return Object.freeze({
    scope: loaded ? "loaded" : "complete",
    partial: loaded,
    cards: Object.freeze(
      Object.fromEntries(
        Object.entries(COPY).map(([key, copy]) => [
          key,
          Object.freeze({
            label: loaded ? copy.loadedLabel : copy.completeLabel,
            text: loaded ? copy.loadedText : copy.completeText,
          }),
        ])
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
      canonicalCopyRestoredWhenComplete: true,
      valuesRemainControllerOwned: true,
      filtersRemainControllerOwned: true,
    }),
  });
}

export function applyIncidenciasStatsScope(root = null) {
  if (!root?.querySelector) return false;

  const partial = root.dataset?.totalGreaterThanItems === "true";
  const presentation = getIncidenciasStatsScopePresentation({ partial });

  root.dataset.statsScope = presentation.scope;

  for (const key of ["open", "closed", "urgent", "amount"]) {
    const card = root.querySelector(`[data-stat="${key}"]`);
    if (!card) continue;

    card.dataset.statScope = presentation.scope;
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
