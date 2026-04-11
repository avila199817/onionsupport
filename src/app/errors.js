/* =========================================================
   Onion SPA - App Errors
   Archivo: src/app/errors.js

   Responsabilidades:
   - renderizar pantalla de error de boot
   - bind de errores globales window.error
   - bind de promesas rechazadas sin control
   - notificar errores críticos con Toast
========================================================= */

import { escapeHtml } from "./helpers.js";

export function renderBootError({
  AppCore,
  Auth,
  Toast,
  error,
  getViewContainer,
  setShellVisibility,
  hideLoader,
}) {
  const container = typeof getViewContainer === "function"
    ? getViewContainer(AppCore)
    : null;

  if (!container) return;

  const message =
    error?.message ||
    error?.statusText ||
    error?.data?.message ||
    "Se produjo un error al iniciar la aplicación.";

  AppCore.setDocumentTitle("Error de inicio");
  AppCore.clearDynamicContainers?.();
  setShellVisibility(AppCore, false);
  hideLoader(AppCore);

  container.innerHTML = `
    <section class="content-wrapper">
      <div class="panel-block" style="padding:24px;">
        <div style="display:grid; gap:18px;">
          <div
            style="
              width:56px;
              height:56px;
              border-radius:16px;
              display:grid;
              place-items:center;
              border:1px solid rgba(255,255,255,.08);
              background:rgba(255,255,255,.04);
              font-size:28px;
            "
          >
            ⚠️
          </div>

          <div style="display:grid; gap:8px;">
            <h2 style="margin:0;">Error al iniciar la aplicación</h2>
            <p style="margin:0; color:var(--text-dim);">
              ${escapeHtml(AppCore, message)}
            </p>
          </div>

          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <button
              type="button"
              id="boot-retry-btn"
              class="ui-btn ui-btn-primary"
            >
              Reintentar
            </button>

            <button
              type="button"
              id="boot-reset-session-btn"
              class="ui-btn ui-btn-secondary"
            >
              Limpiar sesión
            </button>
          </div>
        </div>
      </div>
    </section>
  `;

  const retryBtn = document.getElementById("boot-retry-btn");
  const resetSessionBtn = document.getElementById("boot-reset-session-btn");

  if (retryBtn) {
    AppCore.utils.on(retryBtn, "click", () => {
      window.location.reload();
    });
  }

  if (resetSessionBtn) {
    AppCore.utils.on(resetSessionBtn, "click", () => {
      try {
        Auth.clearSessionLocal?.();
      } catch (sessionError) {
        AppCore.utils.warn(
          "No se pudo limpiar la sesión desde la pantalla de error.",
          sessionError
        );
      } finally {
        window.location.href = "/login";
      }
    });
  }

  Toast?.error?.(
    message || "No se pudo arrancar la aplicación.",
    {
      title: "Error de arranque",
      duration: 5000,
    }
  );
}

export function bindGlobalErrorHandlers({
  AppCore,
  Toast,
  scope,
}) {
  AppCore.cleanup.on(scope, window, "error", (event) => {
    const error = event?.error || {
      message: event?.message || "Error global no controlado",
    };

    AppCore.setError(error);
    AppCore.utils.error("window.error", error);

    Toast?.error?.(
      error?.message || "Se ha producido un error inesperado.",
      {
        title: "Error",
        duration: 5000,
      }
    );
  });

  AppCore.cleanup.on(scope, window, "unhandledrejection", (event) => {
    const reason = event?.reason || {
      message: "Promise rechazada sin control",
    };

    AppCore.setError(reason);
    AppCore.utils.error("unhandledrejection", reason);

    Toast?.error?.(
      reason?.message || "Se ha producido un error inesperado.",
      {
        title: "Error",
        duration: 5000,
      }
    );
  });
}
