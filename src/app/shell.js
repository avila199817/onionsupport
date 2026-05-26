/* =========================================================
   Onion Support - App Shell
   Archivo: /src/app/shell.js

   Responsabilidad:
   - Controlar el shell real del index.html durante boot/fatal.
   - Mantener app-shell visible.
   - Mostrar/ocultar chrome de forma básica.
   - Obtener #view-container.
   - Marcar ready/busy del shell.
   - Limpiar sólo áreas dinámicas propias del shell.
   - Sin imports.
   - Sin Router interno.
   - Sin Auth.
   - Sin AppCore.
   - Sin eventos.
   - Sin loader.
   - Sin rutas inventadas.
   - Sin /home.
   - Sin navegación.
   - Sin magia negra.

   Nota:
   - La visibilidad final por ruta la gobierna /src/router/shell.js.
   - Este módulo sólo da soporte base al arranque de la app.
========================================================= */

export const SHELL_VERSION = "app.shell.v5";

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

const ROUTER_VIEW_HOST_ATTR = "data-router-view-host";

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

function byId(id = "") {
  if (!isBrowser() || !id) return null;

  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function roots() {
  if (!isBrowser()) return [];

  return [
    document.documentElement,
    document.body,
  ].filter(Boolean);
}

function isRouteHost(element = null) {
  try {
    return element?.getAttribute?.(ROUTER_VIEW_HOST_ATTR) === "true";
  } catch {
    return false;
  }
}

function setDataset(element = null, key = "", value = "") {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined || value === "") {
      delete element.dataset[key];
    } else {
      element.dataset[key] = String(value);
    }

    return true;
  } catch {
    return false;
  }
}

function setHidden(element = null, hidden = false) {
  if (!element) return false;

  const value = Boolean(hidden);

  try {
    element.hidden = value;
    element.setAttribute("aria-hidden", value ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

function setBusy(element = null, busy = false) {
  if (!element) return false;

  try {
    element.setAttribute("aria-busy", busy ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

function toggleClass(element = null, className = "", active = false) {
  if (!element || !className) return false;

  try {
    element.classList.toggle(className, Boolean(active));
    return true;
  } catch {
    return false;
  }
}

function hasContent(element = null) {
  try {
    return Boolean(
      element &&
        (
          element.childElementCount > 0 ||
          cleanText(element.textContent, "")
        )
    );
  } catch {
    return false;
  }
}

function clearNode(element = null) {
  if (!element) return false;

  try {
    element.replaceChildren();
    return true;
  } catch {
    try {
      element.textContent = "";
      return true;
    } catch {
      return false;
    }
  }
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
  const viewContainer = byId(IDS.viewContainer) || appContent || main || null;

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
  if (!isBrowser()) return null;

  return (
    byId(IDS.viewContainer) ||
    byId(IDS.appContent) ||
    byId(IDS.main) ||
    null
  );
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
  const shellState = cleanText(state, "ready");
  const shellInteractive = busy ? "false" : "true";
  const chromeState = cleanText(chrome, "");

  for (const element of shellNodes(elements)) {
    setHidden(element, false);
    setBusy(element, busy);

    setDataset(element, "shell", "visible");
    setDataset(element, "shellState", shellState);
    setDataset(element, "shellInteractive", shellInteractive);

    if (chromeState) {
      setDataset(element, "chrome", chromeState);
    }
  }

  for (const root of roots()) {
    setDataset(root, "shell", "visible");
    setDataset(root, "shellState", shellState);
    setDataset(root, "shellInteractive", shellInteractive);

    if (chromeState) {
      setDataset(root, "chrome", chromeState);
    }

    toggleClass(root, "shell-visible", true);
    toggleClass(root, "shell-hidden", false);
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

  return chrome === "visible";
}

export function setShellVisibility(_AppCore = null, visible = true) {
  void _AppCore;

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
    setBusy(element, false);
    setDataset(element, "chrome", chromeState);
  }

  const showTablehead =
    chromeVisible &&
    hasContent(elements.tableheadContainer);

  setHidden(elements.tablehead, !showTablehead);
  setBusy(elements.tablehead, false);
  setDataset(
    elements.tablehead,
    "tableheadState",
    showTablehead ? "visible" : "empty"
  );

  setHidden(elements.tableheadContainer, !showTablehead);
  setBusy(elements.tableheadContainer, false);
  setDataset(
    elements.tableheadContainer,
    "tableheadState",
    showTablehead ? "visible" : "empty"
  );

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

  return true;
}

export function markShellReady() {
  const elements = getShellElements();

  syncShellDataset({
    elements,
    state: "ready",
    busy: false,
  });

  return true;
}

/* =========================================================
   DYNAMIC AREAS
========================================================= */

export function clearDynamicContainers() {
  const elements = getShellElements();

  let changed = false;

  /*
    App shell sólo limpia el tablehead.
    El view-container pertenece al Router/render real.
  */
  if (elements.tableheadContainer) {
    changed = clearNode(elements.tableheadContainer) || changed;
    setHidden(elements.tableheadContainer, true);
    setBusy(elements.tableheadContainer, false);
    setDataset(elements.tableheadContainer, "tableheadState", "empty");
  }

  if (elements.tablehead) {
    setHidden(elements.tablehead, true);
    setBusy(elements.tablehead, false);
    setDataset(elements.tablehead, "tableheadState", "empty");
    changed = true;
  }

  return changed;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function elementSnapshot(element = null) {
  if (!element) {
    return {
      exists: false,
    };
  }

  return {
    exists: true,
    id: element.id || "",
    tag: element.tagName?.toLowerCase?.() || "",
    hidden: Boolean(element.hidden),
    ariaHidden: element.getAttribute?.("aria-hidden") || "",
    ariaBusy: element.getAttribute?.("aria-busy") || "",
    shellState: element.dataset?.shellState || "",
    chrome: element.dataset?.chrome || "",
    tableheadState: element.dataset?.tableheadState || "",
    isRouteHost: isRouteHost(element),
  };
}

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

    roots: {
      html: {
        appLoading: elements.html?.dataset?.appLoading || "",
        appBooting: elements.html?.dataset?.appBooting || "",
        appReady: elements.html?.dataset?.appReady || "",
        appFatal: elements.html?.dataset?.appFatal || "",
        shellState: elements.html?.dataset?.shellState || "",
        chrome: elements.html?.dataset?.chrome || "",
        routeMode: elements.html?.dataset?.routeMode || "",
      },
      body: {
        appLoading: elements.body?.dataset?.appLoading || "",
        appBooting: elements.body?.dataset?.appBooting || "",
        appReady: elements.body?.dataset?.appReady || "",
        appFatal: elements.body?.dataset?.appFatal || "",
        shellState: elements.body?.dataset?.shellState || "",
        chrome: elements.body?.dataset?.chrome || "",
        routeMode: elements.body?.dataset?.routeMode || "",
      },
    },

    dom: {
      shell: elementSnapshot(elements.shell),
      main: elementSnapshot(elements.main),
      appContent: elementSnapshot(elements.appContent),
      viewContainer: elementSnapshot(elements.viewContainer),
      sidebarMount: elementSnapshot(elements.sidebarMount),
      topbarMount: elementSnapshot(elements.topbarMount),
      tablehead: elementSnapshot(elements.tablehead),
      tableheadContainer: elementSnapshot(elements.tableheadContainer),
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
      noNavigation: true,

      doesNotOwnFinalRouteChrome: true,
      doesNotOwnBootState: true,
      doesNotClobberRouterHost: true,
      doesNotClearViewContainer: true,
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
