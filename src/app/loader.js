/* =========================================================
   Onion Support - Loader
   Archivo: /src/app/loader.js

   Responsabilidad:
   - Controlar únicamente #app-loader.
   - Sin Auth, Router, Store, fetch, storage, timers ni eventos.
========================================================= */

export const LOADER_VERSION = "app.loader.minimal.v1";

const LOADER_ID = "app-loader";

const STATES = Object.freeze({
  BOOTING: "booting",
  READY: "ready",
  FATAL: "fatal",
  HIDDEN: "hidden",
});

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

function normalizeState(value = STATES.BOOTING) {
  const state = cleanText(value, STATES.BOOTING).toLowerCase();

  if (["booting", "boot", "loading"].includes(state)) return STATES.BOOTING;
  if (["ready", "done", "complete", "completed"].includes(state)) return STATES.READY;
  if (["fatal", "error", "failed", "fail"].includes(state)) return STATES.FATAL;
  if (["hidden", "hide", "closed", "none"].includes(state)) return STATES.HIDDEN;

  return STATES.BOOTING;
}

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

function setLoader(visible = false, state = STATES.BOOTING) {
  const loader = getLoaderElement();

  if (!loader) return false;

  const normalized = normalizeState(state);
  const show = Boolean(visible) && normalized !== STATES.HIDDEN;
  const finalState = show ? normalized : STATES.HIDDEN;
  const busy = show && finalState === STATES.BOOTING;

  loader.hidden = !show;

  loader.classList.toggle("is-visible", show);
  loader.classList.toggle("is-hidden", !show);

  loader.dataset.loaderVisible = show ? "true" : "false";
  loader.dataset.loaderState = finalState;

  loader.setAttribute("aria-hidden", show ? "false" : "true");
  loader.setAttribute("aria-busy", busy ? "true" : "false");

  return true;
}

export function showLoader(state = STATES.BOOTING) {
  return setLoader(true, state);
}

export function hideLoader() {
  return setLoader(false, STATES.HIDDEN);
}

export function forceHideLoader() {
  return hideLoader();
}

export function getLoaderSnapshot() {
  const loader = getLoaderElement();

  return {
    version: LOADER_VERSION,
    exists: Boolean(loader),
    visible: isLoaderVisible(),
    state: loader?.dataset?.loaderState || (loader ? "unknown" : "missing"),
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
