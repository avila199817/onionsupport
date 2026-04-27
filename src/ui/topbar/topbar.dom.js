/* =========================================================
   Onion SPA - Topbar DOM
   Archivo: src/ui/topbar/topbar.dom.js

   FINAL PRO SYSTEM · TOPBAR DOM · STABLE MOUNT · NO DUPES · 10/10

   Responsabilidades:
   - construir el template HTML del topbar
   - resolver el shell root del layout
   - montar el topbar en el DOM
   - evitar duplicados de topbar
   - resolver referencias DOM del topbar sin coger IDs fuera del root
   - sincronizar cache DOM en AppCore
   - preparar ARIA base del buscador
   - mantener compatibilidad con topbar.events.js / topbar.search.js
   - no resetear estado dinámico del buscador/sidebar en cada sync
   - tolerar DOM parcial, boot tardío y AppCore incompleto

   FIXES:
   - guards browser completos
   - cache no reutiliza nodos desconectados
   - removeDuplicateTopbars conserva un único topbar conectado
   - prepareTopbarDom busca primero dentro del root para evitar IDs duplicados
   - no fuerza aria-expanded del mobile toggle en cada prepare
   - no oculta searchResults si está activo
   - syncTopbarDomCache añade aliases útiles sin romper legacy
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const TOPBAR_IDS = Object.freeze({
  root: "topbar",
  legacyRoot: "app-topbar",
  title: "topbar-title",
  mobileToggle: "toggleSidebarMobile",
  searchInput: "topbar-search",
  searchResults: "topbar-search-results",
  searchLabel: "topbar-search-label",
});

export const TOPBAR_SELECTORS = Object.freeze({
  layout: ".layout",
  appShell: "#app-shell, [data-app-shell='true'], [data-app-shell], .app-shell",
  topbar: ".topbar, #topbar, #app-topbar, [data-topbar='root']",
  topbarLeft: ".topbar-left",
  topbarRight: ".topbar-right",
  mobileToggle: ".topbar-mobile-toggle, #toggleSidebarMobile, [data-topbar-action='toggle-sidebar']",
  title: ".topbar-title, #topbar-title, [data-topbar='title']",
  searchWrap: ".topbar-search-wrap, [data-topbar='search-wrap']",
  searchIcon: ".topbar-search-icon, [data-topbar='search-icon']",
  searchInput: ".topbar-search, #topbar-search, [data-topbar='search-input']",
  searchResults: ".topbar-search-results, #topbar-search-results, [data-topbar='search-results']",
  searchLabel: "#topbar-search-label",
  sidebar: ".sidebar, #sidebar, #app-sidebar, [data-sidebar-root], [data-sidebar='true']",
  mainContent: ".main-content, #main-content, #app-main, main.main-content, main[role='main'], main",
  appContent: "#app-content, [data-app-content], .app-content",
});

/* =========================================================
   FALLBACK DOM CACHE
========================================================= */

