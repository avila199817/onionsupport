import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  detailAttachmentPolicyHelp,
  getIncidenciasDetailAttachmentPolicy,
  getIncidenciasDetailAttachmentPolicySnapshot,
  syncIncidenciasDetailAttachmentHelp,
  validateIncidenciasDetailAttachmentSelection,
} from "../../src/views/incidencias/incidencias.detail-attachment-policy.js";

const MIB = 1024 * 1024;

function file(name, size) {
  return {
    name,
    size,
    type: "application/octet-stream",
    lastModified: 1,
  };
}

const userPolicy = getIncidenciasDetailAttachmentPolicy("user");
assert.equal(userPolicy.maxFiles, 10);
assert.equal(userPolicy.maxFileSize, 50 * MIB);
assert.equal(userPolicy.maxTotalSize, 500 * MIB);
assert.equal(userPolicy.backendMaxFileSize, 50 * MIB);
assert.equal(userPolicy.backendMaxTotalSize, 500 * MIB);

const adminPolicy = getIncidenciasDetailAttachmentPolicy("admin");
assert.equal(adminPolicy.maxFiles, 10);
assert.equal(adminPolicy.maxFileSize, 100 * MIB);
assert.equal(adminPolicy.maxTotalSize, 1000 * MIB);
assert.equal(adminPolicy.backendMaxFileSize, 2048 * MIB);
assert.equal(adminPolicy.backendMaxTotalSize, 4096 * MIB);

assert.equal(
  validateIncidenciasDetailAttachmentSelection({
    role: "user",
    incoming: [file("50.bin", 50 * MIB)],
  }).valid,
  true,
  "50 MB exactos deben ser válidos para usuario"
);

const userTooLarge = validateIncidenciasDetailAttachmentSelection({
  role: "user",
  incoming: [file("80.bin", 80 * MIB)],
});
assert.equal(userTooLarge.valid, false);
assert.equal(userTooLarge.code, "FILE_TOO_LARGE");
assert.match(userTooLarge.message, /50 MB/);

assert.equal(
  validateIncidenciasDetailAttachmentSelection({
    role: "admin",
    incoming: [file("80.bin", 80 * MIB)],
  }).valid,
  true,
  "el admin debe conservar el margen UI previo de 100 MB por archivo"
);

const adminTooLarge = validateIncidenciasDetailAttachmentSelection({
  role: "admin",
  incoming: [file("101.bin", 101 * MIB)],
});
assert.equal(adminTooLarge.valid, false);
assert.equal(adminTooLarge.code, "FILE_TOO_LARGE");
assert.match(adminTooLarge.message, /100 MB/);

const tooMany = validateIncidenciasDetailAttachmentSelection({
  role: "user",
  incoming: Array.from({ length: 11 }, (_, index) => file(`f-${index}.bin`, 1 * MIB)),
});
assert.equal(tooMany.valid, false);
assert.equal(tooMany.code, "TOO_MANY_FILES");

assert.equal(
  validateIncidenciasDetailAttachmentSelection({
    role: "user",
    incoming: Array.from({ length: 10 }, (_, index) => file(`u-${index}.bin`, 50 * MIB)),
  }).valid,
  true,
  "10 × 50 MB deben coincidir exactamente con el máximo productivo de 500 MB"
);

assert.match(detailAttachmentPolicyHelp("user"), /50 MB por archivo/);
assert.match(detailAttachmentPolicyHelp("user"), /500 MB por actualización/);
assert.match(detailAttachmentPolicyHelp("admin"), /100 MB por archivo/);
assert.match(detailAttachmentPolicyHelp("admin"), /1000 MB por actualización/);

const snapshot = getIncidenciasDetailAttachmentPolicySnapshot();
assert.equal(snapshot.policy.earlyChangeValidation, true);
assert.equal(snapshot.policy.earlyDropValidation, true);
assert.equal(snapshot.policy.controllerSelectionPathPreserved, true);
assert.equal(snapshot.policy.userMatchesProductionBackend, true);
assert.equal(snapshot.policy.adminRemainsUiConservative, true);
assert.equal(snapshot.policy.observerTextWritesIdempotent, true);
assert.equal(snapshot.policy.mutationObserverSelfLoopPrevented, true);
assert.equal(snapshot.policy.zeroHttp, true);

let helpValue = "";
let helpWrites = 0;
const helpNode = {
  get textContent() {
    return helpValue;
  },
  set textContent(value) {
    helpWrites += 1;
    helpValue = String(value);
  },
};

assert.equal(
  syncIncidenciasDetailAttachmentHelp(helpNode, "user"),
  true,
  "la primera sincronización debe escribir el copy de usuario"
);
assert.equal(helpWrites, 1);
assert.match(helpValue, /50 MB por archivo/);

assert.equal(
  syncIncidenciasDetailAttachmentHelp(helpNode, "user"),
  false,
  "una mutación observada con el mismo rol no debe volver a escribir textContent"
);
assert.equal(
  helpWrites,
  1,
  "la segunda sincronización idéntica no puede emitir otra mutación childList"
);

assert.equal(syncIncidenciasDetailAttachmentHelp(helpNode, "admin"), true);
assert.equal(helpWrites, 2);
assert.match(helpValue, /100 MB por archivo/);
assert.equal(syncIncidenciasDetailAttachmentHelp(helpNode, "admin"), false);
assert.equal(helpWrites, 2);

const policySource = await readFile(
  new URL("../../src/views/incidencias/incidencias.detail-attachment-policy.js", import.meta.url),
  "utf8"
);
const boundarySource = await readFile(
  new URL("../../src/views/incidencias/index.js", import.meta.url),
  "utf8"
);
const controllerSource = await readFile(
  new URL("../../src/views/incidencias/index.impl.js", import.meta.url),
  "utf8"
);

for (const required of [
  'documentLike.addEventListener("change", onChange, true)',
  'documentLike.addEventListener("drop", onDrop, true)',
  'event.stopImmediatePropagation?.()',
  'data-detail-upload-policy-feedback',
  'syncIncidenciasDetailAttachmentHelp(help, role)',
  'input.dataset.detailMaxFileSize',
  'input.dataset.detailMaxTotalSize',
]) {
  assert.ok(policySource.includes(required), `falta cierre temprano de adjuntos: ${required}`);
}

assert.doesNotMatch(
  policySource,
  /(?:core\/http|\bHttp\.(?:get|post|put|patch|delete)\s*\(|\bfetch\s*\(|XMLHttpRequest)/,
  "la política de adjuntos no puede añadir HTTP"
);
assert.doesNotMatch(
  policySource,
  /if \(help\) help\.textContent\s*=/,
  "syncDom no puede reescribir siempre el texto que observa su propio MutationObserver"
);

for (const required of [
  'installIncidenciasDetailAttachmentPolicy',
  'getRole: resolveBoundaryRole',
  '__incidenciasDetailAttachmentPolicyInstalled',
  'uninstallDetailAttachmentPolicy?.()',
]) {
  assert.ok(boundarySource.includes(required), `falta frontera de política: ${required}`);
}

for (const required of [
  'field === "attachments"',
  'addDetailPendingFiles(',
  'uploadIncidenciaAttachments(',
]) {
  assert.ok(
    controllerSource.includes(required),
    `el enhancement no debe sustituir el flujo canónico del controller: ${required}`
  );
}

console.log(
  "Incidencias Detail attachment policy OK · observer idempotent · no self-loop · user 50/500MB · admin UI 100/1000MB"
);
