/* =========================================================
   Onion Support - Usuarios Cursor API
   Archivo: /src/views/usuarios/usuarios.cursor.js

   CURSOR-FIRST · SERVER FILTERED · SCALE SAFE V3

   Responsabilidad:
   - Cargar una única página de /api/users.
   - Mantener continuation tokens opacos fuera del DOM y snapshots públicos.
   - Pedir total exacto sólo en la primera página sin filtros, nunca en búsquedas.
   - Delegar normalización de modelo al contrato canónico de usuarios.api.js.
   - Separar del directorio de Usuarios las identidades internas de Empleados.
========================================================= */

import { cleanText } from "../../core/presentation-text.js";
import { slugKey } from "../../core/slug-key.js";
import Http from "../../core/http.js";
import {
  normalizeUsuariosCollection,
} from "./usuarios.api.js";
import { isObject, safeObject } from "../../core/objects.js";
import { safeArray } from "../../core/arrays.js";
import { clamp, coercedNumber } from "../../core/numbers.js";
import { errorCode } from "../../core/errors.js";

export const USUARIOS_CURSOR_VERSION =
  "usuarios.cursor.v3.employee-directory-boundary";

const USUARIOS_CURSOR_ENDPOINT = "/api/users";
export const USUARIOS_CURSOR_PAGE_SIZE = 50;
const USUARIOS_CURSOR_MAX_PAGE_SIZE = 200;
const USUARIOS_CURSOR_TIMEOUT = 20_000;

/*
  Empleados reutiliza el usuario interno con rol administrativo. Hasta que el
  backend exponga una audiencia separada en /api/users, la vista Usuarios no
  debe mezclar cuentas internas con usuarios funcionales.
*/
/*
  LA CLAVE DEL DIRECTORIO ES `slugKey`, Y ESTE CONSUMIDOR LA IMPORTA.

  Los marcadores de abajo se escriben en la forma que produce `slugKey`:
  minúsculas, sin acentos, y espacios o guiones unidos con "_" --de ahí
  `super_admin` y `team_member`--. Un rol que llega como «Super Admin»,
  «super-admin» o «SUPER_ADMIN» tiene que colapsar a la misma clave o el
  límite entre el directorio funcional y las identidades internas deja de
  aplicarse.

  Aquí vivía una copia local llamada `directoryKey` con exactamente el cuerpo
  de `slugKey`. El barrido de claves por semántica (#646) la clasificó como
  copia muerta y la retiró, pero tenía dos llamadas vivas en este mismo
  fichero: la vista quedó lanzando `ReferenceError: directoryKey is not
  defined` en CADA carga de página, y el `catch` del controlador lo convertía
  en una pantalla sin usuarios. Por eso el nombre de la autoridad se usa tal
  cual, sin alias local: un alias vuelve a parecer una copia.
*/
const INTERNAL_EMPLOYEE_MARKERS = new Set([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "root",
  "owner",
  "employee",
  "empleado",
  "staff",
  "internal",
  "team",
  "team_member",
  "equipo",
]);


function isInternalEmployeeUsuario(item = {}) {
  const source = safeObject(item);

  if (
    source.employee === true ||
    source.isEmployee === true ||
    source.staff === true ||
    source.isStaff === true
  ) {
    return true;
  }

  const roleMarkers = [
    source.role,
    source.rol,
    ...safeArray(source.roles),
    source.profile?.role,
    source.profile?.rol,
    ...safeArray(source.profile?.roles),
  ]
    .map(slugKey)
    .filter(Boolean);

  if (roleMarkers.some((marker) => INTERNAL_EMPLOYEE_MARKERS.has(marker))) {
    return true;
  }

  const audienceMarkers = [
    source.personType,
    source.accountType,
    source.audience,
    source.kind,
    source.profileType,
    source.employmentType,
    source.employeeType,
    source.tipo,
  ]
    .map(slugKey)
    .filter(Boolean);

  return audienceMarkers.some((marker) => INTERNAL_EMPLOYEE_MARKERS.has(marker));
}

function filterUsuariosDirectoryItems(items = []) {
  return safeArray(items).filter((item) => !isInternalEmployeeUsuario(item));
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

function buildUsuariosCursorQuery({
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
    limit: clamp(coercedNumber(limit, 1), 1, USUARIOS_CURSOR_MAX_PAGE_SIZE),
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
      timeout: clamp(coercedNumber(options.timeout ?? USUARIOS_CURSOR_TIMEOUT, 1_000), 1_000, 120_000),
      query: buildUsuariosCursorQuery(options),
      source: "views.usuarios.cursor.page",
      signal: options.signal,
    }
  );

  if (safeObject(response)?.ok === false) {
    const error = new Error(
      cleanText(response?.message, "No se pudieron cargar los usuarios.")
    );
    error.code = errorCode(response, "USUARIOS_CURSOR_REJECTED");
    error.status = Number(response?.status || 0) || 0;
    throw error;
  }

  const normalizedItems = normalizeUsuariosCollection(pickItems(response));
  const items = filterUsuariosDirectoryItems(normalizedItems);
  const excludedInternalEmployees = Math.max(0, normalizedItems.length - items.length);
  const continuationToken = pickToken(response);

  /*
    El total remoto cuenta todas las cuentas de identidad, incluidas las
    internas. Como Usuarios muestra sólo su directorio funcional, no
    presentamos ese total bruto como total exacto de usuarios visibles.
  */
  const totalKnown = false;
  const total = null;

  return {
    ok: true,
    items,
    count: items.length,
    returned: items.length,
    excludedInternalEmployees,
    totalKnown,
    total,
    remoteCount: null,
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
  isInternalEmployee: isInternalEmployeeUsuario,
  filterDirectoryItems: filterUsuariosDirectoryItems,
};
