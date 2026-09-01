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
    subject: "Ticket con seguimiento",
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
      author: "Cliente Uno",
      createdAt: "2026-08-24T18:00:00.000Z",
    },
    {
      id: "com-2",
      type: "comment",
      body: "Segundo comentario materializado",
      author: "Soporte",
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
assert.equal(
  comments[0].id,
  "com-2",
  "Seguimiento debe ordenar comentarios de más reciente a más antiguo"
);

const html = renderIncidenciasDetailModal({
  open: true,
  detail,
  admin: true,
  historyOpen: false,
});

assert.match(html, /data-description-comments="true"/);
assert.match(html, /class="incidencias-modal-description-thread"/);
assert.match(html, /class="incidencias-modal-description-comments"/);
assert.match(html, /class="incidencias-modal-description-comment"/);
assert.match(html, /data-description-comment="true"/);
assert.match(html, />Seguimiento</);
assert.match(html, /Primer comentario materializado/);
assert.match(html, /Segundo comentario materializado/);
assert.match(html, /2 comentarios/);

assert.match(
  html,
  /incidencias-modal-description-section[\s\S]*?data-description-comments="true"[\s\S]*?<\/section>/,
  "Seguimiento debe vivir dentro de la sección canónica Descripción"
);

assert.doesNotMatch(
  html,
  /data-modal-files-slot="true">[\s\S]*?data-description-comments="true"/,
  "Seguimiento no puede volver a vivir dentro del slot de documentos"
);

const followupMatch = html.match(
  /<section\s+class="incidencias-modal-description-thread"[\s\S]*?<\/section>/
);
assert.ok(followupMatch, "debe existir el bloque canónico de Seguimiento");
assert.doesNotMatch(followupMatch[0], /<img\b/i);
assert.doesNotMatch(followupMatch[0], /incidencias-modal-image-thumb/);
assert.doesNotMatch(followupMatch[0], /incidencias-modal-attachment-card/);
assert.doesNotMatch(followupMatch[0], /incidencias-timeline-card/);

assert.doesNotMatch(
  html,
  /data-modal-history-slot="true"/,
  "el body normal no debe depender de abrir Historial para mostrar comentarios"
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
assert.doesNotMatch(
  emptyHtml,
  /data-description-comments="true"/,
  "sin comentarios confirmados no se debe fabricar una conversación vacía"
);

const snapshot = getDetailTemplateSnapshot();
assert.equal(snapshot.commentsUi?.materializesWhenAvailableInTicketBody, true);
assert.equal(snapshot.commentsUi?.canonicalFollowupMarkup, true);
assert.equal(snapshot.commentsUi?.aliasCompatible, true);
assert.equal(snapshot.commentsUi?.timelineCommentCompatible, true);
assert.equal(snapshot.commentsUi?.liveSyncCompatible, true);
assert.equal(snapshot.commentsUi?.followupAvatarCompatible, true);
assert.equal(snapshot.commentsUi?.noFilesSlotCoupling, true);
assert.equal(snapshot.commentsUi?.noAttachmentMarkupInConversation, true);
assert.equal(snapshot.commentsUi?.fullHistoryRemainsSeparate, true);
assert.equal(snapshot.policy?.commentsAlwaysVisibleWhenMaterialized, true);
assert.equal(snapshot.policy?.commentsUseCanonicalFollowupSystem, true);
assert.equal(snapshot.policy?.commentsNeverShareAttachmentSlot, true);

const liveSync = await readFile(
  new URL(
    "../../src/features/incidencias-detail-live-sync/index.js",
    import.meta.url
  ),
  "utf8"
);
const avatars = await readFile(
  new URL(
    "../../src/features/incidencias-followup-avatars/index.js",
    import.meta.url
  ),
  "utf8"
);
const interactions = await readFile(
  new URL(
    "../../src/css/compositions/private-admin-interactions.css",
    import.meta.url
  ),
  "utf8"
);
const controller = await readFile(
  new URL("../../src/views/incidencias/index.impl.js", import.meta.url),
  "utf8"
);

assert.match(liveSync, /COMMENT_THREAD\s*=\s*"\[data-description-comments='true'\]"/);
assert.match(liveSync, /incidencias-modal-description-comment/);
assert.match(avatars, /incidencias-modal-description-comment-head/);
assert.match(interactions, /\.incidencias-modal-description-thread\s*\{/);
assert.match(interactions, /\.incidencias-modal-description-comment\s*\{/);
assert.match(
  controller,
  /"\.incidencias-modal-description-section"/,
  "la hidratación autoritativa debe reemplazar Descripción + Seguimiento como una unidad"
);
assert.match(
  controller,
  /detailModal\.detail\s*=\s*mergedDetail;/,
  "el GET remoto debe seguir siendo la autoridad visible del modal"
);

console.log(
  "Incidencias Detail comments: PASS · Seguimiento canónico · avatars/live-sync compatibles · adjuntos aislados"
);
