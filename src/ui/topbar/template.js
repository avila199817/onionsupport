/* =========================================================
   Onion Support - Topbar Template
   Archivo: /src/ui/topbar/template.js

   FULL PRO SAAS PANEL · BACKEND SEARCH TEMPLATE

   Responsabilidad:
   - Construir sólo el DOM visual del topbar.
   - Título de ruta.
   - Buscador visual.
   - Contenedor estable de resultados.
   - Renderizar resultados recibidos desde index.js.
   - Estados visuales: ready / loading / empty / error.
   - Exponer refs/data-* consumidos por index.js.
   - Sin AppCore.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Toast.
   - Sin Store.
   - Sin navegación.
========================================================= */

export const TOPBAR_TEMPLATE_VERSION = "topbar.template.backend-search.v4";

const TOPBAR_ID = "app-topbar";
const TITLE_ID = "topbar-title";
const SEARCH_INPUT_ID = "topbar-search-input";
const SEARCH_RESULTS_ID = "topbar-search-results";

const DEFAULT_TITLE = "Onion Home";
const DEFAULT_PLACEHOLDER = "Buscar facturas, tickets, clientes…";

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

function normalizeType(value = "") {
  const raw = text(value, "general").toLowerCase();

  const map = {
    nav: "nav",
    route: "nav",
    ruta: "nav",
    settings: "settings",
    setting: "settings",
    ajuste: "settings",
    ajustes: "settings",

    cliente: "cliente",
    clientes: "cliente",
    client: "cliente",
    clients: "cliente",
    empresa: "cliente",
    empresas: "cliente",

    user: "user",
    users: "user",
    usuario: "user",
    usuarios: "user",
    perfil: "user",
    profile: "user",
    cuenta: "user",

    factura: "factura",
    facturas: "factura",
    invoice: "factura",
    invoices: "factura",
    billing: "factura",
    bill: "factura",

    incidencia: "incidencia",
    incidencias: "incidencia",
    ticket: "incidencia",
    tickets: "incidencia",
    soporte: "incidencia",
    issue: "incidencia",

    hardware: "hardware",
    device: "hardware",
    devices: "hardware",
  };

  return map[raw] || raw || "general";
}

function typeLabel(value = "") {
  const type = normalizeType(value);

  const map = {
    nav: "Ruta",
    settings: "Ajuste",
    cliente: "Cliente",
    user: "Usuario",
    factura: "Factura",
    incidencia: "Ticket",
    hardware: "Hardware",
    general: "Resultado",
  };

  return map[type] || "Resultado";
}

function typeIcon(value = "", fallback = "⌕") {
  const type = normalizeType(value);

  const map = {
    nav: "→",
    settings: "AJ",
    cliente: "CL",
    user: "US",
    factura: "FA",
    incidencia: "IN",
    hardware: "HW",
    general: "⌕",
  };

  return text(map[type] || fallback, fallback).slice(0, 2).toUpperCase();
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
      "aria-busy": "false",
      "data-topbar-search-results": "true",
    },
  });

  appendChildren(button, buttonIcon);
  appendChildren(search, [label, input, button, results]);

  return search;
}

/* =========================================================
   RESULT NORMALIZATION
========================================================= */

function normalizeResult(item = {}, index = 0) {
  const source = item && typeof item === "object" ? item : {};

  const label = text(
    source.label ||
      source.title ||
      source.name ||
      source.displayName,
    "Resultado"
  );

  const description = text(
    source.description ||
      source.text ||
      source.subtitle ||
      source.status ||
      "",
    ""
  );

  const route = text(
    source.route ||
      source.href ||
      source.path ||
      source.to ||
      "",
    ""
  );

  const type = normalizeType(source.type || source.kind || source.entity || "");
  const icon = text(source.icon || "", "") || typeIcon(type);

  return {
    ...source,
    id: text(source.id || source.key, `topbar-search-option-${index}`),
    label,
    title: label,
    description,
    subtitle: description,
    route,
    href: route,
    icon,
    type,
    typeLabel: text(source.typeLabel, typeLabel(type)),
    source: text(source.source, ""),
    entityId: text(source.entityId, ""),
    action: text(source.action, ""),
  };
}

/* =========================================================
   SEARCH RESULT NODES
========================================================= */

