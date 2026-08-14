/* =========================================================
   Onion Support - Servidor Index
   Archivo: /src/views/server/index.js

   PRODUCTIVO · API BOUNDARY · UI CONTROLLER · V2

   Arquitectura:
   - server.api.js      = HTTP + cache + modelo canónico
   - server.template.js = HTML puro
   - index.js           = ciclo SPA + estado UI + acciones

   Reglas:
   - Sin Http/fetch/localStorage.
   - Sin endpoint discovery.
   - Sin normalización de health duplicada.
   - Sin HTML duplicado del template.
   - /health/internal solo se consulta para admin.
   - Un refresh fallido no destruye el último snapshot válido.
   - Live mode orquesta refreshes; no implementa otra API.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  SERVER_API_VERSION,
  SERVER_REQUEST_TIMEOUT_MS as API_REQUEST_TIMEOUT_MS,
  SERVER_AUTO_REFRESH_DEFAULT_MS,
  SERVER_ENDPOINTS,

  loadServerSnapshot as loadServerSnapshotApi,
  loadServerHealth as loadServerHealthApi,
  refreshServerSnapshot as refreshServerSnapshotApi,
  refreshServerHealth as refreshServerHealthApi,

  fetchServerReadinessRequest,
  fetchServerLivenessRequest,

  hydrateServerFromCache,
  clearServerCache,

  getServerSnapshotStore,
  getServerStateSnapshot as getServerApiStateSnapshot,
  getServerServices,
  getServerServiceByIdStore,
  createEmptyServerSnapshot,
} from "./server.api.js";

import renderServerTemplate, {
  SERVER_TEMPLATE_VERSION,
  SERVER_ACTIONS,
  renderLoadingState,
  renderErrorState,
  renderAccessDeniedState,
} from "./server.template.js";

/* =========================================================
   META / CONFIG
========================================================= */

export const SERVIDOR_MODULE_NAME = "servidor";
export const SERVER_MODULE_NAME = "server";

export const SERVIDOR_VIEW_NAME = "ServidorView";
export const SERVER_VIEW_NAME = "ServerView";

export const SERVIDOR_CANONICAL_PATH = "/servidor";

export const SERVIDOR_INDEX_VERSION =
  "servidor.index.api-boundary.v2.health-internal";

export const SERVER_INDEX_VERSION =
  SERVIDOR_INDEX_VERSION;

export const SERVIDOR_INDEX_SOURCE =
  "views.server.index";

export const SERVER_REFRESH_INTERVAL_MS =
  SERVER_AUTO_REFRESH_DEFAULT_MS;

export const SERVER_REQUEST_TIMEOUT_MS =
  API_REQUEST_TIMEOUT_MS;

export {
  SERVER_API_VERSION,
  SERVER_TEMPLATE_VERSION,
  SERVER_ENDPOINTS,
  SERVER_ACTIONS,
};

const SERVER_CONTROLLER_KEY =
  Symbol.for(
    "onion.support.server.active-controller"
  );

const SERVER_HOST_CONTROLLER_KEY =
  Symbol.for(
    "onion.support.server.host-controller"
  );

const ACTIONS = SERVER_ACTIONS;

let activeController = null;
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

function isNode(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.nodeType === 1
  );
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
  return cleanText(
    value,
    ""
  )
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[\s-]+/g,
      "_"
    )
    .replace(
      /[^\w:.]/g,
      ""
    )
    .replace(
      /^_+|_+$/g,
      ""
    );
}

function safeError(
  error = null,
  fallback =
    "No se pudo consultar el estado del servidor."
) {
  return cleanText(
    first(
      error?.data?.message,
      error?.payload?.message,
      error?.response?.data
        ?.message,
      error?.response?.message,
      error?.message,
      error?.error,
      error?.code,
      fallback
    ),
    fallback
  );
}

function cloneValue(
  value,
  depth = 0
) {
  if (depth > 8) {
    return null;
  }

  if (
    value === null ||
    value === undefined ||
    typeof value !== "object"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(
      (item) =>
        cloneValue(
          item,
          depth + 1
        )
    );
  }

  const output = {};

  for (
    const [key, item] of
    Object.entries(value)
  ) {
    output[key] =
      cloneValue(
        item,
        depth + 1
      );
  }

  return output;
}

