/* =========================================================
   Onion SPA - Facturas View
   Archivo: src/views/facturas/facturasView.js

   FINAL PRO SYSTEM · VIEW REAL · FULL PATCH PORTAL MODAL
   PATCH 4 · INCIDENCIA LINK PRESERVER · PAGINATION READY

   RESPONSABILIDADES:
   - render principal de facturas
   - modal detail en portal global (body)
   - rerender granular
   - bindings de vista + bindings de portal modal
   - cero conflicto con shell SPA
   - performance pro
   - cleanup enterprise
   - preservar relación factura ↔ incidencia para columna Incidencia
   - paginación visual real a 5 facturas por página
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  renderHeader,
  renderCards,
  renderLoadingState,
  renderErrorState,
} from "./facturas.template.js";

import {
  renderFacturasDetailModal,
} from "./facturas.detail.template.js";

import { getSortedFacturasStore } from "./facturas.store.js";

import {
  createFacturasState,
  getFacturasTemplateState,
  isFacturasHydrated,
  isFacturasBootstrapped,
  isFacturasLoading,
  isFacturasRefreshing,
  isFacturasDetailOpen,
  getFacturasDetailData,
  setFacturasHydrated,
  setFacturasBootstrapped,
  setFacturasDetailOpen,
  setFacturasDetailLoading,
  setFacturasDetailData,
  setFacturasSendingFacturaId,
  setFacturasDownloadingFacturaId,
  setFacturasViewingFacturaId,
  setFacturasOpeningFacturaId,
  setFacturasLoading,
  setFacturasRefreshing,
  setFacturasLoaded,
  clearFacturasError,
  clearFacturasActionIds,
  closeFacturasDetail,
  setFacturasLastSyncAt,
  getFacturasLastSyncAt,
} from "./facturas.state.js";

import {
  loadFacturasCollection,
  loadFacturaDetailById,
} from "./facturas.loaders.js";

import {
  openFacturaAction,
  openFacturaPdfAction,
  downloadFacturaPdfAction,
  sendFacturaToClientAction,
  exportFacturasCsvAction,
} from "./facturas.actions.js";

import { bindFacturasView } from "./facturas.bindings.js";

import {
  escapeHtml,
  safeText,
  showToast,
} from "./facturas.utils.js";

export const FacturasView = (() => {
  "use strict";

  /* =====================================================
     CONSTANTS
  ===================================================== */

  const SCOPE = "view:facturas";
  const DETAIL_MODAL_ID = "facturas-detail-root";
  const PAGE_SIZE = 5;

  const state = createFacturasState();

  let initialized = false;
  let destroyed = false;
  let inflightInit = null;
  let inflightLoad = null;
  let bindingsCleanup = null;
  let modalBindingsCleanup = null;
  let renderToken = 0;

  /* =====================================================
     LOCAL HELPERS
  ===================================================== */

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
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
      if (typeof value === "string" && value.trim() === "") continue;
      return value;
    }

    return null;
  }

  function hasOwnKeys(value = {}) {
    return Boolean(
      value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length
    );
  }

  function clampNumber(value, min = 1, max = Number.MAX_SAFE_INTEGER) {
    const n = safeNumber(value, min);
    return Math.min(Math.max(n, min), max);
  }

  function getStableFacturaId(item = {}) {
    return safeText(
      first(
        item?.id,
        item?._id,
        item?.facturaId,
        item?.numero,
        item?.numeroFacturaLegal,
        item?.numeroFacturaSistema,
        item?.raw?.id,
        item?.raw?._id,
        item?.raw?.facturaId,
        item?.raw?.numero,
        item?.raw?.numeroFacturaLegal,
        item?.raw?.numeroFacturaSistema
      ),
      ""
    );
  }

  function getRelatedIncidenciaId(item = {}) {
    const source = safeObject(item);
    const raw = safeObject(source.raw);

    const incidencia = safeObject(
      first(
        source.incidencia,
        raw.incidencia
      )
    );

    const ticket = safeObject(
      first(
        source.ticket,
        raw.ticket
      )
    );

    const linkedTicket = safeObject(
      first(
        source.linkedTicket,
        raw.linkedTicket
      )
    );

    return safeText(
      first(
        source.ticketId,
        source.incidenciaId,

        incidencia.ticketId,
        incidencia.id,
        incidencia.incidenciaId,

        ticket.ticketId,
        ticket.id,
        ticket.incidenciaId,

        linkedTicket.ticketId,
        linkedTicket.id,
        linkedTicket.incidenciaId,

        source.relatedTicketId,
        source.relatedIncidentId,
        source.supportTicketId,
        source.caseId,

        raw.ticketId,
        raw.incidenciaId,

        raw.incidencia?.ticketId,
        raw.incidencia?.id,
        raw.incidencia?.incidenciaId,

        raw.ticket?.ticketId,
        raw.ticket?.id,
        raw.ticket?.incidenciaId,

        raw.linkedTicket?.ticketId,
        raw.linkedTicket?.id,
        raw.linkedTicket?.incidenciaId,

        raw.relatedTicketId,
        raw.relatedIncidentId,
        raw.supportTicketId,
        raw.caseId
      ),
      ""
    );
  }

  function buildIncidenciaPayload(item = {}) {
    const source = safeObject(item);
    const raw = safeObject(source.raw);

    const incidencia = safeObject(
      first(
        source.incidencia,
        raw.incidencia
      )
    );

    const ticket = safeObject(
      first(
        source.ticket,
        raw.ticket
      )
    );

    const linkedTicket = safeObject(
      first(
        source.linkedTicket,
        raw.linkedTicket
      )
    );

    const incidenciaId = getRelatedIncidenciaId(source);

    if (!incidenciaId) {
      return null;
    }

    return {
      ...incidencia,

      id: incidenciaId,
      ticketId: incidenciaId,
      incidenciaId,

      subject: safeText(
        first(
          incidencia.subject,
          incidencia.asunto,
          ticket.subject,
          ticket.asunto,
          linkedTicket.subject,
          linkedTicket.asunto,
          raw.subject,
          raw.asunto,
          ""
        ),
        ""
      ),

      asunto: safeText(
        first(
          incidencia.asunto,
          incidencia.subject,
          ticket.asunto,
          ticket.subject,
          linkedTicket.asunto,
          linkedTicket.subject,
          raw.asunto,
          raw.subject,
          ""
        ),
        ""
      ),

      clienteId: safeText(
        first(
          incidencia.clienteId,
          ticket.clienteId,
          linkedTicket.clienteId,
          source.clienteId,
          source.cliente?.id,
          raw.clienteId,
          raw.cliente?.id,
          ""
        ),
        ""
      ),

      relationType: safeText(
        first(
          incidencia.relationType,
          ticket.relationType,
          linkedTicket.relationType,
          source.relationType,
          raw.relationType,
          "linked_ticket"
        ),
        "linked_ticket"
      ),

      linkedAt: safeText(
        first(
          incidencia.linkedAt,
          ticket.linkedAt,
          linkedTicket.linkedAt,
          raw.linkedAt,
          ""
        ),
        ""
      ),
    };
  }

  function preserveIncidenciaFields(item = {}, fallbackRaw = {}) {
    const source = safeObject(item);

    const embeddedRaw = safeObject(source.raw);
    const externalRaw = safeObject(fallbackRaw);
    const raw = hasOwnKeys(embeddedRaw) ? embeddedRaw : externalRaw;

    const merged = {
      ...source,
      raw: hasOwnKeys(source.raw) ? source.raw : raw,
    };

    const incidenciaId = getRelatedIncidenciaId(merged);
    const incidenciaPayload = buildIncidenciaPayload(merged);

    if (!incidenciaId) {
      return merged;
    }

    return {
      ...merged,

      ticketId: incidenciaId,
      incidenciaId,

      relatedTicketId: safeText(
        first(
          merged.relatedTicketId,
          raw.relatedTicketId,
          incidenciaId
        ),
        incidenciaId
      ),

      relatedIncidentId: safeText(
        first(
          merged.relatedIncidentId,
          raw.relatedIncidentId,
          incidenciaId
        ),
        incidenciaId
      ),

      supportTicketId: safeText(
        first(
          merged.supportTicketId,
          raw.supportTicketId,
          incidenciaId
        ),
        incidenciaId
      ),

      caseId: safeText(
        first(
          merged.caseId,
          raw.caseId,
          incidenciaId
        ),
        incidenciaId
      ),

      incidencia: incidenciaPayload,
      ticket: safeObject(first(merged.ticket, raw.ticket, incidenciaPayload)),
      linkedTicket: safeObject(first(merged.linkedTicket, raw.linkedTicket, incidenciaPayload)),

      relationType: safeText(
        first(
          merged.relationType,
          raw.relationType,
          incidenciaPayload?.relationType,
          "linked_ticket"
        ),
        "linked_ticket"
      ),

      meta: {
        ...safeObject(merged.meta),
        hasIncidencia: true,
        incidenciaId,
        ticketId: incidenciaId,
      },
    };
  }

  /* =====================================================
     CORE HELPERS
  ===================================================== */

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[FacturasView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[FacturasView]", ...args);
    } catch {}
  }

  function safeEmit(event = "", payload = {}) {
    const eventName = safeText(event, "");
    if (!eventName) return false;

    try {
      AppCore?.events?.emit?.(eventName, payload);
      return true;
    } catch {}

    try {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        })
      );

      return true;
    } catch {}

    return false;
  }

  function getContainer() {
    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      null
    );
  }

  function nextRenderToken() {
    renderToken += 1;
    return renderToken;
  }

  function isActiveToken(token) {
    return !destroyed && token === renderToken;
  }

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  function cleanupModalBindings() {
    try {
      modalBindingsCleanup?.();
    } catch {}

    modalBindingsCleanup = null;
  }

  function safeErrorMessage(error = null) {
    return safeText(
      first(
        error?.message,
        error?.response?.message,
        error?.response?.data?.message,
        error?.data?.message,
        "No se pudieron cargar las facturas."
      ),
      "No se pudieron cargar las facturas."
    );
  }

  function ensureBaseState() {
    if (!state.view) state.view = {};
    if (!state.detail) state.detail = {};
    if (!state.actions) state.actions = {};
    if (!state.inflight) state.inflight = {};

    const pageSize = clampNumber(
      first(
        state.view.pageSize,
        state.view.facturasPageSize,
        PAGE_SIZE
      ),
      1,
      100
    );

    const page = clampNumber(
      first(
        state.view.page,
        state.view.currentPage,
        state.view.facturasPage,
        1
      ),
      1,
      Number.MAX_SAFE_INTEGER
    );

    state.view.pageSize = pageSize;
    state.view.facturasPageSize = pageSize;

    state.view.page = page;
    state.view.currentPage = page;
    state.view.facturasPage = page;

    if (typeof state.view.error !== "string") {
      state.view.error = safeText(state.view.error, "");
    }
  }

  function getItems() {
    try {
      const storeItems = safeArray(getSortedFacturasStore());

      const rawById = new Map();

      storeItems.forEach((item) => {
        const id = getStableFacturaId(item);

        if (id && !rawById.has(id)) {
          rawById.set(id, safeObject(item.raw || item));
        }
      });

      return storeItems.map((item, index) => {
        const id = getStableFacturaId(item);

        const fallbackRaw =
          rawById.get(id) ||
          storeItems[index]?.raw ||
          storeItems[index] ||
          {};

        return preserveIncidenciaFields(item, fallbackRaw);
      });
    } catch (error) {
      safeWarn("getItems falló:", error);
      return [];
    }
  }

  /* =====================================================
     PAGINATION
  ===================================================== */

  function getPageSize() {
    ensureBaseState();

    return clampNumber(
      first(
        state.view.pageSize,
        state.view.facturasPageSize,
        PAGE_SIZE
      ),
      1,
      100
    );
  }

  function getCurrentPage() {
    ensureBaseState();

    return clampNumber(
      first(
        state.view.page,
        state.view.currentPage,
        state.view.facturasPage,
        1
      ),
      1,
      Number.MAX_SAFE_INTEGER
    );
  }

  function getTotalPages(items = []) {
    const rows = safeArray(items);
    const pageSize = getPageSize();

    return Math.max(
      1,
      Math.ceil((rows.length || 1) / pageSize)
    );
  }

  function setViewPage(page = 1) {
    ensureBaseState();

    const items = getItems();
    const totalPages = getTotalPages(items);
    const nextPage = clampNumber(page, 1, totalPages);

    state.view.page = nextPage;
    state.view.currentPage = nextPage;
    state.view.facturasPage = nextPage;

    state.view.pageSize = getPageSize();
    state.view.facturasPageSize = getPageSize();

    return nextPage;
  }

  function clampPageAgainstItems(items = []) {
    ensureBaseState();

    const totalPages = getTotalPages(items);
    const currentPage = getCurrentPage();
    const nextPage = clampNumber(currentPage, 1, totalPages);

    state.view.page = nextPage;
    state.view.currentPage = nextPage;
    state.view.facturasPage = nextPage;

    state.view.pageSize = getPageSize();
    state.view.facturasPageSize = getPageSize();

    return {
      page: nextPage,
      currentPage: nextPage,
      facturasPage: nextPage,
      pageSize: getPageSize(),
      facturasPageSize: getPageSize(),
      totalPages,
      totalCount: safeArray(items).length,
    };
  }

  function goToPage(page = 1) {
    if (isFacturasLoading(state) || isFacturasRefreshing(state)) {
      return getCurrentPage();
    }

    const nextPage = setViewPage(page);

    rerender();

    return nextPage;
  }

  function goPrevPage() {
    return goToPage(getCurrentPage() - 1);
  }

  function goNextPage() {
    return goToPage(getCurrentPage() + 1);
  }

  /* =====================================================
     TEMPLATE STATE
  ===================================================== */

  function getTemplateState() {
    ensureBaseState();

    return {
      ...getFacturasTemplateState(state),

      error: safeText(
        state?.view?.error,
        ""
      ),

      lastSyncAt:
        getFacturasLastSyncAt(state),

      selectedFacturaId: safeText(
        state?.view?.selectedFacturaId,
        ""
      ),

      page: getCurrentPage(),
      currentPage: getCurrentPage(),
      facturasPage: getCurrentPage(),

      pageSize: getPageSize(),
      facturasPageSize: getPageSize(),

      loading: isFacturasLoading(state),
      refreshing: isFacturasRefreshing(state),

      openingFacturaId: safeText(
        state?.actions?.openingFacturaId,
        ""
      ),

      viewingFacturaId: safeText(
        state?.actions?.viewingFacturaId,
        ""
      ),

      downloadingFacturaId: safeText(
        state?.actions?.downloadingFacturaId,
        ""
      ),

      sendingFacturaId: safeText(
        state?.actions?.sendingFacturaId,
        ""
      ),

      detailLoading: Boolean(
        state?.detail?.loading
      ),
    };
  }

  function getBindingState() {
    const templateState = getTemplateState();

    return {
      ...templateState,

      detailOpen:
        isFacturasDetailOpen(
          state
        ),

      bootstrapped:
        isFacturasBootstrapped(
          state
        ),

      view: {
        ...safeObject(state.view),
        page: getCurrentPage(),
        currentPage: getCurrentPage(),
        facturasPage: getCurrentPage(),
        pageSize: getPageSize(),
        facturasPageSize: getPageSize(),
      },

      actions: {
        ...safeObject(state.actions),
      },

      detail: {
        ...safeObject(state.detail),
      },
    };
  }

  function setDetail(data = null) {
    const patchedDetail = data
      ? preserveIncidenciaFields(data, data?.raw || data)
      : null;

    setFacturasDetailData(state, patchedDetail);
    setFacturasDetailOpen(state, Boolean(patchedDetail));
  }

  function closeDetail() {
    closeFacturasDetail(state);
    state.view.selectedFacturaId = "";
    renderDetailPortal();
  }

  /* =====================================================
     INCIDENCIA BRIDGE
  ===================================================== */

  function openIncidenciaBridge(ticketId = "") {
    const id = safeText(ticketId, "");

    if (!id) {
      showToast("No hay incidencia relacionada.", "error");
      return false;
    }

    safeEmit("facturas:incidencia:open", {
      ticketId: id,
      incidenciaId: id,
    });

    safeEmit("incidencias:modal:open-request", {
      ticketId: id,
      incidenciaId: id,
    });

    try {
      if (typeof window?.OnionIncidenciasModal?.openById === "function") {
        window.OnionIncidenciasModal.openById(id);
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.router?.navigate === "function") {
        AppCore.router.navigate("/incidencias", {
          state: {
            ticketId: id,
            openTicketId: id,
          },
        });

        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.Router?.navigate === "function") {
        AppCore.Router.navigate("/incidencias", {
          state: {
            ticketId: id,
            openTicketId: id,
          },
        });

        return true;
      }
    } catch {}

    try {
      if (typeof window !== "undefined") {
        window.location.hash = `#/incidencias?ticketId=${encodeURIComponent(id)}`;
        return true;
      }
    } catch {}

    showToast(`Incidencia relacionada: ${id}`, "info");
    return true;
  }

  /* =====================================================
     PORTAL MODAL
  ===================================================== */

  function getDetailRoot() {
    return document.getElementById(
      DETAIL_MODAL_ID
    );
  }

  function ensureDetailRoot() {
    let root = getDetailRoot();

    if (root) return root;

    root = document.createElement("div");
    root.id = DETAIL_MODAL_ID;

    document.body.appendChild(root);

    return root;
  }

  function destroyDetailRoot() {
    try {
      getDetailRoot()?.remove?.();
    } catch {}
  }

  function renderDetailPortal() {
    const root = ensureDetailRoot();

    const rawDetail = getFacturasDetailData(state);

    const detail = preserveIncidenciaFields(
      rawDetail || {},
      rawDetail?.raw || rawDetail || {}
    );

    const detailOpen =
      isFacturasDetailOpen(state);

    root.innerHTML =
      renderFacturasDetailModal({
        detailOpen,

        detailLoading: Boolean(
          state?.detail?.loading
        ),

        factura: detail,

        sendingFacturaId: safeText(
          state?.actions?.sendingFacturaId,
          ""
        ),

        viewingFacturaId: safeText(
          state?.actions?.viewingFacturaId,
          ""
        ),

        downloadingFacturaId: safeText(
          state?.actions?.downloadingFacturaId,
          ""
        ),
      });

    bindModalPortal();
  }

  function bindModalPortal() {
    cleanupModalBindings();

    const root = getDetailRoot();
    if (!root) return;

    const onClick = async (event) => {
      const closeAction = event.target.closest(
        '[data-action="close-factura-detail"]'
      );

      if (closeAction) {
        event.preventDefault();
        closeDetail();
        return;
      }

      const incidenciaBtn = event.target.closest(
        '[data-action="open-incidencia"]'
      );

      if (incidenciaBtn) {
        event.preventDefault();

        const ticketId = safeText(
          first(
            incidenciaBtn.dataset.ticketId,
            incidenciaBtn.dataset.incidenciaId,
            incidenciaBtn.getAttribute("data-ticket-id"),
            incidenciaBtn.getAttribute("data-incidencia-id")
          ),
          ""
        );

        openIncidenciaBridge(ticketId);
        return;
      }

      const pdfBtn = event.target.closest(
        '[data-action="view-factura-pdf"]'
      );

      if (pdfBtn) {
        event.preventDefault();

        const facturaId = safeText(
          pdfBtn.dataset.facturaId,
          ""
        );

        if (!facturaId) return;

        await openFacturaPdf(facturaId);
        return;
      }

      const downloadBtn = event.target.closest(
        '[data-action="download-factura"]'
      );

      if (downloadBtn) {
        event.preventDefault();

        const facturaId = safeText(
          downloadBtn.dataset.facturaId,
          ""
        );

        if (!facturaId) return;

        await downloadFacturaPdf(facturaId);
        return;
      }

      const sendBtn = event.target.closest(
        '[data-action="send-factura"]'
      );

      if (sendBtn) {
        event.preventDefault();

        const facturaId = safeText(
          sendBtn.dataset.facturaId,
          ""
        );

        if (!facturaId) return;

        await sendFacturaToClient(facturaId);
      }
    };

    const onKeydown = (event) => {
      if (!isFacturasDetailOpen(state)) return;
      if (event.key !== "Escape") return;

      event.preventDefault();
      closeDetail();
    };

    root.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeydown);

    modalBindingsCleanup = () => {
      try {
        root.removeEventListener("click", onClick);
      } catch {}

      try {
        document.removeEventListener("keydown", onKeydown);
      } catch {}
    };
  }

  /* =====================================================
     TEMPLATE
  ===================================================== */

  function renderBody({
    items = [],
    templateState = {},
  } = {}) {
    if (
      templateState.loading &&
      !items.length
    ) {
      return renderLoadingState();
    }

    if (
      templateState.error &&
      !items.length
    ) {
      return renderErrorState(
        templateState.error
      );
    }

    return renderCards({
      items,
      state: templateState,
    });
  }

  function buildHtml() {
    ensureBaseState();

    const items = getItems();
    const pagination = clampPageAgainstItems(items);

    const templateState = {
      ...getTemplateState(),
      ...pagination,
    };

    return `
      <section
        class="panel-content dashboard ready"
        data-facturas-scope="${escapeHtml(
          SCOPE
        )}"
      >
        <div
          class="content-wrapper"
          style="
            display:grid;
            gap:var(--space-lg);
          "
        >
          ${renderHeader({
            items,
            state: templateState,
          })}

          ${renderBody({
            items,
            templateState,
          })}
        </div>
      </section>
    `;
  }

  /* =====================================================
     RENDER
  ===================================================== */

  function render() {
    const container =
      getContainer();

    if (!container) return null;

    ensureBaseState();

    container.innerHTML =
      buildHtml();

    renderDetailPortal();

    setFacturasHydrated(
      state,
      true
    );

    return container;
  }

  function rerender() {
    if (destroyed) return null;

    const result = render();

    if (!destroyed) {
      bind();
    }

    return result;
  }

  function renderDetailOnly() {
    if (!isFacturasHydrated(state)) {
      return null;
    }

    renderDetailPortal();

    return true;
  }

  /* =====================================================
     DATA LOADERS
  ===================================================== */

  async function loadFacturas({
    force = false,
    silent = false,
    asRefresh = false,
  } = {}) {
    if (destroyed) return getItems();

    if (inflightLoad) {
      return inflightLoad;
    }

    inflightLoad = (async () => {
      const hasData =
        getItems().length > 0;

      clearFacturasError(state);

      setFacturasLoading(
        state,
        !hasData && !silent
      );

      setFacturasRefreshing(
        state,
        hasData && asRefresh
      );

      rerender();

      try {
        await loadFacturasCollection({
          state,
          render: () => {},
          silent,
          force,
        });

        setFacturasLoading(
          state,
          false
        );

        setFacturasRefreshing(
          state,
          false
        );

        setFacturasLoaded(
          state,
          true
        );

        setFacturasLastSyncAt(
          state,
          new Date().toISOString()
        );

        clampPageAgainstItems(getItems());

        return getItems();
      } catch (error) {
        setFacturasLoading(
          state,
          false
        );

        setFacturasRefreshing(
          state,
          false
        );

        state.view.error =
          safeErrorMessage(error);

        if (!silent) {
          showToast(
            safeErrorMessage(error),
            "error"
          );
        }

        return getItems();
      } finally {
        if (!destroyed) {
          rerender();
        }
      }
    })();

    try {
      return await inflightLoad;
    } finally {
      inflightLoad = null;
    }
  }

  async function loadFacturaDetail(
    id = ""
  ) {
    if (!id) return null;

    setFacturasDetailOpen(
      state,
      true
    );

    setFacturasDetailLoading(
      state,
      true
    );

    renderDetailOnly();

    try {
      const detail =
        await loadFacturaDetailById({
          state,
          render: () => {},
          facturaId: id,
          force: true,
        });

      const patchedDetail = detail
        ? preserveIncidenciaFields(detail, detail?.raw || detail)
        : null;

      setFacturasDetailLoading(
        state,
        false
      );

      if (patchedDetail) {
        setDetail(patchedDetail);
      }

      renderDetailOnly();

      return patchedDetail;
    } catch {
      setFacturasDetailLoading(
        state,
        false
      );

      renderDetailOnly();

      showToast(
        "No se pudo cargar detalle.",
        "error"
      );

      return null;
    }
  }

  /* =====================================================
     ACTIONS
  ===================================================== */

  async function openFactura(
    id = ""
  ) {
    const facturaId =
      safeText(id, "");

    if (!facturaId) return null;

    setFacturasOpeningFacturaId(
      state,
      facturaId
    );

    setFacturasDetailOpen(
      state,
      true
    );

    setFacturasDetailLoading(
      state,
      true
    );

    renderDetailOnly();

    try {
      const detail =
        await openFacturaAction({
          facturaId,
          loadFacturaDetail,
          preferFresh: true,
          silent: true,
        });

      const patchedDetail = detail
        ? preserveIncidenciaFields(detail, detail?.raw || detail)
        : null;

      if (!patchedDetail) {
        throw new Error();
      }

      setDetail(patchedDetail);

      safeEmit(
        "facturas:open:success",
        {
          facturaId,
          detail: patchedDetail,
        }
      );

      renderDetailOnly();

      return patchedDetail;
    } catch {
      showToast(
        "No se pudo abrir la factura.",
        "error"
      );

      return null;
    } finally {
      setFacturasOpeningFacturaId(
        state,
        ""
      );

      setFacturasDetailLoading(
        state,
        false
      );

      renderDetailOnly();
      rerender();
    }
  }

  async function openFacturaPdf(
    id = ""
  ) {
    return openFacturaPdfAction({
      facturaId: id,

      onStart(value) {
        setFacturasViewingFacturaId(
          state,
          value
        );

        renderDetailOnly();
        rerender();
      },

      onEnd() {
        setFacturasViewingFacturaId(
          state,
          ""
        );

        renderDetailOnly();
        rerender();
      },
    });
  }

  async function downloadFacturaPdf(
    id = ""
  ) {
    return downloadFacturaPdfAction({
      facturaId: id,

      onStart(value) {
        setFacturasDownloadingFacturaId(
          state,
          value
        );

        renderDetailOnly();
        rerender();
      },

      onEnd() {
        setFacturasDownloadingFacturaId(
          state,
          ""
        );

        renderDetailOnly();
        rerender();
      },
    });
  }

  async function sendFacturaToClient(
    id = ""
  ) {
    return sendFacturaToClientAction({
      facturaId: id,
      detail:
        getFacturasDetailData(state),

      onStart(value) {
        setFacturasSendingFacturaId(
          state,
          value
        );

        renderDetailOnly();
        rerender();
      },

      onEnd() {
        setFacturasSendingFacturaId(
          state,
          ""
        );

        renderDetailOnly();
        rerender();
      },
    });
  }

  function exportFacturasCsv() {
    return exportFacturasCsvAction({
      items: getItems(),
      filenamePrefix:
        "facturas",
    });
  }

  /* =====================================================
     BINDINGS
  ===================================================== */

  function bind() {
    cleanupBindings();

    if (destroyed) return;

    const cleanup =
      bindFacturasView({
        scopeName: SCOPE,

        getContainer,

        getState: getBindingState,

        render: rerender,

        loadFacturas,
        openFactura,
        openFacturaPdf,
        downloadFacturaPdf,
        sendFacturaToClient,
        closeDetail,
        exportFacturasCsv,

        openIncidencia: openIncidenciaBridge,
        openRelatedIncidencia: openIncidenciaBridge,

        goToPage,
        goPrevPage,
        goNextPage,

        setPage(page = 1) {
          setViewPage(page);
          rerender();
        },

        onBootstrap() {
          setFacturasBootstrapped(
            state,
            true
          );

          loadFacturas();
        },
      });

    bindingsCleanup =
      typeof cleanup ===
      "function"
        ? cleanup
        : null;
  }

  /* =====================================================
     LIFECYCLE
  ===================================================== */

  async function init() {
    if (
      initialized &&
      inflightInit
    ) {
      return inflightInit;
    }

    destroyed = false;
    initialized = true;

    inflightInit =
      (async () => {
        safeLog("init");

        ensureBaseState();

        const token =
          nextRenderToken();

        render();
        bind();

        await loadFacturas();

        if (
          isActiveToken(token)
        ) {
          bind();
        }

        return api;
      })();

    try {
      return await inflightInit;
    } finally {
      inflightInit = null;
    }
  }

  function destroy() {
    destroyed = true;
    initialized = false;

    nextRenderToken();

    cleanupBindings();
    cleanupModalBindings();

    closeFacturasDetail(state);

    clearFacturasActionIds(
      state
    );

    destroyDetailRoot();

    inflightLoad = null;

    safeLog("destroy");
  }

  /* =====================================================
     API
  ===================================================== */

  const api = {
    init,
    mount: init,
    unmount: destroy,
    destroy,

    render: rerender,

    loadFacturas,
    openFactura,
    openFacturaPdf,
    downloadFacturaPdf,
    sendFacturaToClient,
    closeDetail,
    exportFacturasCsv,

    openIncidencia: openIncidenciaBridge,
    openRelatedIncidencia: openIncidenciaBridge,

    goToPage,
    goPrevPage,
    goNextPage,

    getItems,

    getPagination() {
      const items = getItems();
      const pagination = clampPageAgainstItems(items);

      return {
        ...pagination,
        items,
      };
    },

    getState() {
      return {
        ...getBindingState(),
        initialized,
        destroyed,
        hasInflightInit: Boolean(inflightInit),
        hasInflightLoad: Boolean(inflightLoad),
      };
    },

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },
  };

  return api;
})();

export default FacturasView;
