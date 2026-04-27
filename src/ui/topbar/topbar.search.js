/* =========================================================
   Onion SPA - Topbar Search
   Archivo: src/ui/topbar/topbar.search.js

   FINAL PRO SYSTEM · SEARCH GOD MODE · NO SELF IMPORT · NO EVENT STORM · 10/10

   Responsabilidades:
   - gestionar cache de búsqueda
   - construir índice local
   - normalizar payloads remotos
   - ejecutar búsqueda API
   - fusionar resultados locales + remotos
   - renderizar resultados del buscador
   - gestionar navegación / apertura a resultados
   - abrir ficha de usuario desde search
   - abrir cliente desde search
   - abrir modal de incidencia desde search
   - abrir factura desde search
   - actualizar estados visuales del panel search
   - activar overlay glass global desde JS
   - centrar la atención visual en el buscador

   FIX CRÍTICO:
   - NO importa desde ./topbar.search.js porque este archivo ES topbar.search.js
   - abort/search sequence evita resultados antiguos
   - overlay idempotente, sin parpadeo por recreación continua
   - emitSearchEvent usa bus interno o window, no ambos a la vez
   - facturas no emite tormenta de eventos en cada retry
   - guards browser para window/document/AbortController
========================================================= */

import {
  TOPBAR_SEARCH_CONFIG,
  escapeHtml,
  normalizeText,
  normalizeQuery,
  uniqBy,
  safeNormalizePath,
  getTypeLabel,
  getTypeIcon,
  highlight,
  scoreTextMatch,
  scoreResult,
  groupResults,
} from "./topbar.helpers.js";

/* =========================================================
   SEARCH FOCUS OVERLAY
========================================================= */

const SEARCH_GLASS_ID =
  "topbar-search-glass-overlay";

const searchGlassRuntime = {
  runtime:
    null,

  getDom:
    null,

  active:
    false,
};

/* =========================================================
   ACTIONS / TYPES
========================================================= */

const SEARCH_ACTIONS = Object.freeze({
  NAVIGATE:
    "navigate",

  OPEN_USUARIO:
    "open_usuario",

  OPEN_CLIENTE:
    "open_cliente",

  OPEN_INCIDENCIA:
    "open_incidencia",

  OPEN_FACTURA:
    "open_factura",
});

const ENTITY_TYPES = Object.freeze({
  NAV:
    "nav",

  USUARIO:
    "usuario",

  CLIENTE:
    "cliente",

  INCIDENCIA:
    "incidencia",

  FACTURA:
    "factura",

  GENERAL:
    "general",
});

const TYPE_ALIASES = Object.freeze({
  nav:
    ENTITY_TYPES.NAV,
  route:
    ENTITY_TYPES.NAV,
  routes:
    ENTITY_TYPES.NAV,
  ruta:
    ENTITY_TYPES.NAV,
  rutas:
    ENTITY_TYPES.NAV,
  navigation:
    ENTITY_TYPES.NAV,
  navegacion:
    ENTITY_TYPES.NAV,

  user:
    ENTITY_TYPES.USUARIO,
  users:
    ENTITY_TYPES.USUARIO,
  usuario:
    ENTITY_TYPES.USUARIO,
  usuarios:
    ENTITY_TYPES.USUARIO,
  account:
    ENTITY_TYPES.USUARIO,
  accounts:
    ENTITY_TYPES.USUARIO,
  profile:
    ENTITY_TYPES.USUARIO,
  perfil:
    ENTITY_TYPES.USUARIO,
  cuenta:
    ENTITY_TYPES.USUARIO,

  client:
    ENTITY_TYPES.CLIENTE,
  clients:
    ENTITY_TYPES.CLIENTE,
  cliente:
    ENTITY_TYPES.CLIENTE,
  clientes:
    ENTITY_TYPES.CLIENTE,
  customer:
    ENTITY_TYPES.CLIENTE,
  customers:
    ENTITY_TYPES.CLIENTE,

  ticket:
    ENTITY_TYPES.INCIDENCIA,
  tickets:
    ENTITY_TYPES.INCIDENCIA,
  incidencia:
    ENTITY_TYPES.INCIDENCIA,
  incidencias:
    ENTITY_TYPES.INCIDENCIA,
  issue:
    ENTITY_TYPES.INCIDENCIA,
  issues:
    ENTITY_TYPES.INCIDENCIA,
  support:
    ENTITY_TYPES.INCIDENCIA,
  soporte:
    ENTITY_TYPES.INCIDENCIA,

  factura:
    ENTITY_TYPES.FACTURA,
  facturas:
    ENTITY_TYPES.FACTURA,
  invoice:
    ENTITY_TYPES.FACTURA,
  invoices:
    ENTITY_TYPES.FACTURA,
  bill:
    ENTITY_TYPES.FACTURA,
  billing:
    ENTITY_TYPES.FACTURA,
  recibo:
    ENTITY_TYPES.FACTURA,
  recibos:
    ENTITY_TYPES.FACTURA,
});

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function first(...values) {
  for (const value of values) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function sleep(ms = 0) {
  return new Promise((resolve) => {
    const delay =
      Math.max(0, Number(ms) || 0);

    try {
      if (isBrowser()) {
        window.setTimeout(resolve, delay);
        return;
      }
    } catch {}

    setTimeout(resolve, delay);
  });
}

function encodePathSegment(value = "") {
  return encodeURIComponent(
    safeText(value, "")
  );
}

function hasOwnKeys(value = {}) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length
  );
}

function normalizeSearchType(value = "") {
  const raw =
    safeText(value, "general").toLowerCase();

  const compact =
    normalizeText(raw)
      .replace(/[^a-z0-9_-]/gi, "");

  return (
    TYPE_ALIASES[compact] ||
    compact ||
    ENTITY_TYPES.GENERAL
  );
}

function coerceDisplayText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return safeText(value, fallback);
  }

  if (
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return safeText(
      first(
        value.title,
        value.name,
        value.nombre,
        value.nombreFiscal,
        value.razonSocial,
        value.nombreComercial,
        value.nombreContacto,
        value.displayName,
        value.email,
        value.id,
        value.clienteId,
        value.userId,
        value.facturaId,
        value.ticketId
      ),
      fallback
    );
  }

  return safeText(value, fallback);
}

function isUnsafeHref(value = "") {
  const href =
    safeText(value, "").toLowerCase();

  return (
    href.startsWith("javascript:") ||
    href.startsWith("data:") ||
    href.startsWith("vbscript:") ||
    href.startsWith("file:")
  );
}

function normalizeResultUrl(AppCore, value = "") {
  const raw =
    safeText(value, "");

  if (
    !raw ||
    isUnsafeHref(raw)
  ) {
    return null;
  }

  if (/^https?:\/\//i.test(raw)) {
    if (!isBrowser()) {
      return null;
    }

    try {
      const url =
        new URL(raw);

      if (
        window.location?.origin &&
        url.origin !== window.location.origin
      ) {
        return null;
      }

      return safeNormalizePath(
        AppCore,
        `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`
      );
    } catch {
      return null;
    }
  }

  if (!raw.startsWith("/")) {
    return safeNormalizePath(
      AppCore,
      `/${raw}`
    );
  }

  return safeNormalizePath(
    AppCore,
    raw
  );
}

function getCssNumberVar(name = "", fallback = 0) {
  if (!isBrowser()) {
    return fallback;
  }

  try {
    const value =
      window
        .getComputedStyle(document.documentElement)
        .getPropertyValue(name);

    const parsed =
      Number.parseInt(
        String(value || "").trim(),
        10
      );

    return Number.isFinite(parsed)
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
}

function showToast(AppCore, message = "", type = "info") {
  const text =
    safeText(message, "");

  const level =
    safeText(type, "info");

  if (!text) {
    return false;
  }

  try {
    if (isFunction(AppCore?.toast?.[level])) {
      AppCore.toast[level](text);
      return true;
    }
  } catch {}

  try {
    if (isFunction(AppCore?.toast?.show)) {
      AppCore.toast.show(text, level);
      return true;
    }
  } catch {}

  try {
    if (isFunction(AppCore?.ui?.toast?.[level])) {
      AppCore.ui.toast[level](text);
      return true;
    }
  } catch {}

  return false;
}

function warn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[TopbarSearch]", ...args);
    return;
  } catch {}

  try {
    console.warn("[TopbarSearch]", ...args);
  } catch {}
}

function safeAbortController() {
  try {
    if (typeof AbortController === "function") {
      return new AbortController();
    }
  } catch {}

  return null;
}

/* =========================================================
   MODULE RESOLUTION
========================================================= */

function getModuleCandidate(AppCore, name = "") {
  const key =
    safeText(name, "");

  if (!key) {
    return null;
  }

  try {
    if (isFunction(AppCore?.modules?.get)) {
      const found =
        AppCore.modules.get(key);

      if (found) {
        return found;
      }
    }
  } catch {}

  try {
    if (
      AppCore?.modules &&
      typeof AppCore.modules === "object" &&
      AppCore.modules[key]
    ) {
      return AppCore.modules[key];
    }
  } catch {}

  try {
    if (AppCore?.[key]) {
      return AppCore[key];
    }
  } catch {}

  try {
    if (
      isBrowser() &&
      window?.[key]
    ) {
      return window[key];
    }
  } catch {}

  return null;
}

