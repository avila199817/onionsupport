/* =========================================================
   Onion Support - Topbar Template
   Archivo: /src/ui/topbar/template.js

   Responsabilidad:
   - Construir sólo el DOM visual del topbar.
   - Título de ruta.
   - Buscador visual.
   - Contenedor estable de resultados.
   - Renderizar resultados recibidos desde index.js.
   - Estados visuales: ready / loading / empty / error.
   - Actualizar estados DOM de forma idempotente.
   - Evitar reconstruir resultados si su estructura no cambió.
   - Mantener navegación por teclado/ARIA con mínimo trabajo DOM.
   - Exponer refs/data-* consumidos por index.js.
   - Sin AppCore.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Toast.
   - Sin Store.
   - Sin navegación.
   - Sin eventos.
========================================================= */

export const TOPBAR_TEMPLATE_VERSION =
  "topbar.template.backend-search.v5-hardened";

const TOPBAR_ID =
  "app-topbar";

const TITLE_ID =
  "topbar-title";

const SEARCH_INPUT_ID =
  "topbar-search-input";

const SEARCH_RESULTS_ID =
  "topbar-search-results";

const DEFAULT_TITLE =
  "Onion Home";

const DEFAULT_PLACEHOLDER =
  "Buscar facturas, tickets, clientes…";

const MAX_UI_TEXT =
  500;

const MAX_DESCRIPTION =
  300;

const MAX_ROUTE_TEXT =
  700;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function text(
  value = "",
  fallback = "",
  max = MAX_UI_TEXT
) {
  const output =
    String(value ?? "")
      .replace(
        /[\r\n\t]/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  const finalValue =
    output ||
    fallback;

  if (
    !Number.isFinite(
      Number(max)
    ) ||
    Number(max) <= 0
  ) {
    return finalValue;
  }

  return finalValue.slice(
    0,
    Number(max)
  );
}

function cleanAttrs(
  attrs = {}
) {
  const output = {};

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      isObject(attrs)
        ? attrs
        : {}
    )
  ) {
    if (
      !key ||
      value === null ||
      value === undefined ||
      value === false
    ) {
      continue;
    }

    output[key] =
      value === true
        ? "true"
        : String(value);
  }

  return output;
}

function createElement(
  tag = "div",
  options = {}
) {
  const node =
    document.createElement(
      tag
    );

  if (
    options.className
  ) {
    node.className =
      options.className;
  }

  if (
    options.textContent !==
      undefined &&
    options.textContent !==
      null
  ) {
    node.textContent =
      String(
        options.textContent
      );
  }

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      cleanAttrs(
        options.attrs ||
        {}
      )
    )
  ) {
    node.setAttribute(
      key,
      value
    );
  }

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      cleanAttrs(
        options.dataset ||
        {}
      )
    )
  ) {
    node.dataset[key] =
      value;
  }

  return node;
}

function appendChildren(
  parent = null,
  children = []
) {
  if (!parent) {
    return parent;
  }

  const list =
    Array.isArray(
      children
    )
      ? children
      : [children];

  for (
    const child
    of list
  ) {
    if (!child) {
      continue;
    }

    parent.appendChild(
      child
    );
  }

  return parent;
}

function setAttributeIfChanged(
  node = null,
  name = "",
  value = ""
) {
  if (
    !node ||
    !name
  ) {
    return false;
  }

  const next =
    String(value);

  if (
    node.getAttribute(
      name
    ) === next
  ) {
    return false;
  }

  node.setAttribute(
    name,
    next
  );

  return true;
}

function setDatasetIfChanged(
  node = null,
  key = "",
  value = ""
) {
  if (
    !node?.dataset ||
    !key
  ) {
    return false;
  }

  const next =
    String(value);

  if (
    node.dataset[key] ===
    next
  ) {
    return false;
  }

  node.dataset[key] =
    next;

  return true;
}

function setClassIfChanged(
  node = null,
  className = "",
  enabled = false
) {
  if (
    !node?.classList ||
    !className
  ) {
    return false;
  }

  const next =
    enabled === true;

  if (
    node.classList.contains(
      className
    ) === next
  ) {
    return false;
  }

  node.classList.toggle(
    className,
    next
  );

  return true;
}

function removeDataset(
  node = null,
  key = ""
) {
  if (
    !node?.dataset ||
    !key ||
    node.dataset[key] ===
      undefined
  ) {
    return false;
  }

  delete node.dataset[key];

  return true;
}

function safeDomId(
  value = "",
  fallback =
    "topbar-search-option"
) {
  const clean =
    text(
      value,
      fallback,
      180
    )
      .replace(
        /[^A-Za-z0-9_:.-]+/g,
        "-"
      )
      .replace(
        /-+/g,
        "-"
      )
      .replace(
        /^[-:.]+|[-:.]+$/g,
        ""
      );

  return (
    clean ||
    fallback
  );
}

