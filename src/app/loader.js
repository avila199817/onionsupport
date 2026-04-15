/* =========================================================
   Onion SPA - App Loader
   Archivo: src/app/loader.js

   Responsabilidades:
   - resolver el loader global de la app
   - mostrar / ocultar loader de forma robusta
   - restaurar estilos inline del loader
   - aplicar failsafe anti-loader infinito
   - limpiar timer de failsafe
   - evitar flicker visual
   - endurecer DOM access browser/server

   HARDENING PRO:
   - idempotencia total
   - cero throws
   - race-safe timers
   - fallback si AppCore parcial
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

function safeSetLoading(
  AppCore,
  value = false
) {
  try {
    if (
      typeof AppCore?.setLoading ===
      "function"
    ) {
      AppCore.setLoading(
        Boolean(value)
      );
      return;
    }
  } catch {}

  try {
    if (
      AppCore?.state
    ) {
      AppCore.state.loading =
        Boolean(value);
    }
  } catch {}
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
      AppCore?.dom?.loader
    ) {
      return AppCore.dom.loader;
    }
  } catch {}

  return document.getElementById(
    "app-loader"
  );
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

  document.body.classList.toggle(
    "loading",
    Boolean(enabled)
  );
}

function setLoaderVisible(
  loader,
  visible = true
) {
  if (!loader) {
    return;
  }

  loader.hidden =
    !visible;

  loader.setAttribute(
    "aria-hidden",
    visible
      ? "false"
      : "true"
  );

  if (visible) {
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
}

/* =========================================================
   VISIBILITY
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
  setLoaderVisible(
    loader,
    true
  );

  safeSetLoading(
    AppCore,
    true
  );

  return true;
}

export function hideLoader(
  AppCore
) {
  forceHideLoader(
    AppCore
  );

  return true;
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

  const timer =
    window.setTimeout(
      () => {
        try {
          const stillBooting =
            Boolean(
              state?.booting ||
              AppCore?.state
                ?.booting
            );

          const loaderStillVisible =
            Boolean(
              AppCore?.state
                ?.loading
            );

          if (
            !stillBooting &&
            !loaderStillVisible
          ) {
            return;
          }

          safeWarn(
            AppCore,
            "Failsafe loader aplicado.",
            {
              booting:
                Boolean(
                  state?.booting
                ),
              coreBooting:
                Boolean(
                  AppCore?.state
                    ?.booting
                ),
              loading:
                Boolean(
                  AppCore?.state
                    ?.loading
                ),
              route:
                AppCore?.state
                  ?.route ||
                "/",
              publicPath:
                AppCore?.state
                  ?.publicPath ||
                "/",
            }
          );

          hideFn(
            AppCore
          );
        } catch {}
      },
      BOOT_FAILSAFE_LOADER_MS
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

  return {
    exists:
      Boolean(loader),
    hidden:
      Boolean(
        loader?.hidden
      ),
    loading:
      Boolean(
        AppCore?.state
          ?.loading
      ),
    booting:
      Boolean(
        AppCore?.state
          ?.booting
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
