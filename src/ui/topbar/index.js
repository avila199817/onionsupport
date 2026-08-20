/* =========================================================
   Onion Support - Topbar UI
   Archivo: /src/ui/topbar/index.js

   Responsabilidad:
   - Controlador estable del topbar.
   - Montar una sola vez en #topbar-mount / #app-topbar.
   - Mostrar título de ruta.
   - Ocultarse en rutas públicas/auth.
   - Buscar vía Core HTTP (/api/search), sin fetch ni token handling propio.
   - Mantener búsqueda local derivada de la tabla real de rutas.
   - Debounce, AbortController, cache corta y control anti-race.
   - Portar dropdown fuera del form para evitar overflow clipping.
   - Navegación SPA segura vía Router.
   - No conservar payload backend crudo en resultados/debug.
   - Sin Store.
   - Sin Services.
   - Sin Toast.
========================================================= */

import { AppCore } from "../../core/index.js";
import Http from "../../core/http.js";

import {
  isBlockedRoutePath,
  normalizeRoutePath,
} from "../../core/config.js";

import {
  getImmutableRoutes,
} from "../../router/routes.js";

import {
  createTopbarTemplate,
  getTopbarTemplateRefs,
  setTopbarTemplateTitle,
  setTopbarTemplateVisible,
  clearTopbarSearchResults,
  setTopbarSearchExpanded,
  renderTopbarSearchResults,
  setTopbarSearchActiveIndex,
} from "./template.js";

export const TOPBAR_VERSION =
  "topbar.controller.backend-search.v7-canonical-routes";

const TOPBAR_ROOT_ID =
  "app-topbar";

const TOPBAR_MOUNT_ID =
  "topbar-mount";

const APP_TITLE_PREFIX =
  "Onion";

const SOURCE =
  "topbar.search";

const SEARCH_ENDPOINT_DEFAULT =
  "/api/search";

const SEARCH_LIMIT = 10;
const BACKEND_LIMIT = 12;
const BACKEND_DEBOUNCE_MS = 140;
const BACKEND_TIMEOUT_MS = 9000;
const BACKEND_CACHE_TTL_MS = 25_000;
const BACKEND_CACHE_MAX = 80;

const ROLE_ADMIN =
  "admin";

const ROLE_USER =
  "user";

const SEARCH_STATUS =
  Object.freeze({
    IDLE: "idle",
    LOADING: "loading",
    READY: "ready",
    EMPTY: "empty",
    ERROR: "error",
  });

const RESULT_TYPES =
  Object.freeze({
    NAV: "nav",
    SETTINGS: "settings",
    CLIENTE: "cliente",
    USER: "user",
    INCIDENCIA: "incidencia",
    FACTURA: "factura",
    HARDWARE: "hardware",
    GENERAL: "general",
  });

const TYPE_ICON =
  Object.freeze({
    [RESULT_TYPES.NAV]:
      "→",

    [RESULT_TYPES.SETTINGS]:
      "AJ",

    [RESULT_TYPES.CLIENTE]:
      "CL",

    [RESULT_TYPES.USER]:
      "US",

    [RESULT_TYPES.INCIDENCIA]:
      "IN",

    [RESULT_TYPES.FACTURA]:
      "FA",

    [RESULT_TYPES.HARDWARE]:
      "HW",

    [RESULT_TYPES.GENERAL]:
      "⌕",
  });

/*
  Metadata de búsqueda únicamente.
  Los paths/títulos/roles reales salen de router/routes.js.
*/
const LOCAL_ROUTE_META =
  Object.freeze({
    home:
      Object.freeze({
        description:
          "Panel principal",

        icon:
          "HM",

        type:
          RESULT_TYPES.NAV,

        keywords:
          Object.freeze([
            "inicio",
            "dashboard",
            "panel",
            "principal",
            "home",
          ]),
      }),

    incidencias:
      Object.freeze({
        description:
          "Tickets y solicitudes de soporte",

        icon:
          "IN",

        type:
          RESULT_TYPES.INCIDENCIA,

        keywords:
          Object.freeze([
            "incidencias",
            "incidencia",
            "ticket",
            "tickets",
            "soporte",
            "solicitudes",
            "casos",
            "crear incidencia",
            "nueva incidencia",
            "mis tickets",
            "mis incidencias",
          ]),
      }),

    facturas:
      Object.freeze({
        description:
          "Facturación, importes, PDFs y pagos",

        icon:
          "FA",

        type:
          RESULT_TYPES.FACTURA,

        keywords:
          Object.freeze([
            "factura",
            "facturas",
            "billing",
            "pagos",
            "importe",
            "facturacion",
            "facturación",
            "invoice",
            "pdf",
            "mis facturas",
          ]),
      }),

    clientes:
      Object.freeze({
        description:
          "Administración de clientes",

        icon:
          "CL",

        type:
          RESULT_TYPES.CLIENTE,

        keywords:
          Object.freeze([
            "cliente",
            "clientes",
            "clients",
            "empresas",
            "cuentas",
            "administracion",
            "administración",
            "perfil cliente",
            "ficha cliente",
          ]),
      }),

    usuarios:
      Object.freeze({
        description:
          "Administración de usuarios",

        icon:
          "US",

        type:
          RESULT_TYPES.USER,

        keywords:
          Object.freeze([
            "usuario",
            "usuarios",
            "users",
            "miembros",
            "permisos",
            "roles",
            "buscar usuario",
          ]),
      }),

    servidor:
      Object.freeze({
        description:
          "Estado y configuración del servidor",

        icon:
          "SV",

        type:
          RESULT_TYPES.SETTINGS,

        keywords:
          Object.freeze([
            "server",
            "servidor",
            "estado",
            "sistema",
            "infraestructura",
          ]),
      }),

    cuenta:
      Object.freeze({
        description:
          "Perfil y datos de cuenta",

        icon:
          "CU",

        type:
          RESULT_TYPES.USER,

        keywords:
          Object.freeze([
            "perfil",
            "profile",
            "mi cuenta",
            "mi perfil",
            "account",
            "usuario",
            "mi usuario",
          ]),
      }),

    ajustes:
      Object.freeze({
        description:
          "Preferencias y configuración",

        icon:
          "AJ",

        type:
          RESULT_TYPES.SETTINGS,

        keywords:
          Object.freeze([
            "settings",
            "ajustes",
            "configuracion",
            "configuración",
            "preferencias",
          ]),
      }),
  });

let initialized = false;
let mounted = false;

let root = null;
let cleanupEvents = null;

let lastOptions = {};
let lastTitle = "";
let lastHidden = true;

let latestSearchResults = [];
let activeSearchIndex = -1;

let lastSearchQuery = "";
let lastSearchStatus =
  SEARCH_STATUS.IDLE;
let lastSearchError = "";

let backendTimer = null;
let backendSeq = 0;
let backendAbort = null;

const backendCache =
  new Map();

const metrics = {
  syncs: 0,
  mounts: 0,
  titleWrites: 0,
  visibilityWrites: 0,
  searches: 0,
  cacheHits: 0,
  backendRequests: 0,
  backendErrors: 0,
  backendAborts: 0,
};

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
    typeof value ===
      "object" &&
    !Array.isArray(value)
  );
}

function isFunction(value) {
  return (
    typeof value ===
    "function"
  );
}

function safeArray(value) {
  return (
    Array.isArray(value)
      ? value
      : []
  );
}

function cleanText(
  value = "",
  fallback = ""
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

  return (
    output ||
    fallback
  );
}