function signaturePart(
  value = "",
  max = 300
) {
  return text(
    value,
    "",
    max
  )
    .replace(
      /[|~]/g,
      "_"
    );
}

function hashSignature(
  value = ""
) {
  const source =
    String(
      value ?? ""
    );

  /*
    FNV-1a 32-bit:
    suficiente para invalidación de render, no se usa como hash de seguridad.
    Evita duplicar labels/rutas/query dentro de data-*.
  */
  let hash =
    0x811c9dc5;

  for (
    let index = 0;
    index <
      source.length;
    index += 1
  ) {
    hash ^=
      source.charCodeAt(
        index
      );

    hash =
      Math.imul(
        hash,
        0x01000193
      ) >>>
      0;
  }

  return hash
    .toString(36);
}

/* =========================================================
   TYPES
========================================================= */

function normalizeType(
  value = ""
) {
  const raw =
    text(
      value,
      "general",
      40
    ).toLowerCase();

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

  return (
    map[raw] ||
    raw ||
    "general"
  );
}

function typeLabel(
  value = ""
) {
  const type =
    normalizeType(
      value
    );

  const map = {
    nav:
      "Ruta",

    settings:
      "Ajuste",

    cliente:
      "Cliente",

    user:
      "Usuario",

    factura:
      "Factura",

    incidencia:
      "Ticket",

    hardware:
      "Hardware",

    general:
      "Resultado",
  };

  return (
    map[type] ||
    "Resultado"
  );
}

function typeIcon(
  value = "",
  fallback = "⌕"
) {
  const type =
    normalizeType(
      value
    );

  const map = {
    nav:
      "→",

    settings:
      "AJ",

    cliente:
      "CL",

    user:
      "US",

    factura:
      "FA",

    incidencia:
      "IN",

    hardware:
      "HW",

    general:
      "⌕",
  };

  return text(
    map[type] ||
    fallback,
    fallback,
    2
  ).toUpperCase();
}

/* =========================================================
   TITLE
========================================================= */

export function createTopbarTitle(
  title = DEFAULT_TITLE
) {
  return createElement(
    "h1",
    {
      className:
        "topbar-title",

      textContent:
        text(
          title,
          DEFAULT_TITLE
        ),

      attrs: {
        id:
          TITLE_ID,

        "data-topbar-title":
          "true",
      },
    }
  );
}

/* =========================================================
   SEARCH
========================================================= */

export function createTopbarSearch(
  options = {}
) {
  const placeholder =
    text(
      options.placeholder,
      DEFAULT_PLACEHOLDER,
      180
    );

  const value =
    text(
      options.value,
      "",
      MAX_UI_TEXT
    );

  const search =
    createElement(
      "form",
      {
        className:
          "topbar-search",

        attrs: {
          role:
            "search",

          autocomplete:
            "off",

          novalidate:
            "true",

          "data-topbar-search":
            "true",

          "aria-label":
            "Buscar",
        },
      }
    );

  const label =
    createElement(
      "label",
      {
        className:
          "sr-only",

        textContent:
          "Buscar",

        attrs: {
          for:
            SEARCH_INPUT_ID,
        },
      }
    );

  const input =
    createElement(
      "input",
      {
        className:
          "topbar-search-input",

        attrs: {
          id:
            SEARCH_INPUT_ID,

          type:
            "search",

          name:
            "q",

          placeholder,

          value,

          autocomplete:
            "off",

          autocapitalize:
            "none",

          spellcheck:
            "false",

          role:
            "combobox",

          "aria-autocomplete":
            "list",

          "aria-haspopup":
            "listbox",

          "aria-expanded":
            "false",

          "aria-controls":
            SEARCH_RESULTS_ID,

          "data-topbar-search-input":
            "true",
        },
      }
    );

  const button =
    createElement(
      "button",
      {
        className:
          "topbar-search-submit",

        attrs: {
          type:
            "submit",

          "aria-label":
            "Buscar",

          "data-topbar-search-submit":
            "true",
        },
      }
    );

  const buttonIcon =
    createElement(
      "span",
      {
        className:
          "topbar-search-icon",

        textContent:
          "⌕",

        attrs: {
          "aria-hidden":
            "true",
        },
      }
    );

  const results =
    createElement(
      "div",
      {
        className:
          "topbar-search-results",

        attrs: {
          id:
            SEARCH_RESULTS_ID,

          role:
            "listbox",

          hidden:
            "true",

          "aria-label":
            "Resultados de búsqueda",

          "aria-hidden":
            "true",

          "aria-busy":
            "false",

          "data-topbar-search-results":
            "true",
        },
      }
    );

  /*
    hidden es booleano en DOM.
    Lo fijamos explícitamente para no depender sólo del atributo.
  */
  results.hidden =
    true;

  appendChildren(
    button,
    buttonIcon
  );

  appendChildren(
    search,
    [
      label,
      input,
      button,
      results,
    ]
  );

  return search;
}

/* =========================================================
   RESULT NORMALIZATION
========================================================= */

