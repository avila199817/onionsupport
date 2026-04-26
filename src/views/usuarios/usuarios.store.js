/* =========================================================
   Onion SPA - Usuarios Store
   Archivo: src/views/usuarios/usuarios.store.js

   FINAL PRO SYSTEM · STORE LAYER · ADMIN USERS · 10/10

   RESPONSABILIDADES:
   - encapsular Store global
   - leer / escribir colección usuarios
   - soportar payloads array y envelopes backend
   - helpers para API / View / Actions / Modal
   - búsquedas robustas por id / username / email
   - replace / append / update / upsert
   - deduplicación segura
   - fallback local si Store no está listo
   - persistencia estable para detalle modal

   HARDENING PRO:
   - upsertUsuarioStore robusto
   - normalización de ids
   - evita duplicados
   - no muta colecciones originales
   - merge defensivo sin pisar valores buenos con vacíos
   - ordenación consistente por última actividad / updatedAt
   - compatible con Store.get / Store.set / Store.actions.setCollection
========================================================= */

import { Store } from "../../store/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

const STORE_PATH = "entities.usuarios";
const STORE_COLLECTION_KEY = "usuarios";

const FALLBACK_PATHS = [
  "entities.usuarios",
  "usuarios",
  "users",
  "collections.usuarios",
  "collections.users",
];

/* =========================================================
   LOCAL FALLBACK
========================================================= */

let localUsuarios = [];

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

function safeTimestamp(value, fallback = 0) {
  const direct = Number(value);

  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }

  if (!value) return fallback;

  const date = new Date(value);
  const ts = date.getTime();

  return Number.isFinite(ts) ? ts : fallback;
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

function getByPath(object = {}, path = "") {
  const parts = safeText(path, "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  let cursor = object;

  for (const part of parts) {
    if (!cursor || typeof cursor !== "object") {
      return undefined;
    }

    cursor = cursor[part];
  }

  return cursor;
}

/* =========================================================
   ENVELOPE
========================================================= */

export function unwrapUsuariosPayload(payload = null) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.rows)) return obj.rows;
  if (Array.isArray(obj.usuarios)) return obj.usuarios;
  if (Array.isArray(obj.users)) return obj.users;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.records)) return obj.records;

  if (obj.payload && typeof obj.payload === "object") {
    return unwrapUsuariosPayload(obj.payload);
  }

  if (obj.response && typeof obj.response === "object") {
    return unwrapUsuariosPayload(obj.response);
  }

  if (obj.result && typeof obj.result === "object") {
    return unwrapUsuariosPayload(obj.result);
  }

  if (obj.data && typeof obj.data === "object") {
    return unwrapUsuariosPayload(obj.data);
  }

  return [];
}

/* =========================================================
   ID HELPERS
========================================================= */

export function getItemId(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);
  const usuario = safeObject(first(row.usuario, raw.usuario));
  const profile = safeObject(first(row.profile, raw.profile));

  return safeText(
    first(
      row.userId,
      row.usuarioId,
      row.id,
      row.code,
      row.username,
      row.userName,
      row.email,
      row.mail,

      usuario.userId,
      usuario.usuarioId,
      usuario.id,
      usuario.code,
      usuario.username,
      usuario.userName,
      usuario.email,
      usuario.mail,

      profile.userId,
      profile.usuarioId,
      profile.id,
      profile.code,
      profile.username,
      profile.userName,
      profile.email,
      profile.mail,

      raw.userId,
      raw.usuarioId,
      raw.id,
      raw.code,
      raw.username,
      raw.userName,
      raw.email,
      raw.mail
    ),
    ""
  );
}

export function getItemIdentityCandidates(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);
  const usuario = safeObject(first(row.usuario, raw.usuario));
  const profile = safeObject(first(row.profile, raw.profile));

  return [
    row.userId,
    row.usuarioId,
    row.id,
    row.code,
    row.username,
    row.userName,
    row.email,
    row.mail,

    usuario.userId,
    usuario.usuarioId,
    usuario.id,
    usuario.code,
    usuario.username,
    usuario.userName,
    usuario.email,
    usuario.mail,

    profile.userId,
    profile.usuarioId,
    profile.id,
    profile.code,
    profile.username,
    profile.userName,
    profile.email,
    profile.mail,

    raw.userId,
    raw.usuarioId,
    raw.id,
    raw.code,
    raw.username,
    raw.userName,
    raw.email,
    raw.mail,
  ]
    .map((value) => safeText(value, ""))
    .filter(Boolean);
}