function first(...values) {
  for (
    const value
    of values
  ) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (
      typeof value ===
        "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      !value.length
    ) {
      continue;
    }

    if (
      isObject(value) &&
      !Object.keys(value)
        .length
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function normalizeText(
  value = ""
) {
  return cleanText(
    value,
    ""
  )
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase();
}

function normalizeCompact(
  value = ""
) {
  return normalizeText(
    value
  ).replace(
    /[^a-z0-9@._\-/#]/gi,
    ""
  );
}

function titleCase(
  value = ""
) {
  const clean =
    cleanText(
      value,
      ""
    );

  if (!clean) {
    return "";
  }

  return clean
    .replace(
      /^\/+/,
      ""
    )
    .replace(
      /^@[^/]+\/?/,
      ""
    )
    .replace(
      /-/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim()
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase()
    );
}

function uniqueBy(
  list = [],
  keyFn = (item) => item
) {
  const seen =
    new Set();

  const output = [];

  for (
    const item
    of safeArray(list)
  ) {
    const key =
      cleanText(
        keyFn(item),
        ""
      );

    if (
      !key ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    output.push(item);
  }

  return output;
}

function clampNumber(
  value,
  min,
  max,
  fallback = min
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return fallback;
  }

  return Math.min(
    Math.max(
      number,
      min
    ),
    max
  );
}

function truncate(
  value = "",
  max = 180
) {
  const text =
    cleanText(
      value,
      ""
    );

  if (
    text.length <=
    max
  ) {
    return text;
  }

  return (
    `${text.slice(
      0,
      Math.max(
        0,
        max - 1
      )
    )}…`
  );
}

function callMaybe(
  fn,
  ...args
) {
  if (
    !isFunction(fn)
  ) {
    return null;
  }

  try {
    return fn(
      ...args
    );
  } catch {
    return null;
  }
}

/* =========================================================
   SECURITY / PATHS
========================================================= */

function hasSensitiveQuery(
  value = ""
) {
  return (
    /[?&#](?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|token|code|secret|session|sessionId|session_id|password|pwd|key|sig|signature|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=/i.test(
      String(
        value ||
        ""
      )
    )
  );
}

function safeInternalPath(
  value = "",
  fallback = ""
) {
  const raw =
    cleanText(
      value,
      ""
    );

  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(
      raw
    ) ||
    /[\r\n\t\\]/.test(
      raw
    ) ||
    hasSensitiveQuery(
      raw
    )
  ) {
    return fallback;
  }

  const pathname =
    raw
      .split("#")[0]
      .split("?")[0];

  try {
    if (
      isBlockedRoutePath(
        pathname
      )
    ) {
      return fallback;
    }
  } catch {
    return fallback;
  }

  return raw;
}

function directRouteFromQuery(
  value = ""
) {
  const query =
    cleanText(
      value,
      ""
    );

  if (
    !query.startsWith(
      "/"
    )
  ) {
    return "";
  }

  return safeInternalPath(
    query,
    ""
  );
}

function encodeParam(
  value = ""
) {
  return encodeURIComponent(
    cleanText(
      value,
      ""
    )
  );
}

/* =========================================================
   CORE / ROLE / ROUTER
========================================================= */

function getCoreState() {
  try {
    if (
      isFunction(
        AppCore?.getState
      )
    ) {
      return (
        AppCore.getState() ||
        {}
      );
    }
  } catch {
    // fallback abajo
  }

  return (
    isObject(
      AppCore?.state
    )
      ? AppCore.state
      : {}
  );
}

function getCurrentUser(
  state =
    getCoreState()
) {
  try {
    return (
      AppCore
        .getCurrentUser
        ?.() ||
      state.user ||
      state.currentUser ||
      null
    );
  } catch {
    return (
      state.user ||
      state.currentUser ||
      null
    );
  }
}

function normalizeRoleList(
  value = []
) {
  const raw =
    Array.isArray(value)
      ? value.flat(
          Infinity
        )
      : cleanText(
          value,
          ""
        ).split(
          /[,\s|;]+/
        );

  return [
    ...new Set(
      raw
        .map(
          normalizeRole
        )
        .filter(Boolean)
    ),
  ];
}

function getCurrentRole(
  state =
    getCoreState(),
  user =
    getCurrentUser(state)
) {
  const roleGetter =
    isFunction(
      AppCore
        ?.getCurrentRole
    )
      ? AppCore
          .getCurrentRole
          .bind(AppCore)
      : null;

  const roles =
    normalizeRoleList([
      callMaybe(
        roleGetter
      ),

      state.role,
      state.rol,
      state.roles,

      user?.role,
      user?.rol,
      user?.roles,
    ]);

  if (
    user?.isAdmin ===
      true ||
    roles.includes(
      ROLE_ADMIN
    )
  ) {
    return ROLE_ADMIN;
  }

  if (
    roles.includes(
      ROLE_USER
    )
  ) {
    return ROLE_USER;
  }

  return ROLE_USER;
}

function isAdmin(
  state =
    getCoreState(),
  user =
    getCurrentUser(state)
) {
  return (
    getCurrentRole(
      state,
      user
    ) ===
    ROLE_ADMIN
  );
}

function getCurrentUserId(
  state =
    getCoreState(),
  user =
    getCurrentUser(state)
) {
  return cleanText(
    first(
      user?.userId,
      user?.uid,
      user?.id,
      user?.sub,
      state.userId,
      state.uid
    ),
    ""
  );
}

function getRouter(
  context = {}
) {
  try {
    return (
      context.Router ||
      context.router ||
      AppCore.router ||
      AppCore.Router ||
      AppCore
        .getModule
        ?.(
          "router"
        ) ||
      null
    );
  } catch {
    return null;
  }
}

async function navigateTo(
  path = "",
  meta = {}
) {
  const route =
    safeInternalPath(
      path,
      ""
    );

  if (!route) {
    return false;
  }

  const router =
    getRouter(
      lastOptions
    );

  if (
    !isFunction(
      router?.navigate
    )
  ) {
    return false;
  }

  const result =
    await router.navigate(
      route,
      {
        source:
          SOURCE,

        ...meta,
      }
    );

  return (
    result !== false
  );
}

/* =========================================================
   DOM HELPERS
========================================================= */

function byId(
  id = ""
) {
  if (
    !isBrowser() ||
    !id
  ) {
    return null;
  }

  return document
    .getElementById(
      id
    );
}

function clear(
  node = null
) {
  if (!node) {
    return false;
  }

  try {
    if (
      node.childNodes
        ?.length
    ) {
      node.replaceChildren();
    }

    return true;
  } catch {
    try {
      node.textContent =
        "";

      return true;
    } catch {
      return false;
    }
  }
}

function eventElement(
  target = null
) {
  if (!target) {
    return null;
  }

  return (
    target.nodeType === 3
      ? target.parentElement
      : target
  );
}

function contains(
  parent = null,
  child = null
) {
  try {
    return Boolean(
      parent &&
      child &&
      (
        parent === child ||
        parent.contains(child)
      )
    );
  } catch {
    return false;
  }
}

function getMount() {
  if (!isBrowser()) {
    return null;
  }

  return (
    byId(
      TOPBAR_MOUNT_ID
    ) ||
    byId(
      TOPBAR_ROOT_ID
    ) ||
    document.querySelector?.(
      "[data-topbar-mount]"
    ) ||
    document.querySelector?.(
      "[data-topbar-root]"
    ) ||
    null
  );
}

function getRefs() {
  return getTopbarTemplateRefs(
    root
  );
}

function setHidden(
  node = null,
  hidden = false
) {
  if (!node) {
    return false;
  }

  const value =
    hidden === true;

  let changed = false;

  try {
    if (
      node.hidden !==
      value
    ) {
      node.hidden =
        value;

      changed =
        true;
    }

    const aria =
      value
        ? "true"
        : "false";

    if (
      node.getAttribute(
        "aria-hidden"
      ) !==
      aria
    ) {
      node.setAttribute(
        "aria-hidden",
        aria
      );

      changed =
        true;
    }

    if (
      node.dataset
        ?.topbarVisible !==
      (
        value
          ? "false"
          : "true"
      )
    ) {
      node.dataset
        .topbarVisible =
        value
          ? "false"
          : "true";

      changed =
        true;
    }

    return changed;
  } catch {
    return false;
  }
}

function syncMountVisibility(
  hidden = false
) {
  const mount =
    byId(
      TOPBAR_MOUNT_ID
    );

  if (
    !mount ||
    mount === root
  ) {
    return false;
  }

  return setHidden(
    mount,
    hidden
  );
}

/*
  template.js crea inicialmente el dropdown dentro del form.
  Lo portamos al root para evitar clipping de overflow/transform.
*/
function portalSearchResultsToRoot() {
  const refs =
    getTopbarTemplateRefs(
      root
    );

  if (
    !refs.root ||
    !refs.searchResults
  ) {
    return false;
  }

  if (
    refs.searchResults
      .parentElement ===
    refs.root
  ) {
    return false;
  }

  refs.root.appendChild(
    refs.searchResults
  );

  return true;
}

function rootIsUsable(
  candidate = null
) {
  if (!candidate) {
    return false;
  }

  const refs =
    getTopbarTemplateRefs(
      candidate
    );

  return Boolean(
    refs.root &&
    refs.title &&
    refs.searchInput &&
    refs.searchResults
  );
}

function cacheDom() {
  const refs =
    getRefs();

  try {
    if (
      !isObject(
        AppCore.dom
      )
    ) {
      return false;
    }

    const mount =
      byId(
        TOPBAR_MOUNT_ID
      ) ||
      (
        refs.root
          ?.parentElement
          ?.id ===
        TOPBAR_MOUNT_ID
          ? refs.root
              .parentElement
          : null
      );

    AppCore.dom.topbar =
      refs.root;

    AppCore.dom.appTopbar =
      refs.root;

    AppCore.dom.topbarRoot =
      refs.root;

    AppCore.dom.topbarMount =
      mount;

    AppCore.dom.topbarTitle =
      refs.title;

    AppCore.dom.search =
      refs.search;

    AppCore.dom.searchForm =
      refs.search;

    AppCore.dom.searchInput =
      refs.searchInput;

    AppCore.dom.searchSubmit =
      refs.searchSubmit;

    AppCore.dom.searchResults =
      refs.searchResults;

    return true;
  } catch {
    return false;
  }
}

function clearDomCache() {
  try {
    if (
      !isObject(
        AppCore.dom
      )
    ) {
      return false;
    }

    for (
      const key
      of [
        "topbar",
        "appTopbar",
        "topbarRoot",
        "topbarMount",
        "topbarTitle",
        "search",
        "searchForm",
        "searchInput",
        "searchSubmit",
        "searchResults",
      ]
    ) {
      delete AppCore.dom[
        key
      ];
    }

    return true;
  } catch {
    return false;
  }
}

function mountRoot(
  nextRoot
) {
  const mount =
    getMount();

  if (
    !mount ||
    !nextRoot
  ) {
    return null;
  }

  unbindEvents();

  if (
    mount.matches?.(
      "[data-topbar-root], #app-topbar"
    )
  ) {
    clear(
      mount
    );

    for (
      const child
      of [
        ...nextRoot.childNodes,
      ]
    ) {
      mount.appendChild(
        child
      );
    }

    mount.className =
      nextRoot.className;

    for (
      const [
        key,
        value,
      ]
      of Object.entries(
        nextRoot.dataset ||
        {}
      )
    ) {
      mount.dataset[key] =
        value;
    }

    mount.setAttribute(
      "role",
      nextRoot.getAttribute(
        "role"
      ) ||
      "banner"
    );

    mount.setAttribute(
      "aria-label",
      nextRoot.getAttribute(
        "aria-label"
      ) ||
      "Barra superior"
    );

    mount.setAttribute(
      "aria-hidden",
      nextRoot.getAttribute(
        "aria-hidden"
      ) ||
      "false"
    );

    mount.hidden =
      nextRoot.hidden ===
      true;

    root =
      mount;
  } else {
    clear(
      mount
    );

    mount.appendChild(
      nextRoot
    );

    root =
      nextRoot;
  }

  portalSearchResultsToRoot();
  bindEvents();
  cacheDom();

  mounted = true;

  metrics.mounts +=
    1;

  return root;
}

function ensureRoot(
  options = {}
) {
  if (!isBrowser()) {
    return null;
  }

  const current =
    root ||
    byId(
      TOPBAR_ROOT_ID
    ) ||
    document.querySelector?.(
      "[data-topbar-root]"
    ) ||
    null;

  if (
    rootIsUsable(
      current
    )
  ) {
    root =
      current;

    portalSearchResultsToRoot();
    bindEvents();
    cacheDom();

    mounted =
      true;

    return root;
  }

  const topbar =
    createTopbarTemplate({
      id:
        TOPBAR_ROOT_ID,

      title:
        resolveRouteTitle(
          options
        ),

      visible:
        options.visible ===
        true,

      search:
        options.search !==
        false,

      searchOptions: {
        placeholder:
          "Buscar facturas, tickets, clientes…",

        ...(
          options.searchOptions ||
          {}
        ),
      },
    });

  return mountRoot(
    topbar
  );
}

/* =========================================================
   ROUTE TITLE / VISIBILITY
========================================================= */

function currentPath() {
  const state =
    getCoreState();

  if (
    state.canonicalPath ||
    state.route ||
    state.path
  ) {
    return cleanText(
      state.canonicalPath ||
      state.route ||
      state.path,
      "/"
    );
  }

  if (!isBrowser()) {
    return "/";
  }

  return cleanText(
    window.location
      .pathname ||
    "/",
    "/"
  );
}

function resolveTitleFromPath(
  path = "/"
) {
  const clean =
    cleanText(
      path,
      "/"
    )
      .split("?")[0]
      .split("#")[0];

  if (
    clean === "/" ||
    clean.startsWith(
      "/@"
    )
  ) {
    const parts =
      clean
        .split("/")
        .filter(Boolean);

    if (
      parts.length <= 1
    ) {
      return "Inicio";
    }

    return (
      titleCase(
        parts[1]
      ) ||
      "Inicio"
    );
  }

  return (
    titleCase(
      clean
    ) ||
    "Inicio"
  );
}

function resolveRouteTitle(
  options = {}
) {
  const route =
    options.route ||
    null;

  if (
    route?.title
  ) {
    return (
      `${APP_TITLE_PREFIX} ${cleanText(
        route.title
      )}`
    );
  }

  if (
    route?.name
  ) {
    return (
      `${APP_TITLE_PREFIX} ${titleCase(
        route.name
      )}`
    );
  }

  const path =
    options.canonicalPath ||
    options.path ||
    options.publicPath ||
    currentPath();

  return (
    `${APP_TITLE_PREFIX} ${resolveTitleFromPath(
      path
    )}`
  );
}

function syncTitle(
  options = {}
) {
  if (
    !ensureRoot(
      options
    )
  ) {
    return false;
  }

  const title =
    resolveRouteTitle(
      options
    );

  const refs =
    getRefs();

  if (
    title ===
      lastTitle &&
    refs.title
      ?.textContent ===
      title
  ) {
    return false;
  }

  const changed =
    setTopbarTemplateTitle(
      root,
      title
    );

  if (changed) {
    lastTitle =
      title;

    metrics.titleWrites +=
      1;
  }

  return changed;
}

function shouldHide(
  options = {}
) {
  const route =
    options.route ||
    null;

  const state =
    getCoreState();

  return Boolean(
    route?.public === true ||
    route?.hideShell === true ||
    route?.layout ===
      "auth" ||
    options.routeMode ===
      "auth" ||
    options.chrome ===
      "hidden" ||
    state.routeMode ===
      "auth" ||
    state.chromeHidden ===
      true ||
    state.chrome ===
      "hidden"
  );
}

function syncVisibility(
  options = {}
) {
  if (
    !ensureRoot(
      options
    )
  ) {
    return false;
  }

  const hidden =
    shouldHide(
      options
    );

  const refs =
    getRefs();

  const already =
    lastHidden ===
      hidden &&
    refs.root
      ?.hidden ===
      hidden;

  if (!already) {
    setTopbarTemplateVisible(
      root,
      !hidden
    );

    syncMountVisibility(
      hidden
    );

    lastHidden =
      hidden;

    metrics.visibilityWrites +=
      1;
  }

  if (
    hidden &&
    (
      !already ||
      lastSearchQuery ||
      latestSearchResults.length ||
      backendTimer ||
      backendAbort
    )
  ) {
    clearSearch({
      input: true,
      focus: false,
    });
  }

  return !already;
}

/* =========================================================
   BACKEND SEARCH CONFIG
========================================================= */

function getCoreConfig() {
  const state =
    getCoreState();

  return {
    ...(
      isObject(
        AppCore.config
      )
        ? AppCore.config
        : {}
    ),

    ...(
      isObject(
        state.config
      )
        ? state.config
        : {}
    ),
  };
}

function resolveSearchEndpoint(
  options = {}
) {
  const config =
    getCoreConfig();

  const endpoint =
    cleanText(
      first(
        options.searchEndpoint,
        options.searchUrl,
        options.searchApiUrl,
        config.searchEndpoint,
        config.searchUrl,
        config.searchApiUrl,
        SEARCH_ENDPOINT_DEFAULT
      ),
      SEARCH_ENDPOINT_DEFAULT
    );

  if (
    endpoint.startsWith("/")
  ) {
    const pathname =
      endpoint
        .split("?")[0]
        .split("#")[0];

    /*
      Search debe vivir en la API.
      No permitimos que UI convierta cualquier ruta frontend en endpoint.
    */
    return (
      pathname === "/api" ||
      pathname.startsWith(
        "/api/"
      )
        ? endpoint
        : SEARCH_ENDPOINT_DEFAULT
    );
  }

  if (
    /^https?:\/\//i.test(
      endpoint
    )
  ) {
    /*
      core/http.js valida el origin backend.
    */
    return endpoint;
  }

  return SEARCH_ENDPOINT_DEFAULT;
}

function buildSearchQuery(
  query = "",
  options = {}
) {
  const output = {
    q:
      cleanText(
        query,
        ""
      ),

    limit:
      clampNumber(
        options.limit,
        1,
        20,
        BACKEND_LIMIT
      ),

    includeClosed:
      true,

    source:
      SOURCE,
  };

  const extra =
    isObject(
      options.searchParams
    )
      ? options.searchParams
      : (
          isObject(
            options.params
          )
            ? options.params
            : {}
        );

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      extra
    )
  ) {
    if (
      !key ||
      value === undefined ||
      value === null ||
      value === ""
    ) {
      continue;
    }

    /*
      Nunca dejamos que opciones externas sustituyan los parámetros
      contractuales de la búsqueda.
    */
    if (
      [
        "q",
        "limit",
        "source",
      ].includes(key)
    ) {
      continue;
    }

    output[key] =
      value;
  }

  return output;
}

