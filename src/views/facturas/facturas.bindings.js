/* =========================================================
   Onion SPA - Facturas Bindings
   Archivo: src/views/facturas/facturas.bindings.js

   FINAL PRO SYSTEM · BINDINGS REAL · 10/10
   PATCH · OPEN INCIDENCIA MODAL · NO ROUTE NAVIGATION
   PATCH · PAGINATION SUPPORT

   RESPONSABILIDADES:
   - registrar eventos UI del módulo de facturas
   - bind de refresh / retry / export
   - delegación de eventos sobre tabla/cards y acciones de colección
   - abrir incidencia relacionada mediante incidencias.modal.js
   - soportar paginación visual: prev / next / page
   - evitar dobles listeners por re-render
   - re-evaluar estado vivo en cada interacción
   - mantener facturasView.js limpio

   HARDENING PRO:
   - cleanup sólido por scope
   - no navega a rutas inexistentes de incidencia
   - importa lazy el modal de incidencias
   - abre fallback inmediato y actualiza con detalle remoto si existe
   - tolera ausencia parcial de acciones
   - soporta refresh explícito con asRefresh
   - no ejecuta bootstrap inicial: eso pertenece a la vista
========================================================= */

import { AppCore } from "../../core/index.js";
import { safeText } from "./facturas.utils.js";
import { getFacturaByIdStore } from "./facturas.store.js";

const DEFAULT_SCOPE = "view:facturas";
const INCIDENCIA_DETAIL_TIMEOUT = 90000;

/* =========================================================
   BASE HELPERS
========================================================= */

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    return value;
  }

  return null;
}

function encodeSegment(value = "") {
  return encodeURIComponent(safeText(value, ""));
}

function showBindingToast(message = "", type = "info") {
  const text = safeText(message, "");

  if (!text) return false;

  try {
    if (typeof AppCore?.toast?.[type] === "function") {
      AppCore.toast[type](text);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.toast?.show === "function") {
      AppCore.toast.show(text, type);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.ui?.toast?.[type] === "function") {
      AppCore.ui.toast[type](text);
      return true;
    }
  } catch {}

  try {
    if (typeof AppCore?.showToast === "function") {
      AppCore.showToast(text, type);
      return true;
    }
  } catch {}

  try {
    const logger =
      type === "error"
        ? console.error
        : type === "warning"
          ? console.warn
          : console.log;

    logger(`[FacturasBindings:${type}]`, text);
  } catch {}

  return false;
}

function resolveScopeName(scopeName = DEFAULT_SCOPE) {
  return safeText(scopeName, DEFAULT_SCOPE);
}

function resolveScope(scopeName = DEFAULT_SCOPE) {
  const finalScope = resolveScopeName(scopeName);

  try {
    AppCore?.cleanup?.run?.(finalScope);
  } catch {}

  try {
    return AppCore?.cleanup?.scope?.(finalScope) || finalScope;
  } catch {
    return finalScope;
  }
}

function getLiveState(getState) {
  try {
    return typeof getState === "function" ? getState() || {} : {};
  } catch {
    return {};
  }
}

function getRoot(container, scopeName = DEFAULT_SCOPE) {
  if (!container) return null;

  return (
    container.querySelector(
      `[data-facturas-scope="${resolveScopeName(scopeName)}"]`
    ) || container
  );
}

function getDatasetValue(element, ...keys) {
  if (!element) return "";

  for (const key of keys) {
    const value = element?.dataset?.[key];

    if (safeText(value, "")) {
      return safeText(value, "");
    }
  }

  return "";
}

function getAttrValue(element, ...attrs) {
  if (!element) return "";

  for (const attr of attrs) {
    try {
      const value = element.getAttribute?.(attr);

      if (safeText(value, "")) {
        return safeText(value, "");
      }
    } catch {}
  }

  return "";
}

function getFacturaId(element) {
  return safeText(
    getDatasetValue(element, "facturaId") ||
      getAttrValue(element, "data-factura-id") ||
      "",
    ""
  );
}