function getFirstModule(AppCore, names = []) {
  for (const name of safeArray(names)) {
    const found =
      getModuleCandidate(AppCore, name);

    if (found) {
      return found;
    }
  }

  return null;
}

function getFacturasModule(AppCore) {
  return getFirstModule(
    AppCore,
    [
      "Facturas",
      "FacturasView",
      "OnionFacturas",
      "OnionFacturasView",
      "facturas",
      "facturasView",
    ]
  );
}

/* =========================================================
   RAW EXTRACTION
========================================================= */

function getRawType(raw = {}) {
  const item =
    safeObject(raw);

  return first(
    item.type,
    item.entity,
    item.kind,
    item.group,
    item.category,
    item.collection,
    item.module,
    item.resource,
    item.scope,
    ENTITY_TYPES.GENERAL
  );
}

function getRawTitle(raw = {}) {
  const item =
    safeObject(raw);

  return coerceDisplayText(
    first(
      item.title,
      item.name,
      item.nombre,
      item.displayName,
      item.fullName,
      item.label,
      item.username,
      item.email,
      item.subject,
      item.asunto,

      item.numeroFacturaLegal,
      item.numeroFacturaSistema,
      item.numeroFactura,
      item.facturaId,
      item.invoiceId,
      item.invoiceNumber,

      item.ticketId,
      item.incidenciaId,
      item.clienteId,
      item.userId,

      item.numero,
      item.number,
      item.code,
      item.codigo,
      item.id,
      item._id,
      "Resultado"
    ),
    "Resultado"
  );
}

function getRawSubtitle(raw = {}) {
  const item =
    safeObject(raw);

  const clienteText =
    coerceDisplayText(
      first(
        item.cliente,
        item.client,
        item.customer,
        item.clienteNombre,
        item.clientName,
        item.customerName
      ),
      ""
    );

  return coerceDisplayText(
    first(
      item.subtitle,
      item.description,
      item.descripcion,
      item.preview,
      clienteText,
      item.email,
      item.role,
      item.rol,
      item.estado,
      item.status,
      item.priority,
      item.prioridad,
      item.numeroFacturaLegal,
      item.numeroFactura,
      item.numero,
      item.code,
      item.codigo,
      item.total,
      item.amount,
      ""
    ),
    ""
  );
}

function getRawUrl(raw = {}) {
  const item =
    safeObject(raw);

  return safeText(
    first(
      item.url,
      item.path,
      item.href,
      item.route,
      item.to,
      item.link,
      item.publicPath,
      item.spaPath,
      ""
    ),
    ""
  );
}

function getEntityIdByType(type = "", raw = {}, fallback = "") {
  const item =
    safeObject(raw);

  const normalizedType =
    normalizeSearchType(type);

  if (normalizedType === ENTITY_TYPES.USUARIO) {
    return safeText(
      first(
        item.userId,
        item.usuarioId,
        item.uid,
        item.id,
        item._id,
        item.uuid,
        item.username,
        item.email,
        item.key,
        fallback
      ),
      ""
    );
  }

  if (normalizedType === ENTITY_TYPES.CLIENTE) {
    return safeText(
      first(
        item.clienteId,
        item.clientId,
        item.customerId,
        item.id,
        item._id,
        item.uuid,
        item.cif,
        item.nif,
        item.email,
        item.key,
        fallback
      ),
      ""
    );
  }

  if (normalizedType === ENTITY_TYPES.INCIDENCIA) {
    return safeText(
      first(
        item.ticketId,
        item.incidenciaId,
        item.issueId,
        item.id,
        item._id,
        item.uuid,
        item.ticketCode,
        item.code,
        item.codigo,
        item.numero,
        item.key,
        fallback
      ),
      ""
    );
  }

  if (normalizedType === ENTITY_TYPES.FACTURA) {
    return safeText(
      first(
        item.facturaId,
        item.invoiceId,
        item.id,
        item._id,
        item.uuid,
        item.numeroFacturaLegal,
        item.numeroFacturaSistema,
        item.numeroFactura,
        item.invoiceNumber,
        item.invoiceCode,
        item.numero,
        item.number,
        item.code,
        item.codigo,
        item.key,
        fallback
      ),
      ""
    );
  }

  return safeText(
    first(
      item.entityId,
      item.id,
      item._id,
      item.uuid,
      item.key,
      fallback
    ),
    ""
  );
}

/* =========================================================
   FALLBACK URLS
========================================================= */

function getFallbackUrlForEntity(AppCore, type = "", entityId = "", raw = {}) {
  const normalizedType =
    normalizeSearchType(type);

  const id =
    safeText(entityId, "");

  const rawUrl =
    getRawUrl(raw);

  const normalizedRawUrl =
    normalizeResultUrl(
      AppCore,
      rawUrl
    );

  if (normalizedRawUrl) {
    return normalizedRawUrl;
  }

  if (!id) {
    return null;
  }

  const encoded =
    encodePathSegment(id);

  if (normalizedType === ENTITY_TYPES.USUARIO) {
    return safeNormalizePath(
      AppCore,
      `/usuarios?id=${encoded}`
    );
  }

  if (normalizedType === ENTITY_TYPES.CLIENTE) {
    return safeNormalizePath(
      AppCore,
      `/clientes?id=${encoded}`
    );
  }

  if (normalizedType === ENTITY_TYPES.INCIDENCIA) {
    return safeNormalizePath(
      AppCore,
      `/incidencias?id=${encoded}`
    );
  }

  if (normalizedType === ENTITY_TYPES.FACTURA) {
    return safeNormalizePath(
      AppCore,
      `/facturas?id=${encoded}`
    );
  }

  return null;
}

/* =========================================================
   ACTION RESOLUTION
========================================================= */

function getActionForType(type = "", raw = {}) {
  const item =
    safeObject(raw);

  const explicit =
    safeText(
      first(
        item.action,
        item.openAction,
        item.searchAction
      ),
      ""
    ).toLowerCase();

  if (explicit) {
    if (
      [
        SEARCH_ACTIONS.OPEN_USUARIO,
        "usuario",
        "user",
        "open_user",
        "open_usuario",
        "open_user_profile",
        "open_usuario_ficha",
      ].includes(explicit)
    ) {
      return SEARCH_ACTIONS.OPEN_USUARIO;
    }

    if (
      [
        SEARCH_ACTIONS.OPEN_CLIENTE,
        "cliente",
        "client",
        "open_client",
        "open_cliente",
        "open_cliente_ficha",
      ].includes(explicit)
    ) {
      return SEARCH_ACTIONS.OPEN_CLIENTE;
    }

    if (
      [
        SEARCH_ACTIONS.OPEN_INCIDENCIA,
        "ticket",
        "incidencia",
        "issue",
        "open_ticket",
        "open_incidencia",
        "open_ticket_modal",
        "open_incidencia_modal",
      ].includes(explicit)
    ) {
      return SEARCH_ACTIONS.OPEN_INCIDENCIA;
    }

    if (
      [
        SEARCH_ACTIONS.OPEN_FACTURA,
        "factura",
        "invoice",
        "open_factura",
        "open_invoice",
        "open_factura_modal",
        "open_invoice_modal",
        "open_factura_detail",
        "open_invoice_detail",
      ].includes(explicit)
    ) {
      return SEARCH_ACTIONS.OPEN_FACTURA;
    }

    if (
      [
        "navigate",
        "nav",
        "route",
        "go",
      ].includes(explicit)
    ) {
      return SEARCH_ACTIONS.NAVIGATE;
    }
  }

  const normalizedType =
    normalizeSearchType(type);

  if (normalizedType === ENTITY_TYPES.USUARIO) {
    return SEARCH_ACTIONS.OPEN_USUARIO;
  }

  if (normalizedType === ENTITY_TYPES.CLIENTE) {
    return SEARCH_ACTIONS.OPEN_CLIENTE;
  }

  if (normalizedType === ENTITY_TYPES.INCIDENCIA) {
    return SEARCH_ACTIONS.OPEN_INCIDENCIA;
  }

  if (normalizedType === ENTITY_TYPES.FACTURA) {
    return SEARCH_ACTIONS.OPEN_FACTURA;
  }

  return SEARCH_ACTIONS.NAVIGATE;
}

function getActionLabel(item = {}) {
  const action =
    safeText(
      item.action,
      SEARCH_ACTIONS.NAVIGATE
    );

  if (action === SEARCH_ACTIONS.OPEN_USUARIO) {
    return "Abrir ficha";
  }

  if (action === SEARCH_ACTIONS.OPEN_CLIENTE) {
    return "Abrir cliente";
  }

  if (action === SEARCH_ACTIONS.OPEN_INCIDENCIA) {
    return "Abrir modal";
  }

  if (action === SEARCH_ACTIONS.OPEN_FACTURA) {
    return "Abrir factura";
  }

  return "";
}

/* =========================================================
   PAYLOAD BUILDERS
========================================================= */

