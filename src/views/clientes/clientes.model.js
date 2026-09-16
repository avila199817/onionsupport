/* =========================================================
   Onion Support - Clientes Model
   Archivo: /src/views/clientes/clientes.model.js

   CANÓNICO · SINGLE MODEL AUTHORITY

   Responsabilidad:
   - Normalizar clientes una sola vez para API, Controller y Templates.
   - Resolver identidad estable, estado, tipo, contacto y métricas.
   - Sanear campos sensibles antes de exponer raw al frontend.
   - No hacer HTTP, DOM, Router, Auth, cache ni navegación.
========================================================= */
import { cleanText } from "../../core/presentation-text.js";
import { isObject, safeObject, firstNonBlank } from "../../core/objects.js";
import { safeArray } from "../../core/arrays.js";
import { slugKey } from "../../core/slug-key.js";
import { BOOLEAN_POLICIES, parseBoolean } from "../../core/booleans.js";
import { TIMESTAMP_POLICIES, toTimestamp } from "../../core/dates.js";

export const CLIENTES_MODEL_VERSION =
  "clientes.model.v1.single-authority";

const CLIENTE_ID_MAX_LENGTH = 160;
const USER_ID_MAX_LENGTH = 160;
const TYPE_MAX_LENGTH = 20;
const NAME_MAX_LENGTH = 150;
const NIF_MAX_LENGTH = 20;
const STREET_MAX_LENGTH = 150;
const POSTAL_CODE_MAX_LENGTH = 10;
const CITY_MAX_LENGTH = 100;
const PROVINCE_MAX_LENGTH = 100;
const COUNTRY_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 150;
const PHONE_MAX_LENGTH = 30;
const SAFE_OBJECT_MAX_DEPTH = 8;
const SAFE_ARRAY_LIMIT = 10_000;

const SENSITIVE_KEY_RE =
  /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|password|pwd|secret|authorization|cookie|jwt|api[_-]?key|connection[_-]?string|sas|sig|signature|activation[_-]?token|reset[_-]?token|activationUrl|resetUrl|signedUrl|sasUrl)$/i;
const PROTOTYPE_KEY_RE = /^(?:__proto__|prototype|constructor)$/i;

