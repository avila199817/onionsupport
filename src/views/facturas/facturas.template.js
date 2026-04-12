/* =========================================================
   Onion SPA - Facturas View (FULL PRO SAAS PANEL · GOD MODE)
   Archivo: src/views/facturas/index.js

   Responsabilidades:
   - montar la vista de facturas de extremo a extremo
   - cargar listado, stats y detalle
   - aplicar filtros y ordenación en cliente
   - bind de acciones reales: refresh / filter / sort / view / pdf / download / send
   - renderizar tabla/cards con facturas.template.js
   - abrir modal premium de detalle
   - usar showToast / Toast de forma consistente
   - integrarse con AppCore y Router
========================================================= */

import { AppCore } from "../../core/index.js";
import { Router } from "../../router/index.js";
import { Toast } from "../../ui/toast.js";

import {
  renderHeader,
  renderCards,
  renderLoadingState,
  renderErrorState,
} from "./facturas.template.js";

/* =========================================================
   VISTA
========================================================= */
export const FacturasView = (() => {
  "use strict";

  const SCOPE = "view:facturas";
  const API_BASE = "/facturas";

  const state = {
    mounted: false,
    loading: false,
    refreshing: false,
    error: "",
    items: [],
    filteredItems: [],
    stats: null,
    detail: null,
    detailLoading: false,
    remoteCount: 0,
    lastLoadedAt: null,

    filters: {
      query: "",
      estadoPago: "all",
      estado: "all",
      formaPago: "all",
    },

    sort: {
      field: "fecha",
      direction: "desc",
    },

    ui: {
      filtersOpen: false,
      sortOpen: false,
      detailOpen: false,
      sendingFacturaId: "",
      downloadingFacturaId: "",
      viewingFacturaId: "",
    },

    abortControllers: {
      list: null,
      stats: null,
      detail: null,
      file: null,
      send: null,
    },
  };

  /* =========================================================
     HELPERS BASE
  ========================================================= */
  function getContainer() {
    return AppCore?.dom?.viewContainer || null;
  }

  function safeText(value, fallback = "—") {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function escapeHtml(value = "") {
    if (AppCore?.utils?.escapeHtml) {
      return AppCore.utils.escapeHtml(String(value ?? ""));
    }

    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizeText(value = "") {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function showToast(message = "", type = "info") {
    const text = safeText(message, "Acción completada");

    try {
      if (typeof AppCore?.showToast === "function") {
        AppCore.showToast(text, type);
        return;
      }

      if (typeof Toast?.show === "function") {
        Toast.show({ message: text, type });
        return;
      }

      if (typeof Toast === "function") {
        Toast({ message: text, type });
        return;
      }
    } catch (error) {
      console.warn("[FacturasView] showToast fallback", error);
    }

    console.log(`[${type.toUpperCase()}] ${text}`);
  }

  function getToken() {
    return (
      safeText(AppCore?.state?.token, "") ||
      safeText(AppCore?.session?.token, "") ||
      safeText(AppCore?.getToken?.(), "")
    );
  }

  function getApiBase() {
    return safeText(AppCore?.config?.apiBase, "");
  }

  function buildApiUrl(pathname = "") {
    const base = getApiBase();
    const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
    return `${base}${path}`;
  }

  function getHeaders(extra = {}) {
    const headers = {
      Accept: "application/json",
      ...extra,
    };

    const token = getToken();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  function abortControllerByKey(key) {
    if (state.abortControllers[key]) {
      try {
        state.abortControllers[key].abort();
      } catch {}
    }

    state.abortControllers[key] = new AbortController();
    return state.abortControllers[key];
  }

  function clearAbortController(key) {
    state.abortControllers[key] = null;
  }

  function setLoading(value) {
    state.loading = Boolean(value);
  }

  function setRefreshing(value) {
    state.refreshing = Boolean(value);
  }

  function setError(message = "") {
    state.error = safeText(message, "");
  }

  function setDetailOpen(value) {
    state.ui.detailOpen = Boolean(value);
  }

  function closeMenus() {
    state.ui.filtersOpen = false;
    state.ui.sortOpen = false;
  }

  /* =========================================================
     FORMATTERS
  ========================================================= */
  function formatMoney(value, currency = "EUR") {
    const amount = safeNumber(value, 0);
    const code = safeText(currency, "EUR") || "EUR";

    try {
      return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: code,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${code}`;
    }
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  /* =========================================================
     NORMALIZACIÓN DE DATOS
  ========================================================= */
  function normalizeFactura(raw = {}) {
    const clienteNombre =
      safeText(raw?.cliente?.empresa, "") ||
      safeText(raw?.cliente?.nombre, "") ||
      safeText(raw?.cliente?.nombreContacto, "") ||
      safeText(raw?.owner?.name, "") ||
      "Cliente";

    const clienteEmail =
      safeText(raw?.cliente?.email, "") ||
      safeText(raw?.emailCliente, "") ||
      safeText(raw?.owner?.email, "");

    const initials =
      safeText(raw?.cliente?.initials, "") ||
      clienteNombre
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((chunk) => chunk.charAt(0).toUpperCase())
        .join("") ||
      "ON";

    return {
      id: safeText(raw.id, ""),
      numero:
        safeText(raw.numero, "") ||
        safeText(raw.numeroFacturaLegal, "") ||
        safeText(raw.numeroFacturaSistema, "") ||
        safeText(raw.id, "—"),
      fecha:
        safeText(raw.fecha, "") ||
        safeText(raw.fechaFactura, "") ||
        null,
      fechaEnvio: safeText(raw.fechaEnvio, "") || null,
      fechaServicio: safeText(raw.fechaServicio, "") || null,

      estado: safeText(raw.estado, "emitida"),
      estadoPago: safeText(raw.estadoPago, "pending"),
      estadoDetalle: safeText(raw.estadoDetalle, ""),

      moneda: safeText(raw.moneda, "EUR"),
      total: safeNumber(raw.total, 0),
      baseImponible: safeNumber(raw.baseImponible, 0),
      subtotal: safeNumber(raw.subtotal, 0),
      descuentoTotal: safeNumber(raw.descuentoTotal, 0),
      impuestosTotal: safeNumber(raw.impuestosTotal, 0),

      formaPago:
        safeText(raw.formaPago, "") ||
        safeText(raw.metodoPago, "") ||
        "—",

      cuentaPago: safeText(raw.cuentaPago, "") || "",
      blobPath: safeText(raw.blobPath, "") || "",
      pdfAvailable: Boolean(raw.pdfAvailable || raw.blobPath),

      preview:
        safeText(raw.preview, "") ||
        safeText(raw.descripcion, "") ||
        safeText(raw.concepto, "") ||
        "Documento fiscal disponible para consulta.",

      attachmentsCount: safeNumber(raw.attachmentsCount, 0),
      updatedAt: safeText(raw.updatedAt, "") || safeText(raw.createdAt, "") || "",

      clienteId: safeText(raw.clienteId, "") || safeText(raw?.cliente?.id, "") || "",
      cliente: {
        id: safeText(raw?.cliente?.id, "") || safeText(raw.clienteId, "") || "",
        nombre:
          safeText(raw?.cliente?.nombre, "") ||
          safeText(raw?.cliente?.nombreContacto, "") ||
          clienteNombre,
        empresa:
          safeText(raw?.cliente?.empresa, "") ||
          safeText(raw?.cliente?.razonSocial, "") ||
          clienteNombre,
        email: clienteEmail,
        initials,
        avatar: safeText(raw?.cliente?.avatar, "") || null,
        telefono: safeText(raw?.cliente?.telefono, "") || "",
        nif: safeText(raw?.cliente?.nif, "") || "",
        direccion: {
          calle: safeText(raw?.cliente?.direccion?.calle, ""),
          linea2: safeText(raw?.cliente?.direccion?.linea2, ""),
          cp: safeText(raw?.cliente?.direccion?.cp, ""),
          ciudad: safeText(raw?.cliente?.direccion?.ciudad, ""),
          provincia: safeText(raw?.cliente?.direccion?.provincia, ""),
          pais: safeText(raw?.cliente?.direccion?.pais, ""),
        },
      },

      concepto: safeText(raw.concepto, "Factura"),
      descripcion: safeText(raw.descripcion, ""),
      lineas: safeArray(raw.lineas).map((linea, index) => ({
        id: safeText(linea?.id, "") || `linea-${index + 1}`,
        concepto: safeText(linea?.concepto, ""),
        descripcion: safeText(linea?.descripcion, ""),
        cantidad: safeNumber(linea?.cantidad, 0),
        precioUnitario: safeNumber(linea?.precioUnitario, 0),
        subtotal: safeNumber(linea?.subtotal, 0),
        impuesto: safeNumber(linea?.impuesto, 0),
        descuento: safeNumber(linea?.descuento, 0),
        totalLinea: safeNumber(linea?.totalLinea, 0),
      })),

      impuestos: safeArray(raw.impuestos).map((item) => ({
        tipo: safeText(item?.tipo, ""),
        nombre: safeText(item?.nombre, "") || safeText(item?.tipo, ""),
        porcentaje: safeNumber(item?.porcentaje, 0),
        base: safeNumber(item?.base, 0),
        importe: safeNumber(item?.importe, 0),
      })),

      notas: safeText(raw.notas, "") || "",
      createdAt: safeText(raw.createdAt, "") || "",
      updatedBy: safeText(raw.updatedBy, "") || "",
      createdBy: safeText(raw.createdBy, "") || "",
      enviadoA: safeText(raw.enviadoA, "") || "",
      sendHistory: safeArray(raw.sendHistory),
      owner: {
        id: safeText(raw?.owner?.id, ""),
        name: safeText(raw?.owner?.name, ""),
        email: safeText(raw?.owner?.email, ""),
        avatar: safeText(raw?.owner?.avatar, "") || null,
      },
    };
  }

  function normalizeListResponse(payload = {}) {
    const rawItems =
      safeArray(payload.items) ||
      safeArray(payload.facturas) ||
      safeArray(payload.data) ||
      [];

    return rawItems.map(normalizeFactura);
  }

  /* =========================================================
     FILTROS Y ORDEN
  ========================================================= */
  function applyFilters(items = []) {
    const query = normalizeText(state.filters.query);
    const estadoPago = normalizeText(state.filters.estadoPago);
    const estado = normalizeText(state.filters.estado);
    const formaPago = normalizeText(state.filters.formaPago);

    return items.filter((item) => {
      const matchQuery =
        !query ||
        normalizeText(item.numero).includes(query) ||
        normalizeText(item.cliente?.empresa).includes(query) ||
        normalizeText(item.cliente?.nombre).includes(query) ||
        normalizeText(item.cliente?.email).includes(query) ||
        normalizeText(item.concepto).includes(query);

      const matchEstadoPago =
        !estadoPago ||
        estadoPago === "all" ||
        normalizeText(item.estadoPago) === estadoPago;

      const matchEstado =
        !estado ||
        estado === "all" ||
        normalizeText(item.estado) === estado;

      const matchFormaPago =
        !formaPago ||
        formaPago === "all" ||
        normalizeText(item.formaPago) === formaPago;

      return matchQuery && matchEstadoPago && matchEstado && matchFormaPago;
    });
  }

  function sortItems(items = []) {
    const cloned = [...items];
    const field = safeText(state.sort.field, "fecha");
    const direction = state.sort.direction === "asc" ? 1 : -1;

    cloned.sort((a, b) => {
      if (field === "cliente") {
        return (
          normalizeText(a?.cliente?.empresa || a?.cliente?.nombre).localeCompare(
            normalizeText(b?.cliente?.empresa || b?.cliente?.nombre),
            "es"
          ) * direction
        );
      }

      if (field === "total") {
        return (safeNumber(a?.total, 0) - safeNumber(b?.total, 0)) * direction;
      }

      if (field === "updatedAt" || field === "fecha") {
        return (
          (new Date(a?.[field] || 0).getTime() -
            new Date(b?.[field] || 0).getTime()) *
          direction
        );
      }

      return (
        normalizeText(a?.[field]).localeCompare(normalizeText(b?.[field]), "es") *
        direction
      );
    });

    return cloned;
  }

  function syncDerivedState() {
    state.filteredItems = sortItems(applyFilters(state.items));
  }

  /* =========================================================
     HTTP
  ========================================================= */
  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "include",
      ...options,
      headers: {
        ...getHeaders(options.headers || {}),
      },
    });

    let payload = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message =
        safeText(payload?.error, "") ||
        safeText(payload?.message, "") ||
        `HTTP_${response.status}`;

      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload || {};
  }

  /* =========================================================
     API
  ========================================================= */
  async function fetchFacturasList({ silent = false } = {}) {
    const controller = abortControllerByKey("list");

    if (!silent) {
      setLoading(true);
      setError("");
      render();
    }

    try {
      const payload = await requestJson(buildApiUrl(API_BASE), {
        method: "GET",
        signal: controller.signal,
      });

      state.items = normalizeListResponse(payload);
      state.remoteCount = safeNumber(
        payload?.count,
        safeNumber(payload?.remoteCount, state.items.length)
      );

      syncDerivedState();
      state.lastLoadedAt = new Date().toISOString();

      return state.items;
    } finally {
      setLoading(false);
      clearAbortController("list");
    }
  }

  async function fetchFacturasStats({ silent = true } = {}) {
    const controller = abortControllerByKey("stats");

    try {
      const payload = await requestJson(buildApiUrl(`${API_BASE}/stats`), {
        method: "GET",
        signal: controller.signal,
      });

      state.stats = payload?.stats || null;
      return state.stats;
    } catch (error) {
      if (!silent) {
        throw error;
      }

      console.warn("[FacturasView] stats fallback", error);
      return null;
    } finally {
      clearAbortController("stats");
    }
  }

  async function fetchFacturaDetail(facturaId = "") {
    const id = safeText(facturaId, "");
    if (!id) return null;

    const controller = abortControllerByKey("detail");
    state.detailLoading = true;
    renderDetail();

    try {
      const payload = await requestJson(
        buildApiUrl(`${API_BASE}/${encodeURIComponent(id)}`),
        {
          method: "GET",
          signal: controller.signal,
        }
      );

      state.detail = normalizeFactura(payload?.factura || {});
      setDetailOpen(true);
      renderDetail();

      return state.detail;
    } finally {
      state.detailLoading = false;
      clearAbortController("detail");
    }
  }

  async function fetchFacturaFileUrl(facturaId = "", mode = "attachment") {
    const id = safeText(facturaId, "");
    if (!id) {
      throw new Error("FACTURA_ID_REQUIRED");
    }

    const controller = abortControllerByKey("file");
    const endpoint =
      mode === "inline"
        ? `${API_BASE}/${encodeURIComponent(id)}/pdf?disposition=inline`
        : `${API_BASE}/${encodeURIComponent(id)}/descargar?disposition=attachment`;

    try {
      const payload = await requestJson(buildApiUrl(endpoint), {
        method: "GET",
        signal: controller.signal,
      });

      const url = safeText(payload?.file?.url, "");

      if (!url) {
        throw new Error("FACTURA_FILE_URL_MISSING");
      }

      return payload;
    } finally {
      clearAbortController("file");
    }
  }

  async function sendFactura(facturaId = "") {
    const id = safeText(facturaId, "");
    if (!id) {
      throw new Error("FACTURA_ID_REQUIRED");
    }

    const controller = abortControllerByKey("send");

    try {
      const payload = await requestJson(
        buildApiUrl(`${API_BASE}/${encodeURIComponent(id)}/enviar`),
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      return payload;
    } finally {
      clearAbortController("send");
    }
  }

  /* =========================================================
     RENDER BASE
  ========================================================= */
  function render() {
    const container = getContainer();
    if (!container) return;

    const items = state.filteredItems;
    const headerState = {
      loading: state.loading,
      refreshing: state.refreshing,
      remoteCount: state.remoteCount || state.items.length,
    };

    const toolbarPanels = renderTopPanels();
    const detailModal = renderDetailModal();

    let bodyHtml = "";

    if (state.loading && !state.items.length) {
      bodyHtml = renderLoadingState();
    } else if (state.error && !state.items.length) {
      bodyHtml = renderErrorState(state.error);
    } else {
      bodyHtml = renderCards({
        items,
        state: {
          loading: state.loading,
          refreshing: state.refreshing,
          error: state.error,
          remoteCount: state.remoteCount || items.length,
        },
      });
    }

    container.innerHTML = `
      <section class="view-shell view-facturas" data-scope="${escapeHtml(SCOPE)}">
        <div class="view-stack" style="display:grid; gap:var(--space-lg);">
          ${renderHeader({ items, state: headerState })}
          ${toolbarPanels}
          ${bodyHtml}
        </div>

        ${detailModal}
      </section>
    `;

    bindDom();
  }

  function renderTopPanels() {
    return `
      <div style="display:grid; gap:var(--space-md);">
        ${renderFilterPanel()}
        ${renderSortPanel()}
      </div>
    `;
  }

  function renderFilterPanel() {
    const open = state.ui.filtersOpen;

    return `
      <section
        class="panel-surface facturas-filters-panel"
        style="
          display:${open ? "block" : "none"};
          padding:var(--space-lg);
          border-radius:var(--panel-radius);
        "
      >
        <div style="display:grid; gap:var(--space-md);">
          <div style="display:grid; gap:6px;">
            <h3 style="margin:0; font-size:var(--font-lg); color:var(--text-strong);">
              Filtros
            </h3>
            <p style="margin:0; font-size:var(--font-sm); color:var(--text-dim);">
              Ajusta el listado por búsqueda, estado de pago, estado y método de pago.
            </p>
          </div>

          <div
            style="
              display:grid;
              grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
              gap:var(--space-md);
            "
          >
            ${renderInputField({
              label: "Buscar",
              inputId: "facturas-filter-query",
              value: state.filters.query,
              placeholder: "Cliente, factura, email...",
            })}

            ${renderSelectField({
              label: "Estado pago",
              inputId: "facturas-filter-estado-pago",
              value: state.filters.estadoPago,
              options: [
                ["all", "Todos"],
                ["paid", "Pagadas"],
                ["pending", "Pendientes"],
                ["overdue", "Vencidas"],
                ["cancelled", "Canceladas"],
                ["draft", "Borrador"],
              ],
            })}

            ${renderSelectField({
              label: "Estado",
              inputId: "facturas-filter-estado",
              value: state.filters.estado,
              options: [
                ["all", "Todos"],
                ["emitida", "Emitida"],
                ["borrador", "Borrador"],
                ["cancelada", "Cancelada"],
              ],
            })}

            ${renderInputField({
              label: "Forma pago",
              inputId: "facturas-filter-forma-pago",
              value: state.filters.formaPago === "all" ? "" : state.filters.formaPago,
              placeholder: "Tarjeta, transferencia...",
            })}
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button
              type="button"
              data-action="apply-filters"
              style="
                min-height:40px;
                padding:0 14px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-primary-border);
                background:var(--btn-primary-bg);
                color:var(--btn-primary-text);
                font-weight:var(--weight-bold);
                cursor:pointer;
              "
            >
              Aplicar filtros
            </button>

            <button
              type="button"
              data-action="reset-filters"
              style="
                min-height:40px;
                padding:0 14px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-secondary-border);
                background:var(--btn-secondary-bg);
                color:var(--btn-secondary-text);
                font-weight:var(--weight-bold);
                cursor:pointer;
              "
            >
              Limpiar
            </button>
          </div>
        </div>
      </section>
    `;
  }

  function renderSortPanel() {
    const open = state.ui.sortOpen;

    return `
      <section
        class="panel-surface facturas-sort-panel"
        style="
          display:${open ? "block" : "none"};
          padding:var(--space-lg);
          border-radius:var(--panel-radius);
        "
      >
        <div style="display:grid; gap:var(--space-md);">
          <div style="display:grid; gap:6px;">
            <h3 style="margin:0; font-size:var(--font-lg); color:var(--text-strong);">
              Ordenación
            </h3>
            <p style="margin:0; font-size:var(--font-sm); color:var(--text-dim);">
              Define cómo quieres ver la colección actual.
            </p>
          </div>

          <div
            style="
              display:grid;
              grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
              gap:var(--space-md);
            "
          >
            ${renderSelectField({
              label: "Campo",
              inputId: "facturas-sort-field",
              value: state.sort.field,
              options: [
                ["fecha", "Fecha"],
                ["updatedAt", "Última actividad"],
                ["total", "Importe"],
                ["cliente", "Cliente"],
              ],
            })}

            ${renderSelectField({
              label: "Dirección",
              inputId: "facturas-sort-direction",
              value: state.sort.direction,
              options: [
                ["desc", "Descendente"],
                ["asc", "Ascendente"],
              ],
            })}
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button
              type="button"
              data-action="apply-sort"
              style="
                min-height:40px;
                padding:0 14px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-primary-border);
                background:var(--btn-primary-bg);
                color:var(--btn-primary-text);
                font-weight:var(--weight-bold);
                cursor:pointer;
              "
            >
              Aplicar orden
            </button>
          </div>
        </div>
      </section>
    `;
  }

  function renderInputField({
    label = "",
    inputId = "",
    value = "",
    placeholder = "",
  } = {}) {
    return `
      <label style="display:grid; gap:8px;">
        <span style="font-size:var(--font-sm); color:var(--text-dim); font-weight:var(--weight-semibold);">
          ${escapeHtml(label)}
        </span>
        <input
          id="${escapeHtml(inputId)}"
          type="text"
          value="${escapeHtml(value)}"
          placeholder="${escapeHtml(placeholder)}"
          style="
            min-height:46px;
            padding:0 14px;
            border-radius:var(--input-radius);
            border:1px solid var(--input-border);
            background:var(--input-bg);
            color:var(--input-text);
            outline:none;
          "
        />
      </label>
    `;
  }

  function renderSelectField({
    label = "",
    inputId = "",
    value = "",
    options = [],
  } = {}) {
    return `
      <label style="display:grid; gap:8px;">
        <span style="font-size:var(--font-sm); color:var(--text-dim); font-weight:var(--weight-semibold);">
          ${escapeHtml(label)}
        </span>
        <select
          id="${escapeHtml(inputId)}"
          style="
            min-height:46px;
            padding:0 14px;
            border-radius:var(--input-radius);
            border:1px solid var(--input-border);
            background:var(--input-bg);
            color:var(--input-text);
            outline:none;
          "
        >
          ${options
            .map(
              ([optionValue, optionLabel]) => `
                <option
                  value="${escapeHtml(optionValue)}"
                  ${String(optionValue) === String(value) ? "selected" : ""}
                >
                  ${escapeHtml(optionLabel)}
                </option>
              `
            )
            .join("")}
        </select>
      </label>
    `;
  }

  /* =========================================================
     DETALLE MODAL
  ========================================================= */
  function renderDetailModal() {
    if (!state.ui.detailOpen) {
      return "";
    }

    const factura = state.detail;
    const loading = state.detailLoading;

    return `
      <div
        class="facturas-detail-overlay"
        data-action="close-detail"
        style="
          position:fixed;
          inset:0;
          z-index:var(--z-modal);
          background:var(--backdrop-bg);
          display:grid;
          place-items:center;
          padding:24px;
        "
      >
        <div
          class="facturas-detail-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Detalle de factura"
          style="
            width:min(1080px, 100%);
            max-height:min(90vh, 920px);
            overflow:auto;
            border-radius:var(--modal-radius);
            border:1px solid var(--border-soft);
            background:var(--modal-bg);
            box-shadow:var(--shadow-lg);
          "
          onclick="event.stopPropagation()"
        >
          ${
            loading
              ? `
                <div style="padding:24px; display:grid; gap:16px;">
                  <div style="height:30px; width:220px; border-radius:12px; background:var(--surface-glass);"></div>
                  <div style="height:90px; border-radius:18px; background:var(--surface-glass);"></div>
                  <div style="height:220px; border-radius:18px; background:var(--surface-glass);"></div>
                </div>
              `
              : renderDetailContent(factura)
          }
        </div>
      </div>
    `;
  }

  function renderDetailContent(factura = null) {
    if (!factura) {
      return `
        <div style="padding:24px;">
          <p style="margin:0; color:var(--text-dim);">No hay detalle disponible.</p>
        </div>
      `;
    }

    const lineas = safeArray(factura.lineas);
    const impuestos = safeArray(factura.impuestos);
    const sending = state.ui.sendingFacturaId === factura.id;

    return `
      <div style="display:grid; gap:var(--space-lg); padding:24px;">
        <div
          style="
            display:flex;
            justify-content:space-between;
            gap:16px;
            align-items:flex-start;
            flex-wrap:wrap;
          "
        >
          <div style="display:grid; gap:8px;">
            <span
              style="
                display:inline-flex;
                align-items:center;
                min-height:28px;
                padding:0 10px;
                border-radius:999px;
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-dim);
                font-size:12px;
                font-weight:var(--weight-bold);
                letter-spacing:.05em;
                text-transform:uppercase;
                width:max-content;
              "
            >
              Factura ${escapeHtml(factura.numero)}
            </span>

            <h2
              style="
                margin:0;
                font-size:clamp(26px, 4vw, 36px);
                line-height:1.05;
                color:var(--text-strong);
                letter-spacing:-.03em;
              "
            >
              ${escapeHtml(factura.cliente?.empresa || factura.cliente?.nombre || "Cliente")}
            </h2>

            <p style="margin:0; color:var(--text-muted);">
              ${escapeHtml(factura.preview || "Documento fiscal listo para consulta.")}
            </p>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button
              type="button"
              data-action="view-factura-pdf"
              data-factura-id="${escapeHtml(factura.id)}"
              style="
                min-height:40px;
                padding:0 14px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-secondary-border);
                background:var(--btn-secondary-bg);
                color:var(--btn-secondary-text);
                font-weight:var(--weight-bold);
                cursor:pointer;
              "
            >
              Ver PDF
            </button>

            <button
              type="button"
              data-action="download-factura"
              data-factura-id="${escapeHtml(factura.id)}"
              style="
                min-height:40px;
                padding:0 14px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-primary-border);
                background:var(--btn-primary-bg);
                color:var(--btn-primary-text);
                font-weight:var(--weight-bold);
                cursor:pointer;
              "
            >
              Descargar
            </button>

            <button
              type="button"
              data-action="send-factura"
              data-factura-id="${escapeHtml(factura.id)}"
              style="
                min-height:40px;
                padding:0 14px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-secondary-border);
                background:var(--btn-secondary-bg);
                color:var(--btn-secondary-text);
                font-weight:var(--weight-bold);
                cursor:pointer;
              "
            >
              ${sending ? "Enviando..." : "Enviar"}
            </button>

            <button
              type="button"
              data-action="close-detail"
              style="
                min-height:40px;
                padding:0 14px;
                border-radius:var(--btn-radius);
                border:1px solid var(--border-soft);
                background:var(--surface-glass);
                color:var(--text-soft);
                font-weight:var(--weight-bold);
                cursor:pointer;
              "
            >
              Cerrar
            </button>
          </div>
        </div>

        <div
          style="
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
            gap:var(--space-md);
          "
        >
          ${renderDetailStat("Fecha", formatDate(factura.fecha))}
          ${renderDetailStat("Estado pago", safeText(factura.estadoPago, "—"))}
          ${renderDetailStat("Estado", safeText(factura.estado, "—"))}
          ${renderDetailStat("Método pago", safeText(factura.formaPago, "—"))}
          ${renderDetailStat("Total", formatMoney(factura.total, factura.moneda))}
          ${renderDetailStat("Base", formatMoney(factura.baseImponible, factura.moneda))}
        </div>

        <div
          style="
            display:grid;
            grid-template-columns:1.15fr .85fr;
            gap:var(--space-lg);
          "
          class="facturas-detail-grid"
        >
          <section
            class="panel-surface"
            style="padding:20px; border-radius:var(--panel-radius);"
          >
            <div style="display:grid; gap:var(--space-md);">
              <div>
                <h3 style="margin:0 0 6px; color:var(--text-strong);">Líneas</h3>
                <p style="margin:0; color:var(--text-dim); font-size:var(--font-sm);">
                  Desglose principal del documento.
                </p>
              </div>

              ${
                lineas.length
                  ? `
                    <div style="display:grid; gap:12px;">
                      ${lineas
                        .map(
                          (linea) => `
                            <article
                              style="
                                display:grid;
                                gap:10px;
                                padding:16px;
                                border-radius:18px;
                                border:1px solid var(--border-soft);
                                background:var(--surface-glass);
                              "
                            >
                              <div
                                style="
                                  display:flex;
                                  justify-content:space-between;
                                  gap:12px;
                                  align-items:flex-start;
                                  flex-wrap:wrap;
                                "
                              >
                                <div style="display:grid; gap:4px;">
                                  <strong style="color:var(--text-strong); font-size:var(--font-base);">
                                    ${escapeHtml(linea.concepto || "Línea")}
                                  </strong>
                                  <span style="color:var(--text-dim); font-size:var(--font-sm);">
                                    ${escapeHtml(linea.descripcion || "Sin descripción")}
                                  </span>
                                </div>

                                <strong style="color:var(--text-strong); font-size:var(--font-lg);">
                                  ${escapeHtml(formatMoney(linea.totalLinea, factura.moneda))}
                                </strong>
                              </div>

                              <div
                                style="
                                  display:grid;
                                  grid-template-columns:repeat(auto-fit, minmax(120px,1fr));
                                  gap:10px;
                                "
                              >
                                ${renderMiniMeta("Cantidad", String(linea.cantidad))}
                                ${renderMiniMeta("Unitario", formatMoney(linea.precioUnitario, factura.moneda))}
                                ${renderMiniMeta("Subtotal", formatMoney(linea.subtotal, factura.moneda))}
                                ${renderMiniMeta("Impuesto", formatMoney(linea.impuesto, factura.moneda))}
                              </div>
                            </article>
                          `
                        )
                        .join("")}
                    </div>
                  `
                  : `
                    <p style="margin:0; color:var(--text-dim);">No hay líneas disponibles.</p>
                  `
              }
            </div>
          </section>

          <div style="display:grid; gap:var(--space-lg);">
            <section
              class="panel-surface"
              style="padding:20px; border-radius:var(--panel-radius);"
            >
              <div style="display:grid; gap:var(--space-md);">
                <div>
                  <h3 style="margin:0 0 6px; color:var(--text-strong);">Cliente</h3>
                  <p style="margin:0; color:var(--text-dim); font-size:var(--font-sm);">
                    Datos de facturación del destinatario.
                  </p>
                </div>

                ${renderMiniMeta("Empresa", factura.cliente?.empresa || factura.cliente?.nombre || "—")}
                ${renderMiniMeta("Email", factura.cliente?.email || "—")}
                ${renderMiniMeta("NIF", factura.cliente?.nif || "—")}
                ${renderMiniMeta("Teléfono", factura.cliente?.telefono || "—")}
                ${renderMiniMeta(
                  "Dirección",
                  [
                    factura.cliente?.direccion?.calle,
                    factura.cliente?.direccion?.cp,
                    factura.cliente?.direccion?.ciudad,
                    factura.cliente?.direccion?.provincia,
                    factura.cliente?.direccion?.pais,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"
                )}
              </div>
            </section>

            <section
              class="panel-surface"
              style="padding:20px; border-radius:var(--panel-radius);"
            >
              <div style="display:grid; gap:var(--space-md);">
                <div>
                  <h3 style="margin:0 0 6px; color:var(--text-strong);">Resumen</h3>
                  <p style="margin:0; color:var(--text-dim); font-size:var(--font-sm);">
                    Totales y trazabilidad.
                  </p>
                </div>

                ${renderMiniMeta("Subtotal", formatMoney(factura.subtotal || factura.baseImponible, factura.moneda))}
                ${renderMiniMeta("Impuestos", formatMoney(factura.impuestosTotal, factura.moneda))}
                ${renderMiniMeta("Descuento", formatMoney(factura.descuentoTotal, factura.moneda))}
                ${renderMiniMeta("Total", formatMoney(factura.total, factura.moneda))}
                ${renderMiniMeta("Actualizado", formatDateTime(factura.updatedAt))}
                ${renderMiniMeta("Enviado a", factura.enviadoA || "—")}

                ${
                  impuestos.length
                    ? `
                      <div style="display:grid; gap:10px;">
                        <strong style="color:var(--text-strong);">Impuestos</strong>
                        ${impuestos
                          .map(
                            (item) => `
                              <div
                                style="
                                  display:flex;
                                  justify-content:space-between;
                                  gap:12px;
                                  padding:12px;
                                  border-radius:14px;
                                  border:1px solid var(--border-soft);
                                  background:var(--surface-glass);
                                "
                              >
                                <span style="color:var(--text-soft);">
                                  ${escapeHtml(item.nombre || item.tipo || "Impuesto")} · ${escapeHtml(String(item.porcentaje || 0))}%
                                </span>
                                <strong style="color:var(--text-strong);">
                                  ${escapeHtml(formatMoney(item.importe, factura.moneda))}
                                </strong>
                              </div>
                            `
                          )
                          .join("")}
                      </div>
                    `
                    : ""
                }
              </div>
            </section>
          </div>
        </div>
      </div>

      <style>
        @media (max-width: 980px) {
          .facturas-detail-grid {
            grid-template-columns: 1fr !important;
          }
        }
      </style>
    `;
  }

  function renderDetailStat(label = "", value = "") {
    return `
      <article
        style="
          display:grid;
          gap:6px;
          min-height:96px;
          padding:16px;
          border-radius:20px;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
        "
      >
        <span
          style="
            font-size:12px;
            color:var(--text-dim);
            font-weight:var(--weight-bold);
            letter-spacing:.05em;
            text-transform:uppercase;
          "
        >
          ${escapeHtml(label)}
        </span>

        <strong
          style="
            font-size:var(--font-xl);
            line-height:1.1;
            color:var(--text-strong);
            font-weight:var(--weight-black);
          "
        >
          ${escapeHtml(value)}
        </strong>
      </article>
    `;
  }

  function renderMiniMeta(label = "", value = "") {
    return `
      <div
        style="
          display:grid;
          gap:4px;
          padding:12px;
          border-radius:14px;
          border:1px solid var(--border-soft);
          background:var(--surface-glass);
        "
      >
        <span
          style="
            font-size:11px;
            color:var(--text-faint);
            font-weight:var(--weight-bold);
            letter-spacing:.04em;
            text-transform:uppercase;
          "
        >
          ${escapeHtml(label)}
        </span>

        <span style="color:var(--text-strong); font-weight:var(--weight-semibold);">
          ${escapeHtml(value)}
        </span>
      </div>
    `;
  }

  function renderDetail() {
    const container = getContainer();
    if (!container) return;

    const existing = container.querySelector(".facturas-detail-overlay");
    if (existing) {
      existing.remove();
    }

    const html = renderDetailModal();
    if (!html) return;

    container.insertAdjacentHTML("beforeend", html);
    bindDom();
  }

  /* =========================================================
     BINDINGS
  ========================================================= */
  function bindDom() {
    const container = getContainer();
    if (!container) return;

    const scope = container.querySelector(`[data-scope="${SCOPE}"]`);
    if (!scope) return;

    if (scope.dataset.bound === "true") return;
    scope.dataset.bound = "true";

    scope.addEventListener("click", handleClick);
    scope.addEventListener("change", handleChange);
    scope.addEventListener("input", handleInput);

    document.addEventListener("keydown", handleKeydown, { passive: false });
  }

  function unbindDom() {
    const container = getContainer();
    if (!container) return;

    const scope = container.querySelector(`[data-scope="${SCOPE}"]`);
    if (scope) {
      scope.removeEventListener("click", handleClick);
      scope.removeEventListener("change", handleChange);
      scope.removeEventListener("input", handleInput);
      delete scope.dataset.bound;
    }

    document.removeEventListener("keydown", handleKeydown, { passive: false });
  }

  function handleKeydown(event) {
    if (!state.mounted) return;

    if (event.key === "Escape") {
      if (state.ui.detailOpen) {
        event.preventDefault();
        handleCloseDetail();
        return;
      }

      if (state.ui.filtersOpen || state.ui.sortOpen) {
        event.preventDefault();
        closeMenus();
        render();
      }
    }
  }

  function handleClick(event) {
    const actionTarget = event.target.closest("[data-action]");
    const rowTarget = event.target.closest("[data-factura-id]");
    const refreshBtn = event.target.closest("#facturas-refresh-btn");
    const exportBtn = event.target.closest("#facturas-export-btn");
    const filterBtn = event.target.closest("#facturas-filter-btn");
    const sortBtn = event.target.closest("#facturas-sort-btn");
    const retryBtn = event.target.closest("#facturas-retry-btn");

    if (refreshBtn) {
      void handleRefresh();
      return;
    }

    if (exportBtn) {
      handleExport();
      return;
    }

    if (filterBtn) {
      state.ui.filtersOpen = !state.ui.filtersOpen;
      state.ui.sortOpen = false;
      render();
      return;
    }

    if (sortBtn) {
      state.ui.sortOpen = !state.ui.sortOpen;
      state.ui.filtersOpen = false;
      render();
      return;
    }

    if (retryBtn) {
      void bootstrapData({ force: true });
      return;
    }

    if (!actionTarget && rowTarget && !event.target.closest("button")) {
      const facturaId = safeText(rowTarget.dataset.facturaId, "");
      if (facturaId) {
        void handleOpenFactura(facturaId);
      }
      return;
    }

    if (!actionTarget) return;

    const action = safeText(actionTarget.dataset.action, "");
    const facturaId = safeText(actionTarget.dataset.facturaId, "");

    switch (action) {
      case "open-factura":
        void handleOpenFactura(facturaId);
        break;

      case "view-factura-pdf":
        void handleViewFacturaPdf(facturaId);
        break;

      case "download-factura":
        void handleDownloadFactura(facturaId);
        break;

      case "send-factura":
        void handleSendFactura(facturaId);
        break;

      case "close-detail":
        handleCloseDetail();
        break;

      case "apply-filters":
        handleApplyFilters();
        break;

      case "reset-filters":
        handleResetFilters();
        break;

      case "apply-sort":
        handleApplySort();
        break;

      default:
        break;
    }
  }

  function handleInput(event) {
    const target = event.target;

    if (!target) return;

    if (target.id === "facturas-filter-query") {
      state.filters.query = safeText(target.value, "");
    }

    if (target.id === "facturas-filter-forma-pago") {
      state.filters.formaPago = safeText(target.value, "") || "all";
    }
  }

  function handleChange(event) {
    const target = event.target;
    if (!target) return;

    if (target.id === "facturas-filter-estado-pago") {
      state.filters.estadoPago = safeText(target.value, "all");
      return;
    }

    if (target.id === "facturas-filter-estado") {
      state.filters.estado = safeText(target.value, "all");
      return;
    }

    if (target.id === "facturas-sort-field") {
      state.sort.field = safeText(target.value, "fecha");
      return;
    }

    if (target.id === "facturas-sort-direction") {
      state.sort.direction = safeText(target.value, "desc");
    }
  }

  /* =========================================================
     HANDLERS DE ACCIÓN
  ========================================================= */
  async function handleRefresh() {
    try {
      setRefreshing(true);
      setError("");
      render();

      await Promise.all([
        fetchFacturasList({ silent: true }),
        fetchFacturasStats({ silent: true }),
      ]);

      render();
      showToast("Facturas actualizadas correctamente.", "success");
    } catch (error) {
      console.error("[FacturasView] refresh", error);
      setError("No se pudo actualizar la colección.");
      render();
      showToast("No se pudo actualizar el listado.", "error");
    } finally {
      setRefreshing(false);
      render();
    }
  }

  function handleApplyFilters() {
    syncDerivedState();
    closeMenus();
    render();
    showToast("Filtros aplicados.", "success");
  }

  function handleResetFilters() {
    state.filters = {
      query: "",
      estadoPago: "all",
      estado: "all",
      formaPago: "all",
    };

    syncDerivedState();
    closeMenus();
    render();
    showToast("Filtros restablecidos.", "info");
  }

  function handleApplySort() {
    syncDerivedState();
    closeMenus();
    render();
    showToast("Orden aplicado.", "success");
  }

  async function handleOpenFactura(facturaId = "") {
    const id = safeText(facturaId, "");
    if (!id) return;

    try {
      await fetchFacturaDetail(id);
    } catch (error) {
      console.error("[FacturasView] open detail", error);
      showToast("No se pudo abrir el detalle de la factura.", "error");
    }
  }

  async function handleViewFacturaPdf(facturaId = "") {
    const id = safeText(facturaId, "");
    if (!id) return;

    try {
      state.ui.viewingFacturaId = id;
      const payload = await fetchFacturaFileUrl(id, "inline");
      window.open(payload.file.url, "_blank", "noopener,noreferrer");
      showToast("Abriendo PDF de la factura.", "success");
    } catch (error) {
      console.error("[FacturasView] view pdf", error);
      showToast("No se pudo abrir el PDF.", "error");
    } finally {
      state.ui.viewingFacturaId = "";
    }
  }

  async function handleDownloadFactura(facturaId = "") {
    const id = safeText(facturaId, "");
    if (!id) return;

    try {
      state.ui.downloadingFacturaId = id;
      const payload = await fetchFacturaFileUrl(id, "attachment");
      window.open(payload.file.url, "_blank", "noopener,noreferrer");
      showToast("Preparando descarga de factura.", "success");
    } catch (error) {
      console.error("[FacturasView] download pdf", error);
      showToast("No se pudo descargar la factura.", "error");
    } finally {
      state.ui.downloadingFacturaId = "";
    }
  }

  async function handleSendFactura(facturaId = "") {
    const id = safeText(facturaId, "");
    if (!id) return;

    const factura =
      state.detail?.id === id
        ? state.detail
        : state.items.find((item) => String(item.id) === String(id)) || null;

    const email = factura?.cliente?.email || factura?.enviadoA || "cliente";
    const confirmed = window.confirm(
      `Se va a enviar la factura ${factura?.numero || id} a ${email}. ¿Continuar?`
    );

    if (!confirmed) return;

    try {
      state.ui.sendingFacturaId = id;
      renderDetail();

      const payload = await sendFactura(id);
      showToast("Factura enviada correctamente.", "success");

      if (state.detail?.id === id) {
        state.detail.enviadoA = safeText(payload?.sent?.to, state.detail.enviadoA);
        state.detail.fechaEnvio = safeText(payload?.sent?.at, state.detail.fechaEnvio);
      }

      await fetchFacturasList({ silent: true });
      render();
      renderDetail();
    } catch (error) {
      console.error("[FacturasView] send factura", error);
      showToast("No se pudo enviar la factura.", "error");
    } finally {
      state.ui.sendingFacturaId = "";
      renderDetail();
    }
  }

  function handleCloseDetail() {
    setDetailOpen(false);
    state.detail = null;
    state.detailLoading = false;
    render();
  }

  function handleExport() {
    const rows = state.filteredItems.map((item) => ({
      numero: item.numero,
      cliente: item.cliente?.empresa || item.cliente?.nombre || "",
      email: item.cliente?.email || "",
      fecha: item.fecha || "",
      estadoPago: item.estadoPago || "",
      estado: item.estado || "",
      total: item.total || 0,
      moneda: item.moneda || "EUR",
    }));

    if (!rows.length) {
      showToast("No hay facturas para exportar.", "info");
      return;
    }

    const header = [
      "numero",
      "cliente",
      "email",
      "fecha",
      "estadoPago",
      "estado",
      "total",
      "moneda",
    ];

    const csv = [
      header.join(","),
      ...rows.map((row) =>
        header
          .map((key) => {
            const value = String(row[key] ?? "").replaceAll('"', '""');
            return `"${value}"`;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `facturas_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showToast("Exportación CSV generada.", "success");
  }

  /* =========================================================
     BOOTSTRAP
  ========================================================= */
  async function bootstrapData({ force = false } = {}) {
    try {
      setError("");
      setLoading(true);
      render();

      await Promise.all([
        fetchFacturasList({ silent: true }),
        fetchFacturasStats({ silent: true }),
      ]);

      syncDerivedState();
      render();

      if (force) {
        showToast("Facturación cargada correctamente.", "success");
      }
    } catch (error) {
      console.error("[FacturasView] bootstrap", error);
      setError("No se pudo cargar la facturación.");
      state.items = [];
      state.filteredItems = [];
      render();
      showToast("No se pudo cargar la vista de facturas.", "error");
    } finally {
      setLoading(false);
      render();
    }
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  async function mount() {
    state.mounted = true;

    if (AppCore?.setLoading) {
      AppCore.setLoading(true);
    }

    try {
      render();
      await bootstrapData();
    } finally {
      if (AppCore?.setLoading) {
        AppCore.setLoading(false);
      }
    }
  }

  function unmount() {
    state.mounted = false;

    Object.keys(state.abortControllers).forEach((key) => {
      if (state.abortControllers[key]) {
        try {
          state.abortControllers[key].abort();
        } catch {}
      }
      state.abortControllers[key] = null;
    });

    unbindDom();
    closeMenus();
    setDetailOpen(false);
    state.detail = null;
  }

  function reload() {
    return bootstrapData({ force: true });
  }

  function openById(facturaId = "") {
    return handleOpenFactura(facturaId);
  }

  return {
    mount,
    unmount,
    reload,
    openById,
  };
})();
