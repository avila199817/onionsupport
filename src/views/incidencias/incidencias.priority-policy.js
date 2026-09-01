/* =========================================================
   Onion Support - Incidencias Priority Policy

   SINGLE PRIORITY FACET AUTHORITY · 2026-09-01

   Regla de producto:
   - la faceta visual "Urgentes" debe representar exactamente el mismo
     universo que consulta el backend de listado;
   - ese contrato productivo es priority=high;
   - urgent / critical / p0 son aliases legacy de high, no prioridades
     editables independientes;

   Motivo:
   el frontend y el backend deben resolver el mismo conjunto de aliases para
   que KPI, filtro y filas mantengan una única verdad.
========================================================= */

"use strict";

export const INCIDENCIAS_PRIORITY_POLICY_VERSION =
  "incidencias.priority-policy.v2-three-level-canonical";

export const INCIDENCIAS_URGENT_FACET_SERVER_PRIORITY = "high";

export const INCIDENCIAS_HIGH_PRIORITY_KEYS = Object.freeze([
  "high",
  "alta",
  "p1",
  "urgent",
  "urgente",
  "critical",
  "critica",
  "critico",
  "p0",
]);

const HIGH_PRIORITY_KEYS = new Set(INCIDENCIAS_HIGH_PRIORITY_KEYS);

export function normalizeIncidenciasPriorityKey(value = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es-ES")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

export function incidenciaPriorityValue(item = {}) {
  const source =
    item && typeof item === "object" && !Array.isArray(item)
      ? item
      : {};

  return normalizeIncidenciasPriorityKey(
    source.priority ||
    source.prioridad ||
    source.severity ||
    source.priorityKey ||
    "medium"
  );
}

export function isIncidenciasUrgentFacetPriority(value = "") {
  return HIGH_PRIORITY_KEYS.has(
    normalizeIncidenciasPriorityKey(value)
  );
}

export function isIncidenciasUrgentFacetItem(item = {}) {
  return isIncidenciasUrgentFacetPriority(
    incidenciaPriorityValue(item)
  );
}

export function matchesIncidenciasPriorityQuery(
  item = {},
  requested = ""
) {
  const query = normalizeIncidenciasPriorityKey(requested);
  if (!query) return true;

  const priority = incidenciaPriorityValue(item);

  if (HIGH_PRIORITY_KEYS.has(query)) {
    return HIGH_PRIORITY_KEYS.has(priority);
  }

  return priority === query;
}

export function getIncidenciasPriorityPolicySnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_PRIORITY_POLICY_VERSION,
    urgentFacetServerPriority: INCIDENCIAS_URGENT_FACET_SERVER_PRIORITY,
    urgentFacetAliases: INCIDENCIAS_HIGH_PRIORITY_KEYS,
    urgentFacetMatchesServerExactly: true,
    legacyUrgentAndCriticalCanonicalizeToHigh: true,
  });
}

export default Object.freeze({
  version: INCIDENCIAS_PRIORITY_POLICY_VERSION,
  urgentFacetServerPriority: INCIDENCIAS_URGENT_FACET_SERVER_PRIORITY,
  normalize: normalizeIncidenciasPriorityKey,
  matchesUrgentFacet: isIncidenciasUrgentFacetPriority,
  matchesPriorityQuery: matchesIncidenciasPriorityQuery,
  snapshot: getIncidenciasPriorityPolicySnapshot,
});
