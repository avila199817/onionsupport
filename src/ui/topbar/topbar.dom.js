/* =========================================================
   Onion SPA - Topbar DOM
   Archivo: src/ui/topbar/topbar.dom.js

   TOPBAR DOM · SIMPLE
   - template HTML del topbar
   - mount estable en #topbar-mount
   - sin duplicados
   - refs internas resueltas dentro del topbar
   - cache sólo nodos conectados en AppCore.dom
   - ARIA base del buscador
   - sin CSS inline, sin overlays, sin glass DOM
========================================================= */

export const TOPBAR_DOM_VERSION = "topbar-dom-v16-simple";

export const TOPBAR_IDS = Object.freeze({
  mount: "topbar-mount",
  root: "topbar",
  legacyRoot: "app-topbar",
  title: "topbar-title",
  mobileToggle: "toggleSidebarMobile",
  searchInput: "topbar-search",
  searchResults: "topbar-search-results",
  searchLabel: "topbar-search-label",
  viewContainer: "view-container",
});

export const TOPBAR_SELECTORS = Object.freeze({
  layout: ".layout",
  appShell: "#app-shell, [data-app-shell='true'], [data-app-shell], .app-shell",
  topbarMount: "#topbar-mount, [data-topbar-mount], [data-topbar-mount='true']",
  topbar: ".topbar, #topbar, #app-topbar, [data-topbar='root']",

  topbarLeft: ".topbar-left, [data-topbar='left']",
  topbarRight: ".topbar-right, [data-topbar='right']",
  mobileToggle: ".topbar-mobile-toggle, #toggleSidebarMobile, [data-topbar-action='toggle-sidebar']",
  title: ".topbar-title, #topbar-title, [data-topbar='title']",

  searchWrap: ".topbar-search-wrap, [data-topbar='search-wrap']",
  searchIcon: ".topbar-search-icon, [data-topbar='search-icon']",
  searchInput: ".topbar-search, #topbar-search, [data-topbar='search-input']",
  searchResults: ".topbar-search-results, #topbar-search-results, [data-topbar='search-results']",
  searchLabel: "#topbar-search-label, [data-topbar='search-label']",

  sidebar: ".sidebar, #sidebar, #app-sidebar, [data-sidebar-root], [data-sidebar='true']",
  mainContent: ".main-content, #main-content, #app-main, main.main-content, main[role='main'], main",
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

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function getAppDom(AppCore) {
  if (!isObject(AppCore)) return fallbackDomCache;

  if (!AppCore.dom || typeof AppCore.dom !== "object") {
    try {
      AppCore.dom = {};
    } catch {
      return fallbackDomCache;
    }
  }

  return AppCore.dom;
}

function rootOf(root = null) {
  if (!isBrowser()) return null;
  return root || document;
}

function qs(selector = "", root = null) {
  if (!isBrowser() || !selector) return null;

  const scope = rootOf(root);
  if (!scope?.querySelector) return null;

  try {
    return scope.querySelector(selector);
  } catch {
    return null;
  }
}

function qsa(selector = "", root = null) {
  if (!isBrowser() || !selector) return [];

  const scope = rootOf(root);
  if (!scope?.querySelectorAll) return [];

  try {
    return [...scope.querySelectorAll(selector)];
  } catch {
    return [];
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

function contains(parent = null, child = null) {
  if (!isElement(parent) || !isElement(child)) return false;

  try {
    return parent === child || parent.contains(child);
  } catch {
    return false;
  }
}

function isConnected(node = null) {
  if (!node || !isBrowser()) return false;

  try {
    if (typeof node.isConnected === "boolean") return node.isConnected;
  } catch {}

  try {
    return document.contains(node);
  } catch {
    return false;
  }
}

function connectedOrNull(node = null) {
  return isElement(node) && isConnected(node) ? node : null;
}

function setAttr(element, name = "", value = "") {
  if (!isElement(element) || !name) return false;

  try {
    element.setAttribute(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function setAttrIfMissing(element, name = "", value = "") {
  if (!isElement(element) || !name) return false;

  try {
    if (!element.hasAttribute(name)) element.setAttribute(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function removeAttr(element, name = "") {
  if (!isElement(element) || !name) return false;

  try {
    element.removeAttribute(name);
    return true;
  } catch {
    return false;
  }
}

function ensureId(element, id = "") {
  if (!isElement(element)) return "";

  const current = safeText(element.id, "");
  if (current) return current;

  const next = safeText(id, "");
  if (!next) return "";

  try {
    element.id = next;
    return next;
  } catch {
    return "";
  }
}

function uniqueElements(nodes = []) {
  const seen = new Set();
  const output = [];

  for (const node of nodes) {
    if (!isElement(node) || seen.has(node)) continue;
    seen.add(node);
    output.push(node);
  }

  return output;
}

function isTopbarRoot(node = null) {
  if (!isElement(node)) return false;

  const id = safeText(node.id, "");
  return Boolean(
    id === TOPBAR_IDS.root ||
      id === TOPBAR_IDS.legacyRoot ||
      node.classList?.contains?.("topbar") ||
      node.getAttribute?.("data-topbar") === "root"
  );
}

function isTopbarMount(node = null) {
  if (!isElement(node)) return false;

  return Boolean(
    node.id === TOPBAR_IDS.mount ||
      node.hasAttribute?.("data-topbar-mount") ||
      node.getAttribute?.("data-topbar-mount") === "true"
  );
}

function findInsideRoot(root = null, id = "", selector = "") {
  if (!isElement(root)) return null;

  const bySelector = selector ? connectedOrNull(qs(selector, root)) : null;
  if (bySelector) return bySelector;

  const byIdNode = id ? connectedOrNull(byId(id)) : null;
  return byIdNode && contains(root, byIdNode) ? byIdNode : null;
}

function getTopbarCandidates() {
  if (!isBrowser()) return [];

  return uniqueElements([
    ...qsa(`#${TOPBAR_IDS.root}`),
    ...qsa(`#${TOPBAR_IDS.legacyRoot}`),
    ...qsa("[data-topbar='root']"),
    ...qsa(".topbar"),
  ]).filter(isTopbarRoot);
}

function removeDuplicateTopbars(keep = null) {
  if (!isBrowser()) return null;

  const candidates = getTopbarCandidates();
  const kept = connectedOrNull(keep) || candidates.find(isConnected) || null;

  for (const node of candidates) {
    if (!isElement(node) || (kept && node === kept)) continue;

    try {
      node.remove();
    } catch {}
  }

  return kept;
}

function resolveExistingTopbar(AppCore) {
  const dom = getAppDom(AppCore);

  const cached = connectedOrNull(dom.topbar || dom.appTopbar || dom.topbarRoot);
  if (cached && isTopbarRoot(cached)) return removeDuplicateTopbars(cached);

  const direct = connectedOrNull(byId(TOPBAR_IDS.root)) ||
    connectedOrNull(byId(TOPBAR_IDS.legacyRoot)) ||
    connectedOrNull(qs("[data-topbar='root']")) ||
    connectedOrNull(qs(".topbar"));

  if (direct && isTopbarRoot(direct)) return removeDuplicateTopbars(direct);

  return removeDuplicateTopbars(null);
}

/* =========================================================
   TEMPLATE
========================================================= */

export function getTopbarTemplate() {
  return `
    <header
      class="topbar"
      id="${TOPBAR_IDS.root}"
      data-topbar="root"
      role="banner"
    >
      <div class="topbar-left" data-topbar="left">
        <button
          type="button"
          class="topbar-mobile-toggle"
          id="${TOPBAR_IDS.mobileToggle}"
          data-topbar-action="toggle-sidebar"
          data-tooltip="Abrir navegación"
          aria-label="Abrir navegación"
          aria-controls="sidebar"
          aria-expanded="false"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
            <path d="M4 7h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M4 12h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </button>

        <h1 class="topbar-title" id="${TOPBAR_IDS.title}" data-topbar="title">Onion Support</h1>
      </div>

      <div class="topbar-right" data-topbar="right">
        <div class="topbar-search-wrap" data-topbar="search-wrap">
          <span id="${TOPBAR_IDS.searchLabel}" class="visually-hidden" data-topbar="search-label">Buscar en la aplicación</span>

          <svg class="topbar-search-icon" data-topbar="search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/>
            <path d="M20 20l-3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>

          <input
            type="search"
            id="${TOPBAR_IDS.searchInput}"
            class="topbar-search"
            data-topbar="search-input"
            data-topbar-search="true"
            placeholder="Buscar..."
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            inputmode="search"
            role="combobox"
            aria-label="Buscar en la aplicación"
            aria-labelledby="${TOPBAR_IDS.searchLabel}"
            aria-controls="${TOPBAR_IDS.searchResults}"
            aria-expanded="false"
            aria-autocomplete="list"
            aria-haspopup="listbox"
          >

          <div
            id="${TOPBAR_IDS.searchResults}"
            class="topbar-search-results"
            data-topbar="search-results"
            data-topbar-search-results="true"
            hidden
            role="listbox"
            aria-hidden="true"
            aria-live="polite"
            aria-labelledby="${TOPBAR_IDS.searchLabel}"
          ></div>
        </div>
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
    try {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = getTopbarTemplate().trim();
      return wrapper.firstElementChild || null;
    } catch {
      return null;
    }
  }
}

function createTopbarMountElement() {
  if (!isBrowser()) return null;

  try {
    const mount = document.createElement("div");
    mount.id = TOPBAR_IDS.mount;
    mount.setAttribute("data-topbar-mount", "true");
    return mount;
  } catch {
    return null;
  }
}

/* =========================================================
   ROOT RESOLVERS
========================================================= */

export function getShellRootEl(AppCore) {
  if (!isBrowser()) return null;

  const dom = getAppDom(AppCore);

  return connectedOrNull(dom.appShell) ||
    connectedOrNull(dom.shell) ||
    connectedOrNull(dom.layout) ||
    connectedOrNull(byId("app-shell")) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.appShell)) ||
    connectedOrNull(byId("app-layout")) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.layout)) ||
    connectedOrNull(byId("app")) ||
    connectedOrNull(byId("app-root")) ||
    document.body ||
    null;
}

export function getMainContentEl(AppCore) {
  if (!isBrowser()) return null;

  const dom = getAppDom(AppCore);

  return connectedOrNull(dom.mainContent) ||
    connectedOrNull(dom.main) ||
    connectedOrNull(byId("main-content")) ||
    connectedOrNull(byId("app-main")) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.mainContent));
}

export function getAppContentEl(AppCore) {
  if (!isBrowser()) return null;

  const dom = getAppDom(AppCore);

  return connectedOrNull(dom.appContent) ||
    connectedOrNull(byId("app-content")) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.appContent));
}

export function getViewContainerEl(AppCore) {
  if (!isBrowser()) return null;

  const dom = getAppDom(AppCore);

  return connectedOrNull(dom.viewContainer) ||
    connectedOrNull(byId(TOPBAR_IDS.viewContainer)) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.viewContainer));
}

export function getSidebarEl(AppCore) {
  if (!isBrowser()) return null;

  const dom = getAppDom(AppCore);

  return connectedOrNull(dom.sidebar) ||
    connectedOrNull(byId("sidebar")) ||
    connectedOrNull(byId("app-sidebar")) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.sidebar));
}

export function getTopbarMountEl(AppCore, options = {}) {
  if (!isBrowser()) return null;

  const opts = isObject(options) ? options : {};
  const dom = getAppDom(AppCore);

  const existing = connectedOrNull(dom.topbarMount) ||
    connectedOrNull(byId(TOPBAR_IDS.mount)) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.topbarMount));

  if (existing && isTopbarMount(existing)) {
    setAttr(existing, "data-topbar-mount", "true");
    return existing;
  }

  if (opts.create === false) return null;

  const shellRoot = opts.shellRoot || getShellRootEl(AppCore);
  if (!shellRoot) return null;

  const mount = createTopbarMountElement();
  if (!mount) return null;

  try {
    const sidebarMount = connectedOrNull(byId("sidebar-mount")) || connectedOrNull(qs("[data-sidebar-mount]"));
    const mainContent = getMainContentEl(AppCore);

    if (sidebarMount && sidebarMount.parentNode === shellRoot) sidebarMount.insertAdjacentElement("afterend", mount);
    else if (mainContent && mainContent.parentNode === shellRoot) shellRoot.insertBefore(mount, mainContent);
    else shellRoot.prepend(mount);
  } catch {
    try {
      shellRoot.insertBefore(mount, shellRoot.firstChild || null);
    } catch {
      return null;
    }
  }

  return connectedOrNull(mount);
}

/* =========================================================
   MOUNT
========================================================= */

function insertTopbar({ topbar, mount, shellRoot, sidebar, mainContent } = {}) {
  if (!isElement(topbar)) return false;

  if (isElement(mount)) {
    try {
      mount.appendChild(topbar);
      return true;
    } catch {}
  }

  if (!isElement(shellRoot)) return false;

  try {
    if (isElement(sidebar) && sidebar.parentNode === shellRoot) {
      sidebar.insertAdjacentElement("afterend", topbar);
      return true;
    }
  } catch {}

  try {
    if (isElement(mainContent) && mainContent.parentNode === shellRoot) {
      shellRoot.insertBefore(topbar, mainContent);
      return true;
    }
  } catch {}

  try {
    shellRoot.prepend(topbar);
    return true;
  } catch {}

  try {
    shellRoot.insertBefore(topbar, shellRoot.firstChild || null);
    return true;
  } catch {
    return false;
  }
}

function ensureTopbarInMount(AppCore, topbar = null) {
  if (!isBrowser() || !isElement(topbar)) return topbar;

  const mount = getTopbarMountEl(AppCore, { create: true });
  if (!mount || topbar.parentNode === mount) return topbar;

  try {
    mount.appendChild(topbar);
  } catch {}

  return topbar;
}

export function mountTopbar(AppCore) {
  if (!isBrowser()) return null;

  const shellRoot = getShellRootEl(AppCore);
  const mount = getTopbarMountEl(AppCore, { create: true, shellRoot });
  const existing = resolveExistingTopbar(AppCore);

  if (existing) {
    ensureTopbarInMount(AppCore, existing);
    prepareTopbarDom(existing);
    syncTopbarDomCache(AppCore);
    return existing;
  }

  if (!shellRoot) return null;

  const topbar = createTopbarElement();
  if (!topbar) return null;

  const inserted = insertTopbar({
    topbar,
    mount,
    shellRoot,
    sidebar: getSidebarEl(AppCore),
    mainContent: getMainContentEl(AppCore),
  });

  if (!inserted) {
    try {
      document.body?.insertAdjacentElement?.("afterbegin", topbar);
    } catch {
      return null;
    }
  }

  const mounted = connectedOrNull(byId(TOPBAR_IDS.root)) ||
    connectedOrNull(topbar) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.topbar));

  if (!mounted) return null;

  removeDuplicateTopbars(mounted);
  ensureTopbarInMount(AppCore, mounted);
  prepareTopbarDom(mounted);
  syncTopbarDomCache(AppCore);

  return mounted;
}

/* =========================================================
   DOM PREP
========================================================= */

function ensureMinimalStructure(root = null) {
  if (!isElement(root)) return false;

  const hasLeft = Boolean(qs(TOPBAR_SELECTORS.topbarLeft, root));
  const hasRight = Boolean(qs(TOPBAR_SELECTORS.topbarRight, root));

  if (root.children.length > 0 && (hasLeft || hasRight)) return true;

  const fresh = createTopbarElement();
  if (!fresh) return false;

  try {
    root.innerHTML = fresh.innerHTML;
    return true;
  } catch {
    return false;
  }
}

function resultsOpen(searchResults = null) {
  if (!isElement(searchResults)) return false;

  return Boolean(
    searchResults.classList?.contains?.("active") ||
      searchResults.classList?.contains?.("is-open") ||
      searchResults.classList?.contains?.("is-search-open") ||
      searchResults.dataset?.searchOpen === "true" ||
      searchResults.hidden === false ||
      searchResults.getAttribute?.("aria-hidden") === "false"
  );
}

export function prepareTopbarDom(topbar = null) {
  if (!isBrowser()) return false;

  const root = connectedOrNull(topbar) ||
    connectedOrNull(byId(TOPBAR_IDS.root)) ||
    connectedOrNull(byId(TOPBAR_IDS.legacyRoot)) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.topbar));

  if (!root) return false;

  ensureMinimalStructure(root);

  try {
    root.classList.add("topbar");
  } catch {}

  const left = qs(TOPBAR_SELECTORS.topbarLeft, root);
  const right = qs(TOPBAR_SELECTORS.topbarRight, root);
  const title = findInsideRoot(root, TOPBAR_IDS.title, TOPBAR_SELECTORS.title);
  const mobileToggle = findInsideRoot(root, TOPBAR_IDS.mobileToggle, TOPBAR_SELECTORS.mobileToggle);
  const searchWrap = qs(TOPBAR_SELECTORS.searchWrap, root);
  const searchIcon = qs(TOPBAR_SELECTORS.searchIcon, root);
  const searchInput = findInsideRoot(root, TOPBAR_IDS.searchInput, TOPBAR_SELECTORS.searchInput);
  const searchResults = findInsideRoot(root, TOPBAR_IDS.searchResults, TOPBAR_SELECTORS.searchResults);
  const searchLabel = findInsideRoot(root, TOPBAR_IDS.searchLabel, TOPBAR_SELECTORS.searchLabel);
  const open = resultsOpen(searchResults);

  ensureId(root, TOPBAR_IDS.root);
  ensureId(title, TOPBAR_IDS.title);
  ensureId(mobileToggle, TOPBAR_IDS.mobileToggle);
  ensureId(searchInput, TOPBAR_IDS.searchInput);
  ensureId(searchResults, TOPBAR_IDS.searchResults);
  ensureId(searchLabel, TOPBAR_IDS.searchLabel);

  setAttr(root, "data-topbar", "root");
  setAttr(root, "role", "banner");

  if (left) {
    try { left.classList.add("topbar-left"); } catch {}
    setAttrIfMissing(left, "data-topbar", "left");
  }

  if (right) {
    try { right.classList.add("topbar-right"); } catch {}
    setAttrIfMissing(right, "data-topbar", "right");
  }

  if (title) {
    try { title.classList.add("topbar-title"); } catch {}
    setAttr(title, "data-topbar", "title");
  }

  if (mobileToggle) {
    try { mobileToggle.classList.add("topbar-mobile-toggle"); } catch {}
    setAttr(mobileToggle, "type", "button");
    setAttr(mobileToggle, "data-topbar-action", "toggle-sidebar");
    setAttr(mobileToggle, "aria-controls", "sidebar");
    setAttrIfMissing(mobileToggle, "aria-expanded", "false");
    setAttrIfMissing(mobileToggle, "aria-label", "Abrir navegación");
    setAttrIfMissing(mobileToggle, "data-tooltip", "Abrir navegación");
    removeAttr(mobileToggle, "title");
  }

  if (searchWrap) {
    try { searchWrap.classList.add("topbar-search-wrap"); } catch {}
    setAttr(searchWrap, "data-topbar", "search-wrap");
  }

  if (searchIcon) {
    try { searchIcon.classList.add("topbar-search-icon"); } catch {}
    setAttr(searchIcon, "data-topbar", "search-icon");
    setAttr(searchIcon, "aria-hidden", "true");
    setAttr(searchIcon, "focusable", "false");
  }

  if (searchInput) {
    try { searchInput.classList.add("topbar-search"); } catch {}
    setAttr(searchInput, "type", "search");
    setAttr(searchInput, "data-topbar", "search-input");
    setAttr(searchInput, "data-topbar-search", "true");
    setAttr(searchInput, "role", "combobox");
    setAttr(searchInput, "autocomplete", "off");
    setAttr(searchInput, "autocapitalize", "off");
    setAttr(searchInput, "spellcheck", "false");
    setAttr(searchInput, "inputmode", "search");
    setAttr(searchInput, "aria-label", "Buscar en la aplicación");
    setAttr(searchInput, "aria-controls", TOPBAR_IDS.searchResults);
    setAttr(searchInput, "aria-expanded", String(open));
    setAttr(searchInput, "aria-autocomplete", "list");
    setAttr(searchInput, "aria-haspopup", "listbox");
    if (searchLabel) setAttr(searchInput, "aria-labelledby", TOPBAR_IDS.searchLabel);
    removeAttr(searchInput, "title");
  }

  if (searchResults) {
    try { searchResults.classList.add("topbar-search-results"); } catch {}
    setAttr(searchResults, "data-topbar", "search-results");
    setAttr(searchResults, "data-topbar-search-results", "true");
    setAttr(searchResults, "role", "listbox");
    setAttr(searchResults, "aria-hidden", open ? "false" : "true");
    setAttr(searchResults, "aria-live", "polite");
    if (searchLabel) setAttr(searchResults, "aria-labelledby", TOPBAR_IDS.searchLabel);
    if (!open) {
      try { searchResults.hidden = true; } catch {}
    }
  }

  if (searchLabel) {
    try { searchLabel.classList.add("visually-hidden"); } catch {}
    setAttr(searchLabel, "data-topbar", "search-label");
  }

  return true;
}

/* =========================================================
   DOM GETTERS / CACHE
========================================================= */

export function getTopbarDom(AppCore) {
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
  const topbarMount = connectedOrNull(dom.topbarMount) || connectedOrNull(byId(TOPBAR_IDS.mount)) || connectedOrNull(qs(TOPBAR_SELECTORS.topbarMount));
  const topbar = connectedOrNull(dom.topbar) ||
    connectedOrNull(dom.appTopbar) ||
    connectedOrNull(dom.topbarRoot) ||
    connectedOrNull(byId(TOPBAR_IDS.root)) ||
    connectedOrNull(byId(TOPBAR_IDS.legacyRoot)) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.topbar, topbarMount)) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.topbar));

  const title = connectedOrNull(dom.topbarTitle) || findInsideRoot(topbar, TOPBAR_IDS.title, TOPBAR_SELECTORS.title);
  const mobileToggle = connectedOrNull(dom.mobileSidebarToggle) || connectedOrNull(dom.toggleSidebarMobile) || findInsideRoot(topbar, TOPBAR_IDS.mobileToggle, TOPBAR_SELECTORS.mobileToggle);
  const sidebar = getSidebarEl(AppCore);
  const topbarLeft = connectedOrNull(dom.topbarLeft) || connectedOrNull(qs(TOPBAR_SELECTORS.topbarLeft, topbar));
  const topbarRight = connectedOrNull(dom.topbarRight) || connectedOrNull(qs(TOPBAR_SELECTORS.topbarRight, topbar));
  const searchInput = connectedOrNull(dom.searchInput) || findInsideRoot(topbar, TOPBAR_IDS.searchInput, TOPBAR_SELECTORS.searchInput);
  const searchResults = connectedOrNull(dom.searchResults) || findInsideRoot(topbar, TOPBAR_IDS.searchResults, TOPBAR_SELECTORS.searchResults);
  const searchWrap = connectedOrNull(dom.searchWrap) ||
    connectedOrNull(searchInput?.closest?.(TOPBAR_SELECTORS.searchWrap)) ||
    connectedOrNull(searchResults?.closest?.(TOPBAR_SELECTORS.searchWrap)) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.searchWrap, topbar));
  const searchIcon = connectedOrNull(dom.searchIcon) || connectedOrNull(qs(TOPBAR_SELECTORS.searchIcon, searchWrap || topbar));
  const searchLabel = connectedOrNull(dom.searchLabel) || findInsideRoot(topbar, TOPBAR_IDS.searchLabel, TOPBAR_SELECTORS.searchLabel);

  return {
    topbarMount,
    topbar,
    title,
    mobileToggle,
    sidebar,
    topbarLeft,
    topbarRight,
    searchWrap,
    searchIcon,
    searchInput,
    searchResults,
    searchLabel,
    mainContent: getMainContentEl(AppCore),
    appContent: getAppContentEl(AppCore),
    viewContainer: getViewContainerEl(AppCore),
  };
}

export function syncTopbarDomCache(AppCore) {
  const cache = getAppDom(AppCore);
  const dom = getTopbarDom(AppCore);

  if (dom.topbarMount) setAttr(dom.topbarMount, "data-topbar-mount", "true");
  if (dom.topbar) prepareTopbarDom(dom.topbar);

  const fresh = getTopbarDom(AppCore);

  cache.topbarMount = fresh.topbarMount || null;
  cache.topbar = fresh.topbar || null;
  cache.appTopbar = fresh.topbar || null;
  cache.topbarRoot = fresh.topbar || null;
  cache.topbarTitle = fresh.title || null;
  cache.mobileSidebarToggle = fresh.mobileToggle || null;
  cache.toggleSidebarMobile = fresh.mobileToggle || null;
  cache.sidebar = fresh.sidebar || connectedOrNull(cache.sidebar) || null;
  cache.topbarLeft = fresh.topbarLeft || null;
  cache.topbarRight = fresh.topbarRight || null;
  cache.searchWrap = fresh.searchWrap || null;
  cache.searchIcon = fresh.searchIcon || null;
  cache.searchInput = fresh.searchInput || null;
  cache.searchResults = fresh.searchResults || null;
  cache.searchLabel = fresh.searchLabel || null;
  cache.mainContent = fresh.mainContent || connectedOrNull(cache.mainContent) || null;
  cache.appContent = fresh.appContent || connectedOrNull(cache.appContent) || null;
  cache.viewContainer = fresh.viewContainer || connectedOrNull(cache.viewContainer) || null;

  return { ...fresh };
}

/* =========================================================
   UTILITIES
========================================================= */

export function isTopbarMounted(AppCore) {
  const dom = getTopbarDom(AppCore);
  return Boolean(dom.topbar && isConnected(dom.topbar));
}

export function unmountTopbar(AppCore) {
  const cache = getAppDom(AppCore);
  const dom = getTopbarDom(AppCore);

  try {
    dom.topbar?.remove?.();
  } catch {}

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
