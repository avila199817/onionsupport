/* =========================================================
   Onion SPA - Server View
   Archivo: src/views/serverView.js

   Responsabilidades:
   - pintar panel de estado del sistema
   - consumir dashboard agregado existente
   - medir latencia real del endpoint dashboard
   - mostrar timings del navegador / webapp
   - pintar estado de API
   - soportar placeholders elegantes para telemetría backend
   - dejar preparada la vista para métricas reales de servidor
   - no inventar endpoints no confirmados
========================================================= */

import { AppCore } from "../core/core.js";

export const ServerView = (() => {
  "use strict";

  const SCOPE = "view:server";
  const ENDPOINTS = {
    dashboard: "/api/dashboard",
  };

  const state = {
    bootstrapped: false,
    loading: false,
    loaded: false,
    error: null,
    refreshing: false,

    dashboardLatencyMs: null,
    dashboardPayload: null,

    browserMetrics: null,
    environmentMetrics: null,
    telemetry: null,
  };

  /* =========================================================
     HELPERS BASE
  ========================================================= */
  function getContainer() {
    return AppCore.dom.viewContainer;
  }

  function escapeHtml(value = "") {
    return AppCore.utils.escapeHtml(String(value ?? ""));
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function safeString(value, fallback = "") {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
  }

  function round2(value) {
    return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, safeNumber(value, 0)));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("es-ES").format(safeNumber(value, 0));
  }

  function formatMoney(value, currency = "EUR") {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(safeNumber(value, 0));
  }

  function formatMs(value) {
    const ms = round2(value);
    if (!Number.isFinite(ms) || ms <= 0) return "—";
    return `${ms} ms`;
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
      second: "2-digit",
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
    return `Hace ${Math.max(1, Math.floor(diff / day))} d`;
  }

  function getUserRole() {
    return String(AppCore.state.role || AppCore.state.user?.role || "").toLowerCase();
  }

  function isAdmin() {
    return getUserRole() === "admin";
  }

  function getStatusTone(value = "unknown") {
    const normalized = safeString(value, "unknown").toLowerCase();

    if (["ok", "up", "operativa", "operativo", "healthy", "online"].includes(normalized)) {
      return "success";
    }

    if (["warning", "degraded", "revisar", "slow"].includes(normalized)) {
      return "warning";
    }

    if (["error", "down", "offline", "critical", "failed"].includes(normalized)) {
      return "error";
    }

    return "neutral";
  }

  function getToneColor(tone = "neutral") {
    const map = {
      success: "var(--success)",
      warning: "var(--warning)",
      error: "var(--error)",
      info: "var(--info)",
      neutral: "var(--text-dim)",
    };

    return map[tone] || map.neutral;
  }

  function getPercentTone(value = 0) {
    const num = clamp(value, 0, 100);

    if (num >= 85) return "error";
    if (num >= 70) return "warning";
    return "success";
  }

  function getHealthLabelFromLatency(ms) {
    const n = safeNumber(ms, 0);

    if (!n) return "No disponible";
    if (n <= 350) return "Operativa";
    if (n <= 900) return "Revisar";
    return "Lenta";
  }

  /* =========================================================
     PERFORMANCE / ENV
  ========================================================= */
  function getNavigationEntry() {
    try {
      const entries = performance.getEntriesByType("navigation");
      return Array.isArray(entries) && entries.length ? entries[0] : null;
    } catch {
      return null;
    }
  }

  function getBrowserMetrics() {
    const nav = getNavigationEntry();

    if (!nav) {
      return {
        ttfb: null,
        domReady: null,
        windowLoad: null,
        transferSize: null,
        encodedBodySize: null,
        decodedBodySize: null,
      };
    }

    return {
      ttfb: round2(nav.responseStart || 0),
      domReady: round2(nav.domContentLoadedEventEnd || 0),
      windowLoad: round2(nav.loadEventEnd || 0),
      transferSize: safeNumber(nav.transferSize, 0),
      encodedBodySize: safeNumber(nav.encodedBodySize, 0),
      decodedBodySize: safeNumber(nav.decodedBodySize, 0),
    };
  }

  function getEnvironmentMetrics() {
    const nav = navigator || {};
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection || null;

    return {
      userAgent: safeString(nav.userAgent, "No disponible"),
      language: safeString(nav.language, "es-ES"),
      platform: safeString(nav.platform, "No disponible"),
      onLine: typeof nav.onLine === "boolean" ? nav.onLine : null,
      deviceMemory:
        typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
      hardwareConcurrency:
        typeof nav.hardwareConcurrency === "number"
          ? nav.hardwareConcurrency
          : null,
      connectionType: safeString(connection?.effectiveType, ""),
      downlink:
        typeof connection?.downlink === "number" ? connection.downlink : null,
      rtt: typeof connection?.rtt === "number" ? connection.rtt : null,
    };
  }

  function extractTelemetryFromDashboard(payload) {
    const meta = payload?.meta || {};
    const resumen = payload?.resumen || {};
    const charts = payload?.charts || {};

    return {
      api: {
        status: payload ? "Operativa" : "No disponible",
        latencyMs: state.dashboardLatencyMs,
        generatedAt: meta.generatedAt || null,
        scope: meta.scope || null,
        isAdmin: Boolean(meta.isAdmin),
      },

      dashboard: {
        totalFacturas: safeNumber(resumen.totalFacturas, 0),
        totalFacturado: safeNumber(resumen.totalFacturado, 0),
        totalCobrado: safeNumber(resumen.totalCobrado, 0),
        totalPendiente: safeNumber(resumen.totalPendiente, 0),
        ticketsActivos: safeNumber(resumen.ticketsActivos, 0),
        ticketsUrgentes: safeNumber(resumen.ticketsUrgentes, 0),
        totalClientes: safeNumber(resumen.totalClientes, 0),
        totalUsuarios: safeNumber(resumen.totalUsuarios, 0),
        topClientesCount: Array.isArray(charts?.topClientes)
          ? charts.topClientes.length
          : 0,
      },

      server: {
        cpuPercent: null,
        ramPercent: null,
        diskPercent: null,
        osName: null,
        osVersion: null,
        hostname: null,
        uptime: null,
      },

      services: {
        cosmos: {
          status: null,
          latencyMs: null,
          detail: "Sin telemetría backend todavía",
        },
        blob: {
          status: null,
          latencyMs: null,
          detail: "Sin telemetría backend todavía",
        },
        web: {
          status: state.dashboardLatencyMs ? getHealthLabelFromLatency(state.dashboardLatencyMs) : "No disponible",
          latencyMs: state.dashboardLatencyMs,
          detail: "Medido contra /api/dashboard",
        },
      },
    };
  }

  /* =========================================================
     REQUESTS
  ========================================================= */
  async function fetchDashboard() {
    return AppCore.apiClient.get(ENDPOINTS.dashboard, {
      timeout: 20000,
      auth: true,
    });
  }

  async function loadData({ silent = false } = {}) {
    if (!silent) {
      state.loading = true;
      state.error = null;
      render();
    } else {
      state.refreshing = true;
      render();
    }

    try {
      const startedAt = performance.now();
      const dashboard = await fetchDashboard();
      const finishedAt = performance.now();

      state.dashboardLatencyMs = round2(finishedAt - startedAt);
      state.dashboardPayload = dashboard || null;
      state.browserMetrics = getBrowserMetrics();
      state.environmentMetrics = getEnvironmentMetrics();
      state.telemetry = extractTelemetryFromDashboard(dashboard);

      state.loading = false;
      state.refreshing = false;
      state.loaded = true;
      state.error = null;

      render();
    } catch (error) {
      state.loading = false;
      state.refreshing = false;
      state.loaded = true;
      state.error =
        error?.data?.message ||
        error?.message ||
        "No se pudo cargar el estado del servidor.";

      state.browserMetrics = getBrowserMetrics();
      state.environmentMetrics = getEnvironmentMetrics();

      render();
    }
  }

  /* =========================================================
     UI HELPERS
  ========================================================= */
  function statusBadge(label, tone = "neutral") {
    return `
      <span
        class="badge ${escapeHtml(tone)}"
        style="align-self:flex-start;"
      >
        ${escapeHtml(label)}
      </span>
    `;
  }

  function kpiCard({ label, value, hint, icon = "•" }) {
    return `
      <article class="ui-card" style="padding:18px; display:grid; gap:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <span style="font-size:13px; color:var(--text-dim); font-weight:600;">
            ${escapeHtml(label)}
          </span>
          <span
            style="
              width:36px;
              height:36px;
              display:grid;
              place-items:center;
              border-radius:12px;
              background:var(--surface-glass);
              border:1px solid var(--border-soft);
              color:var(--text-muted);
              font-size:14px;
              font-weight:700;
            "
          >
            ${escapeHtml(icon)}
          </span>
        </div>

        <div style="display:grid; gap:4px;">
          <strong style="font-size:28px; line-height:1; color:var(--text-strong);">
            ${escapeHtml(value)}
          </strong>
          <span style="font-size:12px; color:var(--text-dim);">
            ${escapeHtml(hint)}
          </span>
        </div>
      </article>
    `;
  }

  function metricProgressCard({ label, value, hint, available = true }) {
    if (!available) {
      return `
        <article class="ui-card" style="padding:18px; display:grid; gap:14px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <span style="font-size:13px; color:var(--text-dim); font-weight:600;">
              ${escapeHtml(label)}
            </span>
            ${statusBadge("No disponible", "neutral")}
          </div>

          <div style="display:grid; gap:8px;">
            <strong style="font-size:24px; color:var(--text-strong);">—</strong>
            <p style="margin:0; font-size:12px; color:var(--text-dim);">
              ${escapeHtml(hint)}
            </p>
          </div>
        </article>
      `;
    }

    const numeric = clamp(value, 0, 100);
    const tone = getPercentTone(numeric);
    const color = getToneColor(tone);

    return `
      <article class="ui-card" style="padding:18px; display:grid; gap:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <span style="font-size:13px; color:var(--text-dim); font-weight:600;">
            ${escapeHtml(label)}
          </span>
          <span
            style="
              display:inline-flex;
              min-width:58px;
              justify-content:center;
              align-items:center;
              padding:6px 10px;
              border-radius:999px;
              background:color-mix(in srgb, ${color}, transparent 86%);
              color:${color};
              font-size:12px;
              font-weight:700;
            "
          >
            ${escapeHtml(String(numeric))}%
          </span>
        </div>

        <div style="display:grid; gap:8px;">
          <div
            style="
              position:relative;
              width:100%;
              height:10px;
              border-radius:999px;
              background:var(--surface-3);
              overflow:hidden;
            "
          >
            <span
              style="
                display:block;
                width:${numeric}%;
                height:100%;
                border-radius:999px;
                background:${color};
                box-shadow:0 0 18px color-mix(in srgb, ${color}, transparent 52%);
              "
            ></span>
          </div>

          <p style="margin:0; font-size:12px; color:var(--text-dim);">
            ${escapeHtml(hint)}
          </p>
        </div>
      </article>
    `;
  }

  function serviceCard({ title, status, latencyMs, detail }) {
    const tone = getStatusTone(status);
    const label = status || "No disponible";

    return `
      <article class="panel-block" style="padding:18px; display:grid; gap:14px;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div style="display:grid; gap:5px;">
            <h3 style="margin:0; font-size:16px;">${escapeHtml(title)}</h3>
            <p style="margin:0; font-size:12px; color:var(--text-dim);">
              ${escapeHtml(detail || "Sin detalle")}
            </p>
          </div>

          ${statusBadge(label, tone)}
        </div>

        <div style="display:grid; gap:8px; font-size:13px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <span style="color:var(--text-dim);">Latencia</span>
            <strong style="color:var(--text-strong);">${escapeHtml(formatMs(latencyMs))}</strong>
          </div>
        </div>
      </article>
    `;
  }

  function infoRow(label, value) {
    return `
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
        <span style="color:var(--text-dim);">${escapeHtml(label)}</span>
        <strong style="color:var(--text-strong); text-align:right;">${escapeHtml(value)}</strong>
      </div>
    `;
  }

  /* =========================================================
     RENDER SECTIONS
  ========================================================= */
  function renderHeader() {
    const telemetry = state.telemetry;
    const meta = state.dashboardPayload?.meta || {};

    return `
      <section class="panel-block" style="padding:24px;">
        <div style="display:grid; gap:16px;">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:18px; flex-wrap:wrap;">
            <div style="display:grid; gap:8px;">
              <h2 style="margin:0;">Servidor</h2>
              <p style="margin:0; color:var(--text-dim); max-width:860px;">
                Estado general del sistema, latencia de backend, salud de servicios y datos de entorno visibles desde la SPA.
                Las métricas de CPU, RAM, disco, Cosmos, Blob y sistema operativo quedan preparadas para telemetría backend real.
              </p>
            </div>

            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${statusBadge("Admin only", "info")}
              ${statusBadge(
                telemetry?.api?.status || "No disponible",
                getStatusTone(telemetry?.api?.status)
              )}
            </div>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <span class="badge neutral">Generado ${escapeHtml(formatDateTime(meta.generatedAt))}</span>
            <span class="badge neutral">${escapeHtml(formatRelativeDate(meta.generatedAt))}</span>
            <span class="badge neutral">Scope ${escapeHtml(meta.scope || "—")}</span>
            <span class="badge neutral">Latencia dashboard ${escapeHtml(formatMs(state.dashboardLatencyMs))}</span>
          </div>
        </div>
      </section>
    `;
  }

  function renderDashboardKpis() {
    const resumen = state.telemetry?.dashboard || {};

    return `
      <section
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));
          gap:16px;
        "
      >
        ${kpiCard({
          label: "Facturas",
          value: formatNumber(resumen.totalFacturas),
          hint: "Total de documentos visibles en dashboard.",
          icon: "F",
        })}

        ${kpiCard({
          label: "Facturado",
          value: formatMoney(resumen.totalFacturado || 0),
          hint: "Base agregada según dashboard.",
          icon: "€",
        })}

        ${kpiCard({
          label: "Cobrado",
          value: formatMoney(resumen.totalCobrado || 0),
          hint: "Importe ya consolidado.",
          icon: "✓",
        })}

        ${kpiCard({
          label: "Pendiente",
          value: formatMoney(resumen.totalPendiente || 0),
          hint: "Facturación aún no liquidada.",
          icon: "!",
        })}

        ${kpiCard({
          label: "Tickets activos",
          value: formatNumber(resumen.ticketsActivos),
          hint: "Tickets vivos en el agregado.",
          icon: "T",
        })}

        ${kpiCard({
          label: "Urgentes",
          value: formatNumber(resumen.ticketsUrgentes),
          hint: "Tickets con prioridad alta.",
          icon: "U",
        })}
      </section>
    `;
  }

  function renderServerMetrics() {
    const server = state.telemetry?.server || {};

    return `
      <section
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));
          gap:16px;
        "
      >
        ${metricProgressCard({
          label: "CPU servidor",
          value: server.cpuPercent,
          hint: "Requiere telemetría backend real.",
          available: server.cpuPercent !== null,
        })}

        ${metricProgressCard({
          label: "RAM servidor",
          value: server.ramPercent,
          hint: "Requiere telemetría backend real.",
          available: server.ramPercent !== null,
        })}

        ${metricProgressCard({
          label: "Disco / ROM",
          value: server.diskPercent,
          hint: "Requiere telemetría backend real.",
          available: server.diskPercent !== null,
        })}
      </section>
    `;
  }

  function renderServices() {
    const services = state.telemetry?.services || {};

    return `
      <section
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));
          gap:16px;
        "
      >
        ${serviceCard({
          title: "API dashboard",
          status: services.api?.status || state.telemetry?.api?.status,
          latencyMs: state.telemetry?.api?.latencyMs,
          detail: "Respuesta real medida desde el frontend contra /api/dashboard",
        })}

        ${serviceCard({
          title: "Cosmos DB",
          status: services.cosmos?.status,
          latencyMs: services.cosmos?.latencyMs,
          detail: services.cosmos?.detail || "Sin telemetría backend todavía",
        })}

        ${serviceCard({
          title: "Blob Storage",
          status: services.blob?.status,
          latencyMs: services.blob?.latencyMs,
          detail: services.blob?.detail || "Sin telemetría backend todavía",
        })}

        ${serviceCard({
          title: "Capa web",
          status: services.web?.status,
          latencyMs: services.web?.latencyMs,
          detail: services.web?.detail || "Medición de ida y vuelta de la SPA",
        })}
      </section>
    `;
  }

  function renderBrowserAndSystem() {
    const browser = state.browserMetrics || {};
    const env = state.environmentMetrics || {};
    const server = state.telemetry?.server || {};

    return `
      <section
        style="
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:16px;
        "
        class="server-view-grid-2"
      >
        <div class="panel-block" style="padding:20px; display:grid; gap:14px;">
          <div style="display:grid; gap:6px;">
            <h3 style="margin:0; font-size:18px;">Timings web</h3>
            <p style="margin:0; color:var(--text-dim); font-size:13px;">
              Métricas reales del navegador para esta carga de la SPA.
            </p>
          </div>

          <div style="display:grid; gap:10px; font-size:13px;">
            ${infoRow("TTFB navegador", formatMs(browser.ttfb))}
            ${infoRow("DOM ready", formatMs(browser.domReady))}
            ${infoRow("Load final", formatMs(browser.windowLoad))}
            ${infoRow("Payload transferido", browser.transferSize ? `${formatNumber(browser.transferSize)} B` : "—")}
            ${infoRow("Body codificado", browser.encodedBodySize ? `${formatNumber(browser.encodedBodySize)} B` : "—")}
            ${infoRow("Body decodificado", browser.decodedBodySize ? `${formatNumber(browser.decodedBodySize)} B` : "—")}
          </div>
        </div>

        <div class="panel-block" style="padding:20px; display:grid; gap:14px;">
          <div style="display:grid; gap:6px;">
            <h3 style="margin:0; font-size:18px;">Entorno y sistema</h3>
            <p style="margin:0; color:var(--text-dim); font-size:13px;">
              Lo visible desde frontend y placeholders de sistema real del servidor.
            </p>
          </div>

          <div style="display:grid; gap:10px; font-size:13px;">
            ${infoRow("Plataforma navegador", env.platform || "—")}
            ${infoRow("Idioma", env.language || "—")}
            ${infoRow("Online", env.onLine === null ? "—" : env.onLine ? "Sí" : "No")}
            ${infoRow("deviceMemory navegador", env.deviceMemory ? `${env.deviceMemory} GB` : "—")}
            ${infoRow("hardwareConcurrency", env.hardwareConcurrency ? `${env.hardwareConcurrency} hilos` : "—")}
            ${infoRow("Conexión", env.connectionType || "—")}
            ${infoRow("RTT estimado", env.rtt ? `${env.rtt} ms` : "—")}
            ${infoRow("SO servidor", server.osName || "No disponible")}
            ${infoRow("Versión SO", server.osVersion || "No disponible")}
            ${infoRow("Hostname", server.hostname || "No disponible")}
            ${infoRow("Uptime servidor", server.uptime || "No disponible")}
          </div>
        </div>
      </section>
    `;
  }

  function renderRawNotice() {
    return `
      <section class="ui-alert info">
        <div style="display:grid; gap:6px;">
          <strong style="color:var(--text-strong);">Importante</strong>
          <p style="margin:0; color:var(--text-dim); font-size:13px;">
            Esta vista ya consume el dashboard real y mide latencia real del endpoint.
            Para CPU, RAM, disco, Cosmos DB, Blob Storage, sistema operativo y versiones del host,
            hace falta que el backend exponga telemetría específica. La vista ya está preparada para enchufarla sin rehacer la UI.
          </p>
        </div>
      </section>
    `;
  }

  function renderLoadingState() {
    return `
      <section class="content-wrapper">
        <div class="ui-empty">
          <div class="ui-empty-icon">⌛</div>
          <h3 class="ui-empty-title">Cargando estado del sistema…</h3>
          <p class="ui-empty-text">
            Preparando dashboard, latencia y métricas visibles desde la SPA.
          </p>
        </div>
      </section>
    `;
  }

  function renderErrorState() {
    return `
      <section class="content-wrapper">
        <div class="panel-block" style="padding:24px;">
          <div style="display:grid; gap:12px;">
            <h2 style="margin:0;">No se pudo cargar el panel de servidor</h2>
            <p style="margin:0; color:var(--error);">
              ${escapeHtml(state.error || "Error desconocido.")}
            </p>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button
                type="button"
                id="server-refresh-btn"
                class="ui-btn ui-btn-primary"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderMain() {
    return `
      <section
        class="server-view"
        style="display:grid; gap:24px; padding:24px;"
      >
        ${renderHeader()}
        ${renderDashboardKpis()}
        ${renderServerMetrics()}
        ${renderServices()}
        ${renderBrowserAndSystem()}
        ${renderRawNotice()}
      </section>
    `;
  }

  function render() {
    const container = getContainer();
    if (!container) return;

    AppCore.cleanup.run(SCOPE);
    AppCore.setDocumentTitle("Servidor");
    AppCore.clearDynamicContainers?.();

    if (state.loading && !state.loaded) {
      container.innerHTML = renderLoadingState();
      bind();
      return;
    }

    if (state.error && !state.dashboardPayload) {
      container.innerHTML = renderErrorState();
      bind();
      return;
    }

    container.innerHTML = renderMain();
    bind();
  }

  /* =========================================================
     BIND
  ========================================================= */
  function bind() {
    const scope = AppCore.cleanup.scope(SCOPE);

    const refreshBtn = document.getElementById("server-refresh-btn");

    if (refreshBtn) {
      AppCore.cleanup.on(scope, refreshBtn, "click", async () => {
        if (state.loading || state.refreshing) return;
        await loadData({ silent: false });
      });
    }

    if (!state.bootstrapped) {
      state.bootstrapped = true;
      loadData();
    }
  }

  return {
    render,
    loadData,
  };
})();
