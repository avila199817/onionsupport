/* =========================================================
   Onion Support - Incidencias Actions
   Archivo: /src/views/incidencias/incidencias.actions.js

   Responsabilidad:
   - Centralizar acciones operativas del módulo Incidencias.
   - Resolver detalle desde Store/API.
   - Ejecutar acciones de usuario: abrir detalle, copiar ID, exportar CSV,
     comentar, reabrir, subir adjuntos y resolver adjuntos.
   - Delegar HTTP a incidencias.api.js.
   - Delegar normalización a incidencias.model.js.
   - Delegar persistencia a incidencias.store.js.
   - Exportar siempre la colección completa ordenada nuevo→antiguo.
   - No tocar Router.
   - No registrar globals.
   - No crear bridges.
   - No abrir modales directamente.
   - No hacer escrituras locales falsas.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  getIncidenciaByIdRequest,
  commentIncidenciaRequest,
  reopenIncidenciaRequest,
  uploadIncidenciaAttachmentsRequest,
  getIncidenciaAttachmentFileRequest,
  createIncidencia,
} from "./incidencias.api.js";

import {
  getIncidenciaByIdStore,
  getSortedIncidenciasStore,
  upsertIncidenciaStore,
} from "./incidencias.store.js";

import {
  normalizeIncidenciaModel,
  sortIncidenciasByUpdatedDesc,
} from "./incidencias.model.js";

import {
  showToast,
} from "./incidencias.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const INCIDENCIAS_ACTIONS_VERSION = "incidencias.actions.v2.infinite";

const CSV_FILENAME = "incidencias.csv";
const CSV_BOM = "\uFEFF";

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "string") {
    let normalized = value
      .trim()
      .replace(/€/g, "")
      .replace(/\$/g, "")
      .replace(/£/g, "")
      .replace(/%/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s+/g, "");

    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      const lastComma = normalized.lastIndexOf(",");
      const lastDot = normalized.lastIndexOf(".");

      normalized = lastComma > lastDot
        ? normalized.replace(/\./g, "").replace(/,/g, ".")
        : normalized.replace(/,/g, "");
    } else if (hasComma) {
      normalized = normalized.replace(/,/g, ".");
    }

    const number = Number(normalized);
    return Number.isFinite(number) ? number : fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;
    return value;
  }

  return null;
}

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function hasOwnKeys(value = {}) {
  return Boolean(isObject(value) && Object.keys(value).length);
}

function normalizeTicketId(value = "") {
  if (isObject(value)) {
    return safeText(
      first(
        value.ticketId,
        value.incidenciaId,
        value.id,
        value.code,
        value.ticketCode,

        value.detail?.ticketId,
        value.detail?.incidenciaId,
        value.detail?.id,
        value.detail?.code,
        value.detail?.ticketCode,

        value.ticket?.ticketId,
        value.ticket?.incidenciaId,
        value.ticket?.id,
        value.ticket?.code,
        value.ticket?.ticketCode,

        value.incidencia?.ticketId,
        value.incidencia?.incidenciaId,
        value.incidencia?.id,
        value.incidencia?.code,
        value.incidencia?.ticketCode,

        value.item?.ticketId,
        value.item?.incidenciaId,
        value.item?.id,
        value.item?.code,
        value.item?.ticketCode,

        value.raw?.ticketId,
        value.raw?.incidenciaId,
        value.raw?.id,
        value.raw?.code,
        value.raw?.ticketCode
      ),
      ""
    );
  }

  return safeText(value, "");
}

function normalizeCommentMessage(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

function emit(eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) return false;

  try {
    AppCore?.events?.emit?.(name, payload);
    return true;
  } catch {
    return false;
  }
}

function warn(...args) {
  try {
    AppCore?.utils?.warn?.("[IncidenciasActions]", ...args);
  } catch {}

  try {
    console.warn("[IncidenciasActions]", ...args);
  } catch {}
}

function getErrorMessage(error = null, fallback = "No se pudo completar la acción.") {
  return safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.data?.message,
      error?.response?.error,
      error?.response?.data?.error,
      error?.data?.error,
      error?.error,
      fallback
    ),
    fallback
  );
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=/i.test(
    String(value || "")
  );
}

function safeExternalUrl(value = "") {
  const raw = safeText(value, "");

  if (!raw) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (/^(?:javascript|vbscript|file):/i.test(raw)) return "";
  if (raw.startsWith("//")) return "";

  if (raw.startsWith("/")) {
    return raw.replace(/\/{2,}/g, "/");
  }

  if (/^https:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

function safeFilename(value = "", fallback = "archivo") {
  const name = safeText(value, fallback)
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return name || fallback;
}

function buildDatedFilename(base = CSV_FILENAME) {
  const clean = safeFilename(base, CSV_FILENAME);

  if (/\d{4}-\d{2}-\d{2}/.test(clean)) {
    return clean;
  }

  const today = new Date().toISOString().slice(0, 10);
  const extension = clean.includes(".") ? clean.split(".").pop() : "csv";
  const name = clean.endsWith(`.${extension}`)
    ? clean.slice(0, -(extension.length + 1))
    : clean;

  return `${name}_${today}.${extension}`;
}

/* =========================================================
   MODEL / STORE HELPERS
========================================================= */

