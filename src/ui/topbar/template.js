/* =========================================================
   Onion Support - Topbar Template
   Archivo: /src/ui/topbar/template.js

   Responsabilidad:
   - Construir sólo el DOM visual del topbar.
   - Título de ruta.
   - Buscador visual local.
   - Contenedor estable de resultados.
   - Renderizar resultados recibidos desde index.js.
   - Exponer refs/data-* consumidos por index.js.
   - Sin AppCore.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Toast.
   - Sin Store.
   - Sin navegación.
   - Sin motor de búsqueda.
   - Sin imports.
========================================================= */

export const TOPBAR_TEMPLATE_VERSION = "topbar.template.search.v2";

const TOPBAR_ID = "app-topbar";
const TITLE_ID = "topbar-title";
const SEARCH_INPUT_ID = "topbar-search-input";
const SEARCH_RESULTS_ID = "topbar-search-results";

const DEFAULT_TITLE = "Onion Home";
const DEFAULT_PLACEHOLDER = "Buscar";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function cleanAttrs(attrs = {}) {
  const output = {};

  for (const [key, value] of Object.entries(attrs || {})) {
    if (!key) continue;
    if (value === null || value === undefined || value === false) continue;

    output[key] = value === true ? "true" : String(value);
  }

  return output;
}

function createElement(tag = "div", options = {}) {
  const node = document.createElement(tag);

  if (options.className) {
    node.className = options.className;
  }

  if (options.textContent !== undefined && options.textContent !== null) {
    node.textContent = String(options.textContent);
  }

  for (const [key, value] of Object.entries(cleanAttrs(options.attrs || {}))) {
    node.setAttribute(key, value);
  }

  for (const [key, value] of Object.entries(cleanAttrs(options.dataset || {}))) {
    node.dataset[key] = value;
  }

  return node;
}

function appendChildren(parent = null, children = []) {
  if (!parent) return parent;

  const list = Array.isArray(children) ? children : [children];

  for (const child of list) {
    if (!child) continue;
    parent.appendChild(child);
  }

  return parent;
}

/* =========================================================
   TITLE
========================================================= */

export function createTopbarTitle(title = DEFAULT_TITLE) {
  return createElement("h1", {
    className: "topbar-title",
    textContent: text(title, DEFAULT_TITLE),
    attrs: {
      id: TITLE_ID,
      "data-topbar-title": "true",
    },
  });
}

/* =========================================================
   SEARCH
========================================================= */

export function createTopbarSearch(options = {}) {
  const placeholder = text(options.placeholder, DEFAULT_PLACEHOLDER);
  const value = text(options.value, "");

  const search = createElement("form", {
    className: "topbar-search",
    attrs: {
      role: "search",
      autocomplete: "off",
      novalidate: "true",
      "data-topbar-search": "true",
      "aria-label": "Buscar",
    },
  });

  const label = createElement("label", {
    className: "sr-only",
    textContent: "Buscar",
    attrs: {
      for: SEARCH_INPUT_ID,
    },
  });

  const input = createElement("input", {
    className: "topbar-search-input",
    attrs: {
      id: SEARCH_INPUT_ID,
      type: "search",
      name: "q",
      placeholder,
      value,
      autocomplete: "off",
      autocapitalize: "none",
      spellcheck: "false",
      role: "combobox",
      "aria-autocomplete": "list",
      "aria-haspopup": "listbox",
      "aria-expanded": "false",
      "aria-controls": SEARCH_RESULTS_ID,
      "data-topbar-search-input": "true",
    },
  });

  const button = createElement("button", {
    className: "topbar-search-submit",
    attrs: {
      type: "submit",
      "aria-label": "Buscar",
      "data-topbar-search-submit": "true",
    },
  });

  const buttonIcon = createElement("span", {
    className: "topbar-search-icon",
    textContent: "⌕",
    attrs: {
      "aria-hidden": "true",
    },
  });

  const results = createElement("div", {
    className: "topbar-search-results",
    attrs: {
      id: SEARCH_RESULTS_ID,
      role: "listbox",
      hidden: "true",
      "aria-label": "Resultados de búsqueda",
      "aria-hidden": "true",
      "data-topbar-search-results": "true",
    },
  });

  appendChildren(button, buttonIcon);
  appendChildren(search, [label, input, button, results]);

  return search;
}

/* =========================================================
   SEARCH RESULTS
========================================================= */

