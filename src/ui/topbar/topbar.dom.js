/* =========================================================
   Onion SPA - Topbar DOM
   Archivo: src/ui/topbar/topbar.dom.js

   FULL PRO SAAS PANEL · EXTREME MODE

   Responsabilidades:
   - construir el template HTML del topbar
   - resolver el shell root del layout
   - montar el topbar en el DOM
   - evitar duplicados de topbar
   - resolver referencias DOM del topbar
   - sincronizar cache DOM en AppCore
   - preparar ARIA base del buscador
   - mantener compatibilidad con topbar.events.js / topbar.search.js
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const TOPBAR_IDS = Object.freeze({
  root: "topbar",
  title: "topbar-title",
  mobileToggle: "toggleSidebarMobile",
  searchInput: "topbar-search",
  searchResults: "topbar-search-results",
  searchLabel: "topbar-search-label",
});

export const TOPBAR_SELECTORS = Object.freeze({
  layout: ".layout",
  topbar: ".topbar",
  topbarLeft: ".topbar-left",
  topbarRight: ".topbar-right",
  mobileToggle: ".topbar-mobile-toggle",
  title: ".topbar-title",
  searchWrap: ".topbar-search-wrap",
  searchIcon: ".topbar-search-icon",
  searchInput: ".topbar-search",
  searchResults: ".topbar-search-results",
  sidebar: ".sidebar",
  mainContent: ".main-content",
});

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function getAppDom(AppCore) {
  const core = safeObject(AppCore);

  if (!core.dom || typeof core.dom !== "object") {
    try {
      core.dom = {};
    } catch {
      return {};
    }
  }

  return core.dom;
}

function qs(selector = "", root = document) {
  if (!selector || !root?.querySelector) return null;

  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function byId(id = "") {
  if (!id) return null;

  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function isElement(value) {
  return Boolean(value && value.nodeType === 1);
}

function setAttr(el, name = "", value = "") {
  if (!el || !name) return false;

  try {
    el.setAttribute(name, String(value));
    return true;
  } catch {
    return false;
  }
}

function removeAttr(el, name = "") {
  if (!el || !name) return false;

  try {
    el.removeAttribute(name);
    return true;
  } catch {
    return false;
  }
}

function ensureId(el, id = "") {
  if (!el) return "";

  const existing = safeText(el.id, "");

  if (existing) return existing;

  const nextId = safeText(id, "");

  if (!nextId) return "";

  try {
    el.id = nextId;
    return nextId;
  } catch {
    return "";
  }
}

function removeDuplicateTopbars(keep = null) {
  const nodes = Array.from(document.querySelectorAll(`#${TOPBAR_IDS.root}, ${TOPBAR_SELECTORS.topbar}`));

  let kept = keep || null;

  for (const node of nodes) {
    if (!isElement(node)) continue;

    if (!kept) {
      kept = node;
      continue;
    }

    if (node === kept) continue;

    try {
      node.remove();
    } catch {
      /* noop */
    }
  }

  return kept;
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
      <div
        class="topbar-left"
        data-topbar="left"
      >
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
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M4 7h16"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <path
              d="M4 12h16"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <path
              d="M4 17h16"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
        </button>

        <h1
          class="topbar-title"
          id="${TOPBAR_IDS.title}"
          data-topbar="title"
        >
          Onion Support
        </h1>
      </div>

      <div
        class="topbar-right"
        data-topbar="right"
      >
        <div
          class="topbar-search-wrap"
          data-topbar="search-wrap"
        >
          <span
            id="${TOPBAR_IDS.searchLabel}"
            class="visually-hidden"
          >
            Buscar en la aplicación
          </span>

          <svg
            class="topbar-search-icon"
            data-topbar="search-icon"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <circle
              cx="11"
              cy="11"
              r="7"
              stroke="currentColor"
              stroke-width="2"
            />
            <path
              d="M20 20l-3-3"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>

          <input
            type="search"
            id="${TOPBAR_IDS.searchInput}"
            class="topbar-search"
            data-topbar="search-input"
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

/* =========================================================
   ROOT RESOLVERS
========================================================= */

export function getShellRootEl(AppCore) {
  const dom = getAppDom(AppCore);

  return (
    dom.appShell ||
    dom.layout ||
    byId("app-shell") ||
    qs(TOPBAR_SELECTORS.layout) ||
    document.body
  );
}

export function getMainContentEl(AppCore) {
  const dom = getAppDom(AppCore);

  return (
    dom.mainContent ||
    byId("main-content") ||
    qs(TOPBAR_SELECTORS.mainContent)
  );
}