function buildSearchPayload(item = {}, detail = null) {
  const raw =
    safeObject(item.raw);

  const normalizedType =
    normalizeSearchType(item.type);

  const entityId =
    safeText(item.entityId, "");

  const detailObject =
    safeObject(detail);

  const mergedDetail = {
    ...raw,
    ...detailObject,

    id:
      first(
        detailObject.id,
        raw.id,
        entityId
      ),

    _id:
      first(
        detailObject._id,
        raw._id,
        entityId
      ),

    entityId,
    type:
      normalizedType,

    raw: {
      ...raw,
      ...safeObject(
        detailObject.raw ||
        detailObject
      ),

      searchItem: {
        id:
          item.id,
        type:
          item.type,
        title:
          item.title,
        subtitle:
          item.subtitle,
        url:
          item.url,
        action:
          item.action,
        entityId:
          item.entityId,
        source:
          item.source,
      },
    },
  };

  if (normalizedType === ENTITY_TYPES.USUARIO) {
    mergedDetail.userId =
      first(
        detailObject.userId,
        detailObject.usuarioId,
        raw.userId,
        raw.usuarioId,
        entityId
      );

    mergedDetail.usuarioId =
      mergedDetail.userId;
  }

  if (normalizedType === ENTITY_TYPES.CLIENTE) {
    mergedDetail.clienteId =
      first(
        detailObject.clienteId,
        detailObject.clientId,
        raw.clienteId,
        raw.clientId,
        entityId
      );

    mergedDetail.clientId =
      mergedDetail.clienteId;
  }

  if (normalizedType === ENTITY_TYPES.INCIDENCIA) {
    mergedDetail.ticketId =
      first(
        detailObject.ticketId,
        detailObject.incidenciaId,
        detailObject.id,
        raw.ticketId,
        raw.incidenciaId,
        raw.id,
        entityId
      );

    mergedDetail.incidenciaId =
      mergedDetail.ticketId;
  }

  if (normalizedType === ENTITY_TYPES.FACTURA) {
    mergedDetail.facturaId =
      first(
        detailObject.facturaId,
        detailObject.invoiceId,
        detailObject.id,
        raw.facturaId,
        raw.invoiceId,
        raw.id,
        entityId
      );

    mergedDetail.invoiceId =
      mergedDetail.facturaId;

    mergedDetail.numeroFacturaLegal =
      first(
        detailObject.numeroFacturaLegal,
        raw.numeroFacturaLegal,
        detailObject.numeroFactura,
        raw.numeroFactura,
        detailObject.numero,
        raw.numero,
        detailObject.invoiceNumber,
        raw.invoiceNumber
      );
  }

  return mergedDetail;
}

function buildEntityOpenPayload({
  item = {},
  detail = {},
  entityId = "",
  type = "",
} = {}) {
  const normalizedType =
    normalizeSearchType(type || item.type);

  const id =
    safeText(entityId, "");

  const payload = {
    source:
      "topbar-search",

    item,
    detail,
    entityId:
      id,
    id,
    type:
      normalizedType,
  };

  if (normalizedType === ENTITY_TYPES.USUARIO) {
    payload.user =
      detail;
    payload.usuario =
      detail;
    payload.userId =
      id;
    payload.usuarioId =
      id;
  }

  if (normalizedType === ENTITY_TYPES.CLIENTE) {
    payload.client =
      detail;
    payload.cliente =
      detail;
    payload.clientId =
      id;
    payload.clienteId =
      id;
  }

  if (normalizedType === ENTITY_TYPES.INCIDENCIA) {
    payload.ticket =
      detail;
    payload.incidencia =
      detail;
    payload.ticketId =
      id;
    payload.incidenciaId =
      id;
  }

  if (normalizedType === ENTITY_TYPES.FACTURA) {
    payload.factura =
      detail;
    payload.invoice =
      detail;
    payload.facturaId =
      id;
    payload.invoiceId =
      id;
  }

  return payload;
}

/* =========================================================
   API DETAIL
========================================================= */

function pickEntityPayloadFromResponse(response = null, type = "") {
  const obj =
    safeObject(response);

  const normalizedType =
    normalizeSearchType(type);

  if (!hasOwnKeys(obj)) {
    return null;
  }

  if (normalizedType === ENTITY_TYPES.INCIDENCIA) {
    return first(
      obj.detail,
      obj.ticket,
      obj.incidencia,
      obj.issue,
      obj.item,
      obj.data?.detail,
      obj.data?.ticket,
      obj.data?.incidencia,
      obj.data?.item,
      obj.data,
      obj.result?.detail,
      obj.result?.ticket,
      obj.result?.incidencia,
      obj.result?.item,
      obj.result,
      obj.payload?.detail,
      obj.payload?.ticket,
      obj.payload?.incidencia,
      obj.payload?.item,
      obj.payload,
      obj
    );
  }

  if (normalizedType === ENTITY_TYPES.USUARIO) {
    return first(
      obj.detail,
      obj.user,
      obj.usuario,
      obj.profile,
      obj.item,
      obj.data?.detail,
      obj.data?.user,
      obj.data?.usuario,
      obj.data?.item,
      obj.data,
      obj.result,
      obj.payload,
      obj
    );
  }

  if (normalizedType === ENTITY_TYPES.CLIENTE) {
    return first(
      obj.detail,
      obj.client,
      obj.cliente,
      obj.customer,
      obj.item,
      obj.data?.detail,
      obj.data?.cliente,
      obj.data?.client,
      obj.data?.item,
      obj.data,
      obj.result,
      obj.payload,
      obj
    );
  }

  if (normalizedType === ENTITY_TYPES.FACTURA) {
    return first(
      obj.detail,
      obj.factura,
      obj.invoice,
      obj.item,
      obj.data?.detail,
      obj.data?.factura,
      obj.data?.invoice,
      obj.data?.item,
      obj.data,
      obj.result?.detail,
      obj.result?.factura,
      obj.result?.invoice,
      obj.result?.item,
      obj.result,
      obj.payload?.detail,
      obj.payload?.factura,
      obj.payload?.invoice,
      obj.payload?.item,
      obj.payload,
      obj
    );
  }

  return first(
    obj.detail,
    obj.item,
    obj.data,
    obj.result,
    obj.payload,
    obj
  );
}

function getDetailApiCandidates(type = "", entityId = "") {
  const normalizedType =
    normalizeSearchType(type);

  const id =
    encodePathSegment(entityId);

  if (!id) {
    return [];
  }

  if (normalizedType === ENTITY_TYPES.INCIDENCIA) {
    return [
      `/api/tickets/${id}`,
      `/api/incidencias/${id}`,
    ];
  }

  if (normalizedType === ENTITY_TYPES.USUARIO) {
    return [
      `/api/usuarios/${id}`,
      `/api/users/${id}`,
    ];
  }

  if (normalizedType === ENTITY_TYPES.CLIENTE) {
    return [
      `/api/clientes/${id}`,
      `/api/clients/${id}`,
    ];
  }

  if (normalizedType === ENTITY_TYPES.FACTURA) {
    return [
      `/api/facturas/${id}`,
      `/api/invoices/${id}`,
    ];
  }

  return [];
}

async function fetchEntityDetail(AppCore, item = {}) {
  const entityId =
    safeText(item.entityId, "");

  const type =
    normalizeSearchType(item.type);

  if (
    !entityId ||
    !isFunction(AppCore?.apiClient?.get)
  ) {
    return null;
  }

  const candidates =
    getDetailApiCandidates(
      type,
      entityId
    );

  if (!candidates.length) {
    return null;
  }

  let lastError =
    null;

  for (const path of candidates) {
    try {
      const response =
        await AppCore.apiClient.get(
          path,
          {
            auth:
              true,
            timeout:
              12000,
          }
        );

      const payload =
        pickEntityPayloadFromResponse(
          response,
          type
        );

      const payloadObject =
        safeObject(payload);

      if (hasOwnKeys(payloadObject)) {
        return payloadObject;
      }
    } catch (error) {
      lastError =
        error;

      const status =
        Number(
          first(
            error?.status,
            error?.statusCode,
            error?.response?.status,
            error?.data?.status
          ) || 0
        );

      if (
        status &&
        ![404, 405].includes(status)
      ) {
        break;
      }
    }
  }

  if (lastError) {
    warn(
      AppCore,
      "No se pudo precargar detalle de search.",
      {
        type,
        entityId,
        error:
          lastError,
      }
    );
  }

  return null;
}

/* =========================================================
   EVENT / BRIDGE HELPERS
========================================================= */

function emitSearchEvent(AppCore, eventName = "", payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(
        name,
        payload
      );

      return true;
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(
          name,
          {
            detail:
              payload,
          }
        )
      );

      return true;
    }
  } catch {}

  return false;
}

function emitSearchEvents(AppCore, eventNames = [], payload = {}) {
  for (const eventName of safeArray(eventNames)) {
    emitSearchEvent(
      AppCore,
      eventName,
      payload
    );
  }
}

function addBridgeCall(calls = [], fn = null, options = {}) {
  if (!isFunction(fn)) {
    return;
  }

  calls.push({
    fn,

    accept:
      isFunction(options.accept)
        ? options.accept
        : (result) => result !== false,

    label:
      safeText(options.label, ""),
  });
}

