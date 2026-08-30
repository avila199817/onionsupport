import assert from "node:assert/strict";

import {
  INCIDENCIAS_CREATE_LIMITS,
  getCreateTemplateSnapshot,
  validateCreateForm,
} from "../../src/views/incidencias/incidencias.template.create.js";

const MIB = 1024 * 1024;

function client(overrides = {}) {
  return {
    source: "panel_user",
    subject: "Error de acceso",
    description: "No puedo entrar desde ayer.",
    category: "general",
    priority: "medium",
    attachments: [],
    ...overrides,
  };
}

function admin(overrides = {}) {
  return {
    source: "panel_admin",
    subject: "Error de acceso",
    description: "No entra.",
    category: "general",
    priority: "medium",
    attachments: [],
    ...overrides,
  };
}

function file(name, size) {
  return {
    name,
    size,
    type: name.endsWith(".pdf") ? "application/pdf" : "text/plain",
  };
}

/* =========================================================
   USER CREATE · BACKEND DEFAULT PARITY
========================================================= */

assert.deepEqual(
  INCIDENCIAS_CREATE_LIMITS.client,
  {
    subjectMin: 4,
    subjectMax: 200,
    descriptionMin: 12,
    descriptionMax: 10000,
    maxFiles: 10,
    maxFileSize: 100 * MIB,
    maxTotalSize: 300 * MIB,
  },
  "los límites cliente deben coincidir con el contrato productivo del backend"
);

const shortClientDescription = validateCreateForm(
  client({ description: "12345678901" })
);
assert.equal(shortClientDescription.valid, false);
assert.equal(
  shortClientDescription.errors.description,
  "Mínimo 12 caracteres.",
  "8-11 caracteres no pueden pasar frontend para fallar después en backend"
);

assert.equal(
  validateCreateForm(client({ description: "123456789012" })).errors.description,
  undefined,
  "12 caracteres sí son válidos para usuario"
);

assert.equal(
  validateCreateForm(client({ subject: "x".repeat(201) })).errors.subject,
  "Máximo 200 caracteres."
);

assert.equal(
  validateCreateForm(client({ description: "x".repeat(10001) })).errors.description,
  "Máximo 10000 caracteres."
);

const clientOverTotal = validateCreateForm(
  client({
    attachments: [
      file("a.pdf", 80 * MIB),
      file("b.pdf", 80 * MIB),
      file("c.pdf", 80 * MIB),
      file("d.pdf", 80 * MIB),
    ],
  })
);
assert.equal(clientOverTotal.valid, false);
assert.equal(
  clientOverTotal.errors.attachments,
  "Los adjuntos no pueden superar 300 MB en total."
);

const clientAtTotal = validateCreateForm(
  client({
    attachments: [
      file("a.pdf", 100 * MIB),
      file("b.pdf", 100 * MIB),
      file("c.pdf", 100 * MIB),
    ],
  })
);
assert.equal(
  clientAtTotal.errors.attachments,
  undefined,
  "300 MB exactos deben seguir dentro del límite"
);

/* =========================================================
   ADMIN CREATE · PRESERVE UX + BACKEND MAXIMUMS
========================================================= */

assert.equal(INCIDENCIAS_CREATE_LIMITS.admin.subjectMax, 300);
assert.equal(INCIDENCIAS_CREATE_LIMITS.admin.descriptionMax, 8000);
assert.equal(INCIDENCIAS_CREATE_LIMITS.admin.maxFileSize, 100 * MIB);
assert.equal(INCIDENCIAS_CREATE_LIMITS.admin.maxTotalSize, 1024 * MIB);

assert.equal(
  validateCreateForm(admin({ subject: "x".repeat(301) })).errors.subject,
  "Máximo 300 caracteres."
);

assert.equal(
  validateCreateForm(admin({ description: "x".repeat(8001) })).errors.description,
  "Máximo 8000 caracteres."
);

assert.equal(
  validateCreateForm(admin({ description: "12345678" })).errors.description,
  undefined,
  "el mínimo UX admin de 8 caracteres se conserva"
);

/* =========================================================
   SNAPSHOT
========================================================= */

const snapshot = getCreateTemplateSnapshot();
assert.equal(snapshot.policy.backendLimitParity, true);
assert.equal(snapshot.policy.clientDescriptionMinMatchesBackend, true);
assert.equal(snapshot.policy.roleAwareTextMaximums, true);
assert.equal(snapshot.policy.clientAttachmentTotalMatchesBackend, true);
assert.equal(snapshot.policy.adminFileSizeRemainsUiConservative, true);
assert.equal(snapshot.limits.client.descriptionMin, 12);
assert.equal(snapshot.limits.client.maxTotalSize, 300 * MIB);
assert.equal(snapshot.limits.admin.subjectMax, 300);
assert.equal(snapshot.limits.admin.descriptionMax, 8000);

console.log(
  "Incidencias Create validation parity OK · client 4/12 + 200/10000 + 300MB total · admin 300/8000"
);