/* =========================================================
   CACHE
========================================================= */

function buildCacheKey(
  query = "",
  options = {}
) {
  const state =
    getCoreState();

  const user =
    getCurrentUser(
      state
    );

  return [
    normalizeText(
      query
    ),

    resolveSearchEndpoint(
      options
    ),

    getCurrentRole(
      state,
      user
    ),

    getCurrentUserId(
      state,
      user
    ),
  ].join("|");
}

function getCachedResults(
  query = "",
  options = {}
) {
  const key =
    buildCacheKey(
      query,
      options
    );

  const entry =
    backendCache.get(
      key
    );

  if (!entry) {
    return null;
  }

  if (
    Date.now() -
      entry.at >
    BACKEND_CACHE_TTL_MS
  ) {
    backendCache.delete(
      key
    );

    return null;
  }

  /*
    LRU ligero.
  */
  backendCache.delete(
    key
  );

  backendCache.set(
    key,
    entry
  );

  metrics.cacheHits +=
    1;

  return [
    ...safeArray(
      entry.results
    ),
  ];
}

function setCachedResults(
  query = "",
  results = [],
  options = {}
) {
  const key =
    buildCacheKey(
      query,
      options
    );

  backendCache.delete(
    key
  );

  backendCache.set(
    key,
    {
      at:
        Date.now(),

      results:
        [
          ...safeArray(
            results
          ),
        ],
    }
  );

  while (
    backendCache.size >
    BACKEND_CACHE_MAX
  ) {
    const oldest =
      backendCache
        .keys()
        .next()
        .value;

    backendCache.delete(
      oldest
    );
  }

  return true;
}

