/* =========================================================
   Onion Support - Loader
   Archivo: /src/app/loader.js

   Responsabilidad:
   - Controlar únicamente #app-loader.
   - No controlar html/body, shell, textos, Auth, Router, Store,
     fetch, storage, timers ni eventos.
========================================================= */

export const LOADER_VERSION = "app.loader.v7";

const LOADER_ID = "app-loader";

const LOADER_STATES = Object.freeze({
  BOOTING: "booting",
  READY: "ready",
  FATAL: "fatal",
  HIDDEN: "hidden",
});

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function normalizeState(state = LOADER_STATES.BOOTING) {
  const value = cleanText(state, LOADER_STATES.BOOTING).toLowerCase();

  if (["booting", "boot", "loading"].includes(value)) {
    return LOADER_STATES.BOOTING;
  }

  if (["ready", "done", "complete", "completed"].includes(value)) {
    return LOADER_STATES.READY;
  }

  if (["fatal", "error", "failed", "fail"].includes(value)) {
    return LOADER_STATES.FATAL;
  }

  if (["hidden", "hide", "closed", "none"].includes(value)) {
    return LOADER_STATES.HIDDEN;
  }

  return LOADER_STATES.BOOTING;
}

/* =========================================================
   ELEMENT / STATE
========================================================= */

export function getLoaderElement() {
  if (!isBrowser()) return null;
  return document.getElementById(LOADER_ID);
}

function isVisibleElement(loader = null) {
  return Boolean(
    loader &&
      loader.hidden !== true &&
      loader.getAttribute("aria-hidden") !== "true" &&
      loader.dataset?.loaderVisible === "true"
  );
}

export function isLoaderVisible() {
  return isVisibleElement(getLoaderElement());
}

function writeLoaderState(visible = false, state = LOADER_STATES.BOOTING) {
  const loader = getLoaderElement();

  if (!loader) return false;

  const normalized = normalizeState(state);
  const show = Boolean(visible) && normalized !== LOADER_STATES.HIDDEN;
  const nextState = show ? normalized : LOADER_STATES.HIDDEN;
  const busy = show && nextState === LOADER_STATES.BOOTING;

  try {
    loader.hidden = !show;

    loader.classList.toggle("is-visible", show);
    loader.classList.toggle("is-hidden", !show);

    loader.dataset.loaderVisible = show ? "true" : "false";
    loader.dataset.loaderState = nextState;

    loader.setAttribute("aria-hidden", show ? "false" : "true");
    loader.setAttribute("aria-busy", busy ? "true" : "false");

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   PUBLIC API
========================================================= */

export function showLoader(state = LOADER_STATES.BOOTING) {
  return writeLoaderState(true, state);
}

export function hideLoader() {
  return writeLoaderState(false, LOADER_STATES.HIDDEN);
}

export function forceHideLoader() {
  return hideLoader();
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getLoaderSnapshot() {
  const loader = getLoaderElement();

  return {
    version: LOADER_VERSION,

    exists: Boolean(loader),
    visible: isVisibleElement(loader),
    state: loader?.dataset?.loaderState || (loader ? "unknown" : "missing"),

    dom: {
      id: loader?.id || null,
      hidden: loader?.hidden ?? null,
      ariaHidden: loader?.getAttribute?.("aria-hidden") || null,
      ariaBusy: loader?.getAttribute?.("aria-busy") || null,
      loaderVisible: loader?.dataset?.loaderVisible || null,
      classVisible: loader?.classList?.contains?.("is-visible") ?? null,
      classHidden: loader?.classList?.contains?.("is-hidden") ?? null,
    },

    policy: {
      loaderOnly: true,
      noRootStateMutation: true,
      noShell: true,
      noTextMutation: true,
      noEvents: true,
      noTimers: true,
      noFallbackDom: true,
      noAuth: true,
      noRouter: true,
      noFetch: true,
      noStorage: true,
    },
  };
}

export default {
  LOADER_VERSION,

  getLoaderElement,
  isLoaderVisible,

  showLoader,
  hideLoader,
  forceHideLoader,

  getLoaderSnapshot,
};
