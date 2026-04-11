/* =========================================================
   Onion SPA - Ajustes View (LEAN PRO SAAS PANEL)
   Archivo: src/views/ajustesView.js

   Objetivo actual:
   - vista mínima de ajustes
   - cambio de contraseña
   - cambio de idioma
   - consistencia visual SaaS panel
   - lista para backend
========================================================= */

import { AppCore } from "../core/core.js";
import { I18n } from "../i18n/index.js";

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

  function getCurrentLang() {
    try {
      return I18n.getLang();
    } catch {
      return AppCore.state?.lang || "es";
    }
  }

  function setLang(lang) {
    try {
      I18n.setLang(lang);
    } catch {
      AppCore.state.lang = lang;
    }
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
            Configuración básica de la cuenta y preferencias.
          </p>
        </div>
      </header>
    `;
  }

  function renderLanguageCard() {
    const current = getCurrentLang();

    return `
      <section class="grid cols-auto" style="margin-bottom:var(--space-lg);">
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
                IDIOMA
              </span>

              <h2 style="
                margin:0;
                font-size:var(--font-xl);
                line-height:var(--line-snug);
                color:var(--text-strong);
                font-weight:var(--weight-black);
              ">
                Cambiar idioma
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
              🌍
            </div>
          </div>

          <p style="
            margin:0;
            font-size:var(--font-md);
            line-height:var(--line-relaxed);
            color:var(--text-muted);
          ">
            Selecciona el idioma principal de la interfaz.
          </p>

          <div style="
            display:grid;
            gap:var(--space-md);
          ">
            <label style="
              display:grid;
              gap:8px;
            ">
              <span style="
                font-size:var(--font-sm);
                color:var(--text-dim);
                font-weight:var(--weight-semibold);
              ">
                Idioma disponible
              </span>

              <select
                id="ajustes-language-select"
                style="
                  min-height:46px;
                  padding:0 14px;
                  border-radius:var(--radius-lg);
                  border:1px solid var(--border-soft);
                  background:var(--surface-raised);
                  color:var(--text-strong);
                  font-size:var(--font-md);
                  outline:none;
                  cursor:pointer;
                "
              >
                <option value="es" ${current === "es" ? "selected" : ""}>
                  Español
                </option>

                <option value="en" ${current === "en" ? "selected" : ""}>
                  English
                </option>

                <option value="ca" ${current === "ca" ? "selected" : ""}>
                  Català
                </option>
              </select>
            </label>
          </div>
        </article>
      </section>
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
            <div style="display:grid; gap:4px;">
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
          ${renderLanguageCard()}
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

    const changePasswordBtn = document.getElementById(
      "ajustes-change-password-btn"
    );

    const languageSelect = document.getElementById(
      "ajustes-language-select"
    );

    if (changePasswordBtn) {
      AppCore.cleanup.on(scope, changePasswordBtn, "click", () => {
        AppCore.utils?.toast?.info?.(
          "Aquí irá el flujo de cambio de contraseña."
        );
      });
    }

    if (languageSelect) {
      AppCore.cleanup.on(scope, languageSelect, "change", (event) => {
        const nextLang = String(event.target.value || "es");

        setLang(nextLang);

        AppCore.utils?.toast?.success?.(
          "Idioma actualizado correctamente."
        );

        window.location.reload();
      });
    }
  }

  return {
    render,
  };
})();
