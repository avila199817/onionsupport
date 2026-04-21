/* =========================================================
   Onion SPA - Usuarios Actions
   Archivo: src/views/usuarios/usuarios.actions.js

   RESPONSABILIDADES:
   - centralizar acciones operativas del módulo usuarios
   - resolver detalle usuario desde store + backend
   - abrir detalle a nivel de datos, no de UI
   - copiar id de usuario
   - exportar colección a CSV
   - refrescar detalle usuario (FIX IMPORT ERROR)
   - abrir modal de creación de usuario
   - desacoplar la vista principal de la lógica operativa
   - mantener compatibilidad con usuariosView.js

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - fallback store -> backend
   - soporte envelope backend
   - export seguro con escape CSV
   - clipboard robusto con fallback legacy
   - eventos opcionales vía AppCore.events
   - apertura híbrida de modal: event bus + global bridge
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  getUsuarioByIdRequest,
} from "./usuarios.api.js";

import {
  getUsuarioByIdStore,
  getSortedUsuariosStore,
} from "./usuarios.store.js";

import {
  safeText,
  safeArray,
  safeObject,
  showToast,
} from "./usuarios.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

const CSV_FILENAME = "usuarios.csv";

/* =========================================================
   HELPERS
========================================================= */

function safeEmit(event = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(event, payload);
    return true;
  } catch {
    return false;
  }
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

function normalizeUsuarioId(value = "") {
  return safeText(value, "");
}

function isObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function isLikelyUsuario(value) {
  if (!isObject(value)) return false;

  return Boolean(
    value.userId ||
    value.usuarioId ||
    value.clientId ||
    value.id ||
    value.code ||
    value.username ||
    value.name ||
    value.nombre ||
    value.email
  );
}

function looksLikeEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    obj.user ||
    obj.usuario ||
    obj.item ||
    obj.data ||
    obj.result ||
    obj.payload
  );
}