function getPrimaryIdentityKey(item = {}) {
  const candidates = getItemIdentityCandidates(item);

  return normalizeIdentity(candidates[0] || "");
}

function isSameItemId(item = {}, id = "") {
  const target = normalizeIdentity(id);
  if (!target) return false;

  return getItemIdentityCandidates(item).some((candidate) => {
    return normalizeIdentity(candidate) === target;
  });
}

function isSameUsuario(a = {}, b = {}) {
  const aCandidates = getItemIdentityCandidates(a).map(normalizeIdentity);
  const bCandidates = getItemIdentityCandidates(b).map(normalizeIdentity);

  return aCandidates.some((candidate) => {
    return candidate && bCandidates.includes(candidate);
  });
}

/* =========================================================
   TIMESTAMP HELPERS
========================================================= */

function getUpdatedTimestamp(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return Math.max(
    safeTimestamp(row.sortTs, 0),
    safeTimestamp(row.lastLoginAtTs, 0),
    safeTimestamp(row.updatedAtTs, 0),
    safeTimestamp(row.createdAtTs, 0),

    safeTimestamp(row.updatedAtMs, 0),
    safeTimestamp(row.updatedAt, 0),
    safeTimestamp(row.updated_at, 0),
    safeTimestamp(row.modifiedAt, 0),
    safeTimestamp(row.lastUpdate, 0),
    safeTimestamp(row.lastUpdateAt, 0),
    safeTimestamp(row.lastModifiedAt, 0),
    safeTimestamp(row.lastLoginAt, 0),
    safeTimestamp(row.last_login_at, 0),
    safeTimestamp(row.lastAccessAt, 0),
    safeTimestamp(row.ultimoAcceso, 0),
    safeTimestamp(row.createdAt, 0),
    safeTimestamp(row.created_at, 0),

    safeTimestamp(row.meta?.timestampMs, 0),
    safeTimestamp(row.meta?.updatedAtMs, 0),

    safeTimestamp(raw.sortTs, 0),
    safeTimestamp(raw.lastLoginAtTs, 0),
    safeTimestamp(raw.updatedAtTs, 0),
    safeTimestamp(raw.createdAtTs, 0),
    safeTimestamp(raw.updatedAtMs, 0),
    safeTimestamp(raw.updatedAt, 0),
    safeTimestamp(raw.updated_at, 0),
    safeTimestamp(raw.modifiedAt, 0),
    safeTimestamp(raw.lastUpdate, 0),
    safeTimestamp(raw.lastUpdateAt, 0),
    safeTimestamp(raw.lastModifiedAt, 0),
    safeTimestamp(raw.lastLoginAt, 0),
    safeTimestamp(raw.last_login_at, 0),
    safeTimestamp(raw.lastAccessAt, 0),
    safeTimestamp(raw.ultimoAcceso, 0),
    safeTimestamp(raw.createdAt, 0),
    safeTimestamp(raw.created_at, 0)
  );
}

function getCreatedTimestamp(item = {}) {
  const row = safeObject(item);
  const raw = safeObject(row.raw);

  return Math.max(
    safeTimestamp(row.createdAtTs, 0),
    safeTimestamp(row.createdAtMs, 0),
    safeTimestamp(row.createdAt, 0),
    safeTimestamp(row.created_at, 0),
    safeTimestamp(row.fechaAlta, 0),
    safeTimestamp(row.fechaCreacion, 0),
    safeTimestamp(row.registeredAt, 0),

    safeTimestamp(raw.createdAtTs, 0),
    safeTimestamp(raw.createdAtMs, 0),
    safeTimestamp(raw.createdAt, 0),
    safeTimestamp(raw.created_at, 0),
    safeTimestamp(raw.fechaAlta, 0),
    safeTimestamp(raw.fechaCreacion, 0),
    safeTimestamp(raw.registeredAt, 0)
  );
}

/* =========================================================
   LOW LEVEL STORE ACCESS
========================================================= */

