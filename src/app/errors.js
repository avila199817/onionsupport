/* =========================================================
   Onion SPA - App Errors
   Archivo: src/app/errors.js

   RESPONSABILIDADES:
   - renderizar pantalla de error de boot
   - bind de errores globales window.error
   - bind de promesas rechazadas sin control
   - notificar errores críticos con Toast

   HARDENING NIVEL DIOS:
   - listeners idempotentes
   - throttling visual de errores repetidos
   - sanitizado robusto mensajes
   - fallback total si faltan módulos
   - cero loops recursivos de error
   - telemetría interna por eventos
   - recovery UX enterprise
   - no duplicar binds
   - no reventar si falta cleanup
========================================================= */

import { escapeHtml } from "./helpers.js";

/* =========================================================
   INTERNAL STATE
========================================================= */

let handlersBound = false;

const errorState = {
  lastMessage: "",
  lastAt: 0,
  handling: false,
};

/* =========================================================
   HELPERS
========================================================= */

function now() {
  return Date.now();
}

function safeText(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function isFunction(value) {
  return typeof value === "function";
}

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.(...args);
  } catch {}
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(...args);
  } catch {}
}

function safeError(AppCore, ...args) {
  try {
    AppCore?.utils?.error?.(...args);
  } catch {
    console.error(...args);
  }
}

