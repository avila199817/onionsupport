import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import Http from "../../src/core/http.js";
import {
  clearIncidenciasCache,
  createIncidencia,
  fetchIncidenciasRequest,
  listIncidencias,
  loadIncidenciasPage,
  normalizeIncidenciasListResponse,
} from "../../src/views/incidencias/incidencias.api.js";
import {
  searchFacturaIncidencias,
} from "../../src/views/facturas/facturas.api.base.js";

const ticket = (ticketId, updatedAt = "2026-08-28T10:00:00.000Z") => ({
  ticketId,
  subject: `Incidencia ${ticketId}`,
  status: "open",
  priority: "medium",
  updatedAt,
});

const originalGet = Http.get;
const originalPost = Http.post;
const requests = [];
let nextError = null;
let nextResponse = {
  schema: "onionsupport.tickets-list.response.v2",
  contractVersion: 2,
  items: [],
  count: 0,
  rawCount: 0,
  total: 0,
  totalKnown: true,
  totalIsLowerBound: false,
  pagination: {
    mode: "cursor",
    nextCursor: null,
    hasMore: false,
    total: 0,
    pageSize: 48,
  },
  meta: { responseContract: "v2" },
};

Http.get = async (endpoint, options = {}) => {
  requests.push({ endpoint, options });
  if (nextError) throw nextError;
  return nextResponse;
};