const fallbackDomCache = {};

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isElement(value) {
  return Boolean(
    value &&
    value.nodeType === 1
  );
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function getAppDom(AppCore) {
  if (!isObject(AppCore)) {
    return fallbackDomCache;
  }

  if (
    !AppCore.dom ||
    typeof AppCore.dom !== "object"
  ) {
    try {
      AppCore.dom = {};
    } catch {
      return fallbackDomCache;
    }
  }

  return AppCore.dom;
}

function getRoot(root = null) {
  if (!isBrowser()) {
    return null;
  }

  return root || document;
}

function qs(selector = "", root = null) {
  if (
    !isBrowser() ||
    !selector
  ) {
    return null;
  }

  const scope =
    getRoot(root);

  if (!scope?.querySelector) {
    return null;
  }

  try {
    return scope.querySelector(selector);
  } catch {
    return null;
  }
}

function qsa(selector = "", root = null) {
  if (
    !isBrowser() ||
    !selector
  ) {
    return [];
  }

  const scope =
    getRoot(root);

  if (!scope?.querySelectorAll) {
    return [];
  }

  try {
    return Array.from(scope.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function byId(id = "") {
  if (
    !isBrowser() ||
    !id
  ) {
    return null;
  }

  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function contains(root = null, node = null) {
  if (
    !isElement(root) ||
    !isElement(node)
  ) {
    return false;
  }

  try {
    return root === node || root.contains(node);
  } catch {
    return false;
  }
}

function isConnectedNode(node = null) {
  if (!node) {
    return false;
  }

  if (!isBrowser()) {
    return false;
  }

  try {
    return Boolean(node.isConnected);
  } catch {}

  try {
    return document.contains(node);
  } catch {}

  return false;
}

function connectedOrNull(node = null) {
  return isElement(node) && isConnectedNode(node)
    ? node
    : null;
}

function setAttr(el, name = "", value = "") {
  if (
    !isElement(el) ||
    !name
  ) {
    return false;
  }

  try {
    el.setAttribute(
      name,
      String(value)
    );

    return true;
  } catch {
    return false;
  }
}

function setAttrIfMissing(el, name = "", value = "") {
  if (
    !isElement(el) ||
    !name
  ) {
    return false;
  }

  try {
    if (!el.hasAttribute(name)) {
      el.setAttribute(
        name,
        String(value)
      );
    }

    return true;
  } catch {
    return false;
  }
}

function removeAttr(el, name = "") {
  if (
    !isElement(el) ||
    !name
  ) {
    return false;
  }

  try {
    el.removeAttribute(name);
    return true;
  } catch {
    return false;
  }
}

function ensureId(el, id = "") {
  if (!isElement(el)) {
    return "";
  }

  const existing =
    safeText(el.id, "");

  if (existing) {
    return existing;
  }

  const nextId =
    safeText(id, "");

  if (!nextId) {
    return "";
  }

  try {
    el.id = nextId;
    return nextId;
  } catch {
    return "";
  }
}

function uniqueElements(nodes = []) {
  const seen = new Set();
  const output = [];

  for (const node of nodes) {
    if (!isElement(node)) {
      continue;
    }

    if (seen.has(node)) {
      continue;
    }

    seen.add(node);
    output.push(node);
  }

  return output;
}

function isTopbarRoot(node = null) {
  if (!isElement(node)) {
    return false;
  }

  const id =
    safeText(node.id, "");

  return Boolean(
    id === TOPBAR_IDS.root ||
      id === TOPBAR_IDS.legacyRoot ||
      node.classList?.contains?.("topbar") ||
      node.getAttribute?.("data-topbar") === "root"
  );
}

function findInsideRoot(root = null, id = "", selector = "") {
  if (!isElement(root)) {
    return null;
  }

  const bySelector =
    selector
      ? qs(selector, root)
      : null;

  if (bySelector) {
    return bySelector;
  }

  const byIdNode =
    id ? byId(id) : null;

  if (
    byIdNode &&
    contains(root, byIdNode)
  ) {
    return byIdNode;
  }

  return null;
}

function getTopbarCandidates() {
  if (!isBrowser()) {
    return [];
  }

  return uniqueElements([
    ...qsa(`#${TOPBAR_IDS.root}`),
    ...qsa(`#${TOPBAR_IDS.legacyRoot}`),
    ...qsa("[data-topbar='root']"),
    ...qsa(".topbar"),
  ]).filter(isTopbarRoot);
}

function removeDuplicateTopbars(keep = null) {
  if (!isBrowser()) {
    return null;
  }

  const candidates =
    getTopbarCandidates();

  let kept =
    connectedOrNull(keep);

  if (!kept) {
    kept =
      candidates.find((node) => {
        return isConnectedNode(node);
      }) || null;
  }

  for (const node of candidates) {
    if (!isElement(node)) {
      continue;
    }

    if (kept && node === kept) {
      continue;
    }

    try {
      node.remove();
    } catch {}
  }

  return kept;
}

function resolveExistingTopbar(AppCore) {
  const dom =
    getAppDom(AppCore);

  const cached =
    connectedOrNull(
      dom.topbar ||
        dom.appTopbar ||
        dom.topbarRoot
    );

  if (
    cached &&
    isTopbarRoot(cached)
  ) {
    return removeDuplicateTopbars(cached);
  }

  const direct =
    connectedOrNull(byId(TOPBAR_IDS.root)) ||
    connectedOrNull(byId(TOPBAR_IDS.legacyRoot)) ||
    connectedOrNull(qs("[data-topbar='root']")) ||
    connectedOrNull(qs(".topbar"));

  if (
    direct &&
    isTopbarRoot(direct)
  ) {
    return removeDuplicateTopbars(direct);
  }

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

function createTopbarElement() {
  if (!isBrowser()) {
    return null;
  }

  try {
    const template =
      document.createElement("template");

    template.innerHTML =
      getTopbarTemplate().trim();

    return template.content.firstElementChild || null;
  } catch {
    try {
      const wrapper =
        document.createElement("div");

      wrapper.innerHTML =
        getTopbarTemplate().trim();

      return wrapper.firstElementChild || null;
    } catch {
      return null;
    }
  }
}

/* =========================================================
   ROOT RESOLVERS
========================================================= */

export function getShellRootEl(AppCore) {
  if (!isBrowser()) {
    return null;
  }

  const dom =
    getAppDom(AppCore);

  return (
    connectedOrNull(dom.appShell) ||
    connectedOrNull(dom.shell) ||
    connectedOrNull(dom.layout) ||
    connectedOrNull(byId("app-shell")) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.appShell)) ||
    connectedOrNull(byId("app-layout")) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.layout)) ||
    connectedOrNull(byId("app")) ||
    connectedOrNull(byId("app-root")) ||
    document.body ||
    null
  );
}

export function getMainContentEl(AppCore) {
  if (!isBrowser()) {
    return null;
  }

  const dom =
    getAppDom(AppCore);

  return (
    connectedOrNull(dom.mainContent) ||
    connectedOrNull(dom.main) ||
    connectedOrNull(byId("main-content")) ||
    connectedOrNull(byId("app-main")) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.mainContent))
  );
}

