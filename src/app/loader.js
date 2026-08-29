/* =========================================================
   Onion Support - Loader
   Archivo: /src/app/loader.js

   Responsabilidad:
   - Ser la autoridad única sobre #app-loader.
   - Mantener un contrato DOM/ARIA/dataset consistente.
   - Evitar escrituras DOM redundantes durante el boot.
   - Abrir un handoff visual ready antes de retirar el overlay.
   - Retirar el loader sólo después de una barrera de pintura corta.
   - Evitar FOUC cuando una hoja CSS de ruta cambia de media not-all a all.
   - Conservar la salida normal animable; hidden queda reservado al escape inmediato.
   - Exponer una API pequeña, estable e idempotente.
   - Sin Auth, Router, Store, fetch ni storage.
========================================================= */

export const LOADER_VERSION =
  "app.loader.orbit-glass.v6-paint-handoff";

export const LOADER_VISUAL_MODE =
  "transparent-orbit-v2";

const LOADER_ID = "app-loader";
const HIDE_PAINT_FRAMES = 2;

export const LOADER_STATES = Object.freeze({
  BOOTING: "booting",
  READY: "ready",
  FATAL: "fatal",
  HIDDEN: "hidden",
});

const LOADER_STATE_ALIASES = Object.freeze({
  boot: LOADER_STATES.BOOTING,
  booting: LOADER_STATES.BOOTING,
  loading: LOADER_STATES.BOOTING,
  ready: LOADER_STATES.READY,
  settling: LOADER_STATES.READY,
  done: LOADER_STATES.READY,
  complete: LOADER_STATES.READY,
  completed: LOADER_STATES.READY,
  fatal: LOADER_STATES.FATAL,
  error: LOADER_STATES.FATAL,
  failed: LOADER_STATES.FATAL,
  fail: LOADER_STATES.FATAL,
  hidden: LOADER_STATES.HIDDEN,
  hide: LOADER_STATES.HIDDEN,
  closed: LOADER_STATES.HIDDEN,
  none: LOADER_STATES.HIDDEN,
});

let hideFrame = 0;
let hideGeneration = 0;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function cleanText(value = "", fallback = "") {
  return (
    String(value ?? "")
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || fallback
  );
}

function normalizeState(value = LOADER_STATES.BOOTING) {
  const key = cleanText(value, LOADER_STATES.BOOTING).toLowerCase();
  return LOADER_STATE_ALIASES[key] || LOADER_STATES.BOOTING;
}

function requestFrame(callback) {
  if (!isBrowser() || typeof callback !== "function") return 0;

  if (typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }

  return window.setTimeout(callback, 16);
}

function cancelFrame(id = 0) {
  if (!id || !isBrowser()) return false;

  try {
    if (typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(id);
    } else {
      window.clearTimeout(id);
    }
    return true;
  } catch {
    return false;
  }
}

function setAttributeIfChanged(node, name, value) {
  if (!node) return false;

  const next = String(value);
  if (node.getAttribute(name) === next) return false;
  node.setAttribute(name, next);
  return true;
}

function setDatasetIfChanged(node, key, value) {
  if (!node?.dataset) return false;

  const next = String(value);
  if (node.dataset[key] === next) return false;
  node.dataset[key] = next;
  return true;
}

function setClassState(node, className, enabled) {
  if (!node?.classList) return false;

  const shouldHave = enabled === true;
  if (node.classList.contains(className) === shouldHave) return false;
  node.classList.toggle(className, shouldHave);
  return true;
}

export function getLoaderElement() {
  if (!isBrowser()) return null;
  return document.getElementById(LOADER_ID);
}

export function getLoaderState() {
  const loader = getLoaderElement();
  if (!loader) return "missing";

  const datasetState = cleanText(loader.dataset?.loaderState, "");
  if (datasetState) return normalizeState(datasetState);

  if (
    loader.hidden === true ||
    loader.getAttribute("aria-hidden") === "true" ||
    loader.classList?.contains("is-hidden")
  ) {
    return LOADER_STATES.HIDDEN;
  }

  return LOADER_STATES.BOOTING;
}

export function isLoaderVisible() {
  const loader = getLoaderElement();
  if (!loader) return false;

  return Boolean(
    loader.hidden !== true &&
    loader.getAttribute("aria-hidden") !== "true" &&
    !loader.classList?.contains("is-hidden")
  );
}

