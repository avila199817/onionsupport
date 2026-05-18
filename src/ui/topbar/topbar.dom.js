/* =========================================================
   Onion Support - Topbar DOM
   Archivo: /src/ui/topbar/topbar.dom.js

   Responsabilidad:
   - Compat DOM mínima para Topbar.
   - Montar en #topbar-mount.
   - Cachear refs básicas en AppCore.dom.
   - Sin search runtime.
   - Sin overlays.
   - Sin glass DOM.
   - Sin duplicados complejos.
   - Sin CSS inline.
   - Sin submódulos.
   - Sin magia negra.
   - El topbar real vive en src/ui/topbar/index.js.
========================================================= */

export const TOPBAR_DOM_VERSION = "simple";

export const TOPBAR_IDS = Object.freeze({
  mount: "topbar-mount",
  root: "app-topbar",
  legacyRoot: "topbar",
  title: "topbar-title",
  mobileToggle: "toggleSidebarMobile",

  // Compat: ya no se renderiza búsqueda aquí.
  searchInput: "topbar-search",
  searchResults: "topbar-search-results",
  searchLabel: "topbar-search-label",

  viewContainer: "view-container",
});

export const TOPBAR_SELECTORS = Object.freeze({
  layout: ".layout",
  appShell: "#app-shell, [data-app-shell], .app-shell",
  topbarMount: "#topbar-mount, [data-topbar-mount]",
  topbar: "#app-topbar, #topbar, [data-topbar-root], [data-topbar='root'], .topbar",

  topbarLeft: ".topbar-left, [data-topbar-left]",
  topbarRight: ".topbar-right, [data-topbar-user], .topbar-right",
  mobileToggle: "[data-topbar-sidebar-toggle], #toggleSidebarMobile, .topbar-sidebar-toggle",
  title: "[data-topbar-title], #topbar-title, .topbar-title",

  searchWrap: "[data-topbar='search-wrap'], .topbar-search-wrap",
  searchIcon: "[data-topbar='search-icon'], .topbar-search-icon",
  searchInput: "#topbar-search, [data-topbar='search-input'], .topbar-search",
  searchResults: "#topbar-search-results, [data-topbar='search-results'], .topbar-search-results",
  searchLabel: "#topbar-search-label, [data-topbar='search-label']",

  sidebar: "#app-sidebar, #sidebar, [data-sidebar-root], .sidebar",
  mainContent: "#main-content, #app-main, main",
  appContent: "#app-content, [data-app-content], .app-content",
  viewContainer: "#view-container, [data-view-container], .view-container",
});

