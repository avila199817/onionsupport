/* =========================================================
   Onion SPA - Home View (PRO SAFE)
   Archivo: src/views/homeView.js

   Nivel:
   - SAFE (no rompe si Store falla)
   - NO loops de render
   - Cleanup robusto
   - SaaS panel UI 10/10

   Responsabilidades:
   - dashboard principal
   - KPIs
   - accesos rápidos
   - actividad mock
   - sync con estado sin romper
========================================================= */

import { AppCore } from "../core/core.js";
import { Store } from "../store/store.js";

export const HomeView = (() => {
  "use strict";

  const SCOPE = "view:home";
  let subscriptionsBound = false;

  /* =========================================================
     HELPERS SAFE
  ========================================================= */
  function safeGet(path, fallback = []) {
    try {
      if (typeof Store?.get === "function") {
        return Store.get(path) ?? fallback;
      }
    } catch {}
    return fallback;
  }

  function safeSubscribe(path, cb) {
    try {
      if (typeof Store?.subscribeKey === "function") {
        return Store.subscribeKey(path, cb);
      }
    } catch {}
    return () => {};
  }

  function getContainer() {
    return AppCore.dom.viewContainer;
  }

  function escapeHtml(v = "") {
    return AppCore.utils.escapeHtml(String(v ?? ""));
  }

  function getUserDisplayName() {
    const u = AppCore.state.user;
    return u?.name || u?.username || u?.email || "Usuario";
  }

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 20) return "Buenas tardes";
    return "Buenas noches";
  }

  function getStats() {
    const incidencias = safeGet("entities.incidencias");
    const facturas = safeGet("entities.facturas");
    const usuarios = safeGet("entities.usuarios");
    const clientes = safeGet("entities.clientes");

    return {
      incidencias: incidencias.length,
      facturas: facturas.length,
      usuarios: usuarios.length,
      clientes: clientes.length,
    };
  }

  /* =========================================================
     COMPONENTES UI
  ========================================================= */
  function statCard(label, value, icon) {
    return `
      <div class="panel-block stat-card">
        <div class="stat-top">
          <span>${escapeHtml(label)}</span>
          <span class="stat-icon">${icon}</span>
        </div>
        <div class="stat-value">${escapeHtml(value)}</div>
      </div>
    `;
  }

  function quickCard(title, path, icon) {
    return `
      <a href="${escapeHtml(path)}" data-spa class="quick-card">
        <span>${icon}</span>
        <strong>${escapeHtml(title)}</strong>
      </a>
    `;
  }

  function activityItem(title, desc, time) {
    return `
      <div class="activity-item">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(desc)}</p>
        </div>
        <span>${escapeHtml(time)}</span>
      </div>
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

    const stats = getStats();

    el.innerHTML = `
      <section class="home-view">

        <!-- HERO -->
        <div class="panel-block hero">
          <h2>${getGreeting()}, ${escapeHtml(getUserDisplayName())}</h2>
          <p>Panel principal de control</p>
        </div>

        <!-- STATS -->
        <div class="grid stats">
          ${statCard("Incidencias", stats.incidencias, "🛠")}
          ${statCard("Facturas", stats.facturas, "💳")}
          ${statCard("Usuarios", stats.usuarios, "👥")}
          ${statCard("Clientes", stats.clientes, "🏢")}
        </div>

        <!-- QUICK -->
        <div class="grid quick">
          ${quickCard("Incidencias", "/incidencias", "🎫")}
          ${quickCard("Facturas", "/facturas", "🧾")}
          ${quickCard("Cuenta", "/cuenta", "👤")}
          ${quickCard("Ajustes", "/ajustes", "⚙️")}
        </div>

        <!-- ACTIVITY -->
        <div class="panel-block">
          <h3>Actividad</h3>
          ${activityItem("Login correcto", "Sesión iniciada", "Ahora")}
          ${activityItem("Dashboard", "Vista cargada", "Hace 1 min")}
        </div>

      </section>
    `;

    bind();
  }

  /* =========================================================
     BIND SAFE (SIN LOOP)
  ========================================================= */
  function bind() {
    if (subscriptionsBound) return;
    subscriptionsBound = true;

    const scope = AppCore.cleanup.scope(SCOPE);

    const unsub1 = safeSubscribe("entities", () => render());
    const unsub2 = safeSubscribe("session", () => render());

    AppCore.cleanup.add(scope, unsub1);
    AppCore.cleanup.add(scope, unsub2);
  }

  return {
    render,
  };
})();