function addMethodCall(calls = [], target = null, method = "", arg = null, options = {}) {
  if (
    !target ||
    !isFunction(target?.[method])
  ) {
    return;
  }

  addBridgeCall(
    calls,
    () => target[method](arg),
    {
      ...options,
      label:
        options.label || method,
    }
  );
}

function addMethodCallArgs(calls = [], target = null, method = "", args = [], options = {}) {
  if (
    !target ||
    !isFunction(target?.[method])
  ) {
    return;
  }

  addBridgeCall(
    calls,
    () => target[method](...safeArray(args)),
    {
      ...options,
      label:
        options.label || method,
    }
  );
}

function addFunctionCall(calls = [], fn = null, arg = null, options = {}) {
  if (!isFunction(fn)) {
    return;
  }

  addBridgeCall(
    calls,
    () => fn(arg),
    options
  );
}

async function callFirstBridge(calls = []) {
  for (const call of safeArray(calls)) {
    if (
      !call ||
      !isFunction(call.fn)
    ) {
      continue;
    }

    try {
      const result =
        await call.fn();

      if (call.accept(result)) {
        return true;
      }
    } catch {}
  }

  return false;
}

async function navigateToPath(AppCore, Router, path = "", options = {}) {
  const target =
    normalizeResultUrl(
      AppCore,
      path || "/"
    );

  if (!target) {
    return false;
  }

  if (isFunction(Router?.navigate)) {
    const result =
      Router.navigate(
        target,
        {
          force:
            options.force !== false,

          replaceState:
            Boolean(options.replaceState),

          source:
            options.source || "topbar-search",
        }
      );

    if (
      result &&
      isFunction(result.then)
    ) {
      await result;
    }

    return true;
  }

  if (isBrowser()) {
    window.location.href =
      target;

    return true;
  }

  return false;
}

async function navigateFallbackAndEmit({
  AppCore,
  Router,
  item = {},
  fallbackUrl = "",
  eventNames = [],
  payload = {},
}) {
  const target =
    safeText(
      fallbackUrl ||
        item.url ||
        getFallbackUrlForEntity(
          AppCore,
          item.type,
          item.entityId,
          item.raw
        ),
      ""
    );

  if (target) {
    await navigateToPath(
      AppCore,
      Router,
      target,
      {
        force:
          true,
      }
    );
  }

  emitSearchEvents(
    AppCore,
    eventNames,
    payload
  );

  return Boolean(
    target ||
    eventNames.length
  );
}

/* =========================================================
   INCIDENCIAS MODAL BRIDGE
========================================================= */

async function getIncidenciasModalBridge(AppCore) {
  const candidates = [
    isBrowser() ? window?.OnionIncidenciasModal : null,
    isBrowser() ? window?.IncidenciasModal : null,
    getModuleCandidate(AppCore, "OnionIncidenciasModal"),
    getModuleCandidate(AppCore, "IncidenciasModal"),
    getModuleCandidate(AppCore, "Incidencias"),
  ];

  for (const candidate of candidates) {
    if (
      candidate &&
      isFunction(candidate.open)
    ) {
      return candidate;
    }
  }

  const dynamicImports = [
    "../../views/incidencias/incidencias.modal.js",
    "../views/incidencias/incidencias.modal.js",
  ];

  for (const path of dynamicImports) {
    try {
      const module =
        await import(path);

      return (
        module?.OnionIncidenciasModal ||
        module?.default ||
        (isBrowser() ? window?.OnionIncidenciasModal : null) ||
        null
      );
    } catch {}
  }

  warn(
    AppCore,
    "No se pudo importar incidencias.modal.js"
  );

  return null;
}

async function openIncidenciaFromSearch({
  AppCore,
  Router,
  item = {},
}) {
  const detailResponse =
    await fetchEntityDetail(
      AppCore,
      item
    );

  const detail =
    buildSearchPayload(
      item,
      detailResponse
    );

  const ticketId =
    safeText(
      first(
        detail.ticketId,
        detail.incidenciaId,
        detail.id,
        item.entityId
      ),
      ""
    );

  const payload =
    buildEntityOpenPayload({
      item,
      detail,
      entityId:
        ticketId,
      type:
        ENTITY_TYPES.INCIDENCIA,
    });

  const modal =
    await getIncidenciasModalBridge(AppCore);

  if (
    modal &&
    isFunction(modal.open)
  ) {
    modal.open(detail);

    emitSearchEvents(
      AppCore,
      [
        "topbar:search:open-incidencia",
        "incidencias:modal:opened-from-search",
      ],
      payload
    );

    return true;
  }

  emitSearchEvent(
    AppCore,
    "incidencias:modal:open",
    payload
  );

  return navigateFallbackAndEmit({
    AppCore,
    Router,
    item,
    fallbackUrl:
      item.url ||
      getFallbackUrlForEntity(
        AppCore,
        ENTITY_TYPES.INCIDENCIA,
        ticketId,
        item.raw
      ),
    eventNames:
      [
        "topbar:search:open-incidencia",
        "incidencias:detail:open",
      ],
    payload,
  });
}

/* =========================================================
   USUARIOS / CLIENTES BRIDGES
========================================================= */

async function openUsuarioFromSearch({
  AppCore,
  Router,
  item = {},
}) {
  const detailResponse =
    await fetchEntityDetail(
      AppCore,
      item
    );

  const detail =
    buildSearchPayload(
      item,
      detailResponse
    );

  const userId =
    safeText(
      first(
        detail.userId,
        detail.usuarioId,
        detail.id,
        item.entityId
      ),
      ""
    );

  const payload =
    buildEntityOpenPayload({
      item,
      detail,
      entityId:
        userId,
      type:
        ENTITY_TYPES.USUARIO,
    });

  const calls = [];

  if (isBrowser()) {
    addMethodCall(calls, window?.OnionUsuariosFicha, "open", detail);
    addMethodCall(calls, window?.OnionUsuarioFicha, "open", detail);
    addMethodCall(calls, window?.OnionUsuariosModal, "open", detail);
    addMethodCall(calls, window?.OnionUsuarioModal, "open", detail);
    addMethodCall(calls, window?.UsuariosFicha, "open", detail);
    addMethodCall(calls, window?.UsuariosModal, "open", detail);
    addFunctionCall(calls, window?.openUsuarioFicha, detail);
    addFunctionCall(calls, window?.renderUsuarioFichaModal, detail);
  }

  addMethodCall(calls, getModuleCandidate(AppCore, "OnionUsuariosFicha"), "open", detail);
  addMethodCall(calls, getModuleCandidate(AppCore, "OnionUsuarioFicha"), "open", detail);
  addMethodCall(calls, getModuleCandidate(AppCore, "UsuariosFicha"), "open", detail);
  addMethodCall(calls, getModuleCandidate(AppCore, "UsuariosModal"), "open", detail);
  addMethodCall(calls, getModuleCandidate(AppCore, "Usuarios"), "openFicha", detail);
  addMethodCall(calls, getModuleCandidate(AppCore, "Usuarios"), "openDetail", detail);

  if (await callFirstBridge(calls)) {
    emitSearchEvents(
      AppCore,
      [
        "topbar:search:open-usuario",
        "usuarios:ficha:opened-from-search",
      ],
      payload
    );

    return true;
  }

  return navigateFallbackAndEmit({
    AppCore,
    Router,
    item,
    fallbackUrl:
      item.url ||
      getFallbackUrlForEntity(
        AppCore,
        ENTITY_TYPES.USUARIO,
        userId,
        item.raw
      ),
    eventNames:
      [
        "topbar:search:open-usuario",
        "usuarios:ficha:open",
        "usuarios:modal:open",
        "users:ficha:open",
        "user:profile:open",
      ],
    payload,
  });
}

async function openClienteFromSearch({
  AppCore,
  Router,
  item = {},
}) {
  const detailResponse =
    await fetchEntityDetail(
      AppCore,
      item
    );

  const detail =
    buildSearchPayload(
      item,
      detailResponse
    );

  const clienteId =
    safeText(
      first(
        detail.clienteId,
        detail.clientId,
        detail.id,
        item.entityId
      ),
      ""
    );

  const payload =
    buildEntityOpenPayload({
      item,
      detail,
      entityId:
        clienteId,
      type:
        ENTITY_TYPES.CLIENTE,
    });

  const calls = [];

  if (isBrowser()) {
    addMethodCall(calls, window?.OnionClientesFicha, "open", detail);
    addMethodCall(calls, window?.OnionClienteFicha, "open", detail);
    addMethodCall(calls, window?.OnionClientesModal, "open", detail);
    addMethodCall(calls, window?.OnionClienteModal, "open", detail);
    addMethodCall(calls, window?.ClientesFicha, "open", detail);
    addMethodCall(calls, window?.ClientesModal, "open", detail);
    addFunctionCall(calls, window?.openClienteFicha, detail);
    addFunctionCall(calls, window?.renderClienteFichaModal, detail);
  }

  addMethodCall(calls, getModuleCandidate(AppCore, "OnionClientesFicha"), "open", detail);
  addMethodCall(calls, getModuleCandidate(AppCore, "OnionClienteFicha"), "open", detail);
  addMethodCall(calls, getModuleCandidate(AppCore, "ClientesFicha"), "open", detail);
  addMethodCall(calls, getModuleCandidate(AppCore, "ClientesModal"), "open", detail);
  addMethodCall(calls, getModuleCandidate(AppCore, "Clientes"), "openFicha", detail);
  addMethodCall(calls, getModuleCandidate(AppCore, "Clientes"), "openDetail", detail);

  if (await callFirstBridge(calls)) {
    emitSearchEvents(
      AppCore,
      [
        "topbar:search:open-cliente",
        "clientes:ficha:opened-from-search",
      ],
      payload
    );

    return true;
  }

  return navigateFallbackAndEmit({
    AppCore,
    Router,
    item,
    fallbackUrl:
      item.url ||
      getFallbackUrlForEntity(
        AppCore,
        ENTITY_TYPES.CLIENTE,
        clienteId,
        item.raw
      ),
    eventNames:
      [
        "topbar:search:open-cliente",
        "clientes:ficha:open",
        "clientes:modal:open",
        "clients:ficha:open",
        "client:profile:open",
      ],
    payload,
  });
}