function getIncidenciaId(element) {
  return safeText(
    getDatasetValue(element, "ticketId", "incidenciaId") ||
      getAttrValue(element, "data-ticket-id", "data-incidencia-id") ||
      "",
    ""
  );
}

function getActionName(element) {
  return safeText(
    getDatasetValue(element, "action", "facturasAction") ||
      getAttrValue(element, "data-action", "data-facturas-action") ||
      "",
    ""
  );
}

function getPageValue(element, fallback = 1) {
  const raw = safeText(
    getDatasetValue(element, "page") ||
      getAttrValue(element, "data-page") ||
      "",
    ""
  );

  const n = Number.parseInt(raw, 10);

  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }

  return n;
}

function isBusyState(state = {}) {
  return Boolean(state?.loading || state?.refreshing);
}

function isOpenBusyState(state = {}) {
  return Boolean(
    state?.loading ||
      state?.refreshing ||
      state?.detailLoading ||
      state?.openingFacturaId
  );
}

function isActionBusyForFactura(state = {}, facturaId = "") {
  const id = safeText(facturaId, "");

  if (!id) return false;

  return Boolean(
    safeText(state?.sendingFacturaId, "") === id ||
      safeText(state?.downloadingFacturaId, "") === id ||
      safeText(state?.viewingFacturaId, "") === id ||
      safeText(state?.openingFacturaId, "") === id
  );
}

async function safeRefresh({
  loadFacturas,
  silent = true,
  asRefresh = true,
  force = true,
} = {}) {
  if (typeof loadFacturas !== "function") {
    return false;
  }

  await loadFacturas({
    silent,
    asRefresh,
    force,
  });

  return true;
}

/* =========================================================
   INCIDENCIAS MODAL BRIDGE
========================================================= */

function getStorageValue(key = "") {
  const finalKey = safeText(key, "");
  if (!finalKey) return "";

  try {
    return localStorage.getItem(finalKey) || "";
  } catch {}

  try {
    return sessionStorage.getItem(finalKey) || "";
  } catch {}

  return "";
}

function getAuthToken() {
  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.auth?.getToken?.(),
      AppCore?.Auth?.getToken?.(),
      window?.Auth?.getToken?.(),
      getStorageValue("token"),
      getStorageValue("accessToken")
    ),
    ""
  );
}

function getApiClient() {
  return (
    AppCore?.apiClient ||
    AppCore?.modules?.Http ||
    AppCore?.Http ||
    window?.Http ||
    null
  );
}

function getApiBase() {
  return safeText(
    first(
      AppCore?.config?.apiBase,
      AppCore?.config?.api?.baseUrl,
      AppCore?.state?.apiBase,
      window?.ONION_API_BASE,
      window?.API_BASE
    ),
    ""
  ).replace(/\/+$/, "");
}

