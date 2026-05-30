/* =========================================================
   Onion Support - Topbar UI
   Archivo: /src/ui/topbar/index.js

   Responsabilidad:
   - Controlador mínimo del topbar.
   - Montar en #topbar-mount / #app-topbar.
   - Consumir template.js para TODO el DOM visual.
   - Mostrar título de ruta.
   - Ocultarse en rutas públicas/auth.
   - Cachear refs en AppCore.dom.
   - Registrarse en AppCore.
   - Sin Auth, Router propio, HTTP, Toast, Store, logout,
     sidebar bridge ni motor de búsqueda.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  createTopbarTemplate,
  getTopbarTemplateRefs,
  setTopbarTemplateTitle,
  setTopbarTemplateVisible,
  clearTopbarSearchResults,
} from "./template.js";

export const TOPBAR_VERSION = "topbar.controller.v1";

const TOPBAR_ROOT_ID = "app-topbar";
const TOPBAR_MOUNT_ID = "topbar-mount";
const APP_TITLE_PREFIX = "Onion";

let initialized = false;
let mounted = false;
let root = null;
let cleanupEvents = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function titleCase(value = "") {
  const clean = cleanText(value, "");

  if (!clean) return "";

  return clean
    .replace(/^\/+/, "")
    .replace(/^@[^/]+\/?/, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/* =========================================================
   DOM
========================================================= */

function byId(id = "") {
  if (!isBrowser() || !id) return null;
  return document.getElementById(id);
}

function clear(node = null) {
  if (!node) return false;

  try {
    node.replaceChildren();
    return true;
  } catch {
    node.textContent = "";
    return true;
  }
}

function getMount() {
  if (!isBrowser()) return null;

  return (
    byId(TOPBAR_MOUNT_ID) ||
    byId(TOPBAR_ROOT_ID) ||
    document.querySelector?.("[data-topbar-mount]") ||
    document.querySelector?.("[data-topbar-root]") ||
    null
  );
}

function getRefs() {
  return getTopbarTemplateRefs(root);
}

function setHidden(node = null, hidden = false) {
  if (!node) return false;

  const value = Boolean(hidden);

  try {
    node.hidden = value;
    node.setAttribute("aria-hidden", value ? "true" : "false");

    if (node.dataset) {
      node.dataset.topbarVisible = value ? "false" : "true";
    }

    return true;
  } catch {
    return false;
  }
}

function syncMountVisibility(hidden = false) {
  const mount = byId(TOPBAR_MOUNT_ID);

  if (!mount || mount === root) return false;

  return setHidden(mount, hidden);
}

function mountRoot(nextRoot) {
  const mount = getMount();

  if (!mount || !nextRoot) return null;

  unbindEvents();

  if (mount.matches?.("[data-topbar-root], #app-topbar")) {
    clear(mount);

    for (const child of [...nextRoot.childNodes]) {
      mount.appendChild(child);
    }

    mount.className = nextRoot.className;

    for (const [key, value] of Object.entries(nextRoot.dataset || {})) {
      mount.dataset[key] = value;
    }

    mount.setAttribute("role", nextRoot.getAttribute("role") || "banner");
    mount.setAttribute("aria-label", nextRoot.getAttribute("aria-label") || "Barra superior");
    mount.setAttribute("aria-hidden", nextRoot.getAttribute("aria-hidden") || "false");

    mount.hidden = nextRoot.hidden === true;

    root = mount;
  } else {
    clear(mount);
    mount.appendChild(nextRoot);
    root = nextRoot;
  }

  bindEvents();
  cacheDom();
  mounted = true;

  return root;
}

function ensureRoot(options = {}) {
  if (!isBrowser()) return null;

  const current =
    root ||
    byId(TOPBAR_ROOT_ID) ||
    document.querySelector?.("[data-topbar-root]") ||
    null;

  if (current) {
    root = current;
    bindEvents();
    cacheDom();
    mounted = true;
    return root;
  }

  const topbar = createTopbarTemplate({
    id: TOPBAR_ROOT_ID,
    title: resolveRouteTitle(options),
    visible: options.visible === true,
    search: options.search !== false,
    searchOptions: options.searchOptions || {},
  });

  return mountRoot(topbar);
}

/* =========================================================
   DOM CACHE
========================================================= */

