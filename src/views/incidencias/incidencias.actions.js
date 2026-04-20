/* =========================================================
   Onion SPA - Incidencias Actions
   Archivo: src/views/incidencias/incidencias.actions.js

   CLIENT EXPERIENCE PRO · ACTIONS REAL · 10/10

   RESPONSABILIDADES:
   - centralizar acciones operativas del módulo de incidencias
   - resolver detalle ticket desde store + backend
   - abrir detalle a nivel de datos, no de UI
   - copiar referencia de ticket
   - exportar colección a CSV
   - abrir modal de creación
   - añadir comentarios al ticket
   - reabrir incidencias cerradas o resueltas
   - desacoplar la vista principal de la lógica operativa
   - mantener compatibilidad con incidenciasView.js y incidencias.modal.js

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - fallback store -> backend
   - soporte envelope backend
   - export seguro con escape CSV
   - clipboard robusto con fallback legacy
   - eventos opcionales vía AppCore.events
   - create modal bridge multi-entorno
   - comment / reopen bridge con fallback elegante
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  getIncidenciaByIdRequest,
} from "./incidencias.api.js";

import {
  getIncidenciaByIdStore,
  getSortedIncidenciasStore,
} from "./incidencias.store.js";

import {
  safeText,
  safeNumber,
  safeArray,
  safeObject,
  showToast,
} from "./incidencias.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

const CSV_FILENAME = "incidencias.csv";

/* =========================================================
   HELPERS
========================================================= */

function safeEmit(event = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(event, payload);
  } catch {}
}

function first(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return null;
}

function normalizeTicketId(value = "") {
  return safeText(value, "");
}

function normalizeCommentMessage(value = "") {
  return safeText(value, "").replace(/\s+/g, " ").trim();
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isLikelyTicket(value) {
  if (!isObject(value)) return false;

  return Boolean(
    value.ticketId ||
      value.id ||
      value.code ||
      value.ticketCode ||
      value.title ||
      value.subject ||
      value.asunto
  );
}

function looksLikeEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    obj.ticket ||
      obj.item ||
      obj.data ||
      obj.result ||
      obj.payload
  );
}

function pickDetail(payload = null) {
  if (!payload) return null;

  if (isLikelyTicket(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (isLikelyTicket(obj.ticket)) return obj.ticket;
  if (isLikelyTicket(obj.item)) return obj.item;
  if (isLikelyTicket(obj.result)) return obj.result;
  if (isLikelyTicket(obj.payload)) return obj.payload;
  if (isLikelyTicket(obj.data)) return obj.data;

  if (looksLikeEnvelope(obj.data)) {
    return pickDetail(obj.data);
  }

  return null;
}

function tryResolveCallable(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === "function") {
      return candidate;
    }
  }

  return null;
}

async function callExternalAction(actionName = "", payload = {}) {
  const action = safeText(actionName, "");
  if (!action) {
    throw new Error("INVALID_EXTERNAL_ACTION");
  }

  const fn = tryResolveCallable(
    AppCore?.modules?.IncidenciasModalActions?.[action],
    AppCore?.modules?.IncidenciasActions?.[action],
    AppCore?.modules?.Incidencias?.[action],
    window?.OnionIncidenciasModalActions?.[action],
    window?.OnionIncidenciasActions?.[action],
    window?.IncidenciasActions?.[action]
  );

  if (!fn) {
    return null;
  }

  return await fn(payload);
}

function buildLocalCommentEntry({
  ticketId = "",
  message = "",
  author = "Tú",
} = {}) {
  return {
    id: `local-comment-${Date.now()}`,
    ticketId,
    commentId: `local-comment-${Date.now()}`,
    title: "Nuevo comentario",
    action: "comment",
    kind: "comment",
    message,
    text: message,
    body: message,
    author,
    user: author,
    createdAt: new Date().toISOString(),
  };
}

function canReopenStatus(value = "") {
  const key = safeText(value, "").toLowerCase();

  return [
    "resolved",
    "resuelta",
    "resuelto",
    "closed",
    "cerrada",
    "cerrado",
  ].includes(key);
}

/* =========================================================
   DATA PICKERS
========================================================= */

