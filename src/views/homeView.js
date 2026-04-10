/* =========================================================
   Onion SPA - Home View (LEAN PRO SAAS PANEL)
   Archivo: src/views/homeView.js

   Objetivo actual:
   - simplificar al máximo
   - pintar SOLO:
     - total facturado
     - total pendiente
   - en columnas horizontales por meses (Ene, Feb, Mar...)
   - respetar layout base real
   - mantener carga desde backend dashboard
========================================================= */

import { AppCore } from "../core/core.js";
import { Store } from "../store/store.js";

export const HomeView = (() => {
  "use strict";

  const SCOPE = "view:home";

  const ENDPOINTS = {
    dashboard: "/api/dashboard",
  };

  const localState = {
    loading: false,
    loaded: false,
    error: null,
    refreshing: false,
    bootstrapped: false,
    dashboard: null,
  };

  /* =========================================================
     HELPERS SAFE
  ========================================================= */
  function safeGet(path, fallback = null) {
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

  function safeSubscribe(path, cb) {
    try {
      if (typeof Store?.subscribeKey === "function") {
        return Store.subscribeKey(path, cb);
      }
    } catch {
      /* noop */
    }

    return () => {};
  }

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

  function formatMoney(value) {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(safeNumber(value));
  }

  function formatShortMonthLabel(value = "") {
    const map = {
      ene: "Ene",
      enero: "Ene",
      feb: "Feb",
      febrero: "Feb",
      mar: "Mar",
      marzo: "Mar",
      abr: "Abr",
      abril: "Abr",
      may: "May",
      mayo: "May",
      jun: "Jun",
      junio: "Jun",
      jul: "Jul",
      julio: "Jul",
      ago: "Ago",
      agosto: "Ago",
      sep: "Sep",
      sept: "Sep",
      septiembre: "Sep",
      oct: "Oct",
      octubre: "Oct",
      nov: "Nov",
      noviembre: "Nov",
      dic: "Dic",
      diciembre: "Dic",
    };

    const key = safeString(value).toLowerCase();
    if (map[key]) return map[key];

    return safeString(value, "—").slice(0, 3);
  }

  function getDashboard() {
    return localState.dashboard || safeGet("dashboard.summary", null) || null;
  }

  /* =========================================================
     REQUESTS
  ========================================================= */
  async function fetchDashboard() {
    return AppCore.apiClient.get(ENDPOINTS.dashboard, {
      timeout: 15000,
      auth: true,
    });
  }

  async function loadDashboard({ silent = false } = {}) {
    if (!silent) {
      localState.loading = true;
      localState.error = null;
      render();
    } else {
      localState.refreshing = true;
      render();
    }

    try {
      const dashboardResponse = await fetchDashboard();
      const data = dashboardResponse?.data || dashboardResponse || {};

      localState.dashboard = data;
      localState.loading = false;
      localState.refreshing = false;
      localState.loaded = true;
      localState.error = null;

      safeSet("dashboard.summary", data);

      render();
    } catch (error) {
      localState.loading = false;
      localState.refreshing = false;
      localState.loaded = true;
      localState.error =
        error?.data?.message ||
        error?.message ||
        "No se pudo cargar el dashboard.";

      render();
    }
  }

  /* =========================================================
     DATA PREP
  ========================================================= */
  function getMonthlySeries() {
    const dashboard = getDashboard();
    const charts = dashboard?.charts || {};
    const monthly = Array.isArray(charts?.evolucionMensual)
      ? charts.evolucionMensual
      : [];

    return monthly.slice(-12).map((item) => ({
      label: formatShortMonthLabel(item?.mes || "—"),
      facturado: safeNumber(item?.cobrado, 0),
      pendiente: safeNumber(item?.pendiente, 0),
    }));
  }

  function getSeriesMax(series = []) {
    const max = Math.max(
      1,
      ...series.flatMap((item) => [
        safeNumber(item?.facturado, 0),
        safeNumber(item?.pendiente, 0),
      ])
    );

    return max;
  }

  /* =========================================================
     UI
  ========================================================= */
  function renderError() {
    if (!localState.error) return "";

    return `
      <section class="panel-surface">
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <h3 class="empty-state-title">No se pudo cargar el dashboard</h3>
          <p class="empty-state-text">${escapeHtml(localState.error)}</p>
        </div>
      </section>
    `;
  }

  function renderLoading() {
    return `
      <section class="panel-surface">
        <div class="empty-state">
          <div class="empty-state-icon">⏳</div>
          <h3 class="empty-state-title">Cargando resumen financiero</h3>
          <p class="empty-state-text">Preparando datos mensuales de facturado y pendiente.</p>
        </div>
      </section>
    `;
  }

  function renderFinanceColumns() {
    const series = getMonthlySeries();

    if (!series.length) {
      return `
        <section class="panel-surface">
          <div class="empty-state">
            <div class="empty-state-icon">📊</div>
            <h3 class="empty-state-title">Sin datos mensuales</h3>
            <p class="empty-state-text">
              El backend todavía no devuelve evolución mensual suficiente para pintar las columnas.
            </p>
          </div>
        </section>
      `;
    }

    const max = getSeriesMax(series);

    return `
      <section class="panel-surface" style="overflow:hidden;">
        <div style="
          display:grid;
          gap:var(--space-lg);
          padding:var(--space-xl);
        ">
          <div class="section-header">
            <div class="section-header-main">
              <h2 class="section-title">Resumen financiero mensual</h2>
              <p class="section-subtitle">
                Total facturado y total pendiente por mes
              </p>
            </div>

            <div class="section-actions">
              <button
                type="button"
                id="home-refresh-btn"
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
                ${localState.refreshing ? "Actualizando..." : "Actualizar"}
              </button>
            </div>
          </div>

          <div style="
            display:grid;
            gap:var(--space-md);
            overflow-x:auto;
            padding-bottom:var(--space-xs);
          ">
            <div style="
              display:grid;
              grid-template-columns:repeat(${series.length}, minmax(90px, 1fr));
              gap:var(--space-md);
              align-items:end;
              min-width:${Math.max(series.length * 90, 640)}px;
              min-height:340px;
              padding-top:var(--space-sm);
            ">
              ${series
                .map((item) => {
                  const facturadoHeight = Math.max(
                    10,
                    (safeNumber(item.facturado, 0) / max) * 220
                  );

                  const pendienteHeight = Math.max(
                    10,
                    (safeNumber(item.pendiente, 0) / max) * 220
                  );

                  return `
                    <article style="
                      display:grid;
                      gap:var(--space-sm);
                      align-items:end;
                      min-width:0;
                    ">
                      <div style="
                        display:grid;
                        grid-template-columns:1fr 1fr;
                        gap:8px;
                        align-items:end;
                        min-height:260px;
                      ">
                        <div style="
                          display:grid;
                          gap:8px;
                          align-content:end;
                          justify-items:center;
                          min-height:260px;
                        ">
                          <span style="
                            font-size:var(--font-xs);
                            color:var(--text-dim);
                            text-align:center;
                            line-height:1.2;
                          ">
                            ${escapeHtml(formatMoney(item.facturado))}
                          </span>

                          <div style="
                            width:100%;
                            max-width:34px;
                            height:${facturadoHeight}px;
                            border-radius:14px 14px 10px 10px;
                            background:var(--gradient-success);
                            box-shadow:0 10px 24px rgba(0,0,0,.18);
                          "></div>
                        </div>

                        <div style="
                          display:grid;
                          gap:8px;
                          align-content:end;
                          justify-items:center;
                          min-height:260px;
                        ">
                          <span style="
                            font-size:var(--font-xs);
                            color:var(--text-dim);
                            text-align:center;
                            line-height:1.2;
                          ">
                            ${escapeHtml(formatMoney(item.pendiente))}
                          </span>

                          <div style="
                            width:100%;
                            max-width:34px;
                            height:${pendienteHeight}px;
                            border-radius:14px 14px 10px 10px;
                            background:var(--gradient-error);
                            box-shadow:0 10px 24px rgba(0,0,0,.18);
                          "></div>
                        </div>
                      </div>

                      <div style="
                        display:grid;
                        gap:4px;
                        justify-items:center;
                        padding-top:4px;
                      ">
                        <strong style="
                          font-size:var(--font-sm);
                          color:var(--text-strong);
                        ">
                          ${escapeHtml(item.label)}
                        </strong>

                        <div style="
                          display:flex;
                          gap:6px;
                          flex-wrap:wrap;
                          justify-content:center;
                        ">
                          <span style="
                            display:inline-flex;
                            align-items:center;
                            justify-content:center;
                            min-height:24px;
                            padding:4px 8px;
                            border-radius:999px;
                            background:var(--success-bg);
                            border:1px solid var(--border-success);
                            color:var(--text-soft);
                            font-size:11px;
                            font-weight:700;
                          ">
                            F
                          </span>

                          <span style="
                            display:inline-flex;
                            align-items:center;
                            justify-content:center;
                            min-height:24px;
                            padding:4px 8px;
                            border-radius:999px;
                            background:var(--error-bg);
                            border:1px solid var(--border-error);
                            color:var(--text-soft);
                            font-size:11px;
                            font-weight:700;
                          ">
                            P
                          </span>
                        </div>
                      </div>
                    </article>
                  `;
                })
                .join("")}
            </div>

            <div style="
              display:flex;
              align-items:center;
              gap:var(--space-sm);
              flex-wrap:wrap;
            ">
              <span style="
                display:inline-flex;
                align-items:center;
                gap:8px;
                font-size:var(--font-sm);
                color:var(--text-dim);
              ">
                <span style="
                  width:12px;
                  height:12px;
                  border-radius:999px;
                  background:var(--gradient-success);
                  display:inline-block;
                "></span>
                Facturado
              </span>

              <span style="
                display:inline-flex;
                align-items:center;
                gap:8px;
                font-size:var(--font-sm);
                color:var(--text-dim);
              ">
                <span style="
                  width:12px;
                  height:12px;
                  border-radius:999px;
                  background:var(--gradient-error);
                  display:inline-block;
                "></span>
                Pendiente
              </span>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  /* =========================================================
     RENDER
  ========================================================= */
  function render() {
    const el = getContainer();
    if (!el) return;

    AppCore.cleanup.run(SCOPE);
    AppCore.setDocumentTitle("Onion Support");
    AppCore.clearDynamicContainers?.();

    el.innerHTML = `
      <section class="panel-content dashboard ready">
        <div class="content-wrapper">
          ${renderError()}
          ${localState.loading && !localState.loaded ? renderLoading() : ""}
          ${renderFinanceColumns()}
        </div>
      </section>
    `;

    bind();
  }

  /* =========================================================
     BIND
  ========================================================= */
  function bind() {
    const scope = AppCore.cleanup.scope(SCOPE);

    const refreshBtn = document.getElementById("home-refresh-btn");

    if (refreshBtn) {
      AppCore.cleanup.on(scope, refreshBtn, "click", async () => {
        if (localState.refreshing || localState.loading) return;
        await loadDashboard({ silent: true });
      });
    }

    const unsubDashboard = safeSubscribe("dashboard.summary", () => {
      if (!localState.loading) {
        render();
      }
    });

    AppCore.cleanup.add(scope, unsubDashboard);

    if (!localState.bootstrapped) {
      localState.bootstrapped = true;
      loadDashboard();
    }
  }

  return {
    render,
    loadDashboard,
  };
})();
