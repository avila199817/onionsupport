/* =========================================================
   Onion SPA - Usuarios Store
   Archivo: src/views/usuarios/usuarios.store.js

   FINAL PRO SYSTEM · STORE LAYER · 10/10

   RESPONSABILIDADES:
   - encapsular Store global
   - leer / escribir colección usuarios
   - helpers para API / View / Actions
   - búsquedas robustas por id
   - replace / append / update / upsert
   - deduplicación segura
   - persistencia estable para detalle modal

   HARDENING PRO:
   - añadido upsertUsuarioStore
   - normalización de ids
   - evita duplicados
   - no muta colecciones originales
   - ordenación consistente por updatedAt
========================================================= */

import { Store } from "../../store/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

const STORE_PATH = "entities.usuarios";
const STORE_COLLECTION_KEY = "usuarios";

/* =========================================================
   SAFE
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

function safeId(value) {
  return safeText(value, "");
}

function safeTimestamp(value, fallback = 0) {
  const n = Number(value);
  if (Number.isFinite(n)) {
    return n;
  }

  const date = new Date(value);
  const ts = date.getTime();

  return Number.isFinite(ts) ? ts : fallback;
}

/* =========================================================
   ID HELPERS
========================================================= */

export function getItemId(item = {}) {
  const row = safeObject(item);

  return safeId(
    row.userId ||
      row.usuarioId ||
      row.clientId ||
      row.id ||
      row.code ||
      row.username ||
      row.userName
  );
}

function isSameItemId(item = {}, id = "") {
  const target = safeId(id);
  if (!target) return false;

  const row = safeObject(item);

  return (
    getItemId(row) === target ||
    safeId(row.id) === target ||
    safeId(row.userId) === target ||
    safeId(row.usuarioId) === target ||
    safeId(row.clientId) === target ||
    safeId(row.code) === target ||
    safeId(row.username) === target ||
    safeId(row.userName) === target
  );
}

/* =========================================================
   TIMESTAMP HELPERS
========================================================= */

function getUpdatedTimestamp(item = {}) {
  const row = safeObject(item);

  return safeTimestamp(
    row.updatedAtMs ??
      row.updatedAtTs ??
      row.meta?.timestampMs ??
      row.meta?.updatedAtMs ??
      row.updatedAt ??
      row.updated_at ??
      row.modifiedAt ??
      row.lastUpdate ??
      row.lastLoginAt ??
      row.last_login_at ??
      row.createdAt ??
      row.created_at ??
      0,
    0
  );
}

/* =========================================================
   LOW LEVEL STORE ACCESS
========================================================= */

function readStoreCollection() {
  try {
    if (typeof Store?.get === "function") {
      return safeArray(Store.get(STORE_PATH));
    }
  } catch {}

  return [];
}

function writeStoreCollection(items = []) {
  const list = safeArray(items);

  try {
    if (Store?.actions?.setCollection) {
      Store.actions.setCollection(STORE_COLLECTION_KEY, list);
      return list;
    }
  } catch {}

  try {
    if (typeof Store?.set === "function") {
      Store.set(STORE_PATH, list);
      return list;
    }
  } catch {}

  return list;
}

/* =========================================================
   NORMALIZE COLLECTION
========================================================= */

function mergeUsuario(base = {}, patch = {}) {
  return {
    ...safeObject(base),
    ...safeObject(patch),
  };
}

function dedupeUsuarios(items = []) {
  const list = safeArray(items);
  const map = new Map();
  const anonymous = [];

  for (const rawItem of list) {
    const item = safeObject(rawItem);
    const id = getItemId(item);

    if (!id) {
      anonymous.push(item);
      continue;
    }

    if (!map.has(id)) {
      map.set(id, item);
      continue;
    }

    const current = map.get(id);
    map.set(id, mergeUsuario(current, item));
  }

  return [...map.values(), ...anonymous];
}

function normalizeCollection(items = []) {
  return dedupeUsuarios(safeArray(items));
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
  const target = safeId(id);

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
  const target = safeId(id);

  if (!target) {
    return getUsuarios();
  }

  const current = getUsuarios();

  const next = current.map((item) =>
    isSameItemId(item, target)
      ? mergeUsuario(item, patch)
      : item
  );

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
  const targetId = getItemId(incoming);
  const current = getUsuarios();

  if (!targetId) {
    const next = normalizeCollection([incoming, ...current]);
    writeStoreCollection(next);
    return next;
  }

  const index = current.findIndex((row) => getItemId(row) === targetId);

  let next = [];

  if (index === -1) {
    next = normalizeCollection([incoming, ...current]);
  } else {
    next = [...current];
    next[index] = mergeUsuario(next[index], incoming);
    next = normalizeCollection(next);
  }

  writeStoreCollection(next);

  return next;
}

/* =========================================================
   REMOVE
========================================================= */

export function removeUsuarioStore(id = "") {
  const target = safeId(id);

  if (!target) {
    return getUsuarios();
  }

  const next = getUsuarios().filter(
    (item) => !isSameItemId(item, target)
  );

  writeStoreCollection(next);

  return next;
}

/* =========================================================
   HELPERS
========================================================= */

export function sortUsuariosByUpdatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aTime = getUpdatedTimestamp(a);
    const bTime = getUpdatedTimestamp(b);

    return bTime - aTime;
  });
}

export function sortUsuariosByCreatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aTime = safeTimestamp(
      safeObject(a).createdAt ??
        safeObject(a).created_at ??
        safeObject(a).createdAtMs ??
        0,
      0
    );

    const bTime = safeTimestamp(
      safeObject(b).createdAt ??
        safeObject(b).created_at ??
        safeObject(b).createdAtMs ??
        0,
      0
    );

    return bTime - aTime;
  });
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
  removeUsuarioStore,
  clearUsuarios,

  sortUsuariosByUpdatedDesc,
  sortUsuariosByCreatedDesc,

  getItemId,
};
