import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  INCIDENCIAS_DETAIL_SHARED_VISUAL_CONTRACT,
  INCIDENCIAS_DETAIL_WINDOW_UI_VERSION,
  getDetailTemplateSnapshot,
  getIncidenciasDetailWindowUiState,
  renderIncidenciasDetailModal,
} from "../../src/views/incidencias/incidencias.template.modal.js";
import {
  INCIDENCIAS_DETAIL_STATE_VERSION,
  resolveConversationPolicy,
} from "../../src/features/incidencias-detail-state/index.js";

function sequence(prefix, count) {
  return Array.from({ length: count }, (_value, index) => ({
    id: `${prefix}-${index + 1}`,
    kind: prefix === "comment" ? "comment" : "update",
    message: `${prefix} ${index + 1}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  }));
}

function attachments(count) {
  return Array.from({ length: count }, (_value, index) => ({
    id: `att-${index + 1}`,
    attachmentId: `att-${index + 1}`,
    name: `archivo-${index + 1}.txt`,
    contentType: "text/plain",
    size: 100 + index,
  }));
}

function detail({ truncated = true } = {}) {
  const comments = sequence("comment", truncated ? 50 : 2);
  const history = sequence("history", truncated ? 60 : 3);
  const files = attachments(truncated ? 48 : 2);

  return {
    id: "INC-WINDOW-UI-1",
    ticketId: "INC-WINDOW-UI-1",
    subject: "Incidencia con historial largo",
    description: "Contrato visual de ventana acotada.",
    status: "open",
    priority: "medium",
    category: "general",
    displayName: "Usuario de prueba",
    email: "user@example.test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    comments,
    commentsCount: truncated ? 55 : comments.length,
    history,
    historyCount: truncated ? 65 : history.length,
    attachments: files,
    attachmentsCount: truncated ? 52 : files.length,
    meta: {
      detailWindowVersion: "2026.08.detail-window-truth.v1",
      comments: {
        total: truncated ? 55 : comments.length,
        returned: comments.length,
        limit: 50,
        truncated,
        hasMore: truncated,
        mode: "latest",
      },
      history: {
        total: truncated ? 65 : history.length,
        returned: history.length,
        limit: 60,
        truncated,
        hasMore: truncated,
        mode: "latest",
      },
      attachments: {
        total: truncated ? 52 : files.length,
        returned: files.length,
        limit: 48,
        truncated,
        hasMore: truncated,
        mode: "bounded",
      },
    },
  };
}

/* =========================================================
   STATE CONTRACT
========================================================= */

const longDetail = detail({ truncated: true });
const state = getIncidenciasDetailWindowUiState({
  open: true,
  detail: longDetail,
});

assert.equal(state.hasWindowContract, true);
assert.deepEqual(state.comments, {
  total: 55,
  returned: 50,
  truncated: true,
});
assert.deepEqual(state.history, {
  total: 65,
  returned: 60,
  truncated: true,
});
assert.deepEqual(state.timeline, {
  total: 120,
  returned: 110,
  truncated: true,
});
assert.deepEqual(state.attachments, {
  total: 52,
  returned: 48,
  truncated: true,
});
assert.equal(state.truncated, true);

/* =========================================================
   USER UPDATE TURN · BACKEND POLICY + LEGACY FALLBACK
========================================================= */

assert.match(
  INCIDENCIAS_DETAIL_STATE_VERSION,
  /backend-policy-fail-closed/
);

/* Backend policy wins over any client-side historical inference. */
{
  const policy = resolveConversationPolicy({
    userUpdatePolicy: {
      awaitingSupportResponse: true,
      lastUserUpdateAt: "2026-09-05T10:00:00.000Z",
    },
    comments: [{
      source: "support",
      createdAt: "2026-09-05T11:00:00.000Z",
    }],
  });

  assert.equal(policy.awaitingSupportResponse, true);
  assert.equal(policy.source, "backend");
}

/*
  Regresión del caso real: un comentario legacy sin source/role se reconoce
  como turno del usuario por su identidad estable.
*/
{
  const policy = resolveConversationPolicy({
    userId: "ON-USER-LEGACY",
    email: "legacy@example.test",
    comments: [{
      byUserId: "ON-USER-LEGACY",
      byEmail: "LEGACY@EXAMPLE.TEST",
      message: "Actualización legacy",
      createdAt: "2026-09-05T10:00:00.000Z",
    }],
  });

  assert.equal(policy.awaitingSupportResponse, true);
  assert.equal(policy.source, "history");
}

/* Una respuesta posterior del técnico libera el siguiente turno. */
{
  const policy = resolveConversationPolicy({
    userId: "ON-USER-LEGACY",
    email: "legacy@example.test",
    assignment: {
      technician: {
        userId: "ON-SUPPORT-1",
        email: "support@example.test",
      },
    },
    comments: [
      {
        byUserId: "ON-USER-LEGACY",
        createdAt: "2026-09-05T10:00:00.000Z",
        message: "Usuario",
      },
      {
        byUserId: "ON-SUPPORT-1",
        createdAt: "2026-09-05T10:05:00.000Z",
        message: "Soporte",
      },
    ],
  });

  assert.equal(policy.awaitingSupportResponse, false);
}

/*
  El primer frame de un usuario estándar debe cerrar el composer antes de
  hidratar la política; admin queda fuera. Un 409 canónico también fuerza el
  estado pendiente inmediatamente para cubrir carreras entre pestañas.
*/
{
  const source = readFileSync(
    new URL(
      "../../src/features/incidencias-detail-state/index.js",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(
    source,
    /if \(!root\.querySelector\(ADMIN\)\) \{[\s\S]*hideComposer\(root\);[\s\S]*ticketReviewState = "checking";[\s\S]*hydrate\(id, \{ force: false \}\)/
  );
  assert.match(
    source,
    /refreshAfterBlockedError\(root\)/
  );
  assert.match(
    source,
    /ya has enviado una actualización/
  );
}

/* =========================================================
   TICKET VIEW · TRUE ATTACHMENT TOTAL
========================================================= */

const ticketHtml = renderIncidenciasDetailModal({
  open: true,
  detail: longDetail,
  historyOpen: false,
});

assert.match(
  ticketHtml,
  new RegExp(`data-detail-window-ui-version="${INCIDENCIAS_DETAIL_WINDOW_UI_VERSION}"`)
);
assert.match(ticketHtml, /data-detail-window-truncated="true"/);
assert.match(
  ticketHtml,
  /class="incidencias-modal-history-jump-count"[^>]*>\s*120\s*<\/span>/,
  "el acceso a Historial debe anunciar el total real combinado"
);
assert.match(
  ticketHtml,
  /id="incidencias-modal-files-title">[\s\S]*?<\/h3>\s*<span>52 adjuntos · mostrando 48<\/span>/,
  "Documentos actuales debe explicar la ventana acotada"
);
assert.match(
  ticketHtml,
  /<span>Adjuntos<\/span>\s*<strong>\s*52\s*<\/strong>/,
  "la tarjeta meta de adjuntos debe mostrar el total real"
);

/*
  La frontera delega el chrome a .impl.js, pero el HTML final debe conservar
  exactamente las parejas V7 que protegen la autoridad visual transversal.
*/
for (const pair of [
  "incidencias-modal-root ui-detail-modal-root",
  "incidencias-modal-overlay ui-detail-modal-overlay",
  "incidencias-modal-panel ui-detail-modal-panel",
  "incidencias-modal-chip ui-detail-modal-chip",
  "incidencias-modal-body ui-detail-modal-body",
  "incidencias-modal-meta-grid ui-detail-modal-meta-grid",
]) {
  assert.ok(
    ticketHtml.includes(pair),
    `el render real debe conservar el alias visual compartido: ${pair}`
  );
}
assert.match(
  ticketHtml,
  /incidencias-modal-chip--status_open ui-detail-modal-chip--status_open/,
  "el modifier dinámico de chip debe conservar la autoridad V7 en el render real"
);
assert.ok(
  INCIDENCIAS_DETAIL_SHARED_VISUAL_CONTRACT.length >= 10,
  "la frontera estable debe declarar explícitamente el contrato visual delegado"
);

/* =========================================================
   HISTORY VIEW · TRUE ACTIVITY TOTAL
========================================================= */

const historyHtml = renderIncidenciasDetailModal({
  open: true,
  detail: longDetail,
  historyOpen: true,
});

assert.match(
  historyHtml,
  /id="incidencias-modal-history-title">[\s\S]*?<\/h3>\s*<span>120 registros · mostrando 110 recientes<\/span>/,
  "la vista Historial debe distinguir total real y ventana reciente"
);

/* =========================================================
   NON-TRUNCATED DETAIL REMAINS QUIET
========================================================= */

const shortDetail = detail({ truncated: false });
const shortHtml = renderIncidenciasDetailModal({
  open: true,
  detail: shortDetail,
  historyOpen: true,
});

assert.match(shortHtml, /data-detail-window-truncated="false"/);
assert.match(
  shortHtml,
  /id="incidencias-modal-history-title">[\s\S]*?<\/h3>\s*<span>5 registros<\/span>/
);
assert.doesNotMatch(shortHtml, /mostrando .* recientes/);

/* =========================================================
   SNAPSHOT
========================================================= */

const snapshot = getDetailTemplateSnapshot();
assert.equal(snapshot.detailWindowUi.truthfulTotals, true);
assert.equal(snapshot.detailWindowUi.explicitRecentWindow, true);
assert.equal(snapshot.detailWindowUi.addsPagination, false);
assert.equal(snapshot.policy.truthfulBoundedCollections, true);
assert.equal(snapshot.policy.noSyntheticTimelineEntries, true);
assert.deepEqual(
  snapshot.detailWindowUi.sharedVisualContract,
  INCIDENCIAS_DETAIL_SHARED_VISUAL_CONTRACT
);

console.log(
  "Incidencias Detail window UI OK · pending user composer fail-closed · backend policy authority · truthful bounded history · shared V7 contract"
);
