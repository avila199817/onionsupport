/* =========================================================
   Onion Support - Clientes Index
   Archivo: /src/views/clientes/index.js

   PRODUCTIVO · CONTROLADOR PURO · API BOUNDARY · V6

   Responsabilidad:
   - Controlar /clientes y su ciclo de vida SPA.
   - Delegar TODA la API de Clientes a clientes.api.js.
   - Delegar búsqueda remota de Usuarios a usuarios.api.js.
   - Mantener sólo estado de presentación y coordinación.
   - Respetar el backend real:
       GET  /api/clientes
       GET  /api/clientes/:id
       POST /api/clientes
     Sin inventar PATCH / PUT / DELETE.
   - Crear cliente desde un único POST y un único refresh canónico.
   - No convertir ACKs de creación en clientes falsos.
   - Proteger la vista contra controllers obsoletos.
   - Proteger el detalle contra respuestas async fuera de orden.
   - Mantener el modal de creación aislado por controller.
   - Mantener compatibilidad pública con ClientesView.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  ROUTES,
} from "../../core/config.js";

import {
  renderClientesTemplate,
  renderClientesLoadingState,
  renderClientesErrorState,
  CLIENTES_ACTIONS,
} from "./clientes.template.js";

import {
  CLIENTES_API_VERSION,
  CLIENTES_ENDPOINT,
  CLIENTES_FETCH_LIMIT,
  CLIENTES_MAX_LIMIT,
  CLIENTES_MAX_PAGES,
  CLIENTES_CACHE_KEY,
  CLIENTES_CACHE_TTL_MS,
  hydrateClientesFromCache,
  loadClientes as loadClientesRequest,
  refreshClientes as refreshClientesRequest,
  loadClienteDetail as loadClienteDetailRequest,
  createCliente as createClienteRequest,
  normalizeClienteModel,
  normalizeClientesCollection,
  findClienteById as findClienteByIdApi,
} from "./clientes.api.js";

import {
  renderClientesCreateModal,
  CREATE_ACTIONS,
  getCreateFormDefaults,
  validateCreateForm,
  buildClienteCreatePayload,
} from "./clientes.template.create.js";

import {
  openClientesDetailModal,
  closeClientesDetailModal,
} from "./clientes.template.modal.js";

import {
  fetchUsuariosRequest,
  normalizeUsuarioModel,
  normalizeUsuariosCollection,
} from "../usuarios/usuarios.api.js";

/* =========================================================
   META / COMPAT
========================================================= */

export const CLIENTES_MODULE_NAME = "clientes";
export const CLIENTES_VIEW_NAME = "ClientesView";
export const CLIENTES_CANONICAL_PATH = "/clientes";

export const CLIENTES_INDEX_VERSION =
  "clientes.index.api-boundary.v6.controller-ownership-race-safe";

export const CLIENTES_VIEW_VERSION =
  CLIENTES_INDEX_VERSION;

export const CLIENTES_MODULE_VERSION =
  CLIENTES_INDEX_VERSION;

export const CLIENTES_INDEX_SOURCE =
  "views.clientes.index";

export {
  CLIENTES_ENDPOINT,
  CLIENTES_FETCH_LIMIT,
  CLIENTES_MAX_LIMIT,
  CLIENTES_MAX_PAGES,
  CLIENTES_CACHE_KEY,
  CLIENTES_CACHE_TTL_MS,
};

const DEFAULT_VISIBLE_LIMIT = 20;
const VISIBLE_STEP = 20;
const DEFAULT_SORT_ORDER = "desc";

const SEARCH_DEBOUNCE_MS = 220;
const USER_SEARCH_MIN_LENGTH = 2;
const USER_SEARCH_LIMIT = 8;
const USER_SEARCH_DEBOUNCE_MS = 220;

const EXTERNAL_CREATE_DEDUPE_MS = 750;
const EXTERNAL_CREATE_REFRESH_DELAY_MS = 80;

const CREATE_MODAL_PANEL_SELECTOR =
  "[data-clientes-create-modal-panel='true']";

const CREATE_MODAL_OVERLAY_SELECTOR =
  "[data-clientes-create-modal-overlay='true']";

const CREATE_SUCCESS_EVENTS = Object.freeze([
  "clientes:create:success",
  "clientes:create:created",
  "clientes:created",
  "cliente:created",
]);

const DETAIL_CLOSE_EVENTS = Object.freeze([
  "clientes:modal:closed",
]);

const INSTANCES = new WeakMap();

const CLIENTES_GLOBAL_CONTROLLER_KEY = Symbol.for(
  "onion.support.clientes.active-controller"
);

const CLIENTES_ROOT_OWNER_KEY = Symbol.for(
  "onion.support.clientes.root-owner"
);

const CLIENTES_DETAIL_OWNER_KEY = Symbol.for(
  "onion.support.clientes.detail-owner"
);

let lastInstance = null;
let controllerSequence = 0;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isDomNode(value = null) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.nodeType === 1 &&
    "innerHTML" in value &&
    isFunction(value.addEventListener)
  );
}

function isElementNode(value = null) {
  return Boolean(
    typeof Element !== "undefined" &&
    value &&
    value instanceof Element
  );
}

function safeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    typeof value.length === "number" &&
    typeof value !== "string"
  ) {
    try {
      return Array.from(value);
    } catch {
      return [];
    }
  }

  return [];
}

function safeObject(
  value,
  fallback = {}
) {
  return isObject(value)
    ? value
    : fallback;
}

function cleanText(
  value = "",
  fallback = ""
) {
  const output =
    String(value ?? "")
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return output || fallback;
}