function pickDetail(payload = null) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload[0] || null;

  const source = safeObject(payload);

  return first(
    source.ticket,
    source.detail,
    source.item,
    source.result,
    source.payload,
    source.incidencia,
    source.data,
    source
  );
}

function normalizeTicketDetail(detail = {}) {
  const picked = pickDetail(detail) || detail;
  return normalizeIncidenciaModel(picked);
}

function persistDetail(detail = null) {
  if (!detail) return null;

  const normalized = normalizeTicketDetail(detail);

  try {
    upsertIncidenciaStore?.(normalized);
  } catch (error) {
    warn("No se pudo persistir detalle en Store.", error);
  }

  return normalized;
}

function getAllStoreItems() {
  try {
    return sortIncidenciasByUpdatedDesc(getSortedIncidenciasStore());
  } catch {
    try {
      return safeArray(getSortedIncidenciasStore());
    } catch {
      return [];
    }
  }
}

/* =========================================================
   DATA PICKERS
========================================================= */

function getId(item = {}) {
  return safeText(
    first(
      item.ticketId,
      item.incidenciaId,
      item.id,
      item.code,
      item.ticketCode,
      item.raw?.ticketId,
      item.raw?.incidenciaId,
      item.raw?.id,
      item.raw?.code,
      item.raw?.ticketCode
    ),
    ""
  );
}

function getTitle(item = {}) {
  return safeText(
    first(
      item.title,
      item.subject,
      item.asunto,
      item.name,
      item.raw?.title,
      item.raw?.subject,
      item.raw?.asunto
    ),
    "Incidencia"
  );
}

function getDescription(item = {}) {
  return safeText(
    first(
      item.description,
      item.descripcion,
      item.message,
      item.preview,
      item.body,
      item.raw?.description,
      item.raw?.descripcion,
      item.raw?.message,
      item.raw?.preview
    ),
    "Sin descripción."
  );
}

function getClient(item = {}) {
  const clientObject = first(
    item.client,
    item.cliente,
    item.customer,
    item.receptor,
    item.requester,
    item.requesterSnapshot,
    item.raw?.client,
    item.raw?.cliente,
    item.raw?.customer,
    item.raw?.receptor,
    item.raw?.requester,
    item.raw?.requesterSnapshot
  );

  if (isObject(clientObject)) {
    return safeText(
      first(
        clientObject.name,
        clientObject.nombre,
        clientObject.company,
        clientObject.empresa,
        clientObject.displayName,
        clientObject.fullName
      ),
      "Cliente"
    );
  }

  return safeText(
    first(
      item.clientName,
      item.clienteNombre,
      item.company,
      item.empresa,
      item.name,
      clientObject
    ),
    "Cliente"
  );
}

function getEmail(item = {}) {
  const clientObject = first(
    item.client,
    item.cliente,
    item.customer,
    item.receptor,
    item.requester,
    item.requesterSnapshot,
    item.createdBy,
    item.raw?.client,
    item.raw?.cliente,
    item.raw?.customer,
    item.raw?.receptor,
    item.raw?.requester,
    item.raw?.requesterSnapshot,
    item.raw?.createdBy
  );

  if (isObject(clientObject)) {
    return safeText(first(clientObject.email, clientObject.emailLower, clientObject.mail), "");
  }

  return safeText(
    first(
      item.clientEmail,
      item.clienteEmail,
      item.email,
      item.raw?.clientEmail,
      item.raw?.clienteEmail,
      item.raw?.email
    ),
    ""
  );
}

function getAssigned(item = {}) {
  const assignment = safeObject(first(item.assignment, item.raw?.assignment));
  const assignedObject = first(
    item.technician,
    item.assignedTo,
    item.assignee,
    item.tecnico,
    item.agent,
    item.raw?.technician,
    item.raw?.assignedTo,
    item.raw?.assignee,
    item.raw?.tecnico,
    item.raw?.agent
  );

  if (isObject(assignedObject)) {
    return safeText(
      first(
        assignedObject.name,
        assignedObject.nombre,
        assignedObject.displayName,
        assignedObject.fullName
      ),
      "Equipo de soporte"
    );
  }

  return safeText(
    first(
      item.assignedToName,
      item.technicianName,
      item.tecnicoName,
      assignment.assignedToName,
      assignment.technicianName,
      assignment.name,
      assignedObject
    ),
    "Equipo de soporte"
  );
}

function getAssignedEmail(item = {}) {
  const assignment = safeObject(first(item.assignment, item.raw?.assignment));
  const assignedObject = first(
    item.technician,
    item.assignedTo,
    item.assignee,
    item.tecnico,
    item.agent,
    item.raw?.technician,
    item.raw?.assignedTo,
    item.raw?.assignee,
    item.raw?.tecnico,
    item.raw?.agent
  );

  if (isObject(assignedObject)) {
    return safeText(first(assignedObject.email, assignedObject.emailLower), "");
  }

  return safeText(
    first(
      item.assignedToEmail,
      item.technicianEmail,
      item.tecnicoEmail,
      assignment.assignedToEmail,
      assignment.technicianEmail,
      assignment.email,
      item.meta?.technicianEmail,
      item.raw?.assignedToEmail,
      item.raw?.technicianEmail,
      item.raw?.tecnicoEmail,
      item.raw?.meta?.technicianEmail
    ),
    ""
  );
}

