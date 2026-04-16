/* =========================================================
   Onion SPA - App Loader
   Archivo: src/app/loader.js

   RESPONSABILIDADES:
   - resolver el loader global de la app
   - mostrar / ocultar loader de forma robusta
   - restaurar estilos inline del loader
   - aplicar failsafe anti-loader infinito
   - limpiar timer de failsafe
   - evitar flicker visual
   - endurecer DOM access browser/server

   ALINEADO CON index.js:
   - respeta AppCore.state.loading
   - respeta AppCore.state.booting
   - mínimo riesgo visual en boot
   - hide idempotente total
   - show seguro aunque DOM parcial
   - snapshot útil para debug

   HARDENING EXTREMO:
   - cero throws
   - race-safe timers
   - fallback si AppCore parcial
   - SSR safe
   - no deja overlay dark pegado
   - respeta state.bootFailsafeTimer
========================================================= */

import {
  BOOT_FAILSAFE_LOADER_MS,
} from "./constants.js";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeWarn(
  AppCore,
  ...args
) {
  try {
    AppCore?.utils?.warn?.(
      ...args
    );
  } catch {}
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

function safeSetLoading(
  AppCore,
  value = false
) {
  const next =
    Boolean(value);

  try {
    if (
      typeof AppCore?.setLoading ===
      "function"
    ) {
      AppCore.setLoading(next);
      return;
    }
  } catch {}

  try {
    if (
      AppCore?.state &&
      typeof AppCore.state ===
        "object"
    ) {
      AppCore.state.loading =
        next;
    }
  } catch {}
}

function safeGetState(
  AppCore
) {
  try {
    return (
      AppCore?.state || {}
    );
  } catch {
    return {};
  }
}

/* =========================================================
   ELEMENT
========================================================= */

export function getLoaderElement(
  AppCore
) {
  if (!isBrowser()) {
    return null;
  }

  try {
    if (
      AppCore?.dom?.loader &&
      document.contains(
        AppCore.dom.loader
      )
    ) {
      return AppCore.dom.loader;
    }
  } catch {}

  try {
    const el =
      document.getElementById(
        "app-loader"
      ) ||
      document.querySelector(
        "#app-loader,.app-loader,.loader,[data-app-loader='true']"
      ) ||
      null;

    if (el && AppCore?.dom) {
      AppCore.dom.loader = el;
    }

    return el;
  } catch {
    return null;
  }
}

/* =========================================================
   INTERNAL DOM OPS
========================================================= */

function setBodyLoading(
  enabled = false
) {
  if (
    !isBrowser() ||
    !document.body
  ) {
    return;
  }

  try {
    const next =
      Boolean(enabled);

    document.body.classList.toggle(
      "loading",
      next
    );

    document.body.classList.toggle(
      "app-loading",
      next
    );
  } catch {}
}

function setLoaderVisible(
  loader,
  visible = true
) {
  if (!loader) {
    return false;
  }

  const show =
    Boolean(visible);

  try {
    loader.hidden = !show;

    loader.setAttribute(
      "aria-hidden",
      show
        ? "false"
        : "true"
    );

    loader.classList.toggle(
      "is-hidden",
      !show
    );

    loader.classList.toggle(
      "is-visible",
      show
    );

    if (show) {
      loader.style.display =
        "";
      loader.style.opacity =
        "";
      loader.style.visibility =
        "";
      loader.style.pointerEvents =
        "";
    } else {
      loader.style.display =
        "none";
      loader.style.opacity =
        "0";
      loader.style.visibility =
        "hidden";
      loader.style.pointerEvents =
        "none";
    }

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   PUBLIC VISIBILITY API
========================================================= */

export function forceHideLoader(
  AppCore
) {
  const loader =
    getLoaderElement(
      AppCore
    );

  setBodyLoading(false);
  setLoaderVisible(
    loader,
    false
  );

  safeSetLoading(
    AppCore,
    false
  );

  safeEmit(
    AppCore,
    "app:loader:hide",
    {}
  );

  return true;
}

export function restoreLoaderInlineStyles(
  AppCore
) {
  const loader =
    getLoaderElement(
      AppCore
    );

  if (!loader) {
    return false;
  }

  setLoaderVisible(
    loader,
    true
  );

  return true;
}

export function showLoader(
  AppCore
) {
  const loader =
    getLoaderElement(
      AppCore
    );

  setBodyLoading(true);

  if (loader) {
    restoreLoaderInlineStyles(
      AppCore
    );
  }

  safeSetLoading(
    AppCore,
    true
  );

  safeEmit(
    AppCore,
    "app:loader:show",
    {}
  );

  return true;
}

export function hideLoader(
  AppCore
) {
  return forceHideLoader(
    AppCore
  );
}

/* =========================================================
   FAILSAFE TIMER
========================================================= */

export function clearBootFailsafeTimer(
  state
) {
  try {
    if (
      state?.bootFailsafeTimer
    ) {
      clearTimeout(
        state.bootFailsafeTimer
      );
      state.bootFailsafeTimer =
        null;
    }
  } catch {}

  return true;
}

export function armBootFailsafeLoader({
  AppCore,
  state,
  hideLoader: hideFn = hideLoader,
} = {}) {
  if (!isBrowser()) {
    return null;
  }

  clearBootFailsafeTimer(
    state
  );

  const timeout =
    Math.max(
      1000,
      Number(
        BOOT_FAILSAFE_LOADER_MS
      ) || 12000
    );

  const timer =
    window.setTimeout(
      () => {
        try {
          const coreState =
            safeGetState(
              AppCore
            );

          const stillBooting =
            Boolean(
              state?.booting ||
                coreState.booting
            );

          const stillLoading =
            Boolean(
              coreState.loading
            );

          if (
            !stillBooting &&
            !stillLoading
          ) {
            return;
          }

          safeWarn(
            AppCore,
            "Failsafe loader aplicado.",
            {
              booting:
                stillBooting,
              loading:
                stillLoading,
              route:
                coreState.route ||
                "/",
              publicPath:
                coreState.publicPath ||
                "/",
            }
          );

          hideFn(
            AppCore
          );

          safeEmit(
            AppCore,
            "app:loader:failsafe",
            {
              timeout,
              booting:
                stillBooting,
              loading:
                stillLoading,
            }
          );
        } catch {}
      },
      timeout
    );

  if (state) {
    state.bootFailsafeTimer =
      timer;
  }

  return timer;
}

/* =========================================================
   DEBUG
========================================================= */

export function getLoaderSnapshot(
  AppCore
) {
  const loader =
    getLoaderElement(
      AppCore
    );

  const coreState =
    safeGetState(
      AppCore
    );

  return {
    exists:
      Boolean(loader),

    hidden:
      Boolean(
        loader?.hidden
      ),

    visible:
      Boolean(
        loader &&
          !loader.hidden
      ),

    loading:
      Boolean(
        coreState.loading
      ),

    booting:
      Boolean(
        coreState.booting
      ),

    route:
      coreState.route ||
      "/",

    publicPath:
      coreState.publicPath ||
      "/",

    hasFailsafeTimer:
      Boolean(
        coreState.bootFailsafeTimer
      ),
  };
}

export default {
  getLoaderElement,
  forceHideLoader,
  restoreLoaderInlineStyles,
  showLoader,
  hideLoader,
  clearBootFailsafeTimer,
  armBootFailsafeLoader,
  getLoaderSnapshot,
};
