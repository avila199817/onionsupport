/* =========================================================
   Onion Support - Loader
   Archivo: /src/app/loader.js

   Responsabilidad:
   - Controlar únicamente #app-loader.
   - Sin Auth, Router, Store, fetch, storage, timers ni eventos.
========================================================= */

export const LOADER_VERSION = "app.loader.minimal.v2";

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

function normalizeState(value = LOADER_STATES.BOOTING) {
  const state = cleanText(value, LOADER_STATES.BOOTING).toLowerCase();

  if (["booting", "boot", "loading"].includes(state)) {
    return LOADER_STATES.BOOTING;
  }

  if (["ready", "done", "complete", "completed"].includes(state)) {
    return LOADER_STATES.READY;
  }

  if (["fatal", "error", "failed", "fail"].includes(state)) {
    return LOADER_STATES.FATAL;
  }

  if (["hidden", "hide", "closed", "none"].includes(state)) {
    return LOADER_STATES.HIDDEN;
  }

  return LOADER_STATES.BOOTING;
}

/* =========================================================
   DOM
========================================================= */

export function getLoaderElement() {
  if (!isBrowser()) return null;
  return document.getElementById(LOADER_ID);
}

export function isLoaderVisible() {
  const loader = getLoaderElement();

  return Boolean(
    loader &&
      loader.hidden !== true &&
      loader.getAttribute("aria-hidden") !== "true"
  );
}

function writeLoader(visible = false, state = LOADER_STATES.BOOTING) {
  const loader = getLoaderElement();

  if (!loader) return false;

  const normalized = normalizeState(state);
  const show = Boolean(visible) && normalized !== LOADER_STATES.HIDDEN;
  const finalState = show ? normalized : LOADER_STATES.HIDDEN;
  const busy = show && finalState === LOADER_STATES.BOOTING;

  try {
    loader.hidden = !show;

    loader.classList.toggle("is-visible", show);
    loader.classList.toggle("is-hidden", !show);

    loader.dataset.loaderVisible = show ? "true" : "false";
    loader.dataset.loaderState = finalState;

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
  return writeLoader(true, state);
}

export function hideLoader() {
  return writeLoader(false, LOADER_STATES.HIDDEN);
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
    visible: isLoaderVisible(),
    state: loader?.dataset?.loaderState || (loader ? "unknown" : "missing"),
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

  getLoaderSnapshot,
};
