/* =========================================================
   Onion Support - Global Entity Intent

   Traduce enlaces, botones y deeplinks en una intención de entidad estable.
   Este módulo es puro y no importa Router, vistas ni APIs de dominio.
========================================================= */

export const ENTITY_INTENT_VERSION =
  "entity-intent.v1.view-independent";

const TYPE_ALIASES = Object.freeze({
  factura: "factura",
  facturas: "factura",
  invoice: "factura",
  invoices: "factura",
  billing: "factura",

  incidencia: "incidencia",
  incidencias: "incidencia",
  ticket: "incidencia",
  tickets: "incidencia",
  issue: "incidencia",
  issues: "incidencia",

  cliente: "cliente",
  clientes: "cliente",
  client: "cliente",
  clients: "cliente",
  customer: "cliente",
  customers: "cliente",

  usuario: "usuario",
  usuarios: "usuario",
  user: "usuario",
  users: "usuario",
});

const EXPLICIT_ID_KEYS = Object.freeze({
  factura: Object.freeze([
    "entityId",
    "facturaId",
    "invoiceId",
    "invoiceNumber",
    "numeroFactura",
    "numeroFacturaLegal",
    "id",
  ]),
  incidencia: Object.freeze([
    "entityId",
    "incidenciaId",
    "ticketId",
    "issueId",
    "id",
  ]),
  cliente: Object.freeze([
    "entityId",
    "clienteId",
    "clientId",
    "customerId",
    "id",
  ]),
  usuario: Object.freeze([
    "entityId",
    "usuarioId",
    "userId",
    "id",
  ]),
});

const ROUTE_PARAM_KEYS = Object.freeze({
  factura: Object.freeze([
    "entityId",
    "facturaId",
    "invoiceId",
    "invoiceNumber",
    "numeroFactura",
    "id",
  ]),
  incidencia: Object.freeze([
    "entityId",
    "ticketId",
    "incidenciaId",
    "issueId",
    "id",
  ]),
  cliente: Object.freeze([
    "entityId",
    "clienteId",
    "clientId",
    "customerId",
    "id",
  ]),
  usuario: Object.freeze([
    "entityId",
    "usuarioId",
    "userId",
    "id",
  ]),
});

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function safeDecode(value = "") {
  try {
    return decodeURIComponent(String(value ?? ""));
  } catch {
    return String(value ?? "");
  }
}

function object(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return null;
}

export function normalizeEntityType(value = "") {
  const key = cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_.-]+/g, "")
    .replace(/[^a-z]/g, "");

  return TYPE_ALIASES[key] || "";
}

