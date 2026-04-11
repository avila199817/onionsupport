/* =========================================================
   Onion SPA - App Loader
   Archivo: src/app/loader.js

   Responsabilidades:
   - resolver el loader global de la app
   - mostrar / ocultar loader de forma robusta
   - restaurar estilos inline del loader
   - aplicar failsafe anti-loader infinito
   - limpiar timer de failsafe
========================================================= */

import { BOOT_FAILSAFE_LOADER_MS } from "./constants.js";

/* =========================================================
   ELEMENT
========================================================= */
export function getLoaderElement(AppCore) {
  return AppCore.dom.loader || document.getElementById("app-loader");
}

/* =========================================================
   VISIBILITY
========================================================= */
export function forceHideLoader(AppCore) {
  const loader = getLoaderElement(AppCore);

  if (document?.body) {
    document.body.classList.remove("loading");
  }

  if (loader) {
    loader.hidden = true;
    loader.setAttribute("aria-hidden", "true");
    loader.style.display = "none";
    loader.style.opacity = "0";
    loader.style.visibility = "hidden";
    loader.style.pointerEvents = "none";
  }
}

export function restoreLoaderInlineStyles(AppCore) {
  const loader = getLoaderElement(AppCore);
  if (!loader) return;

  loader.hidden = false;
  loader.setAttribute("aria-hidden", "false");
  loader.style.display = "";
  loader.style.opacity = "";
  loader.style.visibility = "";
  loader.style.pointerEvents = "";
}

export function showLoader(AppCore) {
  restoreLoaderInlineStyles(AppCore);
  AppCore.setLoading(true);
}

export function hideLoader(AppCore) {
  AppCore.setLoading(false);
  forceHideLoader(AppCore);
}

/* =========================================================
   FAILSAFE TIMER
========================================================= */
export function clearBootFailsafeTimer(state) {
  if (state?.bootFailsafeTimer) {
    window.clearTimeout(state.bootFailsafeTimer);
    state.bootFailsafeTimer = null;
  }
}

export function armBootFailsafeLoader({
  AppCore,
  state,
  hideLoader,
}) {
  clearBootFailsafeTimer(state);

  state.bootFailsafeTimer = window.setTimeout(() => {
    const stillBooting = Boolean(state.booting || AppCore.state.booting);
    const loaderStillVisible = Boolean(AppCore.state.loading);

    if (!stillBooting && !loaderStillVisible) {
      return;
    }

    AppCore.utils.warn(
      "Failsafe loader aplicado: el arranque excedió el umbral previsto.",
      {
        booting: state.booting,
        coreBooting: AppCore.state.booting,
        loading: AppCore.state.loading,
        route: AppCore.state.route,
        publicPath: AppCore.state.publicPath,
      }
    );

    hideLoader(AppCore);
  }, BOOT_FAILSAFE_LOADER_MS);
}