export function getAppContentEl(AppCore) {
  if (!isBrowser()) {
    return null;
  }

  const dom =
    getAppDom(AppCore);

  return (
    connectedOrNull(dom.appContent) ||
    connectedOrNull(byId("app-content")) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.appContent))
  );
}

export function getSidebarEl(AppCore) {
  if (!isBrowser()) {
    return null;
  }

  const dom =
    getAppDom(AppCore);

  return (
    connectedOrNull(dom.sidebar) ||
    connectedOrNull(byId("sidebar")) ||
    connectedOrNull(byId("app-sidebar")) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.sidebar))
  );
}

/* =========================================================
   MOUNT
========================================================= */

function insertTopbar({
  topbar,
  shellRoot,
  sidebar,
  mainContent,
} = {}) {
  if (
    !isElement(topbar) ||
    !isElement(shellRoot)
  ) {
    return false;
  }

  try {
    if (
      isElement(sidebar) &&
      sidebar.parentNode === shellRoot
    ) {
      sidebar.insertAdjacentElement(
        "afterend",
        topbar
      );

      return true;
    }
  } catch {}

  try {
    if (
      isElement(mainContent) &&
      mainContent.parentNode === shellRoot
    ) {
      shellRoot.insertBefore(
        topbar,
        mainContent
      );

      return true;
    }
  } catch {}

  try {
    shellRoot.prepend(topbar);
    return true;
  } catch {}

  try {
    shellRoot.insertBefore(
      topbar,
      shellRoot.firstChild || null
    );

    return true;
  } catch {}

  return false;
}

export function mountTopbar(AppCore) {
  if (!isBrowser()) {
    return null;
  }

  const existing =
    resolveExistingTopbar(AppCore);

  if (existing) {
    prepareTopbarDom(existing);
    syncTopbarDomCache(AppCore);
    return existing;
  }

  const shellRoot =
    getShellRootEl(AppCore);

  if (!shellRoot) {
    return null;
  }

  const topbar =
    createTopbarElement();

  if (!topbar) {
    return null;
  }

  const inserted =
    insertTopbar({
      topbar,
      shellRoot,
      sidebar:
        getSidebarEl(AppCore),
      mainContent:
        getMainContentEl(AppCore),
    });

  if (!inserted) {
    try {
      document.body?.insertAdjacentElement?.(
        "afterbegin",
        topbar
      );
    } catch {
      return null;
    }
  }

  const mounted =
    connectedOrNull(byId(TOPBAR_IDS.root)) ||
    connectedOrNull(topbar) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.topbar));

  if (!mounted) {
    return null;
  }

  removeDuplicateTopbars(mounted);
  prepareTopbarDom(mounted);
  syncTopbarDomCache(AppCore);

  return mounted;
}