function number(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;

  if (typeof value === "string") {
    let normalized = value
      .trim()
      .replace(/[€$£¥%]/g, "")
      .replace(/[^\d.,+\-\s]/g, "")
      .replace(/\s+/g, "");

    if (!normalized || normalized === "-" || normalized === "+") return fallback;
    const comma = normalized.lastIndexOf(",");
    const dot = normalized.lastIndexOf(".");

    if (comma >= 0 && dot >= 0) {
      normalized = comma > dot
        ? normalized.replace(/\./g, "").replace(/,/g, ".")
        : normalized.replace(/,/g, "");
    } else if (comma >= 0) {
      normalized = normalized.replace(/,/g, ".");
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeEmail(value = "") {
  const email = cleanText(value, "").toLowerCase();
  if (!email || ["null", "undefined", "none", "sin email", "sin_email", "no email", "no_email"].includes(email)) {
    return "";
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= EMAIL_MAX_LENGTH
    ? email
    : "";
}

function firstEmail(...values) {
  for (const value of values) {
    const email = normalizeEmail(value);
    if (email) return email;
  }
  return "";
}

function normalizePhone(value = "") {
  return cleanText(value, "")
    .replace(/[^\d+()\s.\-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PHONE_MAX_LENGTH);
}

function sanitizeDomainValue(value, depth = 0, seen = new WeakSet()) {
  if (depth > SAFE_OBJECT_MAX_DEPTH) return null;
  if (value === null || value === undefined) return value ?? null;

  const type = typeof value;
  if (type === "string") return value.slice(0, 10_000);
  if (type === "number") return Number.isFinite(value) ? value : 0;
  if (type === "boolean") return value;
  if (type === "bigint") return String(value);
  if (type === "function" || type === "symbol") return undefined;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;

  if (Array.isArray(value)) {
    return value
      .slice(0, SAFE_ARRAY_LIMIT)
      .map((item) => sanitizeDomainValue(item, depth + 1, seen))
      .filter((item) => item !== undefined);
  }

  if (!isObject(value)) return null;
  try {
    if (seen.has(value)) return null;
    seen.add(value);
  } catch {
    return null;
  }

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (!key || PROTOTYPE_KEY_RE.test(key) || SENSITIVE_KEY_RE.test(key)) continue;
    const clean = sanitizeDomainValue(child, depth + 1, seen);
    if (clean !== undefined) output[key] = clean;
  }
  return output;
}

function safeAvatarUrl(value = "") {
  const raw = cleanText(value, "");
  if (!raw || raw.startsWith("//") || /[\r\n\t\\]/.test(raw) || /^(?:javascript|data|vbscript|file):/i.test(raw)) {
    return "";
  }
  if (/^blob:/i.test(raw)) return raw;
  if (raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) return raw;
  if (!/^https:\/\//i.test(raw)) return "";

  try {
    const parsed = new URL(raw);
    if (/[?&#](?:access_token|refresh_token|id_token|token|secret|session|password|jwt|authorization)=/i.test(parsed.href)) {
      return "";
    }
    return parsed.href;
  } catch {
    return "";
  }
}

function normalizeClienteType(value = "") {
  const type = slugKey(value).slice(0, TYPE_MAX_LENGTH);
  if (["empresa", "company", "business", "b2b", "autonomo"].includes(type)) return "empresa";
  if (["particular", "persona", "individual", "b2c"].includes(type)) return "particular";
  return type || "cliente";
}

function normalizeStatusValue(value = "", source = {}) {
  const raw = safeObject(source);
  const explicit = slugKey(firstNonBlank(value, raw.status, raw.estado, raw.state, ""));

  if (["blocked", "bloqueado", "suspended", "locked"].includes(explicit)) return "blocked";
  if (["inactive", "inactivo", "disabled", "archived", "deleted"].includes(explicit)) return "inactive";
  if (["pending", "pendiente", "new", "nuevo", "invited"].includes(explicit)) return "pending";
  if (["vip", "premium"].includes(explicit)) return "vip";
  if (["active", "activo", "enabled", "ok"].includes(explicit)) return "active";

  const blocked = parseBoolean(raw.blocked, BOOLEAN_POLICIES.activityEs, null);
  const disabled = parseBoolean(raw.disabled, BOOLEAN_POLICIES.activityEs, null);
  const active = parseBoolean(firstNonBlank(raw.active, raw.isActive, raw.enabled, null), BOOLEAN_POLICIES.activityEs, null);
  if (blocked === true) return "blocked";
  if (disabled === true || active === false) return "inactive";
  return "active";
}

export function normalizeClienteModel(item = {}) {
  const original = safeObject(item);
  const raw = safeObject(sanitizeDomainValue(original), {});
  const contacto = safeObject(firstNonBlank(raw.contacto, raw.contact, raw.profile, {}), {});
  const direccion = safeObject(firstNonBlank(raw.direccion, raw.address, raw.location, {}), {});

  const clienteId = cleanText(firstNonBlank(
    raw.clienteId,
    raw.clientId,
    raw.customerId,
    raw.id,
    raw._id,
    raw.uid,
    ""
  ), "").slice(0, CLIENTE_ID_MAX_LENGTH);

  const userId = cleanText(firstNonBlank(
    raw.userId,
    raw.usuarioId,
    raw.ownerUserId,
    raw.user?.userId,
    raw.user?.id,
    ""
  ), "").slice(0, USER_ID_MAX_LENGTH);

  const tipo = normalizeClienteType(firstNonBlank(raw.tipo, raw.type, raw.clienteTipo, raw.segmento, ""));
  const nombreFiscal = cleanText(firstNonBlank(
    raw.nombreFiscal,
    raw.razonSocial,
    raw.businessName,
    raw.companyName,
    raw.displayName,
    raw.name,
    raw.nombre,
    contacto.nombre,
    clienteId,
    "Cliente"
  ), "Cliente").slice(0, NAME_MAX_LENGTH);

  const nombreContacto = cleanText(firstNonBlank(
    raw.nombreContacto,
    raw.contactoNombre,
    contacto.nombre,
    contacto.name,
    contacto.displayName,
    nombreFiscal,
    ""
  ), "").slice(0, NAME_MAX_LENGTH);

  const email = firstEmail(
    raw.email,
    raw.emailLower,
    raw.contactoEmail,
    raw.contactEmail,
    contacto.email,
    contacto.emailLower,
    ""
  );
  const phone = normalizePhone(firstNonBlank(
    raw.phone,
    raw.telefono,
    raw.contactoPhone,
    contacto.phone,
    contacto.telefono,
    ""
  ));
  const nif = cleanText(firstNonBlank(raw.nif, raw.cif, raw.taxId, raw.vatNumber, ""), "")
    .toUpperCase()
    .slice(0, NIF_MAX_LENGTH);
  const city = cleanText(firstNonBlank(raw.city, raw.ciudad, direccion.ciudad, direccion.city, ""), "")
    .slice(0, CITY_MAX_LENGTH);
  const avatar = safeAvatarUrl(firstNonBlank(raw.avatar, raw.avatarUrl, raw.photoUrl, raw.picture, ""));
  const status = normalizeStatusValue(firstNonBlank(raw.status, raw.estado, raw.state, ""), raw);
  const active = status === "active" || status === "vip";
  const createdAt = firstNonBlank(raw.createdAt, raw.created_at, raw.fechaCreacion, null);
  const updatedAt = firstNonBlank(raw.updatedAt, raw.updated_at, raw.modifiedAt, createdAt, null);
  const invoicesCount = Math.max(0, number(firstNonBlank(raw.invoicesCount, raw.facturasCount, raw.invoiceCount, raw.stats?.facturasCount, 0), 0));
  const ticketsCount = Math.max(0, number(firstNonBlank(raw.ticketsCount, raw.incidenciasCount, raw.ticketCount, raw.stats?.ticketsCount, 0), 0));
  const totalAmount = number(firstNonBlank(raw.totalAmount, raw.totalImporte, raw.facturasTotal, raw.stats?.totalFacturado, 0), 0);

  const normalizedAddress = {
    ...direccion,
    calle: cleanText(firstNonBlank(direccion.calle, direccion.street, raw.calle, ""), "").slice(0, STREET_MAX_LENGTH),
    cp: cleanText(firstNonBlank(direccion.cp, direccion.postalCode, raw.cp, ""), "").slice(0, POSTAL_CODE_MAX_LENGTH),
    ciudad: city,
    city,
    provincia: cleanText(firstNonBlank(direccion.provincia, direccion.province, raw.provincia, ""), "").slice(0, PROVINCE_MAX_LENGTH),
    pais: cleanText(firstNonBlank(direccion.pais, direccion.country, raw.pais, ""), "").slice(0, COUNTRY_MAX_LENGTH),
  };

  const normalizedContact = {
    ...contacto,
    nombre: nombreContacto,
    name: nombreContacto,
    email,
    emailLower: email,
    phone,
    telefono: phone,
  };

  return {
    ...raw,
    raw,
    id: clienteId,
    _id: cleanText(firstNonBlank(raw._id, clienteId), clienteId).slice(0, CLIENTE_ID_MAX_LENGTH),
    uid: cleanText(firstNonBlank(raw.uid, clienteId), clienteId).slice(0, CLIENTE_ID_MAX_LENGTH),
    clienteId,
    clientId: cleanText(firstNonBlank(raw.clientId, clienteId), clienteId).slice(0, CLIENTE_ID_MAX_LENGTH),
    customerId: cleanText(firstNonBlank(raw.customerId, clienteId), clienteId).slice(0, CLIENTE_ID_MAX_LENGTH),
    userId,
    code: cleanText(firstNonBlank(raw.code, raw.codigo, clienteId, nif, email), "CLI-SIN-ID").slice(0, CLIENTE_ID_MAX_LENGTH),
    codigo: cleanText(firstNonBlank(raw.codigo, raw.code, clienteId, nif, email), "CLI-SIN-ID").slice(0, CLIENTE_ID_MAX_LENGTH),
    tipo,
    type: tipo,
    clienteTipo: tipo,
    segment: tipo,
    nombreFiscal,
    razonSocial: cleanText(firstNonBlank(raw.razonSocial, nombreFiscal), nombreFiscal).slice(0, NAME_MAX_LENGTH),
    businessName: cleanText(firstNonBlank(raw.businessName, nombreFiscal), nombreFiscal).slice(0, NAME_MAX_LENGTH),
    companyName: cleanText(firstNonBlank(raw.companyName, nombreFiscal), nombreFiscal).slice(0, NAME_MAX_LENGTH),
    displayName: cleanText(firstNonBlank(raw.displayName, nombreFiscal), nombreFiscal).slice(0, NAME_MAX_LENGTH),
    fullName: cleanText(firstNonBlank(raw.fullName, nombreFiscal), nombreFiscal).slice(0, NAME_MAX_LENGTH),
    name: cleanText(firstNonBlank(raw.name, nombreFiscal), nombreFiscal).slice(0, NAME_MAX_LENGTH),
    nombre: cleanText(firstNonBlank(raw.nombre, nombreFiscal), nombreFiscal).slice(0, NAME_MAX_LENGTH),
    nombreContacto,
    contactoNombre: nombreContacto,
    contacto: normalizedContact,
    email,
    emailLower: email,
    mail: email,
    contactEmail: email,
    billingEmail: firstEmail(raw.billingEmail, raw.emailFacturacion, email),
    phone,
    telefono: phone,
    mobile: normalizePhone(firstNonBlank(raw.mobile, raw.movil, phone)),
    nif,
    cif: cleanText(firstNonBlank(raw.cif, nif), nif).toUpperCase().slice(0, NIF_MAX_LENGTH),
    taxId: cleanText(firstNonBlank(raw.taxId, nif), nif).toUpperCase().slice(0, NIF_MAX_LENGTH),
    direccion: normalizedAddress,
    address: normalizedAddress,
    city,
    ciudad: city,
    avatar,
    avatarUrl: avatar,
    photoUrl: avatar,
    picture: avatar,
    hasAvatar: Boolean(avatar),
    status,
    estado: status,
    state: status,
    active,
    isActive: active,
    enabled: active,
    blocked: status === "blocked",
    vip: status === "vip",
    isVip: status === "vip",
    createdAt,
    updatedAt,
    lastActivityAt: firstNonBlank(raw.lastActivityAt, updatedAt, createdAt, null),
    lastContactAt: firstNonBlank(raw.lastContactAt, null),
    lastInvoiceAt: firstNonBlank(raw.lastInvoiceAt, null),
    lastTicketAt: firstNonBlank(raw.lastTicketAt, null),
    invoicesCount,
    facturasCount: invoicesCount,
    invoiceCount: invoicesCount,
    ticketsCount,
    incidenciasCount: ticketsCount,
    ticketCount: ticketsCount,
    totalAmount,
    totalImporte: totalAmount,
    facturasTotal: totalAmount,
  };
}

export function getClienteStableId(item = {}) {
  const current = safeObject(item);
  const raw = safeObject(current.raw);
  return cleanText(firstNonBlank(
    current.clienteId,
    current.clientId,
    current.customerId,
    current.id,
    current._id,
    current.uid,
    raw.clienteId,
    raw.clientId,
    raw.customerId,
    raw.id,
    raw._id,
    raw.uid,
    ""
  ), "").slice(0, CLIENTE_ID_MAX_LENGTH);
}

function sortTimestamp(item = {}) {
  const current = normalizeClienteModel(item);
  return toTimestamp(firstNonBlank(current.lastActivityAt, current.updatedAt, current.createdAt, 0), TIMESTAMP_POLICIES.epoch);
}

export function normalizeClientesCollection(items = []) {
  const map = new Map();
  for (const raw of safeArray(items)) {
    if (!isObject(raw)) continue;
    const normalized = normalizeClienteModel(raw);
    const id = getClienteStableId(normalized);
    if (!id) continue;
    const key = id.toLowerCase();
    map.set(
      key,
      map.has(key)
        ? normalizeClienteModel({
            ...map.get(key),
            ...normalized,
            raw: {
              ...safeObject(map.get(key)?.raw),
              ...safeObject(normalized.raw),
            },
          })
        : normalized
    );
  }

  return [...map.values()].sort((a, b) => {
    const diff = sortTimestamp(b) - sortTimestamp(a);
    return diff || getClienteStableId(a).localeCompare(getClienteStableId(b), "es", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

export const dedupeClientes = normalizeClientesCollection;

export function findClienteById(items = [], id = "") {
  const target = cleanText(id, "").toLowerCase();
  if (!target) return null;
  return safeArray(items).find((raw) => {
    const current = normalizeClienteModel(raw);
    return [
      current.clienteId,
      current.clientId,
      current.customerId,
      current.id,
      current._id,
      current.uid,
      current.nif,
      current.email,
    ].some((candidate) => cleanText(candidate, "").toLowerCase() === target);
  }) || null;
}

export function statusBucket(item = {}) {
  const status = normalizeClienteModel(item).status;
  if (status === "pending") return "pending";
  if (["blocked", "inactive"].includes(status)) return "blocked";
  return "active";
}

export function computeClientesStats(items = []) {
  return safeArray(items).reduce((stats, raw) => {
    const item = normalizeClienteModel(raw);
    const bucket = statusBucket(item);
    stats.total += 1;
    if (bucket === "active") stats.activeCount += 1;
    if (bucket === "pending") stats.pendingCount += 1;
    if (bucket === "blocked") stats.blockedCount += 1;
    if (item.vip) stats.vipCount += 1;
    stats.invoicesCount += Math.max(0, number(item.invoicesCount, 0));
    stats.ticketsCount += Math.max(0, number(item.ticketsCount, 0));
    stats.totalAmount += number(item.totalAmount, 0);
    return stats;
  }, {
    total: 0,
    activeCount: 0,
    pendingCount: 0,
    blockedCount: 0,
    vipCount: 0,
    invoicesCount: 0,
    ticketsCount: 0,
    totalAmount: 0,
  });
}

export function filterClientes(items = [], { filter = "all", search = "" } = {}) {
  const requested = slugKey(filter || "all");
  const terms = cleanText(search, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  return normalizeClientesCollection(items).filter((item) => {
    if (requested !== "all" && statusBucket(item) !== requested) return false;
    if (!terms.length) return true;
    const haystack = [
      item.clienteId,
      item.userId,
      item.code,
      item.nombreFiscal,
      item.nombreContacto,
      item.email,
      item.phone,
      item.city,
      item.nif,
      item.tipo,
      item.status,
    ].join(" ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return terms.every((term) => haystack.includes(term));
  });
}

export default Object.freeze({
  version: CLIENTES_MODEL_VERSION,
  normalizeClienteModel,
  normalizeClientesCollection,
  dedupeClientes,
  findClienteById,
  getClienteStableId,
  statusBucket,
  computeClientesStats,
  filterClientes,
});
