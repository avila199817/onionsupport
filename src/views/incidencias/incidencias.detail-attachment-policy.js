/* =========================================================
   Onion Support - Incidencias Detail Attachment Policy
   Archivo: /src/views/incidencias/incidencias.detail-attachment-policy.js

   ROLE-AWARE · EARLY VALIDATION · ZERO HTTP

   Producción verificada 2026-08-31:
   - usuario: backend 50 MB/archivo · 500 MB/operación · 10 archivos;
   - admin: backend 2 GB/archivo · 4 GB/operación · 10 archivos.

   La UI mantiene deliberadamente el tope admin conservador existente de
   100 MB/archivo. Para usuario, la UI se alinea con el límite productivo real
   de 50 MB para evitar aceptar archivos que el backend rechazará después.
========================================================= */

export const INCIDENCIAS_DETAIL_ATTACHMENT_POLICY_VERSION =
  "incidencias.detail-attachment-policy.v1.production-parity";

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

const DETAIL_ROOT_SELECTOR = "[data-incidencias-modal-root='true']";
const DETAIL_INPUT_SELECTOR =
  "input[data-detail-field='attachments'], input[data-field='attachments'][type='file']";
const DETAIL_DROPZONE_SELECTOR = "[data-dropzone='detail-attachments']";
const REMOVE_SELECTOR =
  "[data-detail-action='detail-pending-file-remove'], [data-remove-attachment]";
const FEEDBACK_ATTR = "data-detail-upload-policy-feedback";

export const INCIDENCIAS_DETAIL_ATTACHMENT_LIMITS = Object.freeze({
  user: Object.freeze({
    role: "user",
    maxFiles: 10,
    maxFileSize: 50 * MIB,
    maxTotalSize: 500 * MIB,
    backendMaxFileSize: 50 * MIB,
    backendMaxTotalSize: 500 * MIB,
  }),
  admin: Object.freeze({
    role: "admin",
    maxFiles: 10,
    maxFileSize: 100 * MIB,
    maxTotalSize: 1000 * MIB,
    backendMaxFileSize: 2 * GIB,
    backendMaxTotalSize: 4 * GIB,
  }),
});

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && typeof value.length === "number") {
    try {
      return Array.from(value);
    } catch {
      return [];
    }
  }
  return [];
}

function roleKey(value = "") {
  return String(value ?? "").trim().toLowerCase() === "admin"
    ? "admin"
    : "user";
}

function fileKey(file = {}, index = 0) {
  return [
    String(file?.name || `archivo-${index}`),
    Number(file?.size || 0),
    Number(file?.lastModified || 0),
    String(file?.type || ""),
  ].join("::");
}

function dedupeFiles(files = []) {
  const map = new Map();
  safeArray(files).forEach((file, index) => {
    if (!file || typeof file !== "object") return;
    const key = fileKey(file, index);
    if (!map.has(key)) map.set(key, file);
  });
  return [...map.values()];
}