function clearSearchCache() {
  backendCache.clear();

  return true;
}

/* =========================================================
   LOCAL SEARCH INDEX
========================================================= */

function normalizeResultType(
  value = ""
) {
  const raw =
    normalizeCompact(
      value
    );

  const map = {
    nav:
      RESULT_TYPES.NAV,

    route:
      RESULT_TYPES.NAV,

    ruta:
      RESULT_TYPES.NAV,

    settings:
      RESULT_TYPES.SETTINGS,

    setting:
      RESULT_TYPES.SETTINGS,

    ajustes:
      RESULT_TYPES.SETTINGS,

    ajuste:
      RESULT_TYPES.SETTINGS,

    cliente:
      RESULT_TYPES.CLIENTE,

    clientes:
      RESULT_TYPES.CLIENTE,

    client:
      RESULT_TYPES.CLIENTE,

    clients:
      RESULT_TYPES.CLIENTE,

    empresa:
      RESULT_TYPES.CLIENTE,

    user:
      RESULT_TYPES.USER,

    users:
      RESULT_TYPES.USER,

    usuario:
      RESULT_TYPES.USER,

    usuarios:
      RESULT_TYPES.USER,

    profile:
      RESULT_TYPES.USER,

    perfil:
      RESULT_TYPES.USER,

    cuenta:
      RESULT_TYPES.USER,

    factura:
      RESULT_TYPES.FACTURA,

    facturas:
      RESULT_TYPES.FACTURA,

    invoice:
      RESULT_TYPES.FACTURA,

    invoices:
      RESULT_TYPES.FACTURA,

    bill:
      RESULT_TYPES.FACTURA,

    billing:
      RESULT_TYPES.FACTURA,

    incidencia:
      RESULT_TYPES.INCIDENCIA,

    incidencias:
      RESULT_TYPES.INCIDENCIA,

    ticket:
      RESULT_TYPES.INCIDENCIA,

    tickets:
      RESULT_TYPES.INCIDENCIA,

    issue:
      RESULT_TYPES.INCIDENCIA,

    support:
      RESULT_TYPES.INCIDENCIA,

    soporte:
      RESULT_TYPES.INCIDENCIA,

    hardware:
      RESULT_TYPES.HARDWARE,

    device:
      RESULT_TYPES.HARDWARE,

    devices:
      RESULT_TYPES.HARDWARE,
  };

  return (
    map[raw] ||
    RESULT_TYPES.GENERAL
  );
}

function normalizeSearchItem(
  item = {},
  order = 0
) {
  const source =
    isObject(item)
      ? item
      : {};

  const route =
    safeInternalPath(
      source.route ||
      source.href ||
      source.path ||
      "",
      ""
    );

  return {
    key:
      cleanText(
        source.key ||
        source.id ||
        source.label ||
        route,
        route
      ),

    id:
      cleanText(
        source.id ||
        source.key ||
        source.label ||
        route,
        route
      ),

    label:
      cleanText(
        source.label ||
        source.title ||
        source.name,
        route
      ),

    title:
      cleanText(
        source.title ||
        source.label ||
        source.name,
        route
      ),

    description:
      cleanText(
        source.description ||
        source.subtitle ||
        source.text,
        ""
      ),

    subtitle:
      cleanText(
        source.subtitle ||
        source.description ||
        source.text,
        ""
      ),

    route,
    href:
      route,

    icon:
      cleanText(
        source.icon,
        ""
      )
        .slice(
          0,
          2
        )
        .toUpperCase(),

    type:
      normalizeResultType(
        source.type ||
        RESULT_TYPES.NAV
      ),

    keywords:
      safeArray(
        source.keywords
      )
        .map(
          (value) =>
            cleanText(
              value,
              ""
            )
        )
        .filter(Boolean),

    adminOnly:
      source.adminOnly ===
        true ||
      source.requiresAdmin ===
        true,

    hidden:
      source.hidden ===
        true ||
      !route,

    order,

    source:
      "local",
  };
}

function routeSearchItem(
  route = {},
  order = 0
) {
  const viewKey =
    cleanText(
      route.viewKey ||
      route.name ||
      "",
      ""
    );

  const meta =
    LOCAL_ROUTE_META[
      viewKey
    ] ||
    {};

  return normalizeSearchItem(
    {
      key:
        viewKey ||
        route.name ||
        route.path,

      id:
        viewKey ||
        route.name ||
        route.path,

      label:
        route.title ||
        route.name ||
        route.path,

      title:
        route.title ||
        route.name ||
        route.path,

      description:
        meta.description ||
        "",

      route:
        route.path,

      icon:
        meta.icon ||
        "",

      type:
        meta.type ||
        RESULT_TYPES.NAV,

      keywords:
        meta.keywords ||
        [],

      adminOnly:
        route.adminOnly ===
          true ||
        route.requiresAdmin ===
          true,

      hidden:
        route.public ===
          true ||
        route.hideShell ===
          true,
    },
    order
  );
}

function coreSearchItems(
  options = {}
) {
  const state =
    getCoreState();

  const router =
    getRouter(
      options
    );

  return [
    ...safeArray(
      options.searchItems
    ),

    ...safeArray(
      options.topbarSearchItems
    ),

    ...safeArray(
      state.searchItems
    ),

    ...safeArray(
      state.topbarSearchItems
    ),

    ...safeArray(
      AppCore.searchItems
    ),

    ...safeArray(
      AppCore.topbarSearchItems
    ),

    ...safeArray(
      router?.searchItems
    ),

    ...safeArray(
      router?.topbarSearchItems
    ),
  ];
}

function buildSearchIndex(
  options = {}
) {
  const state =
    getCoreState();

  const user =
    getCurrentUser(
      state
    );

  const admin =
    isAdmin(
      state,
      user
    );

  const routeItems =
    getImmutableRoutes()
      .filter(
        (route) =>
          route.public !==
            true &&
          route.hideShell !==
            true &&
          route.searchable !==
            false
      )
      .map(
        routeSearchItem
      );

  const custom =
    coreSearchItems(
      options
    ).map(
      (
        item,
        index
      ) =>
        normalizeSearchItem(
          item,
          routeItems.length +
            index
        )
    );

  return uniqueBy(
    [
      ...routeItems,
      ...custom,
    ],
    (item) =>
      `${item.route}:${item.label}`
  )
    .filter(
      (item) => {
        if (
          item.hidden
        ) {
          return false;
        }

        if (
          item.adminOnly &&
          !admin
        ) {
          return false;
        }

        return true;
      }
    );
}

function scoreSearchItem(
  item = {},
  query = ""
) {
  const q =
    normalizeText(
      query
    );

  if (!q) {
    return 0;
  }

  const tokens =
    q
      .split(
        /\s+/
      )
      .filter(Boolean);

  const label =
    normalizeText(
      item.label
    );

  const route =
    normalizeText(
      item.route
    );

  const description =
    normalizeText(
      item.description
    );

  const keywords =
    normalizeText(
      safeArray(
        item.keywords
      ).join(" ")
    );

  const haystack =
    [
      label,
      route,
      description,
      keywords,
    ].join(" ");

  let score = 0;

  if (
    label === q
  ) {
    score += 160;
  }

  if (
    route === q
  ) {
    score += 150;
  }

  if (
    label.startsWith(q)
  ) {
    score += 100;
  }

  if (
    route.startsWith(q)
  ) {
    score += 82;
  }

  if (
    label.includes(q)
  ) {
    score += 64;
  }

  if (
    route.includes(q)
  ) {
    score += 46;
  }

  if (
    keywords.includes(q)
  ) {
    score += 42;
  }

  if (
    description.includes(q)
  ) {
    score += 22;
  }

  const tokenHits =
    tokens.filter(
      (token) =>
        haystack.includes(
          token
        )
    ).length;

  if (
    tokens.length &&
    tokenHits ===
      tokens.length
  ) {
    score += 34;
  } else {
    score +=
      tokenHits * 11;
  }

  return score;
}