function resolveApiUrl(path = "") {
  const value = safeText(path, "");

  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const apiBase = getApiBase();

  if (!apiBase) {
    return value.startsWith("/") ? value : `/${value}`;
  }

  const normalizedPath = value.startsWith("/") ? value : `/${value}`;

  if (apiBase.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${apiBase}${normalizedPath.slice(4)}`;
  }

  return `${apiBase}${normalizedPath}`;
}

function createTimeoutSignal(timeoutMs = INCIDENCIA_DETAIL_TIMEOUT) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, timeoutMs);

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
    },
  };
}

function isRecoverableDetailError(error = null) {
  const status = safeNumber(
    first(error?.status, error?.statusCode, error?.response?.status),
    0
  );

  return status === 404 || status === 405;
}

async function loadIncidenciasModal() {
  const module = await import("../incidencias/incidencias.modal.js");

  const modal =
    module?.OnionIncidenciasModal ||
    module?.default ||
    window?.OnionIncidenciasModal ||
    null;

  if (!modal || typeof modal.open !== "function") {
    throw new Error("INCIDENCIAS_MODAL_UNAVAILABLE");
  }

  return modal;
}

async function apiGet(path = "") {
  const finalPath = safeText(path, "");
  const client = getApiClient();

  if (!finalPath) {
    throw new Error("API_PATH_REQUIRED");
  }

  if (typeof client?.get === "function") {
    return client.get(finalPath, {
      timeout: INCIDENCIA_DETAIL_TIMEOUT,
      auth: true,
    });
  }

  if (typeof client?.request === "function") {
    return client.request(finalPath, {
      method: "GET",
      timeout: INCIDENCIA_DETAIL_TIMEOUT,
      auth: true,
    });
  }

  const url = resolveApiUrl(finalPath);
  const token = getAuthToken();
  const timeout = createTimeoutSignal(INCIDENCIA_DETAIL_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: timeout.signal,
    });

    const text = await response.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    if (!response.ok) {
      const error = new Error(
        safeText(
          first(payload?.message, payload?.error, `HTTP ${response.status}`),
          `HTTP ${response.status}`
        )
      );

      error.status = response.status;
      error.statusCode = response.status;
      error.response = payload;

      throw error;
    }

    return payload;
  } finally {
    timeout.clear();
  }
}

function extractDetailPayload(response = null) {
  const obj = safeObject(response);

  return (
    obj.detail ||
    obj.ticket ||
    obj.incidencia ||
    obj.item ||
    obj.data?.detail ||
    obj.data?.ticket ||
    obj.data?.incidencia ||
    obj.data?.item ||
    obj.data ||
    obj.result?.detail ||
    obj.result?.ticket ||
    obj.result?.incidencia ||
    obj.result?.item ||
    obj.result ||
    obj.payload?.detail ||
    obj.payload?.ticket ||
    obj.payload?.incidencia ||
    obj.payload?.item ||
    obj.payload ||
    obj ||
    null
  );
}

async function fetchIncidenciaDetail(ticketId = "") {
  const id = safeText(ticketId, "");

  if (!id) {
    throw new Error("INCIDENCIA_ID_REQUIRED");
  }

  const encodedId = encodeSegment(id);

  const candidates = [
    `/api/tickets/${encodedId}`,
    `/api/incidencias/${encodedId}`,
  ];

  let lastError = null;

  for (const path of candidates) {
    try {
      const response = await apiGet(path);
      return extractDetailPayload(response);
    } catch (error) {
      lastError = error;

      if (!isRecoverableDetailError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error("INCIDENCIA_DETAIL_NOT_FOUND");
}

function getRelationObject(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeObject(
    first(
      item.incidencia,
      item.ticket,
      item.linkedTicket,
      raw.incidencia,
      raw.ticket,
      raw.linkedTicket
    )
  );
}

function getFacturaNumberFromItem(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeText(
    first(
      item.numero,
      item.invoiceNumber,
      item.code,
      item.numeroFacturaLegal,
      item.numeroFacturaSistema,
      item.id,
      raw.numero,
      raw.invoiceNumber,
      raw.code,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema,
      raw.id
    ),
    ""
  );
}

function getFacturaIdFromItem(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeText(
    first(
      item.id,
      item._id,
      item.facturaId,
      item.invoiceId,
      item.numero,
      item.numeroFacturaLegal,
      item.numeroFacturaSistema,
      raw.id,
      raw._id,
      raw.facturaId,
      raw.invoiceId,
      raw.numero,
      raw.numeroFacturaLegal,
      raw.numeroFacturaSistema
    ),
    ""
  );
}

function getClientNameFromFactura(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeText(
    first(
      item.clienteNombre,
      item.cliente?.nombre,
      item.cliente?.nombreContacto,
      item.clientName,
      item.client?.name,
      raw.clienteNombre,
      raw.cliente?.nombre,
      raw.cliente?.nombreContacto,
      raw.clientName,
      raw.client?.name
    ),
    "Cliente"
  );
}

function getClientEmailFromFactura(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeText(
    first(
      item.clienteEmail,
      item.emailCliente,
      item.cliente?.email,
      item.clientEmail,
      item.client?.email,
      raw.clienteEmail,
      raw.emailCliente,
      raw.cliente?.email,
      raw.clientEmail,
      raw.client?.email
    ),
    ""
  );
}

function getClienteIdFromFactura(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);

  return safeText(
    first(
      item.clienteId,
      item.cliente?.id,
      item.clientId,
      item.client?.id,
      raw.clienteId,
      raw.cliente?.id,
      raw.clientId,
      raw.client?.id
    ),
    ""
  );
}

function getIncidenciaIdFromFactura(factura = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);
  const relation = getRelationObject(item);

  return safeText(
    first(
      item.ticketId,
      item.incidenciaId,

      relation.ticketId,
      relation.incidenciaId,
      relation.id,

      item.relatedTicketId,
      item.relatedIncidentId,
      item.supportTicketId,
      item.caseId,

      item.meta?.ticketId,
      item.meta?.incidenciaId,

      raw.ticketId,
      raw.incidenciaId,

      raw.incidencia?.ticketId,
      raw.incidencia?.incidenciaId,
      raw.incidencia?.id,

      raw.ticket?.ticketId,
      raw.ticket?.incidenciaId,
      raw.ticket?.id,

      raw.relatedTicketId,
      raw.relatedIncidentId,
      raw.supportTicketId,
      raw.caseId,

      raw.meta?.ticketId,
      raw.meta?.incidenciaId
    ),
    ""
  );
}

function buildFallbackIncidenciaDetail({
  ticketId = "",
  factura = {},
} = {}) {
  const item = safeObject(factura);
  const raw = safeObject(item.raw);
  const relation = getRelationObject(item);

  const id = safeText(
    first(
      ticketId,
      getIncidenciaIdFromFactura(item),
      relation.ticketId,
      relation.incidenciaId,
      relation.id
    ),
    ""
  );

  const facturaId = getFacturaIdFromItem(item);
  const facturaNumero = getFacturaNumberFromItem(item);
  const clientName = getClientNameFromFactura(item);
  const clientEmail = getClientEmailFromFactura(item);
  const clienteId = getClienteIdFromFactura(item);

  const subject = safeText(
    first(
      relation.subject,
      relation.asunto,
      relation.title,
      relation.nombre,
      item.subject,
      item.asunto,
      raw.subject,
      raw.asunto,
      facturaNumero
        ? `Incidencia vinculada a factura ${facturaNumero}`
        : `Incidencia ${id}`
    ),
    `Incidencia ${id}`
  );

  return {
    id,
    ticketId: id,
    incidenciaId: id,
    code: id,
    ticketCode: id,

    title: subject,
    subject,
    asunto: subject,

    status: safeText(
      first(
        relation.status,
        relation.estado,
        raw.incidencia?.status,
        raw.incidencia?.estado,
        "open"
      ),
      "open"
    ),

    estado: safeText(
      first(
        relation.estado,
        relation.status,
        raw.incidencia?.estado,
        raw.incidencia?.status,
        "open"
      ),
      "open"
    ),

    priority: safeText(
      first(
        relation.priority,
        relation.prioridad,
        raw.incidencia?.priority,
        raw.incidencia?.prioridad,
        "medium"
      ),
      "medium"
    ),

    prioridad: safeText(
      first(
        relation.prioridad,
        relation.priority,
        raw.incidencia?.prioridad,
        raw.incidencia?.priority,
        "medium"
      ),
      "medium"
    ),

    description: safeText(
      first(
        relation.description,
        relation.descripcion,
        relation.message,
        relation.preview,
        raw.incidencia?.description,
        raw.incidencia?.descripcion,
        raw.incidencia?.message,
        raw.incidencia?.preview,
        facturaNumero
          ? `Incidencia relacionada con la factura ${facturaNumero}.`
          : "Incidencia relacionada con una factura."
      ),
      "Incidencia relacionada con una factura."
    ),

    message: safeText(
      first(
        relation.message,
        relation.description,
        relation.descripcion,
        ""
      ),
      ""
    ),

    clientName,
    clienteId,
    clienteNombre: clientName,

    cliente: {
      id: clienteId || null,
      nombre: clientName,
      name: clientName,
      email: clientEmail,
      avatar: safeText(
        first(item.cliente?.avatar, raw.cliente?.avatar, relation.clienteAvatar),
        ""
      ),
    },

    client: {
      id: clienteId || null,
      name: clientName,
      email: clientEmail,
      avatar: safeText(
        first(item.cliente?.avatar, raw.cliente?.avatar, relation.clienteAvatar),
        ""
      ),
    },

    facturaId,
    invoiceId: facturaId,
    factura: facturaNumero || facturaId,
    invoiceCode: facturaNumero || facturaId,
    facturaRelacionada: facturaNumero || facturaId,

    createdAt: first(
      relation.createdAt,
      raw.incidencia?.createdAt,
      item.createdAt,
      raw.createdAt,
      item.fecha,
      raw.fecha,
      null
    ),

    updatedAt: first(
      relation.updatedAt,
      relation.linkedAt,
      raw.incidencia?.updatedAt,
      raw.incidencia?.linkedAt,
      item.updatedAt,
      raw.updatedAt,
      null
    ),

    attachments: first(
      relation.attachments,
      relation.files,
      relation.adjuntos,
      raw.incidencia?.attachments,
      raw.incidencia?.files,
      raw.incidencia?.adjuntos,
      []
    ),

    comments: first(
      relation.comments,
      relation.messages,
      relation.notes,
      raw.incidencia?.comments,
      raw.incidencia?.messages,
      raw.incidencia?.notes,
      []
    ),

    history: first(
      relation.history,
      relation.timeline,
      relation.events,
      raw.incidencia?.history,
      raw.incidencia?.timeline,
      raw.incidencia?.events,
      []
    ),

    raw: {
      ...relation,

      id,
      ticketId: id,
      incidenciaId: id,
      code: id,
      ticketCode: id,

      facturaId,
      invoiceId: facturaId,
      facturaRelacionada: facturaNumero || facturaId,

      clienteId,
      clienteNombre: clientName,

      factura: {
        ...safeObject(raw.factura),
        id: facturaId,
        numero: facturaNumero,
      },

      invoice: {
        ...safeObject(raw.invoice),
        id: facturaId,
        code: facturaNumero,
      },
    },
  };
}

function mergeIncidenciaDetailWithFallback(fallback = {}, remote = {}) {
  const base = safeObject(fallback);
  const next = safeObject(remote);

  const id = safeText(
    first(
      next.ticketId,
      next.id,
      next.code,
      next.ticketCode,
      next.incidenciaId,
      base.ticketId,
      base.id
    ),
    ""
  );

  const facturaId = safeText(
    first(next.facturaId, next.invoiceId, base.facturaId, base.invoiceId),
    ""
  );

  const facturaLabel = safeText(
    first(
      next.factura,
      next.facturaRelacionada,
      next.invoiceCode,
      base.factura,
      base.facturaRelacionada,
      base.invoiceCode,
      facturaId
    ),
    ""
  );

  return {
    ...base,
    ...next,

    id,
    ticketId: id,
    incidenciaId: safeText(first(next.incidenciaId, id), id),
    code: safeText(first(next.code, next.ticketCode, id), id),
    ticketCode: safeText(first(next.ticketCode, next.code, id), id),

    facturaId,
    invoiceId: safeText(first(next.invoiceId, next.facturaId, facturaId), facturaId),
    factura: facturaLabel,
    facturaRelacionada: facturaLabel,
    invoiceCode: safeText(first(next.invoiceCode, facturaLabel), facturaLabel),

    raw: {
      ...safeObject(base.raw),
      ...safeObject(next.raw || next),

      id,
      ticketId: id,
      incidenciaId: safeText(first(next.incidenciaId, id), id),

      facturaId,
      invoiceId: safeText(first(next.invoiceId, next.facturaId, facturaId), facturaId),
      facturaRelacionada: facturaLabel,
    },
  };
}

async function openIncidenciaModalFromFacturas({
  incidenciaId = "",
  ticketId = "",
  facturaId = "",
} = {}) {
  const finalFacturaId = safeText(facturaId, "");
  const factura = finalFacturaId ? getFacturaByIdStore(finalFacturaId) : null;

  const finalTicketId = safeText(
    first(
      ticketId,
      incidenciaId,
      getIncidenciaIdFromFactura(factura)
    ),
    ""
  );

  if (!finalTicketId) {
    showBindingToast(
      "No se pudo identificar la incidencia relacionada.",
      "error"
    );

    return false;
  }

  let modal = null;

  try {
    modal = await loadIncidenciasModal();
  } catch {
    showBindingToast(
      "No se pudo cargar el modal de incidencias.",
      "error"
    );

    return false;
  }

  const fallbackDetail = buildFallbackIncidenciaDetail({
    ticketId: finalTicketId,
    factura: factura || {},
  });

  try {
    modal.open(fallbackDetail);
  } catch {
    showBindingToast(
      "No se pudo abrir el modal de incidencias.",
      "error"
    );

    return false;
  }

  try {
    AppCore?.events?.emit?.("facturas:incidencia:opening", {
      ticketId: finalTicketId,
      incidenciaId: finalTicketId,
      facturaId: finalFacturaId,
      factura,
    });
  } catch {}

  try {
    const remoteDetail = await fetchIncidenciaDetail(finalTicketId);

    const nextDetail = mergeIncidenciaDetailWithFallback(
      fallbackDetail,
      remoteDetail
    );

    if (typeof modal.update === "function") {
      modal.update(nextDetail);
    } else {
      modal.open(nextDetail);
    }

    try {
      AppCore?.events?.emit?.("incidencias:open:success", {
        ticketId: finalTicketId,
        incidenciaId: finalTicketId,
        detail: nextDetail,
      });
    } catch {}

    return true;
  } catch (error) {
    try {
      if (typeof modal.setFeedback === "function") {
        modal.setFeedback(
          "La incidencia se ha abierto con la información vinculada a la factura, pero no se pudo cargar el detalle completo desde la API.",
          "info"
        );
      }
    } catch {}

    try {
      AppCore?.events?.emit?.("facturas:incidencia:open:fallback", {
        ticketId: finalTicketId,
        incidenciaId: finalTicketId,
        facturaId: finalFacturaId,
        error,
      });
    } catch {}

    return true;
  }
}

/* =========================================================
   PAGINATION HELPERS
========================================================= */

function resolveCurrentPage(state = {}) {
  const candidates = [
    state?.page,
    state?.currentPage,
    state?.facturasPage,
    state?.view?.page,
    state?.view?.currentPage,
    state?.pagination?.page,
    state?.pagination?.currentPage,
  ];

  for (const candidate of candidates) {
    const n = Number.parseInt(candidate, 10);

    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }

  return 1;
}

function runRender(render) {
  try {
    if (typeof render === "function") {
      render();
      return true;
    }
  } catch {}

  return false;
}

function trySetPageOnState(state = {}, page = 1) {
  const nextPage = Math.max(1, Number.parseInt(page, 10) || 1);

  try {
    if (state?.view && typeof state.view === "object") {
      state.view.page = nextPage;
      state.view.currentPage = nextPage;
      state.view.facturasPage = nextPage;
      return true;
    }
  } catch {}

  try {
    if (state?.pagination && typeof state.pagination === "object") {
      state.pagination.page = nextPage;
      state.pagination.currentPage = nextPage;
      return true;
    }
  } catch {}

  try {
    state.page = nextPage;
    state.currentPage = nextPage;
    state.facturasPage = nextPage;
    return true;
  } catch {}

  return false;
}

async function handlePagination({
  action = "",
  page = 1,
  state = {},
  render,
  goToPage,
  goPrevPage,
  goNextPage,
  setPage,
} = {}) {
  if (isBusyState(state)) {
    return false;
  }

  const currentPage = resolveCurrentPage(state);

  if (action === "prev-page" || action === "pagination-prev") {
    if (typeof goPrevPage === "function") {
      await goPrevPage();
      return true;
    }

    page = Math.max(1, currentPage - 1);
  }

  if (action === "next-page" || action === "pagination-next") {
    if (typeof goNextPage === "function") {
      await goNextPage();
      return true;
    }

    page = currentPage + 1;
  }

  if (typeof goToPage === "function") {
    await goToPage(page);
    return true;
  }

  if (typeof setPage === "function") {
    await setPage(page);
    runRender(render);
    return true;
  }

  const patched = trySetPageOnState(state, page);

  if (patched) {
    runRender(render);
    return true;
  }

  showBindingToast(
    "La paginación necesita conectar goToPage o setPage desde FacturasView.",
    "warning"
  );

  return false;
}

/* =========================================================
   MAIN
========================================================= */

export function bindFacturasView({
  scopeName = DEFAULT_SCOPE,

  getContainer,
  getState,

  render,

  loadFacturas,
  openFactura,
  openFacturaPdf,
  downloadFacturaPdf,
  sendFacturaToClient,
  closeDetail,
  exportFacturasCsv,

  goToPage,
  goPrevPage,
  goNextPage,
  setPage,
} = {}) {
  if (typeof getContainer !== "function") {
    return () => {};
  }

  const scope = resolveScope(scopeName);
  const container = getContainer();
  const root = getRoot(container, scopeName);

  if (!container || !root) {
    return () => {};
  }

  const refreshBtn = container.querySelector("#facturas-refresh-btn");
  const retryBtn = container.querySelector("#facturas-retry-btn");
  const exportBtn = container.querySelector("#facturas-export-btn");
  const closeDetailBtn = container.querySelector("[data-action='close-detail']");

  if (refreshBtn) {
    AppCore?.cleanup?.on?.(
      scope,
      refreshBtn,
      "click",
      async (event) => {
        event.preventDefault();

        const state = getLiveState(getState);

        if (isBusyState(state)) {
          return;
        }

        try {
          await safeRefresh({
            loadFacturas,
            silent: true,
            asRefresh: true,
            force: true,
          });

          showBindingToast(
            "Facturas actualizadas correctamente.",
            "success"
          );
        } catch {
          showBindingToast(
            "No se pudo actualizar el listado.",
            "error"
          );
        }
      }
    );
  }

  if (retryBtn) {
    AppCore?.cleanup?.on?.(
      scope,
      retryBtn,
      "click",
      async (event) => {
        event.preventDefault();

        const state = getLiveState(getState);

        if (isBusyState(state)) {
          return;
        }

        try {
          await safeRefresh({
            loadFacturas,
            silent: false,
            asRefresh: false,
            force: true,
          });
        } catch {
          showBindingToast(
            "No se pudo recargar la facturación.",
            "error"
          );
        }
      }
    );
  }

  if (exportBtn) {
    AppCore?.cleanup?.on?.(
      scope,
      exportBtn,
      "click",
      (event) => {
        event.preventDefault();

        const state = getLiveState(getState);

        if (isBusyState(state)) {
          return;
        }

        try {
          exportFacturasCsv?.();
        } catch {
          showBindingToast(
            "No se pudo exportar el CSV.",
            "error"
          );
        }
      }
    );
  }

  if (closeDetailBtn) {
    AppCore?.cleanup?.on?.(
      scope,
      closeDetailBtn,
      "click",
      (event) => {
        event.preventDefault();
        closeDetail?.();
      }
    );
  }

  AppCore?.cleanup?.on?.(
    scope,
    root,
    "click",
    async (event) => {
      const state = getLiveState(getState);

      const actionEl =
        event.target?.closest?.("[data-facturas-action]") ||
        event.target?.closest?.("[data-action]");

      const cardEl =
        event.target?.closest?.(".factura-card") ||
        event.target?.closest?.(".facturas-mobile-card") ||
        event.target?.closest?.(".facturas-row") ||
        event.target?.closest?.(".facturas-table-row") ||
        event.target?.closest?.("[data-factura-id]");

      if (actionEl) {
        const action = getActionName(actionEl);
        const rowEl = actionEl.closest?.("[data-factura-id]");

        const facturaId = safeText(
          getFacturaId(actionEl) ||
            getFacturaId(rowEl) ||
            "",
          ""
        );

        const incidenciaId = getIncidenciaId(actionEl);

        if (
          action === "prev-page" ||
          action === "pagination-prev" ||
          action === "next-page" ||
          action === "pagination-next" ||
          action === "page" ||
          action === "go-page"
        ) {
          event.preventDefault();
          event.stopPropagation();

          const page = getPageValue(
            actionEl,
            resolveCurrentPage(state)
          );

          await handlePagination({
            action,
            page,
            state,
            render,
            goToPage,
            goPrevPage,
            goNextPage,
            setPage,
          });

          return;
        }

        if (action === "refresh" || action === "reload") {
          event.preventDefault();
          event.stopPropagation();

          if (isBusyState(state)) {
            return;
          }

          try {
            await safeRefresh({
              loadFacturas,
              silent: true,
              asRefresh: true,
              force: true,
            });

            showBindingToast(
              "Facturas actualizadas correctamente.",
              "success"
            );
          } catch {
            showBindingToast(
              "No se pudo actualizar el listado.",
              "error"
            );
          }

          return;
        }

        if (action === "retry") {
          event.preventDefault();
          event.stopPropagation();

          if (isBusyState(state)) {
            return;
          }

          try {
            await safeRefresh({
              loadFacturas,
              silent: false,
              asRefresh: false,
              force: true,
            });
          } catch {
            showBindingToast(
              "No se pudo recargar la facturación.",
              "error"
            );
          }

          return;
        }

        if (action === "export" || action === "export-csv") {
          event.preventDefault();
          event.stopPropagation();

          if (isBusyState(state)) {
            return;
          }

          try {
            exportFacturasCsv?.();
          } catch {
            showBindingToast(
              "No se pudo exportar el CSV.",
              "error"
            );
          }

          return;
        }

        if (action === "open-incidencia") {
          event.preventDefault();
          event.stopPropagation();

          if (!incidenciaId || isBusyState(state)) {
            return;
          }

          const opened = await openIncidenciaModalFromFacturas({
            incidenciaId,
            ticketId: incidenciaId,
            facturaId,
          });

          if (!opened) {
            showBindingToast(
              "No se pudo abrir la incidencia relacionada.",
              "error"
            );
          }

          return;
        }

        if (action === "open-factura") {
          event.preventDefault();
          event.stopPropagation();

          if (!facturaId || isOpenBusyState(state)) {
            return;
          }

          await openFactura?.(facturaId);
          return;
        }

        if (action === "view-factura-pdf") {
          event.preventDefault();
          event.stopPropagation();

          if (!facturaId || isActionBusyForFactura(state, facturaId)) {
            return;
          }

          await openFacturaPdf?.(facturaId);
          return;
        }

        if (action === "download-factura") {
          event.preventDefault();
          event.stopPropagation();

          if (!facturaId || isActionBusyForFactura(state, facturaId)) {
            return;
          }

          await downloadFacturaPdf?.(facturaId);
          return;
        }

        if (action === "send-factura") {
          event.preventDefault();
          event.stopPropagation();

          if (!facturaId || isActionBusyForFactura(state, facturaId)) {
            return;
          }

          await sendFacturaToClient?.(facturaId);
          return;
        }

        if (
          action === "close-detail" ||
          action === "close-factura-detail"
        ) {
          event.preventDefault();
          event.stopPropagation();

          closeDetail?.();
          return;
        }
      }

      if (
        cardEl &&
        !event.target?.closest?.(
          "button, a, input, select, textarea, [data-action], [data-facturas-action]"
        )
      ) {
        const rowClickDisabled =
          safeText(cardEl?.dataset?.rowClickDisabled, "") === "true";

        if (rowClickDisabled) {
          return;
        }

        const facturaId = getFacturaId(cardEl);

        if (!facturaId || isOpenBusyState(state)) {
          return;
        }

        await openFactura?.(facturaId);
      }
    }
  );

  return () => {
    try {
      AppCore?.cleanup?.run?.(resolveScopeName(scopeName));
    } catch {}
  };
}

export default {
  bindFacturasView,
};
