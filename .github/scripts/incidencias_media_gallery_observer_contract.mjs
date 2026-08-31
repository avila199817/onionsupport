import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getIncidenciasMediaGallerySnapshot,
  syncIncidenciasMediaGalleryText,
} from "../../src/features/incidencias-video-preview/gallery.js";

let value = "";
let writes = 0;
const counter = {
  get textContent() {
    return value;
  },
  set textContent(next) {
    writes += 1;
    value = String(next);
  },
};

assert.equal(
  syncIncidenciasMediaGalleryText(counter, "1 / 3"),
  true,
  "la primera sincronización debe escribir el contador"
);
assert.equal(value, "1 / 3");
assert.equal(writes, 1);

assert.equal(
  syncIncidenciasMediaGalleryText(counter, "1 / 3"),
  false,
  "el mismo contador no puede reescribir textContent"
);
assert.equal(
  writes,
  1,
  "una mutación observada no puede agendar otro frame por una escritura idéntica"
);

assert.equal(syncIncidenciasMediaGalleryText(counter, "2 / 3"), true);
assert.equal(value, "2 / 3");
assert.equal(writes, 2);
assert.equal(syncIncidenciasMediaGalleryText(counter, "2 / 3"), false);
assert.equal(writes, 2);

const snapshot = getIncidenciasMediaGallerySnapshot();
assert.equal(snapshot.policy.observerTextWritesIdempotent, true);
assert.equal(snapshot.policy.mutationObserverFrameLoopPrevented, true);
assert.equal(snapshot.policy.observerScope, "modal-island");

const source = await readFile(
  new URL("../../src/features/incidencias-video-preview/gallery.js", import.meta.url),
  "utf8"
);

assert.match(
  source,
  /syncIncidenciasMediaGalleryText\(controls\.counter, ""\)/,
  "el contador vacío debe usar la escritura idempotente"
);
assert.match(
  source,
  /syncIncidenciasMediaGalleryText\(\s*controls\.counter,\s*`\$\{index \+ 1\} \/ \$\{items\.length\}`\s*\)/,
  "el contador poblado debe usar la escritura idempotente"
);
assert.doesNotMatch(
  source,
  /controls\.counter\.textContent\s*=/,
  "syncControls no puede mutar siempre el childList observado"
);

console.log(
  "Incidencias media gallery observer OK · counter text idempotent · no perpetual animation-frame loop"
);
