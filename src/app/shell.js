/* =========================================================
   Onion Support - App Shell
   Archivo: /src/app/shell.js

   Responsabilidad:
   - Controlar el shell real del index.html durante boot/fatal.
   - Mantener app-shell visible.
   - Mostrar/ocultar chrome de forma básica.
   - Obtener #view-container.
   - Marcar ready/busy.
   - Sin imports.
   - Sin Router interno.
   - Sin Auth.
   - Sin AppCore.
   - Sin eventos.
   - Sin loader.
   - Sin rutas inventadas.
   - Sin /home.
   - Sin magia negra.

   Nota:
   - La visibilidad final por ruta la gobierna /src/router/shell.js.
   - Este módulo sólo da soporte base al arranque de la app.
========================================================= */

export const SHELL_VERSION = "app.shell.v3";

const IDS = Object.freeze({
  shell: "app-shell",
  sidebarMount: "sidebar-mount",
  topbarMount: "topbar-mount",
  main: "main-content",
  tablehead: "table-head",
  tableheadContainer: "tablehead-container",
  appContent: "app-content",
  viewContainer: "view-container",
});

const READY_CLASSES = Object.freeze(["app-ready"]);
const LOADING_CLASSES = Object.freeze(["app-loading", "app-booting"]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function byId(id = "") {
  if (!isBrowser() || !id) return null;
  return document.getElementById(id);
}

function roots() {
  if (!isBrowser()) return [];
  return [document.documentElement, document.body].filter(Boolean);
}

function setDataset(element = null, key = "", value = "") {
  if (!element || !key) return false;

  element.dataset[key] = String(value);
  return true;
}

function setHidden(element = null, hidden = false) {
  if (!element) return false;

  const value = Boolean(hidden);

  element.hidden = value;
  element.setAttribute("aria-hidden", value ? "true" : "false");

  return true;
}

function setBusy(element = null, busy = false) {
  if (!element) return false;

  element.setAttribute("aria-busy", busy ? "true" : "false");
  return true;
}

function addClasses(element = null, classes = []) {
  if (!element || !classes.length) return false;

  element.classList.add(...classes);
  return true;
}

function removeClasses(element = null, classes = []) {
  if (!element || !classes.length) return false;

  element.classList.remove(...classes);
  return true;
}

function setRootClassState(root = null, busy = false) {
  if (!root) return false;

  if (busy) {
    removeClasses(root, READY_CLASSES);
    addClasses(root, LOADING_CLASSES);
  } else {
    removeClasses(root, LOADING_CLASSES);
    addClasses(root, READY_CLASSES);
  }

  return true;
}

function hasContent(element = null) {
  return Boolean(
    element &&
      (
        element.childElementCount > 0 ||
        String(element.textContent || "").trim()
      )
  );
}

function clearNode(element = null) {
  if (!element) return false;

  element.replaceChildren();
  return true;
}

/* =========================================================
   ELEMENTS
========================================================= */

export function getShellElements() {
  if (!isBrowser()) {
    return {
      html: null,
      body: null,

      shell: null,
      appShell: null,

      sidebarMount: null,
      topbarMount: null,

      main: null,
      mainContent: null,

      tablehead: null,
      tableHead: null,

      tableheadContainer: null,
      tableHeadContainer: null,

      appContent: null,

      view: null,
      viewContainer: null,
      viewRoot: null,
      routerView: null,
    };
  }

  const shell = byId(IDS.shell);
  const main = byId(IDS.main);
  const tablehead = byId(IDS.tablehead);
  const tableheadContainer = byId(IDS.tableheadContainer);
  const appContent = byId(IDS.appContent);
  const viewContainer = byId(IDS.viewContainer);

  return {
    html: document.documentElement,
    body: document.body,

    shell,
    appShell: shell,

    sidebarMount: byId(IDS.sidebarMount),
    topbarMount: byId(IDS.topbarMount),

    main,
    mainContent: main,

    tablehead,
    tableHead: tablehead,

    tableheadContainer,
    tableHeadContainer: tableheadContainer,

    appContent,

    view: viewContainer,
    viewContainer,
    viewRoot: viewContainer,
    routerView: viewContainer,
  };
}

export function getViewContainer() {
  return byId(IDS.viewContainer);
}

function shellNodes(elements = getShellElements()) {
  return [
    elements.shell,
    elements.main,
    elements.appContent,
    elements.viewContainer,
  ].filter(Boolean);
}

function chromeMounts(elements = getShellElements()) {
  return [
    elements.sidebarMount,
    elements.topbarMount,
  ].filter(Boolean);
}

/* =========================================================
   STATE SYNC
========================================================= */

function syncShellDataset({
  elements = getShellElements(),
  state = "ready",
  chrome = null,
  busy = false,
} = {}) {
  const shellState = String(state || "ready");
  const shellInteractive = busy ? "false" : "true";

  for (const element of shellNodes(elements)) {
    setHidden(element, false);
    setBusy(element, busy);
    setDataset(element, "shell", "visible");
    setDataset(element, "shellState", shellState);
    setDataset(element, "shellInteractive", shellInteractive);

    if (chrome) {
      setDataset(element, "chrome", chrome);
    }
  }

  for (const root of roots()) {
    setDataset(root, "shell", "visible");
    setDataset(root, "shellState", shellState);
    setDataset(root, "shellInteractive", shellInteractive);

    if (chrome) {
      setDataset(root, "chrome", chrome);
    }

    root.classList.toggle("shell-visible", true);
    root.classList.toggle("shell-hidden", false);
  }

  return true;
}

function syncRootBootDataset(busy = false) {
  for (const root of roots()) {
    setDataset(root, "appLoading", busy ? "true" : "false");
    setDataset(root, "appBooting", busy ? "true" : "false");
    setDataset(root, "appReady", busy ? "false" : "true");

    setRootClassState(root, busy);
  }

  return true;
}

/* =========================================================
   CHROME
========================================================= */

export function readShellVisibility() {
  if (!isBrowser()) return false;

  const chrome =
    document.body?.dataset?.chrome ||
    document.documentElement?.dataset?.chrome ||
    "hidden";

  return chrome !== "hidden";
}

export function setShellVisibility(_AppCore = null, visible = true) {
  const chromeVisible = Boolean(visible);
  const chromeState = chromeVisible ? "visible" : "hidden";
  const elements = getShellElements();

  syncShellDataset({
    elements,
    state: "ready",
    chrome: chromeState,
    busy: false,
  });

  for (const element of chromeMounts(elements)) {
    setHidden(element, !chromeVisible);
    setDataset(element, "chrome", chromeState);
  }

  const showTablehead =
    chromeVisible &&
    hasContent(elements.tableheadContainer);

  setHidden(elements.tablehead, !showTablehead);
  setDataset(
    elements.tablehead,
    "tableheadState",
    showTablehead ? "visible" : "empty"
  );

  for (const root of roots()) {
    root.classList.toggle("route-app", chromeVisible);
    root.classList.toggle("route-auth", !chromeVisible);
  }

  return chromeVisible;
}

/* =========================================================
   READY / BUSY
========================================================= */

export function markShellBusy() {
  const elements = getShellElements();

  syncShellDataset({
    elements,
    state: "busy",
    busy: true,
  });

  syncRootBootDataset(true);

  return true;
}

export function markShellReady() {
  const elements = getShellElements();

  syncShellDataset({
    elements,
    state: "ready",
    busy: false,
  });

  syncRootBootDataset(false);

  return true;
}

/* =========================================================
   DYNAMIC AREAS
========================================================= */

export function clearDynamicContainers() {
  const elements = getShellElements();

  let changed = false;

  if (elements.tableheadContainer) {
    changed = clearNode(elements.tableheadContainer) || changed;
  }

  if (elements.tablehead) {
    setHidden(elements.tablehead, true);
    setDataset(elements.tablehead, "tableheadState", "empty");
    changed = true;
  }

  return changed;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getShellSnapshot() {
  const elements = getShellElements();
  const view = elements.viewContainer;

  return {
    version: SHELL_VERSION,

    shellVisible: true,
    chromeVisible: readShellVisibility(),

    hasShell: Boolean(elements.shell),
    hasView: Boolean(view),
    hasViewContent: hasContent(view),

    shellState: elements.shell?.dataset?.shellState || "",

    dom: {
      shell: Boolean(elements.shell),
      main: Boolean(elements.main),
      appContent: Boolean(elements.appContent),
      viewContainer: Boolean(elements.viewContainer),
      sidebarMount: Boolean(elements.sidebarMount),
      topbarMount: Boolean(elements.topbarMount),
      tablehead: Boolean(elements.tablehead),
      tableheadContainer: Boolean(elements.tableheadContainer),
    },

    policy: {
      appBootShellOnly: true,
      shellAlwaysVisible: true,
      chromeToggleOnly: true,
      finalRouteShellOwner: "router/shell.js",

      noImports: true,
      noAppCore: true,
      noAuth: true,
      noRouterInternal: true,
      noEvents: true,
      noLoader: true,
      noStorage: true,
      noRouteParsing: true,
      noHomeRoute: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SHELL_VERSION,

  getShellElements,
  getViewContainer,

  readShellVisibility,
  setShellVisibility,

  markShellReady,
  markShellBusy,

  clearDynamicContainers,

  getShellSnapshot,
};
