 /* =========================================================
   Onion Support - Loader
   Archivo: /src/app/loader.js

   Responsabilidad:
   - Controlar #app-loader.
   - Marcar estado básico en html/body.
   - Sin imports.
   - Sin AppCore.
   - Sin eventos.
   - Sin timers.
   - Sin snapshots complejos.
   - Sin fallback DOM.
========================================================= */

export const LOADER_VERSION = "simple";

const LOADER_ID = "app-loader";

function roots() {
  return [document.documentElement, document.body].filter(Boolean);
}

function setState(state) {
  const loading = state === "loading";
  const ready = state === "ready";
  const fatal = state === "fatal";

  for (const element of roots()) {
    element.classList.toggle("app-loading", loading);
    element.classList.toggle("app-booting", loading);
    element.classList.toggle("app-ready", ready);
    element.classList.toggle("app-fatal", fatal);

    element.dataset.appLoading = loading ? "true" : "false";
    element.dataset.appBooting = loading ? "true" : "false";
    element.dataset.appReady = ready ? "true" : "false";
    element.dataset.appState = state;
  }
}

export function getLoaderElement() {
  return document.getElementById(LOADER_ID);
}

export function isLoaderVisible() {
  const loader = getLoaderElement();

  return Boolean(
    loader &&
      !loader.hidden &&
      loader.getAttribute("aria-hidden") !== "true"
  );
}

export function showLoader() {
  const loader = getLoaderElement();

  setState("loading");

  if (!loader) return false;

  loader.hidden = false;
  loader.setAttribute("aria-hidden", "false");
  loader.setAttribute("aria-busy", "true");
  loader.classList.add("is-visible");
  loader.classList.remove("is-hidden");

  loader.dataset.loaderVisible = "true";
  loader.dataset.loaderState = "loading";

  return true;
}

export function hideLoader() {
  const loader = getLoaderElement();

  setState("ready");

  if (!loader) return false;

  loader.hidden = true;
  loader.setAttribute("aria-hidden", "true");
  loader.setAttribute("aria-busy", "false");
  loader.classList.remove("is-visible");
  loader.classList.add("is-hidden");

  loader.dataset.loaderVisible = "false";
  loader.dataset.loaderState = "hidden";

  return true;
}

export function forceHideLoader() {
  return hideLoader();
}

export function takeOverStaticLoader() {
  return showLoader();
}

export function prepareBootLoader() {
  return showLoader();
}

export function restoreLoaderInlineStyles() {
  return showLoader();
}

export function clearBootFailsafeTimer() {
  return true;
}

export function armBootFailsafeLoader() {
  return null;
}

export function installLoaderDebugApi() {
  return null;
}

export function getLoaderSnapshot() {
  const loader = getLoaderElement();

  return {
    exists: Boolean(loader),
    visible: isLoaderVisible(),
    state: loader?.dataset?.loaderState || "missing",
  };
}

export default {
  LOADER_VERSION,
  getLoaderElement,
  isLoaderVisible,
  showLoader,
  hideLoader,
  forceHideLoader,
  takeOverStaticLoader,
  prepareBootLoader,
  restoreLoaderInlineStyles,
  clearBootFailsafeTimer,
  armBootFailsafeLoader,
  installLoaderDebugApi,
  getLoaderSnapshot,
};