export function getAppContentEl(AppCore) {
  const dom = getAppDom(AppCore);

  return (
    dom.appContent ||
    byId("app-content") ||
    qs("#app-content")
  );
}

export function getSidebarEl(AppCore) {
  const dom = getAppDom(AppCore);

  return (
    dom.sidebar ||
    byId("sidebar") ||
    qs(TOPBAR_SELECTORS.sidebar)
  );
}

/* =========================================================
   MOUNT
========================================================= */

export function mountTopbar(AppCore) {
  const dom = getAppDom(AppCore);

  let topbar =
    dom.topbar ||
    byId(TOPBAR_IDS.root) ||
    qs(TOPBAR_SELECTORS.topbar);

  if (topbar) {
    removeDuplicateTopbars(topbar);
    prepareTopbarDom(topbar);
    syncTopbarDomCache(AppCore);
    return topbar;
  }

  const shellRoot = getShellRootEl(AppCore);

  if (!shellRoot) return null;

  const sidebar = getSidebarEl(AppCore);

  try {
    if (sidebar && sidebar.parentNode === shellRoot) {
      sidebar.insertAdjacentHTML("afterend", getTopbarTemplate());
    } else {
      shellRoot.insertAdjacentHTML("afterbegin", getTopbarTemplate());
    }
  } catch {
    try {
      document.body.insertAdjacentHTML("afterbegin", getTopbarTemplate());
    } catch {
      return null;
    }
  }

  topbar =
    byId(TOPBAR_IDS.root) ||
    qs(TOPBAR_SELECTORS.topbar);

  if (!topbar) return null;

  removeDuplicateTopbars(topbar);
  prepareTopbarDom(topbar);
  syncTopbarDomCache(AppCore);

  return topbar;
}

/* =========================================================
   DOM PREP
========================================================= */

export function prepareTopbarDom(topbar = null) {
  const root =
    topbar ||
    byId(TOPBAR_IDS.root) ||
    qs(TOPBAR_SELECTORS.topbar);

  if (!root) return false;

  const title =
    byId(TOPBAR_IDS.title) ||
    qs(TOPBAR_SELECTORS.title, root);

  const mobileToggle =
    byId(TOPBAR_IDS.mobileToggle) ||
    qs(TOPBAR_SELECTORS.mobileToggle, root);

  const searchWrap =
    qs(TOPBAR_SELECTORS.searchWrap, root);

  const searchInput =
    byId(TOPBAR_IDS.searchInput) ||
    qs(TOPBAR_SELECTORS.searchInput, root);

  const searchResults =
    byId(TOPBAR_IDS.searchResults) ||
    qs(TOPBAR_SELECTORS.searchResults, root);

  const searchLabel =
    byId(TOPBAR_IDS.searchLabel) ||
    qs(`#${TOPBAR_IDS.searchLabel}`, root);

  ensureId(root, TOPBAR_IDS.root);
  ensureId(title, TOPBAR_IDS.title);
  ensureId(mobileToggle, TOPBAR_IDS.mobileToggle);
  ensureId(searchInput, TOPBAR_IDS.searchInput);
  ensureId(searchResults, TOPBAR_IDS.searchResults);
  ensureId(searchLabel, TOPBAR_IDS.searchLabel);

  setAttr(root, "data-topbar", "root");
  setAttr(root, "role", "banner");

  if (mobileToggle) {
    setAttr(mobileToggle, "type", "button");
    setAttr(mobileToggle, "data-topbar-action", "toggle-sidebar");
    setAttr(mobileToggle, "aria-label", "Abrir navegación");
    setAttr(mobileToggle, "aria-controls", "sidebar");
    setAttr(
      mobileToggle,
      "aria-expanded",
      String(document.body?.classList?.contains?.("sidebar-open") || false)
    );

    /*
      Evita tooltips nativos del navegador.
      El sistema usa data-tooltip.
    */
    removeAttr(mobileToggle, "title");
  }

  if (searchWrap) {
    setAttr(searchWrap, "data-topbar", "search-wrap");
  }

  if (searchInput) {
    setAttr(searchInput, "type", "search");
    setAttr(searchInput, "role", "combobox");
    setAttr(searchInput, "autocomplete", "off");
    setAttr(searchInput, "autocapitalize", "off");
    setAttr(searchInput, "spellcheck", "false");
    setAttr(searchInput, "inputmode", "search");
    setAttr(searchInput, "aria-label", "Buscar en la aplicación");
    setAttr(searchInput, "aria-controls", TOPBAR_IDS.searchResults);
    setAttr(searchInput, "aria-expanded", "false");
    setAttr(searchInput, "aria-autocomplete", "list");
    setAttr(searchInput, "aria-haspopup", "listbox");

    if (searchLabel) {
      setAttr(searchInput, "aria-labelledby", TOPBAR_IDS.searchLabel);
    }

    removeAttr(searchInput, "title");
  }

  if (searchResults) {
    setAttr(searchResults, "role", "listbox");
    setAttr(searchResults, "aria-hidden", "true");
    setAttr(searchResults, "aria-live", "polite");

    if (searchLabel) {
      setAttr(searchResults, "aria-labelledby", TOPBAR_IDS.searchLabel);
    }

    if (!searchResults.classList.contains("active")) {
      searchResults.hidden = true;
    }
  }

  return true;
}

