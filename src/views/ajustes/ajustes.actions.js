/* =========================================================
   Onion SPA - Ajustes Actions
   Archivo: src/views/ajustes/ajustes.actions.js

   RESPONSABILIDADES:
   - centralizar acciones operativas del módulo de ajustes
   - resolver detalle/configuración desde store + backend
   - abrir configuración a nivel de datos, no de UI
   - copiar id/clave de ajuste
   - exportar colección a CSV
   - desacoplar la vista principal de la lógica operativa
   - mantener compatibilidad con ajustesView.js

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
  getAjusteByIdRequest,
} from "./ajustes.api.js";

import {
  getAjusteByIdStore,
  getSortedAjustesStore,
} from "./ajustes.store.js";

import {
  safeText,
  safeNumber,
  safeArray,
  safeObject,
  showToast,
} from "./ajustes.utils.js";

/* =========================================================
   CONSTANTS
========================================================= */

const CSV_FILENAME = "ajustes.csv";

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

function normalizeAjusteId(value = "") {
  return safeText(value, "");
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isLikelyAjuste(value) {
  if (!isObject(value)) return false;

  return Boolean(
    value.settingId ||
      value.ajusteId ||
      value.id ||
      value.key ||
      value.slug ||
      value.code ||
      value.name ||
      value.nombre ||
      value.label ||
      value.titulo
  );
}

function looksLikeEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    obj.setting ||
      obj.ajuste ||
      obj.item ||
      obj.data ||
      obj.result ||
      obj.payload
  );
}