/*
   No aplanar arrays.
   Los envelopes items/results son estructuras de dominio.
*/
function first(...values) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    if (
      isObject(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function number(
  value = 0,
  fallback = 0
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  if (
    typeof value === "number"
  ) {
    return Number.isFinite(value)
      ? value
      : fallback;
  }

  if (
    typeof value === "string"
  ) {
    let normalized =
      value
        .trim()
        .replace(/[€$£¥%]/g, "")
        .replace(/[^\d.,+\-\s]/g, "")
        .replace(/\s+/g, "");

    if (
      !normalized ||
      normalized === "-" ||
      normalized === "+"
    ) {
      return fallback;
    }

    const comma =
      normalized.lastIndexOf(",");

    const dot =
      normalized.lastIndexOf(".");

    if (
      comma >= 0 &&
      dot >= 0
    ) {
      normalized =
        comma > dot
          ? normalized
              .replace(/\./g, "")
              .replace(/,/g, ".")
          : normalized
              .replace(/,/g, "");
    } else if (comma >= 0) {
      normalized =
        normalized.replace(/,/g, ".");
    }

    const parsed =
      Number(normalized);

    return Number.isFinite(parsed)
      ? parsed
      : fallback;
  }

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function clamp(
  value = 0,
  min = 0,
  max = 1
) {
  return Math.min(
    Math.max(
      number(value, min),
      min
    ),
    max
  );
}

function normalizeKey(
  value = ""
) {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeSearch(
  value = ""
) {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9@._+\-\s]+/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(
  value = ""
) {
  const email =
    cleanText(value, "")
      .toLowerCase();

  if (!email) {
    return "";
  }

  if (
    [
      "null",
      "undefined",
      "none",
      "sin email",
      "sin_email",
      "no email",
      "no_email",
      "__no_email__",
    ].includes(email)
  ) {
    return "";
  }

  return email.includes("@")
    ? email
    : "";
}

function normalizeSortOrder(
  value = ""
) {
  const order =
    normalizeKey(
      value ||
      DEFAULT_SORT_ORDER
    );

  return [
    "asc",
    "ascending",
    "oldest",
    "antiguos",
    "menor",
    "menor_mayor",
    "menor_a_mayor",
  ].includes(order)
    ? "asc"
    : "desc";
}

function getNextSortOrder(
  value = DEFAULT_SORT_ORDER
) {
  return normalizeSortOrder(value) === "asc"
    ? "desc"
    : "asc";
}

function safeError(
  error = null,
  fallback =
    "No se pudieron cargar los clientes."
) {
  return cleanText(
    first(
      error?.message,
      error?.data?.message,
      error?.payload?.message,
      error?.response?.data?.message,
      error?.response?.message,
      error?.error,
      error?.code,
      fallback
    ),
    fallback
  );
}

function toTimestamp(
  value = null
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  if (
    typeof value === "number"
  ) {
    if (
      !Number.isFinite(value) ||
      value === 0
    ) {
      return 0;
    }

    return value >
      9_999_999_999
        ? value
        : value * 1000;
  }

  const text =
    cleanText(value, "");

  if (!text) {
    return 0;
  }

  if (
    /^[+\-]?\d+(?:\.\d+)?$/.test(
      text
    )
  ) {
    const numeric =
      Number(text);

    if (
      !Number.isFinite(numeric) ||
      numeric === 0
    ) {
      return 0;
    }

    return numeric >
      9_999_999_999
        ? numeric
        : numeric * 1000;
  }

  const parsed =
    Date.parse(text);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function getGlobalObject() {
  try {
    return globalThis;
  } catch {
    return {};
  }
}

function nextFrame(
  callback = null
) {
  if (
    !isBrowser() ||
    !isFunction(callback)
  ) {
    return 0;
  }

  try {
    return window
      .requestAnimationFrame(
        callback
      );
  } catch {
    return window.setTimeout(
      callback,
      0
    );
  }
}

function cancelFrame(
  id = 0
) {
  if (
    !id ||
    !isBrowser()
  ) {
    return false;
  }

  try {
    window
      .cancelAnimationFrame?.(
        id
      );

    window
      .clearTimeout?.(
        id
      );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   CANONICAL CLIENT HELPERS
========================================================= */

function canonicalCliente(
  item = {}
) {
  try {
    return normalizeClienteModel(
      safeObject(item, {})
    );
  } catch {
    return safeObject(item, {});
  }
}

function cloneItems(
  items = []
) {
  return normalizeClientesCollection(
    safeArray(items)
  ).map(
    (item) => ({
      ...item,
    })
  );
}

function getClienteId(
  item = {}
) {
  const current =
    canonicalCliente(item);

  return cleanText(
    first(
      current.clienteId,
      current.clientId,
      current.customerId,
      current.id,
      current._id,
      current.uid,
      ""
    ),
    ""
  );
}

function getClienteCode(
  item = {}
) {
  const current =
    canonicalCliente(item);

  return cleanText(
    first(
      current.code,
      current.codigo,
      current.clienteId,
      current.nif,
      current.email,
      "CLI-SIN-ID"
    ),
    "CLI-SIN-ID"
  );
}

function getClienteName(
  item = {}
) {
  const current =
    canonicalCliente(item);

  return cleanText(
    first(
      current.nombreFiscal,
      current.razonSocial,
      current.businessName,
      current.companyName,
      current.displayName,
      current.fullName,
      current.name,
      current.nombre,
      current.email,
      current.clienteId,
      "Cliente"
    ),
    "Cliente"
  );
}

function getClienteEmail(
  item = {}
) {
  const current =
    canonicalCliente(item);

  return normalizeEmail(
    first(
      current.email,
      current.emailLower,
      current.mail,
      current.contactEmail,
      current.billingEmail,
      ""
    )
  );
}

function getClientePhone(
  item = {}
) {
  const current =
    canonicalCliente(item);

  return cleanText(
    first(
      current.phone,
      current.telefono,
      current.mobile,
      current.movil,
      ""
    ),
    ""
  );
}

function getClienteCity(
  item = {}
) {
  const current =
    canonicalCliente(item);

  return cleanText(
    first(
      current.city,
      current.ciudad,
      current.address?.city,
      current.address?.ciudad,
      current.direccion?.city,
      current.direccion?.ciudad,
      ""
    ),
    ""
  );
}

function getClienteNif(
  item = {}
) {
  const current =
    canonicalCliente(item);

  return cleanText(
    first(
      current.nif,
      current.cif,
      current.taxId,
      ""
    ),
    ""
  ).toUpperCase();
}

function getClienteType(
  item = {}
) {
  const current =
    canonicalCliente(item);

  return normalizeKey(
    first(
      current.tipo,
      current.type,
      current.clienteTipo,
      current.segment,
      "cliente"
    )
  );
}

function getClienteStatus(
  item = {}
) {
  const current =
    canonicalCliente(item);

  return normalizeKey(
    first(
      current.status,
      current.estado,
      current.state,
      "active"
    )
  );
}

function getClienteAmount(
  item = {}
) {
  const current =
    canonicalCliente(item);

  return number(
    first(
      current.totalAmount,
      current.totalImporte,
      current.facturasTotal,
      0
    ),
    0
  );
}

function getClienteUpdatedAt(
  item = {}
) {
  const current =
    canonicalCliente(item);

  return first(
    current.lastActivityAt,
    current.updatedAt,
    current.lastInvoiceAt,
    current.lastTicketAt,
    current.lastContactAt,
    current.createdAt,
    0
  );
}

function clienteSortTime(
  item = {}
) {
  return toTimestamp(
    getClienteUpdatedAt(item)
  );
}

function viewStatusBucket(
  item = {}
) {
  const status =
    getClienteStatus(item);

  if (
    [
      "pending",
      "pendiente",
      "new",
      "nuevo",
      "invited",
    ].includes(status)
  ) {
    return "pending";
  }

  if (
    [
      "blocked",
      "bloqueado",
      "inactive",
      "inactivo",
      "disabled",
      "suspended",
      "deleted",
      "archived",
    ].includes(status)
  ) {
    return "blocked";
  }

  return "active";
}

function clienteSearchText(
  item = {}
) {
  const current =
    canonicalCliente(item);

  return normalizeSearch(
    [
      getClienteId(current),
      getClienteCode(current),
      getClienteName(current),
      getClienteEmail(current),
      getClientePhone(current),
      getClienteCity(current),
      getClienteNif(current),
      getClienteStatus(current),
      getClienteType(current),
    ].join(" ")
  );
}

function filterClientesForView(
  items = [],
  {
    filter = "all",
    search = "",
    sortOrder =
      DEFAULT_SORT_ORDER,
  } = {}
) {
  const bucket =
    normalizeKey(
      filter ||
      "all"
    ) ||
    "all";

  const terms =
    normalizeSearch(search)
      .split(/\s+/)
      .filter(Boolean);

  const order =
    normalizeSortOrder(
      sortOrder
    );

  return normalizeClientesCollection(
    items
  )
    .filter(
      (item) => {
        if (
          bucket !== "all" &&
          viewStatusBucket(
            item
          ) !== bucket
        ) {
          return false;
        }

        if (!terms.length) {
          return true;
        }

        const haystack =
          clienteSearchText(
            item
          );

        return terms.every(
          (term) =>
            haystack.includes(
              term
            )
        );
      }
    )
    .sort(
      (a, b) => {
        const aTime =
          clienteSortTime(a);

        const bTime =
          clienteSortTime(b);

        const diff =
          order === "asc"
            ? aTime - bTime
            : bTime - aTime;

        if (diff !== 0) {
          return diff;
        }

        return getClienteName(a)
          .localeCompare(
            getClienteName(b),
            "es",
            {
              numeric: true,
              sensitivity: "base",
            }
          );
      }
    );
}

export function computeClientesStats(
  items = []
) {
  return normalizeClientesCollection(
    items
  ).reduce(
    (acc, item) => {
      const status =
        getClienteStatus(item);

      const bucket =
        viewStatusBucket(item);

      acc.total += 1;

      if (
        bucket === "active"
      ) {
        acc.activeCount += 1;
      }

      if (
        bucket === "pending"
      ) {
        acc.pendingCount += 1;
      }

      if (
        bucket === "blocked"
      ) {
        acc.blockedCount += 1;
      }

      const canonical =
        canonicalCliente(item);

      if (
        status === "vip" ||
        canonical.vip === true ||
        canonical.isVip === true
      ) {
        acc.vipCount += 1;
      }

      acc.totalAmount +=
        getClienteAmount(item);

      acc.invoiceTotal =
        acc.totalAmount;

      acc.lastUpdateTs =
        Math.max(
          acc.lastUpdateTs,
          clienteSortTime(item)
        );

      return acc;
    },
    {
      total: 0,
      activeCount: 0,
      pendingCount: 0,
      blockedCount: 0,
      vipCount: 0,
      totalAmount: 0,
      invoiceTotal: 0,
      lastUpdateTs: 0,
    }
  );
}

function upsertCliente(
  items = [],
  detail = null
) {
  const next =
    canonicalCliente(
      detail ||
      {}
    );

  const id =
    getClienteId(next);

  if (!id) {
    return normalizeClientesCollection(
      items
    );
  }

  const output =
    normalizeClientesCollection(
      items
    );

  const index =
    output.findIndex(
      (item) =>
        getClienteId(item) === id
    );

  if (index >= 0) {
    const copy =
      [...output];

    copy[index] =
      canonicalCliente({
        ...copy[index],
        ...next,

        raw: {
          ...safeObject(
            copy[index]?.raw
          ),

          ...safeObject(
            next?.raw
          ),
        },
      });

    return normalizeClientesCollection(
      copy
    );
  }

  return normalizeClientesCollection([
    next,
    ...output,
  ]);
}

/* =========================================================
   CSV
========================================================= */

function protectCsvFormula(
  value = ""
) {
  const text =
    String(value ?? "");

  return /^\s*[=+\-@]/.test(
    text
  )
    ? `'${text}`
    : text;
}

function escapeCsv(
  value = ""
) {
  return `"${protectCsvFormula(
    value
  ).replace(/"/g, '""')}"`;
}

/* =========================================================
   APP / AUTH / ROUTE
========================================================= */

function getAppState() {
  try {
    return (
      AppCore.getState?.() ||
      AppCore.state ||
      {}
    );
  } catch {
    return (
      AppCore.state ||
      {}
    );
  }
}

function getCurrentUser() {
  const state =
    getAppState();

  try {
    return (
      AppCore.getCurrentUser?.() ||
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

function getCoreRole() {
  try {
    return (
      AppCore.getCurrentRole?.() ||
      ""
    );
  } catch {
    return "";
  }
}

function normalizeRole(
  value = ""
) {
  if (
    Array.isArray(value)
  ) {
    const roles =
      value
        .map(normalizeRole)
        .filter(Boolean);

    if (
      roles.includes(
        "admin"
      )
    ) {
      return "admin";
    }

    if (
      roles.includes(
        "user"
      )
    ) {
      return "user";
    }

    return roles[0] || "";
  }

  const role =
    normalizeKey(value);

  if (
    [
      "admin",
      "administrator",
      "administrador",
      "superadmin",
      "super_admin",
      "root",
      "owner",
    ].includes(role)
  ) {
    return "admin";
  }

  if (
    [
      "user",
      "usuario",
      "client",
      "cliente",
    ].includes(role)
  ) {
    return "user";
  }

  return role || "user";
}

function getCurrentRole(
  context = {}
) {
  const state =
    getAppState();

  const user =
    safeObject(
      getCurrentUser(),
      {}
    );

  return (
    normalizeRole(
      first(
        context.role,
        context.rol,
        context.user?.role,
        context.user?.rol,
        getCoreRole(),
        state.role,
        state.rol,
        state.roles,
        user.role,
        user.rol,
        user.roles,
        ""
      )
    ) ||
    "user"
  );
}

function isAdminContext(
  context = {}
) {
  return (
    context.admin === true ||
    getCurrentRole(
      context
    ) === "admin"
  );
}

function normalizePathname(
  path = "/"
) {
  let value =
    cleanText(path, "/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (
    !value.startsWith("/")
  ) {
    value =
      `/${value}`;
  }

  value =
    value
      .split("?")[0]
      .split("#")[0] ||
    "/";

  if (
    value.length > 1
  ) {
    value =
      value
        .replace(/\/+$/g, "") ||
      "/";
  }

  const segments =
    value
      .split("/")
      .filter(Boolean);

  if (
    segments[0]
      ?.startsWith("@")
  ) {
    value =
      `/${segments
        .slice(1)
        .join("/")}` ||
      "/";
  }

  return value;
}

function getBrowserPath() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const hash =
      window.location.hash ||
      "";

    if (
      hash.startsWith("#/")
    ) {
      return normalizePathname(
        hash.slice(1)
      );
    }

    if (
      hash.startsWith("#!/")
    ) {
      return normalizePathname(
        hash.slice(2)
      );
    }

    return normalizePathname(
      window.location.pathname ||
      "/"
    );
  } catch {
    return "";
  }
}

function routePathFromContext(
  context = {}
) {
  return cleanText(
    first(
      context.canonicalPath,
      context.routePath,
      context.route?.path,
      context.publicPath,
      context.requestedPath,
      context.path,
      context.options
        ?.canonicalPath,
      context.options
        ?.routePath,
      context.options?.path,
      ""
    ),
    ""
  );
}

function isClientesRoute(
  context = {}
) {
  const browserPath =
    getBrowserPath();

  if (
    browserPath &&
    browserPath !== "/"
  ) {
    return (
      browserPath ===
      CLIENTES_CANONICAL_PATH
    );
  }

  const explicit =
    routePathFromContext(
      context
    );

  if (explicit) {
    return (
      normalizePathname(
        explicit
      ) ===
      CLIENTES_CANONICAL_PATH
    );
  }

  if (browserPath) {
    return (
      browserPath ===
      CLIENTES_CANONICAL_PATH
    );
  }

  return true;
}

function resolveHost(
  host = null,
  context = {}
) {
  if (
    isDomNode(host)
  ) {
    return host;
  }

  if (
    isDomNode(context.host)
  ) {
    return context.host;
  }

  if (
    isDomNode(context.root)
  ) {
    return context.root;
  }

  if (
    isDomNode(
      context.container
    )
  ) {
    return context.container;
  }

  if (!isBrowser()) {
    return null;
  }

  return (
    document.querySelector(
      "[data-view-host='clientes']"
    ) ||
    document.querySelector(
      "[data-clientes-host='true']"
    ) ||
    document.querySelector(
      "#app-content"
    ) ||
    document.querySelector(
      "main"
    ) ||
    null
  );
}

function getRoutes() {
  return {
    incidencias:
      ROUTES?.incidencias ||
      "/incidencias",

    facturas:
      ROUTES?.facturas ||
      "/facturas",

    clientes:
      ROUTES?.clientes ||
      "/clientes",

    usuarios:
      ROUTES?.usuarios ||
      "/usuarios",

    servidor:
      ROUTES?.servidor ||
      "/servidor",
  };
}

/* =========================================================
   TOAST / EVENTS
========================================================= */

function showToast(
  message = "",
  type = "info"
) {
  const text =
    cleanText(
      message,
      ""
    );

  if (!text) {
    return false;
  }

  const candidates = [
    AppCore?.toast,
    AppCore?.ui?.toast,
    AppCore?.Toast,
  ];

  for (
    const toast
    of candidates
  ) {
    try {
      if (
        isFunction(
          toast?.[type]
        )
      ) {
        toast[type](text);
        return true;
      }

      if (
        isFunction(
          toast?.show
        )
      ) {
        toast.show(
          text,
          type
        );

        return true;
      }
    } catch {
      // siguiente
    }
  }

  return false;
}

function subscribeEvent(
  eventName = "",
  handler = null
) {
  const name =
    cleanText(
      eventName,
      ""
    );

  if (
    !name ||
    !isFunction(handler)
  ) {
    return () => {};
  }

  let appBound = false;
  let windowBound = false;

  try {
    if (
      isFunction(
        AppCore?.events?.on
      )
    ) {
      AppCore.events.on(
        name,
        handler
      );

      appBound = true;
    }
  } catch {
    // noop
  }

  try {
    if (isBrowser()) {
      window.addEventListener(
        name,
        handler
      );

      windowBound = true;
    }
  } catch {
    // noop
  }

  return () => {
    try {
      if (
        appBound &&
        isFunction(
          AppCore?.events?.off
        )
      ) {
        AppCore.events.off(
          name,
          handler
        );
      }
    } catch {
      // noop
    }

    try {
      if (
        windowBound &&
        isBrowser()
      ) {
        window
          .removeEventListener(
            name,
            handler
          );
      }
    } catch {
      // noop
    }
  };
}

/*
   Se emite por un solo bridge.
   Si AppCore tiene event bus, no duplicamos además en window.
*/
function emitEvent(
  eventName = "",
  payload = {}
) {
  const name =
    cleanText(
      eventName,
      ""
    );

  if (!name) {
    return false;
  }

  try {
    if (
      isFunction(
        AppCore?.events?.emit
      )
    ) {
      AppCore.events.emit(
        name,
        payload
      );

      return true;
    }
  } catch {
    // fallback DOM
  }

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(
          name,
          {
            detail:
              payload,
          }
        )
      );

      return true;
    }
  } catch {
    // noop
  }

  return false;
}

function eventPayload(
  event = null
) {
  return safeObject(
    first(
      event?.detail?.detail,
      event?.detail?.payload,
      event?.detail,
      event?.payload,
      event,
      {}
    ),
    {}
  );
}

/* =========================================================
   USER SEARCH ADAPTER
========================================================= */

function isAzureBlobHost(
  hostname = ""
) {
  const host =
    cleanText(
      hostname,
      ""
    ).toLowerCase();

  return (
    host.endsWith(
      ".blob.core.windows.net"
    ) ||
    host ===
      "blob.core.windows.net"
  );
}

function hasAppSecretQuery(
  url = ""
) {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|jwt|authorization|reset_token|activation_token)=/i.test(
    String(url || "")
  );
}

function safeImageSrc(
  value = ""
) {
  const raw =
    cleanText(
      value,
      ""
    );

  if (!raw) {
    return "";
  }

  if (
    raw.startsWith("//") ||
    /[\r\n\t\\]/.test(raw) ||
    /^(javascript|data|vbscript|file):/i.test(
      raw
    )
  ) {
    return "";
  }

  if (
    /^blob:/i.test(raw)
  ) {
    return raw;
  }

  if (
    raw.startsWith("/")
  ) {
    return raw.replace(
      /\/{2,}/g,
      "/"
    );
  }

  if (
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(
      raw
    )
  ) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  if (
    !/^https:\/\//i.test(
      raw
    )
  ) {
    return "";
  }

  try {
    const parsed =
      new URL(raw);

    if (
      hasAppSecretQuery(
        parsed.href
      )
    ) {
      return "";
    }

    /*
       SAS de Azure es válido en runtime.
       No tratamos `sig` como token de aplicación.
    */
    if (
      parsed.searchParams
        .has("sig") &&
      !isAzureBlobHost(
        parsed.hostname
      )
    ) {
      return "";
    }

    return parsed.href;
  } catch {
    return "";
  }
}

function firstImageSrc(
  ...values
) {
  const queue =
    [...values];

  const seen =
    new Set();

  while (
    queue.length
  ) {
    const value =
      queue.shift();

    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (
      isObject(value)
    ) {
      if (
        seen.has(value)
      ) {
        continue;
      }

      seen.add(value);

      queue.unshift(
        value.avatarUrl,
        value.avatar,
        value.picture,
        value.photoUrl,
        value.photoURL,
        value.imageUrl,
        value.profile
          ?.avatarUrl,
        value.profile
          ?.avatar,
        value.profile
          ?.picture,
        value.raw
          ?.avatarUrl,
        value.raw
          ?.avatar,
        value.raw
          ?.picture
      );

      continue;
    }

    const src =
      safeImageSrc(value);

    if (src) {
      return src;
    }
  }

  return "";
}

function normalizeSearchUser(
  user = {}
) {
  const raw =
    safeObject(
      user,
      {}
    );

  let normalized =
    raw;

  try {
    normalized =
      normalizeUsuarioModel(
        raw
      );
  } catch {
    normalized =
      raw;
  }

  const nested =
    safeObject(
      raw.raw,
      {}
    );

  const userId =
    cleanText(
      first(
        normalized.userId,
        normalized.id,
        normalized.uid,
        raw.userId,
        raw.id,
        raw.uid,
        raw.sub,
        raw.usuarioId,
        raw.lookup?.userId,
        raw.lookup?.id,
        nested.userId,
        nested.id,
        nested.uid,
        ""
      ),
      ""
    );

  const clienteId =
    cleanText(
      first(
        normalized.clienteId,
        normalized.clientId,
        normalized.customerId,
        raw.targetClienteId,
        raw.clienteId,
        raw.clientId,
        raw.customerId,
        raw.lookup?.clienteId,
        raw.lookup?.clientId,
        raw.cliente?.clienteId,
        raw.cliente?.id,
        nested.targetClienteId,
        nested.clienteId,
        nested.clientId,
        nested.customerId,
        ""
      ),
      ""
    );

  const name =
    cleanText(
      first(
        normalized.displayName,
        normalized.fullName,
        normalized.name,
        normalized.nombre,
        raw.displayName,
        raw.fullName,
        raw.name,
        raw.nombre,
        raw.publicName,
        raw.username,
        userId,
        "Usuario"
      ),
      "Usuario"
    );

  const email =
    normalizeEmail(
      first(
        normalized.email,
        normalized.emailLower,
        raw.email,
        raw.emailLower,
        raw.userEmail,
        raw.lookup?.email,
        nested.email,
        nested.emailLower,
        ""
      )
    );

  const phone =
    cleanText(
      first(
        normalized.phone,
        normalized.telefono,
        normalized.mobile,
        raw.phone,
        raw.telefono,
        raw.mobile,
        raw.movil,
        nested.phone,
        nested.telefono,
        ""
      ),
      ""
    );

  const username =
    cleanText(
      first(
        normalized.username,
        normalized.usernameLower,
        raw.username,
        raw.usernameLower,
        raw.userName,
        nested.username,
        nested.usernameLower,
        ""
      ),
      ""
    );

  const role =
    normalizeRole(
      first(
        normalized.role,
        normalized.rol,
        raw.role,
        raw.rol,
        nested.role,
        nested.rol,
        "user"
      )
    );

  const avatarUrl =
    firstImageSrc(
      normalized,
      raw,
      nested
    );

  return {
    ...raw,
    ...normalized,

    /*
       raw se conserva sólo dentro del VM del buscador.
       No se persiste desde index.js.
    */
    raw,

    id:
      userId,

    userId,
    uid:
      userId,

    targetUserId:
      userId,

    clienteId,

    targetClienteId:
      clienteId,

    clientId:
      clienteId,

    customerId:
      clienteId,

    name,
    nombre:
      name,

    fullName:
      name,

    displayName:
      name,

    email,
    emailLower:
      email,

    phone,
    telefono:
      phone,

    username,
    usernameLower:
      username.toLowerCase(),

    role,
    rol:
      role,

    avatarUrl,
    avatar:
      avatarUrl ||
      null,
  };
}

function usersListFromPayload(
  payload = null,
  maxDepth = 6
) {
  if (
    Array.isArray(payload)
  ) {
    return payload;
  }

  const queue = [
    {
      value:
        payload,
      depth:
        0,
    },
  ];

  const seen =
    new Set();

  while (
    queue.length
  ) {
    const {
      value,
      depth,
    } =
      queue.shift();

    if (
      !isObject(value) ||
      seen.has(value) ||
      depth > maxDepth
    ) {
      continue;
    }

    seen.add(value);

    for (
      const key
      of [
        "items",
        "results",
        "users",
        "usuarios",
        "rows",
        "records",
        "docs",
        "documents",
        "list",
        "value",
      ]
    ) {
      if (
        Array.isArray(
          value[key]
        )
      ) {
        return value[key];
      }
    }

    for (
      const key
      of [
        "data",
        "payload",
        "response",
        "result",
        "body",
        "value",
      ]
    ) {
      if (
        isObject(
          value[key]
        )
      ) {
        queue.push({
          value:
            value[key],
          depth:
            depth + 1,
        });
      }
    }
  }

  return [];
}

function normalizeSearchUsers(
  payload = null
) {
  const rawItems =
    usersListFromPayload(
      payload
    );

  let normalizedItems =
    rawItems;

  try {
    normalizedItems =
      normalizeUsuariosCollection(
        rawItems
      );
  } catch {
    normalizedItems =
      rawItems;
  }

  const map =
    new Map();

  for (
    const raw
    of safeArray(
      normalizedItems
    )
  ) {
    const user =
      normalizeSearchUser(
        raw
      );

    const id =
      cleanText(
        first(
          user.userId,
          user.id,
          ""
        ),
        ""
      );

    if (!id) {
      continue;
    }

    if (
      !map.has(id)
    ) {
      map.set(
        id,
        user
      );
    }
  }

  return [
    ...map.values(),
  ];
}

/* =========================================================
   INSTANCE REGISTRY
========================================================= */

function storeInstance(
  host = null,
  controller = null
) {
  if (
    !host ||
    !controller
  ) {
    return false;
  }

  INSTANCES.set(
    host,
    controller
  );

  lastInstance =
    controller;

  try {
    getGlobalObject()[
      CLIENTES_GLOBAL_CONTROLLER_KEY
    ] =
      controller;
  } catch {
    // noop
  }

  return true;
}

function clearInstance(
  host = null,
  controller = null
) {
  if (
    host &&
    INSTANCES.get(host) ===
      controller
  ) {
    INSTANCES.delete(host);
  }

  if (
    lastInstance ===
      controller
  ) {
    lastInstance =
      null;
  }

  try {
    const global =
      getGlobalObject();

    if (
      global[
        CLIENTES_GLOBAL_CONTROLLER_KEY
      ] === controller
    ) {
      delete global[
        CLIENTES_GLOBAL_CONTROLLER_KEY
      ];
    }
  } catch {
    // noop
  }

  return true;
}

/* =========================================================
   CONTROLLER
========================================================= */

function createClientesController(
  host = null,
  context = {}
) {
  const id =
    ++controllerSequence;

  const ownerId =
    `${CLIENTES_INDEX_VERSION}:${id}`;

  const ownerToken =
    Object.freeze({
      type:
        "clientes-controller-owner",
      id,
      version:
        CLIENTES_INDEX_VERSION,
    });

  const cached =
    hydrateClientesFromCache({
      freshOnly: true,
    });

  let destroyed = false;
  let mounted = false;

  let root =
    resolveHost(
      host,
      context
    );

  let currentContext =
    safeObject(
      context,
      {}
    );

  let items =
    normalizeClientesCollection(
      safeArray(
        cached?.items
      )
    );

  let total =
    items.length;

  let lastSyncAt =
    number(
      cached?.lastSyncAt,
      0
    );

  let loading = false;
  let refreshing = false;
  let creating = false;
  let loadingMore = false;

  let error = "";

  let filter = "all";
  let search = "";

  let sortOrder =
    DEFAULT_SORT_ORDER;

  let visibleLimit =
    DEFAULT_VISIBLE_LIMIT;

  let openingClienteId = "";

  let renderFrame = 0;
  let modalFrame = 0;

  let searchTimer = 0;
  let userSearchTimer = 0;

  let externalCreateRefreshTimer = 0;
  let loadSeq = 0;
  let userSearchSeq = 0;
  let createSeq = 0;
  let detailSeq = 0;

  let loadPromise = null;
  let queuedForceRefresh = false;

  let modalHost = null;
  let modalHostBound = false;

  let createReturnFocus = null;
  let deferredMainRender = false;

  let lastExternalCreateKey = "";
  let lastExternalCreateAt = 0;

  const disposers = [];

  const createModal = {
    open: false,
    submitting: false,
    serverError: "",
    successMessage: "",
    createdClienteId: "",
    errors: {},

    form:
      getCreateFormDefaults(),

    userSearch: {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser: null,
      empty: false,
    },
  };

  /* ---------------------------------------------------------
     OWNERSHIP / ROUTE
  --------------------------------------------------------- */

  function ownsRoot() {
    return Boolean(
      root &&
      root[
        CLIENTES_ROOT_OWNER_KEY
      ] === ownerToken
    );
  }

  function claimRoot() {
    if (!root) {
      return false;
    }

    try {
      root[
        CLIENTES_ROOT_OWNER_KEY
      ] =
        ownerToken;

      root.dataset.view =
        "clientes";

      root.dataset.controllerId =
        String(id);

      root.dataset.clientesOwner =
        ownerId;

      return true;
    } catch {
      return false;
    }
  }

  function releaseRoot() {
    if (
      !root ||
      !ownsRoot()
    ) {
      return false;
    }

    try {
      delete root[
        CLIENTES_ROOT_OWNER_KEY
      ];
    } catch {
      try {
        root[
          CLIENTES_ROOT_OWNER_KEY
        ] = null;
      } catch {
        // noop
      }
    }

    try {
      if (
        root.dataset
          .clientesOwner ===
        ownerId
      ) {
        delete root.dataset
          .clientesOwner;
      }
    } catch {
      // noop
    }

    return true;
  }

  function assertAlive() {
    return Boolean(
      !destroyed &&
      isClientesRoute(
        currentContext
      )
    );
  }

  function assertRenderable() {
    return Boolean(
      assertAlive() &&
      root &&
      ownsRoot()
    );
  }

  function setHost(
    nextHost = null
  ) {
    const resolved =
      resolveHost(
        nextHost,
        currentContext
      );

    if (
      resolved &&
      resolved !== root
    ) {
      if (
        root &&
        ownsRoot()
      ) {
        releaseRoot();
      }

      root =
        resolved;
    }

    return root;
  }

  /* ---------------------------------------------------------
     PAYLOAD / SNAPSHOT
  --------------------------------------------------------- */

  function payload(
    extra = {}
  ) {
    return {
      id,

      user:
        getCurrentUser(),

      role:
        getCurrentRole(
          currentContext
        ),

      admin:
        isAdminContext(
          currentContext
        ),

      routes:
        getRoutes(),

      route:
        getRoutes().clientes,

      context:
        currentContext,

      items,
      clientes:
        items,

      clients:
        items,

      rows:
        items,

      total,
      remoteCount:
        total,

      count:
        items.length,

      stats:
        computeClientesStats(
          items
        ),

      lastSyncAt,

      loading,
      refreshing,
      creating,
      loadingMore,
      error,

      filter,
      search,
      sortOrder,
      visibleLimit,
      openingClienteId,

      createModal,

      modals: {
        create:
          createModal,
      },

      apiVersion:
        CLIENTES_API_VERSION,

      indexVersion:
        CLIENTES_INDEX_VERSION,

      ...extra,
    };
  }

  function getSnapshot() {
    return {
      ...payload(),

      items:
        cloneItems(items),

      clientes:
        cloneItems(items),

      clients:
        cloneItems(items),

      rows:
        cloneItems(items),

      mounted,
      destroyed,

      safeguards: {
        rootOwnership:
          true,

        modalOwnership:
          true,

        detailRaceGuard:
          true,

        routeGuardAfterAwait:
          true,

        createRefreshSingleFlight:
          true,

        externalCreateDedupe:
          true,

        visibleLimitMax:
          CLIENTES_MAX_LIMIT,

        backendMutationContract:
          "GET_LIST_GET_DETAIL_POST_CREATE",

        noFakeCreateDetail:
          true,
      },
    };
  }

  /* ---------------------------------------------------------
     MAIN FOCUS
  --------------------------------------------------------- */

  function captureMainFocus() {
    if (
      !isBrowser() ||
      !root ||
      !ownsRoot()
    ) {
      return null;
    }

    const active =
      document.activeElement;

    if (
      !active ||
      !root.contains(active)
    ) {
      return null;
    }

    const isSearch =
      active.matches?.(
        "[data-clientes-search-input], [data-clientes-field='search'], [data-search-input='clientes']"
      );

    if (!isSearch) {
      return null;
    }

    return {
      type:
        "search",

      start:
        Number.isInteger(
          active.selectionStart
        )
          ? active.selectionStart
          : null,

      end:
        Number.isInteger(
          active.selectionEnd
        )
          ? active.selectionEnd
          : null,
    };
  }

  function restoreMainFocus(
    snapshot = null
  ) {
    if (
      !snapshot ||
      !assertRenderable()
    ) {
      return false;
    }

    if (
      snapshot.type !==
      "search"
    ) {
      return false;
    }

    const target =
      root.querySelector(
        "[data-clientes-search-input='true'], [data-clientes-field='search'], [data-search-input='clientes']"
      );

    if (!target) {
      return false;
    }

    try {
      target.focus({
        preventScroll: true,
      });

      if (
        snapshot.start !==
          null &&
        snapshot.end !==
          null &&
        isFunction(
          target.setSelectionRange
        )
      ) {
        const max =
          String(
            target.value ||
            ""
          ).length;

        target.setSelectionRange(
          Math.min(
            snapshot.start,
            max
          ),
          Math.min(
            snapshot.end,
            max
          )
        );
      }

      return true;
    } catch {
      return false;
    }
  }

  /* ---------------------------------------------------------
     MAIN RENDER
  --------------------------------------------------------- */

  function renderNow({
    allowWhileCreate = false,
  } = {}) {
    if (
      !assertRenderable()
    ) {
      return false;
    }

    cancelFrame(
      renderFrame
    );

    renderFrame = 0;

    if (
      createModal.open &&
      !allowWhileCreate
    ) {
      deferredMainRender =
        true;

      return false;
    }

    const focusSnapshot =
      captureMainFocus();

    const data =
      payload();

    const initialLoading =
      loading &&
      !items.length;

    const hardError =
      Boolean(error) &&
      !items.length;

    try {
      root.innerHTML =
        initialLoading
          ? renderClientesLoadingState(
              data
            )
          : hardError
            ? renderClientesErrorState(
                data
              )
            : renderClientesTemplate(
                data
              );

      root.dataset.view =
        "clientes";

      root.dataset.controllerId =
        String(id);

      root.dataset.clientesOwner =
        ownerId;

      root.dataset.clientesVersion =
        CLIENTES_INDEX_VERSION;

      root.dataset.clientesApiVersion =
        CLIENTES_API_VERSION;

      restoreMainFocus(
        focusSnapshot
      );

      deferredMainRender =
        false;

      return true;
    } catch (renderError) {
      error =
        safeError(
          renderError,
          "No se pudo renderizar la vista de clientes."
        );

      try {
        root.innerHTML =
          renderClientesErrorState({
            ...data,
            error,
          });
      } catch {
        root.textContent =
          error;
      }

      return false;
    }
  }

  function scheduleRender(
    options = {}
  ) {
    if (
      !assertRenderable()
    ) {
      return 0;
    }

    if (
      createModal.open &&
      options.allowWhileCreate !==
        true
    ) {
      deferredMainRender =
        true;

      return 0;
    }

    cancelFrame(
      renderFrame
    );

    renderFrame =
      nextFrame(
        () => {
          renderFrame = 0;

          renderNow(
            options
          );
        }
      );

    return renderFrame;
  }

  function flushDeferredMainRender() {
    if (
      !deferredMainRender ||
      createModal.open ||
      !assertRenderable()
    ) {
      return false;
    }

    deferredMainRender =
      false;

    return renderNow({
      allowWhileCreate:
        true,
    });
  }

  function setItems(
    nextItems = [],
    {
      syncedAt =
        Date.now(),
    } = {}
  ) {
    items =
      normalizeClientesCollection(
        nextItems
      );

    total =
      items.length;

    lastSyncAt =
      number(
        syncedAt,
        Date.now()
      );

    error = "";

    return items;
  }

  /* ---------------------------------------------------------
     LOAD / REFRESH
  --------------------------------------------------------- */

  async function runLoad({
    force = false,
    silent = false,
  } = {}) {
    if (
      !assertAlive()
    ) {
      return getSnapshot();
    }

    const seq =
      ++loadSeq;

    const hadItems =
      items.length > 0;

    loading =
      !silent &&
      !hadItems;

    refreshing =
      Boolean(
        silent ||
        hadItems
      );

    error = "";

    renderNow();

    try {
      const response =
        force
          ? await refreshClientesRequest({
              source:
                "views.clientes.index.refresh",
            })
          : await loadClientesRequest({
              force: false,
              source:
                "views.clientes.index.load",
            });

      if (
        seq !== loadSeq ||
        destroyed ||
        !isClientesRoute(
          currentContext
        )
      ) {
        return getSnapshot();
      }

      setItems(
        safeArray(
          response?.items
        ),
        {
          syncedAt:
            response?.lastSyncAt ||
            Date.now(),
        }
      );

      const snapshot =
        getSnapshot();

      emitEvent(
        "clientes:loaded",
        {
          ...snapshot,
          source:
            CLIENTES_INDEX_SOURCE,
          controllerId:
            id,
        }
      );

      emitEvent(
        "clientes:list:success",
        {
          ...snapshot,
          source:
            CLIENTES_INDEX_SOURCE,
          controllerId:
            id,
        }
      );

      return snapshot;
    } catch (loadError) {
      if (
        seq !== loadSeq ||
        destroyed ||
        !isClientesRoute(
          currentContext
        )
      ) {
        return getSnapshot();
      }

      error =
        safeError(
          loadError
        );

      emitEvent(
        "clientes:error",
        {
          error:
            loadError,

          message:
            error,

          source:
            CLIENTES_INDEX_SOURCE,

          controllerId:
            id,
        }
      );

      return getSnapshot();
    } finally {
      if (
        seq === loadSeq &&
        !destroyed
      ) {
        loading = false;
        refreshing = false;

        if (
          assertRenderable()
        ) {
          renderNow();
        }
      }
    }
  }

  function load({
    force = false,
    silent = false,
  } = {}) {
    if (
      !assertAlive()
    ) {
      return Promise.resolve(
        getSnapshot()
      );
    }

    if (loadPromise) {
      if (force) {
        queuedForceRefresh =
          true;
      }

      return loadPromise;
    }

    loadPromise =
      runLoad({
        force,
        silent,
      })
        .finally(
          () => {
            loadPromise =
              null;

            if (
              queuedForceRefresh &&
              assertAlive()
            ) {
              queuedForceRefresh =
                false;

              void load({
                force: true,
                silent: true,
              });
            }
          }
        );

    return loadPromise;
  }

  async function refresh() {
    return load({
      force: true,
      silent: true,
    });
  }

  /* ---------------------------------------------------------
     PRESENTATION
  --------------------------------------------------------- */

  function setSearch(
    value = ""
  ) {
    search =
      cleanText(
        value,
        ""
      );

    visibleLimit =
      DEFAULT_VISIBLE_LIMIT;

    scheduleRender();

    return search;
  }

  function setFilter(
    value = "all"
  ) {
    const next =
      normalizeKey(
        value ||
        "all"
      ) ||
      "all";

    filter =
      [
        "all",
        "active",
        "pending",
        "blocked",
      ].includes(next)
        ? next
        : "all";

    visibleLimit =
      DEFAULT_VISIBLE_LIMIT;

    scheduleRender();

    return filter;
  }

  function setSortOrder(
    value =
      DEFAULT_SORT_ORDER
  ) {
    sortOrder =
      normalizeSortOrder(
        value
      );

    visibleLimit =
      DEFAULT_VISIBLE_LIMIT;

    scheduleRender();

    return sortOrder;
  }

  function toggleSortOrder() {
    return setSortOrder(
      getNextSortOrder(
        sortOrder
      )
    );
  }

  function clearSearch() {
    return setSearch("");
  }

  function clearFilters() {
    search = "";
    filter = "all";
    sortOrder =
      DEFAULT_SORT_ORDER;

    visibleLimit =
      DEFAULT_VISIBLE_LIMIT;

    scheduleRender();

    return true;
  }

  function loadMore(
    limit = null
  ) {
    loadingMore =
      true;

    visibleLimit =
      clamp(
        number(
          limit,
          visibleLimit +
          VISIBLE_STEP
        ),
        1,
        CLIENTES_MAX_LIMIT
      );

    scheduleRender();

    if (isBrowser()) {
      window.setTimeout(
        () => {
          if (
            destroyed
          ) {
            return;
          }

          loadingMore =
            false;

          scheduleRender();
        },
        120
      );
    } else {
      loadingMore =
        false;
    }

    return visibleLimit;
  }

  /* ---------------------------------------------------------
     CREATE MODAL HOST
  --------------------------------------------------------- */

  function createModalPayload(
    extra = {}
  ) {
    return {
      ...createModal,

      admin:
        isAdminContext(
          currentContext
        ),

      role:
        getCurrentRole(
          currentContext
        ),

      user:
        getCurrentUser(),

      routes:
        getRoutes(),

      ...extra,
    };
  }

  function detailModalPresent() {
    if (!isBrowser()) {
      return false;
    }

    try {
      return Boolean(
        document.querySelector(
          "[data-clientes-detail-modal-host='true'] [data-clientes-modal-root='true'][data-open='true']"
        )
      );
    } catch {
      return false;
    }
  }

  function syncBodyModalClass() {
    if (!isBrowser()) {
      return false;
    }

    try {
      const createOpen =
        createModal.open ===
        true;

      const anyOpen =
        createOpen ||
        detailModalPresent();

      document.body
        ?.classList
        .toggle(
          "modal-open",
          anyOpen
        );

      document.body
        ?.classList
        .toggle(
          "clientes-modal-open",
          anyOpen
        );

      document.body
        ?.classList
        .toggle(
          "clientes-create-open",
          createOpen
        );

      return true;
    } catch {
      return false;
    }
  }

  function ensureModalHost() {
    if (!isBrowser()) {
      return null;
    }

    if (
      modalHost?.isConnected &&
      modalHost.dataset
        ?.owner === ownerId
    ) {
      return modalHost;
    }

    modalHost =
      document.createElement(
        "div"
      );

    modalHost.setAttribute(
      "data-clientes-modal-host",
      "true"
    );

    modalHost.setAttribute(
      "data-owner",
      ownerId
    );

    modalHost.setAttribute(
      "data-controller-id",
      String(id)
    );

    document.body
      .appendChild(
        modalHost
      );

    if (!modalHostBound) {
      modalHost.addEventListener(
        "click",
        handleModalClick,
        true
      );

      modalHost.addEventListener(
        "submit",
        handleModalSubmit,
        true
      );

      modalHost.addEventListener(
        "input",
        handleModalInput,
        true
      );

      modalHost.addEventListener(
        "change",
        handleModalInput,
        true
      );

      modalHost.addEventListener(
        "keydown",
        handleModalKeydown,
        true
      );

      modalHostBound =
        true;
    }

    return modalHost;
  }

  function removeModalHost() {
    cancelFrame(
      modalFrame
    );

    modalFrame = 0;

    if (!modalHost) {
      return false;
    }

    const owned =
      modalHost.dataset
        ?.owner === ownerId;

    if (!owned) {
      modalHost =
        null;

      modalHostBound =
        false;

      return false;
    }

    try {
      if (
        modalHostBound
      ) {
        modalHost.removeEventListener(
          "click",
          handleModalClick,
          true
        );

        modalHost.removeEventListener(
          "submit",
          handleModalSubmit,
          true
        );

        modalHost.removeEventListener(
          "input",
          handleModalInput,
          true
        );

        modalHost.removeEventListener(
          "change",
          handleModalInput,
          true
        );

        modalHost.removeEventListener(
          "keydown",
          handleModalKeydown,
          true
        );
      }

      modalHost
        .replaceChildren();

      modalHost.remove();
    } catch {
      // noop
    }

    modalHost =
      null;

    modalHostBound =
      false;

    return true;
  }

  function captureCreateReturnFocus(
    node = null
  ) {
    if (!isBrowser()) {
      return false;
    }

    const candidate =
      node?.isConnected
        ? node
        : document.activeElement;

    if (
      candidate &&
      candidate !==
        document.body &&
      candidate !==
        document.documentElement &&
      isFunction(
        candidate.focus
      )
    ) {
      createReturnFocus =
        candidate;

      return true;
    }

    createReturnFocus =
      null;

    return false;
  }

  function restoreCreateReturnFocus() {
    const target =
      createReturnFocus;

    createReturnFocus =
      null;

    if (
      !target ||
      !target.isConnected ||
      !isFunction(
        target.focus
      )
    ) {
      return false;
    }

    nextFrame(
      () => {
        try {
          target.focus({
            preventScroll:
              true,
          });
        } catch {
          try {
            target.focus();
          } catch {
            // noop
          }
        }
      }
    );

    return true;
  }

  function captureModalFocus(
    hostNode = null
  ) {
    if (
      !hostNode ||
      !isBrowser()
    ) {
      return null;
    }

    const active =
      document.activeElement;

    if (
      !active ||
      !hostNode.contains(
        active
      )
    ) {
      return null;
    }

    const field =
      cleanText(
        active.getAttribute?.(
          "data-field"
        ) ||
        active.getAttribute?.(
          "name"
        ),
        ""
      );

    if (!field) {
      return null;
    }

    return {
      field,

      start:
        Number.isInteger(
          active.selectionStart
        )
          ? active.selectionStart
          : null,

      end:
        Number.isInteger(
          active.selectionEnd
        )
          ? active.selectionEnd
          : null,
    };
  }

  function restoreModalFocus(
    hostNode = null,
    snapshot = null
  ) {
    if (
      !hostNode ||
      !snapshot?.field
    ) {
      return false;
    }

    const target =
      Array.from(
        hostNode.querySelectorAll(
          "[data-field], [name]"
        ) ||
        []
      ).find(
        (node) =>
          cleanText(
            node.getAttribute?.(
              "data-field"
            ) ||
            node.getAttribute?.(
              "name"
            ),
            ""
          ) ===
          snapshot.field
      );

    if (!target) {
      return false;
    }

    try {
      target.focus({
        preventScroll:
          true,
      });

      if (
        snapshot.start !==
          null &&
        snapshot.end !==
          null &&
        isFunction(
          target.setSelectionRange
        )
      ) {
        const max =
          String(
            target.value ||
            ""
          ).length;

        target.setSelectionRange(
          Math.min(
            snapshot.start,
            max
          ),
          Math.min(
            snapshot.end,
            max
          )
        );
      }

      return true;
    } catch {
      return false;
    }
  }

  function focusableModalElements() {
    if (!modalHost) {
      return [];
    }

    const panel =
      modalHost.querySelector(
        CREATE_MODAL_PANEL_SELECTOR
      );

    if (!panel) {
      return [];
    }

    return Array.from(
      panel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter(
      (element) =>
        !element.hidden &&
        element.getAttribute?.(
          "aria-hidden"
        ) !== "true"
    );
  }

  function trapCreateFocus(
    event = null
  ) {
    if (
      event?.key !== "Tab" ||
      !createModal.open ||
      !modalHost
    ) {
      return false;
    }

    const panel =
      modalHost.querySelector(
        CREATE_MODAL_PANEL_SELECTOR
      );

    if (!panel) {
      return false;
    }

    const focusable =
      focusableModalElements();

    if (!focusable.length) {
      event.preventDefault();

      panel.focus?.();

      return true;
    }

    const firstNode =
      focusable[0];

    const lastNode =
      focusable[
        focusable.length - 1
      ];

    const active =
      document.activeElement;

    if (
      !panel.contains(
        active
      )
    ) {
      event.preventDefault();

      (
        event.shiftKey
          ? lastNode
          : firstNode
      ).focus?.();

      return true;
    }

    if (
      event.shiftKey &&
      active === firstNode
    ) {
      event.preventDefault();
      lastNode.focus?.();

      return true;
    }

    if (
      !event.shiftKey &&
      active === lastNode
    ) {
      event.preventDefault();
      firstNode.focus?.();

      return true;
    }

    return false;
  }

  function renderCreateModalNow() {
    if (
      destroyed
    ) {
      return false;
    }

    if (
      !createModal.open
    ) {
      removeModalHost();
      syncBodyModalClass();

      return true;
    }

    const hostNode =
      ensureModalHost();

    if (!hostNode) {
      return false;
    }

    const focusSnapshot =
      captureModalFocus(
        hostNode
      );

    try {
      hostNode.innerHTML =
        renderClientesCreateModal(
          createModalPayload()
        );

      syncBodyModalClass();

      if (
        !restoreModalFocus(
          hostNode,
          focusSnapshot
        )
      ) {
        try {
          hostNode
            .querySelector(
              CREATE_MODAL_PANEL_SELECTOR
            )
            ?.focus?.({
              preventScroll:
                true,
            });
        } catch {
          // noop
        }
      }

      return true;
    } catch (renderError) {
      createModal.serverError =
        safeError(
          renderError,
          "No se pudo renderizar el formulario de cliente."
        );

      hostNode.textContent =
        createModal.serverError;

      syncBodyModalClass();

      return false;
    }
  }

  function scheduleCreateModalRender() {
    cancelFrame(
      modalFrame
    );

    modalFrame =
      nextFrame(
        () => {
          modalFrame = 0;
          renderCreateModalNow();
        }
      );

    return modalFrame;
  }

  function resetCreateModalForm() {
    createModal.submitting =
      false;

    createModal.serverError =
      "";

    createModal.successMessage =
      "";

    createModal.createdClienteId =
      "";

    createModal.errors =
      {};

    createModal.form =
      getCreateFormDefaults();

    createModal.userSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser: null,
      empty: false,
    };

    return createModal;
  }

  function openCreate(
    openerNode = null
  ) {
    if (
      !isAdminContext(
        currentContext
      )
    ) {
      showToast(
        "No tienes permisos para crear clientes.",
        "error"
      );

      return false;
    }

    if (
      createModal.open
    ) {
      return true;
    }

    captureCreateReturnFocus(
      openerNode
    );

    resetCreateModalForm();

    createModal.open =
      true;

    creating =
      false;

    /*
       El modal es isla DOM.
       No repintamos la vista detrás al abrirlo.
    */
    renderCreateModalNow();

    emitEvent(
      "clientes:create:open",
      {
        source:
          CLIENTES_INDEX_SOURCE,

        controllerId:
          id,
      }
    );

    return true;
  }

  function closeCreate({
    reset = true,
    emit = true,
    renderView = true,
    force = false,
  } = {}) {
    if (
      createModal.submitting &&
      !force
    ) {
      return false;
    }

    userSearchSeq += 1;
    createSeq += 1;

    if (
      isBrowser()
    ) {
      window.clearTimeout?.(
        userSearchTimer
      );
    }

    createModal.open =
      false;

    createModal.submitting =
      false;

    if (reset) {
      resetCreateModalForm();
    }

    removeModalHost();
    syncBodyModalClass();

    if (
      renderView &&
      deferredMainRender
    ) {
      flushDeferredMainRender();
    }

    if (emit) {
      emitEvent(
        "clientes:create:closed",
        {
          source:
            CLIENTES_INDEX_SOURCE,

          controllerId:
            id,
        }
      );
    }

    restoreCreateReturnFocus();

    return true;
  }

  function readCreateForm(
    formNode = null
  ) {
    const output = {
      ...safeObject(
        createModal.form
      ),
    };

    if (!formNode) {
      return output;
    }

    const fields =
      Array.from(
        formNode.querySelectorAll(
          "[data-field][name], [data-field]"
        ) ||
        []
      );

    for (
      const field
      of fields
    ) {
      const name =
        cleanText(
          field.getAttribute?.(
            "data-field"
          ) ||
          field.getAttribute?.(
            "name"
          ) ||
          "",
          ""
        );

      if (!name) {
        continue;
      }

      const tagName =
        cleanText(
          field.tagName,
          ""
        ).toLowerCase();

      const type =
        cleanText(
          field.type,
          ""
        ).toLowerCase();

      if (
        tagName === "input" &&
        type === "checkbox"
      ) {
        output[name] =
          Boolean(
            field.checked
          );

        continue;
      }

      if (
        tagName === "input" &&
        type === "radio"
      ) {
        if (
          field.checked
        ) {
          output[name] =
            field.value;
        }

        continue;
      }

      if (
        "value" in field
      ) {
        output[name] =
          field.value;
      }
    }

    output.userId =
      cleanText(
        first(
          output.userId,
          output.targetUserId,
          ""
        ),
        ""
      );

    output.targetUserId =
      cleanText(
        first(
          output.targetUserId,
          output.userId,
          ""
        ),
        ""
      );

    return output;
  }

  function patchCreateForm(
    patch = {}
  ) {
    createModal.form = {
      ...safeObject(
        createModal.form
      ),

      ...safeObject(
        patch
      ),
    };

    return createModal.form;
  }

  function autoReplace(
    current = "",
    previous = "",
    next = ""
  ) {
    const currentText =
      cleanText(
        current,
        ""
      );

    const previousText =
      cleanText(
        previous,
        ""
      );

    if (
      !currentText ||
      (
        previousText &&
        currentText ===
          previousText
      )
    ) {
      return next;
    }

    return current;
  }

  function selectCreateUserFromNode(
    node = null
  ) {
    if (!node) {
      return false;
    }

    const previous =
      normalizeSearchUser(
        createModal.userSearch
          .selectedUser ||
        {}
      );

    const selectedUser =
      normalizeSearchUser({
        userId:
          node.dataset.userId ||
          "",

        clienteId:
          node.dataset
            .userClienteId ||
          node.dataset
            .clienteId ||
          "",

        displayName:
          node.dataset
            .userName ||
          "",

        email:
          node.dataset
            .userEmail ||
          node.dataset
            .email ||
          "",

        phone:
          node.dataset
            .userPhone ||
          "",

        username:
          node.dataset
            .userUsername ||
          "",

        avatarUrl:
          node.dataset
            .userAvatar ||
          "",
      });

    const selectedId =
      cleanText(
        first(
          selectedUser.userId,
          selectedUser.id,
          ""
        ),
        ""
      );

    if (!selectedId) {
      return false;
    }

    const name =
      cleanText(
        first(
          selectedUser
            .displayName,
          selectedUser.name,
          ""
        ),
        ""
      );

    const email =
      normalizeEmail(
        selectedUser.email
      );

    const phone =
      cleanText(
        first(
          selectedUser.phone,
          selectedUser.telefono,
          ""
        ),
        ""
      );

    const username =
      cleanText(
        first(
          selectedUser.username,
          selectedUser
            .usernameLower,
          ""
        ),
        ""
      ).toLowerCase();

    patchCreateForm({
      targetUserId:
        selectedId,

      userId:
        selectedId,

      targetClienteId:
        selectedUser
          .clienteId ||
        selectedUser
          .targetClienteId ||
        "",

      targetUserName:
        name,

      targetUserEmail:
        email,

      targetUserPhone:
        phone,

      targetUsername:
        username,

      targetUserAvatar:
        selectedUser
          .avatarUrl ||
        selectedUser.avatar ||
        "",

      contactoNombre:
        autoReplace(
          createModal.form
            .contactoNombre,
          previous
            .displayName ||
          previous.name,
          name
        ),

      contactoEmail:
        autoReplace(
          normalizeEmail(
            createModal.form
              .contactoEmail
          ),
          normalizeEmail(
            previous.email
          ),
          email
        ),

      contactoPhone:
        autoReplace(
          createModal.form
            .contactoPhone,
          previous.phone ||
          previous.telefono,
          phone
        ),

      emailFacturacion:
        autoReplace(
          normalizeEmail(
            createModal.form
              .emailFacturacion
          ),
          normalizeEmail(
            previous.email
          ),
          email
        ),

      username:
        autoReplace(
          createModal.form
            .username,
          previous.username,
          username
        ),

      slug:
        autoReplace(
          createModal.form
            .slug,
          previous.username,
          username
        ),
    });

    createModal.userSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser,
      empty: false,
    };

    const nextErrors = {
      ...safeObject(
        createModal.errors
      ),
    };

    delete nextErrors.userId;
    delete nextErrors
      .targetUserId;
    delete nextErrors
      .targetUser;

    createModal.errors =
      nextErrors;

    scheduleCreateModalRender();

    return true;
  }

  function clearCreateUser() {
    const selected =
      normalizeSearchUser(
        createModal.userSearch
          .selectedUser ||
        {}
      );

    const patch = {
      targetUserId: "",
      userId: "",
      targetClienteId: "",
      targetUserName: "",
      targetUserEmail: "",
      targetUserPhone: "",
      targetUsername: "",
      targetUserAvatar: "",
    };

    if (
      cleanText(
        createModal.form
          .contactoNombre,
        ""
      ) ===
      cleanText(
        selected
          .displayName ||
        selected.name,
        ""
      )
    ) {
      patch.contactoNombre =
        "";
    }

    if (
      normalizeEmail(
        createModal.form
          .contactoEmail
      ) ===
      normalizeEmail(
        selected.email
      )
    ) {
      patch.contactoEmail =
        "";

      patch.email =
        "";

      patch.emailCliente =
        "";
    }

    if (
      cleanText(
        createModal.form
          .contactoPhone,
        ""
      ) ===
      cleanText(
        selected.phone ||
        selected.telefono,
        ""
      )
    ) {
      patch.contactoPhone =
        "";

      patch.phone =
        "";

      patch.telefono =
        "";
    }

    if (
      normalizeEmail(
        createModal.form
          .emailFacturacion
      ) ===
      normalizeEmail(
        selected.email
      )
    ) {
      patch.emailFacturacion =
        "";
    }

    if (
      cleanText(
        createModal.form
          .username,
        ""
      ) ===
      cleanText(
        selected.username,
        ""
      )
    ) {
      patch.username =
        "";
    }

    if (
      cleanText(
        createModal.form.slug,
        ""
      ) ===
      cleanText(
        selected.username,
        ""
      )
    ) {
      patch.slug =
        "";
    }

    patchCreateForm(
      patch
    );

    createModal.userSearch = {
      query: "",
      loading: false,
      error: "",
      results: [],
      selectedUser: null,
      empty: false,
    };

    scheduleCreateModalRender();

    return true;
  }

  function copySelectedUserContact() {
    const user =
      normalizeSearchUser(
        createModal.userSearch
          .selectedUser ||
        {}
      );

    if (
      !user.userId &&
      !user.id
    ) {
      return false;
    }

    patchCreateForm({
      contactoNombre:
        cleanText(
          first(
            user.displayName,
            user.name,
            createModal.form
              .contactoNombre
          ),
          createModal.form
            .contactoNombre
        ),

      contactoEmail:
        normalizeEmail(
          first(
            user.email,
            createModal.form
              .contactoEmail
          )
        ),

      contactoPhone:
        cleanText(
          first(
            user.phone,
            user.telefono,
            createModal.form
              .contactoPhone
          ),
          createModal.form
            .contactoPhone
        ),

      emailFacturacion:
        normalizeEmail(
          first(
            user.email,
            createModal.form
              .emailFacturacion
          )
        ),

      username:
        cleanText(
          first(
            user.username,
            createModal.form
              .username
          ),
          createModal.form
            .username
        ).toLowerCase(),

      slug:
        cleanText(
          first(
            user.username,
            createModal.form.slug
          ),
          createModal.form.slug
        ).toLowerCase(),
    });

    scheduleCreateModalRender();

    return true;
  }

  function scheduleCreateUserSearch(
    query = ""
  ) {
    const q =
      cleanText(
        query,
        ""
      );

    createModal.userSearch.query =
      q;

    if (
      isBrowser()
    ) {
      window.clearTimeout?.(
        userSearchTimer
      );

      userSearchTimer =
        window.setTimeout(
          () => {
            userSearchTimer =
              0;

            void searchCreateUsers(
              q
            );
          },
          USER_SEARCH_DEBOUNCE_MS
        );
    } else {
      void searchCreateUsers(
        q
      );
    }

    return true;
  }

  async function searchCreateUsers(
    query = ""
  ) {
    const q =
      cleanText(
        query,
        ""
      );

    const seq =
      ++userSearchSeq;

    createModal.userSearch.query =
      q;

    createModal.userSearch.error =
      "";

    createModal.userSearch.empty =
      false;

    if (
      q.length <
      USER_SEARCH_MIN_LENGTH
    ) {
      createModal.userSearch.loading =
        false;

      createModal.userSearch.results =
        [];

      scheduleCreateModalRender();

      return [];
    }

    createModal.userSearch.loading =
      true;

    scheduleCreateModalRender();

    try {
      const response =
        await fetchUsuariosRequest({
          all: false,
          limit:
            USER_SEARCH_LIMIT,
          includeTotal:
            false,
          search:
            q,
          q,
          timeout:
            15_000,
        });

      if (
        seq !==
          userSearchSeq ||
        destroyed ||
        !createModal.open ||
        !isClientesRoute(
          currentContext
        )
      ) {
        return [];
      }

      const results =
        normalizeSearchUsers(
          response
        ).slice(
          0,
          USER_SEARCH_LIMIT
        );

      createModal.userSearch.loading =
        false;

      createModal.userSearch.error =
        "";

      createModal.userSearch.results =
        results;

      createModal.userSearch.empty =
        results.length === 0;

      scheduleCreateModalRender();

      return results;
    } catch (searchError) {
      if (
        seq !==
          userSearchSeq ||
        destroyed ||
        !createModal.open
      ) {
        return [];
      }

      createModal.userSearch.loading =
        false;

      createModal.userSearch.error =
        safeError(
          searchError,
          "No se pudieron buscar usuarios."
        );

      createModal.userSearch.results =
        [];

      createModal.userSearch.empty =
        false;

      scheduleCreateModalRender();

      return [];
    }
  }

  async function submitCreate(
    formNode = null
  ) {
    if (
      createModal.submitting
    ) {
      return false;
    }

    if (
      !isAdminContext(
        currentContext
      )
    ) {
      createModal.serverError =
        "No tienes permisos para crear clientes.";

      scheduleCreateModalRender();

      return false;
    }

    const form =
      readCreateForm(
        formNode
      );

    const validation =
      validateCreateForm(
        form
      );

    createModal.form =
      validation.form ||
      form;

    createModal.errors =
      safeObject(
        validation.errors,
        {}
      );

    createModal.serverError =
      "";

    createModal.successMessage =
      "";

    if (
      validation.valid !==
      true
    ) {
      scheduleCreateModalRender();
      return false;
    }

    const seq =
      ++createSeq;

    createModal.submitting =
      true;

    creating =
      true;

    scheduleCreateModalRender();

    try {
      const payloadToCreate =
        validation.payload ||
        buildClienteCreatePayload(
          validation.form ||
          form
        );

      const created =
        await createClienteRequest(
          payloadToCreate,
          {
            source:
              "views.clientes.index.create",
          }
        );

      if (
        seq !== createSeq ||
        destroyed ||
        !isClientesRoute(
          currentContext
        )
      ) {
        return false;
      }

      const createdId =
        cleanText(
          first(
            created
              ?.clienteId,
            created?.id,
            created?.data
              ?.clienteId,
            created?.data?.id,
            ""
          ),
          ""
        );

      if (!createdId) {
        throw new Error(
          "CLIENTE_CREATE_ID_MISSING"
        );
      }

      /*
         POST devuelve ACK.
         Sólo GET /:id puede proporcionar detalle real.
      */
      let finalDetail =
        null;

      try {
        finalDetail =
          await loadClienteDetailRequest(
            createdId,
            {
              dedupe: true,
            }
          );
      } catch {
        finalDetail =
          null;
      }

      if (
        seq !== createSeq ||
        destroyed ||
        !isClientesRoute(
          currentContext
        )
      ) {
        return false;
      }

      if (finalDetail) {
        items =
          upsertCliente(
            items,
            finalDetail
          );

        total =
          items.length;

        lastSyncAt =
          Date.now();
      }

      createModal.submitting =
        false;

      creating =
        false;

      createModal.createdClienteId =
        createdId;

      createModal.successMessage =
        `Cliente ${createdId} creado correctamente.`;

      createModal.serverError =
        "";

      createModal.errors =
        {};

      /*
         Un único evento canónico de éxito.
         Los listeners propios lo ignoran por source/controllerId.
      */
      emitEvent(
        "clientes:create:success",
        {
          cliente:
            finalDetail,

          detail:
            finalDetail,

          clienteId:
            createdId,

          response:
            created,

          draft:
            payloadToCreate,

          source:
            CLIENTES_INDEX_SOURCE,

          controllerId:
            id,
        }
      );

      showToast(
        createModal.successMessage,
        "success"
      );

      closeCreate({
        reset: true,
        emit: true,
        renderView: false,
        force: true,
      });

      /*
         ÚNICA reconciliación de red post-creación.
      */
      await refresh();

      if (
        assertRenderable()
      ) {
        renderNow({
          allowWhileCreate:
            true,
        });
      }

      return true;
    } catch (submitError) {
      if (
        seq !== createSeq ||
        destroyed
      ) {
        return false;
      }

      creating =
        false;

      createModal.submitting =
        false;

      createModal.serverError =
        safeError(
          submitError,
          "No se pudo crear el cliente."
        );

      createModal.successMessage =
        "";

      scheduleCreateModalRender();

      showToast(
        createModal.serverError,
        "error"
      );

      return false;
    }
  }

  function createActionFromTarget(
    target = null
  ) {
    if (
      !isElementNode(target)
    ) {
      return null;
    }

    const actionable =
      target.closest(
        "[data-create-action]"
      );

    if (
      !actionable ||
      !modalHost?.contains?.(
        actionable
      )
    ) {
      return null;
    }

    return {
      element:
        actionable,

      action:
        cleanText(
          actionable.getAttribute(
            "data-create-action"
          ) ||
          "",
          ""
        ),
    };
  }

  async function handleModalClick(
    event
  ) {
    if (
      !modalHost?.contains?.(
        event.target
      )
    ) {
      return;
    }

    const overlay =
      event.target
        ?.closest?.(
          CREATE_MODAL_OVERLAY_SELECTOR
        );

    if (
      overlay &&
      event.target ===
        overlay &&
      createModal.open &&
      !createModal.submitting
    ) {
      event.preventDefault();

      closeCreate();

      return;
    }

    const info =
      createActionFromTarget(
        event.target
      );

    if (
      !info?.action
    ) {
      return;
    }

    const {
      element,
      action,
    } = info;

    if (
      Object.values(
        CREATE_ACTIONS
      ).includes(action)
    ) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (
      action ===
      CREATE_ACTIONS.CLOSE
    ) {
      if (
        !createModal.submitting
      ) {
        closeCreate();
      }

      return;
    }

    if (
      action ===
      CREATE_ACTIONS.SUBMIT
    ) {
      const form =
        element.closest(
          "form"
        ) ||
        modalHost.querySelector(
          "[data-clientes-create-form='true']"
        );

      await submitCreate(
        form
      );

      return;
    }

    if (
      action ===
      CREATE_ACTIONS.USER_SELECT
    ) {
      selectCreateUserFromNode(
        element
      );

      return;
    }

    if (
      action ===
      CREATE_ACTIONS.USER_CLEAR
    ) {
      clearCreateUser();
      return;
    }

    if (
      action ===
      CREATE_ACTIONS.COPY_USER_CONTACT
    ) {
      copySelectedUserContact();
    }
  }

  function handleModalSubmit(
    event
  ) {
    if (
      !modalHost?.contains?.(
        event.target
      )
    ) {
      return;
    }

    const form =
      event.target
        ?.closest?.(
          "[data-clientes-create-form='true']"
        );

    if (!form) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    void submitCreate(
      form
    );
  }

  function handleModalInput(
    event
  ) {
    if (
      !modalHost?.contains?.(
        event.target
      )
    ) {
      return;
    }

    const target =
      event.target;

    if (
      !isElementNode(
        target
      )
    ) {
      return;
    }

    const field =
      cleanText(
        target.getAttribute(
          "data-field"
        ) ||
        target.getAttribute(
          "name"
        ) ||
        "",
        ""
      );

    if (!field) {
      return;
    }

    if (
      field ===
      "targetUserSearch"
    ) {
      scheduleCreateUserSearch(
        target.value ||
        ""
      );

      return;
    }

    const type =
      cleanText(
        target.type,
        ""
      ).toLowerCase();

    const value =
      type === "checkbox"
        ? Boolean(
            target.checked
          )
        : target.value;

    patchCreateForm({
      [field]:
        value,
    });

    if (
      createModal.errors[
        field
      ]
    ) {
      const nextErrors = {
        ...createModal.errors,
      };

      delete nextErrors[
        field
      ];

      createModal.errors =
        nextErrors;
    }

    createModal.serverError =
      "";

    if (
      field === "tipo"
    ) {
      patchCreateForm({
        clienteTipo:
          value,

        segmento:
          value,
      });

      scheduleCreateModalRender();
    }

    if (
      field ===
      "contactoEmail"
    ) {
      patchCreateForm({
        email:
          value,

        emailCliente:
          value,

        emailFacturacion:
          createModal.form
            .emailFacturacion ||
          value,
      });
    }

    if (
      field ===
      "contactoPhone"
    ) {
      patchCreateForm({
        phone:
          value,

        telefono:
          value,
      });
    }
  }

  function handleModalKeydown(
    event
  ) {
    if (
      !modalHost?.contains?.(
        event.target
      )
    ) {
      return;
    }

    if (
      event.key === "Tab"
    ) {
      trapCreateFocus(
        event
      );

      return;
    }

    if (
      event.key === "Escape" &&
      createModal.open &&
      !createModal.submitting
    ) {
      event.preventDefault();
      event.stopPropagation();

      closeCreate();
    }
  }

  /* ---------------------------------------------------------
     DETAIL
  --------------------------------------------------------- */

  function claimDetailOwnership() {
    try {
      getGlobalObject()[
        CLIENTES_DETAIL_OWNER_KEY
      ] =
        ownerToken;

      return true;
    } catch {
      return false;
    }
  }

  function ownsDetailModal() {
    try {
      return (
        getGlobalObject()[
          CLIENTES_DETAIL_OWNER_KEY
        ] === ownerToken
      );
    } catch {
      return false;
    }
  }

  function releaseDetailOwnership() {
    try {
      const global =
        getGlobalObject();

      if (
        global[
          CLIENTES_DETAIL_OWNER_KEY
        ] === ownerToken
      ) {
        delete global[
          CLIENTES_DETAIL_OWNER_KEY
        ];
      }

      return true;
    } catch {
      return false;
    }
  }

  async function openCliente(
    idValue = "",
    detail = null
  ) {
    const clienteId =
      cleanText(
        idValue ||
        getClienteId(
          detail
        ),
        ""
      );

    if (!clienteId) {
      return false;
    }

    if (
      openingClienteId ===
      clienteId
    ) {
      return true;
    }

    const seq =
      ++detailSeq;

    let current =
      detail ||
      findClienteByIdApi(
        items,
        clienteId
      );

    openingClienteId =
      clienteId;

    try {
      /*
         El detalle backend es admin.
         Usuario normal utiliza el snapshot visible sin provocar 403.
      */
      if (
        isAdminContext(
          currentContext
        )
      ) {
        try {
          current =
            await loadClienteDetailRequest(
              clienteId,
              {
                dedupe: true,
              }
            );
        } catch {
          /*
             Si falla el detalle y existe snapshot,
             abrimos lo que ya estaba visible.
          */
        }
      }

      if (
        seq !== detailSeq ||
        destroyed ||
        !isClientesRoute(
          currentContext
        ) ||
        !ownsRoot()
      ) {
        return false;
      }

      if (!current) {
        showToast(
          "No se pudo abrir el cliente.",
          "error"
        );

        return false;
      }

      const normalized =
        canonicalCliente(
          current
        );

      /*
         Guard final:
         el ID resuelto debe seguir siendo el pedido.
      */
      if (
        getClienteId(
          normalized
        ) !== clienteId
      ) {
        return false;
      }

      items =
        upsertCliente(
          items,
          normalized
        );

      total =
        items.length;

      /*
         Importante:
         no repintamos la tabla justo antes/después de abrir el modal.
         Así el bridge del modal conserva un return-focus DOM válido.
      */
      claimDetailOwnership();

      try {
        const opened =
          openClientesDetailModal(
            normalized
          );

        if (
          opened !== false
        ) {
          return true;
        }
      } catch {
        // fallback event
      }

      emitEvent(
        "clientes:modal:open",
        {
          detail:
            normalized,

          cliente:
            normalized,

          client:
            normalized,

          clienteId,

          id:
            clienteId,

          source:
            CLIENTES_INDEX_SOURCE,

          controllerId:
            id,
        }
      );

      return true;
    } finally {
      if (
        seq === detailSeq
      ) {
        openingClienteId =
          "";
      }
    }
  }

  /* ---------------------------------------------------------
     CSV EXPORT
  --------------------------------------------------------- */

  function exportCsv() {
    const rows =
      filterClientesForView(
        items,
        {
          filter,
          search,
          sortOrder,
        }
      );

    const csvRows = [
      [
        "ID",
        "Código",
        "Nombre",
        "Email",
        "Teléfono",
        "Ciudad",
        "NIF",
        "Estado",
        "Tipo",
        "Importe",
      ],
    ];

    for (
      const item
      of rows
    ) {
      csvRows.push([
        getClienteId(item),
        getClienteCode(item),
        getClienteName(item),
        getClienteEmail(item),
        getClientePhone(item),
        getClienteCity(item),
        getClienteNif(item),
        getClienteStatus(item),
        getClienteType(item),
        String(
          getClienteAmount(
            item
          )
        ).replace(
          ".",
          ","
        ),
      ]);
    }

    const csv =
      csvRows
        .map(
          (row) =>
            row
              .map(
                escapeCsv
              )
              .join(";")
        )
        .join("\n");

    if (!isBrowser()) {
      return csv;
    }

    try {
      const blob =
        new Blob(
          [
            `\ufeff${csv}`,
          ],
          {
            type:
              "text/csv;charset=utf-8",
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const link =
        document.createElement(
          "a"
        );

      link.href =
        url;

      link.download =
        `clientes-${new Date()
          .toISOString()
          .slice(0, 10)}.csv`;

      link.rel =
        "noopener";

      document.body
        .appendChild(
          link
        );

      link.click();
      link.remove();

      window.setTimeout(
        () => {
          try {
            URL.revokeObjectURL(
              url
            );
          } catch {
            // noop
          }
        },
        1000
      );

      showToast(
        "Clientes exportados.",
        "success"
      );

      return true;
    } catch {
      return csv;
    }
  }

  /* ---------------------------------------------------------
     ROOT EVENTS
  --------------------------------------------------------- */

  function actionFromTarget(
    target = null
  ) {
    if (
      !isElementNode(target)
    ) {
      return null;
    }

    const actionable =
      target.closest(
        "[data-clientes-action], [data-action]"
      );

    if (
      !actionable ||
      !root?.contains?.(
        actionable
      )
    ) {
      return null;
    }

    return {
      element:
        actionable,

      action:
        cleanText(
          actionable.getAttribute(
            "data-clientes-action"
          ) ||
          actionable.getAttribute(
            "data-action"
          ) ||
          "",
          ""
        ),
    };
  }

  async function handleClick(
    event
  ) {
    if (
      !ownsRoot()
    ) {
      return;
    }

    const info =
      actionFromTarget(
        event.target
      );

    if (
      !info?.action
    ) {
      return;
    }

    const {
      element,
      action,
    } = info;

    const managedActions = [
      CLIENTES_ACTIONS
        .OPEN_DETAIL,
      "detail",
      "open-client",
      "open-cliente",

      CLIENTES_ACTIONS
        .CREATE_OPEN,
      "create",
      "create-client",
      "create-cliente",

      CLIENTES_ACTIONS
        .REFRESH,
      "retry",

      CLIENTES_ACTIONS
        .EXPORT,
      "export-csv",

      CLIENTES_ACTIONS
        .FILTER,

      CLIENTES_ACTIONS
        .SORT_TOGGLE,

      CLIENTES_ACTIONS
        .CLEAR_SEARCH,

      CLIENTES_ACTIONS
        .CLEAR_FILTERS,

      CLIENTES_ACTIONS
        .LOAD_MORE,
    ];

    if (
      managedActions.includes(
        action
      )
    ) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (
      [
        CLIENTES_ACTIONS
          .OPEN_DETAIL,
        "detail",
        "open-client",
        "open-cliente",
      ].includes(action)
    ) {
      const row =
        element.closest(
          "[data-client-id], [data-cliente-id]"
        );

      const idTarget =
        element.getAttribute(
          "data-client-id"
        ) ||
        element.getAttribute(
          "data-cliente-id"
        ) ||
        row?.getAttribute(
          "data-client-id"
        ) ||
        row?.getAttribute(
          "data-cliente-id"
        ) ||
        "";

      await openCliente(
        idTarget
      );

      return;
    }

    if (
      [
        CLIENTES_ACTIONS
          .CREATE_OPEN,
        "create",
        "create-client",
        "create-cliente",
      ].includes(action)
    ) {
      openCreate(
        element
      );

      return;
    }

    if (
      [
        CLIENTES_ACTIONS
          .REFRESH,
        "retry",
      ].includes(action)
    ) {
      await refresh();
      return;
    }

    if (
      [
        CLIENTES_ACTIONS
          .EXPORT,
        "export-csv",
      ].includes(action)
    ) {
      exportCsv();
      return;
    }

    if (
      action ===
      CLIENTES_ACTIONS
        .FILTER
    ) {
      setFilter(
        element.getAttribute(
          "data-filter"
        ) ||
        "all"
      );

      return;
    }

    if (
      action ===
      CLIENTES_ACTIONS
        .SORT_TOGGLE
    ) {
      setSortOrder(
        element.getAttribute(
          "data-next-sort-order"
        ) ||
        getNextSortOrder(
          sortOrder
        )
      );

      return;
    }

    if (
      action ===
      CLIENTES_ACTIONS
        .CLEAR_SEARCH
    ) {
      clearSearch();
      return;
    }

    if (
      action ===
      CLIENTES_ACTIONS
        .CLEAR_FILTERS
    ) {
      clearFilters();
      return;
    }

    if (
      action ===
      CLIENTES_ACTIONS
        .LOAD_MORE
    ) {
      loadMore(
        element.getAttribute(
          "data-visible-limit"
        )
      );
    }
  }

  function handleInput(
    event
  ) {
    if (
      !ownsRoot()
    ) {
      return;
    }

    const target =
      event.target;

    if (
      !isElementNode(
        target
      )
    ) {
      return;
    }

    const isSearch =
      target.matches?.(
        "[data-clientes-search-input]"
      ) ||
      target.matches?.(
        "[data-clientes-search-input='true']"
      ) ||
      target.matches?.(
        "[data-clientes-field='search']"
      ) ||
      target.matches?.(
        "[data-search-input='clientes']"
      );

    if (!isSearch) {
      return;
    }

    if (
      isBrowser()
    ) {
      window.clearTimeout?.(
        searchTimer
      );

      searchTimer =
        window.setTimeout(
          () => {
            searchTimer = 0;

            setSearch(
              target.value
            );
          },
          SEARCH_DEBOUNCE_MS
        );
    } else {
      setSearch(
        target.value
      );
    }
  }

  function handleKeydown(
    event
  ) {
    if (
      !ownsRoot()
    ) {
      return;
    }

    const target =
      event.target;

    if (
      !isElementNode(
        target
      )
    ) {
      return;
    }

    if (
      event.key !==
        "Enter" &&
      event.key !==
        " "
    ) {
      return;
    }

    const row =
      target.closest(
        "[data-client-row='true'], [data-cliente-row='true']"
      );

    if (
      !row ||
      !root?.contains(
        row
      )
    ) {
      return;
    }

    /*
       No secuestrar Space/Enter de controles nativos dentro de la fila.
    */
    if (
      target !== row &&
      target.closest(
        "a, button, input, select, textarea"
      )
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const idTarget =
      row.getAttribute(
        "data-client-id"
      ) ||
      row.getAttribute(
        "data-cliente-id"
      ) ||
      "";

    void openCliente(
      idTarget
    );
  }

  /* ---------------------------------------------------------
     EXTERNAL EVENTS
  --------------------------------------------------------- */

  function externalCreateKey(
    data = {}
  ) {
    return [
      cleanText(
        first(
          data.clienteId,
          data.clientId,
          data.id,
          data.cliente?.clienteId,
          data.detail?.clienteId,
          ""
        ),
        ""
      ),

      cleanText(
        first(
          data.userId,
          data.cliente?.userId,
          data.detail?.userId,
          ""
        ),
        ""
      ),
    ]
      .filter(Boolean)
      .join("|") ||
      "external-create";
  }

  function scheduleExternalCreateRefresh() {
    if (!isBrowser()) {
      void refresh();
      return true;
    }

    window.clearTimeout?.(
      externalCreateRefreshTimer
    );

    externalCreateRefreshTimer =
      window.setTimeout(
        () => {
          externalCreateRefreshTimer =
            0;

          if (
            !assertAlive()
          ) {
            return;
          }

          void refresh();
        },
        EXTERNAL_CREATE_REFRESH_DELAY_MS
      );

    return true;
  }

  function handleExternalCreateSuccess(
    event = null
  ) {
    const data =
      eventPayload(event);

    if (
      data.source ===
        CLIENTES_INDEX_SOURCE &&
      data.controllerId ===
        id
    ) {
      return;
    }

    const now =
      Date.now();

    const key =
      externalCreateKey(
        data
      );

    if (
      key ===
        lastExternalCreateKey &&
      (
        now -
        lastExternalCreateAt
      ) <
        EXTERNAL_CREATE_DEDUPE_MS
    ) {
      return;
    }

    lastExternalCreateKey =
      key;

    lastExternalCreateAt =
      now;

    scheduleExternalCreateRefresh();
  }

  function handleDetailClosed(
    event = null
  ) {
    const data =
      eventPayload(event);

    if (
      !ownsDetailModal()
    ) {
      return;
    }

    const closedId =
      cleanText(
        first(
          data.clienteId,
          data.id,
          ""
        ),
        ""
      );

    /*
       Si no hay ID, también liberamos: el bridge acaba de cerrar.
    */
    if (
      !closedId ||
      !openingClienteId ||
      closedId !==
        openingClienteId
    ) {
      releaseDetailOwnership();
    }
  }

  function closeOwnedDetail({
    emit = true,
  } = {}) {
    if (
      !ownsDetailModal()
    ) {
      return false;
    }

    detailSeq += 1;

    try {
      closeClientesDetailModal();

      if (!emit) {
        /*
           El bridge actual siempre emite al cerrar.
           No existe opción silenciosa; sólo evitamos duplicar.
        */
      }
    } catch {
      // noop
    }

    releaseDetailOwnership();

    return true;
  }

  function handleRouteEvent(
    event = null
  ) {
    const data =
      eventPayload(event);

    if (
      isObject(data) &&
      (
        data.path ||
        data.routePath ||
        data.canonicalPath
      )
    ) {
      currentContext = {
        ...currentContext,
        ...data,
      };
    }

    if (
      !isClientesRoute(
        currentContext
      )
    ) {
      loadSeq += 1;
      userSearchSeq += 1;
      createSeq += 1;
      detailSeq += 1;

      queuedForceRefresh =
        false;

      if (
        createModal.open
      ) {
        closeCreate({
          reset: true,
          emit: false,
          renderView: false,
          force: true,
        });
      }

      closeOwnedDetail();

      return;
    }

    scheduleRender();
  }

  /* ---------------------------------------------------------
     ATTACH / DETACH
  --------------------------------------------------------- */

  function attach() {
    if (
      !root ||
      mounted ||
      !ownsRoot()
    ) {
      return false;
    }

    root.addEventListener(
      "click",
      handleClick
    );

    root.addEventListener(
      "input",
      handleInput
    );

    root.addEventListener(
      "keydown",
      handleKeydown
    );

    for (
      const eventName
      of CREATE_SUCCESS_EVENTS
    ) {
      disposers.push(
        subscribeEvent(
          eventName,
          handleExternalCreateSuccess
        )
      );
    }

    for (
      const eventName
      of DETAIL_CLOSE_EVENTS
    ) {
      disposers.push(
        subscribeEvent(
          eventName,
          handleDetailClosed
        )
      );
    }

    disposers.push(
      subscribeEvent(
        "route:changed",
        handleRouteEvent
      )
    );

    disposers.push(
      subscribeEvent(
        "router:navigated",
        handleRouteEvent
      )
    );

    mounted =
      true;

    return true;
  }

  function detach() {
    try {
      root?.removeEventListener(
        "click",
        handleClick
      );

      root?.removeEventListener(
        "input",
        handleInput
      );

      root?.removeEventListener(
        "keydown",
        handleKeydown
      );
    } catch {
      // noop
    }

    for (
      const dispose
      of disposers.splice(0)
    ) {
      try {
        dispose?.();
      } catch {
        // noop
      }
    }

    if (
      isBrowser()
    ) {
      window.clearTimeout?.(
        searchTimer
      );

      window.clearTimeout?.(
        userSearchTimer
      );

      window.clearTimeout?.(
        externalCreateRefreshTimer
      );
    }

    searchTimer = 0;
    userSearchTimer = 0;
    externalCreateRefreshTimer = 0;

    mounted =
      false;

    return true;
  }

  /* ---------------------------------------------------------
     MOUNT / DESTROY
  --------------------------------------------------------- */

  async function mount(
    nextHost = null,
    nextContext = {}
  ) {
    if (destroyed) {
      return getSnapshot();
    }

    currentContext = {
      ...currentContext,

      ...safeObject(
        nextContext
      ),
    };

    setHost(
      nextHost
    );

    if (!root) {
      throw new Error(
        "CLIENTES_HOST_NOT_FOUND"
      );
    }

    if (
      !isClientesRoute(
        currentContext
      )
    ) {
      return getSnapshot();
    }

    /*
       Claim antes de bind/render.
       Un controller antiguo deja de ser owner inmediatamente.
    */
    claimRoot();

    attach();

    if (
      !items.length
    ) {
      /*
         Sin cache: runLoad() controla por sí mismo
         el estado loading y el primer render.
         Evitamos un repaint duplicado al montar.
      */
      await load({
        force: false,
        silent: false,
      });
    } else {
      loading =
        false;

      renderNow();

      /*
         Cache inmediata + revalidación silenciosa.
      */
      void load({
        force: false,
        silent: true,
      });
    }

    return getSnapshot();
  }

  async function render(
    nextHost = null,
    nextContext = {}
  ) {
    return mount(
      nextHost,
      nextContext
    );
  }

  async function destroy({
    clear = true,
  } = {}) {
    if (destroyed) {
      return true;
    }

    destroyed =
      true;

    loadSeq += 1;
    userSearchSeq += 1;
    createSeq += 1;
    detailSeq += 1;

    queuedForceRefresh =
      false;

    cancelFrame(
      renderFrame
    );

    cancelFrame(
      modalFrame
    );

    renderFrame = 0;
    modalFrame = 0;

    detach();

    closeOwnedDetail();

    if (
      createModal.open
    ) {
      closeCreate({
        reset: true,
        emit: false,
        renderView: false,
        force: true,
      });
    } else {
      removeModalHost();
    }

    createModal.open =
      false;

    syncBodyModalClass();

    /*
       CRÍTICO:
       sólo limpiar el root si este controller todavía lo posee.
       Un destroy atrasado jamás borra el DOM de una instancia nueva.
    */
    if (
      clear &&
      root &&
      ownsRoot()
    ) {
      root.replaceChildren();
    }

    const instanceHost =
      root;

    releaseRoot();

    clearInstance(
      instanceHost,
      controller
    );

    createReturnFocus =
      null;

    return true;
  }

  const controller = {
    id,

    version:
      CLIENTES_INDEX_VERSION,

    owner:
      ownerId,

    get state() {
      return {
        id,

        host:
          root,

        context:
          currentContext,

        items,
        total,

        remoteCount:
          total,

        lastSyncAt,

        loading,
        refreshing,
        creating,
        loadingMore,
        error,

        search,
        filter,
        sortOrder,
        visibleLimit,
        openingClienteId,

        mounted,
        destroyed,

        ownsRoot:
          ownsRoot(),

        modalOpen:
          createModal.open,

        modalOwned:
          Boolean(
            modalHost &&
            modalHost.dataset
              ?.owner === ownerId
          ),

        detailOwned:
          ownsDetailModal(),

        apiVersion:
          CLIENTES_API_VERSION,

        indexVersion:
          CLIENTES_INDEX_VERSION,
      };
    },

    getSnapshot,

    getState:
      getSnapshot,

    mount,
    render,
    init:
      mount,

    bootstrap:
      mount,

    load,

    reload:
      refresh,

    refresh,

    setSearch,
    setFilter,
    setSortOrder,
    toggleSortOrder,
    clearSearch,
    clearFilters,
    loadMore,

    openCliente,

    openClient:
      openCliente,

    openCreate,

    createCliente:
      openCreate,

    createClient:
      openCreate,

    exportCsv,

    destroy,

    unmount:
      destroy,

    dispose:
      destroy,
  };

  return controller;
}

/* =========================================================
   PUBLIC CONTROLLER RESOLUTION
========================================================= */

function ensureController(
  host = null,
  context = {}
) {
  const resolvedHost =
    resolveHost(
      host,
      context
    );

  if (resolvedHost) {
    const existing =
      INSTANCES.get(
        resolvedHost
      );

    if (
      existing &&
      !existing.state
        .destroyed
    ) {
      return existing;
    }

    /*
       Si el router cambió el host, invalidamos la instancia anterior
       sin permitir que limpie el host nuevo.
    */
    if (
      lastInstance &&
      !lastInstance.state
        .destroyed &&
      lastInstance.state
        .host &&
      lastInstance.state
        .host !==
        resolvedHost
    ) {
      void lastInstance
        .destroy({
          clear: false,
        })
        .catch?.(
          () => {}
        );
    }
  }

  if (
    lastInstance &&
    !lastInstance.state
      .destroyed &&
    !host
  ) {
    return lastInstance;
  }

  const controller =
    createClientesController(
      resolvedHost,
      context
    );

  if (resolvedHost) {
    storeInstance(
      resolvedHost,
      controller
    );
  } else {
    lastInstance =
      controller;
  }

  return controller;
}

function parseInitArgs(
  hostOrContext = null,
  maybeContext = {}
) {
  const host =
    isDomNode(
      hostOrContext
    )
      ? hostOrContext
      : null;

  const context =
    isDomNode(
      hostOrContext
    )
      ? safeObject(
          maybeContext
        )
      : safeObject(
          hostOrContext
        );

  return {
    host,
    context,
  };
}

/* =========================================================
   PUBLIC API
========================================================= */

export async function init(
  hostOrContext = null,
  maybeContext = {}
) {
  const {
    host,
    context,
  } =
    parseInitArgs(
      hostOrContext,
      maybeContext
    );

  const controller =
    ensureController(
      host,
      context
    );

  return controller.mount(
    host,
    context
  );
}

export async function mount(
  hostOrContext = null,
  maybeContext = {}
) {
  return init(
    hostOrContext,
    maybeContext
  );
}

export async function bootstrap(
  hostOrContext = null,
  maybeContext = {}
) {
  return init(
    hostOrContext,
    maybeContext
  );
}

export async function render(
  hostOrContext = null,
  maybeContext = {}
) {
  return init(
    hostOrContext,
    maybeContext
  );
}

export async function reload() {
  return ensureController()
    .refresh();
}

export async function refresh() {
  return ensureController()
    .refresh();
}

export async function destroy(
  options = {}
) {
  if (!lastInstance) {
    return true;
  }

  return lastInstance
    .destroy(
      options
    );
}

export async function unmount(
  options = {}
) {
  return destroy(
    options
  );
}

export async function dispose(
  options = {}
) {
  return destroy(
    options
  );
}

export function getClientes() {
  return cloneItems(
    ensureController()
      .state.items
  );
}

export function getItems() {
  return getClientes();
}

export function getClientesCount() {
  return ensureController()
    .state.items.length;
}

export function hasClientes() {
  return (
    getClientesCount() >
    0
  );
}

export function getState() {
  return ensureController()
    .getSnapshot();
}

export function getSnapshot() {
  return getState();
}

export function getClienteById(
  id = ""
) {
  return findClienteByIdApi(
    ensureController()
      .state.items,
    id
  );
}

export function setClientesSearch(
  value = ""
) {
  return ensureController()
    .setSearch(
      value
    );
}

export function setClientesFilter(
  value = "all"
) {
  return ensureController()
    .setFilter(
      value
    );
}

export function setClientesSortOrder(
  value =
    DEFAULT_SORT_ORDER
) {
  return ensureController()
    .setSortOrder(
      value
    );
}

export function toggleClientesSortOrder() {
  return ensureController()
    .toggleSortOrder();
}

export function loadMoreClientes(
  limit = null
) {
  return ensureController()
    .loadMore(
      limit
    );
}

export async function openCliente(
  id = ""
) {
  return ensureController()
    .openCliente(
      id
    );
}

export async function openCreate() {
  return ensureController()
    .openCreate();
}

export async function createCliente() {
  return openCreate();
}

export function exportCsv() {
  return ensureController()
    .exportCsv();
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const ClientesView = {
  version:
    CLIENTES_INDEX_VERSION,

  apiVersion:
    CLIENTES_API_VERSION,

  init,
  mount,
  bootstrap,
  render,
  reload,
  refresh,
  destroy,
  unmount,
  dispose,

  getState,
  getSnapshot,

  getClientes,
  getItems,
  getClientesCount,
  hasClientes,
  getClienteById,

  setSearch:
    setClientesSearch,

  setFilter:
    setClientesFilter,

  setSortOrder:
    setClientesSortOrder,

  toggleSortOrder:
    toggleClientesSortOrder,

  loadMore:
    loadMoreClientes,

  openCliente,

  openClient:
    openCliente,

  openCreate,
  createCliente,

  exportCsv,
};

try {
  const global =
    getGlobalObject();

  global.ClientesView =
    ClientesView;

  global.OnionClientesView =
    ClientesView;

  global.OnionClientes =
    ClientesView;

  if (
    AppCore?.modules &&
    typeof AppCore.modules ===
      "object"
  ) {
    AppCore.modules.Clientes =
      ClientesView;

    AppCore.modules.clientes =
      ClientesView;
  }
} catch {
  // noop
}

export default ClientesView;
