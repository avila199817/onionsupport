/* =========================================================
   Onion Support - Topbar DOM
   Archivo: /src/ui/topbar/topbar.dom.js

   Responsabilidad:
   - Compat DOM mínima para Topbar.
   - Montar en #topbar-mount.
   - Cachear refs básicas en AppCore.dom.
   - Mantener contrato DOM actual: título + search.
   - No renderizar hamburguesa.
   - No renderizar usuario.
   - No renderizar logout.
   - Sin search runtime.
   - Sin overlays.
   - Sin glass DOM.
   - Sin duplicados complejos.
   - Sin CSS inline.
   - Sin magia negra.
   - El topbar real vive en src/ui/topbar/index.js.
========================================================= */

export const TOPBAR_DOM_VERSION = "topbar.dom.v3";

export const TOPBAR_IDS = Object.freeze({
  mount: "topbar-mount",
  root: "app-topbar",
  legacyRoot: "topbar",
  title: "topbar-title",

  // Legacy: ya no se renderiza.
  mobileToggle: "toggleSidebarMobile",

  // Search DOM actual.
  searchForm: "topbar-search-form",
  searchInput: "topbar-search-input",
  searchSubmit: "topbar-search-submit",
  searchResults: "topbar-search-results",
  searchLabel: "topbar-search-label",

  viewContainer: "view-container",
});