/* =========================================================
   DOM PREP
========================================================= */

function ensureMinimalStructure(root = null) {
  if (!isElement(root)) {
    return false;
  }

  const hasLeft =
    Boolean(qs(TOPBAR_SELECTORS.topbarLeft, root));

  const hasRight =
    Boolean(qs(TOPBAR_SELECTORS.topbarRight, root));

  /*
    Solo reconstruimos si el root está vacío o no tiene estructura básica.
    No pisamos topbars custom parcialmente válidos.
  */
  if (
    root.children.length === 0 ||
    (!hasLeft && !hasRight)
  ) {
    const fresh =
      createTopbarElement();

    if (!fresh) {
      return false;
    }

    try {
      root.innerHTML = fresh.innerHTML;
    } catch {
      return false;
    }
  }

  return true;
}

export function prepareTopbarDom(topbar = null) {
  if (!isBrowser()) {
    return false;
  }

  const root =
    connectedOrNull(topbar) ||
    connectedOrNull(byId(TOPBAR_IDS.root)) ||
    connectedOrNull(byId(TOPBAR_IDS.legacyRoot)) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.topbar));

  if (!root) {
    return false;
  }

  ensureMinimalStructure(root);

  try {
    root.classList.add("topbar");
  } catch {}

  const topbarLeft =
    qs(TOPBAR_SELECTORS.topbarLeft, root);

  const topbarRight =
    qs(TOPBAR_SELECTORS.topbarRight, root);

  const title =
    findInsideRoot(
      root,
      TOPBAR_IDS.title,
      TOPBAR_SELECTORS.title
    );

  const mobileToggle =
    findInsideRoot(
      root,
      TOPBAR_IDS.mobileToggle,
      TOPBAR_SELECTORS.mobileToggle
    );

  const searchWrap =
    qs(TOPBAR_SELECTORS.searchWrap, root);

  const searchIcon =
    qs(TOPBAR_SELECTORS.searchIcon, root);

  const searchInput =
    findInsideRoot(
      root,
      TOPBAR_IDS.searchInput,
      TOPBAR_SELECTORS.searchInput
    );

  const searchResults =
    findInsideRoot(
      root,
      TOPBAR_IDS.searchResults,
      TOPBAR_SELECTORS.searchResults
    );

  const searchLabel =
    findInsideRoot(
      root,
      TOPBAR_IDS.searchLabel,
      TOPBAR_SELECTORS.searchLabel
    );

  ensureId(root, TOPBAR_IDS.root);
  ensureId(title, TOPBAR_IDS.title);
  ensureId(mobileToggle, TOPBAR_IDS.mobileToggle);
  ensureId(searchInput, TOPBAR_IDS.searchInput);
  ensureId(searchResults, TOPBAR_IDS.searchResults);
  ensureId(searchLabel, TOPBAR_IDS.searchLabel);

  setAttr(root, "data-topbar", "root");
  setAttr(root, "role", "banner");

  if (topbarLeft) {
    try {
      topbarLeft.classList.add("topbar-left");
    } catch {}

    setAttrIfMissing(topbarLeft, "data-topbar", "left");
  }

  if (topbarRight) {
    try {
      topbarRight.classList.add("topbar-right");
    } catch {}

    setAttrIfMissing(topbarRight, "data-topbar", "right");
  }

  if (title) {
    try {
      title.classList.add("topbar-title");
    } catch {}

    setAttr(title, "data-topbar", "title");
  }

  if (mobileToggle) {
    try {
      mobileToggle.classList.add("topbar-mobile-toggle");
    } catch {}

    setAttr(mobileToggle, "type", "button");
    setAttr(mobileToggle, "data-topbar-action", "toggle-sidebar");
    setAttr(mobileToggle, "aria-controls", "sidebar");

    /*
      No forzamos aria-expanded en cada prepare.
      Lo gobierna topbar.sidebar.js mediante setMobileToggleState().
    */
    setAttrIfMissing(mobileToggle, "aria-expanded", "false");
    setAttrIfMissing(mobileToggle, "aria-label", "Abrir navegación");
    setAttrIfMissing(mobileToggle, "data-tooltip", "Abrir navegación");

    removeAttr(mobileToggle, "title");
  }

  if (searchWrap) {
    try {
      searchWrap.classList.add("topbar-search-wrap");
    } catch {}

    setAttr(searchWrap, "data-topbar", "search-wrap");
  }

  if (searchIcon) {
    try {
      searchIcon.classList.add("topbar-search-icon");
    } catch {}

    setAttr(searchIcon, "data-topbar", "search-icon");
    setAttr(searchIcon, "aria-hidden", "true");
    setAttr(searchIcon, "focusable", "false");
  }

  const resultsOpen =
    Boolean(
      searchResults &&
        (
          searchResults.classList?.contains?.("active") ||
          searchResults.hidden === false ||
          searchResults.getAttribute?.("aria-hidden") === "false"
        )
    );

  if (searchInput) {
    try {
      searchInput.classList.add("topbar-search");
    } catch {}

    setAttr(searchInput, "type", "search");
    setAttr(searchInput, "data-topbar", "search-input");
    setAttr(searchInput, "role", "combobox");
    setAttr(searchInput, "autocomplete", "off");
    setAttr(searchInput, "autocapitalize", "off");
    setAttr(searchInput, "spellcheck", "false");
    setAttr(searchInput, "inputmode", "search");
    setAttr(searchInput, "aria-label", "Buscar en la aplicación");
    setAttr(searchInput, "aria-controls", TOPBAR_IDS.searchResults);
    setAttr(searchInput, "aria-expanded", String(resultsOpen));
    setAttr(searchInput, "aria-autocomplete", "list");
    setAttr(searchInput, "aria-haspopup", "listbox");

    if (searchLabel) {
      setAttr(searchInput, "aria-labelledby", TOPBAR_IDS.searchLabel);
    }

    removeAttr(searchInput, "title");
  }

  if (searchResults) {
    try {
      searchResults.classList.add("topbar-search-results");
    } catch {}

    setAttr(searchResults, "data-topbar", "search-results");
    setAttr(searchResults, "role", "listbox");
    setAttr(searchResults, "aria-hidden", resultsOpen ? "false" : "true");
    setAttr(searchResults, "aria-live", "polite");

    if (searchLabel) {
      setAttr(searchResults, "aria-labelledby", TOPBAR_IDS.searchLabel);
    }

    if (!resultsOpen) {
      try {
        searchResults.hidden = true;
      } catch {}
    }
  }

  if (searchLabel) {
    try {
      searchLabel.classList.add("visually-hidden");
    } catch {}
  }

  return true;
}

