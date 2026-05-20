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
   - Sin fallback DOM.
   - Sin mutar textos.
   - Sin magia negra.
========================================================= */

export const LOADER_VERSION = "app.loader.v3";

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

function normalizeState(state = "booting") {
  const value = String(state || "").trim().toLowerCase();

  if (value === "loading") return "booting";
  if (value === "booting") return "booting";
  if (value === "ready") return "ready";
  if (value === "fatal") return "fatal";

  return "booting";
}

/* =========================================================
   ROOT STATE
========================================================= */

function setRootState(state = "booting") {
  const value = normalizeState(state);

  const booting = value === "booting";
  const ready = value === "ready";
  const fatal = value === "fatal";

  for (const root of roots()) {
    root.dataset.appState = value;
    root.dataset.appLoading = String(booting);
    root.dataset.appBooting = String(booting);
    root.dataset.appReady = String(ready);

    root.classList.toggle("app-loading", booting);
    root.classList.toggle("app-booting", booting);
    root.classList.toggle("app-ready", ready);
    root.classList.toggle("app-fatal", fatal);
  }

  return true;
}

/* =========================================================
   LOADER ELEMENT
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

/* =========================================================
   LOADER STATE
========================================================= */

function setLoaderVisibility(visible = false, state = "booting") {
  const loader = getLoaderElement();

  if (!loader) return false;

  const show = Boolean(visible);
  const status = show ? normalizeState(state) : "hidden";

  loader.hidden = !show;

  loader.classList.toggle("is-visible", show);
  loader.classList.toggle("is-hidden", !show);

  loader.dataset.loaderVisible = String(show);
  loader.dataset.loaderState = status;

  loader.setAttribute("aria-hidden", show ? "false" : "true");
  loader.setAttribute("aria-busy", show ? "true" : "false");

  return true;
}

/* =========================================================
   PUBLIC API
========================================================= */

export function showLoader(state = "booting") {
  const status = normalizeState(state);

  setRootState(status);

  return setLoaderVisibility(true, status);
}

export function hideLoader() {
  setRootState("ready");

  return setLoaderVisibility(false, "hidden");
}

export function forceHideLoader() {
  return setLoaderVisibility(false, "hidden");
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
