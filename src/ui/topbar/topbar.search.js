/* =========================================================
   Onion SPA - Topbar Search
   Archivo: src/ui/topbar.search.js

   Responsabilidades:
   - gestionar cache de búsqueda
   - construir índice local
   - normalizar payloads remotos
   - ejecutar búsqueda API
   - fusionar resultados locales + remotos
   - renderizar resultados del buscador
   - gestionar navegación / apertura a resultados
   - abrir ficha de usuario desde search
   - abrir modal de incidencia desde search
   - abrir factura desde search
   - actualizar estados visuales del panel search
   - activar overlay glass global desde JS
   - centrar la atención visual en el buscador

   HARDENING:
   - bridges flexibles por window / AppCore.modules / event bus
   - fallback seguro a rutas cuando no existe modal/ficha montada
   - dynamic import SOLO para modal de incidencias
   - normalización tolerante a backend heterogéneo
   - no rompe resultados locales
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
   SEARCH FOCUS OVERLAY (JS)
   - SOLO cubre el área de contenido
   - NO tapa sidebar
   - NO tapa topbar
   - NO tapa toda la página
========================================================= */

const SEARCH_GLASS_ID = "topbar-search-glass-overlay";

const searchGlassRuntime = {
  runtime: null,
  getDom: null,
};

/* =========================================================
   ACTIONS
========================================================= */

const SEARCH_ACTIONS = Object.freeze({
  NAVIGATE: "navigate",
  OPEN_USUARIO: "open_usuario",
  OPEN_CLIENTE: "open_cliente",
  OPEN_INCIDENCIA: "open_incidencia",
  OPEN_FACTURA: "open_factura",
});

const ENTITY_TYPES = Object.freeze({
  NAV: "nav",
  USUARIO: "usuario",
  CLIENTE: "cliente",
  INCIDENCIA: "incidencia",
  FACTURA: "factura",
  GENERAL: "general",
});

const TYPE_ALIASES = Object.freeze({
  nav: ENTITY_TYPES.NAV,
  route: ENTITY_TYPES.NAV,
  routes: ENTITY_TYPES.NAV,
  ruta: ENTITY_TYPES.NAV,
  rutas: ENTITY_TYPES.NAV,

  user: ENTITY_TYPES.USUARIO,
  users: ENTITY_TYPES.USUARIO,
  usuario: ENTITY_TYPES.USUARIO,
  usuarios: ENTITY_TYPES.USUARIO,
  account: ENTITY_TYPES.USUARIO,
  profile: ENTITY_TYPES.USUARIO,
  perfil: ENTITY_TYPES.USUARIO,

  client: ENTITY_TYPES.CLIENTE,
  clients: ENTITY_TYPES.CLIENTE,
  cliente: ENTITY_TYPES.CLIENTE,
  clientes: ENTITY_TYPES.CLIENTE,
  customer: ENTITY_TYPES.CLIENTE,
  customers: ENTITY_TYPES.CLIENTE,

  ticket: ENTITY_TYPES.INCIDENCIA,
  tickets: ENTITY_TYPES.INCIDENCIA,
  incidencia: ENTITY_TYPES.INCIDENCIA,
  incidencias: ENTITY_TYPES.INCIDENCIA,
  issue: ENTITY_TYPES.INCIDENCIA,
  issues: ENTITY_TYPES.INCIDENCIA,
  support: ENTITY_TYPES.INCIDENCIA,

  factura: ENTITY_TYPES.FACTURA,
  facturas: ENTITY_TYPES.FACTURA,
  invoice: ENTITY_TYPES.FACTURA,
  invoices: ENTITY_TYPES.FACTURA,
  bill: ENTITY_TYPES.FACTURA,
  billing: ENTITY_TYPES.FACTURA,
});

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    return value;
  }

  return null;
}

function encodePathSegment(value = "") {
  return encodeURIComponent(safeText(value, ""));
}