/* =========================================================
   DOM GETTERS
========================================================= */

export function getTopbarDom(AppCore) {
  if (!isBrowser()) {
    return {
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
    };
  }

  const dom =
    getAppDom(AppCore);

  const topbar =
    connectedOrNull(dom.topbar) ||
    connectedOrNull(dom.appTopbar) ||
    connectedOrNull(dom.topbarRoot) ||
    connectedOrNull(byId(TOPBAR_IDS.root)) ||
    connectedOrNull(byId(TOPBAR_IDS.legacyRoot)) ||
    connectedOrNull(qs(TOPBAR_SELECTORS.topbar));

  const title =
    connectedOrNull(dom.topbarTitle) ||
    findInsideRoot(
      topbar,
      TOPBAR_IDS.title,
      TOPBAR_SELECTORS.title
    );

  const mobileToggle =
    connectedOrNull(dom.mobileSidebarToggle) ||
    connectedOrNull(dom.toggleSidebarMobile) ||
    findInsideRoot(
      topbar,
      TOPBAR_IDS.mobileToggle,
      TOPBAR_SELECTORS.mobileToggle
    );

  const sidebar =
    getSidebarEl(AppCore);

  const topbarLeft =
    connectedOrNull(dom.topbarLeft) ||
    qs(TOPBAR_SELECTORS.topbarLeft, topbar);

  const topbarRight =
    connectedOrNull(dom.topbarRight) ||
    qs(TOPBAR_SELECTORS.topbarRight, topbar);

  const searchInput =
    connectedOrNull(dom.searchInput) ||
    findInsideRoot(
      topbar,
      TOPBAR_IDS.searchInput,
      TOPBAR_SELECTORS.searchInput
    );

  const searchResults =
    connectedOrNull(dom.searchResults) ||
    findInsideRoot(
      topbar,
      TOPBAR_IDS.searchResults,
      TOPBAR_SELECTORS.searchResults
    );

  const searchWrap =
    connectedOrNull(dom.searchWrap) ||
    connectedOrNull(searchInput?.closest?.(TOPBAR_SELECTORS.searchWrap)) ||
    connectedOrNull(searchResults?.closest?.(TOPBAR_SELECTORS.searchWrap)) ||
    qs(TOPBAR_SELECTORS.searchWrap, topbar);

  const searchIcon =
    connectedOrNull(dom.searchIcon) ||
    qs(
      TOPBAR_SELECTORS.searchIcon,
      searchWrap || topbar
    );

  const searchLabel =
    connectedOrNull(dom.searchLabel) ||
    findInsideRoot(
      topbar,
      TOPBAR_IDS.searchLabel,
      TOPBAR_SELECTORS.searchLabel
    );

  const mainContent =
    getMainContentEl(AppCore);

  const appContent =
    getAppContentEl(AppCore);

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
    searchLabel,

    mainContent,
    appContent,
  };
}

