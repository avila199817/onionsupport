import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import Http from "../../src/core/http.js";
import {
  clearIncidenciasCache,
  loadIncidenciasPage,
  getIncidenciasApiSnapshot,
} from "../../src/views/incidencias/incidencias.api.js";

function ticket({
  id,
  status = "open",
  priority = "medium",
  subject = "Incidencia",
  description = "",
  email = "cliente@example.com",
} = {}) {
  return {
    ticketId: id,
    status,
    priority,
    subject,
    description,
    clientName: "Cliente prueba",
    clientEmail: email,
    updatedAt: "2026-08-31T18:00:00.000Z",
  };
}

function v2Response(items, {
  total = items.length,
  nextCursor = null,
  hasMore = Boolean(nextCursor),
} = {}) {
  return {
    schema: "onionsupport.tickets-list.response.v2",
    contractVersion: 2,
    items,
    count: items.length,
    rawCount: items.length,
    total,
    totalKnown: true,
    totalIsLowerBound: false,
    pagination: {
      mode: "cursor",
      nextCursor,
      hasMore,
      total,
      pageSize: 48,
    },
    meta: { responseContract: "v2" },
  };
}

const originalGet = Http.get;
const requests = [];
let nextResponse = v2Response([]);

Http.get = async (endpoint, options = {}) => {
  requests.push({ endpoint, options });
  return nextResponse;
};