function normalizeResult(item = {}, index = 0) {
  const source = item && typeof item === "object" ? item : {};

  const label = text(source.label || source.title || source.name, "Resultado");
  const description = text(source.description || source.text || source.subtitle, "");
  const route = text(source.route || source.href || source.path || source.to, "");
  const icon = text(source.icon || source.key || "", "");
  const type = text(source.type || source.kind || "", "");

  return {
    ...source,
    id: text(source.id, `topbar-search-option-${index}`),
    label,
    description,
    route,
    icon,
    type,
  };
}

function createTopbarSearchResult(item = {}, index = 0, options = {}) {
  const result = normalizeResult(item, index);
  const selected = Number(options.activeIndex) === index;
  const route = text(result.route, "");
  const tag = route ? "a" : "button";

  const option = createElement(tag, {
    className: [
      "topbar-search-result",
      selected ? "is-active" : "",
      result.icon ? `topbar-search-result--${result.icon}` : "",
      result.type ? `topbar-search-result-type--${result.type}` : "",
    ]
      .filter(Boolean)
      .join(" "),
    attrs: {
      id: result.id,
      role: "option",
      tabindex: "-1",
      "aria-selected": selected ? "true" : "false",
      href: route || null,
      type: route ? null : "button",
      "data-spa": route ? "true" : null,
      "data-route": route || null,
      "data-href": route || null,
      "data-topbar-search-result": "true",
      "data-topbar-search-result-index": String(index),
      "data-topbar-search-result-label": result.label,
      "data-topbar-search-result-route": route || null,
    },
  });

  const icon = createElement("span", {
    className: "topbar-search-result-icon",
    textContent: result.icon ? result.icon.slice(0, 2).toUpperCase() : "→",
    attrs: {
      "aria-hidden": "true",
    },
  });

  const copy = createElement("span", {
    className: "topbar-search-result-copy",
  });

  const label = createElement("span", {
    className: "topbar-search-result-label",
    textContent: result.label,
  });

  appendChildren(copy, label);

  if (result.description) {
    appendChildren(
      copy,
      createElement("span", {
        className: "topbar-search-result-description",
        textContent: result.description,
      })
    );
  }

  if (route) {
    appendChildren(
      copy,
      createElement("span", {
        className: "topbar-search-result-route",
        textContent: route,
        attrs: {
          "aria-hidden": "true",
        },
      })
    );
  }

  appendChildren(option, [icon, copy]);

  return option;
}

function createTopbarSearchEmpty(query = "") {
  const empty = createElement("div", {
    className: "topbar-search-empty",
    attrs: {
      role: "status",
      "data-topbar-search-empty": "true",
    },
  });

  appendChildren(empty, [
    createElement("span", {
      className: "topbar-search-empty-title",
      textContent: "Sin resultados",
    }),
    createElement("span", {
      className: "topbar-search-empty-text",
      textContent: query
        ? `No hay coincidencias para “${query}”.`
        : "Escribe para buscar en la aplicación.",
    }),
  ]);

  return empty;
}

export function renderTopbarSearchResults(root = null, results = [], options = {}) {
  const refs = getTopbarTemplateRefs(root);

  if (!refs.searchResults) return false;

  const query = text(options.query, "");
  const activeIndex = Number.isFinite(Number(options.activeIndex))
    ? Number(options.activeIndex)
    : 0;

  const items = Array.isArray(results) ? results : [];

  refs.searchResults.replaceChildren();
  refs.searchResults.hidden = false;
  refs.searchResults.setAttribute("aria-hidden", "false");
  refs.searchResults.classList.add("active");
  refs.searchResults.dataset.searchOpen = "true";
  refs.searchResults.dataset.searchQuery = query;
  refs.searchResults.dataset.searchCount = String(items.length);

  refs.root?.classList?.add?.("is-search-focused");
  refs.search?.classList?.add?.("is-search-open");

  if (refs.searchInput) {
    refs.searchInput.setAttribute("aria-expanded", "true");
  }

  if (!items.length) {
    appendChildren(refs.searchResults, createTopbarSearchEmpty(query));

    if (refs.searchInput) {
      refs.searchInput.removeAttribute("aria-activedescendant");
    }

    return true;
  }

  const fragment = document.createDocumentFragment();

  items.forEach((item, index) => {
    fragment.appendChild(
      createTopbarSearchResult(item, index, {
        activeIndex,
      })
    );
  });

  refs.searchResults.appendChild(fragment);

  setTopbarSearchActiveIndex(root, activeIndex);

  return true;
}