function safeEmit(
  AppCore,
  eventName,
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

function safeSetError(
  AppCore,
  error = null
) {
  try {
    AppCore?.setError?.(error);
  } catch {}
}

function safeToastError(
  Toast,
  message,
  options = {}
) {
  try {
    if (
      typeof Toast?.error ===
      "function"
    ) {
      return Toast.error(
        message,
        options
      );
    }

    if (
      typeof Toast?.show ===
      "function"
    ) {
      return Toast.show({
        ...options,
        type: "error",
        message,
      });
    }
  } catch {}

  return null;
}

function resolveErrorMessage(
  error = null
) {
  if (!error) {
    return "Se produjo un error inesperado.";
  }

  if (
    typeof error ===
    "string"
  ) {
    return safeText(
      error,
      "Se produjo un error inesperado."
    );
  }

  return (
    safeText(
      error?.message,
      ""
    ) ||
    safeText(
      error?.statusText,
      ""
    ) ||
    safeText(
      error?.data?.message,
      ""
    ) ||
    safeText(
      error?.data?.error,
      ""
    ) ||
    safeText(
      error?.reason?.message,
      ""
    ) ||
    safeText(
      error?.reason,
      ""
    ) ||
    "Se produjo un error inesperado."
  );
}

function shouldThrottleToast(
  message = ""
) {
  const current =
    safeText(message);
  const time = now();

  if (
    errorState.lastMessage ===
      current &&
    time - errorState.lastAt < 2500
  ) {
    return true;
  }

  errorState.lastMessage =
    current;
  errorState.lastAt = time;

  return false;
}

function safeReload() {
  try {
    window.location.reload();
  } catch {}
}

function safeRedirect(
  path = "/login"
) {
  try {
    window.location.assign(path);
  } catch {
    try {
      window.location.href = path;
    } catch {}
  }
}

function safeClearViewContainer(
  AppCore,
  container
) {
  try {
    AppCore?.clearDynamicContainers?.();
  } catch {}

  try {
    if (container) {
      container.innerHTML = "";
    }
  } catch {}
}

/* =========================================================
   UI ERROR SCREEN
========================================================= */

export function renderBootError({
  AppCore,
  Auth,
  Toast,
  error,
  getViewContainer,
  setShellVisibility,
  hideLoader,
} = {}) {
  const container =
    isFunction(
      getViewContainer
    )
      ? getViewContainer(
          AppCore
        )
      : null;

  if (!container) {
    safeError(
      AppCore,
      "renderBootError(): contenedor no disponible."
    );

    try {
      hideLoader?.(AppCore);
    } catch {}

    safeToastError(
      Toast,
      resolveErrorMessage(error),
      {
        title:
          "Error de arranque",
        duration: 5000,
      }
    );

    return false;
  }

  const message =
    resolveErrorMessage(error);

  try {
    AppCore?.setDocumentTitle?.(
      "Error de inicio"
    );
  } catch {}

  safeClearViewContainer(
    AppCore,
    container
  );

  try {
    setShellVisibility?.(
      AppCore,
      false
    );
  } catch {}

  try {
    hideLoader?.(AppCore);
  } catch {}

  safeEmit(
    AppCore,
    "app:boot:error:render",
    {
      message,
    }
  );

  container.innerHTML = `
    <section class="content-wrapper">
      <div class="panel-block" style="padding:24px;">
        <div style="display:grid;gap:18px;">
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

          <div style="display:grid;gap:8px;">
            <h2 style="margin:0;">
              Error al iniciar la aplicación
            </h2>

            <p style="margin:0;color:var(--text-dim);">
              ${escapeHtml(
                AppCore,
                message
              )}
            </p>
          </div>

          <div style="display:flex;gap:12px;flex-wrap:wrap;">
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

  const retryBtn =
    document.getElementById(
      "boot-retry-btn"
    );

  const resetBtn =
    document.getElementById(
      "boot-reset-session-btn"
    );

  if (retryBtn) {
    retryBtn.addEventListener(
      "click",
      () => {
        safeReload();
      },
      { once: true }
    );
  }

  if (resetBtn) {
    resetBtn.addEventListener(
      "click",
      () => {
        try {
          Auth?.clearSessionLocal?.({
            silent: true,
          });
        } catch (sessionError) {
          safeWarn(
            AppCore,
            "No se pudo limpiar sesión:",
            sessionError
          );
        } finally {
          safeRedirect(
            "/login"
          );
        }
      },
      { once: true }
    );
  }

  if (
    !shouldThrottleToast(
      message
    )
  ) {
    safeToastError(
      Toast,
      message,
      {
        title:
          "Error de arranque",
        duration: 5000,
      }
    );
  }

  return true;
}

/* =========================================================
   GLOBAL HANDLERS
========================================================= */

function processRuntimeError({
  AppCore,
  Toast,
  source = "runtime",
  error = null,
}) {
  if (errorState.handling) {
    return;
  }

  errorState.handling = true;

  try {
    const message =
      resolveErrorMessage(
        error
      );

    safeSetError(
      AppCore,
      error
    );

    safeError(
      AppCore,
      source,
      error
    );

    safeEmit(
      AppCore,
      "app:error",
      {
        source,
        message,
      }
    );

    safeEmit(
      AppCore,
      "app:error:telemetry",
      {
        source,
        message,
        at: new Date().toISOString(),
      }
    );

    if (
      shouldThrottleToast(
        message
      )
    ) {
      return;
    }

    safeToastError(
      Toast,
      message,
      {
        title: "Error",
        duration: 5000,
      }
    );
  } finally {
    errorState.handling = false;
  }
}

export function bindGlobalErrorHandlers({
  AppCore,
  Toast,
  scope,
} = {}) {
  if (handlersBound) {
    return true;
  }

  if (
    typeof window ===
    "undefined"
  ) {
    return false;
  }

  const useCleanupEvent =
    isFunction(
      AppCore?.cleanup?.event
    );

  const onError = (event) => {
    const error =
      event?.error || {
        message:
          event?.message ||
          "Error global no controlado",
      };

    processRuntimeError({
      AppCore,
      Toast,
      source:
        "window.error",
      error,
    });
  };

  const onReject = (event) => {
    const reason =
      event?.reason || {
        message:
          "Promise rechazada sin control",
      };

    processRuntimeError({
      AppCore,
      Toast,
      source:
        "unhandledrejection",
      error: reason,
    });
  };

  try {
    if (
      useCleanupEvent &&
      scope
    ) {
      AppCore.cleanup.event(
        scope,
        window,
        "error",
        onError
      );

      AppCore.cleanup.event(
        scope,
        window,
        "unhandledrejection",
        onReject
      );
    } else {
      window.addEventListener(
        "error",
        onError
      );

      window.addEventListener(
        "unhandledrejection",
        onReject
      );
    }

    handlersBound = true;

    safeLog(
      AppCore,
      "Global error handlers activos."
    );

    return true;
  } catch (error) {
    safeError(
      AppCore,
      "bindGlobalErrorHandlers() error:",
      error
    );

    return false;
  }
}

export default {
  renderBootError,
  bindGlobalErrorHandlers,
};
