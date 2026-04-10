/* =========================================================
   Onion SPA - Cuenta View (LEAN PRO SAAS PANEL)
   Archivo: src/views/cuentaView.js

   Objetivo actual:
   - vista mínima de cuenta
   - mostrar estado actual del tema
   - permitir cambiar DARK / LIGHT
   - persistir preferencia en backend
   - reflejar cambio instantáneo en UI
   - mantener consistencia con el shell SaaS
   - cero ruido
========================================================= */

import { AppCore } from "../core/core.js";

export const CuentaView = (() => {
  "use strict";

  const SCOPE = "view:cuenta";
  const ENDPOINT_GET = "/api/user/preferences";
  const ENDPOINT_PATCH = "/api/user/preferences/theme";

  const localState = {
    hydrated: false,
    bootstrapped: false,
    loading: false,
    saving: false,
    loaded: false,
    error: null,
    darkMode: true,
    updatedAt: null,
  };

  let inflightLoad = null;
  let inflightSave = null;

  /* =========================================================
     HELPERS
  ========================================================= */
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

  function formatDateTime(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function getThemeName(darkMode = true) {
    return darkMode ? "Dark" : "Light";
  }

  function getThemeDescription(darkMode = true) {
    return darkMode
      ? "Modo oscuro activo. Interfaz más densa y orientada a panel."
      : "Modo claro activo. Interfaz más limpia, luminosa y premium.";
  }

  function getThemeIcon(darkMode = true) {
    return darkMode ? "🌙" : "☀️";
  }

  function getToggleLabel(darkMode = true) {
    return darkMode ? "Cambiar a modo Light" : "Cambiar a modo Dark";
  }

  function applyTheme(darkMode = true) {
    const theme = darkMode ? "dark" : "light";

    document.documentElement.setAttribute("data-theme", theme);

    if (AppCore?.state) {
      AppCore.state.theme = theme;
    }

    try {
      if (typeof AppCore?.storage?.set === "function") {
        AppCore.storage.set("theme", theme);
      } else if (typeof localStorage !== "undefined") {
        localStorage.setItem(
          `${AppCore?.config?.storagePrefix || "onion"}:theme`,
          theme
        );
      }
    } catch {
      /* noop */
    }

    try {
      if (typeof AppCore?.events?.emit === "function") {
        AppCore.events.emit("app:theme:change", {
          theme,
          darkMode,
        });
      }
    } catch {
      /* noop */
    }
  }

  function normalizeResponse(response = {}) {
    const darkMode =
      typeof response?.darkMode === "boolean"
        ? response.darkMode
        : typeof response?.preferences?.darkMode === "boolean"
          ? response.preferences.darkMode
          : AppCore?.state?.theme === "light"
            ? false
            : true;

    const updatedAt =
      response?.updatedAt ||
      response?.preferences?.updatedAt ||
      null;

    return {
      darkMode,
      updatedAt,
    };
  }

  /* =========================================================
     REQUESTS
  ========================================================= */
  async function fetchPreferences() {
    return AppCore.apiClient.get(ENDPOINT_GET, {
      timeout: 15000,
      auth: true,
    });
  }

  async function patchTheme(darkMode) {
    return AppCore.apiClient.patch(
      ENDPOINT_PATCH,
      { darkMode },
      {
        timeout: 15000,
        auth: true,
      }
    );
  }

  async function loadPreferences({ silent = false } = {}) {
    if (inflightLoad) return inflightLoad;

    if (!silent) {
      localState.loading = true;
      localState.error = null;
      render();
    }

    inflightLoad = (async () => {
      try {
        const response = await fetchPreferences();
        const normalized = normalizeResponse(response);

        localState.darkMode = normalized.darkMode;
        localState.updatedAt = normalized.updatedAt;
        localState.loading = false;
        localState.loaded = true;
        localState.error = null;

        applyTheme(normalized.darkMode);
        render();

        return normalized;
      } catch (error) {
        localState.loading = false;
        localState.loaded = true;
        localState.error =
          error?.data?.message ||
          error?.message ||
          "No se pudo cargar la configuración de cuenta.";

        render();
        throw error;
      } finally {
        inflightLoad = null;
      }
    })();

    return inflightLoad;
  }

  async function saveTheme(nextDarkMode) {
    if (inflightSave) return inflightSave;

    const previousDarkMode = localState.darkMode;
    const previousUpdatedAt = localState.updatedAt;

    localState.saving = true;
    localState.error = null;
    localState.darkMode = nextDarkMode;

    applyTheme(nextDarkMode);
    render();

    inflightSave = (async () => {
      try {
        const response = await patchTheme(nextDarkMode);
        const normalized = normalizeResponse(response);

        localState.darkMode = normalized.darkMode;
        localState.updatedAt = normalized.updatedAt;
        localState.saving = false;
        localState.error = null;

        applyTheme(normalized.darkMode);
        render();

        return normalized;
      } catch (error) {
        localState.darkMode = previousDarkMode;
        localState.updatedAt = previousUpdatedAt;
        localState.saving = false;
        localState.error =
          error?.data?.message ||
          error?.message ||
          "No se pudo guardar el tema.";

        applyTheme(previousDarkMode);
        render();

        throw error;
      } finally {
        inflightSave = null;
      }
    })();

    return inflightSave;
  }

  /* =========================================================
     UI
  ========================================================= */
  function renderHeader() {
    return `
      <header class="page-header">
        <div class="page-header-main">
          <h1 class="page-title">Cuenta</h1>
          <p class="page-subtitle">
            Configuración mínima de apariencia. Cambio instantáneo entre modo Dark y modo Light.
          </p>
        </div>
      </header>
    `;
  }

  function renderLoadingState() {
    return `
      <section class="panel-surface">
        <div style="display:grid; gap:var(--space-md); padding:var(--space-xl);">
          <div style="width:150px; height:16px; border-radius:var(--radius-pill); background:var(--surface-glass-strong);"></div>
          <div style="width:72%; height:14px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
          <div style="width:48%; height:14px; border-radius:var(--radius-pill); background:var(--surface-glass);"></div>
          <div style="width:220px; height:44px; border-radius:var(--btn-radius); background:var(--surface-hover-strong); margin-top:8px;"></div>
        </div>
      </section>
    `;
  }

  function renderErrorState() {
    return `
      <section class="panel-surface">
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <h3 class="empty-state-title">No se pudo cargar la cuenta</h3>
          <p class="empty-state-text">
            ${escapeHtml(localState.error || "Error desconocido")}
          </p>
          <button
            type="button"
            id="cuenta-retry-btn"
            style="
              min-height:var(--btn-height-sm);
              padding:10px 14px;
              border-radius:var(--btn-radius);
              border:1px solid var(--btn-primary-border);
              background:var(--btn-primary-bg);
              color:var(--btn-primary-text);
              box-shadow:var(--btn-primary-shadow);
              font-weight:var(--weight-bold);
              cursor:pointer;
            "
          >
            Reintentar
          </button>
        </div>
      </section>
    `;
  }

  function renderThemeCard() {
    const themeName = getThemeName(localState.darkMode);
    const themeDescription = getThemeDescription(localState.darkMode);
    const themeIcon = getThemeIcon(localState.darkMode);
    const toggleLabel = getToggleLabel(localState.darkMode);

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
                PREFERENCIA VISUAL
              </span>

              <h2 style="
                margin:0;
                font-size:var(--font-xl);
                line-height:var(--line-snug);
                color:var(--text-strong);
                font-weight:var(--weight-black);
              ">
                Tema de interfaz
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
              ${themeIcon}
            </div>
          </div>

          <p style="
            margin:0;
            font-size:var(--font-md);
            line-height:var(--line-relaxed);
            color:var(--text-muted);
          ">
            ${escapeHtml(themeDescription)}
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
              display:flex;
              align-items:center;
              justify-content:space-between;
              gap:var(--space-md);
              flex-wrap:wrap;
            ">
              <div style="display:grid; gap:4px;">
                <span style="
                  font-size:var(--font-sm);
                  color:var(--text-dim);
                ">
                  Estado actual
                </span>

                <strong style="
                  font-size:var(--font-lg);
                  color:var(--text-strong);
                  font-weight:var(--weight-bold);
                ">
                  ${escapeHtml(themeName)}
                </strong>
              </div>

              <span style="
                display:inline-flex;
                align-items:center;
                justify-content:center;
                min-height:32px;
                padding:6px 12px;
                border-radius:var(--radius-pill);
                border:1px solid ${localState.darkMode ? "var(--border-info)" : "var(--border-warning)"};
                background:${localState.darkMode ? "var(--info-bg)" : "var(--warning-bg)"};
                color:var(--text-soft);
                font-size:var(--font-sm);
                font-weight:var(--weight-semibold);
              ">
                ${localState.darkMode ? "Dark activo" : "Light activo"}
              </span>
            </div>

            <div style="
              display:grid;
              gap:4px;
              font-size:var(--font-sm);
              color:var(--text-dim);
            ">
              <span>
                Última actualización: ${escapeHtml(formatDateTime(localState.updatedAt))}
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
              id="cuenta-theme-toggle-btn"
              ${localState.saving ? "disabled" : ""}
              aria-pressed="${localState.darkMode ? "true" : "false"}"
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
                cursor:${localState.saving ? "not-allowed" : "pointer"};
                opacity:${localState.saving ? ".72" : "1"};
              "
            >
              ${localState.saving ? "Guardando..." : escapeHtml(toggleLabel)}
            </button>

            <button
              type="button"
              id="cuenta-refresh-btn"
              ${localState.loading || localState.saving ? "disabled" : ""}
              style="
                min-height:var(--btn-height);
                padding:0 18px;
                border-radius:var(--btn-radius);
                border:1px solid var(--btn-secondary-border);
                background:var(--btn-secondary-bg);
                color:var(--btn-secondary-text);
                box-shadow:var(--btn-secondary-shadow);
                font-size:var(--font-md);
                font-weight:var(--weight-bold);
                cursor:${localState.loading || localState.saving ? "not-allowed" : "pointer"};
                opacity:${localState.loading || localState.saving ? ".72" : "1"};
              "
            >
              Actualizar
            </button>
          </div>

          ${
            localState.error
              ? `
                <div style="
                  display:grid;
                  gap:4px;
                  padding:14px 16px;
                  border-radius:var(--radius-lg);
                  border:1px solid var(--border-error);
                  background:var(--error-bg);
                  color:var(--text-soft);
                ">
                  <strong style="font-size:var(--font-sm); color:var(--text-strong);">
                    No se pudo guardar el cambio
                  </strong>
                  <span style="font-size:var(--font-sm); color:var(--text-muted);">
                    ${escapeHtml(localState.error)}
                  </span>
                </div>
              `
              : ""
          }
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
    AppCore.setDocumentTitle("Cuenta");
    AppCore.clearDynamicContainers?.();

    let body = "";

    if (localState.loading && !localState.loaded) {
      body = renderLoadingState();
    } else if (localState.error && !localState.loaded) {
      body = renderErrorState();
    } else {
      body = renderThemeCard();
    }

    container.innerHTML = `
      <section class="panel-content dashboard ready">
        <div class="content-wrapper">
          ${renderHeader()}
          ${body}
        </div>
      </section>
    `;

    localState.hydrated = true;
    bind();
  }

  /* =========================================================
     BIND
  ========================================================= */
  function bind() {
    const scope = AppCore.cleanup.scope(SCOPE);

    const retryBtn = document.getElementById("cuenta-retry-btn");
    const refreshBtn = document.getElementById("cuenta-refresh-btn");
    const toggleBtn = document.getElementById("cuenta-theme-toggle-btn");

    if (retryBtn) {
      AppCore.cleanup.on(scope, retryBtn, "click", async () => {
        await loadPreferences();
      });
    }

    if (refreshBtn) {
      AppCore.cleanup.on(scope, refreshBtn, "click", async () => {
        if (localState.loading || localState.saving) return;
        await loadPreferences({ silent: true });
      });
    }

    if (toggleBtn) {
      AppCore.cleanup.on(scope, toggleBtn, "click", async () => {
        if (localState.saving) return;
        await saveTheme(!localState.darkMode);
      });
    }

    if (!localState.bootstrapped) {
      localState.bootstrapped = true;
      loadPreferences();
    }
  }

  return {
    render,
    loadPreferences,
    saveTheme,
  };
})();
