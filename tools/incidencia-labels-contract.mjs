import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  INCIDENCIA_STATUS_OPTIONS,
  INCIDENCIA_PRIORITY_OPTIONS,
  INCIDENCIA_CATEGORY_OPTIONS,
  incidenciaStatusLabel,
  incidenciaPriorityLabel,
  incidenciaCategoryLabel,
} from "../src/views/incidencias/incidencias.options.js";
import { renderIncidenciasDetailModal } from "../src/views/incidencias/incidencias.template.modal.js";

// UNA AUTORIDAD DECLARA EL VALOR Y CÓMO SE LEE.
//
// El chip de la cabecera y el desplegable del editor hablan de la misma incidencia. Mientras
// el chip se pintaba con un capitalizado genérico y el select con estas listas, la misma
// incidencia se leía «Technical» arriba y «Técnica» abajo, y cualquier alias del backend
// (`in_progress`, `urgent`, `abierta`) salía crudo a pantalla.
//
// Nada de esto cambia lo que se envía a la API: sólo se lee.

// 1 · Tabla congelada. Entrada -> etiqueta, incluidos alias, heredados, vacío y desconocido.
const STATUS_TABLE = Object.freeze({
  pending: "Pendiente", open: "Abierta", closed: "Cerrada",
  progress: "En proceso", resolved: "Resuelta",
  in_progress: "Abierta", abierta: "Abierta", cerrada: "Cerrada", Nueva: "Pendiente",
  "": "Abierta", "  ": "Abierta", "weird-value": "Weird Value",
});
const PRIORITY_TABLE = Object.freeze({
  low: "Baja", medium: "Media", high: "Alta",
  urgent: "Alta", critical: "Alta", p0: "Alta", baja: "Baja", alta: "Alta",
  "": "Media", weird: "Weird",
});
const CATEGORY_TABLE = Object.freeze({
  general: "General", technical: "Técnica", billing: "Facturación", access: "Acceso",
  hardware: "Hardware", software: "Software", account: "Cuenta", network: "Redes",
  documentation: "Documentación", sales: "Ventas",
  tecnica: "Técnica", facturacion: "Facturación", redes: "Redes",
  "": "General", weird_value: "Weird Value",
});

for (const [value, expected] of Object.entries(STATUS_TABLE)) {
  assert.equal(incidenciaStatusLabel(value), expected, `status ${JSON.stringify(value)}`);
}
for (const [value, expected] of Object.entries(PRIORITY_TABLE)) {
  assert.equal(incidenciaPriorityLabel(value), expected, `priority ${JSON.stringify(value)}`);
}
for (const [value, expected] of Object.entries(CATEGORY_TABLE)) {
  assert.equal(incidenciaCategoryLabel(value), expected, `category ${JSON.stringify(value)}`);
}
// Ausente cae en el valor por defecto del campo; nunca en una cadena vacía ni en "undefined".
for (const absent of [null, undefined]) {
  assert.equal(incidenciaStatusLabel(absent), "Abierta");
  assert.equal(incidenciaPriorityLabel(absent), "Media");
  assert.equal(incidenciaCategoryLabel(absent), "General");
}
console.log(`PASS 1 · frozen table: ${Object.keys(STATUS_TABLE).length + Object.keys(PRIORITY_TABLE).length + Object.keys(CATEGORY_TABLE).length} inputs, aliases, legacy states, absent and unknown`);

// 2 · Toda etiqueta declarada es alcanzable por su propio valor: ninguna opción del select
//     puede mostrar en el chip un texto que no sea el suyo.
for (const [name, options, resolve] of [
  ["status", INCIDENCIA_STATUS_OPTIONS, incidenciaStatusLabel],
  ["priority", INCIDENCIA_PRIORITY_OPTIONS, incidenciaPriorityLabel],
  ["category", INCIDENCIA_CATEGORY_OPTIONS, incidenciaCategoryLabel],
]) {
  for (const { value, label } of options) {
    assert.equal(resolve(value), label, `${name} option ${value} must read as its declared label`);
  }
}
console.log("PASS 2 · every declared option reads back as its own label");