function bytes(value = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatLimit(value = 0) {
  const amount = bytes(value);
  if (amount >= GIB && amount % GIB === 0) return `${amount / GIB} GB`;
  if (amount >= MIB && amount % MIB === 0) return `${amount / MIB} MB`;
  return `${Math.ceil(amount / MIB)} MB`;
}

function filename(file = {}) {
  return String(file?.name || "seleccionado")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "seleccionado";
}

export function getIncidenciasDetailAttachmentPolicy(role = "user") {
  return INCIDENCIAS_DETAIL_ATTACHMENT_LIMITS[roleKey(role)];
}

export function detailAttachmentPolicyHelp(role = "user") {
  const policy = getIncidenciasDetailAttachmentPolicy(role);
  return (
    `Imágenes, PDFs y documentos · Máximo ${policy.maxFiles} archivos · ` +
    `${formatLimit(policy.maxFileSize)} por archivo · ` +
    `${formatLimit(policy.maxTotalSize)} por actualización`
  );
}

export function validateIncidenciasDetailAttachmentSelection({
  incoming = [],
  pending = [],
  role = "user",
} = {}) {
  const policy = getIncidenciasDetailAttachmentPolicy(role);
  const nextIncoming = dedupeFiles(incoming);
  const combined = dedupeFiles([
    ...dedupeFiles(pending),
    ...nextIncoming,
  ]);

  if (!nextIncoming.length) {
    return {
      valid: false,
      code: "NO_FILES",
      message: "",
      files: dedupeFiles(pending),
      policy,
    };
  }

  const tooLarge = combined.find(
    (file) => bytes(file?.size) > policy.maxFileSize
  );

  if (tooLarge) {
    return {
      valid: false,
      code: "FILE_TOO_LARGE",
      message:
        `El archivo ${filename(tooLarge)} supera el límite de ` +
        `${formatLimit(policy.maxFileSize)} por archivo.`,
      files: dedupeFiles(pending),
      policy,
    };
  }

  if (combined.length > policy.maxFiles) {
    return {
      valid: false,
      code: "TOO_MANY_FILES",
      message: `No puedes adjuntar más de ${policy.maxFiles} archivos en una actualización.`,
      files: dedupeFiles(pending),
      policy,
    };
  }

  const totalSize = combined.reduce(
    (total, file) => total + bytes(file?.size),
    0
  );

  if (totalSize > policy.maxTotalSize) {
    return {
      valid: false,
      code: "TOTAL_TOO_LARGE",
      message:
        `Los archivos de esta actualización no pueden superar ` +
        `${formatLimit(policy.maxTotalSize)} en total.`,
      files: dedupeFiles(pending),
      policy,
    };
  }

  return {
    valid: true,
    code: "OK",
    message: "",
    files: combined,
    totalSize,
    policy,
  };
}

export function getIncidenciasDetailAttachmentPolicySnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_DETAIL_ATTACHMENT_POLICY_VERSION,
    productionDefaults: Object.freeze({
      userMaxFileSize: 50 * MIB,
      userMaxTotalSize: 500 * MIB,
      adminBackendMaxFileSize: 2 * GIB,
      adminBackendMaxTotalSize: 4 * GIB,
      maxFiles: 10,
    }),
    ui: Object.freeze({
      user: INCIDENCIAS_DETAIL_ATTACHMENT_LIMITS.user,
      admin: INCIDENCIAS_DETAIL_ATTACHMENT_LIMITS.admin,
    }),
    policy: Object.freeze({
      earlyChangeValidation: true,
      earlyDropValidation: true,
      controllerSelectionPathPreserved: true,
      userMatchesProductionBackend: true,
      adminRemainsUiConservative: true,
      zeroHttp: true,
      zeroStorage: true,
    }),
  });
}

function isElement(value = null) {
  return Boolean(value && value.nodeType === 1 && typeof value.matches === "function");
}

function rootFrom(node = null) {
  return node?.closest?.(DETAIL_ROOT_SELECTOR) || null;
}

function filesFromList(value = null) {
  return safeArray(value).filter(
    (file) => file && typeof file === "object" && typeof file.size === "number"
  );
}

