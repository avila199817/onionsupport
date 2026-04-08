/* =========================================================
   Onion SPA - Home View
   Archivo: src/views/homeView.js

   Responsabilidades:
   - pintar el dashboard principal
   - mostrar KPIs base
   - mostrar accesos rápidos
   - mostrar actividad reciente mock/base
   - reaccionar al estado de sesión
   - mantener cleanup limpio por scope
========================================================= */

import { AppCore } from "../core/core.js";
import { Store } from "../store/store.js";

export const HomeView = (() => {
  "use strict";

  const SCOPE = "view:home";

  function getContainer() {
    return AppCore.dom.viewContainer;
  }

  function escapeHtml(value = "") {
    return AppCore.utils.escapeHtml(String(value ?? ""));
  }

  function getUserDisplayName() {
    const user = AppCore.state.user;

    return (
      user?.name ||
      user?.nombre ||
      user?.username ||
      user?.email ||
      "Usuario"
    );
  }

  function getUserRoleLabel() {
    const role = AppCore.state.role || "member";
    return AppCore.utils.capitalize(String(role));
  }

  function getGreeting() {
    const hour = new Date().getHours();

    if (hour < 12) return "Buenos días";
    if (hour < 20) return "Buenas tardes";
    return "Buenas noches";
  }

  function getStats() {
    const incidencias = Store.get("entities.incidencias") || [];
    const facturas = Store.get("entities.facturas") || [];
    const usuarios = Store.get("entities.usuarios") || [];
    const clientes = Store.get("entities.clientes") || [];

    return {
      incidenciasAbiertas: Array.isArray(incidencias) ? incidencias.length : 0,
      facturasPendientes: Array.isArray(facturas) ? facturas.length : 0,
      usuariosActivos: Array.isArray(usuarios) ? usuarios.length : 0,
      clientesTotales: Array.isArray(clientes) ? clientes.length : 0,
    };
  }

  function getRecentActivity() {
    return [
      {
        title: "Nueva incidencia registrada",
        description: "Se ha creado una nueva incidencia en el sistema.",
        time: "Hace 5 min",
      },
      {
        title: "Perfil actualizado",
        description: "Los datos del usuario fueron sincronizados correctamente.",
        time: "Hace 18 min",
      },
      {
        title: "Dashboard inicializado",
        description: "La aplicación ha cargado el panel principal.",
        time: "Hace 1 h",
      },
    ];
  }

  function statCard({ label, value, hint, icon }) {
    return `
      <article
        class="dashboard-stat-card"
        style="
          display:grid;
          gap:14px;
          padding:20px;
          border-radius:20px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.03);
          backdrop-filter:blur(10px);
          min-height:140px;
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
              font-size:18px;
            "
          >
            ${icon}
          </span>
        </div>

        <div style="display:grid; gap:6px;">
          <strong style="font-size:32px; line-height:1;">${escapeHtml(value)}</strong>
          <span style="font-size:13px; opacity:.65;">${escapeHtml(hint)}</span>
        </div>
      </article>
    `;
  }

  function quickActionCard({ title, description, href, icon }) {
    return `
      <a
        href="${escapeHtml(href)}"
        data-spa
        class="dashboard-quick-card"
        style="
          display:grid;
          gap:12px;
          padding:18px;
          border-radius:18px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.02);
          text-decoration:none;
          color:inherit;
          transition:transform .15s ease, border-color .15s ease;
        "
      >
        <div
          style="
            width:42px;
            height:42px;
            display:grid;
            place-items:center;
            border-radius:12px;
            border:1px solid rgba(255,255,255,.08);
            font-size:18px;
          "
        >
          ${icon}
        </div>

        <div style="display:grid; gap:6px;">
          <strong style="font-size:16px;">${escapeHtml(title)}</strong>
          <span style="font-size:13px; opacity:.72;">${escapeHtml(description)}</span>
        </div>
      </a>
    `;
  }

  function activityItem(item) {
    return `
      <article
        style="
          display:grid;
          gap:6px;
          padding:16px 0;
          border-bottom:1px solid rgba(255,255,255,.06);
        "
      >
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px;">
          <strong style="font-size:14px;">${escapeHtml(item.title)}</strong>
          <span style="font-size:12px; opacity:.6; white-space:nowrap;">${escapeHtml(item.time)}</span>
        </div>

        <p style="margin:0; font-size:13px; opacity:.72;">
          ${escapeHtml(item.description)}
        </p>
      </article>
    `;
  }

  function renderHeader() {
    return `
      <section
        class="dashboard-hero"
        style="
          display:grid;
          gap:20px;
          padding:24px;
          border-radius:24px;
          border:1px solid rgba(255,255,255,.08);
          background:
            radial-gradient(circle at top right, rgba(255,255,255,.08), transparent 35%),
            rgba(255,255,255,.03);
          backdrop-filter:blur(12px);
        "
      >
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:20px; flex-wrap:wrap;">
          <div style="display:grid; gap:10px;">
            <span
              style="
                display:inline-flex;
                align-items:center;
                gap:8px;
                width:max-content;
                padding:8px 12px;
                border-radius:999px;
                border:1px solid rgba(255,255,255,.08);
                font-size:12px;
                opacity:.85;
              "
            >
              <span style="width:8px; height:8px; border-radius:999px; background:currentColor; opacity:.8;"></span>
              Panel principal
            </span>

            <div>
              <h2 style="margin:0; font-size:34px; line-height:1.05;">
                ${escapeHtml(getGreeting())}, ${escapeHtml(getUserDisplayName())}
              </h2>
              <p style="margin:10px 0 0 0; font-size:15px; opacity:.74; max-width:760px;">
                Aquí tienes una visión rápida de tu espacio de trabajo. Controla incidencias,
                revisa facturas y accede a las áreas clave desde un único panel.
              </p>
            </div>
          </div>

          <div
            style="
              display:grid;
              gap:10px;
              min-width:220px;
              padding:16px;
              border-radius:18px;
              border:1px solid rgba(255,255,255,.08);
              background:rgba(255,255,255,.02);
            "
          >
            <span style="font-size:12px; opacity:.7;">Sesión activa</span>
            <strong style="font-size:18px;">${escapeHtml(getUserRoleLabel())}</strong>
            <span style="font-size:13px; opacity:.72;">
              ${AppCore.state.authenticated ? "Acceso autenticado" : "Modo invitado"}
            </span>
          </div>
        </div>

        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <a
            href="/incidencias"
            data-spa
            style="
              display:inline-flex;
              align-items:center;
              justify-content:center;
              padding:12px 16px;
              border-radius:14px;
              text-decoration:none;
              color:inherit;
              border:1px solid rgba(255,255,255,.08);
              background:rgba(255,255,255,.06);
              font-weight:600;
            "
          >
            Ver incidencias
          </a>

          <a
            href="/cuenta"
            data-spa
            style="
              display:inline-flex;
              align-items:center;
              justify-content:center;
              padding:12px 16px;
              border-radius:14px;
              text-decoration:none;
              color:inherit;
              border:1px solid rgba(255,255,255,.08);
              background:transparent;
              font-weight:600;
            "
          >
            Ir a cuenta
          </a>
        </div>
      </section>
    `;
  }

  function renderStats() {
    const stats = getStats();

    return `
      <section style="display:grid; gap:16px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;">
          <h3 style="margin:0; font-size:18px;">Resumen</h3>
          <span style="font-size:13px; opacity:.65;">Indicadores principales del panel</span>
        </div>

        <div
          class="dashboard-stats-grid"
          style="
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));
            gap:16px;
          "
        >
          ${statCard({
            label: "Incidencias abiertas",
            value: stats.incidenciasAbiertas,
            hint: "Casos visibles en el sistema",
            icon: "🛠️",
          })}

          ${statCard({
            label: "Facturas pendientes",
            value: stats.facturasPendientes,
            hint: "Documentos por revisar",
            icon: "🧾",
          })}

          ${statCard({
            label: "Usuarios activos",
            value: stats.usuariosActivos,
            hint: "Miembros cargados en memoria",
            icon: "👥",
          })}

          ${statCard({
            label: "Clientes totales",
            value: stats.clientesTotales,
            hint: "Base de clientes registrada",
            icon: "🏢",
          })}
        </div>
      </section>
    `;
  }

  function renderQuickActions() {
    return `
      <section style="display:grid; gap:16px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;">
          <h3 style="margin:0; font-size:18px;">Accesos rápidos</h3>
          <span style="font-size:13px; opacity:.65;">Atajos operativos del día a día</span>
        </div>

        <div
          class="dashboard-quick-grid"
          style="
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));
            gap:16px;
          "
        >
          ${quickActionCard({
            title: "Incidencias",
            description: "Consulta, busca y gestiona tickets.",
            href: "/incidencias",
            icon: "🎫",
          })}

          ${quickActionCard({
            title: "Facturas",
            description: "Revisa el estado de la facturación.",
            href: "/facturas",
            icon: "💳",
          })}

          ${quickActionCard({
            title: "Cuenta",
            description: "Actualiza tus datos y preferencias.",
            href: "/cuenta",
            icon: "👤",
          })}

          ${quickActionCard({
            title: "Ajustes",
            description: "Configura idioma, tema y opciones.",
            href: "/ajustes",
            icon: "⚙️",
          })}
        </div>
      </section>
    `;
  }

  function renderActivity() {
    const activity = getRecentActivity();

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
        <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;">
          <h3 style="margin:0; font-size:18px;">Actividad reciente</h3>
          <span style="font-size:13px; opacity:.65;">Últimos eventos del espacio de trabajo</span>
        </div>

        <div>
          ${activity.map(activityItem).join("")}
        </div>
      </section>
    `;
  }

  function renderInfoPanel() {
    return `
      <section
        style="
          display:grid;
          gap:16px;
          padding:20px;
          border-radius:20px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(255,255,255,.02);
        "
      >
        <div style="display:grid; gap:8px;">
          <h3 style="margin:0; font-size:18px;">Entorno</h3>
          <p style="margin:0; font-size:13px; opacity:.72;">
            Estado técnico rápido del panel actual.
          </p>
        </div>

        <div style="display:grid; gap:12px;">
          <div style="display:flex; justify-content:space-between; gap:12px; font-size:14px;">
            <span style="opacity:.7;">Aplicación</span>
            <strong>${escapeHtml(AppCore.config.appName)}</strong>
          </div>

          <div style="display:flex; justify-content:space-between; gap:12px; font-size:14px;">
            <span style="opacity:.7;">Versión</span>
            <strong>${escapeHtml(AppCore.config.version)}</strong>
          </div>

          <div style="display:flex; justify-content:space-between; gap:12px; font-size:14px;">
            <span style="opacity:.7;">Tema</span>
            <strong>${escapeHtml(AppCore.state.theme)}</strong>
          </div>

          <div style="display:flex; justify-content:space-between; gap:12px; font-size:14px;">
            <span style="opacity:.7;">Idioma</span>
            <strong>${escapeHtml(AppCore.state.lang)}</strong>
          </div>

          <div style="display:flex; justify-content:space-between; gap:12px; font-size:14px;">
            <span style="opacity:.7;">Ruta</span>
            <strong>${escapeHtml(AppCore.state.route)}</strong>
          </div>
        </div>
      </section>
    `;
  }

  function render() {
    const container = getContainer();
    if (!container) return;

    AppCore.cleanup.run(SCOPE);
    AppCore.setDocumentTitle("Onion Support");

    container.innerHTML = `
      <section
        class="home-view"
        style="
          display:grid;
          gap:24px;
          padding:24px;
        "
      >
        ${renderHeader()}
        ${renderStats()}

        <section
          style="
            display:grid;
            grid-template-columns:minmax(0, 1.5fr) minmax(280px, .9fr);
            gap:24px;
            align-items:start;
          "
          class="dashboard-lower-grid"
        >
          <div style="display:grid; gap:24px;">
            ${renderQuickActions()}
            ${renderActivity()}
          </div>

          <aside style="display:grid; gap:24px;">
            ${renderInfoPanel()}
          </aside>
        </section>
      </section>
    `;

    bind();
  }

  function bind() {
    const scope = AppCore.cleanup.scope(SCOPE);

    const unsubscribeTheme = Store.subscribeKey("ui.theme", () => {
      render();
    });

    const unsubscribeLang = Store.subscribeKey("ui.lang", () => {
      render();
    });

    const unsubscribeSession = Store.subscribeKey("session", () => {
      render();
    });

    const unsubscribeEntities = Store.subscribeKey("entities", () => {
      render();
    });

    AppCore.cleanup.add(scope, unsubscribeTheme);
    AppCore.cleanup.add(scope, unsubscribeLang);
    AppCore.cleanup.add(scope, unsubscribeSession);
    AppCore.cleanup.add(scope, unsubscribeEntities);
  }

  return {
    render,
  };
})();