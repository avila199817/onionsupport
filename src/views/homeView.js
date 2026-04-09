/* =========================================================
   Onion SPA - Home View (FULL PRO SAAS PANEL · GOD MODE)
   Archivo: src/views/homeView.js

   Nivel:
   - SAFE
   - sin loops de render
   - cleanup robusto
   - conectado con backend dashboard
   - UI SaaS panel 10/10

   Responsabilidades:
   - dashboard principal
   - carga de KPIs reales desde backend
   - resumen financiero / tickets
   - charts visuales sin librerías externas
   - accesos rápidos
   - actividad reciente útil
   - sync seguro con Store y AppCore
========================================================= */

import { AppCore } from "../core/core.js";
import { Store } from "../store/store.js";

export const HomeView = (() => {
  "use strict";

  const SCOPE = "view:home";

  const ENDPOINTS = {
    dashboard: "/api/dashboard",
    tickets: "/api/tickets?limit=8",
  };

  const localState = {
    loading: false,
    loaded: false,
    error: null,
    refreshing: false,
    bootstrapped: false,

    dashboard: null,
    recentTickets: [],
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

  function safeSubscribe(path, cb) {
    try {
      if (typeof Store?.subscribeKey === "function") {
        return Store.subscribeKey(path, cb);
      }
    } catch {
      /* no-op */
    }
    return () => {};
  }

  function getContainer() {
    return AppCore.dom.viewContainer;
  }

  function escapeHtml(v = "") {
    return AppCore.utils.escapeHtml(String(v ?? ""));
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

  function truncate(value = "", max = 120) {
    const text = safeString(value);
    if (text.length <= max) return text;
    return `${text.slice(0, max).trim()}…`;
  }

  function getUserDisplayName() {
    const u = AppCore.state.user;
    return u?.name || u?.username || u?.email || "Usuario";
  }

  function getUserRoleLabel() {
    const role = String(AppCore.state.role || "").toLowerCase();

    if (role === "admin") return "Administrador";
    if (role === "agent") return "Agente";
    if (role === "user") return "Usuario";
    return "Cuenta activa";
  }

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 20) return "Buenas tardes";
    return "Buenas noches";
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(safeNumber(value));
  }

  function formatCompactNumber(value) {
    return new Intl.NumberFormat("es-ES", {
      notation: "compact",
      maximumFractionDigits: 1,
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

  function buildAvatar(name = "") {
    return String(name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2) || "ON";
  }

  function getDashboard() {
    return localState.dashboard || safeGet("dashboard.summary", null) || null;
  }

  function getDashboardResumen() {
    return getDashboard()?.resumen || {};
  }

  function getDashboardCharts() {
    return getDashboard()?.charts || {};
  }

  function getStatsFallback() {
    const incidencias = safeGet("entities.incidencias", []);
    const facturas = safeGet("entities.facturas", []);
    const usuarios = safeGet("entities.usuarios", []);
    const clientes = safeGet("entities.clientes", []);

    return {
      incidencias: incidencias.length,
      facturas: facturas.length,
      usuarios: usuarios.length,
      clientes: clientes.length,
    };
  }

  function normalizeTicket(item = {}) {
    return {
      id: item.id ?? item.ticketId ?? null,
      ticketId: item.ticketId ?? item.id ?? null,
      title:
        item.subject ??
        item.asunto ??
        item.title ??
        `Ticket ${item.ticketId || item.id || "—"}`,
      preview:
        item.preview ??
        item.descripcion ??
        item.message ??
        "",
      status: String(item.status || "open").toLowerCase(),
      priority: String(item.priority || "medium").toLowerCase(),
      client:
        item.cliente?.nombre ??
        item.name ??
        item.receptor?.name ??
        item.createdBy?.name ??
        "Usuario",
      createdAt: item.createdAt ?? null,
      updatedAt: item.updatedAt ?? item.closedAt ?? item.createdAt ?? null,
      attachmentsCount: safeNumber(item.attachmentsCount, 0),
      raw: item,
    };
  }

  function getRecentTickets() {
    const fromLocalState = Array.isArray(localState.recentTickets)
      ? localState.recentTickets
      : [];

    if (fromLocalState.length) return fromLocalState;

    const fromStore = safeGet("entities.incidencias", []);
    return Array.isArray(fromStore) ? fromStore.slice(0, 6) : [];
  }

  function getStatusLabel(status = "open") {
    const labels = {
      open: "Abierta",
      pending: "Pendiente",
      in_progress: "En proceso",
      resolved: "Resuelta",
      closed: "Cerrada",
    };

    return labels[status] || "Abierta";
  }

  function getPriorityLabel(priority = "medium") {
    const labels = {
      low: "Baja",
      medium: "Media",
      high: "Alta",
      urgent: "Urgente",
    };

    return labels[priority] || "Media";
  }

  function getStatusTone(status = "open") {
    const tones = {
      open: "rgba(59,130,246,.16)",
      pending: "rgba(245,158,11,.16)",
      in_progress: "rgba(168,85,247,.16)",
      resolved: "rgba(34,197,94,.16)",
      closed: "rgba(107,114,128,.16)",
    };

    return tones[status] || "rgba(59,130,246,.16)";
  }

  function getPriorityTone(priority = "medium") {
    const tones = {
      low: "rgba(34,197,94,.16)",
      medium: "rgba(59,130,246,.16)",
      high: "rgba(245,158,11,.16)",
      urgent: "rgba(239,68,68,.16)",
    };

    return tones[priority] || "rgba(59,130,246,.16)";
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

  async function fetchRecentTickets() {
    try {
      const response = await AppCore.apiClient.get(ENDPOINTS.tickets, {
        timeout: 15000,
        auth: true,
      });

      const items = Array.isArray(response?.tickets)
        ? response.tickets
        : Array.isArray(response?.data?.tickets)
        ? response.data.tickets
        : [];

      return items.map(normalizeTicket);
    } catch {
      return [];
    }
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
      const [dashboardResponse, recentTickets] = await Promise.all([
        fetchDashboard(),
        fetchRecentTickets(),
      ]);

      const data = dashboardResponse?.data || dashboardResponse || {};

      localState.dashboard = data;
      localState.recentTickets = recentTickets;
      localState.loading = false;
      localState.refreshing = false;
      localState.loaded = true;
      localState.error = null;

      safeSet("dashboard.summary", data);
      safeSetCollection("incidencias", recentTickets);

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
     COMPONENTES UI
  ========================================================= */
  function statCard(label, value, hint, icon) {
    return `
      <article
        class="panel-block stat-card"
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

  function quickCard(title, path, icon, hint = "") {
    return `
      <a
        href="${escapeHtml(path)}"
        data-spa
        class="quick-card"
        style="
          display:grid;
          gap:10px;
          padding:18px;
          border-radius:18px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.03);
          text-decoration:none;
          color:inherit;
        "
      >
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <span style="font-size:22px;">${icon}</span>
          <span style="font-size:12px; opacity:.55;">Abrir</span>
        </div>

        <div style="display:grid; gap:4px;">
          <strong style="font-size:15px;">${escapeHtml(title)}</strong>
          <span style="font-size:13px; opacity:.68;">${escapeHtml(hint)}</span>
        </div>
      </a>
    `;
  }

  function activityItem(title, desc, time, badge = "") {
    return `
      <div
        class="activity-item"
        style="
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:16px;
          padding:14px 0;
          border-bottom:1px solid rgba(255,255,255,.06);
        "
      >
        <div style="display:grid; gap:5px; min-width:0;">
          <strong style="font-size:14px;">${escapeHtml(title)}</strong>
          <p style="margin:0; font-size:13px; opacity:.72;">${escapeHtml(desc)}</p>
        </div>

        <div style="display:grid; gap:6px; justify-items:end;">
          ${
            badge
              ? `<span
                  style="
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    padding:6px 10px;
                    border-radius:999px;
                    font-size:11px;
                    font-weight:700;
                    background:rgba(255,255,255,.06);
                    white-space:nowrap;
                  "
                >${escapeHtml(badge)}</span>`
              : ""
          }
          <span style="font-size:12px; opacity:.58; white-space:nowrap;">${escapeHtml(time)}</span>
        </div>
      </div>
    `;
  }

  function miniBarChart(items = [], valueKey = "value", color = "rgba(255,255,255,.18)") {
    if (!Array.isArray(items) || !items.length) {
      return `<div style="font-size:13px; opacity:.65;">Sin datos</div>`;
    }

    const max = Math.max(...items.map((item) => safeNumber(item?.[valueKey], 0)), 1);

    return `
      <div style="display:grid; gap:12px;">
        ${items
          .map((item) => {
            const value = safeNumber(item?.[valueKey], 0);
            const width = Math.max(4, (value / max) * 100);

            return `
              <div style="display:grid; gap:6px;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                  <span style="font-size:13px; opacity:.8;">${escapeHtml(item.label || item.mes || item.cliente || "—")}</span>
                  <strong style="font-size:13px;">${escapeHtml(item.displayValue || formatCompactNumber(value))}</strong>
                </div>

                <div
                  style="
                    height:10px;
                    border-radius:999px;
                    background:rgba(255,255,255,.06);
                    overflow:hidden;
                  "
                >
                  <span
                    style="
                      display:block;
                      width:${width}%;
                      height:100%;
                      border-radius:999px;
                      background:${color};
                    "
                  ></span>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  /* =========================================================
     DATA PREP
  ========================================================= */
  function getHomeMetrics() {
    const dashboard = getDashboard();
    const resumen = dashboard?.resumen || {};
    const charts = dashboard?.charts || {};
    const fallback = getStatsFallback();

    return {
      resumen,
      charts,
      fallback,
      totalFacturas:
        safeNumber(resumen.totalFacturas, fallback.facturas),
      totalClientes:
        safeNumber(resumen.totalClientes, fallback.clientes),
      totalUsuarios:
        safeNumber(resumen.totalUsuarios, fallback.usuarios),
      ticketsActivos:
        safeNumber(resumen.ticketsActivos, fallback.incidencias),
      ticketsUrgentes:
        safeNumber(resumen.ticketsUrgentes, 0),
      totalCobrado:
        safeNumber(resumen.totalCobrado, 0),
      totalPendiente:
        safeNumber(resumen.totalPendiente, 0),
      totalIVA:
        safeNumber(resumen.totalIVA, 0),
      totalIRPF:
        safeNumber(resumen.totalIRPF, 0),
      beneficioEstimado:
        safeNumber(resumen.beneficioEstimado, 0),
    };
  }

  function getTopClientsPrepared() {
    const top = getDashboardCharts()?.topClientes || [];

    return top.slice(0, 5).map((item) => ({
      label: item.cliente || "Cliente",
      value: safeNumber(item.totalBase, 0),
      displayValue: formatMoney(item.totalBase),
      cliente: item.cliente || "Cliente",
    }));
  }

  function getMonthlyPrepared() {
    const monthly = getDashboardCharts()?.evolucionMensual || [];

    return monthly.slice(-6).map((item) => ({
      label: item.mes || "—",
      mes: item.mes || "—",
      value: safeNumber(item.cobrado, 0),
      displayValue: formatMoney(item.cobrado),
    }));
  }

  function getStatusDistributionPrepared() {
    const distribution = getDashboardCharts()?.distribucionEstados || [];

    return distribution.map((item) => ({
      label: item.label || item.key || "Estado",
      value: safeNumber(item.amount, 0),
      displayValue: formatMoney(item.amount),
    }));
  }

  function getRecentActivity() {
    const tickets = getRecentTickets().slice(0, 6);

    if (tickets.length > 0) {
      return tickets.map((ticket) =>
        activityItem(
          ticket.title || `Ticket ${ticket.ticketId || ticket.id || "—"}`,
          `${ticket.client || "Usuario"} · ${truncate(ticket.preview || "Sin descripción", 88)}`,
          formatRelativeDate(ticket.updatedAt || ticket.createdAt),
          getPriorityLabel(ticket.priority)
        )
      );
    }

    return [
      activityItem("Sesión activa", "El panel principal está listo para trabajar.", "Ahora", getUserRoleLabel()),
      activityItem("Dashboard cargado", "Se ha montado la vista principal correctamente.", "Hace un momento", "OK"),
    ];
  }

  /* =========================================================
     RENDER PARTS
  ========================================================= */
  function renderHero() {
    const metrics = getHomeMetrics();
    const role = getUserRoleLabel();

    return `
      <section
        class="panel-block hero"
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
            <span style="font-size:13px; letter-spacing:.08em; text-transform:uppercase; opacity:.58;">
              ${escapeHtml(role)}
            </span>
            <h2 style="margin:0; font-size:30px;">
              ${escapeHtml(getGreeting())}, ${escapeHtml(getUserDisplayName())}
            </h2>
            <p style="margin:0; opacity:.74; max-width:860px;">
              Este es tu panel principal. Tienes
              <strong>${escapeHtml(String(metrics.ticketsActivos))}</strong> tickets activos,
              <strong>${escapeHtml(String(metrics.ticketsUrgentes))}</strong> urgentes
              y un total cobrado de
              <strong>${escapeHtml(formatMoney(metrics.totalCobrado))}</strong>.
            </p>
          </div>

          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <button
              type="button"
              id="home-refresh-btn"
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
              ${localState.refreshing ? "Actualizando..." : "Actualizar panel"}
            </button>

            <a
              href="/incidencias"
              data-spa
              style="
                display:inline-flex;
                align-items:center;
                justify-content:center;
                gap:8px;
                padding:12px 16px;
                border:1px solid rgba(255,255,255,.08);
                border-radius:14px;
                background:rgba(255,255,255,.04);
                color:inherit;
                text-decoration:none;
                font-weight:600;
              "
            >
              Ver incidencias
            </a>
          </div>
        </div>
      </section>
    `;
  }

  function renderStats() {
    const m = getHomeMetrics();

    return `
      <section
        class="grid stats"
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));
          gap:16px;
        "
      >
        ${statCard(
          "Tickets activos",
          m.ticketsActivos,
          "Incidencias abiertas o en curso",
          "🎫"
        )}

        ${statCard(
          "Tickets urgentes",
          m.ticketsUrgentes,
          "Priorización máxima",
          "🚨"
        )}

        ${statCard(
          "Cobrado",
          formatMoney(m.totalCobrado),
          "Importe total recibido",
          "💶"
        )}

        ${statCard(
          "Pendiente",
          formatMoney(m.totalPendiente),
          "Pendiente de cobro",
          "⏳"
        )}

        ${statCard(
          "Clientes",
          m.totalClientes,
          "Base de clientes visible",
          "🏢"
        )}

        ${statCard(
          "Usuarios",
          m.totalUsuarios,
          "Cuentas disponibles",
          "👥"
        )}
      </section>
    `;
  }

  function renderQuickActions() {
    return `
      <section
        class="grid quick"
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));
          gap:16px;
        "
      >
        ${quickCard("Incidencias", "/incidencias", "🎫", "Revisa tickets y prioridades")}
        ${quickCard("Facturas", "/facturas", "🧾", "Consulta cobros y documentos")}
        ${quickCard("Clientes", "/clientes", "🏢", "Gestiona cuentas y empresas")}
        ${quickCard("Usuarios", "/usuarios", "👥", "Administra accesos internos")}
        ${quickCard("Cuenta", "/cuenta", "👤", "Perfil, seguridad y sesión")}
        ${quickCard("Ajustes", "/ajustes", "⚙️", "Preferencias y configuración")}
      </section>
    `;
  }

  function renderFinancePanel() {
    const m = getHomeMetrics();

    return `
      <section
        style="
          display:grid;
          grid-template-columns:minmax(320px, 1.2fr) minmax(280px, .8fr);
          gap:18px;
        "
        class="home-finance-grid"
      >
        <article
          class="panel-block"
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
            <h3 style="margin:0; font-size:18px;">Evolución de cobro</h3>
            <span style="font-size:13px; opacity:.65;">Últimos meses</span>
          </div>

          ${miniBarChart(
            getMonthlyPrepared(),
            "value",
            "linear-gradient(90deg, rgba(59,130,246,.85), rgba(99,102,241,.85))"
          )}
        </article>

        <article
          class="panel-block"
          style="
            display:grid;
            gap:14px;
            padding:20px;
            border-radius:20px;
            border:1px solid rgba(255,255,255,.08);
            background:rgba(255,255,255,.03);
          "
        >
          <h3 style="margin:0; font-size:18px;">Resumen fiscal</h3>

          <div style="display:grid; gap:12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
              <span style="opacity:.72;">IVA</span>
              <strong>${escapeHtml(formatMoney(m.totalIVA))}</strong>
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
              <span style="opacity:.72;">IRPF</span>
              <strong>${escapeHtml(formatMoney(m.totalIRPF))}</strong>
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
              <span style="opacity:.72;">Beneficio estimado</span>
              <strong>${escapeHtml(formatMoney(m.beneficioEstimado))}</strong>
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
              <span style="opacity:.72;">Facturas</span>
              <strong>${escapeHtml(String(m.totalFacturas))}</strong>
            </div>
          </div>
        </article>
      </section>
    `;
  }

  function renderMiddleGrid() {
    return `
      <section
        style="
          display:grid;
          grid-template-columns:minmax(320px, 1fr) minmax(320px, 1fr);
          gap:18px;
        "
        class="home-middle-grid"
      >
        <article
          class="panel-block"
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
            <h3 style="margin:0; font-size:18px;">Top clientes</h3>
            <span style="font-size:13px; opacity:.65;">Mayor volumen base</span>
          </div>

          ${miniBarChart(
            getTopClientsPrepared(),
            "value",
            "linear-gradient(90deg, rgba(16,185,129,.85), rgba(34,197,94,.85))"
          )}
        </article>

        <article
          class="panel-block"
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
            <h3 style="margin:0; font-size:18px;">Distribución por estado</h3>
            <span style="font-size:13px; opacity:.65;">Facturación agregada</span>
          </div>

          ${miniBarChart(
            getStatusDistributionPrepared(),
            "value",
            "linear-gradient(90deg, rgba(245,158,11,.85), rgba(249,115,22,.85))"
          )}
        </article>
      </section>
    `;
  }

  function renderActivity() {
    return `
      <section
        class="panel-block"
        style="
          display:grid;
          gap:14px;
          padding:20px;
          border-radius:20px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.03);
        "
      >
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <h3 style="margin:0; font-size:18px;">Actividad reciente</h3>
          <span style="font-size:13px; opacity:.65;">Tickets recientes cargados desde backend</span>
        </div>

        <div style="display:grid;">
          ${getRecentActivity().join("")}
        </div>
      </section>
    `;
  }

  function renderError() {
    if (!localState.error) return "";

    return `
      <section
        class="panel-block"
        style="
          display:grid;
          gap:8px;
          padding:18px;
          border-radius:18px;
          border:1px solid rgba(255,107,107,.25);
          background:rgba(255,107,107,.08);
        "
      >
        <strong style="font-size:15px;">No se pudo cargar el dashboard</strong>
        <span style="font-size:13px; opacity:.8;">${escapeHtml(localState.error)}</span>
      </section>
    `;
  }

  function renderLoading() {
    return `
      <section
        class="panel-block"
        style="
          display:grid;
          gap:8px;
          padding:22px;
          border-radius:18px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.03);
        "
      >
        <strong style="font-size:16px;">Cargando panel principal…</strong>
        <span style="font-size:13px; opacity:.7;">Preparando KPIs, resúmenes y actividad reciente.</span>
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
      <section
        class="home-view"
        style="
          display:grid;
          gap:24px;
          padding:24px;
        "
      >
        ${renderHero()}
        ${renderError()}
        ${localState.loading && !localState.loaded ? renderLoading() : ""}
        ${renderStats()}
        ${renderQuickActions()}
        ${renderFinancePanel()}
        ${renderMiddleGrid()}
        ${renderActivity()}
      </section>
    `;

    bind();
  }

  /* =========================================================
     BIND SAFE
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

    const unsubUser = safeSubscribe("session", () => {
      render();
    });

    const unsubDashboard = safeSubscribe("dashboard.summary", () => {
      if (!localState.loading) {
        render();
      }
    });

    AppCore.cleanup.add(scope, unsubUser);
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