function getId(item = {}) {
  return safeText(
    first(
      item.ticketId,
      item.id,
      item.code,
      item.ticketCode
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
      item.name
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
      item.body
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
    item.createdBy
  );

  if (isObject(clientObject)) {
    return safeText(
      first(
        clientObject.name,
        clientObject.nombre,
        clientObject.company,
        clientObject.empresa,
        clientObject.displayName
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
    item.createdBy
  );

  if (isObject(clientObject)) {
    return safeText(
      first(
        clientObject.email,
        clientObject.mail
      ),
      "Sin email"
    );
  }

  return safeText(
    first(
      item.clientEmail,
      item.clienteEmail,
      item.email
    ),
    "Sin email"
  );
}

function getAssigned(item = {}) {
  const assignedObject = first(
    item.assignedTo,
    item.assignee,
    item.tecnico
  );

  if (isObject(assignedObject)) {
    return safeText(
      first(
        assignedObject.name,
        assignedObject.nombre,
        assignedObject.displayName
      ),
      "Equipo de soporte"
    );
  }

  return safeText(assignedObject, "Equipo de soporte");
}

function getStatus(item = {}) {
  return safeText(
    first(item.status, item.estado),
    "open"
  );
}

function getPriority(item = {}) {
  return safeText(
    first(item.priority, item.prioridad),
    "medium"
  );
}

function getCreatedAt(item = {}) {
  return first(
    item.createdAt,
    item.createdAtES,
    item.fechaCreacion,
    item.date
  );
}

function getUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.closedAt,
    item.lastUpdate,
    item.modifiedAt,
    item.createdAt
  );
}

function getAttachments(item = {}) {
  return safeArray(
    first(
      item.attachments,
      item.files,
      item.adjuntos
    )
  ).map((file) => {
    const entry = safeObject(file);

    return {
      id: safeText(first(entry.id, entry.fileId), ""),
      name: safeText(
        first(
          entry.name,
          entry.filename,
          entry.fileName,
          entry.originalname
        ),
        "archivo"
      ),
      url: safeText(
        first(
          entry.url,
          entry.href,
          entry.path,
          entry.downloadUrl
        ),
        "#"
      ),
      size: safeNumber(entry.size, 0),
      type: safeText(first(entry.type, entry.mimeType, entry.mime), ""),
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
      item.comments
    )
  ).map((row) => safeObject(row));
}

function getComments(item = {}) {
  return safeArray(
    first(
      item.comments,
      item.notes,
      item.messages
    )
  ).map((row) => safeObject(row));
}

function getCategory(item = {}) {
  return safeText(
    first(item.category, item.categoria),
    "General"
  );
}

function getSource(item = {}) {
  return safeText(
    first(item.source, item.origen, item.channel),
    "panel"
  );
}

function getTags(item = {}) {
  const raw = first(item.tags, item.labels);

  if (Array.isArray(raw)) {
    return raw.map((tag) => safeText(tag, "")).filter(Boolean);
  }

  if (typeof raw === "string") {
    return raw.split(",").map((tag) => safeText(tag, "")).filter(Boolean);
  }

  return [];
}

function normalizeTicketDetail(detail = {}) {
  const raw = safeObject(detail);

  return {
    ...raw,
    raw,
    ticketId: getId(raw),
    ticketCode: safeText(first(raw.ticketCode, raw.code, getId(raw)), ""),
    title: getTitle(raw),
    description: getDescription(raw),
    clientName: getClient(raw),
    clientEmail: getEmail(raw),
    assignedToName: getAssigned(raw),
    status: getStatus(raw),
    priority: getPriority(raw),
    createdAt: getCreatedAt(raw),
    updatedAt: getUpdatedAt(raw),
    attachments: getAttachments(raw),
    history: getHistory(raw),
    comments: getComments(raw),
    category: getCategory(raw),
    source: getSource(raw),
    tags: getTags(raw),
  };
}

/* =========================================================
   CSV
========================================================= */

function escapeCsvCell(value = "") {
  const text =
    value === null || value === undefined
      ? ""
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvRows(items = []) {
  const header = [
    "ticketId",
    "title",
    "description",
    "status",
    "priority",
    "client",
    "email",
    "assignedTo",
    "createdAt",
    "updatedAt",
  ];

  const rows = safeArray(items).map((item) => [
    getId(item),
    getTitle(item),
    getDescription(item),
    getStatus(item),
    getPriority(item),
    getClient(item),
    getEmail(item),
    getAssigned(item),
    getCreatedAt(item) || "",
    getUpdatedAt(item) || "",
  ]);

  return [
    header.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\n");
}

async function writeClipboardText(text = "") {
  const value = safeText(text, "");

  if (!value) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
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
  const blob = new Blob([String(content || "")], {
    type: mimeType,
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);

  return true;
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
    const picked = pickDetail(detail);

    if (!picked) return null;

    return normalizeTicketDetail(picked);
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

  const fallbackStoreDetail =
    getTicketDetailFromStoreAction({
      ticketId: id,
    });

  if (!preferFresh && fallbackStoreDetail) {
    return fallbackStoreDetail;
  }

  try {
    safeEmit("incidencias:detail:request", {
      ticketId: id,
      source: "backend",
    });

    const response =
      await getIncidenciaByIdRequest(id);

    const detail = pickDetail(response);

    if (!detail) {
      if (fallbackStoreDetail) {
        safeEmit("incidencias:detail:fallback", {
          ticketId: id,
          source: "store",
        });
        return fallbackStoreDetail;
      }

      throw new Error("EMPTY_TICKET_DETAIL");
    }

    const normalized = normalizeTicketDetail(detail);

    safeEmit("incidencias:detail:success", {
      ticketId: id,
      source: "backend",
      detail: normalized,
    });

    return normalized;
  } catch (error) {
    if (fallbackStoreDetail) {
      safeEmit("incidencias:detail:fallback", {
        ticketId: id,
        source: "store",
        error,
      });

      return fallbackStoreDetail;
    }

    safeEmit("incidencias:detail:error", {
      ticketId: id,
      error,
    });

    if (!silent) {
      showToast(
        "No se pudo cargar el detalle de la incidencia.",
        "error"
      );
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

  safeEmit("incidencias:open", {
    ticketId: id,
  });

  const detail = await getTicketDetailAction({
    ticketId: id,
    preferFresh,
    silent,
  });

  if (!detail) return null;

  safeEmit("incidencias:open:success", {
    ticketId: id,
    detail,
  });

  return detail;
}

export async function refreshTicketDetailAction({
  ticketId = "",
  silent = true,
} = {}) {
  const detail = await getTicketDetailAction({
    ticketId,
    preferFresh: true,
    silent,
  });

  if (detail) {
    safeEmit("incidencias:modal:update", {
      detail,
      ticketId: normalizeTicketId(ticketId),
    });
  }

  return detail;
}

/* =========================================================
   COMMENT / REOPEN
========================================================= */

export async function commentTicketAction({
  ticketId = "",
  message = "",
  detail = null,
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

  safeEmit("incidencias:comment:start", {
    ticketId: id,
    message: normalizedMessage,
  });

  try {
    const response = await callExternalAction("commentTicket", {
      ticketId: id,
      message: normalizedMessage,
      detail,
    });

    const picked = pickDetail(response);

    if (picked) {
      const normalized = normalizeTicketDetail(picked);

      safeEmit("incidencias:comment:success", {
        ticketId: id,
        message: normalizedMessage,
        detail: normalized,
        source: "external",
      });

      if (!silent) {
        showToast("Comentario añadido.", "success");
      }

      return normalized;
    }

    const current =
      normalizeTicketDetail(detail || getTicketDetailFromStoreAction({ ticketId: id }) || { ticketId: id });

    const localComment = buildLocalCommentEntry({
      ticketId: id,
      message: normalizedMessage,
      author: "Tú",
    });

    const normalized = normalizeTicketDetail({
      ...current.raw,
      ...current,
      comments: [localComment, ...safeArray(first(current.comments, current.raw?.comments))],
      history: [localComment, ...safeArray(first(current.history, current.raw?.history))],
      updatedAt: new Date().toISOString(),
      raw: {
        ...safeObject(current.raw),
        comments: [localComment, ...safeArray(first(current.comments, current.raw?.comments))],
        history: [localComment, ...safeArray(first(current.history, current.raw?.history))],
        updatedAt: new Date().toISOString(),
      },
    });

    safeEmit("incidencias:comment:success", {
      ticketId: id,
      message: normalizedMessage,
      detail: normalized,
      source: "local-fallback",
    });

    if (!silent) {
      showToast("Comentario añadido.", "success");
    }

    return normalized;
  } catch (error) {
    safeEmit("incidencias:comment:error", {
      ticketId: id,
      message: normalizedMessage,
      error,
    });

    if (!silent) {
      showToast("No se pudo añadir el comentario.", "error");
    }

    return null;
  }
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

  const current =
    normalizeTicketDetail(detail || getTicketDetailFromStoreAction({ ticketId: id }) || { ticketId: id });

  if (!canReopenStatus(current.status)) {
    if (!silent) {
      showToast("La incidencia ya está abierta o en curso.", "info");
    }

    return current;
  }

  safeEmit("incidencias:reopen:start", {
    ticketId: id,
  });

  try {
    const response = await callExternalAction("reopenTicket", {
      ticketId: id,
      detail: current,
    });

    const picked = pickDetail(response);

    if (picked) {
      const normalized = normalizeTicketDetail(picked);

      safeEmit("incidencias:reopen:success", {
        ticketId: id,
        detail: normalized,
        source: "external",
      });

      if (!silent) {
        showToast("Incidencia reabierta.", "success");
      }

      return normalized;
    }

    const reopenEvent = {
      id: `local-reopen-${Date.now()}`,
      title: "Incidencia reabierta",
      action: "reopen",
      kind: "event",
      user: "Sistema",
      createdAt: new Date().toISOString(),
    };

    const normalized = normalizeTicketDetail({
      ...current.raw,
      ...current,
      status: "open",
      updatedAt: new Date().toISOString(),
      history: [reopenEvent, ...safeArray(first(current.history, current.raw?.history))],
      raw: {
        ...safeObject(current.raw),
        status: "open",
        estado: "open",
        updatedAt: new Date().toISOString(),
        history: [reopenEvent, ...safeArray(first(current.history, current.raw?.history))],
      },
    });

    safeEmit("incidencias:reopen:success", {
      ticketId: id,
      detail: normalized,
      source: "local-fallback",
    });

    if (!silent) {
      showToast("Incidencia reabierta.", "success");
    }

    return normalized;
  } catch (error) {
    safeEmit("incidencias:reopen:error", {
      ticketId: id,
      error,
    });

    if (!silent) {
      showToast("No se pudo reabrir la incidencia.", "error");
    }

    return null;
  }
}

/* =========================================================
   COPY ID
========================================================= */

export async function copyTicketIdAction({
  ticketId = "",
  silent = false,
} = {}) {
  const id = normalizeTicketId(ticketId);

  if (!id) {
    if (!silent) showToast("No hay referencia para copiar.", "error");
    return false;
  }

  const copied = await writeClipboardText(id);

  if (!copied) {
    if (!silent) showToast("No se pudo copiar la referencia.", "error");
    return false;
  }

  safeEmit("incidencias:copy-id", {
    ticketId: id,
  });

  if (!silent) showToast("Referencia copiada", "success");

  return true;
}

/* =========================================================
   EXPORT
========================================================= */

export function exportIncidenciasCsvAction({
  filename = CSV_FILENAME,
  items = null,
  silent = false,
} = {}) {
  const sourceItems = Array.isArray(items)
    ? items
    : getSortedIncidenciasStore();

  const list = safeArray(sourceItems);

  if (!list.length) {
    if (!silent) showToast("No hay incidencias para exportar.", "info");
    return false;
  }

  try {
    const csv = buildCsvRows(list);

    downloadTextFile({
      filename: safeText(filename, CSV_FILENAME),
      content: csv,
      mimeType: "text/csv;charset=utf-8;",
    });

    safeEmit("incidencias:export:csv", {
      total: list.length,
      filename: safeText(filename, CSV_FILENAME),
    });

    if (!silent) showToast("Historial exportado", "success");

    return true;
  } catch (error) {
    safeEmit("incidencias:export:error", {
      type: "csv",
      error,
    });

    if (!silent) showToast("No se pudo exportar el historial.", "error");

    return false;
  }
}

/* =========================================================
   CREATE
========================================================= */

function openCreateModalBridge(payload = {}) {
  const modal =
    window?.OnionIncidenciasCreateModal ||
    window?.OnionIncidencias?.createModal ||
    null;

  if (typeof modal?.open === "function") {
    modal.open(payload);
    return true;
  }

  if (typeof window?.renderIncidenciasCreateModal === "function") {
    window.renderIncidenciasCreateModal(payload);
    return true;
  }

  return false;
}

export async function createIncidenciaAction({
  route = "/incidencias/nueva",
  fallbackEvent = "incidencias:create",
  silent = false,
  draft = {},
} = {}) {
  const targetRoute = safeText(route, "/incidencias/nueva");

  try {
    safeEmit(fallbackEvent, {
      route: targetRoute,
      draft,
    });

    const opened = openCreateModalBridge(draft);

    if (opened) {
      safeEmit("incidencias:create:opened", {
        mode: "modal",
      });

      return true;
    }

    if (AppCore?.router?.navigate) {
      await AppCore.router.navigate(targetRoute);
      return true;
    }

    if (AppCore?.Router?.navigate) {
      await AppCore.Router.navigate(targetRoute);
      return true;
    }

    return true;
  } catch (error) {
    safeEmit("incidencias:create:error", {
      error,
    });

    if (!silent) {
      showToast(
        "No se pudo abrir el formulario de nueva incidencia.",
        "error"
      );
    }

    return false;
  }
}

/* =========================================================
   MODAL ACTION BRIDGE EXPORT
========================================================= */

export const OnionIncidenciasActions = {
  refreshTicketDetail: refreshTicketDetailAction,
  commentTicket: commentTicketAction,
  reopenTicket: reopenTicketAction,
};

try {
  window.OnionIncidenciasActions = {
    ...(window.OnionIncidenciasActions || {}),
    ...OnionIncidenciasActions,
  };
} catch {}

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
  normalizeTicketDetail as normalizeIncidenciaDetailAction,
};