function directRouteResult(
  query = ""
) {
  const route =
    directRouteFromQuery(
      query
    );

  if (!route) {
    return null;
  }

  return {
    key:
      `route:${route}`,

    id:
      `route:${route}`,

    label:
      `Ir a ${route}`,

    title:
      `Ir a ${route}`,

    description:
      "Ruta directa",

    subtitle:
      "Ruta directa",

    route,
    href:
      route,

    icon:
      "→",

    type:
      RESULT_TYPES.NAV,

    keywords:
      [],

    adminOnly:
      false,

    hidden:
      false,

    order:
      -1,

    score:
      999,

    source:
      "local",
  };
}

function searchLocalTopbar(
  query = "",
  options = {}
) {
  const q =
    cleanText(
      query,
      ""
    );

  if (!q) {
    return [];
  }

  const direct =
    directRouteResult(
      q
    );

  const index =
    buildSearchIndex(
      options
    )
      .map(
        (item) => ({
          ...item,

          score:
            scoreSearchItem(
              item,
              q
            ),
        })
      )
      .filter(
        (item) =>
          item.score >
          0
      )
      .sort(
        (a, b) => {
          if (
            b.score !==
            a.score
          ) {
            return (
              b.score -
              a.score
            );
          }

          return (
            a.order -
            b.order
          );
        }
      );

  const results =
    direct
      ? [
          direct,
          ...index,
        ]
      : index;

  return uniqueBy(
    results,
    (item) =>
      item.route
  ).slice(
    0,
    SEARCH_LIMIT
  );
}

/* =========================================================
   BACKEND RESULT NORMALIZATION
========================================================= */

function extractBackendResults(
  payload
) {
  if (
    Array.isArray(
      payload
    )
  ) {
    return payload;
  }

  const data =
    isObject(payload)
      ? payload
      : {};

  const nested =
    isObject(
      data.data
    )
      ? data.data
      : {};

  return safeArray(
    first(
      data.results,
      data.items,
      data.resources,
      data.matches,
      data.searchResults,

      nested.results,
      nested.items,
      nested.resources,
      nested.matches,
      nested.searchResults,

      []
    )
  );
}

function getResultId(
  item = {}
) {
  return cleanText(
    first(
      item.entityId,
      item.facturaId,
      item.invoiceId,
      item.ticketId,
      item.incidenciaId,
      item.clienteId,
      item.clientId,
      item.userId,
      item.usuarioId,
      item.id,
      item.key
    ),
    ""
  );
}

function iconForResult(
  item = {},
  type =
    RESULT_TYPES.GENERAL
) {
  const icon =
    cleanText(
      item.icon ||
      item.avatarInitials ||
      "",
      ""
    )
      .slice(
        0,
        2
      )
      .toUpperCase();

  if (icon) {
    return icon;
  }

  return (
    TYPE_ICON[type] ||
    TYPE_ICON[
      RESULT_TYPES.GENERAL
    ]
  );
}

function routeFromBackendResult(
  item = {},
  context = {}
) {
  const type =
    normalizeResultType(
      first(
        item.type,
        item.entity,
        item.kind,
        item.entityType
      )
    );

  const direct =
    safeInternalPath(
      first(
        item.route,
        item.href,
        item.url,
        item.path,
        item.to
      ),
      ""
    );

  if (direct) {
    if (
      !context.admin &&
      type ===
        RESULT_TYPES.USER &&
      direct.startsWith(
        "/usuarios"
      )
    ) {
      return "/cuenta";
    }

    if (
      !context.admin &&
      type ===
        RESULT_TYPES.CLIENTE &&
      direct.startsWith(
        "/clientes"
      )
    ) {
      return "";
    }

    return direct;
  }

  const action =
    normalizeCompact(
      item.action ||
      item.openAction ||
      item.searchAction
    );

  const entityId =
    getResultId(
      item
    );

  const raw =
    isObject(
      item.raw
    )
      ? item.raw
      : {};

  const payload =
    isObject(
      item.payload
    )
      ? item.payload
      : {};

  const facturaId =
    cleanText(
      first(
        item.facturaId,
        item.invoiceId,
        raw.facturaId,
        raw.invoiceId,
        payload.facturaId,
        payload.invoiceId,
        entityId
      ),
      ""
    );

  const ticketId =
    cleanText(
      first(
        item.ticketId,
        item.incidenciaId,
        raw.ticketId,
        raw.incidenciaId,
        payload.ticketId,
        payload.incidenciaId,
        entityId
      ),
      ""
    );

  const clienteId =
    cleanText(
      first(
        item.clienteId,
        item.clientId,
        raw.clienteId,
        raw.clientId,
        payload.clienteId,
        payload.clientId,
        entityId
      ),
      ""
    );

  const userId =
    cleanText(
      first(
        item.userId,
        item.usuarioId,
        raw.userId,
        raw.usuarioId,
        payload.userId,
        payload.usuarioId,
        entityId
      ),
      ""
    );

  if (
    type ===
      RESULT_TYPES.FACTURA ||
    action.includes(
      "factura"
    )
  ) {
    return facturaId
      ? `/facturas?factura=${encodeParam(
          facturaId
        )}`
      : "/facturas";
  }

  if (
    type ===
      RESULT_TYPES.INCIDENCIA ||
    action.includes(
      "incidencia"
    ) ||
    action.includes(
      "ticket"
    )
  ) {
    return ticketId
      ? `/incidencias?ticket=${encodeParam(
          ticketId
        )}`
      : "/incidencias";
  }

  if (
    type ===
      RESULT_TYPES.CLIENTE ||
    action.includes(
      "cliente"
    )
  ) {
    if (!context.admin) {
      return "";
    }

    return clienteId
      ? `/clientes?cliente=${encodeParam(
          clienteId
        )}`
      : "/clientes";
  }

  if (
    type ===
      RESULT_TYPES.USER ||
    action.includes(
      "usuario"
    ) ||
    action.includes(
      "user"
    )
  ) {
    if (!context.admin) {
      return "/cuenta";
    }

    if (
      userId &&
      context.currentUserId &&
      normalizeCompact(
        userId
      ) ===
      normalizeCompact(
        context.currentUserId
      )
    ) {
      return "/cuenta";
    }

    return userId
      ? `/usuarios?usuario=${encodeParam(
          userId
        )}`
      : "/usuarios";
  }

  if (
    type ===
    RESULT_TYPES.SETTINGS
  ) {
    return "/ajustes";
  }

  return "";
}

function normalizeBackendResult(
  item = {},
  order = 0,
  context = {}
) {
  const source =
    isObject(item)
      ? item
      : {};

  const raw =
    isObject(
      source.raw
    )
      ? source.raw
      : {};

  const payload =
    isObject(
      source.payload
    )
      ? source.payload
      : {};

  const type =
    normalizeResultType(
      first(
        source.type,
        source.entity,
        source.kind,
        source.entityType,
        raw.type,
        raw.entity
      )
    );

  const entityId =
    getResultId(
      source
    );

  const label =
    cleanText(
      first(
        source.label,
        source.title,
        source.name,
        source.displayName,
        raw.title,
        raw.name,
        raw.displayName,
        entityId
      ),
      "Resultado"
    );

  const description =
    truncate(
      cleanText(
        first(
          source.description,
          source.subtitle,
          source.text,
          raw.subtitle,
          raw.description,
          raw.status,
          payload.status
        ),
        ""
      ),
      180
    );

  const route =
    routeFromBackendResult(
      source,
      context
    );

  if (!route) {
    return null;
  }

  const id =
    cleanText(
      first(
        source.id,
        source.key,
        `${type}:${entityId || label}:${order}`
      ),
      `${type}:${entityId || label}:${order}`
    );

  const score =
    Number.isFinite(
      Number(
        source.score
      )
    )
      ? Number(
          source.score
        )
      : (
          Number.isFinite(
            Number(
              source._score
            )
          )
            ? Number(
                source._score
              )
            : 0
        );

  /*
    Deliberadamente NO devolvemos source.raw/source.payload/source backend.
    El topbar sólo necesita un view-model mínimo.
  */
  return {
    key:
      id,

    id,

    label,
    title:
      label,

    description,
    subtitle:
      description,

    route,
    href:
      route,

    path:
      route,

    icon:
      iconForResult(
        source,
        type
      ),

    type,
    kind:
      type,

    entityId,

    action:
      cleanText(
        source.action ||
        source.openAction ||
        source.searchAction,
        ""
      ),

    score,
    order,

    source:
      "backend",
  };
}