/* =========================================================
   FACTURAS BRIDGE
========================================================= */

function getFacturaIdFromDetail(detail = {}, item = {}) {
  return safeText(
    first(
      detail.facturaId,
      detail.invoiceId,
      detail.id,
      detail._id,
      detail.raw?.facturaId,
      detail.raw?.invoiceId,
      detail.raw?.id,
      detail.raw?._id,
      item.entityId,
      item.raw?.facturaId,
      item.raw?.invoiceId,
      item.raw?.id,
      item.raw?._id
    ),
    ""
  );
}

function getFacturaFallbackUrl(AppCore, item = {}, facturaId = "") {
  const fromItem =
    normalizeResultUrl(
      AppCore,
      item.url || ""
    );

  if (fromItem) {
    return fromItem;
  }

  return getFallbackUrlForEntity(
    AppCore,
    ENTITY_TYPES.FACTURA,
    facturaId,
    item.raw
  );
}

function addFacturasModuleCalls({
  calls,
  facturasModule,
  payload,
  detail,
  facturaId,
}) {
  if (!facturasModule) {
    return;
  }

  const acceptDetailResult =
    (result) => (
      result !== false &&
      result !== null
    );

  addMethodCall(calls, facturasModule, "openFacturaFromExternalRequest", payload, {
    accept:
      acceptDetailResult,
  });

  addMethodCall(calls, facturasModule, "openFromSearch", payload, {
    accept:
      acceptDetailResult,
  });

  addMethodCall(calls, facturasModule, "openSearchResult", payload, {
    accept:
      acceptDetailResult,
  });

  addMethodCall(calls, facturasModule, "openDetail", payload, {
    accept:
      acceptDetailResult,
  });

  addMethodCall(calls, facturasModule, "open", payload, {
    accept:
      acceptDetailResult,
  });

  if (facturaId) {
    addMethodCall(calls, facturasModule, "openFactura", facturaId, {
      accept:
        acceptDetailResult,
    });

    addMethodCall(calls, facturasModule, "loadFacturaDetail", facturaId, {
      accept:
        acceptDetailResult,
    });

    addMethodCallArgs(calls, facturasModule, "openFactura", [facturaId, payload], {
      accept:
        acceptDetailResult,
    });
  }

  addMethodCall(calls, facturasModule, "openDetail", detail, {
    accept:
      acceptDetailResult,
  });
}

async function tryOpenFacturaBridge({
  AppCore,
  payload,
  detail,
  facturaId,
}) {
  const calls = [];

  if (isBrowser()) {
    addMethodCall(calls, window?.OnionFacturasModal, "open", payload);
    addMethodCall(calls, window?.OnionFacturaModal, "open", payload);
    addMethodCall(calls, window?.OnionFacturasFicha, "open", payload);
    addMethodCall(calls, window?.OnionFacturaFicha, "open", payload);
    addMethodCall(calls, window?.FacturasModal, "open", payload);
    addMethodCall(calls, window?.FacturaModal, "open", payload);
    addMethodCall(calls, window?.FacturasFicha, "open", payload);

    addFunctionCall(calls, window?.openFacturaModal, payload);
    addFunctionCall(calls, window?.renderFacturaModal, payload);
    addFunctionCall(calls, window?.openFacturaFicha, payload);
  }

  addMethodCall(calls, getModuleCandidate(AppCore, "OnionFacturasModal"), "open", payload);
  addMethodCall(calls, getModuleCandidate(AppCore, "OnionFacturaModal"), "open", payload);
  addMethodCall(calls, getModuleCandidate(AppCore, "FacturasModal"), "open", payload);
  addMethodCall(calls, getModuleCandidate(AppCore, "FacturaModal"), "open", payload);
  addMethodCall(calls, getModuleCandidate(AppCore, "FacturasFicha"), "open", payload);

  addFacturasModuleCalls({
    calls,
    facturasModule:
      getFacturasModule(AppCore),
    payload,
    detail,
    facturaId,
  });

  return callFirstBridge(calls);
}

async function retryOpenFacturaAfterNavigation({
  AppCore,
  payload,
  detail,
  facturaId,
}) {
  const delays =
    [80, 180, 360, 700];

  for (const delay of delays) {
    await sleep(delay);

    const opened =
      await tryOpenFacturaBridge({
        AppCore,
        payload,
        detail,
        facturaId,
      });

    if (opened) {
      return true;
    }
  }

  return false;
}

async function openFacturaFromSearch({
  AppCore,
  Router,
  item = {},
}) {
  const detailResponse =
    await fetchEntityDetail(
      AppCore,
      item
    );

  const detail =
    buildSearchPayload(
      item,
      detailResponse
    );

  const facturaId =
    getFacturaIdFromDetail(
      detail,
      item
    );

  const payload =
    buildEntityOpenPayload({
      item,
      detail,
      entityId:
        facturaId,
      type:
        ENTITY_TYPES.FACTURA,
    });

  payload.facturaId =
    facturaId;

  payload.invoiceId =
    facturaId;

  payload.factura =
    detail;

  payload.invoice =
    detail;

  const openedDirect =
    await tryOpenFacturaBridge({
      AppCore,
      payload,
      detail,
      facturaId,
    });

  if (openedDirect) {
    emitSearchEvents(
      AppCore,
      [
        "topbar:search:open-factura",
        "facturas:modal:opened-from-search",
      ],
      payload
    );

    return true;
  }

  const fallbackUrl =
    getFacturaFallbackUrl(
      AppCore,
      item,
      facturaId
    );

  if (fallbackUrl) {
    await navigateToPath(
      AppCore,
      Router,
      fallbackUrl,
      {
        force:
          true,
      }
    );

    emitSearchEvents(
      AppCore,
      [
        "topbar:search:open-factura",
        "facturas:detail:open",
        "factura:ficha:open",
      ],
      payload
    );

    const openedAfterNavigation =
      await retryOpenFacturaAfterNavigation({
        AppCore,
        payload,
        detail,
        facturaId,
      });

    return Boolean(
      openedAfterNavigation ||
      fallbackUrl
    );
  }

  emitSearchEvents(
    AppCore,
    [
      "topbar:search:open-factura",
      "facturas:detail:open",
      "factura:ficha:open",
    ],
    payload
  );

  return true;
}

/* =========================================================
   SEARCH GLASS DOM
========================================================= */

function getSearchGlassHost() {
  if (!isBrowser()) {
    return null;
  }

  return (
    document.getElementById("app-content") ||
    document.getElementById("main-content") ||
    document.getElementById("app-shell") ||
    document.body
  );
}

function getSearchGlass() {
  if (!isBrowser()) {
    return null;
  }

  return document.getElementById(
    SEARCH_GLASS_ID
  );
}

function ensureHostPosition(host) {
  if (
    !host ||
    host === document.body ||
    host === document.documentElement
  ) {
    return;
  }

  try {
    const computed =
      window.getComputedStyle(host).position;

    if (
      !computed ||
      computed === "static"
    ) {
      host.style.position = "relative";
    }
  } catch {}
}

function buildSearchGlassStyles(glass, host) {
  if (
    !glass ||
    !host
  ) {
    return;
  }

  const isBodyHost =
    host === document.body ||
    host === document.documentElement;

  Object.assign(
    glass.style,
    {
      position:
        isBodyHost ? "fixed" : "absolute",

      inset:
        "0",

      opacity:
        searchGlassRuntime.active ? "1" : "0",

      visibility:
        searchGlassRuntime.active ? "visible" : "hidden",

      pointerEvents:
        searchGlassRuntime.active ? "auto" : "none",

      zIndex:
        isBodyHost
          ? String(getCssNumberVar("--z-overlay", 60) - 1)
          : "2",

      background:
        [
          "radial-gradient(circle at calc(100% - 220px) 54px, var(--topbar-overlay-accent, rgba(255,255,255,.018)), transparent 18%)",
          "linear-gradient(180deg, rgba(15,18,28,.05), rgba(15,18,28,.12))",
        ].join(", "),

      backdropFilter:
        "blur(4px) saturate(108%)",

      WebkitBackdropFilter:
        "blur(4px) saturate(108%)",

      transition:
        "opacity var(--duration-fast, .16s) var(--ease-standard, cubic-bezier(.2,.8,.2,1)), visibility var(--duration-fast, .16s) var(--ease-standard, cubic-bezier(.2,.8,.2,1))",
    }
  );
}

