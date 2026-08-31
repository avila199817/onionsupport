import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  DETAIL_ACTIONS,
  getDetailTemplateSnapshot,
  renderIncidenciasDetailModal,
} from "../../src/views/incidencias/incidencias.template.modal.js";

function detail() {
  return {
    id: "INC-DELETE-CONFIRM-1",
    ticketId: "INC-DELETE-CONFIRM-1",
    subject: "Contrato de borrado de adjuntos",
    description: "El navegador no debe ser dueño de la confirmación.",
    status: "open",
    priority: "medium",
    category: "general",
    attachments: [
      {
        id: "att-delete-1",
        attachmentId: "att-delete-1",
        name: 'informe <final> "seguro".txt',
        contentType: "text/plain",
        size: 128,
      },
    ],
  };
}

const input = {
  open: true,
  admin: true,
  detail: detail(),
  attachmentDeleteConfirmOpen: true,
  attachmentDeleteConfirmId: "att-delete-1",
  attachmentDeleteConfirmName: 'informe <final> "seguro".txt',
};

const html = renderIncidenciasDetailModal(input);

assert.match(html, /data-attachment-delete-confirm-open="true"/);
assert.match(html, /data-detail-confirm-dialog="true"/);
assert.match(html, /data-confirm-kind="attachment-delete"/);
assert.match(html, /role="alertdialog"/);
assert.match(html, /aria-modal="true"/);
assert.match(html, /¿Eliminar este archivo\?/);
assert.match(
  html,
  /Se quitará de la incidencia y del almacenamiento\. Esta acción no se puede deshacer\./
);
assert.match(html, /Conservar archivo/);
assert.match(html, /Sí, eliminar adjunto/);
assert.match(
  html,
  new RegExp(`data-detail-action="${DETAIL_ACTIONS.ATTACHMENT_DELETE_CANCEL}"`)
);
assert.match(
  html,
  new RegExp(`data-detail-action="${DETAIL_ACTIONS.ATTACHMENT_DELETE_CONFIRM}"`)
);
assert.match(html, /informe &lt;final&gt; &quot;seguro&quot;\.txt/);
assert.doesNotMatch(html, /informe <final>/);
assert.ok(
  html.indexOf("Conservar archivo") < html.indexOf("Sí, eliminar adjunto"),
  "la acción segura debe aparecer antes que la destructiva"
);

const closedHtml = renderIncidenciasDetailModal({
  ...input,
  attachmentDeleteConfirmOpen: false,
});
assert.doesNotMatch(closedHtml, /data-confirm-kind="attachment-delete"/);

const userHtml = renderIncidenciasDetailModal({
  ...input,
  admin: false,
});
assert.doesNotMatch(
  userHtml,
  /data-confirm-kind="attachment-delete"/,
  "un usuario no administrador no puede forzar el diálogo desde el payload"
);

const snapshot = getDetailTemplateSnapshot();
assert.equal(snapshot.policy.adminAttachmentDelete, true);
assert.equal(
  snapshot.policy.applicationOwnedAttachmentDeleteConfirmation,
  true
);
assert.equal(snapshot.policy.nativeBrowserAttachmentConfirm, false);
assert.equal(
  snapshot.policy.attachmentDeleteRequiresExplicitConfirmAction,
  true
);

const controllerSource = await readFile(
  new URL("../../src/views/incidencias/index.impl.js", import.meta.url),
  "utf8"
);
const templateSource = await readFile(
  new URL("../../src/views/incidencias/incidencias.template.modal.impl.js", import.meta.url),
  "utf8"
);
const cssSource = await readFile(
  new URL("../../src/css/views/incidencias/detail.css", import.meta.url),
  "utf8"
);

assert.doesNotMatch(
  controllerSource,
  /window\.confirm|typeof\s+window\.confirm/,
  "el borrado no puede depender del confirm nativo del navegador"
);

for (const required of [
  "attachmentDeleteConfirmOpen",
  "attachmentDeleteConfirmId",
  "attachmentDeleteConfirmName",
  "function requestAttachmentDelete(",
  "function cancelAttachmentDeleteConfirm(",
  "async function confirmAttachmentDelete(",
  "clearAttachmentDeleteConfirm();",
  'detailModal.operation = "delete-attachment"',
  "DETAIL_ACTIONS.ATTACHMENT_DELETE_CANCEL",
  "DETAIL_ACTIONS.ATTACHMENT_DELETE_CONFIRM",
]) {
  assert.ok(
    controllerSource.includes(required),
    `falta el flujo controller-owned de confirmación: ${required}`
  );
}

const requestStart = controllerSource.indexOf(
  "function requestAttachmentDelete("
);
const requestEnd = controllerSource.indexOf(
  "function clearAttachmentDeleteConfirm(",
  requestStart
);
const requestSource = controllerSource.slice(requestStart, requestEnd);
assert.ok(requestStart >= 0 && requestEnd > requestStart);
assert.doesNotMatch(
  requestSource,
  /deleteIncidenciaAttachment\s*\(/,
  "abrir el diálogo nunca debe ejecutar el borrado"
);

const confirmStart = controllerSource.indexOf(
  "async function confirmAttachmentDelete("
);
const confirmEnd = controllerSource.indexOf(
  "function closePreview(",
  confirmStart
);
const confirmSource = controllerSource.slice(confirmStart, confirmEnd);
assert.ok(confirmStart >= 0 && confirmEnd > confirmStart);
assert.match(
  confirmSource,
  /await deleteIncidenciaAttachment\s*\(/,
  "sólo la acción explícita de confirmar puede llamar al backend"
);

for (const required of [
  'data-detail-confirm-dialog="true"',
  'role="alertdialog"',
  'aria-labelledby="${titleId}"',
  'aria-describedby="${descriptionId}',
  'data-detail-attachment-delete-name="true"',
]) {
  assert.ok(
    templateSource.includes(required),
    `falta semántica accesible del diálogo: ${required}`
  );
}

for (const required of [
  ".incidencias-modal-confirm-overlay",
  ".incidencias-modal-confirm-dialog",
  ".incidencias-modal-confirm-filename",
  ".incidencias-modal-confirm-btn--danger",
]) {
  assert.ok(cssSource.includes(required), `falta estilo de confirmación: ${required}`);
}

console.log(
  "Incidencias attachment delete confirmation OK · app-owned alertdialog · safe focus path · explicit destructive action · no window.confirm"
);