function writeLoader(visible = false, state = LOADER_STATES.BOOTING) {
  const loader = getLoaderElement();
  if (!loader) return false;

  const normalized = normalizeState(state);
  const show = Boolean(visible) && normalized !== LOADER_STATES.HIDDEN;
  const finalState = show ? normalized : LOADER_STATES.HIDDEN;
  const busy = show && finalState === LOADER_STATES.BOOTING;
  const settling = show && finalState === LOADER_STATES.READY;
  const ariaHidden = show ? "false" : "true";
  const ariaBusy = busy ? "true" : "false";

  try {
    const alreadyCanonical =
      (!show || loader.hidden === false) &&
      loader.classList.contains("is-visible") === show &&
      loader.classList.contains("is-hidden") === !show &&
      loader.classList.contains("is-settling") === settling &&
      loader.dataset?.loaderVisible === (show ? "true" : "false") &&
      loader.dataset?.loaderState === finalState &&
      loader.dataset?.loaderSettling === (settling ? "true" : "false") &&
      loader.dataset?.loaderVisual === LOADER_VISUAL_MODE &&
      loader.getAttribute("aria-hidden") === ariaHidden &&
      loader.getAttribute("aria-busy") === ariaBusy;

    if (alreadyCanonical) return true;

    /*
      La salida normal conserva el nodo sin [hidden] para que CSS complete
      el fade y visibility delay. Sólo show necesita retirar un hidden previo;
      hideLoaderImmediately() mantiene el escape de desmontaje instantáneo.
    */
    if (show && loader.hidden === true) {
      loader.hidden = false;
    }

    setClassState(loader, "is-visible", show);
    setClassState(loader, "is-hidden", !show);
    setClassState(loader, "is-settling", settling);

    setDatasetIfChanged(loader, "loaderVisible", show ? "true" : "false");
    setDatasetIfChanged(loader, "loaderState", finalState);
    setDatasetIfChanged(loader, "loaderSettling", settling ? "true" : "false");
    setDatasetIfChanged(loader, "loaderVisual", LOADER_VISUAL_MODE);

    setAttributeIfChanged(loader, "aria-hidden", ariaHidden);
    setAttributeIfChanged(loader, "aria-busy", ariaBusy);

    return true;
  } catch {
    return false;
  }
}

function cancelPendingHide() {
  hideGeneration += 1;
  cancelFrame(hideFrame);
  hideFrame = 0;
  return true;
}

function scheduleHideAfterPaint() {
  if (!isBrowser()) return false;
  if (hideFrame) return true;
  if (!isLoaderVisible()) return true;

  /*
    READY abre el handoff translúcido inmediatamente:
    - Router ya ha comprometido el shell y la vista.
    - El scrim reduce opacidad/blur y deja apreciar el destino.
    - El borde orbital sigue comunicando actividad durante los paints finales.
  */
  if (!writeLoader(true, LOADER_STATES.READY)) {
    return false;
  }

  const generation = ++hideGeneration;
  let remaining = HIDE_PAINT_FRAMES;

  const step = () => {
    hideFrame = 0;

    if (generation !== hideGeneration) return;

    remaining -= 1;

    if (remaining > 0) {
      hideFrame = requestFrame(step);
      return;
    }

    writeLoader(false, LOADER_STATES.HIDDEN);
  };

  hideFrame = requestFrame(step);
  return true;
}

export function showLoader(state = LOADER_STATES.BOOTING) {
  cancelPendingHide();
  return writeLoader(true, state);
}

/*
  hideLoader mantiene su contrato síncrono (boolean) para no alterar App/Main,
  pero ejecuta un handoff ready y difiere la salida dos paints. Durante ellos:
  - Router ya ha comprometido el route-host y shellState=ready;
  - las hojas de ruta cargadas con media="not all" pueden activarse;
  - el overlay translúcido deja ver el destino sin exponer HTML sin estilos;
  - Safari/iOS completa style/layout antes del fade final.
*/
export function hideLoader() {
  if (!getLoaderElement()) return false;
  if (!isLoaderVisible()) return true;
  return scheduleHideAfterPaint();
}

export function hideLoaderImmediately() {
  cancelPendingHide();

  const loader = getLoaderElement();
  if (!loader) return false;

  const written = writeLoader(false, LOADER_STATES.HIDDEN);

  try {
    loader.hidden = true;
  } catch {
    return false;
  }

  return written;
}

export function getLoaderSnapshot() {
  const loader = getLoaderElement();

  return Object.freeze({
    version: LOADER_VERSION,
    visualMode: LOADER_VISUAL_MODE,
    exists: Boolean(loader),
    visible: isLoaderVisible(),
    state: getLoaderState(),
    busy: loader?.getAttribute("aria-busy") === "true",
    settling:
      loader?.classList?.contains("is-settling") === true ||
      loader?.dataset?.loaderSettling === "true",
    hidePending: Boolean(hideFrame),
    paintBarrierFrames: HIDE_PAINT_FRAMES,
  });
}

export default Object.freeze({
  LOADER_VERSION,
  LOADER_VISUAL_MODE,
  LOADER_STATES,
  getLoaderElement,
  getLoaderState,
  isLoaderVisible,
  showLoader,
  hideLoader,
  hideLoaderImmediately,
  getLoaderSnapshot,
});
