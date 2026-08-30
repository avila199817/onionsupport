/* =========================================================
   Onion Support - Incidencias Create Contract Boundary
   Archivo: /src/views/incidencias/incidencias.template.create.js

   ROLE LIMITS · BACKEND PARITY · TEMPLATE SAFE

   Responsabilidad:
   - Mantener el template visual existente 1:1 en .impl.js.
   - Alinear la validación previa con los límites efectivos del backend.
   - Evitar submits que el backend rechazará por longitud/tamaño total.
   - Conservar el límite visual actual de 100 MB por archivo también en admin.
========================================================= */

import {
  CREATE_ACTIONS,
  getCreateFormDefaults,
  getCreateTemplateSnapshot as getCreateTemplateSnapshotImpl,
  renderIncidenciasCreateModal as renderIncidenciasCreateModalImpl,
  renderIncidenciasCreateModalClosed,
  validateCreateForm as validateCreateFormImpl,
} from "./incidencias.template.create.impl.js";

export { CREATE_ACTIONS, getCreateFormDefaults, renderIncidenciasCreateModalClosed };

export const INCIDENCIAS_CREATE_TEMPLATE_VERSION =
  "incidencias.template.create.extreme.v27.backend-limit-parity";

const MIB = 1024 * 1024;

export const INCIDENCIAS_CREATE_LIMITS = Object.freeze({
  client: Object.freeze({
    subjectMin: 4,
    subjectMax: 200,
    descriptionMin: 12,
    descriptionMax: 10000,
    maxFiles: 10,
    maxFileSize: 100 * MIB,
    maxTotalSize: 300 * MIB,
  }),
  admin: Object.freeze({
    /*
      Se conservan los mínimos UX históricos del panel admin aunque el backend
      sólo exige presencia. Los máximos sí coinciden con el contrato backend.
    */
    subjectMin: 4,
    subjectMax: 300,
    descriptionMin: 8,
    descriptionMax: 8000,
    maxFiles: 10,
    maxFileSize: 100 * MIB,
    maxTotalSize: 1024 * MIB,
  }),
});

function text(value = "") {
  return String(value ?? "").trim();
}

function number(value = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function modeFromForm(form = {}) {
  return text(form?.source).toLowerCase() === "panel_user"
    ? "client"
    : "admin";
}

function limitsForForm(form = {}) {
  return INCIDENCIAS_CREATE_LIMITS[modeFromForm(form)];
}

function totalAttachmentBytes(files = []) {
  return (Array.isArray(files) ? files : []).reduce(
    (total, file) => total + number(file?.size ?? file?.sizeBytes),
    0
  );
}

function formatBytes(bytes = 0) {
  const size = number(bytes);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(0)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(0)} GB`;
}

export function renderIncidenciasCreateModal(input = {}) {
  return renderIncidenciasCreateModalImpl(input);
}

export function validateCreateForm(form = {}) {
  const result = validateCreateFormImpl(form);
  const current = result?.form || form || {};
  const limits = limitsForForm(current);
  const errors = {
    ...(result?.errors || {}),
  };

  const subject = text(current.subject);
  const description = text(current.description);

  if (!subject) {
    errors.subject = "El título es obligatorio.";
  } else if (subject.length < limits.subjectMin) {
    errors.subject = `Mínimo ${limits.subjectMin} caracteres.`;
  } else if (subject.length > limits.subjectMax) {
    errors.subject = `Máximo ${limits.subjectMax} caracteres.`;
  } else {
    delete errors.subject;
  }

  if (!description) {
    errors.description = "La descripción es obligatoria.";
  } else if (description.length < limits.descriptionMin) {
    errors.description = `Mínimo ${limits.descriptionMin} caracteres.`;
  } else if (description.length > limits.descriptionMax) {
    errors.description = `Máximo ${limits.descriptionMax} caracteres.`;
  } else {
    delete errors.description;
  }

  const attachments = Array.isArray(current.attachments)
    ? current.attachments
    : [];

  if (!errors.attachments) {
    const totalBytes = totalAttachmentBytes(attachments);

    if (totalBytes > limits.maxTotalSize) {
      errors.attachments =
        `Los adjuntos no pueden superar ${formatBytes(limits.maxTotalSize)} en total.`;
    }
  }

  return {
    ...result,
    valid: Object.keys(errors).length === 0,
    errors,
    form: current,
  };
}

export function getCreateTemplateSnapshot() {
  const snapshot = getCreateTemplateSnapshotImpl();

  return {
    ...snapshot,
    version: INCIDENCIAS_CREATE_TEMPLATE_VERSION,
    limits: {
      ...(snapshot?.limits || {}),
      client: INCIDENCIAS_CREATE_LIMITS.client,
      admin: INCIDENCIAS_CREATE_LIMITS.admin,
    },
    policy: {
      ...(snapshot?.policy || {}),
      backendLimitParity: true,
      clientDescriptionMinMatchesBackend: true,
      roleAwareTextMaximums: true,
      clientAttachmentTotalMatchesBackend: true,
      adminFileSizeRemainsUiConservative: true,
    },
  };
}

export const renderCreateIncidenciaModal = renderIncidenciasCreateModal;
export const renderCreateModal = renderIncidenciasCreateModal;
export default renderIncidenciasCreateModal;