function ensureSearchGlass() {
  if (!isBrowser()) {
    return null;
  }

  const host =
    getSearchGlassHost();

  if (!host) {
    return null;
  }

  ensureHostPosition(host);

  let glass =
    getSearchGlass();

  if (!glass) {
    glass =
      document.createElement("div");

    glass.id =
      SEARCH_GLASS_ID;

    glass.setAttribute(
      "aria-hidden",
      "true"
    );

    glass.addEventListener(
      "pointerdown",
      (event) => {
        try {
          event.preventDefault();
        } catch {}

        const runtime =
          searchGlassRuntime.runtime;

        const getDom =
          searchGlassRuntime.getDom;

        if (
          !runtime ||
          !isFunction(getDom)
        ) {
          return;
        }

        const {
          searchInput,
        } = getDom();

        hideResultsContainer(
          runtime,
          getDom
        );

        try {
          searchInput?.blur?.();
        } catch {}
      }
    );
  }

  buildSearchGlassStyles(
    glass,
    host
  );

  if (glass.parentNode !== host) {
    try {
      host.appendChild(glass);
    } catch {}
  }

  return glass;
}

function showSearchGlass(runtime, getDom) {
  const glass =
    ensureSearchGlass();

  if (!glass) {
    return false;
  }

  searchGlassRuntime.runtime =
    runtime || null;

  searchGlassRuntime.getDom =
    isFunction(getDom)
      ? getDom
      : null;

  searchGlassRuntime.active =
    true;

  try {
    glass.dataset.active = "true";
    glass.style.opacity = "1";
    glass.style.visibility = "visible";
    glass.style.pointerEvents = "auto";
  } catch {}

  return true;
}

function hideSearchGlass() {
  const glass =
    getSearchGlass();

  searchGlassRuntime.runtime =
    null;

  searchGlassRuntime.getDom =
    null;

  searchGlassRuntime.active =
    false;

  if (!glass) {
    return;
  }

  try {
    delete glass.dataset.active;
    glass.style.opacity = "0";
    glass.style.visibility = "hidden";
    glass.style.pointerEvents = "none";
  } catch {}
}

function getSearchFocusNodes(getDom) {
  if (!isFunction(getDom)) {
    return {
      topbar:
        null,
      searchWrap:
        null,
      searchResults:
        null,
      topbarLeft:
        null,
      topbarRight:
        null,
      mutedNodes:
        [],
    };
  }

  const {
    searchInput,
    searchResults,
  } = getDom();

  const searchWrap =
    searchInput?.closest?.(".topbar-search-wrap") ||
    searchResults?.closest?.(".topbar-search-wrap") ||
    null;

  const topbar =
    searchInput?.closest?.(".topbar") ||
    searchResults?.closest?.(".topbar") ||
    null;

  const topbarLeft =
    topbar?.querySelector?.(".topbar-left") ||
    null;

  const topbarRight =
    topbar?.querySelector?.(".topbar-right") ||
    null;

  const mutedNodes =
    topbarRight
      ? Array.from(topbarRight.children).filter((node) => node !== searchWrap)
      : [];

  return {
    topbar,
    searchWrap,
    searchResults,
    topbarLeft,
    topbarRight,
    mutedNodes,
  };
}

function muteNode(node) {
  if (!node) {
    return;
  }

  try {
    node.style.opacity = ".34";
    node.style.pointerEvents = "none";
    node.style.transition =
      "opacity var(--duration-fast, .16s) var(--ease-standard, cubic-bezier(.2,.8,.2,1))";
  } catch {}
}

function unmuteNode(node) {
  if (!node) {
    return;
  }

  try {
    node.style.opacity = "";
    node.style.pointerEvents = "";
    node.style.transition = "";
  } catch {}
}

function applySearchFocusMode(getDom) {
  const topbarZ =
    getCssNumberVar("--z-topbar", 30);

  const dropdownZ =
    getCssNumberVar("--z-dropdown", 50);

  const {
    topbar,
    searchWrap,
    searchResults,
    topbarLeft,
    mutedNodes,
  } = getSearchFocusNodes(getDom);

  const baseZ =
    Math.max(topbarZ, dropdownZ);

  try {
    if (topbar) {
      topbar.dataset.searchFocus = "true";
      topbar.style.zIndex = String(baseZ + 1);
    }

    if (searchWrap) {
      searchWrap.dataset.searchFocus = "true";
      searchWrap.style.zIndex = String(baseZ + 2);
    }

    if (searchResults) {
      searchResults.style.zIndex = String(baseZ + 3);
    }
  } catch {}

  muteNode(topbarLeft);
  mutedNodes.forEach(muteNode);
}

function clearSearchFocusMode(getDom) {
  const {
    topbar,
    searchWrap,
    searchResults,
    topbarLeft,
    mutedNodes,
  } = getSearchFocusNodes(getDom);

  try {
    if (topbar) {
      delete topbar.dataset.searchFocus;
      topbar.style.zIndex = "";
    }

    if (searchWrap) {
      delete searchWrap.dataset.searchFocus;
      searchWrap.style.zIndex = "";
    }

    if (searchResults) {
      searchResults.style.zIndex = "";
    }
  } catch {}

  unmuteNode(topbarLeft);
  mutedNodes.forEach(unmuteNode);
}

function activateSearchFocus(runtime, getDom) {
  showSearchGlass(
    runtime,
    getDom
  );

  applySearchFocusMode(getDom);
}

function deactivateSearchFocus(getDom) {
  hideSearchGlass();
  clearSearchFocusMode(getDom);
}

/* =========================================================
   CONTROL
========================================================= */

export function clearSearchDebounce(runtime) {
  if (!runtime) {
    return false;
  }

  if (runtime.searchDebounceTimer) {
    try {
      if (isBrowser()) {
        window.clearTimeout(runtime.searchDebounceTimer);
      } else {
        clearTimeout(runtime.searchDebounceTimer);
      }
    } catch {}

    runtime.searchDebounceTimer =
      null;

    return true;
  }

  return false;
}

export function abortSearch(runtime) {
  if (!runtime) {
    return false;
  }

  if (runtime.searchController) {
    try {
      runtime.searchController.abort();
    } catch {}

    runtime.searchController =
      null;

    return true;
  }

  return false;
}

export function clearSearchState(runtime, getDom = searchGlassRuntime.getDom) {
  if (!runtime) {
    return false;
  }

  clearSearchDebounce(runtime);
  abortSearch(runtime);

  runtime.activeIndex =
    -1;

  runtime.currentItems =
    [];

  runtime.currentQuery =
    "";

  runtime.searchSeq =
    Number(runtime.searchSeq || 0) + 1;

  deactivateSearchFocus(getDom);

  return true;
}

export function getCacheKey(query = "") {
  return normalizeText(query);
}

export function getCached(runtime, query = "") {
  if (!runtime?.cache) {
    return null;
  }

  const key =
    getCacheKey(query);

  const found =
    runtime.cache.get(key);

  if (!found) {
    return null;
  }

  if (
    Date.now() - found.createdAt >
    TOPBAR_SEARCH_CONFIG.cacheTtlMs
  ) {
    runtime.cache.delete(key);
    return null;
  }

  return found.value;
}

export function setCached(runtime, query = "", value = []) {
  if (!runtime) {
    return false;
  }

  if (!runtime.cache) {
    runtime.cache = new Map();
  }

  const key =
    getCacheKey(query);

  runtime.cache.set(
    key,
    {
      value,
      createdAt:
        Date.now(),
    }
  );

  return true;
}

/* =========================================================
   LOCAL INDEX
========================================================= */

export function getLocalIndex() {
  return [
    {
      id:
        "nav:/",
      type:
        ENTITY_TYPES.NAV,
      title:
        "Inicio",
      subtitle:
        "Panel principal",
      url:
        "/",
      action:
        SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id:
        "nav:/incidencias",
      type:
        ENTITY_TYPES.NAV,
      title:
        "Incidencias",
      subtitle:
        "Gestión de tickets e incidencias",
      url:
        "/incidencias",
      action:
        SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id:
        "nav:/facturas",
      type:
        ENTITY_TYPES.NAV,
      title:
        "Facturas",
      subtitle:
        "Facturación y documentos",
      url:
        "/facturas",
      action:
        SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id:
        "nav:/usuarios",
      type:
        ENTITY_TYPES.NAV,
      title:
        "Usuarios",
      subtitle:
        "Gestión de usuarios",
      url:
        "/usuarios",
      action:
        SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id:
        "nav:/clientes",
      type:
        ENTITY_TYPES.NAV,
      title:
        "Clientes",
      subtitle:
        "Gestión de clientes",
      url:
        "/clientes",
      action:
        SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id:
        "nav:/cuenta",
      type:
        ENTITY_TYPES.NAV,
      title:
        "Cuenta",
      subtitle:
        "Perfil y datos personales",
      url:
        "/cuenta",
      action:
        SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id:
        "nav:/ajustes",
      type:
        ENTITY_TYPES.NAV,
      title:
        "Ajustes",
      subtitle:
        "Configuración del sistema",
      url:
        "/ajustes",
      action:
        SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id:
        "nav:/servidor",
      type:
        ENTITY_TYPES.NAV,
      title:
        "Servidor",
      subtitle:
        "Estado del servidor",
      url:
        "/servidor",
      action:
        SEARCH_ACTIONS.NAVIGATE,
    },
  ];
}