function normalizeResult(
  item = {},
  index = 0
) {
  const source =
    isObject(item)
      ? item
      : {};

  const label =
    text(
      source.label ||
      source.title ||
      source.name ||
      source.displayName,
      "Resultado",
      MAX_UI_TEXT
    );

  const description =
    text(
      source.description ||
      source.text ||
      source.subtitle ||
      source.status ||
      "",
      "",
      MAX_DESCRIPTION
    );

  const route =
    text(
      source.route ||
      source.href ||
      source.path ||
      source.to ||
      "",
      "",
      MAX_ROUTE_TEXT
    );

  const type =
    normalizeType(
      source.type ||
      source.kind ||
      source.entity ||
      ""
    );

  const icon =
    text(
      source.icon ||
      "",
      "",
      2
    ) ||
    typeIcon(
      type
    );

  const sourceName =
    text(
      source.source,
      "",
      40
    );

  const entityId =
    text(
      source.entityId,
      "",
      180
    );

  const action =
    text(
      source.action,
      "",
      100
    );

  const logicalId =
    text(
      source.id ||
      source.key ||
      `${type}:${route || label}`,
      `option-${index}`,
      180
    );

  /*
    El DOM id siempre es único por índice aunque backend repita IDs.
  */
  const domId =
    `topbar-search-option-${index}-${safeDomId(
      logicalId,
      "result"
    )}`;

  return {
    id:
      logicalId,

    domId,

    label,
    title:
      label,

    description,
    subtitle:
      description,

    route,
    href:
      route,

    icon:
      icon
        .slice(
          0,
          2
        )
        .toUpperCase(),

    type,

    typeLabel:
      text(
        source.typeLabel,
        typeLabel(type),
        80
      ),

    source:
      sourceName,

    entityId,
    action,
  };
}

function normalizedResults(
  results = []
) {
  return (
    Array.isArray(
      results
    )
      ? results
      : []
  ).map(
    (
      item,
      index
    ) =>
      normalizeResult(
        item,
        index
      )
  );
}

function resultsSignature(
  items = []
) {
  const source =
    items
      .map(
        (item) =>
          [
            item.id,
            item.label,
            item.description,
            item.route,
            item.icon,
            item.type,
            item.typeLabel,
            item.source,
            item.entityId,
            item.action,
          ]
            .map(
              (
                value,
                index
              ) =>
                signaturePart(
                  value,
                  index === 3
                    ? MAX_ROUTE_TEXT
                    : 300
                )
            )
            .join("~")
      )
      .join("|");

  return hashSignature(
    source
  );
}

/* =========================================================
   SEARCH RESULT NODES
========================================================= */

function createTopbarSearchResult(
  result,
  index = 0,
  options = {}
) {
  const selected =
    Number(
      options.activeIndex
    ) ===
    index;

  const route =
    text(
      result?.route,
      "",
      MAX_ROUTE_TEXT
    );

  const tag =
    route
      ? "a"
      : "button";

  const option =
    createElement(
      tag,
      {
        className:
          [
            "topbar-search-result",

            selected
              ? "is-active"
              : "",

            result?.type
              ? `topbar-search-result-type--${result.type}`
              : "",

            result?.source
              ? `topbar-search-result-source--${result.source}`
              : "",
          ]
            .filter(Boolean)
            .join(" "),

        attrs: {
          id:
            result?.domId ||
            `topbar-search-option-${index}`,

          role:
            "option",

          tabindex:
            "-1",

          "aria-selected":
            selected
              ? "true"
              : "false",

          href:
            route ||
            null,

          type:
            route
              ? null
              : "button",

          "data-spa":
            route
              ? "true"
              : null,

          "data-route":
            route ||
            null,

          "data-href":
            route ||
            null,

          "data-topbar-search-result":
            "true",

          "data-topbar-search-result-index":
            String(index),

          "data-topbar-search-result-label":
            result?.label ||
            "Resultado",

          "data-topbar-search-result-route":
            route ||
            null,

          "data-topbar-search-result-type":
            result?.type ||
            null,

          "data-topbar-search-result-source":
            result?.source ||
            null,

          /*
            Se conservan por compatibilidad con el contrato existente.
            index.js v6 no depende de ellos.
          */
          "data-topbar-search-result-entity-id":
            result?.entityId ||
            null,

          "data-topbar-search-result-action":
            result?.action ||
            null,
        },
      }
    );

  const icon =
    createElement(
      "span",
      {
        className:
          "topbar-search-result-icon",

        textContent:
          result?.icon
            ? result.icon
                .slice(
                  0,
                  2
                )
                .toUpperCase()
            : typeIcon(
                result?.type
              ),

        attrs: {
          "aria-hidden":
            "true",
        },
      }
    );

  const copy =
    createElement(
      "span",
      {
        className:
          "topbar-search-result-copy",
      }
    );

  const head =
    createElement(
      "span",
      {
        className:
          "topbar-search-result-head",
      }
    );

  const label =
    createElement(
      "span",
      {
        className:
          "topbar-search-result-label",

        textContent:
          result?.label ||
          "Resultado",
      }
    );

  const badge =
    createElement(
      "span",
      {
        className:
          [
            "topbar-search-result-badge",

            result?.type
              ? `topbar-search-result-badge--${result.type}`
              : "",
          ]
            .filter(Boolean)
            .join(" "),

        textContent:
          result?.typeLabel ||
          typeLabel(
            result?.type
          ),

        attrs: {
          "aria-hidden":
            "true",
        },
      }
    );

  appendChildren(
    head,
    [
      label,
      badge,
    ]
  );

  appendChildren(
    copy,
    head
  );

  if (
    result?.description
  ) {
    appendChildren(
      copy,
      createElement(
        "span",
        {
          className:
            "topbar-search-result-description",

          textContent:
            result.description,
        }
      )
    );
  }

  if (route) {
    appendChildren(
      copy,
      createElement(
        "span",
        {
          className:
            "topbar-search-result-route",

          textContent:
            route,

          attrs: {
            "aria-hidden":
              "true",
          },
        }
      )
    );
  }

  appendChildren(
    option,
    [
      icon,
      copy,
    ]
  );

  return option;
}

