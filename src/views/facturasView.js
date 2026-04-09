/* =========================================================
   Onion SPA - Facturas View (FULL PRO SAAS PANEL · GOD MODE)
   Archivo: src/views/facturasView.js

   Responsabilidades:
   - pintar el panel de facturas
   - cargar facturas y stats desde backend nuevo
   - soportar búsqueda local
   - filtros por estado de pago / estado / envío
   - soportar ordenación avanzada
   - mostrar KPIs financieros
   - renderizar tabla + cards responsive
   - abrir detalle lateral de factura
   - descargar factura PDF
   - enviar factura al cliente
   - gestionar loading / error / vacío sin romper la SPA
========================================================= */

import { AppCore } from "../core/core.js";
import { Store } from "../store/store.js";

export const FacturasView = (() => {
  "use strict";

  const SCOPE = "view:facturas";

  const ENDPOINTS = {
    list: "/api/facturas",
    stats: "/api/facturas/stats",
    detail: (id) => `/api/facturas/${encodeURIComponent(id)}`,
    download: (id) => `/api/facturas/${encodeURIComponent(id)}/descargar`,
    send: (id) => `/api/facturas/${encodeURIComponent(id)}/enviar`,
  };

  const localState = {
    bootstrapped: false,
    loading: false,
    loaded: false,
    error: null,
    refreshing: false,

    query: "",
    estadoPago: "all",
    estado: "all",
    sent: "all",
    sort: "date_desc",

    stats: {
      totalPagado: 0,
      totalPendiente: 0,
      totalMes: 0,
      totalVencido: 0,
      countPagadas: 0,
      countPendientes: 0,
      countVencidas: 0,
      countEnviadas: 0,
      countTotal: 0,
    },

    remoteCount: 0,

    detailOpen: false,
    detailLoading: false,
    detailError: null,
    selectedFacturaId: null,
    selectedFactura: null,

    sendingId: null,
  };

  /* =========================================================
     HELPERS SAFE
  ========================================================= */
  function safeGet(path, fallback = []) {
    try {
      if (typeof Store?.get === "function") {
        return Store.get(path) ?? fallback;
      }
    } catch {
      /* no-op */
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
      /* no-op */
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
      /* no-op */
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

  function normalizeText(value = "") {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function toMs(value) {
    if (!value) return 0;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  function round2(value) {
    return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
  }

  function truncate(value = "", max = 110) {
    const text = safeString(value);
    if (text.length <= max) return text;
    return `${text.slice(0, max).trim()}…`;
  }

  function getUserRole() {
    return String(AppCore.state.role || "").toLowerCase();
  }

  function isAdmin() {
    return getUserRole() === "admin";
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

  function formatDateTime(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
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

    return map[normalizeText(value)] || "pending";
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

    return map[normalizeText(value)] || "issued";
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

  function getEstadoPagoTone(value = "pending") {
    const tones = {
      paid: "rgba(34,197,94,.16)",
      pending: "rgba(245,158,11,.16)",
      overdue: "rgba(239,68,68,.16)",
      draft: "rgba(59,130,246,.16)",
      cancelled: "rgba(107,114,128,.16)",
    };

    return tones[value] || "rgba(245,158,11,.16)";
  }

  function getEstadoTone(value = "issued") {
    const tones = {
      issued: "rgba(59,130,246,.16)",
      sent: "rgba(16,185,129,.16)",
      void: "rgba(107,114,128,.16)",
      draft: "rgba(168,85,247,.16)",
    };

    return tones[value] || "rgba(59,130,246,.16)";
  }

  /* =========================================================
     NORMALIZACIÓN
  ========================================================= */
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
      numero: item.numero ?? item.numeroFacturaLegal ?? item.numeroFacturaSistema ?? item.id ?? "--",

      serie: safeString(item.serie, ""),
      correlativo: safeNumber(item.correlativo, 0),

      fecha,
      fechaServicio: item.fechaServicio ?? null,
      fechaEnvio,
      fechaPago: item.fechaPago ?? null,
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

      blobPath: safeString(item.blobPath, ""),

      cliente: {
        id: item.cliente?.id ?? item.clienteId ?? null,
        nombre: clienteNombre,
        email: safeString(item.cliente?.email, "-"),
        avatar: item.cliente?.avatar ?? null,
        empresa: clienteEmpresa,
      },

      auditoria: {
        createdAt: item.auditoria?.createdAt ?? null,
        createdBy: safeString(item.auditoria?.createdBy, ""),
      },

      meta: {
        timestampMs:
          safeNumber(item.meta?.timestampMs, 0) ||
          toMs(updatedAt) ||
          toMs(fecha) ||
          0,
        isPaid: item.meta?.isPaid === true || estadoPago === "paid",
        isPending: item.meta?.isPending === true || estadoPago === "pending",
        isOverdue: item.meta?.isOverdue === true || estadoPago === "overdue",
        isSent: item.meta?.isSent === true || Boolean(fechaEnvio),
      },

      raw: item,
    };
  }

  function normalizeFacturaDetalle(item = {}) {
    const base = normalizeFactura(item);

    return {
      ...base,
      tipoDocumento: safeString(item.tipoDocumento, "factura"),
      tipoFactura: safeString(item.tipoFactura, "ordinaria"),
      year: safeNumber(item.year, 0),
      mes: safeString(item.mes, ""),
      dia: safeString(item.dia, ""),

      emisor: {
        nombreComercial: safeString(item.emisor?.nombreComercial, ""),
        nombreFiscal: safeString(item.emisor?.nombreFiscal, ""),
        nif: safeString(item.emisor?.nif, ""),
        direccion: {
          calle: safeString(item.emisor?.direccion?.calle, ""),
          cp: safeString(item.emisor?.direccion?.cp, ""),
          ciudad: safeString(item.emisor?.direccion?.ciudad, ""),
          provincia: safeString(item.emisor?.direccion?.provincia, ""),
          pais: safeString(item.emisor?.direccion?.pais, ""),
        },
      },

      cliente: {
        ...base.cliente,
        nif: safeString(item.cliente?.nif, ""),
        numeroCliente: safeString(item.cliente?.numeroCliente, ""),
        clienteIdInterno: safeString(item.cliente?.clienteIdInterno, ""),
        direccion: {
          calle: safeString(item.cliente?.direccion?.calle, ""),
          cp: safeString(item.cliente?.direccion?.cp, ""),
          ciudad: safeString(item.cliente?.direccion?.ciudad, ""),
          provincia: safeString(item.cliente?.direccion?.provincia, ""),
          pais: safeString(item.cliente?.direccion?.pais, ""),
        },
      },

      direccionServicio: {
        calle: safeString(item.direccionServicio?.calle, ""),
        cp: safeString(item.direccionServicio?.cp, ""),
        ciudad: safeString(item.direccionServicio?.ciudad, ""),
        provincia: safeString(item.direccionServicio?.provincia, ""),
        pais: safeString(item.direccionServicio?.pais, ""),
      },

      lineas: safeArray(item.lineas).map((linea) => ({
        concepto: safeString(linea?.concepto, "Línea"),
        descripcion: safeString(linea?.descripcion, ""),
        cantidad: safeNumber(linea?.cantidad, 0),
        precioUnitario: round2(linea?.precioUnitario),
        totalLinea: round2(linea?.totalLinea),
      })),

      impuestos: safeArray(item.impuestos).map((imp) => ({
        tipo: safeString(imp?.tipo, ""),
        porcentaje: safeNumber(imp?.porcentaje, 0),
        base: round2(imp?.base),
        importe: round2(imp?.importe),
      })),
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
    return AppCore.apiClient.get(ENDPOINTS.list, {
      timeout: 15000,
      auth: true,
    });
  }

  async function fetchStats() {
    return AppCore.apiClient.get(ENDPOINTS.stats, {
      timeout: 15000,
      auth: true,
    });
  }

  async function fetchDetalle(id) {
    return AppCore.apiClient.get(ENDPOINTS.detail(id), {
      timeout: 15000,
      auth: true,
    });
  }

  async function sendFactura(id) {
    return AppCore.apiClient.post(ENDPOINTS.send(id), null, {
      timeout: 20000,
      auth: true,
    });
  }

  async function loadFacturas({ silent = false } = {}) {
    if (!silent) {
      localState.loading = true;
      localState.error = null;
      render();
    } else {
      localState.refreshing = true;
      render();
    }

    try {
      const [listResponse, statsResponse] = await Promise.all([
        fetchFacturas(),
        fetchStats(),
      ]);

      const items = extractFacturas(listResponse).map(normalizeFactura);
      const stats = listResponse?.stats || statsResponse?.stats || statsResponse || {};

      setFacturas(items);

      localState.remoteCount = safeNumber(listResponse?.count, items.length) || items.length;
      localState.stats = {
        totalPagado: round2(stats.totalPagado),
        totalPendiente: round2(stats.totalPendiente),
        totalMes: round2(stats.totalMes),
        totalVencido: round2(stats.totalVencido),
        countPagadas: safeNumber(stats.countPagadas, 0),
        countPendientes: safeNumber(stats.countPendientes, 0),
        countVencidas: safeNumber(stats.countVencidas, 0),
        countEnviadas: safeNumber(stats.countEnviadas, 0),
        countTotal: safeNumber(stats.countTotal, items.length),
      };

      localState.loading = false;
      localState.refreshing = false;
      localState.loaded = true;
      localState.error = null;

      render();
    } catch (error) {
      localState.loading = false;
      localState.refreshing = false;
      localState.loaded = true;
      localState.error =
        error?.data?.message ||
        error?.message ||
        "No se pudieron cargar las facturas.";

      render();
    }
  }

  async function openFacturaDetalle(id) {
    if (!id) return;

    localState.selectedFacturaId = id;
    localState.selectedFactura = null;
    localState.detailOpen = true;
    localState.detailLoading = true;
    localState.detailError = null;
    render();

    try {
      const response = await fetchDetalle(id);
      const factura = response?.factura || response?.data?.factura || response || {};
      localState.selectedFactura = normalizeFacturaDetalle(factura);
      localState.detailLoading = false;
      localState.detailError = null;
      render();
    } catch (error) {
      localState.detailLoading = false;
      localState.detailError =
        error?.data?.message ||
        error?.message ||
        "No se pudo cargar el detalle de la factura.";
      render();
    }
  }

  function closeFacturaDetalle() {
    localState.detailOpen = false;
    localState.detailLoading = false;
    localState.detailError = null;
    localState.selectedFacturaId = null;
    localState.selectedFactura = null;
    render();
  }

  function triggerDownload(id) {
    if (!id) return;
    window.open(ENDPOINTS.download(id), "_blank", "noopener,noreferrer");
  }

  async function triggerSend(id) {
    if (!id || localState.sendingId) return;

    localState.sendingId = id;
    render();

    try {
      await sendFactura(id);
      localState.sendingId = null;
      await loadFacturas({ silent: true });
      await openFacturaDetalle(id);
    } catch (error) {
      localState.sendingId = null;
      localState.detailError =
        error?.data?.message ||
        error?.message ||
        "No se pudo enviar la factura.";
      render();
    }
  }

  /* =========================================================
     FILTRO / ORDEN
  ========================================================= */
  function getFilteredFacturas() {
    let items = [...getFacturas()];

    if (localState.query) {
      const term = normalizeText(localState.query);

      items = items.filter((item) => {
        return [
          item.id,
          item.numero,
          item.cliente?.nombre,
          item.cliente?.empresa,
          item.cliente?.email,
          item.formaPago,
          item.preview,
          getEstadoPagoLabel(item.estadoPago),
          getEstadoLabel(item.estado),
        ]
          .filter(Boolean)
          .some((value) => normalizeText(value).includes(term));
      });
    }

    if (localState.estadoPago !== "all") {
      items = items.filter((item) => item.estadoPago === localState.estadoPago);
    }

    if (localState.estado !== "all") {
      items = items.filter((item) => item.estado === localState.estado);
    }

    if (localState.sent === "sent") {
      items = items.filter((item) => item.meta?.isSent);
    }

    if (localState.sent === "not_sent") {
      items = items.filter((item) => !item.meta?.isSent);
    }

    items.sort((a, b) => {
      if (localState.sort === "date_desc") {
        return (b.meta?.timestampMs || 0) - (a.meta?.timestampMs || 0);
      }

      if (localState.sort === "date_asc") {
        return (a.meta?.timestampMs || 0) - (b.meta?.timestampMs || 0);
      }

      if (localState.sort === "amount_desc") {
        return safeNumber(b.total, 0) - safeNumber(a.total, 0);
      }

      if (localState.sort === "amount_asc") {
        return safeNumber(a.total, 0) - safeNumber(b.total, 0);
      }

      if (localState.sort === "number_desc") {
        return String(b.numero || "").localeCompare(String(a.numero || ""), "es");
      }

      if (localState.sort === "number_asc") {
        return String(a.numero || "").localeCompare(String(b.numero || ""), "es");
      }

      if (localState.sort === "client_asc") {
        return String(a.cliente?.empresa || a.cliente?.nombre || "").localeCompare(
          String(b.cliente?.empresa || b.cliente?.nombre || ""),
          "es"
        );
      }

      return 0;
    });

    return items;
  }

  /* =========================================================
     KPIS
  ========================================================= */
  function getKpis() {
    const items = getFacturas();
    const stats = localState.stats || {};

    return {
      total: items.length,
      totalPagado: round2(stats.totalPagado),
      totalPendiente: round2(stats.totalPendiente),
      totalMes: round2(stats.totalMes),
      totalVencido: round2(stats.totalVencido),
      countPagadas: safeNumber(stats.countPagadas, items.filter((f) => f.meta?.isPaid).length),
      countPendientes: safeNumber(stats.countPendientes, items.filter((f) => f.meta?.isPending).length),
      countVencidas: safeNumber(stats.countVencidas, items.filter((f) => f.meta?.isOverdue).length),
      countEnviadas: safeNumber(stats.countEnviadas, items.filter((f) => f.meta?.isSent).length),
    };
  }

  /* =========================================================
     UI PIECES
  ========================================================= */
  function statCard({ label, value, hint, icon }) {
    return `
      <article
        style="
          display:grid;
          gap:14px;
          padding:18px;
          border-radius:18px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.03);
        "
      >
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <span style="font-size:14px; opacity:.72;">${escapeHtml(label)}</span>
          <span
            style="
              width:40px;
              height:40px;
              display:grid;
              place-items:center;
              border-radius:12px;
              border:1px solid rgba(255,255,255,.08);
              background:rgba(255,255,255,.03);
            "
          >
            ${icon}
          </span>
        </div>

        <div style="display:grid; gap:4px;">
          <strong style="font-size:30px; line-height:1;">${escapeHtml(value)}</strong>
          <span style="font-size:13px; opacity:.65;">${escapeHtml(hint)}</span>
        </div>
      </article>
    `;
  }

  function actionButton({ id, action, label, title }) {
    return `
      <button
        type="button"
        data-factura-action="${escapeHtml(action)}"
        data-factura-id="${escapeHtml(id || "")}"
        title="${escapeHtml(title || label)}"
        style="
          display:inline-flex;
          align-items:center;
          justify-content:center;
          padding:9px 12px;
          border-radius:12px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.04);
          color:inherit;
          cursor:pointer;
          font-size:12px;
          font-weight:700;
          white-space:nowrap;
        "
      >
        ${escapeHtml(label)}
      </button>
    `;
  }

  function renderHeader() {
    const kpis = getKpis();

    return `
      <section style="display:grid; gap:20px;">
        <div
          style="
            display:grid;
            gap:14px;
            padding:24px;
            border-radius:24px;
            border:1px solid rgba(255,255,255,.08);
            background:
              radial-gradient(circle at top right, rgba(255,255,255,.06), transparent 35%),
              rgba(255,255,255,.03);
          "
        >
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:20px; flex-wrap:wrap;">
            <div style="display:grid; gap:8px;">
              <h2 style="margin:0; font-size:30px;">Facturas</h2>
              <p style="margin:0; opacity:.74; max-width:860px;">
                Gestión de facturas orientada a cliente y administración. Consulta,
                revisa el detalle, descarga PDF y envía documentos con una vista
                limpia y preparada para trabajo real.
              </p>
            </div>

            <div style="display:flex; gap:12px; flex-wrap:wrap;">
              <button
                type="button"
                id="facturas-refresh-btn"
                style="
                  padding:12px 16px;
                  border:1px solid rgba(255,255,255,.08);
                  border-radius:14px;
                  background:rgba(255,255,255,.04);
                  color:inherit;
                  cursor:pointer;
                  font-weight:600;
                "
              >
                ${localState.refreshing ? "Actualizando..." : "Actualizar"}
              </button>
            </div>
          </div>
        </div>

        <div
          style="
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));
            gap:16px;
          "
        >
          ${statCard({
            label: "Pagado",
            value: formatMoney(kpis.totalPagado),
            hint: `${kpis.countPagadas} factura(s) cobradas`,
            icon: "💶",
          })}

          ${statCard({
            label: "Pendiente",
            value: formatMoney(kpis.totalPendiente),
            hint: `${kpis.countPendientes} pendiente(s)`,
            icon: "⏳",
          })}

          ${statCard({
            label: "Mes actual",
            value: formatMoney(kpis.totalMes),
            hint: "Volumen del mes",
            icon: "📆",
          })}

          ${statCard({
            label: "Vencido",
            value: formatMoney(kpis.totalVencido),
            hint: `${kpis.countVencidas} vencida(s)`,
            icon: "🚨",
          })}

          ${statCard({
            label: "Enviadas",
            value: kpis.countEnviadas,
            hint: `${localState.remoteCount || kpis.total} visibles`,
            icon: "📤",
          })}
        </div>
      </section>
    `;
  }

  function renderFilters() {
    return `
      <section
        style="
          display:grid;
          gap:16px;
          padding:20px;
          border-radius:20px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.03);
        "
      >
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <h3 style="margin:0; font-size:18px;">Filtros</h3>
          <span style="font-size:13px; opacity:.65;">Búsqueda y clasificación local</span>
        </div>

        <div
          style="
            display:grid;
            grid-template-columns:minmax(220px, 1.55fr) repeat(4, minmax(150px, .65fr));
            gap:14px;
          "
          class="facturas-filters-grid"
        >
          <input
            id="facturas-search"
            type="text"
            placeholder="Buscar por número, cliente, empresa, email..."
            value="${escapeHtml(localState.query)}"
            style="
              width:100%;
              padding:14px 16px;
              border-radius:14px;
              border:1px solid rgba(255,255,255,.10);
              background:transparent;
              color:inherit;
            "
          >

          <select
            id="facturas-estado-pago-filter"
            style="
              width:100%;
              padding:14px 16px;
              border-radius:14px;
              border:1px solid rgba(255,255,255,.10);
              background:transparent;
              color:inherit;
            "
          >
            <option value="all"${localState.estadoPago === "all" ? " selected" : ""}>Todos los pagos</option>
            <option value="paid"${localState.estadoPago === "paid" ? " selected" : ""}>Pagadas</option>
            <option value="pending"${localState.estadoPago === "pending" ? " selected" : ""}>Pendientes</option>
            <option value="overdue"${localState.estadoPago === "overdue" ? " selected" : ""}>Vencidas</option>
            <option value="draft"${localState.estadoPago === "draft" ? " selected" : ""}>Borrador</option>
            <option value="cancelled"${localState.estadoPago === "cancelled" ? " selected" : ""}>Canceladas</option>
          </select>

          <select
            id="facturas-estado-filter"
            style="
              width:100%;
              padding:14px 16px;
              border-radius:14px;
              border:1px solid rgba(255,255,255,.10);
              background:transparent;
              color:inherit;
            "
          >
            <option value="all"${localState.estado === "all" ? " selected" : ""}>Todos los estados</option>
            <option value="issued"${localState.estado === "issued" ? " selected" : ""}>Emitidas</option>
            <option value="sent"${localState.estado === "sent" ? " selected" : ""}>Enviadas</option>
            <option value="draft"${localState.estado === "draft" ? " selected" : ""}>Borrador</option>
            <option value="void"${localState.estado === "void" ? " selected" : ""}>Anuladas</option>
          </select>

          <select
            id="facturas-sent-filter"
            style="
              width:100%;
              padding:14px 16px;
              border-radius:14px;
              border:1px solid rgba(255,255,255,.10);
              background:transparent;
              color:inherit;
            "
          >
            <option value="all"${localState.sent === "all" ? " selected" : ""}>Envío</option>
            <option value="sent"${localState.sent === "sent" ? " selected" : ""}>Enviadas</option>
            <option value="not_sent"${localState.sent === "not_sent" ? " selected" : ""}>No enviadas</option>
          </select>

          <select
            id="facturas-sort"
            style="
              width:100%;
              padding:14px 16px;
              border-radius:14px;
              border:1px solid rgba(255,255,255,.10);
              background:transparent;
              color:inherit;
            "
          >
            <option value="date_desc"${localState.sort === "date_desc" ? " selected" : ""}>Fecha ↓</option>
            <option value="date_asc"${localState.sort === "date_asc" ? " selected" : ""}>Fecha ↑</option>
            <option value="amount_desc"${localState.sort === "amount_desc" ? " selected" : ""}>Importe ↓</option>
            <option value="amount_asc"${localState.sort === "amount_asc" ? " selected" : ""}>Importe ↑</option>
            <option value="number_desc"${localState.sort === "number_desc" ? " selected" : ""}>Número ↓</option>
            <option value="number_asc"${localState.sort === "number_asc" ? " selected" : ""}>Número ↑</option>
            <option value="client_asc"${localState.sort === "client_asc" ? " selected" : ""}>Cliente A-Z</option>
          </select>
        </div>
      </section>
    `;
  }

  function renderEmptyState(message) {
    return `
      <section
        style="
          display:grid;
          gap:12px;
          padding:24px;
          border-radius:20px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.03);
        "
      >
        <h3 style="margin:0;">Listado</h3>
        <p style="margin:0; opacity:.72;">${escapeHtml(message)}</p>
      </section>
    `;
  }

  function renderTable() {
    if (localState.loading) {
      return renderEmptyState("Cargando facturas...");
    }

    if (localState.error) {
      return `
        <section
          style="
            display:grid;
            gap:12px;
            padding:24px;
            border-radius:20px;
            border:1px solid rgba(255,255,255,.08);
            background:rgba(255,255,255,.03);
          "
        >
          <h3 style="margin:0;">Listado</h3>
          <p style="margin:0; color:#ff7b7b;">
            ${escapeHtml(localState.error)}
          </p>
        </section>
      `;
    }

    const items = getFilteredFacturas();

    if (!items.length) {
      return renderEmptyState(
        "No hay facturas que coincidan con los filtros actuales."
      );
    }

    return `
      <section
        style="
          display:grid;
          gap:16px;
          padding:20px;
          border-radius:20px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.03);
        "
      >
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <h3 style="margin:0; font-size:18px;">Listado</h3>
          <span style="font-size:13px; opacity:.65;">${items.length} resultado(s)</span>
        </div>

        <div style="overflow:auto;">
          <table
            style="
              width:100%;
              border-collapse:collapse;
              min-width:1220px;
            "
          >
            <thead>
              <tr style="text-align:left; border-bottom:1px solid rgba(255,255,255,.08);">
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Número</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Cliente</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Detalle</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Pago</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Estado</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Importe</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Fecha</th>
                <th style="padding:12px 10px; font-size:13px; opacity:.7;">Acciones</th>
              </tr>
            </thead>

            <tbody>
              ${items
                .map(
                  (item) => `
                    <tr style="border-bottom:1px solid rgba(255,255,255,.06);">
                      <td style="padding:14px 10px; white-space:nowrap;">
                        <div style="display:grid; gap:4px;">
                          <strong style="font-size:14px;">${escapeHtml(item.numero)}</strong>
                          <span style="font-size:12px; opacity:.62;">${escapeHtml(item.id || "—")}</span>
                        </div>
                      </td>

                      <td style="padding:14px 10px; min-width:220px;">
                        <div style="display:grid; gap:5px;">
                          <strong style="font-size:14px;">${escapeHtml(item.cliente?.empresa || item.cliente?.nombre || "Cliente")}</strong>
                          <span style="font-size:12px; opacity:.65;">${escapeHtml(item.cliente?.nombre || "—")}</span>
                          <span style="font-size:12px; opacity:.55;">${escapeHtml(item.cliente?.email || "-")}</span>
                        </div>
                      </td>

                      <td style="padding:14px 10px; min-width:220px;">
                        <div style="display:grid; gap:5px;">
                          <strong style="font-size:13px;">${escapeHtml(truncate(item.preview || "Sin detalle", 82))}</strong>
                          <span style="font-size:12px; opacity:.62;">${escapeHtml(item.formaPago || "-")}</span>
                        </div>
                      </td>

                      <td style="padding:14px 10px;">
                        <span
                          style="
                            display:inline-flex;
                            align-items:center;
                            justify-content:center;
                            padding:7px 10px;
                            border-radius:999px;
                            font-size:12px;
                            font-weight:600;
                            background:${getEstadoPagoTone(item.estadoPago)};
                          "
                        >
                          ${escapeHtml(getEstadoPagoLabel(item.estadoPago))}
                        </span>
                      </td>

                      <td style="padding:14px 10px;">
                        <span
                          style="
                            display:inline-flex;
                            align-items:center;
                            justify-content:center;
                            padding:7px 10px;
                            border-radius:999px;
                            font-size:12px;
                            font-weight:600;
                            background:${getEstadoTone(item.estado)};
                          "
                        >
                          ${escapeHtml(getEstadoLabel(item.estado))}
                        </span>
                      </td>

                      <td style="padding:14px 10px; white-space:nowrap;">
                        <div style="display:grid; gap:4px;">
                          <strong style="font-size:14px;">${escapeHtml(formatMoney(item.total, item.moneda))}</strong>
                          <span style="font-size:12px; opacity:.6;">Base ${escapeHtml(formatMoney(item.baseImponible, item.moneda))}</span>
                        </div>
                      </td>

                      <td style="padding:14px 10px; white-space:nowrap;">
                        <div style="display:grid; gap:4px;">
                          <strong style="font-size:13px;">${escapeHtml(formatDate(item.fecha))}</strong>
                          <span style="font-size:12px; opacity:.6;">${escapeHtml(formatRelativeDate(item.updatedAt))}</span>
                        </div>
                      </td>

                      <td style="padding:14px 10px;">
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                          ${actionButton({
                            id: item.id,
                            action: "view",
                            label: "Ver",
                            title: "Ver detalle",
                          })}

                          ${actionButton({
                            id: item.id,
                            action: "download",
                            label: "Descargar",
                            title: "Descargar factura",
                          })}

                          ${actionButton({
                            id: item.id,
                            action: "send",
                            label:
                              localState.sendingId === item.id
                                ? "Enviando..."
                                : "Enviar",
                            title: "Enviar factura",
                          })}
                        </div>
                      </td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderCards() {
    if (localState.loading || localState.error) return "";

    const items = getFilteredFacturas();

    if (!items.length) return "";

    return `
      <section
        class="facturas-cards-mobile"
        style="
          display:grid;
          gap:14px;
        "
      >
        ${items
          .map(
            (item) => `
              <article
                style="
                  display:grid;
                  gap:14px;
                  padding:18px;
                  border-radius:18px;
                  border:1px solid rgba(255,255,255,.08);
                  background:rgba(255,255,255,.03);
                "
              >
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
                  <div style="display:grid; gap:4px; min-width:0;">
                    <strong style="font-size:14px;">${escapeHtml(item.numero)}</strong>
                    <span style="font-size:12px; opacity:.62;">${escapeHtml(item.cliente?.empresa || item.cliente?.nombre || "Cliente")}</span>
                  </div>

                  <strong style="font-size:14px; white-space:nowrap;">
                    ${escapeHtml(formatMoney(item.total, item.moneda))}
                  </strong>
                </div>

                <div style="display:grid; gap:7px; font-size:13px;">
                  <span><strong>Contacto:</strong> ${escapeHtml(item.cliente?.nombre || "—")}</span>
                  <span><strong>Email:</strong> ${escapeHtml(item.cliente?.email || "-")}</span>
                  <span><strong>Fecha:</strong> ${escapeHtml(formatDate(item.fecha))}</span>
                  <span><strong>Detalle:</strong> ${escapeHtml(truncate(item.preview || "Sin detalle", 95))}</span>
                </div>

                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <span
                    style="
                      display:inline-flex;
                      align-items:center;
                      justify-content:center;
                      padding:7px 10px;
                      border-radius:999px;
                      font-size:12px;
                      font-weight:600;
                      background:${getEstadoPagoTone(item.estadoPago)};
                    "
                  >
                    ${escapeHtml(getEstadoPagoLabel(item.estadoPago))}
                  </span>

                  <span
                    style="
                      display:inline-flex;
                      align-items:center;
                      justify-content:center;
                      padding:7px 10px;
                      border-radius:999px;
                      font-size:12px;
                      font-weight:600;
                      background:${getEstadoTone(item.estado)};
                    "
                  >
                    ${escapeHtml(getEstadoLabel(item.estado))}
                  </span>
                </div>

                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  ${actionButton({
                    id: item.id,
                    action: "view",
                    label: "Ver",
                    title: "Ver detalle",
                  })}

                  ${actionButton({
                    id: item.id,
                    action: "download",
                    label: "Descargar",
                    title: "Descargar factura",
                  })}

                  ${actionButton({
                    id: item.id,
                    action: "send",
                    label:
                      localState.sendingId === item.id
                        ? "Enviando..."
                        : "Enviar",
                    title: "Enviar factura",
                  })}
                </div>
              </article>
            `
          )
          .join("")}
      </section>
    `;
  }

  function renderDetailDrawer() {
    const open = localState.detailOpen;
    const factura = localState.selectedFactura;
    const canSend = isAdmin();

    if (!open) {
      return `
        <aside
          id="factura-detail-drawer"
          style="display:none;"
        ></aside>
      `;
    }

    let body = "";

    if (localState.detailLoading) {
      body = `
        <div style="display:grid; gap:8px;">
          <strong style="font-size:16px;">Cargando detalle…</strong>
          <span style="font-size:13px; opacity:.7;">Preparando datos de la factura.</span>
        </div>
      `;
    } else if (localState.detailError) {
      body = `
        <div style="display:grid; gap:8px;">
          <strong style="font-size:16px;">No se pudo cargar el detalle</strong>
          <span style="font-size:13px; opacity:.8;">${escapeHtml(localState.detailError)}</span>
        </div>
      `;
    } else if (factura) {
      body = `
        <div style="display:grid; gap:18px;">
          <section style="display:grid; gap:10px;">
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
              <div style="display:grid; gap:5px;">
                <strong style="font-size:22px;">${escapeHtml(factura.numero)}</strong>
                <span style="font-size:13px; opacity:.68;">${escapeHtml(factura.id || "—")}</span>
              </div>

              <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
                <span
                  style="
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    padding:7px 10px;
                    border-radius:999px;
                    font-size:12px;
                    font-weight:600;
                    background:${getEstadoPagoTone(factura.estadoPago)};
                  "
                >
                  ${escapeHtml(getEstadoPagoLabel(factura.estadoPago))}
                </span>

                <span
                  style="
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    padding:7px 10px;
                    border-radius:999px;
                    font-size:12px;
                    font-weight:600;
                    background:${getEstadoTone(factura.estado)};
                  "
                >
                  ${escapeHtml(getEstadoLabel(factura.estado))}
                </span>
              </div>
            </div>

            <div style="display:grid; gap:8px; font-size:13px;">
              <span><strong>Fecha factura:</strong> ${escapeHtml(formatDate(factura.fecha))}</span>
              <span><strong>Fecha envío:</strong> ${escapeHtml(formatDateTime(factura.fechaEnvio))}</span>
              <span><strong>Forma de pago:</strong> ${escapeHtml(factura.formaPago || "-")}</span>
              <span><strong>PDF:</strong> ${escapeHtml(factura.hasPdf ? "Disponible" : "No disponible")}</span>
            </div>
          </section>

          <section
            style="
              display:grid;
              gap:10px;
              padding:16px;
              border-radius:16px;
              border:1px solid rgba(255,255,255,.08);
              background:rgba(255,255,255,.03);
            "
          >
            <h4 style="margin:0; font-size:15px;">Cliente</h4>

            <div style="display:grid; gap:7px; font-size:13px;">
              <span><strong>Empresa:</strong> ${escapeHtml(factura.cliente?.empresa || "-")}</span>
              <span><strong>Contacto:</strong> ${escapeHtml(factura.cliente?.nombre || "-")}</span>
              <span><strong>Email:</strong> ${escapeHtml(factura.cliente?.email || "-")}</span>
              <span><strong>NIF:</strong> ${escapeHtml(factura.cliente?.nif || "-")}</span>
            </div>
          </section>

          <section
            style="
              display:grid;
              gap:10px;
              padding:16px;
              border-radius:16px;
              border:1px solid rgba(255,255,255,.08);
              background:rgba(255,255,255,.03);
            "
          >
            <h4 style="margin:0; font-size:15px;">Importes</h4>

            <div style="display:grid; gap:8px; font-size:13px;">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                <span>Base imponible</span>
                <strong>${escapeHtml(formatMoney(factura.baseImponible, factura.moneda))}</strong>
              </div>

              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                <span>IVA</span>
                <strong>${escapeHtml(formatMoney(factura.iva, factura.moneda))}</strong>
              </div>

              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                <span>IRPF</span>
                <strong>${escapeHtml(formatMoney(factura.irpf, factura.moneda))}</strong>
              </div>

              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                <span>Total</span>
                <strong>${escapeHtml(formatMoney(factura.total, factura.moneda))}</strong>
              </div>
            </div>
          </section>

          <section
            style="
              display:grid;
              gap:10px;
              padding:16px;
              border-radius:16px;
              border:1px solid rgba(255,255,255,.08);
              background:rgba(255,255,255,.03);
            "
          >
            <h4 style="margin:0; font-size:15px;">Líneas</h4>

            ${
              factura.lineas?.length
                ? factura.lineas
                    .map(
                      (linea) => `
                        <div style="display:grid; gap:4px; padding:10px 0; border-bottom:1px solid rgba(255,255,255,.06);">
                          <strong style="font-size:13px;">${escapeHtml(linea.concepto)}</strong>
                          <span style="font-size:12px; opacity:.7;">${escapeHtml(linea.descripcion || "Sin descripción")}</span>
                          <span style="font-size:12px; opacity:.7;">
                            ${escapeHtml(String(linea.cantidad))} × ${escapeHtml(formatMoney(linea.precioUnitario, factura.moneda))} = ${escapeHtml(formatMoney(linea.totalLinea, factura.moneda))}
                          </span>
                        </div>
                      `
                    )
                    .join("")
                : `<span style="font-size:13px; opacity:.68;">Sin líneas disponibles.</span>`
            }
          </section>

          <section style="display:flex; gap:10px; flex-wrap:wrap;">
            <button
              type="button"
              data-factura-action="download"
              data-factura-id="${escapeHtml(factura.id || "")}"
              style="
                display:inline-flex;
                align-items:center;
                justify-content:center;
                padding:12px 14px;
                border-radius:14px;
                border:1px solid rgba(255,255,255,.08);
                background:rgba(255,255,255,.04);
                color:inherit;
                cursor:pointer;
                font-weight:700;
              "
            >
              Descargar PDF
            </button>

            ${
              canSend
                ? `
                  <button
                    type="button"
                    data-factura-action="send"
                    data-factura-id="${escapeHtml(factura.id || "")}"
                    style="
                      display:inline-flex;
                      align-items:center;
                      justify-content:center;
                      padding:12px 14px;
                      border-radius:14px;
                      border:1px solid rgba(255,255,255,.08);
                      background:rgba(255,255,255,.04);
                      color:inherit;
                      cursor:pointer;
                      font-weight:700;
                    "
                  >
                    ${localState.sendingId === factura.id ? "Enviando..." : "Enviar factura"}
                  </button>
                `
                : ""
            }
          </section>
        </div>
      `;
    }

    return `
      <div
        id="factura-detail-overlay"
        style="
          position:fixed;
          inset:0;
          background:rgba(0,0,0,.45);
          z-index:49;
        "
      ></div>

      <aside
        id="factura-detail-drawer"
        style="
          position:fixed;
          top:0;
          right:0;
          width:min(560px, 100vw);
          height:100dvh;
          overflow:auto;
          z-index:50;
          padding:20px;
          border-left:1px solid rgba(255,255,255,.08);
          background:rgba(12,14,18,.96);
          backdrop-filter:blur(18px);
          box-shadow:-12px 0 40px rgba(0,0,0,.28);
        "
      >
        <div style="display:grid; gap:18px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <h3 style="margin:0; font-size:20px;">Detalle factura</h3>

            <button
              type="button"
              id="factura-detail-close"
              style="
                width:38px;
                height:38px;
                display:grid;
                place-items:center;
                border-radius:12px;
                border:1px solid rgba(255,255,255,.08);
                background:rgba(255,255,255,.04);
                color:inherit;
                cursor:pointer;
                font-weight:700;
              "
            >
              ✕
            </button>
          </div>

          ${body}
        </div>
      </aside>
    `;
  }

  function render() {
    const container = getContainer();
    if (!container) return;

    AppCore.cleanup.run(SCOPE);
    AppCore.setDocumentTitle("Facturas");
    AppCore.clearDynamicContainers?.();

    container.innerHTML = `
      <section
        class="facturas-view"
        style="
          display:grid;
          gap:24px;
          padding:24px;
        "
      >
        ${renderHeader()}
        ${renderFilters()}
        ${renderTable()}
        ${renderCards()}
        ${renderDetailDrawer()}
      </section>
    `;

    bind();
  }

  /* =========================================================
     BIND
  ========================================================= */
  function bind() {
    const scope = AppCore.cleanup.scope(SCOPE);

    const refreshBtn = document.getElementById("facturas-refresh-btn");
    const searchInput = document.getElementById("facturas-search");
    const estadoPagoFilter = document.getElementById("facturas-estado-pago-filter");
    const estadoFilter = document.getElementById("facturas-estado-filter");
    const sentFilter = document.getElementById("facturas-sent-filter");
    const sortSelect = document.getElementById("facturas-sort");

    const overlay = document.getElementById("factura-detail-overlay");
    const closeBtn = document.getElementById("factura-detail-close");

    if (refreshBtn) {
      AppCore.cleanup.on(scope, refreshBtn, "click", async () => {
        if (localState.loading || localState.refreshing) return;
        await loadFacturas({ silent: true });
      });
    }

    if (searchInput) {
      AppCore.cleanup.on(
        scope,
        searchInput,
        "input",
        AppCore.utils.debounce((event) => {
          localState.query = event.target.value.trim();
          render();
        }, 120)
      );
    }

    if (estadoPagoFilter) {
      AppCore.cleanup.on(scope, estadoPagoFilter, "change", (event) => {
        localState.estadoPago = event.target.value;
        render();
      });
    }

    if (estadoFilter) {
      AppCore.cleanup.on(scope, estadoFilter, "change", (event) => {
        localState.estado = event.target.value;
        render();
      });
    }

    if (sentFilter) {
      AppCore.cleanup.on(scope, sentFilter, "change", (event) => {
        localState.sent = event.target.value;
        render();
      });
    }

    if (sortSelect) {
      AppCore.cleanup.on(scope, sortSelect, "change", (event) => {
        localState.sort = event.target.value;
        render();
      });
    }

    if (overlay) {
      AppCore.cleanup.on(scope, overlay, "click", () => {
        closeFacturaDetalle();
      });
    }

    if (closeBtn) {
      AppCore.cleanup.on(scope, closeBtn, "click", () => {
        closeFacturaDetalle();
      });
    }

    AppCore.cleanup.on(scope, document, "keydown", (event) => {
      if (event.key === "Escape" && localState.detailOpen) {
        closeFacturaDetalle();
      }
    });

    const actionButtons = document.querySelectorAll("[data-factura-action][data-factura-id]");
    actionButtons.forEach((button) => {
      AppCore.cleanup.on(scope, button, "click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const id = button.getAttribute("data-factura-id");
        const action = button.getAttribute("data-factura-action");

        if (!id || !action) return;

        if (action === "view") {
          await openFacturaDetalle(id);
          return;
        }

        if (action === "download") {
          triggerDownload(id);
          return;
        }

        if (action === "send") {
          await triggerSend(id);
        }
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
    openFacturaDetalle,
  };
})();