export function setTopbarSearchActiveIndex(root = null, index = -1) {
  const refs = getTopbarTemplateRefs(root);

  if (!refs.searchResults) return false;

  const items = Array.from(
    refs.searchResults.querySelectorAll("[data-topbar-search-result='true']")
  );

  if (!items.length) {
    refs.searchInput?.removeAttribute?.("aria-activedescendant");
    return false;
  }

  const nextIndex = Math.max(0, Math.min(Number(index) || 0, items.length - 1));

  items.forEach((item, itemIndex) => {
    const selected = itemIndex === nextIndex;

    item.classList.toggle("is-active", selected);
    item.setAttribute("aria-selected", selected ? "true" : "false");
  });

  const activeItem = items[nextIndex];

  if (activeItem?.id && refs.searchInput) {
    refs.searchInput.setAttribute("aria-activedescendant", activeItem.id);
  }

  return true;
}

export function setTopbarSearchValue(root = null, value = "") {
  const refs = getTopbarTemplateRefs(root);

  if (!refs.searchInput) return false;

  refs.searchInput.value = text(value, "");
  return true;
}

export function getTopbarSearchResultsState(root = null) {
  const refs = getTopbarTemplateRefs(root);
  const items = Array.from(
    refs.searchResults?.querySelectorAll?.("[data-topbar-search-result='true']") || []
  );

  const activeIndex = items.findIndex((item) => item.getAttribute("aria-selected") === "true");

  return {
    query: refs.searchInput?.value || "",
    open: Boolean(refs.searchResults && refs.searchResults.hidden !== true),
    count: items.length,
    activeIndex,
    activeRoute:
      activeIndex >= 0
        ? items[activeIndex]?.dataset?.route || items[activeIndex]?.dataset?.href || ""
        : "",
  };
}

/* =========================================================
   ROOT
========================================================= */

export function createTopbarTemplate(options = {}) {
  if (!isBrowser()) return null;

  const title = text(options.title, DEFAULT_TITLE);
  const visible = options.visible !== false;
  const withSearch = options.search !== false;

  const topbar = createElement("header", {
    className: "topbar app-topbar",
    attrs: {
      id: text(options.id, TOPBAR_ID),
      role: "banner",
      "aria-label": "Barra superior",
      "aria-hidden": visible ? "false" : "true",
      "data-topbar-root": "true",
      "data-topbar-visible": visible ? "true" : "false",
    },
  });

  topbar.hidden = !visible;

  const left = createElement("div", {
    className: "topbar-left",
    attrs: {
      "data-topbar-left": "true",
    },
  });

  appendChildren(left, createTopbarTitle(title));

  const right = createElement("div", {
    className: "topbar-right",
    attrs: {
      "data-topbar-right": "true",
    },
  });

  if (withSearch) {
    appendChildren(right, createTopbarSearch(options.searchOptions || {}));
  }

  appendChildren(topbar, [left, right]);

  return topbar;
}

/* =========================================================
   REFS
========================================================= */

export function getTopbarTemplateRefs(root = null) {
  const scope = root || (isBrowser() ? document : null);

  if (!scope) {
    return {
      root: null,
      title: null,
      search: null,
      searchInput: null,
      searchSubmit: null,
      searchResults: null,
    };
  }

  const topbar =
    scope.matches?.("[data-topbar-root]") || scope.id === TOPBAR_ID
      ? scope
      : scope.querySelector?.("[data-topbar-root], #app-topbar") || null;

  return {
    root: topbar,

    title:
      topbar?.querySelector?.("[data-topbar-title]") ||
      topbar?.querySelector?.(`#${TITLE_ID}`) ||
      null,

    search:
      topbar?.querySelector?.("[data-topbar-search]") ||
      null,

    searchInput:
      topbar?.querySelector?.("[data-topbar-search-input]") ||
      topbar?.querySelector?.(`#${SEARCH_INPUT_ID}`) ||
      null,

    searchSubmit:
      topbar?.querySelector?.("[data-topbar-search-submit]") ||
      null,

    searchResults:
      topbar?.querySelector?.("[data-topbar-search-results]") ||
      topbar?.querySelector?.(`#${SEARCH_RESULTS_ID}`) ||
      null,
  };
}

/* =========================================================
   PATCH HELPERS
========================================================= */