export function searchLocal(query = "") {
  const q =
    normalizeQuery(query);

  if (!q) {
    return [];
  }

  return getLocalIndex()
    .map((item) => {
      const score =
        scoreTextMatch(item.title, q) +
        scoreTextMatch(item.subtitle, q) +
        scoreTextMatch(item.url, q);

      return {
        ...item,
        entityId:
          "",
        raw:
          item,
        score,
        source:
          "local",
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

/* =========================================================
   API NORMALIZATION
========================================================= */

export function normalizeApiItem(AppCore, raw, index = 0) {
  if (
    !raw ||
    typeof raw !== "object"
  ) {
    return null;
  }

  const rawType =
    getRawType(raw);

  const type =
    normalizeSearchType(rawType);

  const title =
    getRawTitle(raw);

  const subtitle =
    getRawSubtitle(raw);

  const entityId =
    getEntityIdByType(
      type,
      raw,
      ""
    );

  const rawUrl =
    getRawUrl(raw);

  const action =
    getActionForType(
      type,
      raw
    );

  const url =
    rawUrl
      ? normalizeResultUrl(
          AppCore,
          rawUrl
        )
      : getFallbackUrlForEntity(
          AppCore,
          type,
          entityId,
          raw
        );

  const id =
    safeText(
      first(
        raw.searchId,
        raw.resultId,
        raw.id,
        raw._id,
        raw.uuid,
        entityId ? `${type}:${entityId}` : "",
        `${String(type)}:${String(url || title)}:${index}`
      ),
      `${String(type)}:${index}`
    );

  if (
    !title &&
    !url &&
    !entityId
  ) {
    return null;
  }

  return {
    id:
      String(id),

    entityId:
      String(entityId || ""),

    type,
    title:
      String(title || "Resultado"),

    subtitle:
      String(subtitle || ""),

    url:
      url || null,

    action,
    raw,
    source:
      "api",
  };
}

export function normalizeApiPayload(AppCore, data) {
  if (!data) {
    return [];
  }

  const directArray =
    Array.isArray(data)
      ? data
      : Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.payload)
              ? data.payload
              : null;

  if (directArray) {
    return directArray
      .map((item, index) =>
        normalizeApiItem(
          AppCore,
          item,
          index
        )
      )
      .filter(Boolean);
  }

  const groupedKeys = [
    "clientes",
    "clients",
    "usuarios",
    "users",
    "facturas",
    "invoices",
    "tickets",
    "incidencias",
    "issues",
    "nav",
    "routes",
    "recientes",
    "recentes",
  ];

  const collected = [];

  groupedKeys.forEach((key) => {
    if (Array.isArray(data?.[key])) {
      data[key].forEach((item, index) => {
        const normalized =
          normalizeApiItem(
            AppCore,
            {
              ...safeObject(item),
              type:
                item?.type || key,
            },
            index
          );

        if (normalized) {
          collected.push(normalized);
        }
      });
    }
  });

  return collected;
}

/* =========================================================
   API SEARCH
========================================================= */

export async function searchAPI({
  AppCore,
  runtime,
  query = "",
}) {
  const cached =
    getCached(
      runtime,
      query
    );

  if (cached) {
    return cached;
  }

  if (!isFunction(AppCore?.apiClient?.get)) {
    return [];
  }

  abortSearch(runtime);

  const controller =
    safeAbortController();

  runtime.searchController =
    controller;

  try {
    const requestOptions = {
      query:
        {
          q:
            query,
        },

      auth:
        true,

      timeout:
        12000,
    };

    if (controller?.signal) {
      requestOptions.signal =
        controller.signal;
    }

    const data =
      await AppCore.apiClient.get(
        "/api/search",
        requestOptions
      );

    const normalized =
      normalizeApiPayload(
        AppCore,
        data
      );

    setCached(
      runtime,
      query,
      normalized
    );

    return normalized;
  } catch (error) {
    if (
      error?.aborted ||
      error?.name === "AbortError"
    ) {
      return [];
    }

    warn(
      AppCore,
      "Fallo búsqueda API.",
      error
    );

    throw error;
  } finally {
    if (
      runtime.searchController === controller
    ) {
      runtime.searchController =
        null;
    }
  }
}

/* =========================================================
   MERGE
========================================================= */

export function mergeResults(apiResults = [], localResults = [], query = "") {
  const merged =
    uniqBy(
      [...apiResults, ...localResults].map((item) => ({
        ...item,
        score:
          scoreResult(
            item,
            query
          ),
      })),
      (item) =>
        [
          item.type || "",
          item.entityId || "",
          item.url || "",
          item.title || "",
          item.subtitle || "",
        ].join("|")
    );

  return merged
    .filter((item) => item.score > 0 || item.source === "api")
    .sort((a, b) => b.score - a.score)
    .slice(0, TOPBAR_SEARCH_CONFIG.maxResultsTotal);
}

/* =========================================================
   VISUAL STATE
========================================================= */

export function setSearchExpanded(input, expanded = false) {
  if (!input) {
    return;
  }

  try {
    input.setAttribute(
      "aria-expanded",
      String(Boolean(expanded))
    );
  } catch {}
}

export function showResultsContainer(runtime, getDom) {
  const {
    searchResults,
    searchInput,
  } = getDom();

  if (!searchResults) {
    return;
  }

  try {
    searchResults.hidden = false;
    searchResults.classList.add("active");
    searchResults.setAttribute("aria-hidden", "false");
  } catch {}

  setSearchExpanded(
    searchInput,
    true
  );

  activateSearchFocus(
    runtime,
    getDom
  );
}

export function hideResultsContainer(runtime, getDom) {
  if (!runtime) {
    return;
  }

  const {
    searchResults,
    searchInput,
  } = isFunction(getDom)
    ? getDom()
    : {
        searchResults:
          null,
        searchInput:
          null,
      };

  if (searchResults) {
    try {
      searchResults.classList.remove("active");
      searchResults.hidden = true;
      searchResults.setAttribute("aria-hidden", "true");
      searchResults.innerHTML = "";
    } catch {}
  }

  if (searchInput) {
    try {
      searchInput.removeAttribute("aria-activedescendant");
    } catch {}
  }

  runtime.activeIndex =
    -1;

  runtime.currentItems =
    [];

  setSearchExpanded(
    searchInput,
    false
  );

  deactivateSearchFocus(getDom);
}

export function setLoadingState(AppCore, runtime, getDom, query = "") {
  const {
    searchResults,
  } = getDom();

  if (!searchResults) {
    return;
  }

  searchResults.innerHTML = `
    <div class="search-state search-state-loading" aria-live="polite">
      <div class="search-state-title">Buscando</div>
      <div class="search-state-text">
        ${escapeHtml(
          AppCore,
          query ? `Buscando “${query}”...` : "Buscando..."
        )}
      </div>
    </div>
  `;

  showResultsContainer(
    runtime,
    getDom
  );
}

export function setEmptyState(AppCore, runtime, getDom, query = "") {
  const {
    searchResults,
  } = getDom();

  if (!searchResults) {
    return;
  }

  searchResults.innerHTML = `
    <div class="search-state search-state-empty" aria-live="polite">
      <div class="search-state-title">Sin resultados</div>
      <div class="search-state-text">
        ${escapeHtml(
          AppCore,
          query
            ? `No encontramos coincidencias para “${query}”.`
            : "No hay resultados."
        )}
      </div>
    </div>
  `;

  showResultsContainer(
    runtime,
    getDom
  );
}

export function setErrorState(runtime, getDom) {
  const {
    searchResults,
  } = getDom();

  if (!searchResults) {
    return;
  }

  searchResults.innerHTML = `
    <div class="search-state search-state-error" aria-live="polite">
      <div class="search-state-title">No se pudo completar la búsqueda</div>
      <div class="search-state-text">
        Revisa la conexión o inténtalo de nuevo.
      </div>
    </div>
  `;

  showResultsContainer(
    runtime,
    getDom
  );
}

export function updateActiveItem(runtime, items = []) {
  safeArray(items).forEach((el) => {
    try {
      el.classList.remove("active");
    } catch {}
  });

  if (
    runtime.activeIndex >= 0 &&
    items[runtime.activeIndex]
  ) {
    try {
      items[runtime.activeIndex].classList.add("active");
      items[runtime.activeIndex].scrollIntoView({
        block:
          "nearest",
      });
    } catch {}
  }
}

export function updateActiveVisuals(runtime, getDom) {
  const {
    searchResults,
    searchInput,
  } = getDom();

  if (!searchResults) {
    return;
  }

  const items =
    Array.from(
      searchResults.querySelectorAll(".search-result")
    );

  items.forEach((el, index) => {
    const isActive =
      index === runtime.activeIndex;

    try {
      el.classList.toggle(
        "active",
        isActive
      );

      el.setAttribute(
        "aria-selected",
        String(isActive)
      );

      if (
        isActive &&
        searchInput &&
        el.id
      ) {
        searchInput.setAttribute(
          "aria-activedescendant",
          el.id
        );
      }
    } catch {}
  });

  if (
    runtime.activeIndex < 0 &&
    searchInput
  ) {
    try {
      searchInput.removeAttribute("aria-activedescendant");
    } catch {}
  }

  if (
    runtime.activeIndex >= 0 &&
    items[runtime.activeIndex]
  ) {
    try {
      items[runtime.activeIndex].scrollIntoView({
        block:
          "nearest",
      });
    } catch {}
  }
}

/* =========================================================
   NAVIGATION / OPEN RESULT
========================================================= */

export async function goToResult({
  AppCore,
  Router,
  runtime,
  getDom,
  closeSidebarMobile,
  item = null,
}) {
  if (!item) {
    return false;
  }

  const {
    searchInput,
  } = getDom();

  hideResultsContainer(
    runtime,
    getDom
  );

  try {
    searchInput?.blur?.();
  } catch {}

  try {
    closeSidebarMobile?.();
  } catch {}

  const action =
    safeText(
      item.action ||
        getActionForType(
          item.type,
          item.raw
        ),
      SEARCH_ACTIONS.NAVIGATE
    );

  try {
    if (action === SEARCH_ACTIONS.OPEN_INCIDENCIA) {
      return await openIncidenciaFromSearch({
        AppCore,
        Router,
        item,
      });
    }

    if (action === SEARCH_ACTIONS.OPEN_USUARIO) {
      return await openUsuarioFromSearch({
        AppCore,
        Router,
        item,
      });
    }

    if (action === SEARCH_ACTIONS.OPEN_CLIENTE) {
      return await openClienteFromSearch({
        AppCore,
        Router,
        item,
      });
    }

    if (action === SEARCH_ACTIONS.OPEN_FACTURA) {
      return await openFacturaFromSearch({
        AppCore,
        Router,
        item,
      });
    }

    const target =
      safeText(
        item.url ||
          getFallbackUrlForEntity(
            AppCore,
            item.type,
            item.entityId,
            item.raw
          ),
        ""
      );

    if (!target) {
      return false;
    }

    return await navigateToPath(
      AppCore,
      Router,
      target,
      {
        force:
          true,
      }
    );
  } catch (error) {
    warn(
      AppCore,
      "No se pudo abrir resultado de búsqueda.",
      {
        item,
        error,
      }
    );

    showToast(
      AppCore,
      "No se pudo abrir el resultado. Se intentará navegar a su vista.",
      "error"
    );

    const fallback =
      safeText(
        item.url ||
          getFallbackUrlForEntity(
            AppCore,
            item.type,
            item.entityId,
            item.raw
          ),
        ""
      );

    if (fallback) {
      return navigateToPath(
        AppCore,
        Router,
        fallback,
        {
          force:
            true,
        }
      );
    }

    return false;
  }
}

/* =========================================================
   RENDER RESULTS
========================================================= */

function renderActionPill(AppCore, item = {}) {
  const label =
    getActionLabel(item);

  if (!label) {
    return "";
  }

  return `
    <span
      class="search-action-pill"
      aria-hidden="true"
      style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:var(--chip-height-sm, 22px);
        padding:0 8px;
        border-radius:var(--radius-pill, 999px);
        border:1px solid var(--chip-border, var(--border-soft));
        background:var(--chip-bg, var(--surface-glass));
        color:var(--text-dim);
        font-size:10px;
        line-height:1;
        font-weight:var(--weight-bold, 700);
        letter-spacing:.045em;
        text-transform:uppercase;
        white-space:nowrap;
      "
    >
      ${escapeHtml(AppCore, label)}
    </span>
  `;
}

export function renderResults({
  AppCore,
  Router,
  runtime,
  getDom,
  closeSidebarMobile,
  results = [],
  query = "",
}) {
  const {
    searchResults,
  } = getDom();

  if (!searchResults) {
    return;
  }

  searchResults.innerHTML =
    "";

  runtime.activeIndex =
    -1;

  runtime.currentItems =
    [];

  if (!results.length) {
    setEmptyState(
      AppCore,
      runtime,
      getDom,
      query
    );

    return;
  }

  const groups =
    groupResults(results);

  const fragment =
    document.createDocumentFragment();

  groups.forEach(([type, items]) => {
    const groupEl =
      document.createElement("section");

    groupEl.className =
      "search-group-block";

    groupEl.dataset.group =
      type;

    const header =
      document.createElement("div");

    header.className =
      "search-group";

    header.textContent =
      getTypeLabel(type);

    groupEl.appendChild(header);

    items
      .slice(0, TOPBAR_SEARCH_CONFIG.maxResultsPerGroup)
      .forEach((item) => {
        const index =
          runtime.currentItems.length;

        const resultEl =
          document.createElement("button");

        resultEl.type =
          "button";

        resultEl.id =
          `topbar-search-result-${index}`;

        resultEl.className =
          "search-result";

        resultEl.dataset.type =
          item.type || ENTITY_TYPES.GENERAL;

        resultEl.dataset.url =
          item.url || "";

        resultEl.dataset.action =
          item.action || SEARCH_ACTIONS.NAVIGATE;

        resultEl.dataset.entityId =
          item.entityId || "";

        resultEl.dataset.index =
          String(index);

        resultEl.setAttribute(
          "role",
          "option"
        );

        resultEl.setAttribute(
          "aria-selected",
          "false"
        );

        resultEl.setAttribute(
          "aria-label",
          `${item.title || "Resultado"}${item.subtitle ? `, ${item.subtitle}` : ""}`
        );

        resultEl.innerHTML = `
          <span class="search-icon" aria-hidden="true">${escapeHtml(
            AppCore,
            getTypeIcon(item.type)
          )}</span>

          <span class="search-text">
            <span
              class="search-title"
              style="
                display:flex;
                align-items:center;
                gap:8px;
                min-width:0;
              "
            >
              <span style="min-width:0; overflow:hidden; text-overflow:ellipsis;">
                ${highlight(AppCore, item.title || "", query)}
              </span>
              ${renderActionPill(AppCore, item)}
            </span>

            ${
              item.subtitle
                ? `<span class="search-subtitle">${highlight(
                    AppCore,
                    item.subtitle || "",
                    query
                  )}</span>`
                : ""
            }
          </span>
        `;

        resultEl.addEventListener(
          "click",
          async () => {
            await goToResult({
              AppCore,
              Router,
              runtime,
              getDom,
              closeSidebarMobile,
              item,
            });
          }
        );

        resultEl.addEventListener(
          "mouseenter",
          () => {
            const idx =
              Number(resultEl.dataset.index);

            if (!Number.isNaN(idx)) {
              runtime.activeIndex =
                idx;

              updateActiveVisuals(
                runtime,
                getDom
              );
            }
          }
        );

        runtime.currentItems.push(item);
        groupEl.appendChild(resultEl);
      });

    fragment.appendChild(groupEl);
  });

  searchResults.appendChild(fragment);

  showResultsContainer(
    runtime,
    getDom
  );
}

/* =========================================================
   RUN SEARCH
========================================================= */

export async function runSearch({
  AppCore,
  Router,
  runtime,
  getDom,
  closeSidebarMobile,
  query = "",
}) {
  const q =
    normalizeQuery(query);

  runtime.currentQuery =
    q;

  runtime.searchSeq =
    Number(runtime.searchSeq || 0) + 1;

  const seq =
    runtime.searchSeq;

  if (
    !q ||
    q.length < TOPBAR_SEARCH_CONFIG.minQueryLength
  ) {
    hideResultsContainer(
      runtime,
      getDom
    );

    return;
  }

  setLoadingState(
    AppCore,
    runtime,
    getDom,
    q
  );

  try {
    const [remote, local] =
      await Promise.all([
        searchAPI({
          AppCore,
          runtime,
          query:
            q,
        }),
        Promise.resolve(
          searchLocal(q)
        ),
      ]);

    if (
      runtime.currentQuery !== q ||
      runtime.searchSeq !== seq
    ) {
      return;
    }

    const merged =
      mergeResults(
        remote,
        local,
        q
      );

    renderResults({
      AppCore,
      Router,
      runtime,
      getDom,
      closeSidebarMobile,
      results:
        merged,
      query:
        q,
    });
  } catch {
    if (
      runtime.currentQuery !== q ||
      runtime.searchSeq !== seq
    ) {
      return;
    }

    const local =
      searchLocal(q);

    if (local.length) {
      renderResults({
        AppCore,
        Router,
        runtime,
        getDom,
        closeSidebarMobile,
        results:
          local,
        query:
          q,
      });

      return;
    }

    setErrorState(
      runtime,
      getDom
    );
  }
}
