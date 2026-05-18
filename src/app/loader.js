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

export const LOADER_VERSION = "app.loader.v1";

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

function getStateFlags(state = "ready") {
  const value = String(state || "ready");

  return {
    value,
    booting: value === "booting" || value === "loading",
    ready: value === "ready",
    fatal: value === "fatal",
  };
}

function setDataset(element = null, key = "", value = "") {
  if (!element || !key) return false;

  try {
    element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function toggleClass(element = null, className = "", enabled = false) {
  if (!element || !className) return false;

  try {
    element.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ROOT STATE
========================================================= */

function setRootState(state = "ready") {
  const flags = getStateFlags(state);

  for (const element of roots()) {
    toggleClass(element, "app-loading", flags.booting);
    toggleClass(element, "app-booting", flags.booting);
    toggleClass(element, "app-ready", flags.ready);
    toggleClass(element, "app-fatal", flags.fatal);

    setDataset(element, "appLoading", flags.booting ? "true" : "false");
    setDataset(element, "appBooting", flags.booting ? "true" : "false");
    setDataset(element, "appReady", flags.ready ? "true" : "false");
    setDataset(element, "appState", flags.value);
  }

  return true;
}

/* =========================================================
   LOADER STATE
========================================================= */

function setLoaderState(loader = null, visible = false, state = "hidden") {
  if (!loader) return false;

  const show = Boolean(visible);
  const status = String(state || (show ? "booting" : "hidden"));

  try {
    loader.hidden = !show;

    loader.setAttribute("aria-hidden", show ? "false" : "true");
    loader.setAttribute("aria-busy", show ? "true" : "false");

    loader.classList.toggle("is-visible", show);
    loader.classList.toggle("is-hidden", !show);

    loader.dataset.loaderVisible = show ? "true" : "false";
    loader.dataset.loaderState = status;

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

  try {
    return document.getElementById(LOADER_ID);
  } catch {
    return null;
  }
}

export function isLoaderVisible() {
  const loader = getLoaderElement();

  return Boolean(
    loader &&
      loader.hidden !== true &&
      loader.getAttribute("aria-hidden") !== "true"
  );
}

export function showLoader(state = "booting") {
  const loader = getLoaderElement();
  const status = String(state || "booting");

  setRootState(status);

  return setLoaderState(loader, true, status);
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
   COMPAT NO-OP
========================================================= */

export function takeOverStaticLoader() {
  return showLoader("booting");
}

export function prepareBootLoader() {
  return showLoader("booting");
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
      ? document.body?.dataset?.appState ||
        document.documentElement?.dataset?.appState ||
        ""
      : "",

    policy: {
      noImports: true,
      noAppCore: true,
      noEvents: true,
      noTimers: true,
      noFallbackDom: true,
      noInlineTextMutation: true,
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