function getStatus(item = {}) {
  return safeText(
    first(
      item.status,
      item.estado,
      item.raw?.status,
      item.raw?.estado
    ),
    "open"
  );
}

function getPriority(item = {}) {
  return safeText(
    first(
      item.priority,
      item.prioridad,
      item.raw?.priority,
      item.raw?.prioridad
    ),
    "medium"
  );
}

function getCreatedAt(item = {}) {
  return first(
    item.createdAt,
    item.createdAtES,
    item.fechaCreacion,
    item.date,
    item.raw?.createdAt,
    item.raw?.createdAtES,
    ""
  );
}

function getUpdatedAt(item = {}) {
  return first(
    item.lastActivityAt,
    item.updatedAt,
    item.closedAt,
    item.lastUpdate,
    item.modifiedAt,
    item.createdAt,
    item.raw?.lastActivityAt,
    item.raw?.updatedAt,
    item.raw?.closedAt,
    item.raw?.createdAt,
    ""
  );
}

function getCategory(item = {}) {
  return safeText(
    first(
      item.category,
      item.categoria,
      item.tipo,
      item.raw?.category,
      item.raw?.categoria,
      item.raw?.tipo
    ),
    "General"
  );
}

function getSource(item = {}) {
  return safeText(
    first(
      item.source,
      item.origen,
      item.channel,
      item.raw?.source,
      item.raw?.origen,
      item.raw?.channel
    ),
    "panel"
  );
}

function getTags(item = {}) {
  const raw = first(
    item.tags,
    item.labels,
    item.raw?.tags,
    item.raw?.labels
  );

  if (Array.isArray(raw)) {
    return raw.map((tag) => safeText(tag, "")).filter(Boolean);
  }

  if (typeof raw === "string") {
    return raw
      .split(/[,\s|;]+/g)
      .map((tag) => safeText(tag, ""))
      .filter(Boolean);
  }

  return [];
}

function getInvoiceNumber(item = {}) {
  return safeText(
    first(
      item.numeroFacturaLegal,
      item.numeroFactura,
      item.invoiceNumber,
      item.linkedInvoices?.numeroFacturaLegal,
      item.linkedInvoices?.numeroFactura,
      item.linkedInvoices?.invoiceNumber,
      item.billing?.numeroFacturaLegal,
      item.factura?.numeroFacturaLegal,
      item.invoice?.numeroFacturaLegal,
      item.raw?.numeroFacturaLegal,
      item.raw?.numeroFactura,
      item.raw?.invoiceNumber
    ),
    ""
  );
}

function getInvoiceAmount(item = {}) {
  return safeNumber(
    first(
      item.facturasTotal,
      item.invoicesTotal,
      item.importeFacturas,
      item.invoiceTotal,
      item.facturaTotal,
      item.facturaImporte,
      item.importeFactura,
      item.totalFactura,
      item.invoiceAmount,
      item.linkedInvoices?.total,
      item.linkedInvoices?.amount,
      item.linkedInvoices?.importe,
      item.billing?.total,
      item.billing?.amount,
      item.billing?.importe,
      item.meta?.invoiceTotal,
      item.meta?.invoicesTotal,
      item.total,
      item.amount,
      item.importe,
      item.raw?.facturasTotal,
      item.raw?.invoicesTotal,
      item.raw?.importeFacturas,
      item.raw?.invoiceTotal,
      item.raw?.facturaTotal,
      item.raw?.facturaImporte,
      item.raw?.importeFactura,
      item.raw?.totalFactura,
      item.raw?.invoiceAmount,
      item.raw?.linkedInvoices?.total,
      item.raw?.linkedInvoices?.amount,
      item.raw?.linkedInvoices?.importe,
      item.raw?.billing?.total,
      item.raw?.billing?.amount,
      item.raw?.billing?.importe,
      0
    ),
    0
  );
}

function getInvoiceCurrency(item = {}) {
  return safeText(
    first(
      item.currency,
      item.moneda,
      item.facturaCurrency,
      item.facturaMoneda,
      item.linkedInvoices?.currency,
      item.linkedInvoices?.moneda,
      item.billing?.currency,
      item.billing?.moneda,
      item.meta?.invoiceCurrency,
      item.raw?.currency,
      item.raw?.moneda,
      "EUR"
    ),
    "EUR"
  ).toUpperCase();
}

