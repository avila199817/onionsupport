/* =========================================================
   Onion SPA - Server View
   Archivo: src/views/serverView.js

   Responsabilidades:
   - pintar panel de estado del sistema
   - consumir dashboard agregado existente
   - consumir health interno real del backend
   - medir latencia real de dashboard y health
   - mostrar timings del navegador / webapp
   - pintar estado de API / DB / sistema
   - pintar CPU / RAM / disco / host / runtime
   - soportar loading / error / refresh sin romper la SPA
   - incluir mini administrador de tareas visual
   - dibujar gráficos en tiempo real de CPU / RAM
   - mantener histórico local sin librerías externas
========================================================= */

import { AppCore } from "../core/core.js";

export const ServerView = (() => {
  "use strict";

  const SCOPE = "view:server";

  const ENDPOINTS = {
    dashboard: "/api/dashboard",
    health: "/health/internal",
  };

  const REFRESH_INTERVAL_MS = 3000;
  const HISTORY_LIMIT = 40;

  const state = {
    bootstrapped: false,
    loading: false,
    loaded: false,
    error: null,
    refreshing: false,

    dashboardLatencyMs: null,
    healthLatencyMs: null,

    dashboardPayload: null,
    healthPayload: null,

    browserMetrics: null,
    environmentMetrics: null,
    telemetry: null,

    autoRefresh: true,
    intervalId: null,

    history: {
      cpu: [],
      ram: [],
      apiLatency: [],
      dbLatency: [],
      timestamps: [],
    },
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

  function formatMB(value) {
    const num = safeNumber(value, 0);
    if (!num) return "—";
    return `${formatNumber(num)} MB`;
  }

  function formatGB(value) {
    const num = safeNumber(value, 0);
    if (!num) return "—";
    return `${new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: num < 10 ? 2 : 1,
      maximumFractionDigits: 2,
    }).format(num)} GB`;
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

  function formatClock(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("es-ES", {
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

    if (
      ["ok", "up", "operativa", "operativo", "healthy", "online", "success"].includes(
        normalized
      )
    ) {
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

  function getLatencyLabel(ms) {
    const n = safeNumber(ms, 0);

    if (!n) return "No disponible";
    if (n <= 200) return "Muy rápida";
    if (n <= 500) return "Operativa";
    if (n <= 1000) return "Revisar";
    return "Lenta";
  }

  function getBrowserMemoryMetrics() {
    try {
      const mem = performance?.memory;

      if (!mem) {
        return {
          available: false,
          jsHeapUsedMB: null,
          jsHeapTotalMB: null,
          jsHeapLimitMB: null,
        };
      }

      return {
        available: true,
        jsHeapUsedMB: round2(mem.usedJSHeapSize / 1024 / 1024),
        jsHeapTotalMB: round2(mem.totalJSHeapSize / 1024 / 1024),
        jsHeapLimitMB: round2(mem.jsHeapSizeLimit / 1024 / 1024),
      };
    } catch {
      return {
        available: false,
        jsHeapUsedMB: null,
        jsHeapTotalMB: null,
        jsHeapLimitMB: null,
      };
    }
  }

  function getCpuStatusLabel(value) {
    const num = clamp(value, 0, 100);
    if (num >= 85) return "Alta";
    if (num >= 70) return "Elevada";
    if (num >= 40) return "Normal";
    return "Baja";
  }

  function getRamStatusLabel(value) {
    const num = clamp(value, 0, 100);
    if (num >= 90) return "Crítica";
    if (num >= 80) return "Muy alta";
    if (num >= 65) return "Moderada";
    return "Estable";
  }

  function stopAutoRefresh() {
    if (state.intervalId) {
      window.clearInterval(state.intervalId);
      state.intervalId = null;
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();

    if (!state.autoRefresh) return;

    state.intervalId = window.setInterval(() => {
      if (state.loading || state.refreshing) return;
      loadData({ silent: true });
    }, REFRESH_INTERVAL_MS);
  }

  function pushHistoryValue(bucket, value) {
    state.history[bucket].push(value);
    if (state.history[bucket].length > HISTORY_LIMIT) {
      state.history[bucket].shift();
    }
  }

  function pushHistorySnapshot() {
    const server = state.telemetry?.server || {};
    const api = state.telemetry?.api || {};
    const db = state.telemetry?.db || {};

    pushHistoryValue("cpu", server.cpuPercent ?? null);
    pushHistoryValue("ram", server.ramPercent ?? null);
    pushHistoryValue("apiLatency", api.latencyMs ?? null);
    pushHistoryValue("dbLatency", db.latencyMs ?? null);
    pushHistoryValue("timestamps", new Date().toISOString());
  }

  function buildSparklinePath(values = [], width = 100, height = 42, max = 100) {
    const filtered = values.map((v) => (v === null || v === undefined ? null : safeNumber(v, 0)));
    const valid = filtered.filter((v) => v !== null);

    if (!valid.length) return "";

    const top = 4;
    const bottom = height - 4;
    const usableHeight = Math.max(1, bottom - top);
    const step = filtered.length > 1 ? width / (filtered.length - 1) : width;

    return filtered
      .map((value, index) => {
        const x = round2(index * step);

        if (value === null) {
          return "";
        }

        const normalized = clamp(value, 0, max);
        const y = round2(bottom - (normalized / max) * usableHeight);

        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .filter(Boolean)
      .join(" ");
  }

  function renderMiniSparkline({
    title,
    values = [],
    valueLabel = "—",
    max = 100,
    tone = "neutral",
    subtitle = "",
  }) {
    const color = getToneColor(tone);
    const path = buildSparklinePath(values, 220, 54, max);
    const areaPath = path
      ? `${path} L 220 54 L 0 54 Z`
      : "";

    return `
      <article
        class="ui-card"
        style="
          padding:16px;
          display:grid;
          gap:12px;
          min-height:152px;
        "
      >
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
          <div style="display:grid; gap:4px;">
            <strong style="font-size:14px; color:var(--text-strong);">
              ${escapeHtml(title)}
            </strong>
            <span style="font-size:12px; color:var(--text-dim);">
              ${escapeHtml(subtitle)}
            </span>
          </div>

          <span
            style="
              display:inline-flex;
              align-items:center;
              justify-content:center;
              padding:6px 10px;
              border-radius:999px;
              background:color-mix(in srgb, ${color}, transparent 86%);
              color:${color};
              font-size:12px;
              font-weight:700;
              white-space:nowrap;
            "
          >
            ${escapeHtml(valueLabel)}
          </span>
        </div>

        <div
          style="
            position:relative;
            height:56px;
            border-radius:14px;
            border:1px solid var(--border-soft);
            background:
              linear-gradient(180deg, rgba(255,255,255,.025), transparent 100%),
              var(--surface-glass);
            overflow:hidden;
          "
        >
          <svg
            viewBox="0 0 220 54"
            preserveAspectRatio="none"
            style="width:100%; height:100%; display:block;"
            aria-hidden="true"
          >
            <path
              d="${escapeHtml(areaPath)}"
              fill="color-mix(in srgb, ${color}, transparent 88%)"
              stroke="none"
            ></path>

            <path
              d="${escapeHtml(path)}"
              fill="none"
              stroke="${color}"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            ></path>
          </svg>
        </div>
      </article>
    `;
  }

  function renderUsageRing({
    label,
    percent = null,
    sublabel = "",
    available = true,
  }) {
    if (!available || percent === null || percent === undefined) {
      return `
        <article class="ui-card" style="padding:18px; display:grid; gap:14px; place-items:center;">
          <strong style="font-size:15px; color:var(--text-strong);">${escapeHtml(label)}</strong>
          <div
            style="
              width:108px;
              height:108px;
              border-radius:50%;
              border:8px solid var(--surface-3);
              display:grid;
              place-items:center;
              color:var(--text-dim);
              font-weight:700;
            "
          >
            —
          </div>
          <span style="font-size:12px; color:var(--text-dim); text-align:center;">
            ${escapeHtml(sublabel || "No disponible")}
          </span>
        </article>
      `;
    }

    const value = clamp(percent, 0, 100);
    const tone = getPercentTone(value);
    const color = getToneColor(tone);

    return `
      <article class="ui-card" style="padding:18px; display:grid; gap:14px; place-items:center;">
        <strong style="font-size:15px; color:var(--text-strong);">${escapeHtml(label)}</strong>

        <div
          style="
            width:108px;
            height:108px;
            border-radius:50%;
            display:grid;
            place-items:center;
            background:
              radial-gradient(circle at center, var(--panel-bg) 55%, transparent 56%),
              conic-gradient(${color} 0 ${value}%, var(--surface-3) ${value}% 100%);
            box-shadow: inset 0 0 0 1px var(--border-soft);
          "
        >
          <div
            style="
              width:74px;
              height:74px;
              border-radius:50%;
              display:grid;
              place-items:center;
              background:var(--panel-bg);
              border:1px solid var(--border-soft);
              color:var(--text-strong);
              font-weight:800;
              font-size:18px;
            "
          >
            ${escapeHtml(`${Math.round(value)}%`)}
          </div>
        </div>

        <span style="font-size:12px; color:var(--text-dim); text-align:center;">
          ${escapeHtml(sublabel)}
        </span>
      </article>
    `;
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
    const connection =
      nav.connection || nav.mozConnection || nav.webkitConnection || null;

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
      browserMemory: getBrowserMemoryMetrics(),
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

  async function fetchHealth() {
    return AppCore.apiClient.get(ENDPOINTS.health, {
      timeout: 20000,
      auth: true,
    });
  }

  /* =========================================================
     TELEMETRY EXTRACTION
  ========================================================= */
  function extractTelemetry(dashboardPayload, healthPayload) {
    const dashboardMeta = dashboardPayload?.meta || {};
    const dashboardResumen = dashboardPayload?.resumen || {};
    const dashboardCharts = dashboardPayload?.charts || {};

    const api = healthPayload?.api || {};
    const db = healthPayload?.db || {};
    const system = healthPayload?.system || {};
    const runtime = healthPayload?.runtime || {};
    const environment = healthPayload?.environment || {};

    return {
      global: {
        ok: Boolean(healthPayload?.ok),
        status: safeString(healthPayload?.status, "unknown"),
        service: safeString(healthPayload?.service, "onion-backend"),
        timestamp: healthPayload?.timestamp || null,
      },

      dashboard: {
        generatedAt: dashboardMeta.generatedAt || null,
        scope: dashboardMeta.scope || null,
        isAdmin: Boolean(dashboardMeta.isAdmin),

        totalFacturas: safeNumber(dashboardResumen.totalFacturas, 0),
        totalFacturado: safeNumber(dashboardResumen.totalFacturado, 0),
        totalCobrado: safeNumber(dashboardResumen.totalCobrado, 0),
        totalPendiente: safeNumber(dashboardResumen.totalPendiente, 0),
        ticketsActivos: safeNumber(dashboardResumen.ticketsActivos, 0),
        ticketsUrgentes: safeNumber(dashboardResumen.ticketsUrgentes, 0),
        totalClientes: safeNumber(dashboardResumen.totalClientes, 0),
        totalUsuarios: safeNumber(dashboardResumen.totalUsuarios, 0),
        topClientesCount: Array.isArray(dashboardCharts?.topClientes)
          ? dashboardCharts.topClientes.length
          : 0,
      },

      api: {
        status: safeString(api.status, healthPayload?.ok ? "up" : "down"),
        latencyMs: safeNumber(api.latency, state.healthLatencyMs || 0),
        frontendLatencyMs: safeNumber(state.healthLatencyMs, 0) || null,
        label: getLatencyLabel(api.latency),
      },

      db: {
        status: safeString(db.status, "unknown"),
        latencyMs: db.latency ?? null,
        ok: Boolean(db.ok),
        errorMessage: safeString(db?.error?.message, ""),
      },

      server: {
        cpuPercent: system?.cpu?.usage ?? null,
        cpuLoad: system?.cpu?.load ?? null,
        cpuCores: system?.cpu?.cores ?? null,
        cpuModel: safeString(system?.cpu?.model, ""),
        cpuSpeedMHz: system?.cpu?.speedMHz ?? null,

        ramPercent: system?.ram?.usage ?? null,
        ramUsedMB: system?.ram?.usedMB ?? null,
        ramTotalMB: system?.ram?.totalMB ?? null,
        ramFreeMB: system?.ram?.freeMB ?? null,
        ramUsedGB: system?.ram?.usedGB ?? null,
        ramTotalGB: system?.ram?.totalGB ?? null,
        ramFreeGB: system?.ram?.freeGB ?? null,

        diskPercent: system?.disk?.percent ?? null,
        diskUsedGB: system?.disk?.usedGB ?? null,
        diskTotalGB: system?.disk?.totalGB ?? null,
        diskFreeGB: system?.disk?.freeGB ?? null,
        diskMount: safeString(system?.disk?.mount, ""),
        diskSource: safeString(system?.disk?.source, ""),
        diskModel: safeString(system?.disk?.info?.model, ""),
        diskVendor: safeString(system?.disk?.info?.vendor, ""),
        diskDevice: safeString(system?.disk?.info?.device, ""),
        diskMediaType: safeString(system?.disk?.info?.mediaType, ""),
        diskAvailable: Boolean(system?.disk?.info?.available),

        hostname: safeString(system?.host?.hostname, ""),
        osName: safeString(system?.host?.type, ""),
        osPlatform: safeString(system?.host?.platform, ""),
        osVersion: safeString(system?.host?.release, ""),
        arch: safeString(system?.host?.arch, ""),
        hostUptime: safeString(system?.host?.uptime, ""),
        processUptime: safeString(healthPayload?.uptime, ""),
        eventLoopLag: system?.eventLoop?.lag ?? null,
      },

      runtime: {
        nodeVersion: safeString(runtime?.process?.version, ""),
        nodePid: runtime?.process?.pid ?? null,
        nodeExecPath: safeString(runtime?.process?.execPath, ""),
        nodeCwd: safeString(runtime?.process?.cwd, ""),
        rssMB: runtime?.node?.rssMB ?? null,
        heapUsedMB: runtime?.node?.heapUsedMB ?? null,
        heapTotalMB: runtime?.node?.heapTotalMB ?? null,
        externalMB: runtime?.node?.externalMB ?? null,
        arrayBuffersMB: runtime?.node?.arrayBuffersMB ?? null,
        heapLimitMB: runtime?.v8?.heapLimitMB ?? null,
        mallocedMB: runtime?.v8?.mallocedMB ?? null,
      },

      environment: {
        env: safeString(environment?.env, ""),
        timezone: safeString(environment?.timezone, ""),
        azureSiteName: safeString(environment?.azure?.websiteSiteName, ""),
        azureHostname: safeString(environment?.azure?.websiteHostname, ""),
        azureInstanceId: safeString(environment?.azure?.websiteInstanceId, ""),
        azureRegion: safeString(environment?.azure?.regionName, ""),
        azureSku: safeString(environment?.azure?.sku, ""),
        containerHostname: safeString(environment?.container?.hostname, ""),
        inContainer: Boolean(environment?.container?.inContainer),
      },

      services: {
        api: {
          status: safeString(api.status, "unknown"),
          latencyMs: api.latency ?? null,
          detail: "Latencia reportada por el health interno.",
        },
        cosmos: {
          status: safeString(db.status, "unknown"),
          latencyMs: db.latency ?? null,
          detail: db?.error?.message
            ? `Error DB: ${db.error.message}`
            : "Comprobación real contra db.read()",
        },
        blob: {
          status: "No disponible",
          latencyMs: null,
          detail: "Aún no expuesto por health interno.",
        },
        web: {
          status: safeNumber(state.dashboardLatencyMs, 0)
            ? getLatencyLabel(state.dashboardLatencyMs)
            : "No disponible",
          latencyMs: state.dashboardLatencyMs,
          detail: "Medido desde frontend contra /api/dashboard",
        },
      },
    };
  }

  /* =========================================================
     LOAD
  ========================================================= */
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
      const dashboardStartedAt = performance.now();
      const dashboardPromise = fetchDashboard();

      const healthStartedAt = performance.now();
      const healthPromise = fetchHealth();

      const [dashboard, health] = await Promise.all([
        dashboardPromise,
        healthPromise,
      ]);

      const dashboardFinishedAt = performance.now();
      state.dashboardLatencyMs = round2(dashboardFinishedAt - dashboardStartedAt);

      const healthFinishedAt = performance.now();
      state.healthLatencyMs = round2(healthFinishedAt - healthStartedAt);

      state.dashboardPayload = dashboard || null;
      state.healthPayload = health || null;

      state.browserMetrics = getBrowserMetrics();
      state.environmentMetrics = getEnvironmentMetrics();
      state.telemetry = extractTelemetry(dashboard, health);

      pushHistorySnapshot();

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
      <span class="badge ${escapeHtml(tone)}" style="align-self:flex-start;">
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

  function metricProgressCard({
    label,
    value,
    hint,
    available = true,
    suffix = "%",
    rawValueLabel = null,
  }) {
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
            ${escapeHtml(rawValueLabel || `${numeric}${suffix}`)}
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
        <strong style="color:var(--text-strong); text-align:right; word-break:break-word;">
          ${escapeHtml(value)}
        </strong>
      </div>
    `;
  }

  function sectionCard(title, subtitle, bodyHtml) {
    return `
      <div class="panel-block" style="padding:20px; display:grid; gap:14px;">
        <div style="display:grid; gap:6px;">
          <h3 style="margin:0; font-size:18px;">${escapeHtml(title)}</h3>
          <p style="margin:0; color:var(--text-dim); font-size:13px;">
            ${escapeHtml(subtitle)}
          </p>
        </div>

        <div style="display:grid; gap:10px; font-size:13px;">
          ${bodyHtml}
        </div>
      </div>
    `;
  }

  /* =========================================================
     RENDER SECTIONS
  ========================================================= */
  function renderHeader() {
    const global = state.telemetry?.global || {};
    const dashboard = state.telemetry?.dashboard || {};
    const api = state.telemetry?.api || {};

    return `
      <section class="panel-block" style="padding:24px;">
        <div style="display:grid; gap:16px;">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:18px; flex-wrap:wrap;">
            <div style="display:grid; gap:8px;">
              <h2 style="margin:0;">Servidor</h2>
              <p style="margin:0; color:var(--text-dim); max-width:920px;">
                Observabilidad básica del entorno Onion: salud global, API, base de datos, CPU, RAM, disco,
                runtime Node/V8, host, entorno Azure y un mini administrador de tareas visual en tiempo real.
              </p>
            </div>

            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${statusBadge("Admin only", "info")}
              ${statusBadge(
                safeString(global.status, "unknown"),
                getStatusTone(global.status)
              )}
              ${statusBadge(
                safeString(api.status, "unknown"),
                getStatusTone(api.status)
              )}
            </div>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <span class="badge neutral">Servicio ${escapeHtml(global.service || "onion-backend")}</span>
            <span class="badge neutral">Dashboard ${escapeHtml(formatDateTime(dashboard.generatedAt))}</span>
            <span class="badge neutral">${escapeHtml(formatRelativeDate(dashboard.generatedAt))}</span>
            <span class="badge neutral">Scope ${escapeHtml(dashboard.scope || "—")}</span>
            <span class="badge neutral">Health frontend ${escapeHtml(formatMs(state.healthLatencyMs))}</span>
            <span class="badge neutral">Dashboard frontend ${escapeHtml(formatMs(state.dashboardLatencyMs))}</span>
          </div>
        </div>
      </section>
    `;
  }

  function renderControls() {
    return `
      <section class="panel-block" style="padding:18px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;">
          <div style="display:grid; gap:4px;">
            <strong style="font-size:15px; color:var(--text-strong);">Refresco en tiempo real</strong>
            <span style="font-size:12px; color:var(--text-dim);">
              Actualización automática cada ${Math.round(REFRESH_INTERVAL_MS / 1000)} s.
            </span>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button
              type="button"
              id="server-refresh-btn"
              class="ui-btn ui-btn-secondary"
              ${state.loading || state.refreshing ? "disabled" : ""}
            >
              ${state.refreshing ? "Actualizando..." : "Actualizar ahora"}
            </button>

            <button
              type="button"
              id="server-toggle-live-btn"
              class="ui-btn ${state.autoRefresh ? "ui-btn-primary" : "ui-btn-ghost"}"
            >
              ${state.autoRefresh ? "Tiempo real activo" : "Tiempo real pausado"}
            </button>
          </div>
        </div>
      </section>
    `;
  }

  function renderTopKpis() {
    const dashboard = state.telemetry?.dashboard || {};
    const api = state.telemetry?.api || {};
    const db = state.telemetry?.db || {};
    const server = state.telemetry?.server || {};

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
          value: formatNumber(dashboard.totalFacturas),
          hint: "Total visible en dashboard.",
          icon: "F",
        })}

        ${kpiCard({
          label: "Facturado",
          value: formatMoney(dashboard.totalFacturado || 0),
          hint: "Base agregada.",
          icon: "€",
        })}

        ${kpiCard({
          label: "API",
          value: formatMs(api.latencyMs),
          hint: api.label || "Latencia backend.",
          icon: "A",
        })}

        ${kpiCard({
          label: "Cosmos DB",
          value: formatMs(db.latencyMs),
          hint: db.status ? `Estado ${db.status}` : "Latencia db.read()",
          icon: "D",
        })}

        ${kpiCard({
          label: "Event loop",
          value: formatMs(server.eventLoopLag),
          hint: "Lag del loop de Node.",
          icon: "L",
        })}

        ${kpiCard({
          label: "Tickets activos",
          value: formatNumber(dashboard.ticketsActivos),
          hint: "Visibles en dashboard.",
          icon: "T",
        })}
      </section>
    `;
  }

  function renderSystemMetrics() {
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
          hint: server.cpuModel
            ? `${server.cpuModel} · ${server.cpuCores || "—"} core(s)`
            : "Carga del host según health interno.",
          available: server.cpuPercent !== null,
        })}

        ${metricProgressCard({
          label: "RAM servidor",
          value: server.ramPercent,
          hint:
            server.ramUsedGB !== null && server.ramTotalGB !== null
              ? `${formatGB(server.ramUsedGB)} / ${formatGB(server.ramTotalGB)}`
              : "Memoria del sistema.",
          available: server.ramPercent !== null,
        })}

        ${metricProgressCard({
          label: "Disco",
          value: server.diskPercent,
          hint:
            server.diskUsedGB !== null && server.diskTotalGB !== null
              ? `${formatGB(server.diskUsedGB)} / ${formatGB(server.diskTotalGB)}`
              : "Uso del storage principal.",
          available: server.diskPercent !== null,
        })}
      </section>
    `;
  }

  function renderLiveTaskManager() {
    const server = state.telemetry?.server || {};
    const api = state.telemetry?.api || {};
    const db = state.telemetry?.db || {};
    const runtime = state.telemetry?.runtime || {};
    const browserMemory = state.environmentMetrics?.browserMemory || {};

    return `
      <section class="panel-block" style="padding:22px; display:grid; gap:18px;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap;">
          <div style="display:grid; gap:6px;">
            <h3 style="margin:0; font-size:20px;">Mini administrador de tareas</h3>
            <p style="margin:0; color:var(--text-dim); font-size:13px; max-width:860px;">
              Monitor visual del backend y del navegador. Se actualiza en tiempo real y mantiene un histórico local
              de las últimas ${HISTORY_LIMIT} muestras.
            </p>
          </div>

          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${statusBadge(state.autoRefresh ? "Live ON" : "Live OFF", state.autoRefresh ? "success" : "neutral")}
            ${statusBadge(`Última muestra ${formatClock(state.history.timestamps.at(-1))}`, "neutral")}
          </div>
        </div>

        <div
          style="
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));
            gap:16px;
          "
        >
          ${renderUsageRing({
            label: "CPU",
            percent: server.cpuPercent,
            available: server.cpuPercent !== null,
            sublabel:
              server.cpuPercent !== null
                ? `${getCpuStatusLabel(server.cpuPercent)} · ${server.cpuCores || "—"} core(s)`
                : "Sin métrica",
          })}

          ${renderUsageRing({
            label: "RAM",
            percent: server.ramPercent,
            available: server.ramPercent !== null,
            sublabel:
              server.ramPercent !== null
                ? `${formatGB(server.ramUsedGB)} / ${formatGB(server.ramTotalGB)}`
                : "Sin métrica",
          })}

          ${renderUsageRing({
            label: "Disco",
            percent: server.diskPercent,
            available: server.diskPercent !== null,
            sublabel:
              server.diskPercent !== null
                ? `${formatGB(server.diskUsedGB)} / ${formatGB(server.diskTotalGB)}`
                : "Sin métrica",
          })}

          ${renderUsageRing({
            label: "Heap navegador",
            percent:
              browserMemory.available &&
              browserMemory.jsHeapUsedMB !== null &&
              browserMemory.jsHeapLimitMB
                ? round2((browserMemory.jsHeapUsedMB / browserMemory.jsHeapLimitMB) * 100)
                : null,
            available: Boolean(browserMemory.available),
            sublabel:
              browserMemory.available
                ? `${formatMB(browserMemory.jsHeapUsedMB)} / ${formatMB(browserMemory.jsHeapLimitMB)}`
                : "No soportado por este navegador",
          })}
        </div>

        <div
          style="
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));
            gap:16px;
          "
        >
          ${renderMiniSparkline({
            title: "CPU en tiempo real",
            values: state.history.cpu,
            valueLabel:
              server.cpuPercent !== null ? `${Math.round(server.cpuPercent)}%` : "—",
            tone: getPercentTone(server.cpuPercent || 0),
            subtitle:
              server.cpuPercent !== null
                ? `${server.cpuModel || "CPU"} · ${getCpuStatusLabel(server.cpuPercent)}`
                : "Sin datos",
          })}

          ${renderMiniSparkline({
            title: "RAM en tiempo real",
            values: state.history.ram,
            valueLabel:
              server.ramPercent !== null ? `${Math.round(server.ramPercent)}%` : "—",
            tone: getPercentTone(server.ramPercent || 0),
            subtitle:
              server.ramPercent !== null
                ? `${formatGB(server.ramUsedGB)} usadas de ${formatGB(server.ramTotalGB)}`
                : "Sin datos",
          })}

          ${renderMiniSparkline({
            title: "Latencia API",
            values: state.history.apiLatency,
            valueLabel: api.latencyMs ? formatMs(api.latencyMs) : "—",
            max: 2000,
            tone: getStatusTone(api.status),
            subtitle: "Health interno del backend",
          })}

          ${renderMiniSparkline({
            title: "Latencia Cosmos DB",
            values: state.history.dbLatency,
            valueLabel: db.latencyMs ? formatMs(db.latencyMs) : "—",
            max: 2000,
            tone: getStatusTone(db.status),
            subtitle: "db.read() real del backend",
          })}
        </div>

        <div
          style="
            display:grid;
            grid-template-columns:1.1fr .9fr;
            gap:16px;
          "
          class="server-view-grid-2"
        >
          <div class="ui-card" style="padding:18px; display:grid; gap:12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
              <strong style="font-size:15px; color:var(--text-strong);">Procesos clave</strong>
              <span style="font-size:12px; color:var(--text-dim);">Snapshot actual</span>
            </div>

            <div style="display:grid; gap:10px;">
              ${infoRow("Proceso Node", runtime.nodePid !== null ? `PID ${runtime.nodePid}` : "—")}
              ${infoRow("RSS proceso", formatMB(runtime.rssMB))}
              ${infoRow("Heap used", formatMB(runtime.heapUsedMB))}
              ${infoRow("Heap total", formatMB(runtime.heapTotalMB))}
              ${infoRow("External", formatMB(runtime.externalMB))}
              ${infoRow("Event loop", formatMs(server.eventLoopLag))}
              ${infoRow("CPU host", server.cpuPercent !== null ? `${Math.round(server.cpuPercent)}%` : "—")}
              ${infoRow("RAM host", server.ramPercent !== null ? `${Math.round(server.ramPercent)}%` : "—")}
            </div>
          </div>

          <div class="ui-card" style="padding:18px; display:grid; gap:12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
              <strong style="font-size:15px; color:var(--text-strong);">Capacidad</strong>
              <span style="font-size:12px; color:var(--text-dim);">Uso / total</span>
            </div>

            <div style="display:grid; gap:10px;">
              ${infoRow("RAM servidor", server.ramUsedGB !== null ? `${formatGB(server.ramUsedGB)} / ${formatGB(server.ramTotalGB)}` : "—")}
              ${infoRow("Disco servidor", server.diskUsedGB !== null ? `${formatGB(server.diskUsedGB)} / ${formatGB(server.diskTotalGB)}` : "—")}
              ${infoRow("Heap Node", runtime.heapUsedMB !== null ? `${formatMB(runtime.heapUsedMB)} / ${formatMB(runtime.heapTotalMB)}` : "—")}
              ${infoRow("Heap navegador", browserMemory.available ? `${formatMB(browserMemory.jsHeapUsedMB)} / ${formatMB(browserMemory.jsHeapLimitMB)}` : "No soportado")}
              ${infoRow("CPU model", server.cpuModel || "—")}
              ${infoRow("CPU speed", server.cpuSpeedMHz ? `${formatNumber(server.cpuSpeedMHz)} MHz` : "—")}
              ${infoRow("Cores", server.cpuCores !== null ? String(server.cpuCores) : "—")}
              ${infoRow("Node", runtime.nodeVersion || "—")}
            </div>
          </div>
        </div>
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
          title: "API interna",
          status: services.api?.status,
          latencyMs: services.api?.latencyMs,
          detail: services.api?.detail,
        })}

        ${serviceCard({
          title: "Cosmos DB",
          status: services.cosmos?.status,
          latencyMs: services.cosmos?.latencyMs,
          detail: services.cosmos?.detail,
        })}

        ${serviceCard({
          title: "Blob Storage",
          status: services.blob?.status,
          latencyMs: services.blob?.latencyMs,
          detail: services.blob?.detail,
        })}

        ${serviceCard({
          title: "Dashboard web",
          status: services.web?.status,
          latencyMs: services.web?.latencyMs,
          detail: services.web?.detail,
        })}
      </section>
    `;
  }

  function renderTechnicalGrid() {
    const browser = state.browserMetrics || {};
    const env = state.environmentMetrics || {};
    const server = state.telemetry?.server || {};
    const runtime = state.telemetry?.runtime || {};
    const environment = state.telemetry?.environment || {};
    const db = state.telemetry?.db || {};
    const browserMemory = env.browserMemory || {};

    return `
      <section
        style="
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:16px;
        "
        class="server-view-grid-2"
      >
        ${sectionCard(
          "Timings web",
          "Métricas reales del navegador para esta carga de la SPA.",
          `
            ${infoRow("TTFB navegador", formatMs(browser.ttfb))}
            ${infoRow("DOM ready", formatMs(browser.domReady))}
            ${infoRow("Load final", formatMs(browser.windowLoad))}
            ${infoRow("Payload transferido", browser.transferSize ? `${formatNumber(browser.transferSize)} B` : "—")}
            ${infoRow("Body codificado", browser.encodedBodySize ? `${formatNumber(browser.encodedBodySize)} B` : "—")}
            ${infoRow("Body decodificado", browser.decodedBodySize ? `${formatNumber(browser.decodedBodySize)} B` : "—")}
          `
        )}

        ${sectionCard(
          "Host y sistema",
          "Información del host obtenida desde el health interno.",
          `
            ${infoRow("Hostname", server.hostname || "—")}
            ${infoRow("SO", server.osName || "—")}
            ${infoRow("Platform", server.osPlatform || "—")}
            ${infoRow("Release", server.osVersion || "—")}
            ${infoRow("Arquitectura", server.arch || "—")}
            ${infoRow("Uptime host", server.hostUptime || "—")}
            ${infoRow("Uptime proceso", server.processUptime || "—")}
            ${infoRow("Event loop lag", formatMs(server.eventLoopLag))}
          `
        )}

        ${sectionCard(
          "Disco y storage",
          "Datos de disco expuestos por backend.",
          `
            ${infoRow("Mount", server.diskMount || "—")}
            ${infoRow("Total", formatGB(server.diskTotalGB))}
            ${infoRow("Usado", formatGB(server.diskUsedGB))}
            ${infoRow("Libre", formatGB(server.diskFreeGB))}
            ${infoRow("Origen métrica", server.diskSource || "—")}
            ${infoRow("Modelo disco", server.diskModel || "No disponible")}
            ${infoRow("Vendor disco", server.diskVendor || "No disponible")}
            ${infoRow("Device", server.diskDevice || "No disponible")}
            ${infoRow("Media type", server.diskMediaType || "No disponible")}
          `
        )}

        ${sectionCard(
          "Runtime Node / V8",
          "Estado interno del proceso Node.js.",
          `
            ${infoRow("Node version", runtime.nodeVersion || "—")}
            ${infoRow("PID", runtime.nodePid !== null ? String(runtime.nodePid) : "—")}
            ${infoRow("RSS", formatMB(runtime.rssMB))}
            ${infoRow("Heap used", formatMB(runtime.heapUsedMB))}
            ${infoRow("Heap total", formatMB(runtime.heapTotalMB))}
            ${infoRow("External", formatMB(runtime.externalMB))}
            ${infoRow("Array buffers", formatMB(runtime.arrayBuffersMB))}
            ${infoRow("Heap limit", formatMB(runtime.heapLimitMB))}
            ${infoRow("Malloced", formatMB(runtime.mallocedMB))}
          `
        )}

        ${sectionCard(
          "Entorno Azure / container",
          "Metadata útil del despliegue.",
          `
            ${infoRow("NODE_ENV", environment.env || "—")}
            ${infoRow("Timezone", environment.timezone || "—")}
            ${infoRow("Azure site", environment.azureSiteName || "No disponible")}
            ${infoRow("Azure hostname", environment.azureHostname || "No disponible")}
            ${infoRow("Azure instance", environment.azureInstanceId || "No disponible")}
            ${infoRow("Azure region", environment.azureRegion || "No disponible")}
            ${infoRow("Azure SKU", environment.azureSku || "No disponible")}
            ${infoRow("Container", environment.inContainer ? "Sí" : "No")}
            ${infoRow("Container hostname", environment.containerHostname || "—")}
          `
        )}

        ${sectionCard(
          "Frontend / navegador",
          "Datos visibles desde la SPA actual.",
          `
            ${infoRow("Plataforma navegador", env.platform || "—")}
            ${infoRow("Idioma", env.language || "—")}
            ${infoRow("Online", env.onLine === null ? "—" : env.onLine ? "Sí" : "No")}
            ${infoRow("deviceMemory", env.deviceMemory ? `${env.deviceMemory} GB` : "—")}
            ${infoRow("hardwareConcurrency", env.hardwareConcurrency ? `${env.hardwareConcurrency} hilos` : "—")}
            ${infoRow("Conexión", env.connectionType || "—")}
            ${infoRow("Downlink", env.downlink ? `${env.downlink} Mb/s` : "—")}
            ${infoRow("RTT", env.rtt ? `${env.rtt} ms` : "—")}
            ${infoRow("Heap navegador", browserMemory.available ? `${formatMB(browserMemory.jsHeapUsedMB)} / ${formatMB(browserMemory.jsHeapLimitMB)}` : "No soportado")}
            ${infoRow("DB status", db.status || "—")}
            ${infoRow("DB error", db.errorMessage || "—")}
          `
        )}
      </section>
    `;
  }

  function renderNotice() {
    return `
      <section class="ui-alert info">
        <div style="display:grid; gap:6px;">
          <strong style="color:var(--text-strong);">Vista conectada al health real</strong>
          <p style="margin:0; color:var(--text-dim); font-size:13px;">
            Este panel consume <strong>/api/health/internal</strong> y <strong>/api/dashboard</strong>.
            CPU, RAM, disco, host, runtime, DB y entorno proceden del backend.
            Los gráficos en tiempo real se mantienen en memoria local del navegador y no requieren librerías externas.
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
            Preparando dashboard, health interno, métricas del host, gráficas en tiempo real y timings de la SPA.
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
        ${renderControls()}
        ${renderTopKpis()}
        ${renderLiveTaskManager()}
        ${renderSystemMetrics()}
        ${renderServices()}
        ${renderTechnicalGrid()}
        ${renderNotice()}
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

    if (state.error && !state.dashboardPayload && !state.healthPayload) {
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
    const toggleLiveBtn = document.getElementById("server-toggle-live-btn");

    if (refreshBtn) {
      AppCore.cleanup.on(scope, refreshBtn, "click", async () => {
        if (state.loading || state.refreshing) return;
        await loadData({ silent: false });
      });
    }

    if (toggleLiveBtn) {
      AppCore.cleanup.on(scope, toggleLiveBtn, "click", () => {
        state.autoRefresh = !state.autoRefresh;

        if (state.autoRefresh) {
          startAutoRefresh();
        } else {
          stopAutoRefresh();
        }

        render();
      });
    }

    AppCore.cleanup.add(scope, () => {
      if (!state.autoRefresh) {
        stopAutoRefresh();
      }
    });

    if (!state.bootstrapped) {
      state.bootstrapped = true;
      loadData();
      startAutoRefresh();
    } else {
      startAutoRefresh();
    }
  }

  return {
    render,
    loadData,
  };
})();