function cacheDom() {
  const refs = getRefs();

  try {
    AppCore.dom = isObject(AppCore.dom) ? AppCore.dom : {};

    AppCore.dom.topbar = refs.root;
    AppCore.dom.appTopbar = refs.root;
    AppCore.dom.topbarRoot = refs.root;
    AppCore.dom.topbarMount =
      byId(TOPBAR_MOUNT_ID) ||
      (refs.root?.parentElement?.id === TOPBAR_MOUNT_ID ? refs.root.parentElement : null);

    AppCore.dom.topbarTitle = refs.title;

    AppCore.dom.search = refs.search;
    AppCore.dom.searchForm = refs.search;
    AppCore.dom.searchInput = refs.searchInput;
    AppCore.dom.searchSubmit = refs.searchSubmit;
    AppCore.dom.searchResults = refs.searchResults;

    return true;
  } catch {
    return false;
  }
}

function clearDomCache() {
  try {
    if (!isObject(AppCore.dom)) return false;

    delete AppCore.dom.topbar;
    delete AppCore.dom.appTopbar;
    delete AppCore.dom.topbarRoot;
    delete AppCore.dom.topbarMount;
    delete AppCore.dom.topbarTitle;

    delete AppCore.dom.search;
    delete AppCore.dom.searchForm;
    delete AppCore.dom.searchInput;
    delete AppCore.dom.searchSubmit;
    delete AppCore.dom.searchResults;

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ROUTE TITLE
========================================================= */

function currentPath() {
  const state = AppCore?.state || {};

  if (state.canonicalPath || state.route) {
    return cleanText(state.canonicalPath || state.route, "/");
  }

  if (!isBrowser()) return "/";

  return cleanText(window.location.pathname || "/", "/");
}

function resolveTitleFromPath(path = "/") {
  const clean = cleanText(path, "/").split("?")[0].split("#")[0];

  if (clean === "/" || clean.startsWith("/@")) {
    const parts = clean.split("/").filter(Boolean);

    if (parts.length <= 1) return "Home";

    return titleCase(parts[1]) || "Home";
  }

  return titleCase(clean) || "Home";
}

function resolveRouteTitle(options = {}) {
  const route = options.route || null;

  if (route?.title) return `${APP_TITLE_PREFIX} ${cleanText(route.title)}`;
  if (route?.name) return `${APP_TITLE_PREFIX} ${titleCase(route.name)}`;

  const path =
    options.canonicalPath ||
    options.path ||
    options.publicPath ||
    currentPath();

  return `${APP_TITLE_PREFIX} ${resolveTitleFromPath(path)}`;
}

function syncTitle(options = {}) {
  ensureRoot(options);

  if (!root) return false;

  return setTopbarTemplateTitle(root, resolveRouteTitle(options));
}

/* =========================================================
   VISIBILITY
========================================================= */

function shouldHide(options = {}) {
  const route = options.route || null;
  const state = AppCore?.state || {};

  return Boolean(
    route?.public === true ||
      route?.hideShell === true ||
      route?.layout === "auth" ||
      options.routeMode === "auth" ||
      options.chrome === "hidden" ||
      state.routeMode === "auth" ||
      state.chromeHidden === true ||
      state.chrome === "hidden"
  );
}

function syncVisibility(options = {}) {
  ensureRoot(options);

  if (!root) return false;

  const hidden = shouldHide(options);

  setTopbarTemplateVisible(root, !hidden);
  syncMountVisibility(hidden);

  if (hidden) {
    clearTopbarSearchResults(root);
  }

  return true;
}

/* =========================================================
   LOCAL EVENTS
========================================================= */

function onSubmit(event) {
  event.preventDefault();
}

function onKeydown(event) {
  if (event.key !== "Escape") return;

  clearTopbarSearchResults(root);
}

function onInput(event) {
  const value = cleanText(event.target?.value || "", "");

  if (!value) {
    clearTopbarSearchResults(root);
  }
}

function bindEvents() {
  if (!root || cleanupEvents) return false;

  const refs = getRefs();

  try {
    refs.search?.addEventListener?.("submit", onSubmit);
    refs.searchInput?.addEventListener?.("keydown", onKeydown);
    refs.searchInput?.addEventListener?.("input", onInput);
  } catch {
    cleanupEvents = null;
    return false;
  }

  cleanupEvents = () => {
    try {
      refs.search?.removeEventListener?.("submit", onSubmit);
      refs.searchInput?.removeEventListener?.("keydown", onKeydown);
      refs.searchInput?.removeEventListener?.("input", onInput);
    } catch {
      // noop
    }

    cleanupEvents = null;
    return true;
  };

  return true;
}

function unbindEvents() {
  try {
    cleanupEvents?.();
  } catch {
    cleanupEvents = null;
  }

  cleanupEvents = null;

  return true;
}

/* =========================================================
   REGISTRATION
========================================================= */

function registerModule() {
  try {
    AppCore.ui = isObject(AppCore.ui) ? AppCore.ui : {};
    AppCore.ui.topbar = TopbarUI;

    AppCore.topbar = TopbarUI;
    AppCore.Topbar = TopbarUI;

    AppCore.registerModule?.("topbar", TopbarUI, {
      overwrite: true,
    });

    AppCore.modules?.register?.("topbar", TopbarUI, {
      overwrite: true,
    });

    return true;
  } catch {
    return false;
  }
}

function unregisterModule() {
  try {
    if (AppCore.ui?.topbar === TopbarUI) {
      delete AppCore.ui.topbar;
    }

    if (AppCore.topbar === TopbarUI) {
      delete AppCore.topbar;
    }

    if (AppCore.Topbar === TopbarUI) {
      delete AppCore.Topbar;
    }

    AppCore.modules?.remove?.("topbar");

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   LIFECYCLE
========================================================= */

function sync(options = {}) {
  ensureRoot(options);

  if (!root) return false;

  syncTitle(options);
  syncVisibility(options);
  cacheDom();

  mounted = true;

  return true;
}

function init(options = {}) {
  initialized = true;

  registerModule();

  /*
    App inicializa UI antes de que Router resuelva la ruta.
    Por eso el topbar se monta oculto hasta que Router haga sync(route).
  */
  ensureRoot({
    ...options,
    visible: false,
  });

  setTopbarTemplateVisible(root, false);
  syncMountVisibility(true);
  cacheDom();

  return TopbarUI;
}

function render(options = {}) {
  return sync(options);
}

function refresh(options = {}) {
  return sync(options);
}

function destroy(options = {}) {
  unbindEvents();

  if (options.unmount === true && root) {
    try {
      root.remove();
    } catch {
      clear(root);
    }
  } else if (root) {
    setHidden(root, true);
    clearTopbarSearchResults(root);
  }

  root = null;
  mounted = false;
  initialized = false;

  clearDomCache();
  unregisterModule();

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getSnapshot() {
  const refs = getRefs();

  return {
    version: TOPBAR_VERSION,

    initialized,
    mounted,

    visible: Boolean(refs.root && refs.root.hidden !== true),
    title: refs.title?.textContent || "",
    hasRoot: Boolean(refs.root),

    search: {
      enabled: Boolean(refs.search),
      hasInput: Boolean(refs.searchInput),
      hasSubmit: Boolean(refs.searchSubmit),
      hasResults: Boolean(refs.searchResults),
      expanded: refs.searchInput?.getAttribute?.("aria-expanded") || null,
      resultsHidden: refs.searchResults ? refs.searchResults.hidden === true : null,
    },
  };
}

/* =========================================================
   API
========================================================= */

export const TopbarUI = {
  version: TOPBAR_VERSION,

  init,
  render,
  refresh,
  sync,
  destroy,

  mountTopbar: ensureRoot,

  unmountTopbar: (options = {}) =>
    destroy({
      ...options,
      unmount: true,
    }),

  syncTitle,
  resolveRouteTitle,

  clearSearch: () => clearTopbarSearchResults(root),

  getDom: () => {
    const refs = getRefs();

    return {
      topbar: refs.root,
      title: refs.title,

      search: refs.search,
      searchForm: refs.search,
      searchInput: refs.searchInput,
      searchSubmit: refs.searchSubmit,
      searchResults: refs.searchResults,
    };
  },

  getState: getSnapshot,
  getSnapshot,
  getDebugSnapshot: getSnapshot,

  get initialized() {
    return initialized;
  },

  get mounted() {
    return mounted;
  },
};

export default TopbarUI;