function getAttachments(item = {}) {
  return safeArray(
    first(
      item.attachments,
      item.files,
      item.adjuntos,
      item.raw?.attachments,
      item.raw?.files,
      item.raw?.adjuntos
    )
  ).map((file, index) => {
    const entry = safeObject(file);

    const name = safeText(
      first(
        entry.name,
        entry.filename,
        entry.fileName,
        entry.originalname,
        entry.originalName,
        entry.title
      ),
      `archivo_${index + 1}`
    );

    const path = safeText(
      first(
        entry.path,
        entry.storageKey,
        entry.storagePath,
        entry.blobPath,
        entry.blobName,
        entry.key
      ),
      ""
    );

    const id = safeText(
      first(
        entry.id,
        entry.fileId,
        entry.attachmentId,
        entry.storageKey,
        entry.path,
        entry.blobName,
        entry.key
      ),
      path || `attachment-${index + 1}`
    );

    return {
      ...entry,
      id,
      attachmentId: safeText(first(entry.attachmentId, id), id),
      name,
      filename: safeText(first(entry.filename, entry.fileName, entry.name), name),
      fileName: safeText(first(entry.fileName, entry.filename, entry.name), name),
      url: safeText(first(entry.viewUrl, entry.openUrl, entry.downloadUrl, entry.signedUrl, entry.url, entry.blobUrl, entry.publicUrl, entry.href), ""),
      viewUrl: safeText(first(entry.viewUrl, entry.openUrl, entry.signedUrl, entry.url), ""),
      openUrl: safeText(first(entry.openUrl, entry.viewUrl, entry.signedUrl, entry.url), ""),
      downloadUrl: safeText(first(entry.downloadUrl, entry.signedUrl, entry.url), ""),
      signedUrl: safeText(entry.signedUrl, ""),
      blobUrl: safeText(entry.blobUrl, ""),
      publicUrl: safeText(entry.publicUrl, ""),
      path,
      storageKey: safeText(first(entry.storageKey, entry.path, entry.storagePath, entry.blobPath, entry.blobName, entry.key), path),
      storagePath: safeText(first(entry.storagePath, path), path),
      blobPath: safeText(first(entry.blobPath, path), path),
      blobName: safeText(first(entry.blobName, path), path),
      size: safeNumber(first(entry.size, entry.sizeBytes, entry.contentLength), 0),
      sizeBytes: safeNumber(first(entry.sizeBytes, entry.size, entry.contentLength), 0),
      type: safeText(first(entry.type, entry.contentType, entry.mimetype, entry.mimeType, entry.mime), ""),
      contentType: safeText(first(entry.contentType, entry.mimetype, entry.mimeType, entry.mime), ""),
      uploadedAt: first(entry.uploadedAt, entry.createdAt, entry.date, null),
      raw: entry,
    };
  });
}

function getHistory(item = {}) {
  return safeArray(
    first(
      item.history,
      item.timeline,
      item.logs,
      item.raw?.history,
      item.raw?.timeline,
      item.raw?.logs
    )
  ).map((row) => safeObject(row));
}

function getComments(item = {}) {
  return safeArray(
    first(
      item.comments,
      item.notes,
      item.messages,
      item.raw?.comments,
      item.raw?.notes,
      item.raw?.messages
    )
  ).map((row) => safeObject(row));
}

/* =========================================================
   CSV / FILE HELPERS
========================================================= */

function escapeCsvCell(value = "") {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvRows(items = []) {
  const header = [
    "ticketId",
    "title",
    "description",
    "status",
    "priority",
    "category",
    "client",
    "email",
    "assignedTo",
    "assignedToEmail",
    "createdAt",
    "updatedAt",
    "numeroFacturaLegal",
    "importeFactura",
    "moneda",
    "attachmentsCount",
  ];

  const rows = safeArray(items).map((item) => {
    const normalized = normalizeTicketDetail(item);

    return [
      getId(normalized),
      getTitle(normalized),
      getDescription(normalized),
      getStatus(normalized),
      getPriority(normalized),
      getCategory(normalized),
      getClient(normalized),
      getEmail(normalized),
      getAssigned(normalized),
      getAssignedEmail(normalized),
      getCreatedAt(normalized) || "",
      getUpdatedAt(normalized) || "",
      getInvoiceNumber(normalized),
      getInvoiceAmount(normalized),
      getInvoiceCurrency(normalized),
      getAttachments(normalized).length,
    ];
  });

  return [
    header.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\n");
}

async function writeClipboardText(text = "") {
  const value = safeText(text, "");

  if (!value || !isBrowser()) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "readonly");
    textarea.setAttribute("aria-hidden", "true");
    textarea.className = "sr-only";

    document.body.appendChild(textarea);
    textarea.select();

    const ok = document.execCommand("copy");

    textarea.remove();

    return Boolean(ok);
  } catch {
    return false;
  }
}

function downloadTextFile({
  filename = CSV_FILENAME,
  content = "",
  mimeType = "text/plain;charset=utf-8;",
} = {}) {
  if (!isBrowser()) return false;

  const blob = new Blob([String(content || "")], {
    type: mimeType,
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = safeFilename(filename, CSV_FILENAME);
  anchor.rel = "noopener";
  anchor.className = "sr-only";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }, 30000);

  return true;
}

function openExternalUrl(url = "") {
  const target = safeExternalUrl(url);

  if (!target || typeof window === "undefined") return false;

  try {
    const opened = window.open(target, "_blank", "noopener,noreferrer");
    return Boolean(opened);
  } catch {
    return false;
  }
}