function createTopbarSearchResult(item = {}, index = 0, options = {}) {
  const result = normalizeResult(item, index);
  const selected = Number(options.activeIndex) === index;
  const route = text(result.route, "");
  const tag = route ? "a" : "button";

  const option = createElement(tag, {
    className: [
      "topbar-search-result",
      selected ? "is-active" : "",
      result.type ? `topbar-search-result-type--${result.type}` : "",
      result.source ? `topbar-search-result-source--${result.source}` : "",
    ]
      .filter(Boolean)
      .join(" "),
    attrs: {
      id: result.id || `topbar-search-option-${index}`,
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
      "data-topbar-search-result-type": result.type || null,
      "data-topbar-search-result-source": result.source || null,
      "data-topbar-search-result-entity-id": result.entityId || null,
      "data-topbar-search-result-action": result.action || null,
    },
  });

  const icon = createElement("span", {
    className: "topbar-search-result-icon",
    textContent: result.icon
      ? result.icon.slice(0, 2).toUpperCase()
      : typeIcon(result.type),
    attrs: {
      "aria-hidden": "true",
    },
  });

  const copy = createElement("span", {
    className: "topbar-search-result-copy",
  });

  const head = createElement("span", {
    className: "topbar-search-result-head",
  });

  const label = createElement("span", {
    className: "topbar-search-result-label",
    textContent: result.label,
  });

  const badge = createElement("span", {
    className: [
      "topbar-search-result-badge",
      result.type ? `topbar-search-result-badge--${result.type}` : "",
    ]
      .filter(Boolean)
      .join(" "),
    textContent: result.typeLabel,
    attrs: {
      "aria-hidden": "true",
    },
  });

  appendChildren(head, [label, badge]);
  appendChildren(copy, head);

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

function createTopbarSearchLoading(query = "") {
  const loading = createElement("div", {
    className: "topbar-search-loading",
    attrs: {
      role: "status",
      "aria-live": "polite",
      "data-topbar-search-loading": "true",
    },
  });

  appendChildren(loading, [
    createElement("span", {
      className: "topbar-search-loading-dot",
      attrs: {
        "aria-hidden": "true",
      },
    }),
    createElement("span", {
      className: "topbar-search-loading-text",
      textContent: query ? `Buscando “${query}”…` : "Buscando…",
    }),
  ]);

  return loading;
}

function createTopbarSearchError(error = "") {
  const node = createElement("div", {
    className: "topbar-search-error",
    attrs: {
      role: "status",
      "data-topbar-search-error": "true",
    },
  });

  appendChildren(node, [
    createElement("span", {
      className: "topbar-search-error-title",
      textContent: "No se pudo buscar",
    }),
    createElement("span", {
      className: "topbar-search-error-text",
      textContent: text(error, "Revisa la conexión o inténtalo de nuevo."),
    }),
  ]);

  return node;
}

/* =========================================================
   RENDER RESULTS
========================================================= */

export function renderTopbarSearchResults(root = null, results = [], options = {}) {
  const refs = getTopbarTemplateRefs(root);

  if (!refs.searchResults) return false;

  const query = text(options.query, "");
  const status = text(options.status, "ready");
  const error = text(options.error, "");
  const activeIndex = Number.isFinite(Number(options.activeIndex))
    ? Number(options.activeIndex)
    : 0;

  const items = Array.isArray(results) ? results : [];
  const isLoading = status === "loading";
  const isError = status === "error";

  refs.searchResults.replaceChildren();
  refs.searchResults.hidden = false;
  refs.searchResults.setAttribute("aria-hidden", "false");
  refs.searchResults.setAttribute("aria-busy", isLoading ? "true" : "false");
  refs.searchResults.classList.add("active");

  refs.searchResults.dataset.searchOpen = "true";
  refs.searchResults.dataset.searchQuery = query;
  refs.searchResults.dataset.searchCount = String(items.length);
  refs.searchResults.dataset.searchStatus = status;

  refs.root?.classList?.add?.("is-search-focused");
  refs.search?.classList?.add?.("is-search-open");
  refs.search?.classList?.toggle?.("is-search-loading", isLoading);
  refs.search?.classList?.toggle?.("is-search-error", isError);

  if (refs.searchInput) {
    refs.searchInput.setAttribute("aria-expanded", "true");
  }

  if (!items.length) {
    if (isLoading) {
      appendChildren(refs.searchResults, createTopbarSearchLoading(query));
    } else if (isError) {
      appendChildren(refs.searchResults, createTopbarSearchError(error));
    } else {
      appendChildren(refs.searchResults, createTopbarSearchEmpty(query));
    }

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

  const activeIndex = items.findIndex(
    (item) => item.getAttribute("aria-selected") === "true"
  );

  return {
    query: refs.searchInput?.value || "",
    open: Boolean(refs.searchResults && refs.searchResults.hidden !== true),
    count: items.length,
    activeIndex,
    status: refs.searchResults?.dataset?.searchStatus || "",
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
  refs.searchResults.setAttribute("aria-busy", "false");
  refs.searchResults.classList.remove("active");

  delete refs.searchResults.dataset.searchOpen;
  delete refs.searchResults.dataset.searchQuery;
  delete refs.searchResults.dataset.searchCount;
  delete refs.searchResults.dataset.searchStatus;

  if (refs.searchInput) {
    refs.searchInput.setAttribute("aria-expanded", "false");
    refs.searchInput.removeAttribute("aria-activedescendant");

    if (opts.input === true) {
      refs.searchInput.value = "";
    }
  }

  refs.root?.classList?.remove?.("is-search-focused");
  refs.search?.classList?.remove?.("is-search-open");
  refs.search?.classList?.remove?.("is-search-loading");
  refs.search?.classList?.remove?.("is-search-error");

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
      delete refs.searchResults.dataset.searchStatus;
    }
  }

  refs.root?.classList?.toggle?.("is-search-focused", value);
  refs.search?.classList?.toggle?.("is-search-open", value);

  if (!value) {
    refs.search?.classList?.remove?.("is-search-loading");
    refs.search?.classList?.remove?.("is-search-error");
  }

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
      status: state.status,
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