function getCssNumberVar(name = "", fallback = 0) {
  try {
    const value = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue(name);

    const parsed = Number.parseInt(String(value || "").trim(), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function showToast(AppCore, message = "", type = "info") {
  const text = safeText(message, "");
  const level = safeText(type, "info");

  if (!text) return false;

  try {
    if (typeof AppCore?.toast?.[level] === "function") {
      AppCore.toast[level](text);
      return true;
    }
  } catch {}

  try {
    AppCore?.toast?.show?.(text, level);
    return true;
  } catch {}

  try {
    AppCore?.ui?.toast?.[level]?.(text);
    return true;
  } catch {}

  return false;
}

function warn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(...args);
    return;
  } catch {}

  try {
    console.warn(...args);
  } catch {}
}

function normalizeSearchType(value = "") {
  const raw = safeText(value, "general").toLowerCase();
  const compact = normalizeText(raw).replace(/[^a-z0-9_-]/gi, "");

  return TYPE_ALIASES[compact] || compact || ENTITY_TYPES.GENERAL;
}

function isUsuarioType(type = "") {
  return normalizeSearchType(type) === ENTITY_TYPES.USUARIO;
}

function isClienteType(type = "") {
  return normalizeSearchType(type) === ENTITY_TYPES.CLIENTE;
}

function isIncidenciaType(type = "") {
  return normalizeSearchType(type) === ENTITY_TYPES.INCIDENCIA;
}

function isFacturaType(type = "") {
  return normalizeSearchType(type) === ENTITY_TYPES.FACTURA;
}

function isNavType(type = "") {
  return normalizeSearchType(type) === ENTITY_TYPES.NAV;
}

function getEntityIdByType(type = "", raw = {}, fallback = "") {
  const item = safeObject(raw);
  const normalizedType = normalizeSearchType(type);

  if (normalizedType === ENTITY_TYPES.USUARIO) {
    return safeText(
      first(
        item.userId,
        item.usuarioId,
        item.uid,
        item.username,
        item.email,
        item.id,
        item._id,
        item.uuid,
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
        item.cif,
        item.nif,
        item.email,
        item.id,
        item._id,
        item.uuid,
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
        item.ticketCode,
        item.incidenciaId,
        item.issueId,
        item.code,
        item.codigo,
        item.numero,
        item.id,
        item._id,
        item.uuid,
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
        item.invoiceCode,
        item.numero,
        item.number,
        item.code,
        item.codigo,
        item.id,
        item._id,
        item.uuid,
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

function getRawType(raw = {}) {
  const item = safeObject(raw);

  return first(
    item.type,
    item.entity,
    item.kind,
    item.group,
    item.category,
    item.collection,
    item.module,
    item.resource,
    ENTITY_TYPES.GENERAL
  );
}

function getRawTitle(raw = {}) {
  const item = safeObject(raw);

  return safeText(
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
      item.numero,
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
  const item = safeObject(raw);

  return safeText(
    first(
      item.subtitle,
      item.description,
      item.descripcion,
      item.preview,
      item.cliente,
      item.clientName,
      item.customerName,
      item.email,
      item.role,
      item.rol,
      item.estado,
      item.status,
      item.priority,
      item.prioridad,
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
  const item = safeObject(raw);

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

function getFallbackUrlForEntity(AppCore, type = "", entityId = "", raw = {}) {
  const normalizedType = normalizeSearchType(type);
  const id = safeText(entityId, "");
  const rawUrl = getRawUrl(raw);

  if (rawUrl) {
    return safeNormalizePath(AppCore, rawUrl);
  }

  if (!id) return null;

  const encoded = encodePathSegment(id);

  if (normalizedType === ENTITY_TYPES.USUARIO) {
    return safeNormalizePath(AppCore, `/usuarios?usuario=${encoded}`);
  }

  if (normalizedType === ENTITY_TYPES.CLIENTE) {
    return safeNormalizePath(AppCore, `/clientes?cliente=${encoded}`);
  }

  if (normalizedType === ENTITY_TYPES.INCIDENCIA) {
    return safeNormalizePath(AppCore, `/incidencias?ticket=${encoded}`);
  }

  if (normalizedType === ENTITY_TYPES.FACTURA) {
    return safeNormalizePath(AppCore, `/facturas?factura=${encoded}`);
  }

  return null;
}

function getActionForType(type = "", raw = {}) {
  const item = safeObject(raw);
  const explicit = safeText(
    first(item.action, item.openAction, item.searchAction),
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
      ].includes(explicit)
    ) {
      return SEARCH_ACTIONS.OPEN_FACTURA;
    }

    if (["navigate", "nav", "route", "go"].includes(explicit)) {
      return SEARCH_ACTIONS.NAVIGATE;
    }
  }

  const normalizedType = normalizeSearchType(type);

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
  const action = safeText(item.action, SEARCH_ACTIONS.NAVIGATE);

  if (action === SEARCH_ACTIONS.OPEN_USUARIO) return "Abrir ficha";
  if (action === SEARCH_ACTIONS.OPEN_CLIENTE) return "Abrir cliente";
  if (action === SEARCH_ACTIONS.OPEN_INCIDENCIA) return "Abrir modal";
  if (action === SEARCH_ACTIONS.OPEN_FACTURA) return "Abrir factura";

  return "";
}

function buildSearchPayload(item = {}, detail = null) {
  const raw = safeObject(item.raw);
  const normalizedType = normalizeSearchType(item.type);
  const entityId = safeText(item.entityId, "");

  const detailObject = safeObject(detail);

  const mergedDetail = {
    ...raw,
    ...detailObject,

    id: first(detailObject.id, raw.id, entityId),
    _id: first(detailObject._id, raw._id, entityId),
    entityId,

    type: normalizedType,

    raw: {
      ...raw,
      ...safeObject(detailObject.raw || detailObject),
      searchItem: {
        id: item.id,
        type: item.type,
        title: item.title,
        subtitle: item.subtitle,
        url: item.url,
        action: item.action,
        entityId: item.entityId,
        source: item.source,
      },
    },
  };

  if (normalizedType === ENTITY_TYPES.USUARIO) {
    mergedDetail.userId = first(
      detailObject.userId,
      detailObject.usuarioId,
      raw.userId,
      raw.usuarioId,
      entityId
    );
    mergedDetail.usuarioId = mergedDetail.userId;
  }

  if (normalizedType === ENTITY_TYPES.CLIENTE) {
    mergedDetail.clienteId = first(
      detailObject.clienteId,
      detailObject.clientId,
      raw.clienteId,
      raw.clientId,
      entityId
    );
    mergedDetail.clientId = mergedDetail.clienteId;
  }

  if (normalizedType === ENTITY_TYPES.INCIDENCIA) {
    mergedDetail.ticketId = first(
      detailObject.ticketId,
      detailObject.incidenciaId,
      detailObject.id,
      raw.ticketId,
      raw.incidenciaId,
      raw.id,
      entityId
    );
    mergedDetail.incidenciaId = mergedDetail.ticketId;
  }

  if (normalizedType === ENTITY_TYPES.FACTURA) {
    mergedDetail.facturaId = first(
      detailObject.facturaId,
      detailObject.invoiceId,
      detailObject.id,
      raw.facturaId,
      raw.invoiceId,
      raw.id,
      entityId
    );
    mergedDetail.invoiceId = mergedDetail.facturaId;
  }

  return mergedDetail;
}

function pickEntityPayloadFromResponse(response = null, type = "") {
  const obj = safeObject(response);
  const normalizedType = normalizeSearchType(type);

  if (!Object.keys(obj).length) return null;

  if (normalizedType === ENTITY_TYPES.INCIDENCIA) {
    return first(
      obj.detail,
      obj.ticket,
      obj.incidencia,
      obj.issue,
      obj.item,
      obj.data,
      obj.result,
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
      obj.data,
      obj.result,
      obj.payload,
      obj
    );
  }

  return first(obj.detail, obj.item, obj.data, obj.result, obj.payload, obj);
}

function getDetailApiCandidates(type = "", entityId = "") {
  const normalizedType = normalizeSearchType(type);
  const id = encodePathSegment(entityId);

  if (!id) return [];

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
  const entityId = safeText(item.entityId, "");
  const type = normalizeSearchType(item.type);

  if (!entityId || !AppCore?.apiClient?.get) {
    return null;
  }

  const candidates = getDetailApiCandidates(type, entityId);

  if (!candidates.length) return null;

  let lastError = null;

  for (const path of candidates) {
    try {
      const response = await AppCore.apiClient.get(path, {
        auth: true,
        timeout: 12000,
      });

      const payload = pickEntityPayloadFromResponse(response, type);
      const payloadObject = safeObject(payload);

      if (Object.keys(payloadObject).length) {
        return payloadObject;
      }
    } catch (error) {
      lastError = error;

      const status = Number(error?.status || error?.statusCode || 0);

      if (status && ![404, 405].includes(status)) {
        break;
      }
    }
  }

  if (lastError) {
    warn(AppCore, "TopbarUI: no se pudo precargar detalle de search", {
      type,
      entityId,
      error: lastError,
    });
  }

  return null;
}

/* =========================================================
   EVENT / BRIDGE HELPERS
========================================================= */

function emitSearchEvent(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  let emitted = false;

  try {
    AppCore?.events?.emit?.(name, payload);
    emitted = true;
  } catch {}

  try {
    window.dispatchEvent(
      new CustomEvent(name, {
        detail: payload,
      })
    );
    emitted = true;
  } catch {}

  return emitted;
}

function emitSearchEvents(AppCore, eventNames = [], payload = {}) {
  safeArray(eventNames).forEach((eventName) => {
    emitSearchEvent(AppCore, eventName, payload);
  });
}

function addMethodCall(calls = [], target = null, method = "", arg = null) {
  if (!target || typeof target?.[method] !== "function") return;

  calls.push(() => target[method](arg));
}

function addFunctionCall(calls = [], fn = null, arg = null) {
  if (typeof fn !== "function") return;

  calls.push(() => fn(arg));
}

async function callFirstBridge(calls = []) {
  for (const call of safeArray(calls)) {
    if (typeof call !== "function") continue;

    try {
      const result = await call();

      if (result !== false) {
        return true;
      }
    } catch {}
  }

  return false;
}

async function navigateToPath(AppCore, Router, path = "", options = {}) {
  const target = safeNormalizePath(AppCore, path || "/");

  if (!target) return false;

  if (typeof Router?.navigate === "function") {
    const result = Router.navigate(target, {
      force: options.force !== false,
      replaceState: Boolean(options.replaceState),
    });

    if (result && typeof result.then === "function") {
      await result;
    }

    return true;
  }

  window.location.href = target;
  return true;
}

async function navigateFallbackAndEmit({
  AppCore,
  Router,
  item = {},
  fallbackUrl = "",
  eventNames = [],
  payload = {},
}) {
  const target = safeText(
    fallbackUrl || item.url || getFallbackUrlForEntity(AppCore, item.type, item.entityId, item.raw),
    ""
  );

  if (target) {
    await navigateToPath(AppCore, Router, target, {
      force: true,
    });
  }

  emitSearchEvents(AppCore, eventNames, payload);

  return Boolean(target || eventNames.length);
}

/* =========================================================
   INCIDENCIAS MODAL BRIDGE
========================================================= */

async function getIncidenciasModalBridge(AppCore) {
  const candidates = [
    window?.OnionIncidenciasModal,
    window?.IncidenciasModal,
    AppCore?.modules?.OnionIncidenciasModal,
    AppCore?.modules?.IncidenciasModal,
    AppCore?.modules?.Incidencias,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate.open === "function") {
      return candidate;
    }
  }

  try {
    const module = await import("../views/incidencias/incidencias.modal.js");

    return (
      module?.OnionIncidenciasModal ||
      module?.default ||
      window?.OnionIncidenciasModal ||
      null
    );
  } catch (error) {
    warn(AppCore, "TopbarUI: no se pudo importar incidencias.modal.js", error);
    return null;
  }
}

async function openIncidenciaFromSearch({
  AppCore,
  Router,
  item = {},
}) {
  const detailResponse = await fetchEntityDetail(AppCore, item);
  const detail = buildSearchPayload(item, detailResponse);

  const ticketId = safeText(
    first(
      detail.ticketId,
      detail.incidenciaId,
      detail.id,
      item.entityId
    ),
    ""
  );

  const payload = {
    source: "topbar-search",
    item,
    detail,
    ticketId,
    incidenciaId: ticketId,
  };

  const modal = await getIncidenciasModalBridge(AppCore);

  if (modal && typeof modal.open === "function") {
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

  emitSearchEvent(AppCore, "incidencias:modal:open", payload);

  return navigateFallbackAndEmit({
    AppCore,
    Router,
    item,
    fallbackUrl:
      item.url ||
      getFallbackUrlForEntity(AppCore, ENTITY_TYPES.INCIDENCIA, ticketId, item.raw),
    eventNames: [
      "topbar:search:open-incidencia",
      "incidencias:detail:open",
    ],
    payload,
  });
}

/* =========================================================
   USUARIOS / CLIENTES / FACTURAS BRIDGES
========================================================= */

async function openUsuarioFromSearch({
  AppCore,
  Router,
  item = {},
}) {
  const detailResponse = await fetchEntityDetail(AppCore, item);
  const detail = buildSearchPayload(item, detailResponse);

  const userId = safeText(
    first(detail.userId, detail.usuarioId, detail.id, item.entityId),
    ""
  );

  const payload = {
    source: "topbar-search",
    item,
    detail,
    user: detail,
    usuario: detail,
    userId,
    usuarioId: userId,
  };

  const calls = [];

  addMethodCall(calls, window?.OnionUsuariosFicha, "open", detail);
  addMethodCall(calls, window?.OnionUsuarioFicha, "open", detail);
  addMethodCall(calls, window?.OnionUsuariosModal, "open", detail);
  addMethodCall(calls, window?.OnionUsuarioModal, "open", detail);
  addMethodCall(calls, window?.UsuariosFicha, "open", detail);
  addMethodCall(calls, window?.UsuariosModal, "open", detail);
  addFunctionCall(calls, window?.openUsuarioFicha, detail);
  addFunctionCall(calls, window?.renderUsuarioFichaModal, detail);

  addMethodCall(calls, AppCore?.modules?.OnionUsuariosFicha, "open", detail);
  addMethodCall(calls, AppCore?.modules?.OnionUsuarioFicha, "open", detail);
  addMethodCall(calls, AppCore?.modules?.UsuariosFicha, "open", detail);
  addMethodCall(calls, AppCore?.modules?.UsuariosModal, "open", detail);
  addMethodCall(calls, AppCore?.modules?.Usuarios, "openFicha", detail);
  addMethodCall(calls, AppCore?.modules?.Usuarios, "openDetail", detail);

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
      getFallbackUrlForEntity(AppCore, ENTITY_TYPES.USUARIO, userId, item.raw),
    eventNames: [
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
  const detailResponse = await fetchEntityDetail(AppCore, item);
  const detail = buildSearchPayload(item, detailResponse);

  const clienteId = safeText(
    first(detail.clienteId, detail.clientId, detail.id, item.entityId),
    ""
  );

  const payload = {
    source: "topbar-search",
    item,
    detail,
    client: detail,
    cliente: detail,
    clienteId,
    clientId: clienteId,
  };

  const calls = [];

  addMethodCall(calls, window?.OnionClientesFicha, "open", detail);
  addMethodCall(calls, window?.OnionClienteFicha, "open", detail);
  addMethodCall(calls, window?.OnionClientesModal, "open", detail);
  addMethodCall(calls, window?.OnionClienteModal, "open", detail);
  addMethodCall(calls, window?.ClientesFicha, "open", detail);
  addMethodCall(calls, window?.ClientesModal, "open", detail);
  addFunctionCall(calls, window?.openClienteFicha, detail);
  addFunctionCall(calls, window?.renderClienteFichaModal, detail);

  addMethodCall(calls, AppCore?.modules?.OnionClientesFicha, "open", detail);
  addMethodCall(calls, AppCore?.modules?.OnionClienteFicha, "open", detail);
  addMethodCall(calls, AppCore?.modules?.ClientesFicha, "open", detail);
  addMethodCall(calls, AppCore?.modules?.ClientesModal, "open", detail);
  addMethodCall(calls, AppCore?.modules?.Clientes, "openFicha", detail);
  addMethodCall(calls, AppCore?.modules?.Clientes, "openDetail", detail);

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
      getFallbackUrlForEntity(AppCore, ENTITY_TYPES.CLIENTE, clienteId, item.raw),
    eventNames: [
      "topbar:search:open-cliente",
      "clientes:ficha:open",
      "clientes:modal:open",
      "clients:ficha:open",
      "client:profile:open",
    ],
    payload,
  });
}

async function openFacturaFromSearch({
  AppCore,
  Router,
  item = {},
}) {
  const detailResponse = await fetchEntityDetail(AppCore, item);
  const detail = buildSearchPayload(item, detailResponse);

  const facturaId = safeText(
    first(detail.facturaId, detail.invoiceId, detail.id, item.entityId),
    ""
  );

  const payload = {
    source: "topbar-search",
    item,
    detail,
    factura: detail,
    invoice: detail,
    facturaId,
    invoiceId: facturaId,
  };

  const calls = [];

  addMethodCall(calls, window?.OnionFacturasModal, "open", detail);
  addMethodCall(calls, window?.OnionFacturaModal, "open", detail);
  addMethodCall(calls, window?.OnionFacturasFicha, "open", detail);
  addMethodCall(calls, window?.OnionFacturaFicha, "open", detail);
  addMethodCall(calls, window?.FacturasModal, "open", detail);
  addMethodCall(calls, window?.FacturaModal, "open", detail);
  addMethodCall(calls, window?.FacturasFicha, "open", detail);
  addFunctionCall(calls, window?.openFacturaModal, detail);
  addFunctionCall(calls, window?.renderFacturaModal, detail);
  addFunctionCall(calls, window?.openFacturaFicha, detail);

  addMethodCall(calls, AppCore?.modules?.OnionFacturasModal, "open", detail);
  addMethodCall(calls, AppCore?.modules?.OnionFacturaModal, "open", detail);
  addMethodCall(calls, AppCore?.modules?.FacturasModal, "open", detail);
  addMethodCall(calls, AppCore?.modules?.FacturaModal, "open", detail);
  addMethodCall(calls, AppCore?.modules?.FacturasFicha, "open", detail);
  addMethodCall(calls, AppCore?.modules?.Facturas, "openFactura", detail);
  addMethodCall(calls, AppCore?.modules?.Facturas, "openDetail", detail);

  if (await callFirstBridge(calls)) {
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

  return navigateFallbackAndEmit({
    AppCore,
    Router,
    item,
    fallbackUrl:
      item.url ||
      getFallbackUrlForEntity(AppCore, ENTITY_TYPES.FACTURA, facturaId, item.raw),
    eventNames: [
      "topbar:search:open-factura",
      "facturas:modal:open",
      "factura:modal:open",
      "facturas:detail:open",
      "factura:ficha:open",
      "invoice:detail:open",
    ],
    payload,
  });
}

/* =========================================================
   SEARCH GLASS DOM
========================================================= */

function getSearchGlassHost() {
  return (
    document.getElementById("app-content") ||
    document.getElementById("main-content") ||
    document.getElementById("app-shell") ||
    document.body
  );
}

function getSearchGlass() {
  return document.getElementById(SEARCH_GLASS_ID);
}

function ensureHostPosition(host) {
  if (!host || host === document.body || host === document.documentElement) {
    return;
  }

  try {
    const computed = window.getComputedStyle(host).position;

    if (!computed || computed === "static") {
      host.style.position = "relative";
    }
  } catch {
    /* noop */
  }
}

function buildSearchGlassStyles(glass, host) {
  const isBodyHost =
    host === document.body || host === document.documentElement;

  Object.assign(glass.style, {
    position: isBodyHost ? "fixed" : "absolute",
    inset: "0",
    opacity: "0",
    visibility: "hidden",
    pointerEvents: "none",

    zIndex: isBodyHost ? String(getCssNumberVar("--z-overlay", 60) - 1) : "2",

    background: [
      "radial-gradient(circle at calc(100% - 220px) 54px, var(--topbar-overlay-accent, rgba(255,255,255,.018)), transparent 18%)",
      "linear-gradient(180deg, rgba(15,18,28,.05), rgba(15,18,28,.12))",
    ].join(", "),

    backdropFilter: "blur(4px) saturate(108%)",
    WebkitBackdropFilter: "blur(4px) saturate(108%)",

    transition:
      "opacity var(--duration-fast, .16s) var(--ease-standard, cubic-bezier(.2,.8,.2,1)), visibility var(--duration-fast, .16s) var(--ease-standard, cubic-bezier(.2,.8,.2,1))",
  });
}

function ensureSearchGlass() {
  const host = getSearchGlassHost();
  ensureHostPosition(host);

  let glass = getSearchGlass();

  if (!glass) {
    glass = document.createElement("div");
    glass.id = SEARCH_GLASS_ID;
    glass.setAttribute("aria-hidden", "true");

    glass.addEventListener("pointerdown", (event) => {
      event.preventDefault();

      const runtime = searchGlassRuntime.runtime;
      const getDom = searchGlassRuntime.getDom;

      if (!runtime || typeof getDom !== "function") return;

      const { searchInput } = getDom();

      hideResultsContainer(runtime, getDom);

      try {
        searchInput?.blur?.();
      } catch {
        /* noop */
      }
    });
  }

  buildSearchGlassStyles(glass, host);

  if (glass.parentNode !== host) {
    host.appendChild(glass);
  }

  return glass;
}

function showSearchGlass(runtime, getDom) {
  const glass = ensureSearchGlass();

  searchGlassRuntime.runtime = runtime || null;
  searchGlassRuntime.getDom = typeof getDom === "function" ? getDom : null;

  glass.style.opacity = "1";
  glass.style.visibility = "visible";
  glass.style.pointerEvents = "auto";
}

function hideSearchGlass() {
  const glass = getSearchGlass();

  searchGlassRuntime.runtime = null;
  searchGlassRuntime.getDom = null;

  if (!glass) return;

  glass.style.opacity = "0";
  glass.style.visibility = "hidden";
  glass.style.pointerEvents = "none";
}

function getSearchFocusNodes(getDom) {
  if (typeof getDom !== "function") {
    return {
      topbar: null,
      searchWrap: null,
      searchResults: null,
      topbarLeft: null,
      topbarRight: null,
      mutedNodes: [],
    };
  }

  const { searchInput, searchResults } = getDom();

  const searchWrap =
    searchInput?.closest?.(".topbar-search-wrap") ||
    searchResults?.closest?.(".topbar-search-wrap") ||
    null;

  const topbar =
    searchInput?.closest?.(".topbar") ||
    searchResults?.closest?.(".topbar") ||
    null;

  const topbarLeft = topbar?.querySelector?.(".topbar-left") || null;
  const topbarRight = topbar?.querySelector?.(".topbar-right") || null;

  const mutedNodes = topbarRight
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
  if (!node) return;

  node.style.opacity = ".34";
  node.style.pointerEvents = "none";
  node.style.transition = "opacity var(--duration-fast, .16s) var(--ease-standard, cubic-bezier(.2,.8,.2,1))";
}

function unmuteNode(node) {
  if (!node) return;

  node.style.opacity = "";
  node.style.pointerEvents = "";
  node.style.transition = "";
}

function applySearchFocusMode(getDom) {
  const topbarZ = getCssNumberVar("--z-topbar", 30);
  const dropdownZ = getCssNumberVar("--z-dropdown", 50);

  const {
    topbar,
    searchWrap,
    searchResults,
    topbarLeft,
    mutedNodes,
  } = getSearchFocusNodes(getDom);

  if (topbar) {
    topbar.dataset.searchFocus = "true";
    topbar.style.zIndex = String(Math.max(topbarZ, dropdownZ) + 1);
  }

  if (searchWrap) {
    searchWrap.dataset.searchFocus = "true";
    searchWrap.style.zIndex = String(Math.max(topbarZ, dropdownZ) + 2);
  }

  if (searchResults) {
    searchResults.style.zIndex = String(Math.max(topbarZ, dropdownZ) + 3);
  }

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

  unmuteNode(topbarLeft);
  mutedNodes.forEach(unmuteNode);
}

function activateSearchFocus(runtime, getDom) {
  showSearchGlass(runtime, getDom);
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
  if (runtime.searchDebounceTimer) {
    window.clearTimeout(runtime.searchDebounceTimer);
    runtime.searchDebounceTimer = null;
  }
}

export function abortSearch(runtime) {
  if (runtime.searchController) {
    try {
      runtime.searchController.abort();
    } catch {
      /* noop */
    }

    runtime.searchController = null;
  }
}

export function clearSearchState(runtime, getDom = searchGlassRuntime.getDom) {
  clearSearchDebounce(runtime);
  abortSearch(runtime);

  runtime.activeIndex = -1;
  runtime.currentItems = [];
  runtime.currentQuery = "";

  deactivateSearchFocus(getDom);
}

export function getCacheKey(query = "") {
  return normalizeText(query);
}

export function getCached(runtime, query = "") {
  const key = getCacheKey(query);
  const found = runtime.cache.get(key);

  if (!found) return null;

  if (Date.now() - found.createdAt > TOPBAR_SEARCH_CONFIG.cacheTtlMs) {
    runtime.cache.delete(key);
    return null;
  }

  return found.value;
}

export function setCached(runtime, query = "", value = []) {
  const key = getCacheKey(query);

  runtime.cache.set(key, {
    value,
    createdAt: Date.now(),
  });
}

/* =========================================================
   LOCAL INDEX
========================================================= */

export function getLocalIndex() {
  return [
    {
      id: "nav:/",
      type: ENTITY_TYPES.NAV,
      title: "Inicio",
      subtitle: "Panel principal",
      url: "/",
      action: SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id: "nav:/incidencias",
      type: ENTITY_TYPES.NAV,
      title: "Incidencias",
      subtitle: "Gestión de tickets e incidencias",
      url: "/incidencias",
      action: SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id: "nav:/facturas",
      type: ENTITY_TYPES.NAV,
      title: "Facturas",
      subtitle: "Facturación y documentos",
      url: "/facturas",
      action: SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id: "nav:/usuarios",
      type: ENTITY_TYPES.NAV,
      title: "Usuarios",
      subtitle: "Gestión de usuarios",
      url: "/usuarios",
      action: SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id: "nav:/clientes",
      type: ENTITY_TYPES.NAV,
      title: "Clientes",
      subtitle: "Gestión de clientes",
      url: "/clientes",
      action: SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id: "nav:/cuenta",
      type: ENTITY_TYPES.NAV,
      title: "Cuenta",
      subtitle: "Perfil y datos personales",
      url: "/cuenta",
      action: SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id: "nav:/ajustes",
      type: ENTITY_TYPES.NAV,
      title: "Ajustes",
      subtitle: "Configuración del sistema",
      url: "/ajustes",
      action: SEARCH_ACTIONS.NAVIGATE,
    },
    {
      id: "nav:/servidor",
      type: ENTITY_TYPES.NAV,
      title: "Servidor",
      subtitle: "Estado del servidor",
      url: "/servidor",
      action: SEARCH_ACTIONS.NAVIGATE,
    },
  ];
}

export function searchLocal(query = "") {
  const q = normalizeQuery(query);
  if (!q) return [];

  return getLocalIndex()
    .map((item) => {
      const score =
        scoreTextMatch(item.title, q) +
        scoreTextMatch(item.subtitle, q) +
        scoreTextMatch(item.url, q);

      return {
        ...item,
        entityId: "",
        raw: item,
        score,
        source: "local",
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

/* =========================================================
   API NORMALIZATION
========================================================= */

export function normalizeApiItem(AppCore, raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;

  const rawType = getRawType(raw);
  const type = normalizeSearchType(rawType);

  const title = getRawTitle(raw);
  const subtitle = getRawSubtitle(raw);

  const entityId = getEntityIdByType(type, raw, "");
  const rawUrl = getRawUrl(raw);

  const action = getActionForType(type, raw);

  const url = rawUrl
    ? safeNormalizePath(AppCore, rawUrl)
    : getFallbackUrlForEntity(AppCore, type, entityId, raw);

  const id = safeText(
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

  if (!title && !url && !entityId) return null;

  return {
    id: String(id),
    entityId: String(entityId || ""),
    type,
    title: String(title || "Resultado"),
    subtitle: String(subtitle || ""),
    url: url || null,
    action,
    raw,
    source: "api",
  };
}

export function normalizeApiPayload(AppCore, data) {
  if (!data) return [];

  const directArray = Array.isArray(data)
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
      .map((item, index) => normalizeApiItem(AppCore, item, index))
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
    "recentes",
    "recientes",
  ];

  const collected = [];

  groupedKeys.forEach((key) => {
    if (Array.isArray(data?.[key])) {
      data[key].forEach((item, index) => {
        const normalized = normalizeApiItem(
          AppCore,
          {
            ...safeObject(item),
            type: item?.type || key,
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
  const cached = getCached(runtime, query);
  if (cached) {
    return cached;
  }

  if (!AppCore?.apiClient?.get) {
    return [];
  }

  abortSearch(runtime);
  runtime.searchController = new AbortController();

  try {
    const data = await AppCore.apiClient.get("/api/search", {
      query: { q: query },
      signal: runtime.searchController.signal,
      auth: true,
      timeout: 12000,
    });

    const normalized = normalizeApiPayload(AppCore, data);
    setCached(runtime, query, normalized);

    return normalized;
  } catch (error) {
    if (error?.aborted || error?.name === "AbortError") {
      return [];
    }

    warn(AppCore, "TopbarUI: fallo búsqueda API", error);
    throw error;
  } finally {
    runtime.searchController = null;
  }
}

/* =========================================================
   MERGE
========================================================= */

export function mergeResults(apiResults = [], localResults = [], query = "") {
  const merged = uniqBy(
    [...apiResults, ...localResults].map((item) => ({
      ...item,
      score: scoreResult(item, query),
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
  if (!input) return;
  input.setAttribute("aria-expanded", String(Boolean(expanded)));
}

export function showResultsContainer(runtime, getDom) {
  const { searchResults, searchInput } = getDom();

  if (!searchResults) return;

  searchResults.hidden = false;
  searchResults.classList.add("active");
  searchResults.setAttribute("aria-hidden", "false");

  setSearchExpanded(searchInput, true);
  activateSearchFocus(runtime, getDom);
}

export function hideResultsContainer(runtime, getDom) {
  const { searchResults, searchInput } = getDom();

  if (searchResults) {
    searchResults.classList.remove("active");
    searchResults.hidden = true;
    searchResults.setAttribute("aria-hidden", "true");
    searchResults.innerHTML = "";
  }

  runtime.activeIndex = -1;
  runtime.currentItems = [];

  setSearchExpanded(searchInput, false);
  deactivateSearchFocus(getDom);
}

export function setLoadingState(AppCore, runtime, getDom, query = "") {
  const { searchResults } = getDom();
  if (!searchResults) return;

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

  showResultsContainer(runtime, getDom);
}

export function setEmptyState(AppCore, runtime, getDom, query = "") {
  const { searchResults } = getDom();
  if (!searchResults) return;

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

  showResultsContainer(runtime, getDom);
}

export function setErrorState(runtime, getDom) {
  const { searchResults } = getDom();
  if (!searchResults) return;

  searchResults.innerHTML = `
    <div class="search-state search-state-error" aria-live="polite">
      <div class="search-state-title">No se pudo completar la búsqueda</div>
      <div class="search-state-text">
        Revisa la conexión o inténtalo de nuevo.
      </div>
    </div>
  `;

  showResultsContainer(runtime, getDom);
}

export function updateActiveItem(runtime, items = []) {
  items.forEach((el) => el.classList.remove("active"));

  if (runtime.activeIndex >= 0 && items[runtime.activeIndex]) {
    items[runtime.activeIndex].classList.add("active");
    items[runtime.activeIndex].scrollIntoView({
      block: "nearest",
    });
  }
}

export function updateActiveVisuals(runtime, getDom) {
  const { searchResults } = getDom();
  if (!searchResults) return;

  const items = Array.from(searchResults.querySelectorAll(".search-result"));

  items.forEach((el, index) => {
    const isActive = index === runtime.activeIndex;
    el.classList.toggle("active", isActive);
    el.setAttribute("aria-selected", String(isActive));
  });

  if (runtime.activeIndex >= 0 && items[runtime.activeIndex]) {
    items[runtime.activeIndex].scrollIntoView({
      block: "nearest",
    });
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
  if (!item) return false;

  const { searchInput } = getDom();

  hideResultsContainer(runtime, getDom);

  if (searchInput) {
    searchInput.blur();
  }

  try {
    closeSidebarMobile?.();
  } catch {
    /* noop */
  }

  const action = safeText(
    item.action || getActionForType(item.type, item.raw),
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

    const target = safeText(
      item.url || getFallbackUrlForEntity(AppCore, item.type, item.entityId, item.raw),
      ""
    );

    if (!target) return false;

    return await navigateToPath(AppCore, Router, target, {
      force: true,
    });
  } catch (error) {
    warn(AppCore, "TopbarUI: no se pudo abrir resultado de búsqueda", {
      item,
      error,
    });

    showToast(
      AppCore,
      "No se pudo abrir el resultado. Se intentará navegar a su vista.",
      "error"
    );

    const fallback = safeText(
      item.url || getFallbackUrlForEntity(AppCore, item.type, item.entityId, item.raw),
      ""
    );

    if (fallback) {
      return navigateToPath(AppCore, Router, fallback, {
        force: true,
      });
    }

    return false;
  }
}

/* =========================================================
   RENDER RESULTS
========================================================= */

function renderActionPill(AppCore, item = {}) {
  const label = getActionLabel(item);

  if (!label) return "";

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
  const { searchResults } = getDom();
  if (!searchResults) return;

  searchResults.innerHTML = "";
  runtime.activeIndex = -1;
  runtime.currentItems = [];

  if (!results.length) {
    setEmptyState(AppCore, runtime, getDom, query);
    return;
  }

  const groups = groupResults(results);
  const fragment = document.createDocumentFragment();

  groups.forEach(([type, items]) => {
    const groupEl = document.createElement("section");
    groupEl.className = "search-group-block";
    groupEl.dataset.group = type;

    const header = document.createElement("div");
    header.className = "search-group";
    header.textContent = getTypeLabel(type);
    groupEl.appendChild(header);

    items
      .slice(0, TOPBAR_SEARCH_CONFIG.maxResultsPerGroup)
      .forEach((item) => {
        const resultEl = document.createElement("button");
        resultEl.type = "button";
        resultEl.className = "search-result";
        resultEl.dataset.type = item.type || ENTITY_TYPES.GENERAL;
        resultEl.dataset.url = item.url || "";
        resultEl.dataset.action = item.action || SEARCH_ACTIONS.NAVIGATE;
        resultEl.dataset.entityId = item.entityId || "";
        resultEl.dataset.index = String(runtime.currentItems.length);
        resultEl.setAttribute("role", "option");
        resultEl.setAttribute("aria-selected", "false");
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

        resultEl.addEventListener("click", async () => {
          await goToResult({
            AppCore,
            Router,
            runtime,
            getDom,
            closeSidebarMobile,
            item,
          });
        });

        resultEl.addEventListener("mouseenter", () => {
          const idx = Number(resultEl.dataset.index);

          if (!Number.isNaN(idx)) {
            runtime.activeIndex = idx;
            updateActiveVisuals(runtime, getDom);
          }
        });

        runtime.currentItems.push(item);
        groupEl.appendChild(resultEl);
      });

    fragment.appendChild(groupEl);
  });

  searchResults.appendChild(fragment);
  showResultsContainer(runtime, getDom);
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
  const q = normalizeQuery(query);
  runtime.currentQuery = q;

  if (!q || q.length < TOPBAR_SEARCH_CONFIG.minQueryLength) {
    hideResultsContainer(runtime, getDom);
    return;
  }

  setLoadingState(AppCore, runtime, getDom, q);

  try {
    const [remote, local] = await Promise.all([
      searchAPI({
        AppCore,
        runtime,
        query: q,
      }),
      Promise.resolve(searchLocal(q)),
    ]);

    if (runtime.currentQuery !== q) {
      return;
    }

    const merged = mergeResults(remote, local, q);

    renderResults({
      AppCore,
      Router,
      runtime,
      getDom,
      closeSidebarMobile,
      results: merged,
      query: q,
    });
  } catch (error) {
    if (runtime.currentQuery !== q) {
      return;
    }

    const local = searchLocal(q);

    if (local.length) {
      renderResults({
        AppCore,
        Router,
        runtime,
        getDom,
        closeSidebarMobile,
        results: local,
        query: q,
      });
      return;
    }

    setErrorState(runtime, getDom);
  }
}
