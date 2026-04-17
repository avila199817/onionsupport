/* =========================================================
   Onion SPA - Clientes Actions
   Archivo: src/views/clientes/clientes.actions.js

   RESPONSABILIDADES:
   - centralizar acciones operativas del módulo clientes
   - resolver detalle cliente desde store + backend
   - abrir detalle a nivel de datos, no de UI
   - copiar id de cliente
   - exportar colección a CSV
   - desacoplar la vista principal de la lógica operativa
   - mantener compatibilidad con clientesView.js

   HARDENING PRO:
   - tolerancia a payloads heterogéneos
   - fallback store -> backend
   - soporte envelope backend
   - export seguro con escape CSV
   - clipboard robusto con fallback legacy
   - eventos opcionales vía AppCore.events
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  getClienteByIdRequest,
} from "./clientes.api.js";

import {
  getClienteByIdStore,
  getSortedClientesStore,
} from "./clientes.store.js";

import {
  safeText,
  safeNumber,
  safeArray,
  safeObject,
  showToast,
} from "./clientes.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

const CSV_FILENAME = "clientes.csv";

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

function normalizeClienteId(value = "") {
  return safeText(value, "");
}

function isObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function isLikelyCliente(value) {
  if (!isObject(value)) return false;

  return Boolean(
    value.clientId ||
    value.clienteId ||
    value.userId ||
    value.id ||
    value.code ||
    value.name ||
    value.nombre ||
    value.email
  );
}

function looksLikeEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    obj.client ||
    obj.cliente ||
    obj.item ||
    obj.data ||
    obj.result ||
    obj.payload
  );
}

function pickDetail(payload = null) {
  if (!payload) return null;

  if (isLikelyCliente(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (isLikelyCliente(obj.client)) {
    return obj.client;
  }

  if (isLikelyCliente(obj.cliente)) {
    return obj.cliente;
  }

  if (isLikelyCliente(obj.item)) {
    return obj.item;
  }

  if (isLikelyCliente(obj.result)) {
    return obj.result;
  }

  if (isLikelyCliente(obj.payload)) {
    return obj.payload;
  }

  if (isLikelyCliente(obj.data)) {
    return obj.data;
  }

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
      item.clientId,
      item.clienteId,
      item.userId,
      item.id,
      item.code
    ),
    ""
  );
}

function getName(item = {}) {
  return safeText(
    first(
      item.name,
      item.nombre,
      item.fullName,
      item.company,
      item.empresa
    ),
    "Cliente"
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

function getCompany(item = {}) {
  return safeText(
    first(
      item.company,
      item.empresa,
      item.companyName
    ),
    "Sin empresa"
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

function normalizeClienteDetail(detail = {}) {
  const raw = safeObject(detail);

  return {
    ...raw,
    clientId: getId(raw),
    id: getId(raw),
    name: getName(raw),
    email: getEmail(raw),
    phone: getPhone(raw),
    company: getCompany(raw),
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
    "clientId",
    "name",
    "email",
    "phone",
    "company",
    "status",
    "createdAt",
    "updatedAt",
  ];

  const rows = safeArray(items).map((item) => [
    getId(item),
    getName(item),
    getEmail(item),
    getPhone(item),
    getCompany(item),
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

    const ok =
      document.execCommand("copy");

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

  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

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

export function getClienteDetailFromStoreAction({
  clientId = "",
} = {}) {
  const id =
    normalizeClienteId(clientId);

  if (!id) return null;

  try {
    const detail =
      getClienteByIdStore(id);

    const picked =
      pickDetail(detail);

    if (!picked) return null;

    return normalizeClienteDetail(
      picked
    );
  } catch {
    return null;
  }
}

export async function getClienteDetailAction({
  clientId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const id =
    normalizeClienteId(clientId);

  if (!id) {
    if (!silent) {
      showToast(
        "No se pudo resolver el cliente.",
        "error"
      );
    }

    return null;
  }

  const fallbackStoreDetail =
    getClienteDetailFromStoreAction({
      clientId: id,
    });

  if (
    !preferFresh &&
    fallbackStoreDetail
  ) {
    return fallbackStoreDetail;
  }

  try {
    safeEmit(
      "clientes:detail:request",
      {
        clientId: id,
        source: "backend",
      }
    );

    const response =
      await getClienteByIdRequest(id);

    const detail =
      pickDetail(response);

    if (!detail) {
      if (fallbackStoreDetail) {
        return fallbackStoreDetail;
      }

      throw new Error(
        "EMPTY_CLIENT_DETAIL"
      );
    }

    const normalized =
      normalizeClienteDetail(
        detail
      );

    safeEmit(
      "clientes:detail:success",
      {
        clientId: id,
        detail: normalized,
      }
    );

    return normalized;
  } catch (error) {
    if (fallbackStoreDetail) {
      return fallbackStoreDetail;
    }

    if (!silent) {
      showToast(
        "No se pudo cargar el detalle del cliente.",
        "error"
      );
    }

    return null;
  }
}

export async function openClienteAction({
  clientId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const detail =
    await getClienteDetailAction({
      clientId,
      preferFresh,
      silent,
    });

  if (!detail) return null;

  safeEmit("clientes:open", {
    clientId:
      detail.clientId,
    detail,
  });

  return detail;
}

/* =========================================================
   COPY ID
========================================================= */

export async function copyClienteIdAction({
  clientId = "",
  silent = false,
} = {}) {
  const id =
    normalizeClienteId(clientId);

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

export function exportClientesCsvAction({
  filename = CSV_FILENAME,
  items = null,
  silent = false,
} = {}) {
  const sourceItems =
    Array.isArray(items)
      ? items
      : getSortedClientesStore();

  const list =
    safeArray(sourceItems);

  if (!list.length) {
    if (!silent) {
      showToast(
        "No hay clientes para exportar.",
        "info"
      );
    }

    return false;
  }

  try {
    const csv =
      buildCsvRows(list);

    downloadTextFile({
      filename:
        safeText(
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
========================================================= */

export async function createClienteAction({
  route = "/clientes/nuevo",
  fallbackEvent =
    "clientes:create",
  silent = false,
} = {}) {
  const targetRoute =
    safeText(
      route,
      "/clientes/nuevo"
    );

  try {
    safeEmit(
      fallbackEvent,
      { route: targetRoute }
    );

    if (AppCore?.router?.navigate) {
      await AppCore.router.navigate(
        targetRoute
      );
      return true;
    }

    if (AppCore?.Router?.navigate) {
      await AppCore.Router.navigate(
        targetRoute
      );
      return true;
    }

    return true;
  } catch {
    if (!silent) {
      showToast(
        "No se pudo abrir el flujo de creación.",
        "error"
      );
    }

    return false;
  }
}

/* =========================================================
   EXPORT HELPERS
========================================================= */

export {
  getId as getClienteIdAction,
  getName as getClienteNameAction,
  getEmail as getClienteEmailAction,
  getPhone as getClientePhoneAction,
  getCompany as getClienteCompanyAction,
  getStatus as getClienteStatusAction,
  getCreatedAt as getClienteCreatedAtAction,
  getUpdatedAt as getClienteUpdatedAtAction,
  normalizeClienteDetail,
};
