/* =========================================================
   Onion Support - Topbar UI
   Archivo: /src/ui/topbar/index.js

   Responsabilidad:
   - Topbar mínimo del panel.
   - Montar en #topbar-mount / #app-topbar.
   - Mostrar título de ruta.
   - Ocultarse en rutas públicas/auth.
   - Registrarse en AppCore.
   - Sin search, sin Auth, sin Router propio, sin HTTP,
     sin Toast, sin Store, sin logout, sin sidebar bridge.
========================================================= */

import { AppCore } from "../../core/index.js";

export const TOPBAR_VERSION = "topbar.minimal.v1";

const APP_TITLE_PREFIX = "Onion";

let initialized = false;
let mounted = false;
let root = null;

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

function setHidden(node = null, hidden = false) {
  if (!node) return false;

  const value = Boolean(hidden);

  node.hidden = value;
  node.setAttribute("aria-hidden", value ? "true" : "false");
  node.dataset.topbarVisible = value ? "false" : "true";

  return true;
}

function getMount() {
  return (
    byId("topbar-mount") ||
    byId("app-topbar") ||
    document.querySelector?.("[data-topbar-mount]") ||
    document.querySelector?.("[data-topbar-root]") ||
    null
  );
}

function createRoot() {
  const header = document.createElement("header");

  header.id = "app-topbar";
  header.className = "topbar app-topbar";
  header.dataset.topbarRoot = "true";
  header.setAttribute("role", "banner");
  header.setAttribute("aria-label", "Barra superior");

  const left = document.createElement("div");
  left.className = "topbar-left";
  left.dataset.topbarLeft = "true";

  const title = document.createElement("h1");
  title.id = "topbar-title";
  title.className = "topbar-title";
  title.dataset.topbarTitle = "true";
  title.textContent = `${APP_TITLE_PREFIX} Home`;

  left.appendChild(title);
  header.appendChild(left);

  return header;
}

function ensureRoot() {
  if (!isBrowser()) return null;

  const mount = getMount();

  if (!mount) return null;

  if (mount.matches?.("[data-topbar-root], #app-topbar")) {
    root = mount;
  } else {
    root = mount.querySelector("[data-topbar-root]");

    if (!root) {
      root = createRoot();
      clear(mount);
      mount.appendChild(root);
    }
  }

  if (!root.querySelector("[data-topbar-title]")) {
    clear(root);

    const left = document.createElement("div");
    left.className = "topbar-left";
    left.dataset.topbarLeft = "true";

    const title = document.createElement("h1");
    title.id = "topbar-title";
    title.className = "topbar-title";
    title.dataset.topbarTitle = "true";

    left.appendChild(title);
    root.appendChild(left);
  }

  cacheDom();
  return root;
}

function cacheDom() {
  try {
    AppCore.dom = isObject(AppCore.dom) ? AppCore.dom : {};

    AppCore.dom.topbar = root;
    AppCore.dom.appTopbar = root;
    AppCore.dom.topbarRoot = root;
    AppCore.dom.topbarMount =
      byId("topbar-mount") ||
      (root?.parentElement?.id === "topbar-mount" ? root.parentElement : null);
    AppCore.dom.topbarTitle = root?.querySelector?.("[data-topbar-title]") || null;

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
  ensureRoot();

  const title = root?.querySelector?.("[data-topbar-title]");

  if (!title) return false;

  const next = resolveRouteTitle(options);

  title.textContent = next;
  title.dataset.routeTitle = next;

  return true;
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
      state.routeMode === "auth" ||
      state.chromeHidden === true
  );
}

function syncVisibility(options = {}) {
  ensureRoot();

  if (!root) return false;

  return setHidden(root, shouldHide(options));
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
  ensureRoot();

  if (!root) return false;

  syncTitle(options);
  syncVisibility(options);

  mounted = true;

  return true;
}

function init(options = {}) {
  initialized = true;

  registerModule();
  ensureRoot();
  sync(options);

  return TopbarUI;
}

function render(options = {}) {
  return sync(options);
}

function refresh(options = {}) {
  return sync(options);
}

function destroy(options = {}) {
  if (options.unmount === true && root) {
    try {
      root.remove();
    } catch {
      clear(root);
    }
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
  return {
    version: TOPBAR_VERSION,
    initialized,
    mounted,
    visible: Boolean(root && !root.hidden),
    title: root?.querySelector?.("[data-topbar-title]")?.textContent || "",
    hasRoot: Boolean(root),
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

  getDom: () => ({
    topbar: root,
    title: root?.querySelector?.("[data-topbar-title]") || null,
  }),

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