function createTopbarSearchEmpty(
  query = ""
) {
  const empty =
    createElement(
      "div",
      {
        className:
          "topbar-search-empty",

        attrs: {
          role:
            "status",

          "aria-live":
            "polite",

          "data-topbar-search-empty":
            "true",
        },
      }
    );

  appendChildren(
    empty,
    [
      createElement(
        "span",
        {
          className:
            "topbar-search-empty-title",

          textContent:
            "Sin resultados",
        }
      ),

      createElement(
        "span",
        {
          className:
            "topbar-search-empty-text",

          textContent:
            query
              ? `No hay coincidencias para “${text(
                  query,
                  "",
                  160
                )}”.`
              : "Escribe para buscar en la aplicación.",
        }
      ),
    ]
  );

  return empty;
}

function createTopbarSearchLoading(
  query = ""
) {
  const loading =
    createElement(
      "div",
      {
        className:
          "topbar-search-loading",

        attrs: {
          role:
            "status",

          "aria-live":
            "polite",

          "data-topbar-search-loading":
            "true",
        },
      }
    );

  appendChildren(
    loading,
    [
      createElement(
        "span",
        {
          className:
            "topbar-search-loading-dot",

          attrs: {
            "aria-hidden":
              "true",
          },
        }
      ),

      createElement(
        "span",
        {
          className:
            "topbar-search-loading-text",

          textContent:
            query
              ? `Buscando “${text(
                  query,
                  "",
                  160
                )}”…`
              : "Buscando…",
        }
      ),
    ]
  );

  return loading;
}

function createTopbarSearchError(
  error = ""
) {
  const node =
    createElement(
      "div",
      {
        className:
          "topbar-search-error",

        attrs: {
          role:
            "status",

          "aria-live":
            "polite",

          "data-topbar-search-error":
            "true",
        },
      }
    );

  appendChildren(
    node,
    [
      createElement(
        "span",
        {
          className:
            "topbar-search-error-title",

          textContent:
            "No se pudo buscar",
        }
      ),

      createElement(
        "span",
        {
          className:
            "topbar-search-error-text",

          textContent:
            text(
              error,
              "Revisa la conexión o inténtalo de nuevo.",
              300
            ),
        }
      ),
    ]
  );

  return node;
}

/* =========================================================
   SEARCH STATE HELPERS
========================================================= */

function setSearchOpenState(
  refs,
  {
    open = true,
    loading = false,
    error = false,
    count = 0,
    status = "ready",
  } = {}
) {
  if (
    !refs?.searchResults
  ) {
    return false;
  }

  let changed = false;

  if (
    refs.searchResults.hidden ===
    open
  ) {
    refs.searchResults.hidden =
      !open;

    changed =
      true;
  }

  changed =
    setAttributeIfChanged(
      refs.searchResults,
      "aria-hidden",
      open
        ? "false"
        : "true"
    ) ||
    changed;

  changed =
    setAttributeIfChanged(
      refs.searchResults,
      "aria-busy",
      loading
        ? "true"
        : "false"
    ) ||
    changed;

  changed =
    setClassIfChanged(
      refs.searchResults,
      "active",
      open
    ) ||
    changed;

  changed =
    setDatasetIfChanged(
      refs.searchResults,
      "searchCount",
      String(
        Math.max(
          0,
          Number(count) ||
          0
        )
      )
    ) ||
    changed;

  changed =
    setDatasetIfChanged(
      refs.searchResults,
      "searchStatus",
      status
    ) ||
    changed;

  if (open) {
    changed =
      setDatasetIfChanged(
        refs.searchResults,
        "searchOpen",
        "true"
      ) ||
      changed;
  } else {
    changed =
      removeDataset(
        refs.searchResults,
        "searchOpen"
      ) ||
      changed;
  }

  /*
    La query vive en el input/controlador.
    No la duplicamos en data-* del DOM.
  */
  changed =
    removeDataset(
      refs.searchResults,
      "searchQuery"
    ) ||
    changed;

  changed =
    setClassIfChanged(
      refs.root,
      "is-search-focused",
      open
    ) ||
    changed;

  changed =
    setClassIfChanged(
      refs.search,
      "is-search-open",
      open
    ) ||
    changed;

  changed =
    setClassIfChanged(
      refs.search,
      "is-search-loading",
      open &&
      loading
    ) ||
    changed;

  changed =
    setClassIfChanged(
      refs.search,
      "is-search-error",
      open &&
      error
    ) ||
    changed;

  if (
    refs.searchInput
  ) {
    changed =
      setAttributeIfChanged(
        refs.searchInput,
        "aria-expanded",
        open
          ? "true"
          : "false"
      ) ||
      changed;
  }

  return changed;
}

