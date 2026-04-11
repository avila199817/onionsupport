/* =========================================================
   Onion SPA - Ajustes View (LEAN PRO SAAS PANEL)
   Archivo: src/views/ajustesView.js

   Objetivo actual:
   - vista mínima de ajustes
   - cambio de contraseña
   - cambio de idioma
   - consistencia visual SaaS panel
   - lista para backend
   - conectada a i18n real
   - cambio de idioma robusto sin romper la SPA
========================================================= */

import { AppCore } from "../core/index.js";
import { I18n } from "../i18n/index.js";

export const AjustesView = (() => {
  "use strict";

  const SCOPE = "view:ajustes";

  /* =========================================================
     HELPERS
  ========================================================= */
  function getContainer() {
    return AppCore.dom.viewContainer || null;
  }

  function escapeHtml(value = "") {
    return AppCore.utils.escapeHtml(
      String(value ?? "")
    );
  }

  function t(
    key,
    fallback = "",
    params = {}
  ) {
    try {
      return I18n.t(
        key,
        params,
        fallback
      );
    } catch {
      return fallback || key;
    }
  }

  function getCurrentLang() {
    try {
      return I18n.getLang();
    } catch {
      return (
        AppCore.state?.lang ||
        "es"
      );
    }
  }

  function getToast() {
    if (
      AppCore.modules?.has?.(
        "toast"
      )
    ) {
      return AppCore.modules.get(
        "toast"
      );
    }

    return null;
  }

  function showInfo(
    message,
    title = ""
  ) {
    const Toast = getToast();

    if (
      Toast &&
      typeof Toast.info ===
        "function"
    ) {
      Toast.info(message, {
        title,
      });
      return;
    }

    AppCore.utils.log(
      "[AjustesView][info]",
      title,
      message
    );
  }

  function showSuccess(
    message,
    title = ""
  ) {
    const Toast = getToast();

    if (
      Toast &&
      typeof Toast.success ===
        "function"
    ) {
      Toast.success(message, {
        title,
      });
      return;
    }

    AppCore.utils.log(
      "[AjustesView][success]",
      title,
      message
    );
  }

  function showError(
    message,
    title = ""
  ) {
    const Toast = getToast();

    if (
      Toast &&
      typeof Toast.error ===
        "function"
    ) {
      Toast.error(message, {
        title,
      });
      return;
    }

    AppCore.utils.error(
      "[AjustesView][error]",
      title,
      message
    );
  }

  function setLang(lang) {
    const nextLang = String(
      lang || "es"
    )
      .trim()
      .toLowerCase();

    try {
      return I18n.setLang(
        nextLang,
        {
          force: true,
          updateUi: true,
        }
      );
    } catch (error) {
      AppCore.utils.error(
        "[AjustesView] Error cambiando idioma",
        error
      );

      if (AppCore?.state) {
        AppCore.state.lang =
          nextLang;
      }

      return nextLang;
    }
  }

  /* =========================================================
     UI
  ========================================================= */
  function renderHeader() {
    return `
      <header class="page-header">
        <div class="page-header-main">
          <h1 class="page-title">
            ${escapeHtml(
              t(
                "settings.title",
                "Ajustes"
              )
            )}
          </h1>

          <p class="page-subtitle">
            ${escapeHtml(
              t(
                "settings.subtitle",
                "Configuración básica de la cuenta y preferencias."
              )
            )}
          </p>
        </div>
      </header>
    `;
  }

  function renderLanguageCard() {
    const current =
      getCurrentLang();

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
                ${escapeHtml(
                  t(
                    "settings.languageCardEyebrow",
                    "IDIOMA"
                  )
                )}
              </span>

              <h2 style="
                margin:0;
                font-size:var(--font-xl);
                line-height:var(--line-snug);
                color:var(--text-strong);
                font-weight:var(--weight-black);
              ">
                ${escapeHtml(
                  t(
                    "settings.languageCardTitle",
                    "Cambiar idioma"
                  )
                )}
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
            ${escapeHtml(
              t(
                "settings.languageCardDescription",
                "Selecciona el idioma principal de la interfaz."
              )
            )}
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
                ${escapeHtml(
                  t(
                    "settings.languageSelectLabel",
                    "Idioma disponible"
                  )
                )}
              </span>

              <select
                id="ajustes-language-select"
                aria-label="${escapeHtml(
                  t(
                    "settings.languageSelectLabel",
                    "Idioma disponible"
                  )
                )}"
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
                <option value="es" ${
                  current === "es"
                    ? "selected"
                    : ""
                }>
                  Español
                </option>

                <option value="en" ${
                  current === "en"
                    ? "selected"
                    : ""
                }>
                  English
                </option>

                <option value="ca" ${
                  current === "ca"
                    ? "selected"
                    : ""
                }>
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
                ${escapeHtml(
                  t(
                    "settings.passwordCardEyebrow",
                    "SEGURIDAD"
                  )
                )}
              </span>

              <h2 style="
                margin:0;
                font-size:var(--font-xl);
                line-height:var(--line-snug);
                color:var(--text-strong);
                font-weight:var(--weight-black);
              ">
                ${escapeHtml(
                  t(
                    "settings.passwordCardTitle",
                    "Cambiar contraseña"
                  )
                )}
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
            ${escapeHtml(
              t(
                "settings.passwordCardDescription",
                "Desde aquí podrás actualizar tu contraseña de acceso."
              )
            )}
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
                ${escapeHtml(
                  t(
                    "settings.passwordComingSoonTitle",
                    "Próximamente conectable"
                  )
                )}
              </strong>

              <span style="
                font-size:var(--font-sm);
                color:var(--text-dim);
                line-height:var(--line-normal);
              ">
                ${escapeHtml(
                  t(
                    "settings.passwordComingSoonText",
                    "Esta vista ya está preparada para montar el formulario de cambio de contraseña cuando conectes el endpoint."
                  )
                )}
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
              ${escapeHtml(
                t(
                  "settings.changePasswordAction",
                  "Cambiar contraseña"
                )
              )}
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
    const container =
      getContainer();

    if (!container) return;

    AppCore.cleanup.run(
      SCOPE
    );

    AppCore.setDocumentTitle(
      t(
        "settings.title",
        "Ajustes"
      )
    );

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
    const scope =
      AppCore.cleanup.scope(
        SCOPE
      );

    const changePasswordBtn =
      document.getElementById(
        "ajustes-change-password-btn"
      );

    const languageSelect =
      document.getElementById(
        "ajustes-language-select"
      );

    if (changePasswordBtn) {
      AppCore.cleanup.on(
        scope,
        changePasswordBtn,
        "click",
        () => {
          showInfo(
            t(
              "settings.passwordFlowSoon",
              "Aquí irá el flujo de cambio de contraseña."
            ),
            t(
              "settings.passwordCardTitle",
              "Cambiar contraseña"
            )
          );
        }
      );
    }

    if (languageSelect) {
      AppCore.cleanup.on(
        scope,
        languageSelect,
        "change",
        (event) => {
          const select =
            event?.target;

          const previousLang =
            getCurrentLang();

          const nextLang =
            String(
              select?.value || "es"
            );

          if (
            nextLang ===
            previousLang
          ) {
            return;
          }

          try {
            const appliedLang =
              setLang(
                nextLang
              );

            if (select) {
              select.value =
                appliedLang;
            }

            showSuccess(
              t(
                "settings.languageChanged",
                "Idioma actualizado"
              ),
              t(
                "settings.languageCardTitle",
                "Cambiar idioma"
              )
            );
          } catch (error) {
            AppCore.utils.error(
              "[AjustesView] Error en cambio de idioma",
              error
            );

            if (select) {
              select.value =
                previousLang;
            }

            showError(
              t(
                "feedback.error.generic",
                "Ha ocurrido un error inesperado"
              ),
              t(
                "settings.languageCardTitle",
                "Cambiar idioma"
              )
            );
          }
        }
      );
    }
  }

  return {
    render,
  };
})();