export function setTopbarTemplateTitle(root = null, title = DEFAULT_TITLE) {
  const refs = getTopbarTemplateRefs(root);

  if (!refs.title) return false;

  refs.title.textContent = text(title, DEFAULT_TITLE);
  refs.title.dataset.routeTitle = refs.title.textContent;

  return true;
}

export function setTopbarTemplateVisible(root = null, visible = true) {
  const refs = getTopbarTemplateRefs(root);

  if (!refs.root) return false;

  const value = visible === true;

  refs.root.hidden = !value;
  refs.root.dataset.topbarVisible = value ? "true" : "false";
  refs.root.setAttribute("aria-hidden", value ? "false" : "true");

  return true;
}

export function clearTopbarSearchResults(root = null, options = {}) {
  const opts = typeof options === "boolean" ? { input: options } : options || {};
  const refs = getTopbarTemplateRefs(root);

  if (!refs.searchResults) return false;

  refs.searchResults.hidden = true;
  refs.searchResults.replaceChildren();
  refs.searchResults.setAttribute("aria-hidden", "true");
  refs.searchResults.classList.remove("active");

  delete refs.searchResults.dataset.searchOpen;
  delete refs.searchResults.dataset.searchQuery;
  delete refs.searchResults.dataset.searchCount;

  if (refs.searchInput) {
    refs.searchInput.setAttribute("aria-expanded", "false");
    refs.searchInput.removeAttribute("aria-activedescendant");

    if (opts.input === true) {
      refs.searchInput.value = "";
    }
  }

  refs.root?.classList?.remove?.("is-search-focused");
  refs.search?.classList?.remove?.("is-search-open");

  return true;
}

export function setTopbarSearchExpanded(root = null, expanded = false) {
  const refs = getTopbarTemplateRefs(root);
  const value = expanded === true;

  if (refs.searchInput) {
    refs.searchInput.setAttribute("aria-expanded", value ? "true" : "false");
  }

  if (refs.searchResults) {
    refs.searchResults.hidden = !value;
    refs.searchResults.setAttribute("aria-hidden", value ? "false" : "true");
    refs.searchResults.classList.toggle("active", value);

    if (value) {
      refs.searchResults.dataset.searchOpen = "true";
    } else {
      delete refs.searchResults.dataset.searchOpen;
    }
  }

  refs.root?.classList?.toggle?.("is-search-focused", value);
  refs.search?.classList?.toggle?.("is-search-open", value);

  return Boolean(refs.searchInput || refs.searchResults);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getTopbarTemplateSnapshot(root = null) {
  const refs = getTopbarTemplateRefs(root);
  const state = getTopbarSearchResultsState(root);

  return {
    version: TOPBAR_TEMPLATE_VERSION,

    hasRoot: Boolean(refs.root),
    visible: Boolean(refs.root && refs.root.hidden !== true),

    hasTitle: Boolean(refs.title),
    title: refs.title?.textContent || "",

    search: {
      enabled: Boolean(refs.search),
      hasInput: Boolean(refs.searchInput),
      hasSubmit: Boolean(refs.searchSubmit),
      hasResults: Boolean(refs.searchResults),
      expanded: refs.searchInput?.getAttribute?.("aria-expanded") || null,
      resultsHidden: refs.searchResults ? refs.searchResults.hidden === true : null,
      query: state.query,
      count: state.count,
      activeIndex: state.activeIndex,
    },

    policy: {
      templateOnly: true,
      buildsDom: true,
      stableRefs: true,
      rendersSearchResults: true,

      noAppCore: true,
      noAuth: true,
      noRouter: true,
      noHttp: true,
      noToast: true,
      noStore: true,

      noSearchEngine: true,
      noNavigation: true,
      noEvents: true,
    },
  };
}

/* =========================================================
   API
========================================================= */

export const TopbarTemplate = {
  version: TOPBAR_TEMPLATE_VERSION,

  createTopbarTemplate,
  createTopbarTitle,
  createTopbarSearch,

  getTopbarTemplateRefs,

  setTopbarTemplateTitle,
  setTopbarTemplateVisible,

  renderTopbarSearchResults,
  setTopbarSearchActiveIndex,
  setTopbarSearchValue,
  getTopbarSearchResultsState,

  clearTopbarSearchResults,
  setTopbarSearchExpanded,

  getTopbarTemplateSnapshot,
  getSnapshot: getTopbarTemplateSnapshot,
  getDebugSnapshot: getTopbarTemplateSnapshot,
};

export default TopbarTemplate;