/* =========================================================
   RENDER RESULTS
========================================================= */

export function renderTopbarSearchResults(
  root = null,
  results = [],
  options = {}
) {
  const refs =
    getTopbarTemplateRefs(
      root
    );

  if (
    !refs.searchResults
  ) {
    return false;
  }

  const query =
    text(
      options.query,
      "",
      MAX_UI_TEXT
    );

  const status =
    text(
      options.status,
      "ready",
      40
    );

  const error =
    text(
      options.error,
      "",
      300
    );

  const normalized =
    normalizedResults(
      results
    );

  const isLoading =
    status ===
    "loading";

  const isError =
    status ===
    "error";

  const requestedIndex =
    Number.isFinite(
      Number(
        options.activeIndex
      )
    )
      ? Number(
          options.activeIndex
        )
      : 0;

  const activeIndex =
    normalized.length
      ? Math.max(
          0,
          Math.min(
            requestedIndex,
            normalized.length -
              1
          )
        )
      : -1;

  setSearchOpenState(
    refs,
    {
      open:
        true,

      loading:
        isLoading,

      error:
        isError,

      count:
        normalized.length,

      status,
    }
  );

  /*
    Con resultados visibles, loading/error se expresa con clases/ARIA.
    No hace falta reconstruir los mismos nodos sólo por cambiar status.
  */
  if (
    normalized.length
  ) {
    const signature =
      resultsSignature(
        normalized
      );

    const structureChanged =
      refs.searchResults
        .dataset
        .searchRenderSignature !==
      signature;

    if (
      structureChanged
    ) {
      const fragment =
        document.createDocumentFragment();

      normalized.forEach(
        (
          item,
          index
        ) => {
          fragment.appendChild(
            createTopbarSearchResult(
              item,
              index,
              {
                activeIndex,
              }
            )
          );
        }
      );

      refs.searchResults
        .replaceChildren(
          fragment
        );

      refs.searchResults
        .dataset
        .searchRenderSignature =
        signature;

      refs.searchResults
        .dataset
        .searchActiveIndex =
        String(
          activeIndex
        );
    }

    setTopbarSearchActiveIndex(
      root,
      activeIndex
    );

    return true;
  }

  /*
    Estados sin items sí dependen de query/status/error.
  */
  const emptySignature =
    hashSignature(
      [
        status,
        query,
        error,
      ]
        .map(
          (value) =>
            signaturePart(
              value,
              300
            )
        )
        .join("~")
    );

  const structureChanged =
    refs.searchResults
      .dataset
      .searchRenderSignature !==
    emptySignature;

  if (
    structureChanged
  ) {
    let stateNode = null;

    if (isLoading) {
      stateNode =
        createTopbarSearchLoading(
          query
        );
    } else if (
      isError
    ) {
      stateNode =
        createTopbarSearchError(
          error
        );
    } else {
      stateNode =
        createTopbarSearchEmpty(
          query
        );
    }

    refs.searchResults
      .replaceChildren(
        stateNode
      );

    refs.searchResults
      .dataset
      .searchRenderSignature =
      emptySignature;
  }

  removeDataset(
    refs.searchResults,
    "searchActiveIndex"
  );

  refs.searchInput
    ?.removeAttribute?.(
      "aria-activedescendant"
    );

  return true;
}

/* =========================================================
   ACTIVE RESULT
========================================================= */

