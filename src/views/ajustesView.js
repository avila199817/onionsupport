/* =========================================================
   Onion SPA - Ajustes View (LEAN PRO SAAS PANEL)
   Archivo: src/views/ajustesView.js

   Objetivo actual:
   - vista mínima de ajustes
   - mostrar únicamente cambio de contraseña
   - mantener consistencia con el shell SaaS
   - cero ruido
   - lista para conectar backend después
========================================================= */

import { AppCore } from "../core/core.js";

export const AjustesView = (() => {
  "use strict";

  const SCOPE = "view:ajustes";

  /* =========================================================
     HELPERS
  ========================================================= */
  function getContainer() {
    return AppCore.dom.viewContainer;
  }

  function escapeHtml(value = "") {
    return AppCore.utils.escapeHtml(String(value ?? ""));
  }

  /* =========================================================
     UI
  ========================================================= */
  function renderHeader() {
    return `
      <header class="page-header">
        <div class="page-header-main">
          <h1 class="page-title">Ajustes</h1>
          <p class="page-subtitle">
            Configuración básica de seguridad de la cuenta.
          </p>
        </div>
      </header>
    `;
  }

  function renderPasswordCard() {
    return `
      <section class="grid cols-auto">
        <article
          class="card-surface"
          style="
            display:grid;
            gap:var(--space-lg);
            padding:var(--space-xl);
          "
        >
          <div style="
            display:flex;
            align-items:flex-start;
            justify-content:space-between;
            gap:var(--space-md);
            flex-wrap:wrap;
          ">
            <div style="display:grid; gap:var(--space-xs); min-width:0;">
              <span style="
                display:inline-flex;
                align-items:center;
                gap:8px;
                font-size:var(--font-sm);
                color:var(--text-dim);
                font-weight:var(--weight-semibold);
                letter-spacing:var(--letter-wide);
              ">
                SEGURIDAD
              </span>

              <h2 style="
                margin:0;
                font-size:var(--font-xl);
                line-height:var(--line-snug);
                color:var(--text-strong);
                font-weight:var(--weight-black);
              ">
                Cambiar contraseña
              </h2>
            </div>

            <div style="
              inline-size:52px;
              block-size:52px;
              display:grid;
              place-items:center;
              border-radius:var(--radius-xl);
              border:1px solid var(--border-soft);
              background:var(--avatar-bg);
              color:var(--avatar-text);
              font-size:22px;
              box-shadow:var(--shadow-xs);
              flex:0 0 auto;
            ">
              🔐
            </div>
          </div>

          <p style="
            margin:0;
            font-size:var(--font-md);
            line-height:var(--line-relaxed);
            color:var(--text-muted);
          ">
            Desde aquí podrás actualizar tu contraseña de acceso.
          </p>

          <div style="
            display:grid;
            gap:var(--space-sm);
            padding:var(--space-lg);
            border-radius:var(--radius-xl);
            border:1px solid var(--border-soft);
            background:var(--surface-glass);
            box-shadow:var(--shadow-inner);
          ">
            <div style="
              display:grid;
              gap:4px;
            ">
              <strong style="
                font-size:var(--font-lg);
                color:var(--text-strong);
                font-weight:var(--weight-bold);
              ">
                Próximamente conectable
              </strong>

              <span style="
                font-size:var(--font-sm);
                color:var(--text-dim);
                line-height:var(--line-normal);
              ">
                Esta vista ya está preparada para montar el formulario de cambio de contraseña cuando conectes el endpoint.
              </span>
            </div>
          </div>

          <div style="
            display:flex;
            align-items:center;
            gap:var(--space-sm);
            flex-wrap:wrap;
          ">
            <button
              type="button"
              id="ajustes-change-password-btn"
              style="
                min-height:var(--btn-height);
                padding:0 18px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-primary-border);
                background:var(--btn-primary-bg);
                color:var(--btn-primary-text);
                box-shadow:var(--btn-primary-shadow);
                font-size:var(--font-md);
                font-weight:var(--weight-bold);
                cursor:pointer;
              "
            >
              Cambiar contraseña
            </button>
          </div>
        </article>
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
    AppCore.setDocumentTitle("Ajustes");
    AppCore.clearDynamicContainers?.();

    container.innerHTML = `
      <section class="panel-content dashboard ready">
        <div class="content-wrapper">
          ${renderHeader()}
          ${renderPasswordCard()}
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
    const changePasswordBtn = document.getElementById("ajustes-change-password-btn");

    if (changePasswordBtn) {
      AppCore.cleanup.on(scope, changePasswordBtn, "click", () => {
        AppCore.utils?.toast?.info?.("Aquí irá el flujo de cambio de contraseña.");
      });
    }
  }

  return {
    render,
  };
})();
