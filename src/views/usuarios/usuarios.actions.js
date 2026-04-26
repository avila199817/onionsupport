/* =========================================================
   Onion SPA - Usuarios Actions
   Archivo: src/views/usuarios/usuarios.actions.js

   FINAL PRO SYSTEM · ACTIONS LAYER · ADMIN USERS · 10/10

   RESPONSABILIDADES:
   - centralizar acciones operativas del módulo usuarios
   - resolver detalle usuario desde store + backend
   - abrir detalle a nivel de datos, no de UI
   - copiar id de usuario
   - exportar colección a CSV
   - refrescar detalle usuario
   - abrir modal de creación de usuario
   - submit opcional de creación contra API
   - desacoplar la vista principal de la lógica operativa
   - mantener compatibilidad con usuariosView.js

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - fallback store -> backend
   - soporte envelope backend
   - export seguro con escape CSV
   - clipboard robusto con fallback legacy
   - eventos opcionales vía AppCore.events + window CustomEvent
   - apertura híbrida de modal: global bridge + event bus
   - no depende de usuarios.utils.js
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  getUsuarioByIdRequest,
  loadUsuarioDetail,
  createUsuario,
} from "./usuarios.api.js";

import {
  getUsuarioByIdStore,
  getSortedUsuariosStore,
  upsertUsuarioStore,
} from "./usuarios.store.js";

import {
  normalizeUsuarioModel,
  findUsuarioById,
} from "./usuarios.model.js";

/* =========================================================
   CONSTANTS
========================================================= */

const CSV_FILENAME = "usuarios.csv";

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function isMeaningfulValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;

  return true;
}

function first(...values) {
  for (const value of values) {
    if (!isMeaningfulValue(value)) continue;
    return value;
  }

  return null;
}

function normalizeIdentity(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/* =========================================================
   CORE BRIDGES
========================================================= */

function safeEmit(event = "", payload = {}) {
  const eventName = safeText(event, "");
  if (!eventName) return false;

  let emitted = false;

  try {
    AppCore?.events?.emit?.(eventName, payload);
    emitted = true;
  } catch {}

  try {
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: payload,
      })
    );
    emitted = true;
  } catch {}

  return emitted;
}

function showToast(message = "", type = "info") {
  const text = safeText(message, "");
  if (!text) return;

  try {
    if (typeof AppCore?.toast?.[type] === "function") {
      AppCore.toast[type](text);
      return;
    }
  } catch {}

  try {
    AppCore?.toast?.show?.(text, type);
    return;
  } catch {}

  try {
    AppCore?.ui?.toast?.[type]?.(text);
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[UsuariosActions]", ...args);
  } catch {}
}

/* =========================================================
   DETAIL PICKERS
========================================================= */

function looksLikeUsuario(value = null) {
  const obj = safeObject(value);

  return Boolean(
    obj.userId ||
      obj.usuarioId ||
      obj.id ||
      obj.code ||
      obj.username ||
      obj.userName ||
      obj.name ||
      obj.nombre ||
      obj.fullName ||
      obj.displayName ||
      obj.email ||
      obj.mail ||
      obj.usuario ||
      obj.profile
  );
}