export function installIncidenciasDetailAttachmentPolicy({
  document: documentLike = typeof document !== "undefined" ? document : null,
  getRole = () => "user",
} = {}) {
  if (!documentLike?.addEventListener || !documentLike?.querySelector) {
    return () => false;
  }

  let destroyed = false;
  let pending = new Map();
  let ticketId = "";
  let syncQueued = false;

  const currentRole = () => roleKey(
    typeof getRole === "function" ? getRole() : "user"
  );

  function pendingFiles() {
    return [...pending.values()];
  }

  function setPending(files = []) {
    pending = new Map(
      dedupeFiles(files).map((file, index) => [fileKey(file, index), file])
    );
  }

  function feedbackFor(root = null) {
    if (!root?.querySelector) return null;

    let feedback = root.querySelector(`[${FEEDBACK_ATTR}='true']`);
    if (feedback) return feedback;

    const dropzone = root.querySelector(DETAIL_DROPZONE_SELECTOR);
    if (!dropzone?.parentNode || !documentLike.createElement) return null;

    feedback = documentLike.createElement("div");
    feedback.setAttribute(FEEDBACK_ATTR, "true");
    feedback.setAttribute("role", "alert");
    feedback.setAttribute("aria-live", "assertive");
    feedback.className = "incidencias-modal-feedback incidencias-modal-feedback--error";
    feedback.hidden = true;

    const strong = documentLike.createElement("strong");
    strong.textContent = "Archivo no permitido";

    const message = documentLike.createElement("span");
    message.setAttribute("data-detail-upload-policy-message", "true");

    feedback.append(strong, message);
    dropzone.insertAdjacentElement("afterend", feedback);
    return feedback;
  }

  function showError(root = null, message = "") {
    const feedback = feedbackFor(root);
    if (!feedback) return false;

    const messageNode = feedback.querySelector(
      "[data-detail-upload-policy-message='true']"
    );
    if (messageNode) messageNode.textContent = String(message || "");
    feedback.hidden = !message;
    return true;
  }

  function clearError(root = null) {
    return showError(root, "");
  }

  function syncDom() {
    syncQueued = false;
    if (destroyed) return false;

    const root = documentLike.querySelector(DETAIL_ROOT_SELECTOR);
    if (!root) {
      pending.clear();
      ticketId = "";
      return false;
    }

    const nextTicketId = String(root.dataset?.ticketId || "");
    if (ticketId && nextTicketId && nextTicketId !== ticketId) {
      pending.clear();
    }
    ticketId = nextTicketId;

    const renderedPending = root.querySelectorAll?.(
      ".incidencias-modal-pending-file[data-file-index]"
    ) || [];
    const pendingSlot = root.querySelector?.("[data-modal-pending-files='true']");
    if (pendingSlot && renderedPending.length === 0) pending.clear();

    const role = currentRole();
    const policy = getIncidenciasDetailAttachmentPolicy(role);
    const help = root.querySelector("#incidencias-modal-attachments-help");
    if (help) help.textContent = detailAttachmentPolicyHelp(role);

    const input = root.querySelector(DETAIL_INPUT_SELECTOR);
    if (input) {
      input.dataset.detailAttachmentRole = role;
      input.dataset.detailMaxFiles = String(policy.maxFiles);
      input.dataset.detailMaxFileSize = String(policy.maxFileSize);
      input.dataset.detailMaxTotalSize = String(policy.maxTotalSize);
    }

    root.dataset.detailAttachmentPolicyVersion =
      INCIDENCIAS_DETAIL_ATTACHMENT_POLICY_VERSION;
    root.dataset.detailAttachmentPolicyRole = role;

    feedbackFor(root);
    return true;
  }

  function queueSync() {
    if (destroyed || syncQueued) return false;
    syncQueued = true;

    if (typeof queueMicrotask === "function") queueMicrotask(syncDom);
    else Promise.resolve().then(syncDom);
    return true;
  }

  function validateIncoming(root, files = []) {
    const validation = validateIncidenciasDetailAttachmentSelection({
      incoming: files,
      pending: pendingFiles(),
      role: currentRole(),
    });

    if (!validation.valid) {
      if (validation.message) showError(root, validation.message);
      return validation;
    }

    setPending(validation.files);
    clearError(root);
    return validation;
  }

  function onChange(event) {
    const input = isElement(event?.target) ? event.target : null;
    if (!input?.matches?.(DETAIL_INPUT_SELECTOR)) return;

    const root = rootFrom(input);
    if (!root) return;

    const validation = validateIncoming(root, filesFromList(input.files));
    if (validation.valid) {
      queueSync();
      return;
    }

    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    try {
      input.value = "";
    } catch {
      // noop
    }
  }

  function onDrop(event) {
    const target = isElement(event?.target) ? event.target : null;
    const dropzone = target?.closest?.(DETAIL_DROPZONE_SELECTOR);
    const root = rootFrom(dropzone);
    if (!dropzone || !root) return;

    const files = filesFromList(event?.dataTransfer?.files);
    if (!files.length) return;

    const validation = validateIncoming(root, files);
    if (validation.valid) {
      queueSync();
      return;
    }

    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  }

  function onClick(event) {
    const target = isElement(event?.target) ? event.target : null;
    const remove = target?.closest?.(REMOVE_SELECTOR);
    const root = rootFrom(remove);
    if (!remove || !root) return;

    const index = Number(
      remove.dataset?.fileIndex ?? remove.dataset?.removeAttachment ?? -1
    );
    if (!Number.isInteger(index) || index < 0) return;

    const next = pendingFiles();
    if (index < next.length) next.splice(index, 1);
    setPending(next);
    clearError(root);
    queueSync();
  }

  documentLike.addEventListener("change", onChange, true);
  documentLike.addEventListener("drop", onDrop, true);
  documentLike.addEventListener("click", onClick, true);

  const MutationObserverCtor =
    documentLike.defaultView?.MutationObserver ||
    (typeof MutationObserver !== "undefined" ? MutationObserver : null);

  const observer = MutationObserverCtor
    ? new MutationObserverCtor(queueSync)
    : null;

  observer?.observe?.(documentLike.body || documentLike.documentElement, {
    childList: true,
    subtree: true,
  });

  syncDom();

  return function uninstallIncidenciasDetailAttachmentPolicy() {
    if (destroyed) return false;
    destroyed = true;
    observer?.disconnect?.();
    documentLike.removeEventListener("change", onChange, true);
    documentLike.removeEventListener("drop", onDrop, true);
    documentLike.removeEventListener("click", onClick, true);
    pending.clear();
    return true;
  };
}

export default installIncidenciasDetailAttachmentPolicy;