export function setTopbarSearchActiveIndex(
  root = null,
  index = -1
) {
  const refs =
    getTopbarTemplateRefs(
      root
    );

  if (
    !refs.searchResults
  ) {
    return false;
  }

  const items =
    Array.from(
      refs.searchResults
        .querySelectorAll(
          "[data-topbar-search-result='true']"
        )
    );

  if (!items.length) {
    refs.searchInput
      ?.removeAttribute?.(
        "aria-activedescendant"
      );

    removeDataset(
      refs.searchResults,
      "searchActiveIndex"
    );

    return false;
  }

  const nextIndex =
    Math.max(
      0,
      Math.min(
        Number(index) ||
        0,
        items.length - 1
      )
    );

  const previousIndex =
    Number(
      refs.searchResults
        .dataset
        .searchActiveIndex
    );

  if (
    Number.isFinite(
      previousIndex
    ) &&
    previousIndex ===
      nextIndex
  ) {
    const active =
      items[nextIndex];

    if (
      active?.id &&
      refs.searchInput
    ) {
      setAttributeIfChanged(
        refs.searchInput,
        "aria-activedescendant",
        active.id
      );
    }

    return false;
  }

  let changed = false;

  if (
    Number.isFinite(
      previousIndex
    ) &&
    items[previousIndex]
  ) {
    const previous =
      items[
        previousIndex
      ];

    changed =
      setClassIfChanged(
        previous,
        "is-active",
        false
      ) ||
      changed;

    changed =
      setAttributeIfChanged(
        previous,
        "aria-selected",
        "false"
      ) ||
      changed;
  }

  const active =
    items[nextIndex];

  if (active) {
    changed =
      setClassIfChanged(
        active,
        "is-active",
        true
      ) ||
      changed;

    changed =
      setAttributeIfChanged(
        active,
        "aria-selected",
        "true"
      ) ||
      changed;

    changed =
      setDatasetIfChanged(
        refs.searchResults,
        "searchActiveIndex",
        String(nextIndex)
      ) ||
      changed;

    if (
      active.id &&
      refs.searchInput
    ) {
      changed =
        setAttributeIfChanged(
          refs.searchInput,
          "aria-activedescendant",
          active.id
        ) ||
        changed;
    }
  }

  return changed;
}

export function setTopbarSearchValue(
  root = null,
  value = ""
) {
  const refs =
    getTopbarTemplateRefs(
      root
    );

  if (
    !refs.searchInput
  ) {
    return false;
  }

  const next =
    text(
      value,
      "",
      MAX_UI_TEXT
    );

  if (
    refs.searchInput
      .value ===
    next
  ) {
    return false;
  }

  refs.searchInput.value =
    next;

  return true;
}

export function getTopbarSearchResultsState(
  root = null
) {
  const refs =
    getTopbarTemplateRefs(
      root
    );

  const items =
    Array.from(
      refs.searchResults
        ?.querySelectorAll?.(
          "[data-topbar-search-result='true']"
        ) ||
      []
    );

  let activeIndex =
    Number(
      refs.searchResults
        ?.dataset
        ?.searchActiveIndex
    );

  if (
    !Number.isFinite(
      activeIndex
    ) ||
    activeIndex < 0 ||
    activeIndex >=
      items.length
  ) {
    activeIndex =
      items.findIndex(
        (item) =>
          item.getAttribute(
            "aria-selected"
          ) ===
          "true"
      );
  }

  return {
    query:
      refs.searchInput
        ?.value ||
      "",

    open:
      Boolean(
        refs.searchResults &&
        refs.searchResults
          .hidden !==
          true
      ),

    count:
      items.length,

    activeIndex,

    status:
      refs.searchResults
        ?.dataset
        ?.searchStatus ||
      "",

    activeRoute:
      activeIndex >=
        0
        ? (
            items[
              activeIndex
            ]?.dataset
              ?.route ||
            items[
              activeIndex
            ]?.dataset
              ?.href ||
            items[
              activeIndex
            ]?.getAttribute?.(
              "href"
            ) ||
            ""
          )
        : "",
  };
}

/* =========================================================
   ROOT
========================================================= */

export function createTopbarTemplate(
  options = {}
) {
  if (!isBrowser()) {
    return null;
  }

  const title =
    text(
      options.title,
      DEFAULT_TITLE
    );

  const visible =
    options.visible !==
    false;

  const withSearch =
    options.search !==
    false;

  const topbar =
    createElement(
      "header",
      {
        className:
          "topbar app-topbar",

        attrs: {
          id:
            text(
              options.id,
              TOPBAR_ID,
              120
            ),

          role:
            "banner",

          "aria-label":
            "Barra superior",

          "aria-hidden":
            visible
              ? "false"
              : "true",

          "data-topbar-root":
            "true",

          "data-topbar-visible":
            visible
              ? "true"
              : "false",
        },
      }
    );

  topbar.hidden =
    !visible;

  const left =
    createElement(
      "div",
      {
        className:
          "topbar-left",

        attrs: {
          "data-topbar-left":
            "true",
        },
      }
    );

  appendChildren(
    left,
    createTopbarTitle(
      title
    )
  );

  const right =
    createElement(
      "div",
      {
        className:
          "topbar-right",

        attrs: {
          "data-topbar-right":
            "true",
        },
      }
    );

  if (withSearch) {
    appendChildren(
      right,
      createTopbarSearch(
        options.searchOptions ||
        {}
      )
    );
  }

  appendChildren(
    topbar,
    [
      left,
      right,
    ]
  );

  return topbar;
}