/* =========================================================
   DOM CACHE
========================================================= */

export function syncTopbarDomCache(AppCore) {
  const domCache =
    getAppDom(AppCore);

  const dom =
    getTopbarDom(AppCore);

  if (dom.topbar) {
    prepareTopbarDom(dom.topbar);
  }

  domCache.topbar =
    dom.topbar || null;

  domCache.appTopbar =
    dom.topbar || null;

  domCache.topbarRoot =
    dom.topbar || null;

  domCache.topbarTitle =
    dom.title || null;

  domCache.mobileSidebarToggle =
    dom.mobileToggle || null;

  domCache.toggleSidebarMobile =
    dom.mobileToggle || null;

  domCache.sidebar =
    dom.sidebar ||
    connectedOrNull(domCache.sidebar) ||
    null;

  domCache.topbarLeft =
    dom.topbarLeft || null;

  domCache.topbarRight =
    dom.topbarRight || null;

  domCache.searchWrap =
    dom.searchWrap || null;

  domCache.searchIcon =
    dom.searchIcon || null;

  domCache.searchInput =
    dom.searchInput || null;

  domCache.searchResults =
    dom.searchResults || null;

  domCache.searchLabel =
    dom.searchLabel || null;

  domCache.mainContent =
    dom.mainContent ||
    connectedOrNull(domCache.mainContent) ||
    null;

  domCache.appContent =
    dom.appContent ||
    connectedOrNull(domCache.appContent) ||
    null;

  return {
    ...dom,
  };
}

/* =========================================================
   UTILITIES
========================================================= */

export function isTopbarMounted(AppCore) {
  const dom =
    getTopbarDom(AppCore);

  return Boolean(
    dom.topbar &&
      isConnectedNode(dom.topbar)
  );
}

export function unmountTopbar(AppCore) {
  const domCache =
    getAppDom(AppCore);

  const dom =
    getTopbarDom(AppCore);

  try {
    dom.topbar?.remove?.();
  } catch {}

  domCache.topbar = null;
  domCache.appTopbar = null;
  domCache.topbarRoot = null;
  domCache.topbarTitle = null;
  domCache.mobileSidebarToggle = null;
  domCache.toggleSidebarMobile = null;
  domCache.topbarLeft = null;
  domCache.topbarRight = null;
  domCache.searchWrap = null;
  domCache.searchIcon = null;
  domCache.searchInput = null;
  domCache.searchResults = null;
  domCache.searchLabel = null;

  return true;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  TOPBAR_IDS,
  TOPBAR_SELECTORS,

  getTopbarTemplate,

  getShellRootEl,
  getMainContentEl,
  getAppContentEl,
  getSidebarEl,

  mountTopbar,
  prepareTopbarDom,

  getTopbarDom,
  syncTopbarDomCache,

  isTopbarMounted,
  unmountTopbar,
};