function mergeResults(
  query = "",
  backendResults = [],
  localResults = []
) {
  const direct =
    directRouteResult(
      query
    );

  const combined = [
    ...(
      direct
        ? [direct]
        : []
    ),

    ...safeArray(
      backendResults
    ),

    ...safeArray(
      localResults
    ),
  ];

  return uniqueBy(
    combined,
    (item) => {
      const route =
        safeInternalPath(
          item.route,
          ""
        );

      const entityKey =
        [
          normalizeResultType(
            item.type
          ),

          normalizeCompact(
            item.entityId ||
            item.id ||
            item.key ||
            ""
          ),
        ].join(":");

      return (
        route ||
        entityKey ||
        normalizeText(
          item.label ||
          item.title ||
          ""
        )
      );
    }
  ).slice(
    0,
    SEARCH_LIMIT
  );
}

/* =========================================================
   REMOTE SEARCH
========================================================= */

function abortBackendSearch() {
  if (
    backendTimer
  ) {
    clearTimeout(
      backendTimer
    );

    backendTimer =
      null;
  }

  if (
    backendAbort
  ) {
    try {
      if (
        !backendAbort
          .signal
          .aborted
      ) {
        backendAbort.abort(
          "topbar-search-superseded"
        );

        metrics.backendAborts +=
          1;
      }
    } catch {
      try {
        backendAbort.abort();
      } catch {
        // noop
      }
    }
  }

  backendAbort =
    null;

  return true;
}

async function fetchBackendResults(
  query = "",
  options = {}
) {
  const clean =
    cleanText(
      query,
      ""
    );

  if (!clean) {
    return [];
  }

  const controller =
    typeof AbortController !==
      "undefined"
      ? new AbortController()
      : null;

  const externalSignal =
    options.signal ||
    null;

  let externalAbortListener =
    null;

  if (
    controller &&
    externalSignal
  ) {
    if (
      externalSignal.aborted
    ) {
      try {
        controller.abort(
          externalSignal.reason
        );
      } catch {
        controller.abort();
      }
    } else if (
      isFunction(
        externalSignal.addEventListener
      )
    ) {
      externalAbortListener =
        () => {
          try {
            controller.abort(
              externalSignal.reason
            );
          } catch {
            try {
              controller.abort();
            } catch {
              // noop
            }
          }
        };

      externalSignal.addEventListener(
        "abort",
        externalAbortListener,
        {
          once: true,
        }
      );
    }
  }

  backendAbort =
    controller;

  const state =
    getCoreState();

  const user =
    getCurrentUser(
      state
    );

  const context = {
    admin:
      isAdmin(
        state,
        user
      ),

    currentUserId:
      getCurrentUserId(
        state,
        user
      ),
  };

  metrics.backendRequests +=
    1;

  try {
    const payload =
      await Http.get(
        resolveSearchEndpoint(
          options
        ),
        {
          auth: true,

          query:
            buildSearchQuery(
              clean,
              options
            ),

          timeout:
            clampNumber(
              options.timeoutMs ??
              options.timeout,
              1500,
              30_000,
              BACKEND_TIMEOUT_MS
            ),

          signal:
            controller
              ?.signal ||
            options.signal ||
            null,

          source:
            SOURCE,
        }
      );

    return extractBackendResults(
      payload
    )
      .map(
        (
          item,
          index
        ) =>
          normalizeBackendResult(
            item,
            index,
            context
          )
      )
      .filter(Boolean);
  } finally {
    if (
      externalSignal &&
      externalAbortListener &&
      isFunction(
        externalSignal.removeEventListener
      )
    ) {
      try {
        externalSignal.removeEventListener(
          "abort",
          externalAbortListener
        );
      } catch {
        // noop
      }
    }

    if (
      backendAbort ===
      controller
    ) {
      backendAbort =
        null;
    }
  }
}

/* =========================================================
   SEARCH RENDER STATE
========================================================= */

function setActiveSearch(
  index = 0
) {
  if (
    !latestSearchResults
      .length
  ) {
    activeSearchIndex =
      -1;

    getRefs()
      .searchInput
      ?.removeAttribute?.(
        "aria-activedescendant"
      );

    return false;
  }

  activeSearchIndex =
    Math.max(
      0,
      Math.min(
        Number(index) ||
        0,
        latestSearchResults
          .length - 1
      )
    );

  setTopbarSearchActiveIndex(
    root,
    activeSearchIndex
  );

  return true;
}

function renderSearchState(
  query = "",
  results = [],
  options = {}
) {
  portalSearchResultsToRoot();

  const clean =
    cleanText(
      query,
      ""
    );

  const status =
    cleanText(
      options.status,
      SEARCH_STATUS.READY
    );

  const error =
    cleanText(
      options.error,
      ""
    );

  latestSearchResults =
    clean
      ? [
          ...safeArray(
            results
          ),
        ]
      : [];

  activeSearchIndex =
    latestSearchResults
      .length
      ? Math.min(
          Math.max(
            0,
            activeSearchIndex
          ),
          latestSearchResults
            .length - 1
        )
      : -1;

  lastSearchQuery =
    clean;

  lastSearchStatus =
    status;

  lastSearchError =
    error;

  if (!clean) {
    clearTopbarSearchResults(
      root
    );

    return true;
  }

  renderTopbarSearchResults(
    root,
    latestSearchResults,
    {
      query:
        clean,

      activeIndex:
        activeSearchIndex >=
          0
          ? activeSearchIndex
          : 0,

      status,
      error,

      source:
        SOURCE,
    }
  );

  if (
    latestSearchResults
      .length
  ) {
    setActiveSearch(
      activeSearchIndex >=
        0
        ? activeSearchIndex
        : 0
    );
  }

  return true;
}

async function executeSearch(
  query = "",
  options = {}
) {
  const clean =
    cleanText(
      query,
      ""
    );

  const seq =
    ++backendSeq;

  metrics.searches +=
    1;

  if (!clean) {
    abortBackendSearch();

    renderSearchState(
      "",
      [],
      {
        status:
          SEARCH_STATUS.IDLE,
      }
    );

    return [];
  }

  const effectiveOptions = {
    ...lastOptions,
    ...options,
  };

  const localResults =
    searchLocalTopbar(
      clean,
      effectiveOptions
    );

  const cached =
    options.force !==
      true
      ? getCachedResults(
          clean,
          effectiveOptions
        )
      : null;

  if (cached) {
    const merged =
      mergeResults(
        clean,
        cached,
        localResults
      );

    renderSearchState(
      clean,
      merged,
      {
        status:
          merged.length
            ? SEARCH_STATUS.READY
            : SEARCH_STATUS.EMPTY,
      }
    );

    return merged;
  }

  abortBackendSearch();

  renderSearchState(
    clean,
    mergeResults(
      clean,
      [],
      localResults
    ),
    {
      status:
        SEARCH_STATUS.LOADING,
    }
  );

  try {
    const remoteResults =
      await fetchBackendResults(
        clean,
        effectiveOptions
      );

    if (
      seq !==
      backendSeq
    ) {
      return [];
    }

    const currentQuery =
      cleanText(
        getRefs()
          .searchInput
          ?.value ||
        "",
        ""
      );

    if (
      currentQuery !==
        clean &&
      options.force !==
        true
    ) {
      return [];
    }

    setCachedResults(
      clean,
      remoteResults,
      effectiveOptions
    );

    const merged =
      mergeResults(
        clean,
        remoteResults,
        localResults
      );

    renderSearchState(
      clean,
      merged,
      {
        status:
          merged.length
            ? SEARCH_STATUS.READY
            : SEARCH_STATUS.EMPTY,
      }
    );

    return merged;
  } catch (error) {
    if (
      seq !==
      backendSeq
    ) {
      return [];
    }

    const code =
      cleanText(
        error?.code,
        ""
      );

    if (
      code ===
        "HTTP_ABORTED" ||
      code ===
        "HTTP_TIMEOUT"
    ) {
      /*
        Timeout sí puede mostrar fallback local.
        Abort por superseded normalmente ya quedó stale por backendSeq.
      */
      if (
        code ===
        "HTTP_ABORTED"
      ) {
        return latestSearchResults;
      }
    }

    metrics.backendErrors +=
      1;

    const fallback =
      mergeResults(
        clean,
        [],
        localResults
      );

    const message =
      cleanText(
        error?.message ||
        "No se pudo completar la búsqueda.",
        "No se pudo completar la búsqueda."
      );

    renderSearchState(
      clean,
      fallback,
      {
        status:
          fallback.length
            ? SEARCH_STATUS.READY
            : SEARCH_STATUS.ERROR,

        error:
          message,
      }
    );

    return [
      ...latestSearchResults,
    ];
  }
}