/* =========================================================
   REFS
========================================================= */

function emptyRefs() {
  return {
    root: null,
    title: null,
    search: null,
    searchInput: null,
    searchSubmit: null,
    searchResults: null,
  };
}

export function getTopbarTemplateRefs(
  root = null
) {
  const scope =
    root ||
    (
      isBrowser()
        ? document
        : null
    );

  if (!scope) {
    return emptyRefs();
  }

  const topbar =
    (
      scope.matches?.(
        "[data-topbar-root]"
      ) ||
      scope.id ===
        TOPBAR_ID
    )
      ? scope
      : (
          scope.querySelector?.(
            "[data-topbar-root], #app-topbar"
          ) ||
          null
        );

  if (!topbar) {
    return emptyRefs();
  }

  return {
    root:
      topbar,

    title:
      topbar.querySelector?.(
        "[data-topbar-title]"
      ) ||
      topbar.querySelector?.(
        `#${TITLE_ID}`
      ) ||
      null,

    search:
      topbar.querySelector?.(
        "[data-topbar-search]"
      ) ||
      null,

    searchInput:
      topbar.querySelector?.(
        "[data-topbar-search-input]"
      ) ||
      topbar.querySelector?.(
        `#${SEARCH_INPUT_ID}`
      ) ||
      null,

    searchSubmit:
      topbar.querySelector?.(
        "[data-topbar-search-submit]"
      ) ||
      null,

    searchResults:
      topbar.querySelector?.(
        "[data-topbar-search-results]"
      ) ||
      topbar.querySelector?.(
        `#${SEARCH_RESULTS_ID}`
      ) ||
      null,
  };
}

/* =========================================================
   PATCH HELPERS
========================================================= */

export function setTopbarTemplateTitle(
  root = null,
  title = DEFAULT_TITLE
) {
  const refs =
    getTopbarTemplateRefs(
      root
    );

  if (!refs.title) {
    return false;
  }

  const next =
    text(
      title,
      DEFAULT_TITLE
    );

  let changed = false;

  if (
    refs.title
      .textContent !==
    next
  ) {
    refs.title.textContent =
      next;

    changed =
      true;
  }

  changed =
    setDatasetIfChanged(
      refs.title,
      "routeTitle",
      next
    ) ||
    changed;

  return changed;
}

export function setTopbarTemplateVisible(
  root = null,
  visible = true
) {
  const refs =
    getTopbarTemplateRefs(
      root
    );

  if (!refs.root) {
    return false;
  }

  const value =
    visible ===
    true;

  let changed = false;

  if (
    refs.root.hidden ===
    value
  ) {
    refs.root.hidden =
      !value;

    changed =
      true;
  }

  changed =
    setDatasetIfChanged(
      refs.root,
      "topbarVisible",
      value
        ? "true"
        : "false"
    ) ||
    changed;

  changed =
    setAttributeIfChanged(
      refs.root,
      "aria-hidden",
      value
        ? "false"
        : "true"
    ) ||
    changed;

  return changed;
}

export function clearTopbarSearchResults(
  root = null,
  options = {}
) {
  const opts =
    typeof options ===
      "boolean"
      ? {
          input:
            options,
        }
      : (
          isObject(options)
            ? options
            : {}
        );

  const refs =
    getTopbarTemplateRefs(
      root
    );

  if (!refs.searchResults) {
    return false;
  }

  let changed = false;

  if (
    refs.searchResults
      .hidden !==
    true
  ) {
    refs.searchResults
      .hidden =
      true;

    changed =
      true;
  }

  if (
    refs.searchResults
      .childNodes
      .length
  ) {
    refs.searchResults
      .replaceChildren();

    changed =
      true;
  }

  changed =
    setAttributeIfChanged(
      refs.searchResults,
      "aria-hidden",
      "true"
    ) ||
    changed;

  changed =
    setAttributeIfChanged(
      refs.searchResults,
      "aria-busy",
      "false"
    ) ||
    changed;

  changed =
    setClassIfChanged(
      refs.searchResults,
      "active",
      false
    ) ||
    changed;

  for (
    const key
    of [
      "searchOpen",
      "searchQuery",
      "searchCount",
      "searchStatus",
      "searchRenderSignature",
      "searchActiveIndex",
    ]
  ) {
    changed =
      removeDataset(
        refs.searchResults,
        key
      ) ||
      changed;
  }

  if (
    refs.searchInput
  ) {
    changed =
      setAttributeIfChanged(
        refs.searchInput,
        "aria-expanded",
        "false"
      ) ||
      changed;

    if (
      refs.searchInput
        .hasAttribute(
          "aria-activedescendant"
        )
    ) {
      refs.searchInput
        .removeAttribute(
          "aria-activedescendant"
        );

      changed =
        true;
    }

    if (
      opts.input ===
        true &&
      refs.searchInput
        .value !==
        ""
    ) {
      refs.searchInput.value =
        "";

      changed =
        true;
    }
  }

  changed =
    setClassIfChanged(
      refs.root,
      "is-search-focused",
      false
    ) ||
    changed;

  changed =
    setClassIfChanged(
      refs.search,
      "is-search-open",
      false
    ) ||
    changed;

  changed =
    setClassIfChanged(
      refs.search,
      "is-search-loading",
      false
    ) ||
    changed;

  changed =
    setClassIfChanged(
      refs.search,
      "is-search-error",
      false
    ) ||
    changed;

  return changed;
}