function pickDetail(payload = null) {
  if (!payload) return null;

  if (Array.isArray(payload)) {
    return payload[0] || null;
  }

  if (looksLikeUsuario(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  const candidates = [
    obj.user,
    obj.usuario,
    obj.item,
    obj.result,
    obj.payload,
    obj.data,
    obj.response,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (Array.isArray(candidate)) {
      if (candidate[0]) return candidate[0];
      continue;
    }

    if (looksLikeUsuario(candidate)) {
      return candidate;
    }

    const nested = pickDetail(candidate);

    if (nested) {
      return nested;
    }
  }

  return Object.keys(obj).length ? obj : null;
}

function normalizeUsuarioId(value = "") {
  return safeText(value, "");
}

function normalizeUsuarioDetail(detail = {}) {
  const raw = pickDetail(detail) || detail;
  return normalizeUsuarioModel(raw);
}

/* =========================================================
   FIELD RESOLVERS
========================================================= */

function getId(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return safeText(
    first(
      row.userId,
      row.usuarioId,
      row.id,
      row.code,
      row.username,
      row.userName,
      row.email,
      raw.userId,
      raw.usuarioId,
      raw.id,
      raw.code,
      raw.username,
      raw.userName,
      raw.email
    ),
    ""
  );
}

function getUsername(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return safeText(
    first(
      row.username,
      row.userName,
      raw.username,
      raw.userName,
      getId(row)
    ),
    "Sin username"
  );
}

function getName(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return safeText(
    first(
      row.name,
      row.nombre,
      row.fullName,
      row.displayName,
      raw.name,
      raw.nombre,
      raw.fullName,
      raw.displayName,
      getUsername(row)
    ),
    "Usuario"
  );
}

function getEmail(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return safeText(
    first(
      row.email,
      row.mail,
      row.userEmail,
      raw.email,
      raw.mail,
      raw.userEmail
    ),
    "Sin email"
  );
}

function getPhone(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return safeText(
    first(
      row.phone,
      row.telefono,
      row.mobile,
      raw.phone,
      raw.telefono,
      raw.mobile
    ),
    "Sin teléfono"
  );
}

function getCity(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return safeText(
    first(
      row.city,
      row.ciudad,
      row.locationCity,
      raw.city,
      raw.ciudad,
      raw.locationCity,
      raw?.location?.city,
      raw?.ubicacion?.ciudad,
      raw?.address?.city,
      raw?.direccion?.ciudad
    ),
    "Sin ciudad"
  );
}

function getStatus(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return safeText(
    first(
      row.status,
      row.estado,
      row.state,
      raw.status,
      raw.estado,
      raw.state
    ),
    "active"
  );
}

function getStatusLabel(item = {}) {
  const row = safeObject(item);

  return safeText(
    first(
      row.statusLabel,
      row.estadoLabel,
      getStatus(row)
    ),
    "Activo"
  );
}

function getCreatedAt(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return first(
    row.createdAt,
    row.created_at,
    row.fechaCreacion,
    row.fechaAlta,
    raw.createdAt,
    raw.created_at,
    raw.fechaCreacion,
    raw.fechaAlta
  );
}

function getUpdatedAt(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return first(
    row.updatedAt,
    row.updated_at,
    row.modifiedAt,
    row.lastUpdate,
    raw.updatedAt,
    raw.updated_at,
    raw.modifiedAt,
    raw.lastUpdate,
    getCreatedAt(row)
  );
}

function getLastLoginAt(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return first(
    row.lastLoginAt,
    row.last_login_at,
    row.lastAccessAt,
    row.ultimoAcceso,
    raw.lastLoginAt,
    raw.last_login_at,
    raw.lastAccessAt,
    raw.ultimoAcceso
  );
}

function getNotes(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return safeText(
    first(
      row.notes,
      row.note,
      row.notas,
      row.descripcion,
      row.description,
      raw.notes,
      raw.note,
      raw.notas,
      raw.descripcion,
      raw.description
    ),
    ""
  );
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
  /*
    Sin columna rol/equipo/contacto duplicado.
    Export alineado con la vista:
    usuario + estado + alta + email + ciudad + última conexión.
  */
  const header = [
    "userId",
    "username",
    "name",
    "email",
    "phone",
    "city",
    "status",
    "statusLabel",
    "createdAt",
    "updatedAt",
    "lastLoginAt",
  ];

  const rows = safeArray(items).map((item) => [
    getId(item),
    getUsername(item),
    getName(item),
    getEmail(item),
    getPhone(item),
    getCity(item),
    getStatus(item),
    getStatusLabel(item),
    getCreatedAt(item) || "",
    getUpdatedAt(item) || "",
    getLastLoginAt(item) || "",
  ]);

  return [
    header.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\n");
}

/* =========================================================
   CLIPBOARD / DOWNLOAD
========================================================= */

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
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";

    document.body.appendChild(textarea);

    textarea.focus();
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
  try {
    const blob = new Blob(
      [String(content || "")],
      { type: mimeType }
    );

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   DETAIL ACTIONS
========================================================= */

export function getUsuarioDetailFromStoreAction({
  userId = "",
} = {}) {
  const id = normalizeUsuarioId(userId);

  if (!id) return null;

  try {
    const items = getSortedUsuariosStore();
    const found =
      findUsuarioById(items, id) ||
      getUsuarioByIdStore(id);

    const picked = pickDetail(found);

    if (!picked) return null;

    return normalizeUsuarioDetail(picked);
  } catch {
    return null;
  }
}

export async function getUsuarioDetailAction({
  userId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const id = normalizeUsuarioId(userId);

  if (!id) {
    if (!silent) {
      showToast("No se pudo resolver el usuario.", "error");
    }

    return null;
  }

  const fallbackStoreDetail = getUsuarioDetailFromStoreAction({
    userId: id,
  });

  if (!preferFresh && fallbackStoreDetail) {
    return fallbackStoreDetail;
  }

  try {
    safeEmit("usuarios:detail:request", {
      userId: id,
      source: "backend",
    });

    let detail = null;

    try {
      detail = await loadUsuarioDetail(id);
    } catch {
      detail = await getUsuarioByIdRequest(id);
    }

    const picked = pickDetail(detail);

    if (!picked) {
      if (fallbackStoreDetail) {
        return fallbackStoreDetail;
      }

      throw new Error("EMPTY_USER_DETAIL");
    }

    const normalized = normalizeUsuarioDetail(picked);

    try {
      upsertUsuarioStore(normalized);
    } catch {}

    safeEmit("usuarios:detail:success", {
      userId: id,
      detail: normalized,
    });

    return normalized;
  } catch (error) {
    safeWarn("getUsuarioDetailAction falló:", error);

    if (fallbackStoreDetail) {
      safeEmit("usuarios:detail:fallback", {
        userId: id,
        detail: fallbackStoreDetail,
      });

      return fallbackStoreDetail;
    }

    if (!silent) {
      showToast("No se pudo cargar el detalle del usuario.", "error");
    }

    safeEmit("usuarios:detail:error", {
      userId: id,
      error,
    });

    return null;
  }
}

export async function openUsuarioAction({
  userId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const detail = await getUsuarioDetailAction({
    userId,
    preferFresh,
    silent,
  });

  if (!detail) return null;

  safeEmit("usuarios:open", {
    userId: detail.userId || detail.id || userId,
    detail,
  });

  return detail;
}

/* =========================================================
   REFRESH DETAIL
========================================================= */

export async function refreshUsuarioDetailAction({
  userId = "",
  silent = false,
} = {}) {
  const detail = await getUsuarioDetailAction({
    userId,
    preferFresh: true,
    silent,
  });

  if (!detail) return null;

  safeEmit("usuarios:detail:refresh", {
    userId: detail.userId || detail.id || userId,
    detail,
  });

  return detail;
}

/* =========================================================
   COPY ID
========================================================= */

export async function copyUsuarioIdAction({
  userId = "",
  silent = false,
} = {}) {
  const id = normalizeUsuarioId(userId);

  if (!id) {
    if (!silent) {
      showToast("No hay ID para copiar.", "error");
    }

    return false;
  }

  const copied = await writeClipboardText(id);

  if (!copied) {
    if (!silent) {
      showToast("No se pudo copiar el ID.", "error");
    }

    return false;
  }

  safeEmit("usuarios:id:copied", {
    userId: id,
  });

  if (!silent) {
    showToast("ID copiado", "success");
  }

  return true;
}

/* =========================================================
   EXPORT CSV
========================================================= */

export function exportUsuariosCsvAction({
  filename = CSV_FILENAME,
  items = null,
  silent = false,
} = {}) {
  const sourceItems = Array.isArray(items)
    ? items
    : getSortedUsuariosStore();

  const list = safeArray(sourceItems);

  if (!list.length) {
    if (!silent) {
      showToast("No hay usuarios para exportar.", "info");
    }

    return false;
  }

  try {
    const csv = buildCsvRows(list);

    const ok = downloadTextFile({
      filename: safeText(filename, CSV_FILENAME),
      content: csv,
      mimeType: "text/csv;charset=utf-8;",
    });

    if (!ok) {
      throw new Error("CSV_DOWNLOAD_FAILED");
    }

    safeEmit("usuarios:export:success", {
      filename,
      count: list.length,
    });

    if (!silent) {
      showToast("CSV exportado", "success");
    }

    return true;
  } catch (error) {
    safeWarn("exportUsuariosCsvAction falló:", error);

    safeEmit("usuarios:export:error", {
      error,
    });

    if (!silent) {
      showToast("No se pudo exportar el CSV.", "error");
    }

    return false;
  }
}

/* =========================================================
   CREATE MODAL
========================================================= */

function openCreateModalBridge(draft = {}) {
  const safeDraft = safeObject(draft);
  let opened = false;

  /*
    Primero global bridge real, porque si existe modal cargado,
    queremos apertura directa.
  */
  try {
    const modal = window?.OnionUsuariosCreateModal;

    if (typeof modal?.open === "function") {
      modal.open(safeDraft);
      opened = true;
    }
  } catch (error) {
    safeWarn("OnionUsuariosCreateModal.open falló:", error);
  }

  try {
    const hook =
      window?.renderUsuariosCreateModal ||
      window?.renderUsuarioCreateModal ||
      window?.openUsuarioCreateModal;

    if (typeof hook === "function") {
      hook(safeDraft);
      opened = true;
    }
  } catch (error) {
    safeWarn("hook create modal falló:", error);
  }

  /*
    Emitimos siempre también para listeners desacoplados.
  */
  const emitted = safeEmit("usuarios:create-modal:open", {
    draft: safeDraft,
  });

  safeEmit("usuarios:create:open", {
    draft: safeDraft,
  });

  return opened || emitted;
}

export async function createUsuarioAction({
  draft = {},
  silent = false,
} = {}) {
  const opened = openCreateModalBridge(draft);

  if (opened) {
    return true;
  }

  if (!silent) {
    showToast(
      "No se pudo abrir el modal de creación. Revisa la carga de usuarios.create.modal.js",
      "error"
    );
  }

  return false;
}

/* =========================================================
   CREATE SUBMIT OPCIONAL
   Para el modal: crear realmente contra backend.
========================================================= */

export async function submitCreateUsuarioAction({
  draft = {},
  silent = false,
} = {}) {
  const payload = safeObject(draft);

  try {
    safeEmit("usuarios:create:request", {
      draft: payload,
    });

    const created = await createUsuario(payload);

    const normalized = normalizeUsuarioDetail(created);

    try {
      upsertUsuarioStore(normalized);
    } catch {}

    safeEmit("usuarios:create:success", {
      userId: normalized.userId || normalized.id,
      detail: normalized,
      user: normalized,
    });

    if (!silent) {
      showToast("Usuario creado", "success");
    }

    return normalized;
  } catch (error) {
    safeWarn("submitCreateUsuarioAction falló:", error);

    safeEmit("usuarios:create:error", {
      error,
      draft: payload,
    });

    if (!silent) {
      showToast("No se pudo crear el usuario.", "error");
    }

    return null;
  }
}

/* =========================================================
   EXPORT HELPERS
========================================================= */

export {
  getId as getUsuarioIdAction,
  getUsername as getUsuarioUsernameAction,
  getName as getUsuarioNameAction,
  getEmail as getUsuarioEmailAction,
  getPhone as getUsuarioPhoneAction,
  getCity as getUsuarioCityAction,
  getStatus as getUsuarioStatusAction,
  getStatusLabel as getUsuarioStatusLabelAction,
  getCreatedAt as getUsuarioCreatedAtAction,
  getUpdatedAt as getUsuarioUpdatedAtAction,
  getLastLoginAt as getUsuarioLastLoginAtAction,
  getNotes as getUsuarioNotesAction,
  normalizeUsuarioDetail,
};

export default {
  getUsuarioDetailFromStoreAction,
  getUsuarioDetailAction,
  openUsuarioAction,
  refreshUsuarioDetailAction,
  copyUsuarioIdAction,
  exportUsuariosCsvAction,
  createUsuarioAction,
  submitCreateUsuarioAction,

  getUsuarioIdAction: getId,
  getUsuarioUsernameAction: getUsername,
  getUsuarioNameAction: getName,
  getUsuarioEmailAction: getEmail,
  getUsuarioPhoneAction: getPhone,
  getUsuarioCityAction: getCity,
  getUsuarioStatusAction: getStatus,
  getUsuarioStatusLabelAction: getStatusLabel,
  getUsuarioCreatedAtAction: getCreatedAt,
  getUsuarioUpdatedAtAction: getUpdatedAt,
  getUsuarioLastLoginAtAction: getLastLoginAt,
  getUsuarioNotesAction: getNotes,
  normalizeUsuarioDetail,
};