function getGlobalObject() {
  try {
    return globalThis;
  } catch {
    return {};
  }
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

function normalizeRole(
  value = ""
) {
  if (Array.isArray(value)) {
    const roles =
      value
        .map(normalizeRole)
        .filter(Boolean);

    if (
      roles.includes("admin")
    ) {
      return "admin";
    }

    return (
      roles[0] ||
      "user"
    );
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

  return normalizeRole(
    first(
      context.role,
      context.rol,
      context.user?.role,
      context.user?.rol,
      AppCore.getCurrentRole?.(),
      state.role,
      state.rol,
      state.roles,
      user.role,
      user.rol,
      user.roles,
      "user"
    )
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
    cleanText(
      path,
      "/"
    )
      .replace(
        /\\/g,
        "/"
      )
      .replace(
        /\/{2,}/g,
        "/"
      );

  if (
    !value.startsWith("/")
  ) {
    value = `/${value}`;
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
      value.replace(
        /\/+$/g,
        ""
      ) ||
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

function isServidorRoute(
  context = {}
) {
  const explicit =
    routePathFromContext(
      context
    );

  if (explicit) {
    return (
      normalizePathname(
        explicit
      ) ===
      SERVIDOR_CANONICAL_PATH
    );
  }

  const browserPath =
    getBrowserPath();

  if (browserPath) {
    return (
      browserPath ===
      SERVIDOR_CANONICAL_PATH
    );
  }

  return true;
}

function resolveHost(
  host = null,
  context = {}
) {
  if (isNode(host)) {
    return host;
  }

  if (
    isNode(
      context.host
    )
  ) {
    return context.host;
  }

  if (
    isNode(
      context.root
    )
  ) {
    return context.root;
  }

  if (
    isNode(
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
      "[data-view-host='servidor']"
    ) ||
    document.querySelector(
      "[data-view-host='server']"
    ) ||
    document.querySelector(
      "[data-server-host='true']"
    ) ||
    document.querySelector(
      "[data-servidor-host='true']"
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

/* =========================================================
   EVENTS / TOAST
========================================================= */

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
    // window fallback
  }

  if (!isBrowser()) {
    return false;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(
        name,
        {
          detail: payload,
        }
      )
    );

    return true;
  } catch {
    return false;
  }
}

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

  for (const toast of [
    AppCore?.toast,
    AppCore?.ui?.toast,
    AppCore?.Toast,
  ]) {
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
      // continue
    }
  }

  return false;
}

/* =========================================================
   CLIPBOARD
========================================================= */

async function copyText(
  value = ""
) {
  const text =
    String(
      value ?? ""
    );

  if (
    !text ||
    !isBrowser()
  ) {
    return false;
  }

  try {
    if (
      navigator?.clipboard
        ?.writeText
    ) {
      await navigator
        .clipboard
        .writeText(text);

      return true;
    }
  } catch {
    // textarea fallback
  }

  try {
    const textarea =
      document.createElement(
        "textarea"
      );

    textarea.value =
      text;

    textarea.readOnly =
      true;

    textarea.setAttribute(
      "aria-hidden",
      "true"
    );

    textarea.style.position =
      "fixed";

    textarea.style.opacity =
      "0";

    document.body.appendChild(
      textarea
    );

    textarea.focus();
    textarea.select();

    const copied =
      document.execCommand(
        "copy"
      );

    textarea.remove();

    return Boolean(
      copied
    );
  } catch {
    return false;
  }
}

/* =========================================================
   CONTROLLER
========================================================= */

function createController(
  host = null,
  context = {}
) {
  const ownerId =
    `${SERVIDOR_INDEX_VERSION}:${++controllerSequence}`;

  const state = {
    ownerId,

    host:
      resolveHost(
        host,
        context
      ),

    context:
      safeObject(
        context
      ),

    snapshot:
      createEmptyServerSnapshot(),

    loading: false,
    refreshing: false,
    loaded: false,

    error: "",

    live: false,
    liveTimer: 0,

    mounted: false,
    destroyed: false,

    loadSequence: 0,
    loadTask: null,

    clickHandler: null,
  };

  function isAlive() {
    return (
      !state.destroyed &&
      state.mounted &&
      Boolean(
        state.host
      )
    );
  }

  function canLoad() {
    return (
      !state.destroyed &&
      isServidorRoute(
        state.context
      ) &&
      isAdminContext(
        state.context
      )
    );
  }

  function getSnapshot() {
    const apiState =
      getServerApiStateSnapshot();

    return {
      version:
        SERVIDOR_INDEX_VERSION,

      apiVersion:
        SERVER_API_VERSION,

      templateVersion:
        SERVER_TEMPLATE_VERSION,

      ownerId,

      snapshot:
        cloneValue(
          state.snapshot
        ),

      loading:
        state.loading,

      refreshing:
        state.refreshing,

      loaded:
        state.loaded,

      error:
        state.error,

      live:
        state.live,

      mounted:
        state.mounted,

      destroyed:
        state.destroyed,

      routeActive:
        isServidorRoute(
          state.context
        ),

      admin:
        isAdminContext(
          state.context
        ),

      role:
        getCurrentRole(
          state.context
        ),

      lastSyncAt:
        number(
          apiState.lastSyncAt,
          0
        ),

      architecture: {
        singleApiAuthority:
          true,

        indexHttp:
          false,

        indexCache:
          false,

        indexNormalization:
          false,

        indexTemplate:
          false,

        endpointDiscovery:
          false,

        dashboardEndpoint:
          SERVER_ENDPOINTS.internal,

        adminGuardBeforeNetwork:
          true,

        preserveLastGoodSnapshotOnError:
          true,
      },
    };
  }

  function templatePayload() {
    return {
      snapshot:
        state.snapshot,

      loading:
        state.loading,

      refreshing:
        state.refreshing,

      loaded:
        state.loaded,

      error:
        state.error,

      live:
        state.live,

      forbidden:
        !isAdminContext(
          state.context
        ),

      admin:
        isAdminContext(
          state.context
        ),

      role:
        getCurrentRole(
          state.context
        ),

      source:
        SERVIDOR_INDEX_SOURCE,

      version:
        SERVIDOR_INDEX_VERSION,

      apiVersion:
        SERVER_API_VERSION,

      templateVersion:
        SERVER_TEMPLATE_VERSION,
    };
  }

  function paint({
    mode = "auto",
  } = {}) {
    if (
      !state.host ||
      state.destroyed ||
      !isServidorRoute(
        state.context
      )
    ) {
      return false;
    }

    let html;

    const payload =
      templatePayload();

    if (
      !payload.admin
    ) {
      html =
        renderAccessDeniedState(
          payload
        );
    } else if (
      mode === "loading" &&
      !state.loaded
    ) {
      html =
        renderLoadingState(
          payload
        );
    } else if (
      mode === "error" &&
      !state.loaded
    ) {
      html =
        renderErrorState(
          payload
        );
    } else {
      html =
        renderServerTemplate(
          payload
        );
    }

    state.host.innerHTML =
      String(
        html ||
        ""
      );

    try {
      state.host.dataset.view =
        "servidor";

      state.host.dataset.serverController =
        SERVIDOR_INDEX_VERSION;

      state.host.dataset.serverApi =
        SERVER_API_VERSION;

      state.host.dataset.serverOwner =
        ownerId;
    } catch {
      // noop
    }

    return true;
  }

  function syncFromApi(
    fallback = null
  ) {
    const apiSnapshot =
      getServerSnapshotStore();

    const hasRealApiSnapshot =
      Boolean(
        apiSnapshot?.checkedAt
      );

    if (
      hasRealApiSnapshot
    ) {
      state.snapshot =
        apiSnapshot;

      state.loaded =
        true;

      return state.snapshot;
    }

    if (fallback) {
      state.snapshot =
        fallback;

      state.loaded =
        Boolean(
          fallback?.checkedAt
        );
    }

    return state.snapshot;
  }

  async function load({
    silent = false,
    force = false,
  } = {}) {
    if (
      state.destroyed ||
      !isServidorRoute(
        state.context
      )
    ) {
      return getSnapshot();
    }

    if (
      !isAdminContext(
        state.context
      )
    ) {
      state.loading =
        false;

      state.refreshing =
        false;

      state.error = "";

      paint();

      return getSnapshot();
    }

    /*
      Evita solapar manual/live refreshes.
      El controller no crea carreras sobre la API.
    */
    if (
      state.loadTask
    ) {
      return state.loadTask;
    }

    const sequence =
      ++state.loadSequence;

    const hadSnapshot =
      Boolean(
        state.snapshot
          ?.checkedAt
      );

    state.error = "";

    state.loading =
      !silent &&
      !hadSnapshot;

    state.refreshing =
      silent ||
      hadSnapshot;

    paint({
      mode:
        state.loading
          ? "loading"
          : "auto",
    });

    let task = null;

    task = (async () => {
      try {
        const snapshot =
          force
            ? await refreshServerSnapshotApi({
                source:
                  `${SERVIDOR_INDEX_SOURCE}.refresh`,
              })
            : await loadServerSnapshotApi({
                source:
                  `${SERVIDOR_INDEX_SOURCE}.load`,
              });

        if (
          state.destroyed ||
          sequence !==
            state.loadSequence ||
          !isServidorRoute(
            state.context
          )
        ) {
          return getSnapshot();
        }

        state.snapshot =
          snapshot;

        state.loaded =
          Boolean(
            snapshot?.checkedAt
          );

        state.error = "";

        const payload =
          getSnapshot();

        emitEvent(
          "server:status:loaded",
          payload
        );

        emitEvent(
          "servidor:status:loaded",
          payload
        );

        return payload;
      } catch (error) {
        if (
          state.destroyed ||
          sequence !==
            state.loadSequence
        ) {
          return getSnapshot();
        }

        state.error =
          safeError(error);

        /*
          Conserva el último snapshot válido de la API.
          Si no existe, se mantiene empty/unknown.
        */
        syncFromApi(
          state.snapshot
        );

        const payload = {
          ...getSnapshot(),

          message:
            state.error,

          errorCode:
            cleanText(
              error?.code,
              ""
            ),
        };

        emitEvent(
          "server:status:error",
          payload
        );

        emitEvent(
          "servidor:status:error",
          payload
        );

        return payload;
      } finally {
        if (
          sequence ===
            state.loadSequence &&
          !state.destroyed
        ) {
          state.loading =
            false;

          state.refreshing =
            false;

          paint({
            mode:
              state.error &&
              !state.loaded
                ? "error"
                : "auto",
          });
        }

        if (
          state.loadTask ===
          task
        ) {
          state.loadTask =
            null;
        }
      }
    })();

    state.loadTask =
      task;

    return task;
  }

  async function refresh() {
    return load({
      force: true,
      silent: true,
    });
  }

  function clearLiveTimer() {
    if (
      !state.liveTimer
    ) {
      return true;
    }

    try {
      globalThis.clearInterval?.(
        state.liveTimer
      );
    } catch {
      // noop
    }

    state.liveTimer = 0;

    return true;
  }

  function startLive(
    options = {}
  ) {
    if (
      state.destroyed ||
      !isAdminContext(
        state.context
      )
    ) {
      return false;
    }

    const intervalMs =
      clamp(
        number(
          options.intervalMs,
          SERVER_REFRESH_INTERVAL_MS
        ),
        5_000,
        600_000
      );

    clearLiveTimer();

    state.live = true;

    state.liveTimer =
      globalThis.setInterval?.(
        () => {
          if (
            state.destroyed ||
            !state.live ||
            !isServidorRoute(
              state.context
            )
          ) {
            return;
          }

          void refresh();
        },
        intervalMs
      ) || 0;

    paint();

    showToast(
      "Tiempo real activado.",
      "success"
    );

    emitEvent(
      "server:live:changed",
      {
        enabled: true,
        intervalMs,
      }
    );

    return true;
  }

  function stopLive({
    silent = false,
  } = {}) {
    const wasLive =
      state.live;

    state.live = false;

    clearLiveTimer();

    if (
      wasLive &&
      !silent
    ) {
      showToast(
        "Tiempo real pausado.",
        "info"
      );
    }

    if (
      !state.destroyed
    ) {
      paint();
    }

    if (wasLive) {
      emitEvent(
        "server:live:changed",
        {
          enabled: false,
          intervalMs: 0,
        }
      );
    }

    return true;
  }

  function toggleLive(
    options = {}
  ) {
    return state.live
      ? stopLive()
      : startLive(
          options
        );
  }

  async function copyJson() {
    if (
      !state.snapshot
        ?.checkedAt
    ) {
      return false;
    }

    const json =
      JSON.stringify(
        state.snapshot,
        null,
        2
      );

    const copied =
      await copyText(
        json
      );

    showToast(
      copied
        ? "Snapshot copiado."
        : "No se pudo copiar automáticamente.",

      copied
        ? "success"
        : "warning"
    );

    return copied;
  }

  async function copyDetail(
    serviceId = ""
  ) {
    const id =
      cleanText(
        serviceId,
        ""
      );

    if (!id) {
      return false;
    }

    const service =
      getServerServiceByIdStore(
        id
      );

    if (!service) {
      return false;
    }

    const copied =
      await copyText(
        JSON.stringify(
          service,
          null,
          2
        )
      );

    showToast(
      copied
        ? "Detalle copiado."
        : "No se pudo copiar el detalle.",

      copied
        ? "success"
        : "warning"
    );

    return copied;
  }

  function openDetail(
    serviceId = ""
  ) {
    const id =
      cleanText(
        serviceId,
        ""
      );

    if (!id) {
      return false;
    }

    const service =
      getServerServiceByIdStore(
        id
      );

    if (!service) {
      return false;
    }

    return emitEvent(
      "server:detail:open",
      {
        service:
          cloneValue(
            service
          ),

        serviceId: id,

        source:
          SERVIDOR_INDEX_SOURCE,
      }
    );
  }

  async function handleClick(
    event
  ) {
    const target =
      event?.target;

    if (
      typeof Element ===
        "undefined" ||
      !(
        target instanceof
        Element
      )
    ) {
      return;
    }

    const element =
      target.closest(
        "[data-server-action], [data-servidor-action], [data-action]"
      );

    if (
      !element ||
      !state.host?.contains?.(
        element
      )
    ) {
      return;
    }

    const action =
      cleanText(
        first(
          element.getAttribute(
            "data-server-action"
          ),

          element.getAttribute(
            "data-servidor-action"
          ),

          element.getAttribute(
            "data-action"
          ),

          ""
        ),
        ""
      );

    if (!action) {
      return;
    }

    const normalizedAction =
      normalizeKey(action);

    const serviceId =
      cleanText(
        first(
          element.getAttribute(
            "data-server-detail-id"
          ),

          element.getAttribute(
            "data-server-service-id"
          ),

          element.getAttribute(
            "data-service-id"
          ),

          element
            .closest?.(
              "[data-server-service]"
            )
            ?.getAttribute?.(
              "data-server-service"
            ),

          ""
        ),
        ""
      );

    if (
      [
        ACTIONS.REFRESH,
        ACTIONS.REFRESH_SERVER,
        ACTIONS.REFRESH_HEALTH,
        ACTIONS.LOAD_HEALTH,

        ACTIONS.TOGGLE_LIVE,

        ACTIONS.COPY_JSON,
        ACTIONS.COPY_DETAIL,
        ACTIONS.OPEN_DETAIL,
      ]
        .map(normalizeKey)
        .includes(
          normalizedAction
        )
    ) {
      event.preventDefault?.();
    }

    if (
      [
        ACTIONS.REFRESH,
        ACTIONS.REFRESH_SERVER,
        ACTIONS.REFRESH_HEALTH,
        ACTIONS.LOAD_HEALTH,
      ]
        .map(normalizeKey)
        .includes(
          normalizedAction
        )
    ) {
      await refresh();
      return;
    }

    if (
      normalizedAction ===
      normalizeKey(
        ACTIONS.TOGGLE_LIVE
      )
    ) {
      toggleLive();
      return;
    }

    if (
      normalizedAction ===
      normalizeKey(
        ACTIONS.COPY_JSON
      )
    ) {
      await copyJson();
      return;
    }

    if (
      normalizedAction ===
      normalizeKey(
        ACTIONS.COPY_DETAIL
      )
    ) {
      await copyDetail(
        serviceId
      );
      return;
    }

    if (
      normalizedAction ===
      normalizeKey(
        ACTIONS.OPEN_DETAIL
      )
    ) {
      openDetail(
        serviceId
      );
    }
  }

  function detachHost() {
    const current =
      state.host;

    if (!current) {
      state.mounted =
        false;

      return false;
    }

    try {
      if (
        state.clickHandler
      ) {
        current.removeEventListener(
          "click",
          state.clickHandler
        );
      }
    } catch {
      // noop
    }

    if (
      current[
        SERVER_HOST_CONTROLLER_KEY
      ] === controller
    ) {
      try {
        delete current[
          SERVER_HOST_CONTROLLER_KEY
        ];
      } catch {
        current[
          SERVER_HOST_CONTROLLER_KEY
        ] = null;
      }
    }

    state.clickHandler =
      null;

    state.mounted =
      false;

    return true;
  }

  function attachHost() {
    if (
      !state.host ||
      state.destroyed
    ) {
      return false;
    }

    const previous =
      state.host[
        SERVER_HOST_CONTROLLER_KEY
      ];

    if (
      previous &&
      previous !== controller &&
      isFunction(
        previous.destroy
      )
    ) {
      try {
        void previous.destroy({
          clear: false,
        });
      } catch {
        // noop
      }
    }

    if (
      !state.clickHandler
    ) {
      state.clickHandler =
        handleClick;

      state.host.addEventListener(
        "click",
        state.clickHandler
      );
    }

    state.host[
      SERVER_HOST_CONTROLLER_KEY
    ] = controller;

    state.mounted = true;

    return true;
  }

  function setHost(
    nextHost = null
  ) {
    const resolved =
      resolveHost(
        nextHost,
        state.context
      );

    if (!resolved) {
      return state.host;
    }

    if (
      resolved ===
      state.host
    ) {
      return state.host;
    }

    detachHost();

    state.host =
      resolved;

    if (
      !state.destroyed
    ) {
      attachHost();
    }

    return state.host;
  }

  function updateContext(
    nextContext = {}
  ) {
    state.context = {
      ...state.context,
      ...safeObject(
        nextContext
      ),
    };

    return state.context;
  }

  async function mount(
    nextHost = null,
    nextContext = {}
  ) {
    if (
      state.destroyed
    ) {
      return getSnapshot();
    }

    updateContext(
      nextContext
    );

    setHost(
      nextHost
    );

    if (
      !state.host
    ) {
      throw new Error(
        "SERVER_HOST_NOT_FOUND"
      );
    }

    if (
      !isServidorRoute(
        state.context
      )
    ) {
      return getSnapshot();
    }

    attachHost();

    if (
      !isAdminContext(
        state.context
      )
    ) {
      state.loading =
        false;

      state.refreshing =
        false;

      state.loaded =
        false;

      state.error = "";

      state.snapshot =
        createEmptyServerSnapshot();

      paint();

      return getSnapshot();
    }

    const cached =
      hydrateServerFromCache({
        freshOnly: true,
      });

    if (
      cached?.checkedAt
    ) {
      state.snapshot =
        cached;

      state.loaded =
        true;

      state.loading =
        false;

      paint();
    } else {
      state.snapshot =
        createEmptyServerSnapshot();

      state.loaded =
        false;

      state.loading =
        true;

      paint({
        mode: "loading",
      });
    }

    await load({
      force: false,
      silent:
        Boolean(
          cached
        ),
    });

    return getSnapshot();
  }

  async function destroy({
    clear = true,
  } = {}) {
    if (
      state.destroyed
    ) {
      return true;
    }

    state.destroyed =
      true;

    state.loadSequence += 1;

    stopLive({
      silent: true,
    });

    detachHost();

    if (
      clear &&
      state.host
    ) {
      state.host.innerHTML =
        "";
    }

    if (
      activeController ===
      controller
    ) {
      activeController =
        null;
    }

    const global =
      getGlobalObject();

    try {
      if (
        global[
          SERVER_CONTROLLER_KEY
        ] === controller
      ) {
        delete global[
          SERVER_CONTROLLER_KEY
        ];
      }
    } catch {
      // noop
    }

    return true;
  }

  const controller = {
    version:
      SERVIDOR_INDEX_VERSION,

    ownerId,

    state,

    getSnapshot,
    getState:
      getSnapshot,

    mount,
    init: mount,
    bootstrap: mount,

    render() {
      return paint();
    },

    load,

    reload:
      refresh,

    refresh,

    startLive,
    stopLive,
    toggleLive,

    copyJson,
    copyDetail,
    openDetail,

    setHost,
    updateContext,

    destroy,

    unmount:
      destroy,

    dispose:
      destroy,
  };

  return controller;
}

/* =========================================================
   ACTIVE CONTROLLER
========================================================= */

function ensureController(
  host = null,
  context = {}
) {
  if (
    activeController &&
    !activeController
      .state
      .destroyed
  ) {
    activeController.updateContext(
      context
    );

    if (host) {
      activeController.setHost(
        host
      );
    }

    return activeController;
  }

  activeController =
    createController(
      host,
      context
    );

  const global =
    getGlobalObject();

  try {
    global[
      SERVER_CONTROLLER_KEY
    ] = activeController;
  } catch {
    // noop
  }

  return activeController;
}

export function getActiveServerController() {
  return activeController;
}

/* =========================================================
   PUBLIC VIEW API
========================================================= */

function splitViewArgs(
  hostOrContext = null,
  maybeContext = {}
) {
  if (
    isNode(
      hostOrContext
    )
  ) {
    return {
      host:
        hostOrContext,

      context:
        safeObject(
          maybeContext
        ),
    };
  }

  return {
    host: null,

    context:
      safeObject(
        hostOrContext
      ),
  };
}

export async function init(
  hostOrContext = null,
  maybeContext = {}
) {
  const {
    host,
    context,
  } = splitViewArgs(
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

export const mount = init;
export const bootstrap = init;

export async function render(
  hostOrContext = null,
  maybeContext = {}
) {
  const {
    host,
    context,
  } = splitViewArgs(
    hostOrContext,
    maybeContext
  );

  const controller =
    ensureController(
      host,
      context
    );

  controller.updateContext(
    context
  );

  if (host) {
    controller.setHost(
      host
    );
  }

  if (
    !controller.state
      .mounted
  ) {
    return controller.mount(
      host,
      context
    );
  }

  controller.render();

  return controller.getSnapshot();
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
  if (!activeController) {
    return true;
  }

  return activeController
    .destroy(
      safeObject(
        options
      )
    );
}

export const unmount = destroy;
export const dispose = destroy;

export function getState() {
  const controller =
    activeController;

  if (!controller) {
    return {
      version:
        SERVIDOR_INDEX_VERSION,

      apiVersion:
        SERVER_API_VERSION,

      templateVersion:
        SERVER_TEMPLATE_VERSION,

      snapshot:
        cloneValue(
          getServerSnapshotStore()
        ),

      loading: false,
      refreshing: false,
      loaded:
        Boolean(
          getServerSnapshotStore()
            ?.checkedAt
        ),

      error: "",

      live: false,

      mounted: false,
      destroyed: false,

      routeActive: true,

      admin:
        isAdminContext({}),

      role:
        getCurrentRole({}),

      architecture: {
        singleApiAuthority:
          true,

        indexHttp:
          false,

        indexCache:
          false,

        indexNormalization:
          false,

        indexTemplate:
          false,

        endpointDiscovery:
          false,

        dashboardEndpoint:
          SERVER_ENDPOINTS.internal,
      },
    };
  }

  return controller
    .getSnapshot();
}

export const getSnapshot =
  getState;

/* =========================================================
   API WRAPPERS
========================================================= */

export async function loadServerHealth(
  options = {}
) {
  const controller =
    activeController;

  if (controller) {
    return controller.load(
      options
    );
  }

  return loadServerHealthApi(
    options
  );
}

export async function loadServerSnapshotPublic(
  options = {}
) {
  const controller =
    activeController;

  if (controller) {
    return controller.load(
      options
    );
  }

  return loadServerSnapshotApi(
    options
  );
}

export async function refreshServerHealth(
  options = {}
) {
  const controller =
    activeController;

  if (controller) {
    return controller.load({
      ...safeObject(
        options
      ),

      force: true,
      silent: true,
    });
  }

  return refreshServerHealthApi(
    options
  );
}

export async function refreshServerSnapshot(
  options = {}
) {
  const controller =
    activeController;

  if (controller) {
    return controller.load({
      ...safeObject(
        options
      ),

      force: true,
      silent: true,
    });
  }

  return refreshServerSnapshotApi(
    options
  );
}

export function startServerLive(
  options = {}
) {
  return ensureController()
    .startLive(
      options
    );
}

export function stopServerLive(
  options = {}
) {
  return ensureController()
    .stopLive(
      options
    );
}

export function toggleServerLive(
  options = {}
) {
  return ensureController()
    .toggleLive(
      options
    );
}

export async function copyServerJson() {
  const controller =
    activeController;

  if (!controller) {
    return false;
  }

  return controller.copyJson();
}

export async function copyServerDetail(
  serviceId = ""
) {
  const controller =
    activeController;

  if (!controller) {
    return false;
  }

  return controller.copyDetail(
    serviceId
  );
}

/* =========================================================
   DEBUG / CONTRACT SNAPSHOT
========================================================= */

export function getServerRouteDebug(
  context = {}
) {
  return {
    browserPath:
      getBrowserPath(),

    contextPath:
      routePathFromContext(
        context
      ),

    canonicalPath:
      SERVIDOR_CANONICAL_PATH,

    allowed:
      isServidorRoute(
        context
      ),

    admin:
      isAdminContext(
        context
      ),

    role:
      getCurrentRole(
        context
      ),

    endpoint:
      SERVER_ENDPOINTS.internal,

    apiVersion:
      SERVER_API_VERSION,

    templateVersion:
      SERVER_TEMPLATE_VERSION,

    architecture: {
      singleApiAuthority:
        true,

      directHttp:
        false,

      endpointDiscovery:
        false,

      localNormalization:
        false,

      localTemplate:
        false,
    },
  };
}

/* =========================================================
   GLOBAL BRIDGE
========================================================= */

export const ServidorView = {
  version:
    SERVIDOR_INDEX_VERSION,

  apiVersion:
    SERVER_API_VERSION,

  templateVersion:
    SERVER_TEMPLATE_VERSION,

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

  loadServerHealth,

  loadServerSnapshot:
    loadServerSnapshotPublic,

  refreshServerHealth,
  refreshServerSnapshot,

  fetchReadiness:
    fetchServerReadinessRequest,

  fetchLiveness:
    fetchServerLivenessRequest,

  startLive:
    startServerLive,

  stopLive:
    stopServerLive,

  toggleLive:
    toggleServerLive,

  copyJson:
    copyServerJson,

  copyDetail:
    copyServerDetail,

  getServerServices,
  getServerServiceByIdStore,

  clearCache:
    clearServerCache,

  getRouteDebug:
    getServerRouteDebug,
};

export const ServerView =
  ServidorView;

function registerGlobalBridge() {
  const global =
    getGlobalObject();

  try {
    global.ServidorView =
      ServidorView;

    global.ServerView =
      ServidorView;

    global.OnionServidorView =
      ServidorView;

    global.OnionServerView =
      ServidorView;
  } catch {
    // noop
  }

  try {
    if (AppCore) {
      if (
        !isObject(
          AppCore.modules
        )
      ) {
        AppCore.modules = {};
      }

      AppCore.modules.Servidor =
        ServidorView;

      AppCore.modules.Server =
        ServidorView;

      AppCore.modules.servidor =
        ServidorView;

      AppCore.modules.server =
        ServidorView;
    }
  } catch {
    // noop
  }

  return ServidorView;
}

export const bridge =
  registerGlobalBridge();

export const ready = true;

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default ServidorView;