function downloadExternalUrl(url = "", filename = "") {
  const target = safeExternalUrl(url);

  if (!target || !isBrowser()) return false;

  try {
    const anchor = document.createElement("a");
    anchor.href = target;
    anchor.rel = "noopener";
    anchor.target = "_blank";

    if (filename) {
      anchor.download = safeFilename(filename, "archivo");
    }

    anchor.className = "sr-only";

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    return true;
  } catch {
    return openExternalUrl(target);
  }
}

/* =========================================================
   DETAIL ACTIONS
========================================================= */

export function getTicketDetailFromStoreAction({
  ticketId = "",
} = {}) {
  const id = normalizeTicketId(ticketId);

  if (!id) return null;

  try {
    const detail = getIncidenciaByIdStore(id);
    if (!detail) return null;

    return normalizeTicketDetail(detail);
  } catch {
    return null;
  }
}

export async function getTicketDetailAction({
  ticketId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const id = normalizeTicketId(ticketId);

  if (!id) {
    if (!silent) showToast("No se pudo resolver la incidencia.", "error");
    return null;
  }

  const fallbackStoreDetail = getTicketDetailFromStoreAction({
    ticketId: id,
  });

  if (!preferFresh && fallbackStoreDetail) {
    return fallbackStoreDetail;
  }

  emit("incidencias:detail:request", {
    ticketId: id,
    source: "backend",
  });

  try {
    const response = await getIncidenciaByIdRequest(id);
    const detail = pickDetail(response) || response;

    if (!detail) {
      if (fallbackStoreDetail) {
        emit("incidencias:detail:fallback", {
          ticketId: id,
          source: "store",
        });

        return fallbackStoreDetail;
      }

      throw new Error("EMPTY_TICKET_DETAIL");
    }

    const normalized = persistDetail(detail);

    emit("incidencias:detail:success", {
      ticketId: id,
      source: "backend",
      detail: normalized,
    });

    return normalized;
  } catch (error) {
    if (fallbackStoreDetail) {
      emit("incidencias:detail:fallback", {
        ticketId: id,
        source: "store",
        error,
      });

      return fallbackStoreDetail;
    }

    emit("incidencias:detail:error", {
      ticketId: id,
      error,
    });

    if (!silent) {
      showToast("No se pudo cargar el detalle de la incidencia.", "error");
    }

    return null;
  }
}

export async function openTicketAction({
  ticketId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const id = normalizeTicketId(ticketId);

  if (!id) {
    if (!silent) showToast("Incidencia inválida.", "error");
    return null;
  }

  emit("incidencias:open", {
    ticketId: id,
  });

  const detail = await getTicketDetailAction({
    ticketId: id,
    preferFresh,
    silent,
  });

  if (!detail) return null;

  emit("incidencias:open:success", {
    ticketId: id,
    detail,
  });

  return detail;
}

export async function refreshTicketDetailAction({
  ticketId = "",
  silent = true,
} = {}) {
  const id = normalizeTicketId(ticketId);

  const detail = await getTicketDetailAction({
    ticketId: id,
    preferFresh: true,
    silent,
  });

  if (detail) {
    emit("incidencias:detail:refresh:success", {
      detail,
      ticketId: id,
    });
  }

  return detail;
}

/* =========================================================
   CREATE / COMMENT / REOPEN
========================================================= */

export async function createIncidenciaAction(options = {}) {
  const input = safeObject(options);
  const data = safeObject(
    first(
      input.payload,
      input.draft,
      input.form,
      input
    ),
    null
  );

  const silent = Boolean(input.silent);

  if (!hasOwnKeys(data)) {
    if (!silent) {
      showToast("No hay datos para crear la incidencia.", "error");
    }

    return null;
  }

  emit("incidencias:create:start", {
    payload: data,
  });

  try {
    const created = await createIncidencia(data);
    const normalized = persistDetail(created);

    emit("incidencias:create:success", {
      detail: normalized,
      ticketId: getId(normalized || {}),
    });

    if (!silent) {
      showToast("Incidencia creada.", "success");
    }

    return normalized;
  } catch (error) {
    emit("incidencias:create:error", {
      error,
      payload: data,
    });

    if (!silent) {
      showToast(getErrorMessage(error, "No se pudo crear la incidencia."), "error");
    }

    return null;
  }
}

export async function commentTicketAction({
  ticketId = "",
  message = "",
  detail = null,
  status = "open",
  silent = false,
} = {}) {
  const id = normalizeTicketId(ticketId);
  const normalizedMessage = normalizeCommentMessage(message);

  if (!id) {
    if (!silent) showToast("No se pudo identificar la incidencia.", "error");
    return null;
  }

  if (!normalizedMessage) {
    if (!silent) showToast("Escribe un comentario antes de enviarlo.", "error");
    return null;
  }

  const currentDetail = detail || getTicketDetailFromStoreAction({ ticketId: id });
  const finalStatus = safeText(first(status, currentDetail?.status, currentDetail?.estado, "open"), "open");

  emit("incidencias:comment:start", {
    ticketId: id,
    message: normalizedMessage,
  });

  try {
    const updated = await commentIncidenciaRequest(id, normalizedMessage, {
      status: finalStatus,
    });

    const normalized = persistDetail(updated);

    emit("incidencias:comment:success", {
      ticketId: id,
      message: normalizedMessage,
      detail: normalized,
      source: "backend",
    });

    if (!silent) showToast("Actualización añadida.", "success");

    return normalized;
  } catch (error) {
    emit("incidencias:comment:error", {
      ticketId: id,
      message: normalizedMessage,
      error,
    });

    if (!silent) {
      showToast(getErrorMessage(error, "No se pudo añadir la actualización."), "error");
    }

    return null;
  }
}

function canReopenStatus(value = "") {
  const key = normalizeKey(value);

  return [
    "resolved",
    "resuelta",
    "resuelto",
    "closed",
    "cerrada",
    "cerrado",
    "cancelled",
    "cancelada",
    "cancelado",
    "archived",
    "archivada",
    "archivado",
  ].includes(key);
}

export async function reopenTicketAction({
  ticketId = "",
  detail = null,
  silent = false,
} = {}) {
  const id = normalizeTicketId(ticketId);

  if (!id) {
    if (!silent) showToast("No se pudo identificar la incidencia.", "error");
    return null;
  }

  const current = normalizeTicketDetail(
    detail ||
      getTicketDetailFromStoreAction({ ticketId: id }) ||
      { ticketId: id }
  );

  if (!canReopenStatus(current.status)) {
    return current;
  }

  emit("incidencias:reopen:start", {
    ticketId: id,
  });

  try {
    const updated = await reopenIncidenciaRequest(id);
    const normalized = persistDetail(updated);

    emit("incidencias:reopen:success", {
      ticketId: id,
      detail: normalized,
      source: "backend",
    });

    if (!silent) showToast("Incidencia reabierta.", "success");

    return normalized;
  } catch (error) {
    emit("incidencias:reopen:error", {
      ticketId: id,
      error,
    });

    if (!silent) {
      showToast(getErrorMessage(error, "No se pudo reabrir la incidencia."), "error");
    }

    return null;
  }
}

/* =========================================================
   ATTACHMENTS UPLOAD
========================================================= */

function isFileLike(value) {
  return (
    (typeof File !== "undefined" && value instanceof File) ||
    (typeof Blob !== "undefined" && value instanceof Blob)
  );
}

function dedupeFiles(files = []) {
  const map = new Map();

  safeArray(files).forEach((file, index) => {
    if (!isFileLike(file)) return;

    const key = [
      safeText(file.name, `blob-${index + 1}`),
      safeNumber(file.size, 0),
      safeNumber(file.lastModified, 0),
      safeText(file.type, ""),
    ].join("::");

    if (!map.has(key)) {
      map.set(key, file);
    }
  });

  return Array.from(map.values());
}

export async function uploadTicketAttachmentsAction({
  ticketId = "",
  files = [],
  detail = null,
  status = "open",
  silent = false,
} = {}) {
  const id = normalizeTicketId(ticketId);
  const finalFiles = dedupeFiles(files);

  if (!id) {
    if (!silent) showToast("No se pudo identificar la incidencia.", "error");
    return null;
  }

  if (!finalFiles.length) {
    if (!silent) showToast("Selecciona al menos un archivo.", "info");

    return normalizeTicketDetail(
      detail ||
        getTicketDetailFromStoreAction({ ticketId: id }) ||
        { ticketId: id }
    );
  }

  const finalStatus = safeText(first(status, detail?.status, detail?.estado, "open"), "open");

  emit("incidencias:upload:start", {
    ticketId: id,
    files: finalFiles,
    total: finalFiles.length,
  });

  try {
    const updated = await uploadIncidenciaAttachmentsRequest(id, finalFiles, {
      status: finalStatus,
    });

    const normalized = persistDetail(updated);

    emit("incidencias:upload:success", {
      ticketId: id,
      files: finalFiles,
      detail: normalized,
    });

    if (!silent) showToast("Archivos añadidos.", "success");

    return normalized;
  } catch (error) {
    emit("incidencias:upload:error", {
      ticketId: id,
      files: finalFiles,
      error,
    });

    if (!silent) {
      showToast(getErrorMessage(error, "No se pudieron subir los archivos."), "error");
    }

    return null;
  }
}

/* =========================================================
   ATTACHMENTS OPEN / DOWNLOAD
========================================================= */

function getAttachmentId(attachment = {}) {
  const item = safeObject(attachment);
  const raw = safeObject(item.raw);

  return safeText(
    first(
      item.id,
      item.fileId,
      item.attachmentId,
      item.storageKey,
      item.path,
      item.blobName,
      item.blobPath,
      item.key,
      raw.id,
      raw.fileId,
      raw.attachmentId,
      raw.storageKey,
      raw.path,
      raw.blobName,
      raw.blobPath,
      raw.key
    ),
    ""
  );
}

function getAttachmentName(attachment = {}) {
  const item = safeObject(attachment);
  const raw = safeObject(item.raw);

  return safeFilename(
    first(
      item.name,
      item.filename,
      item.fileName,
      item.originalname,
      item.originalName,
      raw.name,
      raw.filename,
      raw.fileName,
      raw.originalname,
      raw.originalName
    ),
    "archivo"
  );
}

function getDirectAttachmentUrl(attachment = {}, mode = "view") {
  const item = safeObject(attachment);
  const raw = safeObject(item.raw);

  if (mode === "download") {
    return safeExternalUrl(
      first(
        item.downloadUrl,
        item.signedUrl,
        item.url,
        item.viewUrl,
        item.openUrl,
        item.blobUrl,
        item.publicUrl,
        raw.downloadUrl,
        raw.signedUrl,
        raw.url,
        raw.viewUrl,
        raw.openUrl,
        raw.blobUrl,
        raw.publicUrl
      )
    );
  }

  return safeExternalUrl(
    first(
      item.viewUrl,
      item.openUrl,
      item.signedUrl,
      item.url,
      item.downloadUrl,
      item.blobUrl,
      item.publicUrl,
      raw.viewUrl,
      raw.openUrl,
      raw.signedUrl,
      raw.url,
      raw.downloadUrl,
      raw.blobUrl,
      raw.publicUrl
    )
  );
}

function normalizeAttachmentFileResponse(payload = {}, fallback = {}) {
  const source = safeObject(payload);
  const fallbackObj = safeObject(fallback);

  const file = safeObject(
    first(
      source.file,
      source.attachment,
      source.adjunto,
      source.data?.file,
      source.data?.attachment,
      source.data?.adjunto,
      source.payload?.file,
      source.payload?.attachment,
      source.payload?.adjunto,
      source.result?.file,
      source.result?.attachment,
      source.result?.adjunto,
      source
    )
  );

  const url = safeExternalUrl(
    first(
      file.url,
      file.viewUrl,
      file.openUrl,
      file.downloadUrl,
      file.signedUrl,
      file.blobUrl,
      file.publicUrl,
      fallbackObj.url,
      fallbackObj.viewUrl,
      fallbackObj.openUrl,
      fallbackObj.downloadUrl,
      fallbackObj.signedUrl,
      fallbackObj.blobUrl,
      fallbackObj.publicUrl
    )
  );

  return {
    ...fallbackObj,
    ...file,
    url,
    viewUrl: safeExternalUrl(first(file.viewUrl, file.openUrl, url)),
    openUrl: safeExternalUrl(first(file.openUrl, file.viewUrl, url)),
    downloadUrl: safeExternalUrl(first(file.downloadUrl, url)),
    signedUrl: safeExternalUrl(first(file.signedUrl, url)),
    filename: safeFilename(first(file.filename, file.fileName, file.name, fallbackObj.filename, fallbackObj.fileName, fallbackObj.name), getAttachmentName(fallbackObj)),
    fileName: safeFilename(first(file.fileName, file.filename, file.name, fallbackObj.fileName, fallbackObj.filename, fallbackObj.name), getAttachmentName(fallbackObj)),
    name: safeFilename(first(file.name, file.filename, file.fileName, fallbackObj.name, fallbackObj.filename, fallbackObj.fileName), getAttachmentName(fallbackObj)),
    contentType: safeText(first(file.contentType, file.mimeType, file.mimetype, fallbackObj.contentType, fallbackObj.mimeType, fallbackObj.mimetype), ""),
    raw: payload,
  };
}

export async function getTicketAttachmentFileAction({
  ticketId = "",
  attachment = {},
  attachmentId = "",
  mode = "view",
  silent = true,
} = {}) {
  const id = normalizeTicketId(ticketId);
  const finalAttachmentId = safeText(first(attachmentId, getAttachmentId(attachment)), "");
  const finalMode = mode === "download" ? "download" : "view";
  const directUrl = getDirectAttachmentUrl(attachment, finalMode);

  if (!id || !finalAttachmentId) {
    if (directUrl) {
      return normalizeAttachmentFileResponse({ url: directUrl }, attachment);
    }

    if (!silent) showToast("No se pudo identificar el adjunto.", "error");
    return null;
  }

  try {
    const response = await getIncidenciaAttachmentFileRequest({
      ticketId: id,
      attachmentId: finalAttachmentId,
      mode: finalMode,
      kind: "attachments",
    });

    const file = normalizeAttachmentFileResponse(response, attachment);

    if (!file.url) throw new Error("ATTACHMENT_URL_EMPTY");

    emit("incidencias:attachment:file", {
      ticketId: id,
      attachmentId: finalAttachmentId,
      mode: finalMode,
      file,
    });

    return file;
  } catch (error) {
    if (directUrl) {
      return normalizeAttachmentFileResponse({ url: directUrl }, attachment);
    }

    emit("incidencias:attachment:file:error", {
      ticketId: id,
      attachmentId: finalAttachmentId,
      mode: finalMode,
      error,
    });

    if (!silent) showToast("No se pudo resolver el adjunto.", "error");

    return null;
  }
}

export async function openTicketAttachmentAction({
  ticketId = "",
  attachment = {},
  attachmentId = "",
  detail = null,
  mode = "view",
  silent = true,
  autoOpen = true,
} = {}) {
  const file = await getTicketAttachmentFileAction({
    ticketId,
    attachment,
    attachmentId,
    mode: "view",
    silent,
  });

  if (!file?.url) return null;

  emit("incidencias:attachment:open", {
    ticketId: normalizeTicketId(ticketId),
    attachment,
    detail,
    file,
    mode,
  });

  if (autoOpen) {
    openExternalUrl(file.viewUrl || file.openUrl || file.url);
  }

  return file;
}

export async function downloadTicketAttachmentAction({
  ticketId = "",
  attachment = {},
  attachmentId = "",
  detail = null,
  mode = "download",
  silent = true,
  autoDownload = true,
} = {}) {
  const file = await getTicketAttachmentFileAction({
    ticketId,
    attachment,
    attachmentId,
    mode: "download",
    silent,
  });

  if (!file?.url) return null;

  emit("incidencias:attachment:download", {
    ticketId: normalizeTicketId(ticketId),
    attachment,
    detail,
    file,
    mode,
  });

  if (autoDownload) {
    downloadExternalUrl(
      file.downloadUrl || file.url,
      file.filename || file.fileName || file.name || "archivo"
    );
  }

  return file;
}

/* =========================================================
   COPY ID
========================================================= */

export async function copyTicketIdAction(options = {}) {
  const input = isObject(options)
    ? options
    : {
        ticketId: options,
      };

  const id = normalizeTicketId(input.ticketId || input);
  const silent = Boolean(input.silent);

  if (!id) {
    if (!silent) showToast("No hay referencia para copiar.", "error");
    return false;
  }

  const copied = await writeClipboardText(id);

  if (!copied) {
    if (!silent) showToast("No se pudo copiar la referencia.", "error");
    return false;
  }

  emit("incidencias:copy-id", {
    ticketId: id,
  });

  if (!silent) showToast("Referencia copiada", "success");

  return true;
}

/* =========================================================
   EXPORT CSV
========================================================= */

export function exportIncidenciasCsvAction({
  filename = CSV_FILENAME,
  items = null,
  silent = false,
} = {}) {
  const sourceItems = Array.isArray(items)
    ? items
    : getAllStoreItems();

  const list = sortIncidenciasByUpdatedDesc(
    safeArray(sourceItems).map(normalizeTicketDetail)
  );

  if (!list.length) {
    if (!silent) showToast("No hay incidencias para exportar.", "info");
    return false;
  }

  try {
    const csv = `${CSV_BOM}${buildCsvRows(list)}`;

    const downloaded = downloadTextFile({
      filename: buildDatedFilename(filename),
      content: csv,
      mimeType: "text/csv;charset=utf-8;",
    });

    if (!downloaded) throw new Error("CSV_DOWNLOAD_UNAVAILABLE");

    emit("incidencias:export:csv", {
      total: list.length,
      filename: buildDatedFilename(filename),
      order: "updated_desc",
    });

    if (!silent) showToast("Historial exportado", "success");

    return true;
  } catch (error) {
    emit("incidencias:export:error", {
      type: "csv",
      error,
    });

    if (!silent) showToast("No se pudo exportar el historial.", "error");

    return false;
  }
}

/* =========================================================
   PUBLIC ACTIONS
========================================================= */

export const OnionIncidenciasActions = Object.freeze({
  version: INCIDENCIAS_ACTIONS_VERSION,

  getTicketDetail: getTicketDetailAction,
  getTicketDetailFromStore: getTicketDetailFromStoreAction,
  openTicket: openTicketAction,
  refreshTicketDetail: refreshTicketDetailAction,

  createIncidencia: createIncidenciaAction,

  uploadTicketAttachments: uploadTicketAttachmentsAction,

  commentTicket: commentTicketAction,
  reopenTicket: reopenTicketAction,

  getTicketAttachmentFile: getTicketAttachmentFileAction,
  openTicketAttachment: openTicketAttachmentAction,
  downloadTicketAttachment: downloadTicketAttachmentAction,

  copyTicketId: copyTicketIdAction,
  exportCsv: exportIncidenciasCsvAction,
});

/* =========================================================
   DETAIL HELPERS EXPORT
========================================================= */

export {
  getId as getIncidenciaIdAction,
  getTitle as getIncidenciaTitleAction,
  getDescription as getIncidenciaDescriptionAction,
  getClient as getIncidenciaClientAction,
  getEmail as getIncidenciaEmailAction,
  getAssigned as getIncidenciaAssignedAction,
  getAssignedEmail as getIncidenciaAssignedEmailAction,
  getStatus as getIncidenciaStatusAction,
  getPriority as getIncidenciaPriorityAction,
  getCreatedAt as getIncidenciaCreatedAtAction,
  getUpdatedAt as getIncidenciaUpdatedAtAction,
  getAttachments as getIncidenciaAttachmentsAction,
  getHistory as getIncidenciaHistoryAction,
  getComments as getIncidenciaCommentsAction,
  getCategory as getIncidenciaCategoryAction,
  getSource as getIncidenciaSourceAction,
  getTags as getIncidenciaTagsAction,
  getInvoiceNumber as getIncidenciaInvoiceNumberAction,
  getInvoiceAmount as getIncidenciaInvoiceAmountAction,
  getInvoiceCurrency as getIncidenciaInvoiceCurrencyAction,
  normalizeTicketDetail as normalizeIncidenciaDetailAction,
};

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default OnionIncidenciasActions;