function pickDetail(payload = null) {
  if (!payload) return null;

  if (isLikelyUsuario(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (isLikelyUsuario(obj.user)) return obj.user;
  if (isLikelyUsuario(obj.usuario)) return obj.usuario;
  if (isLikelyUsuario(obj.item)) return obj.item;
  if (isLikelyUsuario(obj.result)) return obj.result;
  if (isLikelyUsuario(obj.payload)) return obj.payload;
  if (isLikelyUsuario(obj.data)) return obj.data;

  if (looksLikeEnvelope(obj.data)) {
    return pickDetail(obj.data);
  }

  return null;
}

/* =========================================================
   FIELD RESOLVERS
========================================================= */

function getId(item = {}) {
  return safeText(
    first(
      item.userId,
      item.usuarioId,
      item.clientId,
      item.id,
      item.code
    ),
    ""
  );
}

function getUsername(item = {}) {
  return safeText(
    first(
      item.username,
      item.userName,
      item.nick,
      item.alias
    ),
    "Sin username"
  );
}

function getName(item = {}) {
  return safeText(
    first(
      item.name,
      item.nombre,
      item.fullName,
      item.displayName
    ),
    "Usuario"
  );
}

function getEmail(item = {}) {
  return safeText(
    first(
      item.email,
      item.mail
    ),
    "Sin email"
  );
}

function getPhone(item = {}) {
  return safeText(
    first(
      item.phone,
      item.telefono,
      item.mobile
    ),
    "Sin teléfono"
  );
}

function getRole(item = {}) {
  return safeText(
    first(
      item.role,
      item.rol,
      item.userRole
    ),
    "user"
  );
}

function getStatus(item = {}) {
  return safeText(
    first(
      item.status,
      item.estado,
      item.state
    ),
    "active"
  );
}

function getCreatedAt(item = {}) {
  return first(
    item.createdAt,
    item.fechaCreacion,
    item.date
  );
}

function getUpdatedAt(item = {}) {
  return first(
    item.updatedAt,
    item.modifiedAt,
    item.lastUpdate,
    item.createdAt
  );
}

function getNotes(item = {}) {
  return safeText(
    first(
      item.notes,
      item.note,
      item.descripcion,
      item.description
    ),
    ""
  );
}

/* =========================================================
   NORMALIZER
========================================================= */

function normalizeUsuarioDetail(detail = {}) {
  const raw = safeObject(detail);

  return {
    ...raw,
    userId: getId(raw),
    id: getId(raw),
    username: getUsername(raw),
    name: getName(raw),
    email: getEmail(raw),
    phone: getPhone(raw),
    role: getRole(raw),
    status: getStatus(raw),
    createdAt: getCreatedAt(raw),
    updatedAt: getUpdatedAt(raw),
    notes: getNotes(raw),
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
    "userId",
    "username",
    "name",
    "email",
    "phone",
    "role",
    "status",
    "createdAt",
    "updatedAt",
  ];

  const rows = safeArray(items).map((item) => [
    getId(item),
    getUsername(item),
    getName(item),
    getEmail(item),
    getPhone(item),
    getRole(item),
    getStatus(item),
    getCreatedAt(item) || "",
    getUpdatedAt(item) || "",
  ]);

  return [
    header.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\n");
}

/* =========================================================
   CLIPBOARD
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
    const detail = getUsuarioByIdStore(id);
    const picked = pickDetail(detail);

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
      showToast(
        "No se pudo resolver el usuario.",
        "error"
      );
    }

    return null;
  }

  const fallbackStoreDetail =
    getUsuarioDetailFromStoreAction({
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

    const response =
      await getUsuarioByIdRequest(id);

    const detail = pickDetail(response);

    if (!detail) {
      if (fallbackStoreDetail) {
        return fallbackStoreDetail;
      }

      throw new Error("EMPTY_USER_DETAIL");
    }

    const normalized =
      normalizeUsuarioDetail(detail);

    safeEmit("usuarios:detail:success", {
      userId: id,
      detail: normalized,
    });

    return normalized;
  } catch {
    if (fallbackStoreDetail) {
      return fallbackStoreDetail;
    }

    if (!silent) {
      showToast(
        "No se pudo cargar el detalle del usuario.",
        "error"
      );
    }

    return null;
  }
}

export async function openUsuarioAction({
  userId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const detail =
    await getUsuarioDetailAction({
      userId,
      preferFresh,
      silent,
    });

  if (!detail) return null;

  safeEmit("usuarios:open", {
    userId: detail.userId,
    detail,
  });

  return detail;
}

/* =========================================================
   FIX CRÍTICO IMPORT ERROR
   usuariosView.js importa:
   refreshUsuarioDetailAction
========================================================= */

export async function refreshUsuarioDetailAction({
  userId = "",
  silent = false,
} = {}) {
  const detail =
    await getUsuarioDetailAction({
      userId,
      preferFresh: true,
      silent,
    });

  if (!detail) return null;

  safeEmit("usuarios:detail:refresh", {
    userId: detail.userId,
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
      showToast(
        "No hay ID para copiar.",
        "error"
      );
    }

    return false;
  }

  const copied =
    await writeClipboardText(id);

  if (!copied) {
    if (!silent) {
      showToast(
        "No se pudo copiar el ID.",
        "error"
      );
    }

    return false;
  }

  if (!silent) {
    showToast(
      "ID copiado",
      "success"
    );
  }

  return true;
}

/* =========================================================
   EXPORT
========================================================= */

export function exportUsuariosCsvAction({
  filename = CSV_FILENAME,
  items = null,
  silent = false,
} = {}) {
  const sourceItems =
    Array.isArray(items)
      ? items
      : getSortedUsuariosStore();

  const list = safeArray(sourceItems);

  if (!list.length) {
    if (!silent) {
      showToast(
        "No hay usuarios para exportar.",
        "info"
      );
    }

    return false;
  }

  try {
    const csv = buildCsvRows(list);

    downloadTextFile({
      filename: safeText(
        filename,
        CSV_FILENAME
      ),
      content: csv,
      mimeType:
        "text/csv;charset=utf-8;",
    });

    if (!silent) {
      showToast(
        "CSV exportado",
        "success"
      );
    }

    return true;
  } catch {
    if (!silent) {
      showToast(
        "No se pudo exportar el CSV.",
        "error"
      );
    }

    return false;
  }
}

/* =========================================================
   CREATE
   ABRE MODAL EN VEZ DE NAVEGAR
========================================================= */

export async function createUsuarioAction({
  draft = {},
  silent = false,
} = {}) {
  const safeDraft = safeObject(draft);
  let opened = false;

  try {
    safeEmit("usuarios:create-modal:open", {
      draft: safeDraft,
    });
    opened = true;
  } catch {}

  try {
    const modal =
      window?.OnionUsuariosCreateModal ||
      null;

    if (typeof modal?.open === "function") {
      modal.open(safeDraft);
      opened = true;
    }
  } catch {}

  if (opened) {
    safeEmit("usuarios:create:open", {
      draft: safeDraft,
    });

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
   EXPORT HELPERS
========================================================= */

export {
  getId as getUsuarioIdAction,
  getUsername as getUsuarioUsernameAction,
  getName as getUsuarioNameAction,
  getEmail as getUsuarioEmailAction,
  getPhone as getUsuarioPhoneAction,
  getRole as getUsuarioRoleAction,
  getStatus as getUsuarioStatusAction,
  getCreatedAt as getUsuarioCreatedAtAction,
  getUpdatedAt as getUsuarioUpdatedAtAction,
  normalizeUsuarioDetail,
};
