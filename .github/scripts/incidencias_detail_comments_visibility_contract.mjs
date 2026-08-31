import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getIncidenciasDetailComments,
  getDetailTemplateSnapshot,
  renderIncidenciasDetailModal,
} from "../../src/views/incidencias/incidencias.template.modal.js";

function baseDetail(extra = {}) {
  return {
    id: "INC-COMMENTS-VISIBLE-1",
    ticketId: "INC-COMMENTS-VISIBLE-1",
    subject: "Ticket con conversación",
    description: "Detalle de prueba",
    status: "closed",
    priority: "medium",
    category: "general",
    createdAt: "2026-08-23T21:49:00.000Z",
    updatedAt: "2026-08-24T20:59:00.000Z",
    attachments: [],
    comments: [],
    history: [],
    ...extra,
  };
}

const detail = baseDetail({
  comments: [
    {
      id: "com-1",
      type: "comment",
      body: "Primer comentario materializado",
      author: "Sergio Navas Tapia",
      createdAt: "2026-08-24T18:00:00.000Z",
    },
    {
      id: "com-2",
      type: "comment",
      body: "Segundo comentario materializado",
      author: "Cristián Ávila Luque",
      createdAt: "2026-08-24T19:00:00.000Z",
    },
  ],
  commentsCount: 2,
  history: [
    {
      id: "hist-1",
      type: "update",
      body: "Cambio de estado",
      createdAt: "2026-08-24T17:00:00.000Z",
    },
  ],
  historyCount: 1,
  meta: {
    detailWindowVersion: "2026.08.detail-window-truth.v1",
    comments: { total: 2, returned: 2, limit: 50, truncated: false },
    history: { total: 1, returned: 1, limit: 60, truncated: false },
    attachments: { total: 0, returned: 0, limit: 48, truncated: false },
  },
});

const comments = getIncidenciasDetailComments({ detail });
assert.equal(comments.length, 2);
assert.equal(comments[0].id, "com-2", "la conversación debe ordenarse de más reciente a más antigua");

const html = renderIncidenciasDetailModal({
  open: true,
  detail,
  admin: true,
  historyOpen: false,
});

assert.match(html, /data-modal-comments-slot="true"/);
assert.match(html, /data-comments-materialized="2"/);
assert.match(html, />Conversación</);
assert.match(html, /Primer comentario materializado/);
assert.match(html, /Segundo comentario materializado/);
assert.match(html, /2 comentarios/);
assert.match(html, /data-modal-files-slot="true"/);
assert.match(
  html,
  /data-modal-files-slot="true">[\s\S]*?data-modal-comments-slot="true"[\s\S]*?data-modal-current-files="true"/,
  "la conversación debe vivir dentro del slot que el reconciliador reemplaza al llegar el Detail remoto"
);
assert.doesNotMatch(
  html,
  /data-modal-history-slot="true"/,
  "el body normal no debe depender de abrir el modo Historial para materializar comentarios"
);

const aliases = getIncidenciasDetailComments({
  detail: baseDetail({
    notes: [
      {
        id: "note-1",
        message: "Comentario recibido mediante alias notes",
        author: "Cliente",
      },
    ],
  }),
});
assert.equal(aliases.length, 1);
assert.equal(aliases[0].body, "Comentario recibido mediante alias notes");

const timelineComments = getIncidenciasDetailComments({
  detail: baseDetail({
    timeline: [
      {
        id: "timeline-comment-1",
        kind: "comment",
        text: "Comentario materializado desde timeline",
        byName: "Soporte",
      },
      {
        id: "timeline-event-1",
        kind: "event",
        text: "Esto no es conversación",
      },
    ],
  }),
});
assert.equal(timelineComments.length, 1);
assert.equal(timelineComments[0].body, "Comentario materializado desde timeline");

const emptyHtml = renderIncidenciasDetailModal({
  open: true,
  detail: baseDetail(),
  admin: true,
  historyOpen: false,
});
assert.match(emptyHtml, /data-modal-comments-slot="true"/);
assert.match(emptyHtml, /No hay comentarios publicados en esta incidencia\./);

const snapshot = getDetailTemplateSnapshot();
assert.equal(snapshot.commentsUi?.alwaysMaterializedInTicketBody, true);
assert.equal(snapshot.commentsUi?.aliasCompatible, true);
assert.equal(snapshot.commentsUi?.timelineCommentCompatible, true);
assert.equal(snapshot.commentsUi?.patchesInsideExistingFilesSlot, true);
assert.equal(snapshot.commentsUi?.fullHistoryRemainsSeparate, true);
assert.equal(snapshot.policy?.commentsAlwaysVisibleInTicketBody, true);
assert.equal(snapshot.policy?.commentsPatchWithRemoteDetail, true);

const controller = await readFile(
  new URL("../../src/views/incidencias/index.impl.js", import.meta.url),
  "utf8"
);

assert.match(
  controller,
  /"\[data-modal-files-slot='true'\]"/,
  "el reconciliador debe seguir reemplazando el slot que contiene Conversación al hidratar el Detail remoto"
);
assert.match(
  controller,
  /detailModal\.detail\s*=\s*mergedDetail;/,
  "el GET remoto debe seguir convirtiéndose en la autoridad visible del modal"
);
assert.match(
  controller,
  /renderModals\([\s\S]*?immediate:\s*true/,
  "la hidratación remota debe reconciliar el modal inmediatamente"
);

console.log(
  "Incidencias Detail comments visibility: PASS · conversación siempre materializada · aliases/timeline · late remote Detail patch"
);