function readStoreCollectionFromApi() {
  try {
    if (typeof Store?.get === "function") {
      for (const path of FALLBACK_PATHS) {
        const value = Store.get(path);
        const rows = unwrapUsuariosPayload(value);

        if (rows.length) {
          return rows;
        }
      }
    }
  } catch {}

  try {
    const state = Store?.state || Store?.data || Store?.getState?.();

    if (state && typeof state === "object") {
      for (const path of FALLBACK_PATHS) {
        const value = getByPath(state, path);
        const rows = unwrapUsuariosPayload(value);

        if (rows.length) {
          return rows;
        }
      }
    }
  } catch {}

  return [];
}

function readStoreCollection() {
  const fromStore = readStoreCollectionFromApi();

  if (fromStore.length) {
    localUsuarios = normalizeCollection(fromStore);
    return localUsuarios;
  }

  return localUsuarios;
}

function writeStoreCollection(items = []) {
  const list = normalizeCollection(items);

  localUsuarios = list;

  try {
    if (Store?.actions?.setCollection) {
      Store.actions.setCollection(STORE_COLLECTION_KEY, list);
    }
  } catch {}

  try {
    if (typeof Store?.set === "function") {
      Store.set(STORE_PATH, list);
    }
  } catch {}

  try {
    if (typeof Store?.set === "function") {
      Store.set(STORE_COLLECTION_KEY, list);
    }
  } catch {}

  try {
    Store?.events?.emit?.("usuarios:store:updated", {
      items: list,
      count: list.length,
    });
  } catch {}

  try {
    window.dispatchEvent(
      new CustomEvent("usuarios:store:updated", {
        detail: {
          items: list,
          count: list.length,
        },
      })
    );
  } catch {}

  return list;
}

/* =========================================================
   NORMALIZE COLLECTION
========================================================= */

function mergeValue(baseValue, patchValue) {
  if (isMeaningfulValue(patchValue)) {
    return patchValue;
  }

  return baseValue;
}

function mergeUsuario(base = {}, patch = {}) {
  const current = safeObject(base);
  const incoming = safeObject(patch);

  const keys = new Set([
    ...Object.keys(current),
    ...Object.keys(incoming),
  ]);

  const next = {};

  for (const key of keys) {
    if (key === "raw") continue;
    if (key === "meta") continue;
    if (key === "usuario") continue;
    if (key === "profile") continue;

    next[key] = mergeValue(current[key], incoming[key]);
  }

  next.raw = {
    ...safeObject(current.raw),
    ...safeObject(incoming.raw),
  };

  if (Object.keys(safeObject(current.usuario)).length || Object.keys(safeObject(incoming.usuario)).length) {
    next.usuario = {
      ...safeObject(current.usuario),
      ...safeObject(incoming.usuario),
    };
  }

  if (Object.keys(safeObject(current.profile)).length || Object.keys(safeObject(incoming.profile)).length) {
    next.profile = {
      ...safeObject(current.profile),
      ...safeObject(incoming.profile),
    };
  }

  if (Object.keys(safeObject(current.meta)).length || Object.keys(safeObject(incoming.meta)).length) {
    next.meta = {
      ...safeObject(current.meta),
      ...safeObject(incoming.meta),
    };
  }

  return next;
}

function dedupeUsuarios(items = []) {
  const list = unwrapUsuariosPayload(items);
  const output = [];

  for (const rawItem of list) {
    const item = safeObject(rawItem);

    if (!Object.keys(item).length) {
      continue;
    }

    const existingIndex = output.findIndex((row) => isSameUsuario(row, item));

    if (existingIndex === -1) {
      output.push({ ...item });
      continue;
    }

    output[existingIndex] = mergeUsuario(output[existingIndex], item);
  }

  return output;
}

function normalizeCollection(items = []) {
  return dedupeUsuarios(items);
}

/* =========================================================
   GETTERS
========================================================= */

export function getUsuarios() {
  return normalizeCollection(readStoreCollection());
}

export function getSortedUsuariosStore() {
  return sortUsuariosByUpdatedDesc(getUsuarios());
}

export function getUsuarioById(id = "") {
  const target = safeText(id, "");

  if (!target) {
    return null;
  }

  const items = getUsuarios();

  return items.find((item) => isSameItemId(item, target)) || null;
}

export function getUsuarioByIdStore(id = "") {
  return getUsuarioById(id);
}

export function hasUsuarios() {
  return getUsuarios().length > 0;
}

export function getUsuariosCount() {
  return getUsuarios().length;
}

/* =========================================================
   SETTERS
========================================================= */

export function setUsuarios(items = []) {
  const next = normalizeCollection(items);
  writeStoreCollection(next);
  return next;
}