export function setTopbarSearchExpanded(
  root = null,
  expanded = false
) {
  const refs =
    getTopbarTemplateRefs(
      root
    );

  const value =
    expanded ===
    true;

  if (
    !refs.searchInput &&
    !refs.searchResults
  ) {
    return false;
  }

  let changed = false;

  if (
    refs.searchInput
  ) {
    changed =
      setAttributeIfChanged(
        refs.searchInput,
        "aria-expanded",
        value
          ? "true"
          : "false"
      ) ||
      changed;

    if (
      !value &&
      refs.searchInput
        .hasAttribute(
          "aria-activedescendant"
        )
    ) {
      refs.searchInput
        .removeAttribute(
          "aria-activedescendant"
        );

      changed =
        true;
    }
  }

  if (
    refs.searchResults
  ) {
    if (
      refs.searchResults
        .hidden ===
      value
    ) {
      refs.searchResults
        .hidden =
        !value;

      changed =
        true;
    }

    changed =
      setAttributeIfChanged(
        refs.searchResults,
        "aria-hidden",
        value
          ? "false"
          : "true"
      ) ||
      changed;

    changed =
      setClassIfChanged(
        refs.searchResults,
        "active",
        value
      ) ||
      changed;

    if (value) {
      changed =
        setDatasetIfChanged(
          refs.searchResults,
          "searchOpen",
          "true"
        ) ||
        changed;
    } else {
      for (
        const key
        of [
          "searchOpen",
          "searchStatus",
          "searchActiveIndex",
        ]
      ) {
        changed =
          removeDataset(
            refs.searchResults,
            key
          ) ||
          changed;
      }
    }
  }

  changed =
    setClassIfChanged(
      refs.root,
      "is-search-focused",
      value
    ) ||
    changed;

  changed =
    setClassIfChanged(
      refs.search,
      "is-search-open",
      value
    ) ||
    changed;

  if (!value) {
    changed =
      setClassIfChanged(
        refs.search,
        "is-search-loading",
        false
      ) ||
      changed;

    changed =
      setClassIfChanged(
        refs.search,
        "is-search-error",
        false
      ) ||
      changed;
  }

  return changed;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getTopbarTemplateSnapshot(
  root = null
) {
  const refs =
    getTopbarTemplateRefs(
      root
    );

  const state =
    getTopbarSearchResultsState(
      root
    );

  return Object.freeze({
    version:
      TOPBAR_TEMPLATE_VERSION,

    hasRoot:
      Boolean(
        refs.root
      ),

    visible:
      Boolean(
        refs.root &&
        refs.root.hidden !==
          true
      ),

    hasTitle:
      Boolean(
        refs.title
      ),

    title:
      refs.title
        ?.textContent ||
      "",

    search:
      Object.freeze({
        enabled:
          Boolean(
            refs.search
          ),

        hasInput:
          Boolean(
            refs.searchInput
          ),

        hasSubmit:
          Boolean(
            refs.searchSubmit
          ),

        hasResults:
          Boolean(
            refs.searchResults
          ),

        expanded:
          refs.searchInput
            ?.getAttribute?.(
              "aria-expanded"
            ) ||
          null,

        resultsHidden:
          refs.searchResults
            ? refs.searchResults
                .hidden ===
              true
            : null,

        query:
          state.query,

        count:
          state.count,

        activeIndex:
          state.activeIndex,

        status:
          state.status,
      }),

    policy:
      Object.freeze({
        templateOnly:
          true,

        buildsDom:
          true,

        stableRefs:
          true,

        rendersSearchResults:
          true,

        idempotentPatches:
          true,

        structuralResultReuse:
          true,

        activeIndexO1Patch:
          true,

        uniqueResultDomIds:
          true,

        queryNotDuplicatedInDataset:
          true,

        noAppCore:
          true,

        noAuth:
          true,

        noRouter:
          true,

        noHttp:
          true,

        noToast:
          true,

        noStore:
          true,

        noSearchEngine:
          true,

        noNavigation:
          true,

        noEvents:
          true,
      }),
  });
}

/* =========================================================
   API
========================================================= */

export const TopbarTemplate = {
  version:
    TOPBAR_TEMPLATE_VERSION,

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

  getSnapshot:
    getTopbarTemplateSnapshot,

  getDebugSnapshot:
    getTopbarTemplateSnapshot,
};

export default TopbarTemplate;
