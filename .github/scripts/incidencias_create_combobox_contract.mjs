import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getIncidenciasCreateUserComboboxSnapshot,
} from "../../src/views/incidencias/incidencias.create-user-combobox.js";

const snapshot = getIncidenciasCreateUserComboboxSnapshot();

assert.equal(snapshot.policy.inputKeepsFocus, true);
assert.equal(snapshot.policy.usesActiveDescendant, true);
assert.equal(snapshot.policy.selectionDelegatesToCanonicalClick, true);
assert.equal(snapshot.policy.escapeDismissesPopupBeforeModal, true);
assert.equal(snapshot.policy.imeSafe, true);
assert.deepEqual(snapshot.keyboard, [
  "ArrowDown",
  "ArrowUp",
  "Home",
  "End",
  "Enter",
  "Escape",
]);

const comboboxSource = await readFile(
  new URL("../../src/views/incidencias/incidencias.create-user-combobox.js", import.meta.url),
  "utf8"
);
const boundarySource = await readFile(
  new URL("../../src/views/incidencias/index.js", import.meta.url),
  "utf8"
);
const implementationSource = await readFile(
  new URL("../../src/views/incidencias/index.impl.js", import.meta.url),
  "utf8"
);
const templateSource = await readFile(
  new URL("../../src/views/incidencias/incidencias.template.create.impl.js", import.meta.url),
  "utf8"
);

for (const required of [
  'input.setAttribute("role", "combobox")',
  'input.setAttribute("aria-controls", LIST_ID)',
  'input.setAttribute("aria-expanded", expanded ? "true" : "false")',
  'input.setAttribute("aria-activedescendant", options[activeIndex].id)',
  'option.setAttribute("aria-selected", selected ? "true" : "false")',
  'option.tabIndex = -1',
  'option.click()',
  'event.stopImmediatePropagation()',
  'event.isComposing || composing',
]) {
  assert.ok(
    comboboxSource.includes(required),
    `falta contrato combobox: ${required}`
  );
}

for (const key of snapshot.keyboard) {
  assert.ok(comboboxSource.includes(`"${key}"`), `falta tecla ${key}`);
}

for (const required of [
  'installIncidenciasCreateUserCombobox',
  '__incidenciasCreateUserComboboxInstalled',
  'controller.destroy = function destroyIncidenciasWithCombobox()',
  'uninstallCombobox?.()',
  'controllerImplementationPreserved1to1: true',
]) {
  assert.ok(boundarySource.includes(required), `falta frontera controller: ${required}`);
}

for (const required of [
  'data-create-user-search-input="true"',
  'role="listbox"',
  'role="option"',
  'data-create-action="${CREATE_ACTIONS.USER_SELECT}"',
]) {
  assert.ok(templateSource.includes(required), `falta base template: ${required}`);
}

/*
  Regresión importante de la auditoría: cambiar sólo prioridad/categoría NO
  puede escribir status incidentalmente. El estado sólo viaja si difiere del
  estado efectivo (o si una operación lo fuerza expresamente).
*/
for (const required of [
  'const statusChanged = forceStatusWrite || desired.status !== current.status;',
  'const effectiveStatus = reopened ? "open" : current.status;',
  'if (forceStatusWrite || desired.status !== effectiveStatus)',
  'changes.status = desired.status;',
]) {
  assert.ok(
    implementationSource.includes(required),
    `se perdió la protección de escritura selectiva de estado: ${required}`
  );
}

console.log(
  "Incidencias Create user combobox OK · keyboard/ARIA/IME · canonical click selection · status writes remain selective"
);