try {
  await fetchIncidenciasRequest({
    query: { cursor: "CURSOR-P2", status: "closed", q: "impresora" },
  });
  assert.equal(requests.at(-1).endpoint, "/api/tickets");
  assert.deepEqual(
    {
      responseContract: requests.at(-1).options.query.responseContract,
      cursor: requests.at(-1).options.query.cursor,
      status: requests.at(-1).options.query.status,
      q: requests.at(-1).options.query.q,
      limit: requests.at(-1).options.query.limit,
    },
    {
      responseContract: "v2",
      cursor: "CURSOR-P2",
      status: "closed",
      q: "impresora",
      limit: 48,
    },
    "la query canónica debe negociar v2 sin perder cursor ni filtros"
  );
  assert.equal(
    requests.at(-1).options.headers,
    undefined,
    "el listado no debe introducir un Accept privado"
  );

  await fetchIncidenciasRequest({ responseContract: "v1" });
  assert.equal(
    requests.at(-1).options.query.responseContract,
    "v1",
    "el override v1 de primer nivel debe seguir disponible"
  );

  await fetchIncidenciasRequest({ query: { responseContract: "v1" } });
  assert.equal(
    requests.at(-1).options.query.responseContract,
    "v1",
    "el override v1 dentro de query debe ganar al default v2"
  );

  const meta = {
    requestId: "req-v2",
    responseContract: "v2",
    responseContractVersion: "tickets.list.response-contract.v2",
    rowProjectionVersion: "tickets.list.row-query-projection.v1",
  };
  const summary = { open: 70, closed: 50 };
  const v2 = normalizeIncidenciasListResponse({
    contractVersion: 2,
    schema: "onionsupport.tickets-list.response.v2",
    items: [ticket("INC-V2-1")],
    count: 1,
    total: 120,
    totalKnown: false,
    totalIsLowerBound: true,
    pagination: {
      mode: "cursor",
      nextCursor: "NEXT-V2",
      hasMore: true,
      total: null,
      pageSize: 48,
    },
    meta,
    summary,
  });

  assert.deepEqual(v2.items.map((item) => item.ticketId), ["INC-V2-1"]);
  assert.deepEqual(
    {
      rawCount: v2.rawCount,
      count: v2.count,
      total: v2.total,
      paginationTotal: v2.pagination.total,
      nextCursor: v2.nextCursor,
      hasMore: v2.hasMore,
      meta: v2.meta,
      summary: v2.summary,
      schema: v2.schema,
      contractVersion: v2.contractVersion,
      responseContract: v2.responseContract,
      totalKnown: v2.totalKnown,
      totalIsLowerBound: v2.totalIsLowerBound,
    },
    {
      rawCount: 1,
      count: 1,
      total: 120,
      paginationTotal: null,
      nextCursor: "NEXT-V2",
      hasMore: true,
      meta,
      summary,
      schema: "onionsupport.tickets-list.response.v2",
      contractVersion: 2,
      responseContract: "v2",
      totalKnown: false,
      totalIsLowerBound: true,
    },
    "v2 debe conservar el envelope y el total desconocido de pagination"
  );

  const emptyV2 = normalizeIncidenciasListResponse({
    contractVersion: 2,
    schema: "onionsupport.tickets-list.response.v2",
    items: [],
    rawCount: 0,
    count: 0,
    total: 0,
    totalKnown: true,
    totalIsLowerBound: false,
    pagination: { nextCursor: null, hasMore: false, total: 0, pageSize: 48 },
    meta: { responseContract: "v2" },
  });
  assert.equal(emptyV2.items.length, 0);
  assert.equal(emptyV2.hasMore, false);
  assert.equal(emptyV2.total, 0);

  const duplicateIdentityPayloadV2 = {
    contractVersion: 2,
    schema: "onionsupport.tickets-list.response.v2",
    items: [
      ticket("INC-DUPLICATE", "2026-08-28T09:00:00.000Z"),
      ticket("INC-DUPLICATE", "2026-08-28T10:00:00.000Z"),
      ticket("INC-SECOND", "2026-08-28T08:00:00.000Z"),
    ],
    rawCount: 3,
    count: 3,
    total: 3,
    totalKnown: true,
    totalIsLowerBound: false,
    pagination: {
      mode: "cursor",
      nextCursor: "",
      hasMore: false,
      total: 3,
      pageSize: 48,
    },
  };
  const duplicateIdentityV2 = normalizeIncidenciasListResponse(
    duplicateIdentityPayloadV2
  );
  assert.equal(duplicateIdentityV2.rawCount, 3);
  assert.equal(duplicateIdentityV2.count, 2);
  assert.equal(duplicateIdentityV2.total, 2);
  assert.equal(duplicateIdentityV2.pagination.total, 2);
  assert.equal(duplicateIdentityV2.canonicalIdentityDuplicatesCollapsed, 1);

  const duplicateIdentityWithoutPaginationTotalV2 = normalizeIncidenciasListResponse({
    ...duplicateIdentityPayloadV2,
    pagination: {
      hasMore: false,
      nextCursor: null,
    },
  });

  assert.equal(duplicateIdentityWithoutPaginationTotalV2.count, 2);
  assert.equal(duplicateIdentityWithoutPaginationTotalV2.total, 2);
  assert.equal(duplicateIdentityWithoutPaginationTotalV2.pagination.total, 2);
  assert.deepEqual(
    duplicateIdentityV2.items.map((item) => item.ticketId).sort(),
    ["INC-DUPLICATE", "INC-SECOND"],
    "una versión legacy con el mismo ticketId no puede inflar el total canónico"
  );

  const v1Rows = normalizeIncidenciasListResponse({
    responseContract: "v1",
    rows: [ticket("INC-V1-ROWS")],
    totalCount: 1,
    pagination: { hasMore: "false", nextCursor: "" },
  });
  assert.deepEqual(v1Rows.items.map((item) => item.ticketId), ["INC-V1-ROWS"]);
  assert.equal(v1Rows.responseContract, "v1");
  assert.equal(v1Rows.hasMore, false, "hasMore='false' no debe crear una página fantasma");

  const v1TotalFloor = normalizeIncidenciasListResponse({
    responseContract: "v1",
    rows: [ticket("INC-V1-TOTAL-FLOOR")],
    total: 0,
    pagination: { total: 0 },
  });
  assert.equal(
    v1TotalFloor.total,
    1,
    "el fallback v1 debe conservar el floor histórico items.length"
  );
  assert.equal(
    v1TotalFloor.pagination.total,
    1,
    "pagination.total v1 debe conservar el mismo floor histórico"
  );

  const v1NestedCursor = normalizeIncidenciasListResponse({
    responseContract: "v1",
    nextCursor: "",
    rows: [ticket("INC-V1-NESTED-CURSOR")],
    pagination: { nextCursor: "V1-NEXT", hasMore: true },
  });
  assert.equal(v1NestedCursor.nextCursor, "V1-NEXT");
  assert.equal(v1NestedCursor.hasMore, true);

  const v1NestedPagination = normalizeIncidenciasListResponse({
    responseContract: "v1",
    rows: [ticket("INC-V1-NESTED-PAGINATION")],
    pagination: {},
    data: { pagination: { nextCursor: "V1-DATA-NEXT", hasMore: true } },
  });
  assert.equal(v1NestedPagination.nextCursor, "V1-DATA-NEXT");
  assert.equal(v1NestedPagination.hasMore, true);

  const v1RootPaginationFallback = normalizeIncidenciasListResponse({
    responseContract: "v1",
    rows: [ticket("INC-V1-ROOT-PAGINATION-FALLBACK")],
    pagination: { mode: "cursor", nextCursor: "", hasMore: false },
    data: {
      pagination: { nextCursor: "V1-DATA-P2", hasMore: true, total: 2 },
    },
  });
  assert.equal(v1RootPaginationFallback.nextCursor, "V1-DATA-P2");
  assert.equal(v1RootPaginationFallback.hasMore, true);
  assert.equal(v1RootPaginationFallback.pagination.nextCursor, "V1-DATA-P2");
  assert.equal(v1RootPaginationFallback.pagination.total, 2);

  const v1NestedTotal = normalizeIncidenciasListResponse({
    responseContract: "v1",
    rows: [ticket("INC-V1-NESTED-TOTAL")],
    total: "",
    pagination: { total: 3 },
  });
  assert.equal(v1NestedTotal.total, 3);
  assert.equal(v1NestedTotal.pagination.total, 3);

  for (const [alias, id] of [
    ["tickets", "INC-V1-TICKETS"],
    ["incidencias", "INC-V1-INCIDENCIAS"],
    ["results", "INC-V1-RESULTS"],
  ]) {
    const fallback = normalizeIncidenciasListResponse({ [alias]: [ticket(id)] });
    assert.deepEqual(
      fallback.items.map((item) => item.ticketId),
      [id],
      `el alias v1 ${alias} debe conservarse`
    );
  }

  const unknownTotal = normalizeIncidenciasListResponse({
    schema: "onionsupport.tickets-list.response.v2",
    contractVersion: 2,
    items: [ticket("INC-UNKNOWN")],
    count: 1,
    rawCount: 1,
    total: null,
    totalKnown: false,
    totalIsLowerBound: false,
    pagination: { total: null, hasMore: false, nextCursor: null },
    meta: { responseContract: "v2" },
  });
  assert.equal(unknownTotal.total, null);
  assert.equal(unknownTotal.pagination.total, null);
  assert.equal(unknownTotal.totalKnown, false);

  const stringFalse = normalizeIncidenciasListResponse({
    schema: "onionsupport.tickets-list.response.v2",
    contractVersion: 2,
    items: [ticket("INC-STRING-FALSE")],
    hasMore: "false",
    pagination: { hasMore: "true", nextCursor: "" },
    meta: { responseContract: "v2" },
  });
  assert.equal(
    stringFalse.hasMore,
    false,
    "sólo el booleano true o un cursor opaco pueden confirmar continuación"
  );

  for (const invalidCursor of [false, 0, { token: "x" }, ["x"]]) {
    const invalidContinuation = normalizeIncidenciasListResponse({
      schema: "onionsupport.tickets-list.response.v2",
      contractVersion: 2,
      items: [ticket("INC-INVALID-CURSOR")],
      hasMore: false,
      nextCursor: invalidCursor,
      pagination: { hasMore: false, nextCursor: invalidCursor, total: null },
      meta: { responseContract: "v2" },
    });
    assert.equal(invalidContinuation.nextCursor, "");
    assert.equal(
      invalidContinuation.hasMore,
      false,
      "un cursor no-string no debe activar el scroll remoto"
    );
  }

  nextResponse = {
    schema: "onionsupport.tickets-list.response.v2",
    contractVersion: 2,
    items: [ticket("INC-P2", "2026-08-27T10:00:00.000Z")],
    count: 1,
    rawCount: 1,
    total: 96,
    totalKnown: false,
    totalIsLowerBound: true,
    pagination: {
      mode: "cursor",
      nextCursor: "CURSOR-P3",
      hasMore: false,
      total: null,
      pageSize: 48,
    },
    meta: { responseContract: "v2" },
  };
  const p2 = await loadIncidenciasPage({
    query: { cursor: "CURSOR-P2", closed: true },
  });
  assert.equal(requests.at(-1).options.query.responseContract, "v2");
  assert.equal(requests.at(-1).options.query.pageMode, "cursor");
  assert.equal(requests.at(-1).options.query.cursor, "CURSOR-P2");
  assert.equal(requests.at(-1).options.query.closed, true);
  assert.deepEqual(p2.items.map((item) => item.ticketId), ["INC-P2"]);
  assert.equal(p2.nextCursor, "CURSOR-P3");
  assert.equal(p2.hasMore, true, "un cursor confirma P3 aunque hasMore sea false");

  nextResponse = {
    schema: "onionsupport.tickets-list.response.v2",
    contractVersion: 2,
    items: [ticket("INC-LIST-V2")],
    rawCount: 1,
    count: 1,
    total: 300,
    totalKnown: false,
    totalIsLowerBound: true,
    pagination: {
      mode: "cursor",
      nextCursor: "CURSOR-LIST-P2",
      hasMore: true,
      total: null,
      pageSize: 48,
    },
    meta: { source: "listIncidencias", responseContract: "v2" },
    summary: { total: 300 },
  };
  const cachedBoundary = await listIncidencias({ force: true, cache: false });
  assert.deepEqual(cachedBoundary.items.map((item) => item.ticketId), ["INC-LIST-V2"]);
  assert.equal(cachedBoundary.total, 300);
  assert.equal(cachedBoundary.pagination.total, null);
  assert.equal(cachedBoundary.totalKnown, false);
  assert.equal(cachedBoundary.totalIsLowerBound, true);
  assert.deepEqual(cachedBoundary.meta, {
    source: "listIncidencias",
    responseContract: "v2",
  });
  assert.deepEqual(cachedBoundary.summary, { total: 300 });

  const requestsBeforeCacheHit = requests.length;
  const cacheHit = await listIncidencias();
  assert.equal(requests.length, requestsBeforeCacheHit, "el segundo listado debe usar cache");
  assert.equal(cacheHit.cached, true);
  assert.equal(cacheHit.total, 300);
  assert.equal(cacheHit.nextCursor, "CURSOR-LIST-P2");
  assert.equal(cacheHit.hasMore, true);
  assert.equal(cacheHit.pagination.total, null);
  assert.equal(cacheHit.totalKnown, false);
  assert.equal(cacheHit.totalIsLowerBound, true);
  assert.deepEqual(cacheHit.meta, {
    source: "listIncidencias",
    responseContract: "v2",
  });
  assert.deepEqual(cacheHit.summary, { total: 300 });

  nextError = new Error("offline-same-list-context");
  const matchingStale = await listIncidencias({ force: true });
  assert.equal(matchingStale.stale, true);
  assert.equal(matchingStale.ok, false);
  assert.equal(matchingStale.success, false);
  assert.equal(matchingStale.nextCursor, "CURSOR-LIST-P2");
  assert.equal(matchingStale.pagination.total, null);
  nextError = null;

  nextError = new Error("offline-different-list-context");
  await assert.rejects(
    listIncidencias({
      force: true,
      responseContract: "v1",
      query: { status: "closed" },
    }),
    /offline-different-list-context/u,
    "un fallo de otro contrato/filtro no debe devolver stale del contexto previo"
  );
  nextError = null;

  Http.post = async () => ({ ticket: ticket("INC-CREATED") });
  await createIncidencia({
    subject: "Incidencia creada",
    description: "Prueba de invalidación de metadata cacheada",
  });
  const requestsBeforeMutatedCache = requests.length;
  const mutatedCache = await listIncidencias();
  assert.equal(requests.length, requestsBeforeMutatedCache);
  assert.equal(mutatedCache.cached, true);
  assert.equal(mutatedCache.items.length, 2);
  assert.equal(mutatedCache.count, 2);
  assert.equal(mutatedCache.rawCount, 2);
  assert.equal(mutatedCache.nextCursor, undefined);
  assert.equal(mutatedCache.hasMore, undefined);

  assert.throws(
    () => normalizeIncidenciasListResponse({
      schema: "onionsupport.tickets-list.response.v2",
      contractVersion: 2,
      rows: [ticket("INC-MALFORMED")],
      meta: { responseContract: "v2" },
    }),
    (error) => error?.code === "INCIDENCIAS_LIST_V2_ITEMS_REQUIRED",
    "un envelope v2 sin items[] debe fallar cerrado"
  );

  nextResponse = {
    schema: "onionsupport.tickets-list.response.v2",
    contractVersion: 2,
    items: [ticket("INC-FAC-1")],
    meta: { responseContract: "v2" },
  };
  const linked = await searchFacturaIncidencias({
    clienteId: "CLI-1",
    q: "router",
  });
  assert.equal(requests.at(-1).endpoint, "/api/tickets");
  assert.equal(requests.at(-1).options.query.responseContract, "v2");
  assert.equal(requests.at(-1).options.query.clienteId, "CLI-1");
  assert.equal(requests.at(-1).options.query.q, "router");
  assert.equal(linked.length, 1);

  await searchFacturaIncidencias({ responseContract: "v1" });
  assert.equal(
    requests.at(-1).options.query.responseContract,
    "v1",
    "la búsqueda ancilar de Facturas debe conservar rollback explícito a v1"
  );

  const apiSource = await readFile(
    new URL("../../src/views/incidencias/incidencias.api.impl.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(
    apiSource.slice(
      apiSource.indexOf("export async function fetchIncidenciasRequest"),
      apiSource.indexOf("export async function loadIncidenciasPage")
    ),
    /headers\s*:/u,
    "la negociación del listado debe permanecer en query, no en Accept"
  );
} finally {
  Http.get = originalGet;
  Http.post = originalPost;
  clearIncidenciasCache();
}

console.log(
  "Incidencias list response v2 contract: PASS · canonical query + v1 fallback + strict envelope + cursor P2"
);
