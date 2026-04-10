/* =========================================================
   Onion SPA - Facturas View (LEAN PRO SAAS PANEL)
   Archivo: src/views/facturasView.js

   Objetivo actual:
   - pintar SOLO cards de facturas existentes
   - respetar el layout real del shell
   - usar content-wrapper / panel-content / grid del sistema
   - cargar facturas desde backend
   - guardar facturas en Store
   - normalizar facturas del backend nuevo
   - estados mínimos: loading / error / vacío
   - cero filtros
   - cero tabla
   - cero drawer
   - simplicidad máxima
========================================================= */

import { AppCore } from "../core/core.js";
import { Store } from "../store/store.js";

export const FacturasView = (() => {
  "use strict";

  const SCOPE = "view:facturas";

  const ENDPOINT = "/api/facturas";

  const localState = {
    hydrated: false,
    loading: false,
    loaded: false,
    error: null,
    refreshing: false,
    bootstrapped: false,
    remoteCount: 0,
  };

  let inflightLoad = null;

  /* =========================================================
     HELPERS SAFE
  ========================================================= */
  function safeGet(path, fallback = []) {
    try {
      if (typeof Store?.get === "function") {
        return Store.get(path) ?? fallback;
      }
    } catch {
      /* noop */
    }

    return fallback;
  }

  function safeSet(path, value) {
    try {
      if (typeof Store?.set === "function") {
        Store.set(path, value);
        return true;
      }
    } catch {
      /* noop */
    }

    return false;
  }

  function safeSetCollection(name, value) {
    try {
      if (typeof Store?.actions?.setCollection === "function") {
        Store.actions.setCollection(name, value);
        return true;
      }
    } catch {
      /* noop */
    }

    return false;
  }

  function getContainer() {
    return AppCore.dom.viewContainer;
  }

  function escapeHtml(value = "") {
    return AppCore.utils.escapeHtml(String(value ?? ""));
  }

  function safeString(value, fallback = "") {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function safeArray(value, fallback = []) {
    return Array.isArray(value) ? value : fallback;
  }

  function round2(value) {
    return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
  }

  function truncate(value = "", max = 140) {
    const text = safeString(value);
    if (text.length <= max) return text;
    return `${text.slice(0, max).trim()}…`;
  }

  function toMs(value) {
    if (!value) return 0;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  /* =========================================================
     FORMATTERS
  ========================================================= */
  function formatMoney(value, currency = "EUR") {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(safeNumber(value));
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }

  function formatRelativeDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    const diff = Date.now() - date.getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return "Hace un momento";
    if (diff < hour) return `Hace ${Math.max(1, Math.floor(diff / minute))} min`;
    if (diff < day) return `Hace ${Math.max(1, Math.floor(diff / hour))} h`;
    if (diff < 7 * day) return `Hace ${Math.max(1, Math.floor(diff / day))} d`;

    return formatDate(value);
  }

  function getInitials(value = "") {
    return (
      String(value || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("")
        .slice(0, 2) || "ON"
    );
  }

  /* =========================================================
     NORMALIZACIÓN
  ========================================================= */
  function normalizeEstadoPago(value = "pending") {
    const map = {
      pagada: "paid",
      pagado: "paid",
      paid: "paid",
      abonada: "paid",

      pendiente: "pending",
      pending: "pending",
      unpaid: "pending",

      vencida: "overdue",
      overdue: "overdue",

      borrador: "draft",
      draft: "draft",

      cancelada: "cancelled",
      cancelado: "cancelled",
      cancelled: "cancelled",
      canceled: "cancelled",
    };

    const key = safeString(value).toLowerCase();
    return map[key] || "pending";
  }

  function normalizeEstado(value = "issued") {
    const map = {
      emitida: "issued",
      emitido: "issued",
      issued: "issued",

      enviada: "sent",
      enviado: "sent",
      sent: "sent",

      anulada: "void",
      anulado: "void",
      void: "void",

      borrador: "draft",
      draft: "draft",
    };

    const key = safeString(value).toLowerCase();
    return map[key] || "issued";
  }

  function getEstadoPagoLabel(value = "pending") {
    const labels = {
      paid: "Pagada",
      pending: "Pendiente",
      overdue: "Vencida",
      draft: "Borrador",
      cancelled: "Cancelada",
    };

    return labels[value] || "Pendiente";
  }

  function getEstadoLabel(value = "issued") {
    const labels = {
      issued: "Emitida",
      sent: "Enviada",
      void: "Anulada",
      draft: "Borrador",
    };

    return labels[value] || "Emitida";
  }

  function getEstadoPagoChipStyle(value = "pending") {
    const tones = {
      paid:
        "background:var(--success-bg); border-color:var(--border-success); color:var(--text-soft);",
      pending:
        "background:var(--warning-bg); border-color:var(--border-warning); color:var(--text-soft);",
      overdue:
        "background:var(--error-bg); border-color:var(--border-error); color:var(--text-soft);",
      draft:
        "background:var(--info-bg); border-color:var(--border-info); color:var(--text-soft);",
      cancelled:
        "background:var(--surface-glass); border-color:var(--border-soft); color:var(--text-muted);",
    };

    return tones[value] || tones.pending;
  }

  function getEstadoChipStyle(value = "issued") {
    const tones = {
      issued:
        "background:var(--info-bg); border-color:var(--border-info); color:var(--text-soft);",
      sent:
        "background:var(--success-bg); border-color:var(--border-success); color:var(--text-soft);",
      void:
        "background:var(--surface-glass); border-color:var(--border-soft); color:var(--text-muted);",
      draft:
        "background:var(--accent-soft-2); border-color:var(--border-accent); color:var(--text-soft);",
    };

    return tones[value] || tones.issued;
  }

  function normalizeFactura(item = {}) {
    const estadoPago = normalizeEstadoPago(item.estadoPago || "pending");
    const estado = normalizeEstado(item.estado || "issued");

    const clienteNombre =
      item.cliente?.nombre ||
      item.cliente?.nombreContacto ||
      item.name ||
      "Cliente";

    const clienteEmpresa =
      item.cliente?.empresa ||
      item.cliente?.razonSocial ||
      item.cliente?.nombreFiscal ||
      "-";

    const currency = safeString(item.moneda, "EUR");
    const fecha = item.fecha || item.fechaFactura || null;
    const fechaEnvio = item.fechaEnvio || null;
    const updatedAt = item.updatedAt || fechaEnvio || fecha || null;

    return {
      id: item.id ?? null,
      numero:
        item.numero ??
        item.numeroFacturaLegal ??
        item.numeroFacturaSistema ??
        item.id ??
        "--",

      fecha,
      fechaEnvio,
      updatedAt,

      estadoPago,
      estado,

      total: round2(item.total),
      baseImponible: round2(item.baseImponible),
      iva: round2(item.iva),
      irpf: round2(item.irpf),
      moneda: currency,

      formaPago: safeString(item.formaPago, "-"),
      preview: safeString(item.preview, "Sin detalle"),

      lineasCount: safeNumber(item.lineasCount, 0),
      attachmentsCount: safeNumber(item.attachmentsCount, 0),
      hasPdf: item.hasPdf === true || Boolean(item.blobPath),

      cliente: {
        id: item.cliente?.id ?? item.clienteId ?? null,
        nombre: clienteNombre,
        email: safeString(item.cliente?.email, "-"),
        empresa: clienteEmpresa,
        initials: getInitials(clienteEmpresa !== "-" ? clienteEmpresa : clienteNombre),
      },

      meta: {
        timestampMs: toMs(updatedAt) || toMs(fecha) || 0,
      },

      raw: item,
    };
  }

  function extractFacturas(response) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.facturas)) return response.facturas;
    if (Array.isArray(response?.items)) return response.items;
    if (Array.isArray(response?.data?.facturas)) return response.data.facturas;
    return [];
  }

  /* =========================================================
     STORE
  ========================================================= */
  function getFacturas() {
    return safeGet("entities.facturas", []);
  }

  function setFacturas(items = []) {
    if (safeSetCollection("facturas", items)) return;
    safeSet("entities.facturas", items);
  }

  /* =========================================================
     REQUESTS
  ========================================================= */
  async function fetchFacturas() {
    return AppCore.apiClient.get(ENDPOINT, {
      timeout: 15000,
      auth: true,
    });
  }

  async function loadFacturas({ silent = false } = {}) {
    if (inflightLoad) return inflightLoad;

    if (!silent) {
      localState.loading = true;
      localState.error = null;
      render();
    } else {
      localState.refreshing = true;
      render();
    }

    inflightLoad = (async () => {
      try {
        const response = await fetchFacturas();
        const items = extractFacturas(response).map(normalizeFactura);

        setFacturas(items);

        localState.remoteCount =
          safeNumber(response?.count, items.length) || items.length;

        localState.loading = false;
        localState.refreshing = false;
        localState.loaded = true;
        localState.error = null;

        render();
        return items;
      } catch (error) {
        localState.loading = false;
        localState.refreshing = false;
        localState.loaded = true;
        localState.error =
          error?.data?.message ||
          error?.message ||
          "No se pudieron cargar las facturas.";

        render();
        throw error;
      } finally {
        inflightLoad = null;
      }
    })();

    return inflightLoad;
  }

  /* =========================================================
     ACTIONS
  ========================================================= */
  function openFactura(id) {
    if (!id) return;

    if (typeof AppCore.events?.emit === "function") {
      AppCore.events.emit("facturas:open", { facturaId: id });
    }

    // Base lista para detalle real si lo conectas luego:
    // Router.navigate(`/facturas/${id}`);
  }

  /* =========================================================
     UI
  ========================================================= */
  function renderHeader() {
    const items = getFacturas();

    return `
      <header class="page-header">
        <div class="page-header-main">
          <h1 class="page-title">Facturas</h1>
          <p class="page-subtitle">
            Listado simple de facturas existentes. Solo cards, sin ruido y sin inventar otro layout.
          </p>
        </div>

        <div class="page-header-actions">
          <button
            type="button"
            id="facturas-refresh-btn"
            style="
              min-height:var(--btn-height-sm);
              padding:10px 14px;
              border-radius:var(--btn-radius);
              border:1px solid var(--btn-secondary-border);
              background:var(--btn-secondary-bg);
              color:var(--btn-secondary-text);
              box-shadow:var(--btn-secondary-shadow);
              font-weight:var(--weight-bold);
              cursor:pointer;
            "
          >
            ${localState.loading || localState.refreshing ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </header>

      <section class="section">
        <div class="section-header">
          <div class="section-header-main">
            <h2 class="section-title">${items.length} factura(s)</h2>
            <p class="section-subtitle">
              ${escapeHtml(String(localState.remoteCount || items.length))} visibles en la colección actual
            </p>
          </div>
        </div>
      </section>
    `;
  }

  function renderLoadingState() {
    return `
      <section class="grid cols-auto dense">
        ${Array.from({ length: 6 })
          .map(
            () => `
              <article class="card-surface" style="padding:var(--space-lg); display:grid; gap:var(--space-md); min-height:230px;">
                <div style="display:flex; justify-content:space-between; gap:var(--space-sm);">
                  <div style="display:grid; gap:var(--space-xs); flex:1;">
                    <div style="width:110px; height:14px; border-radius:var(--radius-pill); background:var(--surface-glass-strong);"></div>
                    <div style="width:72%; height:16px; border-radius:var(--radius-pill); background:var(--surface-hover-strong);"></div>
                  </div>
                  <div style="width:44px; height:44px; border-radius:var(--radius-lg); background:var(--surface-glass);"></div>
                </div>

                <div style="display:grid; gap:var(--space-xs);">
                  <div style="width:100%; height:12px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
                  <div style="width:84%; height:12px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
                  <div style="width:62%; height:12px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
                </div>

                <div style="display:flex; gap:var(--space-xs); flex-wrap:wrap;">
                  <div style="width:96px; height:30px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
                  <div style="width:96px; height:30px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
                </div>
              </article>
            `
          )
          .join("")}
      </section>
    `;
  }

  function renderErrorState() {
    return `
      <section class="panel-surface">
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <h3 class="empty-state-title">No se pudo cargar el listado</h3>
          <p class="empty-state-text">${escapeHtml(localState.error || "Error desconocido")}</p>
          <button
            type="button"
            id="facturas-retry-btn"
            style="
              min-height:var(--btn-height-sm);
              padding:10px 14px;
              border-radius:var(--btn-radius);
              border:1px solid var(--btn-primary-border);
              background:var(--btn-primary-bg);
              color:var(--btn-primary-text);
              box-shadow:var(--btn-primary-shadow);
              font-weight:var(--weight-bold);
              cursor:pointer;
            "
          >
            Reintentar
          </button>
        </div>
      </section>
    `;
  }

  function renderEmptyState() {
    return `
      <section class="panel-surface">
        <div class="empty-state">
          <div class="empty-state-icon">🧾</div>
          <h3 class="empty-state-title">Sin facturas</h3>
          <p class="empty-state-text">
            No hay facturas registradas en este momento.
          </p>
        </div>
      </section>
    `;
  }

  function renderCards() {
    const items = [...getFacturas()].sort(
      (a, b) => (b.meta?.timestampMs || 0) - (a.meta?.timestampMs || 0)
    );

    if (localState.loading && !items.length) {
      return renderLoadingState();
    }

    if (localState.error && !items.length) {
      return renderErrorState();
    }

    if (!items.length) {
      return renderEmptyState();
    }

    return `
      <section class="grid cols-auto">
        ${items
          .map(
            (item) => `
              <article
                class="card-surface hover-lift factura-card"
                data-factura-id="${escapeHtml(item.id || "")}"
                style="
                  display:grid;
                  gap:var(--space-md);
                  padding:var(--space-lg);
                  cursor:pointer;
                "
              >
                <div style="
                  display:flex;
                  align-items:flex-start;
                  justify-content:space-between;
                  gap:var(--space-sm);
                ">
                  <div style="display:grid; gap:var(--space-xs); min-width:0;">
                    <span style="
                      font-size:var(--font-sm);
                      color:var(--text-dim);
                      font-weight:var(--weight-semibold);
                      letter-spacing:var(--letter-wide);
                    ">
                      ${escapeHtml(item.numero || item.id || "—")}
                    </span>

                    <h3 style="
                      margin:0;
                      font-size:var(--font-lg);
                      line-height:var(--line-snug);
                      color:var(--text-strong);
                      font-weight:var(--weight-bold);
                    ">
                      ${escapeHtml(item.cliente?.empresa || item.cliente?.nombre || "Cliente")}
                    </h3>
                  </div>

                  <div style="
                    inline-size:44px;
                    block-size:44px;
                    flex:0 0 auto;
                    display:grid;
                    place-items:center;
                    border-radius:var(--radius-lg);
                    border:1px solid var(--border-soft);
                    background:var(--avatar-bg);
                    color:var(--avatar-text);
                    font-size:var(--font-sm);
                    font-weight:var(--weight-black);
                    box-shadow:var(--shadow-xs);
                  ">
                    ${escapeHtml(item.cliente?.initials || "ON")}
                  </div>
                </div>

                <p style="
                  margin:0;
                  font-size:var(--font-md);
                  line-height:var(--line-relaxed);
                  color:var(--text-muted);
                ">
                  ${escapeHtml(truncate(item.preview || "Sin detalle", 160))}
                </p>

                <div style="
                  display:grid;
                  gap:var(--space-xs);
                  font-size:var(--font-md);
                  color:var(--text-soft);
                ">
                  <span><strong style="color:var(--text-strong);">Cliente:</strong> ${escapeHtml(item.cliente?.nombre || "—")}</span>
                  <span><strong style="color:var(--text-strong);">Email:</strong> ${escapeHtml(item.cliente?.email || "-")}</span>
                  <span><strong style="color:var(--text-strong);">Fecha:</strong> ${escapeHtml(formatDate(item.fecha))}</span>
                  <span><strong style="color:var(--text-strong);">Pago:</strong> ${escapeHtml(item.formaPago || "-")}</span>
                </div>

                <div style="
                  display:flex;
                  align-items:center;
                  justify-content:space-between;
                  gap:var(--space-sm);
                  flex-wrap:wrap;
                ">
                  <div style="display:grid; gap:2px;">
                    <strong style="
                      font-size:var(--font-xl);
                      line-height:1;
                      color:var(--text-strong);
                    ">
                      ${escapeHtml(formatMoney(item.total, item.moneda))}
                    </strong>

                    <span style="
                      font-size:var(--font-sm);
                      color:var(--text-dim);
                    ">
                      Base ${escapeHtml(formatMoney(item.baseImponible, item.moneda))}
                    </span>
                  </div>

                  <div style="display:flex; gap:var(--space-xs); flex-wrap:wrap;">
                    <span style="
                      display:inline-flex;
                      align-items:center;
                      justify-content:center;
                      min-height:30px;
                      padding:6px 10px;
                      border-radius:var(--radius-pill);
                      border:1px solid var(--border-soft);
                      font-size:var(--font-sm);
                      font-weight:var(--weight-semibold);
                      ${getEstadoPagoChipStyle(item.estadoPago)}
                    ">
                      ${escapeHtml(getEstadoPagoLabel(item.estadoPago))}
                    </span>

                    <span style="
                      display:inline-flex;
                      align-items:center;
                      justify-content:center;
                      min-height:30px;
                      padding:6px 10px;
                      border-radius:var(--radius-pill);
                      border:1px solid var(--border-soft);
                      font-size:var(--font-sm);
                      font-weight:var(--weight-semibold);
                      ${getEstadoChipStyle(item.estado)}
                    ">
                      ${escapeHtml(getEstadoLabel(item.estado))}
                    </span>
                  </div>
                </div>

                <div class="divider"></div>

                <div style="
                  display:flex;
                  align-items:center;
                  justify-content:space-between;
                  gap:var(--space-sm);
                  flex-wrap:wrap;
                ">
                  <div style="display:grid; gap:2px;">
                    <span style="
                      font-size:var(--font-sm);
                      color:var(--text-dim);
                    ">
                      ${escapeHtml(formatRelativeDate(item.updatedAt))}
                    </span>

                    <span style="
                      font-size:var(--font-xs);
                      color:var(--text-faint);
                    ">
                      Adjuntos: ${escapeHtml(String(item.attachmentsCount || 0))}
                    </span>
                  </div>

                  <button
                    type="button"
                    data-action="open-factura"
                    data-factura-id="${escapeHtml(item.id || "")}"
                    style="
                      min-height:36px;
                      padding:8px 12px;
                      border-radius:var(--radius-sm);
                      border:1px solid var(--btn-secondary-border);
                      background:var(--btn-secondary-bg);
                      color:var(--btn-secondary-text);
                      font-size:var(--font-sm);
                      font-weight:var(--weight-bold);
                      cursor:pointer;
                    "
                  >
                    Ver factura
                  </button>
                </div>
              </article>
            `
          )
          .join("")}
      </section>
    `;
  }

  /* =========================================================
     RENDER
  ========================================================= */
  function render() {
    const container = getContainer();
    if (!container) return;

    AppCore.cleanup.run(SCOPE);
    AppCore.setDocumentTitle("Facturas");
    AppCore.clearDynamicContainers?.();

    container.innerHTML = `
      <section class="panel-content dashboard ready">
        <div class="content-wrapper">
          ${renderHeader()}
          ${renderCards()}
        </div>
      </section>
    `;

    localState.hydrated = true;
    bind();
  }

  /* =========================================================
     BIND
  ========================================================= */
  function bind() {
    const scope = AppCore.cleanup.scope(SCOPE);

    const refreshBtn = document.getElementById("facturas-refresh-btn");
    const retryBtn = document.getElementById("facturas-retry-btn");

    if (refreshBtn) {
      AppCore.cleanup.on(scope, refreshBtn, "click", async () => {
        if (localState.loading || localState.refreshing) return;
        await loadFacturas({ silent: true });
      });
    }

    if (retryBtn) {
      AppCore.cleanup.on(scope, retryBtn, "click", async () => {
        await loadFacturas();
      });
    }

    const openButtons = document.querySelectorAll('[data-action="open-factura"]');
    openButtons.forEach((button) => {
      AppCore.cleanup.on(scope, button, "click", (event) => {
        event.stopPropagation();
        openFactura(button.getAttribute("data-factura-id"));
      });
    });

    const cards = document.querySelectorAll(".factura-card");
    cards.forEach((card) => {
      AppCore.cleanup.on(scope, card, "click", () => {
        openFactura(card.getAttribute("data-factura-id"));
      });
    });

    if (!localState.bootstrapped) {
      localState.bootstrapped = true;
      loadFacturas();
    }
  }

  return {
    render,
    loadFacturas,
  };
})();