function scheduleSearch(
  query = "",
  options = {}
) {
  const clean =
    cleanText(
      query,
      ""
    );

  lastSearchQuery =
    clean;

  if (
    backendTimer
  ) {
    clearTimeout(
      backendTimer
    );

    backendTimer =
      null;
  }

  if (!clean) {
    abortBackendSearch();

    renderSearchState(
      "",
      [],
      {
        status:
          SEARCH_STATUS.IDLE,
      }
    );

    return true;
  }

  const effectiveOptions = {
    ...lastOptions,
    ...options,
  };

  const localResults =
    searchLocalTopbar(
      clean,
      effectiveOptions
    );

  const cached =
    options.force !==
      true
      ? getCachedResults(
          clean,
          effectiveOptions
        )
      : null;

  if (cached) {
    renderSearchState(
      clean,
      mergeResults(
        clean,
        cached,
        localResults
      ),
      {
        status:
          SEARCH_STATUS.READY,
      }
    );

    /*
      Cache válida = no programamos una request redundante.
    */
    return true;
  }

  renderSearchState(
    clean,
    mergeResults(
      clean,
      [],
      localResults
    ),
    {
      status:
        SEARCH_STATUS.LOADING,
    }
  );

  backendTimer =
    setTimeout(
      () => {
        backendTimer =
          null;

        void executeSearch(
          clean,
          options
        );
      },
      options.immediate ===
        true
        ? 0
        : BACKEND_DEBOUNCE_MS
    );

  return true;
}

function moveActiveSearch(
  delta = 0
) {
  if (
    !latestSearchResults
      .length
  ) {
    return false;
  }

  return setActiveSearch(
    activeSearchIndex +
    delta
  );
}

function dispatchSearchOpenEvent(
  item = {}
) {
  if (!isBrowser()) {
    return false;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(
        "topbar:search:open",
        {
          detail: {
            source:
              SOURCE,

            query:
              lastSearchQuery,

            result: {
              key:
                item.key ||
                "",

              route:
                item.route ||
                "",

              type:
                item.type ||
                "",

              entityId:
                item.entityId ||
                "",

              source:
                item.source ||
                "",
            },
          },
        }
      )
    );

    return true;
  } catch {
    return false;
  }
}

async function openSearchResult(
  result = null
) {
  const item =
    result ||
    latestSearchResults[
      activeSearchIndex
    ] ||
    latestSearchResults[0];

  if (
    !item?.route
  ) {
    return false;
  }

  dispatchSearchOpenEvent(
    item
  );

  const ok =
    await navigateTo(
      item.route,
      {
        query:
          lastSearchQuery,

        result:
          item.key ||
          item.label ||
          item.route,

        resultType:
          item.type ||
          "",

        entityId:
          item.entityId ||
          "",

        action:
          item.action ||
          "",
      }
    );

  if (ok) {
    clearSearch({
      input: true,
      focus: false,
    });

    getRefs()
      .searchInput
      ?.blur?.();
  }

  return ok;
}

function clearSearch(
  options = {}
) {
  const opts =
    isObject(options)
      ? options
      : {};

  const refs =
    getRefs();

  abortBackendSearch();

  backendSeq +=
    1;

  latestSearchResults =
    [];

  activeSearchIndex =
    -1;

  lastSearchQuery =
    "";

  lastSearchStatus =
    SEARCH_STATUS.IDLE;

  lastSearchError =
    "";

  clearTopbarSearchResults(
    root
  );

  refs.search
    ?.classList
    ?.remove?.(
      "is-search-open"
    );

  refs.root
    ?.classList
    ?.remove?.(
      "is-search-focused"
    );

  if (
    opts.input ===
      true &&
    refs.searchInput
  ) {
    refs.searchInput.value =
      "";
  }

  if (
    opts.focus ===
    true
  ) {
    try {
      refs.searchInput
        ?.focus?.({
          preventScroll:
            true,
        });
    } catch {
      refs.searchInput
        ?.focus?.();
    }
  }

  return true;
}

/* =========================================================
   LOCAL EVENTS
========================================================= */

async function onSubmit(
  event
) {
  event.preventDefault();

  const refs =
    getRefs();

  const query =
    cleanText(
      refs.searchInput
        ?.value ||
      "",
      ""
    );

  if (!query) {
    clearSearch({
      input: true,
      focus: true,
    });

    return;
  }

  if (
    !latestSearchResults
      .length ||
    query !==
      lastSearchQuery ||
    lastSearchStatus ===
      SEARCH_STATUS.LOADING
  ) {
    await executeSearch(
      query,
      {
        force:
          true,

        immediate:
          true,
      }
    );
  }

  void openSearchResult();
}

function onInput(
  event
) {
  scheduleSearch(
    event.target?.value ||
    ""
  );
}

function onFocus() {
  const refs =
    getRefs();

  const value =
    cleanText(
      refs.searchInput
        ?.value ||
      "",
      ""
    );

  if (value) {
    scheduleSearch(
      value
    );
  } else {
    setTopbarSearchExpanded(
      root,
      false
    );
  }
}

function onKeydown(
  event
) {
  const refs =
    getRefs();

  if (
    event.key ===
    "Escape"
  ) {
    event.preventDefault();

    clearSearch({
      input: false,
      focus: true,
    });

    return;
  }

  if (
    event.key ===
    "ArrowDown"
  ) {
    event.preventDefault();

    if (
      !latestSearchResults
        .length
    ) {
      scheduleSearch(
        refs.searchInput
          ?.value ||
        "",
        {
          immediate:
            true,
        }
      );
    } else {
      moveActiveSearch(
        1
      );
    }

    return;
  }

  if (
    event.key ===
    "ArrowUp"
  ) {
    event.preventDefault();

    if (
      !latestSearchResults
        .length
    ) {
      scheduleSearch(
        refs.searchInput
          ?.value ||
        "",
        {
          immediate:
            true,
        }
      );
    } else {
      moveActiveSearch(
        -1
      );
    }

    return;
  }

  if (
    event.key ===
      "Home" &&
    latestSearchResults
      .length
  ) {
    event.preventDefault();

    setActiveSearch(
      0
    );

    return;
  }

  if (
    event.key ===
      "End" &&
    latestSearchResults
      .length
  ) {
    event.preventDefault();

    setActiveSearch(
      latestSearchResults
        .length - 1
    );

    return;
  }

  if (
    event.key ===
      "Enter" &&
    latestSearchResults
      .length
  ) {
    event.preventDefault();

    void openSearchResult();
  }
}

function onResultsClick(
  event
) {
  const target =
    eventElement(
      event.target
    );

  const resultNode =
    target
      ?.closest?.(
        "[data-topbar-search-result='true']"
      );

  if (
    !resultNode ||
    !root
      ?.contains?.(
        resultNode
      )
  ) {
    return;
  }

  event.preventDefault();

  const index =
    Number(
      resultNode
        .dataset
        .topbarSearchResultIndex
    );

  if (
    Number.isFinite(
      index
    )
  ) {
    setActiveSearch(
      index
    );
  }

  void openSearchResult(
    latestSearchResults[
      activeSearchIndex
    ]
  );
}

function onResultsPointerMove(
  event
) {
  const target =
    eventElement(
      event.target
    );

  const resultNode =
    target
      ?.closest?.(
        "[data-topbar-search-result='true']"
      );

  if (
    !resultNode ||
    !root
      ?.contains?.(
        resultNode
      )
  ) {
    return;
  }

  const index =
    Number(
      resultNode
        .dataset
        .topbarSearchResultIndex
    );

  if (
    Number.isFinite(
      index
    )
  ) {
    setActiveSearch(
      index
    );
  }
}

function onDocumentPointerDown(
  event
) {
  const target =
    eventElement(
      event.target
    );

  const refs =
    getRefs();

  if (
    !refs.root ||
    (
      refs.search &&
      contains(
        refs.search,
        target
      )
    ) ||
    (
      refs.searchResults &&
      contains(
        refs.searchResults,
        target
      )
    )
  ) {
    return;
  }

  clearTopbarSearchResults(
    root
  );

  refs.search
    ?.classList
    ?.remove?.(
      "is-search-open"
    );

  refs.root
    ?.classList
    ?.remove?.(
      "is-search-focused"
    );
}

