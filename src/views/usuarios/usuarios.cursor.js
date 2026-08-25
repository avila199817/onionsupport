/* =========================================================
   Onion Support - Usuarios Cursor API
   Archivo: /src/views/usuarios/usuarios.cursor.js

   CURSOR-FIRST · SERVER FILTERED · SCALE SAFE V2

   Responsabilidad:
   - Cargar una única página de /api/users.
   - Mantener continuation tokens opacos fuera del DOM y snapshots públicos.
   - Pedir total exacto sólo en la primera página sin filtros, nunca en búsquedas.
   - Delegar normalización de modelo al contrato canónico de usuarios.api.js.
========================================================= */

import Http from "../../core/http.js";
import {
  normalizeUsuariosCollection,
} from "./usuarios.api.js";

export const USUARIOS_CURSOR_VERSION =
  "usuarios.cursor.v2.total-cost-gated";

export const USUARIOS_CURSOR_ENDPOINT = "/api/users";
export const USUARIOS_CURSOR_PAGE_SIZE = 50;
export const USUARIOS_CURSOR_MAX_PAGE_SIZE = 200;
export const USUARIOS_CURSOR_TIMEOUT = 20_000;

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return output || fallback;
}

function number(value = 0, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(number(value, min), min), max);
}

function pickItems(payload = null) {
  if (Array.isArray(payload)) return payload;
  const source = safeObject(payload);
  for (const candidate of [
    source.items,
    source.users,
    source.usuarios,
    source.rows,
    source.results,
    source.data,
  ]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function pickToken(payload = null) {
  const source = safeObject(payload);
  return cleanText(
    source.continuationToken ||
      source.nextContinuationToken ||
      source.nextToken ||
      source.ct ||
      source.pagination?.continuationToken ||
      source.pagination?.nextContinuationToken ||
      source.pagination?.nextToken ||
      "",
    ""
  );
}

function pickHasMore(payload = null) {
  const source = safeObject(payload);
  if (typeof source.hasMore === "boolean") return source.hasMore;
  if (typeof source.pagination?.hasMore === "boolean") return source.pagination.hasMore;
  return Boolean(pickToken(source));
}

function pickTotalKnown(payload = null) {
  const source = safeObject(payload);
  if (typeof source.totalKnown === "boolean") return source.totalKnown;
  if (typeof source.pagination?.totalKnown === "boolean") {
    return source.pagination.totalKnown;
  }
  return false;
}

function pickTotal(payload = null) {
  const source = safeObject(payload);
  if (!pickTotalKnown(source)) return null;
  for (const candidate of [
    source.total,
    source.totalCount,
    source.remoteCount,
    source.pagination?.total,
    source.pagination?.totalCount,
  ]) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 0;
}

function normalizeStatusFilter(value = "all") {
  const normalized = cleanText(value, "all").toLowerCase();
  return ["active", "pending", "blocked"].includes(normalized)
    ? normalized
    : "all";
}

export function buildUsuariosCursorQuery({
  cursor = "",
  limit = USUARIOS_CURSOR_PAGE_SIZE,
  search = "",
  status = "all",
  includeTotal = false,
  sortBy = "updatedAt",
  sortDir = "DESC",
} = {}) {
  const token = cleanText(cursor, "");
  const text = cleanText(search, "").slice(0, 200);
  const statusFilter = normalizeStatusFilter(status);

  /*
    COUNT(1) cross-partition es deliberadamente excepcional:
    sólo se permite en la primera página global sin búsqueda ni estado.
    Las consultas interactivas funcionan con totalKnown=false.
  */
  const shouldIncludeTotal =
    includeTotal === true &&
    !token &&
    !text &&
    statusFilter === "all";

  const query = {
    limit: clamp(limit, 1, USUARIOS_CURSOR_MAX_PAGE_SIZE),
    includeTotal: shouldIncludeTotal,
    sortBy: cleanText(sortBy, "updatedAt"),
    sortDir: cleanText(sortDir, "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC",
  };

  if (token) query.ct = token;
  if (text) {
    query.search = text;
    query.q = text;
  }
  if (statusFilter !== "all") {
    query.status = statusFilter;
  }

  return query;
}

export async function fetchUsuariosCursorPage(options = {}) {
  const response = await Http.get(
    USUARIOS_CURSOR_ENDPOINT,
    {
      timeout: clamp(
        options.timeout ?? USUARIOS_CURSOR_TIMEOUT,
        1_000,
        120_000
      ),
      query: buildUsuariosCursorQuery(options),
      source: "views.usuarios.cursor.page",
      signal: options.signal,
    }
  );

  if (safeObject(response)?.ok === false) {
    const error = new Error(
      cleanText(response?.message, "No se pudieron cargar los usuarios.")
    );
    error.code = cleanText(response?.code || response?.error, "USUARIOS_CURSOR_REJECTED");
    error.status = Number(response?.status || 0) || 0;
    throw error;
  }

  const items = normalizeUsuariosCollection(pickItems(response));
  const continuationToken = pickToken(response);
  const totalKnown = pickTotalKnown(response);
  const total = pickTotal(response);

  return {
    ok: true,
    items,
    count: items.length,
    returned: items.length,
    totalKnown,
    total,
    remoteCount: totalKnown ? total : null,
    hasMore: pickHasMore(response),
    continuationToken: continuationToken || null,
    nextContinuationToken: continuationToken || null,
    timestamp: response?.timestamp || null,
  };
}

export function mergeUsuariosCursorItems(previous = [], incoming = []) {
  return normalizeUsuariosCollection([
    ...safeArray(previous),
    ...safeArray(incoming),
  ]);
}

export default {
  version: USUARIOS_CURSOR_VERSION,
  endpoint: USUARIOS_CURSOR_ENDPOINT,
  pageSize: USUARIOS_CURSOR_PAGE_SIZE,
  maxPageSize: USUARIOS_CURSOR_MAX_PAGE_SIZE,
  buildQuery: buildUsuariosCursorQuery,
  fetchPage: fetchUsuariosCursorPage,
  mergeItems: mergeUsuariosCursorItems,
};