// 3 · El chip renderizado y la opción seleccionada del editor dicen lo mismo, sobre el
//     render real del detalle.
function detail(overrides = {}) {
  return {
    id: "INC-LABELS-1", ticketId: "INC-LABELS-1", subject: "Incidencia de prueba",
    description: "Contrato de etiquetas.", createdAt: "2026-09-08T09:00:00.000Z",
    updatedAt: "2026-09-08T09:30:00.000Z", comments: [], history: [], attachments: [],
    ...overrides,
  };
}
const CHIP = /<span[^>]*class="[^"]*incidencias-modal-chip[^"]*"[^>]*>([^<]*)<\/span>/gu;
const cases = [
  { status: "technical-case", value: { status: "open", priority: "high", category: "technical" }, chips: ["Abierta", "Alta", "Técnica"] },
  // El detalle resuelve su propio estado antes de etiquetarlo: `in_progress` llega como
  // `progress` y conserva su texto heredado exacto. Lo que cambia aquí es la categoría.
  { status: "alias-case", value: { status: "in_progress", priority: "urgent", category: "facturacion" }, chips: ["En proceso", "Alta", "Facturación"] },
  { status: "legacy-case", value: { status: "progress", priority: "low", category: "documentation" }, chips: ["En proceso", "Baja", "Documentación"] },
  { status: "absent-case", value: {}, chips: ["Abierta", "Media", "General"] },
];
for (const { status: name, value, chips } of cases) {
  const html = renderIncidenciasDetailModal({ open: true, detail: detail(value), admin: true, role: "admin" });
  const rendered = [...html.matchAll(CHIP)].map((match) => match[1].trim()).filter(Boolean);
  for (const expected of chips) {
    assert.ok(rendered.includes(expected), `${name}: chip "${expected}" missing, got ${JSON.stringify(rendered)}`);
  }
  for (const [field, raw, expected] of [
    ["status", value.status, chips[0]],
    ["priority", value.priority, chips[1]],
    ["category", value.category, chips[2]],
  ]) {
    // Sólo cuando el valor pertenece a la taxonomía vigente el editor puede preseleccionarlo;
    // un estado heredado no tiene opción propia y eso es correcto, no un fallo de etiqueta.
    const options = { status: INCIDENCIA_STATUS_OPTIONS, priority: INCIDENCIA_PRIORITY_OPTIONS, category: INCIDENCIA_CATEGORY_OPTIONS }[field];
    const declared = options.find((entry) => entry.label === expected);
    if (!declared) continue;
    const selected = new RegExp(`<option[^>]*value="${declared.value}"[^>]*selected[^>]*>([^<]*)</option>`, "u").exec(html);
    if (!selected) continue;
    assert.equal(selected[1].trim(), expected, `${name}: the ${field} chip and its selected option must read the same (${raw})`);
  }
}
console.log(`PASS 3 · ${cases.length} real detail renders: chip and selected option never disagree`);

// 4 · No queda una copia local que pueda volver a divergir.
const source = await readFile(new URL("../src/views/incidencias/incidencias.template.modal.impl.js", import.meta.url), "utf8");
for (const forbidden of ["function statusLabel(", "function priorityLabel(", "function displayLabel("]) {
  assert.equal(source.includes(forbidden), false, `the detail template must not keep its own ${forbidden}`);
}
assert.match(source, /incidenciaStatusLabel/u);
assert.match(source, /incidenciaPriorityLabel/u);
assert.match(source, /incidenciaCategoryLabel/u);
assert.equal(/"Técnica"|"Technical"/u.test(source), false, "no local translation of a taxonomy value lives in the template");
console.log("PASS 4 · no local label map and no local translation left in the detail template");

console.log(
  `Incidencia labels contract: PASS · one authority for value and label · ` +
    `${INCIDENCIA_STATUS_OPTIONS.length} status, ${INCIDENCIA_PRIORITY_OPTIONS.length} priority, ${INCIDENCIA_CATEGORY_OPTIONS.length} category`
);