try {
  clearIncidenciasCache();

  const universe = [
    ticket({
      id: "INC-OPEN",
      status: "open",
      subject: "Router de oficina",
    }),
    ticket({
      id: "INC-CLOSED",
      status: "closed",
      subject: "WhatsApp escritorio",
      description: "Problema resuelto",
    }),
    ticket({
      id: "INC-URGENT",
      status: "open",
      priority: "high",
      subject: "Servidor urgente",
    }),
  ];

  nextResponse = v2Response(universe);
  const firstPage = await loadIncidenciasPage({
    query: { pageMode: "cursor", limit: 48 },
  });

  assert.equal(firstPage.items.length, 3);
  assert.equal(requests.length, 1, "el universo inicial debe venir del backend");
  assert.equal(
    getIncidenciasApiSnapshot().hotListQuery.completeUniverse,
    true,
    "sin cursor + total completo debe habilitar la proyección exacta"
  );

  const closed = await loadIncidenciasPage({
    query: { pageMode: "cursor", limit: 48, closed: true },
  });
  assert.equal(requests.length, 1, "Cerradas debe resolverse sin otro round-trip");
  assert.equal(closed.localProjection, true);
  assert.deepEqual(closed.items.map((item) => item.ticketId), ["INC-CLOSED"]);

  const open = await loadIncidenciasPage({
    query: { pageMode: "cursor", limit: 48, closed: false },
  });
  assert.equal(requests.length, 1, "Abiertas debe resolverse sobre el mismo universo");
  assert.deepEqual(
    open.items.map((item) => item.ticketId).sort(),
    ["INC-OPEN", "INC-URGENT"].sort()
  );

  const urgent = await loadIncidenciasPage({
    query: { pageMode: "cursor", limit: 48, priority: "high" },
  });
  assert.equal(requests.length, 1, "Urgentes debe ser un filtro local O(n)");
  assert.deepEqual(urgent.items.map((item) => item.ticketId), ["INC-URGENT"]);

  const search = await loadIncidenciasPage({
    query: { pageMode: "cursor", limit: 48, q: "whatsapp" },
  });
  assert.equal(requests.length, 1, "search completo no debe esperar otra request");
  assert.deepEqual(search.items.map((item) => item.ticketId), ["INC-CLOSED"]);

  const combined = await loadIncidenciasPage({
    query: {
      pageMode: "cursor",
      limit: 48,
      closed: true,
      q: "problema",
    },
  });
  assert.equal(requests.length, 1);
  assert.deepEqual(combined.items.map((item) => item.ticketId), ["INC-CLOSED"]);

  /*
     Guard de verdad: si existe P2 el universo NO está completo y queda
     prohibido fabricar resultados definitivos desde la primera página.
  */
  clearIncidenciasCache();
  requests.length = 0;
  nextResponse = v2Response(
    [ticket({ id: "INC-P1" })],
    { total: 60, nextCursor: "CURSOR-P2", hasMore: true }
  );

  await loadIncidenciasPage({
    query: { pageMode: "cursor", limit: 48 },
  });
  assert.equal(
    getIncidenciasApiSnapshot().hotListQuery.completeUniverse,
    false,
    "un cursor debe desactivar el fast-path"
  );

  nextResponse = v2Response([
    ticket({ id: "INC-SERVER-CLOSED", status: "closed" }),
  ]);

  const serverClosed = await loadIncidenciasPage({
    query: { pageMode: "cursor", limit: 48, closed: true },
  });

  assert.equal(requests.length, 2, "dataset paginado debe consultar al servidor");
  assert.equal(serverClosed.localProjection, undefined);
  assert.deepEqual(
    serverClosed.items.map((item) => item.ticketId),
    ["INC-SERVER-CLOSED"]
  );

  const hotListSource = await readFile(
    new URL("../../src/views/incidencias/incidencias.hot-list.js", import.meta.url),
    "utf8"
  );
  const boundarySource = await readFile(
    new URL("../../src/views/incidencias/index.js", import.meta.url),
    "utf8"
  );

  for (const token of [
    "PERSISTENT SEARCH DOM ISLAND",
    "data-incidencias-search-input",
    "selectionStart",
    "selectionEnd",
    "setSelectionRange",
    "preventScroll",
    "transplantOwnedInput",
    "current.replaceWith(ownedInput)",
    "inputWasReplaced",
    "queueMicrotask",
    "internalRestore = true",
    "documentLike.activeElement === input",
    "pointerdown",
    "Tab",
    "Escape",
  ]) {
    assert.match(
      hotListSource,
      new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `hot-list debe preservar el contrato de isla DOM/caret: ${token}`
    );
  }

  assert.doesNotMatch(
    hotListSource,
    /setTimeout\s*\(|requestAnimationFrame\s*\(/u,
    "el hot path del search no debe programar timers ni frames para restaurar caret"
  );

  assert.doesNotMatch(
    hotListSource,
    /input\.value\s*=/u,
    "la capa de foco no puede reescribir el value del search"
  );

  const desiredIndex = hotListSource.indexOf("const desired = {");
  const focusIndex = hotListSource.indexOf("input.focus({ preventScroll: true });");
  assert.ok(desiredIndex >= 0 && focusIndex > desiredIndex,
    "la selección deseada debe congelarse ANTES de focus(), porque focusin puede observar caret=0");

  const inputHandlerStart = hotListSource.indexOf("function onInput(event)");
  const selectHandlerStart = hotListSource.indexOf("function onSelect(event)");
  const inputHandler = hotListSource.slice(inputHandlerStart, selectHandlerStart);
  assert.doesNotMatch(
    inputHandler,
    /focus\s*\(|setSelectionRange|scheduleReplacementRestore/u,
    "cada pulsación sólo puede capturar estado; nunca restaurar foco/caret"
  );

  assert.match(boundarySource, /installIncidenciasHotList/u);
  assert.match(boundarySource, /uninstallHotList/u);
  assert.match(boundarySource, /searchFocusAndCaretStableAcrossListReconciliation:\s*true/u);
  assert.match(boundarySource, /searchInputPersistentDomIsland:\s*true/u);
  assert.match(boundarySource, /keyboardHotPathNeverRestoresCaret:\s*true/u);
  assert.match(boundarySource, /replacementRestoreRunsBeforePaint:\s*true/u);
} finally {
  Http.get = originalGet;
  clearIncidenciasCache();
}

console.log(
  "Incidencias hot-list contract: PASS · snap filters/search · paginated truth guard · persistent search DOM island · zero caret work per keystroke"
);