/* =========================================================
   DOM GETTERS
========================================================= */

export function getTopbarDom(AppCore) {
  const dom = getAppDom(AppCore);

  const topbar =
    dom.topbar ||
    byId(TOPBAR_IDS.root) ||
    qs(TOPBAR_SELECTORS.topbar);

  const title =
    dom.topbarTitle ||
    byId(TOPBAR_IDS.title) ||
    qs(TOPBAR_SELECTORS.title, topbar || document);

  const mobileToggle =
    dom.mobileSidebarToggle ||
    dom.toggleSidebarMobile ||
    byId(TOPBAR_IDS.mobileToggle) ||
    qs(TOPBAR_SELECTORS.mobileToggle, topbar || document);

  const sidebar = getSidebarEl(AppCore);

  const topbarLeft =
    dom.topbarLeft ||
    qs(TOPBAR_SELECTORS.topbarLeft, topbar || document);

  const topbarRight =
    dom.topbarRight ||
    qs(TOPBAR_SELECTORS.topbarRight, topbar || document);

  const searchInput =
    dom.searchInput ||
    byId(TOPBAR_IDS.searchInput) ||
    qs(TOPBAR_SELECTORS.searchInput, topbar || document);

  const searchResults =
    dom.searchResults ||
    byId(TOPBAR_IDS.searchResults) ||
    qs(TOPBAR_SELECTORS.searchResults, topbar || document);

  const searchWrap =
    dom.searchWrap ||
    searchInput?.closest?.(TOPBAR_SELECTORS.searchWrap) ||
    searchResults?.closest?.(TOPBAR_SELECTORS.searchWrap) ||
    qs(TOPBAR_SELECTORS.searchWrap, topbar || document);

  const searchIcon =
    dom.searchIcon ||
    qs(TOPBAR_SELECTORS.searchIcon, searchWrap || topbar || document);

  const mainContent = getMainContentEl(AppCore);
  const appContent = getAppContentEl(AppCore);

  return {
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

    mainContent,
    appContent,
  };
}

/* =========================================================
   DOM CACHE
========================================================= */

export function syncTopbarDomCache(AppCore) {
  const domCache = getAppDom(AppCore);
  const dom = getTopbarDom(AppCore);

  domCache.topbar = dom.topbar || null;
  domCache.topbarTitle = dom.title || null;

  domCache.mobileSidebarToggle = dom.mobileToggle || null;
  domCache.toggleSidebarMobile = dom.mobileToggle || null;

  domCache.sidebar = dom.sidebar || domCache.sidebar || null;

  domCache.topbarLeft = dom.topbarLeft || null;
  domCache.topbarRight = dom.topbarRight || null;

  domCache.searchWrap = dom.searchWrap || null;
  domCache.searchIcon = dom.searchIcon || null;
  domCache.searchInput = dom.searchInput || null;
  domCache.searchResults = dom.searchResults || null;

  domCache.mainContent = dom.mainContent || domCache.mainContent || null;
  domCache.appContent = dom.appContent || domCache.appContent || null;

  if (dom.topbar) {
    prepareTopbarDom(dom.topbar);
  }

  return dom;
}

/* =========================================================
   UTILITIES
========================================================= */

export function isTopbarMounted(AppCore) {
  const dom = getTopbarDom(AppCore);
  return Boolean(dom.topbar?.isConnected);
}

export function unmountTopbar(AppCore) {
  const domCache = getAppDom(AppCore);
  const dom = getTopbarDom(AppCore);

  try {
    dom.topbar?.remove?.();
  } catch {
    /* noop */
  }

  domCache.topbar = null;
  domCache.topbarTitle = null;
  domCache.mobileSidebarToggle = null;
  domCache.toggleSidebarMobile = null;
  domCache.topbarLeft = null;
  domCache.topbarRight = null;
  domCache.searchWrap = null;
  domCache.searchIcon = null;
  domCache.searchInput = null;
  domCache.searchResults = null;

  return true;
}