export function replaceUsuariosStore(items = []) {
  return setUsuarios(items);
}

export function clearUsuarios() {
  return setUsuarios([]);
}

export function appendUsuarioStore(item = null) {
  if (!item) {
    return getUsuarios();
  }

  const current = getUsuarios();
  const next = normalizeCollection([...current, safeObject(item)]);

  writeStoreCollection(next);

  return next;
}

export function updateUsuarioStore(id = "", patch = {}) {
  const target = safeText(id, "");

  if (!target) {
    return getUsuarios();
  }

  const current = getUsuarios();
  let matched = false;

  const next = current.map((item) => {
    if (!isSameItemId(item, target)) {
      return item;
    }

    matched = true;
    return mergeUsuario(item, patch);
  });

  if (!matched) {
    const patched = {
      ...safeObject(patch),
      userId: first(safeObject(patch).userId, target),
      id: first(safeObject(patch).id, target),
    };

    next.unshift(patched);
  }

  writeStoreCollection(next);

  return next;
}

/* =========================================================
   UPSERT
========================================================= */

export function upsertUsuarioStore(item = null) {
  if (!item) {
    return getUsuarios();
  }

  const incoming = safeObject(item);

  if (!Object.keys(incoming).length) {
    return getUsuarios();
  }

  const current = getUsuarios();

  const index = current.findIndex((row) => {
    return isSameUsuario(row, incoming);
  });

  let next = [];

  if (index === -1) {
    next = normalizeCollection([incoming, ...current]);
  } else {
    next = current.slice();
    next[index] = mergeUsuario(next[index], incoming);
    next = normalizeCollection(next);
  }

  writeStoreCollection(next);

  return next;
}

export function upsertUsuariosStore(items = []) {
  const incomingItems = unwrapUsuariosPayload(items);

  if (!incomingItems.length) {
    return getUsuarios();
  }

  let next = getUsuarios();

  for (const item of incomingItems) {
    const incoming = safeObject(item);
    const index = next.findIndex((row) => isSameUsuario(row, incoming));

    if (index === -1) {
      next = [incoming, ...next];
    } else {
      next = next.slice();
      next[index] = mergeUsuario(next[index], incoming);
    }

    next = normalizeCollection(next);
  }

  writeStoreCollection(next);

  return next;
}

/* =========================================================
   REMOVE
========================================================= */

export function removeUsuarioStore(id = "") {
  const target = safeText(id, "");

  if (!target) {
    return getUsuarios();
  }

  const next = getUsuarios().filter((item) => {
    return !isSameItemId(item, target);
  });

  writeStoreCollection(next);

  return next;
}

/* =========================================================
   SORT HELPERS
========================================================= */

export function sortUsuariosByUpdatedDesc(items = []) {
  return safeArray(items)
    .slice()
    .sort((a, b) => {
      const aTime = getUpdatedTimestamp(a);
      const bTime = getUpdatedTimestamp(b);

      return bTime - aTime;
    });
}

export function sortUsuariosByCreatedDesc(items = []) {
  return safeArray(items)
    .slice()
    .sort((a, b) => {
      const aTime = getCreatedTimestamp(a);
      const bTime = getCreatedTimestamp(b);

      return bTime - aTime;
    });
}

/* =========================================================
   DEBUG
========================================================= */

export function getUsuariosStoreSnapshot() {
  const items = getUsuarios();

  return {
    path: STORE_PATH,
    collectionKey: STORE_COLLECTION_KEY,
    total: items.length,
    hasItems: items.length > 0,
    localFallbackCount: localUsuarios.length,
    ids: items.map((item) => getItemId(item)).filter(Boolean),
    firstUpdatedAt: items[0]?.updatedAt || items[0]?.lastLoginAt || "",
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  getUsuarios,
  getSortedUsuariosStore,
  getUsuarioById,
  getUsuarioByIdStore,
  hasUsuarios,
  getUsuariosCount,

  setUsuarios,
  replaceUsuariosStore,
  appendUsuarioStore,
  updateUsuarioStore,
  upsertUsuarioStore,
  upsertUsuariosStore,
  removeUsuarioStore,
  clearUsuarios,

  sortUsuariosByUpdatedDesc,
  sortUsuariosByCreatedDesc,

  getItemId,
  getItemIdentityCandidates,
  unwrapUsuariosPayload,

  getUsuariosStoreSnapshot,
};