export const TOPBAR_SELECTORS = Object.freeze({
  layout: ".layout",
  appShell: "#app-shell, [data-app-shell], .app-shell",
  topbarMount: "#topbar-mount, [data-topbar-mount]",
  topbar:
    "#app-topbar, #topbar, [data-topbar-root], [data-topbar='root'], .topbar",

  topbarLeft: ".topbar-left, [data-topbar-left]",
  topbarRight: ".topbar-right, [data-topbar-search-shell]",

  // Legacy selectors: sólo detección/limpieza, no render activo.
  mobileToggle:
    "[data-topbar-sidebar-toggle], #toggleSidebarMobile, .topbar-sidebar-toggle",
  userChrome:
    "[data-topbar-user], [data-topbar-logout], .topbar-user, .topbar-logout",

  title: "[data-topbar-title], #topbar-title, .topbar-title",

  searchForm: "[data-topbar-search], #topbar-search-form, .topbar-search",
  searchInput:
    "[data-topbar-search-input], #topbar-search-input, .topbar-search-input",
  searchSubmit:
    "[data-topbar-search-submit], #topbar-search-submit, .topbar-search-submit",
  searchResults:
    "#topbar-search-results, [data-topbar-search-results], .topbar-search-results",
  searchLabel: "#topbar-search-label, [data-topbar-search-label]",

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
        <h1
          id="${TOPBAR_IDS.title}"
          class="topbar-title"
          data-topbar-title="true"
        >Onion Home</h1>
      </div>

      <div
        class="topbar-right"
        data-topbar-search-shell="true"
      >
        <form
          id="${TOPBAR_IDS.searchForm}"
          class="topbar-search"
          data-topbar-search="true"
          role="search"
          action="#"
          novalidate
          autocomplete="off"
          aria-label="Buscar"
        >
          <input
            id="${TOPBAR_IDS.searchInput}"
            class="topbar-search-input"
            data-topbar-search-input="true"
            type="search"
            inputmode="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="Buscar"
            aria-label="Buscar"
          >

          <button
            id="${TOPBAR_IDS.searchSubmit}"
            class="topbar-search-submit"
            data-topbar-search-submit="true"
            type="submit"
            aria-label="Buscar"
          >
            <svg
              class="topbar-search-svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              focusable="false"
              aria-hidden="true"
            >
              <path
                d="M21 21l-4.35-4.35 M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              ></path>
            </svg>
          </button>
        </form>
      </div>
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
   STRUCTURE
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

function hasLegacyChrome(root = null) {
  if (!isElement(root)) return false;

  return Boolean(
    query(TOPBAR_SELECTORS.mobileToggle, root) ||
      query(TOPBAR_SELECTORS.userChrome, root)
  );
}

function hasRequiredStructure(root = null) {
  if (!isElement(root)) return false;

  return Boolean(
    query(TOPBAR_SELECTORS.title, root) &&
      query(TOPBAR_SELECTORS.searchForm, root) &&
      query(TOPBAR_SELECTORS.searchInput, root) &&
      query(TOPBAR_SELECTORS.searchSubmit, root)
  );
}

function renderTopbarContent(root = null) {
  if (!isElement(root)) return false;

  const fresh = createTopbarElement();
  if (!fresh) return false;

  try {
    root.className = fresh.className;
    root.replaceChildren(...fresh.childNodes);
    return true;
  } catch {
    return false;
  }
}

function removeDuplicateTopbars(keep = null) {
  if (!isBrowser()) return keep;

  try {
    const nodes = [...document.querySelectorAll(TOPBAR_SELECTORS.topbar)];

    for (const node of nodes) {
      if (!isElement(node) || node === keep) continue;
      node.remove();
    }
  } catch {
    // noop
  }

  return keep;
}

/* =========================================================
   MOUNT
========================================================= */

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

  if (!hasRequiredStructure(root) || hasLegacyChrome(root)) {
    renderTopbarContent(root);
  }

  const title =
    connected(query(TOPBAR_SELECTORS.title, root)) ||
    connected(byId(TOPBAR_IDS.title));

  if (title) {
    ensureId(title, TOPBAR_IDS.title);
    title.classList.add("topbar-title");
    setAttr(title, "data-topbar-title", "true");
  }

  const left = connected(query(TOPBAR_SELECTORS.topbarLeft, root));

  if (left) {
    left.classList.add("topbar-left");
    setAttr(left, "data-topbar-left", "true");
  }

  const right = connected(query(TOPBAR_SELECTORS.topbarRight, root));

  if (right) {
    right.classList.add("topbar-right");
    setAttr(right, "data-topbar-search-shell", "true");
    right.removeAttribute("data-topbar-user");
  }

  const search = connected(query(TOPBAR_SELECTORS.searchForm, root));

  if (search) {
    ensureId(search, TOPBAR_IDS.searchForm);
    search.classList.add("topbar-search");
    setAttr(search, "data-topbar-search", "true");
    setAttr(search, "role", "search");
    setAttr(search, "action", "#");
    setAttr(search, "autocomplete", "off");
    setAttr(search, "aria-label", "Buscar");
  }

  const input = connected(query(TOPBAR_SELECTORS.searchInput, root));

  if (input) {
    ensureId(input, TOPBAR_IDS.searchInput);
    input.classList.add("topbar-search-input");
    setAttr(input, "data-topbar-search-input", "true");
    setAttr(input, "type", "search");
    setAttr(input, "inputmode", "search");
    setAttr(input, "autocomplete", "off");
    setAttr(input, "spellcheck", "false");
    setAttr(input, "placeholder", input.getAttribute("placeholder") || "Buscar");
    setAttr(input, "aria-label", input.getAttribute("aria-label") || "Buscar");
  }

  const submit = connected(query(TOPBAR_SELECTORS.searchSubmit, root));

  if (submit) {
    ensureId(submit, TOPBAR_IDS.searchSubmit);
    submit.classList.add("topbar-search-submit");
    setAttr(submit, "data-topbar-search-submit", "true");
    setAttr(submit, "type", "submit");
    setAttr(submit, "aria-label", submit.getAttribute("aria-label") || "Buscar");
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
      search: null,
      searchForm: null,
      searchInput: null,
      searchSubmit: null,
      searchResults: null,
      searchLabel: null,
      mainContent: null,
      appContent: null,
      viewContainer: null,
    };
  }

  const dom = getAppDom(AppCore);
  const topbar = findTopbar(AppCore);

  const searchForm =
    connected(dom.searchForm) ||
    connected(query(TOPBAR_SELECTORS.searchForm, topbar)) ||
    null;

  const searchInput =
    connected(dom.searchInput) ||
    connected(query(TOPBAR_SELECTORS.searchInput, topbar)) ||
    connected(byId(TOPBAR_IDS.searchInput)) ||
    null;

  const searchSubmit =
    connected(dom.searchSubmit) ||
    connected(query(TOPBAR_SELECTORS.searchSubmit, topbar)) ||
    connected(byId(TOPBAR_IDS.searchSubmit)) ||
    null;

  const searchResults =
    connected(dom.searchResults) ||
    connected(byId(TOPBAR_IDS.searchResults)) ||
    connected(query(TOPBAR_SELECTORS.searchResults)) ||
    null;

  return {
    topbarMount:
      connected(dom.topbarMount) ||
      connected(byId(TOPBAR_IDS.mount)) ||
      connected(query(TOPBAR_SELECTORS.topbarMount)) ||
      null,

    topbar,

    title:
      connected(dom.topbarTitle) ||
      connected(query(TOPBAR_SELECTORS.title, topbar)) ||
      connected(byId(TOPBAR_IDS.title)) ||
      null,

    // Legacy eliminado: se devuelve null de forma intencional.
    mobileToggle: null,

    sidebar: getSidebarEl(AppCore),

    topbarLeft:
      connected(dom.topbarLeft) ||
      connected(query(TOPBAR_SELECTORS.topbarLeft, topbar)) ||
      null,

    topbarRight:
      connected(dom.topbarRight) ||
      connected(query(TOPBAR_SELECTORS.topbarRight, topbar)) ||
      null,

    search: searchForm,
    searchForm,
    searchInput,
    searchSubmit,
    searchResults,

    searchLabel:
      connected(dom.searchLabel) ||
      connected(byId(TOPBAR_IDS.searchLabel)) ||
      connected(query(TOPBAR_SELECTORS.searchLabel)) ||
      null,

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

  cache.mobileSidebarToggle = null;
  cache.toggleSidebarMobile = null;

  cache.sidebar = dom.sidebar || connected(cache.sidebar) || null;
  cache.topbarLeft = dom.topbarLeft || null;
  cache.topbarRight = dom.topbarRight || null;

  cache.search = dom.search || null;
  cache.searchForm = dom.searchForm || null;
  cache.searchInput = dom.searchInput || null;
  cache.searchSubmit = dom.searchSubmit || null;
  cache.searchResults = dom.searchResults || null;
  cache.searchLabel = dom.searchLabel || null;

  cache.searchWrap = null;
  cache.searchIcon = null;

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

  cache.search = null;
  cache.searchForm = null;
  cache.searchInput = null;
  cache.searchSubmit = null;
  cache.searchResults = null;
  cache.searchLabel = null;
  cache.searchWrap = null;
  cache.searchIcon = null;

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
