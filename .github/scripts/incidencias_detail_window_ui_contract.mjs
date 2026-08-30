import assert from "node:assert/strict";

import {
  INCIDENCIAS_DETAIL_WINDOW_UI_VERSION,
  getDetailTemplateSnapshot,
  getIncidenciasDetailWindowUiState,
  renderIncidenciasDetailModal,
} from "../../src/views/incidencias/incidencias.template.modal.js";

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

console.log(
  "Incidencias Detail window UI OK · truthful history/attachment totals · explicit recent window · no pagination"
);