export function normalizeEntityId(type = "", value = "") {
  const entityType = normalizeEntityType(type);
  if (!entityType) return "";

  const id = cleanText(safeDecode(value), "")
    .replace(/^['"]+|['"]+$/g, "")
    .slice(0, 160);

  if (!id) return "";
  if (/[<>\r\n\t\\/?#&=]/.test(id)) return "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,159}$/.test(id)) return "";

  if (entityType === "incidencia" && /^inc-/i.test(id)) {
    return id.toUpperCase();
  }

  return id;
}

function urlFromRoute(route = "") {
  const raw = cleanText(route, "");
  if (!raw || raw.startsWith("javascript:")) return null;

  try {
    return new URL(raw, "https://onion.local/");
  } catch {
    return null;
  }
}

function routeType(url = null) {
  if (!url) return "";

  const segment = url.pathname
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)[0] || "";

  return normalizeEntityType(segment);
}

function routeId(type = "", url = null) {
  const entityType = normalizeEntityType(type);
  if (!entityType || !url) return "";

  for (const key of ROUTE_PARAM_KEYS[entityType] || []) {
    const candidate = normalizeEntityId(entityType, url.searchParams.get(key));
    if (candidate) return candidate;
  }

  const parts = url.pathname
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length > 1 && normalizeEntityType(parts[0]) === entityType) {
    return normalizeEntityId(entityType, parts[1]);
  }

  return "";
}

function explicitId(type = "", dataset = {}, input = {}) {
  const entityType = normalizeEntityType(type);
  if (!entityType) return "";

  const source = {
    ...object(dataset),
    ...object(input),
  };

  for (const key of EXPLICIT_ID_KEYS[entityType] || []) {
    const candidate = normalizeEntityId(entityType, source[key]);
    if (candidate) return candidate;
  }

  return "";
}

function textId(type = "", text = "") {
  const entityType = normalizeEntityType(type);
  const value = cleanText(text, "");
  if (!entityType || !value) return "";

  if (entityType === "incidencia") {
    const match = value.match(/\bINC-[A-Z0-9][A-Z0-9-]{4,119}\b/i);
    return normalizeEntityId(entityType, match?.[0] || "");
  }

  if (entityType === "factura") {
    const prefixed = value.match(
      /\b(?:FACTURA|FAC|INVOICE)\s*(?:ID|N[ÚU]MERO|N[ºO]|#|:|-)?\s*([A-Z0-9][A-Z0-9._:-]{5,40})\b/i
    );
    const prefixedId = normalizeEntityId(entityType, prefixed?.[1] || "");
    if (prefixedId) return prefixedId;

    const legalNumber = value.match(/\b([0-9]{8,20})\b/);
    return normalizeEntityId(entityType, legalNumber?.[1] || "");
  }

  return "";
}

export function inferEntityIntent(input = {}) {
  const data = object(input);
  const dataset = object(data.dataset);
  const route = first(
    data.route,
    data.href,
    dataset.route,
    dataset.href,
    dataset.path,
    ""
  );
  const url = urlFromRoute(route);

  const explicitType = normalizeEntityType(
    first(
      data.type,
      data.entityType,
      dataset.entityType,
      dataset.entity,
      ""
    )
  );

  const type = explicitType || routeType(url);
  if (!type) return null;

  const id =
    explicitId(type, dataset, data) ||
    routeId(type, url) ||
    textId(type, first(data.text, data.textContent, ""));

  if (!id) return null;

  return Object.freeze({
    type,
    id,
    source: cleanText(data.source, explicitType ? "explicit" : "route"),
  });
}

function datasetSnapshot(node = null) {
  if (!node?.dataset) return {};

  try {
    return { ...node.dataset };
  } catch {
    return {};
  }
}

function attribute(node = null, name = "") {
  try {
    return node?.getAttribute?.(name) || "";
  } catch {
    return "";
  }
}

/*
  Los controles de creación son interacciones locales del formulario.
  Sus data-user-id / data-cliente-id transportan la selección que consumirá
  el controller de Create; NO son una petición de navegación ni de quick view.

  El Entity Overlay escucha en capture sobre document, por lo que esta frontera
  debe evaluarse antes de inferir una entidad a partir de IDs genéricos.
  Se mantiene un escape explícito para una futura acción Create que sí quiera
  abrir una entidad deliberadamente.
*/
function blocksEntityIntentFromElement(element = null) {
  if (!element || typeof element.closest !== "function") return false;

  const localInteraction = element.closest(
    "[data-entity-overlay-ignore='true'], [data-create-action]"
  );

  if (!localInteraction) return false;

  const explicitlyAllowed =
    cleanText(attribute(localInteraction, "data-entity-overlay-allow"), "")
      .toLowerCase() === "true" ||
    cleanText(attribute(localInteraction, "data-entity-overlay-action"), "")
      .toLowerCase() === "open";

  return !explicitlyAllowed;
}

export function inferEntityIntentFromElement(target = null) {
  const element = target?.nodeType === 3 ? target.parentElement : target;
  if (!element || typeof element.closest !== "function") return null;

  if (blocksEntityIntentFromElement(element)) return null;

  const node = element.closest([
    "[data-entity-type]",
    "[data-entity-id]",
    "[data-factura-id]",
    "[data-invoice-id]",
    "[data-incidencia-id]",
    "[data-ticket-id]",
    "[data-cliente-id]",
    "[data-client-id]",
    "[data-usuario-id]",
    "[data-user-id]",
    "[data-route]",
    "a[href]",
    "button",
    "[role='button']",
  ].join(","));

  if (!node) return null;

  const dataset = datasetSnapshot(node);
  const type = first(
    dataset.entityType,
    dataset.facturaId || dataset.invoiceId ? "factura" : "",
    dataset.incidenciaId || dataset.ticketId ? "incidencia" : "",
    dataset.clienteId || dataset.clientId ? "cliente" : "",
    dataset.usuarioId || dataset.userId ? "usuario" : "",
    ""
  );

  const id = first(
    dataset.entityId,
    dataset.facturaId,
    dataset.invoiceId,
    dataset.incidenciaId,
    dataset.ticketId,
    dataset.clienteId,
    dataset.clientId,
    dataset.usuarioId,
    dataset.userId,
    ""
  );

  return inferEntityIntent({
    type,
    id,
    dataset,
    route: first(
      dataset.route,
      dataset.href,
      dataset.path,
      attribute(node, "href"),
      ""
    ),
    text: node.textContent || "",
    source: "dom",
  });
}

export default Object.freeze({
  version: ENTITY_INTENT_VERSION,
  normalizeEntityType,
  normalizeEntityId,
  inferEntityIntent,
  inferEntityIntentFromElement,
});
