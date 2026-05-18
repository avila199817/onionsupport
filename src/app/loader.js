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
   - Sin magia negra.
========================================================= */

export const LOADER_VERSION = "simple";

const LOADER_ID = "app-loader";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function roots() {
  if (!isBrowser()) return [];
  return [document.documentElement, document.body].filter(Boolean);
}

function setRootState(state = "ready") {
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

  return true;
}

function setLoaderState(loader = null, visible = false, state = "hidden") {
  if (!loader) return false;

  const show = Boolean(visible);

  try {
    loader.hidden = !show;
    loader.setAttribute("aria-hidden", show ? "false" : "true");
    loader.setAttribute("aria-busy", show ? "true" : "false");

    loader.classList.toggle("is-visible", show);
    loader.classList.toggle("is-hidden", !show);

    loader.dataset.loaderVisible = show ? "true" : "false";
    loader.dataset.loaderState = state;

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   PUBLIC API
========================================================= */

export function getLoaderElement() {
  if (!isBrowser()) return null;
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

  setRootState("loading");

  return setLoaderState(loader, true, "loading");
}

export function hideLoader() {
  const loader = getLoaderElement();

  setRootState("ready");

  return setLoaderState(loader, false, "hidden");
}

export function forceHideLoader() {
  const loader = getLoaderElement();

  return setLoaderState(loader, false, "hidden");
}

/* =========================================================
   COMPAT
========================================================= */

export function takeOverStaticLoader() {
  return showLoader();
}

export function prepareBootLoader() {
  return showLoader();
}

export function restoreLoaderInlineStyles() {
  return true;
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

/* =========================================================
   SNAPSHOT
========================================================= */

export function getLoaderSnapshot() {
  const loader = getLoaderElement();

  return {
    version: LOADER_VERSION,

    exists: Boolean(loader),
    visible: isLoaderVisible(),

    state: loader?.dataset?.loaderState || "missing",

    rootState: isBrowser()
      ? document.body?.dataset?.appState || document.documentElement?.dataset?.appState || ""
      : "",

    policy: {
      noImports: true,
      noAppCore: true,
      noEvents: true,
      noTimers: true,
      noFallbackDom: true,
      forceHideDoesNotSetReady: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

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
