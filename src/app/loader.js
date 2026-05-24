/* =========================================================
   Onion Support - Loader
   Archivo: /src/app/loader.js

   Responsabilidad:
   - Controlar #app-loader.
   - No controlar estado global de html/body.
   - No controlar shell.
   - Sin imports.
   - Sin AppCore.
   - Sin eventos.
   - Sin timers.
   - Sin fallback DOM.
   - Sin mutar textos.
   - Sin magia negra.
========================================================= */

export const LOADER_VERSION = "app.loader.v5";

const LOADER_ID = "app-loader";

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

function normalizeState(state = "booting") {
  const value = cleanText(state, "booting").toLowerCase();

  if (value === "loading") return "booting";
  if (value === "boot") return "booting";
  if (value === "booting") return "booting";

  if (value === "ready") return "ready";

  if (value === "error") return "fatal";
  if (value === "fatal") return "fatal";

  if (value === "hide") return "hidden";
  if (value === "hidden") return "hidden";

  return "booting";
}

/* =========================================================
   LOADER ELEMENT
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

/* =========================================================
   LOADER STATE
========================================================= */

function setLoaderDataset(loader = null, key = "", value = "") {
  if (!loader || !key) return false;

  try {
    loader.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function setLoaderAttribute(loader = null, key = "", value = "") {
  if (!loader || !key) return false;

  try {
    loader.setAttribute(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function setLoaderClasses(loader = null, visible = false) {
  if (!loader) return false;

  try {
    loader.classList.toggle("is-visible", visible);
    loader.classList.toggle("is-hidden", !visible);
    return true;
  } catch {
    return false;
  }
}

function setLoaderVisibility(visible = false, state = "booting") {
  const loader = getLoaderElement();

  if (!loader) return false;

  const show = Boolean(visible);
  const status = show ? normalizeState(state) : "hidden";
  const busy = show && status === "booting";

  try {
    loader.hidden = !show;
  } catch {
    return false;
  }

  setLoaderClasses(loader, show);

  setLoaderDataset(loader, "loaderVisible", show ? "true" : "false");
  setLoaderDataset(loader, "loaderState", status);

  setLoaderAttribute(loader, "aria-hidden", show ? "false" : "true");
  setLoaderAttribute(loader, "aria-busy", busy ? "true" : "false");

  return true;
}

/* =========================================================
   PUBLIC API
========================================================= */

export function showLoader(state = "booting") {
  return setLoaderVisibility(true, normalizeState(state));
}

export function hideLoader() {
  return setLoaderVisibility(false, "hidden");
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
    state: loader?.dataset?.loaderState || "missing",

    dom: {
      id: loader?.id || null,
      hidden: loader?.hidden ?? null,
      ariaHidden: loader?.getAttribute?.("aria-hidden") || null,
      ariaBusy: loader?.getAttribute?.("aria-busy") || null,
      loaderVisible: loader?.dataset?.loaderVisible || null,
    },

    policy: {
      loaderOnly: true,
      controlsOnlyAppLoader: true,

      noRootStateMutation: true,
      rootStateOwner: "main.js/app.shell.js",

      noImports: true,
      noAppCore: true,
      noEvents: true,
      noTimers: true,
      noFallbackDom: true,
      noTextMutation: true,
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

  getLoaderSnapshot,
};