function bindEvents() {
  if (
    !root ||
    cleanupEvents
  ) {
    return false;
  }

  portalSearchResultsToRoot();

  const refs =
    getRefs();

  try {
    refs.search
      ?.addEventListener?.(
        "submit",
        onSubmit
      );

    refs.searchInput
      ?.addEventListener?.(
        "keydown",
        onKeydown
      );

    refs.searchInput
      ?.addEventListener?.(
        "input",
        onInput
      );

    refs.searchInput
      ?.addEventListener?.(
        "focus",
        onFocus
      );

    refs.searchResults
      ?.addEventListener?.(
        "click",
        onResultsClick
      );

    refs.searchResults
      ?.addEventListener?.(
        "pointermove",
        onResultsPointerMove
      );

    document.addEventListener(
      "pointerdown",
      onDocumentPointerDown,
      true
    );
  } catch {
    cleanupEvents =
      null;

    return false;
  }

  cleanupEvents =
    () => {
      try {
        refs.search
          ?.removeEventListener?.(
            "submit",
            onSubmit
          );

        refs.searchInput
          ?.removeEventListener?.(
            "keydown",
            onKeydown
          );

        refs.searchInput
          ?.removeEventListener?.(
            "input",
            onInput
          );

        refs.searchInput
          ?.removeEventListener?.(
            "focus",
            onFocus
          );

        refs.searchResults
          ?.removeEventListener?.(
            "click",
            onResultsClick
          );

        refs.searchResults
          ?.removeEventListener?.(
            "pointermove",
            onResultsPointerMove
          );

        document.removeEventListener(
          "pointerdown",
          onDocumentPointerDown,
          true
        );
      } catch {
        // noop
      }

      cleanupEvents =
        null;

      return true;
    };

  return true;
}

function unbindEvents() {
  try {
    cleanupEvents?.();
  } catch {
    cleanupEvents =
      null;
  }

  cleanupEvents =
    null;

  return true;
}

/* =========================================================
   DEBUG BRIDGE
========================================================= */

function exposeDebugBridge() {
  if (!isBrowser()) {
    return false;
  }

  try {
    window.OnionTopbar =
      TopbarUI;

    window.__ONION_TOPBAR__ =
      TopbarUI;

    return true;
  } catch {
    return false;
  }
}

function removeDebugBridge() {
  if (!isBrowser()) {
    return false;
  }

  try {
    if (
      window.OnionTopbar ===
      TopbarUI
    ) {
      delete window
        .OnionTopbar;
    }

    if (
      window
        .__ONION_TOPBAR__ ===
      TopbarUI
    ) {
      delete window
        .__ONION_TOPBAR__;
    }

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   REGISTRATION
========================================================= */

function registerModule() {
  try {
    if (
      isObject(
        AppCore.ui
      )
    ) {
      AppCore.ui.topbar =
        TopbarUI;
    }

    /*
      AppCore.topbar / AppCore.Topbar son aliases del registry.
      Una sola escritura canónica es suficiente.
    */
    AppCore
      .registerModule
      ?.(
        "topbar",
        TopbarUI,
        {
          overwrite:
            true,
        }
      );

    exposeDebugBridge();

    return true;
  } catch {
    exposeDebugBridge();

    return false;
  }
}

function unregisterModule() {
  try {
    if (
      AppCore.ui
        ?.topbar ===
      TopbarUI
    ) {
      delete AppCore.ui
        .topbar;
    }

    AppCore.modules
      ?.remove
      ?.(
        "topbar"
      );

    removeDebugBridge();

    return true;
  } catch {
    removeDebugBridge();

    return false;
  }
}

/* =========================================================
   LIFECYCLE
========================================================= */

function sync(
  options = {}
) {
  lastOptions = {
    ...lastOptions,
    ...(
      isObject(options)
        ? options
        : {}
    ),
  };

  if (
    !ensureRoot(
      lastOptions
    )
  ) {
    return false;
  }

  portalSearchResultsToRoot();

  syncTitle(
    lastOptions
  );

  syncVisibility(
    lastOptions
  );

  cacheDom();
  exposeDebugBridge();

  mounted =
    true;

  metrics.syncs +=
    1;

  return true;
}

function init(
  options = {}
) {
  if (
    initialized
  ) {
    sync(
      options
    );

    return TopbarUI;
  }

  initialized =
    true;

  lastOptions = {
    ...(
      isObject(options)
        ? options
        : {}
    ),
  };

  registerModule();

  /*
    App inicializa UI antes de que Router resuelva la ruta.
    El topbar arranca oculto y Router.sync(route) decide después.
  */
  ensureRoot({
    ...lastOptions,
    visible: false,
  });

  if (root) {
    portalSearchResultsToRoot();

    setTopbarTemplateVisible(
      root,
      false
    );

    setTopbarSearchExpanded(
      root,
      false
    );

    lastHidden =
      true;
  }

  syncMountVisibility(
    true
  );

  cacheDom();
  exposeDebugBridge();

  return TopbarUI;
}

function render(
  options = {}
) {
  return sync(
    options
  );
}

function refresh(
  options = {}
) {
  return sync(
    options
  );
}

function destroy(
  options = {}
) {
  unbindEvents();
  abortBackendSearch();
  clearSearchCache();

  if (root) {
    clearSearch({
      input: true,
      focus: false,
    });
  }

  if (
    options.unmount ===
      true &&
    root
  ) {
    try {
      root.remove();
    } catch {
      clear(
        root
      );
    }
  } else if (root) {
    setHidden(
      root,
      true
    );
  }

  root = null;

  mounted = false;
  initialized = false;

  lastOptions = {};
  lastTitle = "";
  lastHidden = true;

  clearDomCache();
  unregisterModule();

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getSnapshot() {
  const refs =
    getRefs();

  return Object.freeze({
    version:
      TOPBAR_VERSION,

    initialized,
    mounted,

    visible:
      Boolean(
        refs.root &&
        refs.root.hidden !==
          true
      ),

    title:
      refs.title
        ?.textContent ||
      "",

    hasRoot:
      Boolean(
        refs.root
      ),

    dom:
      Object.freeze({
        hasSearch:
          Boolean(
            refs.search
          ),

        hasSearchInput:
          Boolean(
            refs.searchInput
          ),

        hasSearchResults:
          Boolean(
            refs.searchResults
          ),

        resultsParent:
          refs.searchResults
            ?.parentElement
            ?.id ||
          refs.searchResults
            ?.parentElement
            ?.className ||
          null,
      }),

    backend:
      Object.freeze({
        endpoint:
          resolveSearchEndpoint(
            lastOptions
          ),

        cacheSize:
          backendCache.size,

        active:
          Boolean(
            backendAbort
          ),

        debounceActive:
          Boolean(
            backendTimer
          ),

        transport:
          "core-http",
      }),

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
          refs.searchInput
            ?.value ||
          "",

        lastSearchQuery,

        status:
          lastSearchStatus,

        error:
          lastSearchError,

        resultCount:
          latestSearchResults
            .length,

        activeSearchIndex,

        results:
          Object.freeze(
            latestSearchResults
              .map(
                (item) => ({
                  label:
                    item.label,

                  route:
                    item.route,

                  type:
                    item.type,

                  source:
                    item.source,

                  score:
                    item.score,
                })
              )
          ),
      }),

    metrics:
      Object.freeze({
        ...metrics,
      }),

    policy:
      Object.freeze({
        stableDom:
          true,

        centralHttp:
          true,

        directFetch:
          false,

        manualAuthHeader:
          false,

        autoRefreshViaHttp:
          true,

        localRoutesFromRouterTable:
          true,

        backendRawPayloadStored:
          false,

        sanitizedOpenEvent:
          true,

        cachePerUserRole:
          true,

        cacheHitAvoidsRequest:
          true,

        abortableSearch:
          true,

        noStore:
          true,

        noServices:
          true,

        noToast:
          true,
      }),
  });
}

/* =========================================================
   API
========================================================= */

export const TopbarUI = {
  version:
    TOPBAR_VERSION,

  init,
  render,
  refresh,
  sync,
  destroy,

  mountTopbar:
    ensureRoot,

  unmountTopbar:
    (
      options = {}
    ) =>
      destroy({
        ...options,
        unmount:
          true,
      }),

  syncTitle,
  resolveRouteTitle,

  search:
    (
      query = "",
      options = {}
    ) => {
      ensureRoot(
        lastOptions
      );

      scheduleSearch(
        query,
        {
          ...options,

          immediate:
            options.immediate ===
            true,
        }
      );

      return [
        ...latestSearchResults,
      ];
    },

  searchAsync:
    async (
      query = "",
      options = {}
    ) => {
      ensureRoot(
        lastOptions
      );

      return executeSearch(
        query,
        {
          ...options,

          force:
            true,

          immediate:
            true,
        }
      );
    },

  clearSearch,
  clearSearchCache,

  getSearchIndex:
    (
      options = {}
    ) =>
      buildSearchIndex({
        ...lastOptions,
        ...options,
      }),

  getDom:
    () => {
      const refs =
        getRefs();

      return {
        topbar:
          refs.root,

        title:
          refs.title,

        search:
          refs.search,

        searchForm:
          refs.search,

        searchInput:
          refs.searchInput,

        searchSubmit:
          refs.searchSubmit,

        searchResults:
          refs.searchResults,
      };
    },

  getState:
    getSnapshot,

  getSnapshot,

  getDebugSnapshot:
    getSnapshot,

  get initialized() {
    return initialized;
  },

  get mounted() {
    return mounted;
  },
};

exposeDebugBridge();

export default TopbarUI;