function pickDetail(payload = null) {
  if (!payload) return null;

  if (isLikelyAjuste(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (isLikelyAjuste(obj.setting)) {
    return obj.setting;
  }

  if (isLikelyAjuste(obj.ajuste)) {
    return obj.ajuste;
  }

  if (isLikelyAjuste(obj.item)) {
    return obj.item;
  }

  if (isLikelyAjuste(obj.result)) {
    return obj.result;
  }

  if (isLikelyAjuste(obj.payload)) {
    return obj.payload;
  }

  if (isLikelyAjuste(obj.data)) {
    return obj.data;
  }

  if (looksLikeEnvelope(obj.data)) {
    return pickDetail(obj.data);
  }

  return null;
}

function getId(item = {}) {
  return safeText(
    first(
      item.settingId,
      item.ajusteId,
      item.id,
      item.key,
      item.slug,
      item.code
    ),
    ""
  );
}

function getKey(item = {}) {
  return safeText(
    first(
      item.key,
      item.settingKey,
      item.slug,
      item.code,
      item.id
    ),
    ""
  );
}

function getTitle(item = {}) {
  return safeText(
    first(
      item.title,
      item.titulo,
      item.label,
      item.name,
      item.nombre,
      item.key
    ),
    "Ajuste"
  );
}

function getDescription(item = {}) {
  return safeText(
    first(
      item.description,
      item.descripcion,
      item.helpText,
      item.help,
      item.summary,
      item.resumen
    ),
    "Sin descripción."
  );
}

function getCategory(item = {}) {
  const categoryObject = first(
    item.category,
    item.categoria,
    item.group,
    item.section
  );

  if (isObject(categoryObject)) {
    return safeText(
      first(
        categoryObject.name,
        categoryObject.nombre,
        categoryObject.label,
        categoryObject.title
      ),
      "General"
    );
  }

  return safeText(
    first(
      item.categoryName,
      item.categoriaNombre,
      categoryObject
    ),
    "General"
  );
}

function getValue(item = {}) {
  const rawValue = first(
    item.value,
    item.valor,
    item.currentValue,
    item.defaultValue
  );

  if (rawValue === null || rawValue === undefined) {
    return "";
  }

  if (typeof rawValue === "object") {
    try {
      return JSON.stringify(rawValue);
    } catch {
      return safeText(rawValue, "");
    }
  }

  return safeText(rawValue, "");
}

function getType(item = {}) {
  return safeText(
    first(
      item.type,
      item.tipo,
      item.valueType,
      item.inputType
    ),
    "text"
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

function getVisibility(item = {}) {
  return safeText(
    first(
      item.visibility,
      item.visibilidad,
      item.scope
    ),
    "private"
  );
}

function getUpdatedBy(item = {}) {
  const updatedByObject = first(
    item.updatedBy,
    item.modifiedBy,
    item.lastEditor,
    item.usuario,
    item.user
  );

  if (isObject(updatedByObject)) {
    return safeText(
      first(
        updatedByObject.name,
        updatedByObject.nombre,
        updatedByObject.displayName,
        updatedByObject.username,
        updatedByObject.email
      ),
      "Sistema"
    );
  }

  return safeText(
    first(
      item.updatedByName,
      item.modifiedByName,
      updatedByObject
    ),
    "Sistema"
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
    item.modifiedAt,
    item.lastUpdate,
    item.fechaActualizacion,
    item.createdAt
  );
}

function getOptions(item = {}) {
  return safeArray(
    first(
      item.options,
      item.opciones,
      item.choices,
      item.values
    )
  ).map((entry) => {
    if (isObject(entry)) {
      return {
        label: safeText(
          first(
            entry.label,
            entry.nombre,
            entry.name,
            entry.title,
            entry.value
          ),
          ""
        ),
        value: safeText(
          first(
            entry.value,
            entry.id,
            entry.key,
            entry.code,
            entry.slug
          ),
          ""
        ),
        raw: safeObject(entry),
      };
    }

    return {
      label: safeText(entry, ""),
      value: safeText(entry, ""),
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
      item.audit,
      item.changelog
    )
  ).map((row) => safeObject(row));
}

function normalizeAjusteDetail(detail = {}) {
  const raw = safeObject(detail);

  return {
    ...raw,
    settingId: getId(raw),
    key: getKey(raw),
    title: getTitle(raw),
    description: getDescription(raw),
    category: getCategory(raw),
    value: getValue(raw),
    type: getType(raw),
    status: getStatus(raw),
    visibility: getVisibility(raw),
    updatedByName: getUpdatedBy(raw),
    createdAt: getCreatedAt(raw),
    updatedAt: getUpdatedAt(raw),
    options: getOptions(raw),
    history: getHistory(raw),
  };
}

function escapeCsvCell(value = "") {
  const text =
    value === null || value === undefined
      ? ""
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsvRows(items = []) {
  const header = [
    "settingId",
    "key",
    "title",
    "description",
    "category",
    "value",
    "type",
    "status",
    "visibility",
    "updatedBy",
    "createdAt",
    "updatedAt",
  ];

  const rows = safeArray(items).map((item) => [
    getId(item),
    getKey(item),
    getTitle(item),
    getDescription(item),
    getCategory(item),
    getValue(item),
    getType(item),
    getStatus(item),
    getVisibility(item),
    getUpdatedBy(item),
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

export function getAjusteDetailFromStoreAction({
  settingId = "",
} = {}) {
  const id = normalizeAjusteId(settingId);

  if (!id) return null;

  try {
    const detail = getAjusteByIdStore(id);
    const picked = pickDetail(detail);

    if (!picked) return null;

    return normalizeAjusteDetail(picked);
  } catch {
    return null;
  }
}

export async function getAjusteDetailAction({
  settingId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const id = normalizeAjusteId(settingId);

  if (!id) {
    if (!silent) {
      showToast("No se pudo resolver el ajuste.", "error");
    }
    return null;
  }

  const fallbackStoreDetail =
    getAjusteDetailFromStoreAction({
      settingId: id,
    });

  if (!preferFresh && fallbackStoreDetail) {
    return fallbackStoreDetail;
  }

  try {
    safeEmit("ajustes:detail:request", {
      settingId: id,
      source: "backend",
    });

    const response =
      await getAjusteByIdRequest(id);

    const detail = pickDetail(response);

    if (!detail) {
      if (fallbackStoreDetail) {
        safeEmit("ajustes:detail:fallback", {
          settingId: id,
          source: "store",
        });
        return fallbackStoreDetail;
      }

      throw new Error("EMPTY_AJUSTE_DETAIL");
    }

    const normalized = normalizeAjusteDetail(detail);

    safeEmit("ajustes:detail:success", {
      settingId: id,
      source: "backend",
      detail: normalized,
    });

    return normalized;
  } catch (error) {
    if (fallbackStoreDetail) {
      safeEmit("ajustes:detail:fallback", {
        settingId: id,
        source: "store",
        error,
      });

      return fallbackStoreDetail;
    }

    safeEmit("ajustes:detail:error", {
      settingId: id,
      error,
    });

    if (!silent) {
      showToast(
        "No se pudo cargar el detalle del ajuste.",
        "error"
      );
    }

    return null;
  }
}

export async function openAjusteAction({
  settingId = "",
  preferFresh = true,
  silent = false,
} = {}) {
  const id = normalizeAjusteId(settingId);

  if (!id) {
    if (!silent) {
      showToast("Ajuste inválido.", "error");
    }
    return null;
  }

  safeEmit("ajustes:open", {
    settingId: id,
  });

  const detail = await getAjusteDetailAction({
    settingId: id,
    preferFresh,
    silent,
  });

  if (!detail) {
    return null;
  }

  safeEmit("ajustes:open:success", {
    settingId: id,
    detail,
  });

  return detail;
}

export async function refreshAjusteDetailAction({
  settingId = "",
  silent = true,
} = {}) {
  return getAjusteDetailAction({
    settingId,
    preferFresh: true,
    silent,
  });
}

/* =========================================================
   COPY ID / KEY
========================================================= */

export async function copyAjusteIdAction({
  settingId = "",
  silent = false,
} = {}) {
  const id = normalizeAjusteId(settingId);

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

  safeEmit("ajustes:copy-id", {
    settingId: id,
  });

  if (!silent) {
    showToast("ID copiado", "success");
  }

  return true;
}

export async function copyAjusteKeyAction({
  item = null,
  silent = false,
} = {}) {
  const key = getKey(safeObject(item));

  if (!key) {
    if (!silent) {
      showToast("No hay clave para copiar.", "error");
    }
    return false;
  }

  const copied = await writeClipboardText(key);

  if (!copied) {
    if (!silent) {
      showToast("No se pudo copiar la clave.", "error");
    }
    return false;
  }

  safeEmit("ajustes:copy-key", {
    key,
  });

  if (!silent) {
    showToast("Clave copiada", "success");
  }

  return true;
}

/* =========================================================
   EXPORT
========================================================= */

export function exportAjustesCsvAction({
  filename = CSV_FILENAME,
  items = null,
  silent = false,
} = {}) {
  const sourceItems = Array.isArray(items)
    ? items
    : getSortedAjustesStore();

  const list = safeArray(sourceItems);

  if (!list.length) {
    if (!silent) {
      showToast("No hay ajustes para exportar.", "info");
    }
    return false;
  }

  try {
    const csv = buildCsvRows(list);

    downloadTextFile({
      filename: safeText(filename, CSV_FILENAME),
      content: csv,
      mimeType: "text/csv;charset=utf-8;",
    });

    safeEmit("ajustes:export:csv", {
      total: list.length,
      filename: safeText(filename, CSV_FILENAME),
    });

    if (!silent) {
      showToast("CSV exportado", "success");
    }

    return true;
  } catch (error) {
    safeEmit("ajustes:export:error", {
      type: "csv",
      error,
    });

    if (!silent) {
      showToast("No se pudo exportar el CSV.", "error");
    }

    return false;
  }
}

/* =========================================================
   CREATE
========================================================= */

export async function createAjusteAction({
  route = "/ajustes/nuevo",
  fallbackEvent = "ajustes:create",
  silent = false,
} = {}) {
  const targetRoute = safeText(route, "/ajustes/nuevo");

  try {
    safeEmit(fallbackEvent, {
      route: targetRoute,
    });

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
   DETAIL HELPERS EXPORT
========================================================= */

export {
  getId as getAjusteIdAction,
  getKey as getAjusteKeyAction,
  getTitle as getAjusteTitleAction,
  getDescription as getAjusteDescriptionAction,
  getCategory as getAjusteCategoryAction,
  getValue as getAjusteValueAction,
  getType as getAjusteTypeAction,
  getStatus as getAjusteStatusAction,
  getVisibility as getAjusteVisibilityAction,
  getUpdatedBy as getAjusteUpdatedByAction,
  getCreatedAt as getAjusteCreatedAtAction,
  getUpdatedAt as getAjusteUpdatedAtAction,
  getOptions as getAjusteOptionsAction,
  getHistory as getAjusteHistoryAction,
  normalizeAjusteDetail as normalizeAjusteDetailAction,
};