const fallbackDomCache = {};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isElement(value) {
  return Boolean(value && value.nodeType === 1);
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function getAppDom(AppCore = null) {
  if (!isObject(AppCore)) return fallbackDomCache;

  try {
    AppCore.dom = isObject(AppCore.dom) ? AppCore.dom : {};
    return AppCore.dom;
  } catch {
    return fallbackDomCache;
  }
}

function query(selector = "", root = null) {
  if (!isBrowser() || !selector) return null;

  try {
    return (root || document).querySelector(selector);
  } catch {
    return null;
  }
}

function byId(id = "") {
  if (!isBrowser() || !id) return null;

  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function connected(node = null) {
  if (!isElement(node)) return null;

  try {
    if (node.isConnected === true) return node;
  } catch {
    // noop
  }

  try {
    return document.contains(node) ? node : null;
  } catch {
    return null;
  }
}

function clear(node = null) {
  if (!node) return false;

  try {
    node.replaceChildren();
    return true;
  } catch {
    try {
      node.textContent = "";
      return true;
    } catch {
      return false;
    }
  }
}

function setAttr(node = null, name = "", value = "") {
  if (!isElement(node) || !name) return false;

  try {
    node.setAttribute(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function ensureId(node = null, id = "") {
  if (!isElement(node)) return "";

  const current = text(node.id, "");
  if (current) return current;

  const next = text(id, "");
  if (!next) return "";

  try {
    node.id = next;
    return next;
  } catch {
    return "";
  }
}

/* =========================================================
   TEMPLATE
========================================================= */

export function getTopbarTemplate() {
  return `
    <header
      id="${TOPBAR_IDS.root}"
      class="topbar app-topbar"
      data-topbar-root="true"
      data-topbar="root"
      role="banner"
      aria-label="Barra superior"
    >
      <div class="topbar-left" data-topbar-left="true">
        <button
          id="${TOPBAR_IDS.mobileToggle}"
          class="topbar-sidebar-toggle"
          type="button"
          data-topbar-sidebar-toggle="true"
          aria-label="Abrir menú"
          aria-expanded="false"
        >☰</button>

        <h1
          id="${TOPBAR_IDS.title}"
          class="topbar-title"
          data-topbar-title="true"
        >Onion Support</h1>
      </div>

      <div
        class="topbar-right"
        data-topbar-user="true"
      ></div>
    </header>
  `;
}

function createTopbarElement() {
  if (!isBrowser()) return null;

  try {
    const template = document.createElement("template");
    template.innerHTML = getTopbarTemplate().trim();
    return template.content.firstElementChild || null;
  } catch {
    return null;
  }
}

function createTopbarMountElement() {
  if (!isBrowser()) return null;

  const mount = document.createElement("div");
  mount.id = TOPBAR_IDS.mount;
  mount.dataset.topbarMount = "true";

  return mount;
}

/* =========================================================
   ROOT RESOLVERS
========================================================= */

export function getShellRootEl(AppCore = null) {
  if (!isBrowser()) return null;

  const dom = getAppDom(AppCore);

  return (
    connected(dom.appShell) ||
    connected(dom.shell) ||
    connected(dom.layout) ||
    connected(byId("app-shell")) ||
    connected(query(TOPBAR_SELECTORS.appShell)) ||
    document.body ||
    null
  );
}

export function getMainContentEl(AppCore = null) {
  if (!isBrowser()) return null;

  const dom = getAppDom(AppCore);

  return (
    connected(dom.mainContent) ||
    connected(dom.main) ||
    connected(byId("main-content")) ||
    connected(byId("app-main")) ||
    connected(query(TOPBAR_SELECTORS.mainContent)) ||
    null
  );
}

export function getAppContentEl(AppCore = null) {
  if (!isBrowser()) return null;

  const dom = getAppDom(AppCore);

  return (
    connected(dom.appContent) ||
    connected(byId("app-content")) ||
    connected(query(TOPBAR_SELECTORS.appContent)) ||
    null
  );
}

export function getViewContainerEl(AppCore = null) {
  if (!isBrowser()) return null;

  const dom = getAppDom(AppCore);

  return (
    connected(dom.viewContainer) ||
    connected(byId(TOPBAR_IDS.viewContainer)) ||
    connected(query(TOPBAR_SELECTORS.viewContainer)) ||
    null
  );
}

export function getSidebarEl(AppCore = null) {
  if (!isBrowser()) return null;

  const dom = getAppDom(AppCore);

  return (
    connected(dom.sidebar) ||
    connected(dom.sidebarRoot) ||
    connected(byId("app-sidebar")) ||
    connected(byId("sidebar")) ||
    connected(query(TOPBAR_SELECTORS.sidebar)) ||
    null
  );
}

export function getTopbarMountEl(AppCore = null, options = {}) {
  if (!isBrowser()) return null;

  const dom = getAppDom(AppCore);

  const existing =
    connected(dom.topbarMount) ||
    connected(byId(TOPBAR_IDS.mount)) ||
    connected(query(TOPBAR_SELECTORS.topbarMount));

  if (existing) {
    existing.dataset.topbarMount = "true";
    return existing;
  }

  if (options?.create === false) return null;

  const shell = options?.shellRoot || getShellRootEl(AppCore);
  if (!shell) return null;

  const mount = createTopbarMountElement();
  if (!mount) return null;

  try {
    const main = getMainContentEl(AppCore);
    const sidebarMount = connected(byId("sidebar-mount"));

    if (sidebarMount && sidebarMount.parentNode === shell) {
      sidebarMount.insertAdjacentElement("afterend", mount);
    } else if (main && main.parentNode === shell) {
      shell.insertBefore(mount, main);
    } else {
      shell.prepend(mount);
    }

    return connected(mount);
  } catch {
    return null;
  }
}

/* =========================================================
   MOUNT
========================================================= */

function findTopbar(AppCore = null) {
  const dom = getAppDom(AppCore);

  return (
    connected(dom.topbar) ||
    connected(dom.appTopbar) ||
    connected(dom.topbarRoot) ||
    connected(byId(TOPBAR_IDS.root)) ||
    connected(byId(TOPBAR_IDS.legacyRoot)) ||
    connected(query(TOPBAR_SELECTORS.topbar)) ||
    null
  );
}

function removeDuplicateTopbars(keep = null) {
  if (!isBrowser()) return keep;

  try {
    const nodes = [
      ...document.querySelectorAll(TOPBAR_SELECTORS.topbar),
    ];

    for (const node of nodes) {
      if (!isElement(node) || node === keep) continue;
      node.remove();
    }
  } catch {
    // noop
  }

  return keep;
}

export function mountTopbar(AppCore = null) {
  if (!isBrowser()) return null;

  const mount = getTopbarMountEl(AppCore, {
    create: true,
  });

  if (!mount) return null;

  let topbar = findTopbar(AppCore);

  if (!topbar) {
    topbar = createTopbarElement();
  }

  if (!topbar) return null;

  try {
    if (topbar.parentNode !== mount) {
      clear(mount);
      mount.appendChild(topbar);
    }
  } catch {
    return null;
  }

  removeDuplicateTopbars(topbar);
  prepareTopbarDom(topbar);
  syncTopbarDomCache(AppCore);

  return topbar;
}

/* =========================================================
   PREP
========================================================= */

export function prepareTopbarDom(topbar = null) {
  if (!isBrowser()) return false;

  const root =
    connected(topbar) ||
    connected(byId(TOPBAR_IDS.root)) ||
    connected(byId(TOPBAR_IDS.legacyRoot)) ||
    connected(query(TOPBAR_SELECTORS.topbar));

  if (!root) return false;

  ensureId(root, TOPBAR_IDS.root);
  root.classList.add("topbar", "app-topbar");
  setAttr(root, "data-topbar-root", "true");
  setAttr(root, "data-topbar", "root");
  setAttr(root, "role", "banner");
  setAttr(root, "aria-label", "Barra superior");

  const title =
    connected(query("[data-topbar-title]", root)) ||
    connected(query(".topbar-title", root)) ||
    connected(byId(TOPBAR_IDS.title));

  if (title) {
    ensureId(title, TOPBAR_IDS.title);
    title.classList.add("topbar-title");
    setAttr(title, "data-topbar-title", "true");
  }

  const toggle =
    connected(query("[data-topbar-sidebar-toggle]", root)) ||
    connected(query(".topbar-sidebar-toggle", root)) ||
    connected(byId(TOPBAR_IDS.mobileToggle));

  if (toggle) {
    ensureId(toggle, TOPBAR_IDS.mobileToggle);
    toggle.classList.add("topbar-sidebar-toggle");
    setAttr(toggle, "type", "button");
    setAttr(toggle, "data-topbar-sidebar-toggle", "true");
    setAttr(toggle, "aria-label", toggle.getAttribute("aria-label") || "Abrir menú");
    setAttr(toggle, "aria-expanded", toggle.getAttribute("aria-expanded") || "false");
  }

  const user =
    connected(query("[data-topbar-user]", root)) ||
    connected(query(".topbar-right", root));

  if (user) {
    user.classList.add("topbar-right");
    setAttr(user, "data-topbar-user", "true");
  }

  return true;
}

/* =========================================================
   DOM GETTERS / CACHE
========================================================= */

export function getTopbarDom(AppCore = null) {
  if (!isBrowser()) {
    return {
      topbarMount: null,
      topbar: null,
      title: null,
      mobileToggle: null,
      sidebar: null,
      topbarLeft: null,
      topbarRight: null,
      searchWrap: null,
      searchIcon: null,
      searchInput: null,
      searchResults: null,
      searchLabel: null,
      mainContent: null,
      appContent: null,
      viewContainer: null,
    };
  }

  const dom = getAppDom(AppCore);
  const topbar = findTopbar(AppCore);

  return {
    topbarMount:
      connected(dom.topbarMount) ||
      connected(byId(TOPBAR_IDS.mount)) ||
      connected(query(TOPBAR_SELECTORS.topbarMount)) ||
      null,

    topbar,

    title:
      connected(dom.topbarTitle) ||
      connected(query("[data-topbar-title]", topbar)) ||
      connected(query(".topbar-title", topbar)) ||
      connected(byId(TOPBAR_IDS.title)) ||
      null,

    mobileToggle:
      connected(dom.mobileSidebarToggle) ||
      connected(dom.toggleSidebarMobile) ||
      connected(query("[data-topbar-sidebar-toggle]", topbar)) ||
      connected(query(".topbar-sidebar-toggle", topbar)) ||
      connected(byId(TOPBAR_IDS.mobileToggle)) ||
      null,

    sidebar: getSidebarEl(AppCore),

    topbarLeft:
      connected(dom.topbarLeft) ||
      connected(query(".topbar-left", topbar)) ||
      null,

    topbarRight:
      connected(dom.topbarRight) ||
      connected(query("[data-topbar-user]", topbar)) ||
      connected(query(".topbar-right", topbar)) ||
      null,

    // Search compat: el topbar simple no lo monta.
    searchWrap: null,
    searchIcon: null,
    searchInput: null,
    searchResults: null,
    searchLabel: null,

    mainContent: getMainContentEl(AppCore),
    appContent: getAppContentEl(AppCore),
    viewContainer: getViewContainerEl(AppCore),
  };
}

export function syncTopbarDomCache(AppCore = null) {
  const cache = getAppDom(AppCore);
  const dom = getTopbarDom(AppCore);

  cache.topbarMount = dom.topbarMount || null;
  cache.topbar = dom.topbar || null;
  cache.appTopbar = dom.topbar || null;
  cache.topbarRoot = dom.topbar || null;
  cache.topbarTitle = dom.title || null;
  cache.mobileSidebarToggle = dom.mobileToggle || null;
  cache.toggleSidebarMobile = dom.mobileToggle || null;
  cache.sidebar = dom.sidebar || connected(cache.sidebar) || null;
  cache.topbarLeft = dom.topbarLeft || null;
  cache.topbarRight = dom.topbarRight || null;

  cache.searchWrap = null;
  cache.searchIcon = null;
  cache.searchInput = null;
  cache.searchResults = null;
  cache.searchLabel = null;

  cache.mainContent = dom.mainContent || connected(cache.mainContent) || null;
  cache.appContent = dom.appContent || connected(cache.appContent) || null;
  cache.viewContainer = dom.viewContainer || connected(cache.viewContainer) || null;

  return dom;
}

/* =========================================================
   UTILITIES
========================================================= */

export function isTopbarMounted(AppCore = null) {
  const dom = getTopbarDom(AppCore);
  return Boolean(dom.topbar);
}

export function unmountTopbar(AppCore = null) {
  const cache = getAppDom(AppCore);
  const dom = getTopbarDom(AppCore);

  try {
    dom.topbar?.remove?.();
  } catch {
    // noop
  }

  cache.topbar = null;
  cache.appTopbar = null;
  cache.topbarRoot = null;
  cache.topbarTitle = null;
  cache.mobileSidebarToggle = null;
  cache.toggleSidebarMobile = null;
  cache.topbarLeft = null;
  cache.topbarRight = null;

  cache.searchWrap = null;
  cache.searchIcon = null;
  cache.searchInput = null;
  cache.searchResults = null;
  cache.searchLabel = null;

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  TOPBAR_DOM_VERSION,
  TOPBAR_IDS,
  TOPBAR_SELECTORS,

  getTopbarTemplate,

  getShellRootEl,
  getTopbarMountEl,
  getMainContentEl,
  getAppContentEl,
  getViewContainerEl,
  getSidebarEl,

  mountTopbar,
  prepareTopbarDom,

  getTopbarDom,
  syncTopbarDomCache,

  isTopbarMounted,
  unmountTopbar,
};
